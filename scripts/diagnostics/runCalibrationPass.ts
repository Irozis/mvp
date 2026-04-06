import path from 'node:path'

import { runCalibrationPass } from '../../src/lib/calibrationPass'
import type { CalibrationCaseFormat, CalibrationDatasetFilter } from '../../src/lib/calibrationCaseSchema'

type CliOptions = {
  root: string
  strict: boolean
  family?: string
  format?: CalibrationCaseFormat
  caseId?: string
  limit?: number
  failOnExecutionError: boolean
  reviewQueueSize?: number
  includeMarkdownReviewReport: boolean
  concernDeltaThreshold?: number
  confidenceDropThreshold?: number
  enableLandscapeTextHeightNearMissOverride: boolean
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`Expected boolean value "true" or "false", received "${value}".`)
}

function parseNumber(value: string | undefined, flag: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric value for ${flag}, received "${value}".`)
  }
  return parsed
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: path.resolve(process.cwd(), 'calibration-cases'),
    strict: false,
    failOnExecutionError: false,
    includeMarkdownReviewReport: false,
    enableLandscapeTextHeightNearMissOverride: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--root':
        options.root = path.resolve(process.cwd(), argv[++index] || '')
        break
      case '--strict':
        options.strict = true
        break
      case '--family':
        options.family = argv[++index]
        break
      case '--format': {
        const format = argv[++index]
        if (format !== 'square' && format !== 'landscape' && format !== 'portrait') {
          throw new Error(`Unsupported format filter "${format}". Use square, landscape, or portrait.`)
        }
        options.format = format
        break
      }
      case '--case':
        options.caseId = argv[++index]
        break
      case '--limit':
        options.limit = parseNumber(argv[++index], '--limit')
        break
      case '--fail-on-execution-error':
        options.failOnExecutionError = true
        break
      case '--review-queue-size':
        options.reviewQueueSize = parseNumber(argv[++index], '--review-queue-size')
        break
      case '--include-markdown-review':
        options.includeMarkdownReviewReport = parseBoolean(argv[++index], false)
        break
      case '--concern-delta-threshold':
        options.concernDeltaThreshold = parseNumber(argv[++index], '--concern-delta-threshold')
        break
      case '--confidence-drop-threshold':
        options.confidenceDropThreshold = parseNumber(argv[++index], '--confidence-drop-threshold')
        break
      case '--enable-landscape-text-height-near-miss-override':
        options.enableLandscapeTextHeightNearMissOverride = true
        break
      default:
        throw new Error(`Unknown argument "${arg}".`)
    }
  }

  return options
}

function printSummary(result: Awaited<ReturnType<typeof runCalibrationPass>>) {
  const datasetSummary = result.report.summary
  const reviewReport = result.reviewReport
  const totalWins = datasetSummary.baselineWinCount + datasetSummary.candidateWinCount
  const baselineWinRate = totalWins ? Math.round((datasetSummary.baselineWinCount / totalWins) * 100) : 0
  const candidateWinRate = totalWins ? Math.round((datasetSummary.candidateWinCount / totalWins) * 100) : 0

  console.log('# Calibration pass')
  console.log(`root=${result.sourceRoot}`)
  console.log(`effective-root=${result.effectiveRoot}`)
  console.log(`dataset-report=${result.reportPath}`)
  console.log(`review-report=${result.reviewReportPath}`)
  console.log(`review-queue=${result.reviewQueuePath}`)
  if (result.reviewMarkdownPath) {
    console.log(`review-markdown=${result.reviewMarkdownPath}`)
  }
  console.log(
    `cases=${datasetSummary.totalCasesFound}, success=${datasetSummary.successCount}, parse-errors=${datasetSummary.parseErrorCount}, execution-errors=${datasetSummary.executionErrorCount}, skipped=${datasetSummary.skippedCount}`
  )
  if (result.stagedDataset.prepared) {
    console.log(`staged legacy flat cases into ${result.effectiveRoot} (${result.stagedDataset.stagedCaseCount} cases)`)
  }
  console.log(
    `baseline wins=${datasetSummary.baselineWinCount} (${baselineWinRate}%), candidate wins=${datasetSummary.candidateWinCount} (${candidateWinRate}%), avg delta=${datasetSummary.averageWinnerGain}`
  )
  console.log(
    `review buckets urgent/high/medium/low=${reviewReport.totals.reviewPriorityCounts['urgent-review']}/${reviewReport.totals.reviewPriorityCounts['high-review']}/${reviewReport.totals.reviewPriorityCounts['medium-review']}/${reviewReport.totals.reviewPriorityCounts['low-review']}`
  )

  if (reviewReport.topCategoriesNeedingReview.length) {
    console.log('top categories needing review:')
    console.table(reviewReport.topCategoriesNeedingReview.slice(0, 5))
  }

  if (reviewReport.casesToReviewFirst.length) {
    console.log('review queue:')
    console.table(
      reviewReport.casesToReviewFirst.map((item) => ({
        caseId: item.caseId,
        category: item.category,
        format: item.format,
        priority: item.reviewPriority,
        delta: item.delta,
        whyReview: item.whyReview,
      }))
    )
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const filter: CalibrationDatasetFilter = {
    family: options.family,
    format: options.format,
    caseId: options.caseId,
    limit: options.limit,
  }

  const result = await runCalibrationPass({
    root: options.root,
    mode: options.strict ? 'strict' : 'lenient',
    filter,
    failOnExecutionError: options.failOnExecutionError,
    reviewConfig: {
      reviewQueueSize: options.reviewQueueSize,
      includeMarkdownReviewReport: options.includeMarkdownReviewReport,
      concernDeltaThreshold: options.concernDeltaThreshold,
      confidenceDropThreshold: options.confidenceDropThreshold,
    },
    repairConfig: {
      enableLandscapeTextHeightNearMissOverride: options.enableLandscapeTextHeightNearMissOverride,
    },
  })

  printSummary(result)

  if (result.shouldFail) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
