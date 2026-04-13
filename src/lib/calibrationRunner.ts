import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createMasterScene, generateVariant, getRepairDiagnostics } from './autoAdapt'
import {
  buildCalibrationDatasetReport,
  buildCalibrationDatasetSummary,
} from './calibrationReport'
import {
  buildCalibrationReviewReport,
  computeAgreementFields,
  computeReviewPriority,
  renderCalibrationReviewMarkdown,
  resolveCalibrationReviewConfig,
  summarizeCaseForReview,
  type CalibrationReviewConfigOverride,
  type CalibrationReviewReport,
} from './calibrationReview'
import type {
  CalibrationCaseArtifactPaths,
  CalibrationCaseExecutionSummary,
  CalibrationCaseFormat,
  CalibrationCaseInput,
  CalibrationCaseRunResult,
  CalibrationDatasetFilter,
  CalibrationDatasetParseMode,
  CalibrationDatasetReport,
  CalibrationInputAsset,
  CalibrationParseError,
} from './calibrationCaseSchema'
import { getCalibrationCasePathMetadata, parseCalibrationDataset } from './calibrationDataset'
import type { RepairSearchConfigOverride, RepairSearchTelemetry } from './types'
import { getImageProfile } from './assetProfile'
import { BRAND_TEMPLATES, FORMAT_MAP } from './presets'
import type {
  AssetHint,
  BrandKit,
  BrandTemplateKey,
  FormatKey,
  GoalKey,
  Scene,
  TemplateKey,
  VisualSystemKey,
} from './types'

type CalibrationPreviewSupport = {
  requested: boolean
  supported: boolean
  generated: boolean
  reason?: string
}

export type CalibrationCaseExecutor = (input: CalibrationCaseInput) => Promise<CalibrationCaseExecutionSummary>

export type CalibrationRunnerOptions = {
  root: string
  mode?: CalibrationDatasetParseMode
  filter?: CalibrationDatasetFilter
  writePreviews?: boolean
  failOnExecutionError?: boolean
  reviewConfig?: CalibrationReviewConfigOverride
  repairConfig?: RepairSearchConfigOverride
  executor?: CalibrationCaseExecutor
}

export type CalibrationRunnerResult = {
  report: CalibrationDatasetReport
  reportPath: string
  reviewReport: CalibrationReviewReport
  reviewReportPath: string
  reviewQueuePath: string
  reviewMarkdownPath?: string
  runResults: CalibrationCaseRunResult[]
  parseErrors: CalibrationParseError[]
  shouldFail: boolean
}

type ImageDimensions = {
  width: number
  height: number
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function toRelativePath(fromDir: string, absolutePath?: string) {
  if (!absolutePath) return undefined
  return path.relative(fromDir, absolutePath) || path.basename(absolutePath)
}

function buildArtifactPaths(caseInput: CalibrationCaseInput): CalibrationCaseArtifactPaths {
  return {
    input: path.basename(caseInput.inputAsset.path),
    notes: path.basename(caseInput.notesPath),
    verdict: caseInput.verdictPath ? path.basename(caseInput.verdictPath) : undefined,
    baseline: 'baseline.json',
    winner: 'winner.json',
    telemetry: 'telemetry.json',
    calibration: 'calibration.json',
    report: 'report.json',
    previewBaseline: 'preview-baseline.png',
    previewWinner: 'preview-winner.png',
  }
}

function topEntries(record: Record<string, number>, limit = 4) {
  return Object.entries(record)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key]) => key)
}

function extractTopRejectionReasons(telemetry: RepairSearchTelemetry, dominantPenalties: string[]) {
  const counts: Record<string, number> = {}
  for (const candidate of telemetry.candidates) {
    for (const reason of candidate.rejectionReasons) {
      counts[reason] = (counts[reason] || 0) + 1
    }
  }
  for (const penalty of dominantPenalties) {
    counts[penalty] = (counts[penalty] || 0) + 1
  }
  return topEntries(counts)
}

function inferFormatKey(notes: CalibrationCaseInput['notes']): FormatKey {
  if (notes.formatKey) return notes.formatKey
  const family = notes.family.toLowerCase()
  const key = `${family}:${notes.format}`
  switch (key) {
    case 'marketplace:square':
      return 'marketplace-card'
    case 'marketplace:landscape':
      return 'marketplace-tile'
    case 'marketplace:portrait':
      return 'marketplace-highlight'
    case 'social:square':
      return 'social-square'
    case 'social:landscape':
      return 'social-landscape'
    case 'social:portrait':
      return 'social-portrait'
    case 'display:landscape':
      return 'display-mpu'
    case 'display:square':
      return 'social-square'
    case 'display:portrait':
      return 'display-halfpage'
    case 'print:landscape':
      return 'print-billboard'
    case 'print:portrait':
      return 'print-flyer-a5'
    case 'presentation:landscape':
      return 'presentation-hero'
    case 'presentation:portrait':
      return 'presentation-onepager'
    default:
      throw new Error(`Unsupported family/format combination: ${notes.family}/${notes.format}. Add notes.formatKey to make the case explicit.`)
  }
}

function getDefaultGoal(notes: CalibrationCaseInput['notes']): GoalKey {
  const family = notes.family.toLowerCase()
  if (notes.goal) return notes.goal
  if (family === 'marketplace') return 'promo-pack'
  if (family === 'display' || family === 'social') return 'performance-banners'
  if (family === 'print') return 'retail-flyer'
  return 'promo-pack'
}

function getDefaultVisualSystem(notes: CalibrationCaseInput['notes']): VisualSystemKey {
  if (notes.visualSystem) return notes.visualSystem
  return notes.family.toLowerCase() === 'marketplace' ? 'product-card' : 'bold-promo'
}

function getDefaultTemplate(notes: CalibrationCaseInput['notes']): TemplateKey {
  return notes.template || 'promo'
}

function resolveBrandKit(brandTemplateKey?: BrandTemplateKey): BrandKit {
  const template =
    BRAND_TEMPLATES.find((item) => item.key === (brandTemplateKey || 'retail-impact')) || BRAND_TEMPLATES[0]
  return template.brandKit
}

function applyContentOverrides(scene: Scene, notes: CalibrationCaseInput['notes']) {
  const next = JSON.parse(JSON.stringify(scene)) as Scene
  if (notes.content?.title) next.title.text = notes.content.title
  if (notes.content?.subtitle) next.subtitle.text = notes.content.subtitle
  if (notes.content?.cta) next.cta.text = notes.content.cta
  if (notes.content?.badge) next.badge.text = notes.content.badge
  return next
}

function serializeAssessmentSummary(summary: {
  scene: Scene
  aggregateScore: number
  assessment: CalibrationCaseExecutionSummary['baselineAssessment']
  scoreTrust: CalibrationCaseExecutionSummary['baselineScoreTrust']
  candidate?: CalibrationCaseExecutionSummary['calibration']['baseline']
}) {
  return {
    scene: summary.scene,
    structuralStatus: summary.assessment.structuralState?.status || 'invalid',
    score: summary.assessment.score,
    verdict: summary.assessment.verdict,
    issueCodes: summary.assessment.issues.map((issue) => issue.code),
    structuralFindings: (summary.assessment.structuralState?.findings || []).map((finding) => ({
      name: finding.name,
      severity: finding.severity,
      message: finding.message,
    })),
    visual: summary.assessment.visual || null,
    perceptual: summary.assessment.perceptual || null,
    metrics: summary.assessment.metrics || null,
    confidence: summary.scoreTrust,
    objective: summary.candidate?.objective || null,
    summaryTags: summary.candidate?.summaryTags || [],
    penaltyTags: summary.candidate?.penaltyTags || [],
    aggregateScore: summary.aggregateScore,
  }
}

function serializeWinnerSummary(output: CalibrationCaseExecutionSummary) {
  return {
    winnerCandidateId: output.winnerCandidateId,
    winnerCandidateKind: output.winnerCandidateKind,
    winnerStrategyLabel: output.winnerStrategyLabel,
    baselineWon: output.baselineWon,
    aggregateDelta: output.aggregateDelta,
    ...serializeAssessmentSummary({
      scene: output.winnerScene,
      aggregateScore: output.winnerAggregateScore,
      assessment: output.winnerAssessment,
      scoreTrust: output.winnerScoreTrust,
      candidate: output.calibration.winner,
    }),
  }
}

function parsePngDimensions(buffer: Buffer): ImageDimensions {
  const signature = buffer.subarray(0, 8)
  const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!signature.equals(expected)) {
    throw new Error('Unsupported PNG signature.')
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function parseJpegDimensions(buffer: Buffer): ImageDimensions {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('Unsupported JPEG signature.')
  }
  let offset = 2
  while (offset < buffer.length) {
    while (buffer[offset] === 0xff) offset += 1
    const marker = buffer[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2) break
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      }
    }
    offset += segmentLength
  }
  throw new Error('Could not find JPEG dimensions.')
}

async function enrichInputAsset(inputAsset: CalibrationInputAsset) {
  const buffer = await readFile(inputAsset.path)
  try {
    const dimensions =
      inputAsset.extension === 'png' ? parsePngDimensions(buffer) : parseJpegDimensions(buffer)
    return {
      ...inputAsset,
      width: dimensions.width,
      height: dimensions.height,
    }
  } catch {
    return inputAsset
  }
}

function buildAssetHint(inputAsset: CalibrationInputAsset, notes: CalibrationCaseInput['notes']): AssetHint | undefined {
  const imageProfile =
    notes.imageProfile ||
    (inputAsset.width && inputAsset.height ? getImageProfile(inputAsset.width, inputAsset.height) : undefined)
  if (!imageProfile) return undefined
  return { imageProfile }
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeCaseRunArtifacts(input: {
  caseInput: CalibrationCaseInput
  execution: CalibrationCaseExecutionSummary
  artifactPaths: CalibrationCaseArtifactPaths
}) {
  const baselinePayload = serializeAssessmentSummary({
    scene: input.execution.baselineScene,
    aggregateScore: input.execution.baselineAggregateScore,
    assessment: input.execution.baselineAssessment,
    scoreTrust: input.execution.baselineScoreTrust,
    candidate: input.execution.calibration.baseline,
  })
  const winnerPayload = serializeWinnerSummary(input.execution)
  const telemetryPayload = {
    telemetry: input.execution.telemetry,
    candidateComparisons: input.execution.calibration.candidateComparisons,
  }
  const calibrationPayload = input.execution.calibration

  await writeJson(path.join(input.caseInput.caseDir, input.artifactPaths.baseline!), baselinePayload)
  await writeJson(path.join(input.caseInput.caseDir, input.artifactPaths.winner!), winnerPayload)
  await writeJson(path.join(input.caseInput.caseDir, input.artifactPaths.telemetry!), telemetryPayload)
  await writeJson(path.join(input.caseInput.caseDir, input.artifactPaths.calibration!), calibrationPayload)
}

async function writeCaseReport(input: {
  caseDir: string
  artifactPaths: CalibrationCaseArtifactPaths
  payload: Record<string, unknown>
}) {
  await mkdir(input.caseDir, { recursive: true })
  await writeJson(path.join(input.caseDir, input.artifactPaths.report || 'report.json'), input.payload)
}

function mergeRepairConfigOverrides(
  base?: RepairSearchConfigOverride,
  override?: RepairSearchConfigOverride
): RepairSearchConfigOverride | undefined {
  if (!base && !override) return undefined
  return {
    ...(base || {}),
    ...(override || {}),
    thresholds: {
      ...(base?.thresholds || {}),
      ...(override?.thresholds || {}),
    },
    profiles: {
      ...(base?.profiles || {}),
      ...(override?.profiles || {}),
    },
    familyProfiles: {
      ...(base?.familyProfiles || {}),
      ...(override?.familyProfiles || {}),
    },
  }
}

export async function executeCalibrationCase(
  caseInput: CalibrationCaseInput,
  repairConfig?: RepairSearchConfigOverride
): Promise<CalibrationCaseExecutionSummary> {
  const enrichedInputAsset = await enrichInputAsset(caseInput.inputAsset)
  const formatKey = inferFormatKey(caseInput.notes)
  const visualSystem = getDefaultVisualSystem(caseInput.notes)
  const goal = getDefaultGoal(caseInput.notes)
  const brandKit = resolveBrandKit(caseInput.notes.brandTemplateKey)
  const template = getDefaultTemplate(caseInput.notes)
  const master = applyContentOverrides(createMasterScene(template, brandKit), caseInput.notes)
  const assetHint = buildAssetHint(enrichedInputAsset, caseInput.notes)

  const generated = await generateVariant({
    master,
    formatKey,
    visualSystem,
    brandKit,
    goal,
    assetHint,
  })

  const repaired = await getRepairDiagnostics({
    scene: generated.sceneRepairBaseline,
    regenerationMasterScene: master,
    formatKey,
    visualSystem,
    brandKit,
    goal,
    assetHint,
    repairConfig: mergeRepairConfigOverrides(caseInput.notes.repairConfig, repairConfig),
  })

  const selection = repaired.diagnostics.selection
  if (!selection) {
    throw new Error(`Repair diagnostics for ${caseInput.id} did not return selection diagnostics.`)
  }

  const calibration = selection.calibration
  const telemetry = selection.telemetry
  return {
    formatKey,
    baselineScene: generated.scene,
    winnerScene: repaired.scene,
    baselineAssessment: generated.assessment,
    winnerAssessment: repaired.assessment,
    baselineScoreTrust: generated.scoreTrust,
    winnerScoreTrust: repaired.scoreTrust,
    baselineAggregateScore: calibration.baseline.aggregateScore,
    winnerAggregateScore: calibration.winner.aggregateScore,
    aggregateDelta: round(calibration.winner.aggregateDelta),
    baselineWon: telemetry.baselineWon,
    winnerCandidateId: telemetry.winnerCandidateId,
    winnerCandidateKind: telemetry.winnerCandidateKind,
    winnerStrategyLabel: telemetry.winnerStrategyLabel,
    dominantTags: telemetry.dominantTags,
    dominantPenalties: telemetry.dominantPenalties,
    telemetry,
    calibration,
    diagnosticsSummary: {
      finalChanged: repaired.diagnostics.finalChanged,
      acceptedImprovement: repaired.diagnostics.acceptedImprovement,
      attemptCount: repaired.diagnostics.attempts.length,
      regenerationCandidateCount: repaired.diagnostics.regenerationCandidates.length,
      classification: repaired.diagnostics.classification.dominantType,
      searchRunCount: repaired.diagnostics.searchRuns.length,
    },
  }
}

function buildCaseReportPayload(input: {
  result: CalibrationCaseRunResult
  previewGeneration: CalibrationPreviewSupport
}) {
  return {
    caseId: input.result.caseId,
    category: input.result.category,
    format: input.result.format,
    family: input.result.family,
    formatKey: input.result.formatKey,
    status: input.result.status,
    baselineAggregate: input.result.baselineAggregate,
    winnerAggregate: input.result.winnerAggregate,
    delta: input.result.aggregateDelta,
    baselineWon: input.result.baselineWon,
    winnerKind: input.result.winnerCandidateKind,
    winnerAccepted: input.result.winnerAccepted,
    winnerStrategyLabel: input.result.winnerStrategyLabel,
    baselineConfidence: input.result.baselineConfidence,
    winnerConfidence: input.result.winnerConfidence,
    winnerConfidenceDelta: input.result.winnerConfidenceDelta,
    topTags: input.result.dominantTags,
    topRejectionReasons: input.result.topRejectionReasons || [],
    reviewPriority: input.result.reviewPriority,
    whyReview: input.result.whyReview,
    shortSummary: input.result.shortSummary,
    humanVerdictPresent: input.result.humanVerdictPresent ?? false,
    fixedVsBaseline: input.result.fixedVsBaseline,
    humanAcceptedWinner: input.result.humanAcceptedWinner,
    machineHumanAgreement: input.result.machineHumanAgreement ?? null,
    agreementType: input.result.agreementType ?? null,
    parseErrors: input.result.parseErrors,
    executionError: input.result.executionError,
    artifactPaths: input.result.artifactPaths,
    previewGeneration: input.previewGeneration,
  }
}

export async function runCalibrationDataset(
  options: CalibrationRunnerOptions
): Promise<CalibrationRunnerResult> {
  const previewGeneration: CalibrationPreviewSupport = {
    requested: Boolean(options.writePreviews),
    supported: false,
    generated: false,
    reason: options.writePreviews
      ? 'PNG preview export is not available in the current non-UI Node pipeline; JSON artifacts were written instead.'
      : 'Preview generation not requested.',
  }
  const reviewConfig = resolveCalibrationReviewConfig(options.reviewConfig)

  const parsed = await parseCalibrationDataset({
    root: options.root,
    mode: options.mode,
    filter: options.filter,
  })

  if (parsed.parseErrors[0]?.code === 'root-invalid') {
    throw new Error(parsed.parseErrors[0].message)
  }

  const executor =
    options.executor || ((caseInput: CalibrationCaseInput) => executeCalibrationCase(caseInput, options.repairConfig))
  const runResults: CalibrationCaseRunResult[] = []

  const invalidCaseDirs = new Map<string, CalibrationParseError[]>()
  for (const error of parsed.parseErrors) {
    const current = invalidCaseDirs.get(error.caseDir) || []
    current.push(error)
    invalidCaseDirs.set(error.caseDir, current)
  }

  for (const [caseDir, errors] of invalidCaseDirs.entries()) {
    const relativeDir = path.relative(parsed.root, caseDir)
    const metadata = getCalibrationCasePathMetadata(relativeDir)
    const artifactPaths: CalibrationCaseArtifactPaths = {
      input: 'input.png',
      notes: 'notes.json',
      report: 'report.json',
      verdict: 'verdict.json',
    }
    const parseErrorResult: CalibrationCaseRunResult = {
      caseId: errors[0]?.caseId || path.basename(caseDir),
      caseDir,
      relativeDir,
      status: 'parse-error',
      category: metadata.folderCategory || 'uncategorized',
      format: metadata.folderFormat,
      artifactPaths,
      dominantTags: [],
      dominantPenalties: [],
      topRejectionReasons: [...new Set(errors.map((error) => error.code))],
      parseErrors: errors,
    }
    const priority = computeReviewPriority(parseErrorResult, reviewConfig)
    parseErrorResult.reviewPriority = priority.reviewPriority
    parseErrorResult.reviewScore = priority.reviewScore
    parseErrorResult.whyReview = priority.whyReview
    parseErrorResult.shortSummary = summarizeCaseForReview(parseErrorResult, reviewConfig)
    parseErrorResult.humanVerdictPresent = false
    parseErrorResult.machineHumanAgreement = null
    parseErrorResult.agreementType = null
    runResults.push(parseErrorResult)
  }

  if (parsed.shouldAbortExecution) {
    for (const caseInput of parsed.cases) {
      const artifactPaths = buildArtifactPaths(caseInput)
      const skippedResult: CalibrationCaseRunResult = {
        caseId: caseInput.id,
        caseDir: caseInput.caseDir,
        relativeDir: caseInput.relativeDir,
        status: 'skipped',
        category: caseInput.category,
        family: caseInput.notes.family,
        format: caseInput.notes.format,
        formatKey: caseInput.notes.formatKey,
        artifactPaths,
        dominantTags: [],
        dominantPenalties: [],
      }
      const agreement = computeAgreementFields({
        baselineWon: skippedResult.baselineWon,
        verdict: caseInput.verdict,
      })
      const priority = computeReviewPriority(skippedResult, reviewConfig)
      Object.assign(skippedResult, agreement, priority, {
        shortSummary: summarizeCaseForReview(skippedResult, reviewConfig),
      })
      runResults.push(skippedResult)
    }
  } else {
    for (const caseInput of parsed.cases) {
      const artifactPaths = buildArtifactPaths(caseInput)
      try {
        const execution = await executor(caseInput)
        await writeCaseRunArtifacts({
          caseInput,
          execution,
          artifactPaths,
        })
        const successResult: CalibrationCaseRunResult = {
          caseId: caseInput.id,
          caseDir: caseInput.caseDir,
          relativeDir: caseInput.relativeDir,
          status: 'success',
          category: caseInput.category,
          family: caseInput.notes.family,
          format: caseInput.notes.format,
          formatKey: execution.formatKey,
          artifactPaths,
          baselineAggregate: execution.baselineAggregateScore,
          winnerAggregate: execution.winnerAggregateScore,
          aggregateDelta: execution.aggregateDelta,
          baselineWon: execution.baselineWon,
          winnerAccepted: !execution.baselineWon,
          winnerCandidateKind: execution.winnerCandidateKind,
          winnerStrategyLabel: execution.winnerStrategyLabel,
          baselineConfidence: execution.telemetry.baselineConfidence.effectiveScore,
          winnerConfidence: execution.telemetry.winnerConfidence.effectiveScore,
          winnerConfidenceDelta: execution.telemetry.winnerConfidenceDelta,
          candidateCount: execution.telemetry.candidates.length,
          rejectedCandidateCount: execution.telemetry.candidates.filter((candidate) => !candidate.accepted).length,
          topRejectionReasons: extractTopRejectionReasons(execution.telemetry, execution.dominantPenalties),
          dominantTags: execution.dominantTags,
          dominantPenalties: execution.dominantPenalties,
        }
        const agreement = computeAgreementFields({
          baselineWon: successResult.baselineWon,
          verdict: caseInput.verdict,
        })
        const priority = computeReviewPriority(successResult, reviewConfig)
        Object.assign(successResult, agreement, priority, {
          shortSummary: summarizeCaseForReview(successResult, reviewConfig),
        })
        runResults.push(successResult)
      } catch (error) {
        const executionError = error instanceof Error ? error : new Error(String(error))
        const failureResult: CalibrationCaseRunResult = {
          caseId: caseInput.id,
          caseDir: caseInput.caseDir,
          relativeDir: caseInput.relativeDir,
          status: 'execution-error',
          category: caseInput.category,
          family: caseInput.notes.family,
          format: caseInput.notes.format,
          artifactPaths,
          dominantTags: [],
          dominantPenalties: [],
          topRejectionReasons: [executionError.name || 'execution-error'],
          executionError: {
            name: executionError.name,
            message: executionError.message,
          },
        }
        const agreement = computeAgreementFields({
          baselineWon: failureResult.baselineWon,
          verdict: caseInput.verdict,
        })
        const priority = computeReviewPriority(failureResult, reviewConfig)
        Object.assign(failureResult, agreement, priority, {
          shortSummary: summarizeCaseForReview(failureResult, reviewConfig),
        })
        runResults.push(failureResult)
      }
    }
  }

  const sortedRunResults = runResults.sort((left, right) => left.relativeDir.localeCompare(right.relativeDir))
  const report = buildCalibrationDatasetReport({
    root: parsed.root,
    strictMode: parsed.strictMode,
    filter: options.filter,
    previewGeneration,
    totalCasesFound: parsed.totalCasesFound,
    runResults: sortedRunResults,
    parseErrors: parsed.parseErrors,
  })
  const reportPath = path.join(parsed.root, '_dataset-report.json')
  await writeJson(reportPath, report)

  for (const result of sortedRunResults) {
    await writeCaseReport({
      caseDir: result.caseDir,
      artifactPaths: result.artifactPaths,
      payload: buildCaseReportPayload({
        result,
        previewGeneration,
      }),
    })
  }

  const reviewReport = buildCalibrationReviewReport({
    datasetReport: report,
    config: reviewConfig,
  })
  const reviewReportPath = path.join(parsed.root, '_calibration-review.json')
  await writeJson(reviewReportPath, reviewReport)

  const reviewQueuePath = path.join(parsed.root, '_review-queue.json')
  await writeJson(reviewQueuePath, reviewReport.casesToReviewFirst)

  let reviewMarkdownPath: string | undefined
  if (reviewConfig.includeMarkdownReviewReport) {
    reviewMarkdownPath = path.join(parsed.root, '_calibration-review.md')
    await writeFile(reviewMarkdownPath, renderCalibrationReviewMarkdown(reviewReport), 'utf8')
  }

  const summary = buildCalibrationDatasetSummary({
    totalCasesFound: parsed.totalCasesFound,
    runResults: sortedRunResults,
    parseErrors: parsed.parseErrors,
  })
  const shouldFail =
    parsed.shouldAbortExecution ||
    (options.failOnExecutionError ? summary.executionErrorCount > 0 : false) ||
    (parsed.strictMode && summary.parseErrorCount > 0)

  return {
    report,
    reportPath,
    reviewReport,
    reviewReportPath,
    reviewQueuePath,
    reviewMarkdownPath,
    runResults: sortedRunResults,
    parseErrors: parsed.parseErrors,
    shouldFail,
  }
}
