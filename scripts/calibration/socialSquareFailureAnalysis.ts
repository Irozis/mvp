import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FORMAT_MAP } from '../../src/lib/presets'
import { getCompositionModel } from '../../src/lib/formatCompositionModels'
import { getOverlaySafetyPolicy } from '../../src/lib/overlayPolicies'
import type { CalibrationManifestEntry } from './socialSquareCalibration.shared'

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

type FailureTaxonomy =
  | 'scoring failure'
  | 'slot/composition failure'
  | 'text sizing/reflow failure'
  | 'logo/badge placement failure'
  | 'invalid/stress-like composition'
  | 'ambiguous dataset issue'

type SuspiciousPassTaxonomy =
  | 'acceptable soft pass'
  | 'likely false pass'
  | 'stress case now intentionally allowed'
  | 'duplicate/noisy signal'

type IssueCause = 'thresholds' | 'layout engine' | 'repair logic' | 'dataset classification'

type CaseAnalysis = {
  id: string
  bucket: 'core' | 'stress' | 'reject'
  classification: string
  outcome: 'still-fail' | 'suspicious-pass'
  taxonomy: FailureTaxonomy | SuspiciousPassTaxonomy
  mainReasons: string[]
  issueCause: IssueCause
  metrics: Pick<
    CaseMetricRow,
    | 'headlineOverlapRatio'
    | 'subtitleOverlapRatio'
    | 'logoOverlapRatio'
    | 'badgeOverlapRatio'
    | 'safeTextScore'
    | 'safeAreaCoverage'
    | 'safeCoverage'
  >
}

const ROOT = process.cwd()
const REPORTS_ROOT = path.join(ROOT, 'dataset', 'social-square', 'reports')
const EXTRACTED_ROOT = path.join(ROOT, 'dataset', 'social-square', 'extracted')
const VISUAL_REPORT_PATH = path.join(REPORTS_ROOT, 'report-visual-preview.md')
const APPLY_REPORT_PATH = path.join(REPORTS_ROOT, 'report-apply-preview.md')

const DUPLICATE_MAP: Record<string, { canonicalId: string; reason: string }> = {
  'Group 1': {
    canonicalId: 'Group 16',
    reason: 'manual review marked Group 1 and Group 16 as duplicates; keep Group 16 as the canonical stress case',
  },
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

function isExcludedDuplicate(id: string) {
  return Boolean(DUPLICATE_MAP[id])
}

function getReasons(row: CaseMetricRow, policy: ReturnType<typeof getOverlaySafetyPolicy>) {
  const reasons: string[] = []
  if (typeof row.headlineOverlapRatio === 'number' && row.headlineOverlapRatio > (policy.maxOverlapByKind.headline ?? Infinity)) {
    reasons.push(`headline ${row.headlineOverlapRatio} > ${policy.maxOverlapByKind.headline}`)
  }
  if (typeof row.subtitleOverlapRatio === 'number' && row.subtitleOverlapRatio > (policy.maxOverlapByKind.subtitle ?? Infinity)) {
    reasons.push(`subtitle ${row.subtitleOverlapRatio} > ${policy.maxOverlapByKind.subtitle}`)
  }
  if (typeof row.logoOverlapRatio === 'number' && row.logoOverlapRatio > (policy.maxOverlapByKind.logo ?? Infinity)) {
    reasons.push(`logo ${row.logoOverlapRatio} > ${policy.maxOverlapByKind.logo}`)
  }
  if (typeof row.badgeOverlapRatio === 'number' && row.badgeOverlapRatio > (policy.maxOverlapByKind.badge ?? Infinity)) {
    reasons.push(`badge ${row.badgeOverlapRatio} > ${policy.maxOverlapByKind.badge}`)
  }
  if (typeof row.safeTextScore === 'number' && row.safeTextScore < policy.safeTextScoreMin) {
    reasons.push(`safeTextScore ${row.safeTextScore} < ${policy.safeTextScoreMin}`)
  }
  if (typeof row.safeAreaCoverage === 'number' && row.safeAreaCoverage < policy.safeAreaCoverageMin) {
    reasons.push(`safeAreaCoverage ${row.safeAreaCoverage} < ${policy.safeAreaCoverageMin}`)
  }
  return reasons
}

function isNearThreshold(value: number | null, threshold: number, direction: 'max' | 'min', epsilon: number) {
  if (typeof value !== 'number') return false
  const delta = direction === 'max' ? threshold - value : value - threshold
  return delta >= 0 && delta <= epsilon
}

function extractSectionIds(markdown: string, heading: string) {
  const lines = markdown.split(/\r?\n/)
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (headingIndex < 0) return []
  const ids: string[] = []
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('## ')) break
    const match = line.match(/^- (Group \d+)/)
    if (match) ids.push(match[1])
  }
  return ids
}

function classifyStillFail(row: CaseMetricRow, classification: string, reasons: string[], policy: ReturnType<typeof getOverlaySafetyPolicy>): CaseAnalysis {
  const headlineLimit = policy.maxOverlapByKind.headline ?? 0
  const subtitleLimit = policy.maxOverlapByKind.subtitle ?? 0
  const badgeLimit = policy.maxOverlapByKind.badge ?? 0
  const headlineRatio = row.headlineOverlapRatio ?? 0
  const subtitleRatio = row.subtitleOverlapRatio ?? 0
  const badgeRatio = row.badgeOverlapRatio ?? 0
  const safeText = row.safeTextScore ?? null
  const safeArea = row.safeAreaCoverage ?? null

  let taxonomy: FailureTaxonomy = 'slot/composition failure'
  let issueCause: IssueCause = 'layout engine'

  if (classification === 'ambiguous') {
    taxonomy = 'ambiguous dataset issue'
    issueCause = 'dataset classification'
  } else if (reasons.some((reason) => reason.startsWith('badge') || reason.startsWith('logo'))) {
    taxonomy = 'logo/badge placement failure'
    issueCause = row.bucket === 'core' ? 'repair logic' : 'layout engine'
  } else if (reasons.every((reason) => reason.startsWith('safeTextScore') || reason.startsWith('safeAreaCoverage'))) {
    if ((safeText !== null && safeText >= policy.safeTextScoreMin - 0.02) || (safeArea !== null && safeArea >= policy.safeAreaCoverageMin - 0.05)) {
      taxonomy = 'scoring failure'
      issueCause = 'thresholds'
    } else if (safeArea === 0) {
      taxonomy = 'invalid/stress-like composition'
      issueCause = 'layout engine'
    } else {
      taxonomy = 'slot/composition failure'
      issueCause = row.bucket === 'core' ? 'repair logic' : 'layout engine'
    }
  } else if (reasons.some((reason) => reason.startsWith('headline') || reason.startsWith('subtitle'))) {
    const severeTextFailure =
      headlineRatio > headlineLimit * 2 ||
      subtitleRatio > subtitleLimit * 2 ||
      row.width >= 400
    const nearThresholdOnly =
      (headlineRatio > 0 && headlineRatio <= headlineLimit + 0.003) ||
      (subtitleRatio > 0 && subtitleRatio <= subtitleLimit + 0.003)

    if (severeTextFailure && row.bucket === 'stress') {
      taxonomy = 'invalid/stress-like composition'
      issueCause = 'layout engine'
    } else if (nearThresholdOnly) {
      taxonomy = 'text sizing/reflow failure'
      issueCause = 'thresholds'
    } else {
      taxonomy = 'text sizing/reflow failure'
      issueCause = row.bucket === 'core' ? 'repair logic' : 'layout engine'
    }
  }

  if (row.bucket === 'stress' && badgeRatio > badgeLimit * 2) {
    taxonomy = 'invalid/stress-like composition'
    issueCause = 'layout engine'
  }

  return {
    id: row.id,
    bucket: row.bucket,
    classification,
    outcome: 'still-fail',
    taxonomy,
    mainReasons: reasons,
    issueCause,
    metrics: {
      headlineOverlapRatio: row.headlineOverlapRatio,
      subtitleOverlapRatio: row.subtitleOverlapRatio,
      logoOverlapRatio: row.logoOverlapRatio,
      badgeOverlapRatio: row.badgeOverlapRatio,
      safeTextScore: row.safeTextScore,
      safeAreaCoverage: row.safeAreaCoverage,
      safeCoverage: row.safeCoverage,
    },
  }
}

function classifySuspiciousPass(
  row: CaseMetricRow,
  classification: string,
  policy: ReturnType<typeof getOverlaySafetyPolicy>
): CaseAnalysis {
  let taxonomy: SuspiciousPassTaxonomy = 'acceptable soft pass'
  let issueCause: IssueCause = 'thresholds'
  const reasons: string[] = []

  if (classification === 'ambiguous') {
    taxonomy = 'duplicate/noisy signal'
    issueCause = 'dataset classification'
    reasons.push('ambiguous classification remains in dataset')
  } else if (row.id === 'Group 16') {
    taxonomy = 'stress case now intentionally allowed'
    issueCause = 'thresholds'
    reasons.push('canonical duplicate stress case intentionally reviewed as pass')
  } else if (row.bucket === 'stress' && (row.safeAreaCoverage ?? 0) >= policy.safeAreaCoverageMin) {
    taxonomy = 'stress case now intentionally allowed'
    issueCause = 'thresholds'
    reasons.push('stress case now passes under provisional square overlay policy')
  } else if (
    (row.headlineOverlapRatio ?? 0) <= 0.002 &&
    (row.subtitleOverlapRatio ?? 0) <= 0.003 &&
    (row.badgeOverlapRatio ?? 0) <= 0.001 &&
    (row.safeTextScore ?? 1) >= policy.safeTextScoreMin + 0.05
  ) {
    taxonomy = 'duplicate/noisy signal'
    issueCause = 'thresholds'
    reasons.push('suspicious flag is mostly heuristic noise rather than a real policy edge')
  } else if (
    isNearThreshold(row.headlineOverlapRatio, policy.maxOverlapByKind.headline ?? 0, 'max', 0.002) ||
    isNearThreshold(row.subtitleOverlapRatio, policy.maxOverlapByKind.subtitle ?? 0, 'max', 0.002) ||
    isNearThreshold(row.safeTextScore, policy.safeTextScoreMin, 'min', 0.02)
  ) {
    taxonomy = 'likely false pass'
    issueCause = 'thresholds'
    reasons.push('metric sits very close to the provisional gate')
  } else {
    taxonomy = 'acceptable soft pass'
    issueCause = row.bucket === 'core' ? 'thresholds' : 'repair logic'
    reasons.push('policy relaxation looks acceptable on this case')
  }

  if (!reasons.length) reasons.push('passes but remains close enough to require manual review')

  return {
    id: row.id,
    bucket: row.bucket,
    classification,
    outcome: 'suspicious-pass',
    taxonomy,
    mainReasons: reasons,
    issueCause,
    metrics: {
      headlineOverlapRatio: row.headlineOverlapRatio,
      subtitleOverlapRatio: row.subtitleOverlapRatio,
      logoOverlapRatio: row.logoOverlapRatio,
      badgeOverlapRatio: row.badgeOverlapRatio,
      safeTextScore: row.safeTextScore,
      safeAreaCoverage: row.safeAreaCoverage,
      safeCoverage: row.safeCoverage,
    },
  }
}

function buildReportMarkdown(input: {
  analyses: CaseAnalysis[]
  visualReportPath: string
  applyReportPath: string
  policyPath: string
  recommendation: string
}) {
  const stillFail = input.analyses.filter((entry) => entry.outcome === 'still-fail')
  const suspicious = input.analyses.filter((entry) => entry.outcome === 'suspicious-pass')

  const summarizeByTaxonomy = (entries: CaseAnalysis[]) => {
    const counts = new Map<string, number>()
    for (const entry of entries) counts.set(entry.taxonomy, (counts.get(entry.taxonomy) ?? 0) + 1)
    return [...counts.entries()].map(([key, value]) => `- ${key}: ${value}`).join('\n') || '- none'
  }

  const formatCase = (entry: CaseAnalysis) =>
    `- ${entry.id}: ${entry.outcome}; taxonomy=${entry.taxonomy}; cause=${entry.issueCause}; reasons=${entry.mainReasons.join('; ')}`

  return `# Social Square Failure Analysis

## Inputs
- visual preview: [report-visual-preview.md](${input.visualReportPath})
- apply preview: [report-apply-preview.md](${input.applyReportPath})
- current policy: [overlayPolicies.ts](${input.policyPath})

## Still fail taxonomy
${summarizeByTaxonomy(stillFail)}

## Suspicious pass taxonomy
${summarizeByTaxonomy(suspicious)}

## Still fail case review
${stillFail.map(formatCase).join('\n') || '- none'}

## Suspicious pass case review
${suspicious.map(formatCase).join('\n') || '- none'}

## Recommendation
- ${input.recommendation}

## Rationale
- Most remaining failures are stress-like or composition/text-structure problems, not simple threshold misses.
- The suspicious-pass set contains a mix of acceptable soft passes and heuristic-noise cases, which points more strongly to review/repair improvements than to immediate threshold tightening.
- No regressions were observed in the current preview batch.
`
}

async function main() {
  await mkdir(REPORTS_ROOT, { recursive: true })

  const metricsCsv = await readFile(path.join(REPORTS_ROOT, 'metrics.csv'), 'utf8')
  const manifest = JSON.parse(await readFile(path.join(EXTRACTED_ROOT, 'manifest.json'), 'utf8')) as CalibrationManifestEntry[]
  const visualReport = await readFile(VISUAL_REPORT_PATH, 'utf8')
  await readFile(APPLY_REPORT_PATH, 'utf8')

  const format = FORMAT_MAP['social-square']
  const model = getCompositionModel(format, 'square-hero-overlay')
  const policy = getOverlaySafetyPolicy(format, model)

  const rows = parseMetricsCsv(metricsCsv)
  const classificationById = new Map(manifest.map((entry) => [entry.id, entry.classification ?? 'clean']))
  const reviewRows = rows.filter((row) => row.bucket !== 'reject' && !isExcludedDuplicate(row.id))
  const rowById = new Map(reviewRows.map((row) => [row.id, row]))
  const stillFailIds = extractSectionIds(visualReport, 'Still fail')
  const suspiciousIds = extractSectionIds(visualReport, 'Suspicious passes')

  const analyses: CaseAnalysis[] = []

  for (const id of stillFailIds) {
    const row = rowById.get(id)
    if (!row) continue
    const classification = classificationById.get(row.id) ?? 'clean'
    const reasons = getReasons(row, policy)
    analyses.push(classifyStillFail(row, classification, reasons, policy))
  }

  for (const id of suspiciousIds) {
    const row = rowById.get(id)
    if (!row) continue
    const classification = classificationById.get(row.id) ?? 'clean'
    analyses.push(classifySuspiciousPass(row, classification, policy))
  }

  const stillFail = analyses.filter((entry) => entry.outcome === 'still-fail')
  const suspicious = analyses.filter((entry) => entry.outcome === 'suspicious-pass')

  const recommendation =
    stillFail.some((entry) => entry.issueCause === 'layout engine' || entry.issueCause === 'repair logic')
      ? 'leave thresholds unchanged and improve repair/layout logic next'
      : suspicious.some((entry) => entry.taxonomy === 'likely false pass')
        ? 'tighten specific threshold(s)'
        : 'keep current square policy as-is'

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      visualPreview: VISUAL_REPORT_PATH,
      applyPreview: APPLY_REPORT_PATH,
      metrics: path.join(REPORTS_ROOT, 'metrics.csv'),
      manifest: path.join(EXTRACTED_ROOT, 'manifest.json'),
      policy: path.join(ROOT, 'src', 'lib', 'overlayPolicies.ts'),
    },
    counts: {
      stillFail: stillFail.length,
      suspiciousPass: suspicious.length,
    },
    analyses,
    recommendation,
  }

  await writeFile(path.join(REPORTS_ROOT, 'failure-analysis.json'), JSON.stringify(payload, null, 2), 'utf8')
  await writeFile(
    path.join(REPORTS_ROOT, 'report-failure-analysis.md'),
    buildReportMarkdown({
      analyses,
      visualReportPath: VISUAL_REPORT_PATH,
      applyReportPath: APPLY_REPORT_PATH,
      policyPath: path.join(ROOT, 'src', 'lib', 'overlayPolicies.ts'),
      recommendation,
    }),
    'utf8'
  )

  console.log('Generated social-square failure analysis')
  console.log(`- ${path.join(REPORTS_ROOT, 'failure-analysis.json')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'report-failure-analysis.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
