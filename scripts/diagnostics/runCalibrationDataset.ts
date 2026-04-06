import path from 'node:path'

import { runCalibrationDataset } from '../../src/lib/calibrationRunner'
import type { CalibrationCaseFormat, CalibrationDatasetFilter } from '../../src/lib/calibrationCaseSchema'

type CliOptions = {
  root: string
  strict: boolean
  family?: string
  format?: CalibrationCaseFormat
  caseId?: string
  limit?: number
  writePreviews: boolean
  failOnExecutionError: boolean
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`Expected boolean value "true" or "false", received "${value}".`)
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: path.resolve(process.cwd(), 'calibration-cases'),
    strict: false,
    writePreviews: false,
    failOnExecutionError: false,
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
      case '--limit':
        options.limit = Number(argv[++index] || 0)
        break
      case '--case':
        options.caseId = argv[++index]
        break
      case '--write-previews':
        options.writePreviews = parseBoolean(argv[++index], false)
        break
      case '--fail-on-execution-error':
        options.failOnExecutionError = true
        break
      default:
        throw new Error(`Unknown argument "${arg}".`)
    }
  }

  return options
}

function printSummary(result: Awaited<ReturnType<typeof runCalibrationDataset>>) {
  const summary = result.report.summary
  console.log('# Calibration dataset run')
  console.log(`root=${result.report.root}`)
  console.log(`report=${result.reportPath}`)
  console.log(
    `cases found=${summary.totalCasesFound}, valid=${summary.validCases}, invalid=${summary.invalidCases}, executed=${summary.executedCases}`
  )
  console.log(
    `success=${summary.successCount}, parse-errors=${summary.parseErrorCount}, execution-errors=${summary.executionErrorCount}, skipped=${summary.skippedCount}`
  )
  console.log(
    `baseline wins=${summary.baselineWinCount}, candidate wins=${summary.candidateWinCount}, avg winner gain=${summary.averageWinnerGain}`
  )
  console.log('per-format counts:')
  console.table(summary.perFormatCounts)
  console.log('per-family counts:')
  console.table(summary.perFamilyCounts)
  if (summary.failedCases.length) {
    console.log('failed cases:')
    console.table(summary.failedCases)
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

  const result = await runCalibrationDataset({
    root: options.root,
    mode: options.strict ? 'strict' : 'lenient',
    filter,
    writePreviews: options.writePreviews,
    failOnExecutionError: options.failOnExecutionError,
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
