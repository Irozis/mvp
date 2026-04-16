// Core layout pipeline helpers shared between variantBuilder and autoAdapt.
// Lives here to break the circular dependency between those two modules.

import { FORMAT_MAP } from './presets'
import { computePalette } from './colorEngine'
import { getFormatRuleSet } from './formatRules'
import { getFormatArchetypeRanking, getFormatBalanceDefaults, getFormatDensityPreset, getFormatWeakArchetypes } from './formatDefaults'
import { getAlternativeCompositionModel, getCompositionModel, resolveCompositionModelFamily, selectCompositionModel } from './formatCompositionModels'
import { finalizeSceneGeometry, getSynthesisStageDiagnostics, synthesizeLayout } from './layoutEngine'
import { classifyScenario } from './scenarioClassifier'
import { getMarketplaceCardTemplateById } from './templateDefinitions'
import { computePerceptualSignals } from './perceptualSignals'
import { refineMarketplaceCardPerceptualComposition } from './perceptualRefinement'
import { computeTypography } from './typographyEngine'
import { computeScoreTrust, getFormatAssessment, getFormatFamily } from './validation'
import { buildMarketplaceCardTemplateVariantPlans } from './templateVariantGeneration'
import {
  allMarketplaceCardV2Archetypes,
  allMarketplaceTileV2Archetypes,
  isMarketplaceLayoutV2Enabled,
  isMarketplaceV2FormatKey,
  structuralArchetypeForMarketplaceV2Archetype,
} from './marketplaceLayoutV2'
import { runAutoFix } from './repairOrchestrator'
import type {
  AssetHint,
  BrandKit,
  ContentProfile,
  EnhancedImageAnalysis,
  FormatKey,
  FormatFamily,
  BalanceRegime,
  LayoutAssessment,
  LayoutIntent,
  LayoutIntentFamily,
  OccupancyMode,
  Project,
  RepairFailureType,
  Scene,
  ScoreTrust,
  StructuralArchetype,
  StructuralInvariantName,
  StructuralLayoutFinding,
  StructuralLayoutStatus,
  StructuralSignature,
  MarketplaceCardTemplateId,
  PerceptualSignals,
  TemplateKey,
  Variant,
  VisualSystemKey,
} from './types'

// V2 engine flag — mutable module state for dev experimentation
// Note: resets on HMR reload; not suitable for production state
export let LAYOUT_ENGINE_V2_ENABLED = false

export function setLayoutEngineV2(enabled: boolean): void {
  LAYOUT_ENGINE_V2_ENABLED = enabled
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export type PreviewCandidatePlan = {
  id: string
  strategyLabel: string
  fixStage: 'base' | 'local' | 'regional' | 'structural'
  intent: LayoutIntent
  structuralArchetype: StructuralArchetype
  structuralSignature: StructuralSignature
  selectionReason: string
}

export type PreviewCandidateEvaluation = {
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

export type PreviewCandidateSelection = {
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

export type AutoFixStructuralEscalationContext = {
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

export function getStructuralTierRank(status: NonNullable<LayoutAssessment['structuralState']>['status']) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

export function countHighStructuralFindings(assessment: LayoutAssessment) {
  return (assessment.structuralState?.findings || []).filter((finding) => finding.severity === 'high').length
}

export function countCriticalIssues(assessment: LayoutAssessment) {
  return assessment.issues.filter((issue) => issue.severity === 'critical').length
}

export function countHighIssues(assessment: LayoutAssessment) {
  return assessment.issues.filter((issue) => issue.severity === 'high').length
}

export function getVisualTieBreakScore(assessment: LayoutAssessment) {
  return assessment.visual?.overallScore || 0
}

export function shouldUseMarketplaceCardVisualRerank(input: {
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

export function getMarketplaceCardVisualDecisionDelta(left: LayoutAssessment, right: LayoutAssessment) {
  const visualDelta = getVisualTieBreakScore(right) - getVisualTieBreakScore(left)
  return Math.abs(visualDelta) >= 4 ? visualDelta : 0
}

export function getVisualBandRank(assessment: LayoutAssessment) {
  const band = assessment.visual?.band || 'poor'
  if (band === 'strong') return 3
  if (band === 'acceptable') return 2
  if (band === 'weak') return 1
  return 0
}

export function isMarketplaceCardTemplateVariantCandidate(candidate: PreviewCandidateEvaluation) {
  return (
    candidate.formatKey === 'marketplace-card' &&
    Boolean(candidate.intent.marketplaceTemplateId)
  )
}

/** Pure predicate for `evaluatePreviewCandidatePlan` marketplace-card template adjuncts (perceptual refine, prefs, text-first alignment). */
export function shouldRunMarketplaceCardTemplateAdjunctPipeline(input: {
  formatKey: FormatKey
  marketplaceLayoutEngine?: LayoutIntent['marketplaceLayoutEngine']
  marketplaceTemplateId?: string
}): boolean {
  const skipMarketplaceV2Extras =
    input.marketplaceLayoutEngine === 'v2-slot' &&
    (input.formatKey === 'marketplace-card' || input.formatKey === 'marketplace-tile')
  return (
    !skipMarketplaceV2Extras &&
    input.formatKey === 'marketplace-card' &&
    Boolean(input.marketplaceTemplateId)
  )
}

export function getMarketplaceCardSemanticPrimaryTemplateId(candidate: PreviewCandidateEvaluation) {
  const selection = candidate.intent.marketplaceTemplateSelection
  return selection?.debug?.rankedTemplates[0]?.templateId || selection?.selectedTemplateId
}

export function getMarketplaceCardTemplateSemanticScore(candidate: PreviewCandidateEvaluation) {
  const selection = candidate.intent.marketplaceTemplateSelection
  const templateId = candidate.intent.marketplaceTemplateId
  if (!selection?.debug?.rankedTemplates?.length || !templateId) return 0
  return selection.debug.rankedTemplates.find((entry) => entry.templateId === templateId)?.totalScore || 0
}

export function getMarketplaceCardCommercialConfidence(candidate: PreviewCandidateEvaluation): 'weak' | 'medium' | 'strong' {
  const ranked = candidate.intent.marketplaceTemplateSelection?.debug?.rankedTemplates || []
  const primary = ranked[0]?.totalScore || 0
  const runnerUp = ranked[1]?.totalScore || 0
  const gap = primary - runnerUp
  if (gap >= 8) return 'strong'
  if (gap >= 4) return 'medium'
  return 'weak'
}

export function computeMarketplaceCardCommercialPreferenceScore(input: {
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

export function buildBlockedMarketplaceCardEvaluationAlignment(
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

export function clampCandidateScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function getPerceptualCompositeScore(signals?: PerceptualSignals) {
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

export function shouldAcceptMarketplacePerceptualAdjustment(input: {
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

export function computeMarketplaceCardTextFirstEvaluationAlignment(input: {
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

export function getCommercialConfidenceRank(value: PreviewCandidateEvaluation['commercialPreference']) {
  if (!value) return 0
  if (value.confidence === 'strong') return 3
  if (value.confidence === 'medium') return 2
  return 1
}

export function computeMarketplaceCardPerceptualPreference(input: {
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

export function explainMarketplaceCardCommercialDecision(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
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

export function getMarketplaceCardCommercialDecisionDelta(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
  const decision = explainMarketplaceCardCommercialDecision(left, right)
  return decision.applied ? decision.commercialScoreDelta : 0
}

export function explainMarketplaceCardPerceptualDecision(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
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

export function getMarketplaceCardPerceptualDecisionDelta(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
  const decision = explainMarketplaceCardPerceptualDecision(left, right)
  return decision.applied ? decision.perceptualScoreDelta : 0
}

export function compareMarketplaceCardTemplateVariantCandidates(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
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

export function getIntentArchetype(intent: LayoutIntent, formatKey: FormatKey): StructuralArchetype {
  if (intent.structuralArchetype) return intent.structuralArchetype
  const format = FORMAT_MAP[formatKey]
  if (intent.textMode === 'overlay') return 'overlay-balanced'
  if (intent.balanceMode === 'text-dominant') return 'dense-information'
  if (intent.mode === 'image-first' && (intent.imageMode === 'hero' || intent.imageMode === 'background')) return 'image-hero'
  if (format.family === 'portrait' || format.family === 'skyscraper' || intent.textMode === 'cluster-bottom') return 'split-vertical'
  if (format.family === 'wide' || format.family === 'landscape') return 'split-horizontal'
  return 'text-stack'
}

export function getDefaultBalanceRegime(archetype: StructuralArchetype): BalanceRegime {
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

export function getDefaultOccupancyMode(archetype: StructuralArchetype): OccupancyMode {
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

export function buildIntentStructuralSignature(input: {
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

export function buildSceneStructuralSignature(input: {
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

export function createStructuralSignatureKey(signature: StructuralSignature) {
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

export function createSceneGeometrySignature(scene: Scene) {
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

export function applyStructuralArchetypeIntent(input: {
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

export function rankStructuralArchetypes(input: {
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

export function resolveAllowedFamily(formatKey: FormatKey, family: LayoutIntentFamily) {
  const ruleSet = getFormatRuleSet(FORMAT_MAP[formatKey])
  return ruleSet.allowedLayoutFamilies.includes(family) ? family : ruleSet.allowedLayoutFamilies[0]
}

export function normalizePreviewIntent(input: {
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

export function shouldAddRegionalCandidate(formatKey: FormatKey, profile: ContentProfile) {
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

export function isPrimaryGenerationRecoveryFormat(formatKey: FormatKey) {
  return PRIMARY_GENERATION_RECOVERY_FORMATS.has(formatKey)
}

export function supportsPrimaryStructuralEscalation(formatKey: FormatKey) {
  return PRIMARY_STRUCTURAL_ESCALATION_FORMATS.has(formatKey)
}

export function supportsPrimaryFinalQualityGate(formatKey: FormatKey) {
  return isPrimaryGenerationRecoveryFormat(formatKey)
}

export function countPrimaryFinalCriticalFindings(assessment: LayoutAssessment) {
  return (assessment.structuralState?.findings || []).filter(
    (finding) => finding.severity === 'high' && PRIMARY_FINAL_QUALITY_FINDINGS.has(finding.name)
  ).length
}

export function getPrimaryFinalStructuralPenalty(assessment: LayoutAssessment) {
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

export function isBetterPrimaryFinalizationState(candidate: PrimaryFinalizationState, current: PrimaryFinalizationState) {
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

export function unresolvedIssueCount(issues: LayoutAssessment['issues']) {
  return issues.filter((issue) => issue.severity === 'high' || issue.severity === 'medium').length
}

export function shouldConsiderPrimaryFinalizationAlternative(
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

export function shouldRunPrimaryFinalizationReselection(assessment: LayoutAssessment) {
  return (
    (assessment.structuralState?.status || 'invalid') === 'invalid' &&
    (
      countPrimaryFinalCriticalFindings(assessment) > 0 ||
      countHighStructuralFindings(assessment) > 0 ||
      unresolvedIssueCount(assessment.issues) > 0
    )
  )
}

export function finalizePrimarySelectedOutcomeSync(input: {
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

export function buildPrimaryRecoveryPreviewVariants(input: {
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

export function unique<T>(items: T[]) {
  return [...new Set(items)]
}

export function getDefaultPreviewCandidateBudget(formatKey: FormatKey) {
  if (formatKey === 'marketplace-card') return MARKETPLACE_CARD_PREVIEW_CANDIDATE_BUDGET
  if (isPrimaryGenerationRecoveryFormat(formatKey)) return PREVIEW_CANDIDATE_BUDGET + 1
  return PREVIEW_CANDIDATE_BUDGET
}

export function shouldUseExpandedPreviewPlanning(formatKey: FormatKey, includeExtendedDiagnostics?: boolean) {
  return includeExtendedDiagnostics || formatKey === 'marketplace-card'
}

export function createPreviewPlanVariantKey(plan: PreviewCandidatePlan) {
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

export function buildMarketplaceCardGeometryProbeOverrides(input: {
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

export function pushPreviewCandidatePlan(
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

export function buildPreviewCandidatePlans(input: {
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

export function retainSelectionCandidatesForFormat(formatKey: FormatKey, candidates: PreviewCandidateEvaluation[]) {
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

export function evaluatePreviewCandidatePlan(input: {
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

  const shouldRunMarketplaceCardTemplateAdjuncts = shouldRunMarketplaceCardTemplateAdjunctPipeline({
    formatKey: input.formatKey,
    marketplaceLayoutEngine: synthesizedIntent.marketplaceLayoutEngine,
    marketplaceTemplateId: synthesizedIntent.marketplaceTemplateId,
  })

  const perceptualRefinement =
    shouldRunMarketplaceCardTemplateAdjuncts
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
    shouldRunMarketplaceCardTemplateAdjuncts
      ? computeMarketplaceCardPerceptualPreference({
          candidate: candidateAfterPerceptualAdjustment,
        })
      : undefined

  const commercialPreference =
    shouldRunMarketplaceCardTemplateAdjuncts
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
    shouldRunMarketplaceCardTemplateAdjuncts
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

export function getPreviewStructuralFindingPenalty(candidate: PreviewCandidateEvaluation, name: string) {
  return (candidate.assessment.structuralState?.findings || [])
    .filter((finding) => finding.name === name)
    .reduce((sum, finding) => sum + (finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1), 0)
}

export function getPreviewInvalidRecoveryPenalty(candidate: PreviewCandidateEvaluation) {
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

export function getPreviewInvalidRecoveryPreference(candidate: PreviewCandidateEvaluation) {
  let preference = 0
  if (candidate.strategyLabel.startsWith('recovery-')) preference += 8
  if (candidate.fixStage === 'structural') preference += 5
  else if (candidate.fixStage === 'regional') preference += 3
  if (candidate.intent.occupancyMode === 'text-safe') preference += 3
  if (candidate.intent.balanceRegime === 'minimal-copy' || candidate.intent.balanceRegime === 'dense-copy') preference += 2
  return preference
}

export function comparePreviewCandidates(left: PreviewCandidateEvaluation, right: PreviewCandidateEvaluation) {
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

export function logPreviewCandidateSelection(input: {
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

  if (import.meta.env.DEV && false) {
    console.debug('[layout] preview candidate selection', summary)
  }
}

export function selectBestPreviewCandidate(input: {
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
  /** Optional; reserved for preview rotation parity with variant builds. */
  rotationIndex?: number
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

export function clampMarketplaceSceneReadability(scene: Scene, formatKey: FormatKey): Scene {
  if (formatKey !== 'marketplace-card' && formatKey !== 'marketplace-highlight') return scene
  const next = clone(scene)

  if (formatKey === 'marketplace-card') {
    // Headline: large, bold, dominant
    if ((next.title.fontSize || 0) < 40) next.title.fontSize = 40
    if ((next.title.weight || 0) < 700) next.title.weight = 700
    if ((next.title.maxLines || 0) > 3) next.title.maxLines = 3

    // Subtitle: quiet, supporting
    if ((next.subtitle.fontSize || 0) > 18) next.subtitle.fontSize = 18
    if (next.subtitle.opacity === undefined || next.subtitle.opacity > 0.72) next.subtitle.opacity = 0.72

    // CTA: second most important element
    if ((next.cta.w || 0) < 22) next.cta.w = 22
    if ((next.cta.h || 0) < 8) next.cta.h = 8
    if ((next.cta.fontSize || 0) < 15) next.cta.fontSize = 15

    // Title fill: always white on dark panel
    next.title.fill = '#FFFFFF'
    next.subtitle.fill = '#FFFFFF'
  } else if (formatKey === 'marketplace-highlight') {
    if ((next.title.fontSize || 0) < 32) next.title.fontSize = 32
    if ((next.cta.w || 0) < 20) next.cta.w = 20
    if ((next.cta.h || 0) < 7) next.cta.h = 7
  }

  const titleFs = next.title.fontSize || 40
  const subtitleFs = next.subtitle.fontSize || 16
  if (titleFs < subtitleFs * 2) {
    next.title.fontSize = Math.round(subtitleFs * 2.2)
  }

  return next
}
