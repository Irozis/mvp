import type {
  ArchetypeResolution,
  AssetHint,
  ContentProfile,
  EnhancedImageAnalysis,
  FormatDefinition,
  GoalKey,
  ImageProfile,
  LayoutArchetypeId,
  LayoutIntent,
  LayoutIntentFamily,
  Scene,
  ScenarioKey,
  StructuralArchetype,
  VisualSystemKey,
} from './types'
import { getFormatArchetypeRanking, getFormatBalanceDefaults } from './formatDefaults'
import { buildMarketplaceV2BaseLayoutIntent, isMarketplaceLayoutV2Enabled } from './marketplaceLayoutV2'
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

function chooseFamily(
  format: FormatDefinition,
  profile: ContentProfile,
  visualSystem: VisualSystemKey,
  imageAnalysis?: EnhancedImageAnalysis
): LayoutIntentFamily {
  // Image-quality signals that should influence composition choice
  const cropRiskHigh = imageAnalysis?.cropRisk === 'high'
  const imageContrastLow = imageAnalysis?.detectedContrast === 'low'
  // Avoid full-bleed hero/overlay when the subject would be cropped or image is flat
  const avoidHeroOverlay = cropRiskHigh || imageContrastLow

  if (format.category === 'presentation' || format.key === 'presentation-hero' || format.key === 'presentation-cover' || format.key === 'presentation-onepager') {
    return visualSystem === 'minimal' || visualSystem === 'luxury-clean' ? 'presentation-clean-hero' : 'presentation-structured-cover'
  }
  if (format.key === 'display-mpu' || format.key === 'display-large-rect') {
    // Avoid image-bg mode when image has low contrast (text will be unreadable)
    if (imageContrastLow) return 'display-rectangle-balanced'
    return profile.preferredMessageMode === 'image-first' ? 'display-rectangle-image-bg' : 'display-rectangle-balanced'
  }
  if (format.key === 'display-leaderboard') return 'leaderboard-compact-horizontal'
  if (format.key === 'display-skyscraper' || format.key === 'display-halfpage') {
    return profile.density === 'dense' ? 'skyscraper-split-vertical' : 'skyscraper-image-top-text-stack'
  }
  if (format.family === 'square') {
    if (!avoidHeroOverlay && profile.preferredMessageMode === 'image-first') return 'square-hero-overlay'
    return 'square-image-top-text-bottom'
  }
  if (format.family === 'portrait') {
    // High crop risk in portrait = dangerous for full-bleed (subject edges get cut)
    if (avoidHeroOverlay || profile.density === 'dense' || profile.preferredMessageMode === 'text-first') return 'portrait-bottom-card'
    return 'portrait-hero-overlay'
  }
  if (format.family === 'wide') {
    if (format.category === 'print' || visualSystem === 'minimal' || visualSystem === 'luxury-clean') return 'billboard-wide-balanced'
    // Avoid hero overlay for wide formats when image contrast is low
    if (imageContrastLow) return 'billboard-wide-balanced'
    return 'billboard-wide-hero'
  }
  // Landscape: use image aspect ratio to pick best split
  if (profile.preferredMessageMode === 'image-first' && !avoidHeroOverlay) return 'landscape-image-dominant'
  if (profile.density === 'dense' || visualSystem === 'editorial') return 'landscape-text-left-image-right'
  // Portrait/tall images fit naturally in a side column
  if (imageAnalysis?.imageProfile === 'portrait' || imageAnalysis?.imageProfile === 'tall') return 'landscape-text-left-image-right'
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
  if (isMarketplaceLayoutV2Enabled() && (format.key === 'marketplace-card' || format.key === 'marketplace-tile')) {
    return buildMarketplaceV2BaseLayoutIntent({ formatKey: format.key, profile })
  }
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
  const family = tileCompactBase ? 'landscape-balanced-split' : chooseFamily(format, profile, visualSystem, imageAnalysis)
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
  forcedStructuralArchetype,
}: {
  format: FormatDefinition
  master: Scene
  profile: ContentProfile
  imageAnalysis?: EnhancedImageAnalysis
  visualSystem: VisualSystemKey
  goal: GoalKey
  assetHint?: AssetHint
  forcedStructuralArchetype?: LayoutArchetypeId
}): LayoutIntent {
  const intent = buildHeuristicLayoutIntent({
    format,
    master,
    profile,
    imageAnalysis,
    visualSystem,
    goal,
    assetHint,
  })
  if (forcedStructuralArchetype) {
    return { ...intent, structuralArchetype: forcedStructuralArchetype as StructuralArchetype }
  }
  return intent
}

export function resolveArchetype(
  ...args: Parameters<typeof chooseLayoutIntent>
): ArchetypeResolution {
  const [{ format, profile, visualSystem, goal, assetHint }] = args
  const intent = chooseLayoutIntent(...args)

  // Priority order: V2 archetype > template variant > structural archetype
  const archetypeId =
    intent.marketplaceV2Archetype ??
    intent.marketplaceTemplateVariant ??
    intent.structuralArchetype ??
    'text-stack' // safe fallback — most forgiving archetype

  const reason =
    (intent as any).selectionDebug
      ? String((intent as any).selectionDebug)
      : intent.marketplaceV2Archetype
        ? 'marketplace-v2'
        : intent.marketplaceTemplateVariant
          ? 'marketplace-template'
          : 'structural-heuristic'

  // SIGNAL 1 — archetype source certainty (deductions)
  let archetypeSource = 0
  if (intent.marketplaceV2Archetype) {
    archetypeSource = 0
  } else if (intent.marketplaceTemplateVariant) {
    archetypeSource = 0.05
  } else {
    archetypeSource = 0.2
  }

  // SIGNAL 2 — ambiguous / high-conflict scenarios
  const classified = classifyScenario({
    profile,
    goal,
    visualSystem,
    imageProfile: assetHint?.imageProfile,
  })
  let scenarioAmbiguity = 0
  if (classified === 'text-heavy-ad' || classified === 'bold-offer') {
    scenarioAmbiguity = 0.1
  }

  // SIGNAL 3 — missing image analysis on the asset hint
  let missingImageData = 0
  if (assetHint?.enhancedImage == null) {
    missingImageData = 0.15
  }

  // SIGNAL 4 — format vs archetype heuristics
  const { width: fw, height: fh } = format
  const formatAspect: 'portrait' | 'landscape' | 'square' =
    fw > 0 &&
    fh > 0 &&
    Math.abs(fw - fh) / Math.max(fw, fh) < 0.02
      ? 'square'
      : fh > fw
        ? 'portrait'
        : fw > fh
          ? 'landscape'
          : format.family === 'square'
            ? 'square'
            : format.family === 'portrait' ||
                format.family === 'skyscraper' ||
                format.family === 'printPortrait'
              ? 'portrait'
              : 'landscape'

  let formatMismatch = 0
  if (archetypeId === 'image-hero' || archetypeId === 'v2-card-hero-shelf') {
    if (formatAspect === 'landscape') formatMismatch += 0.1
    else if (formatAspect === 'square') formatMismatch += 0.05
  }
  if (
    archetypeId === 'text-stack' ||
    archetypeId === 'dense-information' ||
    archetypeId === 'v2-card-text-focus'
  ) {
    if (formatAspect === 'portrait') formatMismatch += 0.05
  }

  const rawConfidence =
    1.0 - archetypeSource - scenarioAmbiguity - missingImageData - formatMismatch
  const confidence = Math.min(1.0, Math.max(0.1, rawConfidence))

  return {
    archetypeId,
    confidence,
    reason,
    fallback:
      intent.structuralArchetype !== archetypeId ? intent.structuralArchetype : undefined,
    confidenceBreakdown: {
      archetypeSource,
      scenarioAmbiguity,
      missingImageData,
      formatMismatch,
    },
  }
}
