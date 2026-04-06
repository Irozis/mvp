import type {
  CalibrationCaseFormat,
  CalibrationCaseStatus,
} from './calibrationCaseSchema'
import type { CalibrationReviewPriority } from './calibrationReview'
import type { RepairRejectionReason } from './types'
import type { PlacementViolationSeverity } from './types'

export type CaseReviewExportStatus = CalibrationCaseStatus | 'missing-artifact'

export type CaseReviewPrimaryBlocker =
  | 'role-placement-out-of-zone'
  | 'legacy-safety-rejection'
  | 'spacing-threshold-exceeded'
  | 'confidence-collapse'
  | 'aggregate-below-baseline'
  | 'no-net-gain'
  | 'other'
  | 'unknown'

export type CaseReviewBestRejectedCandidate = {
  candidateId: string
  candidateKind: string
  strategyLabel: string
  aggregateScore: number
  aggregateDelta: number
  effectiveScore: number
  confidence: number
  confidenceDelta: number
  rejectionReasons: RepairRejectionReason[]
  primaryBlocker: CaseReviewPrimaryBlocker
  onlyBlockedByOneGate: boolean
  wouldBeatBaseline: boolean
  wouldImproveConfidence: boolean
}

export type CaseReviewNormalizedRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  formatKey: string | null
  inputPath: string
  caseFolderPath: string

  status: CaseReviewExportStatus
  baselineWon: boolean | null
  winnerAccepted: boolean | null
  winnerKind: string | null
  winnerStrategyLabel: string | null
  baselineAggregate: number | null
  winnerAggregate: number | null
  delta: number | null
  baselineConfidence: number | null
  winnerConfidence: number | null
  winnerConfidenceDelta: number | null
  reviewPriority: CalibrationReviewPriority | null
  whyReview: string | null
  shortSummary: string | null

  topTags: string[]
  topRejectionReasons: string[]
  dominantTags: string[]
  dominantPenalties: string[]
  issueCodes: string[]
  structuralStatus: string | null
  verdict: string | null
  score: number | null

  bestRejectedCandidateKind: string | null
  bestRejectedCandidateId: string | null
  bestRejectedCandidateStrategy: string | null
  bestRejectedCandidateAggregate: number | null
  bestRejectedCandidateDelta: number | null
  bestRejectedCandidateConfidence: number | null
  bestRejectedCandidateRejectionReasons: string[]
  bestRejectedCandidatePrimaryBlocker: CaseReviewPrimaryBlocker | null
  bestRejectedCandidateOnlyBlockedByOneGate: boolean
  bestRejectedCandidateWouldBeatBaseline: boolean
  bestRejectedCandidateWouldImproveConfidence: boolean

  hasPositiveRejectedCandidate: boolean
  hasSingleGateBlockedCandidate: boolean
  blockedByRolePlacement: boolean
  blockedByLegacySafety: boolean
  blockedByNoNetGain: boolean
  blockedBySpacing: boolean
  blockedByAggregateBelowBaseline: boolean
  needsHumanAttention: boolean

  humanVerdictPresent: boolean
  fixedVsBaseline: 'better' | 'same' | 'worse' | null
  humanAcceptedWinner: boolean | null
  machineHumanAgreement: boolean | null
  agreementType: string | null

  reportPath: string | null
  telemetryPath: string | null
  calibrationPath: string | null
  winnerPath: string | null
  baselinePath: string | null
  notesPath: string | null
  previewBaselinePath: string | null
  previewWinnerPath: string | null
}

export type BestRejectedCandidateRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  formatKey: string | null
  reviewPriority: CalibrationReviewPriority | null
  whyReview: string | null
  baselineAggregate: number | null
  winnerAggregate: number | null
  delta: number | null
  winnerKind: string | null
  bestRejectedCandidate: CaseReviewBestRejectedCandidate | null
  reportPath: string | null
  telemetryPath: string | null
  calibrationPath: string | null
}

export type CaseReviewBlockerFrequency = {
  blocker: string
  count: number
}

export type CaseReviewAggregateSlice = {
  key: string
  caseCount: number
  baselineWinRate: number
  positiveRejectedCandidateCount: number
  singleGateBlockedCount: number
  confidenceImprovedRejectedCount: number
  dominantBlockers: Array<{ blocker: string; count: number }>
  topAffectedCaseIds: string[]
}

export type CaseReviewTuningTarget = {
  theme: string
  blocker: CaseReviewPrimaryBlocker | null
  category: string | null
  format: CalibrationCaseFormat | null
  family: string | null
  caseCount: number
  positiveRejectedCandidateCount: number
  singleGateBlockedCount: number
  topCaseIds: string[]
}

export type CaseReviewQueueEntry = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  inputPath: string
  reportPath: string | null
  telemetryPath: string | null
  calibrationPath: string | null
  baselineAggregate: number | null
  winnerAggregate: number | null
  delta: number | null
  reviewPriority: CalibrationReviewPriority | null
  whyReview: string
}

export type CaseReviewTuningSummary = {
  generatedAt: string
  root: string
  totals: {
    totalCases: number
    successfulCases: number
    baselineWinCount: number
    candidateWinCount: number
    positiveRejectedCandidateCount: number
    singleGateBlockedCount: number
    confidenceImprovedRejectedCount: number
  }
  blockerFrequency: {
    bestRejectedCandidates: CaseReviewBlockerFrequency[]
    allRejectedCandidates: CaseReviewBlockerFrequency[]
  }
  nearMisses: {
    positiveRejectedCases: string[]
    singleGateBlockedCases: string[]
    confidenceImprovedRejectedCases: string[]
  }
  byCategory: CaseReviewAggregateSlice[]
  byFormat: CaseReviewAggregateSlice[]
  byFamily: CaseReviewAggregateSlice[]
  blockerHotspots: {
    byCategory: Array<{ blocker: string; key: string; count: number }>
    byFormat: Array<{ blocker: string; key: string; count: number }>
    byFamily: Array<{ blocker: string; key: string; count: number }>
  }
  topTuningTargets: CaseReviewTuningTarget[]
  reviewFirst: CaseReviewQueueEntry[]
  failedCases: Array<{ caseId: string; status: CaseReviewExportStatus; whyReview: string | null }>
}

export type CaseReviewExportResult = {
  root: string
  casesRoot: string
  rows: CaseReviewNormalizedRow[]
  bestRejectedCandidates: BestRejectedCandidateRow[]
  tuningSummary: CaseReviewTuningSummary
  placementSoftPolicyDiagnostics: PlacementSoftPolicyDiagnosticsReport
  placementDeepDiagnostics: PlacementDeepDiagnosticsReport
  placementRoleHotspots: PlacementRoleHotspotsReport
  placementImageSquareDiagnostics: PlacementImageSquareDiagnosticsReport
  placementImageLandscapeDiagnostics: PlacementImageLandscapeDiagnosticsReport
  placementBadgeLandscapeDiagnostics: PlacementBadgeLandscapeDiagnosticsReport
  placementTextSquareDiagnostics: PlacementTextSquareDiagnosticsReport
  placementTextLandscapeDiagnostics: PlacementTextLandscapeDiagnosticsReport
  placementCtaLandscapeDiagnostics: PlacementCtaLandscapeDiagnosticsReport
  placementCtaAnchorLandscapeDiagnostics: PlacementCtaAnchorLandscapeDiagnosticsReport
  placementMessageLandscapeDiagnostics: PlacementMessageLandscapeDiagnosticsReport
  placementRoleConflictLandscapeDiagnostics: PlacementRoleConflictLandscapeDiagnosticsReport
  masterResidualBlockers: MasterResidualBlockersReport
  landscapeImageNearMissExperiment: LandscapeImageNearMissExperimentReport
  landscapeTextHeightProductionExperiment: LandscapeTextHeightProductionExperimentReport
  outputPaths: {
    tableJson: string
    tableCsv: string
    bestRejectedJson: string
    tuningSummaryJson: string
    tableMarkdown: string
    placementSoftPolicyJson: string
    placementDeepDiagnosticsJson: string
    placementRoleHotspotsJson: string
    placementImageSquareDiagnosticsJson: string
    placementImageLandscapeDiagnosticsJson: string
    placementBadgeLandscapeDiagnosticsJson: string
    placementTextSquareDiagnosticsJson: string
    placementTextLandscapeDiagnosticsJson: string
    placementCtaLandscapeDiagnosticsJson: string
    placementCtaAnchorLandscapeDiagnosticsJson: string
    placementMessageLandscapeDiagnosticsJson: string
    placementRoleConflictLandscapeDiagnosticsJson: string
    masterResidualBlockersJson: string
    landscapeImageNearMissExperimentJson: string
    landscapeTextHeightProductionExperimentJson: string
  }
  }

export type PlacementSoftPolicyCaseUnlock = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateKind: string
  candidateId: string
  strategyLabel: string
  placementSeverity: PlacementViolationSeverity
  adjustedAggregateScore: number
  aggregateDelta: number
  softPlacementPenalty: number
  rejectionReasons: string[]
}

export type PlacementSoftPolicyDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    totalRolePlacementRejections: number
    severityCounts: Record<PlacementViolationSeverity, number>
    unlockedCandidateCount: number
    unlockedCaseCount: number
  }
  byCategory: Array<{
    key: string
    rolePlacementRejectionCount: number
    unlockedCaseCount: number
    unlockedCandidateCount: number
  }>
  byFormat: Array<{
    key: string
    rolePlacementRejectionCount: number
    unlockedCaseCount: number
    unlockedCandidateCount: number
  }>
  byFamily: Array<{
    key: string
    rolePlacementRejectionCount: number
    unlockedCaseCount: number
    unlockedCandidateCount: number
  }>
  topCaseIdsUnlockedBySoftPlacement: PlacementSoftPolicyCaseUnlock[]
  topCandidateKindsUnlockedBySoftPlacement: Array<{ candidateKind: string; count: number }>
}

export type PlacementDeepDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  placementSeverity: PlacementViolationSeverity
  avgAllowedDistance: number
  avgPreferredDistance: number
  violatingRoles: string[]
  perRoleDistances: Array<{
    role: string
    eligible: boolean
    eligibilityReason: string | null
    allowedDistance: number
    preferredDistance: number
    allowedZonesCount: number
    preferredZonesCount: number
    zonePaddingApplied: number
    rect: { x: number; y: number; w: number; h: number } | null
    allowedZones: Array<{ x: number; y: number; w: number; h: number }>
    preferredZones: Array<{ x: number; y: number; w: number; h: number }>
  }>
  skippedRoles: Array<{
    role: string
    reason: string
  }>
  textBoxes: {
    titleRect: { x: number; y: number; w: number; h: number }
    subtitleRect: { x: number; y: number; w: number; h: number }
    combinedBoundsRect: { x: number; y: number; w: number; h: number }
  }
}

export type PlacementDeepDiagnosticsReport = {
  generatedAt: string
  root: string
  topBlockedCandidates: PlacementDeepDiagnosticRow[]
}

export type PlacementRoleHotspotEntry = {
  role: string
  count: number
}

export type PlacementRoleHotspotSlice = {
  key: string
  totalRolePlacementRejections: number
  dominantRoleCounts: PlacementRoleHotspotEntry[]
}

export type PlacementRoleHotspotCase = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  violatingRoles: string[]
  avgAllowedDistance: number
  avgPreferredDistance: number
}

export type PlacementRoleHotspotsReport = {
  generatedAt: string
  root: string
  dominantRoleFrequency: PlacementRoleHotspotEntry[]
  byCategory: PlacementRoleHotspotSlice[]
  byFormat: PlacementRoleHotspotSlice[]
  byFamily: PlacementRoleHotspotSlice[]
  badgeAloneSevereCases: PlacementRoleHotspotCase[]
  imageAloneSevereCases: PlacementRoleHotspotCase[]
  badgeImageSevereCases: PlacementRoleHotspotCase[]
}

export type PlacementImageSquareDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  imageRect: { x: number; y: number; w: number; h: number } | null
  baselineImageRect: { x: number; y: number; w: number; h: number } | null
  allowedImageZones: Array<{ x: number; y: number; w: number; h: number }>
  preferredImageZones: Array<{ x: number; y: number; w: number; h: number }>
  allowedDistance: number
  preferredDistance: number
  zonePaddingApplied: number
  preservesCompositionBalance: boolean
  likelyAlignedWithStrategy: boolean
  isImageBalanceRepair: boolean
  isGuidedRegenerationRepair: boolean
  imageMovedRelativeToBaseline: boolean
  improvedAggregateScore: boolean
  aggregateDelta: number
}

export type PlacementImageSquareDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    squareDisplayBlockedCandidates: number
    dominantImageCount: number
    imageOnlyDominantCount: number
    justOutsideZoneCount: number
    moderatelyOutsideZoneCount: number
    fundamentallyFarCount: number
    improvedImageCandidateCount: number
    imageNoLongerDominantCount: number
  }
  topBlockedCandidates: PlacementImageSquareDiagnosticRow[]
  topImprovedCandidates: PlacementImageSquareDiagnosticRow[]
}

export type PlacementBadgeLandscapeDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  badgeRect: { x: number; y: number; w: number; h: number } | null
  allowedBadgeZones: Array<{ x: number; y: number; w: number; h: number }>
  preferredBadgeZones: Array<{ x: number; y: number; w: number; h: number }>
  allowedDistance: number
  preferredDistance: number
  zonePaddingApplied: number
  badgeSemanticallyActive: boolean
  badgeVisuallyCritical: boolean
  badgeAffectsCoreReadingFlow: boolean
  badgeLikelyOptional: boolean
  wouldBeAcceptableIfBadgeIgnored: boolean
  improvedAggregateScore: boolean
  aggregateDelta: number
}

export type PlacementBadgeLandscapeDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    landscapeDisplayBlockedCandidates: number
    dominantBadgeCount: number
    badgeAloneSevereCount: number
    semanticallyActiveCount: number
    visuallyCriticalCount: number
    likelyOptionalCount: number
    acceptableIfBadgeIgnoredCount: number
  }
  topBlockedCandidates: PlacementBadgeLandscapeDiagnosticRow[]
  topImprovedCandidates: PlacementBadgeLandscapeDiagnosticRow[]
}

export type PlacementImageLandscapeDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  baselineImageRect: { x: number; y: number; w: number; h: number } | null
  candidateImageRect: { x: number; y: number; w: number; h: number } | null
  imageDeltaX: number
  imageDeltaY: number
  imageDeltaW: number
  imageDeltaH: number
  allowedImageZones: Array<{ x: number; y: number; w: number; h: number }>
  preferredImageZones: Array<{ x: number; y: number; w: number; h: number }>
  allowedDistance: number
  preferredDistance: number
  rawAllowedDistance: number
  rawPreferredDistance: number
  zonePaddingApplied: number
  preservesVisualBalance: boolean
  supportsTextCtaCluster: boolean
  movedTowardCoherentSplitLayout: boolean
  imageDominantBlockingRole: boolean
  wouldBecomeMilderUnderLandscapeImagePolicy: boolean
  splitSideOccupancy: number
  supportsReadingFlow: boolean
  matchesLandscapeSplitPattern: boolean
  structurallyAcceptableFootprint: boolean
  justOutsideCurrentZones: boolean
  improvedAggregateScore: boolean
  aggregateDelta: number
}

export type PlacementImageLandscapeDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    landscapeDisplayBlockedCandidates: number
    dominantImageCount: number
    imageOnlyDominantCount: number
    imageOnlySevereCount: number
    justOutsideZoneCount: number
    moderatelyOutsideZoneCount: number
    fundamentallyFarCount: number
    improvedImageCandidateCount: number
    wouldBecomeMilderCount: number
  }
  topBlockedCandidates: PlacementImageLandscapeDiagnosticRow[]
  topImprovedCandidates: PlacementImageLandscapeDiagnosticRow[]
}

export type LandscapeImageNearMissExperimentCandidate = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  aggregateDelta: number
  baselineConfidence: number
  candidateConfidence: number
  nearMissOverrideEligible: boolean
  nearMissOverrideBlockedReasons: string[]
  nearMissOverrideSafeguardsSatisfied: boolean
  wouldWinUnderNearMissOverride: boolean
}

export type LandscapeImageNearMissExperimentReport = {
  generatedAt: string
  root: string
  comparison: {
    baselineWinCountCurrent: number
    candidateWinCountCurrent: number
    candidateWinCountSimulated: number
    changedCasesCount: number
  }
  totals: {
    eligibleCandidates: number
    eligibleCases: number
    flippedCases: number
  }
  byCategory: Array<{ key: string; eligibleCandidates: number; flippedCases: number }>
  byCandidateKind: Array<{ candidateKind: string; count: number }>
  topCaseIds: string[]
  flippedCases: LandscapeImageNearMissExperimentCandidate[]
  safeguardBlockedCandidates: LandscapeImageNearMissExperimentCandidate[]
}

export type LandscapeTextHeightProductionExperimentCase = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  blockerFamily: string | null
  blockerSubtype: string | null
  severity: PlacementViolationSeverity
  baselineAggregate: number
  candidateAggregate: number
  aggregateDelta: number
  baselineConfidence: number
  candidateConfidence: number
  confidenceDelta: number
  nearMissOverrideEligible: boolean
  nearMissOverrideApplied: boolean
  nearMissOverrideReason: string | null
  safeguardResults: Record<string, boolean>
  safeguardFailures: string[]
  finalWinnerChangedByOverride: boolean
}

export type LandscapeTextHeightProductionExperimentReport = {
  generatedAt: string
  root: string
  comparison: {
    baselineWinCountCurrent: number
    candidateWinCountCurrent: number
    flippedCasesCount: number
  }
  totals: {
    eligibleCandidates: number
    eligibleCases: number
    appliedOverrides: number
    flippedCases: number
  }
  flippedCases: LandscapeTextHeightProductionExperimentCase[]
  appliedOverrides: LandscapeTextHeightProductionExperimentCase[]
  eligibleCandidates: LandscapeTextHeightProductionExperimentCase[]
  safeguardFailures: LandscapeTextHeightProductionExperimentCase[]
}

export type PlacementTextSquareDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  titleRect: { x: number; y: number; w: number; h: number } | null
  subtitleRect: { x: number; y: number; w: number; h: number } | null
  combinedTextRect: { x: number; y: number; w: number; h: number } | null
  allowedTextZones: Array<{ x: number; y: number; w: number; h: number }>
  preferredTextZones: Array<{ x: number; y: number; w: number; h: number }>
  allowedDistance: number
  preferredDistance: number
  combinedAllowedDistance: number
  combinedPreferredDistance: number
  zonePaddingApplied: number
  titleOnlyAllowedDistance: number
  titleOnlyPreferredDistance: number
  titlePlacementDistance: number
  subtitleAttachmentDistance: number
  subtitleInflationContribution: number
  titleSubtitleVerticalGap: number
  clusterHeight: number
  clusterWidth: number
  combinedClusterFootprint: number
  clusterRemainsCoherent: boolean
  preservesReadingFlow: boolean
  likelyAlignedWithStrategy: boolean
  combinedInflatedMainlyBySubtitle: boolean
  titleDominatesMainTextPlacement: boolean
  subtitleDetached: boolean
  titleOnlyWouldFitBetterThanCombined: boolean
  combinedBoundsMainReason: boolean
  severeDrivenByCombinedClusterOnly: boolean
  wouldBecomeMilderUnderAttachmentAwarePolicy: boolean
  improvedAggregateScore: boolean
  aggregateDelta: number
}

export type PlacementTextSquareDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    squareDisplayBlockedCandidates: number
    dominantTextCount: number
    textOnlyDominantCount: number
    combinedBoundsSevereCount: number
    titleOnlyMilderThanCombinedCount: number
    improvedTextCandidateCount: number
    wouldBecomeMilderCount: number
  }
  topBlockedCandidates: PlacementTextSquareDiagnosticRow[]
  topImprovedCandidates: PlacementTextSquareDiagnosticRow[]
}

export type PlacementTextLandscapeDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  titleRect: { x: number; y: number; w: number; h: number } | null
  subtitleRect: { x: number; y: number; w: number; h: number } | null
  ctaRect: { x: number; y: number; w: number; h: number } | null
  combinedTextRect: { x: number; y: number; w: number; h: number } | null
  allowedTextZones: Array<{ x: number; y: number; w: number; h: number }>
  preferredTextZones: Array<{ x: number; y: number; w: number; h: number }>
  titlePlacementDistance: number
  titlePreferredDistance: number
  subtitleAttachmentDistance: number
  ctaAttachmentDistance: number
  ctaAttachmentSeverity: PlacementViolationSeverity
  ctaWithinSplitLayoutTolerance: boolean
  ctaReadingFlowContinuity: number
  ctaMessageAssociationScore: number
  disconnectDrivenPrimarilyByGap: boolean
  disconnectDrivenPrimarilyByHorizontalOffset: boolean
  combinedAllowedDistance: number
  combinedPreferredDistance: number
  clusterFootprint: number
  titleDominatesMainTextPlacement: boolean
  subtitleDetached: boolean
  ctaDetached: boolean
  textImageSplitCoherent: boolean
  fullClusterCoherent: boolean
  severeDrivenByCombinedClusterOnly: boolean
  wouldBecomeMilderUnderAttachmentAwarePolicy: boolean
  wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy: boolean
  titleSubtitleVerticalGap: number
  titleSubtitleHorizontalOffset: number
  titleCtaDistance: number
  subtitleCtaDistance: number
  subtitleInflationContribution: number
  criticalIssues: string[]
  aggregateDelta: number
  confidenceDelta: number
}

export type PlacementTextLandscapeDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    landscapeDisplayBlockedCandidates: number
    dominantTextCount: number
    dominantCtaCount: number
    titleFineButAttachmentWeakCount: number
    combinedClusterDrivenCount: number
    ctaDetachedMainCount: number
    wouldBecomeMilderCount: number
  }
  dominantBlockerFrequency: Array<{ blocker: string; count: number }>
  criticalIssueFrequency: Array<{ issue: string; count: number }>
  topBlockedCandidates: PlacementTextLandscapeDiagnosticRow[]
  topAttachmentCandidates: PlacementTextLandscapeDiagnosticRow[]
}

export type PlacementCtaLandscapeDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    landscapeDisplayBlockedCandidates: number
    dominantCtaCount: number
    ctaDetachedMainCount: number
    gapDrivenCount: number
    horizontalDrivenCount: number
    wouldBecomeMilderCount: number
  }
  categoriesAffected: Array<{ key: string; count: number }>
  criticalIssueFrequency: Array<{ issue: string; count: number }>
  topImprovedCandidates: PlacementTextLandscapeDiagnosticRow[]
  topBlockedCandidates: PlacementTextLandscapeDiagnosticRow[]
}

export type PlacementCtaAnchorLandscapeDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  aggregateDelta: number
  confidenceDelta: number
  ctaRect: { x: number; y: number; w: number; h: number } | null
  titleRect: { x: number; y: number; w: number; h: number } | null
  subtitleRect: { x: number; y: number; w: number; h: number } | null
  messageClusterRect: { x: number; y: number; w: number; h: number } | null
  ctaAnchorConflict: boolean
  ctaAnchorDistance: number
  ctaAnchorVerticalGap: number
  ctaAnchorHorizontalOffset: number
  ctaWithinSplitLayoutTolerance: boolean
  ctaReadingFlowContinuity: number
  ctaMessageAssociationScore: number
  ctaAnchorWouldBecomeMilder: boolean
  structuralSubtypes: string[]
}

export type PlacementCtaAnchorLandscapeDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    landscapeDisplayBlockedCandidates: number
    ctaAnchorConflictCount: number
    dominantCtaCount: number
    wouldBecomeMilderCount: number
    nearUnlockCandidateCount: number
  }
  categoriesAffected: Array<{ key: string; count: number }>
  structuralSubtypeFrequency: Array<{ subtype: string; count: number }>
  topBlockedCandidates: PlacementCtaAnchorLandscapeDiagnosticRow[]
  topImprovedCandidates: PlacementCtaAnchorLandscapeDiagnosticRow[]
}

export type PlacementMessageLandscapeDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  titleRect: { x: number; y: number; w: number; h: number } | null
  subtitleRect: { x: number; y: number; w: number; h: number } | null
  titlePlacementDistance: number
  subtitleAttachmentDistance: number
  rawCombinedMessageAllowedDistance: number
  rawCombinedMessagePreferredDistance: number
  combinedMessageAllowedDistance: number
  combinedMessagePreferredDistance: number
  messageClusterFootprint: number
  messageClusterHeight: number
  messageClusterWidth: number
  titlePrimaryAnchorWeight: number
  subtitleSecondaryMassWeight: number
  titleDominatesMessagePlacement: boolean
  subtitleDetached: boolean
  messageImageSplitCoherent: boolean
  messageClusterCoherent: boolean
  severeDrivenByCombinedMessageClusterOnly: boolean
  severeDrivenBySubtitleInflationOnly: boolean
  wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy: boolean
  modelSlotMismatch: boolean
  titleSubtitleVerticalGap: number
  titleSubtitleHorizontalOffset: number
  subtitleInflationContribution: number
  subtitleInflatesMainly: boolean
  titleOnlyWouldBeMilder: boolean
  messageClusterTooTall: boolean
  splitLayoutViolation: boolean
  aggregateDelta: number
  confidenceDelta: number
  structuralSubtypes: string[]
}

export type PlacementMessageLandscapeDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    landscapeDisplayBlockedCandidates: number
    dominantMessageBlockerCount: number
    titleOnlyMilderThanCombinedCount: number
    subtitleInflationMainCount: number
    messageClusterOversizeCount: number
    splitCoherenceFailureCount: number
    modelSlotMismatchCount: number
    wouldBecomeMilderCount: number
  }
  dominantBlockerFrequency: Array<{ blocker: string; count: number }>
  structuralSubtypeFrequency: Array<{ subtype: string; count: number }>
  topBlockedCandidates: PlacementMessageLandscapeDiagnosticRow[]
  topOversizedCandidates: PlacementMessageLandscapeDiagnosticRow[]
}

export type PlacementRoleConflictLandscapeSubtype =
  | 'title-zone-conflict'
  | 'subtitle-zone-conflict'
  | 'cta-anchor-conflict'
  | 'text-too-wide-for-split'
  | 'text-too-tall-for-split'
  | 'message-vs-image-occupancy-conflict'
  | 'left-right-split-conflict'
  | 'image-zone-conflict'
  | 'mixed-role-zone-conflict'

export type PlacementRoleConflictLandscapeDiagnosticRow = {
  caseId: string
  category: string
  format: CalibrationCaseFormat | null
  family: string | null
  candidateId: string
  candidateKind: string
  strategyLabel: string
  dominantRole: string
  aggregateDelta: number
  confidenceDelta: number
  titleRect: { x: number; y: number; w: number; h: number } | null
  subtitleRect: { x: number; y: number; w: number; h: number } | null
  ctaRect: { x: number; y: number; w: number; h: number } | null
  imageRect: { x: number; y: number; w: number; h: number } | null
  textClusterRect: { x: number; y: number; w: number; h: number } | null
  roleConflictSubtype: PlacementRoleConflictLandscapeSubtype
  roleConflictReasons: PlacementRoleConflictLandscapeSubtype[]
  titleZoneConflict: boolean
  subtitleZoneConflict: boolean
  ctaZoneConflict: boolean
  imageZoneConflict: boolean
  leftRightSplitConflict: boolean
  messageVsImageOccupancyConflict: boolean
  textTooWideForSplit: boolean
  textTooTallForSplit: boolean
  ctaAnchorConflict: boolean
  titleOnlyWouldPass: boolean
  messageClusterWouldPass: boolean
  remainingBlockerWouldBecomeMilder: boolean
  structuralSubtypes: string[]
}

export type PlacementRoleConflictLandscapeDiagnosticsReport = {
  generatedAt: string
  root: string
  totals: {
    landscapeDisplayBlockedCandidates: number
    textDominantCount: number
    ctaDominantCount: number
    closeToAcceptableCount: number
  }
  subtypeFrequency: Array<{ subtype: PlacementRoleConflictLandscapeSubtype; count: number }>
  dominantRoleFrequency: Array<{ role: string; count: number }>
  bySubtype: Array<{
    subtype: PlacementRoleConflictLandscapeSubtype
    count: number
    topCaseIds: string[]
  }>
  textDominantSummary: {
    textDominantCount: number
    titleZoneConflictCount: number
    titleOnlyWouldPassCount: number
    textTooWideForSplitCount: number
    textTooTallForSplitCount: number
    messageVsImageOccupancyConflictCount: number
    leftRightSplitConflictCount: number
    mixedRoleZoneConflictCount: number
  }
  topBlockedCandidates: PlacementRoleConflictLandscapeDiagnosticRow[]
  topCloseToAcceptableCandidates: PlacementRoleConflictLandscapeDiagnosticRow[]
}

export type MasterResidualBlockerBucket =
  | 'square-image'
  | 'square-text'
  | 'square-role-conflict'
  | 'landscape-text-height'
  | 'landscape-title-zone'
  | 'landscape-role-conflict'
  | 'landscape-cta'
  | 'landscape-image'
  | 'other'

export type MasterResidualBlockerCaseRow = {
  caseId: string
  format: CalibrationCaseFormat | null
  family: string | null
  category: string
  baselineWon: boolean | null
  aggregateDelta: number
  confidenceDelta: number
  dominantBlockerFamily: MasterResidualBlockerBucket
  dominantBlockerSubtype: string
  secondaryBlockerSubtype: string | null
  severity: PlacementViolationSeverity | null
  wouldBecomeMilder: {
    attachmentAwareText: boolean
    landscapeImagePolicy: boolean
    landscapeMessagePolicy: boolean
    landscapeCtaPolicy: boolean
    remainingBlockerWouldBecomeMilder: boolean
  }
  closeToAcceptable: boolean
  titleOnlyWouldPass: boolean
  messageClusterWouldPass: boolean
  remainingBlockerWouldBecomeMilder: boolean
  titleOnlyWouldBeMilder: boolean
  allStructuralSubtypes: string[]
  mainBlockerBucket: MasterResidualBlockerBucket
}

export type MasterResidualBlockersReport = {
  generatedAt: string
  root: string
  totals: {
    cases: number
    baselineWonCount: number
    closeToAcceptableCount: number
  }
  caseRows: MasterResidualBlockerCaseRow[]
  blockerFamilyFrequency: Array<{ family: MasterResidualBlockerBucket; count: number }>
  blockerSubtypeFrequency: Array<{ subtype: string; count: number }>
  perFormatRanking: Array<{
    format: string
    ranking: Array<{ family: MasterResidualBlockerBucket; count: number }>
  }>
  perFamilyRanking: Array<{
    family: string
    ranking: Array<{ blockerFamily: MasterResidualBlockerBucket; count: number }>
  }>
  nearMissGroups: Array<{
    blockerFamily: MasterResidualBlockerBucket
    count: number
    caseIds: string[]
  }>
  groupedFixTargets: Array<{
    blockerFamily: MasterResidualBlockerBucket
    blockerSubtype: string
    count: number
    caseIds: string[]
  }>
}
