import type {
  AssetHint,
  ContentProfile,
  EnhancedImageAnalysis,
  FormatDefinition,
  GoalKey,
  ImageProfile,
  LayoutIntent,
  LayoutIntentFamily,
  Scene,
  ScenarioKey,
  VisualSystemKey,
} from './types'
import { getFormatArchetypeRanking, getFormatBalanceDefaults } from './formatDefaults'
import { adaptMarketplaceCardTemplate } from './templateAdapter'

let aiLayoutStrategySelector:
  | ((context: {
      format: FormatDefinition
      master: Scene
      profile: ContentProfile
      imageAnalysis?: EnhancedImageAnalysis
      brandTone?: string
      visualSystem: VisualSystemKey
      goal: GoalKey
      imageProfile?: ImageProfile
    }) => Promise<LayoutIntent>)
  | null = null

export function setAILayoutStrategySelector(
  selector:
    | ((context: {
        format: FormatDefinition
        master: Scene
        profile: ContentProfile
        imageAnalysis?: EnhancedImageAnalysis
        brandTone?: string
        visualSystem: VisualSystemKey
        goal: GoalKey
        imageProfile?: ImageProfile
      }) => Promise<LayoutIntent>)
    | null
) {
  aiLayoutStrategySelector = selector
}

export function classifyScenario({
  profile,
  goal,
  visualSystem,
  imageProfile,
}: {
  profile: ContentProfile
  goal: GoalKey
  visualSystem: VisualSystemKey
  imageProfile?: ImageProfile
}): ScenarioKey {
  if (visualSystem === 'product-card' || goal === 'promo-pack') {
    switch (profile.marketplaceCommercialHint) {
      case 'marketplace-product-hero':
        return 'product-card'
      case 'marketplace-price-punch':
      case 'marketplace-compact-offer':
        return 'bold-offer'
      case 'marketplace-proof-led':
      case 'marketplace-benefit-stack':
        return 'text-heavy-ad'
      case 'marketplace-catalog-tile':
        return profile.productVisualNeed === 'critical' ? 'product-card' : 'short-promo'
      default:
        break
    }
  }
  if (visualSystem === 'product-card' || profile.messageType === 'product') return 'product-card'
  if (visualSystem === 'luxury-clean' || profile.semanticType === 'luxury') return 'luxury-minimal'
  if (visualSystem === 'editorial' || profile.semanticType === 'editorial') return 'editorial-story'
  if (profile.hasOffer || goal === 'performance-banners' || profile.needsOfferDominance) return 'bold-offer'
  if (profile.density === 'dense' || profile.preferredMessageMode === 'text-first') return 'text-heavy-ad'
  if (imageProfile === 'portrait' || imageProfile === 'tall') return 'editorial-story'
  return 'short-promo'
}

function chooseFamily(format: FormatDefinition, profile: ContentProfile, visualSystem: VisualSystemKey): LayoutIntentFamily {
  if (format.category === 'presentation' || format.key === 'presentation-hero' || format.key === 'presentation-cover' || format.key === 'presentation-onepager') {
    return visualSystem === 'minimal' || visualSystem === 'luxury-clean' ? 'presentation-clean-hero' : 'presentation-structured-cover'
  }
  if (format.key === 'display-mpu' || format.key === 'display-large-rect') {
    return profile.preferredMessageMode === 'image-first' ? 'display-rectangle-image-bg' : 'display-rectangle-balanced'
  }
  if (format.key === 'display-leaderboard') return 'leaderboard-compact-horizontal'
  if (format.key === 'display-skyscraper' || format.key === 'display-halfpage') {
    return profile.density === 'dense' ? 'skyscraper-split-vertical' : 'skyscraper-image-top-text-stack'
  }
  if (format.family === 'square') return profile.preferredMessageMode === 'image-first' ? 'square-hero-overlay' : 'square-image-top-text-bottom'
  if (format.family === 'portrait') {
    return profile.density === 'dense' || profile.preferredMessageMode === 'text-first' ? 'portrait-bottom-card' : 'portrait-hero-overlay'
  }
  if (format.family === 'wide') {
    if (format.category === 'print' || visualSystem === 'minimal' || visualSystem === 'luxury-clean') return 'billboard-wide-balanced'
    return 'billboard-wide-hero'
  }
  if (profile.preferredMessageMode === 'image-first') return 'landscape-image-dominant'
  if (profile.density === 'dense' || visualSystem === 'editorial') return 'landscape-text-left-image-right'
  return 'landscape-balanced-split'
}

function buildHeuristicLayoutIntent({
  format,
  master,
  profile,
  imageAnalysis,
  visualSystem,
  goal,
  assetHint,
  imageProfile,
}: {
  format: FormatDefinition
  master: Scene
  profile: ContentProfile
  imageAnalysis?: EnhancedImageAnalysis
  visualSystem: VisualSystemKey
  goal: GoalKey
  assetHint?: AssetHint
  imageProfile?: ImageProfile
}): LayoutIntent {
  const rankedArchetypes = getFormatArchetypeRanking({
    format,
    profile,
    goal,
    visualSystem,
    imageProfile: imageAnalysis?.imageProfile || assetHint?.imageProfile || imageProfile,
  })
  const preferredArchetype = rankedArchetypes[0]
  if (format.key === 'marketplace-card') {
    // Marketplace-card now uses template adaptation as the primary intent path.
    // Legacy freeform behavior remains underneath as packing/validation support,
    // but composition structure now starts from the selected template.
    const adaptation = adaptMarketplaceCardTemplate({
      format,
      master,
      profile,
      goal,
      visualSystem,
      imageAnalysis,
      assetHint,
      imageProfile,
    })
    return adaptation.intent
  }
  const tileCompactBase = format.key === 'marketplace-tile' && preferredArchetype === 'compact-minimal'
  const family = tileCompactBase ? 'landscape-balanced-split' : chooseFamily(format, profile, visualSystem)
  const balanceDefaults = getFormatBalanceDefaults({
    format,
    profile,
    goal,
  })
  const imageMode =
    tileCompactBase
      ? 'split-right'
      : family === 'portrait-hero-overlay' || family === 'display-rectangle-image-bg'
        ? 'background'
        : family === 'square-hero-overlay'
          ? 'hero'
          : family === 'portrait-bottom-card'
            ? 'framed'
            : family === 'landscape-image-dominant' || family === 'billboard-wide-hero'
              ? 'hero'
              : family === 'skyscraper-image-top-text-stack'
                ? 'hero'
                : family === 'landscape-text-left-image-right'
                  ? 'split-right'
                  : family === 'landscape-balanced-split'
                    ? 'split-right'
                    : family === 'leaderboard-compact-horizontal'
                      ? 'split-right'
                      : family === 'display-rectangle-balanced'
                        ? 'split-right'
                        : family === 'skyscraper-split-vertical'
                          ? 'split-right'
                          : family === 'billboard-wide-balanced'
                            ? 'split-right'
                            : 'split-right'
  const textMode =
    tileCompactBase
      ? 'cluster-left'
      : family === 'portrait-hero-overlay' || family === 'display-rectangle-image-bg'
        ? 'overlay'
        : family === 'portrait-bottom-card'
          ? 'cluster-bottom'
          : family === 'square-hero-overlay' || family === 'square-image-top-text-bottom'
            ? 'cluster-bottom'
            : family === 'presentation-clean-hero' && visualSystem === 'luxury-clean'
              ? 'centered'
              : 'cluster-left'
  const balanceMode =
    tileCompactBase
      ? 'balanced'
      : balanceDefaults.balanceRegime === 'image-first'
        ? 'image-dominant'
        : balanceDefaults.balanceRegime === 'text-first' || balanceDefaults.balanceRegime === 'dense-copy'
          ? 'text-dominant'
          : family === 'portrait-hero-overlay' || family === 'billboard-wide-hero' || family === 'landscape-image-dominant' || profile.preferredMessageMode === 'image-first'
        ? 'image-dominant'
        : profile.preferredMessageMode === 'text-first'
          ? 'text-dominant'
          : 'balanced'
  const tension =
    profile.semanticType === 'luxury' ? 'premium' :
    profile.semanticType === 'editorial' ? 'editorial' :
    profile.promoIntensity === 'high' ? 'promo' :
    'calm'

  const splitLeft = imageAnalysis?.focalPoint.x
    ? imageAnalysis.focalPoint.x < 42 &&
      (
        family === 'landscape-balanced-split' ||
        family === 'landscape-image-dominant' ||
        family === 'billboard-wide-hero' ||
        family === 'billboard-wide-balanced'
      )
    : false

  return {
    family,
    imageMode: splitLeft && imageMode === 'split-right' ? 'split-left' : imageMode,
    textMode,
    balanceMode,
    tension,
    sourceFamily: format.family,
    presetId: family,
    mode:
      tileCompactBase ? 'split' :
      textMode === 'overlay' ? 'overlay' :
      textMode === 'cluster-bottom' ? 'text-first' :
      imageMode === 'framed' ? 'framed' :
      imageMode === 'hero' && balanceMode === 'image-dominant' ? 'image-first' :
      balanceMode === 'text-dominant' ? 'text-first' :
      'split',
    structuralArchetype:
      preferredArchetype ||
      (textMode === 'overlay' ? 'overlay-balanced' :
      balanceMode === 'text-dominant' ? 'dense-information' :
      imageMode === 'hero' && balanceMode === 'image-dominant' ? 'image-hero' :
      textMode === 'cluster-bottom' ? 'split-vertical' :
      format.family === 'wide' || format.family === 'landscape' ? 'split-horizontal' :
      'text-stack'),
    balanceRegime: balanceDefaults.balanceRegime,
    occupancyMode: balanceDefaults.occupancyMode,
  }
}

export async function aiChooseLayoutStrategy(context: {
  format: FormatDefinition
  master: Scene
  profile: ContentProfile
  imageAnalysis?: EnhancedImageAnalysis
  brandTone?: string
  visualSystem: VisualSystemKey
  goal: GoalKey
  imageProfile?: ImageProfile
}): Promise<LayoutIntent> {
  const heuristic = buildHeuristicLayoutIntent(context)
  if (!aiLayoutStrategySelector) return heuristic

  try {
    const refined = await aiLayoutStrategySelector(context)
    return { ...heuristic, ...refined }
  } catch {
    return heuristic
  }
}

export function chooseLayoutIntent({
  format,
  master,
  profile,
  imageAnalysis,
  visualSystem,
  goal,
  assetHint,
}: {
  format: FormatDefinition
  master: Scene
  profile: ContentProfile
  imageAnalysis?: EnhancedImageAnalysis
  visualSystem: VisualSystemKey
  goal: GoalKey
  assetHint?: AssetHint
}): LayoutIntent {
  return buildHeuristicLayoutIntent({
    format,
    master,
    profile,
    imageAnalysis,
    visualSystem,
    goal,
    assetHint,
  })
}
