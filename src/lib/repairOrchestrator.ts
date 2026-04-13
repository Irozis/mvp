// Auto-split from autoAdapt.ts — do not edit logic here directly.

import { FORMAT_MAP } from './presets'
import { applyFixAction, finalizeSceneGeometry } from './layoutEngine'
import { getCompositionModel } from './formatCompositionModels'
import {
  aiReviewLayout,
  analyzeFullLayout,
  getFormatAssessment,
  getFormatFamily,
} from './validation'
import { profileContent } from './contentProfile'
import { chooseLayoutIntent } from './scenarioClassifier'
import { resolveRepairSearchConfig } from './repairObjective'
import { isMarketplaceLayoutV2Enabled, isMarketplaceV2FormatKey } from './marketplaceLayoutV2'
import type {
  AssetHint,
  BrandKit,
  EnhancedImageAnalysis,
  FixAction,
  FixResult,
  FixSessionState,
  FormatKey,
  LayoutAssessment,
  Project,
  RepairResult,
  RepairSearchConfigOverride,
  RepairSearchTelemetry,
  RepairStrategy,
  RejectedFixAction,
  Scene,
  ScoreTrust,
  Variant,
  VisualSystemKey,
} from './types'
import type {
  AutoFixStructuralEscalationContext,
  RepairAttempt,
  RepairDiagnostics,
  RepairRegenerationCandidateDiagnostics,
} from './repairHelpers'
import {
  REPAIR_HISTORY_LIMIT,
  analysisToIssueBuckets,
  attemptGuidedRegenerationRepair,
  attemptLocalStructuralRepair,
  buildFixPlanFromAnalysis,
  buildMarketplaceV2SlotFixBypassOutcome,
  buildPrimaryStructuralEscalationStrategy,
  buildRepairDecision,
  chooseFixStrategy,
  classifyStructuralFailure,
  clone,
  collectFixActions,
  createRepairAttemptSignature,
  createRepairSceneSignature,
  evaluateRepairScene,
  evaluateRepairSceneSync,
  getDefaultPreviewCandidateBudget,
  getStructuralTierRank,
  logRepairAttemptSummary,
  pickBestAcceptedRepair,
  pickPrimaryStructuralEscalationCandidate,
  selectBestPreviewCandidate,
  selectRepairSearchWinner,
  shouldAllowAnotherFix,
  shouldStartWithLocalRepair,
  supportsPrimaryStructuralEscalation,
  toRepairAttemptDiagnostics,
  toRepairRegenerationCandidateDiagnostics,
  unique,
  unresolvedIssueCount,
} from './repairHelpers'

export function runAutoFix(
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

export async function runRepairPipeline(input: {
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
