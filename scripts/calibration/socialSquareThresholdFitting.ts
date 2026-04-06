import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CalibrationManifestEntry } from './socialSquareCalibration.shared'

type GroupName = 'core-clean' | 'core-ambiguous' | 'stress-clean' | 'stress-ambiguous'
type SetName = 'strict' | 'balanced' | 'lenient'
type MetricDirection = 'max' | 'min'
type MetricKey =
  | 'headlineOverlapRatio'
  | 'subtitleOverlapRatio'
  | 'logoOverlapRatio'
  | 'badgeOverlapRatio'
  | 'safeTextScore'
  | 'safeCoverage'
  | 'safeAreaCoverage'

type CaseMetricRow = {
  id: string
  filename: string
  bucket: 'core' | 'stress' | 'reject'
  width: number
  height: number
  flags: string[]
  headlineOverlapRatio: number | null
  subtitleOverlapRatio: number | null
  logoOverlapRatio: number | null
  badgeOverlapRatio: number | null
  safeTextScore: number | null
  safeCoverage: number | null
  safeAreaCoverage: number | null
}

type CandidateMetric = {
  metric: MetricKey
  label: string
  direction: MetricDirection
  threshold: number
  basis: string
  basisValue: number
  sufficient: boolean
}

type CandidateSet = {
  name: SetName
  metrics: CandidateMetric[]
}

type CaseEvaluation = {
  set: SetName
  group: GroupName
  id: string
  filename: string
  pass: boolean
  failures: string[]
  boundaryMetrics: string[]
}

type GroupEvaluation = {
  count: number
  passCount: number
  passRate: number
  rejectCount: number
  rejectedIds: string[]
  boundaryIds: string[]
}

type ThresholdReadiness = {
  metric: string
  sourceGroup: string
  validCount: number
  sufficient: boolean
  reason: string
}

const ROOT = process.cwd()
const DATASET_ROOT = path.join(ROOT, 'dataset', 'social-square')
const EXTRACTED_ROOT = path.join(DATASET_ROOT, 'extracted')
const REPORTS_ROOT = path.join(DATASET_ROOT, 'reports')

const METRIC_CONFIG: Array<{
  key: MetricKey
  label: string
  direction: MetricDirection
  readinessMetric: string
  step: number
}> = [
  {
    key: 'headlineOverlapRatio',
    label: 'headline maxOverlapRatio',
    direction: 'max',
    readinessMetric: 'headline',
    step: 0.0025,
  },
  {
    key: 'subtitleOverlapRatio',
    label: 'subtitle maxOverlapRatio',
    direction: 'max',
    readinessMetric: 'subtitle',
    step: 0.0025,
  },
  {
    key: 'badgeOverlapRatio',
    label: 'badge maxOverlapRatio',
    direction: 'max',
    readinessMetric: 'badge',
    step: 0.0025,
  },
  {
    key: 'safeTextScore',
    label: 'safeTextScoreMin',
    direction: 'min',
    readinessMetric: 'safeTextScore',
    step: 0.01,
  },
  {
    key: 'safeCoverage',
    label: 'safeCoverageMin',
    direction: 'min',
    readinessMetric: 'safeCoverage',
    step: 0.01,
  },
  {
    key: 'safeAreaCoverage',
    label: 'safeAreaCoverageMin',
    direction: 'min',
    readinessMetric: 'safeAreaCoverage',
    step: 0.01,
  },
]

function round(value: number, precision = 4) {
  const scale = 10 ** precision
  return Math.round(value * scale) / scale
}

function roundUpTo(value: number, step: number) {
  return round(Math.ceil(value / step) * step, 4)
}

function roundDownTo(value: number, step: number) {
  return round(Math.floor(value / step) * step, 4)
}

function quantile(values: number[], q: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function median(values: number[]) {
  return quantile(values, 0.5)
}

function medianAbsoluteDeviation(values: number[]) {
  const pivot = median(values)
  if (pivot === null) return null
  return median(values.map((value) => Math.abs(value - pivot)))
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      const next = line[index + 1]
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }
    current += char
  }
  values.push(current)
  return values
}

function parseMetricsCsv(csv: string) {
  const [headerLine, ...rows] = csv.trim().split(/\r?\n/)
  const headers = parseCsvLine(headerLine)
  return rows.map((row) => {
    const values = parseCsvLine(row)
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])) as Record<string, string>
    return {
      id: record.id,
      filename: record.filename,
      bucket: record.bucket as CaseMetricRow['bucket'],
      width: Number(record.width),
      height: Number(record.height),
      flags: record.flags ? record.flags.split('|').filter(Boolean) : [],
      headlineOverlapRatio: record.headlineOverlapRatio ? Number(record.headlineOverlapRatio) : null,
      subtitleOverlapRatio: record.subtitleOverlapRatio ? Number(record.subtitleOverlapRatio) : null,
      logoOverlapRatio: record.logoOverlapRatio ? Number(record.logoOverlapRatio) : null,
      badgeOverlapRatio: record.badgeOverlapRatio ? Number(record.badgeOverlapRatio) : null,
      safeTextScore: record.safeTextScore ? Number(record.safeTextScore) : null,
      safeCoverage: record.safeCoverage ? Number(record.safeCoverage) : null,
      safeAreaCoverage: record.safeAreaCoverage ? Number(record.safeAreaCoverage) : null,
    } satisfies CaseMetricRow
  })
}

function getGroup(bucket: string, classification?: string): GroupName | null {
  if (bucket !== 'core' && bucket !== 'stress') return null
  if (classification !== 'clean' && classification !== 'ambiguous') return null
  return `${bucket}-${classification}` as GroupName
}

function buildCandidateMetric(
  config: (typeof METRIC_CONFIG)[number],
  values: number[],
  set: SetName
): CandidateMetric {
  if (config.direction === 'max') {
    const basisMap: Record<SetName, { q: number; label: string }> = {
      strict: { q: 0.85, label: 'p85' },
      balanced: { q: 0.9, label: 'p90' },
      lenient: { q: 0.95, label: 'p95' },
    }
    const basis = basisMap[set]
    const q = quantile(values, basis.q) ?? Math.max(...values)
    return {
      metric: config.key,
      label: config.label,
      direction: config.direction,
      threshold: roundUpTo(q, config.step),
      basis: basis.label,
      basisValue: round(q),
      sufficient: true,
    }
  }

  const minValue = Math.min(...values)
  const p10 = quantile(values, 0.1) ?? minValue
  const p15 = quantile(values, 0.15) ?? minValue
  const pivot = median(values) ?? minValue
  const mad = medianAbsoluteDeviation(values) ?? 0
  const robustLowerBound = Math.max(minValue, pivot - 2 * mad)

  const basisMap: Record<SetName, { label: string; value: number }> = {
    strict: { label: 'max(p15, robustLowerBound)', value: Math.max(p15, robustLowerBound) },
    balanced: { label: 'max(p10, robustLowerBound)', value: Math.max(p10, robustLowerBound) },
    lenient: { label: 'min', value: minValue },
  }
  const basis = basisMap[set]
  return {
    metric: config.key,
    label: config.label,
    direction: config.direction,
    threshold: roundDownTo(basis.value, config.step),
    basis: `${basis.label} (min=${round(minValue)}, p10=${round(p10)}, p15=${round(p15)}, robust=${round(robustLowerBound)})`,
    basisValue: round(basis.value),
    sufficient: true,
  }
}

function buildCandidateSets(coreCleanRows: CaseMetricRow[], readiness: ThresholdReadiness[]) {
  const readinessMap = new Map(readiness.map((entry) => [entry.metric, entry]))
  const sets: CandidateSet[] = ['strict', 'balanced', 'lenient'].map((set) => ({ name: set, metrics: [] }))
  const warnings: string[] = []

  for (const config of METRIC_CONFIG) {
    const readinessEntry = readinessMap.get(config.readinessMetric)
    if (!readinessEntry?.sufficient) {
      warnings.push(`${config.label}: skipped because readiness is insufficient (${readinessEntry?.reason ?? 'no readiness record'})`)
      continue
    }
    const values = coreCleanRows
      .map((row) => row[config.key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (!values.length) {
      warnings.push(`${config.label}: skipped because no valid core-clean values were found`)
      continue
    }
    if (Math.max(...values) === Math.min(...values)) {
      warnings.push(`${config.label}: core-clean signal is saturated at ${round(values[0])}, so this metric has low discriminative power for fitting`)
    }
    for (const set of sets) {
      set.metrics.push(buildCandidateMetric(config, values, set.name))
    }
  }

  return { sets, warnings }
}

function getBoundaryEpsilon(metric: CandidateMetric) {
  return metric.direction === 'max'
    ? Math.max(0.0025, metric.threshold * 0.15)
    : 0.03
}

function evaluateCandidateSet(
  set: CandidateSet,
  rows: CaseMetricRow[],
  classifications: Map<string, string>
) {
  const caseEvaluations: CaseEvaluation[] = []
  const grouped: Record<GroupName, CaseEvaluation[]> = {
    'core-clean': [],
    'core-ambiguous': [],
    'stress-clean': [],
    'stress-ambiguous': [],
  }

  for (const row of rows) {
    const group = getGroup(row.bucket, classifications.get(row.id))
    if (!group) continue
    const failures: string[] = []
    const boundaryMetrics: string[] = []

    for (const metric of set.metrics) {
      const value = row[metric.metric]
      if (typeof value !== 'number') continue
      const pass = metric.direction === 'max' ? value <= metric.threshold : value >= metric.threshold
      const delta = Math.abs(value - metric.threshold)
      if (delta > 0 && delta <= getBoundaryEpsilon(metric)) {
        boundaryMetrics.push(`${metric.label} (${round(value)} vs ${metric.threshold})`)
      }
      if (!pass) {
        failures.push(
          metric.direction === 'max'
            ? `${metric.label} ${round(value)} > ${metric.threshold}`
            : `${metric.label} ${round(value)} < ${metric.threshold}`
        )
      }
    }

    const evaluation: CaseEvaluation = {
      set: set.name,
      group,
      id: row.id,
      filename: row.filename,
      pass: failures.length === 0,
      failures,
      boundaryMetrics,
    }
    caseEvaluations.push(evaluation)
    grouped[group].push(evaluation)
  }

  const groups = Object.fromEntries(
    (Object.keys(grouped) as GroupName[]).map((group) => {
      const values = grouped[group]
      const passCount = values.filter((entry) => entry.pass).length
      const rejected = values.filter((entry) => !entry.pass)
      const boundary = values.filter((entry) => entry.boundaryMetrics.length > 0)
      return [
        group,
        {
          count: values.length,
          passCount,
          passRate: values.length ? round(passCount / values.length) : 0,
          rejectCount: rejected.length,
          rejectedIds: rejected.map((entry) => entry.id),
          boundaryIds: boundary.map((entry) => entry.id),
        } satisfies GroupEvaluation,
      ]
    })
  ) as Record<GroupName, GroupEvaluation>

  const boundaryCases = caseEvaluations
    .filter((entry) => entry.boundaryMetrics.length > 0)
    .map((entry) => ({
      id: entry.id,
      group: entry.group,
      metrics: entry.boundaryMetrics,
      pass: entry.pass,
    }))

  return {
    name: set.name,
    metrics: set.metrics,
    groups,
    falseRejects: {
      coreClean: groups['core-clean'].rejectedIds,
      coreAmbiguous: groups['core-ambiguous'].rejectedIds,
    },
    stressRejectedCount: groups['stress-clean'].rejectCount + groups['stress-ambiguous'].rejectCount,
    boundaryCases,
    caseEvaluations,
  }
}

function compareWithProvisional(
  evaluations: ReturnType<typeof evaluateCandidateSet>[],
  provisionalCandidates: Array<{ metric: string; candidate: number }>
) {
  const provisionalMap = new Map(provisionalCandidates.map((entry) => [entry.metric, entry.candidate]))
  const balanced = evaluations.find((entry) => entry.name === 'balanced')
  if (!balanced) return ['- no previous provisional candidate set found']

  return balanced.metrics.map((metric) => {
    const previous = provisionalMap.get(metric.label)
    if (typeof previous !== 'number') {
      return `- ${metric.label}: no previous provisional candidate to compare`
    }
    const stricter =
      metric.direction === 'max'
        ? metric.threshold < previous
        : metric.threshold > previous
    const looser =
      metric.direction === 'max'
        ? metric.threshold > previous
        : metric.threshold < previous
    return `- ${metric.label}: previous provisional=${previous}, balanced=${metric.threshold} -> ${
      stricter ? 'new balanced candidate is stricter' : looser ? 'new balanced candidate is looser' : 'same strictness'
    }`
  })
}

function chooseRecommendation(evaluations: ReturnType<typeof evaluateCandidateSet>[]) {
  const balanced = evaluations.find((entry) => entry.name === 'balanced')
  const lenient = evaluations.find((entry) => entry.name === 'lenient')
  const strict = evaluations.find((entry) => entry.name === 'strict')

  if (balanced && balanced.groups['core-clean'].rejectCount === 0) {
    return {
      recommended: 'balanced' as SetName,
      reason: 'balanced keeps zero false rejects on core-clean while remaining stricter than lenient on comparison groups',
    }
  }
  if (lenient && lenient.groups['core-clean'].rejectCount === 0) {
    return {
      recommended: 'lenient' as SetName,
      reason: 'balanced is too strict for core-clean, so lenient is the safest provisional default',
    }
  }
  if (strict && strict.groups['core-clean'].rejectCount === 0) {
    return {
      recommended: 'strict' as SetName,
      reason: 'strict still keeps zero false rejects on core-clean, so it can be used as the provisional default',
    }
  }

  const fallback = [...evaluations].sort(
    (left, right) => left.groups['core-clean'].rejectCount - right.groups['core-clean'].rejectCount
  )[0]
  return {
    recommended: fallback.name,
    reason: 'no set fully preserves core-clean, so the recommendation falls back to the fewest core-clean rejects',
  }
}

function buildComparisonCsv(evaluations: ReturnType<typeof evaluateCandidateSet>[]) {
  const header = ['set', 'group', 'id', 'filename', 'pass', 'failures', 'boundaryMetrics']
  const rows = evaluations.flatMap((evaluation) =>
    evaluation.caseEvaluations.map((entry) =>
      [
        evaluation.name,
        entry.group,
        entry.id,
        entry.filename,
        entry.pass ? 'pass' : 'fail',
        entry.failures.join(' | '),
        entry.boundaryMetrics.join(' | '),
      ]
        .map((value) => {
          const text = String(value ?? '')
          if (text.includes(',') || text.includes('"') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`
          }
          return text
        })
        .join(',')
    )
  )
  return [header.join(','), ...rows].join('\n')
}

function buildReportMarkdown(input: {
  candidateSets: CandidateSet[]
  evaluations: ReturnType<typeof evaluateCandidateSet>[]
  comparisonNotes: string[]
  recommendation: { recommended: SetName; reason: string }
  warnings: string[]
}) {
  const renderCandidateTable = () => `| Set | Metric | Threshold | Basis | Basis value |
| --- | --- | ---: | --- | ---: |
${input.candidateSets
  .flatMap((set) =>
    set.metrics.map(
      (metric) =>
        `| ${set.name} | ${metric.label} | ${metric.threshold} | ${metric.basis} | ${metric.basisValue} |`
    )
  )
  .join('\n')}`

  const renderEvaluationTable = () => `| Set | Group | Pass rate | Pass count | Reject count | Rejected cases |
| --- | --- | ---: | ---: | ---: | --- |
${input.evaluations
  .flatMap((evaluation) =>
    (Object.keys(evaluation.groups) as GroupName[]).map((group) => {
      const stats = evaluation.groups[group]
      return `| ${evaluation.name} | ${group} | ${stats.passRate} | ${stats.passCount}/${stats.count} | ${stats.rejectCount} | ${
        stats.rejectedIds.join(', ') || '-'
      } |`
    })
  )
  .join('\n')}`

  const boundaryLines = input.evaluations
    .flatMap((evaluation) =>
      evaluation.boundaryCases.map(
        (entry) =>
          `- ${evaluation.name} / ${entry.group} / ${entry.id}: ${entry.metrics.join('; ')}${entry.pass ? ' [passes]' : ' [fails]'}`
      )
    )
    .join('\n')

  return `# Social Square Threshold Fitting Report

## Candidate sets
${renderCandidateTable()}

## Comparison across groups
${renderEvaluationTable()}

## Boundary cases
${boundaryLines || '- none'}

## Why previous provisional candidates looked strict or not
${input.comparisonNotes.join('\n')}

## Recommendation
- provisional default: ${input.recommendation.recommended}
- reason: ${input.recommendation.reason}

## Warnings
${input.warnings.length ? input.warnings.map((warning) => `- ${warning}`).join('\n') : '- none'}
`
}

async function main() {
  await mkdir(REPORTS_ROOT, { recursive: true })

  const summary = JSON.parse(await readFile(path.join(REPORTS_ROOT, 'summary.json'), 'utf8')) as {
    thresholdReadiness?: ThresholdReadiness[]
    provisionalCandidates?: Array<{ metric: string; candidate: number }>
  }
  const metricsCsv = await readFile(path.join(REPORTS_ROOT, 'metrics.csv'), 'utf8')
  const manifest = JSON.parse(await readFile(path.join(EXTRACTED_ROOT, 'manifest.json'), 'utf8')) as CalibrationManifestEntry[]

  const rows = parseMetricsCsv(metricsCsv)
  const classificationById = new Map(manifest.map((entry) => [entry.id, entry.classification ?? 'clean']))
  const coreCleanRows = rows.filter((row) => getGroup(row.bucket, classificationById.get(row.id)) === 'core-clean')
  const readiness = summary.thresholdReadiness ?? []

  const { sets, warnings } = buildCandidateSets(coreCleanRows, readiness)
  if (!readiness.find((entry) => entry.metric === 'logo' && !entry.sufficient)) {
    warnings.push('logo remains insufficient and is intentionally excluded from fitting')
  } else {
    warnings.push('logo remains insufficient and is intentionally excluded from fitting')
  }

  const evaluations = sets.map((set) => evaluateCandidateSet(set, rows, classificationById))
  const comparisonNotes = compareWithProvisional(evaluations, summary.provisionalCandidates ?? [])
  const recommendation = chooseRecommendation(evaluations)

  const thresholdFitting = {
    source: {
      summary: path.join(REPORTS_ROOT, 'summary.json'),
      metrics: path.join(REPORTS_ROOT, 'metrics.csv'),
      reportMetrics: path.join(REPORTS_ROOT, 'report-metrics.md'),
      fittingGroup: 'core-clean',
    },
    candidateSets: sets,
    evaluations: evaluations.map((evaluation) => ({
      name: evaluation.name,
      metrics: evaluation.metrics,
      groups: evaluation.groups,
      falseRejects: evaluation.falseRejects,
      stressRejectedCount: evaluation.stressRejectedCount,
      boundaryCases: evaluation.boundaryCases,
    })),
    comparisonNotes,
    recommendation,
    warnings,
  }

  await writeFile(path.join(REPORTS_ROOT, 'threshold-fitting.json'), `${JSON.stringify(thresholdFitting, null, 2)}\n`, 'utf8')
  await writeFile(path.join(REPORTS_ROOT, 'threshold-comparison.csv'), `${buildComparisonCsv(evaluations)}\n`, 'utf8')
  await writeFile(
    path.join(REPORTS_ROOT, 'report-thresholds.md'),
    buildReportMarkdown({
      candidateSets: sets,
      evaluations,
      comparisonNotes,
      recommendation,
      warnings,
    }),
    'utf8'
  )

  console.log(`Fitted social-square threshold candidates from core-clean: ${coreCleanRows.length} cases`)
  console.log(`Artifacts:`)
  console.log(`- ${path.join(REPORTS_ROOT, 'threshold-fitting.json')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'threshold-comparison.csv')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'report-thresholds.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
