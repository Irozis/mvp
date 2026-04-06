import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CalibrationManifestEntry } from './socialSquareCalibration.shared'

type GroupName = 'core-clean' | 'core-ambiguous' | 'stress-clean' | 'stress-ambiguous'
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

type PolicyEvaluationConfig = {
  headline: number
  subtitle: number
  logo: number
  badge: number
  safeTextScoreMin: number
  safeAreaCoverageMin: number
  safeCoverageMin?: number
  safeCoverageDiagnosticOnly?: boolean
}

const ROOT = process.cwd()
const REPORTS_ROOT = path.join(ROOT, 'dataset', 'social-square', 'reports')
const EXTRACTED_ROOT = path.join(ROOT, 'dataset', 'social-square', 'extracted')
const OVERLAY_POLICIES_PATH = path.join(ROOT, 'src', 'lib', 'overlayPolicies.ts')
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

function getGroup(bucket: string, classification?: string): GroupName | null {
  if (bucket !== 'core' && bucket !== 'stress') return null
  if (classification !== 'clean' && classification !== 'ambiguous') return null
  return `${bucket}-${classification}` as GroupName
}

function evaluateCase(row: CaseMetricRow, policy: PolicyEvaluationConfig) {
  const failures: string[] = []
  if (typeof row.headlineOverlapRatio === 'number' && row.headlineOverlapRatio > policy.headline) {
    failures.push(`headline ${row.headlineOverlapRatio} > ${policy.headline}`)
  }
  if (typeof row.subtitleOverlapRatio === 'number' && row.subtitleOverlapRatio > policy.subtitle) {
    failures.push(`subtitle ${row.subtitleOverlapRatio} > ${policy.subtitle}`)
  }
  if (typeof row.logoOverlapRatio === 'number' && row.logoOverlapRatio > policy.logo) {
    failures.push(`logo ${row.logoOverlapRatio} > ${policy.logo}`)
  }
  if (typeof row.badgeOverlapRatio === 'number' && row.badgeOverlapRatio > policy.badge) {
    failures.push(`badge ${row.badgeOverlapRatio} > ${policy.badge}`)
  }
  if (typeof row.safeTextScore === 'number' && row.safeTextScore < policy.safeTextScoreMin) {
    failures.push(`safeTextScore ${row.safeTextScore} < ${policy.safeTextScoreMin}`)
  }
  if (!policy.safeCoverageDiagnosticOnly && typeof policy.safeCoverageMin === 'number' && typeof row.safeCoverage === 'number' && row.safeCoverage < policy.safeCoverageMin) {
    failures.push(`safeCoverage ${row.safeCoverage} < ${policy.safeCoverageMin}`)
  }
  if (typeof row.safeAreaCoverage === 'number' && row.safeAreaCoverage < policy.safeAreaCoverageMin) {
    failures.push(`safeAreaCoverage ${row.safeAreaCoverage} < ${policy.safeAreaCoverageMin}`)
  }
  return {
    pass: failures.length === 0,
    failures,
  }
}

function summarizeGroups(
  rows: CaseMetricRow[],
  classifications: Map<string, string>,
  policy: PolicyEvaluationConfig
) {
  const groups: Record<GroupName, { count: number; passCount: number; passRate: number; rejected: string[] }> = {
    'core-clean': { count: 0, passCount: 0, passRate: 0, rejected: [] },
    'core-ambiguous': { count: 0, passCount: 0, passRate: 0, rejected: [] },
    'stress-clean': { count: 0, passCount: 0, passRate: 0, rejected: [] },
    'stress-ambiguous': { count: 0, passCount: 0, passRate: 0, rejected: [] },
  }

  for (const row of rows) {
    const group = getGroup(row.bucket, classifications.get(row.id))
    if (!group) continue
    groups[group].count += 1
    const result = evaluateCase(row, policy)
    if (result.pass) {
      groups[group].passCount += 1
    } else {
      groups[group].rejected.push(row.id)
    }
  }

  for (const group of Object.keys(groups) as GroupName[]) {
    const entry = groups[group]
    entry.passRate = entry.count ? Number((entry.passCount / entry.count).toFixed(4)) : 0
  }

  return groups
}

function buildUnifiedDiff(beforeLines: string[], afterLines: string[]) {
  return [
    '--- a/src/lib/overlayPolicies.ts',
    '+++ b/src/lib/overlayPolicies.ts',
    '@@ social-square / square-hero-overlay @@',
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
  ].join('\n')
}

function lineNumberOf(lines: string[], pattern: string) {
  const index = lines.findIndex((line) => line.includes(pattern))
  return index >= 0 ? index + 1 : null
}

function isExcludedDuplicate(id: string) {
  return Boolean(DUPLICATE_MAP[id])
}

async function main() {
  await mkdir(REPORTS_ROOT, { recursive: true })

  const policyJson = JSON.parse(await readFile(path.join(REPORTS_ROOT, 'provisional-policy.json'), 'utf8')) as {
    gating: {
      headline: { maxOverlapRatio: number }
      subtitle: { maxOverlapRatio: number }
      badge: { maxOverlapRatio: number }
      safeTextScoreMin: { value: number }
      safeAreaCoverageMin: { value: number }
    }
    safeCoverageMinDiagnostic: { value: number; reason: string[] }
  }
  const metricsCsv = await readFile(path.join(REPORTS_ROOT, 'metrics.csv'), 'utf8')
  const manifest = JSON.parse(await readFile(path.join(EXTRACTED_ROOT, 'manifest.json'), 'utf8')) as CalibrationManifestEntry[]
  const overlayPoliciesSource = await readFile(OVERLAY_POLICIES_PATH, 'utf8')

  const currentPolicy: PolicyEvaluationConfig = {
    headline: 0.24,
    subtitle: 0.22,
    logo: 0.06,
    badge: 0.08,
    safeTextScoreMin: 0.58,
    safeCoverageMin: 0.7,
    safeAreaCoverageMin: 0.85,
  }

  const provisionalPolicy: PolicyEvaluationConfig = {
    headline: policyJson.gating.headline.maxOverlapRatio,
    subtitle: policyJson.gating.subtitle.maxOverlapRatio,
    logo: 0.06,
    badge: policyJson.gating.badge.maxOverlapRatio,
    safeTextScoreMin: policyJson.gating.safeTextScoreMin.value,
    safeCoverageMin: policyJson.safeCoverageMinDiagnostic.value,
    safeCoverageDiagnosticOnly: true,
    safeAreaCoverageMin: policyJson.gating.safeAreaCoverageMin.value,
  }

  const rows = parseMetricsCsv(metricsCsv)
  const classificationById = new Map(manifest.map((entry) => [entry.id, entry.classification ?? 'clean']))
  const reviewRows = rows.filter((row) => !isExcludedDuplicate(row.id))

  const currentGroups = summarizeGroups(reviewRows, classificationById, currentPolicy)
  const provisionalGroups = summarizeGroups(reviewRows, classificationById, provisionalPolicy)

  const changedCases = reviewRows
    .map((row) => {
      const current = evaluateCase(row, currentPolicy)
      const provisional = evaluateCase(row, provisionalPolicy)
      if (current.pass === provisional.pass) return null
      return {
        id: row.id,
        bucket: row.bucket,
        classification: classificationById.get(row.id) ?? 'clean',
        before: current.pass ? 'pass' : 'fail',
        after: provisional.pass ? 'pass' : 'fail',
        beforeReasons: current.failures,
        afterReasons: provisional.failures,
      }
    })
    .filter(Boolean)

  const duplicateNotes = Object.entries(DUPLICATE_MAP).map(([duplicateId, payload]) => {
    const canonicalRow = rows.find((row) => row.id === payload.canonicalId)
    const canonicalCurrent = canonicalRow ? evaluateCase(canonicalRow, currentPolicy) : null
    const canonicalProvisional = canonicalRow ? evaluateCase(canonicalRow, provisionalPolicy) : null
    return {
      duplicateId,
      canonicalId: payload.canonicalId,
      reason: payload.reason,
      canonicalCurrent: canonicalCurrent?.pass ? 'pass' : 'fail',
      canonicalProvisional: canonicalProvisional?.pass ? 'pass' : 'fail',
    }
  })

  const lines = overlayPoliciesSource.split(/\r?\n/)
  const startLine = lineNumberOf(lines, "'social-square': {")
  const modelLine = lineNumberOf(lines, "'square-hero-overlay': {")

  const beforeSnippet = [
    "  'social-square': {",
    "    'square-hero-overlay': {",
    '      safeTextScoreMin: 0.58,',
    '      safeCoverageMin: 0.7,',
    '      safeAreaCoverageMin: 0.85,',
    '      maxOverlapByKind: {',
    '        headline: 0.24,',
    '        subtitle: 0.22,',
    '        logo: 0.06,',
    '        badge: 0.08,',
    '      },',
    '    },',
    '  },',
  ]

  const afterSnippet = [
    "  'social-square': {",
    "    'square-hero-overlay': {",
    `      safeTextScoreMin: ${provisionalPolicy.safeTextScoreMin},`,
    "      // safeCoverageMin stays diagnostic-only for now; keep current gating behavior unchanged until a richer policy shape exists",
    '      safeCoverageMin: 0.7,',
    `      safeAreaCoverageMin: ${provisionalPolicy.safeAreaCoverageMin},`,
    '      maxOverlapByKind: {',
    `        headline: ${provisionalPolicy.headline},`,
    `        subtitle: ${provisionalPolicy.subtitle},`,
    '        logo: 0.06, // unchanged: insufficient_data',
    `        badge: ${provisionalPolicy.badge},`,
    '      },',
    '    },',
    '  },',
  ]

  const rollbackSnippet = beforeSnippet.join('\n')
  const diff = buildUnifiedDiff(beforeSnippet, afterSnippet)
  const controlledApplyAcceptable =
    provisionalGroups['core-clean'].passRate >= 0.85 && provisionalGroups['stress-clean'].passRate >= 0.3
  const finalRecommendation = controlledApplyAcceptable
    ? 'acceptable for controlled apply'
    : 'not yet acceptable for controlled apply'

  const report = `# Social Square Apply Preview

## Target location
- file: [overlayPolicies.ts](${OVERLAY_POLICIES_PATH})
- social-square block line: ${startLine ?? 'not found'}
- square-hero-overlay line: ${modelLine ?? 'not found'}

## Before snippet
\`\`\`ts
${beforeSnippet.join('\n')}
\`\`\`

## After snippet
\`\`\`ts
${afterSnippet.join('\n')}
\`\`\`

## Expected behavior delta on current dataset
- current core-clean pass rate: ${currentGroups['core-clean'].passRate} (${currentGroups['core-clean'].passCount}/${currentGroups['core-clean'].count})
- provisional core-clean pass rate: ${provisionalGroups['core-clean'].passRate} (${provisionalGroups['core-clean'].passCount}/${provisionalGroups['core-clean'].count})
- current stress total pass rate: ${Number(((currentGroups['stress-clean'].passCount + currentGroups['stress-ambiguous'].passCount) / (currentGroups['stress-clean'].count + currentGroups['stress-ambiguous'].count)).toFixed(4))} (${currentGroups['stress-clean'].passCount + currentGroups['stress-ambiguous'].passCount}/${currentGroups['stress-clean'].count + currentGroups['stress-ambiguous'].count})
- provisional stress total pass rate: ${Number(((provisionalGroups['stress-clean'].passCount + provisionalGroups['stress-ambiguous'].passCount) / (provisionalGroups['stress-clean'].count + provisionalGroups['stress-ambiguous'].count)).toFixed(4))} (${provisionalGroups['stress-clean'].passCount + provisionalGroups['stress-ambiguous'].passCount}/${provisionalGroups['stress-clean'].count + provisionalGroups['stress-ambiguous'].count})
- duplicate handling: Group 1 excluded from comparison; Group 16 kept as canonical stress case

## Changed pass/fail cases
${changedCases.length ? changedCases.map((entry) => `- ${entry!.id} (${entry!.bucket}, ${entry!.classification}): ${entry!.before} -> ${entry!.after}${entry!.beforeReasons.length ? ` | before: ${entry!.beforeReasons.join('; ')}` : ''}${entry!.afterReasons.length ? ` | after: ${entry!.afterReasons.join('; ')}` : ''}`).join('\n') : '- none'}

## Duplicate handling
${duplicateNotes.map((entry) => `- ${entry.duplicateId} excluded as duplicate of ${entry.canonicalId}. ${entry.reason}. Canonical case status: current=${entry.canonicalCurrent}, provisional=${entry.canonicalProvisional}.`).join('\n')}

## safeCoverageMin handling
- current gating value in production snippet: 0.7
- provisional diagnostic value: ${policyJson.safeCoverageMinDiagnostic.value}
- proposed handling: keep \`safeCoverageMin\` out of gating for now and treat it as diagnostic-only
- why:
${policyJson.safeCoverageMinDiagnostic.reason.map((reason) => `  - ${reason}`).join('\n')}

## Rollback snippet
\`\`\`ts
${rollbackSnippet}
\`\`\`

## Final recommendation
- status: ${finalRecommendation}
- known caveats:
  - logo insufficient_data and remains unchanged
  - safeCoverageMin stays diagnostic-only
  - duplicate case Group 1 removed from evaluation; Group 16 remains as the canonical stress case

## Notes
- This is preview-only and was not applied.
- Logo remains unchanged because current fitting still marks it as insufficient_data.
`

  await writeFile(path.join(REPORTS_ROOT, 'apply-preview.diff'), `${diff}\n`, 'utf8')
  await writeFile(path.join(REPORTS_ROOT, 'report-apply-preview.md'), report, 'utf8')

  console.log('Generated social-square apply preview')
  console.log(`- ${path.join(REPORTS_ROOT, 'apply-preview.diff')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'report-apply-preview.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
