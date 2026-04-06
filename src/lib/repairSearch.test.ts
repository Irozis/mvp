import { describe, expect, it } from 'vitest'

import {
  applySquareSubtitleCtaPairingStructuralRepairDebug,
  autoAdaptFormat,
  buildProject,
  evaluateLandscapeTextHeightNearMissOverrideDecisionDebug,
  evaluateRepairObjectiveDebug,
  evaluateRepairSearchCandidatesDebug,
  getRepairCalibrationSnapshot,
  getRepairDiagnostics,
} from './autoAdapt'
import { BRAND_TEMPLATES } from './presets'
import type { RepairCandidateEvaluation, Scene } from './types'

function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene
}

function createBrandKit() {
  return BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit
}

function createGoodScene(formatKey: 'marketplace-card' | 'social-square' | 'display-leaderboard') {
  const brandKit = createBrandKit()
  const project = buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit,
    imageProfile: formatKey === 'display-leaderboard' ? 'landscape' : 'square',
  })

  return {
    brandKit,
    master: project.master,
    scene: autoAdaptFormat(
      project.master,
      formatKey,
      'product-card',
      brandKit,
      formatKey === 'display-leaderboard' ? 'landscape' : 'square'
    ),
  }
}

function makeSpacingBroken(scene: Scene) {
  const next = cloneScene(scene)
  next.subtitle.y = (next.title.y || 0) + 6
  next.cta.y = (next.subtitle.y || 0) + 5
  next.cta.x = next.title.x
  return next
}

function makeCrampedBaseline(scene: Scene) {
  const next = cloneScene(scene)
  next.title.y = (next.title.y || 0) + 6
  next.subtitle.y = (next.title.y || 0) + 3
  next.cta.y = (next.subtitle.y || 0) + 4
  return next
}

function makeClusterFocused(scene: Scene) {
  const next = cloneScene(scene)
  next.subtitle.x = next.title.x
  next.subtitle.y = (next.title.y || 0) + 7
  next.cta.x = next.title.x
  next.cta.y = (next.subtitle.y || 0) + 8
  return next
}

function makeFlowFocused(scene: Scene) {
  const next = cloneScene(scene)
  next.title.x = 6
  next.subtitle.x = 6
  next.cta.x = 6
  next.image.x = Math.max((next.image.x || 0) - 4, 42)
  next.image.w = Math.min((next.image.w || 0) + 4, 52)
  next.title.w = Math.min((next.title.w || 0) + 4, 44)
  next.subtitle.w = Math.min((next.subtitle.w || 0) + 4, 44)
  return next
}

function makeSquareSubtitleCtaCollision(scene: Scene) {
  const next = cloneScene(scene)
  next.title.x = 8
  next.title.y = 42
  next.title.w = 40
  next.subtitle.text = 'Limited-time colorway with bonus bundle and fast shipping'
  next.subtitle.x = 8
  next.subtitle.y = 55
  next.subtitle.w = 40
  next.subtitle.h = 11
  next.subtitle.fontSize = 17
  next.subtitle.maxLines = 3
  next.subtitle.charsPerLine = 15
  next.subtitle.opacity = 0.9
  next.cta.text = 'Shop now'
  next.cta.x = 11
  next.cta.y = 64
  next.cta.w = 24
  next.cta.h = 7
  return next
}

function createLandscapeNearMissEvaluation(overrides?: Partial<RepairCandidateEvaluation>): RepairCandidateEvaluation {
  return {
    candidateId: 'candidate-a',
    strategyLabel: 'image-balance',
    candidateKind: 'image-balance-repair',
    structuralStatus: 'invalid',
    effectiveScore: 53,
    aggregateScore: 51,
    aggregateDelta: 1,
    accepted: false,
    rejectionReasons: ['role-placement-out-of-zone'],
    gateOutcomes: {
      repeatSuppressed: false,
      legacySafetyRejected: false,
      hardStructuralInvalidity: false,
      rolePlacementOutOfZone: true,
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
      landscapeTextHeightNearMissSafeguardResults: {
        featureEnabled: false,
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
      },
      wouldWinUnderLandscapeTextHeightNearMissOverride: false,
    },
    summaryTags: [],
    penaltyTags: [],
    objective: {
      structuralValidity: 60,
      perceptualQuality: 58,
      commercialStrength: 54,
      familyFidelity: 60,
      sideEffectCost: 20,
      aggregateScore: 51,
      weights: {
        structuralValidity: 0.34,
        perceptualQuality: 0.22,
        commercialStrength: 0.14,
        familyFidelity: 0.14,
        sideEffectCost: 0.16,
      },
    },
    confidence: {
      effectiveScore: 53,
      disagreement: 8,
      needsHumanAttention: false,
    },
    confidenceDelta: 3,
    structuralFindingDelta: 1,
    placementSeverity: 'mild',
    placementDiagnostics: {
      role: 'text',
      violatingRoles: ['text'],
      preferredZoneDistance: 3,
      allowedZoneDistance: 1.5,
      avgAllowedDistance: 1.5,
      avgPreferredDistance: 3,
      clusterIntegrity: 80,
      visualHierarchyPreserved: true,
      likelyIntentional: true,
      badgeSemanticallyActive: false,
      badgeVisuallyCritical: false,
      badgeAffectsCoreReadingFlow: false,
      badgeLikelyOptional: false,
      severity: 'mild',
      reasons: [],
      perRole: [
        {
          role: 'text',
          eligible: true,
          eligibilityReason: null,
          allowedDistance: 1.5,
          preferredDistance: 3,
          rect: { x: 6, y: 10, w: 32, h: 24 },
          allowedZones: [{ x: 4, y: 8, w: 36, h: 26 }],
          preferredZones: [{ x: 4, y: 8, w: 36, h: 26 }],
          allowedZonesCount: 1,
          preferredZonesCount: 1,
          zonePaddingApplied: 0,
        },
      ],
      skippedRoles: [],
      textBoxes: {
        titleRect: { x: 6, y: 10, w: 32, h: 10 },
        subtitleRect: { x: 6, y: 22, w: 32, h: 18 },
        combinedBoundsRect: { x: 6, y: 10, w: 32, h: 30 },
      },
      landscapeTextCluster: {
        titlePlacementDistance: 1,
        titlePreferredDistance: 1,
        combinedAllowedDistance: 3.6,
        combinedPreferredDistance: 3.6,
        rawCombinedMessageAllowedDistance: 3.6,
        rawCombinedMessagePreferredDistance: 3.6,
        adjustedAllowedDistance: 1.8,
        adjustedPreferredDistance: 1.8,
        adjustedCtaAllowedDistance: 0,
        adjustedCtaPreferredDistance: 0,
        subtitleAttachmentDistance: 0,
        ctaAttachmentDistance: 0,
        ctaAnchorDistance: 0,
        ctaAnchorVerticalGap: 0,
        ctaAnchorHorizontalOffset: 0,
        ctaAttachmentSeverity: 'mild',
        ctaWithinSplitLayoutTolerance: true,
        ctaReadingFlowContinuity: 86,
        ctaMessageAssociationScore: 75,
        ctaAnchorWouldBecomeMilder: true,
        disconnectDrivenPrimarilyByGap: false,
        disconnectDrivenPrimarilyByHorizontalOffset: false,
        clusterFootprint: 26,
        messageClusterHeight: 30,
        messageClusterWidth: 32,
        subtitleInflationContribution: 10,
        subtitleInflatesMainly: true,
        titlePrimaryAnchorWeight: 0.86,
        subtitleSecondaryMassWeight: 0.18,
        titleDominatesMainTextPlacement: true,
        subtitleDetached: false,
        ctaDetached: false,
        textImageSplitCoherent: true,
        messageClusterTooTall: false,
        messageClusterTooWide: false,
        severeDrivenByCombinedClusterOnly: false,
        severeDrivenBySubtitleInflationOnly: false,
        wouldBecomeMilderUnderAttachmentAwarePolicy: true,
        wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy: true,
        wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy: true,
        titleSubtitleVerticalGap: 12,
        titleSubtitleHorizontalOffset: 0,
        titleCtaDistance: 0,
        subtitleCtaDistance: 0,
        fullClusterCoherent: true,
      },
    },
    softPlacementPenalty: 0,
    adjustedAggregateScore: 51,
    wouldPassWithSoftPlacement: false,
    wouldBeatBaselineWithSoftPlacement: false,
    nearMissOverrideEligible: false,
    nearMissOverrideReason: null,
    wouldWinUnderNearMissOverride: false,
    landscapeTextHeightNearMissEligible: false,
    landscapeTextHeightNearMissApplied: false,
    landscapeTextHeightNearMissReason: null,
    landscapeTextHeightNearMissSafeguardResults: {
      featureEnabled: false,
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
    },
    landscapeTextHeightNearMissBlockerFamily: 'landscape-text-height',
    landscapeTextHeightNearMissBlockerSubtype: 'text-too-tall-for-split',
    finalWinnerChangedByOverride: false,
    ...overrides,
  } as RepairCandidateEvaluation
}

describe('repair search objective layer', () => {
  it('compresses subtitle footprint and preserves a cleaner CTA lane for square subtitle+cta pairings', () => {
    const { scene } = createGoodScene('social-square')
    const collision = makeSquareSubtitleCtaCollision(scene)

    const repaired = applySquareSubtitleCtaPairingStructuralRepairDebug({
      scene: collision,
      formatKey: 'social-square',
    })

    expect(repaired.subtitle.h || 0).toBeLessThan(collision.subtitle.h || 0)
    expect(repaired.subtitle.maxLines || 0).toBeLessThanOrEqual(2)
    expect(repaired.cta.x).toBe(repaired.title.x)
    expect(repaired.cta.y || 0).toBeGreaterThanOrEqual(
      (repaired.subtitle.y || 0) + (repaired.subtitle.h || 0) + 3.8 - 0.01
    )
  })

  it('retains the baseline when all candidates regress and emits telemetry', async () => {
    const { brandKit, master, scene } = createGoodScene('marketplace-card')
    const diagnostics = await getRepairDiagnostics({
      scene,
      regenerationMasterScene: master,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
    })

    expect(diagnostics.diagnostics.selection?.retainedBaseline).toBe(true)
    expect(diagnostics.diagnostics.selection?.winnerStrategyLabel).toBe('current')
    expect(diagnostics.diagnostics.searchRuns.length).toBeGreaterThan(0)
    expect(diagnostics.diagnostics.selection?.telemetry.baselineWon).toBe(true)
    expect(diagnostics.diagnostics.selection?.telemetry.candidates.length || 0).toBeGreaterThan(0)
  })

  it('rejects spacing-breaking candidates through the hard gate', () => {
    const { scene } = createGoodScene('marketplace-card')
    const candidate = makeSpacingBroken(scene)
    const evaluation = evaluateRepairObjectiveDebug({
      baselineScene: scene,
      candidateScene: candidate,
      formatKey: 'marketplace-card',
      strategyLabel: 'spacing-break-probe',
      candidateKind: 'spacing-recovery-repair',
    })

    expect(evaluation.accepted).toBe(false)
    expect(evaluation.rejectionReasons).toContain('spacing-threshold-exceeded')
    expect(evaluation.gateOutcomes.spacingThresholdExceeded).toBe(true)
  })

  it('allows thresholds to be overridden in debug evaluation', () => {
    const { scene } = createGoodScene('marketplace-card')
    const baseline = makeCrampedBaseline(scene)
    const defaultEvaluation = evaluateRepairObjectiveDebug({
      baselineScene: baseline,
      candidateScene: scene,
      formatKey: 'marketplace-card',
      strategyLabel: 'recovered-good-scene',
      candidateKind: 'local-structural-repair',
    })
    const strictEvaluation = evaluateRepairObjectiveDebug({
      baselineScene: baseline,
      candidateScene: scene,
      formatKey: 'marketplace-card',
      strategyLabel: 'recovered-good-scene',
      candidateKind: 'local-structural-repair',
      repairConfig: {
        thresholds: {
          minAggregateGain: 999,
        },
      },
    })

    expect(defaultEvaluation.accepted).toBe(true)
    expect(strictEvaluation.accepted).toBe(false)
    expect(strictEvaluation.rejectionReasons).toContain('no-net-gain')
  })

  it('emits candidate-win telemetry when a stronger debug candidate beats baseline', () => {
    const { scene } = createGoodScene('marketplace-card')
    const debug = evaluateRepairSearchCandidatesDebug({
      baselineScene: makeCrampedBaseline(scene),
      candidateScenes: [
        {
          scene,
          strategyLabel: 'recovered-good-scene',
          candidateKind: 'local-structural-repair',
        },
      ],
      formatKey: 'marketplace-card',
    })

    expect(debug.telemetry.baselineWon).toBe(false)
    expect(debug.winner.strategyLabel).toBe('recovered-good-scene')
    expect(debug.telemetry.winnerCandidateId).not.toBe(debug.telemetry.baselineCandidateId)
  })

  it('uses format-aware weighting so square and landscape can prefer different winners from the same candidate pool', () => {
    const square = createGoodScene('social-square').scene
    const landscape = createGoodScene('display-leaderboard').scene
    const squareBaseline = makeSpacingBroken(square)
    const landscapeBaseline = makeSpacingBroken(landscape)
    const repairConfig = {
      profiles: {
        square: {
          weights: {
            perceptualQuality: 0.44,
            familyFidelity: 0.1,
            sideEffectCost: 0.06,
          },
          perceptualWeights: {
            cluster: 0.38,
            balance: 0.24,
            cta: 0.16,
            deadSpaceQuality: 0.1,
            readingFlow: 0.06,
            overall: 0.06,
          },
        },
        landscape: {
          weights: {
            perceptualQuality: 0.24,
            familyFidelity: 0.12,
            sideEffectCost: 0.28,
          },
          perceptualWeights: {
            cluster: 0.08,
            balance: 0.1,
            cta: 0.08,
            deadSpaceQuality: 0.28,
            readingFlow: 0.38,
            overall: 0.08,
          },
        },
      },
    } as const

    const squareDebug = evaluateRepairSearchCandidatesDebug({
      baselineScene: squareBaseline,
      candidateScenes: [
        {
          scene: makeClusterFocused(square),
          strategyLabel: 'square-cluster',
          candidateKind: 'perceptual-rebalance-repair',
        },
        {
          scene: makeFlowFocused(square),
          strategyLabel: 'square-flow',
          candidateKind: 'image-balance-repair',
        },
      ],
      formatKey: 'social-square',
      repairConfig: {
        ...repairConfig,
        thresholds: {
          minAggregateGain: 0,
        },
      },
    })

    const landscapeDebug = evaluateRepairSearchCandidatesDebug({
      baselineScene: landscapeBaseline,
      candidateScenes: [
        {
          scene: makeClusterFocused(landscape),
          strategyLabel: 'landscape-cluster',
          candidateKind: 'perceptual-rebalance-repair',
        },
        {
          scene: makeFlowFocused(landscape),
          strategyLabel: 'landscape-flow',
          candidateKind: 'image-balance-repair',
        },
      ],
      formatKey: 'display-leaderboard',
      repairConfig: {
        ...repairConfig,
        thresholds: {
          minAggregateGain: 0,
        },
      },
    })

    const squareCluster = evaluateRepairObjectiveDebug({
      baselineScene: square,
      candidateScene: makeClusterFocused(square),
      formatKey: 'social-square',
      strategyLabel: 'square-cluster',
      candidateKind: 'perceptual-rebalance-repair',
      repairConfig,
    })
    const squareFlow = evaluateRepairObjectiveDebug({
      baselineScene: square,
      candidateScene: makeFlowFocused(square),
      formatKey: 'social-square',
      strategyLabel: 'square-flow',
      candidateKind: 'image-balance-repair',
      repairConfig,
    })

    const landscapeCluster = evaluateRepairObjectiveDebug({
      baselineScene: landscape,
      candidateScene: makeClusterFocused(landscape),
      formatKey: 'display-leaderboard',
      strategyLabel: 'landscape-cluster',
      candidateKind: 'perceptual-rebalance-repair',
      repairConfig,
    })
    const landscapeFlow = evaluateRepairObjectiveDebug({
      baselineScene: landscape,
      candidateScene: makeFlowFocused(landscape),
      formatKey: 'display-leaderboard',
      strategyLabel: 'landscape-flow',
      candidateKind: 'image-balance-repair',
      repairConfig,
    })

    const squarePreferred = [squareCluster, squareFlow].sort((left, right) => right.aggregateScore - left.aggregateScore)[0]
    const landscapePreferred = [landscapeCluster, landscapeFlow].sort(
      (left, right) => right.aggregateScore - left.aggregateScore
    )[0]

    expect(squareCluster.objective.weights.perceptualQuality).toBeGreaterThan(landscapeCluster.objective.weights.perceptualQuality)
    expect(landscapeFlow.objective.weights.sideEffectCost).toBeGreaterThan(squareFlow.objective.weights.sideEffectCost)
    expect(squarePreferred.strategyLabel).toBe('square-cluster')
    expect(landscapePreferred.strategyLabel).toBe('landscape-flow')
    expect(squareCluster.aggregateScore - squareFlow.aggregateScore).toBeGreaterThan(0)
    expect(landscapeFlow.aggregateScore - landscapeCluster.aggregateScore).toBeGreaterThan(0)
    expect(squareDebug.telemetry.aspectMode).toBe('square')
    expect(landscapeDebug.telemetry.aspectMode).toBe('landscape')
  })

  it('exposes calibration breakdowns, deltas, tags, thresholds, and gate reasons', async () => {
    const { brandKit, master, scene } = createGoodScene('marketplace-card')
    const snapshot = await getRepairCalibrationSnapshot({
      scene: makeCrampedBaseline(scene),
      regenerationMasterScene: master,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
    })

    expect(snapshot).toBeTruthy()
    expect(snapshot?.baseline.objective.aggregateScore).toBeGreaterThanOrEqual(0)
    expect(snapshot?.winner.objective.aggregateScore).toBeGreaterThanOrEqual(0)
    expect(snapshot?.candidateComparisons.length || 0).toBeGreaterThan(1)
    expect(snapshot?.candidateComparisons.some((candidate) => typeof candidate.aggregateDelta === 'number')).toBe(true)
    expect(snapshot?.candidateComparisons.some((candidate) => candidate.summaryTags.length > 0 || candidate.penaltyTags.length > 0)).toBe(true)
    expect(snapshot?.candidateComparisons.some((candidate) => Object.values(candidate.gateOutcomes).some(Boolean))).toBe(true)
    expect(snapshot?.thresholds.minAggregateGain).toBeGreaterThan(0)
  })

  it('promotes an eligible landscape mild near-miss candidate only when the flag is enabled', () => {
    const baseline = createLandscapeNearMissEvaluation({
      candidateId: 'baseline',
      candidateKind: 'baseline',
      strategyLabel: 'current',
      accepted: true,
      aggregateScore: 50,
      aggregateDelta: 0,
      confidence: { effectiveScore: 50, disagreement: 10, needsHumanAttention: false },
      confidenceDelta: 0,
      rejectionReasons: [],
      gateOutcomes: {
        ...createLandscapeNearMissEvaluation().gateOutcomes,
        rolePlacementOutOfZone: false,
      },
    })
    const candidate = createLandscapeNearMissEvaluation()
    const enabled = evaluateLandscapeTextHeightNearMissOverrideDecisionDebug({
      formatKey: 'display-mpu',
      repairConfig: { enableLandscapeTextHeightNearMissOverride: true },
      baselineEvaluation: baseline,
      candidateEvaluations: [candidate],
    })
    const disabled = evaluateLandscapeTextHeightNearMissOverrideDecisionDebug({
      formatKey: 'display-mpu',
      repairConfig: { enableLandscapeTextHeightNearMissOverride: false },
      baselineEvaluation: baseline,
      candidateEvaluations: [candidate],
    })

    expect(enabled.appliedCandidateIds).toEqual(['candidate-a'])
    expect(enabled.evaluations[0]?.eligible).toBe(true)
    expect(disabled.appliedCandidateIds).toEqual([])
    expect(disabled.evaluations[0]?.blockedReasons).toContain('feature-disabled')
  })

  it('blocks the landscape text-height override on confidence drop, spacing collapse, legacy safety, or non-best candidates', () => {
    const baseline = createLandscapeNearMissEvaluation({
      candidateId: 'baseline',
      candidateKind: 'baseline',
      strategyLabel: 'current',
      accepted: true,
      aggregateScore: 50,
      aggregateDelta: 0,
      confidence: { effectiveScore: 50, disagreement: 10, needsHumanAttention: false },
      confidenceDelta: 0,
      rejectionReasons: [],
      gateOutcomes: {
        ...createLandscapeNearMissEvaluation().gateOutcomes,
        rolePlacementOutOfZone: false,
      },
    })
    const nonBest = createLandscapeNearMissEvaluation({
      candidateId: 'candidate-b',
      aggregateScore: 49,
      aggregateDelta: 0.5,
      confidence: { effectiveScore: 53, disagreement: 8, needsHumanAttention: false },
    })
    const blocked = evaluateLandscapeTextHeightNearMissOverrideDecisionDebug({
      formatKey: 'display-mpu',
      repairConfig: { enableLandscapeTextHeightNearMissOverride: true },
      baselineEvaluation: baseline,
      candidateEvaluations: [
        createLandscapeNearMissEvaluation({
          candidateId: 'confidence-drop',
          confidence: { effectiveScore: 49, disagreement: 8, needsHumanAttention: false },
          confidenceDelta: -1,
        }),
        createLandscapeNearMissEvaluation({
          candidateId: 'spacing-collapse',
          gateOutcomes: {
            ...createLandscapeNearMissEvaluation().gateOutcomes,
            spacingThresholdExceeded: true,
          },
        }),
        createLandscapeNearMissEvaluation({
          candidateId: 'legacy-safety',
          gateOutcomes: {
            ...createLandscapeNearMissEvaluation().gateOutcomes,
            legacySafetyRejected: true,
          },
        }),
        nonBest,
        createLandscapeNearMissEvaluation(),
      ],
    })

    expect(blocked.evaluations.find((item) => item.candidateId === 'confidence-drop')?.blockedReasons).toContain(
      'confidence-below-baseline'
    )
    expect(blocked.evaluations.find((item) => item.candidateId === 'spacing-collapse')?.blockedReasons).toContain(
      'spacing-collapse'
    )
    expect(blocked.evaluations.find((item) => item.candidateId === 'legacy-safety')?.blockedReasons).toContain(
      'legacy-safety-rejection'
    )
    expect(blocked.evaluations.find((item) => item.candidateId === 'candidate-b')?.blockedReasons).toContain(
      'not-best-rejected-candidate'
    )
  })
})
