import type {
  BalanceRegime,
  ContentProfile,
  FormatDefinition,
  GoalKey,
  OccupancyMode,
  StructuralArchetype,
  VisualSystemKey,
} from './types'

export type FormatContentDensityPreset = 'minimal-copy' | 'balanced-copy' | 'dense-copy'

export type FormatContractOverride = Partial<{
  textCoverageRange: [number, number]
  imageCoverageRange: [number, number]
  headlineMaxLines: number
  subtitleMaxLines: number
  clusterGapPx: number
  textToImageGapPx: number
  topReservePx: number
  ctaReservePx: number
  occupancyMode: 'compact' | 'balanced' | 'spacious' | 'text-safe' | 'visual-first'
  fallbackMode: 'none' | 'safe-shelf' | 'safe-side'
}>

type FormatDefaultPreset = {
  rankedArchetypes: StructuralArchetype[]
  densityPreset: FormatContentDensityPreset
  balanceRegime: BalanceRegime
  occupancyMode: OccupancyMode
  safeFallbackArchetype: StructuralArchetype
  weakArchetypes: StructuralArchetype[]
  safeInsetBias: { x: number; y: number }
  contractOverrides: Partial<Record<'default' | StructuralArchetype, FormatContractOverride>>
}

export type FormatDefaultsDiagnostics = {
  hasFormatOverride: boolean
  usesFormatLevelRanking: boolean
  usesFormatLevelDensityPreset: boolean
  usesFormatLevelBalanceRegime: boolean
  usesFormatLevelOccupancyMode: boolean
  usesFormatLevelSafeFallback: boolean
  hasFormatLevelContractOverride: boolean
  rankedArchetypes: StructuralArchetype[]
  densityPreset: FormatContentDensityPreset
  balanceRegime: BalanceRegime
  occupancyMode: OccupancyMode
  safeFallbackArchetype: StructuralArchetype
  weakArchetypes: StructuralArchetype[]
}

export type MarketplaceRoleContract = {
  enabled: boolean
  rolePriority: Array<'headline' | 'image' | 'cta' | 'logo' | 'subtitle' | 'badge'>
  optionalRoles: Array<'subtitle' | 'badge' | 'logo'>
  compactCtaScale: number
  compactCtaReserveScale: number
  logoReserveScale: number
  badgeReserveScale: number
  fallbackSteps: Array<'drop-subtitle' | 'drop-badge' | 'compact-cta' | 'shrink-logo' | 'text-safe-fallback'>
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

const DISABLED_MARKETPLACE_ROLE_CONTRACT: MarketplaceRoleContract = {
  enabled: false,
  rolePriority: ['headline', 'image', 'cta', 'logo', 'subtitle', 'badge'],
  optionalRoles: [],
  compactCtaScale: 1,
  compactCtaReserveScale: 1,
  logoReserveScale: 1,
  badgeReserveScale: 1,
  fallbackSteps: [],
}

const MARKETPLACE_ROLE_CONTRACTS: Partial<Record<FormatDefinition['key'], MarketplaceRoleContract>> = {
  'marketplace-card': {
    enabled: true,
    rolePriority: ['headline', 'image', 'cta', 'logo', 'subtitle', 'badge'],
    optionalRoles: ['subtitle', 'badge', 'logo'],
    compactCtaScale: 0.84,
    compactCtaReserveScale: 0.78,
    logoReserveScale: 0.72,
    badgeReserveScale: 0.68,
    fallbackSteps: ['drop-subtitle', 'drop-badge', 'compact-cta', 'shrink-logo', 'text-safe-fallback'],
  },
  'marketplace-tile': {
    enabled: true,
    rolePriority: ['headline', 'image', 'cta', 'logo', 'subtitle', 'badge'],
    optionalRoles: ['subtitle', 'badge', 'logo'],
    compactCtaScale: 0.8,
    compactCtaReserveScale: 0.72,
    logoReserveScale: 0.68,
    badgeReserveScale: 0.64,
    fallbackSteps: ['drop-subtitle', 'drop-badge', 'compact-cta', 'shrink-logo', 'text-safe-fallback'],
  },
  'marketplace-highlight': {
    enabled: true,
    rolePriority: ['headline', 'image', 'cta', 'logo', 'subtitle', 'badge'],
    optionalRoles: ['subtitle', 'badge', 'logo'],
    compactCtaScale: 0.86,
    compactCtaReserveScale: 0.8,
    logoReserveScale: 0.74,
    badgeReserveScale: 0.7,
    fallbackSteps: ['drop-subtitle', 'drop-badge', 'compact-cta', 'shrink-logo', 'text-safe-fallback'],
  },
}

const CATEGORY_DEFAULTS: Record<FormatDefinition['category'], FormatDefaultPreset> = {
  social: {
    rankedArchetypes: ['overlay-balanced', 'compact-minimal', 'image-hero', 'split-vertical', 'dense-information', 'split-horizontal', 'text-stack'],
    densityPreset: 'balanced-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'balanced',
    safeFallbackArchetype: 'compact-minimal',
    weakArchetypes: ['text-stack'],
    safeInsetBias: { x: 0.2, y: 0.2 },
    contractOverrides: {},
  },
  display: {
    rankedArchetypes: ['split-horizontal', 'compact-minimal', 'dense-information', 'image-hero', 'split-vertical', 'overlay-balanced', 'text-stack'],
    densityPreset: 'balanced-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'balanced',
    safeFallbackArchetype: 'split-horizontal',
    weakArchetypes: ['text-stack'],
    safeInsetBias: { x: 0.4, y: 0.2 },
    contractOverrides: {
      default: {
        textCoverageRange: [0.2, 0.34],
        imageCoverageRange: [0.18, 0.46],
        clusterGapPx: 14,
        textToImageGapPx: 24,
      },
    },
  },
  marketplace: {
    rankedArchetypes: ['compact-minimal', 'dense-information', 'split-vertical', 'overlay-balanced', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'minimal-copy',
    balanceRegime: 'text-first',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'compact-minimal',
    weakArchetypes: ['text-stack'],
    safeInsetBias: { x: 0.8, y: 0.6 },
    contractOverrides: {
      default: {
        textCoverageRange: [0.22, 0.38],
        imageCoverageRange: [0.12, 0.34],
        headlineMaxLines: 2,
        subtitleMaxLines: 2,
        clusterGapPx: 14,
        textToImageGapPx: 22,
        ctaReservePx: 66,
      },
      'overlay-balanced': {
        textCoverageRange: [0.22, 0.34],
        imageCoverageRange: [0.12, 0.28],
        subtitleMaxLines: 1,
        fallbackMode: 'safe-shelf',
      },
      'compact-minimal': {
        textCoverageRange: [0.14, 0.24],
        imageCoverageRange: [0.18, 0.34],
        subtitleMaxLines: 1,
      },
    },
  },
  print: {
    rankedArchetypes: ['dense-information', 'split-vertical', 'compact-minimal', 'overlay-balanced', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'dense-copy',
    balanceRegime: 'text-first',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'dense-information',
    weakArchetypes: ['text-stack'],
    safeInsetBias: { x: 1.2, y: 1.2 },
    contractOverrides: {
      default: {
        textCoverageRange: [0.28, 0.46],
        imageCoverageRange: [0.14, 0.4],
        clusterGapPx: 18,
        topReservePx: 80,
      },
    },
  },
  presentation: {
    rankedArchetypes: ['image-hero', 'overlay-balanced', 'dense-information', 'split-horizontal', 'compact-minimal', 'split-vertical', 'text-stack'],
    densityPreset: 'balanced-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'balanced',
    safeFallbackArchetype: 'dense-information',
    weakArchetypes: ['text-stack'],
    safeInsetBias: { x: 0.8, y: 0.8 },
    contractOverrides: {
      default: {
        topReservePx: 82,
        ctaReservePx: 70,
      },
      'image-hero': {
        textCoverageRange: [0.18, 0.3],
        imageCoverageRange: [0.28, 0.52],
      },
    },
  },
}

const FORMAT_DEFAULTS: Partial<Record<FormatDefinition['key'], Partial<FormatDefaultPreset>>> = {
  'social-square': {
    rankedArchetypes: ['overlay-balanced', 'compact-minimal', 'image-hero', 'split-vertical', 'dense-information', 'split-horizontal', 'text-stack'],
    contractOverrides: {
      'overlay-balanced': {
        textCoverageRange: [0.22, 0.34],
        imageCoverageRange: [0.24, 0.48],
      },
    },
  },
  'social-portrait': {
    rankedArchetypes: ['split-vertical', 'dense-information', 'overlay-balanced', 'compact-minimal', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'balanced-copy',
    balanceRegime: 'text-first',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'split-vertical',
    contractOverrides: {
      default: {
        clusterGapPx: 16,
        topReservePx: 78,
      },
    },
  },
  'story-vertical': {
    rankedArchetypes: ['split-vertical', 'dense-information', 'overlay-balanced', 'compact-minimal', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'balanced-copy',
    safeFallbackArchetype: 'split-vertical',
    contractOverrides: {
      default: {
        clusterGapPx: 16,
        topReservePx: 82,
        ctaReservePx: 72,
      },
    },
  },
  'social-landscape': {
    rankedArchetypes: ['split-horizontal', 'compact-minimal', 'overlay-balanced', 'dense-information', 'image-hero', 'split-vertical', 'text-stack'],
    contractOverrides: {
      'split-horizontal': {
        textCoverageRange: [0.22, 0.38],
        imageCoverageRange: [0.2, 0.46],
      },
    },
  },
  'display-mpu': {
    rankedArchetypes: ['compact-minimal', 'dense-information', 'split-horizontal', 'image-hero', 'overlay-balanced', 'split-vertical', 'text-stack'],
    densityPreset: 'minimal-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'spacious',
    safeFallbackArchetype: 'compact-minimal',
  },
  'display-large-rect': {
    rankedArchetypes: ['compact-minimal', 'split-horizontal', 'dense-information', 'image-hero', 'overlay-balanced', 'split-vertical', 'text-stack'],
    densityPreset: 'balanced-copy',
    safeFallbackArchetype: 'compact-minimal',
  },
  'display-leaderboard': {
    rankedArchetypes: ['split-horizontal', 'compact-minimal', 'dense-information', 'image-hero', 'overlay-balanced', 'split-vertical', 'text-stack'],
    densityPreset: 'minimal-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'compact',
    safeFallbackArchetype: 'split-horizontal',
    contractOverrides: {
      default: {
        clusterGapPx: 14,
        textToImageGapPx: 28,
        ctaReservePx: 56,
      },
      'split-horizontal': {
        textCoverageRange: [0.28, 0.44],
        imageCoverageRange: [0.14, 0.36],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
      },
      'compact-minimal': {
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
      },
    },
  },
  'display-skyscraper': {
    rankedArchetypes: ['split-vertical', 'dense-information', 'compact-minimal', 'overlay-balanced', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'balanced-copy',
    balanceRegime: 'text-first',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'split-vertical',
    weakArchetypes: ['text-stack', 'split-horizontal'],
  },
  'display-halfpage': {
    rankedArchetypes: ['split-vertical', 'dense-information', 'compact-minimal', 'overlay-balanced', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'balanced-copy',
    safeFallbackArchetype: 'split-vertical',
    weakArchetypes: ['text-stack', 'split-horizontal'],
  },
  'display-billboard': {
    rankedArchetypes: ['split-horizontal', 'image-hero', 'compact-minimal', 'dense-information', 'overlay-balanced', 'split-vertical', 'text-stack'],
    densityPreset: 'minimal-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'compact',
    safeFallbackArchetype: 'split-horizontal',
  },
  'marketplace-card': {
    rankedArchetypes: ['compact-minimal', 'split-vertical', 'dense-information', 'overlay-balanced', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'minimal-copy',
    balanceRegime: 'text-first',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'dense-information',
    weakArchetypes: ['text-stack', 'split-horizontal', 'image-hero'],
    safeInsetBias: { x: 1.2, y: 0.9 },
    contractOverrides: {
      default: {
        textCoverageRange: [0.26, 0.42],
        imageCoverageRange: [0.1, 0.26],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
        clusterGapPx: 15,
        textToImageGapPx: 24,
        topReservePx: 48,
        ctaReservePx: 54,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-shelf',
      },
      'compact-minimal': {
        textCoverageRange: [0.18, 0.28],
        imageCoverageRange: [0.12, 0.24],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
        clusterGapPx: 12,
        textToImageGapPx: 22,
        ctaReservePx: 50,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-shelf',
      },
      'dense-information': {
        textCoverageRange: [0.28, 0.44],
        imageCoverageRange: [0.1, 0.22],
        headlineMaxLines: 2,
        subtitleMaxLines: 2,
        clusterGapPx: 14,
        textToImageGapPx: 22,
        ctaReservePx: 52,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-shelf',
      },
      'split-vertical': {
        textCoverageRange: [0.24, 0.4],
        imageCoverageRange: [0.12, 0.26],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
        clusterGapPx: 14,
        textToImageGapPx: 22,
        ctaReservePx: 52,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-shelf',
      },
    },
  },
  'marketplace-tile': {
    rankedArchetypes: ['compact-minimal', 'dense-information', 'split-horizontal', 'split-vertical', 'overlay-balanced', 'image-hero', 'text-stack'],
    densityPreset: 'minimal-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'dense-information',
    weakArchetypes: ['text-stack', 'image-hero'],
    safeInsetBias: { x: 1.1, y: 0.5 },
    contractOverrides: {
      default: {
        textCoverageRange: [0.24, 0.38],
        imageCoverageRange: [0.08, 0.24],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
        clusterGapPx: 12,
        textToImageGapPx: 26,
        topReservePx: 42,
        ctaReservePx: 48,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-side',
      },
      'compact-minimal': {
        textCoverageRange: [0.18, 0.28],
        imageCoverageRange: [0.1, 0.22],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
        clusterGapPx: 11,
        textToImageGapPx: 24,
        ctaReservePx: 44,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-side',
      },
      'dense-information': {
        textCoverageRange: [0.26, 0.4],
        imageCoverageRange: [0.08, 0.22],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
        clusterGapPx: 12,
        textToImageGapPx: 26,
        ctaReservePx: 48,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-side',
      },
      'split-horizontal': {
        textCoverageRange: [0.26, 0.42],
        imageCoverageRange: [0.1, 0.24],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
        clusterGapPx: 12,
        textToImageGapPx: 28,
        ctaReservePx: 46,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-side',
      },
    },
  },
  'marketplace-highlight': {
    rankedArchetypes: ['dense-information', 'split-vertical', 'compact-minimal', 'overlay-balanced', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'balanced-copy',
    balanceRegime: 'text-first',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'dense-information',
    weakArchetypes: ['text-stack', 'split-horizontal', 'image-hero'],
    safeInsetBias: { x: 1.1, y: 1.1 },
    contractOverrides: {
      default: {
        textCoverageRange: [0.3, 0.46],
        imageCoverageRange: [0.1, 0.28],
        headlineMaxLines: 3,
        subtitleMaxLines: 2,
        clusterGapPx: 16,
        textToImageGapPx: 24,
        topReservePx: 56,
        ctaReservePx: 56,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-shelf',
      },
      'compact-minimal': {
        textCoverageRange: [0.2, 0.3],
        imageCoverageRange: [0.12, 0.24],
        headlineMaxLines: 2,
        subtitleMaxLines: 1,
        clusterGapPx: 12,
        textToImageGapPx: 22,
        ctaReservePx: 50,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-shelf',
      },
      'dense-information': {
        textCoverageRange: [0.32, 0.48],
        imageCoverageRange: [0.1, 0.24],
        headlineMaxLines: 3,
        subtitleMaxLines: 2,
        clusterGapPx: 15,
        textToImageGapPx: 22,
        ctaReservePx: 54,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-shelf',
      },
      'split-vertical': {
        textCoverageRange: [0.3, 0.44],
        imageCoverageRange: [0.1, 0.28],
        headlineMaxLines: 3,
        subtitleMaxLines: 2,
        clusterGapPx: 15,
        textToImageGapPx: 22,
        ctaReservePx: 54,
        occupancyMode: 'text-safe',
        fallbackMode: 'safe-shelf',
      },
    },
  },
  'print-flyer-a5': {
    rankedArchetypes: ['dense-information', 'split-vertical', 'compact-minimal', 'overlay-balanced', 'image-hero', 'split-horizontal', 'text-stack'],
    densityPreset: 'dense-copy',
    balanceRegime: 'text-first',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'dense-information',
    contractOverrides: {
      default: {
        textCoverageRange: [0.3, 0.48],
        imageCoverageRange: [0.12, 0.34],
      },
    },
  },
  'print-poster-a4': {
    rankedArchetypes: ['dense-information', 'split-vertical', 'overlay-balanced', 'image-hero', 'compact-minimal', 'split-horizontal', 'text-stack'],
    densityPreset: 'balanced-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'dense-information',
    contractOverrides: {
      default: {
        textCoverageRange: [0.26, 0.42],
        imageCoverageRange: [0.14, 0.38],
      },
    },
  },
  'print-billboard': {
    rankedArchetypes: ['split-horizontal', 'image-hero', 'compact-minimal', 'dense-information', 'overlay-balanced', 'split-vertical', 'text-stack'],
    densityPreset: 'minimal-copy',
    balanceRegime: 'balanced',
    occupancyMode: 'compact',
    safeFallbackArchetype: 'split-horizontal',
  },
  'presentation-hero': {
    rankedArchetypes: ['image-hero', 'overlay-balanced', 'dense-information', 'split-horizontal', 'compact-minimal', 'split-vertical', 'text-stack'],
    densityPreset: 'balanced-copy',
    safeFallbackArchetype: 'dense-information',
  },
  'presentation-cover': {
    rankedArchetypes: ['image-hero', 'overlay-balanced', 'dense-information', 'split-horizontal', 'compact-minimal', 'split-vertical', 'text-stack'],
    densityPreset: 'balanced-copy',
    safeFallbackArchetype: 'dense-information',
  },
  'presentation-onepager': {
    rankedArchetypes: ['dense-information', 'split-horizontal', 'overlay-balanced', 'compact-minimal', 'image-hero', 'split-vertical', 'text-stack'],
    densityPreset: 'dense-copy',
    balanceRegime: 'text-first',
    occupancyMode: 'text-safe',
    safeFallbackArchetype: 'dense-information',
  },
}

function mergeOverrides(
  base: Partial<Record<'default' | StructuralArchetype, FormatContractOverride>>,
  override?: Partial<Record<'default' | StructuralArchetype, FormatContractOverride>>
) {
  if (!override) return base
  const keys = unique([...Object.keys(base), ...Object.keys(override)]) as Array<'default' | StructuralArchetype>
  return Object.fromEntries(
    keys.map((key) => [key, { ...(base[key] || {}), ...(override[key] || {}) }])
  ) as Partial<Record<'default' | StructuralArchetype, FormatContractOverride>>
}

function resolveFormatPreset(format: FormatDefinition): FormatDefaultPreset {
  const categoryPreset = CATEGORY_DEFAULTS[format.category]
  const formatPreset = FORMAT_DEFAULTS[format.key]
  return {
    rankedArchetypes: formatPreset?.rankedArchetypes || categoryPreset.rankedArchetypes,
    densityPreset: formatPreset?.densityPreset || categoryPreset.densityPreset,
    balanceRegime: formatPreset?.balanceRegime || categoryPreset.balanceRegime,
    occupancyMode: formatPreset?.occupancyMode || categoryPreset.occupancyMode,
    safeFallbackArchetype: formatPreset?.safeFallbackArchetype || categoryPreset.safeFallbackArchetype,
    weakArchetypes: unique([...(categoryPreset.weakArchetypes || []), ...(formatPreset?.weakArchetypes || [])]),
    safeInsetBias: {
      x: formatPreset?.safeInsetBias?.x ?? categoryPreset.safeInsetBias.x,
      y: formatPreset?.safeInsetBias?.y ?? categoryPreset.safeInsetBias.y,
    },
    contractOverrides: mergeOverrides(categoryPreset.contractOverrides, formatPreset?.contractOverrides),
  }
}

function moveToFront(list: StructuralArchetype[], value: StructuralArchetype) {
  return [value, ...list.filter((item) => item !== value)]
}

export function getFormatDensityPreset(input: {
  format: FormatDefinition
  profile?: ContentProfile
  goal?: GoalKey
}): FormatContentDensityPreset {
  const preset = resolveFormatPreset(input.format)
  let densityPreset = preset.densityPreset
  if (input.goal === 'retail-flyer' || input.profile?.density === 'dense') densityPreset = 'dense-copy'
  if (
    input.profile &&
    input.profile.subtitleLength === 0 &&
    input.profile.badgeLength === 0 &&
    (
      input.format.category === 'display' ||
      input.format.key === 'marketplace-card' ||
      input.format.key === 'marketplace-tile'
    )
  ) {
    densityPreset = 'minimal-copy'
  }
  return densityPreset
}

export function getFormatBalanceDefaults(input: {
  format: FormatDefinition
  profile?: ContentProfile
  goal?: GoalKey
}) {
  const preset = resolveFormatPreset(input.format)
  const densityPreset = getFormatDensityPreset(input)
  let balanceRegime = preset.balanceRegime
  let occupancyMode = preset.occupancyMode

  if (densityPreset === 'dense-copy') {
    balanceRegime = 'dense-copy'
    occupancyMode = 'text-safe'
  } else if (densityPreset === 'minimal-copy') {
    if (input.format.category === 'marketplace') {
      balanceRegime = balanceRegime === 'balanced' ? 'balanced' : 'text-first'
      occupancyMode = 'text-safe'
    } else {
      balanceRegime = balanceRegime === 'image-first' ? 'image-first' : 'minimal-copy'
      occupancyMode = occupancyMode === 'visual-first' ? 'visual-first' : 'spacious'
    }
  }

  if (input.profile?.preferredMessageMode === 'text-first' && balanceRegime === 'balanced') {
    balanceRegime = 'text-first'
    occupancyMode = 'text-safe'
  }
  if (input.profile?.preferredMessageMode === 'image-first' && densityPreset !== 'dense-copy') {
    balanceRegime = input.format.category === 'marketplace' ? 'balanced' : 'image-first'
    occupancyMode = input.format.category === 'marketplace' ? 'text-safe' : 'visual-first'
  }

  return { balanceRegime, occupancyMode, densityPreset }
}

export function getFormatArchetypeRanking(input: {
  format: FormatDefinition
  profile?: ContentProfile
  goal?: GoalKey
  visualSystem?: VisualSystemKey
  imageProfile?: ContentProfile['preferredMessageMode'] | string
}) {
  const preset = resolveFormatPreset(input.format)
  let ranked = [...preset.rankedArchetypes]
  const densityPreset = getFormatDensityPreset({
    format: input.format,
    profile: input.profile,
    goal: input.goal,
  })

  if (densityPreset === 'dense-copy') ranked = moveToFront(ranked, 'dense-information')
  if (densityPreset === 'minimal-copy') {
    ranked = moveToFront(
      ranked,
      input.format.category === 'marketplace' && input.format.key === 'marketplace-highlight'
        ? 'dense-information'
        : 'compact-minimal'
    )
  }
  if (
    (input.format.family === 'wide' || input.format.family === 'landscape') &&
    input.format.category !== 'marketplace'
  ) {
    ranked = moveToFront(ranked, 'split-horizontal')
  }
  if (
    (input.format.family === 'portrait' || input.format.family === 'printPortrait' || input.format.family === 'skyscraper') &&
    input.format.category !== 'marketplace'
  ) {
    ranked = moveToFront(ranked, 'split-vertical')
  }
  if (input.visualSystem === 'minimal' || input.visualSystem === 'luxury-clean') {
    ranked = moveToFront(ranked, 'compact-minimal')
  }
  if (input.profile?.preferredMessageMode === 'image-first' && input.format.category !== 'marketplace') {
    ranked = moveToFront(ranked, 'image-hero')
  }
  if (input.profile?.preferredMessageMode === 'text-first') {
    ranked = moveToFront(ranked, densityPreset === 'dense-copy' ? 'dense-information' : 'split-vertical')
  }
  if (input.goal === 'retail-flyer') ranked = moveToFront(ranked, 'dense-information')
  if (input.format.key === 'marketplace-card' && !input.imageProfile) {
    ranked = [
      'dense-information',
      'split-vertical',
      'compact-minimal',
      'overlay-balanced',
      ...ranked.filter(
        (item) =>
          item !== 'overlay-balanced' &&
          item !== 'split-vertical' &&
          item !== 'dense-information' &&
          item !== 'compact-minimal'
      ),
    ]
  }
  if (input.imageProfile === 'portrait' || input.imageProfile === 'tall') ranked = moveToFront(ranked, 'split-vertical')
  if (input.imageProfile === 'ultraWide') ranked = moveToFront(ranked, 'split-horizontal')

  return unique(ranked)
}

export function getFormatSafeFallbackArchetype(format: FormatDefinition) {
  return resolveFormatPreset(format).safeFallbackArchetype
}

export function getFormatWeakArchetypes(format: FormatDefinition) {
  return resolveFormatPreset(format).weakArchetypes
}

export function getFormatSafeInsetBias(format: FormatDefinition) {
  return resolveFormatPreset(format).safeInsetBias
}

export function getFormatContractOverride(format: FormatDefinition, archetype: StructuralArchetype) {
  const preset = resolveFormatPreset(format)
  return {
    ...(preset.contractOverrides.default || {}),
    ...(preset.contractOverrides[archetype] || {}),
  }
}

export function getMarketplaceRoleContract(format: FormatDefinition): MarketplaceRoleContract {
  return MARKETPLACE_ROLE_CONTRACTS[format.key] || DISABLED_MARKETPLACE_ROLE_CONTRACT
}

export function getFormatDefaultsDiagnostics(format: FormatDefinition): FormatDefaultsDiagnostics {
  const resolved = resolveFormatPreset(format)
  const formatPreset = FORMAT_DEFAULTS[format.key]
  return {
    hasFormatOverride: Boolean(formatPreset),
    usesFormatLevelRanking: Boolean(formatPreset?.rankedArchetypes),
    usesFormatLevelDensityPreset: Boolean(formatPreset?.densityPreset),
    usesFormatLevelBalanceRegime: Boolean(formatPreset?.balanceRegime),
    usesFormatLevelOccupancyMode: Boolean(formatPreset?.occupancyMode),
    usesFormatLevelSafeFallback: Boolean(formatPreset?.safeFallbackArchetype),
    hasFormatLevelContractOverride: Boolean(formatPreset?.contractOverrides && Object.keys(formatPreset.contractOverrides).length),
    rankedArchetypes: resolved.rankedArchetypes,
    densityPreset: resolved.densityPreset,
    balanceRegime: resolved.balanceRegime,
    occupancyMode: resolved.occupancyMode,
    safeFallbackArchetype: resolved.safeFallbackArchetype,
    weakArchetypes: resolved.weakArchetypes,
  }
}
