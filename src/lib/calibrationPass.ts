import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  CalibrationCaseFormat,
  CalibrationDatasetFilter,
  CalibrationDatasetParseMode,
} from './calibrationCaseSchema'
import { parseCalibrationDataset, getCalibrationCasePathMetadata } from './calibrationDataset'
import type { RepairSearchConfigOverride } from './types'
import {
  runCalibrationDataset,
  type CalibrationRunnerOptions,
  type CalibrationRunnerResult,
} from './calibrationRunner'

type PreparedCalibrationDataset = {
  sourceRoot: string
  effectiveRoot: string
  prepared: boolean
  stagedCaseCount: number
}

export type CalibrationPassOptions = {
  root: string
  mode?: CalibrationDatasetParseMode
  filter?: CalibrationDatasetFilter
  failOnExecutionError?: boolean
  reviewConfig?: CalibrationRunnerOptions['reviewConfig']
  repairConfig?: RepairSearchConfigOverride
}

export type CalibrationPassResult = CalibrationRunnerResult & {
  sourceRoot: string
  effectiveRoot: string
  stagedDataset: {
    prepared: boolean
    stagedCaseCount: number
  }
}

const INPUT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])

function sanitizeCaseId(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'case'
}

function inferFamilyFromCategory(category?: string) {
  const normalized = (category || '').toLowerCase()
  if (normalized.includes('marketplace') || normalized.includes('product')) return 'marketplace'
  if (normalized.includes('social')) return 'social'
  return 'display'
}

function inferExpectedBehavior(family: string) {
  if (family === 'marketplace') {
    return ['preserve-layout-structure', 'keep-text-image-balance']
  }
  return ['preserve-layout-structure']
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function walkFiles(root: string) {
  const files: string[] = []
  const queue = [root]

  while (queue.length) {
    const current = queue.shift()!
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        queue.push(nextPath)
      } else if (entry.isFile()) {
        files.push(nextPath)
      }
    }
  }

  return files
}

async function prepareFlatCalibrationDataset(root: string): Promise<PreparedCalibrationDataset> {
  const parsed = await parseCalibrationDataset({ root, mode: 'lenient' })
  if (parsed.totalCasesFound > 0 || parsed.cases.length > 0 || parsed.parseErrors.length > 0) {
    return {
      sourceRoot: root,
      effectiveRoot: root,
      prepared: false,
      stagedCaseCount: 0,
    }
  }

  const files = await walkFiles(root)
  const imageFiles = files.filter((filePath) => INPUT_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
  const stagingRoot = path.join(root, '_cases')
  let stagedCaseCount = 0

  for (const filePath of imageFiles) {
    const relativeFile = path.relative(root, filePath)
    if (relativeFile.startsWith(`_cases${path.sep}`) || relativeFile.startsWith('_')) continue
    const metadata = getCalibrationCasePathMetadata(path.dirname(relativeFile))
    if (!metadata.folderFormat) continue

    const format = metadata.folderFormat
    const category = metadata.folderCategory || 'uncategorized'
    const family = inferFamilyFromCategory(category)
    const extension = path.extname(filePath).toLowerCase().replace('.', '')
    const baseName = path.basename(filePath, path.extname(filePath))
    const caseId = sanitizeCaseId(baseName)
    const categorySegments = category === 'uncategorized' ? ['uncategorized'] : category.split('/')
    const caseDir = path.join(stagingRoot, ...categorySegments, format, caseId)

    await mkdir(caseDir, { recursive: true })
    await copyFile(filePath, path.join(caseDir, `input.${extension}`))

    const notesPath = path.join(caseDir, 'notes.json')
    const notes = {
      id: caseId,
      family,
      format,
      source: 'legacy-flat-import',
      category,
      expectedProblems: [category],
      expectedBehavior: inferExpectedBehavior(family),
      tags: [category, format, family],
      comment: `Auto-generated from ${relativeFile.replace(/\\/g, '/')}`,
    }
    await writeJson(notesPath, notes)
    stagedCaseCount += 1
  }

  return {
    sourceRoot: root,
    effectiveRoot: stagedCaseCount > 0 ? stagingRoot : root,
    prepared: stagedCaseCount > 0,
    stagedCaseCount,
  }
}

async function copyRootLevelArtifacts(input: {
  sourceRoot: string
  effectiveRoot: string
  runner: CalibrationRunnerResult
}) {
  if (input.sourceRoot === input.effectiveRoot) return
  await writeJson(path.join(input.sourceRoot, '_dataset-report.json'), input.runner.report)
  await writeJson(path.join(input.sourceRoot, '_calibration-review.json'), input.runner.reviewReport)
  await writeJson(path.join(input.sourceRoot, '_review-queue.json'), input.runner.reviewReport.casesToReviewFirst)
  if (input.runner.reviewMarkdownPath) {
    const markdownPath = path.join(input.sourceRoot, '_calibration-review.md')
    await writeFile(markdownPath, await readFile(input.runner.reviewMarkdownPath, 'utf8'), 'utf8')
  }
}

export async function runCalibrationPass(options: CalibrationPassOptions): Promise<CalibrationPassResult> {
  const prepared = await prepareFlatCalibrationDataset(path.resolve(options.root))
  const runner = await runCalibrationDataset({
    root: prepared.effectiveRoot,
    mode: options.mode,
    filter: options.filter,
    failOnExecutionError: options.failOnExecutionError,
    reviewConfig: options.reviewConfig,
    repairConfig: options.repairConfig,
  })

  await copyRootLevelArtifacts({
    sourceRoot: prepared.sourceRoot,
    effectiveRoot: prepared.effectiveRoot,
    runner,
  })

  const publicReportPath =
    prepared.sourceRoot === prepared.effectiveRoot
      ? runner.reportPath
      : path.join(prepared.sourceRoot, '_dataset-report.json')
  const publicReviewReportPath =
    prepared.sourceRoot === prepared.effectiveRoot
      ? runner.reviewReportPath
      : path.join(prepared.sourceRoot, '_calibration-review.json')
  const publicReviewQueuePath =
    prepared.sourceRoot === prepared.effectiveRoot
      ? runner.reviewQueuePath
      : path.join(prepared.sourceRoot, '_review-queue.json')

  return {
    ...runner,
    reportPath: publicReportPath,
    reviewReportPath: publicReviewReportPath,
    reviewQueuePath: publicReviewQueuePath,
    sourceRoot: prepared.sourceRoot,
    effectiveRoot: prepared.effectiveRoot,
    stagedDataset: {
      prepared: prepared.prepared,
      stagedCaseCount: prepared.stagedCaseCount,
    },
  }
}
