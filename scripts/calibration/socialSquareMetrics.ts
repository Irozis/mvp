import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildThresholdCandidates,
  buildMetricsCsv,
  computeCaseMetrics,
  getAnnotationClassificationSource,
  getEffectiveBucket,
  getEffectiveAnnotationClassification,
  getExtractedAnnotationClassification,
  parsePng,
  registerCoverageInputs,
  registerImagePixels,
  type CalibrationManifestEntry,
  type CaseMetrics,
  type ExtractedAnnotation,
  type ThresholdRecord,
} from './socialSquareCalibration.shared'

type GroupName = 'core-clean' | 'core-ambiguous' | 'stress-clean' | 'stress-ambiguous'

type MetricKey = keyof Omit<CaseMetrics, 'id' | 'filename' | 'bucket' | 'width' | 'height' | 'flags'>

type MetricSummary = {
  count: number
  valid_count: number
  mean: number | null
  median: number | null
  p90: number | null
  p95: number | null
  max: number | null
  min: number | null
}

type GroupSummary = Record<MetricKey, MetricSummary>

type ExtremeEntry = {
  metric: MetricKey
  kind: 'min' | 'max'
  value: number
  cases: Array<{ id: string; bucket: string; ambiguous: boolean }>
}

type ThresholdReadiness = {
  metric: string
  sourceGroup: GroupName
  validCount: number
  sufficient: boolean
  reason: string
}

type SummaryDelta = {
  group: GroupName
  metric: MetricKey
  validCountBefore: number
  validCountAfter: number
  meanBefore: number | null
  meanAfter: number | null
  medianBefore: number | null
  medianAfter: number | null
}

type AmbiguousInfluence = {
  id: string
  bucket: 'core' | 'stress'
  score: number
  drivers: string[]
}

const ROOT = process.cwd()
const DATASET_ROOT = path.join(ROOT, 'dataset', 'social-square')
const EXTRACTED_ROOT = path.join(DATASET_ROOT, 'extracted')
const REPORTS_ROOT = path.join(DATASET_ROOT, 'reports')

const METRIC_KEYS: MetricKey[] = [
  'headlineOverlapRatio',
  'subtitleOverlapRatio',
  'logoOverlapRatio',
  'badgeOverlapRatio',
  'safeTextScore',
  'safeCoverage',
  'safeAreaCoverage',
]

function round(value: number, precision = 4) {
  const scale = 10 ** precision
  return Math.round(value * scale) / scale
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

function summarize(values: Array<number | null>): MetricSummary {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const mean = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
  const median = quantile(valid, 0.5)
  const p90 = quantile(valid, 0.9)
  const p95 = quantile(valid, 0.95)
  return {
    count: values.length,
    valid_count: valid.length,
    mean: mean === null ? null : round(mean),
    median: median === null ? null : round(median),
    p90: p90 === null ? null : round(p90),
    p95: p95 === null ? null : round(p95),
    max: valid.length ? round(Math.max(...valid)) : null,
    min: valid.length ? round(Math.min(...valid)) : null,
  }
}

function getGroupNameFromClassification(
  annotation: Pick<ExtractedAnnotation, 'bucket'>,
  classification: 'clean' | 'ambiguous' | 'incomplete'
): GroupName | null {
  if (annotation.bucket !== 'core' && annotation.bucket !== 'stress') return null
  if (classification === 'incomplete') return null
  return `${annotation.bucket}-${classification}` as GroupName
}

function buildGroupSummaries(
  metrics: CaseMetrics[],
  annotationsById: Map<string, ExtractedAnnotation>,
  classificationSelector: (annotation: ExtractedAnnotation) => 'clean' | 'ambiguous' | 'incomplete'
) {
  const groups: Record<GroupName, CaseMetrics[]> = {
    'core-clean': [],
    'core-ambiguous': [],
    'stress-clean': [],
    'stress-ambiguous': [],
  }

  for (const metric of metrics) {
    const annotation = annotationsById.get(metric.id)
    if (!annotation) continue
    const group = getGroupNameFromClassification(annotation, classificationSelector(annotation))
    if (!group) continue
    groups[group].push(metric)
  }

  const summaries = Object.fromEntries(
    Object.entries(groups).map(([group, rows]) => [
      group,
      Object.fromEntries(METRIC_KEYS.map((key) => [key, summarize(rows.map((row) => row[key]))])),
    ])
  ) as Record<GroupName, GroupSummary>

  return { groups, summaries }
}

function buildSummaryDeltas(before: Record<GroupName, GroupSummary>, after: Record<GroupName, GroupSummary>) {
  const deltas: SummaryDelta[] = []
  for (const group of Object.keys(before) as GroupName[]) {
    for (const metric of METRIC_KEYS) {
      const previous = before[group][metric]
      const next = after[group][metric]
      if (
        previous.valid_count === next.valid_count &&
        previous.mean === next.mean &&
        previous.median === next.median
      ) {
        continue
      }
      deltas.push({
        group,
        metric,
        validCountBefore: previous.valid_count,
        validCountAfter: next.valid_count,
        meanBefore: previous.mean,
        meanAfter: next.mean,
        medianBefore: previous.median,
        medianAfter: next.median,
      })
    }
  }
  return deltas
}

function buildExtremes(metrics: CaseMetrics[], annotationsById: Map<string, ExtractedAnnotation>) {
  const extremes: ExtremeEntry[] = []
  for (const metricKey of METRIC_KEYS) {
    const validRows = metrics.filter((row) => typeof row[metricKey] === 'number') as Array<CaseMetrics & Record<MetricKey, number>>
    if (!validRows.length) continue
    const max = Math.max(...validRows.map((row) => row[metricKey]))
    const min = Math.min(...validRows.map((row) => row[metricKey]))

    for (const [kind, value] of [
      ['max', max],
      ['min', min],
    ] as const) {
      extremes.push({
        metric: metricKey,
        kind,
        value: round(value),
        cases: validRows
          .filter((row) => row[metricKey] === value)
          .map((row) => {
            const annotation = annotationsById.get(row.id)
            return {
              id: row.id,
              bucket: row.bucket,
              ambiguous: annotation?.flags.includes('ambiguous') ?? false,
            }
          }),
      })
    }
  }
  return extremes
}

function buildThresholdReadiness(groups: Record<GroupName, CaseMetrics[]>) {
  const coreClean = groups['core-clean']
  const readinessMap: Array<{ metric: string; key: MetricKey }> = [
    { metric: 'headline', key: 'headlineOverlapRatio' },
    { metric: 'subtitle', key: 'subtitleOverlapRatio' },
    { metric: 'logo', key: 'logoOverlapRatio' },
    { metric: 'badge', key: 'badgeOverlapRatio' },
    { metric: 'safeTextScore', key: 'safeTextScore' },
    { metric: 'safeCoverage', key: 'safeCoverage' },
    { metric: 'safeAreaCoverage', key: 'safeAreaCoverage' },
  ]

  return readinessMap.map<ThresholdReadiness>(({ metric, key }) => {
    const validValues = coreClean.map((row) => row[key]).filter((value): value is number => typeof value === 'number')
    const nonZero = validValues.filter((value) => value > 0.001)
    const sufficient =
      metric === 'logo' || metric === 'badge'
        ? validValues.length >= 4 && nonZero.length >= 2
        : validValues.length >= 4

    return {
      metric,
      sourceGroup: 'core-clean',
      validCount: validValues.length,
      sufficient,
      reason: sufficient
        ? 'enough clean core samples for a first candidate pass'
        : metric === 'logo' || metric === 'badge'
          ? 'insufficient clean core samples or signal too sparse'
          : 'need at least 4 clean core measurements before proposing thresholds',
    }
  })
}

function buildProvisionalCandidates(groups: Record<GroupName, CaseMetrics[]>, readiness: ThresholdReadiness[]) {
  const readyMetrics = new Set(readiness.filter((entry) => entry.sufficient).map((entry) => entry.metric))
  if (!readyMetrics.size) return [] as ThresholdRecord[]
  return buildThresholdCandidates(groups['core-clean']).filter((record) => {
    if (record.candidate === null) return false
    if (record.metric === 'headline maxOverlapRatio') return readyMetrics.has('headline')
    if (record.metric === 'subtitle maxOverlapRatio') return readyMetrics.has('subtitle')
    if (record.metric === 'logo maxOverlapRatio') return readyMetrics.has('logo')
    if (record.metric === 'badge maxOverlapRatio') return readyMetrics.has('badge')
    if (record.metric === 'safeTextScoreMin') return readyMetrics.has('safeTextScore')
    if (record.metric === 'safeCoverageMin') return readyMetrics.has('safeCoverage')
    if (record.metric === 'safeAreaCoverageMin') return readyMetrics.has('safeAreaCoverage')
    return false
  })
}

function buildAmbiguousInfluence(
  groups: Record<GroupName, CaseMetrics[]>,
  annotationsById: Map<string, ExtractedAnnotation>
) {
  const output: AmbiguousInfluence[] = []
  const pairs: Array<{ bucket: 'core' | 'stress'; clean: GroupName; ambiguous: GroupName }> = [
    { bucket: 'core', clean: 'core-clean', ambiguous: 'core-ambiguous' },
    { bucket: 'stress', clean: 'stress-clean', ambiguous: 'stress-ambiguous' },
  ]

  for (const pair of pairs) {
    const cleanRows = groups[pair.clean]
    const ambiguousRows = groups[pair.ambiguous]
    const cleanMedians = Object.fromEntries(
      METRIC_KEYS.map((key) => [
        key,
        quantile(cleanRows.map((row) => row[key]).filter((value): value is number => typeof value === 'number'), 0.5),
      ])
    ) as Record<MetricKey, number | null>

    for (const row of ambiguousRows) {
      const drivers: string[] = []
      let score = 0
      for (const key of METRIC_KEYS) {
        const median = cleanMedians[key]
        const value = row[key]
        if (median === null || typeof value !== 'number') continue
        const delta = Math.abs(value - median)
        if (delta < 0.03) continue
        score += delta
        drivers.push(`${key}: delta=${round(delta)}`)
      }

      if (!drivers.length) continue
      const annotation = annotationsById.get(row.id)
      if (!annotation?.flags.includes('ambiguous')) continue
      output.push({
        id: row.id,
        bucket: pair.bucket,
        score: round(score),
        drivers: drivers.sort((left, right) => {
          const leftValue = Number(left.split('delta=')[1] ?? 0)
          const rightValue = Number(right.split('delta=')[1] ?? 0)
          return rightValue - leftValue
        }),
      })
    }
  }

  return output.sort((left, right) => right.score - left.score).slice(0, 8)
}

function buildMetricsReportMarkdown(input: {
  inventory: Record<string, number>
  validCaseCount: number
  coreCleanSize: number
  summaries: Record<GroupName, GroupSummary>
  baselineSummaries: Record<GroupName, GroupSummary>
  summaryDeltas: SummaryDelta[]
  extremes: ExtremeEntry[]
  thresholdReadiness: ThresholdReadiness[]
  ambiguousInfluence: AmbiguousInfluence[]
  provisionalCandidates: ThresholdRecord[]
}) {
  const renderSummary = (group: GroupName) => `### ${group}

| Metric | count | valid_count | mean | median | p90 | p95 | max | min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${METRIC_KEYS.map((key) => {
  const summary = input.summaries[group][key]
  return `| ${key} | ${summary.count} | ${summary.valid_count} | ${summary.mean ?? '-'} | ${summary.median ?? '-'} | ${summary.p90 ?? '-'} | ${summary.p95 ?? '-'} | ${summary.max ?? '-'} | ${summary.min ?? '-'} |`
}).join('\n')}
`

  const extremeLines = input.extremes
    .map(
      (entry) =>
        `- ${entry.metric} ${entry.kind} = ${entry.value}: ${entry.cases
          .map((item) => `${item.id} (${item.bucket}${item.ambiguous ? ', ambiguous' : ''})`)
          .join(', ')}`
    )
    .join('\n')

  const influenceLines = input.ambiguousInfluence.length
    ? input.ambiguousInfluence
        .map((entry) => `- ${entry.id} (${entry.bucket}) score=${entry.score}: ${entry.drivers.join('; ')}`)
        .join('\n')
    : '- none'

  const readinessLines = input.thresholdReadiness
    .map(
      (entry) =>
        `- ${entry.metric}: ${entry.sufficient ? 'sufficient' : 'insufficient'} (${entry.validCount} valid in ${entry.sourceGroup}) - ${entry.reason}`
    )
    .join('\n')

  const deltaLines = input.summaryDeltas.length
    ? input.summaryDeltas
        .map(
          (delta) =>
            `- ${delta.group} / ${delta.metric}: valid ${delta.validCountBefore} -> ${delta.validCountAfter}, mean ${delta.meanBefore ?? '-'} -> ${delta.meanAfter ?? '-'}, median ${delta.medianBefore ?? '-'} -> ${delta.medianAfter ?? '-'}`
        )
        .join('\n')
    : '- none'

  const provisionalLines = input.provisionalCandidates.length
    ? input.provisionalCandidates
        .map(
          (record) =>
            `- ${record.metric}: candidate=${record.candidate ?? '-'} (${record.reason})`
        )
        .join('\n')
    : '- no provisional candidates yet'

  return `# Social Square Metrics Report

## Inventory
- core: ${input.inventory.core}
- stress: ${input.inventory.stress}
- reject: ${input.inventory.reject}
- valid cases used for metrics: ${input.validCaseCount}
- new core-clean size: ${input.coreCleanSize}

## Group summaries
${renderSummary('core-clean')}
${renderSummary('core-ambiguous')}
${renderSummary('stress-clean')}
${renderSummary('stress-ambiguous')}

## Summary changes after reclassification
${deltaLines}

## Extreme values
${extremeLines || '- none'}

## Ambiguous cases with strongest summary impact
${influenceLines}

## Candidate-threshold data readiness
${readinessLines}

## Provisional threshold fitting candidates
${provisionalLines}

## Notes
- This stage computes metrics only and does not fit thresholds.
- Summary groups intentionally separate clean and ambiguous cases.
- Comparison baseline uses raw extracted classification before manual triage overrides.
- Reject bucket is excluded from threshold readiness and grouped summaries.
`
}

async function main() {
  await mkdir(REPORTS_ROOT, { recursive: true })

  const annotations = JSON.parse(
    await readFile(path.join(EXTRACTED_ROOT, 'annotations.json'), 'utf8')
  ) as ExtractedAnnotation[]
  const manifest = JSON.parse(
    await readFile(path.join(EXTRACTED_ROOT, 'manifest.json'), 'utf8')
  ) as CalibrationManifestEntry[]

  const updatedAnnotations = annotations.map((annotation) => ({
    ...annotation,
    bucket: getEffectiveBucket(annotation),
    sourceBucket: annotation.sourceBucket ?? annotation.bucket,
    classification: getEffectiveAnnotationClassification(annotation),
    classificationSource: getAnnotationClassificationSource(annotation),
  }))
  const updatedManifest = manifest.map((entry) => {
    const annotation = updatedAnnotations.find((candidate) => candidate.id === entry.id)
    if (!annotation) return entry
    return {
      ...entry,
      bucket: annotation.bucket,
      sourceBucket: annotation.sourceBucket ?? entry.sourceBucket ?? entry.bucket,
      classification: annotation.classification,
      classificationSource: annotation.classificationSource,
    }
  })

  const annotationsById = new Map(updatedAnnotations.map((annotation) => [annotation.id, annotation]))
  const inventory = updatedAnnotations.reduce<Record<string, number>>((accumulator, annotation) => {
    accumulator[annotation.bucket] = (accumulator[annotation.bucket] ?? 0) + 1
    return accumulator
  }, {})

  for (const annotation of updatedAnnotations) {
    const filePath = path.join(DATASET_ROOT, annotation.sourceBucket ?? annotation.bucket, annotation.filename)
    const png = parsePng(await readFile(filePath))
    registerImagePixels(annotation.id, png.pixels)
    registerCoverageInputs(annotation, png.pixels)
  }

  const validAnnotations = updatedAnnotations.filter(
    (annotation) => annotation.heroSubjectRect && (annotation.bucket === 'core' || annotation.bucket === 'stress')
  )
  const metrics = validAnnotations.map((annotation) => computeCaseMetrics(annotation))
  const { groups: baselineGroups, summaries: baselineSummaries } = buildGroupSummaries(
    metrics,
    annotationsById,
    (annotation) => getExtractedAnnotationClassification(annotation)
  )
  const { groups, summaries } = buildGroupSummaries(metrics, annotationsById, (annotation) => annotation.classification ?? 'clean')
  const summaryDeltas = buildSummaryDeltas(baselineSummaries, summaries)
  const extremes = buildExtremes(metrics, annotationsById)
  const thresholdReadiness = buildThresholdReadiness(groups)
  const ambiguousInfluence = buildAmbiguousInfluence(groups, annotationsById)
  const provisionalCandidates = buildProvisionalCandidates(groups, thresholdReadiness)

  const summary = {
    inventory,
    validCaseCount: metrics.length,
    coreCleanSize: groups['core-clean'].length,
    baselineGroups: baselineSummaries,
    groups: summaries,
    summaryDeltas,
    extremes,
    thresholdReadiness,
    ambiguousInfluence,
    provisionalCandidates,
  }

  await writeFile(path.join(EXTRACTED_ROOT, 'manifest.json'), `${JSON.stringify(updatedManifest, null, 2)}\n`, 'utf8')
  await writeFile(path.join(EXTRACTED_ROOT, 'annotations.json'), `${JSON.stringify(updatedAnnotations, null, 2)}\n`, 'utf8')
  await writeFile(path.join(REPORTS_ROOT, 'metrics.csv'), `${buildMetricsCsv(metrics)}\n`, 'utf8')
  await writeFile(path.join(REPORTS_ROOT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  await writeFile(
    path.join(REPORTS_ROOT, 'report-metrics.md'),
    buildMetricsReportMarkdown({
      inventory,
      validCaseCount: metrics.length,
      coreCleanSize: groups['core-clean'].length,
      summaries,
      baselineSummaries,
      summaryDeltas,
      extremes,
      thresholdReadiness,
      ambiguousInfluence,
      provisionalCandidates,
    }),
    'utf8'
  )

  console.log(`Computed social-square metrics: ${metrics.length} valid cases`)
  console.log(`Artifacts:`)
  console.log(`- ${path.join(REPORTS_ROOT, 'metrics.csv')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'summary.json')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'report-metrics.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
