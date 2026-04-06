import type {
  CalibrationCaseFormat,
  CalibrationCaseRunResult,
  CalibrationCaseVerdict,
  CalibrationDatasetReport,
} from './calibrationCaseSchema'

export type CalibrationReviewPriority = 'urgent-review' | 'high-review' | 'medium-review' | 'low-review'

export type CalibrationReviewConfig = {
  reviewQueueSize: number
  includeMarkdownReviewReport: boolean
  concernDeltaThreshold: number
  confidenceDropThreshold: number
}

export type CalibrationReviewConfigOverride = Partial<CalibrationReviewConfig>

export type CalibrationAgreementFields = {
  humanVerdictPresent: boolean
  fixedVsBaseline?: CalibrationCaseVerdict['fixedVsBaseline']
  humanAcceptedWinner?: boolean
  machineHumanAgreement: boolean | null
  agreementType: string | null
}

export type CalibrationReviewQueueItem = {
  caseId: string
  category?: string
  format?: CalibrationCaseFormat
  family?: string
  inputPath?: string
  reportPath?: string
  telemetryPath?: string
  calibrationPath?: string
  baselineAggregate?: number
  winnerAggregate?: number
  delta?: number
  reviewPriority: CalibrationReviewPriority
  whyReview: string
}

export type CalibrationReviewAggregateSlice = {
  key: string
  count: number
  successCount: number
  averageDelta: number
  baselineWinRate: number
  candidateWinRate: number
  urgentReviewCount: number
  highReviewCount: number
}

export type CalibrationReviewReport = {
  generatedAt: string
  root: string
  reviewConfig: CalibrationReviewConfig
  totals: {
    totalCasesProcessed: number
    successCount: number
    parseErrorCount: number
    executionErrorCount: number
    skippedCount: number
    baselineWinCount: number
    candidateWinCount: number
    negativeDeltaCaseCount: number
    materialConfidenceDropCount: number
    reviewPriorityCounts: Record<CalibrationReviewPriority, number>
  }
  topRejectionReasons: Array<{ reason: string; count: number }>
  candidateKindWinDistribution: Array<{ candidateKind: string; count: number }>
  averageScoreDeltaByCategory: CalibrationReviewAggregateSlice[]
  averageScoreDeltaByFormat: CalibrationReviewAggregateSlice[]
  averageScoreDeltaByFamily: CalibrationReviewAggregateSlice[]
  worstPerformingCases: Array<{
    caseId: string
    category?: string
    format?: CalibrationCaseFormat
    family?: string
    delta?: number
    reviewPriority?: CalibrationReviewPriority
    shortSummary?: string
  }>
  mostAmbiguousCases: Array<{
    caseId: string
    category?: string
    delta?: number
    confidenceDelta?: number
    baselineWon?: boolean
    reviewPriority?: CalibrationReviewPriority
    whyReview?: string
  }>
  casesToReviewFirst: CalibrationReviewQueueItem[]
  topCategoriesNeedingReview: Array<{ category: string; count: number }>
}

export const DEFAULT_CALIBRATION_REVIEW_CONFIG: CalibrationReviewConfig = {
  reviewQueueSize: 10,
  includeMarkdownReviewReport: false,
  concernDeltaThreshold: 1,
  confidenceDropThreshold: 6,
}

const SEVERE_SIGNALS = new Set([
  'structural-drift',
  'inactive-empty-space',
  'insufficient-breathing-room',
  'weak-image-footprint',
  'family-mismatch',
])

function round(value: number) {
  return Math.round(value * 100) / 100
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function asSortedEntries(record: Record<string, number>, limit = 10) {
  return Object.entries(record)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
}

function normalizeKey(value?: string) {
  return value && value.trim() ? value.trim() : 'uncategorized'
}

function buildConcernReason(reason: string) {
  switch (reason) {
    case 'negative-delta':
      return 'Negative delta after repair winner selection'
    case 'baseline-retained':
      return 'Baseline retained despite available repair candidates'
    case 'confidence-drop':
      return 'Winner confidence dropped materially'
    case 'spacing-threshold-exceeded':
      return 'Multiple candidates rejected for spacing regression'
    case 'confidence-collapse':
      return 'Multiple candidates rejected for confidence collapse'
    case 'role-placement-out-of-zone':
      return 'Candidates exited required format zones'
    case 'aggregate-below-baseline':
      return 'Candidate scores failed to beat the baseline'
    default:
      return `Repeated repair pressure: ${reason}`
  }
}

function computeAmbiguityScore(
  result: CalibrationCaseRunResult,
  config: CalibrationReviewConfig
) {
  if (result.status !== 'success') return 0
  let score = 0
  const delta = Math.abs(result.aggregateDelta || 0)
  if (delta <= config.concernDeltaThreshold) score += 35
  if (result.baselineWon) score += 15
  if ((result.rejectedCandidateCount || 0) > 1) score += 12
  if (Math.abs(result.winnerConfidenceDelta || 0) <= 2) score += 10
  if ((result.candidateCount || 0) > 0 && (result.rejectedCandidateCount || 0) >= Math.max(1, (result.candidateCount || 0) - 1)) {
    score += 18
  }
  return score
}

export function resolveCalibrationReviewConfig(
  override?: CalibrationReviewConfigOverride
): CalibrationReviewConfig {
  return {
    reviewQueueSize:
      override?.reviewQueueSize && override.reviewQueueSize > 0
        ? Math.floor(override.reviewQueueSize)
        : DEFAULT_CALIBRATION_REVIEW_CONFIG.reviewQueueSize,
    includeMarkdownReviewReport:
      override?.includeMarkdownReviewReport ?? DEFAULT_CALIBRATION_REVIEW_CONFIG.includeMarkdownReviewReport,
    concernDeltaThreshold:
      override?.concernDeltaThreshold ?? DEFAULT_CALIBRATION_REVIEW_CONFIG.concernDeltaThreshold,
    confidenceDropThreshold:
      override?.confidenceDropThreshold ?? DEFAULT_CALIBRATION_REVIEW_CONFIG.confidenceDropThreshold,
  }
}

export function computeAgreementFields(input: {
  baselineWon?: boolean
  verdict?: CalibrationCaseVerdict
}): CalibrationAgreementFields {
  if (!input.verdict) {
    return {
      humanVerdictPresent: false,
      machineHumanAgreement: null,
      agreementType: null,
    }
  }

  const machineSelectedWinner = !input.baselineWon
  const humanSelectedWinner =
    input.verdict.fixedVsBaseline === 'better'
      ? true
      : input.verdict.fixedVsBaseline === 'worse'
        ? false
        : input.verdict.humanAcceptedWinner
  const machineHumanAgreement = machineSelectedWinner === humanSelectedWinner
  let agreementType: string
  if (machineHumanAgreement) {
    agreementType = machineSelectedWinner ? 'machine-and-human-picked-winner' : 'machine-and-human-picked-baseline'
  } else if (machineSelectedWinner) {
    agreementType =
      input.verdict.fixedVsBaseline === 'same'
        ? 'machine-picked-winner-human-marked-same'
        : 'machine-picked-winner-human-preferred-baseline'
  } else {
    agreementType =
      input.verdict.fixedVsBaseline === 'same'
        ? 'machine-retained-baseline-human-marked-same'
        : 'machine-retained-baseline-human-preferred-winner'
  }

  return {
    humanVerdictPresent: true,
    fixedVsBaseline: input.verdict.fixedVsBaseline,
    humanAcceptedWinner: input.verdict.humanAcceptedWinner,
    machineHumanAgreement,
    agreementType,
  }
}

export function computeReviewPriority(
  result: CalibrationCaseRunResult,
  config: CalibrationReviewConfig
): {
  reviewPriority: CalibrationReviewPriority
  reviewScore: number
  whyReview: string
  reasons: string[]
} {
  const reasons: string[] = []
  let score = 0

  if (result.status === 'parse-error') {
    return {
      reviewPriority: 'urgent-review',
      reviewScore: 120,
      whyReview: 'Case parsing failed before calibration execution',
      reasons: ['parse-error'],
    }
  }
  if (result.status === 'execution-error') {
    return {
      reviewPriority: 'urgent-review',
      reviewScore: 110,
      whyReview: 'Execution failed during calibration batch run',
      reasons: ['execution-error'],
    }
  }
  if (result.status === 'skipped') {
    return {
      reviewPriority: 'high-review',
      reviewScore: 80,
      whyReview: 'Case was skipped before execution',
      reasons: ['skipped'],
    }
  }

  if ((result.aggregateDelta || 0) < 0) {
    score += 100
    reasons.push('negative-delta')
  }
  if (result.baselineWon) {
    score += 30
    reasons.push('baseline-retained')
  }
  if ((result.winnerConfidenceDelta || 0) <= -config.confidenceDropThreshold) {
    score += 50
    reasons.push('confidence-drop')
  }
  if (Math.abs(result.aggregateDelta || 0) <= config.concernDeltaThreshold) {
    score += 18
    reasons.push('near-zero-delta')
  }
  if ((result.rejectedCandidateCount || 0) >= 3) {
    score += 18
    const topReason = result.topRejectionReasons?.[0]
    if (topReason) reasons.push(topReason)
  }
  if ((result.candidateCount || 0) > 0 && (result.rejectedCandidateCount || 0) >= Math.max(1, (result.candidateCount || 0) - 1)) {
    score += 12
    reasons.push('candidate-disagreement')
  }
  for (const signal of [...(result.dominantTags || []), ...(result.dominantPenalties || [])]) {
    if (!SEVERE_SIGNALS.has(signal)) continue
    score += 10
    reasons.push(signal)
  }
  if (['cta', 'balance', 'spacing', 'structure', 'text_priority'].includes(normalizeKey(result.category)) && result.baselineWon) {
    score += 10
  }

  const reviewPriority: CalibrationReviewPriority =
    score >= 90 ? 'urgent-review' : score >= 55 ? 'high-review' : score >= 25 ? 'medium-review' : 'low-review'
  const whyReview = buildConcernReason(reasons[0] || 'baseline-retained')
  return {
    reviewPriority,
    reviewScore: score,
    whyReview,
    reasons,
  }
}

export function summarizeCaseForReview(
  result: CalibrationCaseRunResult,
  config: CalibrationReviewConfig
) {
  if (result.status === 'parse-error') {
    return 'Case parsing failed; fix notes or required input files before review.'
  }
  if (result.status === 'execution-error') {
    return 'Execution failed during calibration run; inspect the captured error before tuning.'
  }
  if (result.status === 'skipped') {
    return 'Case was skipped because strict parsing aborted execution before the batch could run.'
  }
  if ((result.aggregateDelta || 0) < 0) {
    return 'Winner selected with a negative aggregate delta; inspect rejection gates and objective balance first.'
  }
  if (result.baselineWon) {
    const reason = result.topRejectionReasons?.[0]
    return reason
      ? `Baseline retained; candidates were blocked by ${reason} or failed to deliver a safe net gain.`
      : 'Baseline retained; no repair candidate produced a safe net gain.'
  }
  if ((result.winnerConfidenceDelta || 0) <= -config.confidenceDropThreshold) {
    return 'Winner improved aggregate score, but confidence dropped materially and needs human review.'
  }
  if ((result.aggregateDelta || 0) <= config.concernDeltaThreshold) {
    return 'Winner improved only marginally; review whether the selected repair meaningfully helps the case.'
  }
  if (result.dominantTags.length) {
    return `Winner improved aggregate score while the dominant signal remains ${result.dominantTags[0]}.`
  }
  return 'Winner improved aggregate score with no major review concerns.'
}

export function buildReviewQueue(
  results: CalibrationCaseRunResult[],
  config: CalibrationReviewConfig
): CalibrationReviewQueueItem[] {
  return results
    .filter((result) => result.status !== 'success' || result.reviewPriority !== 'low-review')
    .sort((left, right) => {
      const scoreDelta = (right.reviewScore || 0) - (left.reviewScore || 0)
      if (scoreDelta !== 0) return scoreDelta
      const aggregateDelta = (left.aggregateDelta || 0) - (right.aggregateDelta || 0)
      if (aggregateDelta !== 0) return aggregateDelta
      return left.caseId.localeCompare(right.caseId)
    })
    .slice(0, config.reviewQueueSize)
    .map((result) => ({
      caseId: result.caseId,
      category: result.category,
      format: result.format,
      family: result.family,
      inputPath: result.artifactPaths.input ? `${result.caseDir}/${result.artifactPaths.input}`.replace(/\\/g, '/') : undefined,
      reportPath: result.artifactPaths.report ? `${result.caseDir}/${result.artifactPaths.report}`.replace(/\\/g, '/') : undefined,
      telemetryPath: result.artifactPaths.telemetry
        ? `${result.caseDir}/${result.artifactPaths.telemetry}`.replace(/\\/g, '/')
        : undefined,
      calibrationPath: result.artifactPaths.calibration
        ? `${result.caseDir}/${result.artifactPaths.calibration}`.replace(/\\/g, '/')
        : undefined,
      baselineAggregate: result.baselineAggregate,
      winnerAggregate: result.winnerAggregate,
      delta: result.aggregateDelta,
      reviewPriority: result.reviewPriority || 'low-review',
      whyReview: result.whyReview || 'Manual review recommended.',
    }))
}

function buildSliceStats(
  results: CalibrationCaseRunResult[],
  resolveKey: (result: CalibrationCaseRunResult) => string | undefined
): CalibrationReviewAggregateSlice[] {
  const buckets = new Map<string, CalibrationCaseRunResult[]>()
  for (const result of results) {
    const key = normalizeKey(resolveKey(result))
    const current = buckets.get(key) || []
    current.push(result)
    buckets.set(key, current)
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const successCases = bucket.filter((result) => result.status === 'success')
      const deltas = successCases.map((result) => result.aggregateDelta || 0)
      const baselineWins = successCases.filter((result) => result.baselineWon).length
      const candidateWins = successCases.filter((result) => result.baselineWon === false).length
      return {
        key,
        count: bucket.length,
        successCount: successCases.length,
        averageDelta: round(deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : 0),
        baselineWinRate: round(successCases.length ? baselineWins / successCases.length : 0),
        candidateWinRate: round(successCases.length ? candidateWins / successCases.length : 0),
        urgentReviewCount: bucket.filter((result) => result.reviewPriority === 'urgent-review').length,
        highReviewCount: bucket.filter((result) => result.reviewPriority === 'high-review').length,
      }
    })
    .sort((left, right) => right.urgentReviewCount - left.urgentReviewCount || left.key.localeCompare(right.key))
}

export function buildCalibrationReviewReport(input: {
  datasetReport: CalibrationDatasetReport
  config: CalibrationReviewConfig
}): CalibrationReviewReport {
  const results = input.datasetReport.cases
  const reviewPriorityCounts: Record<CalibrationReviewPriority, number> = {
    'urgent-review': 0,
    'high-review': 0,
    'medium-review': 0,
    'low-review': 0,
  }
  const rejectionReasons: Record<string, number> = {}
  const categoryReviewCounts: Record<string, number> = {}

  for (const result of results) {
    increment(reviewPriorityCounts, result.reviewPriority || 'low-review')
    for (const reason of result.topRejectionReasons || []) increment(rejectionReasons, reason)
    if (result.reviewPriority === 'urgent-review' || result.reviewPriority === 'high-review') {
      increment(categoryReviewCounts, normalizeKey(result.category))
    }
  }

  const negativeDeltaCaseCount = results.filter((result) => (result.aggregateDelta || 0) < 0).length
  const materialConfidenceDropCount = results.filter(
    (result) => (result.winnerConfidenceDelta || 0) <= -input.config.confidenceDropThreshold
  ).length
  const queue = buildReviewQueue(results, input.config)

  return {
    generatedAt: new Date().toISOString(),
    root: input.datasetReport.root,
    reviewConfig: input.config,
    totals: {
      totalCasesProcessed: results.length,
      successCount: results.filter((result) => result.status === 'success').length,
      parseErrorCount: results.filter((result) => result.status === 'parse-error').length,
      executionErrorCount: results.filter((result) => result.status === 'execution-error').length,
      skippedCount: results.filter((result) => result.status === 'skipped').length,
      baselineWinCount: results.filter((result) => result.baselineWon).length,
      candidateWinCount: results.filter((result) => result.baselineWon === false).length,
      negativeDeltaCaseCount,
      materialConfidenceDropCount,
      reviewPriorityCounts,
    },
    topRejectionReasons: asSortedEntries(rejectionReasons).map(([reason, count]) => ({ reason, count })),
    candidateKindWinDistribution: input.datasetReport.summary.candidateKindWinDistribution,
    averageScoreDeltaByCategory: buildSliceStats(results, (result) => result.category),
    averageScoreDeltaByFormat: buildSliceStats(results, (result) => result.format),
    averageScoreDeltaByFamily: buildSliceStats(results, (result) => result.family),
    worstPerformingCases: results
      .filter((result) => result.status === 'success')
      .sort((left, right) => (left.aggregateDelta || 0) - (right.aggregateDelta || 0) || left.caseId.localeCompare(right.caseId))
      .slice(0, 10)
      .map((result) => ({
        caseId: result.caseId,
        category: result.category,
        format: result.format,
        family: result.family,
        delta: result.aggregateDelta,
        reviewPriority: result.reviewPriority,
        shortSummary: result.shortSummary,
      })),
    mostAmbiguousCases: results
      .filter((result) => result.status === 'success')
      .sort(
        (left, right) =>
          computeAmbiguityScore(right, input.config) - computeAmbiguityScore(left, input.config) ||
          left.caseId.localeCompare(right.caseId)
      )
      .slice(0, 10)
      .map((result) => ({
        caseId: result.caseId,
        category: result.category,
        delta: result.aggregateDelta,
        confidenceDelta: result.winnerConfidenceDelta,
        baselineWon: result.baselineWon,
        reviewPriority: result.reviewPriority,
        whyReview: result.whyReview,
      })),
    casesToReviewFirst: queue,
    topCategoriesNeedingReview: asSortedEntries(categoryReviewCounts).map(([category, count]) => ({
      category,
      count,
    })),
  }
}

export function renderCalibrationReviewMarkdown(report: CalibrationReviewReport) {
  const lines: string[] = []
  lines.push('# Calibration Review')
  lines.push('')
  lines.push(`- Root: \`${report.root}\``)
  lines.push(`- Cases processed: ${report.totals.totalCasesProcessed}`)
  lines.push(`- Success: ${report.totals.successCount}`)
  lines.push(`- Baseline wins: ${report.totals.baselineWinCount}`)
  lines.push(`- Candidate wins: ${report.totals.candidateWinCount}`)
  lines.push(`- Negative deltas: ${report.totals.negativeDeltaCaseCount}`)
  lines.push(`- Material confidence drops: ${report.totals.materialConfidenceDropCount}`)
  lines.push('')
  lines.push('## Top Categories Needing Review')
  for (const category of report.topCategoriesNeedingReview.slice(0, 5)) {
    lines.push(`- ${category.category}: ${category.count}`)
  }
  lines.push('')
  lines.push('## Review Queue')
  for (const item of report.casesToReviewFirst) {
    lines.push(`- ${item.caseId} [${item.reviewPriority}] ${item.whyReview}`)
  }
  lines.push('')
  lines.push('## Worst Performing Cases')
  for (const item of report.worstPerformingCases.slice(0, 5)) {
    lines.push(`- ${item.caseId}: delta=${item.delta ?? 0}, ${item.shortSummary || 'No summary.'}`)
  }
  return `${lines.join('\n')}\n`
}
