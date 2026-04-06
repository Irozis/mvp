import { describe, expect, it } from 'vitest'

import { DEFAULT_REPAIR_SEARCH_CONFIG } from './repairObjective'
import { classifyPlacementViolation, simulateSoftPlacementPolicy } from './repairPlacement'
import type { LayoutAssessment, Scene } from './types'

function createScene(ctaY: number): Scene {
  return {
    background: ['#111111', '#222222', '#333333'],
    accent: '#ffffff',
    title: {
      x: 8,
      y: 62,
      w: 40,
      h: 10,
      text: 'Title',
      fontSize: 48,
      maxLines: 2,
    },
    subtitle: {
      x: 8,
      y: 73,
      w: 38,
      h: 6,
      text: 'Support copy',
      fontSize: 22,
      maxLines: 2,
    },
    cta: {
      x: 6.7,
      y: ctaY,
      w: 24,
      h: 7,
      text: 'Shop now',
      fontSize: 16,
      maxLines: 1,
    },
    badge: { x: 76, y: 18, w: 10, h: 4, text: '' },
    logo: { x: 8, y: 8, w: 14, h: 4, text: '' },
    image: { x: 54, y: 14, w: 30, h: 36 },
  }
}

function createAssessment(overrides?: Partial<LayoutAssessment>): LayoutAssessment {
  return {
    score: 72,
    verdict: 'Needs repair',
    issues: [],
    structuralState: {
      status: 'degraded',
      findings: [],
      metrics: {
        overlapCount: 0,
        spacingViolationCount: 0,
        safeAreaViolationCount: 0,
        textClusterCoverage: 0.24,
        occupiedSafeArea: 0.62,
        imageCoverage: 0.46,
      },
    },
    visual: {
      overallScore: 78,
      band: 'acceptable',
      breakdown: {
        focusHierarchy: 82,
        compositionBalance: 70,
        textImageHarmony: 74,
        ctaQuality: 66,
        negativeSpaceQuality: 64,
        coherence: 72,
      },
      warnings: [],
      strengths: [],
    },
    perceptual: {
      hasClearPrimary: true,
      primaryElement: 'image',
      clusterCohesion: 78,
      ctaIntegration: 64,
      visualBalance: 66,
      deadSpaceScore: 28,
      imageDominance: 54,
      textDominance: 46,
      readingFlowClarity: 74,
    },
    ...overrides,
  }
}

function createAssessmentWithCtaPreferredZone(ctaZoneY: number): LayoutAssessment {
  return createAssessment({
    compositionZones: [
      {
        id: 'cta-preferred',
        role: 'cta',
        rect: {
          x: 72,
          y: ctaZoneY,
          w: 280,
          h: 76,
        },
      },
    ],
  })
}

describe('repairPlacement', () => {
  it('classifies none, moderate, and severe placement drift deterministically', () => {
    const none = classifyPlacementViolation({
      scene: createScene(79.2),
      assessment: createAssessmentWithCtaPreferredZone(760),
      formatKey: 'social-square',
    })
    const moderate = classifyPlacementViolation({
      scene: createScene(82.4),
      assessment: createAssessmentWithCtaPreferredZone(760),
      formatKey: 'social-square',
    })
    const severe = classifyPlacementViolation({
      scene: createScene(92),
      assessment: createAssessment({
        visual: {
          overallScore: 60,
          band: 'weak',
          breakdown: {
            focusHierarchy: 58,
            compositionBalance: 54,
            textImageHarmony: 58,
            ctaQuality: 60,
            negativeSpaceQuality: 52,
            coherence: 50,
          },
          warnings: ['weak-focus'],
          strengths: [],
        },
        perceptual: {
          ...createAssessment().perceptual!,
          clusterCohesion: 42,
          hasClearPrimary: false,
        },
      }),
      formatKey: 'social-square',
    })

    expect(none.severity).toBe('moderate')
    expect(none.role).toBe('cta')
    expect(none.avgAllowedDistance).toBeGreaterThan(0)
    expect(none.perRole.find((entry) => entry.role === 'cta')?.allowedZonesCount).toBeGreaterThan(0)
    expect(none.skippedRoles.find((entry) => entry.role === 'price')?.reason).toBeTruthy()
    expect(moderate.severity).toBe('moderate')
    expect(severe.severity).toBe('severe')
  })

  it('simulates soft placement as a penalty without mutating real gates', () => {
    const rejectionReasons = ['role-placement-out-of-zone'] as const
    const gateOutcomes = {
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
    }

    const simulation = simulateSoftPlacementPolicy({
      aggregateScore: 51,
      baselineAggregateScore: 48,
      rejectionReasons: [...rejectionReasons],
      gateOutcomes,
      placement: {
        role: 'cta',
        violatingRoles: ['cta'],
        preferredZoneDistance: 3.1,
        allowedZoneDistance: 1.2,
        avgAllowedDistance: 1.2,
        avgPreferredDistance: 3.1,
        clusterIntegrity: 78,
        visualHierarchyPreserved: true,
        likelyIntentional: true,
        badgeSemanticallyActive: false,
        badgeVisuallyCritical: false,
        badgeAffectsCoreReadingFlow: false,
        badgeLikelyOptional: false,
        severity: 'mild',
        reasons: ['allowed-zone-drift:1.2'],
        perRole: [],
        skippedRoles: [],
        textBoxes: {
          titleRect: { x: 8, y: 62, w: 40, h: 10 },
          subtitleRect: { x: 8, y: 73, w: 38, h: 6 },
          combinedBoundsRect: { x: 8, y: 62, w: 40, h: 17 },
        },
      },
      thresholds: DEFAULT_REPAIR_SEARCH_CONFIG.thresholds,
    })

    expect(simulation.softPlacementPenalty).toBe(1.5)
    expect(simulation.adjustedAggregateScore).toBe(49.5)
    expect(simulation.wouldPassWithSoftPlacement).toBe(true)
    expect(simulation.wouldBeatBaselineWithSoftPlacement).toBe(true)
    expect(rejectionReasons).toEqual(['role-placement-out-of-zone'])
    expect(gateOutcomes.rolePlacementOutOfZone).toBe(true)
  })

  it('keeps severe or multi-gate cases rejected in simulation', () => {
    const simulation = simulateSoftPlacementPolicy({
      aggregateScore: 54,
      baselineAggregateScore: 48,
      rejectionReasons: ['role-placement-out-of-zone', 'legacy-safety-rejection'],
      gateOutcomes: {
        repeatSuppressed: false,
        legacySafetyRejected: true,
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
      placement: {
        role: 'multiple',
        violatingRoles: ['cta', 'text'],
        preferredZoneDistance: 12,
        allowedZoneDistance: 6,
        avgAllowedDistance: 6,
        avgPreferredDistance: 12,
        clusterIntegrity: 44,
        visualHierarchyPreserved: false,
        likelyIntentional: false,
        badgeSemanticallyActive: false,
        badgeVisuallyCritical: false,
        badgeAffectsCoreReadingFlow: false,
        badgeLikelyOptional: false,
        severity: 'severe',
        reasons: ['multiple-roles-drifting'],
        perRole: [],
        skippedRoles: [],
        textBoxes: {
          titleRect: { x: 8, y: 62, w: 40, h: 10 },
          subtitleRect: { x: 8, y: 73, w: 38, h: 6 },
          combinedBoundsRect: { x: 8, y: 62, w: 40, h: 17 },
        },
      },
      thresholds: DEFAULT_REPAIR_SEARCH_CONFIG.thresholds,
    })

    expect(simulation.softPlacementPenalty).toBe(9)
    expect(simulation.adjustedAggregateScore).toBe(45)
    expect(simulation.wouldPassWithSoftPlacement).toBe(false)
    expect(simulation.wouldBeatBaselineWithSoftPlacement).toBe(false)
  })

  it('uses attachment-aware text diagnostics for square display without mutating non-display behavior', () => {
    const attachmentAware = classifyPlacementViolation({
      scene: {
        ...createScene(79.2),
        title: {
          ...createScene(79.2).title,
          x: 12,
          y: 40,
          w: 46,
          h: 12,
        },
        subtitle: {
          ...createScene(79.2).subtitle,
          x: 13,
          y: 54,
          w: 20,
          h: 6,
          text: 'Short support',
        },
      },
      assessment: createAssessment({
        compositionZones: [
          {
            id: 'text-zone',
            role: 'text',
            rect: { x: 96, y: 420, w: 280, h: 120 },
          },
        ],
      }),
      formatKey: 'social-square',
      candidateKind: 'guided-regeneration-repair',
      strategyLabel: 'guided-overlay-balanced-regeneration',
    })

    const baselineLike = classifyPlacementViolation({
      scene: {
        ...createScene(79.2),
        title: {
          ...createScene(79.2).title,
          x: 12,
          y: 40,
          w: 46,
          h: 12,
        },
        subtitle: {
          ...createScene(79.2).subtitle,
          x: 13,
          y: 54,
          w: 20,
          h: 6,
          text: 'Short support',
        },
      },
      assessment: createAssessment({
        compositionZones: [
          {
            id: 'text-zone',
            role: 'text',
            rect: { x: 96, y: 420, w: 280, h: 120 },
          },
        ],
      }),
      formatKey: 'social-square',
    })

    expect(attachmentAware.textCluster).toBeTruthy()
    expect(attachmentAware.textCluster?.subtitleDetached).toBe(false)
    expect(
      (attachmentAware.textCluster?.combinedAllowedDistance ?? 0) >=
        (attachmentAware.perRole.find((entry) => entry.role === 'text')?.allowedDistance ?? Infinity)
    ).toBe(true)
    expect(baselineLike.textCluster).toBeUndefined()
  })

  it('captures landscape display image policy diagnostics for image-led candidates', () => {
    const placement = classifyPlacementViolation({
      scene: {
        ...createScene(79.2),
        image: {
          x: 63.6,
          y: 12,
          w: 30.4,
          h: 59.2,
        },
      },
      assessment: createAssessment({
        compositionZones: [
          {
            id: 'image-zone',
            role: 'image',
            rect: { x: 168, y: 32, w: 116, h: 116 },
          },
        ],
      }),
      formatKey: 'display-mpu',
      candidateKind: 'image-balance-repair',
      strategyLabel: 'image-balance-repair',
    })

    expect(placement.imagePlacement).toBeTruthy()
    expect(placement.imagePlacement?.splitSideOccupancy).toBeGreaterThan(0)
    expect(placement.imagePlacement?.adjustedAllowedDistance).toBeLessThanOrEqual(
      placement.imagePlacement?.rawAllowedDistance ?? Infinity
    )
  })

  it('captures landscape display text cluster diagnostics for split-layout candidates', () => {
    const placement = classifyPlacementViolation({
      scene: {
        ...createScene(79.2),
        title: {
          ...createScene(79.2).title,
          x: 7,
          y: 26,
          w: 46,
          h: 20,
        },
        subtitle: {
          ...createScene(79.2).subtitle,
          x: 7,
          y: 48,
          w: 38,
          h: 8,
          text: 'Support copy',
        },
        cta: {
          ...createScene(79.2).cta,
          x: 9,
          y: 72,
          w: 30,
          h: 11,
        },
        image: {
          x: 61,
          y: 12,
          w: 33,
          h: 55,
        },
      },
      assessment: createAssessment({
        compositionZones: [
          {
            id: 'text-zone',
            role: 'text',
            rect: { x: 24, y: 40, w: 184, h: 116 },
          },
          {
            id: 'cta-zone',
            role: 'cta',
            rect: { x: 28, y: 118, w: 144, h: 40 },
          },
        ],
      }),
      formatKey: 'display-mpu',
      candidateKind: 'image-balance-repair',
      strategyLabel: 'image-balance-repair',
    })

    expect(placement.landscapeTextCluster).toBeTruthy()
    expect(placement.landscapeTextCluster?.ctaAttachmentDistance).toBeGreaterThan(0)
    expect(placement.landscapeTextCluster?.ctaAnchorDistance).toBeLessThanOrEqual(
      placement.landscapeTextCluster?.ctaAttachmentDistance ?? Infinity
    )
    expect(placement.landscapeTextCluster?.ctaAnchorVerticalGap).toBeGreaterThan(0)
    expect(typeof placement.landscapeTextCluster?.ctaAnchorWouldBecomeMilder).toBe('boolean')
    expect(typeof placement.landscapeTextCluster?.textImageSplitCoherent).toBe('boolean')
  })
})
