import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { parseCalibrationDataset } from './calibrationDataset'
import type {
  CalibrationCaseFormat,
  CalibrationCaseInput,
  CalibrationCaseRunResult,
  CalibrationDatasetParseResult,
} from './calibrationCaseSchema'
import type { CalibrationReviewPriority } from './calibrationReview'
import type {
  BestRejectedCandidateRow,
  CaseReviewAggregateSlice,
  CaseReviewBestRejectedCandidate,
  CaseReviewExportResult,
  CaseReviewExportStatus,
  CaseReviewNormalizedRow,
  CaseReviewPrimaryBlocker,
  CaseReviewQueueEntry,
  CaseReviewTuningSummary,
  CaseReviewTuningTarget,
  PlacementDeepDiagnosticsReport,
  PlacementDeepDiagnosticRow,
  PlacementBadgeLandscapeDiagnosticRow,
  PlacementBadgeLandscapeDiagnosticsReport,
  PlacementImageLandscapeDiagnosticRow,
  PlacementImageLandscapeDiagnosticsReport,
  LandscapeImageNearMissExperimentReport,
  PlacementCtaLandscapeDiagnosticsReport,
  PlacementCtaAnchorLandscapeDiagnosticRow,
  PlacementCtaAnchorLandscapeDiagnosticsReport,
  LandscapeTextHeightProductionExperimentReport,
  LandscapeTextHeightProductionExperimentCase,
  PlacementMessageLandscapeDiagnosticRow,
  PlacementMessageLandscapeDiagnosticsReport,
  PlacementRoleConflictLandscapeDiagnosticRow,
  PlacementRoleConflictLandscapeDiagnosticsReport,
  PlacementRoleConflictLandscapeSubtype,
  PlacementImageSquareDiagnosticRow,
  PlacementImageSquareDiagnosticsReport,
  SquareRoleConflictCandidateGroup,
  SquareCtaVsTextCandidateGroup,
  SquareCtaVsTextDiagnosticRow,
  SquareCtaVsTextDiagnosticsReport,
  SquareCtaVsTextSubtype,
  SquareCtaVsSubtitleCandidateGroup,
  SquareCtaVsSubtitleDiagnosticRow,
  SquareCtaVsSubtitleDiagnosticsReport,
  SquareCtaVsSubtitleSubtype,
  SquareRoleConflictDiagnosticRow,
  SquareRoleConflictDiagnosticsReport,
  SquareRoleConflictSubtype,
  PlacementTextLandscapeDiagnosticRow,
  PlacementTextLandscapeDiagnosticsReport,
  PlacementTextSquareDiagnosticRow,
  PlacementTextSquareDiagnosticsReport,
  PlacementRoleHotspotCase,
  PlacementRoleHotspotSlice,
  PlacementRoleHotspotsReport,
  PlacementSoftPolicyCaseUnlock,
  PlacementSoftPolicyDiagnosticsReport,
  MasterResidualBlockerBucket,
  MasterResidualBlockerCaseRow,
  MasterResidualBlockersReport,
  NextUnlockCandidateGroup,
  NextUnlockCandidateRow,
  NextUnlockCandidatesReport,
  NextUnlockPriority,
  ValidatedUnlockClass,
  ValidatedUnlockClassesReport,
} from './caseReviewTypes'
import type {
  Rect,
  PlacementViolationSeverity,
  RepairCandidateEvaluation,
  RepairCalibrationSnapshot,
  RepairRejectionReason,
  RepairSearchTelemetry,
} from './types'

type CaseReviewReportArtifact = CalibrationCaseRunResult & {
  artifactPaths?: Record<string, string | undefined>
  formatKey?: string
  topTags?: string[]
  topRejectionReasons?: string[]
}

type CaseAssessmentArtifact = {
  structuralStatus?: string
  score?: number
  verdict?: string
  issueCodes?: string[]
  aggregateScore?: number
  confidence?: {
    effectiveScore?: number
    needsHumanAttention?: boolean
  }
  objective?: {
    aggregateScore?: number
  }
  summaryTags?: string[]
  penaltyTags?: string[]
}

type CaseTelemetryArtifact = {
  telemetry: RepairSearchTelemetry
  candidateComparisons?: RepairCandidateEvaluation[]
}

type CaseArtifactBundle = {
  report: CaseReviewReportArtifact | null
  telemetry: CaseTelemetryArtifact | null
  calibration: RepairCalibrationSnapshot | null
  winner: CaseAssessmentArtifact | null
  baseline: CaseAssessmentArtifact | null
}

type CaseArtifactPaths = {
  inputPath: string
  caseFolderPath: string
  reportPath: string | null
  telemetryPath: string | null
  calibrationPath: string | null
  winnerPath: string | null
  baselinePath: string | null
  notesPath: string | null
  previewBaselinePath: string | null
  previewWinnerPath: string | null
}

type CaseReviewExportOptions = {
  root: string
  markdownLimit?: number
  reviewQueueSize?: number
}

type PlacementSoftPolicyCandidateRecord = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  placementSeverity: PlacementViolationSeverity
  aggregateScore?: number
  adjustedAggregateScore: number
  aggregateDelta: number
  effectiveScore: number
  perceptualQuality: number
  softPlacementPenalty: number
  rejectionReasons: string[]
  summaryTags: string[]
  penaltyTags: string[]
  wouldPassWithSoftPlacement: boolean
  wouldBeatBaselineWithSoftPlacement: boolean
  nearMissOverrideEligible: boolean
  nearMissOverrideBlockedReasons: string[]
  nearMissOverrideSafeguardsSatisfied: boolean
  wouldWinUnderNearMissOverride: boolean
  landscapeTextHeightNearMissEligible?: boolean
  landscapeTextHeightNearMissApplied?: boolean
  landscapeTextHeightNearMissReason?: string | null
  landscapeTextHeightNearMissSafeguardResults?: Record<string, boolean>
  landscapeTextHeightNearMissBlockerFamily?: string | null
  landscapeTextHeightNearMissBlockerSubtype?: string | null
  finalWinnerChangedByOverride?: boolean
  placementDiagnostics: RepairCandidateEvaluation['placementDiagnostics']
  baselineImageRect: Rect | null
  baselineConfidence: number
  candidateConfidence: number
  imageMovedRelativeToBaseline: boolean
}

const CSV_COLUMNS: Array<keyof CaseReviewNormalizedRow> = [
  'caseId',
  'category',
  'format',
  'family',
  'formatKey',
  'inputPath',
  'caseFolderPath',
  'status',
  'baselineWon',
  'winnerAccepted',
  'winnerKind',
  'winnerStrategyLabel',
  'baselineAggregate',
  'winnerAggregate',
  'delta',
  'baselineConfidence',
  'winnerConfidence',
  'winnerConfidenceDelta',
  'reviewPriority',
  'whyReview',
  'shortSummary',
  'topTags',
  'topRejectionReasons',
  'dominantTags',
  'dominantPenalties',
  'issueCodes',
  'structuralStatus',
  'verdict',
  'score',
  'bestRejectedCandidateKind',
  'bestRejectedCandidateId',
  'bestRejectedCandidateStrategy',
  'bestRejectedCandidateAggregate',
  'bestRejectedCandidateDelta',
  'bestRejectedCandidateConfidence',
  'bestRejectedCandidateRejectionReasons',
  'bestRejectedCandidatePrimaryBlocker',
  'bestRejectedCandidateOnlyBlockedByOneGate',
  'bestRejectedCandidateWouldBeatBaseline',
  'bestRejectedCandidateWouldImproveConfidence',
  'hasPositiveRejectedCandidate',
  'hasSingleGateBlockedCandidate',
  'blockedByRolePlacement',
  'blockedByLegacySafety',
  'blockedByNoNetGain',
  'blockedBySpacing',
  'blockedByAggregateBelowBaseline',
  'needsHumanAttention',
  'humanVerdictPresent',
  'fixedVsBaseline',
  'humanAcceptedWinner',
  'machineHumanAgreement',
  'agreementType',
  'reportPath',
  'telemetryPath',
  'calibrationPath',
  'winnerPath',
  'baselinePath',
  'notesPath',
  'previewBaselinePath',
  'previewWinnerPath',
]

const BLOCKER_PRIORITY: CaseReviewPrimaryBlocker[] = [
  'role-placement-out-of-zone',
  'legacy-safety-rejection',
  'spacing-threshold-exceeded',
  'confidence-collapse',
  'aggregate-below-baseline',
  'no-net-gain',
]

const VALIDATED_LANDSCAPE_TEXT_HEIGHT_FLIPS = [
  'disconnected-cta-dark-split-01-png',
  'disconnected-cta-skewed-layout-02-png',
  'ls-balance-left-heavy-png',
  'ls-cta-detached-png',
]

function round(value: number) {
  return Math.round(value * 100) / 100
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function severityRank(priority: CalibrationReviewPriority | null | undefined) {
  switch (priority) {
    case 'urgent-review':
      return 4
    case 'high-review':
      return 3
    case 'medium-review':
      return 2
    case 'low-review':
      return 1
    default:
      return 0
  }
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  if (!(await pathExists(filePath))) return null
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}

async function resolveExportRoots(root: string) {
  const normalizedRoot = path.resolve(root)
  const nestedCasesRoot = path.join(normalizedRoot, '_cases')
  if (await pathExists(nestedCasesRoot)) {
    return {
      outputRoot: normalizedRoot,
      casesRoot: nestedCasesRoot,
    }
  }
  if (path.basename(normalizedRoot) === '_cases') {
    return {
      outputRoot: path.dirname(normalizedRoot),
      casesRoot: normalizedRoot,
    }
  }
  return {
    outputRoot: normalizedRoot,
    casesRoot: normalizedRoot,
  }
}

async function parseCasesRoot(casesRoot: string): Promise<CalibrationDatasetParseResult> {
  return parseCalibrationDataset({
    root: casesRoot,
    mode: 'lenient',
  })
}

function resolveArtifactPath(caseInput: CalibrationCaseInput, artifactPaths: Record<string, string | undefined>, key: string) {
  const relative = artifactPaths[key]
  if (!relative) return null
  return path.join(caseInput.caseDir, relative)
}

async function loadCaseArtifacts(caseInput: CalibrationCaseInput): Promise<{
  paths: CaseArtifactPaths
  artifacts: CaseArtifactBundle
}> {
  const reportPath = path.join(caseInput.caseDir, 'report.json')
  const report = await readJsonIfExists<CaseReviewReportArtifact>(reportPath)
  const artifactPaths = report?.artifactPaths || {}

  const paths: CaseArtifactPaths = {
    inputPath: caseInput.inputAsset.path,
    caseFolderPath: caseInput.caseDir,
    reportPath: (await pathExists(reportPath)) ? reportPath : null,
    telemetryPath:
      resolveArtifactPath(caseInput, artifactPaths, 'telemetry') ||
      ((await pathExists(path.join(caseInput.caseDir, 'telemetry.json')))
        ? path.join(caseInput.caseDir, 'telemetry.json')
        : null),
    calibrationPath:
      resolveArtifactPath(caseInput, artifactPaths, 'calibration') ||
      ((await pathExists(path.join(caseInput.caseDir, 'calibration.json')))
        ? path.join(caseInput.caseDir, 'calibration.json')
        : null),
    winnerPath:
      resolveArtifactPath(caseInput, artifactPaths, 'winner') ||
      ((await pathExists(path.join(caseInput.caseDir, 'winner.json')))
        ? path.join(caseInput.caseDir, 'winner.json')
        : null),
    baselinePath:
      resolveArtifactPath(caseInput, artifactPaths, 'baseline') ||
      ((await pathExists(path.join(caseInput.caseDir, 'baseline.json')))
        ? path.join(caseInput.caseDir, 'baseline.json')
        : null),
    notesPath: caseInput.notesPath,
    previewBaselinePath:
      resolveArtifactPath(caseInput, artifactPaths, 'previewBaseline') ||
      path.join(caseInput.caseDir, 'preview-baseline.png'),
    previewWinnerPath:
      resolveArtifactPath(caseInput, artifactPaths, 'previewWinner') ||
      path.join(caseInput.caseDir, 'preview-winner.png'),
  }

  const [telemetry, calibration, winner, baseline] = await Promise.all([
    paths.telemetryPath ? readJsonIfExists<CaseTelemetryArtifact>(paths.telemetryPath) : Promise.resolve(null),
    paths.calibrationPath ? readJsonIfExists<RepairCalibrationSnapshot>(paths.calibrationPath) : Promise.resolve(null),
    paths.winnerPath ? readJsonIfExists<CaseAssessmentArtifact>(paths.winnerPath) : Promise.resolve(null),
    paths.baselinePath ? readJsonIfExists<CaseAssessmentArtifact>(paths.baselinePath) : Promise.resolve(null),
  ])

  const previewBaselineExists = paths.previewBaselinePath ? await pathExists(paths.previewBaselinePath) : false
  const previewWinnerExists = paths.previewWinnerPath ? await pathExists(paths.previewWinnerPath) : false

  return {
    paths: {
      ...paths,
      previewBaselinePath: previewBaselineExists ? paths.previewBaselinePath : null,
      previewWinnerPath: previewWinnerExists ? paths.previewWinnerPath : null,
    },
    artifacts: {
      report,
      telemetry,
      calibration,
      winner,
      baseline,
    },
  }
}

function normalizeRejectedCandidates(input: {
  telemetry: CaseTelemetryArtifact | null
  calibration: RepairCalibrationSnapshot | null
}): RepairCandidateEvaluation[] {
  const baselineCandidateId =
    input.calibration?.baseline.candidateId || input.telemetry?.telemetry.baselineCandidateId || null
  const comparisons =
    input.telemetry?.candidateComparisons ||
    input.calibration?.candidateComparisons ||
    []

  return comparisons.filter((candidate) => {
    if (candidate.accepted) return false
    if (baselineCandidateId && candidate.candidateId === baselineCandidateId) return false
    return true
  })
}

export function getPrimaryBlocker(
  rejectionReasons: readonly string[] | undefined
): CaseReviewPrimaryBlocker {
  if (!rejectionReasons || rejectionReasons.length === 0) return 'unknown'
  for (const blocker of BLOCKER_PRIORITY) {
    if (rejectionReasons.includes(blocker)) return blocker
  }
  return rejectionReasons.length ? 'other' : 'unknown'
}

export function selectBestRejectedCandidate(input: {
  baselineAggregate: number | null
  baselineConfidence: number | null
  telemetry: CaseTelemetryArtifact | null
  calibration: RepairCalibrationSnapshot | null
}): CaseReviewBestRejectedCandidate | null {
  const rejectedCandidates = normalizeRejectedCandidates({
    telemetry: input.telemetry,
    calibration: input.calibration,
  })
  if (rejectedCandidates.length === 0) return null

  const sorted = [...rejectedCandidates].sort((left, right) => {
    const leftPositive = left.aggregateDelta > 0 ? 1 : 0
    const rightPositive = right.aggregateDelta > 0 ? 1 : 0
    if (rightPositive !== leftPositive) return rightPositive - leftPositive
    if (right.aggregateScore !== left.aggregateScore) return right.aggregateScore - left.aggregateScore
    if (right.confidence.effectiveScore !== left.confidence.effectiveScore) {
      return right.confidence.effectiveScore - left.confidence.effectiveScore
    }
    if (left.rejectionReasons.length !== right.rejectionReasons.length) {
      return left.rejectionReasons.length - right.rejectionReasons.length
    }
    const leftTie = `${left.candidateKind}:${left.strategyLabel}:${left.candidateId}`
    const rightTie = `${right.candidateKind}:${right.strategyLabel}:${right.candidateId}`
    return leftTie.localeCompare(rightTie)
  })

  const candidate = sorted[0]
  const baselineAggregate = input.baselineAggregate ?? input.telemetry?.telemetry.baselineAggregateScore ?? 0
  const baselineConfidence = input.baselineConfidence ?? input.telemetry?.telemetry.baselineConfidence.effectiveScore ?? 0
  return {
    candidateId: candidate.candidateId,
    candidateKind: candidate.candidateKind,
    strategyLabel: candidate.strategyLabel,
    aggregateScore: candidate.aggregateScore,
    aggregateDelta: candidate.aggregateDelta,
    effectiveScore: candidate.effectiveScore,
    confidence: candidate.confidence.effectiveScore,
    confidenceDelta: candidate.confidenceDelta,
    rejectionReasons: candidate.rejectionReasons,
    primaryBlocker: getPrimaryBlocker(candidate.rejectionReasons),
    onlyBlockedByOneGate: candidate.rejectionReasons.length === 1,
    wouldBeatBaseline: candidate.aggregateDelta > 0 || candidate.aggregateScore > baselineAggregate,
    wouldImproveConfidence:
      candidate.confidence.effectiveScore > baselineConfidence || candidate.confidenceDelta > 0,
  }
}

function deriveNeedsHumanAttention(input: {
  report: CaseReviewReportArtifact | null
  winner: CaseAssessmentArtifact | null
  telemetry: CaseTelemetryArtifact | null
  bestRejectedCandidate: CaseReviewBestRejectedCandidate | null
}) {
  return Boolean(
    input.winner?.confidence?.needsHumanAttention ||
      input.telemetry?.telemetry.winnerConfidence.needsHumanAttention ||
      severityRank(input.report?.reviewPriority) >= 3 ||
      input.bestRejectedCandidate?.wouldBeatBaseline ||
      input.bestRejectedCandidate?.wouldImproveConfidence
  )
}

function pickScalar<T>(...values: Array<T | null | undefined>) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value
  }
  return null
}

export function buildCaseReviewRow(input: {
  caseInput: CalibrationCaseInput
  paths: CaseArtifactPaths
  artifacts: CaseArtifactBundle
}): CaseReviewNormalizedRow {
  const { caseInput, paths, artifacts } = input
  const bestRejectedCandidate = selectBestRejectedCandidate({
    baselineAggregate: artifacts.report?.baselineAggregate ?? artifacts.baseline?.aggregateScore ?? null,
    baselineConfidence:
      artifacts.report?.baselineConfidence ??
      artifacts.baseline?.confidence?.effectiveScore ??
      artifacts.telemetry?.telemetry.baselineConfidence.effectiveScore ??
      null,
    telemetry: artifacts.telemetry,
    calibration: artifacts.calibration,
  })

  const status: CaseReviewExportStatus = artifacts.report?.status || 'missing-artifact'
  const dominantTags = artifacts.telemetry?.telemetry.dominantTags || artifacts.report?.dominantTags || []
  const dominantPenalties =
    artifacts.telemetry?.telemetry.dominantPenalties || artifacts.report?.dominantPenalties || []
  const topRejectionReasons = artifacts.report?.topRejectionReasons || []
  const topTags = artifacts.report?.topTags || dominantTags || []
  const summarySource = artifacts.winner || artifacts.baseline
  const baselineAggregate =
    artifacts.report?.baselineAggregate ??
    artifacts.baseline?.aggregateScore ??
    artifacts.telemetry?.telemetry.baselineAggregateScore ??
    null
  const winnerAggregate =
    artifacts.report?.winnerAggregate ??
    artifacts.winner?.aggregateScore ??
    artifacts.telemetry?.telemetry.winnerAggregateScore ??
    null
  const baselineConfidence =
    artifacts.report?.baselineConfidence ??
    artifacts.baseline?.confidence?.effectiveScore ??
    artifacts.telemetry?.telemetry.baselineConfidence.effectiveScore ??
    null
  const winnerConfidence =
    artifacts.report?.winnerConfidence ??
    artifacts.winner?.confidence?.effectiveScore ??
    artifacts.telemetry?.telemetry.winnerConfidence.effectiveScore ??
    null
  const winnerConfidenceDelta =
    artifacts.report?.winnerConfidenceDelta ??
    artifacts.telemetry?.telemetry.winnerConfidenceDelta ??
    null

  return {
    caseId: caseInput.id,
    category: caseInput.notes.category || caseInput.category,
    format: caseInput.notes.format || caseInput.folderFormat,
    family: caseInput.notes.family || null,
    formatKey:
      artifacts.report?.formatKey ||
      artifacts.calibration?.formatKey ||
      caseInput.notes.formatKey ||
      null,
    inputPath: paths.inputPath,
    caseFolderPath: paths.caseFolderPath,

    status,
    baselineWon: pickScalar(artifacts.report?.baselineWon, artifacts.telemetry?.telemetry.baselineWon),
    winnerAccepted: pickScalar(
      artifacts.report?.winnerAccepted,
      artifacts.calibration?.winner.accepted
    ),
    winnerKind: pickScalar(
      artifacts.report?.winnerCandidateKind,
      artifacts.telemetry?.telemetry.winnerCandidateKind,
      (artifacts.winner as { winnerCandidateKind?: string } | null)?.winnerCandidateKind
    ),
    winnerStrategyLabel: pickScalar(
      artifacts.report?.winnerStrategyLabel,
      artifacts.telemetry?.telemetry.winnerStrategyLabel,
      (artifacts.winner as { winnerStrategyLabel?: string } | null)?.winnerStrategyLabel
    ),
    baselineAggregate,
    winnerAggregate,
    delta: pickScalar(
      artifacts.report?.aggregateDelta,
      winnerAggregate !== null && baselineAggregate !== null ? winnerAggregate - baselineAggregate : null
    ),
    baselineConfidence,
    winnerConfidence,
    winnerConfidenceDelta,
    reviewPriority: artifacts.report?.reviewPriority || null,
    whyReview: artifacts.report?.whyReview || null,
    shortSummary: artifacts.report?.shortSummary || null,

    topTags,
    topRejectionReasons,
    dominantTags,
    dominantPenalties,
    issueCodes: summarySource?.issueCodes || [],
    structuralStatus: summarySource?.structuralStatus || null,
    verdict: summarySource?.verdict || null,
    score: summarySource?.score ?? null,

    bestRejectedCandidateKind: bestRejectedCandidate?.candidateKind || null,
    bestRejectedCandidateId: bestRejectedCandidate?.candidateId || null,
    bestRejectedCandidateStrategy: bestRejectedCandidate?.strategyLabel || null,
    bestRejectedCandidateAggregate: bestRejectedCandidate?.aggregateScore ?? null,
    bestRejectedCandidateDelta: bestRejectedCandidate?.aggregateDelta ?? null,
    bestRejectedCandidateConfidence: bestRejectedCandidate?.confidence ?? null,
    bestRejectedCandidateRejectionReasons: bestRejectedCandidate?.rejectionReasons || [],
    bestRejectedCandidatePrimaryBlocker: bestRejectedCandidate?.primaryBlocker || null,
    bestRejectedCandidateOnlyBlockedByOneGate: bestRejectedCandidate?.onlyBlockedByOneGate || false,
    bestRejectedCandidateWouldBeatBaseline: bestRejectedCandidate?.wouldBeatBaseline || false,
    bestRejectedCandidateWouldImproveConfidence: bestRejectedCandidate?.wouldImproveConfidence || false,

    hasPositiveRejectedCandidate: Boolean(bestRejectedCandidate && bestRejectedCandidate.aggregateDelta > 0),
    hasSingleGateBlockedCandidate: Boolean(bestRejectedCandidate?.onlyBlockedByOneGate),
    blockedByRolePlacement: Boolean(
      bestRejectedCandidate?.rejectionReasons.includes('role-placement-out-of-zone')
    ),
    blockedByLegacySafety: Boolean(
      bestRejectedCandidate?.rejectionReasons.includes('legacy-safety-rejection')
    ),
    blockedByNoNetGain: Boolean(bestRejectedCandidate?.rejectionReasons.includes('no-net-gain')),
    blockedBySpacing: Boolean(
      bestRejectedCandidate?.rejectionReasons.includes('spacing-threshold-exceeded')
    ),
    blockedByAggregateBelowBaseline: Boolean(
      bestRejectedCandidate?.rejectionReasons.includes('aggregate-below-baseline')
    ),
    needsHumanAttention: deriveNeedsHumanAttention({
      report: artifacts.report,
      winner: artifacts.winner,
      telemetry: artifacts.telemetry,
      bestRejectedCandidate,
    }),

    humanVerdictPresent: artifacts.report?.humanVerdictPresent || false,
    fixedVsBaseline: artifacts.report?.fixedVsBaseline || null,
    humanAcceptedWinner: artifacts.report?.humanAcceptedWinner ?? null,
    machineHumanAgreement: artifacts.report?.machineHumanAgreement ?? null,
    agreementType: artifacts.report?.agreementType ?? null,

    reportPath: paths.reportPath,
    telemetryPath: paths.telemetryPath,
    calibrationPath: paths.calibrationPath,
    winnerPath: paths.winnerPath,
    baselinePath: paths.baselinePath,
    notesPath: paths.notesPath,
    previewBaselinePath: paths.previewBaselinePath,
    previewWinnerPath: paths.previewWinnerPath,
  }
}

function sortRowsForReview(rows: CaseReviewNormalizedRow[]) {
  return [...rows].sort((left, right) => {
    const priorityDelta = severityRank(right.reviewPriority) - severityRank(left.reviewPriority)
    if (priorityDelta !== 0) return priorityDelta
    const positiveDelta = Number(right.hasPositiveRejectedCandidate) - Number(left.hasPositiveRejectedCandidate)
    if (positiveDelta !== 0) return positiveDelta
    const singleGateDelta = Number(right.hasSingleGateBlockedCandidate) - Number(left.hasSingleGateBlockedCandidate)
    if (singleGateDelta !== 0) return singleGateDelta
    const leftDelta = left.delta ?? 0
    const rightDelta = right.delta ?? 0
    if (leftDelta !== rightDelta) return leftDelta - rightDelta
    return left.caseId.localeCompare(right.caseId)
  })
}

function buildBestRejectedCandidateRows(rows: CaseReviewNormalizedRow[]): BestRejectedCandidateRow[] {
  return rows.map((row) => ({
    caseId: row.caseId,
    category: row.category,
    format: row.format,
    family: row.family,
    formatKey: row.formatKey,
    reviewPriority: row.reviewPriority,
    whyReview: row.whyReview,
    baselineAggregate: row.baselineAggregate,
    winnerAggregate: row.winnerAggregate,
    delta: row.delta,
    winnerKind: row.winnerKind,
    bestRejectedCandidate: row.bestRejectedCandidateKind
      ? {
          candidateId: row.bestRejectedCandidateId || `${row.bestRejectedCandidateKind}:${row.bestRejectedCandidateStrategy || 'unknown'}`,
          candidateKind: row.bestRejectedCandidateKind,
          strategyLabel: row.bestRejectedCandidateStrategy || 'unknown',
          aggregateScore: row.bestRejectedCandidateAggregate || 0,
          aggregateDelta: row.bestRejectedCandidateDelta || 0,
          effectiveScore: row.bestRejectedCandidateConfidence || 0,
          confidence: row.bestRejectedCandidateConfidence || 0,
          confidenceDelta: row.bestRejectedCandidateWouldImproveConfidence ? 1 : 0,
          rejectionReasons: row.bestRejectedCandidateRejectionReasons as RepairRejectionReason[],
          primaryBlocker: row.bestRejectedCandidatePrimaryBlocker || 'unknown',
          onlyBlockedByOneGate: row.bestRejectedCandidateOnlyBlockedByOneGate,
          wouldBeatBaseline: row.bestRejectedCandidateWouldBeatBaseline,
          wouldImproveConfidence: row.bestRejectedCandidateWouldImproveConfidence,
        }
      : null,
    reportPath: row.reportPath,
    telemetryPath: row.telemetryPath,
    calibrationPath: row.calibrationPath,
  }))
}

function buildAggregateSlices(
  rows: CaseReviewNormalizedRow[],
  pickKey: (row: CaseReviewNormalizedRow) => string
): CaseReviewAggregateSlice[] {
  const groups = new Map<string, CaseReviewNormalizedRow[]>()
  for (const row of rows) {
    const key = pickKey(row)
    const bucket = groups.get(key) || []
    bucket.push(row)
    groups.set(key, bucket)
  }

  return [...groups.entries()]
    .map(([key, bucket]) => {
      const blockerCounts: Record<string, number> = {}
      for (const row of bucket) {
        if (row.bestRejectedCandidatePrimaryBlocker) {
          increment(blockerCounts, row.bestRejectedCandidatePrimaryBlocker)
        }
      }
      const baselineWins = bucket.filter((row) => row.baselineWon).length
      return {
        key,
        caseCount: bucket.length,
        baselineWinRate: round(bucket.length ? baselineWins / bucket.length : 0),
        positiveRejectedCandidateCount: bucket.filter((row) => row.hasPositiveRejectedCandidate).length,
        singleGateBlockedCount: bucket.filter((row) => row.hasSingleGateBlockedCandidate).length,
        confidenceImprovedRejectedCount: bucket.filter((row) => row.bestRejectedCandidateWouldImproveConfidence).length,
        dominantBlockers: Object.entries(blockerCounts)
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 5)
          .map(([blocker, count]) => ({ blocker, count })),
        topAffectedCaseIds: sortRowsForReview(bucket)
          .slice(0, 5)
          .map((row) => row.caseId),
      }
    })
    .sort((left, right) => right.caseCount - left.caseCount || left.key.localeCompare(right.key))
}

function buildBlockerHotspots(
  rows: CaseReviewNormalizedRow[],
  pickKey: (row: CaseReviewNormalizedRow) => string
) {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (!row.bestRejectedCandidatePrimaryBlocker) continue
    increment(counts, `${row.bestRejectedCandidatePrimaryBlocker}::${pickKey(row)}`)
  }
  return Object.entries(counts)
    .map(([compoundKey, count]) => {
      const [blocker, key] = compoundKey.split('::')
      return { blocker, key, count }
    })
    .sort((left, right) => right.count - left.count || left.blocker.localeCompare(right.blocker) || left.key.localeCompare(right.key))
    .slice(0, 20)
}

function buildTopTuningTargets(rows: CaseReviewNormalizedRow[]): CaseReviewTuningTarget[] {
  const counts = new Map<string, {
    blocker: CaseReviewPrimaryBlocker | null
    category: string | null
    format: CalibrationCaseFormat | null
    family: string | null
    caseIds: string[]
    positiveRejectedCandidateCount: number
    singleGateBlockedCount: number
  }>()

  for (const row of rows) {
    const blocker = row.bestRejectedCandidatePrimaryBlocker
    if (!blocker) continue
    const key = [blocker, row.category || 'uncategorized', row.format || 'unknown', row.family || 'unknown'].join('::')
    const current = counts.get(key) || {
      blocker,
      category: row.category,
      format: row.format,
      family: row.family,
      caseIds: [],
      positiveRejectedCandidateCount: 0,
      singleGateBlockedCount: 0,
    }
    current.caseIds.push(row.caseId)
    if (row.hasPositiveRejectedCandidate) current.positiveRejectedCandidateCount += 1
    if (row.hasSingleGateBlockedCandidate) current.singleGateBlockedCount += 1
    counts.set(key, current)
  }

  return [...counts.values()]
    .map((item) => ({
      theme: `${item.blocker || 'unknown'} pressure in ${item.category || 'uncategorized'} ${item.format || 'unknown'} ${item.family || 'unknown'} cases`,
      blocker: item.blocker,
      category: item.category,
      format: item.format,
      family: item.family,
      caseCount: item.caseIds.length,
      positiveRejectedCandidateCount: item.positiveRejectedCandidateCount,
      singleGateBlockedCount: item.singleGateBlockedCount,
      topCaseIds: [...item.caseIds].sort().slice(0, 5),
    }))
    .sort((left, right) => {
      if (right.positiveRejectedCandidateCount !== left.positiveRejectedCandidateCount) {
        return right.positiveRejectedCandidateCount - left.positiveRejectedCandidateCount
      }
      if (right.singleGateBlockedCount !== left.singleGateBlockedCount) {
        return right.singleGateBlockedCount - left.singleGateBlockedCount
      }
      if (right.caseCount !== left.caseCount) return right.caseCount - left.caseCount
      return left.theme.localeCompare(right.theme)
    })
    .slice(0, 12)
}

function buildReviewQueue(rows: CaseReviewNormalizedRow[], limit: number): CaseReviewQueueEntry[] {
  return sortRowsForReview(rows)
    .slice(0, limit)
    .map((row) => ({
      caseId: row.caseId,
      category: row.category,
      format: row.format,
      family: row.family,
      inputPath: row.inputPath,
      reportPath: row.reportPath,
      telemetryPath: row.telemetryPath,
      calibrationPath: row.calibrationPath,
      baselineAggregate: row.baselineAggregate,
      winnerAggregate: row.winnerAggregate,
      delta: row.delta,
      reviewPriority: row.reviewPriority,
      whyReview: row.whyReview || row.shortSummary || 'Review requested',
    }))
}

export function buildTuningSummary(
  rows: CaseReviewNormalizedRow[],
  input: { root: string; reviewQueueSize?: number }
): CaseReviewTuningSummary {
  const bestRejectedBlockers: Record<string, number> = {}
  const allRejectedBlockers: Record<string, number> = {}

  for (const row of rows) {
    if (row.bestRejectedCandidatePrimaryBlocker) {
      increment(bestRejectedBlockers, row.bestRejectedCandidatePrimaryBlocker)
    }
    for (const reason of row.bestRejectedCandidateRejectionReasons) {
      increment(allRejectedBlockers, reason)
    }
  }

  const toFrequencies = (record: Record<string, number>) =>
    Object.entries(record)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([blocker, count]) => ({ blocker, count }))

  const successfulRows = rows.filter((row) => row.status === 'success')
  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      totalCases: rows.length,
      successfulCases: successfulRows.length,
      baselineWinCount: rows.filter((row) => row.baselineWon).length,
      candidateWinCount: rows.filter((row) => row.baselineWon === false).length,
      positiveRejectedCandidateCount: rows.filter((row) => row.hasPositiveRejectedCandidate).length,
      singleGateBlockedCount: rows.filter((row) => row.hasSingleGateBlockedCandidate).length,
      confidenceImprovedRejectedCount: rows.filter((row) => row.bestRejectedCandidateWouldImproveConfidence).length,
    },
    blockerFrequency: {
      bestRejectedCandidates: toFrequencies(bestRejectedBlockers),
      allRejectedCandidates: toFrequencies(allRejectedBlockers),
    },
    nearMisses: {
      positiveRejectedCases: rows.filter((row) => row.hasPositiveRejectedCandidate).map((row) => row.caseId),
      singleGateBlockedCases: rows.filter((row) => row.hasSingleGateBlockedCandidate).map((row) => row.caseId),
      confidenceImprovedRejectedCases: rows
        .filter((row) => row.bestRejectedCandidateWouldImproveConfidence)
        .map((row) => row.caseId),
    },
    byCategory: buildAggregateSlices(rows, (row) => row.category || 'uncategorized'),
    byFormat: buildAggregateSlices(rows, (row) => row.format || 'unknown'),
    byFamily: buildAggregateSlices(rows, (row) => row.family || 'unknown'),
    blockerHotspots: {
      byCategory: buildBlockerHotspots(rows, (row) => row.category || 'uncategorized'),
      byFormat: buildBlockerHotspots(rows, (row) => row.format || 'unknown'),
      byFamily: buildBlockerHotspots(rows, (row) => row.family || 'unknown'),
    },
    topTuningTargets: buildTopTuningTargets(rows),
    reviewFirst: buildReviewQueue(rows, input.reviewQueueSize || 20),
    failedCases: rows
      .filter((row) => row.status !== 'success')
      .map((row) => ({
        caseId: row.caseId,
        status: row.status,
        whyReview: row.whyReview,
      })),
  }
}

function buildPlacementRecords(input: {
  row: CaseReviewNormalizedRow
  telemetry: CaseTelemetryArtifact | null
  calibration: RepairCalibrationSnapshot | null
}): PlacementSoftPolicyCandidateRecord[] {
  const candidates =
    input.telemetry?.candidateComparisons ||
    input.calibration?.candidateComparisons ||
    []
  const baselineCandidateId =
    input.telemetry?.telemetry.baselineCandidateId ||
    input.calibration?.baseline.candidateId ||
    null
  const baselineCandidate =
    candidates.find((candidate) => (baselineCandidateId ? candidate.candidateId === baselineCandidateId : candidate.candidateKind === 'baseline')) ||
    input.calibration?.baseline ||
    null
  const baselineImageRect =
      baselineCandidate?.placementDiagnostics.perRole.find((entry) => entry.role === 'image')?.rect || null
  const baselineConfidence = baselineCandidate?.confidence.effectiveScore || 0

  const hasMovedImage = (candidateRect: Rect | null, referenceRect: Rect | null) => {
    if (!candidateRect || !referenceRect) return false
    return (
      Math.abs(candidateRect.x - referenceRect.x) > 0.25 ||
      Math.abs(candidateRect.y - referenceRect.y) > 0.25 ||
      Math.abs(candidateRect.w - referenceRect.w) > 0.25 ||
      Math.abs(candidateRect.h - referenceRect.h) > 0.25
    )
  }

  return candidates
    .filter((candidate) => candidate.gateOutcomes.rolePlacementOutOfZone)
    .map((candidate) => {
      const imageRect =
        candidate.placementDiagnostics.perRole.find((entry) => entry.role === 'image')?.rect || null
        return {
        caseId: input.row.caseId,
        category: input.row.category,
        format: input.row.format,
        family: input.row.family,
        candidateId: candidate.candidateId,
        candidateKind: candidate.candidateKind,
        strategyLabel: candidate.strategyLabel,
        placementSeverity: candidate.placementSeverity,
        aggregateScore: candidate.aggregateScore,
        adjustedAggregateScore: candidate.adjustedAggregateScore,
        aggregateDelta: candidate.aggregateDelta,
        effectiveScore: candidate.effectiveScore,
        perceptualQuality: candidate.objective.perceptualQuality,
        softPlacementPenalty: candidate.softPlacementPenalty,
        rejectionReasons: candidate.rejectionReasons,
        summaryTags: candidate.summaryTags,
        penaltyTags: candidate.penaltyTags,
        wouldPassWithSoftPlacement: candidate.wouldPassWithSoftPlacement,
        wouldBeatBaselineWithSoftPlacement: candidate.wouldBeatBaselineWithSoftPlacement,
        nearMissOverrideEligible: candidate.nearMissOverrideEligible,
        nearMissOverrideBlockedReasons: candidate.gateOutcomes.nearMissOverrideBlockedReasons || [],
        nearMissOverrideSafeguardsSatisfied: candidate.gateOutcomes.nearMissOverrideSafeguardsSatisfied || false,
        wouldWinUnderNearMissOverride: candidate.wouldWinUnderNearMissOverride,
        landscapeTextHeightNearMissEligible: candidate.landscapeTextHeightNearMissEligible,
        landscapeTextHeightNearMissApplied: candidate.landscapeTextHeightNearMissApplied,
        landscapeTextHeightNearMissReason: candidate.landscapeTextHeightNearMissReason,
        landscapeTextHeightNearMissSafeguardResults:
          candidate.landscapeTextHeightNearMissSafeguardResults || {},
        landscapeTextHeightNearMissBlockerFamily: candidate.landscapeTextHeightNearMissBlockerFamily,
        landscapeTextHeightNearMissBlockerSubtype: candidate.landscapeTextHeightNearMissBlockerSubtype,
        finalWinnerChangedByOverride: candidate.finalWinnerChangedByOverride,
        placementDiagnostics: candidate.placementDiagnostics,
        baselineImageRect,
        baselineConfidence,
        candidateConfidence: candidate.confidence.effectiveScore,
        imageMovedRelativeToBaseline: hasMovedImage(imageRect, baselineImageRect),
        }
      })
}

function buildPlacementAggregateSlices(
  records: PlacementSoftPolicyCandidateRecord[],
  pickKey: (record: PlacementSoftPolicyCandidateRecord) => string
) {
  const groups = new Map<string, PlacementSoftPolicyCandidateRecord[]>()
  for (const record of records) {
    const key = pickKey(record)
    const bucket = groups.get(key) || []
    bucket.push(record)
    groups.set(key, bucket)
  }

  return [...groups.entries()]
    .map(([key, bucket]) => ({
      key,
      rolePlacementRejectionCount: bucket.length,
      unlockedCaseCount: new Set(bucket.filter((record) => record.wouldPassWithSoftPlacement).map((record) => record.caseId)).size,
      unlockedCandidateCount: bucket.filter((record) => record.wouldPassWithSoftPlacement).length,
    }))
    .sort((left, right) => right.rolePlacementRejectionCount - left.rolePlacementRejectionCount || left.key.localeCompare(right.key))
}

function getDominantViolatingRole(record: PlacementSoftPolicyCandidateRecord) {
  const eligibleRoles =
    record.placementDiagnostics?.perRole
      ?.filter((entry) => entry.eligible)
      .sort((left, right) => {
        const leftDistance = Math.max(left.allowedDistance, left.preferredDistance)
        const rightDistance = Math.max(right.allowedDistance, right.preferredDistance)
        if (rightDistance !== leftDistance) return rightDistance - leftDistance
        return left.role.localeCompare(right.role)
      }) || []
  return eligibleRoles[0]?.role || record.placementDiagnostics?.role || 'unknown'
}

function containsRect(container: Rect, subject: Rect) {
  return (
    subject.x >= container.x &&
    subject.y >= container.y &&
    subject.x + subject.w <= container.x + container.w &&
    subject.y + subject.h <= container.y + container.h
  )
}

function getContainmentDistance(subject: Rect, zone: Rect) {
  if (containsRect(zone, subject)) return 0
  const leftOverflow = Math.max(zone.x - subject.x, 0)
  const topOverflow = Math.max(zone.y - subject.y, 0)
  const rightOverflow = Math.max(subject.x + subject.w - (zone.x + zone.w), 0)
  const bottomOverflow = Math.max(subject.y + subject.h - (zone.y + zone.h), 0)
  return round(leftOverflow + topOverflow + rightOverflow + bottomOverflow)
}

function getMinDistanceToZones(subject: Rect | null, zones: Rect[]) {
  if (!subject || !zones.length) return 0
  return Math.min(...zones.map((zone) => getContainmentDistance(subject, zone)))
}

function getTextStrategyAlignment(record: PlacementSoftPolicyCandidateRecord) {
  const strategy = `${record.candidateKind}:${record.strategyLabel}`.toLowerCase()
  return ['overlay', 'dense', 'compact', 'text', 'hero'].some((token) => strategy.includes(token))
}

function deriveLandscapeCriticalIssues(record: PlacementSoftPolicyCandidateRecord) {
  const issues = new Set<string>()
  const tags = [...record.summaryTags, ...record.penaltyTags]
  const reasons = record.placementDiagnostics?.reasons || []

  if (record.rejectionReasons.includes('spacing-threshold-exceeded')) issues.add('spacing-collapse')
  if (record.rejectionReasons.includes('hard-structural-invalidity')) issues.add('other-structural-invalidity')
  if (record.rejectionReasons.includes('legacy-safety-rejection')) issues.add('other-structural-invalidity')
  if (tags.some((tag) => tag.includes('overlap'))) issues.add('critical-overlap')
  if (tags.some((tag) => tag.includes('role-loss'))) issues.add('role-loss')
  if (tags.some((tag) => tag.includes('slot')) || reasons.some((reason) => reason.includes('model-slot'))) {
    issues.add('structural-model-slot-mismatch')
  }
  if (
    reasons.includes('landscape-subtitle-detached') ||
    reasons.includes('landscape-cta-detached') ||
    tags.some((tag) => tag.includes('disconnect'))
  ) {
    issues.add('cluster-disconnect')
  }

  if (!issues.size && (record.rejectionReasons.includes('hard-structural-invalidity') || record.rejectionReasons.includes('legacy-safety-rejection'))) {
    issues.add('other-structural-invalidity')
  }

  return [...issues].sort((left, right) => left.localeCompare(right))
}

function deriveLandscapeStructuralSubtypes(record: PlacementSoftPolicyCandidateRecord) {
  const subtypes = new Set<string>()
  const tags = [...record.summaryTags, ...record.penaltyTags].map((tag) => tag.toLowerCase())
  const reasons = (record.placementDiagnostics?.reasons || []).map((reason) => reason.toLowerCase())
  const cluster = record.placementDiagnostics?.landscapeTextCluster

  if (record.rejectionReasons.includes('spacing-threshold-exceeded')) subtypes.add('spacing-collapse')
  if (tags.some((tag) => tag.includes('overlap'))) subtypes.add('overlap-critical')
  if (tags.some((tag) => tag.includes('role-loss'))) subtypes.add('role-loss')
  if (tags.some((tag) => tag.includes('slot')) || reasons.some((reason) => reason.includes('model-slot'))) {
    subtypes.add('model-slot-mismatch')
  }
  if (!cluster?.textImageSplitCoherent) subtypes.add('split-layout-coherence-failure')
  if (
    cluster &&
    (cluster.messageClusterTooTall ||
      cluster.messageClusterTooWide ||
      cluster.severeDrivenBySubtitleInflationOnly ||
      cluster.subtitleInflationContribution > 18)
  ) {
    subtypes.add('message-cluster-oversize')
  }
  if (record.rejectionReasons.includes('role-placement-out-of-zone')) subtypes.add('role-placement-conflict')

  if (
    !subtypes.size &&
    (record.rejectionReasons.includes('hard-structural-invalidity') ||
      record.rejectionReasons.includes('legacy-safety-rejection'))
  ) {
    subtypes.add('other-structural-invalidity')
  }

  return [...subtypes].sort((left, right) => left.localeCompare(right))
}

function getLandscapeClusterDominantBlocker(record: PlacementSoftPolicyCandidateRecord) {
  const cluster = record.placementDiagnostics?.landscapeTextCluster
  if (!cluster) return getDominantViolatingRole(record)
  if (cluster.ctaDetached && cluster.ctaAttachmentDistance >= cluster.subtitleAttachmentDistance) return 'cta-detachment'
  if (cluster.subtitleDetached) return 'subtitle-detachment'
  if (!cluster.textImageSplitCoherent) return 'text-image-split'
  if (cluster.severeDrivenByCombinedClusterOnly) return 'combined-cluster'
  if (cluster.titleDominatesMainTextPlacement) return 'title-placement'
  return getDominantViolatingRole(record)
}

function getLandscapeMessageDominantBlocker(record: PlacementSoftPolicyCandidateRecord) {
  const cluster = record.placementDiagnostics?.landscapeTextCluster
  if (!cluster) return getDominantViolatingRole(record)
  const structuralSubtypes = deriveLandscapeStructuralSubtypes(record)
  if (structuralSubtypes.includes('model-slot-mismatch')) return 'model-slot-mismatch'
  if (structuralSubtypes.includes('split-layout-coherence-failure')) return 'split-layout-coherence-failure'
  if (
    cluster.severeDrivenByCombinedClusterOnly ||
    structuralSubtypes.includes('message-cluster-oversize')
  ) {
    return 'message-cluster-oversize'
  }
  if (cluster.subtitleDetached) return 'subtitle-attachment'
  if (cluster.titleDominatesMainTextPlacement) return 'title-placement'
  return getDominantViolatingRole(record)
}

function getEligibleRoleEntry(record: PlacementSoftPolicyCandidateRecord, role: string) {
  return (
    record.placementDiagnostics?.perRole?.find(
      (entry) => entry.role === role && entry.eligible
    ) || null
  )
}

function getRectUnion(rects: Array<Rect | null | undefined>): Rect | null {
  const filtered = rects.filter((rect): rect is Rect => Boolean(rect))
  if (!filtered.length) return null

  const left = Math.min(...filtered.map((rect) => rect.x))
  const top = Math.min(...filtered.map((rect) => rect.y))
  const right = Math.max(...filtered.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...filtered.map((rect) => rect.y + rect.h))

  return {
    x: round(left),
    y: round(top),
    w: round(right - left),
    h: round(bottom - top),
  }
}

function getMaxZoneDimension(zones: Rect[], dimension: 'w' | 'h') {
  if (!zones.length) return 0
  return Math.max(...zones.map((zone) => zone[dimension]))
}

function getOverlapArea(a: Rect | null, b: Rect | null) {
  if (!a || !b) return 0
  const overlapWidth = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const overlapHeight = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return round(overlapWidth * overlapHeight)
}

const ROLE_CONFLICT_SUBTYPE_PRIORITY: PlacementRoleConflictLandscapeSubtype[] = [
  'title-zone-conflict',
  'cta-anchor-conflict',
  'text-too-wide-for-split',
  'text-too-tall-for-split',
  'message-vs-image-occupancy-conflict',
  'left-right-split-conflict',
  'subtitle-zone-conflict',
  'image-zone-conflict',
]

function pickRoleConflictSubtype(
  reasons: PlacementRoleConflictLandscapeSubtype[]
): PlacementRoleConflictLandscapeSubtype {
  if (!reasons.length) return 'mixed-role-zone-conflict'
  if (reasons.length === 1) return reasons[0]
  for (const subtype of ROLE_CONFLICT_SUBTYPE_PRIORITY) {
    if (reasons.includes(subtype)) return subtype
  }
  return 'mixed-role-zone-conflict'
}

function deriveLandscapeRoleConflictDetails(record: PlacementSoftPolicyCandidateRecord) {
  const cluster = record.placementDiagnostics?.landscapeTextCluster
  const textBoxes = record.placementDiagnostics?.textBoxes
  const titleRect = textBoxes?.titleRect || null
  const subtitleRect = textBoxes?.subtitleRect || null
  const ctaRect = getEligibleRoleEntry(record, 'cta')?.rect || null
  const imageRect = getEligibleRoleEntry(record, 'image')?.rect || record.baselineImageRect || null
  const textClusterRect = getRectUnion([titleRect, subtitleRect, ctaRect])
  const textRole = getEligibleRoleEntry(record, 'text')
  const ctaRole = getEligibleRoleEntry(record, 'cta')
  const imageRole = getEligibleRoleEntry(record, 'image')
  const allowedTextZones = textRole?.allowedZones || []
  const maxAllowedTextWidth = getMaxZoneDimension(allowedTextZones, 'w')
  const maxAllowedTextHeight = getMaxZoneDimension(allowedTextZones, 'h')
  const overlapArea = getOverlapArea(textClusterRect, imageRect)
  const splitBoundaryX = imageRect ? imageRect.x : 0

  const titlePlacementDistance = cluster?.titlePlacementDistance ?? 0
  const subtitleAttachmentDistance = cluster?.subtitleAttachmentDistance ?? 0
  const combinedMessageAllowedDistance =
    cluster?.combinedAllowedDistance ?? cluster?.rawCombinedMessageAllowedDistance ?? 0
  const titleZoneConflict = titlePlacementDistance > 2.5
  const subtitleZoneConflict = Boolean(cluster?.subtitleDetached) || subtitleAttachmentDistance > 2
  const ctaZoneConflict =
    (ctaRole?.allowedDistance ?? 0) > 1.5 || (ctaRole?.preferredDistance ?? 0) > 2.5
  const imageZoneConflict =
    (imageRole?.allowedDistance ?? 0) > 1.5 || (imageRole?.preferredDistance ?? 0) > 2.5
  const leftRightSplitConflict = !(cluster?.textImageSplitCoherent ?? true)
  const messageVsImageOccupancyConflict =
    overlapArea > 0 ||
    Boolean(textClusterRect && imageRect && textClusterRect.x + textClusterRect.w > imageRect.x - 3)
  const textTooWideForSplit =
    Boolean(textClusterRect) &&
    ((maxAllowedTextWidth > 0 && textClusterRect!.w > maxAllowedTextWidth + 1) ||
      (splitBoundaryX > 0 && textClusterRect!.x + textClusterRect!.w > splitBoundaryX - 4))
  const textTooTallForSplit =
    Boolean(textClusterRect) &&
    ((maxAllowedTextHeight > 0 && textClusterRect!.h > maxAllowedTextHeight + 2) ||
      Boolean(cluster?.messageClusterTooTall))
  const ctaAnchorConflict =
    Boolean(cluster?.ctaDetached) ||
    (!(cluster?.ctaWithinSplitLayoutTolerance ?? false) &&
      ((cluster?.ctaAnchorDistance ?? cluster?.ctaAttachmentDistance ?? 0) > 2.5 ||
        (cluster?.ctaMessageAssociationScore ?? 100) < 72 ||
        (cluster?.ctaReadingFlowContinuity ?? 100) < 74)) ||
    !(cluster?.fullClusterCoherent ?? true)
  const titleOnlyWouldPass = titlePlacementDistance <= 2
  const messageClusterWouldPass =
    combinedMessageAllowedDistance <= 4 &&
    !Boolean(cluster?.subtitleDetached) &&
    (cluster?.textImageSplitCoherent ?? true) &&
    !Boolean(cluster?.messageClusterTooTall)
  const remainingBlockerWouldBecomeMilder =
    Boolean(cluster?.wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy) ||
    Boolean(cluster?.wouldBecomeMilderUnderAttachmentAwarePolicy) ||
    Boolean(cluster?.wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy)

  const roleConflictReasons: PlacementRoleConflictLandscapeSubtype[] = []
  if (titleZoneConflict) roleConflictReasons.push('title-zone-conflict')
  if (ctaAnchorConflict) roleConflictReasons.push('cta-anchor-conflict')
  if (textTooWideForSplit) roleConflictReasons.push('text-too-wide-for-split')
  if (textTooTallForSplit) roleConflictReasons.push('text-too-tall-for-split')
  if (messageVsImageOccupancyConflict) roleConflictReasons.push('message-vs-image-occupancy-conflict')
  if (leftRightSplitConflict) roleConflictReasons.push('left-right-split-conflict')
  if (subtitleZoneConflict) roleConflictReasons.push('subtitle-zone-conflict')
  if (imageZoneConflict) roleConflictReasons.push('image-zone-conflict')

  const uniqueReasons = [...new Set(roleConflictReasons)]

  return {
    titleRect,
    subtitleRect,
    ctaRect,
    imageRect,
    textClusterRect,
    titlePlacementDistance,
    subtitleAttachmentDistance,
    combinedMessageAllowedDistance,
    titleZoneConflict,
    subtitleZoneConflict,
    ctaZoneConflict,
    imageZoneConflict,
    leftRightSplitConflict,
    messageVsImageOccupancyConflict,
    textTooWideForSplit,
    textTooTallForSplit,
    ctaAnchorConflict,
    titleOnlyWouldPass,
    messageClusterWouldPass,
    remainingBlockerWouldBecomeMilder,
    roleConflictReasons: uniqueReasons,
    roleConflictSubtype: pickRoleConflictSubtype(uniqueReasons),
  }
}

function getRectDistance(a: Rect | null, b: Rect | null) {
  if (!a || !b) return 0
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  return round(Math.hypot(dx, dy))
}

function getRectHorizontalOffset(a: Rect | null, b: Rect | null) {
  if (!a || !b) return 0
  const aCenter = a.x + a.w / 2
  const bCenter = b.x + b.w / 2
  return round(Math.abs(aCenter - bCenter))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function deriveSquareStructuralFlags(record: PlacementSoftPolicyCandidateRecord) {
  const tags = [...record.summaryTags, ...record.penaltyTags].map((tag) => tag.toLowerCase())
  return {
    legacySafetyRejected: record.rejectionReasons.includes('legacy-safety-rejection'),
    spacingCollapsePresent: record.rejectionReasons.includes('spacing-threshold-exceeded'),
    hardStructuralInvalidityPresent: record.rejectionReasons.includes('hard-structural-invalidity'),
    criticalOverlapPresent: tags.some((tag) => tag.includes('overlap')),
    roleLossPresent: tags.some((tag) => tag.includes('role-loss')),
  }
}

const SQUARE_ROLE_CONFLICT_SUBTYPE_PRIORITY: SquareRoleConflictSubtype[] = [
  'cta-anchor-conflict',
  'cta-vs-text-conflict',
  'cta-vs-image-conflict',
  'image-vs-text-occupancy-conflict',
  'title-zone-conflict',
  'subtitle-zone-conflict',
  'text-too-tall-for-square',
  'text-too-wide-for-square',
  'image-too-dominant-for-square',
  'text-zone-conflict',
]

function pickSquareRoleConflictSubtype(reasons: SquareRoleConflictSubtype[]): SquareRoleConflictSubtype {
  if (!reasons.length) return 'mixed-role-zone-conflict'
  if (reasons.length === 1) return reasons[0]
  for (const subtype of SQUARE_ROLE_CONFLICT_SUBTYPE_PRIORITY) {
    if (reasons.includes(subtype)) return subtype
  }
  return 'mixed-role-zone-conflict'
}

const SQUARE_CTA_VS_TEXT_SUBTYPE_PRIORITY: SquareCtaVsTextSubtype[] = [
  'cta-below-text-but-valid',
  'cta-vs-subtitle-conflict',
  'cta-vs-combined-text-footprint',
  'text-cluster-too-tall-for-cta-pairing',
  'text-cluster-too-wide-for-cta-pairing',
  'cta-band-mismatch',
  'cta-too-close-to-text',
  'cta-too-far-from-text',
  'mixed-cta-text-zone-conflict',
]

function pickSquareCtaVsTextSubtype(reasons: SquareCtaVsTextSubtype[]): SquareCtaVsTextSubtype {
  if (!reasons.length) return 'mixed-cta-text-zone-conflict'
  if (reasons.length === 1) return reasons[0]
  for (const subtype of SQUARE_CTA_VS_TEXT_SUBTYPE_PRIORITY) {
    if (reasons.includes(subtype)) return subtype
  }
  return 'mixed-cta-text-zone-conflict'
}

const SQUARE_CTA_VS_SUBTITLE_SUBTYPE_PRIORITY: SquareCtaVsSubtitleSubtype[] = [
  'subtitle-inflation-causes-cta-collision',
  'combined-text-footprint-causes-cta-collision',
  'action-band-mismatch',
  'true-cta-subtitle-overlap-risk',
  'cta-vs-subtitle-vertical-collision',
  'cta-vs-subtitle-horizontal-collision',
  'mixed-cta-subtitle-zone-conflict',
]

function pickSquareCtaVsSubtitleSubtype(
  reasons: SquareCtaVsSubtitleSubtype[]
): SquareCtaVsSubtitleSubtype {
  if (!reasons.length) return 'mixed-cta-subtitle-zone-conflict'
  if (reasons.length === 1) return reasons[0]
  for (const subtype of SQUARE_CTA_VS_SUBTITLE_SUBTYPE_PRIORITY) {
    if (reasons.includes(subtype)) return subtype
  }
  return 'mixed-cta-subtitle-zone-conflict'
}

function deriveSquareRoleConflictDetails(record: PlacementSoftPolicyCandidateRecord) {
  const textBoxes = record.placementDiagnostics?.textBoxes
  const textCluster = record.placementDiagnostics?.textCluster
  const titleRect = textBoxes?.titleRect || null
  const subtitleRect = textBoxes?.subtitleRect || null
  const ctaRect = getEligibleRoleEntry(record, 'cta')?.rect || null
  const imageRect = getEligibleRoleEntry(record, 'image')?.rect || record.baselineImageRect || null
  const textRole = getEligibleRoleEntry(record, 'text')
  const imageRole = getEligibleRoleEntry(record, 'image')
  const ctaRole = getEligibleRoleEntry(record, 'cta')
  const combinedTextRect = getRectUnion([titleRect, subtitleRect])
  const messageClusterRect = getRectUnion([titleRect, subtitleRect, ctaRect])
  const allowedTextZones = textRole?.allowedZones || []
  const ruleTextWidth = getMaxZoneDimension(allowedTextZones, 'w')
  const ruleTextHeight = getMaxZoneDimension(allowedTextZones, 'h')
  const titlePlacementDistance = textCluster?.titlePlacementDistance ?? 0
  const subtitleAttachmentDistance = textCluster?.subtitleAttachmentDistance ?? 0
  const combinedAllowedDistance = textCluster?.combinedAllowedDistance ?? textRole?.allowedDistance ?? 0
  const ctaToMessageDistance = getRectDistance(ctaRect, combinedTextRect)
  const ctaHorizontalOffset = getRectHorizontalOffset(ctaRect, combinedTextRect)
  const ctaVerticalGap =
    ctaRect && combinedTextRect ? round(Math.max(0, ctaRect.y - (combinedTextRect.y + combinedTextRect.h))) : 0
  const ctaReadingFlowContinuity = round(
    clamp(100 - Math.max(0, ctaVerticalGap - 10) * 6 - Math.max(0, ctaHorizontalOffset - 8) * 4, 0, 100)
  )
  const ctaMessageAssociationScore = round(
    clamp(
      100 -
        Math.max(0, ctaToMessageDistance - 6) * 7 -
        Math.max(0, ctaHorizontalOffset - 10) * 3 -
        Math.max(0, ctaVerticalGap - 12) * 4,
      0,
      100
    )
  )
  const ctaWithinSquareTolerance =
    ctaVerticalGap <= 14 && ctaHorizontalOffset <= 12 && ctaReadingFlowContinuity >= 68 && ctaMessageAssociationScore >= 66
  const titleZoneConflict = titlePlacementDistance > 2.5
  const subtitleZoneConflict = Boolean(textCluster?.subtitleDetached) || subtitleAttachmentDistance > 2.5
  const textZoneConflict =
    (textRole?.allowedDistance ?? 0) > 2 || (textRole?.preferredDistance ?? 0) > 4 || combinedAllowedDistance > 4
  const imageZoneConflict =
    (imageRole?.allowedDistance ?? 0) > 2 || (imageRole?.preferredDistance ?? 0) > 4
  const overlapArea = getOverlapArea(combinedTextRect, imageRect)
  const imageVsTextOccupancyConflict =
    overlapArea > 0 ||
    Boolean(combinedTextRect && imageRect && combinedTextRect.x + combinedTextRect.w > imageRect.x - 3)
  const ctaVsTextConflict =
    ctaToMessageDistance > 8 || ctaHorizontalOffset > 14 || Boolean(ctaRect && combinedTextRect && getOverlapArea(ctaRect, combinedTextRect) > 0)
  const ctaVsImageConflict =
    Boolean(ctaRect && imageRect && getOverlapArea(ctaRect, imageRect) > 0) ||
    Boolean(ctaRect && imageRect && ctaRect.x + ctaRect.w > imageRect.x - 2)
  const textTooTallForSquare =
    Boolean(combinedTextRect) &&
    ((ruleTextHeight > 0 && combinedTextRect!.h > ruleTextHeight + 2) || (textCluster?.combinedClusterFootprint ?? 0) > 26)
  const textTooWideForSquare =
    Boolean(combinedTextRect) &&
    ((ruleTextWidth > 0 && combinedTextRect!.w > ruleTextWidth + 2) || Boolean(combinedTextRect && combinedTextRect.w > 54))
  const imageSafeAreaFootprint =
    imageRect ? round((imageRect.w * imageRect.h) / Math.max(1, 92 * 92) * 100) : 0
  const imageTooDominantForSquare =
    imageSafeAreaFootprint > 32 &&
    ((imageRole?.allowedDistance ?? 0) > 4 || imageVsTextOccupancyConflict)
  const ctaAnchorConflict = !ctaWithinSquareTolerance && (ctaVerticalGap > 12 || ctaHorizontalOffset > 12)
  const titleOnlyWouldPass = titlePlacementDistance <= 2
  const messageClusterWouldPass =
    combinedAllowedDistance <= 4 &&
    !Boolean(textCluster?.subtitleDetached) &&
    !textTooTallForSquare &&
    !textTooWideForSquare
  const remainingBlockerWouldBecomeMilder = Boolean(textCluster?.wouldBecomeMilderUnderAttachmentAwarePolicy)

  const roleConflictReasons: SquareRoleConflictSubtype[] = []
  if (ctaAnchorConflict) roleConflictReasons.push('cta-anchor-conflict')
  if (ctaVsTextConflict) roleConflictReasons.push('cta-vs-text-conflict')
  if (ctaVsImageConflict) roleConflictReasons.push('cta-vs-image-conflict')
  if (imageVsTextOccupancyConflict) roleConflictReasons.push('image-vs-text-occupancy-conflict')
  if (titleZoneConflict) roleConflictReasons.push('title-zone-conflict')
  if (subtitleZoneConflict) roleConflictReasons.push('subtitle-zone-conflict')
  if (textTooTallForSquare) roleConflictReasons.push('text-too-tall-for-square')
  if (textTooWideForSquare) roleConflictReasons.push('text-too-wide-for-square')
  if (imageTooDominantForSquare) roleConflictReasons.push('image-too-dominant-for-square')
  if (textZoneConflict) roleConflictReasons.push('text-zone-conflict')

  const structuralFlags = deriveSquareStructuralFlags(record)

  return {
    titleRect,
    subtitleRect,
    ctaRect,
    imageRect,
    combinedTextRect,
    messageClusterRect,
    roleConflictSubtype: pickSquareRoleConflictSubtype([...new Set(roleConflictReasons)]),
    roleConflictReasons: [...new Set(roleConflictReasons)],
    ctaAnchorConflict,
    ctaToMessageDistance,
    ctaHorizontalOffset,
    ctaVerticalGap,
    ctaWithinSquareTolerance,
    ctaReadingFlowContinuity,
    ctaMessageAssociationScore,
    imageZoneConflict,
    textZoneConflict,
    titleZoneConflict,
    subtitleZoneConflict,
    imageVsTextOccupancyConflict,
    ctaVsTextConflict,
    ctaVsImageConflict,
    textTooTallForSquare,
    textTooWideForSquare,
    imageTooDominantForSquare,
    titleOnlyWouldPass,
    messageClusterWouldPass,
    remainingBlockerWouldBecomeMilder,
    ...structuralFlags,
  }
}

function deriveSquareCtaVsTextDetails(record: PlacementSoftPolicyCandidateRecord) {
  const base = deriveSquareRoleConflictDetails(record)
  const textCluster = record.placementDiagnostics?.textCluster
  const ctaRole = getEligibleRoleEntry(record, 'cta')
  const ctaRect = base.ctaRect
  const titleRect = base.titleRect
  const subtitleRect = base.subtitleRect
  const combinedTextRect = base.combinedTextRect
  const messageClusterRect = base.messageClusterRect

  const ctaToTitleDistance = getRectDistance(ctaRect, titleRect)
  const ctaToSubtitleDistance = getRectDistance(ctaRect, subtitleRect)
  const ctaToCombinedTextDistance = base.ctaToMessageDistance
  const ctaOverlapRisk = Boolean(
    (ctaRect && titleRect && getOverlapArea(ctaRect, titleRect) > 0) ||
      (ctaRect && subtitleRect && getOverlapArea(ctaRect, subtitleRect) > 0) ||
      (ctaRect && combinedTextRect && getOverlapArea(ctaRect, combinedTextRect) > 0)
  )
  const ctaZoneConflict =
    (ctaRole?.allowedDistance ?? 0) > 2 || (ctaRole?.preferredDistance ?? 0) > 4
  const ctaBandMaxY = ctaRole?.allowedZones.reduce((max, zone) => Math.max(max, zone.y + zone.h), 0) ?? 0
  const ctaBandMinY = ctaRole?.allowedZones.reduce((min, zone) => Math.min(min, zone.y), 100) ?? 100
  const ctaInsideExpectedActionBand = Boolean(
    ctaRect &&
      ctaRole?.allowedZones.length &&
      ctaRect.y >= ctaBandMinY - 2 &&
      ctaRect.y + ctaRect.h <= ctaBandMaxY + 2
  )
  const ctaBelowTextButAcceptable = Boolean(
    ctaRect &&
      combinedTextRect &&
      ctaRect.y >= combinedTextRect.y + combinedTextRect.h - 1 &&
      base.ctaWithinSquareTolerance &&
      base.ctaReadingFlowContinuity >= 72 &&
      base.ctaMessageAssociationScore >= 72
  )
  const textClusterTooTallForCtaPairing = base.textTooTallForSquare || (combinedTextRect?.h ?? 0) > 24
  const textClusterTooWideForCtaPairing = base.textTooWideForSquare || (combinedTextRect?.w ?? 0) > 50
  const subtitleInflationContribution = textCluster?.subtitleInflationContribution ?? 0
  const subtitleInflatesMainly = subtitleInflationContribution >= 10

  const reasons: SquareCtaVsTextSubtype[] = []
  if (ctaBelowTextButAcceptable && !ctaZoneConflict && !ctaOverlapRisk) {
    reasons.push('cta-below-text-but-valid')
  }
  if (
    subtitleRect &&
    subtitleInflatesMainly &&
    (ctaToSubtitleDistance <= ctaToTitleDistance + 2 ||
      (ctaRect && subtitleRect && ctaRect.y <= subtitleRect.y + subtitleRect.h + 2))
  ) {
    reasons.push('cta-vs-subtitle-conflict')
  }
  if ((base.messageClusterWouldPass === false && base.titleOnlyWouldPass) || subtitleInflatesMainly) {
    reasons.push('cta-vs-combined-text-footprint')
  }
  if (textClusterTooTallForCtaPairing) reasons.push('text-cluster-too-tall-for-cta-pairing')
  if (textClusterTooWideForCtaPairing) reasons.push('text-cluster-too-wide-for-cta-pairing')
  if (ctaZoneConflict && !ctaInsideExpectedActionBand) reasons.push('cta-band-mismatch')
  if (ctaOverlapRisk || ctaToCombinedTextDistance <= 2) reasons.push('cta-too-close-to-text')
  if (
    !base.ctaWithinSquareTolerance &&
    (base.ctaVerticalGap > 14 || base.ctaHorizontalOffset > 12 || base.ctaMessageAssociationScore < 66)
  ) {
    reasons.push('cta-too-far-from-text')
  }

  const uniqueReasons = [...new Set(reasons)]

  return {
    ...base,
    ctaToTitleDistance,
    ctaToSubtitleDistance,
    ctaToCombinedTextDistance,
    ctaOverlapRisk,
    ctaZoneConflict,
    ctaInsideExpectedActionBand,
    ctaBelowTextButAcceptable,
    textClusterTooTallForCtaPairing,
    textClusterTooWideForCtaPairing,
    subtitleInflationContribution,
    ctaVsTextSubtype: pickSquareCtaVsTextSubtype(uniqueReasons),
    ctaVsTextReasons: uniqueReasons,
  }
}

function deriveSquareCtaVsSubtitleDetails(record: PlacementSoftPolicyCandidateRecord) {
  const base = deriveSquareCtaVsTextDetails(record)
  const textCluster = record.placementDiagnostics?.textCluster
  const subtitleRect = base.subtitleRect
  const ctaRect = base.ctaRect
  const combinedTextRect = base.combinedTextRect
  const titleRect = base.titleRect

  const ctaToSubtitleDistance = base.ctaToSubtitleDistance
  const ctaToSubtitleHorizontalOffset = getRectHorizontalOffset(ctaRect, subtitleRect)
  const ctaToSubtitleVerticalGap =
    ctaRect && subtitleRect
      ? round(Math.max(0, ctaRect.y - (subtitleRect.y + subtitleRect.h)))
      : 0
  const subtitleHeightContribution = subtitleRect?.h ?? 0
  const titleHeightContribution = titleRect?.h ?? 0
  const subtitleInflationContribution = base.subtitleInflationContribution
  const subtitleInflatesMainly =
    subtitleInflationContribution >= 10 || subtitleHeightContribution > titleHeightContribution * 0.9
  const subtitleOnlyWouldPass =
    !base.subtitleZoneConflict &&
    ctaToSubtitleDistance <= 8 &&
    ctaToSubtitleHorizontalOffset <= 10 &&
    ctaToSubtitleVerticalGap <= 10
  const actionBandMismatch = base.ctaZoneConflict && !base.ctaInsideExpectedActionBand
  const ctaBelowSubtitleButAcceptable = Boolean(
    ctaRect &&
      subtitleRect &&
      ctaRect.y >= subtitleRect.y + subtitleRect.h - 1 &&
      ctaToSubtitleVerticalGap <= 10 &&
      ctaToSubtitleHorizontalOffset <= 10 &&
      base.ctaWithinSquareTolerance &&
      base.ctaReadingFlowContinuity >= 72 &&
      base.ctaMessageAssociationScore >= 72
  )

  const reasons: SquareCtaVsSubtitleSubtype[] = []
  if (subtitleInflatesMainly && base.textClusterTooTallForCtaPairing) {
    reasons.push('subtitle-inflation-causes-cta-collision')
  }
  if (!base.messageClusterWouldPass && base.titleOnlyWouldPass) {
    reasons.push('combined-text-footprint-causes-cta-collision')
  }
  if (actionBandMismatch) reasons.push('action-band-mismatch')
  if (base.ctaOverlapRisk) reasons.push('true-cta-subtitle-overlap-risk')
  if (
    !base.ctaOverlapRisk &&
    ctaToSubtitleVerticalGap > 10 &&
    ctaToSubtitleHorizontalOffset <= 10
  ) {
    reasons.push('cta-vs-subtitle-vertical-collision')
  }
  if (
    !base.ctaOverlapRisk &&
    ctaToSubtitleHorizontalOffset > 10 &&
    ctaToSubtitleVerticalGap <= 10
  ) {
    reasons.push('cta-vs-subtitle-horizontal-collision')
  }

  const uniqueReasons = [...new Set(reasons)]

  return {
    ...base,
    ctaToSubtitleDistance,
    ctaToSubtitleVerticalGap,
    ctaToSubtitleHorizontalOffset,
    subtitleInflationContribution,
    subtitleInflatesMainly,
    subtitleHeightContribution,
    titleHeightContribution,
    subtitleOnlyWouldPass,
    actionBandMismatch,
    ctaBelowSubtitleButAcceptable,
    ctaVsSubtitleSubtype: pickSquareCtaVsSubtitleSubtype(uniqueReasons),
    ctaVsSubtitleReasons: uniqueReasons,
  }
}

function sortFrequencyEntries<T>(counts: Record<string, number>, map: (key: string, count: number) => T): T[] {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => map(key, count))
}

function classifyMasterResidualBucket(record: PlacementSoftPolicyCandidateRecord): {
  dominantBlockerFamily: MasterResidualBlockerBucket
  dominantBlockerSubtype: string
  secondaryBlockerSubtype: string | null
  titleOnlyWouldPass: boolean
  messageClusterWouldPass: boolean
  remainingBlockerWouldBecomeMilder: boolean
  allStructuralSubtypes: string[]
} {
  if (record.format === 'landscape' && record.family === 'display') {
    const structuralSubtypes = deriveLandscapeStructuralSubtypes(record)
    const conflict = deriveLandscapeRoleConflictDetails(record)
    if (conflict.roleConflictSubtype === 'text-too-tall-for-split') {
      return {
        dominantBlockerFamily: 'landscape-text-height',
        dominantBlockerSubtype: conflict.roleConflictSubtype,
        secondaryBlockerSubtype: conflict.roleConflictReasons.find((reason) => reason !== conflict.roleConflictSubtype) || null,
        titleOnlyWouldPass: conflict.titleOnlyWouldPass,
        messageClusterWouldPass: conflict.messageClusterWouldPass,
        remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
        allStructuralSubtypes: structuralSubtypes,
      }
    }
    if (conflict.roleConflictSubtype === 'title-zone-conflict') {
      return {
        dominantBlockerFamily: 'landscape-title-zone',
        dominantBlockerSubtype: conflict.roleConflictSubtype,
        secondaryBlockerSubtype: conflict.roleConflictReasons.find((reason) => reason !== conflict.roleConflictSubtype) || null,
        titleOnlyWouldPass: conflict.titleOnlyWouldPass,
        messageClusterWouldPass: conflict.messageClusterWouldPass,
        remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
        allStructuralSubtypes: structuralSubtypes,
      }
    }
    if (conflict.ctaAnchorConflict || getLandscapeMessageDominantBlocker(record) === 'cta') {
      return {
        dominantBlockerFamily: 'landscape-cta',
        dominantBlockerSubtype: conflict.roleConflictSubtype,
        secondaryBlockerSubtype: conflict.roleConflictReasons.find((reason) => reason !== conflict.roleConflictSubtype) || null,
        titleOnlyWouldPass: conflict.titleOnlyWouldPass,
        messageClusterWouldPass: conflict.messageClusterWouldPass,
        remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
        allStructuralSubtypes: structuralSubtypes,
      }
    }
    if (getDominantViolatingRole(record) === 'image') {
      return {
        dominantBlockerFamily: 'landscape-image',
        dominantBlockerSubtype: conflict.roleConflictSubtype,
        secondaryBlockerSubtype: conflict.roleConflictReasons.find((reason) => reason !== conflict.roleConflictSubtype) || null,
        titleOnlyWouldPass: conflict.titleOnlyWouldPass,
        messageClusterWouldPass: conflict.messageClusterWouldPass,
        remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
        allStructuralSubtypes: structuralSubtypes,
      }
    }
    return {
      dominantBlockerFamily: 'landscape-role-conflict',
      dominantBlockerSubtype: conflict.roleConflictSubtype,
      secondaryBlockerSubtype: conflict.roleConflictReasons.find((reason) => reason !== conflict.roleConflictSubtype) || null,
      titleOnlyWouldPass: conflict.titleOnlyWouldPass,
      messageClusterWouldPass: conflict.messageClusterWouldPass,
      remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
      allStructuralSubtypes: structuralSubtypes,
    }
  }

  if (record.format === 'square' && record.family === 'display') {
    const dominantRole = getDominantViolatingRole(record)
    const textCluster = record.placementDiagnostics?.textCluster
    if (dominantRole === 'image') {
      const imageEntry = getEligibleRoleEntry(record, 'image')
      const imagePlacement = record.placementDiagnostics?.imagePlacement
      const subtype =
        imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy
          ? 'image-policy-near-miss'
          : imageEntry && imageEntry.allowedDistance <= 12
            ? 'image-zone-near-miss'
            : imageEntry && imageEntry.allowedDistance <= 24
              ? 'image-zone-conflict'
              : 'image-structural-mismatch'
      return {
        dominantBlockerFamily: 'square-image',
        dominantBlockerSubtype: subtype,
        secondaryBlockerSubtype: null,
        titleOnlyWouldPass: false,
        messageClusterWouldPass: false,
        remainingBlockerWouldBecomeMilder: Boolean(textCluster?.wouldBecomeMilderUnderAttachmentAwarePolicy),
        allStructuralSubtypes: [],
      }
    }
    if (dominantRole === 'text' || textCluster?.wouldBecomeMilderUnderAttachmentAwarePolicy) {
      const subtype =
        textCluster?.severeDrivenByCombinedClusterOnly || textCluster?.subtitleDetached
          ? 'combined-text-cluster'
          : 'text-zone-conflict'
      return {
        dominantBlockerFamily: 'square-text',
        dominantBlockerSubtype: subtype,
        secondaryBlockerSubtype: null,
        titleOnlyWouldPass: false,
        messageClusterWouldPass: false,
        remainingBlockerWouldBecomeMilder: Boolean(textCluster?.wouldBecomeMilderUnderAttachmentAwarePolicy),
        allStructuralSubtypes: [],
      }
    }
    return {
      dominantBlockerFamily: 'square-role-conflict',
      dominantBlockerSubtype: dominantRole,
      secondaryBlockerSubtype: null,
      titleOnlyWouldPass: false,
      messageClusterWouldPass: false,
      remainingBlockerWouldBecomeMilder: false,
      allStructuralSubtypes: [],
    }
  }

  return {
    dominantBlockerFamily: 'other',
    dominantBlockerSubtype: getDominantViolatingRole(record),
    secondaryBlockerSubtype: null,
    titleOnlyWouldPass: false,
    messageClusterWouldPass: false,
    remainingBlockerWouldBecomeMilder: false,
    allStructuralSubtypes: [],
  }
}

function buildPlacementRoleHotspotSlices(
  records: PlacementSoftPolicyCandidateRecord[],
  pickKey: (record: PlacementSoftPolicyCandidateRecord) => string
): PlacementRoleHotspotSlice[] {
  const groups = new Map<string, PlacementSoftPolicyCandidateRecord[]>()
  for (const record of records) {
    const key = pickKey(record)
    const bucket = groups.get(key) || []
    bucket.push(record)
    groups.set(key, bucket)
  }

  return [...groups.entries()]
    .map(([key, bucket]) => {
      const dominantCounts: Record<string, number> = {}
      for (const record of bucket) {
        increment(dominantCounts, getDominantViolatingRole(record))
      }
      return {
        key,
        totalRolePlacementRejections: bucket.length,
        dominantRoleCounts: Object.entries(dominantCounts)
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([role, count]) => ({ role, count })),
      }
    })
    .sort((left, right) => right.totalRolePlacementRejections - left.totalRolePlacementRejections || left.key.localeCompare(right.key))
}

function toPlacementRoleHotspotCase(record: PlacementSoftPolicyCandidateRecord): PlacementRoleHotspotCase {
  return {
    caseId: record.caseId,
    category: record.category,
    format: record.format,
    family: record.family,
    candidateId: record.candidateId,
    candidateKind: record.candidateKind,
    strategyLabel: record.strategyLabel,
    dominantRole: getDominantViolatingRole(record),
    violatingRoles: record.placementDiagnostics?.violatingRoles ?? [],
    avgAllowedDistance: record.placementDiagnostics?.avgAllowedDistance ?? 0,
    avgPreferredDistance: record.placementDiagnostics?.avgPreferredDistance ?? 0,
  }
}

export function buildPlacementSoftPolicyDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementSoftPolicyDiagnosticsReport {
  const severityCounts: Record<PlacementViolationSeverity, number> = {
    none: 0,
    mild: 0,
    moderate: 0,
    severe: 0,
  }
  const candidateKindCounts: Record<string, number> = {}

  for (const record of input.records) {
    increment(severityCounts, record.placementSeverity)
    if (record.wouldPassWithSoftPlacement) {
      increment(candidateKindCounts, record.candidateKind)
    }
  }

  const unlocked = input.records
    .filter((record) => record.wouldPassWithSoftPlacement && record.wouldBeatBaselineWithSoftPlacement)
    .sort((left, right) => {
      if (right.adjustedAggregateScore !== left.adjustedAggregateScore) {
        return right.adjustedAggregateScore - left.adjustedAggregateScore
      }
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })

  const topCaseIdsUnlockedBySoftPlacement: PlacementSoftPolicyCaseUnlock[] = unlocked.slice(0, 20).map((record) => ({
    caseId: record.caseId,
    category: record.category,
    format: record.format,
    family: record.family,
    candidateKind: record.candidateKind,
    candidateId: record.candidateId,
    strategyLabel: record.strategyLabel,
    placementSeverity: record.placementSeverity,
    adjustedAggregateScore: record.adjustedAggregateScore,
    aggregateDelta: record.aggregateDelta,
    softPlacementPenalty: record.softPlacementPenalty,
    rejectionReasons: record.rejectionReasons,
  }))

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      totalRolePlacementRejections: input.records.length,
      severityCounts,
      unlockedCandidateCount: unlocked.length,
      unlockedCaseCount: new Set(unlocked.map((record) => record.caseId)).size,
    },
    byCategory: buildPlacementAggregateSlices(input.records, (record) => record.category || 'uncategorized'),
    byFormat: buildPlacementAggregateSlices(input.records, (record) => record.format || 'unknown'),
    byFamily: buildPlacementAggregateSlices(input.records, (record) => record.family || 'unknown'),
    topCaseIdsUnlockedBySoftPlacement,
    topCandidateKindsUnlockedBySoftPlacement: Object.entries(candidateKindCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([candidateKind, count]) => ({ candidateKind, count })),
  }
}

export function buildPlacementDeepDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementDeepDiagnosticsReport {
  const topBlockedCandidates: PlacementDeepDiagnosticRow[] = [...input.records]
    .sort((left, right) => {
      const leftAvgAllowed = left.placementDiagnostics?.avgAllowedDistance ?? 0
      const rightAvgAllowed = right.placementDiagnostics?.avgAllowedDistance ?? 0
      if (rightAvgAllowed !== leftAvgAllowed) return rightAvgAllowed - leftAvgAllowed
      const leftAvgPreferred = left.placementDiagnostics?.avgPreferredDistance ?? 0
      const rightAvgPreferred = right.placementDiagnostics?.avgPreferredDistance ?? 0
      if (rightAvgPreferred !== leftAvgPreferred) return rightAvgPreferred - leftAvgPreferred
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)
    .map((record) => ({
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      placementSeverity: record.placementSeverity,
      avgAllowedDistance: record.placementDiagnostics?.avgAllowedDistance ?? 0,
      avgPreferredDistance: record.placementDiagnostics?.avgPreferredDistance ?? 0,
      violatingRoles: record.placementDiagnostics?.violatingRoles ?? [],
      perRoleDistances:
        record.placementDiagnostics?.perRole?.map((entry) => ({
          role: entry.role,
          eligible: entry.eligible,
          eligibilityReason: entry.eligibilityReason,
          allowedDistance: entry.allowedDistance,
          preferredDistance: entry.preferredDistance,
          allowedZonesCount: entry.allowedZonesCount,
          preferredZonesCount: entry.preferredZonesCount,
          zonePaddingApplied: entry.zonePaddingApplied,
          rect: entry.rect,
          allowedZones: entry.allowedZones,
          preferredZones: entry.preferredZones,
        })) ?? [],
      skippedRoles: record.placementDiagnostics?.skippedRoles ?? [],
      textBoxes: record.placementDiagnostics?.textBoxes ?? {
        titleRect: { x: 0, y: 0, w: 0, h: 0 },
        subtitleRect: { x: 0, y: 0, w: 0, h: 0 },
        combinedBoundsRect: { x: 0, y: 0, w: 0, h: 0 },
      },
    }))

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    topBlockedCandidates,
  }
}

export function buildPlacementRoleHotspots(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementRoleHotspotsReport {
  const dominantCounts: Record<string, number> = {}
  const severeRecords = input.records.filter((record) => record.placementSeverity === 'severe')
  for (const record of input.records) {
    increment(dominantCounts, getDominantViolatingRole(record))
  }

  const sortCases = (records: PlacementSoftPolicyCandidateRecord[]) =>
    records
      .sort((left, right) => {
        const rightDistance = right.placementDiagnostics?.avgAllowedDistance ?? 0
        const leftDistance = left.placementDiagnostics?.avgAllowedDistance ?? 0
        if (rightDistance !== leftDistance) return rightDistance - leftDistance
        return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
          `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
        )
      })
      .slice(0, 20)
      .map(toPlacementRoleHotspotCase)

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    dominantRoleFrequency: Object.entries(dominantCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([role, count]) => ({ role, count })),
    byCategory: buildPlacementRoleHotspotSlices(input.records, (record) => record.category || 'uncategorized'),
    byFormat: buildPlacementRoleHotspotSlices(input.records, (record) => record.format || 'unknown'),
    byFamily: buildPlacementRoleHotspotSlices(input.records, (record) => record.family || 'unknown'),
    badgeAloneSevereCases: sortCases(
      severeRecords.filter((record) => {
        const roles = record.placementDiagnostics?.violatingRoles ?? []
        return roles.length === 1 && roles[0] === 'badge'
      })
    ),
    imageAloneSevereCases: sortCases(
      severeRecords.filter((record) => {
        const roles = record.placementDiagnostics?.violatingRoles ?? []
        return roles.length === 1 && roles[0] === 'image'
      })
    ),
    badgeImageSevereCases: sortCases(
      severeRecords.filter((record) => {
        const roles = new Set(record.placementDiagnostics?.violatingRoles ?? [])
        return roles.has('badge') && roles.has('image')
      })
    ),
  }
}

function isLikelyImageStrategy(record: PlacementSoftPolicyCandidateRecord) {
  return (
    record.candidateKind === 'image-balance-repair' ||
    record.candidateKind === 'guided-regeneration-repair' ||
    ['image', 'overlay', 'hero', 'split'].some((token) =>
      record.strategyLabel.toLowerCase().includes(token)
    )
  )
}

function classifyImageDistanceBand(distance: number) {
  if (distance <= 8) return 'just-outside'
  if (distance <= 20) return 'moderately-outside'
  return 'fundamentally-far'
}

export function buildPlacementImageSquareDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementImageSquareDiagnosticsReport {
  const squareDisplayRecords = input.records.filter(
    (record) => record.format === 'square' && record.family === 'display'
  )
  const imageDominantRecords = squareDisplayRecords.filter(
    (record) => getDominantViolatingRole(record) === 'image'
  )
  const improvedImageRecords = squareDisplayRecords.filter((record) => {
    const imageRole =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'image') || null
    if (!imageRole) return false
    return (
      isLikelyImageStrategy(record) &&
      record.aggregateDelta > 0 &&
      imageRole.zonePaddingApplied > 0 &&
      imageRole.allowedDistance <= 12
    )
  })

  const toImageDiagnosticRow = (
    record: PlacementSoftPolicyCandidateRecord
  ): PlacementImageSquareDiagnosticRow => {
    const imageRole =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'image') || null
    const likelyAlignedWithStrategy = isLikelyImageStrategy(record)
    const preservesCompositionBalance =
      record.aggregateDelta >= 0 &&
      record.perceptualQuality >= 50 &&
      !record.penaltyTags.includes('weak-balance') &&
      !record.penaltyTags.includes('weak-image-footprint')

    return {
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      dominantRole: getDominantViolatingRole(record),
      imageRect: imageRole?.rect || null,
      baselineImageRect: record.baselineImageRect,
      allowedImageZones: imageRole?.allowedZones || [],
      preferredImageZones: imageRole?.preferredZones || [],
      allowedDistance: imageRole?.allowedDistance || 0,
      preferredDistance: imageRole?.preferredDistance || 0,
      zonePaddingApplied: imageRole?.zonePaddingApplied || 0,
      preservesCompositionBalance,
      likelyAlignedWithStrategy,
      isImageBalanceRepair: record.candidateKind === 'image-balance-repair',
      isGuidedRegenerationRepair: record.candidateKind === 'guided-regeneration-repair',
      imageMovedRelativeToBaseline: record.imageMovedRelativeToBaseline,
      improvedAggregateScore: record.aggregateDelta > 0,
      aggregateDelta: record.aggregateDelta,
    }
  }

  const topBlockedCandidates: PlacementImageSquareDiagnosticRow[] = [...imageDominantRecords]
    .sort((left, right) => {
      const rightDistance =
        right.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
      const leftDistance =
        left.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
      if (rightDistance !== leftDistance) return rightDistance - leftDistance
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)
    .map(toImageDiagnosticRow)

  const topImprovedCandidates: PlacementImageSquareDiagnosticRow[] = [...improvedImageRecords]
    .sort((left, right) => {
      const leftDistance =
        left.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
      const rightDistance =
        right.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      const leftImageDominant = getDominantViolatingRole(left) === 'image' ? 1 : 0
      const rightImageDominant = getDominantViolatingRole(right) === 'image' ? 1 : 0
      if (leftImageDominant !== rightImageDominant) return leftImageDominant - rightImageDominant
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)
    .map(toImageDiagnosticRow)

  const imageOnlyDominantCount = imageDominantRecords.filter((record) => {
    const roles = record.placementDiagnostics?.violatingRoles ?? []
    return roles.length === 1 && roles[0] === 'image'
  }).length
  const imageNoLongerDominantCount = improvedImageRecords.filter(
    (record) => getDominantViolatingRole(record) !== 'image'
  ).length

  const justOutsideZoneCount = imageDominantRecords.filter((record) => {
    const distance =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
    return classifyImageDistanceBand(distance) === 'just-outside'
  }).length
  const moderatelyOutsideZoneCount = imageDominantRecords.filter((record) => {
    const distance =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
    return classifyImageDistanceBand(distance) === 'moderately-outside'
  }).length
  const fundamentallyFarCount = imageDominantRecords.filter((record) => {
    const distance =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
    return classifyImageDistanceBand(distance) === 'fundamentally-far'
  }).length

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      squareDisplayBlockedCandidates: squareDisplayRecords.length,
      dominantImageCount: imageDominantRecords.length,
      imageOnlyDominantCount,
      justOutsideZoneCount,
      moderatelyOutsideZoneCount,
      fundamentallyFarCount,
      improvedImageCandidateCount: improvedImageRecords.length,
      imageNoLongerDominantCount,
    },
    topBlockedCandidates,
    topImprovedCandidates,
  }
}

export function buildPlacementImageLandscapeDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementImageLandscapeDiagnosticsReport {
  const landscapeDisplayRecords = input.records.filter(
    (record) => record.format === 'landscape' && record.family === 'display'
  )
  const imageDominantRecords = landscapeDisplayRecords.filter(
    (record) => getDominantViolatingRole(record) === 'image'
  )

  const toLandscapeImageRow = (
    record: PlacementSoftPolicyCandidateRecord
  ): PlacementImageLandscapeDiagnosticRow => {
    const imageRole =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'image') || null
    const imagePlacement = record.placementDiagnostics?.imagePlacement
    const candidateImageRect = imageRole?.rect || null
    const baselineImageRect = record.baselineImageRect
    const imageDeltaX = round((candidateImageRect?.x || 0) - (baselineImageRect?.x || 0))
    const imageDeltaY = round((candidateImageRect?.y || 0) - (baselineImageRect?.y || 0))
    const imageDeltaW = round((candidateImageRect?.w || 0) - (baselineImageRect?.w || 0))
    const imageDeltaH = round((candidateImageRect?.h || 0) - (baselineImageRect?.h || 0))
    const preservesVisualBalance = record.perceptualQuality >= 58
    const supportsTextCtaCluster = Boolean(imagePlacement?.supportsReadingFlow)
    const movedTowardCoherentSplitLayout =
      Boolean(imagePlacement?.matchesLandscapeSplitPattern) &&
      (Math.abs(imageDeltaX) > 1 || Math.abs(imageDeltaW) > 1 || record.imageMovedRelativeToBaseline)
    return {
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      dominantRole: getDominantViolatingRole(record),
      baselineImageRect,
      candidateImageRect,
      imageDeltaX,
      imageDeltaY,
      imageDeltaW,
      imageDeltaH,
      allowedImageZones: imageRole?.allowedZones || [],
      preferredImageZones: imageRole?.preferredZones || [],
      allowedDistance: imageRole?.allowedDistance || 0,
      preferredDistance: imageRole?.preferredDistance || 0,
      rawAllowedDistance: imagePlacement?.rawAllowedDistance ?? (imageRole?.allowedDistance || 0),
      rawPreferredDistance: imagePlacement?.rawPreferredDistance ?? (imageRole?.preferredDistance || 0),
      zonePaddingApplied: imageRole?.zonePaddingApplied || 0,
      preservesVisualBalance,
      supportsTextCtaCluster,
      movedTowardCoherentSplitLayout,
      imageDominantBlockingRole: getDominantViolatingRole(record) === 'image',
      wouldBecomeMilderUnderLandscapeImagePolicy:
        imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy ?? false,
      splitSideOccupancy: imagePlacement?.splitSideOccupancy ?? 0,
      supportsReadingFlow: imagePlacement?.supportsReadingFlow ?? false,
      matchesLandscapeSplitPattern: imagePlacement?.matchesLandscapeSplitPattern ?? false,
      structurallyAcceptableFootprint: imagePlacement?.structurallyAcceptableFootprint ?? false,
      justOutsideCurrentZones:
        classifyImageDistanceBand(imagePlacement?.rawAllowedDistance ?? (imageRole?.allowedDistance || 0)) ===
        'just-outside',
      improvedAggregateScore: record.aggregateDelta > 0,
      aggregateDelta: record.aggregateDelta,
    }
  }

  const topBlockedCandidates = [...imageDominantRecords]
    .sort((left, right) => {
      const rightDistance =
        right.placementDiagnostics?.imagePlacement?.rawAllowedDistance ??
        right.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ??
        0
      const leftDistance =
        left.placementDiagnostics?.imagePlacement?.rawAllowedDistance ??
        left.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ??
        0
      if (rightDistance !== leftDistance) return rightDistance - leftDistance
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)
    .map(toLandscapeImageRow)

  const improvedImageRecords = landscapeDisplayRecords.filter((record) => {
    const imagePlacement = record.placementDiagnostics?.imagePlacement
    return Boolean(imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy || record.aggregateDelta > 0)
  })

  const topImprovedCandidates = [...improvedImageRecords]
    .sort((left, right) => {
      const leftImproved = left.placementDiagnostics?.imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy ? 1 : 0
      const rightImproved =
        right.placementDiagnostics?.imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy ? 1 : 0
      if (rightImproved !== leftImproved) return rightImproved - leftImproved
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      const leftDistance =
        left.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
      const rightDistance =
        right.placementDiagnostics?.perRole.find((entry) => entry.role === 'image')?.allowedDistance ?? 0
      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)
    .map(toLandscapeImageRow)

  const imageOnlyDominantCount = imageDominantRecords.filter((record) => {
    const roles = record.placementDiagnostics?.violatingRoles ?? []
    return roles.length === 1 && roles[0] === 'image'
  }).length
  const imageOnlySevereCount = imageDominantRecords.filter((record) => {
    const roles = record.placementDiagnostics?.violatingRoles ?? []
    return record.placementSeverity === 'severe' && roles.length === 1 && roles[0] === 'image'
  }).length
  const justOutsideZoneCount = imageDominantRecords.filter((record) => {
    const distance = record.placementDiagnostics?.imagePlacement?.rawAllowedDistance ?? 0
    return classifyImageDistanceBand(distance) === 'just-outside'
  }).length
  const moderatelyOutsideZoneCount = imageDominantRecords.filter((record) => {
    const distance = record.placementDiagnostics?.imagePlacement?.rawAllowedDistance ?? 0
    return classifyImageDistanceBand(distance) === 'moderately-outside'
  }).length
  const fundamentallyFarCount = imageDominantRecords.filter((record) => {
    const distance = record.placementDiagnostics?.imagePlacement?.rawAllowedDistance ?? 0
    return classifyImageDistanceBand(distance) === 'fundamentally-far'
  }).length

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      landscapeDisplayBlockedCandidates: landscapeDisplayRecords.length,
      dominantImageCount: imageDominantRecords.length,
      imageOnlyDominantCount,
      imageOnlySevereCount,
      justOutsideZoneCount,
      moderatelyOutsideZoneCount,
      fundamentallyFarCount,
      improvedImageCandidateCount: improvedImageRecords.length,
      wouldBecomeMilderCount: improvedImageRecords.filter(
        (record) => record.placementDiagnostics?.imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy
      ).length,
    },
    topBlockedCandidates,
    topImprovedCandidates,
  }
}

export function buildLandscapeImageNearMissExperiment(input: {
  root: string
  rows: CaseReviewNormalizedRow[]
  records: PlacementSoftPolicyCandidateRecord[]
}): LandscapeImageNearMissExperimentReport {
  const landscapeRecords = input.records.filter(
    (record) => record.format === 'landscape' && record.family === 'display'
  )
  const eligible = landscapeRecords.filter((record) => record.nearMissOverrideEligible)
  const flipped = eligible
    .filter((record) => record.wouldWinUnderNearMissOverride)
    .sort((left, right) => {
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      if (right.candidateConfidence !== left.candidateConfidence) {
        return right.candidateConfidence - left.candidateConfidence
      }
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })

  const currentCandidateWins = input.rows.filter((row) => row.baselineWon === false).length
  const currentBaselineWins = input.rows.filter((row) => row.baselineWon !== false).length
  const flippedCaseIds = [...new Set(flipped.map((record) => record.caseId))]
  const candidateWinCountSimulated = currentCandidateWins + flippedCaseIds.length

  const toRow = (record: PlacementSoftPolicyCandidateRecord) => ({
    caseId: record.caseId,
    category: record.category,
    format: record.format,
    family: record.family,
    candidateId: record.candidateId,
    candidateKind: record.candidateKind,
    strategyLabel: record.strategyLabel,
    aggregateDelta: record.aggregateDelta,
    baselineConfidence: record.baselineConfidence,
    candidateConfidence: record.candidateConfidence,
    nearMissOverrideEligible: record.nearMissOverrideEligible,
    nearMissOverrideBlockedReasons: record.nearMissOverrideBlockedReasons,
    nearMissOverrideSafeguardsSatisfied: record.nearMissOverrideSafeguardsSatisfied,
    wouldWinUnderNearMissOverride: record.wouldWinUnderNearMissOverride,
  })

  const byCategory = [...new Set(landscapeRecords.map((record) => record.category || 'uncategorized'))]
    .map((key) => {
      const bucket = landscapeRecords.filter((record) => (record.category || 'uncategorized') === key)
      return {
        key,
        eligibleCandidates: bucket.filter((record) => record.nearMissOverrideEligible).length,
        flippedCases: new Set(
          bucket.filter((record) => record.wouldWinUnderNearMissOverride).map((record) => record.caseId)
        ).size,
      }
    })
    .sort((left, right) => right.eligibleCandidates - left.eligibleCandidates || left.key.localeCompare(right.key))

  const byCandidateKind = Object.entries(
    eligible.reduce<Record<string, number>>((acc, record) => {
      acc[record.candidateKind] = (acc[record.candidateKind] || 0) + 1
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([candidateKind, count]) => ({ candidateKind, count }))

  const safeguardBlockedCandidates = landscapeRecords
    .filter((record) => !record.nearMissOverrideEligible)
    .sort((left, right) => {
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)
    .map(toRow)

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    comparison: {
      baselineWinCountCurrent: currentBaselineWins,
      candidateWinCountCurrent: currentCandidateWins,
      candidateWinCountSimulated,
      changedCasesCount: flippedCaseIds.length,
    },
    totals: {
      eligibleCandidates: eligible.length,
      eligibleCases: new Set(eligible.map((record) => record.caseId)).size,
      flippedCases: flippedCaseIds.length,
    },
    byCategory,
    byCandidateKind,
    topCaseIds: flippedCaseIds.slice(0, 20),
    flippedCases: flipped.slice(0, 20).map(toRow),
    safeguardBlockedCandidates,
  }
}

export function buildLandscapeTextHeightProductionExperiment(input: {
  root: string
  rows: CaseReviewNormalizedRow[]
  records: PlacementSoftPolicyCandidateRecord[]
}): LandscapeTextHeightProductionExperimentReport {
  const landscapeRecords = input.records.filter(
    (record) =>
      record.format === 'landscape' &&
      record.family === 'display' &&
      record.landscapeTextHeightNearMissBlockerFamily === 'landscape-text-height'
  )

  const toFailures = (safeguards: Record<string, boolean>) =>
    Object.entries(safeguards)
      .filter(([, passed]) => !passed)
      .map(([key]) => key)
      .sort((left, right) => left.localeCompare(right))

  const toRow = (record: PlacementSoftPolicyCandidateRecord): LandscapeTextHeightProductionExperimentCase => ({
    caseId: record.caseId,
    category: record.category,
    format: record.format,
    family: record.family,
    candidateId: record.candidateId,
    candidateKind: record.candidateKind,
    strategyLabel: record.strategyLabel,
    blockerFamily: record.landscapeTextHeightNearMissBlockerFamily || null,
    blockerSubtype: record.landscapeTextHeightNearMissBlockerSubtype || null,
    severity: record.placementSeverity,
    baselineAggregate: round((record.aggregateScore ?? record.adjustedAggregateScore) - record.aggregateDelta),
    candidateAggregate: record.aggregateScore ?? record.adjustedAggregateScore,
    aggregateDelta: record.aggregateDelta,
    baselineConfidence: record.baselineConfidence,
    candidateConfidence: record.candidateConfidence,
    confidenceDelta: round(record.candidateConfidence - record.baselineConfidence),
    nearMissOverrideEligible: Boolean(record.landscapeTextHeightNearMissEligible),
    nearMissOverrideApplied: Boolean(record.landscapeTextHeightNearMissApplied),
    nearMissOverrideReason: record.landscapeTextHeightNearMissReason || null,
    safeguardResults: record.landscapeTextHeightNearMissSafeguardResults || {},
    safeguardFailures: toFailures(record.landscapeTextHeightNearMissSafeguardResults || {}),
    finalWinnerChangedByOverride: Boolean(record.finalWinnerChangedByOverride),
  })

  const eligible = landscapeRecords
    .filter((record) => record.landscapeTextHeightNearMissEligible)
    .sort((left, right) => {
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      if (right.candidateConfidence !== left.candidateConfidence) {
        return right.candidateConfidence - left.candidateConfidence
      }
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })

  const applied = eligible.filter((record) => record.landscapeTextHeightNearMissApplied)
  const flipped = applied.filter((record) => record.finalWinnerChangedByOverride)
  const safeguardFailures = landscapeRecords
    .filter((record) => !record.landscapeTextHeightNearMissEligible)
    .sort((left, right) => {
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      if (right.candidateConfidence !== left.candidateConfidence) {
        return right.candidateConfidence - left.candidateConfidence
      }
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    comparison: {
      baselineWinCountCurrent: input.rows.filter((row) => row.baselineWon !== false).length,
      candidateWinCountCurrent: input.rows.filter((row) => row.baselineWon === false).length,
      flippedCasesCount: new Set(flipped.map((record) => record.caseId)).size,
    },
    totals: {
      eligibleCandidates: eligible.length,
      eligibleCases: new Set(eligible.map((record) => record.caseId)).size,
      appliedOverrides: applied.length,
      flippedCases: new Set(flipped.map((record) => record.caseId)).size,
    },
    flippedCases: flipped.map(toRow),
    appliedOverrides: applied.map(toRow),
    eligibleCandidates: eligible.map(toRow),
    safeguardFailures: safeguardFailures.map(toRow),
  }
}

function buildBestRejectedRecordMap(input: {
  bestRejectedCandidates: BestRejectedCandidateRow[]
  records: PlacementSoftPolicyCandidateRecord[]
}) {
  const bestRejectedByCase = new Map(
    input.bestRejectedCandidates.map((row) => [row.caseId, row.bestRejectedCandidate])
  )
  const recordsByCase = new Map<string, PlacementSoftPolicyCandidateRecord[]>()
  for (const record of input.records) {
    const bucket = recordsByCase.get(record.caseId) || []
    bucket.push(record)
    recordsByCase.set(record.caseId, bucket)
  }

  const pickRecord = (caseId: string) => {
    const bestRejected = bestRejectedByCase.get(caseId) || null
    return (
      (bestRejected
        ? (recordsByCase.get(caseId) || []).find(
            (record) =>
              record.candidateId === bestRejected.candidateId &&
              record.candidateKind === bestRejected.candidateKind
          )
        : null) ||
      (recordsByCase.get(caseId) || [])
        .slice()
        .sort((left, right) => {
          if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
          if (right.effectiveScore !== left.effectiveScore) return right.effectiveScore - left.effectiveScore
          return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
            `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
          )
        })[0] ||
      null
    )
  }

  return {
    pickRecord,
  }
}

export function buildPlacementBadgeLandscapeDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementBadgeLandscapeDiagnosticsReport {
  const landscapeDisplayRecords = input.records.filter(
    (record) => record.format === 'landscape' && record.family === 'display'
  )
  const badgeDominantRecords = landscapeDisplayRecords.filter(
    (record) => getDominantViolatingRole(record) === 'badge'
  )

  const wouldBeAcceptableIfBadgeIgnored = (record: PlacementSoftPolicyCandidateRecord) => {
    const nonBadgeMaxDistance = Math.max(
      0,
      ...(record.placementDiagnostics?.perRole || [])
        .filter((entry) => entry.eligible && entry.role !== 'badge')
        .map((entry) => Math.max(entry.allowedDistance, entry.preferredDistance))
    )
    return (
      Boolean(record.placementDiagnostics?.badgeLikelyOptional) &&
      nonBadgeMaxDistance <= 12 &&
      record.aggregateDelta >= 0
    )
  }

  const toBadgeDiagnosticRow = (
    record: PlacementSoftPolicyCandidateRecord
  ): PlacementBadgeLandscapeDiagnosticRow => {
    const badgeRole =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'badge') || null
    return {
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      dominantRole: getDominantViolatingRole(record),
      badgeRect: badgeRole?.rect || null,
      allowedBadgeZones: badgeRole?.allowedZones || [],
      preferredBadgeZones: badgeRole?.preferredZones || [],
      allowedDistance: badgeRole?.allowedDistance || 0,
      preferredDistance: badgeRole?.preferredDistance || 0,
      zonePaddingApplied: badgeRole?.zonePaddingApplied || 0,
      badgeSemanticallyActive: Boolean(record.placementDiagnostics?.badgeSemanticallyActive),
      badgeVisuallyCritical: Boolean(record.placementDiagnostics?.badgeVisuallyCritical),
      badgeAffectsCoreReadingFlow: Boolean(record.placementDiagnostics?.badgeAffectsCoreReadingFlow),
      badgeLikelyOptional: Boolean(record.placementDiagnostics?.badgeLikelyOptional),
      wouldBeAcceptableIfBadgeIgnored: wouldBeAcceptableIfBadgeIgnored(record),
      improvedAggregateScore: record.aggregateDelta > 0,
      aggregateDelta: record.aggregateDelta,
    }
  }

  const topBlockedCandidates = [...badgeDominantRecords]
    .sort((left, right) => {
      const rightDistance =
        right.placementDiagnostics?.perRole.find((entry) => entry.role === 'badge')?.allowedDistance ?? 0
      const leftDistance =
        left.placementDiagnostics?.perRole.find((entry) => entry.role === 'badge')?.allowedDistance ?? 0
      if (rightDistance !== leftDistance) return rightDistance - leftDistance
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)
    .map(toBadgeDiagnosticRow)

  const improvedBadgeRecords = landscapeDisplayRecords.filter((record) => {
    const badgeRole =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'badge') || null
    if (!badgeRole) return false
    return (
      record.aggregateDelta > 0 &&
      badgeRole.zonePaddingApplied > 0 &&
      badgeRole.allowedDistance <= 12
    )
  })

  const topImprovedCandidates = [...improvedBadgeRecords]
    .sort((left, right) => {
      const leftDistance =
        left.placementDiagnostics?.perRole.find((entry) => entry.role === 'badge')?.allowedDistance ?? 0
      const rightDistance =
        right.placementDiagnostics?.perRole.find((entry) => entry.role === 'badge')?.allowedDistance ?? 0
      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)
    .map(toBadgeDiagnosticRow)

  const badgeAloneSevereCount = badgeDominantRecords.filter((record) => {
    const roles = record.placementDiagnostics?.violatingRoles ?? []
    return record.placementSeverity === 'severe' && roles.length === 1 && roles[0] === 'badge'
  }).length

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      landscapeDisplayBlockedCandidates: landscapeDisplayRecords.length,
      dominantBadgeCount: badgeDominantRecords.length,
      badgeAloneSevereCount,
      semanticallyActiveCount: landscapeDisplayRecords.filter((record) => record.placementDiagnostics?.badgeSemanticallyActive).length,
      visuallyCriticalCount: landscapeDisplayRecords.filter((record) => record.placementDiagnostics?.badgeVisuallyCritical).length,
      likelyOptionalCount: landscapeDisplayRecords.filter((record) => record.placementDiagnostics?.badgeLikelyOptional).length,
      acceptableIfBadgeIgnoredCount: landscapeDisplayRecords.filter((record) => wouldBeAcceptableIfBadgeIgnored(record)).length,
    },
    topBlockedCandidates,
    topImprovedCandidates,
  }
}

export function buildPlacementTextSquareDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementTextSquareDiagnosticsReport {
  const squareDisplayRecords = input.records.filter(
    (record) => record.format === 'square' && record.family === 'display'
  )
  const textDominantRecords = squareDisplayRecords.filter(
    (record) => getDominantViolatingRole(record) === 'text'
  )

  const toTextDiagnosticRow = (
    record: PlacementSoftPolicyCandidateRecord
  ): PlacementTextSquareDiagnosticRow => {
    const textRole =
      record.placementDiagnostics?.perRole.find((entry) => entry.role === 'text') || null
    const textCluster = record.placementDiagnostics?.textCluster
    const textBoxes = record.placementDiagnostics?.textBoxes
    const titleRect = textBoxes?.titleRect || null
    const subtitleRect = textBoxes?.subtitleRect || null
    const combinedTextRect = textBoxes?.combinedBoundsRect || null
    const allowedTextZones = textRole?.allowedZones || []
    const preferredTextZones = textRole?.preferredZones || []
    const titleBottom = titleRect ? titleRect.y + titleRect.h : 0
    const titleSubtitleVerticalGap = titleRect && subtitleRect ? round(subtitleRect.y - titleBottom) : 0
    const clusterHeight = combinedTextRect?.h || 0
    const clusterWidth = combinedTextRect?.w || 0
    const subtitleHeightContribution =
      titleRect && combinedTextRect ? Math.max(combinedTextRect.h - titleRect.h, 0) : 0
    const combinedInflatedMainlyBySubtitle =
      Boolean(subtitleRect && titleRect) &&
      subtitleHeightContribution >= Math.max(4, titleRect.h * 0.25) &&
      subtitleRect.w <= titleRect.w * 0.7
    const titleOnlyAllowedDistance = round(getMinDistanceToZones(titleRect, allowedTextZones))
    const titleOnlyPreferredDistance = round(getMinDistanceToZones(titleRect, preferredTextZones))
    const combinedAllowedDistance = textCluster?.combinedAllowedDistance ?? (textRole?.allowedDistance || 0)
    const combinedPreferredDistance = textCluster?.combinedPreferredDistance ?? (textRole?.preferredDistance || 0)
    const titleOnlyWouldFitBetterThanCombined =
      titleOnlyAllowedDistance < combinedAllowedDistance ||
      titleOnlyPreferredDistance < combinedPreferredDistance
    const clusterRemainsCoherent =
      Boolean(titleRect && subtitleRect) &&
      titleSubtitleVerticalGap >= -2 &&
      titleSubtitleVerticalGap <= 18 &&
      Math.abs((titleRect?.x || 0) - (subtitleRect?.x || 0)) <= 8
    const preservesReadingFlow =
      Boolean(titleRect && subtitleRect) &&
      titleRect.y <= subtitleRect.y &&
      titleRect.x <= subtitleRect.x + 4 &&
      titleSubtitleVerticalGap >= -2 &&
      titleSubtitleVerticalGap <= 20
    const likelyAlignedWithStrategy = getTextStrategyAlignment(record)
    const combinedBoundsMainReason =
      titleOnlyWouldFitBetterThanCombined &&
      (combinedAllowedDistance - titleOnlyAllowedDistance >= 3 ||
        combinedPreferredDistance - titleOnlyPreferredDistance >= 3)

    return {
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      dominantRole: getDominantViolatingRole(record),
      titleRect,
      subtitleRect,
      combinedTextRect,
      allowedTextZones,
      preferredTextZones,
      allowedDistance: textRole?.allowedDistance || 0,
      preferredDistance: textRole?.preferredDistance || 0,
      combinedAllowedDistance,
      combinedPreferredDistance,
      zonePaddingApplied: textRole?.zonePaddingApplied || 0,
      titleOnlyAllowedDistance,
      titleOnlyPreferredDistance,
      titlePlacementDistance: textCluster?.titlePlacementDistance ?? titleOnlyAllowedDistance,
      subtitleAttachmentDistance: textCluster?.subtitleAttachmentDistance ?? 0,
      subtitleInflationContribution:
        textCluster?.subtitleInflationContribution ?? round(Math.max(0, subtitleHeightContribution)),
      titleSubtitleVerticalGap,
      clusterHeight,
      clusterWidth,
      combinedClusterFootprint: textCluster?.combinedClusterFootprint ?? 0,
      clusterRemainsCoherent,
      preservesReadingFlow,
      likelyAlignedWithStrategy,
      combinedInflatedMainlyBySubtitle,
      titleDominatesMainTextPlacement: textCluster?.titleDominatesMainTextPlacement ?? false,
      subtitleDetached: textCluster?.subtitleDetached ?? false,
      titleOnlyWouldFitBetterThanCombined,
      combinedBoundsMainReason,
      severeDrivenByCombinedClusterOnly: textCluster?.severeDrivenByCombinedClusterOnly ?? false,
      wouldBecomeMilderUnderAttachmentAwarePolicy:
        textCluster?.wouldBecomeMilderUnderAttachmentAwarePolicy ?? false,
      improvedAggregateScore: record.aggregateDelta > 0,
      aggregateDelta: record.aggregateDelta,
    }
  }

  const topBlockedCandidates = [...textDominantRecords]
    .sort((left, right) => {
      const rightDistance =
        right.placementDiagnostics?.perRole.find((entry) => entry.role === 'text')?.allowedDistance ?? 0
      const leftDistance =
        left.placementDiagnostics?.perRole.find((entry) => entry.role === 'text')?.allowedDistance ?? 0
      if (rightDistance !== leftDistance) return rightDistance - leftDistance
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)
    .map(toTextDiagnosticRow)

  const improvedTextRecords = textDominantRecords.filter((record) => record.aggregateDelta > 0)
  const topImprovedCandidates = [...improvedTextRecords]
    .sort((left, right) => {
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      const leftDistance =
        left.placementDiagnostics?.perRole.find((entry) => entry.role === 'text')?.allowedDistance ?? 0
      const rightDistance =
        right.placementDiagnostics?.perRole.find((entry) => entry.role === 'text')?.allowedDistance ?? 0
      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)
    .map(toTextDiagnosticRow)

  const textOnlyDominantCount = textDominantRecords.filter((record) => {
    const roles = record.placementDiagnostics?.violatingRoles ?? []
    return roles.length === 1 && roles[0] === 'text'
  }).length

  const diagnosticRows = textDominantRecords.map(toTextDiagnosticRow)

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      squareDisplayBlockedCandidates: squareDisplayRecords.length,
      dominantTextCount: textDominantRecords.length,
      textOnlyDominantCount,
      combinedBoundsSevereCount: diagnosticRows.filter(
        (row) =>
          row.severeDrivenByCombinedClusterOnly ||
          (row.combinedBoundsMainReason && row.combinedAllowedDistance > 6)
      ).length,
      titleOnlyMilderThanCombinedCount: diagnosticRows.filter((row) => row.titleOnlyWouldFitBetterThanCombined).length,
      improvedTextCandidateCount: improvedTextRecords.length,
      wouldBecomeMilderCount: diagnosticRows.filter((row) => row.wouldBecomeMilderUnderAttachmentAwarePolicy).length,
    },
    topBlockedCandidates,
    topImprovedCandidates,
  }
}

export function buildPlacementTextLandscapeDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementTextLandscapeDiagnosticsReport {
  const landscapeDisplayRecords = input.records.filter(
    (record) => record.format === 'landscape' && record.family === 'display'
  )
  const textClusterRecords = landscapeDisplayRecords.filter((record) =>
    ['text', 'cta'].includes(getDominantViolatingRole(record))
  )

  const toLandscapeRow = (
    record: PlacementSoftPolicyCandidateRecord
  ): PlacementTextLandscapeDiagnosticRow => {
    const textRole = record.placementDiagnostics?.perRole.find((entry) => entry.role === 'text') || null
    const ctaRole = record.placementDiagnostics?.perRole.find((entry) => entry.role === 'cta') || null
    const textBoxes = record.placementDiagnostics?.textBoxes
    const cluster = record.placementDiagnostics?.landscapeTextCluster
    const titleRect = textBoxes?.titleRect || null
    const subtitleRect = textBoxes?.subtitleRect || null
    const ctaRect = ctaRole?.rect || null
    const combinedTextRect =
      titleRect && subtitleRect && ctaRect
        ? {
            x: Math.min(titleRect.x, subtitleRect.x, ctaRect.x),
            y: Math.min(titleRect.y, subtitleRect.y, ctaRect.y),
            w:
              Math.max(titleRect.x + titleRect.w, subtitleRect.x + subtitleRect.w, ctaRect.x + ctaRect.w) -
              Math.min(titleRect.x, subtitleRect.x, ctaRect.x),
            h:
              Math.max(titleRect.y + titleRect.h, subtitleRect.y + subtitleRect.h, ctaRect.y + ctaRect.h) -
              Math.min(titleRect.y, subtitleRect.y, ctaRect.y),
          }
        : null
    const criticalIssues = deriveLandscapeCriticalIssues(record)

    return {
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      dominantRole: getLandscapeClusterDominantBlocker(record),
      titleRect,
      subtitleRect,
      ctaRect,
      combinedTextRect,
      allowedTextZones: textRole?.allowedZones || [],
      preferredTextZones: textRole?.preferredZones || [],
      titlePlacementDistance: cluster?.titlePlacementDistance ?? 0,
      titlePreferredDistance: cluster?.titlePreferredDistance ?? 0,
      subtitleAttachmentDistance: cluster?.subtitleAttachmentDistance ?? 0,
      ctaAttachmentDistance: cluster?.ctaAttachmentDistance ?? 0,
      ctaAttachmentSeverity: cluster?.ctaAttachmentSeverity ?? 'none',
      ctaWithinSplitLayoutTolerance: cluster?.ctaWithinSplitLayoutTolerance ?? false,
      ctaReadingFlowContinuity: cluster?.ctaReadingFlowContinuity ?? 0,
      ctaMessageAssociationScore: cluster?.ctaMessageAssociationScore ?? 0,
      disconnectDrivenPrimarilyByGap: cluster?.disconnectDrivenPrimarilyByGap ?? false,
      disconnectDrivenPrimarilyByHorizontalOffset:
        cluster?.disconnectDrivenPrimarilyByHorizontalOffset ?? false,
      combinedAllowedDistance: cluster?.combinedAllowedDistance ?? (textRole?.allowedDistance || 0),
      combinedPreferredDistance: cluster?.combinedPreferredDistance ?? (textRole?.preferredDistance || 0),
      clusterFootprint: cluster?.clusterFootprint ?? 0,
      titleDominatesMainTextPlacement: cluster?.titleDominatesMainTextPlacement ?? false,
      subtitleDetached: cluster?.subtitleDetached ?? false,
      ctaDetached: cluster?.ctaDetached ?? false,
      textImageSplitCoherent: cluster?.textImageSplitCoherent ?? true,
      fullClusterCoherent: cluster?.fullClusterCoherent ?? true,
      severeDrivenByCombinedClusterOnly: cluster?.severeDrivenByCombinedClusterOnly ?? false,
      wouldBecomeMilderUnderAttachmentAwarePolicy:
        cluster?.wouldBecomeMilderUnderAttachmentAwarePolicy ?? false,
      wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy:
        cluster?.wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy ?? false,
      titleSubtitleVerticalGap: cluster?.titleSubtitleVerticalGap ?? 0,
      titleSubtitleHorizontalOffset: cluster?.titleSubtitleHorizontalOffset ?? 0,
      titleCtaDistance: cluster?.titleCtaDistance ?? 0,
      subtitleCtaDistance: cluster?.subtitleCtaDistance ?? 0,
      subtitleInflationContribution: cluster?.subtitleInflationContribution ?? 0,
      criticalIssues,
      aggregateDelta: record.aggregateDelta,
      confidenceDelta: round(record.candidateConfidence - record.baselineConfidence),
    }
  }

  const diagnosticRows = textClusterRecords.map(toLandscapeRow)
  const topBlockedCandidates = [...diagnosticRows]
    .sort((left, right) => {
      if (right.combinedAllowedDistance !== left.combinedAllowedDistance) {
        return right.combinedAllowedDistance - left.combinedAllowedDistance
      }
      if (right.ctaAttachmentDistance !== left.ctaAttachmentDistance) {
        return right.ctaAttachmentDistance - left.ctaAttachmentDistance
      }
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)

  const topAttachmentCandidates = [...diagnosticRows]
    .filter((row) => row.subtitleDetached || row.ctaDetached || !row.fullClusterCoherent)
    .sort((left, right) => {
      const rightAttachment = Math.max(right.subtitleAttachmentDistance, right.ctaAttachmentDistance)
      const leftAttachment = Math.max(left.subtitleAttachmentDistance, left.ctaAttachmentDistance)
      if (rightAttachment !== leftAttachment) return rightAttachment - leftAttachment
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)

  const dominantBlockerFrequency = Object.entries(
    diagnosticRows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.dominantRole)
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([blocker, count]) => ({ blocker, count }))

  const criticalIssueFrequency = Object.entries(
    diagnosticRows.reduce<Record<string, number>>((acc, row) => {
      for (const issue of row.criticalIssues) increment(acc, issue)
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([issue, count]) => ({ issue, count }))

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      landscapeDisplayBlockedCandidates: landscapeDisplayRecords.length,
      dominantTextCount: diagnosticRows.filter((row) => row.dominantRole === 'title-placement').length,
      dominantCtaCount: diagnosticRows.filter((row) => row.dominantRole === 'cta-detachment').length,
      titleFineButAttachmentWeakCount: diagnosticRows.filter(
        (row) =>
          row.titlePlacementDistance <= 6 &&
          (row.subtitleDetached || row.ctaDetached || !row.fullClusterCoherent)
      ).length,
      combinedClusterDrivenCount: diagnosticRows.filter((row) => row.severeDrivenByCombinedClusterOnly).length,
      ctaDetachedMainCount: diagnosticRows.filter((row) => row.ctaDetached).length,
      wouldBecomeMilderCount: diagnosticRows.filter(
        (row) => row.wouldBecomeMilderUnderAttachmentAwarePolicy
      ).length,
    },
    dominantBlockerFrequency,
    criticalIssueFrequency,
    topBlockedCandidates,
    topAttachmentCandidates,
  }
}

export function buildPlacementCtaLandscapeDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementCtaLandscapeDiagnosticsReport {
  const landscape = buildPlacementTextLandscapeDiagnostics(input)
  const ctaRows = [...landscape.topBlockedCandidates, ...landscape.topAttachmentCandidates]
    .filter((row, index, rows) => rows.findIndex((entry) => entry.caseId === row.caseId && entry.candidateId === row.candidateId) === index)
    .filter((row) => row.dominantRole === 'cta-detachment' || row.ctaDetached)

  const categoriesAffected = Object.entries(
    ctaRows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.category || 'uncategorized')
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }))

  const criticalIssueFrequency = Object.entries(
    ctaRows.reduce<Record<string, number>>((acc, row) => {
      for (const issue of row.criticalIssues) increment(acc, issue)
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([issue, count]) => ({ issue, count }))

  const topImprovedCandidates = [...ctaRows]
    .filter((row) => row.aggregateDelta > 0 || row.wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy)
    .sort((left, right) => {
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      if (right.ctaMessageAssociationScore !== left.ctaMessageAssociationScore) {
        return right.ctaMessageAssociationScore - left.ctaMessageAssociationScore
      }
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)

  const topBlockedCandidates = [...ctaRows]
    .sort((left, right) => {
      if (right.ctaAttachmentDistance !== left.ctaAttachmentDistance) {
        return right.ctaAttachmentDistance - left.ctaAttachmentDistance
      }
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      landscapeDisplayBlockedCandidates: landscape.totals.landscapeDisplayBlockedCandidates,
      dominantCtaCount: landscape.totals.dominantCtaCount,
      ctaDetachedMainCount: landscape.totals.ctaDetachedMainCount,
      gapDrivenCount: ctaRows.filter((row) => row.disconnectDrivenPrimarilyByGap).length,
      horizontalDrivenCount: ctaRows.filter((row) => row.disconnectDrivenPrimarilyByHorizontalOffset).length,
      wouldBecomeMilderCount: ctaRows.filter((row) => row.wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy).length,
    },
    categoriesAffected,
    criticalIssueFrequency,
    topImprovedCandidates,
    topBlockedCandidates,
  }
}

export function buildPlacementCtaAnchorLandscapeDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementCtaAnchorLandscapeDiagnosticsReport {
  const landscapeRecords = input.records.filter(
    (record) =>
      record.format === 'landscape' &&
      record.family === 'display' &&
      Boolean(record.placementDiagnostics?.landscapeTextCluster)
  )

  const rows: PlacementCtaAnchorLandscapeDiagnosticRow[] = landscapeRecords.map((record) => {
    const cluster = record.placementDiagnostics?.landscapeTextCluster
    const textBoxes = record.placementDiagnostics?.textBoxes
    const ctaRect = getEligibleRoleEntry(record, 'cta')?.rect || null
    const titleRect = textBoxes?.titleRect || null
    const subtitleRect = textBoxes?.subtitleRect || null
    const messageClusterRect = getRectUnion([titleRect, subtitleRect])
    const ctaAnchorConflict = !cluster
      ? false
      : !cluster.ctaWithinSplitLayoutTolerance &&
        (cluster.ctaAnchorDistance > 2.5 ||
          cluster.ctaMessageAssociationScore < 72 ||
          cluster.ctaReadingFlowContinuity < 74 ||
          cluster.ctaDetached)

    return {
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      dominantRole: getLandscapeMessageDominantBlocker(record),
      aggregateDelta: record.aggregateDelta,
      confidenceDelta: round(record.candidateConfidence - record.baselineConfidence),
      ctaRect,
      titleRect,
      subtitleRect,
      messageClusterRect,
      ctaAnchorConflict,
      ctaAnchorDistance: cluster?.ctaAnchorDistance ?? cluster?.ctaAttachmentDistance ?? 0,
      ctaAnchorVerticalGap: cluster?.ctaAnchorVerticalGap ?? cluster?.subtitleCtaDistance ?? 0,
      ctaAnchorHorizontalOffset: cluster?.ctaAnchorHorizontalOffset ?? 0,
      ctaWithinSplitLayoutTolerance: cluster?.ctaWithinSplitLayoutTolerance ?? false,
      ctaReadingFlowContinuity: cluster?.ctaReadingFlowContinuity ?? 0,
      ctaMessageAssociationScore: cluster?.ctaMessageAssociationScore ?? 0,
      ctaAnchorWouldBecomeMilder:
        cluster?.ctaAnchorWouldBecomeMilder ??
        cluster?.wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy ??
        false,
      structuralSubtypes: deriveLandscapeStructuralSubtypes(record),
    }
  })

  const blockedRows = rows.filter((row) => row.ctaAnchorConflict)
  const categoriesAffected = Object.entries(
    blockedRows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.category || 'uncategorized')
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }))

  const structuralSubtypeFrequency = Object.entries(
    blockedRows.reduce<Record<string, number>>((acc, row) => {
      for (const subtype of row.structuralSubtypes) increment(acc, subtype)
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([subtype, count]) => ({ subtype, count }))

  const topBlockedCandidates = [...blockedRows]
    .sort((left, right) => {
      if (right.ctaAnchorDistance !== left.ctaAnchorDistance) {
        return right.ctaAnchorDistance - left.ctaAnchorDistance
      }
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)

  const topImprovedCandidates = [...rows]
    .filter(
      (row) =>
        row.aggregateDelta > 0 &&
        row.confidenceDelta >= 0 &&
        (row.ctaAnchorWouldBecomeMilder || !row.ctaAnchorConflict)
    )
    .sort((left, right) => {
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
      if (left.ctaAnchorDistance !== right.ctaAnchorDistance) return left.ctaAnchorDistance - right.ctaAnchorDistance
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      landscapeDisplayBlockedCandidates: rows.length,
      ctaAnchorConflictCount: blockedRows.length,
      dominantCtaCount: rows.filter((row) => row.dominantRole === 'cta').length,
      wouldBecomeMilderCount: rows.filter((row) => row.ctaAnchorWouldBecomeMilder).length,
      nearUnlockCandidateCount: rows.filter(
        (row) =>
          row.aggregateDelta > 0 &&
          row.confidenceDelta >= 0 &&
          !row.ctaAnchorConflict &&
          row.ctaAnchorWouldBecomeMilder
      ).length,
    },
    categoriesAffected,
    structuralSubtypeFrequency,
    topBlockedCandidates,
    topImprovedCandidates,
  }
}

export function buildPlacementMessageLandscapeDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementMessageLandscapeDiagnosticsReport {
  const landscapeDisplayRecords = input.records.filter(
    (record) =>
      record.format === 'landscape' &&
      record.family === 'display' &&
      Boolean(record.placementDiagnostics?.landscapeTextCluster)
  )

  const toRow = (record: PlacementSoftPolicyCandidateRecord): PlacementMessageLandscapeDiagnosticRow => {
    const cluster = record.placementDiagnostics?.landscapeTextCluster
    const textBoxes = record.placementDiagnostics?.textBoxes
    const titleRect = textBoxes?.titleRect || null
    const subtitleRect = textBoxes?.subtitleRect || null
    const titleOnlyWouldBeMilder =
      (cluster?.titlePlacementDistance ?? 0) + 2 <
      (cluster?.rawCombinedMessageAllowedDistance ?? cluster?.combinedAllowedDistance ?? 0)
    const structuralSubtypes = deriveLandscapeStructuralSubtypes(record)

    return {
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      dominantRole: getLandscapeMessageDominantBlocker(record),
      titleRect,
      subtitleRect,
      titlePlacementDistance: cluster?.titlePlacementDistance ?? 0,
      subtitleAttachmentDistance: cluster?.subtitleAttachmentDistance ?? 0,
      rawCombinedMessageAllowedDistance:
        cluster?.rawCombinedMessageAllowedDistance ?? cluster?.combinedAllowedDistance ?? 0,
      rawCombinedMessagePreferredDistance:
        cluster?.rawCombinedMessagePreferredDistance ?? cluster?.combinedPreferredDistance ?? 0,
      combinedMessageAllowedDistance: cluster?.combinedAllowedDistance ?? 0,
      combinedMessagePreferredDistance: cluster?.combinedPreferredDistance ?? 0,
      messageClusterFootprint: cluster?.clusterFootprint ?? 0,
      messageClusterHeight: cluster?.messageClusterHeight ?? 0,
      messageClusterWidth: cluster?.messageClusterWidth ?? 0,
      titlePrimaryAnchorWeight: cluster?.titlePrimaryAnchorWeight ?? 0,
      subtitleSecondaryMassWeight: cluster?.subtitleSecondaryMassWeight ?? 0,
      titleDominatesMessagePlacement: cluster?.titleDominatesMainTextPlacement ?? false,
      subtitleDetached: cluster?.subtitleDetached ?? false,
      messageImageSplitCoherent: cluster?.textImageSplitCoherent ?? true,
      messageClusterCoherent: !cluster?.subtitleDetached && (cluster?.textImageSplitCoherent ?? true),
      severeDrivenByCombinedMessageClusterOnly: cluster?.severeDrivenByCombinedClusterOnly ?? false,
      severeDrivenBySubtitleInflationOnly: cluster?.severeDrivenBySubtitleInflationOnly ?? false,
      wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy:
        cluster?.wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy ??
        cluster?.wouldBecomeMilderUnderAttachmentAwarePolicy ??
        false,
      modelSlotMismatch: structuralSubtypes.includes('model-slot-mismatch'),
      titleSubtitleVerticalGap: cluster?.titleSubtitleVerticalGap ?? 0,
      titleSubtitleHorizontalOffset: cluster?.titleSubtitleHorizontalOffset ?? 0,
      subtitleInflationContribution: cluster?.subtitleInflationContribution ?? 0,
      subtitleInflatesMainly: cluster?.subtitleInflatesMainly ?? false,
      titleOnlyWouldBeMilder,
      messageClusterTooTall: cluster?.messageClusterTooTall ?? false,
      splitLayoutViolation: cluster ? !cluster.textImageSplitCoherent : false,
      aggregateDelta: record.aggregateDelta,
      confidenceDelta: round(record.candidateConfidence - record.baselineConfidence),
      structuralSubtypes,
    }
  }

  const rows = landscapeDisplayRecords.map(toRow)
  const topBlockedCandidates = [...rows]
    .sort((left, right) => {
      if (right.combinedMessageAllowedDistance !== left.combinedMessageAllowedDistance) {
        return right.combinedMessageAllowedDistance - left.combinedMessageAllowedDistance
      }
      if (right.messageClusterHeight !== left.messageClusterHeight) {
        return right.messageClusterHeight - left.messageClusterHeight
      }
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)

  const topOversizedCandidates = [...rows]
    .filter((row) => row.messageClusterTooTall || row.severeDrivenByCombinedMessageClusterOnly)
    .sort((left, right) => {
      if (right.messageClusterFootprint !== left.messageClusterFootprint) {
        return right.messageClusterFootprint - left.messageClusterFootprint
      }
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)

  const dominantBlockerFrequency = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.dominantRole)
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([blocker, count]) => ({ blocker, count }))

  const structuralSubtypeFrequency = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      for (const subtype of row.structuralSubtypes) increment(acc, subtype)
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([subtype, count]) => ({ subtype, count }))

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      landscapeDisplayBlockedCandidates: landscapeDisplayRecords.length,
      dominantMessageBlockerCount: rows.filter((row) =>
        ['title-placement', 'subtitle-attachment', 'message-cluster-oversize', 'split-layout-coherence-failure', 'model-slot-mismatch', 'text'].includes(row.dominantRole)
      ).length,
      titleOnlyMilderThanCombinedCount: rows.filter((row) => row.titleOnlyWouldBeMilder).length,
      subtitleInflationMainCount: rows.filter((row) => row.subtitleInflatesMainly).length,
      messageClusterOversizeCount: rows.filter((row) => row.messageClusterTooTall || row.severeDrivenBySubtitleInflationOnly).length,
      splitCoherenceFailureCount: rows.filter((row) => row.splitLayoutViolation).length,
      modelSlotMismatchCount: rows.filter((row) => row.modelSlotMismatch).length,
      wouldBecomeMilderCount: rows.filter((row) => row.wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy).length,
    },
    dominantBlockerFrequency,
    structuralSubtypeFrequency,
    topBlockedCandidates,
    topOversizedCandidates,
  }
}

export function buildPlacementRoleConflictLandscapeDiagnostics(input: {
  root: string
  records: PlacementSoftPolicyCandidateRecord[]
}): PlacementRoleConflictLandscapeDiagnosticsReport {
  const landscapeRecords = input.records.filter((record) => {
    if (record.format !== 'landscape' || record.family !== 'display') return false
    const subtypes = deriveLandscapeStructuralSubtypes(record)
    return subtypes.includes('role-placement-conflict')
  })

  const rows: PlacementRoleConflictLandscapeDiagnosticRow[] = landscapeRecords.map((record) => {
    const dominantRole = getLandscapeMessageDominantBlocker(record)
    const conflict = deriveLandscapeRoleConflictDetails(record)

    return {
      caseId: record.caseId,
      category: record.category,
      format: record.format,
      family: record.family,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      dominantRole,
      aggregateDelta: record.aggregateDelta,
      confidenceDelta: round(record.candidateConfidence - record.baselineConfidence),
      titleRect: conflict.titleRect,
      subtitleRect: conflict.subtitleRect,
      ctaRect: conflict.ctaRect,
      imageRect: conflict.imageRect,
      textClusterRect: conflict.textClusterRect,
      roleConflictSubtype: conflict.roleConflictSubtype,
      roleConflictReasons: conflict.roleConflictReasons,
      titleZoneConflict: conflict.titleZoneConflict,
      subtitleZoneConflict: conflict.subtitleZoneConflict,
      ctaZoneConflict: conflict.ctaZoneConflict,
      imageZoneConflict: conflict.imageZoneConflict,
      leftRightSplitConflict: conflict.leftRightSplitConflict,
      messageVsImageOccupancyConflict: conflict.messageVsImageOccupancyConflict,
      textTooWideForSplit: conflict.textTooWideForSplit,
      textTooTallForSplit: conflict.textTooTallForSplit,
      ctaAnchorConflict: conflict.ctaAnchorConflict,
      titleOnlyWouldPass: conflict.titleOnlyWouldPass,
      messageClusterWouldPass: conflict.messageClusterWouldPass,
      remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
      structuralSubtypes: deriveLandscapeStructuralSubtypes(record),
    }
  })

  const subtypeFrequency = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.roleConflictSubtype)
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([subtype, count]) => ({
      subtype: subtype as PlacementRoleConflictLandscapeSubtype,
      count,
    }))

  const dominantRoleFrequency = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.dominantRole)
      return acc
    }, {})
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([role, count]) => ({ role, count }))

  const bySubtype = subtypeFrequency.map(({ subtype, count }) => ({
    subtype,
    count,
    topCaseIds: Array.from(
      new Set(
        rows
          .filter((row) => row.roleConflictSubtype === subtype)
          .sort((left, right) => {
            if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
            return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
              `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
            )
          })
          .map((row) => row.caseId)
      )
    ).slice(0, 5),
  }))

  const textDominantRows = rows.filter((row) => row.dominantRole === 'text')
  const topBlockedCandidates = [...rows]
    .sort((left, right) => {
      if (right.roleConflictReasons.length !== left.roleConflictReasons.length) {
        return right.roleConflictReasons.length - left.roleConflictReasons.length
      }
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 20)

  const topCloseToAcceptableCandidates = [...rows]
    .filter(
      (row) =>
        row.aggregateDelta > 0 &&
        (row.titleOnlyWouldPass || row.messageClusterWouldPass || row.remainingBlockerWouldBecomeMilder)
    )
    .sort((left, right) => {
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      if (left.roleConflictReasons.length !== right.roleConflictReasons.length) {
        return left.roleConflictReasons.length - right.roleConflictReasons.length
      }
      if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
      return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
        `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
      )
    })
    .slice(0, 10)

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      landscapeDisplayBlockedCandidates: rows.length,
      textDominantCount: textDominantRows.length,
      ctaDominantCount: rows.filter((row) => row.dominantRole === 'cta').length,
      closeToAcceptableCount: new Set(topCloseToAcceptableCandidates.map((row) => row.caseId)).size,
    },
    subtypeFrequency,
    dominantRoleFrequency,
    bySubtype,
    textDominantSummary: {
      textDominantCount: textDominantRows.length,
      titleZoneConflictCount: textDominantRows.filter((row) => row.titleZoneConflict).length,
      titleOnlyWouldPassCount: textDominantRows.filter((row) => row.titleOnlyWouldPass).length,
      textTooWideForSplitCount: textDominantRows.filter((row) => row.textTooWideForSplit).length,
      textTooTallForSplitCount: textDominantRows.filter((row) => row.textTooTallForSplit).length,
      messageVsImageOccupancyConflictCount: textDominantRows.filter(
        (row) => row.messageVsImageOccupancyConflict
      ).length,
      leftRightSplitConflictCount: textDominantRows.filter((row) => row.leftRightSplitConflict).length,
      mixedRoleZoneConflictCount: textDominantRows.filter(
        (row) => row.roleConflictSubtype === 'mixed-role-zone-conflict'
      ).length,
    },
    topBlockedCandidates,
    topCloseToAcceptableCandidates,
  }
}

export function buildSquareRoleConflictDiagnostics(input: {
  root: string
  rows: CaseReviewNormalizedRow[]
  bestRejectedCandidates: BestRejectedCandidateRow[]
  records: PlacementSoftPolicyCandidateRecord[]
}): SquareRoleConflictDiagnosticsReport {
  const { pickRecord } = buildBestRejectedRecordMap({
    bestRejectedCandidates: input.bestRejectedCandidates,
    records: input.records,
  })
  const bestRejectedByCase = new Map(
    input.bestRejectedCandidates.map((row) => [row.caseId, row.bestRejectedCandidate])
  )

  const rows: SquareRoleConflictDiagnosticRow[] = []
  for (const row of input.rows) {
    if (row.format !== 'square' || row.family !== 'display') continue
    const record = pickRecord(row.caseId)
    if (!record) continue
    const master = classifyMasterResidualBucket(record)
    if (master.dominantBlockerFamily !== 'square-role-conflict') continue
    const conflict = deriveSquareRoleConflictDetails(record)
    const bestRejected = bestRejectedByCase.get(row.caseId) || null
    rows.push({
        caseId: row.caseId,
        category: row.category,
        format: row.format,
        family: row.family,
        candidateId: record.candidateId,
        candidateKind: record.candidateKind,
        strategyLabel: record.strategyLabel,
        dominantRole: getDominantViolatingRole(record),
        aggregateDelta: record.aggregateDelta,
        confidenceDelta: round(record.candidateConfidence - record.baselineConfidence),
        severity: record.placementSeverity,
        primaryBlocker: getPrimaryBlocker(record.rejectionReasons),
        onlyBlockedByOneGate: Boolean(bestRejected?.onlyBlockedByOneGate),
        titleRect: conflict.titleRect,
        subtitleRect: conflict.subtitleRect,
        ctaRect: conflict.ctaRect,
        imageRect: conflict.imageRect,
        combinedTextRect: conflict.combinedTextRect,
        messageClusterRect: conflict.messageClusterRect,
        roleConflictSubtype: conflict.roleConflictSubtype,
        roleConflictReasons: conflict.roleConflictReasons,
        ctaAnchorConflict: conflict.ctaAnchorConflict,
        ctaToMessageDistance: conflict.ctaToMessageDistance,
        ctaHorizontalOffset: conflict.ctaHorizontalOffset,
        ctaVerticalGap: conflict.ctaVerticalGap,
        ctaWithinSquareTolerance: conflict.ctaWithinSquareTolerance,
        ctaReadingFlowContinuity: conflict.ctaReadingFlowContinuity,
        ctaMessageAssociationScore: conflict.ctaMessageAssociationScore,
        imageZoneConflict: conflict.imageZoneConflict,
        textZoneConflict: conflict.textZoneConflict,
        titleZoneConflict: conflict.titleZoneConflict,
        subtitleZoneConflict: conflict.subtitleZoneConflict,
        imageVsTextOccupancyConflict: conflict.imageVsTextOccupancyConflict,
        ctaVsTextConflict: conflict.ctaVsTextConflict,
        ctaVsImageConflict: conflict.ctaVsImageConflict,
        textTooTallForSquare: conflict.textTooTallForSquare,
        textTooWideForSquare: conflict.textTooWideForSquare,
        imageTooDominantForSquare: conflict.imageTooDominantForSquare,
        titleOnlyWouldPass: conflict.titleOnlyWouldPass,
        messageClusterWouldPass: conflict.messageClusterWouldPass,
        remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
        legacySafetyRejected: conflict.legacySafetyRejected,
        spacingCollapsePresent: conflict.spacingCollapsePresent,
        hardStructuralInvalidityPresent: conflict.hardStructuralInvalidityPresent,
        criticalOverlapPresent: conflict.criticalOverlapPresent,
        roleLossPresent: conflict.roleLossPresent,
        closeToAcceptable:
          record.aggregateDelta > 0 &&
          Boolean(bestRejected?.onlyBlockedByOneGate) &&
          !conflict.legacySafetyRejected &&
          !conflict.spacingCollapsePresent &&
          !conflict.hardStructuralInvalidityPresent &&
          !conflict.criticalOverlapPresent &&
          !conflict.roleLossPresent,
      } satisfies SquareRoleConflictDiagnosticRow)
  }

  rows.sort((left, right) => {
    if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
    if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
    return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
      `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
    )
  })

  const subtypeFrequency = sortFrequencyEntries(
    rows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.roleConflictSubtype)
      return acc
    }, {}),
    (subtype, count) => ({ subtype: subtype as SquareRoleConflictSubtype, count })
  )

  const dominantRoleFrequency = sortFrequencyEntries(
    rows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.dominantRole)
      return acc
    }, {}),
    (role, count) => ({ role, count })
  )

  const blockerSeverityGatePatterns = Array.from(
    rows.reduce<Map<string, number>>((acc, row) => {
      const key = `${row.roleConflictSubtype}::${row.severity}::${row.onlyBlockedByOneGate ? 'single-gate' : 'multi-gate'}`
      acc.set(key, (acc.get(key) || 0) + 1)
      return acc
    }, new Map())
  )
    .map(([key, count]) => {
      const [blockerSubtype, severity, singleGatePattern] = key.split('::')
      return {
        blockerSubtype: blockerSubtype as SquareRoleConflictSubtype,
        severity: severity as PlacementViolationSeverity,
        singleGatePattern: singleGatePattern as 'single-gate' | 'multi-gate',
        count,
      }
    })
    .sort((left, right) => right.count - left.count || left.blockerSubtype.localeCompare(right.blockerSubtype))

  const candidateGroupsBySubtype = Array.from(
    rows.reduce<Map<string, SquareRoleConflictDiagnosticRow[]>>((acc, row) => {
      const bucket = acc.get(row.roleConflictSubtype) || []
      bucket.push(row)
      acc.set(row.roleConflictSubtype, bucket)
      return acc
    }, new Map())
  )
    .map(([blockerSubtype, groupRows]) => ({
      blockerSubtype: blockerSubtype as SquareRoleConflictSubtype,
      caseCount: groupRows.length,
      topCaseIds: groupRows.slice(0, 10).map((row) => row.caseId),
    }))
    .sort((left, right) => right.caseCount - left.caseCount || left.blockerSubtype.localeCompare(right.blockerSubtype))

  const closeToAcceptableSubgroupCounts = sortFrequencyEntries(
    rows.filter((row) => row.closeToAcceptable).reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.roleConflictSubtype)
      return acc
    }, {}),
    (subtype, count) => ({ subtype: subtype as SquareRoleConflictSubtype, count })
  )

  const nearMissSingleGateSubgroupCounts = sortFrequencyEntries(
    rows
      .filter(
        (row) =>
          row.onlyBlockedByOneGate &&
          !row.legacySafetyRejected &&
          !row.spacingCollapsePresent &&
          !row.hardStructuralInvalidityPresent &&
          !row.criticalOverlapPresent &&
          !row.roleLossPresent
      )
      .reduce<Record<string, number>>((acc, row) => {
        increment(acc, row.roleConflictSubtype)
        return acc
      }, {}),
    (subtype, count) => ({ subtype: subtype as SquareRoleConflictSubtype, count })
  )

  const recommendedSecondUnlockCandidates = Array.from(
    rows.reduce<Map<string, SquareRoleConflictDiagnosticRow[]>>((acc, row) => {
      const key = `${row.roleConflictSubtype}::${row.severity}::${row.onlyBlockedByOneGate ? 'single-gate' : 'multi-gate'}`
      const bucket = acc.get(key) || []
      bucket.push(row)
      acc.set(key, bucket)
      return acc
    }, new Map())
  )
    .map(([key, groupRows]) => {
      const [blockerSubtype, severity, singleGatePattern] = key.split('::')
      const noHardSafety = groupRows.every(
        (row) =>
          !row.legacySafetyRejected &&
          !row.spacingCollapsePresent &&
          !row.hardStructuralInvalidityPresent &&
          !row.criticalOverlapPresent &&
          !row.roleLossPresent
      )
      const nonNegativeConfidence = groupRows.every((row) => row.confidenceDelta >= 0)
      const mostlySingleGate = groupRows.filter((row) => row.onlyBlockedByOneGate).length / groupRows.length >= 0.8
      const narrow = groupRows.length <= 8
      const homogeneous = new Set(groupRows.map((row) => row.roleConflictSubtype)).size === 1
      const mildOrModerate = groupRows.every((row) => row.severity !== 'severe')
      const ready =
        narrow &&
        homogeneous &&
        mostlySingleGate &&
        nonNegativeConfidence &&
        noHardSafety &&
        mildOrModerate
      const expectedSafeguardsNeeded = [
        'single-gate only',
        'no legacy-safety-rejection',
        'no hard-structural-invalidity',
        'no spacing-collapse',
        'no critical-overlap',
        'no role-loss',
        'non-negative confidence delta',
      ]
      return {
        proposedUnlockClassKey: ready
          ? `square-${blockerSubtype}-near-miss-v1`
          : `not-ready:square-role-conflict:${blockerSubtype}`,
        blockerSubtype: blockerSubtype as SquareRoleConflictSubtype,
        severity: severity as PlacementViolationSeverity,
        singleGatePattern: singleGatePattern as 'single-gate' | 'multi-gate',
        caseCount: groupRows.length,
        ready,
        whyReady: ready
          ? 'Narrow homogeneous square subgroup with single-gate behavior and no hard safety findings.'
          : '',
        whyNotReady: ready
          ? ''
          : [
              !narrow ? 'too-broad' : null,
              !homogeneous ? 'mixed-subtypes' : null,
              !mostlySingleGate ? 'not-mostly-single-gate' : null,
              !nonNegativeConfidence ? 'confidence-not-stable' : null,
              !noHardSafety ? 'hard-safety-flags-present' : null,
              !mildOrModerate ? 'severe-placement-present' : null,
            ]
              .filter((value): value is string => Boolean(value))
              .join(', '),
        expectedSafeguardsNeeded,
        topCaseIds: groupRows.slice(0, 10).map((row) => row.caseId),
      } satisfies SquareRoleConflictCandidateGroup
    })
    .sort((left, right) => {
      if (Number(right.ready) !== Number(left.ready)) return Number(right.ready) - Number(left.ready)
      if (right.caseCount !== left.caseCount) return right.caseCount - left.caseCount
      return left.proposedUnlockClassKey.localeCompare(right.proposedUnlockClassKey)
    })

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      squareDisplayBlockedCases: rows.length,
      closeToAcceptableCount: rows.filter((row) => row.closeToAcceptable).length,
      singleGateNearMissCount: rows.filter((row) => row.onlyBlockedByOneGate).length,
    },
    subtypeFrequency,
    dominantRoleFrequency,
    blockerSeverityGatePatterns,
    candidateGroupsBySubtype,
    closeToAcceptableSubgroupCounts,
    nearMissSingleGateSubgroupCounts,
    recommendedSecondUnlockCandidates,
    topRecommendedSecondUnlockClass: recommendedSecondUnlockCandidates.find((group) => group.ready) || null,
    cases: rows,
  }
}

export function buildSquareCtaVsTextDiagnostics(input: {
  root: string
  rows: CaseReviewNormalizedRow[]
  bestRejectedCandidates: BestRejectedCandidateRow[]
  records: PlacementSoftPolicyCandidateRecord[]
}): SquareCtaVsTextDiagnosticsReport {
  const { pickRecord } = buildBestRejectedRecordMap({
    bestRejectedCandidates: input.bestRejectedCandidates,
    records: input.records,
  })
  const bestRejectedByCase = new Map(
    input.bestRejectedCandidates.map((row) => [row.caseId, row.bestRejectedCandidate])
  )

  const rows: SquareCtaVsTextDiagnosticRow[] = []
  for (const row of input.rows) {
    if (row.format !== 'square' || row.family !== 'display') continue
    const record = pickRecord(row.caseId)
    if (!record) continue
    const master = classifyMasterResidualBucket(record)
    if (master.dominantBlockerFamily !== 'square-role-conflict') continue
    const conflict = deriveSquareCtaVsTextDetails(record)
    if (conflict.roleConflictSubtype !== 'cta-vs-text-conflict') continue
    const bestRejected = bestRejectedByCase.get(row.caseId) || null
    rows.push({
      caseId: row.caseId,
      category: row.category,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      aggregateDelta: record.aggregateDelta,
      confidenceDelta: round(record.candidateConfidence - record.baselineConfidence),
      severity: record.placementSeverity,
      primaryBlocker: getPrimaryBlocker(record.rejectionReasons),
      onlyBlockedByOneGate: Boolean(bestRejected?.onlyBlockedByOneGate),
      dominantRole: getDominantViolatingRole(record),
      titleRect: conflict.titleRect,
      subtitleRect: conflict.subtitleRect,
      ctaRect: conflict.ctaRect,
      imageRect: conflict.imageRect,
      combinedTextRect: conflict.combinedTextRect,
      messageClusterRect: conflict.messageClusterRect,
      ctaVsTextSubtype: conflict.ctaVsTextSubtype,
      ctaVsTextReasons: conflict.ctaVsTextReasons,
      ctaToTitleDistance: conflict.ctaToTitleDistance,
      ctaToSubtitleDistance: conflict.ctaToSubtitleDistance,
      ctaToCombinedTextDistance: conflict.ctaToCombinedTextDistance,
      ctaVerticalGap: conflict.ctaVerticalGap,
      ctaHorizontalOffset: conflict.ctaHorizontalOffset,
      ctaOverlapRisk: conflict.ctaOverlapRisk,
      ctaWithinSquareTolerance: conflict.ctaWithinSquareTolerance,
      ctaReadingFlowContinuity: conflict.ctaReadingFlowContinuity,
      ctaMessageAssociationScore: conflict.ctaMessageAssociationScore,
      textZoneConflict: conflict.textZoneConflict,
      ctaZoneConflict: conflict.ctaZoneConflict,
      ctaInsideExpectedActionBand: conflict.ctaInsideExpectedActionBand,
      ctaBelowTextButAcceptable: conflict.ctaBelowTextButAcceptable,
      textClusterTooTallForCtaPairing: conflict.textClusterTooTallForCtaPairing,
      textClusterTooWideForCtaPairing: conflict.textClusterTooWideForCtaPairing,
      subtitleInflationContribution: conflict.subtitleInflationContribution,
      titleOnlyWouldPass: conflict.titleOnlyWouldPass,
      messageClusterWouldPass: conflict.messageClusterWouldPass,
      remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
      legacySafetyRejected: conflict.legacySafetyRejected,
      spacingCollapsePresent: conflict.spacingCollapsePresent,
      hardStructuralInvalidityPresent: conflict.hardStructuralInvalidityPresent,
      criticalOverlapPresent: conflict.criticalOverlapPresent,
      roleLossPresent: conflict.roleLossPresent,
      closeToAcceptable:
        record.aggregateDelta > 0 &&
        Boolean(bestRejected?.onlyBlockedByOneGate) &&
        !conflict.legacySafetyRejected &&
        !conflict.spacingCollapsePresent &&
        !conflict.hardStructuralInvalidityPresent &&
        !conflict.criticalOverlapPresent &&
        !conflict.roleLossPresent,
    } satisfies SquareCtaVsTextDiagnosticRow)
  }

  rows.sort((left, right) => {
    if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
    if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
    return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
      `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
    )
  })

  const subtypeFrequency = sortFrequencyEntries(
    rows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.ctaVsTextSubtype)
      return acc
    }, {}),
    (subtype, count) => ({ subtype: subtype as SquareCtaVsTextSubtype, count })
  )

  const groupedCandidateSetsBySubtype = Array.from(
    rows.reduce<Map<string, SquareCtaVsTextDiagnosticRow[]>>((acc, row) => {
      const bucket = acc.get(row.ctaVsTextSubtype) || []
      bucket.push(row)
      acc.set(row.ctaVsTextSubtype, bucket)
      return acc
    }, new Map())
  )
    .map(([blockerSubtype, groupRows]) => ({
      blockerSubtype: blockerSubtype as SquareCtaVsTextSubtype,
      caseCount: groupRows.length,
      topCaseIds: groupRows.slice(0, 10).map((row) => row.caseId),
    }))
    .sort((left, right) => right.caseCount - left.caseCount || left.blockerSubtype.localeCompare(right.blockerSubtype))

  const blockerSeverityConfidenceGatePatterns = Array.from(
    rows.reduce<Map<string, number>>((acc, row) => {
      const confidencePattern =
        row.confidenceDelta > 0 ? 'positive' : row.confidenceDelta === 0 ? 'neutral' : 'mixed'
      const key = `${row.ctaVsTextSubtype}::${row.severity}::${confidencePattern}::${row.onlyBlockedByOneGate ? 'single-gate' : 'multi-gate'}`
      acc.set(key, (acc.get(key) || 0) + 1)
      return acc
    }, new Map())
  )
    .map(([key, count]) => {
      const [blockerSubtype, severity, confidencePattern, singleGatePattern] = key.split('::')
      return {
        blockerSubtype: blockerSubtype as SquareCtaVsTextSubtype,
        severity: severity as PlacementViolationSeverity,
        confidencePattern: confidencePattern as 'positive' | 'neutral' | 'mixed',
        singleGatePattern: singleGatePattern as 'single-gate' | 'multi-gate',
        count,
      }
    })
    .sort((left, right) => right.count - left.count || left.blockerSubtype.localeCompare(right.blockerSubtype))

  const nearMissSubgroupCounts = sortFrequencyEntries(
    rows
      .filter(
        (row) =>
          row.onlyBlockedByOneGate &&
          !row.legacySafetyRejected &&
          !row.spacingCollapsePresent &&
          !row.hardStructuralInvalidityPresent &&
          !row.criticalOverlapPresent &&
          !row.roleLossPresent
      )
      .reduce<Record<string, number>>((acc, row) => {
        increment(acc, row.ctaVsTextSubtype)
        return acc
      }, {}),
    (subtype, count) => ({ subtype: subtype as SquareCtaVsTextSubtype, count })
  )

  const recommendedSecondUnlockCandidates = Array.from(
    rows.reduce<Map<string, SquareCtaVsTextDiagnosticRow[]>>((acc, row) => {
      const confidencePattern =
        row.confidenceDelta > 0 ? 'positive' : row.confidenceDelta === 0 ? 'neutral' : 'mixed'
      const key = `${row.ctaVsTextSubtype}::${row.severity}::${confidencePattern}::${row.onlyBlockedByOneGate ? 'single-gate' : 'multi-gate'}`
      const bucket = acc.get(key) || []
      bucket.push(row)
      acc.set(key, bucket)
      return acc
    }, new Map())
  )
    .map(([key, groupRows]) => {
      const [blockerSubtype, severity, confidencePattern, singleGatePattern] = key.split('::')
      const noHardSafety = groupRows.every(
        (row) =>
          !row.legacySafetyRejected &&
          !row.spacingCollapsePresent &&
          !row.hardStructuralInvalidityPresent &&
          !row.criticalOverlapPresent &&
          !row.roleLossPresent
      )
      const narrow = groupRows.length <= 8
      const homogeneous = new Set(groupRows.map((row) => row.ctaVsTextSubtype)).size === 1
      const mostlySingleGate = groupRows.filter((row) => row.onlyBlockedByOneGate).length / groupRows.length >= 0.8
      const nonNegativeConfidence = groupRows.every((row) => row.confidenceDelta >= 0)
      const notFundamentallySevere = groupRows.every(
        (row) =>
          row.severity !== 'severe' ||
          row.remainingBlockerWouldBecomeMilder ||
          row.messageClusterWouldPass ||
          row.ctaBelowTextButAcceptable
      )
      const ready =
        narrow &&
        homogeneous &&
        mostlySingleGate &&
        nonNegativeConfidence &&
        noHardSafety &&
        notFundamentallySevere
      return {
        proposedUnlockClassKey: ready
          ? `square-${blockerSubtype}-near-miss-v1`
          : `not-ready:square-cta-vs-text:${blockerSubtype}`,
        blockerSubtype: blockerSubtype as SquareCtaVsTextSubtype,
        severity: severity as PlacementViolationSeverity,
        confidencePattern: confidencePattern as 'positive' | 'neutral' | 'mixed',
        singleGatePattern: singleGatePattern as 'single-gate' | 'multi-gate',
        caseCount: groupRows.length,
        ready,
        whyReady: ready
          ? 'Narrow homogeneous square CTA/text subgroup with stable confidence and no hard safety findings.'
          : '',
        whyNotReady: ready
          ? ''
          : [
              !narrow ? 'too-broad' : null,
              !homogeneous ? 'mixed-subtypes' : null,
              !mostlySingleGate ? 'not-mostly-single-gate' : null,
              !nonNegativeConfidence ? 'confidence-not-stable' : null,
              !noHardSafety ? 'hard-safety-flags-present' : null,
              !notFundamentallySevere ? 'fundamentally-severe-cta-text-conflict' : null,
            ]
              .filter((value): value is string => Boolean(value))
              .join(', '),
        expectedSafeguardsNeeded: [
          'single-gate only',
          'no legacy-safety-rejection',
          'no hard-structural-invalidity',
          'no spacing-collapse',
          'no critical-overlap',
          'no role-loss',
          'stable confidence',
          'cta/text conflict must be non-fundamental',
        ],
        topCaseIds: groupRows.slice(0, 10).map((row) => row.caseId),
      } satisfies SquareCtaVsTextCandidateGroup
    })
    .sort((left, right) => {
      if (Number(right.ready) !== Number(left.ready)) return Number(right.ready) - Number(left.ready)
      if (right.caseCount !== left.caseCount) return right.caseCount - left.caseCount
      return left.proposedUnlockClassKey.localeCompare(right.proposedUnlockClassKey)
    })

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      squareDisplayBlockedCases: rows.length,
      closeToAcceptableCount: rows.filter((row) => row.closeToAcceptable).length,
      singleGateNearMissCount: rows.filter((row) => row.onlyBlockedByOneGate).length,
    },
    subtypeFrequency,
    groupedCandidateSetsBySubtype,
    blockerSeverityConfidenceGatePatterns,
    nearMissSubgroupCounts,
    recommendedSecondUnlockCandidates,
    topRecommendedSecondUnlockClass: recommendedSecondUnlockCandidates.find((group) => group.ready) || null,
    cases: rows,
  }
}

export function buildSquareCtaVsSubtitleDiagnostics(input: {
  root: string
  rows: CaseReviewNormalizedRow[]
  bestRejectedCandidates: BestRejectedCandidateRow[]
  records: PlacementSoftPolicyCandidateRecord[]
}): SquareCtaVsSubtitleDiagnosticsReport {
  const { pickRecord } = buildBestRejectedRecordMap({
    bestRejectedCandidates: input.bestRejectedCandidates,
    records: input.records,
  })
  const bestRejectedByCase = new Map(
    input.bestRejectedCandidates.map((row) => [row.caseId, row.bestRejectedCandidate])
  )

  const rows: SquareCtaVsSubtitleDiagnosticRow[] = []
  for (const row of input.rows) {
    if (row.format !== 'square' || row.family !== 'display') continue
    const record = pickRecord(row.caseId)
    if (!record) continue
    const master = classifyMasterResidualBucket(record)
    if (master.dominantBlockerFamily !== 'square-role-conflict') continue
    const conflict = deriveSquareCtaVsSubtitleDetails(record)
    if (conflict.ctaVsTextSubtype !== 'cta-vs-subtitle-conflict') continue
    const bestRejected = bestRejectedByCase.get(row.caseId) || null
    rows.push({
      caseId: row.caseId,
      category: row.category,
      candidateId: record.candidateId,
      candidateKind: record.candidateKind,
      strategyLabel: record.strategyLabel,
      aggregateDelta: record.aggregateDelta,
      confidenceDelta: round(record.candidateConfidence - record.baselineConfidence),
      severity: record.placementSeverity,
      primaryBlocker: getPrimaryBlocker(record.rejectionReasons),
      onlyBlockedByOneGate: Boolean(bestRejected?.onlyBlockedByOneGate),
      titleRect: conflict.titleRect,
      subtitleRect: conflict.subtitleRect,
      ctaRect: conflict.ctaRect,
      imageRect: conflict.imageRect,
      combinedTextRect: conflict.combinedTextRect,
      messageClusterRect: conflict.messageClusterRect,
      ctaVsSubtitleSubtype: conflict.ctaVsSubtitleSubtype,
      ctaVsSubtitleReasons: conflict.ctaVsSubtitleReasons,
      ctaToSubtitleDistance: conflict.ctaToSubtitleDistance,
      ctaToSubtitleVerticalGap: conflict.ctaToSubtitleVerticalGap,
      ctaToSubtitleHorizontalOffset: conflict.ctaToSubtitleHorizontalOffset,
      ctaToCombinedTextDistance: conflict.ctaToCombinedTextDistance,
      ctaOverlapRisk: conflict.ctaOverlapRisk,
      ctaInsideExpectedActionBand: conflict.ctaInsideExpectedActionBand,
      ctaBelowSubtitleButAcceptable: conflict.ctaBelowSubtitleButAcceptable,
      ctaWithinSquareTolerance: conflict.ctaWithinSquareTolerance,
      ctaReadingFlowContinuity: conflict.ctaReadingFlowContinuity,
      ctaMessageAssociationScore: conflict.ctaMessageAssociationScore,
      subtitleInflationContribution: conflict.subtitleInflationContribution,
      subtitleInflatesMainly: conflict.subtitleInflatesMainly,
      subtitleHeightContribution: conflict.subtitleHeightContribution,
      titleHeightContribution: conflict.titleHeightContribution,
      titleOnlyWouldPass: conflict.titleOnlyWouldPass,
      subtitleOnlyWouldPass: conflict.subtitleOnlyWouldPass,
      messageClusterWouldPass: conflict.messageClusterWouldPass,
      textClusterTooTallForCtaPairing: conflict.textClusterTooTallForCtaPairing,
      textClusterTooWideForCtaPairing: conflict.textClusterTooWideForCtaPairing,
      actionBandMismatch: conflict.actionBandMismatch,
      ctaZoneConflict: conflict.ctaZoneConflict,
      subtitleZoneConflict: conflict.subtitleZoneConflict,
      combinedTextZoneConflict: conflict.textZoneConflict,
      remainingBlockerWouldBecomeMilder: conflict.remainingBlockerWouldBecomeMilder,
      legacySafetyRejected: conflict.legacySafetyRejected,
      spacingCollapsePresent: conflict.spacingCollapsePresent,
      hardStructuralInvalidityPresent: conflict.hardStructuralInvalidityPresent,
      criticalOverlapPresent: conflict.criticalOverlapPresent,
      roleLossPresent: conflict.roleLossPresent,
      closeToAcceptable:
        record.aggregateDelta > 0 &&
        Boolean(bestRejected?.onlyBlockedByOneGate) &&
        !conflict.legacySafetyRejected &&
        !conflict.spacingCollapsePresent &&
        !conflict.hardStructuralInvalidityPresent &&
        !conflict.criticalOverlapPresent &&
        !conflict.roleLossPresent,
    } satisfies SquareCtaVsSubtitleDiagnosticRow)
  }

  rows.sort((left, right) => {
    if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
    if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
    return `${left.caseId}:${left.candidateKind}:${left.strategyLabel}`.localeCompare(
      `${right.caseId}:${right.candidateKind}:${right.strategyLabel}`
    )
  })

  const subtypeFrequency = sortFrequencyEntries(
    rows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.ctaVsSubtitleSubtype)
      return acc
    }, {}),
    (subtype, count) => ({ subtype: subtype as SquareCtaVsSubtitleSubtype, count })
  )

  const groupedCandidateSetsBySubtype = Array.from(
    rows.reduce<Map<string, SquareCtaVsSubtitleDiagnosticRow[]>>((acc, row) => {
      const bucket = acc.get(row.ctaVsSubtitleSubtype) || []
      bucket.push(row)
      acc.set(row.ctaVsSubtitleSubtype, bucket)
      return acc
    }, new Map())
  )
    .map(([blockerSubtype, groupRows]) => ({
      blockerSubtype: blockerSubtype as SquareCtaVsSubtitleSubtype,
      caseCount: groupRows.length,
      topCaseIds: groupRows.slice(0, 10).map((row) => row.caseId),
    }))
    .sort((left, right) => right.caseCount - left.caseCount || left.blockerSubtype.localeCompare(right.blockerSubtype))

  const recommendedSecondUnlockCandidates = Array.from(
    rows.reduce<Map<string, SquareCtaVsSubtitleDiagnosticRow[]>>((acc, row) => {
      const bucket = acc.get(row.ctaVsSubtitleSubtype) || []
      bucket.push(row)
      acc.set(row.ctaVsSubtitleSubtype, bucket)
      return acc
    }, new Map())
  )
    .map(([blockerSubtype, groupRows]) => {
      const noHardSafety = groupRows.every(
        (row) =>
          !row.legacySafetyRejected &&
          !row.spacingCollapsePresent &&
          !row.hardStructuralInvalidityPresent &&
          !row.criticalOverlapPresent &&
          !row.roleLossPresent
      )
      const narrow = groupRows.length <= 8
      const homogeneous = new Set(groupRows.map((row) => row.ctaVsSubtitleSubtype)).size === 1
      const nonFundamental = groupRows.every(
        (row) =>
          !row.ctaOverlapRisk &&
          !row.textClusterTooTallForCtaPairing &&
          (row.remainingBlockerWouldBecomeMilder ||
            row.ctaBelowSubtitleButAcceptable ||
            row.actionBandMismatch)
      )
      const ready = narrow && homogeneous && noHardSafety && nonFundamental
      return {
        proposedUnlockClassKey: ready
          ? `square-${blockerSubtype}-near-miss-v1`
          : `not-ready:square-cta-vs-subtitle:${blockerSubtype}`,
        blockerSubtype: blockerSubtype as SquareCtaVsSubtitleSubtype,
        caseCount: groupRows.length,
        ready,
        whyReady: ready
          ? 'Narrow homogeneous square CTA/subtitle subgroup with non-fundamental structural drift only.'
          : '',
        whyNotReady: ready
          ? ''
          : [
              !narrow ? 'too-broad' : null,
              !homogeneous ? 'mixed-subtypes' : null,
              !noHardSafety ? 'hard-safety-flags-present' : null,
              !nonFundamental ? 'still-fundamental-cta-subtitle-conflict' : null,
            ]
              .filter((value): value is string => Boolean(value))
              .join(', '),
        expectedSafeguardsNeeded: [
          'single-gate only',
          'no legacy-safety-rejection',
          'no hard-structural-invalidity',
          'no spacing-collapse',
          'no critical-overlap',
          'no role-loss',
          'cta/subtitle conflict must be non-fundamental',
        ],
        topCaseIds: groupRows.slice(0, 10).map((row) => row.caseId),
      } satisfies SquareCtaVsSubtitleCandidateGroup
    })
    .sort((left, right) => {
      if (Number(right.ready) !== Number(left.ready)) return Number(right.ready) - Number(left.ready)
      if (right.caseCount !== left.caseCount) return right.caseCount - left.caseCount
      return left.proposedUnlockClassKey.localeCompare(right.proposedUnlockClassKey)
    })

  const subtitleInflationDrivenCount = rows.filter(
    (row) =>
      row.ctaVsSubtitleSubtype === 'subtitle-inflation-causes-cta-collision' ||
      (row.subtitleInflatesMainly && row.textClusterTooTallForCtaPairing)
  ).length
  const actionBandMismatchCount = rows.filter((row) => row.actionBandMismatch).length
  const realOverlapRiskCount = rows.filter((row) => row.ctaOverlapRisk).length
  const wouldBecomeMilderIfSubtitleChangedCount = rows.filter(
    (row) => row.subtitleInflatesMainly && row.titleOnlyWouldPass && !row.messageClusterWouldPass
  ).length
  const wouldBecomeMilderIfActionBandRelaxedCount = rows.filter(
    (row) => row.actionBandMismatch && row.ctaWithinSquareTolerance && !row.ctaOverlapRisk
  ).length

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      squareDisplayBlockedCases: rows.length,
      closeToAcceptableCount: rows.filter((row) => row.closeToAcceptable).length,
      singleGateNearMissCount: rows.filter((row) => row.onlyBlockedByOneGate).length,
      subtitleInflationDrivenCount,
      actionBandMismatchCount,
      realOverlapRiskCount,
      wouldBecomeMilderIfSubtitleChangedCount,
      wouldBecomeMilderIfActionBandRelaxedCount,
    },
    subtypeFrequency,
    groupedCandidateSetsBySubtype,
    rootCauseSummary: {
      subtitleInflationDrivenCount,
      actionBandMismatchCount,
      realOverlapRiskCount,
      wouldBecomeMilderIfSubtitleChangedCount,
      wouldBecomeMilderIfActionBandRelaxedCount,
      smallHomogeneousSubsetCount: recommendedSecondUnlockCandidates.filter(
        (group) => group.caseCount <= 8
      ).length,
    },
    recommendedSecondUnlockCandidates,
    topRecommendedSecondUnlockClass: recommendedSecondUnlockCandidates.find((group) => group.ready) || null,
    cases: rows,
  }
}

export function buildMasterResidualBlockers(input: {
  root: string
  rows: CaseReviewNormalizedRow[]
  bestRejectedCandidates: BestRejectedCandidateRow[]
  records: PlacementSoftPolicyCandidateRecord[]
}): MasterResidualBlockersReport {
  const { pickRecord } = buildBestRejectedRecordMap({
    bestRejectedCandidates: input.bestRejectedCandidates,
    records: input.records,
  })

  const caseRows: MasterResidualBlockerCaseRow[] = input.rows.map((row) => {
    const matchingRecord = pickRecord(row.caseId)

    if (!matchingRecord) {
      return {
        caseId: row.caseId,
        format: row.format,
        family: row.family,
        category: row.category,
        baselineWon: row.baselineWon,
        aggregateDelta: row.bestRejectedCandidateDelta || 0,
        confidenceDelta:
          row.bestRejectedCandidateConfidence !== null && row.baselineConfidence !== null
            ? round(row.bestRejectedCandidateConfidence - row.baselineConfidence)
            : 0,
        dominantBlockerFamily: 'other',
        dominantBlockerSubtype: row.bestRejectedCandidatePrimaryBlocker || 'none',
        secondaryBlockerSubtype: null,
        severity: null,
        wouldBecomeMilder: {
          attachmentAwareText: false,
          landscapeImagePolicy: false,
          landscapeMessagePolicy: false,
          landscapeCtaPolicy: false,
          remainingBlockerWouldBecomeMilder: false,
        },
        closeToAcceptable: Boolean(row.hasPositiveRejectedCandidate && row.hasSingleGateBlockedCandidate),
        titleOnlyWouldPass: false,
        messageClusterWouldPass: false,
        remainingBlockerWouldBecomeMilder: false,
        titleOnlyWouldBeMilder: false,
        allStructuralSubtypes: [],
        mainBlockerBucket: 'other',
      }
    }

    const master = classifyMasterResidualBucket(matchingRecord)
    const cluster = matchingRecord.placementDiagnostics?.landscapeTextCluster
    const squareTextCluster = matchingRecord.placementDiagnostics?.textCluster

    return {
      caseId: row.caseId,
      format: row.format,
      family: row.family,
      category: row.category,
      baselineWon: row.baselineWon,
      aggregateDelta: matchingRecord.aggregateDelta,
      confidenceDelta: round(matchingRecord.candidateConfidence - matchingRecord.baselineConfidence),
      dominantBlockerFamily: master.dominantBlockerFamily,
      dominantBlockerSubtype: master.dominantBlockerSubtype,
      secondaryBlockerSubtype: master.secondaryBlockerSubtype,
      severity: matchingRecord.placementSeverity,
      wouldBecomeMilder: {
        attachmentAwareText: Boolean(squareTextCluster?.wouldBecomeMilderUnderAttachmentAwarePolicy),
        landscapeImagePolicy: Boolean(
          matchingRecord.placementDiagnostics?.imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy
        ),
        landscapeMessagePolicy: Boolean(
          cluster?.wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy
        ),
        landscapeCtaPolicy: Boolean(cluster?.wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy),
        remainingBlockerWouldBecomeMilder: master.remainingBlockerWouldBecomeMilder,
      },
      closeToAcceptable:
        matchingRecord.aggregateDelta > 0 &&
        (master.titleOnlyWouldPass ||
          master.messageClusterWouldPass ||
          master.remainingBlockerWouldBecomeMilder ||
          Boolean(row.hasSingleGateBlockedCandidate)),
      titleOnlyWouldPass: master.titleOnlyWouldPass,
      messageClusterWouldPass: master.messageClusterWouldPass,
      remainingBlockerWouldBecomeMilder: master.remainingBlockerWouldBecomeMilder,
      titleOnlyWouldBeMilder:
        Boolean(cluster?.titlePlacementDistance) &&
        (cluster?.titlePlacementDistance ?? 0) + 2 <
          (cluster?.rawCombinedMessageAllowedDistance ?? cluster?.combinedAllowedDistance ?? 0),
      allStructuralSubtypes: master.allStructuralSubtypes,
      mainBlockerBucket: master.dominantBlockerFamily,
    }
  })

  const blockerFamilyFrequency = sortFrequencyEntries(
    caseRows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.dominantBlockerFamily)
      return acc
    }, {}),
    (family, count) => ({ family: family as MasterResidualBlockerBucket, count })
  )

  const blockerSubtypeFrequency = sortFrequencyEntries(
    caseRows.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.dominantBlockerSubtype)
      if (row.secondaryBlockerSubtype) increment(acc, row.secondaryBlockerSubtype)
      return acc
    }, {}),
    (subtype, count) => ({ subtype, count })
  )

  const perFormatRanking = Array.from(
    caseRows.reduce<Map<string, MasterResidualBlockerCaseRow[]>>((acc, row) => {
      const key = row.format || 'unknown'
      const bucket = acc.get(key) || []
      bucket.push(row)
      acc.set(key, bucket)
      return acc
    }, new Map())
  )
    .map(([format, rows]) => ({
      format,
      ranking: sortFrequencyEntries(
        rows.reduce<Record<string, number>>((acc, row) => {
          increment(acc, row.dominantBlockerFamily)
          return acc
        }, {}),
        (family, count) => ({ family: family as MasterResidualBlockerBucket, count })
      ),
    }))
    .sort((left, right) => left.format.localeCompare(right.format))

  const perFamilyRanking = Array.from(
    caseRows.reduce<Map<string, MasterResidualBlockerCaseRow[]>>((acc, row) => {
      const key = row.family || 'unknown'
      const bucket = acc.get(key) || []
      bucket.push(row)
      acc.set(key, bucket)
      return acc
    }, new Map())
  )
    .map(([family, rows]) => ({
      family,
      ranking: sortFrequencyEntries(
        rows.reduce<Record<string, number>>((acc, row) => {
          increment(acc, row.dominantBlockerFamily)
          return acc
        }, {}),
        (blockerFamily, count) => ({ blockerFamily: blockerFamily as MasterResidualBlockerBucket, count })
      ),
    }))
    .sort((left, right) => left.family.localeCompare(right.family))

  const nearMissGroups = Array.from(
    caseRows.reduce<Map<MasterResidualBlockerBucket, MasterResidualBlockerCaseRow[]>>((acc, row) => {
      if (!row.closeToAcceptable) return acc
      const bucket = acc.get(row.dominantBlockerFamily) || []
      bucket.push(row)
      acc.set(row.dominantBlockerFamily, bucket)
      return acc
    }, new Map())
  )
    .map(([blockerFamily, rows]) => ({
      blockerFamily,
      count: rows.length,
      caseIds: rows
        .slice()
        .sort((left, right) => {
          if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
          if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
          return left.caseId.localeCompare(right.caseId)
        })
        .map((row) => row.caseId)
        .slice(0, 10),
    }))
    .sort((left, right) => right.count - left.count || left.blockerFamily.localeCompare(right.blockerFamily))

  const groupedFixTargets = Array.from(
    caseRows.reduce<Map<string, MasterResidualBlockerCaseRow[]>>((acc, row) => {
      const key = `${row.dominantBlockerFamily}::${row.dominantBlockerSubtype}`
      const bucket = acc.get(key) || []
      bucket.push(row)
      acc.set(key, bucket)
      return acc
    }, new Map())
  )
    .map(([key, rows]) => {
      const [blockerFamily, blockerSubtype] = key.split('::')
      return {
        blockerFamily: blockerFamily as MasterResidualBlockerBucket,
        blockerSubtype,
        count: rows.length,
        caseIds: rows
          .slice()
          .sort((left, right) => {
            if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
            if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
            return left.caseId.localeCompare(right.caseId)
          })
          .map((row) => row.caseId)
          .slice(0, 12),
      }
    })
    .sort((left, right) => right.count - left.count || left.blockerSubtype.localeCompare(right.blockerSubtype))

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      cases: caseRows.length,
      baselineWonCount: caseRows.filter((row) => row.baselineWon).length,
      closeToAcceptableCount: caseRows.filter((row) => row.closeToAcceptable).length,
    },
    caseRows,
    blockerFamilyFrequency,
    blockerSubtypeFrequency,
    perFormatRanking,
    perFamilyRanking,
    nearMissGroups,
    groupedFixTargets,
  }
}

export function buildValidatedUnlockClasses(input: {
  root: string
  experiment: LandscapeTextHeightProductionExperimentReport
}): ValidatedUnlockClassesReport {
  const flippedCases = input.experiment.flippedCases
    .map((item) => item.caseId)
    .slice()
    .sort((left, right) => left.localeCompare(right))
  const expectedFlips = VALIDATED_LANDSCAPE_TEXT_HEIGHT_FLIPS.slice().sort((left, right) =>
    left.localeCompare(right)
  )
  const exactCaseMatch =
    flippedCases.length === expectedFlips.length &&
    flippedCases.every((caseId, index) => caseId === expectedFlips[index])
  const validatedClass: ValidatedUnlockClass = {
    unlockClassKey: 'landscape-text-height-near-miss-v1',
    flagName: 'enableLandscapeTextHeightNearMissOverride',
    validated:
      exactCaseMatch &&
      input.experiment.totals.eligibleCandidates === 4 &&
      input.experiment.totals.eligibleCases === 4 &&
      input.experiment.totals.appliedOverrides === 4 &&
      input.experiment.totals.flippedCases === 4,
    eligibilityRules: [
      'family=display',
      'format=landscape',
      'best rejected candidate only',
      'dominant blocker family = landscape-text-height',
      'severity = mild',
      'aggregateDelta > 0',
      'confidenceDelta >= 0',
      'titleOnlyWouldPass = true',
      'messageClusterWouldPass = true',
      'remainingBlockerWouldBecomeMilder = true',
      'primary blocker = role-placement-out-of-zone',
      'onlyBlockedByOneGate = true',
    ],
    guardConditions: [
      'no legacy-safety-rejection',
      'no hard-structural-invalidity',
      'no spacing-collapse',
      'no critical overlap',
      'no role-loss',
      'flag remains disabled by default',
    ],
    flippedCases,
    totals: {
      eligibleCandidates: input.experiment.totals.eligibleCandidates,
      eligibleCases: input.experiment.totals.eligibleCases,
      appliedOverrides: input.experiment.totals.appliedOverrides,
      flippedCases: input.experiment.totals.flippedCases,
    },
    notes: [
      'This class is intentionally narrow and only covers the audited landscape display near-miss set.',
      'It should not be broadened without a separate residual-blocker diagnosis proving equivalent safety.',
      'The override is considered validated only when exactly the audited 4 cases flip and no others do.',
    ],
  }

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    summary: {
      validatedClassCount: validatedClass.validated ? 1 : 0,
      totalFlippedCases: validatedClass.flippedCases.length,
    },
    classes: [validatedClass],
  }
}

function getNextUnlockPriority(input: {
  bestRejected: CaseReviewBestRejectedCandidate | null
  masterRow: MasterResidualBlockerCaseRow | null
  record: PlacementSoftPolicyCandidateRecord | null
}): NextUnlockPriority {
  if (!input.bestRejected || !input.masterRow || !input.record) return 'not-ready'
  if (input.record.rejectionReasons.includes('legacy-safety-rejection')) return 'not-ready'
  if (input.record.rejectionReasons.includes('hard-structural-invalidity')) return 'not-ready'
  if (input.record.rejectionReasons.includes('spacing-threshold-exceeded')) return 'not-ready'
  if (input.record.placementSeverity === 'severe') return 'not-ready'
  if (
    input.masterRow.closeToAcceptable &&
    input.bestRejected.aggregateDelta > 0 &&
    input.bestRejected.onlyBlockedByOneGate
  ) {
    return 'high'
  }
  if (
    input.bestRejected.aggregateDelta > 0 &&
    (input.masterRow.remainingBlockerWouldBecomeMilder || input.bestRejected.onlyBlockedByOneGate)
  ) {
    return 'medium'
  }
  if (input.bestRejected.aggregateDelta >= 0) return 'low'
  return 'not-ready'
}

function getRecommendedUnlockClass(input: {
  priority: NextUnlockPriority
  masterRow: MasterResidualBlockerCaseRow | null
}): string | null {
  if (input.priority === 'not-ready' || !input.masterRow) return null
  switch (input.masterRow.dominantBlockerFamily) {
    case 'square-role-conflict':
      return 'square-role-conflict-near-miss'
    case 'square-image':
      return 'square-image-near-miss'
    case 'landscape-title-zone':
      return 'landscape-title-zone-near-miss'
    case 'landscape-text-height':
      return 'landscape-text-height-near-miss-v2'
    case 'landscape-role-conflict':
      return 'landscape-role-conflict-near-miss'
    default:
      return null
  }
}

export function buildNextUnlockCandidates(input: {
  root: string
  rows: CaseReviewNormalizedRow[]
  bestRejectedCandidates: BestRejectedCandidateRow[]
  records: PlacementSoftPolicyCandidateRecord[]
  masterResidualBlockers: MasterResidualBlockersReport
  experiment: LandscapeTextHeightProductionExperimentReport
}): NextUnlockCandidatesReport {
  const flippedCaseIds = new Set(input.experiment.flippedCases.map((item) => item.caseId))
  const bestRejectedByCase = new Map(
    input.bestRejectedCandidates.map((row) => [row.caseId, row.bestRejectedCandidate])
  )
  const masterByCase = new Map(input.masterResidualBlockers.caseRows.map((row) => [row.caseId, row]))
  const { pickRecord } = buildBestRejectedRecordMap({
    bestRejectedCandidates: input.bestRejectedCandidates,
    records: input.records,
  })

  const cases: NextUnlockCandidateRow[] = input.rows
    .filter((row) => !flippedCaseIds.has(row.caseId))
    .map((row) => {
      const bestRejected = bestRejectedByCase.get(row.caseId) || null
      const masterRow = masterByCase.get(row.caseId) || null
      const record = pickRecord(row.caseId)
      const structuralSubtypes = masterRow?.allStructuralSubtypes || []
      const priority = getNextUnlockPriority({
        bestRejected,
        masterRow,
        record,
      })

      return {
        caseId: row.caseId,
        format: row.format,
        family: row.family,
        category: row.category,
        dominantBlockerFamily: masterRow?.dominantBlockerFamily || 'other',
        dominantBlockerSubtype: masterRow?.dominantBlockerSubtype || 'unknown',
        aggregateDelta: bestRejected?.aggregateDelta || 0,
        confidenceDelta:
          bestRejected && row.baselineConfidence !== null
            ? round(bestRejected.confidence - row.baselineConfidence)
            : 0,
        severity: masterRow?.severity || record?.placementSeverity || null,
        bestRejectedCandidateKind: bestRejected?.candidateKind || null,
        onlyBlockedByOneGate: Boolean(bestRejected?.onlyBlockedByOneGate),
        primaryBlocker: bestRejected?.primaryBlocker || null,
        titleOnlyWouldPass: Boolean(masterRow?.titleOnlyWouldPass),
        messageClusterWouldPass: Boolean(masterRow?.messageClusterWouldPass),
        remainingBlockerWouldBecomeMilder: Boolean(masterRow?.remainingBlockerWouldBecomeMilder),
        legacySafetyRejected: Boolean(record?.rejectionReasons.includes('legacy-safety-rejection')),
        spacingCollapsePresent: structuralSubtypes.includes('spacing-collapse'),
        hardStructuralInvalidityPresent: Boolean(
          record?.rejectionReasons.includes('hard-structural-invalidity')
        ),
        criticalOverlapPresent: structuralSubtypes.includes('overlap-critical'),
        roleLossPresent: structuralSubtypes.includes('role-loss'),
        closeToAcceptable: Boolean(masterRow?.closeToAcceptable),
        recommendedUnlockClass: getRecommendedUnlockClass({
          priority,
          masterRow,
        }),
        recommendedUnlockPriority: priority,
      }
    })
    .sort((left, right) => {
      const rank: Record<NextUnlockPriority, number> = {
        high: 4,
        medium: 3,
        low: 2,
        'not-ready': 1,
      }
      if (rank[right.recommendedUnlockPriority] !== rank[left.recommendedUnlockPriority]) {
        return rank[right.recommendedUnlockPriority] - rank[left.recommendedUnlockPriority]
      }
      if (right.aggregateDelta !== left.aggregateDelta) return right.aggregateDelta - left.aggregateDelta
      if (right.confidenceDelta !== left.confidenceDelta) return right.confidenceDelta - left.confidenceDelta
      return left.caseId.localeCompare(right.caseId)
    })

  const blockerFamilyFrequency = sortFrequencyEntries(
    cases.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.dominantBlockerFamily)
      return acc
    }, {}),
    (family, count) => ({ family: family as MasterResidualBlockerBucket, count })
  )

  const blockerSubtypeFrequency = sortFrequencyEntries(
    cases.reduce<Record<string, number>>((acc, row) => {
      increment(acc, row.dominantBlockerSubtype)
      return acc
    }, {}),
    (subtype, count) => ({ subtype, count })
  )

  const groupedCandidateSets = Array.from(
    cases.reduce<Map<string, NextUnlockCandidateRow[]>>((acc, row) => {
      const key =
        row.recommendedUnlockClass || `not-ready:${row.dominantBlockerFamily}:${row.dominantBlockerSubtype}`
      const bucket = acc.get(key) || []
      bucket.push(row)
      acc.set(key, bucket)
      return acc
    }, new Map())
  )
    .map(([key, rows]) => {
      const rank: Record<NextUnlockPriority, number> = {
        high: 4,
        medium: 3,
        low: 2,
        'not-ready': 1,
      }
      const bestPriority = rows
        .map((row) => row.recommendedUnlockPriority)
        .sort((left, right) => rank[right] - rank[left])[0] as NextUnlockPriority
      const sample = rows[0]
      return {
        recommendedUnlockClass: key,
        recommendedUnlockPriority: bestPriority,
        blockerFamily: sample.dominantBlockerFamily,
        blockerSubtype: sample.dominantBlockerSubtype,
        caseCount: rows.length,
        topCaseIds: rows.slice(0, 10).map((row) => row.caseId),
        ready: bestPriority === 'high',
        whyReady:
          bestPriority === 'high'
            ? 'Single-gate near-miss cluster with positive score gain and no hard safety blockers.'
            : bestPriority === 'medium'
              ? 'Promising but still missing the same level of validated guard evidence as the current milestone override.'
              : bestPriority === 'low'
                ? 'Weak gain or diffuse blocker pattern; not ready for a guarded production unlock.'
                : 'Blocked by hard safety signals, severe placement, or unresolved multi-gate conflicts.',
      } satisfies NextUnlockCandidateGroup
    })
    .sort((left, right) => {
      const rank: Record<NextUnlockPriority, number> = {
        high: 4,
        medium: 3,
        low: 2,
        'not-ready': 1,
      }
      if (rank[right.recommendedUnlockPriority] !== rank[left.recommendedUnlockPriority]) {
        return rank[right.recommendedUnlockPriority] - rank[left.recommendedUnlockPriority]
      }
      if (right.caseCount !== left.caseCount) return right.caseCount - left.caseCount
      return left.recommendedUnlockClass.localeCompare(right.recommendedUnlockClass)
    })

  return {
    generatedAt: new Date().toISOString(),
    root: input.root,
    totals: {
      nonFlippedCases: cases.length,
      closeToAcceptableCases: cases.filter((row) => row.closeToAcceptable).length,
    },
    cases,
    blockerFamilyFrequency,
    blockerSubtypeFrequency,
    groupedCandidateSets,
    topRecommendedNextClass: groupedCandidateSets[0] || null,
  }
}

export function renderCaseReviewCsv(rows: CaseReviewNormalizedRow[]) {
  const encode = (value: unknown) => {
    if (Array.isArray(value)) {
      value = value.join('|')
    } else if (value === null || value === undefined) {
      value = ''
    } else if (typeof value === 'boolean') {
      value = value ? 'true' : 'false'
    } else {
      value = String(value)
    }
    const normalized = String(value).replace(/"/g, '""')
    return `"${normalized}"`
  }

  const lines = [
    CSV_COLUMNS.join(','),
    ...rows.map((row) => CSV_COLUMNS.map((column) => encode(row[column])).join(',')),
  ]
  return `${lines.join('\n')}\n`
}

export function renderCaseReviewMarkdown(
  rows: CaseReviewNormalizedRow[],
  summary: CaseReviewTuningSummary,
  limit = 30
) {
  const topRows = sortRowsForReview(rows).slice(0, limit)
  const lines = [
    '# Case Review Table',
    '',
    `- Total cases: ${summary.totals.totalCases}`,
    `- Positive rejected candidates: ${summary.totals.positiveRejectedCandidateCount}`,
    `- Single-gate blocked cases: ${summary.totals.singleGateBlockedCount}`,
    '',
    '| caseId | category | format | baselineWon | delta | bestRejectedCandidateKind | primaryBlocker | reviewPriority |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...topRows.map((row) =>
      `| ${row.caseId} | ${row.category} | ${row.format || ''} | ${row.baselineWon === null ? '' : row.baselineWon} | ${row.delta ?? ''} | ${row.bestRejectedCandidateKind || ''} | ${row.bestRejectedCandidatePrimaryBlocker || ''} | ${row.reviewPriority || ''} |`
    ),
    '',
  ]
  return lines.join('\n')
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeText(filePath: string, value: string) {
  await writeFile(filePath, value, 'utf8')
}

export async function exportCaseReviewTable(
  options: CaseReviewExportOptions
): Promise<CaseReviewExportResult> {
  const roots = await resolveExportRoots(options.root)
  const parsed = await parseCasesRoot(roots.casesRoot)
  const rows: CaseReviewNormalizedRow[] = []
  const placementRecords: PlacementSoftPolicyCandidateRecord[] = []

  for (const caseInput of parsed.cases) {
    const loaded = await loadCaseArtifacts(caseInput)
    const row = buildCaseReviewRow({
      caseInput,
      paths: loaded.paths,
      artifacts: loaded.artifacts,
    })
    rows.push(row)
    placementRecords.push(
      ...buildPlacementRecords({
        row,
        telemetry: loaded.artifacts.telemetry,
        calibration: loaded.artifacts.calibration,
      })
    )
  }

  const sortedRows = sortRowsForReview(rows)
  const bestRejectedCandidates = buildBestRejectedCandidateRows(sortedRows)
  const tuningSummary = buildTuningSummary(sortedRows, {
    root: roots.outputRoot,
    reviewQueueSize: options.reviewQueueSize || 20,
  })
  const placementSoftPolicyDiagnostics = buildPlacementSoftPolicyDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementDeepDiagnostics = buildPlacementDeepDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementRoleHotspots = buildPlacementRoleHotspots({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementImageSquareDiagnostics = buildPlacementImageSquareDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementImageLandscapeDiagnostics = buildPlacementImageLandscapeDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const landscapeImageNearMissExperiment = buildLandscapeImageNearMissExperiment({
    root: roots.outputRoot,
    rows: sortedRows,
    records: placementRecords,
  })
  const placementBadgeLandscapeDiagnostics = buildPlacementBadgeLandscapeDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementTextSquareDiagnostics = buildPlacementTextSquareDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementTextLandscapeDiagnostics = buildPlacementTextLandscapeDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementCtaLandscapeDiagnostics = buildPlacementCtaLandscapeDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementCtaAnchorLandscapeDiagnostics = buildPlacementCtaAnchorLandscapeDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementMessageLandscapeDiagnostics = buildPlacementMessageLandscapeDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const placementRoleConflictLandscapeDiagnostics = buildPlacementRoleConflictLandscapeDiagnostics({
    root: roots.outputRoot,
    records: placementRecords,
  })
  const squareRoleConflictDiagnostics = buildSquareRoleConflictDiagnostics({
    root: roots.outputRoot,
    rows: sortedRows,
    bestRejectedCandidates,
    records: placementRecords,
  })
  const squareCtaVsTextDiagnostics = buildSquareCtaVsTextDiagnostics({
    root: roots.outputRoot,
    rows: sortedRows,
    bestRejectedCandidates,
    records: placementRecords,
  })
  const squareCtaVsSubtitleDiagnostics = buildSquareCtaVsSubtitleDiagnostics({
    root: roots.outputRoot,
    rows: sortedRows,
    bestRejectedCandidates,
    records: placementRecords,
  })
  const masterResidualBlockers = buildMasterResidualBlockers({
    root: roots.outputRoot,
    rows: sortedRows,
    bestRejectedCandidates,
    records: placementRecords,
  })
  const landscapeTextHeightProductionExperiment = buildLandscapeTextHeightProductionExperiment({
    root: roots.outputRoot,
    rows: sortedRows,
    records: placementRecords,
  })
  const validatedUnlockClasses = buildValidatedUnlockClasses({
    root: roots.outputRoot,
    experiment: landscapeTextHeightProductionExperiment,
  })
  const nextUnlockCandidates = buildNextUnlockCandidates({
    root: roots.outputRoot,
    rows: sortedRows,
    bestRejectedCandidates,
    records: placementRecords,
    masterResidualBlockers,
    experiment: landscapeTextHeightProductionExperiment,
  })

  const outputPaths = {
    tableJson: path.join(roots.outputRoot, '_case-review-table.json'),
    tableCsv: path.join(roots.outputRoot, '_case-review-table.csv'),
    bestRejectedJson: path.join(roots.outputRoot, '_best-rejected-candidates.json'),
    tuningSummaryJson: path.join(roots.outputRoot, '_tuning-summary.json'),
    tableMarkdown: path.join(roots.outputRoot, '_case-review-table.md'),
    placementSoftPolicyJson: path.join(roots.outputRoot, '_placement-soft-policy-diagnostics.json'),
    placementDeepDiagnosticsJson: path.join(roots.outputRoot, '_placement-deep-diagnostics.json'),
    placementRoleHotspotsJson: path.join(roots.outputRoot, '_placement-role-hotspots.json'),
    placementImageSquareDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-image-square-diagnostics.json'
    ),
    placementImageLandscapeDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-image-landscape-diagnostics.json'
    ),
    landscapeImageNearMissExperimentJson: path.join(
      roots.outputRoot,
      '_landscape-image-near-miss-experiment.json'
    ),
    placementBadgeLandscapeDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-badge-landscape-diagnostics.json'
    ),
    placementTextSquareDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-text-square-diagnostics.json'
    ),
    placementTextLandscapeDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-text-landscape-diagnostics.json'
    ),
    placementCtaLandscapeDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-cta-landscape-diagnostics.json'
    ),
    placementCtaAnchorLandscapeDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-cta-anchor-landscape-diagnostics.json'
    ),
    placementMessageLandscapeDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-message-landscape-diagnostics.json'
    ),
    placementRoleConflictLandscapeDiagnosticsJson: path.join(
      roots.outputRoot,
      '_placement-role-conflict-landscape-diagnostics.json'
    ),
    squareRoleConflictDiagnosticsJson: path.join(
      roots.outputRoot,
      '_square-role-conflict-diagnostics.json'
    ),
    squareCtaVsTextDiagnosticsJson: path.join(
      roots.outputRoot,
      '_square-cta-vs-text-diagnostics.json'
    ),
    squareCtaVsSubtitleDiagnosticsJson: path.join(
      roots.outputRoot,
      '_square-cta-vs-subtitle-diagnostics.json'
    ),
    masterResidualBlockersJson: path.join(roots.outputRoot, '_master-residual-blockers.json'),
    landscapeTextHeightProductionExperimentJson: path.join(
      roots.outputRoot,
      '_landscape-text-height-production-experiment.json'
    ),
    validatedUnlockClassesJson: path.join(roots.outputRoot, '_validated-unlock-classes.json'),
    nextUnlockCandidatesJson: path.join(roots.outputRoot, '_next-unlock-candidates.json'),
  }

  await writeJson(outputPaths.tableJson, sortedRows)
  await writeText(outputPaths.tableCsv, renderCaseReviewCsv(sortedRows))
  await writeJson(outputPaths.bestRejectedJson, bestRejectedCandidates)
  await writeJson(outputPaths.tuningSummaryJson, tuningSummary)
  await writeJson(outputPaths.placementSoftPolicyJson, placementSoftPolicyDiagnostics)
  await writeJson(outputPaths.placementDeepDiagnosticsJson, placementDeepDiagnostics)
  await writeJson(outputPaths.placementRoleHotspotsJson, placementRoleHotspots)
  await writeJson(outputPaths.placementImageSquareDiagnosticsJson, placementImageSquareDiagnostics)
  await writeJson(outputPaths.placementImageLandscapeDiagnosticsJson, placementImageLandscapeDiagnostics)
  await writeJson(outputPaths.landscapeImageNearMissExperimentJson, landscapeImageNearMissExperiment)
  await writeJson(outputPaths.placementBadgeLandscapeDiagnosticsJson, placementBadgeLandscapeDiagnostics)
  await writeJson(outputPaths.placementTextSquareDiagnosticsJson, placementTextSquareDiagnostics)
  await writeJson(outputPaths.placementTextLandscapeDiagnosticsJson, placementTextLandscapeDiagnostics)
  await writeJson(outputPaths.placementCtaLandscapeDiagnosticsJson, placementCtaLandscapeDiagnostics)
  await writeJson(
    outputPaths.placementCtaAnchorLandscapeDiagnosticsJson,
    placementCtaAnchorLandscapeDiagnostics
  )
  await writeJson(outputPaths.placementMessageLandscapeDiagnosticsJson, placementMessageLandscapeDiagnostics)
  await writeJson(
    outputPaths.placementRoleConflictLandscapeDiagnosticsJson,
    placementRoleConflictLandscapeDiagnostics
  )
  await writeJson(outputPaths.squareRoleConflictDiagnosticsJson, squareRoleConflictDiagnostics)
  await writeJson(outputPaths.squareCtaVsTextDiagnosticsJson, squareCtaVsTextDiagnostics)
  await writeJson(outputPaths.squareCtaVsSubtitleDiagnosticsJson, squareCtaVsSubtitleDiagnostics)
  await writeJson(outputPaths.masterResidualBlockersJson, masterResidualBlockers)
  await writeJson(
    outputPaths.landscapeTextHeightProductionExperimentJson,
    landscapeTextHeightProductionExperiment
  )
  await writeJson(outputPaths.validatedUnlockClassesJson, validatedUnlockClasses)
  await writeJson(outputPaths.nextUnlockCandidatesJson, nextUnlockCandidates)
  await writeText(
    outputPaths.tableMarkdown,
    renderCaseReviewMarkdown(sortedRows, tuningSummary, options.markdownLimit || 30)
  )

  return {
    root: roots.outputRoot,
    casesRoot: roots.casesRoot,
    rows: sortedRows,
    bestRejectedCandidates,
    tuningSummary,
    placementSoftPolicyDiagnostics,
    placementDeepDiagnostics,
    placementRoleHotspots,
    placementImageSquareDiagnostics,
    placementImageLandscapeDiagnostics,
    placementBadgeLandscapeDiagnostics,
    placementTextSquareDiagnostics,
    placementTextLandscapeDiagnostics,
    placementCtaLandscapeDiagnostics,
    placementCtaAnchorLandscapeDiagnostics,
    placementMessageLandscapeDiagnostics,
    placementRoleConflictLandscapeDiagnostics,
    squareRoleConflictDiagnostics,
    squareCtaVsTextDiagnostics,
    squareCtaVsSubtitleDiagnostics,
    masterResidualBlockers,
    landscapeImageNearMissExperiment,
    landscapeTextHeightProductionExperiment,
    validatedUnlockClasses,
    nextUnlockCandidates,
    outputPaths,
  }
}
