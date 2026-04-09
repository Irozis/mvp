import type {
  FormatDefinition,
  LayoutAssessment,
  StructuralInvariantName,
  StructuralLayoutFinding,
  StructuralLayoutStatus,
} from './types'

type SeverityKey = NonNullable<StructuralLayoutFinding['severity']>
type StatusCounts = Record<StructuralLayoutStatus, number>
type ReasonCounts = Record<string, number>
type SeverityCounts = Record<SeverityKey, number>

type DiagnosticEntry = {
  format: FormatDefinition
  assessment: LayoutAssessment
}

type DiagnosticRollup = {
  valid: number
  degraded: number
  invalid: number
  total: number
  reasonCounts: ReasonCounts
  severityCounts: SeverityCounts
}

export type StructuralDiagnosticsSnapshot = {
  overall: DiagnosticRollup
  byCategory: Array<{
    formatCategory: FormatDefinition['category']
    valid: number
    degraded: number
    invalid: number
    total: number
    topFailureReasons: string
    failureCounts: string
    severitySummary: string
  }>
  byFormatKey: Array<{
    formatKey: FormatDefinition['key']
    formatCategory: FormatDefinition['category']
    formatFamily: FormatDefinition['family']
    valid: number
    degraded: number
    invalid: number
    total: number
    topFailureReasons: string
    failureCounts: string
    severitySummary: string
  }>
  overallRow: {
    valid: number
    degraded: number
    invalid: number
    total: number
    topFailureReasons: string
    failureCounts: string
    severitySummary: string
  }
}

function createStatusCounts(): StatusCounts {
  return { valid: 0, degraded: 0, invalid: 0 }
}

function createSeverityCounts(): SeverityCounts {
  return { low: 0, medium: 0, high: 0 }
}

function createRollup(): DiagnosticRollup {
  return {
    ...createStatusCounts(),
    total: 0,
    reasonCounts: {},
    severityCounts: createSeverityCounts(),
  }
}

function incrementReasonCounts(target: ReasonCounts, findingName: StructuralInvariantName) {
  target[findingName] = (target[findingName] || 0) + 1
}

function sortReasonCounts(reasonCounts: ReasonCounts) {
  return Object.entries(reasonCounts).sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1]
    return left[0].localeCompare(right[0])
  })
}

function formatReasonList(reasonCounts: ReasonCounts, limit = 3) {
  const sorted = sortReasonCounts(reasonCounts).slice(0, limit)
  return sorted.length ? sorted.map(([name, count]) => `${name}:${count}`).join(', ') : 'none'
}

function formatSeveritySummary(severityCounts: SeverityCounts) {
  const values = [
    `high:${severityCounts.high}`,
    `medium:${severityCounts.medium}`,
    `low:${severityCounts.low}`,
  ]
  return values.join(', ')
}

function addAssessmentToRollup(rollup: DiagnosticRollup, assessment: LayoutAssessment) {
  const status = assessment.structuralState?.status || 'invalid'
  rollup[status] += 1
  rollup.total += 1

  for (const finding of assessment.structuralState?.findings || []) {
    incrementReasonCounts(rollup.reasonCounts, finding.name)
    rollup.severityCounts[finding.severity] += 1
  }
}

function normalizeRollupRow<T extends Record<string, unknown>>(base: T, rollup: DiagnosticRollup) {
  return {
    ...base,
    valid: rollup.valid,
    degraded: rollup.degraded,
    invalid: rollup.invalid,
    total: rollup.total,
    topFailureReasons: formatReasonList(rollup.reasonCounts, 3),
    failureCounts: formatReasonList(rollup.reasonCounts, 7),
    severitySummary: formatSeveritySummary(rollup.severityCounts),
  }
}

export function buildStructuralDiagnosticsSnapshot(entries: DiagnosticEntry[]): StructuralDiagnosticsSnapshot {
  const overall = createRollup()
  const categoryMap = new Map<FormatDefinition['category'], DiagnosticRollup>()
  const keyMap = new Map<FormatDefinition['key'], DiagnosticRollup>()

  for (const entry of entries) {
    addAssessmentToRollup(overall, entry.assessment)

    const categoryRollup = categoryMap.get(entry.format.category) || createRollup()
    addAssessmentToRollup(categoryRollup, entry.assessment)
    categoryMap.set(entry.format.category, categoryRollup)

    const keyRollup = keyMap.get(entry.format.key) || createRollup()
    addAssessmentToRollup(keyRollup, entry.assessment)
    keyMap.set(entry.format.key, keyRollup)
  }

  const byCategory = [...categoryMap.entries()]
    .map(([formatCategory, rollup]) => normalizeRollupRow({ formatCategory }, rollup))
    .sort((left, right) => {
      if (right.invalid !== left.invalid) return right.invalid - left.invalid
      if (right.degraded !== left.degraded) return right.degraded - left.degraded
      return String(left.formatCategory).localeCompare(String(right.formatCategory))
    })

  const byFormatKey = entries
    .map((entry) => {
      const rollup = keyMap.get(entry.format.key) || createRollup()
      return normalizeRollupRow(
        {
          formatKey: entry.format.key,
          formatCategory: entry.format.category,
          formatFamily: entry.format.family,
        },
        rollup
      )
    })
    .sort((left, right) => {
      if (right.invalid !== left.invalid) return right.invalid - left.invalid
      if (right.degraded !== left.degraded) return right.degraded - left.degraded
      const leftFindingWeight = left.failureCounts === 'none' ? 0 : left.failureCounts.split(',').length
      const rightFindingWeight = right.failureCounts === 'none' ? 0 : right.failureCounts.split(',').length
      if (rightFindingWeight !== leftFindingWeight) return rightFindingWeight - leftFindingWeight
      return String(left.formatKey).localeCompare(String(right.formatKey))
    })

  return {
    overall,
    byCategory,
    byFormatKey,
    overallRow: normalizeRollupRow({}, overall),
  }
}

export function createStructuralDiagnosticsSignature(snapshot: StructuralDiagnosticsSnapshot) {
  return JSON.stringify(snapshot)
}

export function logStructuralDiagnostics(snapshot: StructuralDiagnosticsSnapshot) {
  if (!import.meta.env.DEV) return
  console.groupCollapsed('[layout] structural diagnostics')
  console.log('overall')
  console.table([snapshot.overallRow])
  console.log('by format.category')
  console.table(snapshot.byCategory)
  console.log('by format.key')
  console.table(snapshot.byFormatKey)
  console.groupEnd()
}
