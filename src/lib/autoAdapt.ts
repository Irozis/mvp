import { BRAND_TEMPLATES, CHANNEL_FORMATS, FORMAT_MAP, VISUAL_SYSTEMS, baseScene } from './presets'
import { computePalette } from './colorEngine'
import { aiAnalyzeContent, buildEnhancedContentProfile, extractCreativeInput, profileContent } from './contentProfile'
import { aiAnalyzeImage } from './imageAnalysis'
import { getFormatRuleSet } from './formatRules'
import { getFormatArchetypeRanking, getFormatBalanceDefaults, getFormatDensityPreset, getFormatWeakArchetypes } from './formatDefaults'
import { getAlternativeCompositionModel, getCompositionModel, resolveCompositionModelFamily, selectCompositionModel } from './formatCompositionModels'
import { applyBlockFixes, applyFixAction, finalizeSceneGeometry, getSynthesisStageDiagnostics, synthesizeLayout } from './layoutEngine'
import { aiChooseLayoutStrategy, chooseLayoutIntent, classifyScenario } from './scenarioClassifier'
import { getMarketplaceCardTemplateById } from './templateDefinitions'
import { computePerceptualSignals } from './perceptualSignals'
import { refineMarketplaceCardPerceptualComposition } from './perceptualRefinement'
import { classifyPlacementViolation, simulateSoftPlacementPolicy } from './repairPlacement'
import { getRepairAspectMode, getRepairObjectiveProfile, resolveRepairSearchConfig } from './repairObjective'
import { computeTypography, recomputeClusterTypography, recomputeTextBlockTypography } from './typographyEngine'
import { aiReviewLayout, analyzeFullLayout, computeScoreTrust, getFormatAssessment, getFormatFamily, getModelComplianceScore } from './validation'
import { buildMarketplaceCardTemplateVariantPlans } from './templateVariantGeneration'
import {
  allMarketplaceCardV2Archetypes,
  allMarketplaceTileV2Archetypes,
  isMarketplaceLayoutV2Enabled,
  isMarketplaceV2FormatKey,
  structuralArchetypeForMarketplaceV2Archetype,
} from './marketplaceLayoutV2'
import type {
  AIContentAnalysis,
  AIFixStrategy,
  AssetHint,
  BlockFixSuggestion,
  BrandKit,
  BrandTemplateKey,
  ContentBlock,
  ContentProfile,
  EnhancedImageAnalysis,
  FailureClassification,
  FixAction,
  FixActionRule,
  FixCandidate,
  FixSessionState,
  FixResult,
  FormatDefinition,
  FormatKey,
  FormatFamily,
  ImageProfile,
  ProjectAsset,
  BalanceRegime,
  LayoutAssessment,
  LayoutAnalysis,
  LayoutFixPlan,
  LayoutIntent,
  LayoutIntentFamily,
  LandscapeTextHeightNearMissSafeguardResults,
  OccupancyMode,
  Project,
  RepairCandidateEvaluation,
  RepairCandidateKind,
  RepairCalibrationSnapshot,
  RepairCandidateGateDiagnostics,
  RepairFailureType,
  RepairObjectiveProfile,
  RepairSearchConfig,
  RepairSearchConfigOverride,
  RepairSearchTelemetry,
  RepairObjectiveBreakdown,
  RepairObjectiveThresholds,
  RepairRejectionReason,
  RepairResult,
  RepairSelectionDiagnostics,
  RepairStrategy,
  RejectedFixAction,
  Scene,
  ScoreTrust,
  StructuralArchetype,
  StructuralInvariantName,
  StructuralLayoutFinding,
  StructuralLayoutStatus,
  StructuralSignature,
  MarketplaceCardTemplateId,
  PlacementViolationDiagnostics,
  PerceptualSignals,
  TemplateKey,
  TypographyPlan,
  Variant,
  VariantManualOverride,
  VisualSystemKey,
} from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

type PreviewCandidatePlan = {
  id: string
  strategyLabel: string
  fixStage: 'base' | 'local' | 'regional' | 'structural'
  intent: LayoutIntent
  structuralArchetype: StructuralArchetype
  structuralSignature: StructuralSignature
  selectionReason: string
}

type PreviewCandidateEvaluation = {
  id: string
  formatKey: FormatKey
  strategyLabel: string
  fixStage: PreviewCandidatePlan['fixStage']
  scene: Scene
  intent: LayoutIntent
  assessment: LayoutAssessment
  scoreTrust: ScoreTrust
  structuralArchetype: StructuralArchetype
  structuralSignature: StructuralSignature
  structuralStatus: NonNullable<LayoutAssessment['structuralState']>['status']
  structuralFindingCount: number
  highStructuralFindingCount: number
  criticalIssueCount: number
  highIssueCount: number
  issueCount: number
  perceptualSignals?: PerceptualSignals
  perceptualPreference?: {
    score: number
    reasons: string[]
  }
  perceptualAdjustment?: {
    applied: boolean
    blockedBy?: string
    triggers: string[]
    adjustments: string[]
    originalSignals?: PerceptualSignals
    adjustedSignals?: PerceptualSignals
    originalStructuralStatus?: StructuralLayoutStatus
    adjustedStructuralStatus?: StructuralLayoutStatus
    originalEffectiveScore?: number
    adjustedEffectiveScore?: number
  }
  commercialPreference?: {
    score: number
    confidence: 'weak' | 'medium' | 'strong'
    semanticPrimaryTemplateId?: MarketplaceCardTemplateId
    candidateTemplateId?: MarketplaceCardTemplateId
    reasons: string[]
  }
  evaluationAlignment?: {
    applied: boolean
    blockedBy?: string
    reasons: string[]
    originalStructuralStatus: StructuralLayoutStatus
    adjustedStructuralStatus: StructuralLayoutStatus
    originalEffectiveScore: number
    adjustedEffectiveScore: number
    scoreDelta: number
    relaxedIssueCodes: string[]
    relaxedFindingNames: StructuralInvariantName[]
    adjustedCriticalIssueCount: number
    adjustedHighIssueCount: number
    adjustedIssueCount: number
    adjustedStructuralFindingCount: number
    adjustedHighStructuralFindingCount: number
  }
}

type PreviewPlanBuildMeta = {
  attemptedPlans: number
  acceptedPlans: number
  prunedStructuralDuplicates: number
  budgetRejectedPlans: number
  attemptedArchetypes: StructuralArchetype[]
  acceptedArchetypes: StructuralArchetype[]
  attemptedStructuralSignatures: number
  acceptedStructuralSignatures: number
}

type PreviewCandidateSelection = {
  selected: PreviewCandidateEvaluation
  candidates: PreviewCandidateEvaluation[]
  counts: Record<'valid' | 'degraded' | 'invalid', number>
  discardedReasonCounts: Record<string, number>
  planBuild: PreviewPlanBuildMeta
  rankingDiagnostics?: {
    commercialDecision?: {
      applied: boolean
      blockedBy?: string
      preferredTemplateId?: MarketplaceCardTemplateId
      selectedTemplateId?: MarketplaceCardTemplateId
      runnerUpTemplateId?: MarketplaceCardTemplateId
      commercialScoreDelta: number
      structuralScoreDelta: number
      reason: string
    }
    perceptualDecision?: {
      applied: boolean
      blockedBy?: string
      selectedTemplateId?: MarketplaceCardTemplateId
      runnerUpTemplateId?: MarketplaceCardTemplateId
      perceptualScoreDelta: number
      structuralScoreDelta: number
      reason: string
    }
  }
}

export type PreviewCandidateDiagnostics = {
  formatKey: FormatKey
  baseCandidate: PreviewCandidateEvaluation
  selectedCandidate: PreviewCandidateEvaluation
  expandedBudgetCandidate?: PreviewCandidateEvaluation
  allCandidates: PreviewCandidateEvaluation[]
  expandedBudgetCandidates?: PreviewCandidateEvaluation[]
  counts: PreviewCandidateSelection['counts']
  planBuild: PreviewPlanBuildMeta
  expandedPlanBuild?: PreviewPlanBuildMeta
  rankingDiagnostics?: PreviewCandidateSelection['rankingDiagnostics']
  postSelectionFix: {
    assessment: LayoutAssessment
    scoreTrust: ScoreTrust
    strategyLabel: string
    reselectionApplied: boolean
  }
}

export type PreviewCandidateStageDiagnostics = {
  formatKey: FormatKey
  baseCandidate: {
    strategyLabel: string
    structuralArchetype: StructuralArchetype
    structuralStatus: PreviewCandidateEvaluation['structuralStatus']
    stages: ReturnType<typeof getSynthesisStageDiagnostics>['stages']
    repacked: boolean
    finalAssessment: LayoutAssessment
  }
  selectedCandidate: {
    strategyLabel: string
    structuralArchetype: StructuralArchetype
    structuralStatus: PreviewCandidateEvaluation['structuralStatus']
    stages: ReturnType<typeof getSynthesisStageDiagnostics>['stages']
    repacked: boolean
    finalAssessment: LayoutAssessment
  }
}

export type MarketplaceCardExplorationCandidate = {
  candidateId: string
  source: string
  strategyLabel: string
  fixStage: 'base' | 'local' | 'regional' | 'structural'
  structuralArchetype: StructuralArchetype
  structuralSignature: StructuralSignature
  structuralSignatureKey: string
  geometrySignature: string
  structuralStatus: StructuralLayoutStatus
  effectiveScore: number
  scoreTrust: ScoreTrust
  topStructuralFindings: Array<{
    name: StructuralInvariantName
    severity: StructuralLayoutFinding['severity']
  }>
  structuralFindingCount: number
  highStructuralFindingCount: number
  issueCount: number
  wouldNormallyBeSelected: boolean
  geometrySummary: {
    title: Pick<Scene['title'], 'x' | 'y' | 'w' | 'h'>
    subtitle: Pick<Scene['subtitle'], 'x' | 'y' | 'w' | 'h'>
    cta: Pick<Scene['cta'], 'x' | 'y' | 'w' | 'h'>
    logo: Pick<Scene['logo'], 'x' | 'y' | 'w' | 'h'>
    badge: Pick<Scene['badge'], 'x' | 'y' | 'w' | 'h'>
    image: Pick<Scene['image'], 'x' | 'y' | 'w' | 'h'>
  }
  scene: Scene
}

export type MarketplaceCardExplorationDiagnostics = {
  formatKey: 'marketplace-card'
  explorationBudget: number
  variationIndex: number
  profile: ContentProfile
  scenario: ReturnType<typeof classifyScenario>
  baseIntent: LayoutIntent
  normalBaseCandidate: {
    strategyLabel: string
    structuralArchetype: StructuralArchetype
    structuralStatus: StructuralLayoutStatus
    effectiveScore: number
    geometrySignature: string
  }
  normalSelectedCandidate: {
    strategyLabel: string
    structuralArchetype: StructuralArchetype
    structuralStatus: StructuralLayoutStatus
    effectiveScore: number
    geometrySignature: string
  }
  attemptedCandidates: number
  duplicatePlansFiltered: number
  duplicateCandidatesFiltered: number
  candidates: MarketplaceCardExplorationCandidate[]
}

const PREVIEW_CANDIDATE_BUDGET = 5
const MARKETPLACE_CARD_PREVIEW_CANDIDATE_BUDGET = 10
const MARKETPLACE_CARD_SIGNATURE_VARIANT_LIMIT = 2
const PRIMARY_FORMAT_SIGNATURE_VARIANT_LIMIT = 2
const MARKETPLACE_CARD_REPAIR_STRATEGY_BUDGET = 6
const MARKETPLACE_CARD_REPAIR_RETAIN_LIMIT = 3
const previewCandidateLogSignatures = new Map<string, string>()
const REPAIR_SIGNIFICANT_SCORE_REGRESSION = 3
const REPAIR_MEANINGFUL_FINDING_DELTA = 2
const REPAIR_MIN_GEOMETRY_DELTA = 3
const REPAIR_HISTORY_LIMIT = 16

type RepairEvaluatedScene = {
  formatKey: FormatKey
  scene: Scene
  assessment: LayoutAssessment
  scoreTrust: ScoreTrust
  previewScoreTrust: ScoreTrust
  compositionModelId?: Variant['compositionModelId']
  sceneSignature: string
  structuralStatus: StructuralLayoutStatus
  structuralFindingCount: number
  structuralFindingWeight: number
  highStructuralFindingCount: number
  criticalIssueCount: number
  highIssueCount: number
  issueCount: number
  unresolvedIssueCount: number
  strategyLabel: string
  actions: FixAction[]
}

const PRIMARY_GENERATION_RECOVERY_FORMATS = new Set<FormatKey>([
  'social-square',
  'social-portrait',
  'social-landscape',
  'display-large-rect',
])

const PRIMARY_STRUCTURAL_ESCALATION_FORMATS = new Set<FormatKey>([
  'social-square',
  'social-portrait',
  'social-landscape',
])

const PRIMARY_FINAL_QUALITY_FINDINGS = new Set([
  'major-overlap',
  'minimum-spacing',
  'role-placement',
  'safe-area-compliance',
])

type RepairAttempt = {
  strategy: RepairStrategy
  candidate: RepairEvaluatedScene
  decision: RepairResult
  suppressed?: boolean
  regenerationCandidate?: RepairRegenerationCandidateDiagnostics
  searchEvaluation?: RepairCandidateEvaluation
}

export type RepairAttemptDiagnostics = {
  strategyLabel: string
  strategyKind: RepairStrategy['kind']
  candidateKind: RepairCandidateKind
  accepted: boolean
  suppressed: boolean
  noOp: boolean
  repeatedWeakOutcome: boolean
  rejectionReason?: string
  beforeStructuralStatus: StructuralLayoutStatus
  afterStructuralStatus: StructuralLayoutStatus
  beforeEffectiveScore: number
  afterEffectiveScore: number
  scoreDelta: number
  findingDelta: number
  attemptSignature?: string
  noOpReasons: string[]
  aggregateScore?: number
  aggregateDelta?: number
  objective?: RepairObjectiveBreakdown
  summaryTags: string[]
  penaltyTags: string[]
  rejectionReasons: RepairRejectionReason[]
  gateOutcomes?: RepairCandidateGateDiagnostics
}

export type RepairRegenerationCandidateDiagnostics = {
  strategyLabel: string
  strategyKind: RepairStrategy['kind']
  fixStage?: PreviewCandidatePlan['fixStage']
  generated: boolean
  accepted: boolean
  suppressed: boolean
  repeatedWeakOutcome: boolean
  rejectionReason?: string
  structuralArchetype?: StructuralArchetype
  structuralSignatureKey?: string
  geometrySignature?: string
  structuralStatus?: StructuralLayoutStatus
  effectiveScore?: number
  scoreTrust?: ScoreTrust
  compositionModelId?: Variant['compositionModelId']
  topStructuralFindings: Array<{
    name: StructuralInvariantName
    severity: StructuralLayoutFinding['severity']
  }>
}

export type RepairDiagnostics = {
  formatKey: FormatKey
  classification: FailureClassification
  regenerationSource: {
    usesMasterScene: boolean
    currentSceneSignature: string
    regenerationSceneSignature: string
    differsFromCurrent: boolean
  }
  before: {
    structuralStatus: StructuralLayoutStatus
    effectiveScore: number
    sceneSignature: string
  }
  after: {
    structuralStatus: StructuralLayoutStatus
    effectiveScore: number
    sceneSignature: string
  }
  finalChanged: boolean
  acceptedImprovement: boolean
  escalated: boolean
  escalationReasons: string[]
  acceptedStrategyLabel?: string
  selection?: RepairSelectionDiagnostics
  searchRuns: RepairSearchTelemetry[]
  attempts: RepairAttemptDiagnostics[]
  regenerationCandidates: RepairRegenerationCandidateDiagnostics[]
  autoFix: {
    attempted: boolean
    accepted: boolean
    scoreDelta: number
    structuralBefore: StructuralLayoutStatus
    structuralAfter: StructuralLayoutStatus
    rejectionReason?: string
  }
}

function createTimestamp() {
  return new Date().toISOString()
}

function getStructuralTierRank(status: NonNullable<LayoutAssessment['structuralState']>['status']) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

function countHighStructuralFindings(assessment: LayoutAssessment) {
  return (assessment.structuralState?.findings || []).filter((finding) => finding.severity === 'high').length
}

function countCriticalIssues(assessment: LayoutAssessment) {
  return assessment.issues.filter((issue) => issue.severity === 'critical').length
}

function countHighIssues(assessment: LayoutAssessment) {
  return assessment.issues.filter((issue) => issue.severity === 'high').length
}

function getVisualTieBreakScore(assessment: LayoutAssessment) {
  return assessment.visual?.overallScore || 0
}

function shouldUseMarketplaceCardVisualRerank(input: {
  leftFormatKey: FormatKey
  rightFormatKey: FormatKey
  leftStructuralStatus: StructuralLayoutStatus
  rightStructuralStatus: StructuralLayoutStatus
  scoreDelta: number
}) {
  return (
    input.leftFormatKey === 'marketplace-card' &&
    input.rightFormatKey === 'marketplace-card' &&
    input.leftStructuralStatus !== 'invalid' &&
    input.rightStructuralStatus !== 'invalid' &&
    Math.abs(input.scoreDelta) <= 4
  )
}

function getMarketplaceCardVisualDecisionDelta(left: LayoutAssessment, right: LayoutAssessment) {
  const visualDelta = getVisualTieBreakScore(right) - getVisualTieBreakScore(left)
  return Math.abs(visualDelta) >= 4 ? visualDelta : 0
}

function getVisualBandRank(assessment: LayoutAssessment) {
  const band = assessment.visual?.band || 'poor'
  if (band === 'strong') return 3
  if (band === 'acceptable') return 2
  if (band === 'weak') return 1
  return 0
}

function isMarketplaceCardTemplateVariantCandidate(candidate: PreviewCandidateEvaluation) {
  return (
    candidate.formatKey === 'marketplace-card' &&
    Boolean(candidate.intent.marketplaceTemplateId)
  )
}

function getMarketplaceCardSemanticPrimaryTemplateId(candidate: PreviewCandidateEvaluation) {
  const selection = candidate.intent.marketplaceTemplateSelection
  return selection?.debug?.rankedTemplates[0]?.templateId || selection?.selectedTemplateId
}

function getMarketplaceCardTemplateSemanticScore(candidate: PreviewCandidateEvaluation) {
  const selection = candidate.intent.marketplaceTemplateSelection
  const templateId = candidate.intent.marketplaceTemplateId
  if (!selection?.debug?.rankedTemplates?.length || !templateId) return 0
  return selection.debug.rankedTemplates.find((entry) => entry.templateId === templateId)?.totalScore || 0
}

function getMarketplaceCardCommercialConfidence(candidate: PreviewCandidateEvaluation): 'weak' | 'medium' | 'strong' {
  const ranked = candidate.intent.marketplaceTemplateSelection?.debug?.rankedTemplates || []
  const primary = ranked[0]?.totalScore || 0
  const runnerUp = ranked[1]?.totalScore || 0
  const gap = primary - runnerUp
  if (gap >= 8) return 'strong'
  if (gap >= 4) return 'medium'
  return 'weak'
}

function computeMarketplaceCardCommercialPreferenceScore(input: {
  candidate: PreviewCandidateEvaluation
  profile: ContentProfile
}) {
  const templateId = input.candidate.intent.marketplaceTemplateId
  if (!templateId) return undefined

  const template = getMarketplaceCardTemplateById(templateId)
  const semanticPrimaryTemplateId = getMarketplaceCardSemanticPrimaryTemplateId(input.candidate)
  const semanticScore = getMarketplaceCardTemplateSemanticScore(input.candidate)
  const confidence = getMarketplaceCardCommercialConfidence(input.candidate)
  const reasons: string[] = []
  let score = 0

  if (templateId === semanticPrimaryTemplateId) {
    score += 4
    reasons.push('semantic-primary-template')
  } else if (semanticScore >= 24) {
    score += 1
    reasons.push('semantic-shortlist-template')
  }

  if (template.supportedSellingAngles?.includes(input.profile.sellingAngle)) {
    score += 2
    reasons.push(`selling-angle:${input.profile.sellingAngle}`)
  }

  if (template.preferredConversionActions?.includes(input.profile.primaryConversionAction)) {
    score += 1
    reasons.push(`conversion-action:${input.profile.primaryConversionAction}`)
  }

  if (input.profile.productVisualNeed === 'critical' && template.heroElement === 'image') {
    score += 2
    reasons.push('product-hero-match')
  }

  if (
    input.profile.proofPresence !== 'none' &&
    template.proofRole?.includes(input.profile.proofPresence)
  ) {
    score += 1
    reasons.push(`proof-role:${input.profile.proofPresence}`)
  }

  if (
    input.profile.messageCompressionNeed === 'high' &&
    (template.contentBehavior === 'minimal' || template.contentBehavior === 'balanced')
  ) {
    score += 1
    reasons.push(`compression-fit:${input.profile.messageCompressionNeed}`)
  }

  return {
    score: Math.min(score, 8),
    confidence,
    semanticPrimaryTemplateId,
    candidateTemplateId: templateId,
    reasons,
  } satisfies NonNullable<PreviewCandidateEvaluation['commercialPreference']>
}

function buildBlockedMarketplaceCardEvaluationAlignment(
  candidate: PreviewCandidateEvaluation,
  blockedBy: string,
  reasons: string[]
) {
  return {
    applied: false,
    blockedBy,
    reasons,
    originalStructuralStatus: candidate.structuralStatus,
    adjustedStructuralStatus: candidate.structuralStatus,
    originalEffectiveScore: candidate.scoreTrust.effectiveScore,
    adjustedEffectiveScore: candidate.scoreTrust.effectiveScore,
    scoreDelta: 0,
    relaxedIssueCodes: [],
    relaxedFindingNames: [],
    adjustedCriticalIssueCount: candidate.criticalIssueCount,
    adjustedHighIssueCount: candidate.highIssueCount,
    adjustedIssueCount: candidate.issueCount,
    adjustedStructuralFindingCount: candidate.structuralFindingCount,
    adjustedHighStructuralFindingCount: candidate.highStructuralFindingCount,
  } satisfies NonNullable<PreviewCandidateEvaluation['evaluationAlignment']>
}

function clampCandidateScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getPerceptualCompositeScore(signals?: PerceptualSignals) {
  if (!signals) return 0
  return (
    signals.clusterCohesion * 0.28 +
    signals.ctaIntegration * 0.26 +
    signals.readingFlowClarity * 0.22 +
    signals.visualBalance * 0.14 -
    signals.deadSpaceScore * 0.18 +
    (signals.hasClearPrimary ? 6 : 0)
  )
}

function shouldAcceptMarketplacePerceptualAdjustment(input: {
  beforeCandidate: PreviewCandidateEvaluation
  afterAssessment: LayoutAssessment
  afterSignals: PerceptualSignals
}) {
  const before = input.beforeCandidate
  const beforeSignals = before.perceptualSignals
  const beforeStructuralStatus = before.structuralStatus
  const afterStructuralStatus = input.afterAssessment.structuralState?.status || 'invalid'
  const beforeStructuralRank = getStructuralTierRank(beforeStructuralStatus)
  const afterStructuralRank = getStructuralTierRank(afterStructuralStatus)
  if (afterStructuralRank < beforeStructuralRank) return false

  const beforeHighFindings = before.highStructuralFindingCount
  const afterHighFindings = countHighStructuralFindings(input.afterAssessment)
  if (afterHighFindings > beforeHighFindings) return false

  const afterCriticalIssues = countCriticalIssues(input.afterAssessment)
  if (afterCriticalIssues > before.criticalIssueCount) return false

  const afterScoreTrust = computeScoreTrust(input.afterAssessment)
  if (afterScoreTrust.effectiveScore < before.scoreTrust.effectiveScore - 1) return false

  const beforeComposite = getPerceptualCompositeScore(beforeSignals)
  const afterComposite = getPerceptualCompositeScore(input.afterSignals)
  const improvedCta = (input.afterSignals.ctaIntegration || 0) >= (beforeSignals?.ctaIntegration || 0) + 6
  const improvedCluster = (input.afterSignals.clusterCohesion || 0) >= (beforeSignals?.clusterCohesion || 0) + 6
  const reducedDeadSpace = (input.afterSignals.deadSpaceScore || 0) <= (beforeSignals?.deadSpaceScore || 0) - 6
  const improvedPrimary =
    beforeSignals?.hasClearPrimary === false && input.afterSignals.hasClearPrimary === true

  return afterComposite >= beforeComposite + 6 || improvedCta || improvedCluster || reducedDeadSpace || improvedPrimary
}

function computeMarketplaceCardTextFirstEvaluationAlignment(input: {
  candidate: PreviewCandidateEvaluation
  profile: ContentProfile
}) {
  const candidate = input.candidate
  if (candidate.formatKey !== 'marketplace-card' || candidate.intent.marketplaceTemplateId !== 'text-first-promo') {
    return undefined
  }

  const semanticPrimaryTemplateId = getMarketplaceCardSemanticPrimaryTemplateId(candidate)
  if (semanticPrimaryTemplateId !== 'text-first-promo') {
    return buildBlockedMarketplaceCardEvaluationAlignment(candidate, 'semantic-not-primary', ['semantic primary template was not text-first-promo'])
  }

  const imageRegime = candidate.intent.marketplaceTemplateSelection?.inputProfile.imageRegime
  const sellingAngle = input.profile.sellingAngle
  const trustOrBenefitCase =
    sellingAngle === 'trust-led' ||
    sellingAngle === 'benefit-led' ||
    input.profile.proofPresence !== 'none'
  if (!trustOrBenefitCase) {
    return buildBlockedMarketplaceCardEvaluationAlignment(candidate, 'non-target-commercial-case', ['commercial case was outside the trust/benefit boundary scope'])
  }

  const structuralMetrics = candidate.assessment.structuralState?.metrics
  if ((structuralMetrics?.overlapCount || 0) > 0 || (structuralMetrics?.safeAreaViolationCount || 0) > 0) {
    return buildBlockedMarketplaceCardEvaluationAlignment(candidate, 'hard-geometry-risk', ['overlap or safe-area violations were still present'])
  }

  const ctaMetrics = candidate.assessment.layoutAnalysis?.blocks.cta?.metrics
  const textClusterMetrics = candidate.assessment.layoutAnalysis?.clusters.textCluster?.metrics
  const keyMetrics = candidate.assessment.metrics
  if (
    !ctaMetrics ||
    !textClusterMetrics ||
    (ctaMetrics.clusterIntegration || 0) < 92 ||
    (textClusterMetrics.hierarchy || 0) < 90 ||
    (keyMetrics?.textHierarchy || 0) < 90
  ) {
    return buildBlockedMarketplaceCardEvaluationAlignment(candidate, 'weak-lockup', ['headline / CTA lockup was not strong enough to justify relaxed evaluation'])
  }

  const issueCodes = candidate.assessment.issues.map((issue) => issue.code)
  const findingNames = (candidate.assessment.structuralState?.findings || []).map((finding) => finding.name)
  const relaxedIssueCodes = new Set<string>()
  const relaxedFindingNames = new Set<StructuralInvariantName>()
  const reasons: string[] = []

  if (issueCodes.includes('violates-image-footprint-rule')) {
    relaxedIssueCodes.add('violates-image-footprint-rule')
    reasons.push('relaxed image-footprint penalty for text-first support-image layout')
  }

  if (issueCodes.includes('violates-allowed-zone')) {
    relaxedIssueCodes.add('violates-allowed-zone')
    reasons.push('relaxed template-zone penalty for text-first inline lockup')
  }

  const occupancyFinding = (candidate.assessment.structuralState?.findings || []).find(
    (finding) => finding.name === 'structural-occupancy'
  )
  const occupiedSafeArea = structuralMetrics?.occupiedSafeArea || 0
  const textClusterCoverage = structuralMetrics?.textClusterCoverage || 0
  if (
    occupancyFinding &&
    (textClusterMetrics.cohesion || 0) >= 84 &&
    (
      occupiedSafeArea >= (imageRegime === 'no-image' ? 0.1 : 0.16) ||
      textClusterCoverage >= (imageRegime === 'no-image' ? 0.32 : 0.17)
    )
  ) {
    relaxedIssueCodes.add('structural-structural-occupancy')
    relaxedFindingNames.add('structural-occupancy')
    reasons.push('counted coherent proof/message lockup as sufficient occupancy')
  }

  const spacingFinding = (candidate.assessment.structuralState?.findings || []).find(
    (finding) => finding.name === 'minimum-spacing'
  )
  const maxGapDeficit = typeof spacingFinding?.metrics?.maxGapDeficit === 'number' ? spacingFinding.metrics.maxGapDeficit : 0
  const canRelaxTightSpacing =
    imageRegime === 'no-image' &&
    maxGapDeficit > 0 &&
    maxGapDeficit <= 2.5 &&
    (ctaMetrics.clusterIntegration || 0) >= 95 &&
    (ctaMetrics.spacing || 0) >= 90
  if (canRelaxTightSpacing) {
    relaxedIssueCodes.add('structural-minimum-spacing')
    relaxedFindingNames.add('minimum-spacing')
    reasons.push('accepted tight but attached no-image trust spacing')
  }

  const inlineCtaCanRelax =
    imageRegime === 'no-image' &&
    issueCodes.includes('violates-cta-size-rule') &&
    (ctaMetrics.clusterIntegration || 0) >= 95 &&
    (ctaMetrics.actionClarity || 0) >= 88 &&
    (candidate.scene.cta.w || 0) >= 12 &&
    (candidate.scene.cta.h || 0) >= 4.5
  if (inlineCtaCanRelax) {
    relaxedIssueCodes.add('violates-cta-size-rule')
    reasons.push('accepted compact inline CTA inside trust-led lockup')
  }

  if (!relaxedIssueCodes.size && !relaxedFindingNames.size) {
    return buildBlockedMarketplaceCardEvaluationAlignment(candidate, 'no-local-bias-detected', ['no narrow text-first evaluation bias was detected'])
  }

  const remainingIssues = candidate.assessment.issues.filter((issue) => !relaxedIssueCodes.has(issue.code))
  const remainingFindings = (candidate.assessment.structuralState?.findings || []).filter(
    (finding) => !relaxedFindingNames.has(finding.name)
  )

  const adjustedCriticalIssueCount = remainingIssues.filter((issue) => issue.severity === 'critical').length
  const adjustedHighIssueCount = remainingIssues.filter((issue) => issue.severity === 'high').length
  const adjustedIssueCount = remainingIssues.length
  const adjustedHighStructuralFindingCount = remainingFindings.filter((finding) => finding.severity === 'high').length
  const adjustedStructuralFindingCount = remainingFindings.length

  let scoreDelta = 0
  if (relaxedIssueCodes.has('violates-image-footprint-rule')) scoreDelta += imageRegime === 'no-image' ? 5 : 4
  if (relaxedIssueCodes.has('violates-allowed-zone')) scoreDelta += imageRegime === 'no-image' ? 4 : 4
  if (relaxedIssueCodes.has('violates-cta-size-rule')) scoreDelta += 4
  if (relaxedIssueCodes.has('structural-minimum-spacing')) scoreDelta += 3
  if (relaxedIssueCodes.has('structural-structural-occupancy')) scoreDelta += 3
  if (imageRegime === 'image-backed' && candidate.intent.marketplaceTemplateVariant === 'proof-band') scoreDelta += 1
  scoreDelta = Math.min(scoreDelta, imageRegime === 'no-image' ? 16 : 10)

  let adjustedStructuralStatus = candidate.structuralStatus
  if (
    candidate.structuralStatus === 'invalid' &&
    adjustedHighStructuralFindingCount === 0 &&
    adjustedCriticalIssueCount <= 1 &&
    maxGapDeficit <= 12.5
  ) {
    adjustedStructuralStatus = 'degraded'
    reasons.push('downgraded invalid status to degraded after removing formal text-first penalties')
  }

  const adjustedEffectiveScore = clampCandidateScore(candidate.scoreTrust.effectiveScore + scoreDelta)
  if (adjustedEffectiveScore === candidate.scoreTrust.effectiveScore && adjustedStructuralStatus === candidate.structuralStatus) {
    return buildBlockedMarketplaceCardEvaluationAlignment(candidate, 'no-effective-change', ['alignment analysis found no meaningful evaluation change'])
  }

  return {
    applied: true,
    reasons,
    originalStructuralStatus: candidate.structuralStatus,
    adjustedStructuralStatus,
    originalEffectiveScore: candidate.scoreTrust.effectiveScore,
    adjustedEffectiveScore,
    scoreDelta: adjustedEffectiveScore - candidate.scoreTrust.effectiveScore,
    relaxedIssueCodes: Array.from(relaxedIssueCodes),
    relaxedFindingNames: Array.from(relaxedFindingNames),
    adjustedCriticalIssueCount,
    adjustedHighIssueCount,
    adjustedIssueCount,
    adjustedStructuralFindingCount,
    adjustedHighStructuralFindingCount,
  } satisfies NonNullable<PreviewCandidateEvaluation['evaluationAlignment']>
}

function getCommercialConfidenceRank(value: PreviewCandidateEvaluation['commercialPreference']) {
  if (!value) return 0
  if (value.confidence === 'strong') return 3
  if (value.confidence === 'medium') return 2
  return 1
}

function computeMarketplaceCardPerceptualPreference(input: {
  candidate: PreviewCandidateEvaluation
}) {
  const signals = input.candidate.perceptualSignals
  if (input.candidate.formatKey !== 'marketplace-card' || !signals) {
    return undefined
  }

  let score = 0
  const reasons: string[] = []
  if (signals.hasClearPrimary) {
    score += 1
    reasons.push(`clear-primary:${signals.primaryElement}`)
  }
  if (signals.clusterCohesion >= 74) {
    score += 1
    reasons.push('cohesive-message-cluster')
  }
  if (signals.ctaIntegration >= 72) {
    score += 1
    reasons.push('cta-attached')
  }
  if (signals.readingFlowClarity >= 76) {
    score += 1
    reasons.push('clear-reading-flow')
  }
  if (signals.deadSpaceScore >= 64) {
    score -= 1
    reasons.push('dead-space-penalty')
  }
  if (signals.visualBalance < 52) {
    score -= 1
    reasons.push('balance-penalty')
  }
  return {
    score,
    reasons,
  }
}

function explainMarketplaceCardCommercialDecision(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
  const leftCommercial = left.commercialPreference
  const rightCommercial = right.commercialPreference
  const structuralScoreDelta = right.scoreTrust.effectiveScore - left.scoreTrust.effectiveScore

  if (left.structuralStatus !== 'valid' || right.structuralStatus !== 'valid') {
    return {
      applied: false,
      blockedBy: 'structural-status',
      commercialScoreDelta: 0,
      structuralScoreDelta,
      reason: 'commercial preference blocked because both candidates were not structurally valid.',
    }
  }

  if (Math.abs(structuralScoreDelta) > 4) {
    return {
      applied: false,
      blockedBy: 'effective-score-gap',
      commercialScoreDelta: 0,
      structuralScoreDelta,
      reason: 'commercial preference blocked because the structural score gap was too large.',
    }
  }

  if (
    left.highStructuralFindingCount > 0 ||
    right.highStructuralFindingCount > 0 ||
    left.criticalIssueCount > 2 ||
    right.criticalIssueCount > 2 ||
    left.highIssueCount > 2 ||
    right.highIssueCount > 2
  ) {
    return {
      applied: false,
      blockedBy: 'risk-findings',
      commercialScoreDelta: 0,
      structuralScoreDelta,
      reason: 'commercial preference blocked because one of the candidates still had risky findings.',
    }
  }

  if (Math.min(getCommercialConfidenceRank(leftCommercial), getCommercialConfidenceRank(rightCommercial)) < 2) {
    return {
      applied: false,
      blockedBy: 'weak-commercial-confidence',
      commercialScoreDelta: 0,
      structuralScoreDelta,
      reason: 'commercial preference blocked because semantic/commercial confidence was too weak.',
    }
  }

  const commercialScoreDelta = (rightCommercial?.score || 0) - (leftCommercial?.score || 0)
  if (Math.abs(commercialScoreDelta) < 3) {
    return {
      applied: false,
      blockedBy: 'no-meaningful-commercial-gap',
      commercialScoreDelta,
      structuralScoreDelta,
      reason: 'commercial preference blocked because the commercial score gap was too small.',
    }
  }

  const preferredCandidate = commercialScoreDelta > 0 ? right : left
  return {
    applied: true,
    preferredTemplateId: preferredCandidate.intent.marketplaceTemplateId,
    selectedTemplateId: preferredCandidate.intent.marketplaceTemplateId,
    runnerUpTemplateId: preferredCandidate.id === right.id ? left.intent.marketplaceTemplateId : right.intent.marketplaceTemplateId,
    commercialScoreDelta,
    structuralScoreDelta,
    reason: `commercial boundary preference favored ${preferredCandidate.intent.marketplaceTemplateId} (${preferredCandidate.commercialPreference?.reasons.join(', ') || 'semantic-commercial-fit'}).`,
  }
}

function getMarketplaceCardCommercialDecisionDelta(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
  const decision = explainMarketplaceCardCommercialDecision(left, right)
  return decision.applied ? decision.commercialScoreDelta : 0
}

function explainMarketplaceCardPerceptualDecision(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
  const structuralScoreDelta = right.scoreTrust.effectiveScore - left.scoreTrust.effectiveScore

  if (left.structuralStatus !== right.structuralStatus) {
    return {
      applied: false,
      blockedBy: 'structural-tier',
      perceptualScoreDelta: 0,
      structuralScoreDelta,
      reason: 'perceptual preference blocked because candidates were in different structural tiers.',
    }
  }

  if (Math.abs(structuralScoreDelta) > 3) {
    return {
      applied: false,
      blockedBy: 'effective-score-gap',
      perceptualScoreDelta: 0,
      structuralScoreDelta,
      reason: 'perceptual preference blocked because the effective score gap was too large.',
    }
  }

  if (
    left.highStructuralFindingCount > 0 ||
    right.highStructuralFindingCount > 0 ||
    left.criticalIssueCount > 1 ||
    right.criticalIssueCount > 1
  ) {
    return {
      applied: false,
      blockedBy: 'risk-findings',
      perceptualScoreDelta: 0,
      structuralScoreDelta,
      reason: 'perceptual preference blocked because one candidate still carried risky findings.',
    }
  }

  const leftPreference = left.perceptualPreference
  const rightPreference = right.perceptualPreference
  if (!leftPreference || !rightPreference) {
    return {
      applied: false,
      blockedBy: 'missing-signals',
      perceptualScoreDelta: 0,
      structuralScoreDelta,
      reason: 'perceptual preference blocked because perceptual signals were missing.',
    }
  }

  const perceptualScoreDelta = rightPreference.score - leftPreference.score
  if (Math.abs(perceptualScoreDelta) < 2) {
    return {
      applied: false,
      blockedBy: 'no-meaningful-perceptual-gap',
      perceptualScoreDelta,
      structuralScoreDelta,
      reason: 'perceptual preference blocked because the perceptual gap was too small.',
    }
  }

  const preferredCandidate = perceptualScoreDelta > 0 ? right : left
  return {
    applied: true,
    selectedTemplateId: preferredCandidate.intent.marketplaceTemplateId,
    runnerUpTemplateId: preferredCandidate.id === right.id ? left.intent.marketplaceTemplateId : right.intent.marketplaceTemplateId,
    perceptualScoreDelta,
    structuralScoreDelta,
    reason: `perceptual boundary preference favored ${preferredCandidate.intent.marketplaceTemplateId} (${preferredCandidate.perceptualPreference?.reasons.join(', ') || 'perceptual-fit'}).`,
  }
}

function getMarketplaceCardPerceptualDecisionDelta(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
  const decision = explainMarketplaceCardPerceptualDecision(left, right)
  return decision.applied ? decision.perceptualScoreDelta : 0
}

function compareMarketplaceCardTemplateVariantCandidates(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
  const tierDelta = getStructuralTierRank(right.structuralStatus) - getStructuralTierRank(left.structuralStatus)
  if (tierDelta !== 0) return tierDelta

  const scoreDelta = right.scoreTrust.effectiveScore - left.scoreTrust.effectiveScore
  if (Math.abs(scoreDelta) > 5) return scoreDelta

  const highFindingDelta = left.highStructuralFindingCount - right.highStructuralFindingCount
  if (highFindingDelta !== 0) return highFindingDelta

  const criticalIssueDelta = left.criticalIssueCount - right.criticalIssueCount
  if (criticalIssueDelta !== 0) return criticalIssueDelta

  const highIssueDelta = left.highIssueCount - right.highIssueCount
  if (highIssueDelta !== 0) return highIssueDelta

  const commercialDelta = getMarketplaceCardCommercialDecisionDelta(left, right)
  if (commercialDelta !== 0) return commercialDelta

  const perceptualDelta = getMarketplaceCardPerceptualDecisionDelta(left, right)
  if (perceptualDelta !== 0) return perceptualDelta

  const visualDelta = getMarketplaceCardVisualDecisionDelta(left.assessment, right.assessment)
  if (visualDelta !== 0) return visualDelta

  const visualBandDelta = getVisualBandRank(right.assessment) - getVisualBandRank(left.assessment)
  if (visualBandDelta !== 0) return visualBandDelta

  if (scoreDelta !== 0) return scoreDelta

  const findingCountDelta = left.structuralFindingCount - right.structuralFindingCount
  if (findingCountDelta !== 0) return findingCountDelta

  const issueCountDelta = left.issueCount - right.issueCount
  if (issueCountDelta !== 0) return issueCountDelta

  return left.strategyLabel.localeCompare(right.strategyLabel)
}

function getStructuralStatus(assessment: LayoutAssessment): StructuralLayoutStatus {
  return assessment.structuralState?.status || 'valid'
}

function getStructuralFindings(assessment: LayoutAssessment): StructuralLayoutFinding[] {
  return assessment.structuralState?.findings || []
}

function getStructuralFindingWeight(findings: StructuralLayoutFinding[]) {
  return findings.reduce((sum, finding) => {
    const weight = finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1
    return sum + weight
  }, 0)
}

function normalizeSceneMetric(value: unknown) {
  const numeric = typeof value === 'number' ? value : 0
  return Math.round(numeric * 10) / 10
}

function createRepairSceneSignature(scene: Scene) {
  const snapshot = {
    title: {
      x: normalizeSceneMetric(scene.title.x),
      y: normalizeSceneMetric(scene.title.y),
      w: normalizeSceneMetric(scene.title.w),
      h: normalizeSceneMetric(scene.title.h),
      fontSize: normalizeSceneMetric(scene.title.fontSize),
      maxLines: scene.title.maxLines || 0,
      charsPerLine: scene.title.charsPerLine || 0,
    },
    subtitle: {
      x: normalizeSceneMetric(scene.subtitle.x),
      y: normalizeSceneMetric(scene.subtitle.y),
      w: normalizeSceneMetric(scene.subtitle.w),
      h: normalizeSceneMetric(scene.subtitle.h),
      fontSize: normalizeSceneMetric(scene.subtitle.fontSize),
      opacity: normalizeSceneMetric(scene.subtitle.opacity),
    },
    cta: {
      x: normalizeSceneMetric(scene.cta.x),
      y: normalizeSceneMetric(scene.cta.y),
      w: normalizeSceneMetric(scene.cta.w),
      h: normalizeSceneMetric(scene.cta.h),
    },
    badge: {
      x: normalizeSceneMetric(scene.badge.x),
      y: normalizeSceneMetric(scene.badge.y),
      w: normalizeSceneMetric(scene.badge.w),
      h: normalizeSceneMetric(scene.badge.h),
      opacity: normalizeSceneMetric(scene.badge.opacity),
    },
    logo: {
      x: normalizeSceneMetric(scene.logo.x),
      y: normalizeSceneMetric(scene.logo.y),
      w: normalizeSceneMetric(scene.logo.w),
      h: normalizeSceneMetric(scene.logo.h),
    },
    image: {
      x: normalizeSceneMetric(scene.image.x),
      y: normalizeSceneMetric(scene.image.y),
      w: normalizeSceneMetric(scene.image.w),
      h: normalizeSceneMetric(scene.image.h),
      opacity: normalizeSceneMetric(scene.image.opacity),
      fit: scene.image.fit || '',
    },
  }
  return JSON.stringify(snapshot)
}

function computeSceneGeometryDelta(left: Scene, right: Scene) {
  const pairs: Array<[unknown, unknown]> = [
    [left.title.x, right.title.x],
    [left.title.y, right.title.y],
    [left.title.w, right.title.w],
    [left.title.h, right.title.h],
    [left.title.fontSize, right.title.fontSize],
    [left.subtitle.x, right.subtitle.x],
    [left.subtitle.y, right.subtitle.y],
    [left.subtitle.w, right.subtitle.w],
    [left.subtitle.h, right.subtitle.h],
    [left.subtitle.fontSize, right.subtitle.fontSize],
    [left.cta.x, right.cta.x],
    [left.cta.y, right.cta.y],
    [left.cta.w, right.cta.w],
    [left.cta.h, right.cta.h],
    [left.badge.x, right.badge.x],
    [left.badge.y, right.badge.y],
    [left.logo.x, right.logo.x],
    [left.logo.y, right.logo.y],
    [left.image.x, right.image.x],
    [left.image.y, right.image.y],
    [left.image.w, right.image.w],
    [left.image.h, right.image.h],
  ]
  return pairs.reduce((sum, [a, b]) => sum + Math.abs((typeof a === 'number' ? a : 0) - (typeof b === 'number' ? b : 0)), 0)
}

function createRepairAttemptSignature(input: {
  beforeSceneSignature: string
  strategy: RepairStrategy
  classification: FailureClassification
}) {
  return JSON.stringify({
    before: input.beforeSceneSignature,
    dominantType: input.classification.dominantType,
    strategy: input.strategy.label,
    kind: input.strategy.kind,
    fixStage: input.strategy.fixStage || null,
    actions: (input.strategy.actions || []).slice().sort(),
    override: input.strategy.overrideIntent || {},
  })
}

function evaluateRepairSceneSync(input: {
  scene: Scene
  formatKey: FormatKey
  assessment?: LayoutAssessment
  expectedCompositionModelId?: Variant['compositionModelId']
  imageAnalysis?: EnhancedImageAnalysis
  strategyLabel: string
  actions?: FixAction[]
}): RepairEvaluatedScene {
  const assessment =
    input.assessment || getFormatAssessment(input.formatKey, input.scene, input.expectedCompositionModelId, input.imageAnalysis)
  const scoreTrust = computeScoreTrust(assessment, assessment.aiReview)
  const previewScoreTrust = computeScoreTrust(assessment)
  const findings = getStructuralFindings(assessment)
  return {
    formatKey: input.formatKey,
    scene: input.scene,
    assessment,
    scoreTrust,
    previewScoreTrust,
    compositionModelId: input.expectedCompositionModelId,
    sceneSignature: createRepairSceneSignature(input.scene),
    structuralStatus: getStructuralStatus(assessment),
    structuralFindingCount: findings.length,
    structuralFindingWeight: getStructuralFindingWeight(findings),
    highStructuralFindingCount: findings.filter((finding) => finding.severity === 'high').length,
    criticalIssueCount: countCriticalIssues(assessment),
    highIssueCount: countHighIssues(assessment),
    issueCount: assessment.issues.length,
    unresolvedIssueCount: unresolvedIssueCount(assessment.issues),
    strategyLabel: input.strategyLabel,
    actions: input.actions || [],
  }
}

async function evaluateRepairScene(input: {
  scene: Scene
  formatKey: FormatKey
  expectedCompositionModelId?: Variant['compositionModelId']
  imageAnalysis?: EnhancedImageAnalysis
  strategyLabel: string
  actions?: FixAction[]
}): Promise<RepairEvaluatedScene> {
  const format = FORMAT_MAP[input.formatKey]
  const assessmentBase = getFormatAssessment(input.formatKey, input.scene, input.expectedCompositionModelId, input.imageAnalysis)
  const aiReview = await aiReviewLayout(input.scene, { format, assessment: assessmentBase })
  return evaluateRepairSceneSync({
    ...input,
    assessment: { ...assessmentBase, aiReview },
  })
}

function averageNumbers(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value))
  if (!usable.length) return 0
  return usable.reduce((sum, value) => sum + value, 0) / usable.length
}

function getRepairCandidateKind(strategy?: RepairStrategy): RepairCandidateKind {
  if (strategy?.candidateKind) return strategy.candidateKind
  if (strategy?.kind === 'structural-regeneration') return 'guided-regeneration-repair'
  if (strategy?.label === 'validated-run-autofix') return 'validated-run-autofix'
  if (strategy?.label === 'stronger-local-structural-repair') return 'stronger-local-structural-repair'
  return 'local-structural-repair'
}

function isEscalationSourcedRepairStrategy(strategy?: RepairStrategy) {
  if (!strategy) return false
  if (strategy.candidateKind === 'guided-regeneration-repair') return true
  if (strategy.kind === 'structural-regeneration') return true
  return strategy.label.startsWith('run-auto-fix-escalation:')
}

function getRepairObjectiveContext(input: {
  formatKey: FormatKey
  formatFamily: FormatFamily
  repairConfig: RepairSearchConfig
}) {
  const format = FORMAT_MAP[input.formatKey]
  const aspectMode = getRepairAspectMode(format)
  const objectiveProfile = getRepairObjectiveProfile({
    config: input.repairConfig,
    aspectMode,
    formatFamily: input.formatFamily,
  })
  return {
    aspectMode,
    objectiveProfile,
    thresholds: input.repairConfig.thresholds,
  }
}

function getRepairClusterMetric(assessment: LayoutAssessment) {
  return (
    assessment.perceptual?.clusterCohesion ??
    assessment.layoutAnalysis?.clusters.textCluster?.metrics.cohesion ??
    assessment.metrics?.clusterCohesion ??
    assessment.visual?.breakdown.coherence ??
    0
  )
}

function getRepairCtaIntegrationMetric(assessment: LayoutAssessment) {
  return (
    assessment.perceptual?.ctaIntegration ??
    assessment.layoutAnalysis?.blocks.cta?.metrics.clusterIntegration ??
    assessment.metrics?.ctaProminence ??
    assessment.visual?.breakdown.ctaQuality ??
    0
  )
}

function getRepairBalanceMetric(assessment: LayoutAssessment) {
  return (
    assessment.perceptual?.visualBalance ??
    assessment.layoutAnalysis?.global.metrics.visualBalance ??
    assessment.metrics?.visualBalance ??
    assessment.visual?.breakdown.compositionBalance ??
    0
  )
}

function getRepairReadingFlowMetric(assessment: LayoutAssessment) {
  return (
    assessment.perceptual?.readingFlowClarity ??
    assessment.layoutAnalysis?.clusters.textCluster?.metrics.horizontalFlow ??
    assessment.metrics?.textRhythm ??
    assessment.metrics?.lineBreakQuality ??
    0
  )
}

function getRepairVerticalSeparationMetric(assessment: LayoutAssessment) {
  return (
    assessment.layoutAnalysis?.clusters.textCluster?.metrics.verticalFlow ??
    assessment.metrics?.textRhythm ??
    assessment.perceptual?.readingFlowClarity ??
    0
  )
}

function getRepairNegativeSpaceQuality(assessment: LayoutAssessment) {
  return assessment.perceptual ? 100 - assessment.perceptual.deadSpaceScore : assessment.metrics?.negativeSpaceBalance ?? 0
}

function getRepairPerceptualQuality(input: {
  assessment: LayoutAssessment
  objectiveProfile: RepairObjectiveProfile
}) {
  const weights = input.objectiveProfile.perceptualWeights
  const cluster = getRepairClusterMetric(input.assessment)
  const cta = getRepairCtaIntegrationMetric(input.assessment)
  const balance = getRepairBalanceMetric(input.assessment)
  const reading = getRepairReadingFlowMetric(input.assessment)
  const deadSpaceQuality = getRepairNegativeSpaceQuality(input.assessment)
  const overall = input.assessment.visual?.overallScore ?? input.assessment.score
  return clamp(
    Math.round(
      cluster * weights.cluster +
        cta * weights.cta +
        balance * weights.balance +
        deadSpaceQuality * weights.deadSpaceQuality +
        reading * weights.readingFlow +
        overall * weights.overall
    ),
    0,
    100
  )
}

function getRepairCommercialStrength(assessment: LayoutAssessment) {
  const metrics = assessment.metrics
  const visual = assessment.visual
  const signals = assessment.perceptual
  return clamp(
    Math.round(
      (metrics?.ctaProminence ?? visual?.breakdown.ctaQuality ?? 0) * 0.34 +
        (metrics?.textHierarchy ?? 0) * 0.24 +
        (metrics?.imageTextHarmony ?? 0) * 0.18 +
        (signals?.ctaIntegration ?? 0) * 0.14 +
        (visual?.breakdown.focusHierarchy ?? metrics?.readability ?? 0) * 0.1
    ),
    0,
    100
  )
}

function getRepairFamilyFidelity(input: {
  candidate: RepairEvaluatedScene
  formatKey: FormatKey
  expectedCompositionModelId?: Variant['compositionModelId']
  expectedFamily?: LayoutIntentFamily
}) {
  const format = FORMAT_MAP[input.formatKey]
  const formatSuitability =
    input.candidate.assessment.layoutAnalysis?.global.metrics.formatSuitability ??
    input.candidate.assessment.visual?.breakdown.coherence ??
    input.candidate.assessment.score

  if (!input.expectedCompositionModelId) {
    return clamp(Math.round(formatSuitability), 0, 100)
  }

  const expectedModel = getCompositionModel(format, input.expectedCompositionModelId)
  if (!expectedModel) {
    return clamp(Math.round(formatSuitability), 0, 100)
  }

  const rawCompliance = getModelComplianceScore(input.candidate.scene, format, expectedModel)
  const maxCompliance = Math.max(expectedModel.slots.length * 3 + 2, 1)
  const complianceScore = (rawCompliance / maxCompliance) * 100
  const actualModelId = input.candidate.assessment.compositionModelId
  const sameModelBonus = actualModelId === expectedModel.id ? 10 : 0
  const actualFamily = actualModelId ? resolveCompositionModelFamily(actualModelId) : undefined
  const familyBonus =
    actualFamily && input.expectedFamily
      ? actualFamily === input.expectedFamily
        ? 6
        : -8
      : 0

  return clamp(Math.round(complianceScore * 0.78 + formatSuitability * 0.22 + sameModelBonus + familyBonus), 0, 100)
}

function getRepairStructuralValidity(candidate: RepairEvaluatedScene) {
  const metrics = candidate.assessment.structuralState?.metrics
  const base =
    candidate.structuralStatus === 'valid'
      ? 100
      : candidate.structuralStatus === 'degraded'
        ? 72
        : 42
  const occupancyBonus = ((metrics?.occupiedSafeArea || 0) * 18) + ((metrics?.textClusterCoverage || 0) * 70)
  const penalty =
    candidate.structuralFindingWeight * 5 +
    candidate.highStructuralFindingCount * 6 +
    candidate.criticalIssueCount * 7 +
    candidate.highIssueCount * 3
  return clamp(Math.round(base - penalty + occupancyBonus), 0, 100)
}

function getRepairSideEffectCost(input: {
  baseline: RepairEvaluatedScene
  candidate: RepairEvaluatedScene
  objectiveProfile: RepairObjectiveProfile
}) {
  const weights = input.objectiveProfile.sideEffectWeights
  const disagreementRegression = Math.max(0, input.candidate.scoreTrust.disagreement - input.baseline.scoreTrust.disagreement)
  const deadSpaceRegression = Math.max(0, getRepairNegativeSpaceQuality(input.baseline.assessment) - getRepairNegativeSpaceQuality(input.candidate.assessment))
  const unresolvedRegression = Math.max(0, input.candidate.unresolvedIssueCount - input.baseline.unresolvedIssueCount)
  const highRegression = Math.max(0, input.candidate.highIssueCount - input.baseline.highIssueCount)
  const criticalRegression = Math.max(0, input.candidate.criticalIssueCount - input.baseline.criticalIssueCount)
  const clusterRegression = Math.max(0, getRepairClusterMetric(input.baseline.assessment) - getRepairClusterMetric(input.candidate.assessment))
  const balanceRegression = Math.max(0, getRepairBalanceMetric(input.baseline.assessment) - getRepairBalanceMetric(input.candidate.assessment))
  const readingFlowRegression = Math.max(0, getRepairReadingFlowMetric(input.baseline.assessment) - getRepairReadingFlowMetric(input.candidate.assessment))
  const ctaDisconnectRegression = Math.max(
    0,
    getRepairCtaIntegrationMetric(input.baseline.assessment) - getRepairCtaIntegrationMetric(input.candidate.assessment)
  )
  const verticalSeparationRegression = Math.max(
    0,
    getRepairVerticalSeparationMetric(input.baseline.assessment) - getRepairVerticalSeparationMetric(input.candidate.assessment)
  )
  const inactiveSideRegression = Math.max(
    0,
    (input.baseline.assessment.metrics?.negativeSpaceBalance ?? getRepairNegativeSpaceQuality(input.baseline.assessment)) -
      (input.candidate.assessment.metrics?.negativeSpaceBalance ?? getRepairNegativeSpaceQuality(input.candidate.assessment))
  )
  const geometryDelta = computeSceneGeometryDelta(input.baseline.scene, input.candidate.scene)
  const geometryCost =
    geometryDelta <= REPAIR_MIN_GEOMETRY_DELTA ? 0 : Math.min((geometryDelta - REPAIR_MIN_GEOMETRY_DELTA) * 0.45, 14)

  return clamp(
    Math.round(
      disagreementRegression * weights.disagreement +
        deadSpaceRegression * weights.deadSpace +
        unresolvedRegression * weights.unresolved +
        highRegression * weights.high +
        criticalRegression * weights.critical +
        geometryCost * weights.geometry +
        clusterRegression * weights.clusterRegression +
        balanceRegression * weights.balanceRegression +
        readingFlowRegression * weights.readingFlowRegression +
        ctaDisconnectRegression * weights.ctaDisconnectRegression +
        verticalSeparationRegression * weights.verticalSeparationRegression +
        inactiveSideRegression * weights.inactiveSideRegression
    ),
    0,
    100
  )
}

function evaluateRepairObjective(input: {
  baseline: RepairEvaluatedScene
  candidate: RepairEvaluatedScene
  formatFamily: FormatFamily
  formatKey: FormatKey
  objectiveProfile: RepairObjectiveProfile
  expectedCompositionModelId?: Variant['compositionModelId']
  expectedFamily?: LayoutIntentFamily
}): RepairObjectiveBreakdown {
  const weights = input.objectiveProfile.weights
  const structuralValidity = getRepairStructuralValidity(input.candidate)
  const perceptualQuality = getRepairPerceptualQuality({
    assessment: input.candidate.assessment,
    objectiveProfile: input.objectiveProfile,
  })
  const commercialStrength = getRepairCommercialStrength(input.candidate.assessment)
  const familyFidelity = getRepairFamilyFidelity({
    candidate: input.candidate,
    formatKey: input.formatKey,
    expectedCompositionModelId: input.expectedCompositionModelId,
    expectedFamily: input.expectedFamily,
  })
  const sideEffectCost = getRepairSideEffectCost({
    baseline: input.baseline,
    candidate: input.candidate,
    objectiveProfile: input.objectiveProfile,
  })
  const aggregateScore = clamp(
    Math.round(
      structuralValidity * weights.structuralValidity +
        perceptualQuality * weights.perceptualQuality +
        commercialStrength * weights.commercialStrength +
        familyFidelity * weights.familyFidelity -
        sideEffectCost * weights.sideEffectCost
    ),
    0,
    100
  )

  return {
    structuralValidity,
    perceptualQuality,
    commercialStrength,
    familyFidelity,
    sideEffectCost,
    aggregateScore,
    weights,
  }
}

function getStructuralFindingMetrics(candidate: RepairEvaluatedScene, name: StructuralInvariantName) {
  const finding = getStructuralFindings(candidate.assessment).find((entry) => entry.name === name)
  return finding?.metrics || {}
}

function hasStructuralFinding(candidate: RepairEvaluatedScene, name: StructuralInvariantName) {
  return getStructuralFindings(candidate.assessment).some((finding) => finding.name === name)
}

function countHardStructuralFindings(candidate: RepairEvaluatedScene) {
  return getStructuralFindings(candidate.assessment).filter(
    (finding) => finding.name === 'major-overlap' || finding.name === 'safe-area-compliance'
  ).length
}

function deriveRepairSummaryTags(input: {
  candidate: RepairEvaluatedScene
  familyFidelity: number
}): string[] {
  const tags: string[] = []
  const metrics = input.candidate.assessment.metrics
  const perceptual = input.candidate.assessment.perceptual
  if (hasStructuralFinding(input.candidate, 'minimum-spacing') || (metrics?.spacingQuality || 100) < 62) {
    tags.push('insufficient-breathing-room')
  }
  if ((perceptual?.deadSpaceScore || 0) >= 34 || (metrics?.negativeSpaceBalance || 100) < 58) {
    tags.push('inactive-empty-space')
  }
  if (
    hasStructuralFinding(input.candidate, 'role-placement') ||
    hasStructuralFinding(input.candidate, 'safe-area-compliance') ||
    hasStructuralFinding(input.candidate, 'major-overlap')
  ) {
    tags.push('structural-drift')
  }
  if ((input.candidate.assessment.structuralState?.metrics.imageCoverage || 0) < 0.08 && (metrics?.imageTextHarmony || 100) < 60) {
    tags.push('weak-image-footprint')
  }
  if (input.familyFidelity < 58) {
    tags.push('family-mismatch')
  }
  return unique(tags)
}

function deriveRepairPenaltyTags(input: {
  candidate: RepairEvaluatedScene
  objective: RepairObjectiveBreakdown
  confidenceDelta: number
  gateOutcomes: RepairCandidateGateDiagnostics
}): string[] {
  const tags: string[] = []
  const metrics = input.candidate.assessment.metrics
  if (input.objective.sideEffectCost >= 22) tags.push('high-side-effect-cost')
  if (getRepairReadingFlowMetric(input.candidate.assessment) < 62) tags.push('weak-reading-flow')
  if (getRepairBalanceMetric(input.candidate.assessment) < 60) tags.push('weak-balance')
  if (getRepairCtaIntegrationMetric(input.candidate.assessment) < 60) tags.push('cta-disconnect')
  if ((metrics?.negativeSpaceBalance ?? getRepairNegativeSpaceQuality(input.candidate.assessment)) < 58) {
    tags.push('inactive-side-penalty')
  }
  if (input.confidenceDelta > 0) tags.push('confidence-regression')
  if (input.gateOutcomes.spacingThresholdExceeded) tags.push('spacing-threshold-exceeded')
  if (input.gateOutcomes.hardStructuralInvalidity) tags.push('hard-structural-invalidity')
  if (input.gateOutcomes.noNetGain) tags.push('insufficient-net-gain')
  return unique(tags)
}

function evaluateRepairSearchCandidate(input: {
  baseline: RepairEvaluatedScene
  candidate: RepairEvaluatedScene
  strategy?: RepairStrategy
  decision?: RepairResult
  formatFamily: FormatFamily
  formatKey: FormatKey
  objectiveProfile: RepairObjectiveProfile
  thresholds: RepairObjectiveThresholds
  expectedCompositionModelId?: Variant['compositionModelId']
  expectedFamily?: LayoutIntentFamily
  baselineAggregateScore: number
}): RepairCandidateEvaluation {
  const candidateKind = getRepairCandidateKind(input.strategy)
  const objective = evaluateRepairObjective({
    baseline: input.baseline,
    candidate: input.candidate,
    formatFamily: input.formatFamily,
    formatKey: input.formatKey,
    objectiveProfile: input.objectiveProfile,
    expectedCompositionModelId: input.expectedCompositionModelId,
    expectedFamily: input.expectedFamily,
  })
  const aggregateDelta = Math.round((objective.aggregateScore - input.baselineAggregateScore) * 10) / 10
  const rejectionReasons: RepairRejectionReason[] = []
  const gateOutcomes: RepairCandidateGateDiagnostics = {
    repeatSuppressed: false,
    legacySafetyRejected: false,
    hardStructuralInvalidity: false,
    rolePlacementOutOfZone: false,
    spacingThresholdExceeded: false,
    confidenceCollapse: false,
    aggregateBelowBaseline: false,
    noNetGain: false,
    nearMissOverrideEligible: false,
    nearMissOverrideBlockedReasons: [],
    nearMissOverrideSafeguardsSatisfied: false,
    wouldWinUnderNearMissOverride: false,
    landscapeTextHeightNearMissEligible: false,
    landscapeTextHeightNearMissApplied: false,
    landscapeTextHeightNearMissBlockedReasons: [],
    landscapeTextHeightNearMissSafeguardsSatisfied: false,
    landscapeTextHeightNearMissSafeguardResults: buildEmptyLandscapeTextHeightNearMissSafeguards(false),
    wouldWinUnderLandscapeTextHeightNearMissOverride: false,
  }
  const confidenceDelta = Math.round((input.candidate.scoreTrust.disagreement - input.baseline.scoreTrust.disagreement) * 10) / 10
  const structuralFindingDelta = input.baseline.structuralFindingWeight - input.candidate.structuralFindingWeight
  const candidateId = `${candidateKind}:${input.candidate.strategyLabel}:${input.candidate.sceneSignature}`

  if (candidateKind !== 'baseline') {
    const escalationSourced = isEscalationSourcedRepairStrategy(input.strategy)
    const fullRegenerationEscalation =
      input.strategy?.candidateKind === 'guided-regeneration-repair' || input.strategy?.kind === 'structural-regeneration'
    const skipLegacySafetyGateForEscalation =
      escalationSourced &&
      fullRegenerationEscalation &&
      input.candidate.structuralStatus !== 'invalid' &&
      objective.aggregateScore === input.baselineAggregateScore &&
      input.decision?.noOp !== true
    if (input.decision?.suppressedAsRepeat || input.decision?.repeatedWeakOutcome) {
      gateOutcomes.repeatSuppressed = true
      rejectionReasons.push('repeat-suppressed')
    } else if (!skipLegacySafetyGateForEscalation && input.decision && !input.decision.accepted) {
      gateOutcomes.legacySafetyRejected = true
      const _isEscalation1657 = isEscalationSourcedRepairStrategy(input.strategy)
      const _structuralState1657 =
        input.candidate?.assessment?.structuralState?.status ?? input.candidate?.structuralStatus ?? 'unknown'
      if (!_isEscalation1657 || _structuralState1657 === 'invalid') {
        rejectionReasons.push('legacy-safety-rejection')
      }
    }

    const hardStructuralRegression =
      getStructuralTierRank(input.candidate.structuralStatus) < getStructuralTierRank(input.baseline.structuralStatus) ||
      countHardStructuralFindings(input.candidate) > countHardStructuralFindings(input.baseline)
    if (hardStructuralRegression) {
      gateOutcomes.hardStructuralInvalidity = true
      rejectionReasons.push('hard-structural-invalidity')
    }

    const enforceRolePlacementHardGate =
      !input.thresholds.allowRolePlacement && input.candidate.structuralStatus === 'invalid'
    if (enforceRolePlacementHardGate && hasStructuralFinding(input.candidate, 'role-placement')) {
      gateOutcomes.rolePlacementOutOfZone = true
      rejectionReasons.push('role-placement-out-of-zone')
    }

    const baselineSpacingMetrics = getStructuralFindingMetrics(input.baseline, 'minimum-spacing')
    const candidateSpacingMetrics = getStructuralFindingMetrics(input.candidate, 'minimum-spacing')
    const baselineSpacingCount = Number(baselineSpacingMetrics.count || input.baseline.assessment.spacingViolations?.length || 0)
    const candidateSpacingCount = Number(candidateSpacingMetrics.count || input.candidate.assessment.spacingViolations?.length || 0)
    const baselineSpacingGap = Number(baselineSpacingMetrics.maxGapDeficit || 0)
    const candidateSpacingGap = Number(candidateSpacingMetrics.maxGapDeficit || 0)
    if (
      candidateSpacingCount > baselineSpacingCount + input.thresholds.maxSpacingViolationIncrease ||
      candidateSpacingGap > baselineSpacingGap + input.thresholds.maxSpacingGapDeficitIncrease
    ) {
      gateOutcomes.spacingThresholdExceeded = true
      rejectionReasons.push('spacing-threshold-exceeded')
    }

    const confidenceCollapsed =
      confidenceDelta > input.thresholds.maxConfidenceRegression ||
      (!input.baseline.scoreTrust.needsHumanAttention &&
        input.candidate.scoreTrust.needsHumanAttention &&
        input.candidate.scoreTrust.effectiveScore < input.baseline.scoreTrust.effectiveScore - 2)
    if (confidenceCollapsed) {
      gateOutcomes.confidenceCollapse = true
      rejectionReasons.push('confidence-collapse')
    }

    if (objective.aggregateScore < input.baselineAggregateScore) {
      gateOutcomes.aggregateBelowBaseline = true
      rejectionReasons.push('aggregate-below-baseline')
    }
    const hasNetGain =
      objective.aggregateScore >=
      input.baselineAggregateScore + (escalationSourced ? 0 : input.thresholds.minAggregateGain)
    if (!hasNetGain) {
      gateOutcomes.noNetGain = true
      rejectionReasons.push('no-net-gain')
    }
  }

  const normalizedRejectionReasons = unique(rejectionReasons)
  const placementDiagnostics = classifyPlacementViolation({
    scene: input.candidate.scene,
    assessment: input.candidate.assessment,
    formatKey: input.formatKey,
    candidateKind,
    strategyLabel: input.candidate.strategyLabel,
  })
  const softPlacement = simulateSoftPlacementPolicy({
    aggregateScore: objective.aggregateScore,
    baselineAggregateScore: input.baselineAggregateScore,
    rejectionReasons: normalizedRejectionReasons,
    gateOutcomes,
    placement: placementDiagnostics,
    thresholds: input.thresholds,
  })
  const nearMissExperiment = simulateLandscapeImageNearMissOverride({
    formatKey: input.formatKey,
    baseline: input.baseline,
    candidate: input.candidate,
    aggregateDelta,
    rejectionReasons: normalizedRejectionReasons,
    gateOutcomes,
    placement: placementDiagnostics,
  })
  gateOutcomes.nearMissOverrideEligible = nearMissExperiment.nearMissOverrideEligible
  gateOutcomes.nearMissOverrideBlockedReasons = nearMissExperiment.nearMissOverrideBlockedReasons
  gateOutcomes.nearMissOverrideSafeguardsSatisfied = nearMissExperiment.nearMissOverrideSafeguardsSatisfied
  gateOutcomes.wouldWinUnderNearMissOverride = nearMissExperiment.wouldWinUnderNearMissOverride
  const penaltyTags = deriveRepairPenaltyTags({
    candidate: input.candidate,
    objective,
    confidenceDelta,
    gateOutcomes,
  })

  return {
    candidateId,
    strategyLabel: input.candidate.strategyLabel,
    candidateKind,
    structuralStatus: input.candidate.structuralStatus,
    effectiveScore: input.candidate.scoreTrust.effectiveScore,
    aggregateScore: objective.aggregateScore,
    aggregateDelta,
    accepted: candidateKind === 'baseline' ? true : normalizedRejectionReasons.length === 0,
    rejectionReasons: normalizedRejectionReasons,
    gateOutcomes,
    summaryTags: deriveRepairSummaryTags({
      candidate: input.candidate,
      familyFidelity: objective.familyFidelity,
    }),
    penaltyTags,
    objective,
    confidence: {
      effectiveScore: input.candidate.scoreTrust.effectiveScore,
      disagreement: input.candidate.scoreTrust.disagreement,
      needsHumanAttention: input.candidate.scoreTrust.needsHumanAttention,
    },
    confidenceDelta,
    structuralFindingDelta,
    placementSeverity: placementDiagnostics.severity,
    placementDiagnostics,
    softPlacementPenalty: softPlacement.softPlacementPenalty,
    adjustedAggregateScore: softPlacement.adjustedAggregateScore,
    wouldPassWithSoftPlacement: softPlacement.wouldPassWithSoftPlacement,
    wouldBeatBaselineWithSoftPlacement: softPlacement.wouldBeatBaselineWithSoftPlacement,
    nearMissOverrideEligible: nearMissExperiment.nearMissOverrideEligible,
    nearMissOverrideReason: nearMissExperiment.nearMissOverrideBlockedReasons[0] || null,
    wouldWinUnderNearMissOverride: nearMissExperiment.wouldWinUnderNearMissOverride,
    landscapeTextHeightNearMissEligible: false,
    landscapeTextHeightNearMissApplied: false,
    landscapeTextHeightNearMissReason: null,
    landscapeTextHeightNearMissSafeguardResults: buildEmptyLandscapeTextHeightNearMissSafeguards(false),
    landscapeTextHeightNearMissBlockerFamily: null,
    landscapeTextHeightNearMissBlockerSubtype: null,
    finalWinnerChangedByOverride: false,
  }
}

function simulateLandscapeImageNearMissOverride(input: {
  formatKey: FormatKey
  baseline: RepairEvaluatedScene
  candidate: RepairEvaluatedScene
  aggregateDelta: number
  rejectionReasons: RepairRejectionReason[]
  gateOutcomes: RepairCandidateGateDiagnostics
  placement: PlacementViolationDiagnostics
}) {
  const blockedReasons: string[] = []
  const format = FORMAT_MAP[input.formatKey]
  const isLandscapeDisplay =
    ['display-mpu', 'display-large-rect'].includes(input.formatKey) &&
    format.category === 'display' &&
    format.family === 'landscape'
  if (!isLandscapeDisplay) blockedReasons.push('not-landscape-display')
  if (input.placement.role !== 'image') blockedReasons.push('dominant-blocker-not-image')
  if (input.placement.severity !== 'moderate') blockedReasons.push('placement-not-moderate')
  if (!input.placement.imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy) {
    blockedReasons.push('landscape-image-policy-not-applicable')
  }
  if (input.aggregateDelta <= 0) blockedReasons.push('non-positive-aggregate-delta')
  if (input.candidate.scoreTrust.effectiveScore < input.baseline.scoreTrust.effectiveScore) {
    blockedReasons.push('confidence-below-baseline')
  }
  if (input.gateOutcomes.hardStructuralInvalidity) blockedReasons.push('hard-structural-invalidity')
  if (input.gateOutcomes.spacingThresholdExceeded) blockedReasons.push('spacing-collapse')
  if (hasStructuralFinding(input.candidate, 'major-overlap')) blockedReasons.push('critical-overlap')
  if (countCriticalIssues(input.candidate.assessment) > 0) blockedReasons.push('critical-issues')

  const disallowedRemainingReasons = unique(
    input.rejectionReasons.filter(
      (reason) => reason !== 'role-placement-out-of-zone' && reason !== 'no-net-gain'
    )
  )
  if (disallowedRemainingReasons.length) {
    blockedReasons.push(...disallowedRemainingReasons.map((reason) => `remaining-gate:${reason}`))
  }

  const nearMissOverrideSafeguardsSatisfied = blockedReasons.length === 0
  const nearMissOverrideEligible = nearMissOverrideSafeguardsSatisfied
  const wouldWinUnderNearMissOverride =
    nearMissOverrideEligible &&
    input.rejectionReasons.includes('role-placement-out-of-zone') &&
    input.aggregateDelta > 0

  return {
    nearMissOverrideEligible,
    nearMissOverrideBlockedReasons: unique(blockedReasons),
    nearMissOverrideSafeguardsSatisfied,
    wouldWinUnderNearMissOverride,
  }
}

function buildEmptyLandscapeTextHeightNearMissSafeguards(
  featureEnabled: boolean
): LandscapeTextHeightNearMissSafeguardResults {
  return {
    featureEnabled,
    landscapeDisplay: false,
    bestRejectedCandidate: false,
    blockerFamilyMatch: false,
    mildSeverity: false,
    positiveAggregateDelta: false,
    nonNegativeConfidenceDelta: false,
    titleOnlyWouldPass: false,
    messageClusterWouldPass: false,
    remainingBlockerWouldBecomeMilder: false,
    primaryBlockerRolePlacement: false,
    onlyBlockedByOneGate: false,
    noLegacySafetyRejection: false,
    noHardStructuralInvalidity: false,
    noSpacingCollapse: false,
    noCriticalOverlap: false,
    noRoleLoss: false,
  }
}

function getLandscapeTextHeightNearMissBestRejectedAttempt(attempts: RepairAttempt[]) {
  const rejected = attempts.filter(
    (attempt) =>
      attempt.searchEvaluation &&
      !attempt.searchEvaluation.accepted &&
      attempt.searchEvaluation.candidateKind !== 'baseline'
  )
  if (!rejected.length) return null
  return [...rejected].sort((left, right) => {
    const leftEvaluation = left.searchEvaluation!
    const rightEvaluation = right.searchEvaluation!
    const leftPositive = leftEvaluation.aggregateDelta > 0 ? 1 : 0
    const rightPositive = rightEvaluation.aggregateDelta > 0 ? 1 : 0
    if (rightPositive !== leftPositive) return rightPositive - leftPositive
    if (rightEvaluation.aggregateScore !== leftEvaluation.aggregateScore) {
      return rightEvaluation.aggregateScore - leftEvaluation.aggregateScore
    }
    if (rightEvaluation.confidence.effectiveScore !== leftEvaluation.confidence.effectiveScore) {
      return rightEvaluation.confidence.effectiveScore - leftEvaluation.confidence.effectiveScore
    }
    if (leftEvaluation.rejectionReasons.length !== rightEvaluation.rejectionReasons.length) {
      return leftEvaluation.rejectionReasons.length - rightEvaluation.rejectionReasons.length
    }
    const leftTie = `${leftEvaluation.candidateKind}:${leftEvaluation.strategyLabel}:${leftEvaluation.candidateId}`
    const rightTie = `${rightEvaluation.candidateKind}:${rightEvaluation.strategyLabel}:${rightEvaluation.candidateId}`
    return leftTie.localeCompare(rightTie)
  })[0]
}

function getLandscapeNearMissRoleEntry(
  placement: PlacementViolationDiagnostics,
  role: 'text' | 'cta' | 'image'
) {
  return placement.perRole.find((entry) => entry.role === role && entry.eligible) || null
}

function getLandscapeNearMissRectUnion(
  rects: Array<{ x: number; y: number; w: number; h: number } | null | undefined>
) {
  const filtered = rects.filter(
    (rect): rect is { x: number; y: number; w: number; h: number } => Boolean(rect)
  )
  if (!filtered.length) return null
  const left = Math.min(...filtered.map((rect) => rect.x))
  const top = Math.min(...filtered.map((rect) => rect.y))
  const right = Math.max(...filtered.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...filtered.map((rect) => rect.y + rect.h))
  return {
    x: Math.round(left * 100) / 100,
    y: Math.round(top * 100) / 100,
    w: Math.round((right - left) * 100) / 100,
    h: Math.round((bottom - top) * 100) / 100,
  }
}

function getLandscapeNearMissMaxZoneDimension(
  zones: Array<{ x: number; y: number; w: number; h: number }>,
  dimension: 'w' | 'h'
) {
  if (!zones.length) return 0
  return Math.max(...zones.map((zone) => zone[dimension]))
}

function getLandscapeNearMissOverlapArea(
  a: { x: number; y: number; w: number; h: number } | null,
  b: { x: number; y: number; w: number; h: number } | null
) {
  if (!a || !b) return 0
  const overlapWidth = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const overlapHeight = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return Math.round(overlapWidth * overlapHeight * 100) / 100
}

function deriveLandscapeTextHeightNearMissBlocker(input: {
  formatKey: FormatKey
  evaluation: RepairCandidateEvaluation
}) {
  const cluster = input.evaluation.placementDiagnostics.landscapeTextCluster
  if (!cluster) {
    return {
      blockerFamily: 'other',
      blockerSubtype: 'missing-landscape-cluster',
      titleOnlyWouldPass: false,
      messageClusterWouldPass: false,
      remainingBlockerWouldBecomeMilder: false,
    }
  }

  const titleRect = input.evaluation.placementDiagnostics.textBoxes?.titleRect || null
  const subtitleRect = input.evaluation.placementDiagnostics.textBoxes?.subtitleRect || null
  const ctaRect = getLandscapeNearMissRoleEntry(input.evaluation.placementDiagnostics, 'cta')?.rect || null
  const imageRect = getLandscapeNearMissRoleEntry(input.evaluation.placementDiagnostics, 'image')?.rect || null
  const textClusterRect = getLandscapeNearMissRectUnion([titleRect, subtitleRect, ctaRect])
  const textRole = getLandscapeNearMissRoleEntry(input.evaluation.placementDiagnostics, 'text')
  const allowedTextZones = textRole?.allowedZones || []
  const maxAllowedTextWidth = getLandscapeNearMissMaxZoneDimension(allowedTextZones, 'w')
  const maxAllowedTextHeight = getLandscapeNearMissMaxZoneDimension(allowedTextZones, 'h')
  const overlapArea = getLandscapeNearMissOverlapArea(textClusterRect, imageRect)
  const splitBoundaryX = imageRect ? imageRect.x : 0
  const titlePlacementDistance = cluster.titlePlacementDistance ?? 0
  const subtitleAttachmentDistance = cluster.subtitleAttachmentDistance ?? 0
  const combinedMessageAllowedDistance =
    cluster.combinedAllowedDistance ?? cluster.rawCombinedMessageAllowedDistance ?? 0
  const titleZoneConflict = titlePlacementDistance > 2.5
  const subtitleZoneConflict = Boolean(cluster.subtitleDetached) || subtitleAttachmentDistance > 2
  const textTooWideForSplit =
    Boolean(textClusterRect) &&
    ((maxAllowedTextWidth > 0 && textClusterRect!.w > maxAllowedTextWidth + 1) ||
      (splitBoundaryX > 0 && textClusterRect!.x + textClusterRect!.w > splitBoundaryX - 4))
  const textTooTallForSplit =
    Boolean(textClusterRect) &&
    ((maxAllowedTextHeight > 0 && textClusterRect!.h > maxAllowedTextHeight + 2) ||
      Boolean(cluster.messageClusterTooTall))
  const messageVsImageOccupancyConflict =
    overlapArea > 0 ||
    Boolean(textClusterRect && imageRect && textClusterRect.x + textClusterRect.w > imageRect.x - 3)
  const ctaAnchorConflict =
    Boolean(cluster.ctaDetached) ||
    (!(cluster.ctaWithinSplitLayoutTolerance ?? false) &&
      ((cluster.ctaAnchorDistance ?? cluster.ctaAttachmentDistance ?? 0) > 2.5 ||
        (cluster.ctaMessageAssociationScore ?? 100) < 72 ||
        (cluster.ctaReadingFlowContinuity ?? 100) < 74)) ||
    !(cluster.fullClusterCoherent ?? true)
  const leftRightSplitConflict = !(cluster.textImageSplitCoherent ?? true)
  const roleConflictReasons: string[] = []
  if (titleZoneConflict) roleConflictReasons.push('title-zone-conflict')
  if (ctaAnchorConflict) roleConflictReasons.push('cta-anchor-conflict')
  if (textTooWideForSplit) roleConflictReasons.push('text-too-wide-for-split')
  if (textTooTallForSplit) roleConflictReasons.push('text-too-tall-for-split')
  if (messageVsImageOccupancyConflict) roleConflictReasons.push('message-vs-image-occupancy-conflict')
  if (leftRightSplitConflict) roleConflictReasons.push('left-right-split-conflict')
  if (subtitleZoneConflict) roleConflictReasons.push('subtitle-zone-conflict')

  const subtype =
    roleConflictReasons.find((reason) => reason === 'text-too-tall-for-split') ||
    roleConflictReasons.find((reason) => reason === 'title-zone-conflict') ||
    roleConflictReasons[0] ||
    'mixed-role-zone-conflict'
  const blockerFamily =
    subtype === 'text-too-tall-for-split'
      ? 'landscape-text-height'
      : subtype === 'title-zone-conflict'
        ? 'landscape-title-zone'
        : ctaAnchorConflict
          ? 'landscape-cta'
          : getLandscapeNearMissRoleEntry(input.evaluation.placementDiagnostics, 'image')
            ? 'landscape-role-conflict'
            : 'other'

  return {
    blockerFamily,
    blockerSubtype: subtype,
    titleOnlyWouldPass: titlePlacementDistance <= 2,
    messageClusterWouldPass:
      combinedMessageAllowedDistance <= 4 &&
      !Boolean(cluster.subtitleDetached) &&
      (cluster.textImageSplitCoherent ?? true) &&
      !Boolean(cluster.messageClusterTooTall),
    remainingBlockerWouldBecomeMilder:
      Boolean(cluster.wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy) ||
      Boolean(cluster.wouldBecomeMilderUnderAttachmentAwarePolicy) ||
      Boolean(cluster.wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy),
  }
}

function evaluateLandscapeTextHeightNearMissOverride(input: {
  formatKey: FormatKey
  repairConfig: RepairSearchConfig
  baselineEvaluation: RepairCandidateEvaluation
  evaluation: RepairCandidateEvaluation
  candidate: RepairEvaluatedScene
  strategy?: RepairStrategy
  isBestRejectedCandidate: boolean
}) {
  const safeguards = buildEmptyLandscapeTextHeightNearMissSafeguards(
    input.repairConfig.enableLandscapeTextHeightNearMissOverride
  )
  const blockedReasons: string[] = []
  const format = FORMAT_MAP[input.formatKey]
  safeguards.landscapeDisplay =
    format.category === 'display' &&
    format.family === 'landscape' &&
    ['display-mpu', 'display-large-rect'].includes(input.formatKey)
  safeguards.bestRejectedCandidate = input.isBestRejectedCandidate

  const blocker = deriveLandscapeTextHeightNearMissBlocker({
    formatKey: input.formatKey,
    evaluation: input.evaluation,
  })
  safeguards.blockerFamilyMatch = blocker.blockerFamily === 'landscape-text-height'
  safeguards.mildSeverity = input.evaluation.placementSeverity === 'mild'
  safeguards.positiveAggregateDelta = input.evaluation.aggregateDelta > 0
  safeguards.nonNegativeConfidenceDelta =
    input.evaluation.confidence.effectiveScore >= input.baselineEvaluation.confidence.effectiveScore &&
    input.evaluation.confidenceDelta >= 0
  safeguards.titleOnlyWouldPass = blocker.titleOnlyWouldPass
  safeguards.messageClusterWouldPass = blocker.messageClusterWouldPass
  safeguards.remainingBlockerWouldBecomeMilder = blocker.remainingBlockerWouldBecomeMilder
  safeguards.primaryBlockerRolePlacement =
    input.evaluation.rejectionReasons[0] === 'role-placement-out-of-zone'
  safeguards.onlyBlockedByOneGate = input.evaluation.rejectionReasons.length === 1
  safeguards.noLegacySafetyRejection = !input.evaluation.gateOutcomes.legacySafetyRejected
  safeguards.noHardStructuralInvalidity = !input.evaluation.gateOutcomes.hardStructuralInvalidity
  safeguards.noSpacingCollapse = !input.evaluation.gateOutcomes.spacingThresholdExceeded
  safeguards.noCriticalOverlap = !hasStructuralFinding(input.candidate, 'major-overlap')
  safeguards.noRoleLoss = ![...input.evaluation.summaryTags, ...input.evaluation.penaltyTags].some((tag) =>
    tag.toLowerCase().includes('role-loss')
  )

  if (!safeguards.featureEnabled) blockedReasons.push('feature-disabled')
  if (!safeguards.landscapeDisplay) blockedReasons.push('not-landscape-display')
  if (!safeguards.bestRejectedCandidate) blockedReasons.push('not-best-rejected-candidate')
  if (!safeguards.blockerFamilyMatch) blockedReasons.push(`blocker-family:${blocker.blockerFamily}`)
  if (!safeguards.mildSeverity) blockedReasons.push(`placement-severity:${input.evaluation.placementSeverity}`)
  if (!safeguards.positiveAggregateDelta) blockedReasons.push('non-positive-aggregate-delta')
  if (!safeguards.nonNegativeConfidenceDelta) blockedReasons.push('confidence-below-baseline')
  if (!safeguards.titleOnlyWouldPass) blockedReasons.push('title-would-not-pass')
  if (!safeguards.messageClusterWouldPass) blockedReasons.push('message-cluster-would-not-pass')
  if (!safeguards.remainingBlockerWouldBecomeMilder) blockedReasons.push('remaining-blocker-not-milder')
  if (!safeguards.primaryBlockerRolePlacement) blockedReasons.push('primary-blocker-not-role-placement')
  if (!safeguards.onlyBlockedByOneGate) blockedReasons.push('multiple-gates-blocking')
  const currentStructuralState =
    input.candidate?.assessment?.structuralState?.status ?? input.candidate?.structuralStatus ?? 'unknown'
  const _skipLegacy2089 =
    safeguards.noLegacySafetyRejection ||
    (isEscalationSourcedRepairStrategy(input.strategy) && currentStructuralState !== 'invalid')
  if (!_skipLegacy2089) blockedReasons.push('legacy-safety-rejection')
  if (!safeguards.noHardStructuralInvalidity) blockedReasons.push('hard-structural-invalidity')
  if (!safeguards.noSpacingCollapse) blockedReasons.push('spacing-collapse')
  if (!safeguards.noCriticalOverlap) blockedReasons.push('critical-overlap')
  if (!safeguards.noRoleLoss) blockedReasons.push('role-loss')

  const safeguardsSatisfied = blockedReasons.length === 0
  const eligible = safeguardsSatisfied
  const applied = safeguardsSatisfied && input.repairConfig.enableLandscapeTextHeightNearMissOverride
  return {
    eligible,
    applied,
    blockedReasons: unique(blockedReasons),
    safeguardsSatisfied,
    safeguards,
    blockerFamily: blocker.blockerFamily,
    blockerSubtype: blocker.blockerSubtype,
    finalWinnerChangedByOverride: applied,
  }
}

function selectRepairSearchWinner(input: {
  baseline: RepairEvaluatedScene
  attempts: RepairAttempt[]
  formatKey: FormatKey
  formatFamily: FormatFamily
  repairConfig: RepairSearchConfig
  expectedCompositionModelId?: Variant['compositionModelId']
  expectedFamily?: LayoutIntentFamily
}): {
  finalState: RepairEvaluatedScene
  acceptedDecision?: RepairResult
  selection: RepairSelectionDiagnostics
} {
  const objectiveContext = getRepairObjectiveContext({
    formatKey: input.formatKey,
    formatFamily: input.formatFamily,
    repairConfig: input.repairConfig,
  })
  const baselineEvaluation = evaluateRepairSearchCandidate({
    baseline: input.baseline,
    candidate: input.baseline,
    formatFamily: input.formatFamily,
    formatKey: input.formatKey,
    objectiveProfile: objectiveContext.objectiveProfile,
    thresholds: objectiveContext.thresholds,
    expectedCompositionModelId: input.expectedCompositionModelId,
    expectedFamily: input.expectedFamily,
    baselineAggregateScore: evaluateRepairObjective({
      baseline: input.baseline,
      candidate: input.baseline,
      formatFamily: input.formatFamily,
      formatKey: input.formatKey,
      objectiveProfile: objectiveContext.objectiveProfile,
      expectedCompositionModelId: input.expectedCompositionModelId,
      expectedFamily: input.expectedFamily,
    }).aggregateScore,
  })

  for (const attempt of input.attempts) {
    attempt.searchEvaluation = evaluateRepairSearchCandidate({
      baseline: input.baseline,
      candidate: attempt.candidate,
      strategy: attempt.strategy,
      decision: attempt.decision,
      formatFamily: input.formatFamily,
      formatKey: input.formatKey,
      objectiveProfile: objectiveContext.objectiveProfile,
      thresholds: objectiveContext.thresholds,
      expectedCompositionModelId: input.expectedCompositionModelId,
      expectedFamily: input.expectedFamily,
      baselineAggregateScore: baselineEvaluation.aggregateScore,
    })
  }

  const bestRejectedAttempt = getLandscapeTextHeightNearMissBestRejectedAttempt(input.attempts)
  for (const attempt of input.attempts) {
    const evaluation = attempt.searchEvaluation
    if (!evaluation || evaluation.candidateKind === 'baseline') continue
    const nearMissOverride = evaluateLandscapeTextHeightNearMissOverride({
      formatKey: input.formatKey,
      repairConfig: input.repairConfig,
      baselineEvaluation,
      evaluation,
      candidate: attempt.candidate,
      strategy: attempt.strategy,
      isBestRejectedCandidate: bestRejectedAttempt?.searchEvaluation?.candidateId === evaluation.candidateId,
    })
    evaluation.gateOutcomes.landscapeTextHeightNearMissEligible = nearMissOverride.eligible
    evaluation.gateOutcomes.landscapeTextHeightNearMissApplied = nearMissOverride.applied
    evaluation.gateOutcomes.landscapeTextHeightNearMissBlockedReasons = nearMissOverride.blockedReasons
    evaluation.gateOutcomes.landscapeTextHeightNearMissSafeguardsSatisfied = nearMissOverride.safeguardsSatisfied
    evaluation.gateOutcomes.landscapeTextHeightNearMissSafeguardResults = nearMissOverride.safeguards
    evaluation.gateOutcomes.wouldWinUnderLandscapeTextHeightNearMissOverride =
      nearMissOverride.eligible && evaluation.aggregateDelta > 0
    evaluation.landscapeTextHeightNearMissEligible = nearMissOverride.eligible
    evaluation.landscapeTextHeightNearMissApplied = nearMissOverride.applied
    evaluation.landscapeTextHeightNearMissReason = nearMissOverride.blockedReasons[0] || null
    evaluation.landscapeTextHeightNearMissSafeguardResults = nearMissOverride.safeguards
    evaluation.landscapeTextHeightNearMissBlockerFamily = nearMissOverride.blockerFamily
    evaluation.landscapeTextHeightNearMissBlockerSubtype = nearMissOverride.blockerSubtype
    evaluation.finalWinnerChangedByOverride = false
    if (nearMissOverride.applied) {
      evaluation.accepted = true
    }
  }

  const acceptedAttempts = input.attempts.filter((attempt) => attempt.searchEvaluation?.accepted)
  const winnerAttempt =
    [...acceptedAttempts].sort((left, right) => {
      const leftAggregate = left.searchEvaluation?.aggregateScore || 0
      const rightAggregate = right.searchEvaluation?.aggregateScore || 0
      if (leftAggregate !== rightAggregate) return rightAggregate - leftAggregate
      return compareRepairEvaluations(left.candidate, right.candidate)
    })[0] || null

  if (winnerAttempt?.searchEvaluation?.landscapeTextHeightNearMissApplied) {
    winnerAttempt.searchEvaluation.finalWinnerChangedByOverride = true
  }

  const finalState = winnerAttempt?.candidate || input.baseline
  const retainedBaseline = !winnerAttempt
  const winnerEvaluation = winnerAttempt?.searchEvaluation || baselineEvaluation
  const allEvaluations = [baselineEvaluation, ...input.attempts.map((attempt) => attempt.searchEvaluation!).filter(Boolean)]
  const telemetry: RepairSearchTelemetry = {
    formatKey: input.formatKey,
    formatFamily: input.formatFamily,
    aspectMode: objectiveContext.aspectMode,
    baselineCandidateId: baselineEvaluation.candidateId,
    baselineAggregateScore: baselineEvaluation.aggregateScore,
    baselineConfidence: baselineEvaluation.confidence,
    winnerCandidateId: winnerEvaluation.candidateId,
    winnerCandidateKind: winnerEvaluation.candidateKind,
    winnerStrategyLabel: winnerEvaluation.strategyLabel,
    winnerAggregateScore: winnerEvaluation.aggregateScore,
    winnerDeltaVsBaseline: winnerEvaluation.aggregateDelta,
    winnerConfidence: winnerEvaluation.confidence,
    winnerConfidenceDelta: winnerEvaluation.confidenceDelta,
    baselineWon: retainedBaseline,
    candidateBudgetUsage: {
      configured: input.repairConfig.candidateBudget,
      nonBaselineEvaluated: Math.max(allEvaluations.length - 1, 0),
      totalEvaluated: allEvaluations.length,
      remaining: Math.max(input.repairConfig.candidateBudget - Math.max(allEvaluations.length - 1, 0), 0),
      combinationConfigured: input.repairConfig.combinationBudget,
      combinationEvaluated: input.attempts.filter((attempt) => attempt.searchEvaluation?.candidateKind === 'combined-repair').length,
    },
    dominantTags: winnerEvaluation.summaryTags,
    dominantPenalties: winnerEvaluation.penaltyTags,
    landscapeTextHeightNearMissExperiment: {
      enabled: input.repairConfig.enableLandscapeTextHeightNearMissOverride,
      eligibleCandidateCount: allEvaluations.filter(
        (candidate) => candidate.landscapeTextHeightNearMissEligible
      ).length,
      eligibleCaseCount: allEvaluations.some((candidate) => candidate.landscapeTextHeightNearMissEligible) ? 1 : 0,
      appliedOverrideCount: allEvaluations.filter(
        (candidate) => candidate.landscapeTextHeightNearMissApplied
      ).length,
      flippedCaseIds:
        winnerEvaluation.finalWinnerChangedByOverride && !retainedBaseline ? [winnerEvaluation.candidateId] : [],
    },
    candidates: allEvaluations.map((candidate) => ({
      candidateId: candidate.candidateId,
      strategyLabel: candidate.strategyLabel,
      candidateKind: candidate.candidateKind,
      structuralStatus: candidate.structuralStatus,
      aggregateScore: candidate.aggregateScore,
      aggregateDelta: candidate.aggregateDelta,
      accepted: candidate.accepted,
      rejectionReasons: candidate.rejectionReasons,
      gateOutcomes: candidate.gateOutcomes,
      summaryTags: candidate.summaryTags,
      penaltyTags: candidate.penaltyTags,
      confidence: candidate.confidence,
      confidenceDelta: candidate.confidenceDelta,
      placementSeverity: candidate.placementSeverity,
        placementDiagnostics: candidate.placementDiagnostics,
        softPlacementPenalty: candidate.softPlacementPenalty,
        adjustedAggregateScore: candidate.adjustedAggregateScore,
        wouldPassWithSoftPlacement: candidate.wouldPassWithSoftPlacement,
        wouldBeatBaselineWithSoftPlacement: candidate.wouldBeatBaselineWithSoftPlacement,
        nearMissOverrideEligible: candidate.nearMissOverrideEligible,
        nearMissOverrideReason: candidate.nearMissOverrideReason,
        wouldWinUnderNearMissOverride: candidate.wouldWinUnderNearMissOverride,
        landscapeTextHeightNearMissEligible: candidate.landscapeTextHeightNearMissEligible,
        landscapeTextHeightNearMissApplied: candidate.landscapeTextHeightNearMissApplied,
        landscapeTextHeightNearMissReason: candidate.landscapeTextHeightNearMissReason,
        landscapeTextHeightNearMissSafeguardResults: candidate.landscapeTextHeightNearMissSafeguardResults,
        landscapeTextHeightNearMissBlockerFamily: candidate.landscapeTextHeightNearMissBlockerFamily,
        landscapeTextHeightNearMissBlockerSubtype: candidate.landscapeTextHeightNearMissBlockerSubtype,
        finalWinnerChangedByOverride: candidate.finalWinnerChangedByOverride,
      })),
  }
  const calibration: RepairCalibrationSnapshot = {
    formatKey: input.formatKey,
    formatFamily: input.formatFamily,
    aspectMode: objectiveContext.aspectMode,
    thresholds: objectiveContext.thresholds,
    objectiveProfile: objectiveContext.objectiveProfile,
    baseline: baselineEvaluation,
    winner: winnerEvaluation,
    candidateComparisons: allEvaluations,
  }

  return {
    finalState,
    acceptedDecision: winnerAttempt?.decision,
    selection: {
      candidateBudget: input.repairConfig.candidateBudget,
      retainedBaseline,
      baselineCandidateId: baselineEvaluation.candidateId,
      winnerCandidateId: winnerEvaluation.candidateId,
      winnerStrategyLabel: winnerEvaluation.strategyLabel,
      aspectMode: objectiveContext.aspectMode,
      thresholds: objectiveContext.thresholds,
      objectiveProfile: objectiveContext.objectiveProfile,
      telemetry,
      calibration,
      candidates: allEvaluations,
    },
  }
}

function classifyStructuralFailure(assessment: LayoutAssessment): FailureClassification {
  const weightedFindings: Record<RepairFailureType, number> = {
    'overlap-dominant': 0,
    'spacing-dominant': 0,
    'safe-area-dominant': 0,
    'text-size-dominant': 0,
    'image-dominance-dominant': 0,
    'occupancy-dominant': 0,
    mixed: 0,
  }
  const invariantWeights = new Map<StructuralInvariantName, number>()
  const findings = getStructuralFindings(assessment)
  for (const finding of findings) {
    const severityWeight = finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1
    const failureType: RepairFailureType =
      finding.name === 'major-overlap'
        ? 'overlap-dominant'
        : finding.name === 'minimum-spacing'
          ? 'spacing-dominant'
          : finding.name === 'safe-area-compliance'
            ? 'safe-area-dominant'
            : finding.name === 'text-size-sanity'
              ? 'text-size-dominant'
              : finding.name === 'image-dominance-sanity'
                ? 'image-dominance-dominant'
                : 'occupancy-dominant'
    weightedFindings[failureType] += severityWeight
    invariantWeights.set(finding.name, (invariantWeights.get(finding.name) || 0) + severityWeight)
  }

  const rankedTypes = (Object.entries(weightedFindings) as Array<[RepairFailureType, number]>)
    .filter(([type]) => type !== 'mixed')
    .sort((left, right) => right[1] - left[1])
  const dominant = rankedTypes[0] || ['mixed', 0]
  const runnerUp = rankedTypes[1] || ['mixed', 0]
  const mixed =
    dominant[1] > 0 &&
    runnerUp[1] > 0 &&
    dominant[1] - runnerUp[1] <= 1

  return {
    dominantType: mixed ? 'mixed' : dominant[0],
    weightedFindings,
    topInvariantNames: [...invariantWeights.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([name]) => name),
    findingCount: findings.length,
    highSeverityFindingCount: findings.filter((finding) => finding.severity === 'high').length,
    mixed,
  }
}

function getRepairStructuralFindingPenalty(candidate: RepairEvaluatedScene, name: string) {
  return getStructuralFindings(candidate.assessment)
    .filter((finding) => finding.name === name)
    .reduce((sum, finding) => sum + (finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1), 0)
}

function getRepairInvalidRecoveryPenalty(candidate: RepairEvaluatedScene) {
  return (
    getRepairStructuralFindingPenalty(candidate, 'major-overlap') * 100 +
    getRepairStructuralFindingPenalty(candidate, 'minimum-spacing') * 70 +
    getRepairStructuralFindingPenalty(candidate, 'safe-area-compliance') * 55 +
    getRepairStructuralFindingPenalty(candidate, 'role-placement') * 45 +
    getRepairStructuralFindingPenalty(candidate, 'text-size-sanity') * 28 +
    getRepairStructuralFindingPenalty(candidate, 'image-dominance-sanity') * 18 +
    getRepairStructuralFindingPenalty(candidate, 'structural-occupancy') * 12
  )
}

function buildRepairDecision(input: {
  before: RepairEvaluatedScene
  after: RepairEvaluatedScene
  strategy: RepairStrategy
  classification: FailureClassification
  attemptSignature?: string
  suppressAsRepeat?: boolean
  repeatReason?: string
  knownOutcomeRepeat?: boolean
}): RepairResult {
  const beforeTier = getStructuralTierRank(input.before.structuralStatus)
  const afterTier = getStructuralTierRank(input.after.structuralStatus)
  const scoreDelta = input.after.scoreTrust.effectiveScore - input.before.scoreTrust.effectiveScore
  const findingDelta = input.before.structuralFindingWeight - input.after.structuralFindingWeight
  const geometryDelta = computeSceneGeometryDelta(input.before.scene, input.after.scene)
  const sameSceneSignature = input.before.sceneSignature === input.after.sceneSignature
  const invalidRecoveryPenaltyDelta = getRepairInvalidRecoveryPenalty(input.before) - getRepairInvalidRecoveryPenalty(input.after)

  if (input.suppressAsRepeat) {
    return {
      accepted: false,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      rejectionReason: input.repeatReason || 'Repeated ineffective repair strategy on the same scene.',
      suppressedAsRepeat: true,
      attemptSignature: input.attemptSignature,
    }
  }

  if (afterTier < beforeTier) {
    return {
      accepted: false,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      rejectionReason: 'Structural tier worsened.',
      attemptSignature: input.attemptSignature,
    }
  }

  if (afterTier > beforeTier) {
    return {
      accepted: true,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      attemptSignature: input.attemptSignature,
    }
  }

  const meaningfulFindingReduction =
    findingDelta >= REPAIR_MEANINGFUL_FINDING_DELTA ||
    input.after.highStructuralFindingCount < input.before.highStructuralFindingCount ||
    input.after.unresolvedIssueCount < input.before.unresolvedIssueCount
  const worsenedInvalidRecoveryProfile =
    afterTier === beforeTier &&
    input.before.structuralStatus === 'invalid' &&
    invalidRecoveryPenaltyDelta < 0 &&
    !meaningfulFindingReduction &&
    scoreDelta <= 0
  const noOpReasons: string[] = []
  if (sameSceneSignature) noOpReasons.push('same-scene-signature')
  if (geometryDelta < REPAIR_MIN_GEOMETRY_DELTA) noOpReasons.push('negligible-geometry-change')
  if (afterTier === beforeTier) noOpReasons.push('no-structural-gain')
  if (!meaningfulFindingReduction) noOpReasons.push('no-meaningful-finding-reduction')
  if (scoreDelta < 1) noOpReasons.push('no-score-gain')
  const noOp =
    (sameSceneSignature || geometryDelta < REPAIR_MIN_GEOMETRY_DELTA) &&
    scoreDelta < 1 &&
    !meaningfulFindingReduction &&
    afterTier === beforeTier

  if (noOp || input.knownOutcomeRepeat) {
    return {
      accepted: false,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      rejectionReason: input.knownOutcomeRepeat
        ? 'Repeated weak repair outcome; escalating instead of looping.'
        : 'No-op repair attempt.',
      noOp,
      suppressedAsRepeat: input.knownOutcomeRepeat,
      repeatedWeakOutcome: input.knownOutcomeRepeat,
      noOpReasons,
      attemptSignature: input.attemptSignature,
    }
  }

  if (worsenedInvalidRecoveryProfile) {
    return {
      accepted: false,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      rejectionReason: 'Repair worsened the overlap/spacing recovery profile without structural gain.',
      noOpReasons,
      attemptSignature: input.attemptSignature,
    }
  }

  const accepted =
    scoreDelta >= 1 ||
    (meaningfulFindingReduction && scoreDelta > -REPAIR_SIGNIFICANT_SCORE_REGRESSION)

  return {
    accepted,
    strategy: input.strategy,
    classification: input.classification,
    beforeStructuralStatus: input.before.structuralStatus,
    afterStructuralStatus: input.after.structuralStatus,
    beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
    afterEffectiveScore: input.after.scoreTrust.effectiveScore,
    scoreDelta,
    findingDelta,
    rejectionReason: accepted
      ? undefined
      : scoreDelta <= -REPAIR_SIGNIFICANT_SCORE_REGRESSION
        ? 'Score regressed without structural gain.'
        : 'No structural or scoring improvement.',
    noOpReasons,
    attemptSignature: input.attemptSignature,
  }
}

function compareRepairEvaluations(left: RepairEvaluatedScene, right: RepairEvaluatedScene) {
  const leftTier = getStructuralTierRank(left.structuralStatus)
  const rightTier = getStructuralTierRank(right.structuralStatus)
  if (leftTier !== rightTier) return rightTier - leftTier
  if (left.scoreTrust.effectiveScore !== right.scoreTrust.effectiveScore) {
    return right.scoreTrust.effectiveScore - left.scoreTrust.effectiveScore
  }
  if (left.highStructuralFindingCount !== right.highStructuralFindingCount) {
    return left.highStructuralFindingCount - right.highStructuralFindingCount
  }
  if (left.structuralFindingWeight !== right.structuralFindingWeight) {
    return left.structuralFindingWeight - right.structuralFindingWeight
  }
  if (left.unresolvedIssueCount !== right.unresolvedIssueCount) {
    return left.unresolvedIssueCount - right.unresolvedIssueCount
  }
  return left.strategyLabel.localeCompare(right.strategyLabel)
}

function compareMarketplaceRepairPreviewWinner(
  left: RepairEvaluatedScene,
  right: RepairEvaluatedScene,
  baselineSceneSignature: string
) {
  const leftTier = getStructuralTierRank(left.structuralStatus)
  const rightTier = getStructuralTierRank(right.structuralStatus)
  if (leftTier !== rightTier) return rightTier - leftTier
  const previewScoreDelta = right.previewScoreTrust.effectiveScore - left.previewScoreTrust.effectiveScore
  const allowMarketplaceCardVisualRerank = shouldUseMarketplaceCardVisualRerank({
    leftFormatKey: left.formatKey,
    rightFormatKey: right.formatKey,
    leftStructuralStatus: left.structuralStatus,
    rightStructuralStatus: right.structuralStatus,
    scoreDelta: previewScoreDelta,
  })
  if (!allowMarketplaceCardVisualRerank && previewScoreDelta !== 0) return previewScoreDelta
  if (left.highStructuralFindingCount !== right.highStructuralFindingCount) {
    return left.highStructuralFindingCount - right.highStructuralFindingCount
  }
  if (left.criticalIssueCount !== right.criticalIssueCount) {
    return left.criticalIssueCount - right.criticalIssueCount
  }
  if (left.highIssueCount !== right.highIssueCount) {
    return left.highIssueCount - right.highIssueCount
  }
  if (allowMarketplaceCardVisualRerank) {
    const visualDelta = getMarketplaceCardVisualDecisionDelta(left.assessment, right.assessment)
    if (visualDelta !== 0) return visualDelta
  }
  if (previewScoreDelta !== 0) return previewScoreDelta
  if (left.structuralFindingCount !== right.structuralFindingCount) {
    return left.structuralFindingCount - right.structuralFindingCount
  }
  if (left.issueCount !== right.issueCount) {
    return left.issueCount - right.issueCount
  }
  const leftMatchesBaseline = left.sceneSignature === baselineSceneSignature
  const rightMatchesBaseline = right.sceneSignature === baselineSceneSignature
  if (leftMatchesBaseline !== rightMatchesBaseline) {
    return leftMatchesBaseline ? 1 : -1
  }
  return 0
}

function isMarketplaceCardNoImageRepairInput(input: {
  formatKey: FormatKey
  assetHint?: AssetHint
  imageUrl?: string
}) {
  return (
    input.formatKey === 'marketplace-card' &&
    !input.imageUrl &&
    !input.assetHint?.imageProfile &&
    !input.assetHint?.enhancedImage
  )
}

function getMarketplaceCardNoImageRepairArchetypeRank(archetype?: StructuralArchetype) {
  switch (archetype) {
    case 'split-vertical':
      return 0
    case 'dense-information':
      return 1
    case 'text-stack':
      return 2
    case 'split-horizontal':
      return 3
    case 'overlay-balanced':
      return 4
    case 'compact-minimal':
      return 5
    case 'image-hero':
      return 6
    default:
      return 99
  }
}

function compareMarketplaceRepairPreviewWinnerEntry(
  left: {
    strategy: RepairStrategy
    candidate: RepairEvaluatedScene
    regenerationCandidate: RepairRegenerationCandidateDiagnostics
  },
  right: {
    strategy: RepairStrategy
    candidate: RepairEvaluatedScene
    regenerationCandidate: RepairRegenerationCandidateDiagnostics
  },
  input: {
    baselineSceneSignature: string
    noImageMode: boolean
  }
) {
  const previewDelta = compareMarketplaceRepairPreviewWinner(
    left.candidate,
    right.candidate,
    input.baselineSceneSignature
  )
  if (previewDelta !== 0) return previewDelta

  if (input.noImageMode) {
    const archetypeDelta =
      getMarketplaceCardNoImageRepairArchetypeRank(left.regenerationCandidate.structuralArchetype) -
      getMarketplaceCardNoImageRepairArchetypeRank(right.regenerationCandidate.structuralArchetype)
    if (archetypeDelta !== 0) return archetypeDelta
  }

  return left.strategy.label.localeCompare(right.strategy.label)
}

function buildMarketplaceRepairSafetyDecision(input: {
  before: RepairEvaluatedScene
  after: RepairEvaluatedScene
  strategy: RepairStrategy
  classification: FailureClassification
  attemptSignature?: string
  knownOutcomeRepeat?: boolean
}) {
  const beforeTier = getStructuralTierRank(input.before.structuralStatus)
  const afterTier = getStructuralTierRank(input.after.structuralStatus)
  const scoreDelta = input.after.scoreTrust.effectiveScore - input.before.scoreTrust.effectiveScore
  const findingDelta = input.before.structuralFindingWeight - input.after.structuralFindingWeight
  const geometryDelta = computeSceneGeometryDelta(input.before.scene, input.after.scene)
  const sameSceneSignature = input.before.sceneSignature === input.after.sceneSignature

  if (input.knownOutcomeRepeat) {
    return {
      accepted: false,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      rejectionReason: 'Repeated weak repair outcome; escalating instead of looping.',
      suppressedAsRepeat: true,
      repeatedWeakOutcome: true,
      attemptSignature: input.attemptSignature,
    } satisfies RepairResult
  }

  if (afterTier < beforeTier) {
    return {
      accepted: false,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      rejectionReason: 'Structural tier worsened.',
      attemptSignature: input.attemptSignature,
    } satisfies RepairResult
  }

  const noOpReasons: string[] = []
  if (sameSceneSignature) noOpReasons.push('same-scene-signature')
  if (geometryDelta < REPAIR_MIN_GEOMETRY_DELTA) noOpReasons.push('negligible-geometry-change')
  if (afterTier === beforeTier) noOpReasons.push('no-structural-gain')
  if (scoreDelta < 1) noOpReasons.push('no-score-gain')
  if (findingDelta <= 0) noOpReasons.push('no-meaningful-finding-reduction')

  if (sameSceneSignature && geometryDelta < REPAIR_MIN_GEOMETRY_DELTA) {
    return {
      accepted: false,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      rejectionReason: 'No-op repair attempt.',
      noOp: true,
      noOpReasons,
      attemptSignature: input.attemptSignature,
    } satisfies RepairResult
  }

  const severeRegression =
    scoreDelta <= -REPAIR_SIGNIFICANT_SCORE_REGRESSION ||
    input.after.highStructuralFindingCount > input.before.highStructuralFindingCount ||
    input.after.unresolvedIssueCount > input.before.unresolvedIssueCount

  if (severeRegression) {
    return {
      accepted: false,
      strategy: input.strategy,
      classification: input.classification,
      beforeStructuralStatus: input.before.structuralStatus,
      afterStructuralStatus: input.after.structuralStatus,
      beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
      afterEffectiveScore: input.after.scoreTrust.effectiveScore,
      scoreDelta,
      findingDelta,
      rejectionReason: 'Repair safety gate blocked a regressive replacement.',
      attemptSignature: input.attemptSignature,
    } satisfies RepairResult
  }

  return {
    accepted: true,
    strategy: input.strategy,
    classification: input.classification,
    beforeStructuralStatus: input.before.structuralStatus,
    afterStructuralStatus: input.after.structuralStatus,
    beforeEffectiveScore: input.before.scoreTrust.effectiveScore,
    afterEffectiveScore: input.after.scoreTrust.effectiveScore,
    scoreDelta,
    findingDelta,
    attemptSignature: input.attemptSignature,
  } satisfies RepairResult
}

function compareMarketplaceCardNoImageAcceptedRepairAttempts(
  left: RepairAttempt,
  right: RepairAttempt,
  baselineSceneSignature: string
) {
  const leftTier = getStructuralTierRank(left.candidate.structuralStatus)
  const rightTier = getStructuralTierRank(right.candidate.structuralStatus)
  if (leftTier !== rightTier) return rightTier - leftTier

  const repairScoreDelta = right.candidate.scoreTrust.effectiveScore - left.candidate.scoreTrust.effectiveScore
  const allowMarketplaceCardVisualRerank = shouldUseMarketplaceCardVisualRerank({
    leftFormatKey: left.candidate.formatKey,
    rightFormatKey: right.candidate.formatKey,
    leftStructuralStatus: left.candidate.structuralStatus,
    rightStructuralStatus: right.candidate.structuralStatus,
    scoreDelta: repairScoreDelta,
  })
  if (!allowMarketplaceCardVisualRerank && repairScoreDelta !== 0) return repairScoreDelta

  if (left.candidate.highStructuralFindingCount !== right.candidate.highStructuralFindingCount) {
    return left.candidate.highStructuralFindingCount - right.candidate.highStructuralFindingCount
  }
  if (left.candidate.criticalIssueCount !== right.candidate.criticalIssueCount) {
    return left.candidate.criticalIssueCount - right.candidate.criticalIssueCount
  }
  if (left.candidate.highIssueCount !== right.candidate.highIssueCount) {
    return left.candidate.highIssueCount - right.candidate.highIssueCount
  }

  const leftMatchesBaseline = left.candidate.sceneSignature === baselineSceneSignature
  const rightMatchesBaseline = right.candidate.sceneSignature === baselineSceneSignature
  if (leftMatchesBaseline !== rightMatchesBaseline) {
    return leftMatchesBaseline ? 1 : -1
  }

  if (allowMarketplaceCardVisualRerank) {
    const visualDelta = getMarketplaceCardVisualDecisionDelta(left.candidate.assessment, right.candidate.assessment)
    if (visualDelta !== 0) return visualDelta
  }

  if (repairScoreDelta !== 0) return repairScoreDelta

  const archetypeDelta =
    getMarketplaceCardNoImageRepairArchetypeRank(left.regenerationCandidate?.structuralArchetype) -
    getMarketplaceCardNoImageRepairArchetypeRank(right.regenerationCandidate?.structuralArchetype)
  if (archetypeDelta !== 0) return archetypeDelta

  if (left.candidate.structuralFindingWeight !== right.candidate.structuralFindingWeight) {
    return left.candidate.structuralFindingWeight - right.candidate.structuralFindingWeight
  }
  if (left.candidate.unresolvedIssueCount !== right.candidate.unresolvedIssueCount) {
    return left.candidate.unresolvedIssueCount - right.candidate.unresolvedIssueCount
  }

  return left.candidate.strategyLabel.localeCompare(right.candidate.strategyLabel)
}

function pickBestAcceptedRepair(
  before: RepairEvaluatedScene,
  attempts: RepairAttempt[],
  options?: {
    formatKey?: FormatKey
    assetHint?: AssetHint
    imageUrl?: string
  }
) {
  const accepted = attempts.filter((attempt) => attempt.decision.accepted)
  if (!accepted.length) return null
  const noImageMarketplaceCard =
    Boolean(options?.formatKey) &&
    isMarketplaceCardNoImageRepairInput({
      formatKey: options!.formatKey!,
      assetHint: options?.assetHint,
      imageUrl: options?.imageUrl,
    })
  if (noImageMarketplaceCard) {
    return [...accepted]
      .sort((left, right) =>
        compareMarketplaceCardNoImageAcceptedRepairAttempts(left, right, before.sceneSignature)
      )[0]
      ?.candidate || before
  }
  return accepted
    .map((attempt) => attempt.candidate)
    .sort(compareRepairEvaluations)[0] || before
}

function createSuppressedRepairAttempt(input: {
  before: RepairEvaluatedScene
  strategy: RepairStrategy
  classification: FailureClassification
  reason: string
  attemptSignature: string
}): RepairAttempt {
  const decision = buildRepairDecision({
    before: input.before,
    after: input.before,
    strategy: input.strategy,
    classification: input.classification,
    attemptSignature: input.attemptSignature,
    suppressAsRepeat: true,
    repeatReason: input.reason,
  })
  return {
    strategy: input.strategy,
    candidate: input.before,
    decision,
    suppressed: true,
  }
}

function recordAttemptArtifacts(input: {
  attempt: RepairAttempt
  failedAttemptSignatures: Set<string>
  seenOutcomeSignatures: Set<string>
}) {
  if (input.attempt.decision.attemptSignature && !input.attempt.decision.accepted) {
    input.failedAttemptSignatures.add(input.attempt.decision.attemptSignature)
  }
  input.seenOutcomeSignatures.add(input.attempt.candidate.sceneSignature)
}

function buildFailureDrivenLocalActions(input: {
  classification: FailureClassification
  assessment: LayoutAssessment
  formatFamily: FormatFamily
  plan: LayoutFixPlan
}) {
  const byFailure: Record<RepairFailureType, FixAction[]> = {
    'overlap-dominant': ['increase-cluster-padding', 'rebalance-text-cluster', 'raise-text-cluster', 'move-logo-to-anchor'],
    'spacing-dominant': ['increase-cluster-padding', 'move-cta-closer-to-text', 'rebalance-text-cluster', 'widen-text-container'],
    'safe-area-dominant': ['rebalance-text-cluster', 'raise-text-cluster', 'move-logo-to-anchor', 'compress-text-region'],
    'text-size-dominant': ['compress-text-region', 'reflow-headline', 'reduce-headline-size', 'widen-text-container', 'improve-line-breaks'],
    'image-dominance-dominant': ['reduce-image-presence', 'rebalance-split-ratio', 'change-image-anchor', 'switch-image-role'],
    'occupancy-dominant': ['reduce-dead-space', 'increase-scale-to-canvas', 'rebalance-split-ratio', 'rebalance-text-cluster'],
    mixed: ['rebalance-text-cluster', 'compress-text-region', 'increase-cluster-padding', 'reflow-headline'],
  }

  return sortActionsByPriority(
    unique([
      ...byFailure[input.classification.dominantType],
      ...planToActions(input.plan, input.formatFamily, 6),
      ...((input.assessment.recommendedFixes || []).slice(0, 4)),
    ])
  )
}

const PERCEPTUAL_REPAIR_ACTIONS: FixAction[] = [
  'rebalance-text-cluster',
  'move-cta-closer-to-text',
  'increase-cta-prominence',
  'increase-cluster-padding',
  'reduce-dead-space',
  'raise-text-cluster',
]

const SPACING_REPAIR_ACTIONS: FixAction[] = [
  'increase-cluster-padding',
  'widen-text-container',
  'compress-text-region',
  'improve-line-breaks',
  'expand-spacing',
  'rebalance-text-cluster',
]

const IMAGE_BALANCE_REPAIR_ACTIONS: FixAction[] = [
  'reduce-image-presence',
  'increase-image-presence',
  'recompute-image-crop',
  'change-image-anchor',
  'change-image-shape',
  'switch-image-role',
  'rebalance-split-ratio',
  'reduce-image-dominance',
  'increase-image-dominance',
]

const REPAIR_ACTION_CONFLICTS: Array<[FixAction, FixAction]> = [
  ['widen-text-container', 'narrow-text-container'],
  ['expand-text-region', 'compress-text-region'],
  ['increase-image-presence', 'reduce-image-presence'],
  ['increase-image-dominance', 'reduce-image-dominance'],
  ['switch-to-text-first', 'switch-to-image-first'],
]

function buildRepairActionSubset(actions: FixAction[], allowed: FixAction[], limit = 4) {
  return sortActionsByPriority(actions.filter((action) => allowed.includes(action))).slice(0, limit)
}

function areRepairActionSetsCompatible(left: FixAction[], right: FixAction[]) {
  const merged = new Set([...left, ...right])
  return REPAIR_ACTION_CONFLICTS.every(([first, second]) => !(merged.has(first) && merged.has(second)))
}

function combineRepairActionSets(left: FixAction[], right: FixAction[], limit = 6) {
  if (!left.length || !right.length) return null
  if (!areRepairActionSetsCompatible(left, right)) return null
  const combined = sortActionsByPriority(unique([...left, ...right]))
  return combined.slice(0, limit)
}

function buildLocalRepairStrategies(input: {
  classification: FailureClassification
  assessment: LayoutAssessment
  formatFamily: FormatFamily
  fixPlan: LayoutFixPlan
  repairConfig: RepairSearchConfig
}): RepairStrategy[] {
  const primaryActions = buildFailureDrivenLocalActions({
    classification: input.classification,
    assessment: input.assessment,
    formatFamily: input.formatFamily,
    plan: input.fixPlan,
  })
    .filter((action) => action !== 'change-layout-family' && action !== 'switch-to-text-first' && action !== 'switch-to-image-first')
    .slice(0, 5)

  const blockActions = unique(
    input.fixPlan.blockFixes
      .slice(0, 2)
      .flatMap((fix) => fix.actions)
      .map((action) => mapPlanActionToFixAction(action, input.formatFamily))
      .filter((action): action is FixAction => Boolean(action))
  )
    .filter((action) => action !== 'change-layout-family')
    .slice(0, 4)

  const actionPool = sortActionsByPriority(
    unique([
      ...primaryActions,
      ...blockActions,
      ...planToActions(input.fixPlan, input.formatFamily, 6),
      ...((input.assessment.recommendedFixes || []).slice(0, 6)),
    ])
  )

  const perceptualActions = buildRepairActionSubset(actionPool, PERCEPTUAL_REPAIR_ACTIONS, 4)
  const spacingActions = buildRepairActionSubset(actionPool, SPACING_REPAIR_ACTIONS, 4)
  const imageActions = buildRepairActionSubset(actionPool, IMAGE_BALANCE_REPAIR_ACTIONS, 4)

  const combinedStrategies = [
    {
      label: 'spacing-plus-perceptual-repair',
      actions: combineRepairActionSets(spacingActions, perceptualActions),
    },
    {
      label: 'image-plus-perceptual-repair',
      actions: combineRepairActionSets(imageActions, perceptualActions),
    },
  ]
    .filter((entry) => entry.actions?.length)
    .slice(0, input.repairConfig.combinationBudget)

  const strategies: RepairStrategy[] = []
  if (primaryActions.length) {
    strategies.push({
      kind: 'local-structural',
      candidateKind: 'local-structural-repair',
      label: 'local-structural-repair',
      reason: `Apply targeted local fixes for ${input.classification.dominantType}.`,
      actions: primaryActions,
      fixStage: 'local',
    })
  }
  if (perceptualActions.length) {
    strategies.push({
      kind: 'local-structural',
      candidateKind: 'perceptual-rebalance-repair',
      label: 'perceptual-rebalance-repair',
      reason: 'Rebalance cluster cohesion, CTA attachment, and empty-space pressure without changing layout family.',
      actions: perceptualActions,
      fixStage: 'regional',
    })
  }
  if (spacingActions.length) {
    strategies.push({
      kind: 'local-structural',
      candidateKind: 'spacing-recovery-repair',
      label: 'spacing-recovery-repair',
      reason: 'Recover breathing room and line discipline when spacing pressure dominates.',
      actions: spacingActions,
      fixStage: 'local',
    })
  }
  if (imageActions.length) {
    strategies.push({
      kind: 'local-structural',
      candidateKind: 'image-balance-repair',
      label: 'image-balance-repair',
      reason: 'Rebalance image footprint against the message cluster without changing template family.',
      actions: imageActions,
      fixStage: 'regional',
    })
  }
  if (blockActions.length) {
    strategies.push({
      kind: 'local-structural',
      candidateKind: 'stronger-local-structural-repair',
      label: 'stronger-local-structural-repair',
      reason: 'Escalate to a stronger block-level repair on the current scene.',
      actions: blockActions,
      fixStage: 'regional',
    })
  }
  for (const combined of combinedStrategies) {
    strategies.push({
      kind: 'local-structural',
      candidateKind: 'combined-repair',
      label: combined.label,
      reason: 'Apply a bounded compatible two-pass repair bundle that combines local fixes without regenerating the layout.',
      actions: combined.actions || [],
      fixStage: 'regional',
    })
  }

  return strategies.slice(0, Math.max(1, input.repairConfig.candidateBudget - MARKETPLACE_CARD_REPAIR_RETAIN_LIMIT))
}

async function materializeRepairAttempt(input: {
  before: RepairEvaluatedScene
  strategy: RepairStrategy
  classification: FailureClassification
  formatKey: FormatKey
  imageAnalysis?: EnhancedImageAnalysis
  compositionModelId?: Variant['compositionModelId']
  failedAttemptSignatures: Set<string>
  seenOutcomeSignatures: Set<string>
}): Promise<RepairAttempt> {
  const attemptSignature = createRepairAttemptSignature({
    beforeSceneSignature: input.before.sceneSignature,
    strategy: input.strategy,
    classification: input.classification,
  })

  if (input.failedAttemptSignatures.has(attemptSignature)) {
    return createSuppressedRepairAttempt({
      before: input.before,
      strategy: input.strategy,
      classification: input.classification,
      reason: `Repeated ${input.strategy.label} was already ineffective on this scene.`,
      attemptSignature,
    })
  }

  const nextScene = applyRepairActionsToScene({
    scene: input.before.scene,
    formatKey: input.formatKey,
    actions: input.strategy.actions || [],
    imageAnalysis: input.imageAnalysis,
    compositionModelId: input.compositionModelId,
  })
  const candidate = await evaluateRepairScene({
    scene: nextScene,
    formatKey: input.formatKey,
    expectedCompositionModelId: input.compositionModelId,
    imageAnalysis: input.imageAnalysis,
    strategyLabel: input.strategy.label,
    actions: input.strategy.actions,
  })

  return {
    strategy: input.strategy,
    candidate,
    decision: buildRepairDecision({
      before: input.before,
      after: candidate,
      strategy: input.strategy,
      classification: input.classification,
      attemptSignature,
      knownOutcomeRepeat:
        input.seenOutcomeSignatures.has(candidate.sceneSignature) &&
        candidate.sceneSignature !== input.before.sceneSignature,
    }),
  }
}

function shouldStartWithLocalRepair(input: {
  assessment: LayoutAssessment
  classification: FailureClassification
}) {
  const structuralStatus = getStructuralStatus(input.assessment)
  if (structuralStatus === 'degraded') return true
  if (structuralStatus === 'valid') return false
  return input.classification.highSeverityFindingCount <= 1 && input.classification.findingCount <= 3
}

function getIntentArchetype(intent: LayoutIntent, formatKey: FormatKey): StructuralArchetype {
  if (intent.structuralArchetype) return intent.structuralArchetype
  const format = FORMAT_MAP[formatKey]
  if (intent.textMode === 'overlay') return 'overlay-balanced'
  if (intent.balanceMode === 'text-dominant') return 'dense-information'
  if (intent.mode === 'image-first' && (intent.imageMode === 'hero' || intent.imageMode === 'background')) return 'image-hero'
  if (format.family === 'portrait' || format.family === 'skyscraper' || intent.textMode === 'cluster-bottom') return 'split-vertical'
  if (format.family === 'wide' || format.family === 'landscape') return 'split-horizontal'
  return 'text-stack'
}

function getDefaultBalanceRegime(archetype: StructuralArchetype): BalanceRegime {
  switch (archetype) {
    case 'text-stack':
      return 'text-first'
    case 'image-hero':
      return 'image-first'
    case 'compact-minimal':
      return 'minimal-copy'
    case 'dense-information':
      return 'dense-copy'
    default:
      return 'balanced'
  }
}

function getDefaultOccupancyMode(archetype: StructuralArchetype): OccupancyMode {
  switch (archetype) {
    case 'image-hero':
      return 'visual-first'
    case 'compact-minimal':
      return 'spacious'
    case 'dense-information':
      return 'text-safe'
    case 'text-stack':
      return 'balanced'
    case 'overlay-balanced':
      return 'text-safe'
    default:
      return 'balanced'
  }
}

function buildIntentStructuralSignature(input: {
  formatKey: FormatKey
  intent: LayoutIntent
  profile?: ContentProfile
}): StructuralSignature {
  const format = FORMAT_MAP[input.formatKey]
  const archetype = getIntentArchetype(input.intent, input.formatKey)
  const flowDirection =
    archetype === 'overlay-balanced'
      ? 'overlay'
      : archetype === 'split-horizontal' || format.family === 'wide' || format.family === 'landscape'
        ? 'horizontal'
        : 'vertical'
  const textZone =
    input.intent.textMode === 'overlay'
      ? 'overlay'
      : input.intent.textMode === 'centered'
        ? 'center'
        : input.intent.textMode === 'cluster-bottom'
          ? 'bottom'
          : input.intent.imageMode === 'split-left'
            ? 'right'
            : 'left'
  const imageZone =
    input.intent.imageMode === 'background'
      ? 'background'
      : input.intent.imageMode === 'hero'
        ? format.family === 'portrait' || format.family === 'square' || archetype === 'split-vertical'
          ? 'top'
          : 'right'
        : input.intent.imageMode === 'split-left'
          ? 'left'
          : input.intent.imageMode === 'split-right'
            ? 'right'
            : 'top'
  const textWeight =
    input.intent.balanceMode === 'text-dominant'
      ? 70
      : archetype === 'dense-information'
        ? 74
        : archetype === 'compact-minimal'
          ? 28
          : input.intent.balanceMode === 'balanced'
            ? 50
            : 34
  const imageWeight =
    input.intent.balanceMode === 'image-dominant'
      ? 72
      : archetype === 'compact-minimal'
        ? 78
        : archetype === 'dense-information'
          ? 34
          : 50

  return {
    archetype,
    flowDirection,
    textZone,
    imageZone,
    textWeight,
    imageWeight,
    overlay: input.intent.textMode === 'overlay' || input.intent.mode === 'overlay',
    balanceRegime: input.intent.balanceRegime || getDefaultBalanceRegime(archetype),
    occupancyMode: input.intent.occupancyMode || getDefaultOccupancyMode(archetype),
  }
}

function buildSceneStructuralSignature(input: {
  scene: Scene
  intent: LayoutIntent
  formatKey: FormatKey
}): StructuralSignature {
  const archetype = getIntentArchetype(input.intent, input.formatKey)
  const textLeft = Math.min(input.scene.title.x || 0, input.scene.subtitle.x || 100, input.scene.cta.x || 100)
  const textBottom = Math.max(
    (input.scene.title.y || 0) + (input.scene.title.h || 0),
    (input.scene.subtitle.y || 0) + (input.scene.subtitle.h || 0),
    (input.scene.cta.y || 0) + (input.scene.cta.h || 0)
  )
  const textTop = Math.min(input.scene.title.y || 100, input.scene.subtitle.y || 100, input.scene.cta.y || 100)
  const textZone =
    input.intent.textMode === 'overlay'
      ? 'overlay'
      : textTop > 54
        ? 'bottom'
        : textLeft > 48
          ? 'right'
          : input.intent.textMode === 'centered'
            ? 'center'
            : 'left'
  const imageZone =
    (input.scene.image.fit || '').includes('slice') && (input.scene.image.w || 0) >= 88
      ? 'background'
      : (input.scene.image.x || 0) <= 12
        ? 'left'
        : (input.scene.image.x || 0) + (input.scene.image.w || 0) >= 84
          ? 'right'
          : (input.scene.image.y || 0) <= 14
            ? 'top'
            : 'center'
  const textWeight = Math.round(((input.scene.title.w || 0) * (input.scene.title.h || 0) + (input.scene.subtitle.w || 0) * (input.scene.subtitle.h || 0)) / 80)
  const imageWeight = Math.round(((input.scene.image.w || 0) * (input.scene.image.h || 0)) / 100)
  return {
    ...buildIntentStructuralSignature({ formatKey: input.formatKey, intent: input.intent }),
    archetype,
    textZone,
    imageZone,
    textWeight,
    imageWeight,
    overlay: input.intent.textMode === 'overlay' || (textZone === 'overlay'),
  }
}

function createStructuralSignatureKey(signature: StructuralSignature) {
  return [
    signature.archetype,
    signature.flowDirection,
    signature.textZone,
    signature.imageZone,
    signature.textWeight,
    signature.imageWeight,
    signature.overlay ? 'overlay' : 'separate',
    signature.balanceRegime,
    signature.occupancyMode,
  ].join('|')
}

function createSceneGeometrySignature(scene: Scene) {
  const round = (value?: number) => Math.round((value || 0) * 10) / 10
  return [
    ['title', round(scene.title.x), round(scene.title.y), round(scene.title.w), round(scene.title.h)].join(':'),
    ['subtitle', round(scene.subtitle.x), round(scene.subtitle.y), round(scene.subtitle.w), round(scene.subtitle.h)].join(':'),
    ['cta', round(scene.cta.x), round(scene.cta.y), round(scene.cta.w), round(scene.cta.h)].join(':'),
    ['logo', round(scene.logo.x), round(scene.logo.y), round(scene.logo.w), round(scene.logo.h)].join(':'),
    ['badge', round(scene.badge.x), round(scene.badge.y), round(scene.badge.w), round(scene.badge.h)].join(':'),
    ['image', round(scene.image.x), round(scene.image.y), round(scene.image.w), round(scene.image.h)].join(':'),
  ].join('|')
}

function applyStructuralArchetypeIntent(input: {
  archetype: StructuralArchetype
  formatKey: FormatKey
  baseIntent: LayoutIntent
  profile: ContentProfile
  goal: Project['goal']
  visualSystem: VisualSystemKey
  imageAnalysis?: EnhancedImageAnalysis
}): Partial<LayoutIntent> {
  const format = FORMAT_MAP[input.formatKey]
  const family = getFormatFamily(format)
  const densityPreset = getFormatDensityPreset({
    format,
    profile: input.profile,
    goal: input.goal,
  })
  const overlayFamily =
    family === 'square'
      ? 'square-hero-overlay'
      : family === 'portrait' || family === 'display-skyscraper'
        ? 'portrait-hero-overlay'
        : family === 'display-rectangle'
          ? 'display-rectangle-image-bg'
          : family === 'billboard' || family === 'display-leaderboard'
            ? 'billboard-wide-hero'
            : family === 'presentation'
              ? 'presentation-clean-hero'
              : input.baseIntent.family
  const textFirstFamily =
    family === 'square'
      ? 'square-image-top-text-bottom'
      : family === 'portrait' || family === 'display-skyscraper' || family === 'flyer' || family === 'poster'
        ? 'portrait-bottom-card'
        : family === 'billboard' || family === 'display-leaderboard'
          ? 'billboard-wide-balanced'
          : family === 'presentation'
            ? 'presentation-structured-cover'
            : family === 'display-rectangle'
              ? 'display-rectangle-balanced'
              : 'landscape-text-left-image-right'
  const splitFamily =
    family === 'billboard' || family === 'display-leaderboard'
      ? 'leaderboard-compact-horizontal'
      : family === 'presentation'
        ? 'presentation-structured-cover'
        : family === 'display-rectangle'
          ? 'display-rectangle-balanced'
          : family === 'square'
            ? 'square-image-top-text-bottom'
            : family === 'portrait' || family === 'display-skyscraper'
              ? 'portrait-bottom-card'
              : 'landscape-balanced-split'
  const compactFamily =
    family === 'square'
      ? 'square-image-top-text-bottom'
      : family === 'portrait' || family === 'display-skyscraper' || family === 'flyer' || family === 'poster'
        ? 'portrait-bottom-card'
        : family === 'billboard' || family === 'display-leaderboard'
          ? 'leaderboard-compact-horizontal'
          : family === 'presentation'
            ? 'presentation-structured-cover'
            : family === 'display-rectangle'
              ? 'display-rectangle-balanced'
              : 'landscape-balanced-split'

  if (input.archetype === 'image-hero') {
    return {
      family: overlayFamily,
      presetId: overlayFamily,
      structuralArchetype: 'image-hero',
      balanceRegime: 'image-first',
      occupancyMode: 'visual-first',
      imageMode: family === 'display-rectangle' || family === 'portrait' ? 'background' : 'hero',
      textMode: family === 'landscape' || family === 'display-leaderboard' || family === 'billboard' ? 'overlay' : family === 'square' ? 'cluster-bottom' : 'overlay',
      balanceMode: 'image-dominant',
      mode: family === 'display-rectangle' || family === 'portrait' ? 'overlay' : 'image-first',
    }
  }
  if (input.archetype === 'text-stack') {
    return {
      family: textFirstFamily,
      presetId: textFirstFamily,
      structuralArchetype: 'text-stack',
      balanceRegime: 'text-first',
      occupancyMode: 'balanced',
      imageMode: family === 'portrait' || family === 'display-skyscraper' ? 'framed' : 'split-right',
      textMode: family === 'square' || family === 'portrait' || family === 'display-skyscraper' ? 'cluster-bottom' : 'cluster-left',
      balanceMode: 'text-dominant',
      mode: 'text-first',
    }
  }
  if (input.archetype === 'split-vertical') {
    return {
      family: family === 'square' ? 'square-image-top-text-bottom' : family === 'portrait' || family === 'display-skyscraper' ? 'portrait-bottom-card' : splitFamily,
      presetId: family === 'square' ? 'square-image-top-text-bottom' : family === 'portrait' || family === 'display-skyscraper' ? 'portrait-bottom-card' : splitFamily,
      structuralArchetype: 'split-vertical',
      balanceRegime: input.profile.density === 'dense' ? 'dense-copy' : 'balanced',
      occupancyMode: input.goal === 'retail-flyer' ? 'compact' : 'balanced',
      imageMode: family === 'portrait' || family === 'display-skyscraper' ? 'framed' : 'hero',
      textMode: 'cluster-bottom',
      balanceMode: input.profile.density === 'dense' ? 'text-dominant' : 'balanced',
      mode: 'text-first',
    }
  }
  if (input.archetype === 'split-horizontal') {
    return {
      family: splitFamily,
      presetId: splitFamily,
      structuralArchetype: 'split-horizontal',
      balanceRegime: 'balanced',
      occupancyMode: family === 'billboard' || family === 'display-leaderboard' ? 'compact' : 'balanced',
      imageMode: input.imageAnalysis?.focalPoint.x && input.imageAnalysis.focalPoint.x < 42 ? 'split-left' : 'split-right',
      textMode: 'cluster-left',
      balanceMode: 'balanced',
      mode: 'split',
    }
  }
  if (input.archetype === 'overlay-balanced') {
    return {
      family: overlayFamily,
      presetId: overlayFamily,
      structuralArchetype: 'overlay-balanced',
      balanceRegime: 'balanced',
      occupancyMode: 'text-safe',
      imageMode: family === 'portrait' || family === 'display-rectangle' ? 'background' : 'hero',
      textMode: 'overlay',
      balanceMode: 'balanced',
      mode: 'overlay',
    }
  }
  if (input.archetype === 'compact-minimal') {
    const saferCompact =
      format.category === 'marketplace' ||
      format.category === 'print' ||
      family === 'display-rectangle' ||
      family === 'display-leaderboard' ||
      family === 'billboard'
    return {
      family: saferCompact ? compactFamily : overlayFamily,
      presetId: saferCompact ? compactFamily : overlayFamily,
      structuralArchetype: 'compact-minimal',
      balanceRegime: 'minimal-copy',
      occupancyMode: format.category === 'marketplace' || densityPreset === 'minimal-copy' ? 'text-safe' : 'spacious',
      imageMode:
        saferCompact
          ? family === 'portrait' || family === 'display-skyscraper' ? 'framed' : family === 'square' ? 'framed' : 'split-right'
          : family === 'portrait' ? 'background' : 'hero',
      textMode:
        family === 'square' || family === 'portrait' || family === 'display-skyscraper'
          ? 'cluster-bottom'
          : 'cluster-left',
      balanceMode: saferCompact ? 'balanced' : 'image-dominant',
      mode: saferCompact ? (family === 'portrait' || family === 'square' ? 'text-first' : 'split') : family === 'portrait' ? 'overlay' : 'image-first',
    }
  }
  return {
    family: textFirstFamily,
    presetId: textFirstFamily,
    structuralArchetype: 'dense-information',
    balanceRegime: 'dense-copy',
    occupancyMode: 'text-safe',
    imageMode: family === 'portrait' || family === 'display-skyscraper' ? 'framed' : 'split-right',
    textMode: family === 'presentation' ? 'centered' : family === 'square' || family === 'portrait' ? 'cluster-bottom' : 'cluster-left',
    balanceMode: 'text-dominant',
    mode: 'text-first',
  }
}

function rankStructuralArchetypes(input: {
  formatKey: FormatKey
  profile: ContentProfile
  baseIntent: LayoutIntent
  goal: Project['goal']
  visualSystem: VisualSystemKey
  imageAnalysis?: EnhancedImageAnalysis
  failureType?: RepairFailureType
}) {
  const format = FORMAT_MAP[input.formatKey]
  const score = new Map<StructuralArchetype, number>([
    ['text-stack', 0],
    ['image-hero', 0],
    ['split-vertical', 0],
    ['split-horizontal', 0],
    ['overlay-balanced', 0],
    ['compact-minimal', 0],
    ['dense-information', 0],
  ])
  const add = (archetype: StructuralArchetype, value: number) => score.set(archetype, (score.get(archetype) || 0) + value)
  const formatRank = getFormatArchetypeRanking({
    format,
    profile: input.profile,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageProfile: input.imageAnalysis?.imageProfile,
  })
  const weakArchetypes = new Set(getFormatWeakArchetypes(format))
  const balanceDefaults = getFormatBalanceDefaults({
    format,
    profile: input.profile,
    goal: input.goal,
  })
  formatRank.forEach((archetype, index) => add(archetype, Math.max(0, 12 - index * 3)))
  weakArchetypes.forEach((archetype) => add(archetype, -6))
  const baseArchetype = getIntentArchetype(input.baseIntent, input.formatKey)
  add(baseArchetype, 5)

  if (format.family === 'wide' || format.family === 'landscape') add('split-horizontal', 4)
  if (format.family === 'square' || format.family === 'portrait' || format.family === 'printPortrait' || format.family === 'skyscraper') add('split-vertical', 4)
  if (format.category === 'presentation') add('dense-information', 4)
  if (format.category === 'marketplace') add('compact-minimal', 4)
  if (format.category === 'display') add('image-hero', format.key === 'display-billboard' ? 3 : 1)
  if (input.profile.density === 'dense' || input.goal === 'retail-flyer') add('dense-information', 5)
  if (input.profile.preferredMessageMode === 'image-first') add('image-hero', 5)
  if (input.profile.preferredMessageMode === 'text-first') add('text-stack', 4)
  if (input.profile.subtitleLength === 0 && input.profile.badgeLength === 0) add('compact-minimal', 4)
  if (input.visualSystem === 'minimal' || input.visualSystem === 'luxury-clean') add('compact-minimal', 2)
  if (input.imageAnalysis?.imageProfile === 'ultraWide') add('split-horizontal', 3)
  if (input.imageAnalysis?.imageProfile === 'portrait' || input.imageAnalysis?.imageProfile === 'tall') add('split-vertical', 3)
  if (balanceDefaults.balanceRegime === 'text-first' || balanceDefaults.balanceRegime === 'dense-copy') {
    add('dense-information', 3)
    add('compact-minimal', format.category === 'marketplace' ? 2 : 0)
    add('image-hero', -3)
  }
  if (balanceDefaults.balanceRegime === 'minimal-copy') {
    add('compact-minimal', 4)
    add('dense-information', 1)
    add('text-stack', -3)
  }
  if (balanceDefaults.balanceRegime === 'image-first') {
    add('image-hero', 3)
    add('compact-minimal', -1)
  }

  switch (input.failureType) {
    case 'overlap-dominant':
    case 'spacing-dominant':
    case 'safe-area-dominant':
      add('dense-information', 4)
      add('split-horizontal', 3)
      add('split-vertical', 3)
      add('overlay-balanced', -3)
      break
    case 'text-size-dominant':
      add('dense-information', 5)
      add('text-stack', 4)
      add('compact-minimal', -2)
      break
    case 'image-dominance-dominant':
      add('text-stack', 5)
      add('dense-information', 4)
      add('image-hero', -4)
      break
    case 'occupancy-dominant':
      add('split-horizontal', 4)
      add('split-vertical', 4)
      add('compact-minimal', 2)
      break
    case 'mixed':
      add('split-horizontal', 2)
      add('split-vertical', 2)
      add('dense-information', 2)
      add('overlay-balanced', 2)
      break
  }

  return [...score.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
    .map(([archetype]) => archetype)
}

function buildGuidedRepairStrategies(input: {
  formatKey: FormatKey
  formatFamily: FormatFamily
  baseIntent: LayoutIntent
  profile: ContentProfile
  goal: Project['goal']
  visualSystem: VisualSystemKey
  imageAnalysis?: EnhancedImageAnalysis
  classification: FailureClassification
  preferredAlternativeFamily?: LayoutIntentFamily
  forceImageFootprintRecovery?: boolean
}) {
  const rankedArchetypes = rankStructuralArchetypes({
    formatKey: input.formatKey,
    profile: input.profile,
    baseIntent: input.baseIntent,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageAnalysis: input.imageAnalysis,
    failureType: input.classification.dominantType,
  }).filter((archetype) => archetype !== getIntentArchetype(input.baseIntent, input.formatKey))

  const strategies: RepairStrategy[] = []
  if (input.forceImageFootprintRecovery) {
    const alternativeIntent = getAlternativeIntent(
      input.baseIntent,
      input.formatKey,
      input.formatFamily,
      input.preferredAlternativeFamily
    )
    const baseImageMode = input.baseIntent.imageMode
    const fallbackImageMode =
      baseImageMode === 'background'
        ? 'framed'
        : baseImageMode === 'framed'
          ? 'background'
          : baseImageMode === 'hero'
            ? 'split-right'
            : 'hero'
    const recoveredImageMode = (alternativeIntent.imageMode || fallbackImageMode) as LayoutIntent['imageMode']
    const recoveryMode: LayoutIntent['mode'] =
      recoveredImageMode === 'background'
        ? 'overlay'
        : recoveredImageMode === 'hero'
          ? 'image-first'
          : 'split'
    strategies.push({
      kind: 'structural-regeneration',
      candidateKind: 'guided-regeneration-repair',
      label: 'guided-image-footprint-regeneration',
      reason: 'Force a structurally different image-mode regeneration when footprint coverage drifts out of range.',
      actions:
        recoveryMode === 'image-first'
          ? ['change-layout-family', 'switch-to-image-first']
          : ['change-layout-family'],
      fixStage: 'structural',
      overrideIntent: {
        ...alternativeIntent,
        imageMode: recoveredImageMode,
        mode: recoveryMode,
      },
    })
  }
  rankedArchetypes.slice(0, 3).forEach((archetype, index) => {
    const overrideIntent = applyStructuralArchetypeIntent({
      archetype,
      formatKey: input.formatKey,
      baseIntent: input.baseIntent,
      profile: input.profile,
      goal: input.goal,
      visualSystem: input.visualSystem,
      imageAnalysis: input.imageAnalysis,
    })
    strategies.push({
      kind: 'structural-regeneration',
      candidateKind: 'guided-regeneration-repair',
      label: `${index === 0 ? 'guided' : 'guided-stronger'}-${archetype}-regeneration`,
      reason: `Use structurally different ${archetype} composition to escape ${input.classification.dominantType}.`,
      actions:
        archetype === 'dense-information' || archetype === 'text-stack'
          ? ['change-layout-family', 'switch-to-text-first']
          : archetype === 'image-hero'
            ? ['change-layout-family', 'switch-to-image-first']
            : ['change-layout-family'],
      fixStage:
        archetype === 'dense-information' || archetype === 'overlay-balanced' || index > 0
          ? 'structural'
          : 'regional',
      overrideIntent,
    })
  })

  if (!strategies.length) {
    const alternativeIntent = getAlternativeIntent(
      input.baseIntent,
      input.formatKey,
      input.formatFamily,
      input.preferredAlternativeFamily
    )
    strategies.push({
      kind: 'structural-regeneration',
      candidateKind: 'guided-regeneration-repair',
      label: 'guided-fallback-regeneration',
      reason: 'Fallback to alternative family when no stronger archetype is available.',
      actions: ['change-layout-family'],
      fixStage: 'structural',
      overrideIntent: alternativeIntent,
    })
  }

  return strategies.filter((strategy, index, all) => {
    const signature = JSON.stringify({
      kind: strategy.kind,
      fixStage: strategy.fixStage,
      actions: strategy.actions,
      overrideIntent: strategy.overrideIntent || {},
    })
    return all.findIndex((candidate) => JSON.stringify({
      kind: candidate.kind,
      fixStage: candidate.fixStage,
      actions: candidate.actions,
      overrideIntent: candidate.overrideIntent || {},
    }) === signature) === index
  }).slice(0, 3)
}

function logRepairAttemptSummary(input: {
  formatKey: FormatKey
  before: RepairEvaluatedScene
  classification: FailureClassification
  attempts: RepairAttempt[]
  selected: RepairEvaluatedScene
  escalated: boolean
}) {
  if (!import.meta.env.DEV) return
  const repairDebugEnv =
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.REPAIR_DEBUG
  if (repairDebugEnv === '0') return
  console.groupCollapsed(`[layout] repair ${input.formatKey}`)
  console.info({
    initialStructuralState: input.before.structuralStatus,
    dominantFailureType: input.classification.dominantType,
    escalationOccurred: input.escalated,
    suppressedAttempts: input.attempts.filter((attempt) => attempt.suppressed || attempt.decision.suppressedAsRepeat).length,
    noOpAttempts: input.attempts.filter((attempt) => attempt.decision.noOp).length,
  })
  console.table([
    {
      phase: 'before',
      strategy: 'current',
      structuralState: input.before.structuralStatus,
      effectiveScore: input.before.scoreTrust.effectiveScore,
      findings: input.before.structuralFindingWeight,
      accepted: true,
      reason: input.classification.dominantType,
    },
    ...input.attempts.map((attempt) => ({
      phase: 'attempt',
      strategy: attempt.strategy.label,
      structuralState: attempt.candidate.structuralStatus,
      effectiveScore: attempt.candidate.scoreTrust.effectiveScore,
      findings: attempt.candidate.structuralFindingWeight,
      accepted: attempt.decision.accepted,
      reason: attempt.decision.rejectionReason || attempt.strategy.reason,
      suppressed: Boolean(attempt.suppressed || attempt.decision.suppressedAsRepeat),
      noOp: Boolean(attempt.decision.noOp),
    })),
    {
      phase: 'selected',
      strategy: input.selected.strategyLabel,
      structuralState: input.selected.structuralStatus,
      effectiveScore: input.selected.scoreTrust.effectiveScore,
      findings: input.selected.structuralFindingWeight,
      accepted: true,
      reason: input.classification.dominantType,
    },
  ])
  console.groupEnd()
}

function normalizePreviewIntent(input: {
  formatKey: FormatKey
  baseIntent: LayoutIntent
  profile: ContentProfile
  goal?: Project['goal']
  visualSystem?: VisualSystemKey
  imageAnalysis?: EnhancedImageAnalysis
  override?: Partial<LayoutIntent>
}) {
  const format = FORMAT_MAP[input.formatKey]
  const explicitOverride = input.override || {}
  const merged = { ...input.baseIntent, ...explicitOverride }
  if (
    isMarketplaceLayoutV2Enabled() &&
    merged.marketplaceLayoutEngine === 'v2-slot' &&
    (input.formatKey === 'marketplace-card' || input.formatKey === 'marketplace-tile')
  ) {
    const arch = explicitOverride.marketplaceV2Archetype || merged.marketplaceV2Archetype
    const family: LayoutIntent['family'] =
      input.formatKey === 'marketplace-card' ? 'square-image-top-text-bottom' : 'landscape-balanced-split'
    return {
      ...input.baseIntent,
      ...explicitOverride,
      ...merged,
      marketplaceLayoutEngine: 'v2-slot',
      marketplaceV2Archetype: arch,
      family,
      presetId: family,
      marketplaceTemplateId: undefined,
      marketplaceTemplateZones: undefined,
      marketplaceTemplateSelection: undefined,
      marketplaceTemplateSummary: undefined,
      marketplaceTemplateVariant: undefined,
      compositionModelId: undefined,
      structuralArchetype: merged.structuralArchetype,
      balanceRegime: merged.balanceRegime || 'balanced',
      occupancyMode: merged.occupancyMode || 'balanced',
    } satisfies LayoutIntent
  }
  const structuralArchetype =
    explicitOverride.structuralArchetype || merged.structuralArchetype || getIntentArchetype(merged, input.formatKey)
  const archetypeIntent = applyStructuralArchetypeIntent({
    archetype: structuralArchetype,
    formatKey: input.formatKey,
    baseIntent: merged,
    profile: input.profile,
    goal: input.goal || 'promo-pack',
    visualSystem: input.visualSystem || 'bold-promo',
    imageAnalysis: input.imageAnalysis,
  })
  const withArchetype = {
    ...merged,
    ...archetypeIntent,
    ...explicitOverride,
    structuralArchetype,
    balanceRegime:
      explicitOverride.balanceRegime ||
      merged.balanceRegime ||
      archetypeIntent.balanceRegime ||
      getDefaultBalanceRegime(structuralArchetype),
    occupancyMode:
      explicitOverride.occupancyMode ||
      merged.occupancyMode ||
      archetypeIntent.occupancyMode ||
      getDefaultOccupancyMode(structuralArchetype),
  }
  const requestedFamily = resolveAllowedFamily(input.formatKey, withArchetype.family || input.baseIntent.family)
  const explicitModel = withArchetype.compositionModelId ? getCompositionModel(format, withArchetype.compositionModelId) : null
  const selectedModel =
    explicitModel ||
    selectCompositionModel({
      format,
      requestedModelId: withArchetype.compositionModelId,
      requestedFamily,
      denseText: input.profile.density === 'dense',
    })
  const family = selectedModel ? resolveCompositionModelFamily(selectedModel.id) : requestedFamily

  return {
    ...input.baseIntent,
    ...withArchetype,
    family,
    presetId: family,
    compositionModelId: selectedModel?.id || withArchetype.compositionModelId,
    structuralArchetype,
    balanceRegime: withArchetype.balanceRegime || getDefaultBalanceRegime(structuralArchetype),
    occupancyMode: withArchetype.occupancyMode || getDefaultOccupancyMode(structuralArchetype),
  }
}

function shouldAddRegionalCandidate(formatKey: FormatKey, profile: ContentProfile) {
  const format = FORMAT_MAP[formatKey]
  return (
    profile.density === 'dense' ||
    format.category === 'display' ||
    format.category === 'print' ||
    format.category === 'presentation' ||
    format.family === 'portrait' ||
    format.family === 'skyscraper' ||
    format.family === 'wide' ||
    format.family === 'printPortrait'
  )
}

function isPrimaryGenerationRecoveryFormat(formatKey: FormatKey) {
  return PRIMARY_GENERATION_RECOVERY_FORMATS.has(formatKey)
}

function supportsPrimaryStructuralEscalation(formatKey: FormatKey) {
  return PRIMARY_STRUCTURAL_ESCALATION_FORMATS.has(formatKey)
}

function supportsPrimaryFinalQualityGate(formatKey: FormatKey) {
  return isPrimaryGenerationRecoveryFormat(formatKey)
}

function countPrimaryFinalCriticalFindings(assessment: LayoutAssessment) {
  return (assessment.structuralState?.findings || []).filter(
    (finding) => finding.severity === 'high' && PRIMARY_FINAL_QUALITY_FINDINGS.has(finding.name)
  ).length
}

function getPrimaryFinalStructuralPenalty(assessment: LayoutAssessment) {
  return (assessment.structuralState?.findings || []).reduce((sum, finding) => {
    const severityWeight = finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1
    const findingWeight =
      finding.name === 'major-overlap'
        ? 100
        : finding.name === 'minimum-spacing'
          ? 70
          : finding.name === 'safe-area-compliance'
            ? 55
            : finding.name === 'role-placement'
              ? 45
              : finding.name === 'text-size-sanity'
                ? 28
                : finding.name === 'image-dominance-sanity'
                  ? 18
                  : 12
    return sum + severityWeight * findingWeight
  }, 0)
}

type PrimaryFinalizationState = {
  scene: Scene
  assessment: LayoutAssessment
  scoreTrust: ScoreTrust
  strategyLabel: string
  reselectionApplied: boolean
  compositionModelId?: Variant['compositionModelId']
  intent: LayoutIntent
}

function isBetterPrimaryFinalizationState(candidate: PrimaryFinalizationState, current: PrimaryFinalizationState) {
  const candidateStatusRank = getStructuralTierRank(candidate.assessment.structuralState?.status || 'invalid')
  const currentStatusRank = getStructuralTierRank(current.assessment.structuralState?.status || 'invalid')
  if (candidateStatusRank !== currentStatusRank) return candidateStatusRank > currentStatusRank

  const candidateCriticalFindings = countPrimaryFinalCriticalFindings(candidate.assessment)
  const currentCriticalFindings = countPrimaryFinalCriticalFindings(current.assessment)
  if (candidateCriticalFindings !== currentCriticalFindings) return candidateCriticalFindings < currentCriticalFindings

  const candidateHighFindings = countHighStructuralFindings(candidate.assessment)
  const currentHighFindings = countHighStructuralFindings(current.assessment)
  if (candidateHighFindings !== currentHighFindings) return candidateHighFindings < currentHighFindings

  const candidateUnresolved = unresolvedIssueCount(candidate.assessment.issues)
  const currentUnresolved = unresolvedIssueCount(current.assessment.issues)
  if (candidateUnresolved !== currentUnresolved) return candidateUnresolved < currentUnresolved

  const candidatePenalty = getPrimaryFinalStructuralPenalty(candidate.assessment)
  const currentPenalty = getPrimaryFinalStructuralPenalty(current.assessment)
  if (candidatePenalty !== currentPenalty) return candidatePenalty < currentPenalty

  return candidate.scoreTrust.effectiveScore > current.scoreTrust.effectiveScore
}

function shouldConsiderPrimaryFinalizationAlternative(
  candidate: PreviewCandidateEvaluation,
  current: PrimaryFinalizationState,
  selected: PreviewCandidateEvaluation
) {
  if (candidate.id === selected.id) return false

  const candidateStructuralKey = createStructuralSignatureKey(candidate.structuralSignature)
  const selectedStructuralKey = createStructuralSignatureKey(selected.structuralSignature)
  if (candidateStructuralKey === selectedStructuralKey) {
    const candidateGeometryKey = createSceneGeometrySignature(candidate.scene)
    const selectedGeometryKey = createSceneGeometrySignature(selected.scene)
    if (candidateGeometryKey === selectedGeometryKey) return false
  }

  const candidateStatusRank = getStructuralTierRank(candidate.assessment.structuralState?.status || 'invalid')
  const currentStatusRank = getStructuralTierRank(current.assessment.structuralState?.status || 'invalid')
  if (candidateStatusRank > currentStatusRank) return true

  if (countPrimaryFinalCriticalFindings(candidate.assessment) < countPrimaryFinalCriticalFindings(current.assessment)) {
    return true
  }

  if (countHighStructuralFindings(candidate.assessment) < countHighStructuralFindings(current.assessment)) {
    return true
  }

  return getPrimaryFinalStructuralPenalty(candidate.assessment) < getPrimaryFinalStructuralPenalty(current.assessment)
}

function shouldRunPrimaryFinalizationReselection(assessment: LayoutAssessment) {
  return (
    (assessment.structuralState?.status || 'invalid') === 'invalid' &&
    (
      countPrimaryFinalCriticalFindings(assessment) > 0 ||
      countHighStructuralFindings(assessment) > 0 ||
      unresolvedIssueCount(assessment.issues) > 0
    )
  )
}

function finalizePrimarySelectedOutcomeSync(input: {
  formatKey: FormatKey
  selection: PreviewCandidateSelection
  currentScene: Scene
  currentAssessment: LayoutAssessment
  currentScoreTrust: ScoreTrust
  imageAnalysis?: EnhancedImageAnalysis
  escalationContext?: AutoFixStructuralEscalationContext
}): PrimaryFinalizationState {
  const current: PrimaryFinalizationState = {
    scene: input.currentScene,
    assessment: input.currentAssessment,
    scoreTrust: input.currentScoreTrust,
    strategyLabel: input.selection.selected.strategyLabel,
    reselectionApplied: false,
    compositionModelId: input.selection.selected.intent.compositionModelId,
    intent: input.selection.selected.intent,
  }

  if (!supportsPrimaryFinalQualityGate(input.formatKey) || !shouldRunPrimaryFinalizationReselection(current.assessment)) {
    return current
  }

  let best = current
  const alternatives = input.selection.candidates
    .filter((candidate) => candidate.id !== input.selection.selected.id)
    .filter((candidate) => shouldConsiderPrimaryFinalizationAlternative(candidate, best, input.selection.selected))
    .slice(0, 3)

  for (const candidate of alternatives) {
    const repairedScene = runAutoFix(
      candidate.scene,
      input.formatKey,
      candidate.assessment,
      input.imageAnalysis,
      candidate.intent.compositionModelId,
      input.escalationContext,
      false
    )
    const repairedAssessment = getFormatAssessment(
      input.formatKey,
      repairedScene,
      candidate.intent.compositionModelId,
      input.imageAnalysis
    )
    const repairedTrust = computeScoreTrust(repairedAssessment)
    const alternative: PrimaryFinalizationState = {
      scene: repairedScene,
      assessment: repairedAssessment,
      scoreTrust: repairedTrust,
      strategyLabel: `repair-aware:${candidate.strategyLabel}`,
      reselectionApplied: true,
      compositionModelId: candidate.intent.compositionModelId,
      intent: candidate.intent,
    }

    if (isBetterPrimaryFinalizationState(alternative, best)) {
      best = alternative
    }
  }

  return best
}

function buildPrimaryRecoveryPreviewVariants(input: {
  formatKey: FormatKey
  baseIntent: LayoutIntent
  profile: ContentProfile
  goal: Project['goal']
  visualSystem: VisualSystemKey
  imageAnalysis?: EnhancedImageAnalysis
}): Array<{
  id: string
  strategyLabel: string
  fixStage: PreviewCandidatePlan['fixStage']
  override: Partial<LayoutIntent>
  selectionReason: string
}> {
  if (!isPrimaryGenerationRecoveryFormat(input.formatKey)) return []

  const variants: Array<{
    id: string
    strategyLabel: string
    fixStage: PreviewCandidatePlan['fixStage']
    override: Partial<LayoutIntent>
    selectionReason: string
  }> = []

  if (input.formatKey === 'social-square') {
    variants.push(
      {
        id: 'square-safe-split',
        strategyLabel: 'recovery-square-safe-split',
        fixStage: 'regional',
        override: {
          structuralArchetype: 'split-vertical',
          family: 'square-image-top-text-bottom',
          compositionModelId: 'square-balanced-card',
          imageMode: 'framed',
          textMode: 'cluster-bottom',
          mode: 'text-first',
          balanceRegime: 'balanced',
          occupancyMode: 'text-safe',
        },
        selectionReason: 'primary recovery square safer split with explicit CTA lane',
      },
      {
        id: 'square-compact-cta-lane',
        strategyLabel: 'recovery-square-compact-cta-lane',
        fixStage: 'structural',
        override: {
          structuralArchetype: 'compact-minimal',
          family: 'square-image-top-text-bottom',
          compositionModelId: 'square-balanced-card',
          imageMode: 'framed',
          textMode: 'cluster-bottom',
          mode: 'text-first',
          balanceRegime: 'minimal-copy',
          occupancyMode: 'text-safe',
        },
        selectionReason: 'primary recovery square compact CTA-lane variant',
      }
    )
  } else if (input.formatKey === 'social-portrait') {
    variants.push(
      {
        id: 'portrait-safe-card',
        strategyLabel: 'recovery-portrait-safe-card',
        fixStage: 'regional',
        override: {
          structuralArchetype: 'split-vertical',
          family: 'portrait-bottom-card',
          imageMode: 'framed',
          textMode: 'cluster-bottom',
          mode: 'text-first',
          balanceRegime: 'balanced',
          occupancyMode: 'text-safe',
        },
        selectionReason: 'primary recovery portrait safer bottom-card composition',
      },
      {
        id: 'portrait-compact-copy',
        strategyLabel: 'recovery-portrait-compact-copy',
        fixStage: 'structural',
        override: {
          structuralArchetype: 'compact-minimal',
          family: 'portrait-bottom-card',
          imageMode: 'framed',
          textMode: 'cluster-bottom',
          mode: 'text-first',
          balanceRegime: 'minimal-copy',
          occupancyMode: 'text-safe',
        },
        selectionReason: 'primary recovery portrait compact copy with protected CTA lane',
      }
    )
  } else if (input.formatKey === 'social-landscape') {
    variants.push(
      {
        id: 'landscape-strong-split',
        strategyLabel: 'recovery-landscape-strong-split',
        fixStage: 'regional',
        override: {
          structuralArchetype: 'split-horizontal',
          family: 'landscape-balanced-split',
          imageMode: 'split-right',
          textMode: 'cluster-left',
          mode: 'split',
          balanceRegime: 'balanced',
          occupancyMode: 'text-safe',
        },
        selectionReason: 'primary recovery landscape stronger split with safer text region',
      },
      {
        id: 'landscape-compact-safe',
        strategyLabel: 'recovery-landscape-compact-safe',
        fixStage: 'structural',
        override: {
          structuralArchetype: 'compact-minimal',
          family: 'landscape-text-left-image-right',
          imageMode: 'split-right',
          textMode: 'cluster-left',
          mode: 'text-first',
          balanceRegime: 'minimal-copy',
          occupancyMode: 'text-safe',
        },
        selectionReason: 'primary recovery landscape compact safe split',
      }
    )
  } else if (input.formatKey === 'display-mpu' || input.formatKey === 'display-large-rect') {
    variants.push(
      {
        id: 'display-balanced-safe',
        strategyLabel: 'recovery-display-balanced-safe',
        fixStage: 'regional',
        override: {
          structuralArchetype: 'split-horizontal',
          family: 'display-rectangle-balanced',
          imageMode: 'split-right',
          textMode: 'cluster-left',
          mode: 'split',
          balanceRegime: 'balanced',
          occupancyMode: 'text-safe',
        },
        selectionReason: 'primary recovery display balanced split with stronger CTA lane',
      },
      {
        id: 'display-compact-safe',
        strategyLabel: 'recovery-display-compact-safe',
        fixStage: 'structural',
        override: {
          structuralArchetype: 'compact-minimal',
          family: 'display-rectangle-balanced',
          imageMode: 'split-right',
          textMode: 'cluster-left',
          mode: 'text-first',
          balanceRegime: 'minimal-copy',
          occupancyMode: 'text-safe',
        },
        selectionReason: 'primary recovery display compact safe rectangle',
      }
    )
  }

  return variants
}

function getDefaultPreviewCandidateBudget(formatKey: FormatKey) {
  if (formatKey === 'marketplace-card') return MARKETPLACE_CARD_PREVIEW_CANDIDATE_BUDGET
  if (isPrimaryGenerationRecoveryFormat(formatKey)) return PREVIEW_CANDIDATE_BUDGET + 1
  return PREVIEW_CANDIDATE_BUDGET
}

function shouldUseExpandedPreviewPlanning(formatKey: FormatKey, includeExtendedDiagnostics?: boolean) {
  return includeExtendedDiagnostics || formatKey === 'marketplace-card'
}

function createPreviewPlanVariantKey(plan: PreviewCandidatePlan) {
  return [
    plan.fixStage,
    plan.intent.family,
    plan.intent.compositionModelId || '',
    plan.intent.imageMode,
    plan.intent.textMode,
    plan.intent.mode,
    plan.intent.balanceMode,
    plan.intent.balanceRegime || '',
    plan.intent.occupancyMode || '',
  ].join('|')
}

function buildMarketplaceCardGeometryProbeOverrides(input: {
  intent: LayoutIntent
}): Array<{
  id: string
  override: Partial<LayoutIntent>
}> {
  const probes: Array<{
    id: string
    override: Partial<LayoutIntent>
  }> = []

  if (
    input.intent.structuralArchetype !== 'split-vertical' ||
    input.intent.textMode !== 'centered' ||
    input.intent.imageMode !== 'framed'
  ) {
    probes.push({
      id: 'centered-split-vertical',
      override: {
        structuralArchetype: 'split-vertical',
        family: 'square-image-top-text-bottom',
        compositionModelId: 'square-balanced-card',
        imageMode: 'framed',
        textMode: 'centered',
        mode: 'text-first',
        balanceRegime: 'balanced',
        occupancyMode: 'text-safe',
      },
    })
  }

  if (
    input.intent.structuralArchetype !== 'split-vertical' ||
    input.intent.textMode !== 'cluster-bottom' ||
    input.intent.imageMode !== 'framed'
  ) {
    probes.push({
      id: 'framed-split-vertical',
      override: {
        structuralArchetype: 'split-vertical',
        family: 'square-image-top-text-bottom',
        compositionModelId: 'square-balanced-card',
        imageMode: 'framed',
        textMode: 'cluster-bottom',
        mode: 'text-first',
        balanceRegime: 'balanced',
        occupancyMode: 'text-safe',
      },
    })
  }

  return probes
}

function pushPreviewCandidatePlan(
  plans: PreviewCandidatePlan[],
  plan: PreviewCandidatePlan,
  formatKey: FormatKey,
  meta: {
    attemptedPlans: number
    prunedStructuralDuplicates: number
    budgetRejectedPlans: number
    attemptedArchetypes: Set<StructuralArchetype>
    acceptedArchetypes: Set<StructuralArchetype>
    attemptedSignatures: Set<string>
    acceptedSignatures: Set<string>
  },
  budget = PREVIEW_CANDIDATE_BUDGET
) {
  const signature = createStructuralSignatureKey(plan.structuralSignature)
  meta.attemptedPlans += 1
  meta.attemptedArchetypes.add(plan.structuralArchetype)
  meta.attemptedSignatures.add(signature)
  const sameSignaturePlans = plans.filter((current) => createStructuralSignatureKey(current.structuralSignature) === signature)
  if (sameSignaturePlans.length) {
    const variantKey = createPreviewPlanVariantKey(plan)
    const sameVariantAlreadyKept = sameSignaturePlans.some((current) => createPreviewPlanVariantKey(current) === variantKey)
    const isMarketplace = formatKey === 'marketplace-card'
    const allowPrimaryRecoveryVariant =
      !isMarketplace &&
      isPrimaryGenerationRecoveryFormat(formatKey) &&
      plan.strategyLabel.startsWith('recovery-')
    const variantLimit = isMarketplace
      ? MARKETPLACE_CARD_SIGNATURE_VARIANT_LIMIT
      : allowPrimaryRecoveryVariant
        ? PRIMARY_FORMAT_SIGNATURE_VARIANT_LIMIT
        : 1
    if (sameVariantAlreadyKept || sameSignaturePlans.length >= variantLimit) {
      meta.prunedStructuralDuplicates += 1
      return
    }
  }
  if (plans.length < budget) {
    plans.push(plan)
    meta.acceptedArchetypes.add(plan.structuralArchetype)
    meta.acceptedSignatures.add(signature)
  } else {
    meta.budgetRejectedPlans += 1
  }
}

function buildPreviewCandidatePlans(input: {
  formatKey: FormatKey
  master: Scene
  profile: ContentProfile
  baseIntent: LayoutIntent
  goal: Project['goal']
  visualSystem: VisualSystemKey
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
  failureType?: RepairFailureType
  baseFixStage?: PreviewCandidatePlan['fixStage']
  allowFamilyAlternatives?: boolean
  allowModelAlternatives?: boolean
  budget?: number
  includeExtendedDiagnostics?: boolean
}) {
  if (input.formatKey === 'marketplace-card') {
    const format = FORMAT_MAP[input.formatKey]
    const budget = input.budget || getDefaultPreviewCandidateBudget(input.formatKey)
    const plans: PreviewCandidatePlan[] = []
    const meta = {
      attemptedPlans: 0,
      prunedStructuralDuplicates: 0,
      budgetRejectedPlans: 0,
      attemptedArchetypes: new Set<StructuralArchetype>(),
      acceptedArchetypes: new Set<StructuralArchetype>(),
      attemptedSignatures: new Set<string>(),
      acceptedSignatures: new Set<string>(),
    }

    if (isMarketplaceLayoutV2Enabled()) {
      for (const arch of allMarketplaceCardV2Archetypes()) {
        if (plans.length >= budget) break
        const structuralArchetype = structuralArchetypeForMarketplaceV2Archetype(arch)
        const intent = normalizePreviewIntent({
          formatKey: input.formatKey,
          baseIntent: input.baseIntent,
          profile: input.profile,
          goal: input.goal,
          visualSystem: input.visualSystem,
          imageAnalysis: input.imageAnalysis,
          override: {
            marketplaceLayoutEngine: 'v2-slot',
            marketplaceV2Archetype: arch,
            structuralArchetype,
          },
        })
        const structuralSignature = buildIntentStructuralSignature({
          formatKey: input.formatKey,
          intent,
          profile: input.profile,
        })
        pushPreviewCandidatePlan(
          plans,
          {
            id: `v2-${arch}`,
            strategyLabel: `marketplace-v2-${arch}`,
            fixStage: input.baseFixStage || 'base',
            intent,
            structuralArchetype,
            structuralSignature,
            selectionReason: `Marketplace V2 slot layout (${arch})`,
          },
          input.formatKey,
          meta,
          budget
        )
      }
    } else {
      const generated = buildMarketplaceCardTemplateVariantPlans({
        format,
        master: input.master,
        profile: input.profile,
        goal: input.goal,
        visualSystem: input.visualSystem,
        imageAnalysis: input.imageAnalysis,
        assetHint: input.assetHint,
        baseIntent: input.baseIntent,
        baseFixStage: input.baseFixStage,
      })

      for (const generatedPlan of generated.plans.slice(0, budget)) {
        const intent = normalizePreviewIntent({
          formatKey: input.formatKey,
          baseIntent: generatedPlan.intent,
          profile: input.profile,
          goal: input.goal,
          visualSystem: input.visualSystem,
          imageAnalysis: input.imageAnalysis,
        })
        const structuralArchetype = getIntentArchetype(intent, input.formatKey)
        const structuralSignature = buildIntentStructuralSignature({
          formatKey: input.formatKey,
          intent,
          profile: input.profile,
        })
        pushPreviewCandidatePlan(
          plans,
          {
            id: generatedPlan.id,
            strategyLabel: generatedPlan.strategyLabel,
            fixStage: generatedPlan.fixStage,
            intent,
            structuralArchetype,
            structuralSignature,
            selectionReason: generatedPlan.selectionReason,
          },
          input.formatKey,
          meta,
          budget
        )
      }
    }

    return {
      plans,
      meta: {
        attemptedPlans: meta.attemptedPlans,
        acceptedPlans: plans.length,
        prunedStructuralDuplicates: meta.prunedStructuralDuplicates,
        budgetRejectedPlans: meta.budgetRejectedPlans,
        attemptedArchetypes: Array.from(meta.attemptedArchetypes).sort(),
        acceptedArchetypes: Array.from(meta.acceptedArchetypes).sort(),
        attemptedStructuralSignatures: meta.attemptedSignatures.size,
        acceptedStructuralSignatures: meta.acceptedSignatures.size,
      } satisfies PreviewPlanBuildMeta,
    }
  }

  if (input.formatKey === 'marketplace-tile' && isMarketplaceLayoutV2Enabled()) {
    const budget = input.budget || getDefaultPreviewCandidateBudget(input.formatKey)
    const plans: PreviewCandidatePlan[] = []
    const meta = {
      attemptedPlans: 0,
      prunedStructuralDuplicates: 0,
      budgetRejectedPlans: 0,
      attemptedArchetypes: new Set<StructuralArchetype>(),
      acceptedArchetypes: new Set<StructuralArchetype>(),
      attemptedSignatures: new Set<string>(),
      acceptedSignatures: new Set<string>(),
    }
    for (const arch of allMarketplaceTileV2Archetypes()) {
      if (plans.length >= budget) break
      const structuralArchetype = structuralArchetypeForMarketplaceV2Archetype(arch)
      const intent = normalizePreviewIntent({
        formatKey: input.formatKey,
        baseIntent: input.baseIntent,
        profile: input.profile,
        goal: input.goal,
        visualSystem: input.visualSystem,
        imageAnalysis: input.imageAnalysis,
        override: {
          marketplaceLayoutEngine: 'v2-slot',
          marketplaceV2Archetype: arch,
          structuralArchetype,
        },
      })
      const structuralSignature = buildIntentStructuralSignature({
        formatKey: input.formatKey,
        intent,
        profile: input.profile,
      })
      pushPreviewCandidatePlan(
        plans,
        {
          id: `v2-${arch}`,
          strategyLabel: `marketplace-v2-${arch}`,
          fixStage: input.baseFixStage || 'base',
          intent,
          structuralArchetype,
          structuralSignature,
          selectionReason: `Marketplace V2 slot layout (${arch})`,
        },
        input.formatKey,
        meta,
        budget
      )
    }
    return {
      plans,
      meta: {
        attemptedPlans: meta.attemptedPlans,
        acceptedPlans: plans.length,
        prunedStructuralDuplicates: meta.prunedStructuralDuplicates,
        budgetRejectedPlans: meta.budgetRejectedPlans,
        attemptedArchetypes: Array.from(meta.attemptedArchetypes).sort(),
        acceptedArchetypes: Array.from(meta.acceptedArchetypes).sort(),
        attemptedStructuralSignatures: meta.attemptedSignatures.size,
        acceptedStructuralSignatures: meta.acceptedSignatures.size,
      } satisfies PreviewPlanBuildMeta,
    }
  }

  const baseIntent = normalizePreviewIntent({
    formatKey: input.formatKey,
    baseIntent: input.baseIntent,
    profile: input.profile,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageAnalysis: input.imageAnalysis,
  })
  const plans: PreviewCandidatePlan[] = []
  const meta = {
    attemptedPlans: 0,
    prunedStructuralDuplicates: 0,
    budgetRejectedPlans: 0,
    attemptedArchetypes: new Set<StructuralArchetype>(),
    acceptedArchetypes: new Set<StructuralArchetype>(),
    attemptedSignatures: new Set<string>(),
    acceptedSignatures: new Set<string>(),
  }
  const baseFixStage = input.baseFixStage || 'base'
  const budget = input.budget || getDefaultPreviewCandidateBudget(input.formatKey)
  const includeExtendedDiagnostics = shouldUseExpandedPreviewPlanning(input.formatKey, input.includeExtendedDiagnostics)
  const baseSignature = buildIntentStructuralSignature({
    formatKey: input.formatKey,
    intent: baseIntent,
    profile: input.profile,
  })

  pushPreviewCandidatePlan(plans, {
    id: 'base',
    strategyLabel: 'base-heuristic',
    fixStage: baseFixStage,
    intent: baseIntent,
    structuralArchetype: baseSignature.archetype,
    structuralSignature: baseSignature,
    selectionReason: 'base heuristic archetype',
  }, input.formatKey, meta, budget)

  const archetypeRank = rankStructuralArchetypes({
    formatKey: input.formatKey,
    profile: input.profile,
    baseIntent,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageAnalysis: input.imageAnalysis,
    failureType: input.failureType,
  })

  for (const archetype of archetypeRank) {
    if (plans.length >= budget) break
    if (archetype === baseSignature.archetype && plans.length > 0) continue
    const intent = normalizePreviewIntent({
      formatKey: input.formatKey,
      baseIntent,
      profile: input.profile,
      goal: input.goal,
      visualSystem: input.visualSystem,
      imageAnalysis: input.imageAnalysis,
      override: applyStructuralArchetypeIntent({
        archetype,
        formatKey: input.formatKey,
        baseIntent,
        profile: input.profile,
        goal: input.goal,
        visualSystem: input.visualSystem,
        imageAnalysis: input.imageAnalysis,
      }),
    })
    const structuralSignature = buildIntentStructuralSignature({
      formatKey: input.formatKey,
      intent,
      profile: input.profile,
    })
    pushPreviewCandidatePlan(plans, {
      id: `archetype-${archetype}`,
      strategyLabel: `archetype-${archetype}`,
      fixStage:
        archetype === 'dense-information' || archetype === 'overlay-balanced'
          ? (baseFixStage === 'structural' ? 'structural' : 'regional')
          : baseFixStage,
      intent,
      structuralArchetype: archetype,
      structuralSignature,
      selectionReason: `structural archetype:${archetype}`,
    }, input.formatKey, meta, budget)
  }

  if (includeExtendedDiagnostics && input.allowModelAlternatives !== false && plans.length < budget) {
    const alternativeModel = getAlternativeCompositionModel(FORMAT_MAP[input.formatKey], baseIntent.compositionModelId)
    if (alternativeModel && alternativeModel.id !== baseIntent.compositionModelId) {
      const modelIntent = normalizePreviewIntent({
        formatKey: input.formatKey,
        baseIntent,
        profile: input.profile,
        goal: input.goal,
        visualSystem: input.visualSystem,
        imageAnalysis: input.imageAnalysis,
        override: {
          compositionModelId: alternativeModel.id,
          family: resolveCompositionModelFamily(alternativeModel.id),
          presetId: resolveCompositionModelFamily(alternativeModel.id),
        },
      })
      pushPreviewCandidatePlan(plans, {
        id: 'alt-model',
        strategyLabel: 'diagnostic-alternative-model',
        fixStage: baseFixStage,
        intent: modelIntent,
        structuralArchetype: getIntentArchetype(modelIntent, input.formatKey),
        structuralSignature: buildIntentStructuralSignature({
          formatKey: input.formatKey,
          intent: modelIntent,
          profile: input.profile,
        }),
        selectionReason: 'extended diagnostics composition model variant',
      }, input.formatKey, meta, budget)
    }
  }

  if (plans.length < budget && shouldAddRegionalCandidate(input.formatKey, input.profile)) {
    const regionalBase = plans.find((plan) => plan.structuralArchetype === 'dense-information')?.intent || baseIntent
    const regionalIntent = normalizePreviewIntent({
      formatKey: input.formatKey,
      baseIntent: regionalBase,
      profile: input.profile,
      goal: input.goal,
      visualSystem: input.visualSystem,
      imageAnalysis: input.imageAnalysis,
      override: {
        occupancyMode: 'text-safe',
        balanceRegime: input.profile.density === 'dense' ? 'dense-copy' : regionalBase.balanceRegime,
      },
    })
    pushPreviewCandidatePlan(plans, {
      id: 'regional-stability',
      strategyLabel: 'archetype-regional-stability',
      fixStage: baseFixStage === 'structural' ? 'structural' : 'regional',
      intent: regionalIntent,
      structuralArchetype: getIntentArchetype(regionalIntent, input.formatKey),
      structuralSignature: buildIntentStructuralSignature({
        formatKey: input.formatKey,
        intent: regionalIntent,
        profile: input.profile,
      }),
      selectionReason: 'regional stability text-safe variant',
    }, input.formatKey, meta, budget)
  }

  if (plans.length < budget && isPrimaryGenerationRecoveryFormat(input.formatKey)) {
    const recoveryVariants = buildPrimaryRecoveryPreviewVariants({
      formatKey: input.formatKey,
      baseIntent,
      profile: input.profile,
      goal: input.goal,
      visualSystem: input.visualSystem,
      imageAnalysis: input.imageAnalysis,
    })
    for (const variant of recoveryVariants) {
      if (plans.length >= budget) break
      const recoveryIntent = normalizePreviewIntent({
        formatKey: input.formatKey,
        baseIntent,
        profile: input.profile,
        goal: input.goal,
        visualSystem: input.visualSystem,
        imageAnalysis: input.imageAnalysis,
        override: variant.override,
      })
      pushPreviewCandidatePlan(plans, {
        id: variant.id,
        strategyLabel: variant.strategyLabel,
        fixStage: variant.fixStage,
        intent: recoveryIntent,
        structuralArchetype: getIntentArchetype(recoveryIntent, input.formatKey),
        structuralSignature: buildIntentStructuralSignature({
          formatKey: input.formatKey,
          intent: recoveryIntent,
          profile: input.profile,
        }),
        selectionReason: variant.selectionReason,
      }, input.formatKey, meta, budget)
    }
  }

  return {
    plans,
    meta: {
      attemptedPlans: meta.attemptedPlans,
      acceptedPlans: plans.length,
      prunedStructuralDuplicates: meta.prunedStructuralDuplicates,
      budgetRejectedPlans: meta.budgetRejectedPlans,
      attemptedArchetypes: Array.from(meta.attemptedArchetypes).sort(),
      acceptedArchetypes: Array.from(meta.acceptedArchetypes).sort(),
      attemptedStructuralSignatures: meta.attemptedSignatures.size,
      acceptedStructuralSignatures: meta.acceptedSignatures.size,
    } satisfies PreviewPlanBuildMeta,
  }
}

function retainSelectionCandidatesForFormat(formatKey: FormatKey, candidates: PreviewCandidateEvaluation[]) {
  const sorted = [...candidates].sort(comparePreviewCandidates)
  if (formatKey !== 'marketplace-card') return sorted

  const retained: PreviewCandidateEvaluation[] = []
  const retainedGeometriesBySignature = new Map<string, Set<string>>()
  for (const candidate of sorted) {
    const signature = createStructuralSignatureKey(candidate.structuralSignature)
    const geometrySignature = createSceneGeometrySignature(candidate.scene)
    const geometries = retainedGeometriesBySignature.get(signature) || new Set<string>()
    if (geometries.has(geometrySignature)) continue
    if (geometries.size >= MARKETPLACE_CARD_SIGNATURE_VARIANT_LIMIT) continue
    geometries.add(geometrySignature)
    retainedGeometriesBySignature.set(signature, geometries)
    retained.push(candidate)
  }
  return retained
}

function evaluatePreviewCandidatePlan(input: {
  plan: PreviewCandidatePlan
  master: Scene
  formatKey: FormatKey
  profile: ContentProfile
  scenario: ReturnType<typeof classifyScenario>
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const format = FORMAT_MAP[input.formatKey]
  const palette = computePalette({ brandKit: input.brandKit, visualSystem: input.visualSystem, scenario: input.scenario, imageDominantColors: input.imageAnalysis?.dominantColors ?? input.assetHint?.enhancedImage?.dominantColors })
  const typography = computeTypography({
    format,
    profile: input.profile,
    scenario: input.scenario,
    visualSystem: input.visualSystem,
    brandKit: input.brandKit,
    intent: input.plan.intent,
    headlineText: input.master.title.text,
    subtitleText: input.master.subtitle.text,
    fixStage: input.plan.fixStage,
  })
  const { scene, intent: synthesizedIntent } = synthesizeLayout({
    master: input.master,
    format,
    profile: input.profile,
    palette,
    typography,
    intent: input.plan.intent,
    brandKit: input.brandKit,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })
  const baseAssessment = getFormatAssessment(input.formatKey, scene, synthesizedIntent.compositionModelId, input.imageAnalysis)
  const perceptualSignals = computePerceptualSignals(scene, baseAssessment)
  const assessment = {
    ...baseAssessment,
    perceptual: perceptualSignals,
  } satisfies LayoutAssessment
  const scoreTrust = computeScoreTrust(assessment)
  const baseCandidate = {
    id: input.plan.id,
    formatKey: input.formatKey,
    strategyLabel: input.plan.strategyLabel,
    fixStage: input.plan.fixStage,
    scene,
    intent: synthesizedIntent,
    assessment,
    scoreTrust,
    structuralArchetype: input.plan.structuralArchetype,
    structuralSignature: buildSceneStructuralSignature({
      scene,
      intent: synthesizedIntent,
      formatKey: input.formatKey,
    }),
    structuralStatus: assessment.structuralState?.status || 'invalid',
    structuralFindingCount: assessment.structuralState?.findings.length || 0,
    highStructuralFindingCount: countHighStructuralFindings(assessment),
    criticalIssueCount: countCriticalIssues(assessment),
    highIssueCount: countHighIssues(assessment),
    issueCount: assessment.issues.length,
    perceptualSignals,
  } satisfies PreviewCandidateEvaluation

  const skipMarketplaceV2Extras =
    synthesizedIntent.marketplaceLayoutEngine === 'v2-slot' &&
    (input.formatKey === 'marketplace-card' || input.formatKey === 'marketplace-tile')

  const perceptualRefinement =
    !skipMarketplaceV2Extras && input.formatKey === 'marketplace-card'
      ? refineMarketplaceCardPerceptualComposition({
          scene,
          format,
          intent: synthesizedIntent,
          signals: perceptualSignals,
        })
      : undefined

  let candidateAfterPerceptualAdjustment: PreviewCandidateEvaluation = {
    ...baseCandidate,
    perceptualAdjustment: perceptualRefinement
      ? {
          ...perceptualRefinement.diagnostics,
          originalSignals: perceptualSignals,
          originalStructuralStatus: baseCandidate.structuralStatus,
          originalEffectiveScore: baseCandidate.scoreTrust.effectiveScore,
        }
      : undefined,
  } satisfies PreviewCandidateEvaluation

  if (perceptualRefinement?.diagnostics.applied) {
    const compositionModel = synthesizedIntent.compositionModelId
      ? getCompositionModel(format, synthesizedIntent.compositionModelId)
      : null
    const finalizedPerceptualScene = finalizeSceneGeometry(perceptualRefinement.scene, format, compositionModel)
    const adjustedBaseAssessment = getFormatAssessment(
      input.formatKey,
      finalizedPerceptualScene,
      synthesizedIntent.compositionModelId,
      input.imageAnalysis
    )
    const adjustedPerceptualSignals = computePerceptualSignals(finalizedPerceptualScene, adjustedBaseAssessment)
    const adjustedAssessment = {
      ...adjustedBaseAssessment,
      perceptual: adjustedPerceptualSignals,
    } satisfies LayoutAssessment

    if (
      shouldAcceptMarketplacePerceptualAdjustment({
        beforeCandidate: baseCandidate,
        afterAssessment: adjustedAssessment,
        afterSignals: adjustedPerceptualSignals,
      })
    ) {
      const adjustedScoreTrust = computeScoreTrust(adjustedAssessment)
      candidateAfterPerceptualAdjustment = {
        ...baseCandidate,
        scene: finalizedPerceptualScene,
        assessment: adjustedAssessment,
        scoreTrust: adjustedScoreTrust,
        structuralSignature: buildSceneStructuralSignature({
          scene: finalizedPerceptualScene,
          intent: synthesizedIntent,
          formatKey: input.formatKey,
        }),
        structuralStatus: adjustedAssessment.structuralState?.status || 'invalid',
        structuralFindingCount: adjustedAssessment.structuralState?.findings.length || 0,
        highStructuralFindingCount: countHighStructuralFindings(adjustedAssessment),
        criticalIssueCount: countCriticalIssues(adjustedAssessment),
        highIssueCount: countHighIssues(adjustedAssessment),
        issueCount: adjustedAssessment.issues.length,
        perceptualSignals: adjustedPerceptualSignals,
        perceptualAdjustment: {
          ...perceptualRefinement.diagnostics,
          originalSignals: perceptualSignals,
          adjustedSignals: adjustedPerceptualSignals,
          originalStructuralStatus: baseCandidate.structuralStatus,
          adjustedStructuralStatus: adjustedAssessment.structuralState?.status || 'invalid',
          originalEffectiveScore: baseCandidate.scoreTrust.effectiveScore,
          adjustedEffectiveScore: adjustedScoreTrust.effectiveScore,
        },
      } satisfies PreviewCandidateEvaluation
    } else {
      candidateAfterPerceptualAdjustment = {
        ...candidateAfterPerceptualAdjustment,
        perceptualAdjustment: {
          applied: false,
          blockedBy: 'no-safe-perceptual-gain',
          triggers: candidateAfterPerceptualAdjustment.perceptualAdjustment?.triggers || [],
          adjustments: candidateAfterPerceptualAdjustment.perceptualAdjustment?.adjustments || [],
          originalSignals: candidateAfterPerceptualAdjustment.perceptualAdjustment?.originalSignals,
          originalStructuralStatus: candidateAfterPerceptualAdjustment.perceptualAdjustment?.originalStructuralStatus,
          originalEffectiveScore: candidateAfterPerceptualAdjustment.perceptualAdjustment?.originalEffectiveScore,
          adjustedSignals: adjustedPerceptualSignals,
          adjustedStructuralStatus: adjustedAssessment.structuralState?.status || 'invalid',
          adjustedEffectiveScore: computeScoreTrust(adjustedAssessment).effectiveScore,
        },
      } satisfies PreviewCandidateEvaluation
    }
  }

  const perceptualPreference =
    !skipMarketplaceV2Extras && input.formatKey === 'marketplace-card'
      ? computeMarketplaceCardPerceptualPreference({
          candidate: candidateAfterPerceptualAdjustment,
        })
      : undefined

  const commercialPreference =
    !skipMarketplaceV2Extras && input.formatKey === 'marketplace-card'
      ? computeMarketplaceCardCommercialPreferenceScore({
          candidate: candidateAfterPerceptualAdjustment,
          profile: input.profile,
        })
      : undefined

  const candidateWithCommercial = {
    ...candidateAfterPerceptualAdjustment,
    perceptualPreference,
    commercialPreference,
  } satisfies PreviewCandidateEvaluation

  const evaluationAlignment =
    !skipMarketplaceV2Extras && input.formatKey === 'marketplace-card'
      ? computeMarketplaceCardTextFirstEvaluationAlignment({
          candidate: candidateWithCommercial,
          profile: input.profile,
        })
      : undefined

  if (!evaluationAlignment?.applied) {
    return {
      ...candidateWithCommercial,
      evaluationAlignment,
    } satisfies PreviewCandidateEvaluation
  }

  return {
    ...candidateWithCommercial,
    scoreTrust: {
      ...candidateWithCommercial.scoreTrust,
      effectiveScore: evaluationAlignment.adjustedEffectiveScore,
    },
    structuralStatus: evaluationAlignment.adjustedStructuralStatus,
    criticalIssueCount: evaluationAlignment.adjustedCriticalIssueCount,
    highIssueCount: evaluationAlignment.adjustedHighIssueCount,
    issueCount: evaluationAlignment.adjustedIssueCount,
    structuralFindingCount: evaluationAlignment.adjustedStructuralFindingCount,
    highStructuralFindingCount: evaluationAlignment.adjustedHighStructuralFindingCount,
    evaluationAlignment,
  } satisfies PreviewCandidateEvaluation
}

function getPreviewStructuralFindingPenalty(candidate: PreviewCandidateEvaluation, name: string) {
  return (candidate.assessment.structuralState?.findings || [])
    .filter((finding) => finding.name === name)
    .reduce((sum, finding) => sum + (finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1), 0)
}

function getPreviewInvalidRecoveryPenalty(candidate: PreviewCandidateEvaluation) {
  return (
    getPreviewStructuralFindingPenalty(candidate, 'major-overlap') * 100 +
    getPreviewStructuralFindingPenalty(candidate, 'minimum-spacing') * 70 +
    getPreviewStructuralFindingPenalty(candidate, 'safe-area-compliance') * 55 +
    getPreviewStructuralFindingPenalty(candidate, 'role-placement') * 45 +
    getPreviewStructuralFindingPenalty(candidate, 'text-size-sanity') * 28 +
    getPreviewStructuralFindingPenalty(candidate, 'image-dominance-sanity') * 18 +
    getPreviewStructuralFindingPenalty(candidate, 'structural-occupancy') * 12
  )
}

function getPreviewInvalidRecoveryPreference(candidate: PreviewCandidateEvaluation) {
  let preference = 0
  if (candidate.strategyLabel.startsWith('recovery-')) preference += 8
  if (candidate.fixStage === 'structural') preference += 5
  else if (candidate.fixStage === 'regional') preference += 3
  if (candidate.intent.occupancyMode === 'text-safe') preference += 3
  if (candidate.intent.balanceRegime === 'minimal-copy' || candidate.intent.balanceRegime === 'dense-copy') preference += 2
  return preference
}

function comparePreviewCandidates(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
  if (
    isMarketplaceCardTemplateVariantCandidate(left) &&
    isMarketplaceCardTemplateVariantCandidate(right)
  ) {
    return compareMarketplaceCardTemplateVariantCandidates(left, right)
  }

  const tierDelta = getStructuralTierRank(right.structuralStatus) - getStructuralTierRank(left.structuralStatus)
  if (tierDelta !== 0) return tierDelta

  if (
    left.structuralStatus === 'invalid' &&
    right.structuralStatus === 'invalid' &&
    isPrimaryGenerationRecoveryFormat(left.formatKey) &&
    isPrimaryGenerationRecoveryFormat(right.formatKey)
  ) {
    const recoveryPenaltyDelta = getPreviewInvalidRecoveryPenalty(left) - getPreviewInvalidRecoveryPenalty(right)
    if (recoveryPenaltyDelta !== 0) return recoveryPenaltyDelta
    const recoveryPreferenceDelta = getPreviewInvalidRecoveryPreference(right) - getPreviewInvalidRecoveryPreference(left)
    if (recoveryPreferenceDelta !== 0) return recoveryPreferenceDelta
  }

  const scoreDelta = right.scoreTrust.effectiveScore - left.scoreTrust.effectiveScore
  const allowMarketplaceCardVisualRerank = shouldUseMarketplaceCardVisualRerank({
    leftFormatKey: left.formatKey,
    rightFormatKey: right.formatKey,
    leftStructuralStatus: left.structuralStatus,
    rightStructuralStatus: right.structuralStatus,
    scoreDelta,
  })

  const highFindingDelta = left.highStructuralFindingCount - right.highStructuralFindingCount
  if (highFindingDelta !== 0) return highFindingDelta

  const criticalIssueDelta = left.criticalIssueCount - right.criticalIssueCount
  if (criticalIssueDelta !== 0) return criticalIssueDelta

  const highIssueDelta = left.highIssueCount - right.highIssueCount
  if (highIssueDelta !== 0) return highIssueDelta

  if (allowMarketplaceCardVisualRerank) {
    const visualDelta = getMarketplaceCardVisualDecisionDelta(left.assessment, right.assessment)
    if (visualDelta !== 0) return visualDelta
  }

  if (scoreDelta !== 0) return scoreDelta

  const findingCountDelta = left.structuralFindingCount - right.structuralFindingCount
  if (findingCountDelta !== 0) return findingCountDelta

  const issueCountDelta = left.issueCount - right.issueCount
  if (issueCountDelta !== 0) return issueCountDelta

  return left.strategyLabel.localeCompare(right.strategyLabel)
}

function logPreviewCandidateSelection(input: {
  formatKey: FormatKey
  selection: PreviewCandidateSelection
}) {
  if (!import.meta.env.DEV) return
  const previewDebugEnv =
    (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.PREVIEW_CANDIDATE_DEBUG
  if (previewDebugEnv === '0') return

  const discardedReasonCounts = Object.entries(input.selection.discardedReasonCounts)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
    .slice(0, 4)
    .map(([name, count]) => `${name}:${count}`)
    .join(', ') || 'none'
  const baseCandidate = input.selection.candidates.find((candidate) => candidate.strategyLabel === 'base-heuristic')

  const summary = {
    formatKey: input.formatKey,
    candidateCount: input.selection.candidates.length,
    validCandidates: input.selection.counts.valid,
    degradedCandidates: input.selection.counts.degraded,
    invalidCandidates: input.selection.counts.invalid,
    baseArchetype: baseCandidate?.structuralArchetype || 'n/a',
    baseStatus: baseCandidate?.structuralStatus || 'n/a',
    baseScore: baseCandidate?.scoreTrust.effectiveScore || 0,
    selectedStrategy: input.selection.selected.strategyLabel,
    selectedArchetype: input.selection.selected.structuralArchetype,
    selectedStatus: input.selection.selected.structuralStatus,
    selectedScore: input.selection.selected.scoreTrust.effectiveScore,
    selectedTemplate: input.selection.selected.intent.marketplaceTemplateId || 'n/a',
    commercialDecision: input.selection.rankingDiagnostics?.commercialDecision?.applied
      ? `${input.selection.rankingDiagnostics.commercialDecision.preferredTemplateId}:${input.selection.rankingDiagnostics.commercialDecision.commercialScoreDelta}`
      : input.selection.rankingDiagnostics?.commercialDecision?.blockedBy || 'none',
    perceptualDecision: input.selection.rankingDiagnostics?.perceptualDecision?.applied
      ? `${input.selection.rankingDiagnostics.perceptualDecision.selectedTemplateId}:${input.selection.rankingDiagnostics.perceptualDecision.perceptualScoreDelta}`
      : input.selection.rankingDiagnostics?.perceptualDecision?.blockedBy || 'none',
    archetypes: unique(input.selection.candidates.map((candidate) => candidate.structuralArchetype)).join(', '),
    templateVariants: unique(
      input.selection.candidates
        .map((candidate) => candidate.intent.marketplaceTemplateId)
        .filter((value): value is NonNullable<typeof value> => Boolean(value))
    ).join(', '),
    signatures: unique(input.selection.candidates.map((candidate) => createStructuralSignatureKey(candidate.structuralSignature))).length,
    rejectedTopReasons: discardedReasonCounts,
  }

  const signature = JSON.stringify(summary)
  if (previewCandidateLogSignatures.get(input.formatKey) === signature) return
  previewCandidateLogSignatures.set(input.formatKey, signature)

  console.debug('[layout] preview candidate selection', summary)
}

function selectBestPreviewCandidate(input: {
  master: Scene
  formatKey: FormatKey
  profile: ContentProfile
  scenario: ReturnType<typeof classifyScenario>
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  baseIntent: LayoutIntent
  goal: Project['goal']
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
  baseFixStage?: PreviewCandidatePlan['fixStage']
  allowFamilyAlternatives?: boolean
  allowModelAlternatives?: boolean
  budget?: number
  includeExtendedDiagnostics?: boolean
  failureType?: RepairFailureType
}) {
  const effectiveBudget = input.budget || getDefaultPreviewCandidateBudget(input.formatKey)
  const useExtendedDiagnostics = shouldUseExpandedPreviewPlanning(input.formatKey, input.includeExtendedDiagnostics)
  const { plans, meta: planBuild } = buildPreviewCandidatePlans({
    formatKey: input.formatKey,
    master: input.master,
    profile: input.profile,
    baseIntent: input.baseIntent,
    goal: input.goal,
    visualSystem: input.visualSystem,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
    failureType: input.failureType,
    baseFixStage: input.baseFixStage,
    allowFamilyAlternatives: input.allowFamilyAlternatives,
    allowModelAlternatives: input.allowModelAlternatives,
    budget: effectiveBudget,
    includeExtendedDiagnostics: useExtendedDiagnostics,
  })
  const candidates = plans.map((plan) =>
    evaluatePreviewCandidatePlan({
      plan,
      master: input.master,
      formatKey: input.formatKey,
      profile: input.profile,
      scenario: input.scenario,
      visualSystem: input.visualSystem,
      brandKit: input.brandKit,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    })
  )
  const sorted = retainSelectionCandidatesForFormat(input.formatKey, candidates)
  const selected = sorted[0]
  const counts = sorted.reduce<Record<'valid' | 'degraded' | 'invalid', number>>(
    (acc, candidate) => {
      acc[candidate.structuralStatus] += 1
      return acc
    },
    { valid: 0, degraded: 0, invalid: 0 }
  )
  const discardedReasonCounts = sorted.slice(1).reduce<Record<string, number>>((acc, candidate) => {
    for (const finding of candidate.assessment.structuralState?.findings || []) {
      acc[finding.name] = (acc[finding.name] || 0) + 1
    }
    return acc
  }, {})
  const rankingDiagnostics =
    input.formatKey === 'marketplace-card' && sorted.length > 1
      ? {
          commercialDecision: explainMarketplaceCardCommercialDecision(sorted[1], sorted[0]),
          perceptualDecision: explainMarketplaceCardPerceptualDecision(sorted[1], sorted[0]),
        }
      : undefined

  const selection = {
    selected,
    candidates: sorted,
    counts,
    discardedReasonCounts,
    planBuild,
    rankingDiagnostics,
  } satisfies PreviewCandidateSelection

  logPreviewCandidateSelection({
    formatKey: input.formatKey,
    selection,
  })

  return selection
}

export function getPreviewCandidateDiagnostics(input: {
  master: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  baseFixStage?: PreviewCandidatePlan['fixStage']
  expandedBudget?: number
}): PreviewCandidateDiagnostics {
  const format = FORMAT_MAP[input.formatKey]
  const profile = profileContent(input.master)
  const scenario = classifyScenario({
    profile,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageProfile: input.assetHint?.imageProfile,
  })
  const baseIntent = chooseLayoutIntent({
    format,
    master: input.master,
    profile,
    imageAnalysis: input.assetHint?.enhancedImage,
    visualSystem: input.visualSystem,
    goal: input.goal,
    assetHint: input.assetHint,
  })
  const selection = selectBestPreviewCandidate({
    master: input.master,
    formatKey: input.formatKey,
    profile,
    scenario,
    visualSystem: input.visualSystem,
    brandKit: input.brandKit,
    assetHint: input.assetHint,
    imageAnalysis: input.assetHint?.enhancedImage,
    baseIntent,
    goal: input.goal,
    baseFixStage: input.baseFixStage || 'base',
    allowFamilyAlternatives: true,
    allowModelAlternatives: true,
  })
  const expandedSelection =
    input.expandedBudget && input.expandedBudget > getDefaultPreviewCandidateBudget(input.formatKey)
      ? selectBestPreviewCandidate({
          master: input.master,
          formatKey: input.formatKey,
          profile,
          scenario,
          visualSystem: input.visualSystem,
          brandKit: input.brandKit,
          assetHint: input.assetHint,
          imageAnalysis: input.assetHint?.enhancedImage,
          baseIntent,
          goal: input.goal,
          baseFixStage: input.baseFixStage || 'base',
          allowFamilyAlternatives: true,
          allowModelAlternatives: true,
          budget: input.expandedBudget,
          includeExtendedDiagnostics: true,
        })
      : undefined
  const fixedScene = runAutoFix(
    selection.selected.scene,
    input.formatKey,
    selection.selected.assessment,
    input.assetHint?.enhancedImage,
    selection.selected.intent.compositionModelId,
    {
      master: input.master,
      profile,
      scenario,
      visualSystem: input.visualSystem,
      brandKit: input.brandKit,
      goal: input.goal,
      assetHint: input.assetHint,
      imageAnalysis: input.assetHint?.enhancedImage,
      baseIntent,
    }
  )
  const postSelectionFixAssessment = getFormatAssessment(
    input.formatKey,
    fixedScene,
    selection.selected.intent.compositionModelId,
    input.assetHint?.enhancedImage
  )
  const postSelectionFixTrust = computeScoreTrust(postSelectionFixAssessment)
  const finalizedPostSelection = finalizePrimarySelectedOutcomeSync({
    formatKey: input.formatKey,
    selection,
    currentScene: fixedScene,
    currentAssessment: postSelectionFixAssessment,
    currentScoreTrust: postSelectionFixTrust,
    imageAnalysis: input.assetHint?.enhancedImage,
    escalationContext: {
      master: input.master,
      profile,
      scenario,
      visualSystem: input.visualSystem,
      brandKit: input.brandKit,
      goal: input.goal,
      assetHint: input.assetHint,
      imageAnalysis: input.assetHint?.enhancedImage,
      baseIntent,
    },
  })

  return {
    formatKey: input.formatKey,
    baseCandidate: selection.candidates.find((candidate) => candidate.strategyLabel === 'base-heuristic') || selection.selected,
    selectedCandidate: selection.selected,
    expandedBudgetCandidate: expandedSelection?.selected,
    allCandidates: selection.candidates,
    expandedBudgetCandidates: expandedSelection?.candidates,
    counts: selection.counts,
    planBuild: selection.planBuild,
    expandedPlanBuild: expandedSelection?.planBuild,
    rankingDiagnostics: selection.rankingDiagnostics,
    postSelectionFix: {
      assessment: finalizedPostSelection.assessment,
      scoreTrust: finalizedPostSelection.scoreTrust,
      strategyLabel: finalizedPostSelection.strategyLabel,
      reselectionApplied: finalizedPostSelection.reselectionApplied,
    },
  }
}

export function getMarketplaceCardExplorationDiagnostics(input: {
  master: Scene
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  explorationBudget?: number
  variationIndex?: number
}): MarketplaceCardExplorationDiagnostics {
  const formatKey: FormatKey = 'marketplace-card'
  const format = FORMAT_MAP[formatKey]
  const profile = profileContent(input.master)
  const scenario = classifyScenario({
    profile,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageProfile: input.assetHint?.imageProfile,
  })
  const baseIntent = chooseLayoutIntent({
    format,
    master: input.master,
    profile,
    imageAnalysis: input.assetHint?.enhancedImage,
    visualSystem: input.visualSystem,
    goal: input.goal,
    assetHint: input.assetHint,
  })

  const normalSelection = selectBestPreviewCandidate({
    master: input.master,
    formatKey,
    profile,
    scenario,
    visualSystem: input.visualSystem,
    brandKit: input.brandKit,
    assetHint: input.assetHint,
    imageAnalysis: input.assetHint?.enhancedImage,
    baseIntent,
    goal: input.goal,
    baseFixStage: 'base',
    allowFamilyAlternatives: true,
    allowModelAlternatives: true,
    includeExtendedDiagnostics: true,
  })
  const normalBaseCandidate = normalSelection.candidates.find((candidate) => candidate.strategyLabel === 'base-heuristic') || normalSelection.selected
  const normalSelectedGeometrySignature = createSceneGeometrySignature(normalSelection.selected.scene)

  const variationProfiles: Array<{
    id: string
    source: string
    fixStage: PreviewCandidatePlan['fixStage']
    failureType?: RepairFailureType
    override: Partial<LayoutIntent>
  }> = [
    {
      id: 'base',
      source: 'base-path',
      fixStage: 'base',
      override: {},
    },
    {
      id: 'text-safe',
      source: 'alternative-balance-density',
      fixStage: 'regional',
      failureType: 'spacing-dominant',
      override: { balanceRegime: 'text-first', occupancyMode: 'text-safe' },
    },
    {
      id: 'compact-commerce',
      source: 'alternative-balance-density',
      fixStage: 'regional',
      override: {
        structuralArchetype: 'compact-minimal',
        family: 'square-image-top-text-bottom',
        compositionModelId: 'square-balanced-card',
        imageMode: 'framed',
        textMode: 'cluster-bottom',
        mode: 'framed',
        balanceRegime: 'balanced',
        occupancyMode: 'compact',
      },
    },
    {
      id: 'dense-copy-card',
      source: 'alternative-balance-density',
      fixStage: 'regional',
      failureType: 'text-size-dominant',
      override: {
        structuralArchetype: 'dense-information',
        family: 'square-image-top-text-bottom',
        compositionModelId: 'square-balanced-card',
        imageMode: 'framed',
        textMode: 'cluster-bottom',
        mode: 'text-first',
        balanceRegime: 'dense-copy',
        occupancyMode: 'text-safe',
      },
    },
    {
      id: 'split-left-card',
      source: 'alternative-layout-intent',
      fixStage: 'regional',
      failureType: 'occupancy-dominant',
      override: {
        structuralArchetype: 'split-horizontal',
        family: 'square-image-top-text-bottom',
        compositionModelId: 'square-balanced-card',
        imageMode: 'split-left',
        textMode: 'cluster-left',
        mode: 'split',
        balanceRegime: 'balanced',
        occupancyMode: 'balanced',
      },
    },
    {
      id: 'split-right-card',
      source: 'alternative-layout-intent',
      fixStage: 'regional',
      failureType: 'occupancy-dominant',
      override: {
        structuralArchetype: 'split-horizontal',
        family: 'square-image-top-text-bottom',
        compositionModelId: 'square-balanced-card',
        imageMode: 'split-right',
        textMode: 'cluster-left',
        mode: 'split',
        balanceRegime: 'balanced',
        occupancyMode: 'compact',
      },
    },
    {
      id: 'centered-overlay',
      source: 'alternative-layout-intent',
      fixStage: 'structural',
      failureType: 'safe-area-dominant',
      override: {
        structuralArchetype: 'overlay-balanced',
        family: 'square-hero-overlay',
        compositionModelId: 'square-hero-overlay',
        imageMode: 'hero',
        textMode: 'centered',
        mode: 'overlay',
        balanceRegime: 'balanced',
        occupancyMode: 'text-safe',
      },
    },
    {
      id: 'centered-card',
      source: 'alternative-layout-intent',
      fixStage: 'regional',
      failureType: 'spacing-dominant',
      override: {
        structuralArchetype: 'dense-information',
        family: 'square-image-top-text-bottom',
        compositionModelId: 'square-balanced-card',
        imageMode: 'framed',
        textMode: 'centered',
        mode: 'text-first',
        balanceRegime: 'balanced',
        occupancyMode: 'text-safe',
      },
    },
    {
      id: 'visual-first',
      source: 'alternative-balance-density',
      fixStage: 'base',
      failureType: 'image-dominance-dominant',
      override: {
        structuralArchetype: 'image-hero',
        family: 'square-hero-overlay',
        compositionModelId: 'square-hero-overlay',
        imageMode: 'hero',
        textMode: 'overlay',
        mode: 'image-first',
        balanceRegime: 'image-first',
        occupancyMode: 'visual-first',
      },
    },
    {
      id: 'framed-overlay',
      source: 'alternative-layout-intent',
      fixStage: 'regional',
      failureType: 'mixed',
      override: {
        structuralArchetype: 'overlay-balanced',
        family: 'square-hero-overlay',
        compositionModelId: 'square-hero-overlay',
        imageMode: 'framed',
        textMode: 'overlay',
        mode: 'overlay',
        balanceRegime: 'balanced',
        occupancyMode: 'balanced',
      },
    },
    {
      id: 'safe-fallback',
      source: 'safe-fallback',
      fixStage: 'structural',
      failureType: 'safe-area-dominant',
      override: {
        structuralArchetype: 'dense-information',
        family: 'square-image-top-text-bottom',
        compositionModelId: 'square-balanced-card',
        imageMode: 'framed',
        textMode: 'cluster-bottom',
        mode: 'text-first',
        balanceRegime: 'text-first',
        occupancyMode: 'text-safe',
      },
    },
  ]

  const requestedBudget = clamp(input.explorationBudget || 24, 12, 30)
  const perProfileBudget = clamp(Math.ceil(requestedBudget / 2.5), 10, 12)
  const rotatedProfiles = variationProfiles.map((_, index) => variationProfiles[(index + (input.variationIndex || 0)) % variationProfiles.length])
  const planCandidates: Array<{
    plan: PreviewCandidatePlan
    source: string
    planSignature: string
  }> = []
  const planKeys = new Set<string>()
  let duplicatePlansFiltered = 0

  for (const variation of rotatedProfiles) {
    const normalizedBaseIntent = normalizePreviewIntent({
      formatKey,
      baseIntent,
      profile,
      goal: input.goal,
      visualSystem: input.visualSystem,
      imageAnalysis: input.assetHint?.enhancedImage,
      override: variation.override,
    })
    const built = buildPreviewCandidatePlans({
      formatKey,
      master: input.master,
      profile,
      baseIntent: normalizedBaseIntent,
      goal: input.goal,
      visualSystem: input.visualSystem,
      assetHint: input.assetHint,
      imageAnalysis: input.assetHint?.enhancedImage,
      failureType: variation.failureType,
      baseFixStage: variation.fixStage,
      allowFamilyAlternatives: true,
      allowModelAlternatives: true,
      includeExtendedDiagnostics: true,
      budget: perProfileBudget,
    })
    for (const plan of built.plans) {
      const planSignature = `${createStructuralSignatureKey(plan.structuralSignature)}|${plan.fixStage}|${variation.id}`
      if (planKeys.has(planSignature)) {
        duplicatePlansFiltered += 1
        continue
      }
      planKeys.add(planSignature)
      planCandidates.push({
        plan: {
          ...plan,
          id: `${variation.id}-${plan.id}`,
          strategyLabel: `${variation.id}:${plan.strategyLabel}`,
          selectionReason: `${variation.source}; ${plan.selectionReason}`,
        },
        source: variation.source,
        planSignature,
      })
    }
  }

  const evaluated = planCandidates.map((entry) => {
    const candidate = evaluatePreviewCandidatePlan({
      plan: entry.plan,
      master: input.master,
      formatKey,
      profile,
      scenario,
      visualSystem: input.visualSystem,
      brandKit: input.brandKit,
      assetHint: input.assetHint,
      imageAnalysis: input.assetHint?.enhancedImage,
    })
    return {
      entry,
      candidate,
      structuralSignatureKey: createStructuralSignatureKey(candidate.structuralSignature),
      geometrySignature: createSceneGeometrySignature(candidate.scene),
    }
  })

  const uniqueCandidates: MarketplaceCardExplorationCandidate[] = []
  const candidateKeys = new Set<string>()
  let duplicateCandidatesFiltered = 0
  for (const current of [...evaluated].sort((left, right) => comparePreviewCandidates(left.candidate, right.candidate))) {
    const candidateKey = `${current.structuralSignatureKey}::${current.geometrySignature}`
    if (candidateKeys.has(candidateKey)) {
      duplicateCandidatesFiltered += 1
      continue
    }
    candidateKeys.add(candidateKey)
    uniqueCandidates.push({
      candidateId: current.entry.plan.id,
      source: current.entry.source,
      strategyLabel: current.candidate.strategyLabel,
      fixStage: current.candidate.fixStage,
      structuralArchetype: current.candidate.structuralArchetype,
      structuralSignature: current.candidate.structuralSignature,
      structuralSignatureKey: current.structuralSignatureKey,
      geometrySignature: current.geometrySignature,
      structuralStatus: current.candidate.structuralStatus,
      effectiveScore: current.candidate.scoreTrust.effectiveScore,
      scoreTrust: current.candidate.scoreTrust,
      topStructuralFindings: (current.candidate.assessment.structuralState?.findings || []).slice(0, 4).map((finding) => ({
        name: finding.name,
        severity: finding.severity,
      })),
      structuralFindingCount: current.candidate.structuralFindingCount,
      highStructuralFindingCount: current.candidate.highStructuralFindingCount,
      issueCount: current.candidate.issueCount,
      wouldNormallyBeSelected:
        current.geometrySignature === normalSelectedGeometrySignature ||
        current.candidate.strategyLabel === normalSelection.selected.strategyLabel,
      geometrySummary: {
        title: { x: current.candidate.scene.title.x, y: current.candidate.scene.title.y, w: current.candidate.scene.title.w, h: current.candidate.scene.title.h },
        subtitle: { x: current.candidate.scene.subtitle.x, y: current.candidate.scene.subtitle.y, w: current.candidate.scene.subtitle.w, h: current.candidate.scene.subtitle.h },
        cta: { x: current.candidate.scene.cta.x, y: current.candidate.scene.cta.y, w: current.candidate.scene.cta.w, h: current.candidate.scene.cta.h },
        logo: { x: current.candidate.scene.logo.x, y: current.candidate.scene.logo.y, w: current.candidate.scene.logo.w, h: current.candidate.scene.logo.h },
        badge: { x: current.candidate.scene.badge.x, y: current.candidate.scene.badge.y, w: current.candidate.scene.badge.w, h: current.candidate.scene.badge.h },
        image: { x: current.candidate.scene.image.x, y: current.candidate.scene.image.y, w: current.candidate.scene.image.w, h: current.candidate.scene.image.h },
      },
      scene: current.candidate.scene,
    })
  }

  return {
    formatKey: 'marketplace-card',
    explorationBudget: requestedBudget,
    variationIndex: input.variationIndex || 0,
    profile,
    scenario,
    baseIntent,
    normalBaseCandidate: {
      strategyLabel: normalBaseCandidate.strategyLabel,
      structuralArchetype: normalBaseCandidate.structuralArchetype,
      structuralStatus: normalBaseCandidate.structuralStatus,
      effectiveScore: normalBaseCandidate.scoreTrust.effectiveScore,
      geometrySignature: createSceneGeometrySignature(normalBaseCandidate.scene),
    },
    normalSelectedCandidate: {
      strategyLabel: normalSelection.selected.strategyLabel,
      structuralArchetype: normalSelection.selected.structuralArchetype,
      structuralStatus: normalSelection.selected.structuralStatus,
      effectiveScore: normalSelection.selected.scoreTrust.effectiveScore,
      geometrySignature: normalSelectedGeometrySignature,
    },
    attemptedCandidates: evaluated.length,
    duplicatePlansFiltered,
    duplicateCandidatesFiltered,
    candidates: uniqueCandidates.slice(0, requestedBudget),
  }
}

export function getPreviewCandidateStageDiagnostics(input: {
  master: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  baseFixStage?: PreviewCandidatePlan['fixStage']
}): PreviewCandidateStageDiagnostics {
  const format = FORMAT_MAP[input.formatKey]
  const profile = profileContent(input.master)
  const scenario = classifyScenario({
    profile,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageProfile: input.assetHint?.imageProfile,
  })
  const baseIntent = chooseLayoutIntent({
    format,
    master: input.master,
    profile,
    imageAnalysis: input.assetHint?.enhancedImage,
    visualSystem: input.visualSystem,
    goal: input.goal,
    assetHint: input.assetHint,
  })
  const selection = selectBestPreviewCandidate({
    master: input.master,
    formatKey: input.formatKey,
    profile,
    scenario,
    visualSystem: input.visualSystem,
    brandKit: input.brandKit,
    assetHint: input.assetHint,
    imageAnalysis: input.assetHint?.enhancedImage,
    baseIntent,
    goal: input.goal,
    baseFixStage: input.baseFixStage || 'base',
    allowFamilyAlternatives: true,
    allowModelAlternatives: true,
  })

  const buildCandidateStages = (candidate: PreviewCandidateEvaluation) => {
    const palette = computePalette({ brandKit: input.brandKit, visualSystem: input.visualSystem, scenario, imageDominantColors: input.assetHint?.enhancedImage?.dominantColors })
    const typography = computeTypography({
      format,
      profile,
      scenario,
      visualSystem: input.visualSystem,
      brandKit: input.brandKit,
      intent: candidate.intent,
      headlineText: input.master.title.text,
      subtitleText: input.master.subtitle.text,
      fixStage: candidate.fixStage,
    })
    const synthesis = getSynthesisStageDiagnostics({
      master: input.master,
      format,
      profile,
      palette,
      typography,
      intent: candidate.intent,
      brandKit: input.brandKit,
      assetHint: input.assetHint,
      imageAnalysis: input.assetHint?.enhancedImage,
    })
    const finalAssessment = getFormatAssessment(
      input.formatKey,
      synthesis.stages[synthesis.stages.length - 1].scene,
      synthesis.intent.compositionModelId,
      input.assetHint?.enhancedImage
    )
    return {
      strategyLabel: candidate.strategyLabel,
      structuralArchetype: candidate.structuralArchetype,
      structuralStatus: candidate.structuralStatus,
      stages: synthesis.stages,
      repacked: synthesis.repacked,
      finalAssessment,
    }
  }

  const baseCandidate = selection.candidates.find((candidate) => candidate.strategyLabel === 'base-heuristic') || selection.selected
  return {
    formatKey: input.formatKey,
    baseCandidate: buildCandidateStages(baseCandidate),
    selectedCandidate: buildCandidateStages(selection.selected),
  }
}

function findBrandTemplate(key: BrandTemplateKey) {
  return BRAND_TEMPLATES.find((item) => item.key === key) || BRAND_TEMPLATES[0]
}

function defaultBrandKit() {
  return clone(findBrandTemplate('startup-blue').brandKit)
}

function sceneToContentBlocks(scene: Scene): ContentBlock[] {
  const now = createTimestamp()
  return [
    { id: 'headline', role: 'headline', text: scene.title.text || '', enabled: Boolean((scene.title.text || '').trim()), createdAt: now, updatedAt: now },
    { id: 'subtitle', role: 'subtitle', text: scene.subtitle.text || '', enabled: Boolean((scene.subtitle.text || '').trim()), createdAt: now, updatedAt: now },
    { id: 'cta', role: 'cta', text: scene.cta.text || '', enabled: Boolean((scene.cta.text || '').trim()), createdAt: now, updatedAt: now },
    { id: 'badge', role: 'badge', text: scene.badge.text || '', enabled: Boolean((scene.badge.text || '').trim()), createdAt: now, updatedAt: now },
  ]
}

function buildVariantRecord(project: Project, formatKey: FormatKey): Variant {
  const format = FORMAT_MAP[formatKey]
  const scene = applyVariantManualOverride(project.formats[formatKey], formatKey, project.manualOverrides?.[formatKey])
  const expectedCompositionModelId =
    (project.manualOverrides?.[formatKey]?.selectedLayoutFamily
      ? selectCompositionModel({
          format,
          requestedFamily: project.manualOverrides[formatKey]?.selectedLayoutFamily,
        })?.id
      : undefined) ||
    project.variants?.[formatKey]?.compositionModelId
  const assessment = getFormatAssessment(formatKey, scene, expectedCompositionModelId, project.assetHint?.enhancedImage)
  const compositionModelId = assessment.compositionModelId || expectedCompositionModelId
  return {
    id: `${project.id || 'project'}-${formatKey}`,
    formatKey,
    formatFamily: getFormatFamily(format),
    scene: clone(scene),
    layoutIntentFamily: compositionModelId ? resolveCompositionModelFamily(compositionModelId) : project.variants?.[formatKey]?.layoutIntentFamily,
    compositionModelId,
    layoutBoxes: assessment.layoutBoxes,
    analysis: assessment.layoutAnalysis,
    structuralState: assessment.structuralState,
    fixSession: undefined,
    manualOverride: project.manualOverrides?.[formatKey],
    updatedAt: createTimestamp(),
  }
}

export function refreshProjectModel(project: Project) {
  return syncProjectModel(project)
}

function syncProjectModel(project: Project): Project {
  const now = createTimestamp()
  const next: Project = {
    ...project,
    id: project.id || crypto.randomUUID(),
    contentBlocks: sceneToContentBlocks(project.master),
    assets: project.assets || ([] as ProjectAsset[]),
    manualOverrides: project.manualOverrides || {},
    fixHistory: project.fixHistory || {},
    updatedAt: now,
  }
  next.variants = Object.fromEntries(
    Object.keys(next.formats).map((key) => {
      const formatKey = key as FormatKey
      return [formatKey, buildVariantRecord(next, formatKey)]
    })
  ) as Partial<Record<FormatKey, Variant>>
  return next
}

function elementKeyFromBlock(kind: keyof NonNullable<VariantManualOverride['blocks']> | string) {
  if (kind === 'headline') return 'title'
  if (kind === 'subtitle' || kind === 'body') return 'subtitle'
  if (kind === 'price' || kind === 'badge') return 'badge'
  return kind
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function buildManualTypographyPlan(scene: Scene): TypographyPlan {
  return {
    titleSize: scene.title.fontSize || 32,
    titleWeight: scene.title.weight || 700,
    titleWidth: scene.title.w || 42,
    titleCharsPerLine: scene.title.charsPerLine || 20,
    titleMaxLines: scene.title.maxLines || 3,
    subtitleSize: scene.subtitle.fontSize || 16,
    subtitleWidth: scene.subtitle.w || 42,
    subtitleCharsPerLine: scene.subtitle.charsPerLine || 30,
    subtitleMaxLines: scene.subtitle.maxLines || 4,
    subtitleOpacity: scene.subtitle.opacity || 0.88,
    ctaSize: scene.cta.fontSize || 16,
    badgeSize: scene.badge.fontSize || 14,
    lineHeightTitle: 1.02,
    lineHeightSubtitle: 1.18,
    alignment: 'left',
    bodySize: scene.subtitle.fontSize || 16,
    bodyWidth: scene.subtitle.w || 42,
  }
}

function reflowManualTypography(scene: Scene, formatKey: FormatKey) {
  const format = FORMAT_MAP[formatKey]
  const ruleSet = getFormatRuleSet(format)
  const plan = buildManualTypographyPlan(scene)
  const headline = recomputeTextBlockTypography({
    role: 'headline',
    text: scene.title.text,
    regionWidthPercent: scene.title.w || plan.titleWidth,
    format,
    plan,
  })
  scene.title.fontSize = headline.fontSize
  scene.title.charsPerLine = headline.charsPerLine
  scene.title.maxLines = headline.maxLines
  scene.title.w = clamp(scene.title.w || plan.titleWidth, 18, Math.round((ruleSet.typography.headline.maxWidth / format.width) * 100))

  const subtitle = recomputeTextBlockTypography({
    role: 'subtitle',
    text: scene.subtitle.text,
    regionWidthPercent: scene.subtitle.w || plan.subtitleWidth,
    format,
    plan,
  })
  scene.subtitle.fontSize = subtitle.fontSize
  scene.subtitle.charsPerLine = subtitle.charsPerLine
  scene.subtitle.maxLines = subtitle.maxLines
  scene.subtitle.w = clamp(scene.subtitle.w || plan.subtitleWidth, 18, Math.round((ruleSet.typography.subtitle.maxWidth / format.width) * 100))
  scene.cta.fontSize = clamp(scene.cta.fontSize || plan.ctaSize, ruleSet.typography.cta.minFontSize, ruleSet.typography.cta.maxFontSize)
  if (ruleSet.elements.cta.minH) {
    scene.cta.h = Math.max(scene.cta.h || 0, (ruleSet.elements.cta.minH / format.height) * 100)
  }
}

function applyImageRolePreset(scene: Scene, format: FormatKey, role?: VariantManualOverride['imageRolePreset']) {
  if (!role) return scene
  const next = clone(scene)
  const definition = FORMAT_MAP[format]
  if (role === 'hero') {
    next.image.x = definition.family === 'wide' ? 46 : 4
    next.image.y = 4
    next.image.w = definition.family === 'wide' ? 48 : 92
    next.image.h = definition.family === 'wide' ? 84 : 46
    next.image.fit = definition.family === 'portrait' || definition.family === 'skyscraper' ? 'xMidYMin slice' : 'xMidYMid slice'
  } else if (role === 'background') {
    next.image.x = 4
    next.image.y = 4
    next.image.w = 92
    next.image.h = 88
    next.image.fit = 'xMidYMid slice'
  } else if (role === 'framed') {
    next.image.rx = definition.family === 'wide' ? 18 : 28
    next.image.w = definition.family === 'wide' ? 34 : 72
    next.image.h = definition.family === 'wide' ? 68 : 34
    next.image.x = definition.family === 'wide' ? 58 : 14
    next.image.y = definition.family === 'wide' ? 12 : 12
  } else if (role === 'split-left') {
    next.image.x = 6
    next.image.y = 12
    next.image.w = definition.family === 'wide' ? 36 : 30
    next.image.h = definition.family === 'wide' ? 72 : 56
  } else if (role === 'split-right') {
    next.image.x = definition.family === 'wide' ? 58 : 56
    next.image.y = 12
    next.image.w = definition.family === 'wide' ? 36 : 30
    next.image.h = definition.family === 'wide' ? 72 : 56
  } else if (role === 'accent') {
    next.image.w = definition.family === 'wide' ? 16 : 24
    next.image.h = definition.family === 'wide' ? 54 : 24
    next.image.x = definition.family === 'wide' ? 74 : 66
    next.image.y = definition.family === 'portrait' ? 18 : 14
    next.image.rx = 18
  }
  return next
}

export function applyVariantManualOverride(scene: Scene, formatKey: FormatKey, override?: VariantManualOverride) {
  if (!override) return clone(scene)
  let next = applyImageRolePreset(scene, formatKey, override.imageRolePreset)
  const format = FORMAT_MAP[formatKey]
  const compositionModel = override.selectedLayoutFamily
    ? selectCompositionModel({
        format,
        requestedFamily: override.selectedLayoutFamily,
      })
    : null
  const blocks = override.blocks || {}
  for (const [kind, patch] of Object.entries(blocks)) {
    const elementKey = elementKeyFromBlock(kind) as keyof Scene
    const currentElement = next[elementKey] as Record<string, unknown>
    next = {
      ...next,
      [elementKey]: {
        ...currentElement,
        ...(patch || {}),
      },
    }
  }
  reflowManualTypography(next, formatKey)
  return finalizeSceneGeometry(next, format, compositionModel)
}

function getVisualSystem(key: VisualSystemKey) {
  return VISUAL_SYSTEMS.find((item) => item.key === key) || VISUAL_SYSTEMS[0]
}

let aiFixStrategySelector:
  | ((input: {
      assessment: LayoutAssessment
      review?: LayoutAssessment['aiReview']
      intent: LayoutIntent
      profile: ContentProfile
      formatKey: FormatKey
      formatFamily: FormatFamily
      previousFixState?: FixSessionState
      scoreTrust?: ScoreTrust
    }) => Promise<AIFixStrategy>)
  | null = null

export function setAIFixStrategySelector(
  selector:
    | ((input: {
        assessment: LayoutAssessment
        review?: LayoutAssessment['aiReview']
        intent: LayoutIntent
        profile: ContentProfile
        formatKey: FormatKey
        formatFamily: FormatFamily
        previousFixState?: FixSessionState
        scoreTrust?: ScoreTrust
      }) => Promise<AIFixStrategy>)
    | null
) {
  aiFixStrategySelector = selector
}

function unique<T>(items: T[]) {
  return [...new Set(items)]
}

type AutoFixStructuralEscalationContext = {
  master: Scene
  profile: ContentProfile
  scenario: ReturnType<typeof classifyScenario>
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
  baseIntent: LayoutIntent
}

const BLOCK_FIX_PRIORITY: Record<BlockFixSuggestion['target'], number> = {
  image: 100,
  headline: 92,
  subtitle: 68,
  body: 64,
  cta: 82,
  logo: 44,
  badge: 62,
  price: 78,
  textCluster: 74,
  imageText: 80,
  global: 70,
}

function mapPlanActionToFixAction(action: string, formatFamily: FormatFamily): FixAction | null {
  const directMap: Partial<Record<string, FixAction>> = {
    'increase-headline-size': 'increase-headline-size',
    'reduce-headline-size': 'reduce-headline-size',
    'reflow-headline': 'reflow-headline',
    'widen-text-container': 'widen-text-container',
    'narrow-text-container': 'narrow-text-container',
    'loosen-cluster': 'increase-cluster-padding',
    'compress-cluster': 'compress-text-region',
    'change-hierarchy-ratios': 'rebalance-text-cluster',
    'increase-body-size': 'widen-text-container',
    'increase-cta-size': 'increase-cta-prominence',
    'increase-cta-contrast': 'increase-cta-prominence',
    'move-cta-closer-to-text': 'move-cta-closer-to-text',
    'reposition-cta': 'move-cta-closer-to-text',
    'move-logo-to-anchor-zone': 'move-logo-to-anchor',
    'resize-logo': 'move-logo-to-anchor',
    'improve-spacing-around-logo': 'increase-cluster-padding',
    'recompute-image-crop': 'recompute-image-crop',
    'change-image-role': 'switch-image-role',
    'change-image-anchor': 'change-image-anchor',
    'change-image-shape': 'change-image-shape',
    'change-image-footprint': 'rebalance-split-ratio',
    'rebalance-image-text-relationship': 'rebalance-split-ratio',
    'raise-cluster': 'raise-text-cluster',
    'center-cluster': 'rebalance-text-cluster',
    'rebuild-cluster-layout': 'rebalance-text-cluster',
    'adjust-image-text-spacing': 'rebalance-split-ratio',
    'rebalance-split-ratio': 'rebalance-split-ratio',
    'change-image-text-dominance': formatFamily === 'presentation' || formatFamily === 'display-rectangle' ? 'switch-to-text-first' : 'switch-to-image-first',
    'reduce-dead-space': 'reduce-dead-space',
    'increase-scale-to-canvas': 'increase-scale-to-canvas',
    'change-layout-family': 'change-layout-family',
    'integrate-badge-into-cluster': 'rebalance-text-cluster',
    'reposition-badge': 'rebalance-text-cluster',
    'reduce-badge-prominence': 'compress-text-region',
  }
  return directMap[action] || null
}

function analysisToIssueBuckets(analysis: LayoutAnalysis) {
  const blockIssues = unique([
    ...(analysis.blocks.headline?.issues || []),
    ...(analysis.blocks.subtitle?.issues || []),
    ...(analysis.blocks.body?.issues || []),
    ...(analysis.blocks.badge?.issues || []),
    ...(analysis.blocks.price?.issues || []),
    ...(analysis.blocks.cta?.issues || []),
    ...(analysis.blocks.logo?.issues || []),
    ...(analysis.blocks.image?.issues || []),
  ])
  const clusterIssues = unique([
    ...(analysis.clusters.textCluster?.issues || []),
    ...(analysis.clusters.imageText?.issues || []),
  ])
  const globalIssues = [...analysis.global.issues]

  return { blockIssues, clusterIssues, globalIssues }
}

function buildFixPlanFromAnalysis(analysis: LayoutAnalysis, formatKey: FormatKey, formatFamily: FormatFamily, intent: LayoutIntent): LayoutFixPlan {
  const blockFixes: BlockFixSuggestion[] = []
  const addFix = (target: BlockFixSuggestion['target'], score: number | undefined, issues: string[] | undefined, suggestedFixes: string[] | undefined) => {
    if (!issues?.length && (score || 100) >= 78) return
    const actions = uniqueStringFixes(suggestedFixes || [])
    if (!actions.length) return
    blockFixes.push({
      target,
      actions,
      priority: BLOCK_FIX_PRIORITY[target] + Math.max(0, 80 - Math.round(score || 80)),
    })
  }

  addFix('image', analysis.blocks.image?.score, analysis.blocks.image?.issues, analysis.blocks.image?.suggestedFixes)
  addFix('headline', analysis.blocks.headline?.score, analysis.blocks.headline?.issues, analysis.blocks.headline?.suggestedFixes)
  addFix('cta', analysis.blocks.cta?.score, analysis.blocks.cta?.issues, analysis.blocks.cta?.suggestedFixes)
  addFix('logo', analysis.blocks.logo?.score, analysis.blocks.logo?.issues, analysis.blocks.logo?.suggestedFixes)
  addFix('subtitle', analysis.blocks.subtitle?.score, analysis.blocks.subtitle?.issues, analysis.blocks.subtitle?.suggestedFixes)
  addFix('body', analysis.blocks.body?.score, analysis.blocks.body?.issues, analysis.blocks.body?.suggestedFixes)
  addFix('badge', analysis.blocks.badge?.score, analysis.blocks.badge?.issues, analysis.blocks.badge?.suggestedFixes)
  addFix('price', analysis.blocks.price?.score, analysis.blocks.price?.issues, analysis.blocks.price?.suggestedFixes)
  addFix('textCluster', analysis.clusters.textCluster?.score, analysis.clusters.textCluster?.issues, analysis.clusters.textCluster?.suggestedFixes)
  addFix('imageText', analysis.clusters.imageText?.score, analysis.clusters.imageText?.issues, analysis.clusters.imageText?.suggestedFixes)
  addFix('global', analysis.global.score, analysis.global.issues, analysis.global.suggestedFixes)

  const requiresStructuralRebuild =
    analysis.global.score < 72 ||
    (analysis.blocks.image?.score || 100) < 68 ||
    (analysis.clusters.imageText?.score || 100) < 70 ||
    analysis.global.issues.includes('format-fit-weak') ||
    analysis.global.issues.includes('composition-underscaled') ||
    analysis.global.issues.includes('dead-space-dominates')

  return {
    blockFixes: blockFixes.sort((left, right) => right.priority - left.priority),
    requiresStructuralRebuild,
    suggestedLayoutFamily:
      requiresStructuralRebuild || analysis.global.issues.includes('format-fit-weak')
        ? getAlternativeIntent(intent, formatKey, formatFamily).family
        : undefined,
  }
}

function uniqueStringFixes(fixes: string[]) {
  return [...new Set(fixes.filter(Boolean))]
}

function planToActions(plan: LayoutFixPlan, formatFamily: FormatFamily, limit = 6) {
  return unique(
    plan.blockFixes
      .flatMap((fix) => fix.actions)
      .map((action) => mapPlanActionToFixAction(action, formatFamily))
      .filter((action): action is FixAction => Boolean(action))
  ).slice(0, limit)
}

function resolveAllowedFamily(formatKey: FormatKey, family: LayoutIntentFamily) {
  const ruleSet = getFormatRuleSet(FORMAT_MAP[formatKey])
  return ruleSet.allowedLayoutFamilies.includes(family) ? family : ruleSet.allowedLayoutFamilies[0]
}

function collectFixActions(messages: string[]): FixAction[] {
  const actions: FixAction[] = []

  for (const message of messages) {
    const normalized = message.toLowerCase()
    if (normalized.includes('contrast')) actions.push('boost-contrast')
    if (normalized.includes('overlay')) actions.push('lighten-overlay')
    if (normalized.includes('breathing room') || normalized.includes('overlap')) actions.push('increase-cluster-padding')
    if (normalized.includes('detached')) actions.push('reduce-dead-space')
    if (normalized.includes('headline')) actions.push('increase-headline-size')
    if (normalized.includes('line break') || normalized.includes('rhythm')) actions.push('improve-line-breaks')
    if (normalized.includes('body') || normalized.includes('subtitle')) actions.push('widen-text-container')
    if (normalized.includes('cta')) actions.push('increase-cta-prominence')
    if (normalized.includes('offer') || normalized.includes('badge')) actions.push('promote-offer')
    if (normalized.includes('image feels too small') || normalized.includes('image presence is too weak')) actions.push('increase-image-presence')
    if (normalized.includes('dead space') || normalized.includes('dead zone') || normalized.includes('too low') || normalized.includes('unbalanced')) actions.push('rebalance-text-cluster')
    if (normalized.includes('empty on the right')) actions.push('reduce-dead-space')
  }

  return unique(actions)
}

function buildPrimaryStructuralEscalationStrategy(formatKey: FormatKey, candidate: PreviewCandidateEvaluation): RepairStrategy {
  return {
    kind: 'structural-regeneration',
    candidateKind: 'guided-regeneration-repair',
    label: `run-auto-fix-escalation:${candidate.strategyLabel}`,
    reason: 'Use a bounded structural regeneration fallback when local fixes cannot rescue the primary format baseline.',
    actions: ['change-layout-family'],
    fixStage: candidate.fixStage === 'structural' ? 'structural' : 'regional',
    overrideIntent: candidate.intent,
  }
}

function pickPrimaryStructuralEscalationCandidate(input: {
  current: RepairEvaluatedScene
  selection: PreviewCandidateSelection
}) {
  return input.selection.candidates.find((candidate) => {
    if (candidate.scene === input.selection.selected.scene) return false
    if (createRepairSceneSignature(candidate.scene) === input.current.sceneSignature) return false
    return candidate.fixStage === 'regional' || candidate.fixStage === 'structural' || candidate.strategyLabel.startsWith('recovery-')
  })
}

function runAutoFix(
  scene: Scene,
  formatKey: FormatKey,
  assessment?: LayoutAssessment,
  imageAnalysis?: EnhancedImageAnalysis,
  expectedCompositionModelId?: Variant['compositionModelId'],
  escalationContext?: AutoFixStructuralEscalationContext,
  allowStructuralEscalation = true
) {
  const format = FORMAT_MAP[formatKey]
  const compositionModel = expectedCompositionModelId ? getCompositionModel(format, expectedCompositionModelId) : null
  let best = evaluateRepairSceneSync({
    scene: clone(scene),
    formatKey,
    assessment,
    expectedCompositionModelId,
    imageAnalysis,
    strategyLabel: 'run-auto-fix-current',
  })
  const triedAttemptSignatures = new Set<string>()
  const seenOutcomeSignatures = new Set<string>([best.sceneSignature])
  const classification = classifyStructuralFailure(best.assessment)

  for (let pass = 0; pass < 3; pass += 1) {
    const currentAssessment = pass === 0 ? best.assessment : getFormatAssessment(formatKey, best.scene, expectedCompositionModelId, imageAnalysis)
    if (currentAssessment.score >= 88 && best.structuralStatus === 'valid') return best.scene
    const actions = (
      currentAssessment.recommendedFixes && currentAssessment.recommendedFixes.length
        ? currentAssessment.recommendedFixes
        : collectFixActions(currentAssessment.issues.map((issue) => issue.message || issue.text || ''))
    ).slice(0, 4)
    if (!actions.length) return best.scene
    const strategy: RepairStrategy = {
      kind: 'local-structural',
      label: `run-auto-fix-pass-${pass + 1}`,
      reason: 'Apply lightweight local fixes only when they actually improve the scene.',
      actions,
      fixStage: 'local',
    }
    const attemptSignature = createRepairAttemptSignature({
      beforeSceneSignature: best.sceneSignature,
      strategy,
      classification,
    })
    if (triedAttemptSignatures.has(attemptSignature)) return best.scene
    triedAttemptSignatures.add(attemptSignature)
    let candidate = clone(best.scene)
    actions.forEach((action) => {
      candidate = applyFixAction({ scene: candidate, action, format, imageAnalysis, compositionModel })
    })
    candidate = finalizeSceneGeometry(candidate, format, compositionModel)
    const candidateEvaluation = evaluateRepairSceneSync({
      scene: candidate,
      formatKey,
      expectedCompositionModelId,
      imageAnalysis,
      strategyLabel: strategy.label,
      actions,
    })
    const decision = buildRepairDecision({
      before: best,
      after: candidateEvaluation,
      strategy,
      classification,
      attemptSignature,
      knownOutcomeRepeat:
        seenOutcomeSignatures.has(candidateEvaluation.sceneSignature) &&
        candidateEvaluation.sceneSignature !== best.sceneSignature,
    })
    if (decision.accepted) {
      best = candidateEvaluation
      seenOutcomeSignatures.add(best.sceneSignature)
    } else {
      break
    }
  }

  if (
    allowStructuralEscalation &&
    escalationContext &&
    supportsPrimaryStructuralEscalation(formatKey) &&
    best.structuralStatus === 'invalid'
  ) {
    const escalationSelection = selectBestPreviewCandidate({
      master: escalationContext.master,
      formatKey,
      profile: escalationContext.profile,
      scenario: escalationContext.scenario,
      visualSystem: escalationContext.visualSystem,
      brandKit: escalationContext.brandKit,
      assetHint: escalationContext.assetHint,
      imageAnalysis: escalationContext.imageAnalysis,
      baseIntent: escalationContext.baseIntent,
      goal: escalationContext.goal,
      baseFixStage: 'regional',
      allowFamilyAlternatives: true,
      allowModelAlternatives: true,
      budget: getDefaultPreviewCandidateBudget(formatKey) + 1,
      includeExtendedDiagnostics: true,
      failureType: classifyStructuralFailure(best.assessment).dominantType,
    })
    const escalationCandidate = pickPrimaryStructuralEscalationCandidate({
      current: best,
      selection: escalationSelection,
    })

    if (escalationCandidate) {
      const escalatedScene = runAutoFix(
        escalationCandidate.scene,
        formatKey,
        escalationCandidate.assessment,
        escalationContext.imageAnalysis,
        escalationCandidate.intent.compositionModelId,
        undefined,
        false
      )
      const escalatedEvaluation = evaluateRepairSceneSync({
        scene: escalatedScene,
        formatKey,
        expectedCompositionModelId: escalationCandidate.intent.compositionModelId,
        imageAnalysis: escalationContext.imageAnalysis,
        strategyLabel: `run-auto-fix-escalated:${escalationCandidate.strategyLabel}`,
      })
      const escalationDecision = buildRepairDecision({
        before: best,
        after: escalatedEvaluation,
        strategy: buildPrimaryStructuralEscalationStrategy(formatKey, escalationCandidate),
        classification: classifyStructuralFailure(best.assessment),
      })
      if (escalationDecision.accepted) {
        best = escalatedEvaluation
      }
    }
  }

  return best.scene
}

export function createMasterScene(template: TemplateKey, brandKit: BrandKit) {
  return clone(baseScene(template, brandKit.background, brandKit.accentColor))
}

function normalizeImageHint(assetHint?: AssetHint, imageAnalysis?: EnhancedImageAnalysis): AssetHint | undefined {
  const base = assetHint ? clone(assetHint) : {}
  const enhanced = imageAnalysis || assetHint?.enhancedImage
  if (!enhanced && !assetHint) return undefined
  if (!enhanced) return base

  return {
    ...base,
    imageProfile: enhanced.imageProfile,
    detectedContrast: enhanced.detectedContrast,
    focalSuggestion: enhanced.focalSuggestion,
    enhancedImage: enhanced,
  }
}

function buildDeterministicVariant({
  master,
  formatKey,
  visualSystem,
  brandKit,
  goal,
  assetHint,
}: {
  master: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
}) {
  const format = FORMAT_MAP[formatKey]
  const contentProfile = profileContent(master)
  const scenario = classifyScenario({
    profile: contentProfile,
    goal,
    visualSystem,
    imageProfile: assetHint?.imageProfile,
  })
  const intent = chooseLayoutIntent({
    format,
    master,
    profile: contentProfile,
    imageAnalysis: assetHint?.enhancedImage,
    visualSystem,
    goal,
    assetHint,
  })
  const selection = selectBestPreviewCandidate({
    master,
    formatKey,
    profile: contentProfile,
    scenario,
    visualSystem,
    brandKit,
    assetHint,
    imageAnalysis: assetHint?.enhancedImage,
    baseIntent: intent,
    goal,
    baseFixStage: 'base',
    allowFamilyAlternatives: true,
    allowModelAlternatives: true,
  })
  const fixedScene = runAutoFix(
    selection.selected.scene,
    formatKey,
    selection.selected.assessment,
    assetHint?.enhancedImage,
    selection.selected.intent.compositionModelId,
    {
      master,
      profile: contentProfile,
      scenario,
      visualSystem,
      brandKit,
      goal,
      assetHint,
      imageAnalysis: assetHint?.enhancedImage,
      baseIntent: intent,
    }
  )
  const fixedAssessment = getFormatAssessment(
    formatKey,
    fixedScene,
    selection.selected.intent.compositionModelId,
    assetHint?.enhancedImage
  )
  const fixedTrust = computeScoreTrust(fixedAssessment)
  return finalizePrimarySelectedOutcomeSync({
    formatKey,
    selection,
    currentScene: fixedScene,
    currentAssessment: fixedAssessment,
    currentScoreTrust: fixedTrust,
    imageAnalysis: assetHint?.enhancedImage,
    escalationContext: {
      master,
      profile: contentProfile,
      scenario,
      visualSystem,
      brandKit,
      goal,
      assetHint,
      imageAnalysis: assetHint?.enhancedImage,
      baseIntent: intent,
    },
  }).scene
}

export async function generateVariant(input: {
  master: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  imageUrl?: string
  assetHint?: AssetHint
  overrideIntent?: Partial<LayoutIntent>
  fixStage?: 'base' | 'local' | 'regional' | 'structural'
}): Promise<{
  scene: Scene
  profile: ContentProfile
  contentAnalysis: AIContentAnalysis
  imageAnalysis?: EnhancedImageAnalysis
  intent: LayoutIntent
  assessment: LayoutAssessment
  scoreTrust: ScoreTrust
}> {
  const format = FORMAT_MAP[input.formatKey]
  const creativeInput = extractCreativeInput(input.master)
  const contentAnalysis = await aiAnalyzeContent(creativeInput)
  const profile = buildEnhancedContentProfile(creativeInput, contentAnalysis)
  const imageAnalysis =
    input.imageUrl && !input.imageUrl.startsWith('data:application/pdf')
      ? await aiAnalyzeImage({ url: input.imageUrl })
      : input.assetHint?.enhancedImage
  const assetHint = normalizeImageHint(input.assetHint, imageAnalysis)
  const scenario = classifyScenario({
    profile,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageProfile: assetHint?.imageProfile,
  })
  const baseIntent = await aiChooseLayoutStrategy({
    format,
    master: input.master,
    profile,
    imageAnalysis,
    brandTone: input.brandKit.toneOfVoice,
    visualSystem: input.visualSystem,
    goal: input.goal,
    imageProfile: assetHint?.imageProfile,
  })
  const rawIntent = { ...baseIntent, ...(input.overrideIntent || {}) }
  const intent = {
    ...rawIntent,
    family: resolveAllowedFamily(input.formatKey, rawIntent.family),
    presetId: resolveAllowedFamily(input.formatKey, rawIntent.family),
    compositionModelId:
      rawIntent.compositionModelId ||
      selectCompositionModel({
        format,
        requestedFamily: resolveAllowedFamily(input.formatKey, rawIntent.family),
        denseText: profile.density === 'dense',
      })?.id,
  }
  const selection = selectBestPreviewCandidate({
    master: input.master,
    formatKey: input.formatKey,
    profile,
    scenario,
    visualSystem: input.visualSystem,
    brandKit: input.brandKit,
    assetHint,
    imageAnalysis,
    baseIntent: intent,
    goal: input.goal,
    baseFixStage: input.fixStage || 'base',
    allowFamilyAlternatives: !input.overrideIntent?.family && (input.fixStage || 'base') === 'base',
    allowModelAlternatives: !input.overrideIntent?.compositionModelId,
  })

  let assessment = selection.selected.assessment
  const aiReview = await aiReviewLayout(selection.selected.scene, { format, assessment })
  assessment = { ...assessment, aiReview }
  const fixed = runAutoFix(
    selection.selected.scene,
    input.formatKey,
    assessment,
    imageAnalysis,
    selection.selected.intent.compositionModelId,
    {
      master: input.master,
      profile,
      scenario,
      visualSystem: input.visualSystem,
      brandKit: input.brandKit,
      goal: input.goal,
      assetHint: input.assetHint,
      imageAnalysis,
      baseIntent: intent,
    }
  )
  const fixedAssessment = getFormatAssessment(
    input.formatKey,
    fixed,
    selection.selected.intent.compositionModelId,
    imageAnalysis
  )
  const fixedTrust = computeScoreTrust(fixedAssessment)
  const finalizedSelection = finalizePrimarySelectedOutcomeSync({
    formatKey: input.formatKey,
    selection,
    currentScene: fixed,
    currentAssessment: fixedAssessment,
    currentScoreTrust: fixedTrust,
    imageAnalysis,
    escalationContext: {
      master: input.master,
      profile,
      scenario,
      visualSystem: input.visualSystem,
      brandKit: input.brandKit,
      goal: input.goal,
      assetHint: input.assetHint,
      imageAnalysis,
      baseIntent: intent,
    },
  })
  const squareSubtitleCtaRepaired =
    input.formatKey === 'social-square' && (input.fixStage || 'base') !== 'base'
      ? applySquareSubtitleCtaPairingStructuralRepair({
          scene: finalizedSelection.scene,
          formatKey: input.formatKey,
          profile,
          visualSystem: input.visualSystem,
          brandKit: input.brandKit,
          goal: input.goal,
          intent: finalizedSelection.intent,
          assetHint,
        })
      : finalizedSelection.scene
  const finalAssessmentBase = getFormatAssessment(
    input.formatKey,
    squareSubtitleCtaRepaired,
    finalizedSelection.compositionModelId,
    imageAnalysis
  )
  const finalAIReview = await aiReviewLayout(squareSubtitleCtaRepaired, {
    format,
    assessment: finalAssessmentBase,
  })
  const finalAssessment = { ...finalAssessmentBase, aiReview: finalAIReview }
  const scoreTrust = computeScoreTrust(finalAssessment, finalAIReview)

  return {
    scene: squareSubtitleCtaRepaired,
    profile,
    contentAnalysis,
    imageAnalysis,
    intent: selection.selected.intent,
    assessment: finalAssessment,
    scoreTrust,
  }
}

function heuristicFixStrategy({
  assessment,
  review,
  intent,
  formatFamily,
  previousFixState,
  scoreTrust,
}: {
  assessment: LayoutAssessment
  review?: LayoutAssessment['aiReview']
  intent: LayoutIntent
  formatFamily: FormatFamily
  previousFixState?: FixSessionState
  scoreTrust?: ScoreTrust
}): AIFixStrategy {
  const issueText = [...assessment.issues.map((issue) => issue.code), ...(review?.issues || [])].join(' ').toLowerCase()
  const tried = new Set(previousFixState?.actionsApplied || [])
  const disagreementHigh = (scoreTrust?.disagreement || 0) >= 14
  const billboardLike = formatFamily === 'billboard' || formatFamily === 'display-leaderboard'
  const portraitLike = formatFamily === 'portrait' || formatFamily === 'display-skyscraper'
  const squareLike = formatFamily === 'square'
  const presentationLike = formatFamily === 'presentation'
  const squareStructuralIssue =
    squareLike &&
    (
      issueText.includes('violates-model-slot') ||
      issueText.includes('violates-model-block-size') ||
      issueText.includes('violates-model-text-structure') ||
      issueText.includes('outside-safe-area') ||
      issueText.includes('violates-allowed-zone') ||
      issueText.includes('text-cluster-too-tight') ||
      issueText.includes('logo-outside-safe-area') ||
      issueText.includes('headline-logo-overlap') ||
      issueText.includes('box-collision')
    )
  const squareOverlayExhausted = isSquareOverlayExhaustedScenario({
    assessment,
    intent,
    formatFamily,
    previousFixState,
  })

  return {
    changeLayoutFamily:
      issueText.includes('underuses-width') ||
      issueText.includes('web-banner-inside-wide-canvas') ||
      issueText.includes('web-banner-inside-billboard') ||
      issueText.includes('composition-underscaled') ||
      issueText.includes('billboard-scale-too-weak') ||
      issueText.includes('compressed-horizontal-failure') ||
      issueText.includes('slide-structure-weak') ||
      squareStructuralIssue ||
      squareOverlayExhausted ||
      disagreementHigh ||
      previousFixState?.iteration === 2,
    suggestedFamily:
      (squareStructuralIssue || squareOverlayExhausted) && intent.family !== 'square-image-top-text-bottom'
        ? 'square-image-top-text-bottom'
      :
      billboardLike && intent.family !== (formatFamily === 'display-leaderboard' ? 'leaderboard-compact-horizontal' : 'billboard-wide-balanced')
        ? (formatFamily === 'display-leaderboard' ? 'leaderboard-compact-horizontal' : 'billboard-wide-balanced')
        : issueText.includes('compressed-horizontal-failure') && intent.family !== 'leaderboard-compact-horizontal'
          ? 'leaderboard-compact-horizontal'
        :
        issueText.includes('underuses-width') && intent.family !== 'billboard-wide-hero'
        ? 'billboard-wide-hero'
        : portraitLike && issueText.includes('text-cluster-too-low')
          ? 'portrait-bottom-card'
          : presentationLike
            ? 'presentation-structured-cover'
          : (issueText.includes('inactive-empty-space') || issueText.includes('inactive-wide-space')) && intent.family !== 'landscape-text-left-image-right'
            ? 'landscape-text-left-image-right'
            : undefined,
    increaseHeadlineProminence:
      !squareStructuralIssue &&
      !squareOverlayExhausted &&
      !tried.has('increase-headline-size') &&
      (issueText.includes('headline') || (assessment.metrics?.textHierarchy || 100) < 76),
    strengthenCTA: !tried.has('increase-cta-prominence') && (issueText.includes('cta') || (assessment.metrics?.ctaProminence || 100) < 76),
    reduceOverlay: issueText.includes('overlay') || (assessment.metrics?.overlayHeaviness || 100) < 76,
    rebalanceImageText: !tried.has('rebalance-text-cluster') && (issueText.includes('detached') || (assessment.metrics?.imageTextHarmony || 100) < 76),
    widenTextContainer:
      issueText.includes('line-break') ||
      issueText.includes('text-rhythm-poor') ||
      issueText.includes('compressed-horizontal-failure') ||
      squareStructuralIssue || squareOverlayExhausted,
    increaseImagePresence: !tried.has('increase-image-presence') && (issueText.includes('image-too-weak') || issueText.includes('underuses-width') || billboardLike),
    reduceDeadSpace: !tried.has('reduce-dead-space') && (issueText.includes('dead-space') || issueText.includes('inactive-empty-space') || issueText.includes('layout-too-empty') || squareLike),
    moveTextCluster: portraitLike && (issueText.includes('text-cluster-too-low') || issueText.includes('bottom-heavy'))
      ? 'up'
      : squareLike && issueText.includes('imbalanced-square')
        ? 'center'
        : issueText.includes('visual-balance-broken') || issueText.includes('inactive-empty-space') || issueText.includes('inactive-wide-space')
          ? 'left'
          : disagreementHigh
            ? 'center'
            : undefined,
    reflowHeadline:
      issueText.includes('headline-line-breaks-awkward') ||
      issueText.includes('headline-rhythm-poor') ||
      squareStructuralIssue || squareOverlayExhausted,
    improveLogoAnchoring: issueText.includes('logo'),
  }
}

async function chooseFixStrategy(input: {
  assessment: LayoutAssessment
  review?: LayoutAssessment['aiReview']
  intent: LayoutIntent
  profile: ContentProfile
  formatKey: FormatKey
  formatFamily: FormatFamily
  previousFixState?: FixSessionState
  scoreTrust?: ScoreTrust
}): Promise<AIFixStrategy> {
  const heuristic = heuristicFixStrategy(input)
  if (!aiFixStrategySelector) return heuristic

  try {
    const refined = await aiFixStrategySelector(input)
    return { ...heuristic, ...refined }
  } catch {
    return heuristic
  }
}

function fixActionsFromStrategy(strategy: AIFixStrategy, assessment: LayoutAssessment, formatFamily: FormatFamily): FixAction[] {
  const actions: FixAction[] = []
  const issueCodes = assessment.issues.map((issue) => issue.code)
  const squareStructuralIssue =
    formatFamily === 'square' &&
    issueCodes.some((code) =>
      code === 'outside-safe-area' ||
      code === 'violates-allowed-zone' ||
      code === 'violates-model-slot' ||
      code === 'violates-model-block-size' ||
      code === 'violates-model-text-structure' ||
      code === 'headline-logo-overlap' ||
      code === 'box-collision'
    )
  if (strategy.increaseHeadlineProminence) actions.push('increase-headline-size')
  if (strategy.strengthenCTA) actions.push('increase-cta-prominence', 'move-cta-closer-to-text')
  if (strategy.rebalanceImageText) actions.push('rebalance-text-cluster')
  if (strategy.increaseImagePresence) actions.push(formatFamily === 'billboard' || formatFamily === 'display-leaderboard' ? 'rebalance-split-ratio' : 'increase-image-presence')
  if (strategy.reduceDeadSpace) actions.push(formatFamily === 'billboard' || formatFamily === 'landscape' || formatFamily === 'display-leaderboard' ? 'rebalance-split-ratio' : 'reduce-dead-space')
  if (strategy.reduceOverlay) actions.push('lighten-overlay')
  if (strategy.widenTextContainer) actions.push('widen-text-container', 'improve-line-breaks')
  if (strategy.moveTextCluster === 'up') actions.push('raise-text-cluster')
  if (strategy.moveTextCluster === 'left') actions.push(formatFamily === 'billboard' || formatFamily === 'landscape' ? 'rebalance-split-ratio' : 'reduce-dead-space')
  if (strategy.moveTextCluster === 'center') actions.push('rebalance-text-cluster')
  if (strategy.reflowHeadline) actions.push('improve-line-breaks', 'widen-text-container')
  if (strategy.improveLogoAnchoring) actions.push('move-logo-to-anchor')
  if (strategy.changeLayoutFamily) actions.push('change-layout-family')
  if (issueCodes.some((code) => code.includes('image-detached') || code.includes('underuses-width') || code.includes('web-banner-inside-wide-canvas'))) {
    actions.push('recompute-image-crop', 'change-image-anchor', 'change-image-shape', 'switch-image-role')
  }
  if (issueCodes.some((code) => code.includes('text-cluster-too-low') || code.includes('bottom-heavy'))) {
    actions.push('raise-text-cluster')
  }
  if (issueCodes.some((code) => code.includes('line-break') || code.includes('headline-rhythm-poor'))) {
    actions.push('reflow-headline')
  }
  if (issueCodes.some((code) => code.includes('composition-underscaled') || code.includes('billboard-scale-too-weak') || code.includes('inactive-wide-space') || code.includes('horizontal-spread-weak'))) {
    actions.push('increase-scale-to-canvas', 'rebalance-split-ratio')
  }
  if (formatFamily === 'display-leaderboard') {
    actions.push('compress-text-region', 'reflow-headline')
  }
  if (formatFamily === 'display-skyscraper') {
    actions.push('raise-text-cluster', 'rebalance-split-ratio')
  }
  if (formatFamily === 'billboard') {
    actions.push('increase-scale-to-canvas', 'switch-image-role')
  }
  if (issueCodes.some((code) => code.includes('too-dense-for-small-format') || code.includes('display-hierarchy-too-weak') || code.includes('compressed-horizontal-failure') || code.includes('text-out-of-bounds'))) {
    actions.push('compress-text-region', 'reflow-headline')
  }
  if (issueCodes.includes('violates-safe-area') || issueCodes.includes('violates-outer-margin') || issueCodes.includes('violates-inner-spacing')) {
    actions.push('increase-cluster-padding', 'rebalance-text-cluster')
  }
  if (issueCodes.includes('violates-headline-size-rule') || issueCodes.includes('violates-headline-line-limit')) {
    actions.push('reflow-headline', 'widen-text-container')
  }
  if (issueCodes.includes('violates-cta-size-rule')) {
    actions.push('increase-cta-prominence', 'move-cta-closer-to-text')
  }
  if (issueCodes.includes('violates-logo-zone-rule')) {
    actions.push('move-logo-to-anchor')
  }
  if (issueCodes.includes('violates-image-footprint-rule')) {
    actions.push('recompute-image-crop', 'switch-image-role', 'rebalance-split-ratio')
  }
  if (issueCodes.includes('violates-allowed-zone') || issueCodes.includes('violates-format-grid')) {
    actions.push('change-layout-family', 'rebalance-text-cluster')
  }
  if (squareStructuralIssue) {
    actions.push('change-layout-family', 'compress-text-region', 'reflow-headline', 'move-logo-to-anchor', 'rebalance-text-cluster')
  }

  const assessmentActions = assessment.recommendedFixes && assessment.recommendedFixes.length
    ? assessment.recommendedFixes
    : collectFixActions(assessment.issues.map((issue) => issue.message || issue.text || ''))

  return unique([...actions, ...assessmentActions])
}

function sortActionsByPriority(actions: FixAction[]) {
  const order: FixAction[] = [
    'change-layout-family',
    'increase-scale-to-canvas',
    'switch-image-role',
    'increase-headline-size',
    'reduce-headline-size',
    'reflow-headline',
    'increase-cta-prominence',
    'move-cta-closer-to-text',
    'rebalance-text-cluster',
    'raise-text-cluster',
    'increase-image-presence',
    'rebalance-split-ratio',
    'expand-text-region',
    'compress-text-region',
    'recompute-image-crop',
    'change-image-anchor',
    'change-image-shape',
    'reduce-dead-space',
    'lighten-overlay',
    'darken-overlay',
    'move-logo-to-anchor',
    'widen-text-container',
    'narrow-text-container',
    'increase-cluster-padding',
    'improve-line-breaks',
    'switch-to-text-first',
    'switch-to-image-first',
  ]
  return unique(actions).sort((left, right) => {
    const leftIndex = order.indexOf(left)
    const rightIndex = order.indexOf(right)
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex)
  })
}

function getAlternativeIntent(intent: LayoutIntent, formatKey: FormatKey, formatFamily: FormatFamily, suggestedFamily?: LayoutIntentFamily): Partial<LayoutIntent> {
  const allowedFamily = suggestedFamily ? resolveAllowedFamily(formatKey, suggestedFamily) : undefined
  const format = FORMAT_MAP[formatKey]
  const alternativeModel = getAlternativeCompositionModel(format, intent.compositionModelId)
  if (allowedFamily) {
    return {
      family: allowedFamily,
      presetId: allowedFamily,
      compositionModelId:
        selectCompositionModel({
          format,
          requestedFamily: allowedFamily,
          denseText: intent.balanceMode === 'text-dominant',
        })?.id || alternativeModel?.id,
      mode:
        allowedFamily === 'portrait-hero-overlay' || allowedFamily === 'display-rectangle-image-bg'
          ? 'overlay'
          : allowedFamily === 'portrait-bottom-card' || allowedFamily === 'square-image-top-text-bottom'
            ? 'text-first'
            : allowedFamily === 'square-hero-overlay' || allowedFamily === 'billboard-wide-hero' || allowedFamily === 'landscape-image-dominant'
              ? 'image-first'
              : 'split',
      textMode:
        allowedFamily === 'portrait-hero-overlay' || allowedFamily === 'display-rectangle-image-bg' ? 'overlay' :
        allowedFamily === 'portrait-bottom-card' || allowedFamily === 'square-hero-overlay' || allowedFamily === 'square-image-top-text-bottom' ? 'cluster-bottom' :
        allowedFamily === 'presentation-clean-hero' || allowedFamily === 'presentation-structured-cover' ? 'centered' :
        'cluster-left',
      imageMode:
        allowedFamily === 'portrait-hero-overlay' || allowedFamily === 'display-rectangle-image-bg' ? 'background' :
        allowedFamily === 'portrait-bottom-card' ? 'framed' :
        allowedFamily === 'square-hero-overlay' || allowedFamily === 'billboard-wide-hero' || allowedFamily === 'landscape-image-dominant' || allowedFamily === 'skyscraper-image-top-text-stack' ? 'hero' :
        'split-right',
    }
  }

  if (formatFamily === 'billboard' || formatFamily === 'display-leaderboard') {
    return {
      family: intent.family === 'billboard-wide-hero' ? 'billboard-wide-balanced' : formatFamily === 'display-leaderboard' ? 'leaderboard-compact-horizontal' : 'billboard-wide-hero',
      presetId: intent.family === 'billboard-wide-hero' ? 'billboard-wide-balanced' : formatFamily === 'display-leaderboard' ? 'leaderboard-compact-horizontal' : 'billboard-wide-hero',
      compositionModelId: alternativeModel?.id,
      textMode: 'cluster-left',
      imageMode: formatFamily === 'display-leaderboard' ? 'split-right' : 'hero',
      mode: formatFamily === 'display-leaderboard' ? 'split' : 'image-first',
    }
  }
  if (formatFamily === 'landscape' || formatFamily === 'display-rectangle') {
    return {
      family:
        formatFamily === 'display-rectangle'
          ? intent.family === 'display-rectangle-balanced'
            ? 'display-rectangle-image-bg'
            : 'display-rectangle-balanced'
          : intent.family === 'landscape-balanced-split'
            ? 'landscape-image-dominant'
            : 'landscape-balanced-split',
      presetId:
        formatFamily === 'display-rectangle'
          ? intent.family === 'display-rectangle-balanced'
            ? 'display-rectangle-image-bg'
            : 'display-rectangle-balanced'
          : intent.family === 'landscape-balanced-split'
            ? 'landscape-image-dominant'
            : 'landscape-balanced-split',
      compositionModelId: alternativeModel?.id,
      textMode: 'cluster-left',
      imageMode: formatFamily === 'display-rectangle' ? 'split-right' : intent.family === 'landscape-balanced-split' ? 'hero' : 'split-right',
      mode: formatFamily === 'display-rectangle' ? 'split' : intent.family === 'landscape-balanced-split' ? 'image-first' : 'split',
    }
  }
  if (formatFamily === 'portrait' || formatFamily === 'display-skyscraper' || formatFamily === 'flyer' || formatFamily === 'poster') {
    return {
      family:
        formatFamily === 'display-skyscraper'
          ? intent.family === 'skyscraper-image-top-text-stack'
            ? 'skyscraper-split-vertical'
            : 'skyscraper-image-top-text-stack'
          : intent.family === 'portrait-hero-overlay'
            ? 'portrait-bottom-card'
            : 'portrait-hero-overlay',
      presetId:
        formatFamily === 'display-skyscraper'
          ? intent.family === 'skyscraper-image-top-text-stack'
            ? 'skyscraper-split-vertical'
            : 'skyscraper-image-top-text-stack'
          : intent.family === 'portrait-hero-overlay'
            ? 'portrait-bottom-card'
            : 'portrait-hero-overlay',
      compositionModelId: alternativeModel?.id,
      textMode: intent.family === 'portrait-hero-overlay' ? 'cluster-bottom' : formatFamily === 'display-skyscraper' ? 'cluster-left' : 'overlay',
      imageMode: intent.family === 'portrait-hero-overlay' ? 'framed' : formatFamily === 'display-skyscraper' ? 'hero' : 'background',
      mode: intent.family === 'portrait-hero-overlay' ? 'text-first' : formatFamily === 'display-skyscraper' ? 'image-first' : 'overlay',
    }
  }
  if (formatFamily === 'presentation') {
    return {
      family: intent.family === 'presentation-clean-hero' ? 'presentation-structured-cover' : 'presentation-clean-hero',
      presetId: intent.family === 'presentation-clean-hero' ? 'presentation-structured-cover' : 'presentation-clean-hero',
      compositionModelId: alternativeModel?.id,
      textMode: 'centered',
      imageMode: 'split-right',
      mode: 'split',
    }
  }
  return {
    family: intent.family === 'square-hero-overlay' ? 'square-image-top-text-bottom' : 'square-hero-overlay',
    presetId: intent.family === 'square-hero-overlay' ? 'square-image-top-text-bottom' : 'square-hero-overlay',
    compositionModelId: alternativeModel?.id,
    mode: intent.family === 'square-hero-overlay' ? 'text-first' : 'image-first',
    textMode: intent.family === 'square-hero-overlay' ? 'cluster-bottom' : 'cluster-bottom',
    imageMode: intent.family === 'square-hero-overlay' ? 'framed' : 'hero',
    balanceMode: intent.family === 'square-hero-overlay' ? 'balanced' : 'image-dominant',
  }
}

const LOCAL_FIX_ACTIONS: FixAction[] = [
  'increase-headline-size',
  'reduce-headline-size',
  'reflow-headline',
  'widen-text-container',
  'narrow-text-container',
  'expand-text-region',
  'compress-text-region',
  'increase-cta-prominence',
  'move-cta-closer-to-text',
  'move-logo-to-anchor',
  'lighten-overlay',
  'darken-overlay',
  'increase-cluster-padding',
  'improve-line-breaks',
]

const REGIONAL_FIX_ACTIONS: FixAction[] = [
  'rebalance-text-cluster',
  'increase-image-presence',
  'reduce-image-presence',
  'recompute-image-crop',
  'change-image-anchor',
  'change-image-shape',
  'switch-image-role',
  'rebalance-split-ratio',
  'raise-text-cluster',
  'reduce-dead-space',
  'increase-scale-to-canvas',
]

const STRUCTURAL_FIX_ACTIONS: FixAction[] = [
  'change-layout-family',
  'switch-to-text-first',
  'switch-to-image-first',
]

function unresolvedIssueCount(issues: LayoutAssessment['issues']) {
  return issues.filter((issue) => issue.severity === 'high' || issue.severity === 'medium').length
}

function isSquareOverlayExhaustedScenario(input: {
  assessment: LayoutAssessment
  intent: LayoutIntent
  formatFamily: FormatFamily
  previousFixState?: FixSessionState
}) {
  if (input.formatFamily !== 'square' || input.intent.family !== 'square-hero-overlay') return false
  const significantIssues = input.assessment.issues.filter(
    (issue) => issue.severity === 'critical' || issue.severity === 'high' || issue.severity === 'medium'
  )
  if (!significantIssues.length) return false
  if (significantIssues.some((issue) => issue.severity === 'critical')) return false
  if (!significantIssues.every((issue) => issue.code === 'overlay-outside-safe-text-area')) return false
  const failedStrategies = new Set(input.previousFixState?.failedStrategies || [])
  return (
    failedStrategies.has('square-near-miss-safe-text') ||
    failedStrategies.has('local-refine') ||
    failedStrategies.has('square-overlay-structural-repack') ||
    (input.previousFixState?.iteration || 0) >= 1
  )
}

function isSquareNearMissSafeTextScenario(assessment: LayoutAssessment, formatFamily: FormatFamily) {
  if (formatFamily !== 'square') return false
  const significantIssues = assessment.issues.filter(
    (issue) => issue.severity === 'critical' || issue.severity === 'high' || issue.severity === 'medium'
  )
  const overlayIssues = significantIssues.filter((issue) => issue.code === 'overlay-outside-safe-text-area')
  if (!overlayIssues.length) return false
  if (significantIssues.some((issue) => issue.severity === 'critical')) return false
  return significantIssues.every((issue) => issue.code === 'overlay-outside-safe-text-area')
}

function normalizeSceneText(value?: string) {
  return (value || '').replace(/\s+/g, ' ').trim()
}

type SquareSubtitleLaneMode = 'kept' | 'compact' | 'one-line' | 'omitted'

function applySquareSubtitleCtaPairingStructuralRepair(input: {
  scene: Scene
  formatKey: FormatKey
  profile?: ContentProfile
  visualSystem?: VisualSystemKey
  brandKit?: BrandKit
  goal?: Project['goal']
  intent?: LayoutIntent
  assetHint?: AssetHint
}) {
  const format = FORMAT_MAP[input.formatKey]
  if (format.key !== 'social-square') return clone(input.scene)

  const titleText = normalizeSceneText(input.scene.title.text)
  const subtitleText = normalizeSceneText(input.scene.subtitle.text)
  const ctaText = normalizeSceneText(input.scene.cta.text)
  if (!titleText || !ctaText) return clone(input.scene)

  const base =
    input.profile && input.visualSystem && input.brandKit && input.goal && input.intent
      ? applySquareConstrainedTextModel({
          scene: input.scene,
          formatKey: input.formatKey,
          profile: input.profile,
          visualSystem: input.visualSystem,
          brandKit: input.brandKit,
          goal: input.goal,
          intent: input.intent,
          assetHint: input.assetHint,
        })
      : clone(input.scene)

  const subtitleLength = input.profile?.subtitleLength || subtitleText.length
  const denseSubtitle =
    subtitleText.length > 0 &&
    (
      subtitleLength > 18 ||
      (base.subtitle.maxLines || 2) > 2 ||
      (base.subtitle.h || 0) > 6.8
    )
  const modes: SquareSubtitleLaneMode[] = subtitleText
    ? ['kept', 'compact', 'one-line', 'omitted']
    : ['omitted']

  const titleX = clamp(base.title.x || 0, 6, 16)
  const titleW = clamp(Math.max(base.title.w || 34, 34), 34, 54)
  const titleH = clamp((base.title.h || 14) - 1.4, 11.8, 17.6)
  const titleYDefault = clamp(Math.min(base.title.y || 38, 42), 24, 42)
  const ctaW = clamp(base.cta.w || 22, 18, 28)
  const ctaH = clamp(base.cta.h || 6.6, 6, 7.4)
  const ctaYMax = 92 - ctaH

  const materializeMode = (mode: SquareSubtitleLaneMode) => {
    const candidate = clone(base)
    candidate.title.x = titleX
    candidate.title.y = titleYDefault
    candidate.title.w = titleW
    candidate.title.h = titleH
    candidate.title.maxLines = clamp(Math.min(candidate.title.maxLines || 3, 3), 2, 3)

    candidate.cta.x = titleX
    candidate.cta.w = ctaW
    candidate.cta.h = ctaH
    candidate.cta.fontSize = clamp(candidate.cta.fontSize || 16, 15, 20)

    if (mode === 'omitted' || !subtitleText) {
      candidate.subtitle.text = ''
      candidate.subtitle.opacity = 0
      candidate.subtitle.w = 0
      candidate.subtitle.h = 0
      candidate.subtitle.maxLines = 1
      candidate.subtitle.y = clamp((candidate.title.y || 0) + (candidate.title.h || 0) + 1.2, 0, 88)
      const titleBottom = (candidate.title.y || 0) + (candidate.title.h || 0)
      const titleToCtaGap = denseSubtitle ? 3.2 : 2.6
      candidate.cta.y = clamp(titleBottom + titleToCtaGap, titleBottom + 2, ctaYMax)
      return {
        scene: candidate,
        fit: true,
        clearance:
          Math.round(((candidate.cta.y || 0) - ((candidate.title.y || 0) + (candidate.title.h || 0))) * 100) / 100,
        mode,
      }
    }

    const settings =
      mode === 'kept'
        ? {
            subtitleH: clamp((candidate.subtitle.h || 5.6) - 0.8, 4.6, 5.8),
            subtitleW: clamp(Math.max(candidate.subtitle.w || 28, 30), 28, 40),
            maxLines: 2,
            fontSize: clamp((candidate.subtitle.fontSize || 15) - 1, 12, 16),
            opacity: 0.72,
            gap: 1.8,
            laneGap: 4.6,
          }
        : mode === 'compact'
          ? {
              subtitleH: clamp((candidate.subtitle.h || 5) - 1.4, 4, 5),
              subtitleW: clamp(Math.max(candidate.subtitle.w || 30, 32), 30, 42),
              maxLines: 2,
              fontSize: clamp((candidate.subtitle.fontSize || 14) - 2, 11, 15),
              opacity: 0.64,
              gap: 1.6,
              laneGap: 4.8,
            }
          : {
              subtitleH: clamp((candidate.subtitle.h || 4.6) - 1.8, 3.4, 4.4),
              subtitleW: clamp(Math.max(candidate.subtitle.w || 32, 34), 32, 46),
              maxLines: 1,
              fontSize: clamp((candidate.subtitle.fontSize || 14) - 3, 10, 14),
              opacity: 0.58,
              gap: 1.4,
              laneGap: 5.2,
            }

    candidate.subtitle.x = titleX
    candidate.subtitle.w = settings.subtitleW
    candidate.subtitle.h = settings.subtitleH
    candidate.subtitle.maxLines = settings.maxLines
    candidate.subtitle.fontSize = settings.fontSize
    candidate.subtitle.opacity = settings.opacity
    candidate.subtitle.charsPerLine = Math.max((candidate.subtitle.charsPerLine || 16) + 8, 18)
    candidate.subtitle.y = (candidate.title.y || 0) + (candidate.title.h || 0) + settings.gap

    const subtitleBottom = () => (candidate.subtitle.y || 0) + (candidate.subtitle.h || 0)
    const placeCtaBelowMessage = () => {
      const bottom = subtitleBottom()
      candidate.cta.y = clamp(bottom + settings.laneGap, bottom + 2.4, ctaYMax)
    }
    placeCtaBelowMessage()

    let guard = 0
    while (subtitleBottom() > (candidate.cta.y || 0) - settings.laneGap + 0.02 && guard < 10) {
      const overflow = subtitleBottom() - ((candidate.cta.y || 0) - settings.laneGap)
      const nextTitleY = clamp((candidate.title.y || 0) - Math.min(Math.max(overflow, 0.4), 5), 20, titleYDefault)
      if (nextTitleY >= (candidate.title.y || 0) - 0.01) break
      candidate.title.y = nextTitleY
      candidate.subtitle.y = (candidate.title.y || 0) + (candidate.title.h || 0) + settings.gap
      placeCtaBelowMessage()
      guard += 1
    }

    const finalSubtitleBottom = subtitleBottom()
    const fit = finalSubtitleBottom <= (candidate.cta.y || 0) - settings.laneGap + 0.02
    return {
      scene: candidate,
      fit,
      clearance: Math.round(((candidate.cta.y || 0) - finalSubtitleBottom) * 100) / 100,
      mode,
    }
  }

  const candidates = modes.map(materializeMode)
  const chosen =
    candidates.find((candidate) => candidate.fit) ||
    candidates[candidates.length - 1] ||
    { scene: clone(base), fit: false, clearance: 0, mode: 'omitted' as const }

  return chosen.scene
}

export function applySquareSubtitleCtaPairingStructuralRepairDebug(input: {
  scene: Scene
  formatKey: FormatKey
  profile?: ContentProfile
  visualSystem?: VisualSystemKey
  brandKit?: BrandKit
  goal?: Project['goal']
  intent?: LayoutIntent
  assetHint?: AssetHint
}) {
  return applySquareSubtitleCtaPairingStructuralRepair(input)
}

function applySquareConstrainedTextModel(input: {
  scene: Scene
  formatKey: FormatKey
  profile: ContentProfile
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  intent: LayoutIntent
  assetHint?: AssetHint
}) {
  const format = FORMAT_MAP[input.formatKey]
  if (format.key !== 'social-square') return clone(input.scene)

  const next = clone(input.scene)
  const subtitleHurtsReadability =
    Boolean(next.subtitle.text?.trim()) && (input.profile.subtitleLength > 18 || input.profile.density === 'dense')
  const scenario = classifyScenario({
    profile: input.profile,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageProfile: input.assetHint?.imageProfile,
  })

  const plan = recomputeClusterTypography({
    format,
    profile: input.profile,
    scenario,
    visualSystem: input.visualSystem,
    brandKit: input.brandKit,
    intent: input.intent,
    headlineText: next.title.text,
    subtitleText: subtitleHurtsReadability ? '' : next.subtitle.text,
    titleRegionWidthPercent: Math.max((next.title.w || 42) - 12, 26),
    subtitleRegionWidthPercent: Math.max((next.subtitle.w || 38) - 16, 22),
    fixStage: 'structural',
  })

  next.title.fontSize = Math.max(plan.titleSize - 1, 22)
  next.title.w = Math.max(plan.titleWidth - 6, 26)
  next.title.charsPerLine = Math.max(plan.titleCharsPerLine - 3, 10)
  next.title.maxLines = Math.min(plan.titleMaxLines + 1, 5)

  if (subtitleHurtsReadability) {
    next.subtitle.text = ''
    next.subtitle.w = 0
    next.subtitle.maxLines = 1
    next.subtitle.opacity = 0
  } else {
    next.subtitle.fontSize = Math.max(plan.subtitleSize - 2, 11)
    next.subtitle.w = Math.max(plan.subtitleWidth - 10, 22)
    next.subtitle.charsPerLine = Math.max(plan.subtitleCharsPerLine - 4, 12)
    next.subtitle.maxLines = Math.min(plan.subtitleMaxLines, 2)
    next.subtitle.opacity = Math.min(next.subtitle.opacity || 0.84, 0.68)
  }

  next.cta.y = Math.max((next.cta.y || 0) - 1.5, 24)
  next.cta.x = next.title.x
  return next
}

function rectArea(rect: { w: number; h: number }) {
  return Math.max(rect.w, 0) * Math.max(rect.h, 0)
}

function rectIntersection(
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number }
) {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const w = Math.min(left.x + left.w, right.x + right.w) - x
  const h = Math.min(left.y + left.h, right.y + right.h) - y
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

function normalizeOverlayRectWithinImage(
  overlay: { x: number; y: number; w: number; h: number },
  image: { x: number; y: number; w: number; h: number }
) {
  return {
    x: ((overlay.x - image.x) / Math.max(image.w, 0.0001)) * 100,
    y: ((overlay.y - image.y) / Math.max(image.h, 0.0001)) * 100,
    w: (overlay.w / Math.max(image.w, 0.0001)) * 100,
    h: (overlay.h / Math.max(image.h, 0.0001)) * 100,
  }
}

function scoreSquareOverlayRectAgainstSafeAreas(scene: Scene, imageAnalysis: EnhancedImageAnalysis | undefined, rect: {
  x: number
  y: number
  w: number
  h: number
}) {
  if (!imageAnalysis?.safeTextAreas?.length) {
    return { safeScore: 0, safeCoverage: 0 }
  }
  const imageRect = {
    x: scene.image.x || 0,
    y: scene.image.y || 0,
    w: scene.image.w || 0,
    h: scene.image.h || 0,
  }
  const normalized = normalizeOverlayRectWithinImage(rect, imageRect)
  const total = Math.max(rectArea(normalized), 0.0001)
  let weightedScore = 0
  let safeCoverage = 0
  for (const area of imageAnalysis.safeTextAreas) {
    const hit = rectIntersection(normalized, area)
    if (!hit) continue
    const hitArea = rectArea(hit)
    weightedScore += area.score * hitArea
    if (area.score >= 0.87) safeCoverage += hitArea
  }
  return {
    safeScore: weightedScore / total,
    safeCoverage: safeCoverage / total,
  }
}

function applySquareUltraConstrainedMicroBandModel(input: {
  scene: Scene
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const next = clone(input.scene)
  const safeAreas = input.imageAnalysis?.safeTextAreas || []
  if (!safeAreas.length) {
    next.subtitle.text = ''
    next.subtitle.opacity = 0
    next.subtitle.w = 0
    return next
  }

  const titleBaseHeight = Math.max(((next.title.fontSize || 28) / 1080) * 100 * Math.max(next.title.maxLines || 3, 2) * 0.92, 8)
  const ctaHeight = Math.max(next.cta.h || 6, 5.5)
  let best:
    | (Scene & {
        __rank: number
      })
    | null = null

  for (const area of safeAreas
    .filter((area) => area.score >= 0.82)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)) {
    for (const bandWidth of [22, 24, 26, 28, 30, 32]) {
      for (const xInset of [0.5, 1.2, 2, 3]) {
        for (const yInset of [0.5, 1.2, 2.2, 3.2]) {
          for (const titleHeightScale of [0.72, 0.66, 0.6]) {
            const candidate = clone(next) as Scene & { __rank: number }
            const titleW = Math.min(bandWidth, Math.max(area.w - xInset * 2, 18))
            const titleH = Math.min(Math.max(titleBaseHeight * titleHeightScale, 7.2), Math.max(area.h - 6, 7.2))
            const titleX = clamp(area.x + xInset, Math.max(candidate.image.x || 0, 6), Math.min((candidate.image.x || 0) + (candidate.image.w || 0) - titleW, 26))
            const titleY = clamp(area.y + yInset, Math.max(candidate.image.y || 0, 18), Math.min((candidate.image.y || 0) + (candidate.image.h || 0) - titleH - ctaHeight - 1.2, 72))

            candidate.title.x = titleX
            candidate.title.y = titleY
            candidate.title.w = titleW
            candidate.title.fontSize = Math.max((candidate.title.fontSize || 28) - 2, 20)
            candidate.title.charsPerLine = Math.max(Math.min(Math.round(titleW / 1.25), 14), 7)
            candidate.title.maxLines = Math.min(Math.max(candidate.title.maxLines || 3, 4), 5)

            candidate.subtitle.text = ''
            candidate.subtitle.opacity = 0
            candidate.subtitle.w = 0
            candidate.subtitle.maxLines = 1
            candidate.cta.x = titleX
            candidate.cta.y = clamp(titleY + titleH + 1.2, titleY + 4.5, Math.min(92, area.y + area.h - ctaHeight))

            const titleMetrics = scoreSquareOverlayRectAgainstSafeAreas(candidate, input.imageAnalysis, {
              x: candidate.title.x || 0,
              y: candidate.title.y || 0,
              w: candidate.title.w || 0,
              h: titleH,
            })
            const rank = titleMetrics.safeScore * 2.2 + titleMetrics.safeCoverage * 0.8 + area.score - titleW * 0.001
            candidate.__rank = rank
            if (!best || candidate.__rank > best.__rank) best = candidate
          }
        }
      }
    }
  }

  if (!best) {
    next.subtitle.text = ''
    next.subtitle.opacity = 0
    next.subtitle.w = 0
    return next
  }
  delete (best as Scene & { __rank?: number }).__rank
  return best
}

async function evaluateFixCandidate(input: {
  scene: Scene
  formatKey: FormatKey
  actions: FixAction[]
  strategyLabel: string
  plan?: LayoutFixPlan
  expectedCompositionModelId?: Variant['compositionModelId']
  imageAnalysis?: EnhancedImageAnalysis
}): Promise<FixCandidate> {
  const format = FORMAT_MAP[input.formatKey]
  const assessmentBase = getFormatAssessment(input.formatKey, input.scene, input.expectedCompositionModelId, input.imageAnalysis)
  const aiReview = await aiReviewLayout(input.scene, { format, assessment: assessmentBase })
  const assessment = { ...assessmentBase, aiReview }
  const scoreTrust = computeScoreTrust(assessment, aiReview)
  const analysis = assessment.layoutAnalysis || analyzeFullLayout(input.scene, format)

  return {
    scene: input.scene,
    plan: input.plan,
    analysis: {
      ...analysis,
      effectiveScore: scoreTrust.effectiveScore,
    },
    actions: input.actions,
    deterministicScore: assessment.score,
    aiReviewScore: aiReview.score,
    effectiveScore: scoreTrust.effectiveScore,
    issues: assessment.issues,
    strategyLabel: input.strategyLabel,
    assessment,
    scoreTrust,
  }
}

function getDominanceIntent(formatFamily: FormatFamily, mode: 'text' | 'image'): Partial<LayoutIntent> {
  if (mode === 'text') {
    return {
      mode: 'text-first',
      balanceMode: 'text-dominant',
      textMode: formatFamily === 'portrait' || formatFamily === 'display-skyscraper' ? 'cluster-bottom' : formatFamily === 'presentation' ? 'centered' : 'cluster-left',
      imageMode: formatFamily === 'portrait' ? 'framed' : 'split-right',
    }
  }

  return {
    mode: 'image-first',
    balanceMode: 'image-dominant',
    textMode: formatFamily === 'portrait' || formatFamily === 'display-skyscraper' ? 'overlay' : 'cluster-left',
    imageMode: formatFamily === 'portrait' ? 'background' : formatFamily === 'square' ? 'hero' : 'split-right',
  }
}

function filterActionsByStage(actions: FixAction[], stage: 'local' | 'regional' | 'structural') {
  const lookup = stage === 'local' ? LOCAL_FIX_ACTIONS : stage === 'regional' ? REGIONAL_FIX_ACTIONS : STRUCTURAL_FIX_ACTIONS
  return actions.filter((action) => lookup.includes(action))
}

function pickBestCandidate(current: FixCandidate, candidates: FixCandidate[]) {
  let best = current
  for (const candidate of candidates) {
    const currentUnresolved = unresolvedIssueCount(best.issues)
    const candidateUnresolved = unresolvedIssueCount(candidate.issues)
    const currentBlockIssues = analysisToIssueBuckets(best.analysis || {
      blocks: {},
      clusters: {},
      global: { score: 100, issues: [], suggestedFixes: [], metrics: { visualBalance: 100, negativeSpaceUse: 100, formatSuitability: 100, scaleToCanvas: 100, campaignConsistency: 100, deadSpacePenalty: 0 } },
      overallScore: best.deterministicScore,
      effectiveScore: best.effectiveScore,
      prioritizedIssues: [],
    })
    const candidateBlockIssues = analysisToIssueBuckets(candidate.analysis || {
      blocks: {},
      clusters: {},
      global: { score: 100, issues: [], suggestedFixes: [], metrics: { visualBalance: 100, negativeSpaceUse: 100, formatSuitability: 100, scaleToCanvas: 100, campaignConsistency: 100, deadSpacePenalty: 0 } },
      overallScore: candidate.deterministicScore,
      effectiveScore: candidate.effectiveScore,
      prioritizedIssues: [],
    })
    const scoreDelta = candidate.effectiveScore - best.effectiveScore
    const unresolvedDelta = currentUnresolved - candidateUnresolved
    const aiDelta = (candidate.aiReviewScore || candidate.effectiveScore) - (best.aiReviewScore || best.effectiveScore)
    const blockDelta =
      currentBlockIssues.blockIssues.length +
      currentBlockIssues.clusterIssues.length +
      currentBlockIssues.globalIssues.length -
      (candidateBlockIssues.blockIssues.length + candidateBlockIssues.clusterIssues.length + candidateBlockIssues.globalIssues.length)

    const meaningfullyBetter =
      scoreDelta >= 3 ||
      unresolvedDelta >= 1 ||
      blockDelta >= 2 ||
      (scoreDelta >= 1 && aiDelta >= 2) ||
      (candidate.effectiveScore >= best.effectiveScore && candidateUnresolved < currentUnresolved)

    if (meaningfullyBetter) best = candidate
  }
  return best
}

function shouldAllowAnotherFix({
  effectiveScore,
  unresolvedIssues,
  session,
  improvement,
  scoreTrust,
  formatFamily,
}: {
  effectiveScore: number
  unresolvedIssues: string[]
  session: FixSessionState
  improvement: number
  scoreTrust: ScoreTrust
  formatFamily: FormatFamily
}) {
  const target =
    formatFamily === 'billboard' || formatFamily === 'presentation'
      ? 88
      : formatFamily.startsWith('display')
        ? 84
        : 86
  const unresolvedCount =
    unresolvedIssues.length +
    session.unresolvedBlockIssues.length +
    session.unresolvedClusterIssues.length +
    session.unresolvedGlobalIssues.length
  if (effectiveScore >= target && unresolvedCount === 0 && !scoreTrust.needsHumanAttention) return false
  if (session.iteration >= 5) return false
  if (session.converged && unresolvedCount === 0 && !scoreTrust.needsHumanAttention) return false
  if (improvement <= 1 && session.iteration >= 3 && !scoreTrust.needsHumanAttention) return false
  return effectiveScore < target || unresolvedCount > 0 || scoreTrust.needsHumanAttention
}

function applyRepairActionsToScene(input: {
  scene: Scene
  formatKey: FormatKey
  actions: FixAction[]
  imageAnalysis?: EnhancedImageAnalysis
  compositionModelId?: Variant['compositionModelId']
}) {
  const format = FORMAT_MAP[input.formatKey]
  const compositionModel = input.compositionModelId ? getCompositionModel(format, input.compositionModelId) : null
  let next = clone(input.scene)
  for (const action of input.actions) {
    next = applyFixAction({
      scene: next,
      action,
      format,
      imageAnalysis: input.imageAnalysis,
      compositionModel,
    })
  }
  if (input.formatKey === 'social-square') {
    next = applySquareSubtitleCtaPairingStructuralRepair({
      scene: next,
      formatKey: input.formatKey,
    })
  }
  return finalizeSceneGeometry(next, format, compositionModel)
}

async function attemptLocalStructuralRepair(input: {
  before: RepairEvaluatedScene
  formatKey: FormatKey
  formatFamily: FormatFamily
  assessment: LayoutAssessment
  classification: FailureClassification
  fixPlan: LayoutFixPlan
  compositionModelId?: Variant['compositionModelId']
  imageAnalysis?: EnhancedImageAnalysis
  failedAttemptSignatures: Set<string>
  seenOutcomeSignatures: Set<string>
  repairConfig: RepairSearchConfig
}): Promise<RepairAttempt[]> {
  const attempts: RepairAttempt[] = []
  const strategies = buildLocalRepairStrategies({
    classification: input.classification,
    assessment: input.assessment,
    formatFamily: input.formatFamily,
    fixPlan: input.fixPlan,
    repairConfig: input.repairConfig,
  })

  for (const strategy of strategies) {
    const attempt = await materializeRepairAttempt({
      before: input.before,
      strategy,
      classification: input.classification,
      formatKey: input.formatKey,
      imageAnalysis: input.imageAnalysis,
      compositionModelId: input.compositionModelId,
      failedAttemptSignatures: input.failedAttemptSignatures,
      seenOutcomeSignatures: input.seenOutcomeSignatures,
    })
    attempts.push(attempt)
    recordAttemptArtifacts({
      attempt,
      failedAttemptSignatures: input.failedAttemptSignatures,
      seenOutcomeSignatures: input.seenOutcomeSignatures,
    })
  }

  return attempts
}

async function attemptGuidedRegenerationRepair(input: {
  before: RepairEvaluatedScene
  scene: Scene
  regenerationMasterScene: Scene
  formatKey: FormatKey
  formatFamily: FormatFamily
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  imageUrl?: string
  baseIntent: LayoutIntent
  profile: ContentProfile
  classification: FailureClassification
  preferredAlternativeFamily?: LayoutIntentFamily
  failedAttemptSignatures: Set<string>
  seenOutcomeSignatures: Set<string>
  strongerOnly?: boolean
  forceImageFootprintRecovery?: boolean
}): Promise<{ attempts: RepairAttempt[]; regenerationCandidates: RepairRegenerationCandidateDiagnostics[] }> {
  const attempts: RepairAttempt[] = []
  const regenerationCandidates: RepairRegenerationCandidateDiagnostics[] = []
  const strategies = buildGuidedRepairStrategies({
    formatKey: input.formatKey,
    formatFamily: input.formatFamily,
    baseIntent: input.baseIntent,
    profile: input.profile,
    goal: input.goal,
    visualSystem: input.visualSystem,
    imageAnalysis: input.assetHint?.enhancedImage,
    classification: input.classification,
    preferredAlternativeFamily: input.preferredAlternativeFamily,
    forceImageFootprintRecovery: input.forceImageFootprintRecovery,
  }).filter((strategy, index) => (input.strongerOnly ? index >= 1 : true))

  const marketplaceScenario =
    input.formatKey === 'marketplace-card'
      ? classifyScenario({
          profile: input.profile,
          goal: input.goal,
          visualSystem: input.visualSystem,
          imageProfile: input.assetHint?.imageProfile,
        })
      : undefined

  for (const strategy of strategies) {
    const previewCandidates =
      input.formatKey === 'marketplace-card' && marketplaceScenario
        ? selectBestPreviewCandidate({
            master: input.regenerationMasterScene,
            formatKey: input.formatKey,
            profile: input.profile,
            scenario: marketplaceScenario,
            visualSystem: input.visualSystem,
            brandKit: input.brandKit,
            assetHint: input.assetHint,
            imageAnalysis: input.assetHint?.enhancedImage,
            baseIntent: normalizePreviewIntent({
              formatKey: input.formatKey,
              baseIntent: input.baseIntent,
              profile: input.profile,
              goal: input.goal,
              visualSystem: input.visualSystem,
              imageAnalysis: input.assetHint?.enhancedImage,
              override: strategy.overrideIntent,
            }),
            goal: input.goal,
            baseFixStage: strategy.fixStage,
            allowFamilyAlternatives: true,
            allowModelAlternatives: true,
            budget: MARKETPLACE_CARD_REPAIR_STRATEGY_BUDGET,
            includeExtendedDiagnostics: true,
            failureType: input.classification.dominantType,
          }).candidates.slice(0, MARKETPLACE_CARD_REPAIR_RETAIN_LIMIT)
        : null

    const strategyCandidates = previewCandidates?.length
      ? previewCandidates.map((previewCandidate, index) => ({
          label: `${strategy.label}:${previewCandidate.strategyLabel}:${index + 1}`,
          fixStage: previewCandidate.fixStage,
          scene: previewCandidate.scene,
          intent: previewCandidate.intent,
          imageAnalysis: input.assetHint?.enhancedImage,
          structuralArchetype: previewCandidate.structuralArchetype,
          structuralSignatureKey: createStructuralSignatureKey(previewCandidate.structuralSignature),
          geometrySignature: createSceneGeometrySignature(previewCandidate.scene),
        }))
      : [null]

    const marketplaceCandidatePool: Array<{
      strategy: RepairStrategy
      candidate: RepairEvaluatedScene
      regenerationCandidate: RepairRegenerationCandidateDiagnostics
      attemptSignature: string
    }> = []

    for (const strategyCandidate of strategyCandidates) {
      const candidateStrategy: RepairStrategy =
        strategyCandidate
          ? {
              ...strategy,
              label: strategyCandidate.label,
              fixStage: strategyCandidate.fixStage === 'base' ? strategy.fixStage : strategyCandidate.fixStage,
              overrideIntent: strategyCandidate.intent,
            }
          : strategy

      const attemptSignature = createRepairAttemptSignature({
        beforeSceneSignature: input.before.sceneSignature,
        strategy: candidateStrategy,
        classification: input.classification,
      })
      if (input.failedAttemptSignatures.has(attemptSignature)) {
        const suppressedAttempt = createSuppressedRepairAttempt({
          before: input.before,
          strategy: candidateStrategy,
          classification: input.classification,
          reason: 'Repeated regeneration strategy was already ineffective on the same scene.',
          attemptSignature,
        })
        suppressedAttempt.regenerationCandidate = {
          strategyLabel: candidateStrategy.label,
          strategyKind: candidateStrategy.kind,
          fixStage: candidateStrategy.fixStage,
          generated: false,
          accepted: false,
          suppressed: true,
          repeatedWeakOutcome: true,
          rejectionReason: 'Repeated regeneration strategy was already ineffective on the same scene.',
          structuralArchetype: strategyCandidate?.structuralArchetype || (
            candidateStrategy.overrideIntent
              ? getIntentArchetype({ ...input.baseIntent, ...candidateStrategy.overrideIntent }, input.formatKey)
              : undefined
          ),
          structuralSignatureKey: strategyCandidate?.structuralSignatureKey,
          geometrySignature: strategyCandidate?.geometrySignature,
          topStructuralFindings: [],
        }
        regenerationCandidates.push(suppressedAttempt.regenerationCandidate)
        attempts.push(suppressedAttempt)
        recordAttemptArtifacts({
          attempt: suppressedAttempt,
          failedAttemptSignatures: input.failedAttemptSignatures,
          seenOutcomeSignatures: input.seenOutcomeSignatures,
        })
        continue
      }

      const regenerated = strategyCandidate
        ? {
            scene:
              input.formatKey === 'social-square'
                ? applySquareSubtitleCtaPairingStructuralRepair({
                    scene: strategyCandidate.scene,
                    formatKey: input.formatKey,
                    profile: input.profile,
                    visualSystem: input.visualSystem,
                    brandKit: input.brandKit,
                    goal: input.goal,
                    intent: strategyCandidate.intent,
                    assetHint: input.assetHint,
                  })
                : strategyCandidate.scene,
            intent: strategyCandidate.intent,
            imageAnalysis: strategyCandidate.imageAnalysis,
          }
        : await generateVariant({
            master: input.regenerationMasterScene,
            formatKey: input.formatKey,
            visualSystem: input.visualSystem,
            brandKit: input.brandKit,
            goal: input.goal,
            assetHint: input.assetHint,
            imageUrl: input.imageUrl,
            overrideIntent: strategy.overrideIntent,
            fixStage: strategy.fixStage,
          })

      const candidate = await evaluateRepairScene({
        scene: regenerated.scene,
        formatKey: input.formatKey,
        expectedCompositionModelId: regenerated.intent.compositionModelId,
        imageAnalysis: regenerated.imageAnalysis,
        strategyLabel: candidateStrategy.label,
        actions: candidateStrategy.actions,
      })
      const structuralSignature = buildSceneStructuralSignature({
        scene: regenerated.scene,
        intent: regenerated.intent,
        formatKey: input.formatKey,
      })
      const regenerationCandidate: RepairRegenerationCandidateDiagnostics = {
        strategyLabel: candidateStrategy.label,
        strategyKind: candidateStrategy.kind,
        fixStage: candidateStrategy.fixStage,
        generated: true,
        accepted: false,
        suppressed: false,
        repeatedWeakOutcome: false,
        structuralArchetype: getIntentArchetype(regenerated.intent, input.formatKey),
        structuralSignatureKey: createStructuralSignatureKey(structuralSignature),
        geometrySignature: createSceneGeometrySignature(regenerated.scene),
        structuralStatus: candidate.structuralStatus,
        effectiveScore: candidate.scoreTrust.effectiveScore,
        scoreTrust: candidate.scoreTrust,
        compositionModelId: regenerated.intent.compositionModelId,
        topStructuralFindings: (candidate.assessment.structuralState?.findings || []).slice(0, 4).map((finding) => ({
          name: finding.name,
          severity: finding.severity,
        })),
      }
      if (input.formatKey === 'marketplace-card') {
        marketplaceCandidatePool.push({
          strategy: candidateStrategy,
          candidate,
          regenerationCandidate,
          attemptSignature,
        })
      } else {
        const attempt: RepairAttempt = {
          strategy: candidateStrategy,
          candidate,
          regenerationCandidate,
          decision: buildRepairDecision({
            before: input.before,
            after: candidate,
            strategy: candidateStrategy,
            classification: input.classification,
            attemptSignature,
            knownOutcomeRepeat:
              input.seenOutcomeSignatures.has(candidate.sceneSignature) &&
              candidate.sceneSignature !== input.before.sceneSignature,
          }),
        }
        regenerationCandidates.push({
          ...regenerationCandidate,
          accepted: attempt.decision.accepted,
          suppressed: Boolean(attempt.suppressed || attempt.decision.suppressedAsRepeat),
          repeatedWeakOutcome: Boolean(attempt.decision.repeatedWeakOutcome),
          rejectionReason: attempt.decision.rejectionReason,
        })
        attempts.push(attempt)
        recordAttemptArtifacts({
          attempt,
          failedAttemptSignatures: input.failedAttemptSignatures,
          seenOutcomeSignatures: input.seenOutcomeSignatures,
        })
      }
    }

    if (input.formatKey === 'marketplace-card' && marketplaceCandidatePool.length) {
      const winner = [...marketplaceCandidatePool].sort((left, right) =>
        compareMarketplaceRepairPreviewWinnerEntry(left, right, {
          baselineSceneSignature: input.before.sceneSignature,
          noImageMode: isMarketplaceCardNoImageRepairInput({
            formatKey: input.formatKey,
            assetHint: input.assetHint,
            imageUrl: input.imageUrl,
          }),
        })
      )[0]

      regenerationCandidates.push(
        ...marketplaceCandidatePool.map((entry) => ({
          ...entry.regenerationCandidate,
          accepted: false,
          suppressed: false,
          repeatedWeakOutcome: false,
          rejectionReason:
            entry === winner
              ? undefined
              : 'Retained marketplace-card candidate lost internal preview-style repair preselection.',
        }))
      )

      const winnerDecision = buildMarketplaceRepairSafetyDecision({
        before: input.before,
        after: winner.candidate,
        strategy: winner.strategy,
        classification: input.classification,
        attemptSignature: winner.attemptSignature,
        knownOutcomeRepeat:
          input.seenOutcomeSignatures.has(winner.candidate.sceneSignature) &&
          winner.candidate.sceneSignature !== input.before.sceneSignature,
      })
      const winnerAttempt: RepairAttempt = {
        strategy: winner.strategy,
        candidate: winner.candidate,
        regenerationCandidate: {
          ...winner.regenerationCandidate,
          accepted: winnerDecision.accepted,
          suppressed: Boolean(winnerDecision.suppressedAsRepeat),
          repeatedWeakOutcome: Boolean(winnerDecision.repeatedWeakOutcome),
          rejectionReason: winnerDecision.rejectionReason,
        },
        decision: winnerDecision,
      }
      const winnerIndex = regenerationCandidates.findIndex(
        (candidate) => candidate.strategyLabel === winner.regenerationCandidate.strategyLabel
      )
      if (winnerIndex >= 0) {
        regenerationCandidates[winnerIndex] = winnerAttempt.regenerationCandidate!
      } else {
        regenerationCandidates.push(winnerAttempt.regenerationCandidate!)
      }
      attempts.push(winnerAttempt)
      recordAttemptArtifacts({
        attempt: winnerAttempt,
        failedAttemptSignatures: input.failedAttemptSignatures,
        seenOutcomeSignatures: input.seenOutcomeSignatures,
      })
    }
  }

  return { attempts, regenerationCandidates }
}

function toRepairAttemptDiagnostics(attempt: RepairAttempt): RepairAttemptDiagnostics {
  return {
    strategyLabel: attempt.strategy.label,
    strategyKind: attempt.strategy.kind,
    candidateKind: getRepairCandidateKind(attempt.strategy),
    accepted: attempt.decision.accepted,
    suppressed: Boolean(attempt.suppressed || attempt.decision.suppressedAsRepeat),
    noOp: Boolean(attempt.decision.noOp),
    repeatedWeakOutcome: Boolean(attempt.decision.repeatedWeakOutcome),
    rejectionReason: attempt.decision.rejectionReason,
    beforeStructuralStatus: attempt.decision.beforeStructuralStatus,
    afterStructuralStatus: attempt.decision.afterStructuralStatus,
    beforeEffectiveScore: attempt.decision.beforeEffectiveScore,
    afterEffectiveScore: attempt.decision.afterEffectiveScore,
    scoreDelta: attempt.decision.scoreDelta,
    findingDelta: attempt.decision.findingDelta,
    attemptSignature: attempt.decision.attemptSignature,
    noOpReasons: attempt.decision.noOpReasons || [],
    aggregateScore: attempt.searchEvaluation?.aggregateScore,
    aggregateDelta: attempt.searchEvaluation?.aggregateDelta,
    objective: attempt.searchEvaluation?.objective,
    summaryTags: attempt.searchEvaluation?.summaryTags || [],
    penaltyTags: attempt.searchEvaluation?.penaltyTags || [],
    rejectionReasons: attempt.searchEvaluation?.rejectionReasons || [],
    gateOutcomes: attempt.searchEvaluation?.gateOutcomes,
  }
}

function toRepairRegenerationCandidateDiagnostics(attempt: RepairAttempt): RepairRegenerationCandidateDiagnostics | null {
  if (attempt.strategy.kind !== 'structural-regeneration') return null
  const base = attempt.regenerationCandidate || {
    strategyLabel: attempt.strategy.label,
    strategyKind: attempt.strategy.kind,
    fixStage: attempt.strategy.fixStage,
    generated: true,
    accepted: false,
    suppressed: false,
    repeatedWeakOutcome: false,
    structuralStatus: attempt.candidate.structuralStatus,
    effectiveScore: attempt.candidate.scoreTrust.effectiveScore,
    scoreTrust: attempt.candidate.scoreTrust,
    topStructuralFindings: (attempt.candidate.assessment.structuralState?.findings || []).slice(0, 4).map((finding) => ({
      name: finding.name,
      severity: finding.severity,
    })),
  }
  return {
    ...base,
    accepted: attempt.decision.accepted,
    suppressed: Boolean(attempt.suppressed || attempt.decision.suppressedAsRepeat),
    repeatedWeakOutcome: Boolean(attempt.decision.repeatedWeakOutcome),
    rejectionReason: attempt.decision.rejectionReason,
  }
}

/**
 * Legacy repair/regeneration targets template/pack layouts and fights deterministic V2 slot scenes.
 * Preserve the current scene and surface a no-op fix result when V2 is active for card/tile.
 */
async function buildMarketplaceV2SlotFixBypassOutcome(params: {
  scene: Scene
  regenerationMasterScene?: Scene
  formatKey: FormatKey
  previousFixState?: FixSessionState
  currentFormat: FormatDefinition
  formatFamily: FormatFamily
  beforeAssessment: LayoutAssessment
  beforeState: RepairEvaluatedScene
  currentSceneSignature: string
  regenerationSceneSignature: string
}): Promise<{ scene: Scene; result: FixResult; assessment: LayoutAssessment; scoreTrust: ScoreTrust; diagnostics: RepairDiagnostics }> {
  const beforeTrust = params.beforeState.scoreTrust
  const beforeEffectiveScore = beforeTrust.effectiveScore
  const classification = classifyStructuralFailure(params.beforeAssessment)
  const remainingIssues = params.beforeAssessment.issues
    .filter((issue) => issue.severity === 'high' || issue.severity === 'medium')
    .map((issue) => issue.code)
  const beforeAnalysis = params.beforeAssessment.layoutAnalysis || analyzeFullLayout(params.scene, params.currentFormat)
  const issueBuckets = analysisToIssueBuckets(beforeAnalysis)

  const session: FixSessionState = {
    iteration: (params.previousFixState?.iteration || 0) + 1,
    previousScores: [...(params.previousFixState?.previousScores || []), params.beforeAssessment.score],
    effectiveScores: [...(params.previousFixState?.effectiveScores || []), beforeEffectiveScore],
    unresolvedBlockIssues: issueBuckets.blockIssues,
    unresolvedClusterIssues: issueBuckets.clusterIssues,
    unresolvedGlobalIssues: issueBuckets.globalIssues,
    actionsApplied: params.previousFixState?.actionsApplied || [],
    failedStrategies: params.previousFixState?.failedStrategies || [],
    rejectedActions: params.previousFixState?.rejectedActions || [],
    unresolvedIssues: remainingIssues,
    converged: true,
    canFixAgain: false,
    currentFormatFamily: params.formatFamily,
    failedAttemptSignatures: (params.previousFixState?.failedAttemptSignatures || []).slice(-REPAIR_HISTORY_LIMIT),
    recentOutcomeSignatures: unique([
      ...(params.previousFixState?.recentOutcomeSignatures || []),
      params.beforeState.sceneSignature,
    ]).slice(-REPAIR_HISTORY_LIMIT),
    lastSceneSignature: params.beforeState.sceneSignature,
  }

  const result: FixResult = {
    beforeScore: params.beforeAssessment.score,
    afterScore: params.beforeAssessment.score,
    effectiveBeforeScore: beforeEffectiveScore,
    effectiveAfterScore: beforeEffectiveScore,
    actionsApplied: [],
    actionsRejected: [],
    resolvedIssues: [],
    remainingIssues,
    canFixAgain: false,
    session,
    scoreTrust: beforeTrust,
    v2SlotLayoutPreserved: true,
  }

  const diagnostics: RepairDiagnostics = {
    formatKey: params.formatKey,
    classification,
    regenerationSource: {
      usesMasterScene: Boolean(params.regenerationMasterScene),
      currentSceneSignature: params.currentSceneSignature,
      regenerationSceneSignature: params.regenerationSceneSignature,
      differsFromCurrent: params.currentSceneSignature !== params.regenerationSceneSignature,
    },
    before: {
      structuralStatus: params.beforeState.structuralStatus,
      effectiveScore: beforeEffectiveScore,
      sceneSignature: params.beforeState.sceneSignature,
    },
    after: {
      structuralStatus: params.beforeState.structuralStatus,
      effectiveScore: beforeEffectiveScore,
      sceneSignature: params.beforeState.sceneSignature,
    },
    finalChanged: false,
    acceptedImprovement: false,
    escalated: false,
    escalationReasons: ['marketplace-v2-slot-layout-preserved'],
    searchRuns: [],
    attempts: [],
    regenerationCandidates: [],
    autoFix: {
      attempted: false,
      accepted: false,
      scoreDelta: 0,
      structuralBefore: params.beforeState.structuralStatus,
      structuralAfter: params.beforeState.structuralStatus,
    },
  }

  return {
    scene: params.scene,
    assessment: params.beforeAssessment,
    scoreTrust: beforeTrust,
    diagnostics,
    result,
  }
}

async function runRepairPipeline(input: {
  scene: Scene
  regenerationMasterScene?: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  imageUrl?: string
  previousFixState?: FixSessionState
  forceAlternativeLayout?: boolean
  repairConfig?: RepairSearchConfigOverride
}): Promise<{ scene: Scene; result: FixResult; assessment: LayoutAssessment; scoreTrust: ScoreTrust; diagnostics: RepairDiagnostics }> {
  const currentFormat = FORMAT_MAP[input.formatKey]
  const formatFamily = getFormatFamily(currentFormat)
  const repairConfig = resolveRepairSearchConfig(input.repairConfig)
  const regenerationMasterScene = input.regenerationMasterScene || input.scene
  const currentSceneSignature = createRepairSceneSignature(input.scene)
  const regenerationSceneSignature = createRepairSceneSignature(regenerationMasterScene)
  const beforeAssessmentBase = getFormatAssessment(input.formatKey, input.scene, undefined, input.assetHint?.enhancedImage)
  const beforeAIReview = await aiReviewLayout(input.scene, { format: currentFormat, assessment: beforeAssessmentBase })
  const beforeAssessment = { ...beforeAssessmentBase, aiReview: beforeAIReview }
  const beforeState = evaluateRepairSceneSync({
    scene: input.scene,
    formatKey: input.formatKey,
    assessment: beforeAssessment,
    strategyLabel: 'current',
  })
  if (isMarketplaceLayoutV2Enabled() && isMarketplaceV2FormatKey(input.formatKey)) {
    const v2Outcome = await buildMarketplaceV2SlotFixBypassOutcome({
      scene: input.scene,
      regenerationMasterScene: input.regenerationMasterScene,
      formatKey: input.formatKey,
      previousFixState: input.previousFixState,
      currentFormat,
      formatFamily,
      beforeAssessment,
      beforeState,
      currentSceneSignature,
      regenerationSceneSignature,
    })
    const v2Improved =
      v2Outcome.result.effectiveAfterScore > v2Outcome.result.effectiveBeforeScore || v2Outcome.diagnostics.finalChanged
    if (v2Improved) {
      return v2Outcome
    }
    // V2 slot path did not improve — continue with legacy repair + selectRepairSearchWinner below.
  }
  const beforeTrust = beforeState.scoreTrust
  const beforeAnalysis = beforeAssessment.layoutAnalysis || analyzeFullLayout(input.scene, currentFormat)
  const currentSceneProfile = profileContent(input.scene)
  const regenerationProfile = profileContent(regenerationMasterScene)
  const regenerationBaseIntent = chooseLayoutIntent({
    format: currentFormat,
    master: regenerationMasterScene,
    profile: regenerationProfile,
    imageAnalysis: input.assetHint?.enhancedImage,
    visualSystem: input.visualSystem,
    goal: input.goal,
    assetHint: input.assetHint,
  })
  const classification = classifyStructuralFailure(beforeAssessment)
  const fixPlan = buildFixPlanFromAnalysis(beforeAnalysis, input.formatKey, formatFamily, regenerationBaseIntent)
  const fixStrategy = await chooseFixStrategy({
    assessment: beforeAssessment,
    review: beforeAssessment.aiReview,
    intent: regenerationBaseIntent,
    profile: currentSceneProfile,
    formatKey: input.formatKey,
    formatFamily,
    previousFixState: input.previousFixState,
    scoreTrust: beforeTrust,
  })

  const attempts: RepairAttempt[] = []
  let regenerationCandidates: RepairRegenerationCandidateDiagnostics[] = []
  const failedAttemptSignatures = new Set(input.previousFixState?.failedAttemptSignatures || [])
  const seenOutcomeSignatures = new Set(input.previousFixState?.recentOutcomeSignatures || [])
  seenOutcomeSignatures.add(beforeState.sceneSignature)
  const beforeIssueCodes = new Set(beforeAssessment.issues.map((issue) => issue.code))
  const beforeStructuralFindingNames = new Set(
    (beforeAssessment.structuralState?.findings || []).map((finding) => finding.name)
  )
  const hasAllowedZoneViolation =
    beforeIssueCodes.has('violates-allowed-zone') || beforeStructuralFindingNames.has('role-placement')
  const hasImageFootprintViolation = beforeIssueCodes.has('violates-image-footprint-rule')
  const forceGuidedRegeneration = Boolean(input.forceAlternativeLayout)

  let localAttempts: RepairAttempt[] = []
  if (shouldStartWithLocalRepair({ assessment: beforeAssessment, classification })) {
    localAttempts = await attemptLocalStructuralRepair({
      before: beforeState,
      formatKey: input.formatKey,
      formatFamily,
      assessment: beforeAssessment,
      classification,
      fixPlan,
      compositionModelId: regenerationBaseIntent.compositionModelId,
      imageAnalysis: input.assetHint?.enhancedImage,
      failedAttemptSignatures,
      seenOutcomeSignatures,
      repairConfig,
    })
    attempts.push(...localAttempts)
  }

  const bestLocalCandidate = pickBestAcceptedRepair(beforeState, localAttempts, {
    formatKey: input.formatKey,
    assetHint: input.assetHint,
    imageUrl: input.imageUrl,
  })
  const localImprovedTier =
    bestLocalCandidate && getStructuralTierRank(bestLocalCandidate.structuralStatus) > getStructuralTierRank(beforeState.structuralStatus)
  const localWasSuppressedOrNoOp = localAttempts.some(
    (attempt) => attempt.suppressed || attempt.decision.noOp || attempt.decision.suppressedAsRepeat
  )
  const escalationReasons = [
    ...(hasAllowedZoneViolation ? ['allowed-zone-violation-forces-guided-regeneration'] : []),
    ...(hasImageFootprintViolation ? ['image-footprint-violation-needs-image-mode-regeneration'] : []),
    ...(input.forceAlternativeLayout ? ['forced-alternative-layout'] : []),
    ...(!bestLocalCandidate ? ['no-accepted-local-repair'] : []),
    ...(bestLocalCandidate && !localImprovedTier ? ['local-did-not-improve-structural-tier'] : []),
    ...(bestLocalCandidate && bestLocalCandidate.structuralStatus !== 'valid' ? ['still-structurally-weak-after-local-repair'] : []),
    ...(localWasSuppressedOrNoOp ? ['local-repair-no-op-or-repeat'] : []),
  ]
  const needsEscalation =
    forceGuidedRegeneration ||
    hasImageFootprintViolation ||
    !bestLocalCandidate ||
    !localImprovedTier ||
    bestLocalCandidate.structuralStatus !== 'valid' ||
    localWasSuppressedOrNoOp

  if (needsEscalation) {
    const guidedRegeneration = await attemptGuidedRegenerationRepair({
      before: beforeState,
      scene: input.scene,
      regenerationMasterScene,
      formatKey: input.formatKey,
      formatFamily,
      visualSystem: input.visualSystem,
      brandKit: input.brandKit,
      goal: input.goal,
      assetHint: input.assetHint,
      imageUrl: input.imageUrl,
      baseIntent: regenerationBaseIntent,
      profile: regenerationProfile,
      classification,
      preferredAlternativeFamily: input.forceAlternativeLayout ? undefined : fixStrategy.suggestedFamily,
      failedAttemptSignatures,
      seenOutcomeSignatures,
      strongerOnly:
        forceGuidedRegeneration || hasAllowedZoneViolation || hasImageFootprintViolation
          ? false
          : localWasSuppressedOrNoOp && !bestLocalCandidate,
      forceImageFootprintRecovery: hasImageFootprintViolation,
    })
    attempts.push(...guidedRegeneration.attempts)
    regenerationCandidates = guidedRegeneration.regenerationCandidates
  }

  let repairSelection = selectRepairSearchWinner({
    baseline: beforeState,
    attempts,
    formatKey: input.formatKey,
    formatFamily,
    repairConfig,
    expectedCompositionModelId: regenerationBaseIntent.compositionModelId,
    expectedFamily: regenerationBaseIntent.family,
  })
  const searchRuns: RepairSearchTelemetry[] = [repairSelection.selection.telemetry]
  let finalState = repairSelection.finalState
  let acceptedDecision = repairSelection.acceptedDecision

  const autoFixedScene = runAutoFix(
    finalState.scene,
    input.formatKey,
    finalState.assessment,
    input.assetHint?.enhancedImage,
    finalState.compositionModelId
  )
  const autoFixedState = await evaluateRepairScene({
    scene: autoFixedScene,
    formatKey: input.formatKey,
    expectedCompositionModelId: finalState.compositionModelId,
    imageAnalysis: input.assetHint?.enhancedImage,
    strategyLabel: 'validated-run-autofix',
  })
  const autoFixStrategy: RepairStrategy = {
    kind: 'local-structural',
    candidateKind: 'validated-run-autofix',
    label: 'validated-run-autofix',
    reason: 'Apply lightweight post-repair polish only when it keeps or improves structural quality.',
    fixStage: 'local',
  }
  const autoFixDecision = buildRepairDecision({
    before: finalState,
    after: autoFixedState,
    strategy: autoFixStrategy,
    classification,
  })
  const autoFixAttempt: RepairAttempt = {
    strategy: autoFixStrategy,
    candidate: autoFixedState,
    decision: autoFixDecision,
  }
  attempts.push(autoFixAttempt)
  repairSelection = selectRepairSearchWinner({
    baseline: beforeState,
    attempts,
    formatKey: input.formatKey,
    formatFamily,
    repairConfig,
    expectedCompositionModelId: regenerationBaseIntent.compositionModelId,
    expectedFamily: regenerationBaseIntent.family,
  })
  searchRuns.push(repairSelection.selection.telemetry)
  finalState = repairSelection.finalState
  acceptedDecision = repairSelection.acceptedDecision

  const finalAssessment = finalState.assessment
  const finalTrust = finalState.scoreTrust
  const beforeEffectiveScore = beforeTrust.effectiveScore
  const afterEffectiveScore = finalTrust.effectiveScore
  const improvement = afterEffectiveScore - beforeEffectiveScore
  const remainingIssues = finalAssessment.issues
    .filter((issue) => issue.severity === 'high' || issue.severity === 'medium')
    .map((issue) => issue.code)
  const finalAnalysis = finalAssessment.layoutAnalysis || analyzeFullLayout(finalState.scene, currentFormat)
  const finalIssueBuckets = analysisToIssueBuckets(finalAnalysis)

  const failedStrategies = unique([
    ...(input.previousFixState?.failedStrategies || []),
    ...attempts
      .filter((attempt) => !attempt.decision.accepted)
      .map((attempt) => attempt.strategy.label),
  ].filter(Boolean))

  const rejectedActions: RejectedFixAction[] = [
    ...(input.previousFixState?.rejectedActions || []),
    ...attempts
      .filter((attempt) => !attempt.decision.accepted || attempt.candidate.strategyLabel !== finalState.strategyLabel)
      .flatMap((attempt) =>
        (attempt.strategy.actions || attempt.candidate.actions).map((action) => ({
          action,
          reason: attempt.decision.rejectionReason || `Not selected because ${attempt.strategy.label} scored weaker than ${finalState.strategyLabel}.`,
        }))
      ),
  ]

  const session: FixSessionState = {
    iteration: (input.previousFixState?.iteration || 0) + 1,
    previousScores: [...(input.previousFixState?.previousScores || []), beforeAssessment.score, finalAssessment.score],
    effectiveScores: [...(input.previousFixState?.effectiveScores || []), beforeEffectiveScore, afterEffectiveScore],
    unresolvedBlockIssues: finalIssueBuckets.blockIssues,
    unresolvedClusterIssues: finalIssueBuckets.clusterIssues,
    unresolvedGlobalIssues: finalIssueBuckets.globalIssues,
    actionsApplied: unique<FixAction>([...(input.previousFixState?.actionsApplied || []), ...finalState.actions]),
    failedStrategies,
    rejectedActions,
    unresolvedIssues: remainingIssues,
    converged:
      finalState.strategyLabel === beforeState.strategyLabel &&
      unresolvedIssueCount(finalAssessment.issues) === unresolvedIssueCount(beforeAssessment.issues) &&
      finalIssueBuckets.blockIssues.length + finalIssueBuckets.clusterIssues.length + finalIssueBuckets.globalIssues.length <= 1 &&
      !finalTrust.needsHumanAttention,
    canFixAgain: false,
    currentFormatFamily: formatFamily,
    failedAttemptSignatures: unique([
      ...(input.previousFixState?.failedAttemptSignatures || []),
      ...attempts
        .filter((attempt) => !attempt.decision.accepted && attempt.decision.attemptSignature)
        .map((attempt) => attempt.decision.attemptSignature as string),
    ]).slice(-REPAIR_HISTORY_LIMIT),
    recentOutcomeSignatures: unique([
      ...(input.previousFixState?.recentOutcomeSignatures || []),
      ...attempts.map((attempt) => attempt.candidate.sceneSignature),
      finalState.sceneSignature,
    ]).slice(-REPAIR_HISTORY_LIMIT),
    lastSceneSignature: finalState.sceneSignature,
  }

  session.canFixAgain = shouldAllowAnotherFix({
    effectiveScore: afterEffectiveScore,
    unresolvedIssues: remainingIssues,
    session,
    improvement,
    scoreTrust: finalTrust,
    formatFamily,
  })

  logRepairAttemptSummary({
    formatKey: input.formatKey,
    before: beforeState,
    classification,
    attempts,
    selected: finalState,
    escalated: needsEscalation,
  })

  return {
    scene: finalState.scene,
    assessment: finalAssessment,
    scoreTrust: finalTrust,
    diagnostics: {
      formatKey: input.formatKey,
      classification,
      regenerationSource: {
        usesMasterScene: Boolean(input.regenerationMasterScene),
        currentSceneSignature,
        regenerationSceneSignature,
        differsFromCurrent: currentSceneSignature !== regenerationSceneSignature,
      },
      before: {
        structuralStatus: beforeState.structuralStatus,
        effectiveScore: beforeState.scoreTrust.effectiveScore,
        sceneSignature: beforeState.sceneSignature,
      },
      after: {
        structuralStatus: finalState.structuralStatus,
        effectiveScore: finalState.scoreTrust.effectiveScore,
        sceneSignature: finalState.sceneSignature,
      },
      finalChanged: beforeState.sceneSignature !== finalState.sceneSignature,
      acceptedImprovement: finalState.sceneSignature !== beforeState.sceneSignature && Boolean(acceptedDecision?.accepted),
      escalated: needsEscalation,
      escalationReasons,
      acceptedStrategyLabel: finalState.strategyLabel !== beforeState.strategyLabel ? finalState.strategyLabel : acceptedDecision?.accepted ? finalState.strategyLabel : undefined,
      selection: repairSelection.selection,
      searchRuns,
      attempts: attempts.map(toRepairAttemptDiagnostics),
      regenerationCandidates: regenerationCandidates.length
        ? regenerationCandidates
        : attempts
            .map(toRepairRegenerationCandidateDiagnostics)
            .filter((candidate): candidate is RepairRegenerationCandidateDiagnostics => Boolean(candidate)),
      autoFix: {
        attempted: true,
        accepted: finalState.strategyLabel === autoFixedState.strategyLabel && Boolean(autoFixAttempt.searchEvaluation?.accepted),
        scoreDelta: autoFixDecision.scoreDelta,
        structuralBefore: autoFixDecision.beforeStructuralStatus,
        structuralAfter: autoFixDecision.afterStructuralStatus,
        rejectionReason: autoFixDecision.rejectionReason,
      },
    },
    result: {
      beforeScore: beforeAssessment.score,
      afterScore: finalAssessment.score,
      effectiveBeforeScore: beforeEffectiveScore,
      effectiveAfterScore: afterEffectiveScore,
      actionsApplied: finalState.actions,
      actionsRejected: rejectedActions,
      resolvedIssues: beforeAssessment.issues
        .map((issue) => issue.code)
        .filter((code) => !finalAssessment.issues.some((nextIssue) => nextIssue.code === code)),
      remainingIssues,
      canFixAgain: session.canFixAgain,
      session,
      scoreTrust: finalTrust,
      repair: acceptedDecision,
    },
  }
}

export async function fixLayout(input: {
  scene: Scene
  regenerationMasterScene?: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  imageUrl?: string
  previousFixState?: FixSessionState
  forceAlternativeLayout?: boolean
  repairConfig?: RepairSearchConfigOverride
}): Promise<{ scene: Scene; result: FixResult; assessment: LayoutAssessment; scoreTrust: ScoreTrust }> {
  const { diagnostics: _diagnostics, ...result } = await runRepairPipeline(input)
  return result
}

export async function getRepairDiagnostics(input: {
  scene: Scene
  regenerationMasterScene?: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  imageUrl?: string
  previousFixState?: FixSessionState
  forceAlternativeLayout?: boolean
  repairConfig?: RepairSearchConfigOverride
}) {
  return runRepairPipeline(input)
}

export function evaluateRepairObjectiveDebug(input: {
  baselineScene: Scene
  candidateScene: Scene
  formatKey: FormatKey
  expectedCompositionModelId?: Variant['compositionModelId']
  expectedFamily?: LayoutIntentFamily
  imageAnalysis?: EnhancedImageAnalysis
  strategyLabel?: string
  candidateKind?: RepairCandidateKind
  repairConfig?: RepairSearchConfigOverride
}) {
  const formatFamily = getFormatFamily(FORMAT_MAP[input.formatKey])
  const repairConfig = resolveRepairSearchConfig(input.repairConfig)
  const objectiveContext = getRepairObjectiveContext({
    formatKey: input.formatKey,
    formatFamily,
    repairConfig,
  })
  const baseline = evaluateRepairSceneSync({
    scene: input.baselineScene,
    formatKey: input.formatKey,
    expectedCompositionModelId: input.expectedCompositionModelId,
    imageAnalysis: input.imageAnalysis,
    strategyLabel: 'baseline',
  })
  const candidate = evaluateRepairSceneSync({
    scene: input.candidateScene,
    formatKey: input.formatKey,
    expectedCompositionModelId: input.expectedCompositionModelId,
    imageAnalysis: input.imageAnalysis,
    strategyLabel: input.strategyLabel || 'candidate',
  })
  const baselineObjective = evaluateRepairObjective({
    baseline,
    candidate: baseline,
    formatFamily,
    formatKey: input.formatKey,
    objectiveProfile: objectiveContext.objectiveProfile,
    expectedCompositionModelId: input.expectedCompositionModelId,
    expectedFamily: input.expectedFamily,
  })

  return evaluateRepairSearchCandidate({
    baseline,
    candidate,
    strategy: {
      kind: 'local-structural',
      candidateKind: input.candidateKind || 'local-structural-repair',
      label: input.strategyLabel || 'candidate',
      reason: 'Debug repair evaluation.',
    },
    formatFamily,
    formatKey: input.formatKey,
    objectiveProfile: objectiveContext.objectiveProfile,
    thresholds: objectiveContext.thresholds,
    expectedCompositionModelId: input.expectedCompositionModelId,
    expectedFamily: input.expectedFamily,
    baselineAggregateScore: baselineObjective.aggregateScore,
  })
}

export function evaluateRepairSearchCandidatesDebug(input: {
  baselineScene: Scene
  candidateScenes: Array<{
    scene: Scene
    strategyLabel: string
    candidateKind: RepairCandidateKind
  }>
  formatKey: FormatKey
  expectedCompositionModelId?: Variant['compositionModelId']
  expectedFamily?: LayoutIntentFamily
  imageAnalysis?: EnhancedImageAnalysis
  repairConfig?: RepairSearchConfigOverride
}) {
  const formatFamily = getFormatFamily(FORMAT_MAP[input.formatKey])
  const repairConfig = resolveRepairSearchConfig(input.repairConfig)
  const objectiveContext = getRepairObjectiveContext({
    formatKey: input.formatKey,
    formatFamily,
    repairConfig,
  })
  const baseline = evaluateRepairSceneSync({
    scene: input.baselineScene,
    formatKey: input.formatKey,
    expectedCompositionModelId: input.expectedCompositionModelId,
    imageAnalysis: input.imageAnalysis,
    strategyLabel: 'baseline',
  })
  const baselineObjective = evaluateRepairObjective({
    baseline,
    candidate: baseline,
    formatFamily,
    formatKey: input.formatKey,
    objectiveProfile: objectiveContext.objectiveProfile,
    expectedCompositionModelId: input.expectedCompositionModelId,
    expectedFamily: input.expectedFamily,
  })

  const attempts: RepairAttempt[] = input.candidateScenes.map((entry) => {
    const candidate = evaluateRepairSceneSync({
      scene: entry.scene,
      formatKey: input.formatKey,
      expectedCompositionModelId: input.expectedCompositionModelId,
      imageAnalysis: input.imageAnalysis,
      strategyLabel: entry.strategyLabel,
    })
    const strategy: RepairStrategy = {
      kind: 'local-structural',
      candidateKind: entry.candidateKind,
      label: entry.strategyLabel,
      reason: 'Debug repair candidate pool.',
    }
    const classification = classifyStructuralFailure(baseline.assessment)
    return {
      strategy,
      candidate,
      decision: buildRepairDecision({
        before: baseline,
        after: candidate,
        strategy,
        classification,
      }),
    }
  })

  const selection = selectRepairSearchWinner({
    baseline,
    attempts,
    formatKey: input.formatKey,
    formatFamily,
    repairConfig,
    expectedCompositionModelId: input.expectedCompositionModelId,
    expectedFamily: input.expectedFamily,
  }).selection

  return {
    baseline: selection.calibration.baseline,
    winner: selection.calibration.winner,
    candidateComparisons: selection.calibration.candidateComparisons,
    thresholds: selection.calibration.thresholds,
    objectiveProfile: selection.calibration.objectiveProfile,
    telemetry: selection.telemetry,
    baselineAggregateScore: baselineObjective.aggregateScore,
  }
}

export function evaluateLandscapeTextHeightNearMissOverrideDecisionDebug(input: {
  formatKey: FormatKey
  repairConfig?: RepairSearchConfigOverride
  baselineEvaluation: RepairCandidateEvaluation
  candidateEvaluations: RepairCandidateEvaluation[]
}) {
  const formatFamily = getFormatFamily(FORMAT_MAP[input.formatKey])
  const repairConfig = resolveRepairSearchConfig(input.repairConfig)
  const attempts = input.candidateEvaluations.map((evaluation) => ({
    searchEvaluation: evaluation,
    candidate: {
      assessment: { structuralState: { findings: [] }, issues: [] },
    } as unknown as RepairEvaluatedScene,
  })) as Array<Pick<RepairAttempt, 'searchEvaluation' | 'candidate'>>
  const bestRejectedAttempt = getLandscapeTextHeightNearMissBestRejectedAttempt(
    attempts as RepairAttempt[]
  )

  const evaluations = input.candidateEvaluations.map((evaluation) => {
    const decision = evaluateLandscapeTextHeightNearMissOverride({
      formatKey: input.formatKey,
      repairConfig,
      baselineEvaluation: input.baselineEvaluation,
      evaluation,
      candidate: {
        assessment: { structuralState: { findings: [] }, issues: [] },
      } as unknown as RepairEvaluatedScene,
      isBestRejectedCandidate: bestRejectedAttempt?.searchEvaluation?.candidateId === evaluation.candidateId,
    })
    return {
      candidateId: evaluation.candidateId,
      strategyLabel: evaluation.strategyLabel,
      formatFamily,
      eligible: decision.eligible,
      applied: decision.applied,
      blockedReasons: decision.blockedReasons,
      safeguards: decision.safeguards,
      blockerFamily: decision.blockerFamily,
      blockerSubtype: decision.blockerSubtype,
    }
  })

  return {
    formatFamily,
    bestRejectedCandidateId: bestRejectedAttempt?.searchEvaluation?.candidateId || null,
    evaluations,
    appliedCandidateIds: evaluations.filter((item) => item.applied).map((item) => item.candidateId),
  }
}

export async function getRepairCalibrationSnapshot(input: {
  scene: Scene
  regenerationMasterScene?: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  imageUrl?: string
  previousFixState?: FixSessionState
  forceAlternativeLayout?: boolean
  repairConfig?: RepairSearchConfigOverride
}) {
  const result = await runRepairPipeline(input)
  return result.diagnostics.selection?.calibration
}

export function autoAdaptFormat(master: Scene, formatKey: FormatKey, visualSystem: VisualSystemKey, brandKit: BrandKit, imageProfile?: ImageProfile) {
  return buildDeterministicVariant({
    master,
    formatKey,
    visualSystem,
    brandKit,
    goal: 'promo-pack',
    assetHint: imageProfile ? { imageProfile } : undefined,
  })
}

function buildVariant(
  project: Pick<Project, 'master' | 'visualSystem' | 'brandKit' | 'assetHint' | 'goal'>,
  formatKey: FormatKey
) {
  return buildDeterministicVariant({
    master: project.master,
    formatKey,
    visualSystem: project.visualSystem,
    brandKit: project.brandKit,
    goal: project.goal,
    assetHint: project.assetHint,
  })
}

function buildFormatRecord(project: Pick<Project, 'master' | 'visualSystem' | 'brandKit' | 'assetHint' | 'goal'>) {
  return Object.fromEntries(
    CHANNEL_FORMATS.map((format) => [
      format.key,
      buildVariant(project, format.key),
    ])
  ) as Record<FormatKey, Scene>
}

export function buildProject(
  template: TemplateKey,
  options?: {
    goal?: Project['goal']
    visualSystem?: VisualSystemKey
    brandKit?: BrandKit
    imageProfile?: ImageProfile
  }
): Project {
  const brandKit = clone(options?.brandKit || defaultBrandKit())
  const visualSystem = options?.visualSystem || 'bold-promo'
  const master = createMasterScene(template, brandKit)

  return syncProjectModel({
    template,
    goal: options?.goal || 'promo-pack',
    visualSystem,
    brandKit,
    master,
    formats: buildFormatRecord({
      master,
      goal: options?.goal || 'promo-pack',
      visualSystem,
      brandKit,
      assetHint: options?.imageProfile ? { imageProfile: options.imageProfile } : undefined,
    }),
    assetHint: options?.imageProfile ? { imageProfile: options.imageProfile } : undefined,
  })
}

export function regenerateFormats(project: Project): Project {
  return syncProjectModel({
    ...project,
    formats: buildFormatRecord(project),
  })
}

export function applyBrandTemplate(project: Project, brandTemplateKey: BrandTemplateKey): Project {
  const template = findBrandTemplate(brandTemplateKey)
  const system = getVisualSystem(project.visualSystem)
  const nextProject = {
    ...project,
    brandKit: clone(template.brandKit),
    master: {
      ...project.master,
      background: [...template.brandKit.background] as [string, string, string],
      accent: template.brandKit.accentColor,
      title: { ...project.master.title, weight: system.titleWeight },
      subtitle: { ...project.master.subtitle, opacity: system.subtitleOpacity },
      cta: {
        ...project.master.cta,
        bg: template.brandKit.accentColor,
        fill: template.brandKit.primaryColor,
      },
    },
  }
  return regenerateFormats(nextProject)
}
