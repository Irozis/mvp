import type {
  FormatDefinition,
  FormatFamily,
  RepairAspectMode,
  RepairObjectiveProfile,
  RepairObjectiveProfileOverride,
  RepairObjectiveThresholds,
  RepairObjectiveWeights,
  RepairPerceptualSubweights,
  RepairSearchConfig,
  RepairSearchConfigOverride,
  RepairSideEffectSubweights,
} from './types'

const DEFAULT_THRESHOLDS: RepairObjectiveThresholds = {
  minAggregateGain: 0.75,
  maxConfidenceRegression: 8,
  maxSpacingViolationIncrease: 1,
  maxSpacingGapDeficitIncrease: 1.2,
  allowRolePlacement: false,
  softPlacementPenalty: {
    mild: 1.5,
    moderate: 4,
    severe: 9,
  },
  softPlacementPassMaxSeverity: 'moderate',
}

function normalizeObjectiveWeights(weights: RepairObjectiveWeights): RepairObjectiveWeights {
  const total =
    weights.structuralValidity +
    weights.perceptualQuality +
    weights.commercialStrength +
    weights.familyFidelity +
    weights.sideEffectCost

  if (total <= 0) return weights
  return {
    structuralValidity: weights.structuralValidity / total,
    perceptualQuality: weights.perceptualQuality / total,
    commercialStrength: weights.commercialStrength / total,
    familyFidelity: weights.familyFidelity / total,
    sideEffectCost: weights.sideEffectCost / total,
  }
}

function normalizePerceptualWeights(weights: RepairPerceptualSubweights): RepairPerceptualSubweights {
  const total =
    weights.cluster +
    weights.cta +
    weights.balance +
    weights.deadSpaceQuality +
    weights.readingFlow +
    weights.overall

  if (total <= 0) return weights
  return {
    cluster: weights.cluster / total,
    cta: weights.cta / total,
    balance: weights.balance / total,
    deadSpaceQuality: weights.deadSpaceQuality / total,
    readingFlow: weights.readingFlow / total,
    overall: weights.overall / total,
  }
}

function normalizeProfile(profile: RepairObjectiveProfile): RepairObjectiveProfile {
  return {
    weights: normalizeObjectiveWeights(profile.weights),
    perceptualWeights: normalizePerceptualWeights(profile.perceptualWeights),
    sideEffectWeights: profile.sideEffectWeights,
  }
}

function mergeProfile(base: RepairObjectiveProfile, override?: RepairObjectiveProfileOverride): RepairObjectiveProfile {
  if (!override) return normalizeProfile(base)
  return normalizeProfile({
    weights: {
      ...base.weights,
      ...(override.weights || {}),
    },
    perceptualWeights: {
      ...base.perceptualWeights,
      ...(override.perceptualWeights || {}),
    },
    sideEffectWeights: {
      ...base.sideEffectWeights,
      ...(override.sideEffectWeights || {}),
    },
  })
}

export const DEFAULT_REPAIR_SEARCH_CONFIG: RepairSearchConfig = {
  candidateBudget: 8,
  combinationBudget: 2,
  enableLandscapeTextHeightNearMissOverride: false,
  thresholds: DEFAULT_THRESHOLDS,
  profiles: {
    square: normalizeProfile({
      weights: {
        structuralValidity: 0.36,
        perceptualQuality: 0.24,
        commercialStrength: 0.14,
        familyFidelity: 0.16,
        sideEffectCost: 0.1,
      },
      perceptualWeights: {
        cluster: 0.22,
        cta: 0.18,
        balance: 0.22,
        deadSpaceQuality: 0.18,
        readingFlow: 0.1,
        overall: 0.1,
      },
      sideEffectWeights: {
        disagreement: 1.5,
        deadSpace: 0.6,
        unresolved: 6,
        high: 12,
        critical: 18,
        geometry: 0.45,
        clusterRegression: 0.45,
        balanceRegression: 0.55,
        readingFlowRegression: 0.15,
        ctaDisconnectRegression: 0.18,
        verticalSeparationRegression: 0.15,
        inactiveSideRegression: 0.25,
      },
    }),
    landscape: normalizeProfile({
      weights: {
        structuralValidity: 0.34,
        perceptualQuality: 0.22,
        commercialStrength: 0.14,
        familyFidelity: 0.14,
        sideEffectCost: 0.16,
      },
      perceptualWeights: {
        cluster: 0.16,
        cta: 0.12,
        balance: 0.18,
        deadSpaceQuality: 0.22,
        readingFlow: 0.22,
        overall: 0.1,
      },
      sideEffectWeights: {
        disagreement: 1.5,
        deadSpace: 0.6,
        unresolved: 6,
        high: 12,
        critical: 18,
        geometry: 0.45,
        clusterRegression: 0.15,
        balanceRegression: 0.25,
        readingFlowRegression: 0.55,
        ctaDisconnectRegression: 0.15,
        verticalSeparationRegression: 0.15,
        inactiveSideRegression: 0.65,
      },
    }),
    portrait: normalizeProfile({
      weights: {
        structuralValidity: 0.35,
        perceptualQuality: 0.22,
        commercialStrength: 0.14,
        familyFidelity: 0.17,
        sideEffectCost: 0.12,
      },
      perceptualWeights: {
        cluster: 0.18,
        cta: 0.19,
        balance: 0.16,
        deadSpaceQuality: 0.15,
        readingFlow: 0.2,
        overall: 0.12,
      },
      sideEffectWeights: {
        disagreement: 1.5,
        deadSpace: 0.6,
        unresolved: 6,
        high: 12,
        critical: 18,
        geometry: 0.45,
        clusterRegression: 0.18,
        balanceRegression: 0.22,
        readingFlowRegression: 0.25,
        ctaDisconnectRegression: 0.65,
        verticalSeparationRegression: 0.65,
        inactiveSideRegression: 0.18,
      },
    }),
  },
  familyProfiles: {
    billboard: {
      perceptualWeights: {
        deadSpaceQuality: 0.24,
        readingFlow: 0.24,
        cluster: 0.14,
      },
      sideEffectWeights: {
        inactiveSideRegression: 0.72,
        readingFlowRegression: 0.58,
      },
    },
    'display-leaderboard': {
      perceptualWeights: {
        deadSpaceQuality: 0.25,
        readingFlow: 0.25,
        cluster: 0.13,
      },
      sideEffectWeights: {
        inactiveSideRegression: 0.8,
        readingFlowRegression: 0.62,
      },
    },
  },
}

export function getRepairAspectMode(format: Pick<FormatDefinition, 'width' | 'height'>): RepairAspectMode {
  const ratio = format.width / Math.max(format.height, 1)
  if (ratio >= 0.9 && ratio <= 1.1) return 'square'
  if (ratio > 1.1) return 'landscape'
  return 'portrait'
}

export function resolveRepairSearchConfig(overrides?: RepairSearchConfigOverride): RepairSearchConfig {
  const merged: RepairSearchConfig = {
    candidateBudget: overrides?.candidateBudget ?? DEFAULT_REPAIR_SEARCH_CONFIG.candidateBudget,
    combinationBudget: overrides?.combinationBudget ?? DEFAULT_REPAIR_SEARCH_CONFIG.combinationBudget,
    enableLandscapeTextHeightNearMissOverride:
      overrides?.enableLandscapeTextHeightNearMissOverride ??
      DEFAULT_REPAIR_SEARCH_CONFIG.enableLandscapeTextHeightNearMissOverride,
    thresholds: {
      ...DEFAULT_REPAIR_SEARCH_CONFIG.thresholds,
      ...(overrides?.thresholds || {}),
      softPlacementPenalty: {
        ...DEFAULT_REPAIR_SEARCH_CONFIG.thresholds.softPlacementPenalty,
        ...(overrides?.thresholds?.softPlacementPenalty || {}),
      },
    },
    profiles: {
      square: mergeProfile(DEFAULT_REPAIR_SEARCH_CONFIG.profiles.square, overrides?.profiles?.square),
      landscape: mergeProfile(DEFAULT_REPAIR_SEARCH_CONFIG.profiles.landscape, overrides?.profiles?.landscape),
      portrait: mergeProfile(DEFAULT_REPAIR_SEARCH_CONFIG.profiles.portrait, overrides?.profiles?.portrait),
    },
    familyProfiles: {
      ...DEFAULT_REPAIR_SEARCH_CONFIG.familyProfiles,
      ...(overrides?.familyProfiles || {}),
    },
  }
  return merged
}

export function getRepairObjectiveProfile(input: {
  config: RepairSearchConfig
  aspectMode: RepairAspectMode
  formatFamily: FormatFamily
}): RepairObjectiveProfile {
  return mergeProfile(input.config.profiles[input.aspectMode], input.config.familyProfiles[input.formatFamily])
}
