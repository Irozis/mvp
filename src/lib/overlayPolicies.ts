import type { CompositionModel, CompositionModelId, FormatDefinition, FormatKey, LayoutElementKind } from './types'

type OverlaySafetyPolicy = {
  safeTextScoreMin: number
  safeCoverageMin: number
  safeAreaCoverageMin: number
  maxOverlapByKind: Partial<Record<LayoutElementKind, number>>
}

const DEFAULT_POLICY: OverlaySafetyPolicy = {
  safeTextScoreMin: 0.58,
  safeCoverageMin: 0.7,
  safeAreaCoverageMin: 0.85,
  maxOverlapByKind: {},
}

const POLICIES: Partial<Record<FormatKey, Partial<Record<CompositionModelId, OverlaySafetyPolicy>>>> = {
  'social-square': {
    'square-hero-overlay': {
      safeTextScoreMin: 0.87,
      // safeCoverageMin stays diagnostic-only for now; keep current gating behavior unchanged until a richer policy shape exists
      safeCoverageMin: 0.7,
      safeAreaCoverageMin: 0.22,
      maxOverlapByKind: {
        headline: 0.0125,
        subtitle: 0.015,
        logo: 0.06, // unchanged: insufficient_data
        badge: 0.005,
      },
    },
  },
  'social-portrait': {
    'portrait-hero-overlay': {
      safeTextScoreMin: 0.6,
      safeCoverageMin: 0.7,
      safeAreaCoverageMin: 0.88,
      maxOverlapByKind: {
        headline: 0.22,
        subtitle: 0.2,
        logo: 0.06,
        badge: 0.08,
      },
    },
  },
  'social-landscape': {
    'landscape-hero-overlay': {
      safeTextScoreMin: 0.62,
      safeCoverageMin: 0.75,
      safeAreaCoverageMin: 0.9,
      maxOverlapByKind: {
        headline: 0.18,
        subtitle: 0.16,
        logo: 0.06,
      },
    },
  },
  'print-billboard': {
    'billboard-wide-hero': {
      safeTextScoreMin: 0.66,
      safeCoverageMin: 0.8,
      safeAreaCoverageMin: 0.92,
      maxOverlapByKind: {
        headline: 0.36,
        subtitle: 0.32,
        logo: 0.06,
        badge: 0.1,
      },
    },
  },
  'presentation-hero': {
    'presentation-clean-hero': {
      safeTextScoreMin: 0.64,
      safeCoverageMin: 0.75,
      safeAreaCoverageMin: 0.92,
      maxOverlapByKind: {
        headline: 0.18,
        subtitle: 0.16,
        logo: 0.05,
      },
    },
  },
}

export function getOverlaySafetyPolicy(
  format: FormatDefinition,
  compositionModel?: Pick<CompositionModel, 'id'> | null
): OverlaySafetyPolicy {
  if (!compositionModel) return DEFAULT_POLICY
  return POLICIES[format.key]?.[compositionModel.id] || DEFAULT_POLICY
}
