import type {
  CalibrationCaseFormat,
  CalibrationCaseRunResult,
  CalibrationDatasetFilter,
  CalibrationDatasetReport,
  CalibrationDatasetSummary,
  CalibrationParseError,
} from './calibrationCaseSchema'

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function topEntries(record: Record<string, number>, limit = 10) {
  return Object.entries(record)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
}

export function buildCalibrationDatasetSummary(input: {
  totalCasesFound: number
  runResults: CalibrationCaseRunResult[]
  parseErrors: CalibrationParseError[]
}): CalibrationDatasetSummary {
  const parseErrorCaseIds = new Set(input.parseErrors.map((error) => `${error.caseDir}::${error.caseId}`))
  const perFormatCounts: Record<CalibrationCaseFormat, number> = {
    square: 0,
    landscape: 0,
    portrait: 0,
  }
  const perCategoryCounts: Record<string, number> = {}
  const perFamilyCounts: Record<string, number> = {}
  const rejectionReasonCounts: Record<string, number> = {}
  const dominantTagCounts: Record<string, number> = {}
  const candidateKindWins: Record<string, number> = {}
  const deltas: number[] = []

  let successCount = 0
  let executionErrorCount = 0
  let skippedCount = 0
  let baselineWinCount = 0
  let candidateWinCount = 0

  for (const result of input.runResults) {
    if (result.format) perFormatCounts[result.format] += 1
    if (result.category) increment(perCategoryCounts, result.category)
    if (result.family) increment(perFamilyCounts, result.family)
    for (const tag of result.dominantTags) increment(dominantTagCounts, tag)
    for (const penalty of result.dominantPenalties) increment(rejectionReasonCounts, penalty)

    if (result.status === 'success') {
      successCount += 1
      const delta = result.aggregateDelta || 0
      deltas.push(delta)
      if (result.baselineWon) baselineWinCount += 1
      else candidateWinCount += 1
      if (result.winnerCandidateKind) increment(candidateKindWins, result.winnerCandidateKind)
    } else if (result.status === 'execution-error') {
      executionErrorCount += 1
    } else if (result.status === 'skipped') {
      skippedCount += 1
    }

    for (const error of result.parseErrors || []) {
      increment(rejectionReasonCounts, error.code)
    }
    if (result.executionError) {
      increment(rejectionReasonCounts, result.executionError.name || 'execution-error')
    }
  }

  const totalDelta = deltas.reduce((sum, value) => sum + value, 0)
  const averageWinnerGain = deltas.length ? totalDelta / deltas.length : 0
  const failedCases = [
    ...input.parseErrors.map((error) => ({
      caseId: error.caseId,
      status: 'parse-error' as const,
      reason: error.message,
    })),
    ...input.runResults
      .filter((result) => result.status === 'execution-error' || result.status === 'skipped')
      .map((result) => ({
        caseId: result.caseId,
        status: result.status,
        reason:
          result.executionError?.message ||
          result.parseErrors?.map((error) => error.message).join('; ') ||
          'Execution skipped.',
      })),
  ]

  return {
    totalCasesFound: input.totalCasesFound,
    validCases: input.runResults.filter((result) => result.status !== 'parse-error').length,
    invalidCases: parseErrorCaseIds.size,
    executedCases: successCount + executionErrorCount,
    successCount,
    parseErrorCount: parseErrorCaseIds.size,
    executionErrorCount,
    skippedCount,
    baselineWinCount,
    candidateWinCount,
    perFormatCounts,
    perCategoryCounts,
    perFamilyCounts,
    aggregateDelta: {
      total: round(totalDelta),
      average: round(deltas.length ? totalDelta / deltas.length : 0),
      max: round(deltas.length ? Math.max(...deltas) : 0),
      min: round(deltas.length ? Math.min(...deltas) : 0),
    },
    averageWinnerGain: round(averageWinnerGain),
    topRejectionReasons: topEntries(rejectionReasonCounts).map(([reason, count]) => ({ reason, count })),
    topDominantTags: topEntries(dominantTagCounts).map(([tag, count]) => ({ tag, count })),
    candidateKindWinDistribution: topEntries(candidateKindWins).map(([candidateKind, count]) => ({
      candidateKind,
      count,
    })),
    failedCases,
  }
}

export function buildCalibrationDatasetReport(input: {
  root: string
  strictMode: boolean
  filter?: CalibrationDatasetFilter
  previewGeneration: {
    requested: boolean
    supported: boolean
    generated: boolean
    reason?: string
  }
  totalCasesFound: number
  runResults: CalibrationCaseRunResult[]
  parseErrors: CalibrationParseError[]
}): CalibrationDatasetReport {
  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    strictMode: input.strictMode,
    filters: {
      family: input.filter?.family,
      format: input.filter?.format,
      caseId: input.filter?.caseId,
      limit: input.filter?.limit,
    },
    previewGeneration: input.previewGeneration,
    summary: buildCalibrationDatasetSummary({
      totalCasesFound: input.totalCasesFound,
      runResults: input.runResults,
      parseErrors: input.parseErrors,
    }),
    cases: input.runResults,
    parseErrors: input.parseErrors,
  }
}
