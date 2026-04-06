import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
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

type VisualCase = {
  row: CaseMetricRow
  classification: string
  before: ReturnType<typeof evaluateCase>
  after: ReturnType<typeof evaluateCase>
  imageDataUri: string
  suspiciousPass: boolean
}

const ROOT = process.cwd()
const REPORTS_ROOT = path.join(ROOT, 'dataset', 'social-square', 'reports')
const EXTRACTED_ROOT = path.join(ROOT, 'dataset', 'social-square', 'extracted')

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

function isExcludedDuplicate(id: string) {
  return Boolean(DUPLICATE_MAP[id])
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function shortReasonList(failures: string[]) {
  if (!failures.length) return ['passes current gating']
  return failures.slice(0, 2).map((entry) => entry.length > 36 ? `${entry.slice(0, 33)}...` : entry)
}

function isNearThreshold(value: number | null, threshold: number, direction: 'max' | 'min') {
  if (typeof value !== 'number') return false
  const delta = direction === 'max' ? threshold - value : value - threshold
  return delta >= 0 && delta <= 0.03
}

function isSuspiciousPass(row: CaseMetricRow, classification: string, policy: PolicyEvaluationConfig, result: ReturnType<typeof evaluateCase>) {
  if (!result.pass) return false
  if (classification === 'ambiguous') return true
  return (
    isNearThreshold(row.headlineOverlapRatio, policy.headline, 'max') ||
    isNearThreshold(row.subtitleOverlapRatio, policy.subtitle, 'max') ||
    isNearThreshold(row.badgeOverlapRatio, policy.badge, 'max') ||
    isNearThreshold(row.safeTextScore, policy.safeTextScoreMin, 'min') ||
    isNearThreshold(row.safeAreaCoverage, policy.safeAreaCoverageMin, 'min')
  )
}

function buildContactSheet(title: string, cases: VisualCase[], mode: 'before' | 'after') {
  const columns = 4
  const cardW = 250
  const cardH = 330
  const gap = 20
  const margin = 24
  const headerH = 88
  const rows = Math.max(1, Math.ceil(cases.length / columns))
  const width = margin * 2 + columns * cardW + (columns - 1) * gap
  const height = margin * 2 + headerH + rows * cardH + (rows - 1) * gap

  const passCount = cases.filter((entry) => (mode === 'before' ? entry.before.pass : entry.after.pass)).length
  const suspiciousCount = cases.filter((entry) => mode === 'after' && entry.suspiciousPass).length

  const cards = cases.map((entry, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = margin + column * (cardW + gap)
    const y = margin + headerH + row * (cardH + gap)
    const result = mode === 'before' ? entry.before : entry.after
    const border = result.pass ? '#199b46' : '#d93025'
    const band = result.pass ? '#dff7e5' : '#fde7e4'
    const label = result.pass ? 'PASS' : 'FAIL'
    const reasons = shortReasonList(result.failures)
    const classification = entry.classification
    const meta = `${entry.row.bucket} / ${classification}`
    const suspicious = mode === 'after' && entry.suspiciousPass
    const suspiciousLabel = suspicious ? 'SUSPICIOUS PASS' : ''

    return `
      <g transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="14" fill="#ffffff" stroke="${border}" stroke-width="3"/>
        <rect x="0" y="0" width="${cardW}" height="34" rx="14" fill="${band}"/>
        <text x="14" y="22" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="${border}">${label}</text>
        <text x="${cardW - 14}" y="22" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#4a5568">${xmlEscape(entry.row.id)}</text>
        <rect x="14" y="46" width="${cardW - 28}" height="188" rx="10" fill="#f2f4f8" stroke="#d6dbe5"/>
        <image x="14" y="46" width="${cardW - 28}" height="188" preserveAspectRatio="xMidYMid meet" href="${entry.imageDataUri}" />
        <text x="14" y="258" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#1f2937">${xmlEscape(meta)}</text>
        ${suspicious ? `<text x="${cardW - 14}" y="258" text-anchor="end" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#9a3412">${suspiciousLabel}</text>` : ''}
        <text x="14" y="280" font-family="Arial, sans-serif" font-size="12" fill="#364152">${xmlEscape(reasons[0] ?? '')}</text>
        <text x="14" y="298" font-family="Arial, sans-serif" font-size="12" fill="#364152">${xmlEscape(reasons[1] ?? '')}</text>
      </g>
    `
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f7f8fb"/>
  <text x="${margin}" y="${margin + 22}" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111827">${xmlEscape(title)}</text>
  <text x="${margin}" y="${margin + 50}" font-family="Arial, sans-serif" font-size="15" fill="#4b5563">Cases: ${cases.length} | Pass: ${passCount}/${cases.length}${mode === 'after' ? ` | Suspicious passes: ${suspiciousCount}` : ''}</text>
  <text x="${margin}" y="${margin + 72}" font-family="Arial, sans-serif" font-size="13" fill="#6b7280">Duplicate handling: Group 1 excluded from review, Group 16 kept as canonical stress case.</text>
  ${cards.join('\n')}
</svg>`
}

function buildComparisonReport(input: {
  beforePath: string
  afterPath: string
  visualCases: VisualCase[]
}) {
  const improved = input.visualCases.filter((entry) => !entry.before.pass && entry.after.pass)
  const unchangedPass = input.visualCases.filter((entry) => entry.before.pass && entry.after.pass)
  const stillFail = input.visualCases.filter((entry) => !entry.before.pass && !entry.after.pass)
  const suspiciousPasses = input.visualCases.filter((entry) => entry.suspiciousPass)
  const regressed = input.visualCases.filter((entry) => entry.before.pass && !entry.after.pass)

  const bullet = (entries: VisualCase[], formatter: (entry: VisualCase) => string) =>
    entries.length ? entries.map((entry) => `- ${formatter(entry)}`).join('\n') : '- none'

  return `# Social Square Visual Policy Preview

## Contact sheets
![Before policy change](${input.beforePath})

![After policy change](${input.afterPath})

## Review basis
- Real square overlay cases from \`dataset/social-square\`
- Duplicate handling: \`Group 1\` excluded from comparison; \`Group 16\` kept as canonical stress case
- Policy scope: only \`social-square / square-hero-overlay\`

## Improved cases
${bullet(improved, (entry) => `${entry.row.id} (${entry.row.bucket}, ${entry.classification}) fail -> pass`)}

## Unchanged passes
${bullet(unchangedPass, (entry) => `${entry.row.id} (${entry.row.bucket}, ${entry.classification})`)}

## Still fail
${bullet(stillFail, (entry) => `${entry.row.id} (${entry.row.bucket}, ${entry.classification}): ${entry.after.failures.join('; ') || 'still fails'}`)}

## Suspicious passes
${bullet(suspiciousPasses, (entry) => `${entry.row.id} (${entry.row.bucket}, ${entry.classification})${entry.classification === 'ambiguous' ? ' [ambiguous]' : ''}`)}

## Regressions
${bullet(regressed, (entry) => `${entry.row.id} (${entry.row.bucket}, ${entry.classification}) pass -> fail`)}

## Notes
- \`safeCoverageMin\` stays diagnostic-only and is not used as a gating threshold.
- \`logo\` stays unchanged because fitting still marks it as insufficient data.
- This report is preview-oriented: it visualizes pass/fail and review impact on real square cases after the approved social-square policy apply.
`
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
    safeCoverageMinDiagnostic: { value: number }
  }
  const metricsCsv = await readFile(path.join(REPORTS_ROOT, 'metrics.csv'), 'utf8')
  const manifest = JSON.parse(await readFile(path.join(EXTRACTED_ROOT, 'manifest.json'), 'utf8')) as CalibrationManifestEntry[]
  const rows = parseMetricsCsv(metricsCsv)
  const classificationById = new Map(manifest.map((entry) => [entry.id, entry.classification ?? 'clean']))

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

  const reviewRows = rows.filter((row) => row.bucket !== 'reject' && !isExcludedDuplicate(row.id))
  const visualCases: VisualCase[] = []

  for (const row of reviewRows) {
    const imagePath = path.join(ROOT, 'dataset', 'social-square', row.bucket, row.filename)
    const imageBuffer = await readFile(imagePath)
    const imageDataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`
    const classification = classificationById.get(row.id) ?? 'clean'
    const before = evaluateCase(row, currentPolicy)
    const after = evaluateCase(row, provisionalPolicy)
    visualCases.push({
      row,
      classification,
      before,
      after,
      imageDataUri,
      suspiciousPass: isSuspiciousPass(row, classification, provisionalPolicy, after),
    })
  }

  visualCases.sort((left, right) => {
    const bucketOrder = { core: 0, stress: 1, reject: 2 }
    return (
      bucketOrder[left.row.bucket] - bucketOrder[right.row.bucket] ||
      left.classification.localeCompare(right.classification) ||
      left.row.id.localeCompare(right.row.id, undefined, { numeric: true })
    )
  })

  const beforeSvg = buildContactSheet('Social Square Policy Preview — Before', visualCases, 'before')
  const afterSvg = buildContactSheet('Social Square Policy Preview — After', visualCases, 'after')

  const beforePath = path.join(REPORTS_ROOT, 'contact-sheet-before.svg')
  const afterPath = path.join(REPORTS_ROOT, 'contact-sheet-after.svg')
  const reportPath = path.join(REPORTS_ROOT, 'report-visual-preview.md')

  await writeFile(beforePath, beforeSvg, 'utf8')
  await writeFile(afterPath, afterSvg, 'utf8')
  await writeFile(
    reportPath,
    buildComparisonReport({
      beforePath,
      afterPath,
      visualCases,
    }),
    'utf8'
  )

  console.log('Generated social-square visual preview artifacts')
  console.log(`- ${beforePath}`)
  console.log(`- ${afterPath}`)
  console.log(`- ${reportPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
