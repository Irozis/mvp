import type {
  AssetHint,
  BoxCollision,
  BrandKit,
  CompositionModel,
  ContentProfile,
  EnhancedImageAnalysis,
  FixAction,
  FormatDefinition,
  FormatRuleSet,
  LayoutBlock,
  LayoutBox,
  LayoutBoxMap,
  LayoutFixPlan,
  LayoutIntent,
  PalettePlan,
  PerceptualSignals,
  Rect,
  Scene,
  StructuralArchetype,
  StructuralLayoutFinding,
  StructuralLayoutState,
  TypographyPlan,
} from './types'
import { getFormatRuleSet } from './formatRules'
import { getFormatContractOverride, getFormatDensityPreset, getFormatSafeFallbackArchetype, getFormatSafeInsetBias, getMarketplaceRoleContract } from './formatDefaults'
import { getOverlaySafetyPolicy } from './overlayPolicies'
import { resolveCompositionModelFamily, selectCompositionModel } from './formatCompositionModels'
import { buildMarketplaceV2Scene, shouldSynthesizeMarketplaceLayoutV2 } from './marketplaceLayoutV2'
import { computePerceptualSignals } from './perceptualSignals'
import { resolveSharedBadgeSemantic } from './placementRoleMapping'
import { refineMarketplaceCardPerceptualComposition, type MarketplacePerceptualAdjustment } from './perceptualRefinement'
import { applyTextBoxToSceneElement, buildSceneTextGeometry, clampTextBoxToRegion, fitSceneTextToRule } from './textGeometry'
import {
  changeImageAnchor as applyChangeImageAnchor,
  changeImageShape as applyChangeImageShape,
  recomputeImageCrop as applyRecomputeImageCrop,
  recomputeImageFootprint as applyRecomputeImageFootprint,
} from './imageAnalysis'

type Region = { x: number; y: number; w: number; h: number }
type ArchetypeLayoutContract = {
  archetype: StructuralArchetype
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
}

type MarketplaceRoleMode = {
  hideSubtitle: boolean
  hideBadge: boolean
  compactCta: boolean
  compactSubtitle: boolean
  minimalLogo: boolean
  forceTextSafeFallback: boolean
}

type MarketplaceZoneProfile = {
  id: 'base-marketplace' | 'text-first-marketplace' | 'safe-marketplace-fallback' | 'product-dominant-marketplace'
  zones: FamilyZoneSet
  rebalanced: boolean
  safeFallback: boolean
}

function isSquareFamily(intent: LayoutIntent) {
  return intent.family === 'square-hero-overlay' || intent.family === 'square-image-top-text-bottom'
}

/** Marketplace card/tile/highlight layout *families* already encode split or square shelf geometry; generic structural archetypes must not replace them with unrelated presets (e.g. wide compact-minimal hero + tiny text), which then forces adaptZonesToContract to over-shrink the image. */
function shouldPreserveMarketplaceNativeFamilySeed(format: FormatDefinition, intent: LayoutIntent): boolean {
  if (format.category !== 'marketplace') return false
  if (format.key === 'marketplace-card') {
    return intent.family === 'square-image-top-text-bottom' || intent.family === 'square-hero-overlay'
  }
  if (format.key === 'marketplace-tile') {
    return (
      intent.family === 'landscape-balanced-split' ||
      intent.family === 'landscape-text-left-image-right' ||
      intent.family === 'landscape-image-dominant'
    )
  }
  if (format.key === 'marketplace-highlight') {
    return intent.family === 'portrait-bottom-card' || intent.family === 'portrait-hero-overlay'
  }
  return false
}

function applyOccupancyModeToFamilyZones(
  next: FamilyZoneSet,
  input: {
    intent: LayoutIntent
    safeText: Region
    insets: { x: number; y: number }
  }
): FamilyZoneSet {
  const out = clone(next)
  if (input.intent.occupancyMode === 'spacious') {
    out.text = normalizeRegion({ ...out.text, w: out.text.w * 0.86, h: out.text.h * 0.86 })
  } else if (input.intent.occupancyMode === 'compact') {
    out.text = normalizeRegion({ ...out.text, w: out.text.w * 1.06, h: out.text.h * 1.08 })
  } else if (input.intent.occupancyMode === 'visual-first') {
    out.image = normalizeRegion({ ...out.image, w: out.image.w * 1.08, h: out.image.h * 1.04 })
    out.text = normalizeRegion({ ...out.text, w: out.text.w * 0.92 })
  } else if (input.intent.occupancyMode === 'text-safe') {
    out.text = normalizeRegion({
      x: clamp(Math.max(out.text.x, input.safeText.x), input.insets.x + 1, 100),
      y: clamp(Math.max(out.text.y, input.safeText.y), input.insets.y + 1, 100),
      w: Math.min(out.text.w, Math.max(input.safeText.w, 24)),
      h: Math.min(out.text.h, Math.max(input.safeText.h, 18)),
    })
  }
  return out
}

function compactProofSubtitleText(text: string) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const firstClause = normalized.split(/[.!?;:]+/)[0]?.trim() || normalized
  const words = firstClause.split(/\s+/).filter(Boolean)
  const compactWords: string[] = []
  for (const word of words) {
    const next = compactWords.length ? `${compactWords.join(' ')} ${word}` : word
    if (next.length > 44 || compactWords.length >= 6) break
    compactWords.push(word)
  }

  const compact = compactWords.join(' ').trim()
  if (compact) return compact
  return normalized.slice(0, 44).trim()
}

function isPortraitOverlayFamily(intent: LayoutIntent) {
  return intent.family === 'portrait-hero-overlay' || intent.family === 'display-rectangle-image-bg'
}

function isBillboardFamily(intent: LayoutIntent) {
  return intent.family === 'billboard-wide-hero' || intent.family === 'billboard-wide-balanced' || intent.family === 'leaderboard-compact-horizontal'
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function pxToPercentX(value: number, format: FormatDefinition) {
  return (value / format.width) * 100
}

function pxToPercentY(value: number, format: FormatDefinition) {
  return (value / format.height) * 100
}

function rectToRegion(current: FormatRuleSet['safeArea'], format: Pick<FormatDefinition, 'width' | 'height'>): Region {
  return {
    x: (current.x / format.width) * 100,
    y: (current.y / format.height) * 100,
    w: (current.w / format.width) * 100,
    h: (current.h / format.height) * 100,
  }
}

function getRuleZones(
  ruleSet: FormatRuleSet,
  role: 'image' | 'text' | 'cta' | 'logo' | 'badge' | 'price',
  allowedZones?: string[]
) {
  const matches =
    allowedZones?.length
      ? ruleSet.zones.filter((zone) => zone.role === role && allowedZones.includes(zone.id))
      : ruleSet.zones.filter((zone) => zone.role === role)
  return matches.map((match) => rectToRegion(match.rect, { width: ruleSet.width, height: ruleSet.height }))
}

function getRuleZone(ruleSet: FormatRuleSet, role: 'image' | 'text' | 'cta' | 'logo' | 'badge' | 'price', allowedZones?: string[]): Region | undefined {
  return getRuleZones(ruleSet, role, allowedZones)[0]
}

function fitInsideZone(region: Region, container: Region, minW?: number, minH?: number) {
  const w = clamp(region.w, minW || 0, container.w)
  const h = clamp(region.h, minH || 0, container.h)
  return {
    x: clamp(region.x, container.x, container.x + container.w - w),
    y: clamp(region.y, container.y, container.y + container.h - h),
    w,
    h,
  }
}

type FamilyZoneSet = { image: Region; text: Region; logo: Region; badge: Region; cta: Region }

function normalizeRegion(region: Region): Region {
  return {
    x: clamp(region.x, 0, 100),
    y: clamp(region.y, 0, 100),
    w: clamp(region.w, 6, 100 - region.x),
    h: clamp(region.h, 4, 100 - region.y),
  }
}

function applyStructuralArchetypeZoneBias(input: {
  current: FamilyZoneSet
  format: FormatDefinition
  intent: LayoutIntent
  profile: ContentProfile
  safeText: Region
  insets: { x: number; y: number }
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const next: FamilyZoneSet = clone(input.current)
  const archetype = input.intent.structuralArchetype
  if (!archetype) return next

  if (input.format.key === 'marketplace-card' && input.intent.marketplaceTemplateZones) {
    return {
      image: normalizeRegion(input.intent.marketplaceTemplateZones.image),
      text: normalizeRegion(input.intent.marketplaceTemplateZones.text),
      logo: normalizeRegion(input.intent.marketplaceTemplateZones.logo),
      badge: normalizeRegion(input.intent.marketplaceTemplateZones.badge),
      cta: normalizeRegion(input.intent.marketplaceTemplateZones.cta),
    }
  }

  if (archetype && shouldPreserveMarketplaceNativeFamilySeed(input.format, input.intent)) {
    return applyOccupancyModeToFamilyZones(clone(input.current), {
      intent: input.intent,
      safeText: input.safeText,
      insets: input.insets,
    })
  }

  const wideLike = input.format.family === 'wide' || input.format.family === 'landscape'
  const portraitLike =
    input.format.family === 'portrait' ||
    input.format.family === 'printPortrait' ||
    input.format.family === 'skyscraper'

  const noImageMarketplaceCard =
    isNoImageMarketplaceCardLayout({
      format: input.format,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    }) && input.intent.family === 'square-image-top-text-bottom'

  const noImageMarketplaceCardHeaderPanel =
    isNoImageMarketplaceCardLayout({
      format: input.format,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    }) && input.intent.family === 'square-hero-overlay'

  if (noImageMarketplaceCardHeaderPanel) {
    next.image = normalizeRegion({
      x: input.insets.x + 1,
      y: input.insets.y + 2,
      w: 100 - (input.insets.x + 1) * 2,
      h: 34,
    })
    next.text = normalizeRegion({
      x: input.insets.x + 2,
      y: 46,
      w: 78,
      h: 30,
    })
    next.logo = normalizeRegion({ x: input.insets.x, y: input.insets.y, w: 12, h: 5.2 })
    next.badge = normalizeRegion({ x: 74, y: input.insets.y + 2, w: 18, h: 5.2 })
    next.cta = normalizeRegion({
      x: next.text.x,
      y: 80,
      w: 28,
      h: 6,
    })
    return next
  }

  if (noImageMarketplaceCard) {
    const headerHeight = archetype === 'split-vertical' ? 34 : 32
    const textWidth = archetype === 'split-vertical' ? 80 : 78
    const textHeight = archetype === 'split-vertical' ? 30 : 28
    const ctaWidth = archetype === 'split-vertical' ? 28 : 26
    next.image = normalizeRegion({
      x: input.insets.x + 1,
      y: input.insets.y + 2,
      w: 100 - (input.insets.x + 1) * 2,
      h: headerHeight,
    })
    next.text = normalizeRegion({
      x: input.insets.x + 2,
      y: 46,
      w: textWidth,
      h: textHeight,
    })
    next.logo = normalizeRegion({ x: input.insets.x, y: input.insets.y, w: 12, h: 5.2 })
    next.badge = normalizeRegion({ x: 74, y: input.insets.y + 2, w: 18, h: 5.2 })
    next.cta = normalizeRegion({
      x: next.text.x,
      y: 80,
      w: ctaWidth,
      h: 6,
    })
    return next
  }

  if (archetype === 'split-vertical') {
    next.image = normalizeRegion({
      x: input.insets.x + 1,
      y: input.insets.y + 1,
      w: 100 - (input.insets.x + 1) * 2,
      h: wideLike ? 34 : portraitLike ? 34 : 40,
    })
    next.text = normalizeRegion({
      x: input.insets.x + 1,
      y: wideLike ? 46 : portraitLike ? 44 : 52,
      w: 100 - (input.insets.x + 1) * 2,
      h: portraitLike ? 42 : 30,
    })
    next.badge = normalizeRegion({ x: next.text.x, y: next.text.y - 8, w: 16, h: 5 })
    next.cta = normalizeRegion({ x: next.text.x, y: next.text.y + next.text.h - 8, w: 24, h: 7 })
  } else if (archetype === 'split-horizontal') {
    const imageOnLeft = input.intent.imageMode === 'split-left'
    const imageW = wideLike ? 36 : portraitLike ? 32 : 42
    next.image = normalizeRegion({
      x: imageOnLeft ? input.insets.x + 1 : 100 - input.insets.x - imageW - 1,
      y: portraitLike ? 18 : 16,
      w: imageW,
      h: portraitLike ? 58 : 64,
    })
    next.text = normalizeRegion({
      x: imageOnLeft ? next.image.x + next.image.w + 4 : input.insets.x + 1,
      y: portraitLike ? 20 : 22,
      w: wideLike ? 44 : portraitLike ? 42 : 38,
      h: portraitLike ? 48 : 40,
    })
    next.badge = normalizeRegion({ x: next.text.x, y: next.text.y - 8, w: 16, h: 5 })
    next.cta = normalizeRegion({ x: next.text.x, y: next.text.y + next.text.h - 8, w: 22, h: 7 })
  } else if (archetype === 'image-hero') {
    next.image = normalizeRegion({
      x: input.format.family === 'wide' || input.format.family === 'landscape' ? 100 - input.insets.x - 42 : input.insets.x + 1,
      y: input.insets.y + 1,
      w: input.format.family === 'wide' || input.format.family === 'landscape' ? 42 : 100 - (input.insets.x + 1) * 2,
      h: portraitLike ? 82 : wideLike ? 82 : 56,
    })
    next.text = normalizeRegion({
      x: input.intent.textMode === 'overlay' ? clamp(input.safeText.x, input.insets.x + 2, 24) : input.insets.x + 1,
      y: input.intent.textMode === 'overlay' ? clamp(Math.max(input.safeText.y, portraitLike ? 54 : 50), 22, 64) : portraitLike ? 58 : 26,
      w: portraitLike ? 64 : wideLike ? 28 : 34,
      h: portraitLike ? 24 : 28,
    })
    next.cta = normalizeRegion({ x: next.text.x, y: next.text.y + next.text.h + 2, w: 20, h: 7 })
  } else if (archetype === 'text-stack') {
    next.text = normalizeRegion({
      x: input.insets.x + 1,
      y: portraitLike ? 44 : 18,
      w: wideLike ? 46 : 100 - (input.insets.x + 1) * 2,
      h: portraitLike ? 42 : wideLike ? 52 : 36,
    })
    next.image = normalizeRegion({
      x: wideLike ? 100 - input.insets.x - 24 : input.insets.x + 1,
      y: input.insets.y + 2,
      w: wideLike ? 24 : 100 - (input.insets.x + 1) * 2,
      h: wideLike ? 68 : 24,
    })
    next.badge = normalizeRegion({ x: next.text.x, y: next.text.y - 8, w: 18, h: 5 })
    next.cta = normalizeRegion({ x: next.text.x, y: next.text.y + next.text.h - 8, w: 22, h: 7 })
  } else if (archetype === 'overlay-balanced') {
    next.image = normalizeRegion({
      x: input.insets.x,
      y: input.insets.y,
      w: 100 - input.insets.x * 2,
      h: 100 - input.insets.y * 2,
    })
    next.text = normalizeRegion({
      x: clamp(input.safeText.x, input.insets.x + 2, 22),
      y: clamp(Math.max(input.safeText.y, portraitLike ? 52 : 48), 18, 64),
      w: clamp(Math.min(input.safeText.w, wideLike ? 42 : 64), 26, 68),
      h: portraitLike ? 28 : 24,
    })
    next.cta = normalizeRegion({ x: next.text.x, y: next.text.y + next.text.h + 2, w: 20, h: 7 })
  } else if (archetype === 'compact-minimal') {
    next.image = normalizeRegion({
      x: input.insets.x,
      y: input.insets.y,
      w: 100 - input.insets.x * 2,
      h: portraitLike ? 84 : wideLike ? 82 : 58,
    })
    next.text = normalizeRegion({
      x: input.insets.x + 1,
      y: portraitLike ? 72 : wideLike ? 28 : 62,
      w: wideLike ? 24 : 34,
      h: 16,
    })
    next.cta = normalizeRegion({ x: next.text.x, y: next.text.y + 12, w: 18, h: 6 })
  } else if (archetype === 'dense-information') {
    next.text = normalizeRegion({
      x: input.insets.x + 1,
      y: portraitLike ? 42 : 20,
      w: wideLike ? 50 : portraitLike ? 74 : 68,
      h: portraitLike ? 46 : wideLike ? 48 : 38,
    })
    next.image = normalizeRegion({
      x: wideLike ? 100 - input.insets.x - 26 : input.insets.x + 1,
      y: input.insets.y + 2,
      w: wideLike ? 26 : portraitLike ? 76 : 100 - (input.insets.x + 1) * 2,
      h: portraitLike ? 24 : wideLike ? 60 : 26,
    })
    next.badge = normalizeRegion({ x: next.text.x, y: next.text.y - 8, w: 18, h: 5 })
    next.cta = normalizeRegion({ x: next.text.x, y: next.text.y + next.text.h - 8, w: 22, h: 7 })
  }

  if (input.intent.occupancyMode === 'spacious') {
    next.text = normalizeRegion({ ...next.text, w: next.text.w * 0.86, h: next.text.h * 0.86 })
  } else if (input.intent.occupancyMode === 'compact') {
    next.text = normalizeRegion({ ...next.text, w: next.text.w * 1.06, h: next.text.h * 1.08 })
  } else if (input.intent.occupancyMode === 'visual-first') {
    next.image = normalizeRegion({ ...next.image, w: next.image.w * 1.08, h: next.image.h * 1.04 })
    next.text = normalizeRegion({ ...next.text, w: next.text.w * 0.92 })
  } else if (input.intent.occupancyMode === 'text-safe') {
    next.text = normalizeRegion({
      x: clamp(Math.max(next.text.x, input.safeText.x), input.insets.x + 1, 100),
      y: clamp(Math.max(next.text.y, input.safeText.y), input.insets.y + 1, 100),
      w: Math.min(next.text.w, Math.max(input.safeText.w, 24)),
      h: Math.min(next.text.h, Math.max(input.safeText.h, 18)),
    })
  }

  return next
}

function finalizeFamilyZones(input: {
  current: FamilyZoneSet
  format: FormatDefinition
  intent: LayoutIntent
  profile: ContentProfile
  safeText: Region
  insets: { x: number; y: number }
  ruleImage?: Region
  ruleText?: Region
  ruleLogo?: Region
  ruleBadge?: Region
  ruleCta?: Region
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
  mins: {
    image: [number, number]
    text: [number, number]
    logo: [number, number]
    badge: [number, number]
    cta: [number, number]
  }
}) {
  const adjusted = applyStructuralArchetypeZoneBias({
    current: input.current,
    format: input.format,
    intent: input.intent,
    profile: input.profile,
    safeText: input.safeText,
    insets: input.insets,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })
  const preserveProductSupportTemplateZones =
    input.format.key === 'marketplace-card' &&
    input.intent.marketplaceTemplateId === 'product-support-card' &&
    Boolean(input.intent.marketplaceTemplateZones) &&
    !isNoImageMarketplaceCardLayout({
      format: input.format,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    })

  if (preserveProductSupportTemplateZones) {
    const safeMain = rectToRegion(getFormatRuleSet(input.format).safeArea, input.format)
    return {
      image: fitInsideZone(adjusted.image, safeMain, input.mins.image[0], input.mins.image[1]),
      text: fitInsideZone(adjusted.text, safeMain, input.mins.text[0], input.mins.text[1]),
      logo: input.ruleLogo ? fitInsideZone(adjusted.logo, input.ruleLogo, input.mins.logo[0], input.mins.logo[1]) : adjusted.logo,
      badge: input.ruleBadge ? fitInsideZone(adjusted.badge, input.ruleBadge, input.mins.badge[0], input.mins.badge[1]) : adjusted.badge,
      cta: fitInsideZone(adjusted.cta, safeMain, input.mins.cta[0], input.mins.cta[1]),
    }
  }

  return {
    image: input.ruleImage ? fitInsideZone(adjusted.image, input.ruleImage, input.mins.image[0], input.mins.image[1]) : adjusted.image,
    text: input.ruleText ? fitInsideZone(adjusted.text, input.ruleText, input.mins.text[0], input.mins.text[1]) : adjusted.text,
    logo: input.ruleLogo ? fitInsideZone(adjusted.logo, input.ruleLogo, input.mins.logo[0], input.mins.logo[1]) : adjusted.logo,
    badge: input.ruleBadge ? fitInsideZone(adjusted.badge, input.ruleBadge, input.mins.badge[0], input.mins.badge[1]) : adjusted.badge,
    cta: input.ruleCta ? fitInsideZone(adjusted.cta, input.ruleCta, input.mins.cta[0], input.mins.cta[1]) : adjusted.cta,
  }
}

function estimateLines(text: string | undefined, charsPerLine: number | undefined, maxLines: number | undefined) {
  const contentLength = (text || '').trim().length
  const capacity = Math.max(charsPerLine || 1, 1)
  return clamp(Math.ceil(contentLength / capacity) || 1, 1, Math.max(maxLines || 1, 1))
}

const BOX_PRIORITY: Record<LayoutBox['kind'], number> = {
  headline: 100,
  cta: 92,
  image: 88,
  subtitle: 72,
  body: 68,
  badge: 60,
  price: 58,
  logo: 40,
}

function boxKey(a: LayoutBox['kind'], b: LayoutBox['kind']) {
  return [a, b].sort().join(':')
}

const FORBIDDEN_OVERLAPS = new Set([
  boxKey('headline', 'image'),
  boxKey('headline', 'cta'),
  boxKey('headline', 'logo'),
  boxKey('subtitle', 'image'),
  boxKey('body', 'image'),
  boxKey('body', 'cta'),
  boxKey('cta', 'image'),
  boxKey('cta', 'logo'),
  boxKey('badge', 'headline'),
  boxKey('badge', 'logo'),
  boxKey('price', 'cta'),
  boxKey('price', 'image'),
  boxKey('logo', 'image'),
])

function getModelOverlapRule(a: LayoutBox['kind'], b: LayoutBox['kind'], compositionModel?: CompositionModel | null) {
  if (!compositionModel?.allowedOverlaps?.length) return null
  const key = boxKey(a, b)
  return compositionModel.allowedOverlaps.find((pair) => boxKey(pair.a, pair.b) === key) || null
}

function allowsModelOverlap(a: LayoutBox['kind'], b: LayoutBox['kind'], compositionModel?: CompositionModel | null) {
  return Boolean(getModelOverlapRule(a, b, compositionModel))
}

function getOverlapGeometryAllowance(a: LayoutBox, b: LayoutBox, compositionModel?: CompositionModel | null) {
  const rule = getModelOverlapRule(a.kind, b.kind, compositionModel)
  if (!rule) return false

  const imageBox = a.kind === 'image' ? a : b.kind === 'image' ? b : null
  if (!imageBox) return true

  const overlayBox = imageBox.id === a.id ? b : a
  const overlap = rectsOverlap(a.rect, b.rect)
  const imageArea = Math.max(imageBox.rect.w * imageBox.rect.h, 0.0001)

  if (rule.maxOverlapRatio && overlap.area / imageArea > rule.maxOverlapRatio) {
    return false
  }

  if (rule.topCornerOnly) {
    const withinTopBand = overlayBox.rect.y <= imageBox.rect.y + imageBox.rect.h * 0.28
    const withinLeftCorner = overlayBox.rect.x + overlayBox.rect.w <= imageBox.rect.x + imageBox.rect.w * 0.34
    const withinRightCorner = overlayBox.rect.x >= imageBox.rect.x + imageBox.rect.w * 0.66
    if (!withinTopBand || (!withinLeftCorner && !withinRightCorner)) {
      return false
    }
  }

  return true
}

function getTextBlockHeight(text: string | undefined, fontSize: number | undefined, charsPerLine: number | undefined, maxLines: number | undefined, lineHeight = 1.12) {
  const lines = estimateLines(text, charsPerLine, maxLines)
  return Math.max(((fontSize || 16) * lines * lineHeight), fontSize || 16)
}

function percentRectToPx(rect: Rect, format: FormatDefinition): Rect {
  return {
    x: (rect.x / 100) * format.width,
    y: (rect.y / 100) * format.height,
    w: (rect.w / 100) * format.width,
    h: (rect.h / 100) * format.height,
  }
}

function pxRectToPercent(rect: Rect, format: FormatDefinition): Rect {
  return {
    x: (rect.x / format.width) * 100,
    y: (rect.y / format.height) * 100,
    w: (rect.w / format.width) * 100,
    h: (rect.h / format.height) * 100,
  }
}

function rectsOverlap(a: Rect, b: Rect) {
  const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return {
    overlapX,
    overlapY,
    area: overlapX * overlapY,
  }
}

function gapBetweenRects(a: Rect, b: Rect) {
  const horizontal = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const vertical = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  return Math.max(horizontal, vertical)
}

function getPairGap(a: LayoutBox['kind'], b: LayoutBox['kind'], format: FormatDefinition) {
  const small = format.key === 'display-mpu' || format.key === 'display-large-rect' || format.key === 'display-leaderboard' || format.key === 'display-skyscraper'
  const marketplaceCompact = format.category === 'marketplace'
  const base = small ? 10 : marketplaceCompact ? 10 : format.key === 'social-square' ? 18 : 16
  const key = boxKey(a, b)
  if (key === boxKey('headline', 'subtitle')) return small ? 8 : 14
  if (key === boxKey('headline', 'body')) return small ? 10 : 16
  if (key === boxKey('body', 'cta') || key === boxKey('subtitle', 'cta')) return small ? 10 : 16
  if (key === boxKey('logo', 'headline') || key === boxKey('logo', 'subtitle') || key === boxKey('logo', 'cta')) return small ? 10 : 14
  if (key === boxKey('badge', 'headline')) return small ? 8 : 12
  if (key === boxKey('headline', 'image') || key === boxKey('subtitle', 'image') || key === boxKey('body', 'image') || key === boxKey('cta', 'image')) {
    return small ? 12 : marketplaceCompact ? 12 : 24
  }
  return base
}

function isForbiddenOverlap(a: LayoutBox, b: LayoutBox, compositionModel?: CompositionModel | null) {
  return FORBIDDEN_OVERLAPS.has(boxKey(a.kind, b.kind))
}

function getFit(focalSuggestion?: AssetHint['focalSuggestion']) {
  if (focalSuggestion === 'top') return 'xMidYMin slice'
  if (focalSuggestion === 'left') return 'xMinYMid slice'
  if (focalSuggestion === 'right') return 'xMaxYMid slice'
  return 'xMidYMid slice'
}

function getSafeInsets(format: FormatDefinition, safeZone: BrandKit['safeZone']) {
  const bias = safeZone === 'airy' ? 1.8 : safeZone === 'compact' ? -0.8 : 0
  const formatBias = getFormatSafeInsetBias(format)
  const insetX =
    format.family === 'wide' ? 4.4 :
    format.family === 'landscape' ? 5.6 :
    format.family === 'square' ? 6.8 :
    format.family === 'portrait' ? 7.2 :
    format.family === 'printPortrait' ? 7.8 :
    8.4
  const insetY =
    format.family === 'wide' ? 6.4 :
    format.family === 'landscape' ? 6 :
    format.family === 'square' ? 6 :
    format.family === 'portrait' ? 5.8 :
    format.family === 'printPortrait' ? 5 :
    4.6

  return {
    x: clamp(insetX + bias + formatBias.x, 3.5, 11.5),
    y: clamp(insetY + bias + formatBias.y, 3.5, 11),
  }
}

function getTextMetrics(scene: Scene, typography: TypographyPlan, format: FormatDefinition) {
  const headline = fitSceneTextToRule({
    role: 'headline',
    text: scene.title.text || '',
    x: scene.title.x || 0,
    y: scene.title.y || typography.titleSize,
    width: typography.titleWidth,
    format,
    rule: getFormatRuleSet(format).typography.headline,
    preferredFontSize: typography.titleSize,
    preferredCharsPerLine: typography.titleCharsPerLine,
    preferredMaxLines: typography.titleMaxLines,
    lineHeight: typography.lineHeightTitle,
    anchorMode: 'baseline-left',
  })
  const subtitle = fitSceneTextToRule({
    role: 'subtitle',
    text: scene.subtitle.text || '',
    x: scene.subtitle.x || 0,
    y: scene.subtitle.y || typography.subtitleSize,
    width: typography.subtitleWidth,
    format,
    rule: getFormatRuleSet(format).typography.subtitle,
    preferredFontSize: typography.subtitleSize,
    preferredCharsPerLine: typography.subtitleCharsPerLine,
    preferredMaxLines: typography.subtitleMaxLines,
    lineHeight: typography.lineHeightSubtitle,
    anchorMode: 'baseline-left',
    measurementHint: scene.subtitle.measurementHint,
  })
  return {
    titleLines: headline.lineCount,
    subtitleLines: subtitle.lineCount,
    titleHeight: headline.h,
    subtitleHeight: subtitle.h,
  }
}

function getCtaSize(scene: Scene, format: FormatDefinition, typography: TypographyPlan, profile: ContentProfile) {
  const length = (scene.cta.text || '').trim().length
  const marketplaceRoleContract = getMarketplaceRoleContract(format)
  const marketplaceCompact = marketplaceRoleContract.enabled || format.category === 'marketplace'
  const widthBase =
    format.family === 'wide' ? 10 + length * 0.48 :
    format.family === 'landscape' ? 11 + length * 0.56 :
    format.family === 'portrait' ? 14 + length * 0.52 :
    format.family === 'printPortrait' ? 15 + length * 0.52 :
    format.family === 'square' ? 12 + length * 0.54 :
    20 + length * 0.44
  const heightBase =
    format.family === 'wide' ? 12 :
      format.family === 'landscape' ? 8 :
      format.family === 'portrait' ? 5.8 :
      format.family === 'printPortrait' ? 5.8 :
      format.family === 'square' ? 6.4 :
      6.4

  return {
    width: clamp(
      (widthBase - (marketplaceCompact ? (format.family === 'landscape' ? 2.6 : 2) : 0) + (profile.needsStrongCTA ? (marketplaceCompact ? 1 : 2) : 0)) *
        (marketplaceRoleContract.enabled ? marketplaceRoleContract.compactCtaScale : 1),
      marketplaceCompact ? 14 : format.family === 'wide' ? 12 : 16,
      marketplaceCompact ? (format.family === 'portrait' ? 30 : 28) : format.family === 'skyscraper' ? 54 : 38
    ),
    height: clamp(
      (heightBase - (marketplaceCompact ? 0.5 : 0) + typography.ctaSize * 0.02) *
        (marketplaceRoleContract.enabled ? Math.max(0.9, marketplaceRoleContract.compactCtaScale) : 1),
      marketplaceCompact ? 4.8 : format.family === 'wide' ? 10 : 5.2,
      marketplaceCompact ? 7 : format.family === 'wide' ? 15 : 8
    ),
  }
}

function getMarketplaceRoleModeLadder(format: FormatDefinition): MarketplaceRoleMode[] {
  const contract = getMarketplaceRoleContract(format)
  if (!contract.enabled) {
    return [{
      hideSubtitle: false,
      hideBadge: false,
      compactCta: false,
      compactSubtitle: false,
      minimalLogo: false,
      forceTextSafeFallback: false,
    }]
  }

  return [
    {
      hideSubtitle: false,
      hideBadge: false,
      compactCta: true,
      compactSubtitle: false,
      minimalLogo: true,
      forceTextSafeFallback: false,
    },
    {
      hideSubtitle: true,
      hideBadge: false,
      compactCta: true,
      compactSubtitle: false,
      minimalLogo: true,
      forceTextSafeFallback: false,
    },
    {
      hideSubtitle: true,
      hideBadge: true,
      compactCta: true,
      compactSubtitle: false,
      minimalLogo: true,
      forceTextSafeFallback: false,
    },
    {
      hideSubtitle: true,
      hideBadge: true,
      compactCta: true,
      compactSubtitle: false,
      minimalLogo: true,
      forceTextSafeFallback: true,
    },
  ]
}

function applyMarketplaceRoleMode(
  scene: Scene,
  format: FormatDefinition,
  mode: MarketplaceRoleMode,
  options?: {
    intent?: LayoutIntent
  }
) {
  if (!getMarketplaceRoleContract(format).enabled) return clone(scene)
  const next = clone(scene)
  const imageBackedProofDenseTextFirst =
    format.key === 'marketplace-card' &&
    options?.intent?.marketplaceTemplateId === 'text-first-promo' &&
    options.intent.marketplaceTemplateVariant === 'proof-band' &&
    options.intent.marketplaceTemplateSelection?.inputProfile.imageRegime !== 'no-image'

  if (mode.hideSubtitle) {
    if (imageBackedProofDenseTextFirst && mode.compactSubtitle && (next.subtitle.text || '').trim()) {
      const sourceText = (next.subtitle.text || '').trim()
      const compactText = compactProofSubtitleText(sourceText)
      next.subtitle.text = compactText
      next.subtitle.measurementHint = 'proof-dense'
      next.subtitle.sourceTextLength = sourceText.length
      next.subtitle.normalizedTextLength = compactText.length
      next.subtitle.realizationFallback = compactText && compactText !== sourceText ? 'proof-compact' : undefined
      next.subtitle.opacity = Math.max(next.subtitle.opacity ?? 1, 0.92)
      next.subtitle.fontSize = Math.min(next.subtitle.fontSize || 16, 14)
      next.subtitle.charsPerLine = Math.min(next.subtitle.charsPerLine || 30, 24)
      next.subtitle.maxLines = 1
      next.subtitle.h = next.subtitle.h || 0
    } else {
      next.subtitle.text = ''
      next.subtitle.w = 0
      next.subtitle.h = 0
      next.subtitle.opacity = 0
      next.subtitle.sourceTextLength = undefined
      next.subtitle.normalizedTextLength = 0
      next.subtitle.realizationFallback = undefined
    }
  }

  if (mode.hideBadge) {
    next.badge.text = ''
    next.badge.w = 0
    next.badge.h = 0
    next.badge.bgOpacity = 0
  }

  if (mode.compactCta) {
    next.cta.w = Math.max((next.cta.w || 18) * 0.84, 12)
    next.cta.h = Math.max((next.cta.h || 6) * 0.9, 4.2)
  }

  if (mode.minimalLogo) {
    next.logo.w = Math.max((next.logo.w || 10) * 0.72, 6)
    next.logo.h = Math.max((next.logo.h || 5) * 0.76, 3.2)
    next.logo.bgOpacity = Math.min(next.logo.bgOpacity || 0.14, 0.12)
  }

  return next
}

function isConstrainedMarketplaceFormat(format: FormatDefinition) {
  return getMarketplaceRoleContract(format).enabled
}

function getMarketplaceTextRegionGuarantee(format: FormatDefinition) {
  if (format.family === 'landscape' || format.family === 'wide') {
    return { w: 48, h: 66, usableW: 40, usableH: 22 }
  }
  if (format.family === 'portrait' || format.family === 'printPortrait' || format.family === 'skyscraper') {
    return { w: 82, h: 42, usableW: 70, usableH: 26 }
  }
  return { w: 82, h: 32, usableW: 68, usableH: 20 }
}

function getMarketplaceTextRegionGuaranteeForIntent(format: FormatDefinition, intent?: LayoutIntent) {
  if (format.key === 'marketplace-card' && intent?.marketplaceTemplateId === 'text-first-promo') {
    if (intent.marketplaceTemplateVariant === 'proof-band') {
      const noImageMode = intent.marketplaceTemplateSelection?.inputProfile.imageRegime === 'no-image'
      return noImageMode
        ? { w: 64, h: 34, usableW: 56, usableH: 26 }
        : { w: 56, h: 28, usableW: 50, usableH: 22 }
    }
    return { w: 52, h: 28, usableW: 44, usableH: 20 }
  }

  if (format.key === 'marketplace-card' && intent?.marketplaceTemplateId === 'product-support-card') {
    if (intent.marketplaceTemplateVariant === 'comparison-lockup') {
      return { w: 50, h: 28, usableW: 44, usableH: 20 }
    }
    if (intent.marketplaceTemplateVariant === 'image-dominant-square') {
      return { w: 40, h: 22, usableW: 34, usableH: 16 }
    }
    if (intent.marketplaceTemplateVariant === 'commerce-lockup') {
      return { w: 44, h: 24, usableW: 36, usableH: 18 }
    }
    return { w: 48, h: 26, usableW: 38, usableH: 18 }
  }

  return getMarketplaceTextRegionGuarantee(format)
}

function buildMarketplaceZoneProfiles(input: {
  zones: FamilyZoneSet
  format: FormatDefinition
  contract: ArchetypeLayoutContract
  intent?: LayoutIntent
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}): MarketplaceZoneProfile[] {
  if (!isConstrainedMarketplaceFormat(input.format)) {
    return [
      {
        id: 'base-marketplace',
        zones: clone(input.zones),
        rebalanced: false,
        safeFallback: false,
      },
    ]
  }

  const profiles: MarketplaceZoneProfile[] = []
  const insets = getSafeInsets(input.format, 'balanced')
  const guarantee = getMarketplaceTextRegionGuaranteeForIntent(input.format, input.intent)
  const gapX = pxToPercentX(input.contract.textToImageGapPx, input.format)
  const gapY = pxToPercentY(input.contract.textToImageGapPx, input.format)
  const noImageHeaderPanel = isNoImageMarketplaceCardHeaderPanelLayout({
    format: input.format,
    intent: input.intent,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })

  const clampZoneSet = (zones: FamilyZoneSet): FamilyZoneSet => ({
    image: normalizeRegion(zones.image),
    text: normalizeRegion(zones.text),
    logo: normalizeRegion(zones.logo),
    badge: normalizeRegion(zones.badge),
    cta: normalizeRegion(zones.cta),
  })

  const base = clampZoneSet(clone(input.zones))
  const productSupportImageBacked =
    input.format.key === 'marketplace-card' &&
    input.intent?.marketplaceTemplateId === 'product-support-card' &&
    !noImageHeaderPanel
  const textFirstPromoTemplate =
    input.format.key === 'marketplace-card' &&
    input.intent?.marketplaceTemplateId === 'text-first-promo'
  const proofBandTextFirst = textFirstPromoTemplate && input.intent?.marketplaceTemplateVariant === 'proof-band'
  const comparisonLockupProductSupport =
    productSupportImageBacked &&
    (input.intent?.marketplaceTemplateVariant === 'comparison-lockup' ||
      input.intent?.marketplaceTemplateSelection?.inputProfile.sellingAngle === 'comparison-led')
  const imageBackedTextFirst =
    textFirstPromoTemplate && input.intent?.marketplaceTemplateSelection?.inputProfile.imageRegime === 'image-backed'
  if (noImageHeaderPanel) {
    base.image = normalizeRegion({
      x: insets.x + 1,
      y: insets.y + 2,
      w: 100 - (insets.x + 1) * 2,
      h: 34,
    })
    base.text = normalizeRegion({
      x: insets.x + 2,
      y: 46,
      w: 78,
      h: 32,
    })
    base.cta = normalizeRegion({
      x: insets.x + 2,
      y: 80,
      w: 28,
      h: 6,
    })
  }
  base.text.w = clamp(base.text.w, guarantee.w, 100 - base.text.x)
  base.text.h = clamp(base.text.h, guarantee.h, 100 - base.text.y)
  base.cta.x = clamp(Math.max(base.cta.x, base.text.x), base.text.x, base.text.x + Math.max(base.text.w - base.cta.w, 0))
  base.cta.w = clamp(base.cta.w, noImageHeaderPanel ? 18 : 14, Math.min(base.cta.w || 22, base.text.w))
  profiles.push({
    id: 'base-marketplace',
    zones: clampZoneSet(base),
    rebalanced: false,
    safeFallback: false,
  })

  if (textFirstPromoTemplate) {
    const textFirst = clampZoneSet(clone(base))
    if (proofBandTextFirst) {
      if (imageBackedTextFirst) {
        textFirst.image = normalizeRegion({
          x: 58,
          y: 10,
          w: 30,
          h: 28,
        })
        textFirst.text = normalizeRegion({
          x: 8,
          y: 14,
          w: 52,
          h: 36,
        })
        textFirst.cta = normalizeRegion({
          x: 8,
          y: 62,
          w: 20,
          h: 6.4,
        })
      } else {
        textFirst.image = normalizeRegion({
          x: 8,
          y: 10,
          w: 82,
          h: 12,
        })
        textFirst.text = normalizeRegion({
          x: 8,
          y: 24,
          w: 72,
          h: 42,
        })
        textFirst.cta = normalizeRegion({
          x: 8,
          y: 68,
          w: 24,
          h: 6.2,
        })
      }
    } else if (imageBackedTextFirst) {
      textFirst.image = normalizeRegion({
        x: 60,
        y: 12,
        w: 26,
        h: 24,
      })
      textFirst.text = normalizeRegion({
        x: 8,
        y: 20,
        w: 52,
        h: 36,
      })
      textFirst.cta = normalizeRegion({
        x: 8,
        y: 68,
        w: 20,
        h: 6,
      })
    } else {
      textFirst.image = normalizeRegion({
        x: 64,
        y: 12,
        w: 24,
        h: 18,
      })
      textFirst.text = normalizeRegion({
        x: 8,
        y: 18,
        w: 68,
        h: 38,
      })
      textFirst.cta = normalizeRegion({
        x: 8,
        y: 70,
        w: 22,
        h: 6,
      })
    }
    textFirst.logo = normalizeRegion({
      x: insets.x,
      y: insets.y,
      w: clamp(Math.min(textFirst.logo.w, 8), 6, 10),
      h: clamp(Math.min(textFirst.logo.h, 4), 3, 4),
    })
    textFirst.badge = normalizeRegion({
      x: proofBandTextFirst && !imageBackedTextFirst ? 8 : 100 - insets.x - clamp(Math.min(textFirst.badge.w, 14), 10, 16),
      y: proofBandTextFirst && !imageBackedTextFirst ? 16 : insets.y,
      w: clamp(Math.min(textFirst.badge.w, 14), 10, 16),
      h: clamp(Math.min(textFirst.badge.h, 4.6), 3.4, 4.8),
    })
    profiles.push({
      id: 'text-first-marketplace',
      zones: clampZoneSet(textFirst),
      rebalanced: true,
      safeFallback: false,
    })

    const safeFallback = clampZoneSet(clone(textFirst))
    safeFallback.image = normalizeRegion({
      ...safeFallback.image,
      h: clamp(
        safeFallback.image.h - (proofBandTextFirst ? 0 : 2),
        imageBackedTextFirst ? (proofBandTextFirst ? 22 : 20) : (proofBandTextFirst ? 12 : 14),
        imageBackedTextFirst ? (proofBandTextFirst ? 28 : 24) : (proofBandTextFirst ? 16 : 18)
      ),
    })
    safeFallback.text = normalizeRegion({
      ...safeFallback.text,
      y: clamp(
        safeFallback.text.y + (imageBackedTextFirst ? (proofBandTextFirst ? 0 : 2) : 1),
        imageBackedTextFirst ? (proofBandTextFirst ? 16 : 20) : (proofBandTextFirst ? 24 : 18),
        34
      ),
      h: clamp(
        safeFallback.text.h - (proofBandTextFirst ? 0 : 2),
        guarantee.h,
        imageBackedTextFirst ? (proofBandTextFirst ? 42 : 38) : (proofBandTextFirst ? 42 : 40)
      ),
    })
    safeFallback.cta = normalizeRegion({
      x: safeFallback.text.x,
      y: clamp(
        safeFallback.text.y + safeFallback.text.h + 2,
        imageBackedTextFirst ? (proofBandTextFirst ? 66 : 72) : (proofBandTextFirst ? 68 : 72),
        80
      ),
      w: clamp(Math.min(safeFallback.cta.w, proofBandTextFirst ? 24 : 22), 18, proofBandTextFirst ? 24 : 22),
      h: clamp(safeFallback.cta.h, 4.8, proofBandTextFirst ? 6.2 : 6),
    })
    profiles.push({
      id: 'safe-marketplace-fallback',
      zones: clampZoneSet(safeFallback),
      rebalanced: true,
      safeFallback: true,
    })
    return profiles
  }

  if (productSupportImageBacked) {
    const productDominant = clampZoneSet(clone(base))
    if (comparisonLockupProductSupport) {
      base.image = normalizeRegion({
        ...base.image,
        x: clamp(base.image.x + 2, 48, 60),
        w: clamp(base.image.w, 32, 36),
        h: clamp(base.image.h, 28, 34),
      })
      base.text = normalizeRegion({
        ...base.text,
        y: clamp(base.text.y - 2, 46, 54),
        w: clamp(base.text.w + 6, 44, 48),
        h: clamp(base.text.h + 4, 24, 30),
      })
      base.cta = normalizeRegion({
        ...base.cta,
        x: base.text.x,
        y: clamp(base.text.y + base.text.h + 2, 74, 82),
        w: clamp(base.cta.w, 18, 20),
        h: clamp(base.cta.h, 4.8, 6.2),
      })
      profiles[profiles.length - 1] = {
        id: 'base-marketplace',
        zones: clampZoneSet(base),
        rebalanced: false,
        safeFallback: false,
      }
    }
    productDominant.image = normalizeRegion({
      x: comparisonLockupProductSupport
        ? clamp(productDominant.image.x + 2, 50, 62)
        : productDominant.image.x,
      y: Math.max(productDominant.image.y - 1, insets.y + 1),
      w: comparisonLockupProductSupport
        ? clamp(productDominant.image.w, 32, 36)
        : clamp(productDominant.image.w + 4, 38, 48),
      h: comparisonLockupProductSupport
        ? clamp(productDominant.image.h + 2, 30, 36)
        : clamp(productDominant.image.h + 4, 34, 48),
    })
    productDominant.text = normalizeRegion({
      x: productDominant.text.x,
      y: clamp(productDominant.text.y + (comparisonLockupProductSupport ? 0 : 2), 46, 62),
      w: comparisonLockupProductSupport
        ? clamp(productDominant.text.w + 4, guarantee.w, 48)
        : clamp(productDominant.text.w - 6, guarantee.w - 6, 42),
      h: comparisonLockupProductSupport
        ? clamp(productDominant.text.h + 2, guarantee.h, 28)
        : clamp(productDominant.text.h - 2, guarantee.h, 22),
    })
    productDominant.cta = normalizeRegion({
      x: productDominant.text.x,
      y: clamp(productDominant.text.y + productDominant.text.h + 2, 74, 84),
      w: clamp(Math.min(productDominant.cta.w, 22), 18, 22),
      h: clamp(productDominant.cta.h, 4.6, 6),
    })
    profiles.push({
      id: 'product-dominant-marketplace',
      zones: clampZoneSet(productDominant),
      rebalanced: true,
      safeFallback: false,
    })
    return profiles
  }

  const textFirst = clampZoneSet(clone(base))
  if (noImageHeaderPanel) {
    textFirst.image = {
      x: insets.x + 1,
      y: insets.y + 2,
      w: 100 - (insets.x + 1) * 2,
      h: 32,
    }
    textFirst.text = {
      x: insets.x + 2,
      y: 44,
      w: 80,
      h: 34,
    }
  } else if (input.format.family === 'landscape' || input.format.family === 'wide') {
    const textX = insets.x + 1
    const textW = clamp(Math.max(guarantee.w + 4, textFirst.text.w + 8), guarantee.w, 58)
    textFirst.text = {
      x: textX,
      y: Math.max(textFirst.text.y, insets.y + 6),
      w: textW,
      h: clamp(100 - (insets.y + 1) * 2 - 8, guarantee.h, 84),
    }
    const imageX = textFirst.text.x + textFirst.text.w + gapX
    textFirst.image = {
      x: imageX,
      y: insets.y + 4,
      w: clamp(100 - insets.x - imageX - 1, 18, 30),
      h: clamp(textFirst.image.h - 10, 32, 68),
    }
  } else {
    const imageHeight = input.format.family === 'portrait' ? 24 : 28
    textFirst.image = {
      x: insets.x + 2,
      y: insets.y + 2,
      w: 100 - (insets.x + 2) * 2,
      h: imageHeight,
    }
    textFirst.text = {
      x: insets.x + 2,
      y: textFirst.image.y + textFirst.image.h + gapY,
      w: 100 - (insets.x + 2) * 2,
      h: clamp(100 - (insets.y + 2) - (textFirst.image.y + textFirst.image.h + gapY) - 8, guarantee.h, input.format.family === 'portrait' ? 54 : 42),
    }
  }
  textFirst.logo = {
    x: insets.x,
    y: insets.y,
    w: clamp(Math.min(textFirst.logo.w, 8), 6, 10),
    h: clamp(Math.min(textFirst.logo.h, 3.8), 3, 4),
  }
  textFirst.badge = {
    x: 100 - insets.x - clamp(Math.min(textFirst.badge.w, 12), 10, 14),
    y: insets.y,
    w: clamp(Math.min(textFirst.badge.w, 12), 10, 14),
    h: clamp(Math.min(textFirst.badge.h, 4.2), 3.4, 4.4),
  }
  textFirst.cta = {
    x: textFirst.text.x,
    y: clamp(
      textFirst.text.y + textFirst.text.h - (noImageHeaderPanel ? 6.2 : 8),
      textFirst.text.y,
      textFirst.text.y + textFirst.text.h - (noImageHeaderPanel ? 5.2 : 4.5)
    ),
    w: clamp(Math.min(textFirst.cta.w, textFirst.text.w), noImageHeaderPanel ? 18 : 14, noImageHeaderPanel ? 28 : 24),
    h: clamp(textFirst.cta.h, noImageHeaderPanel ? 4.8 : 4.4, noImageHeaderPanel ? 6 : 6.2),
  }
  profiles.push({
    id: 'text-first-marketplace',
    zones: clampZoneSet(textFirst),
    rebalanced: true,
    safeFallback: false,
  })

  const safeFallback = clampZoneSet(clone(textFirst))
  if (noImageHeaderPanel) {
    safeFallback.image.h = clamp(safeFallback.image.h - 4, 26, 32)
    safeFallback.text.y = safeFallback.image.y + safeFallback.image.h + gapY
    safeFallback.text.h = clamp(100 - (insets.y + 2) - safeFallback.text.y - 10, guarantee.h + 6, 36)
  } else if (input.format.family === 'landscape' || input.format.family === 'wide') {
    safeFallback.text.w = clamp(safeFallback.text.w + 6, 52, 64)
    safeFallback.image.x = safeFallback.text.x + safeFallback.text.w + gapX
    safeFallback.image.w = clamp(100 - insets.x - safeFallback.image.x - 1, 16, 24)
    safeFallback.image.h = clamp(safeFallback.image.h - 8, 28, 58)
  } else {
    safeFallback.image.h = clamp(safeFallback.image.h - 6, 18, 24)
    safeFallback.text.y = safeFallback.image.y + safeFallback.image.h + gapY
    safeFallback.text.h = clamp(100 - (insets.y + 2) - safeFallback.text.y - 6, guarantee.h + 4, input.format.family === 'portrait' ? 58 : 48)
  }
  safeFallback.cta = {
    x: safeFallback.text.x,
    y: clamp(
      safeFallback.text.y + safeFallback.text.h - (noImageHeaderPanel ? 6 : 7),
      safeFallback.text.y,
      safeFallback.text.y + safeFallback.text.h - 4.4
    ),
    w: clamp(Math.min(safeFallback.cta.w, noImageHeaderPanel ? 24 : 22), noImageHeaderPanel ? 18 : 14, noImageHeaderPanel ? 24 : 22),
    h: clamp(safeFallback.cta.h, noImageHeaderPanel ? 4.8 : 4.2, noImageHeaderPanel ? 6 : 5.8),
  }
  profiles.push({
    id: 'safe-marketplace-fallback',
    zones: clampZoneSet(safeFallback),
    rebalanced: true,
    safeFallback: true,
  })

  return profiles
}

function getResolvedArchetype(intent: LayoutIntent): StructuralArchetype {
  return intent.structuralArchetype || 'text-stack'
}

function isNoImageMarketplaceCardLayout(input: {
  format: FormatDefinition
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  return (
    input.format.key === 'marketplace-card' &&
    !input.imageAnalysis &&
    !input.assetHint?.imageProfile &&
    !input.assetHint?.enhancedImage
  )
}

function isNoImageMarketplaceCardHeaderPanelLayout(input: {
  format: FormatDefinition
  intent?: LayoutIntent
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  return (
    isNoImageMarketplaceCardLayout({
      format: input.format,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    }) &&
    (input.intent?.family === 'square-hero-overlay' || input.intent?.family === 'square-image-top-text-bottom')
  )
}

function isImageBackedProductSupportLayout(input: {
  format: FormatDefinition
  intent?: LayoutIntent
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  return (
    input.format.key === 'marketplace-card' &&
    input.intent?.marketplaceTemplateId === 'product-support-card' &&
    !isNoImageMarketplaceCardLayout({
      format: input.format,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    })
  )
}

function getArchetypeLayoutContract(
  intent: LayoutIntent,
  format: FormatDefinition,
  profile: ContentProfile,
  ruleSet: FormatRuleSet,
  options?: {
    assetHint?: AssetHint
    imageAnalysis?: EnhancedImageAnalysis
  }
): ArchetypeLayoutContract {
  const archetype = getResolvedArchetype(intent)
  const dense = profile.density === 'dense'
  const wideLike = format.family === 'wide' || format.family === 'landscape'
  const compactBase = format.category === 'marketplace' || format.category === 'display'
  const densityPreset = getFormatDensityPreset({ format, profile })
  const safeFallbackArchetype = getFormatSafeFallbackArchetype(format)

  const base: ArchetypeLayoutContract = {
    archetype,
    textCoverageRange: [Math.max(ruleSet.composition.minTextCoverage, 0.16), Math.max(ruleSet.composition.minTextCoverage + 0.08, 0.32)],
    imageCoverageRange: [Math.max(ruleSet.composition.minImageCoverage - 0.08, 0.22), Math.min(ruleSet.composition.maxImageCoverage, 0.62)],
    headlineMaxLines: Math.min(ruleSet.typography.headline.maxLines, dense ? 4 : 3),
    subtitleMaxLines: Math.min(ruleSet.typography.subtitle.maxLines, dense ? 5 : 4),
    clusterGapPx: compactBase ? 10 : 14,
    textToImageGapPx: wideLike ? 22 : 18,
    topReservePx: format.category === 'presentation' ? 72 : 56,
    ctaReservePx: wideLike ? 64 : 76,
    occupancyMode: 'balanced',
    fallbackMode: 'none',
  }

  let contract: ArchetypeLayoutContract
  switch (archetype) {
    case 'compact-minimal':
      contract = {
        ...base,
        textCoverageRange: [0.12, 0.22],
        imageCoverageRange: [0.34, Math.min(ruleSet.composition.maxImageCoverage, 0.56)],
        headlineMaxLines: 2,
        subtitleMaxLines: 2,
        clusterGapPx: 10,
        textToImageGapPx: 18,
        ctaReservePx: 62,
        occupancyMode: 'spacious',
        fallbackMode: wideLike ? 'safe-side' : 'safe-shelf',
      }
      break
    case 'dense-information':
      contract = {
        ...base,
        textCoverageRange: [0.24, 0.42],
        imageCoverageRange: [0.18, Math.min(ruleSet.composition.maxImageCoverage, 0.44)],
        headlineMaxLines: Math.min(ruleSet.typography.headline.maxLines, 4),
        subtitleMaxLines: Math.min(ruleSet.typography.subtitle.maxLines, 5),
        clusterGapPx: 12,
        textToImageGapPx: 20,
        occupancyMode: 'text-safe',
        fallbackMode: wideLike ? 'safe-side' : 'safe-shelf',
      }
      break
    case 'image-hero':
      contract = {
        ...base,
        textCoverageRange: [0.16, 0.28],
        imageCoverageRange: [0.32, Math.min(ruleSet.composition.maxImageCoverage, 0.58)],
        headlineMaxLines: 3,
        subtitleMaxLines: 3,
        clusterGapPx: 12,
        occupancyMode: 'visual-first',
        fallbackMode: wideLike ? 'safe-side' : 'safe-shelf',
      }
      break
    case 'overlay-balanced':
      contract = {
        ...base,
        textCoverageRange: [0.18, 0.3],
        imageCoverageRange: [0.28, Math.min(ruleSet.composition.maxImageCoverage, 0.54)],
        headlineMaxLines: 3,
        subtitleMaxLines: 3,
        clusterGapPx: 12,
        occupancyMode: 'text-safe',
        fallbackMode: wideLike ? 'safe-side' : 'safe-shelf',
      }
      break
    case 'split-horizontal':
      contract = {
        ...base,
        textCoverageRange: [0.18, dense ? 0.34 : 0.3],
        imageCoverageRange: [0.24, 0.5],
        headlineMaxLines: dense ? 4 : 3,
        subtitleMaxLines: dense ? 5 : 4,
        clusterGapPx: 13,
        textToImageGapPx: 24,
        occupancyMode: 'balanced',
        fallbackMode: 'safe-side',
      }
      break
    case 'split-vertical':
      contract = {
        ...base,
        textCoverageRange: [0.18, dense ? 0.36 : 0.3],
        imageCoverageRange: [0.24, 0.54],
        headlineMaxLines: dense ? 4 : 3,
        subtitleMaxLines: dense ? 5 : 4,
        clusterGapPx: 13,
        textToImageGapPx: 20,
        occupancyMode: 'balanced',
        fallbackMode: 'safe-shelf',
      }
      break
    case 'text-stack':
    default:
      contract = {
        ...base,
        textCoverageRange: [0.2, dense ? 0.38 : 0.32],
        imageCoverageRange: [0.2, 0.48],
        headlineMaxLines: dense ? 4 : 3,
        subtitleMaxLines: dense ? 5 : 4,
        clusterGapPx: 13,
        textToImageGapPx: 20,
        occupancyMode: 'balanced',
        fallbackMode: wideLike ? 'safe-side' : 'safe-shelf',
      }
      break
  }

  if (intent.balanceRegime === 'dense-copy' || densityPreset === 'dense-copy') {
    contract = {
      ...contract,
      textCoverageRange: [Math.min(contract.textCoverageRange[0] + 0.04, 0.42), Math.min(contract.textCoverageRange[1] + 0.08, 0.54)],
      imageCoverageRange: [contract.imageCoverageRange[0], Math.max(contract.imageCoverageRange[1] - 0.08, contract.imageCoverageRange[0] + 0.08)],
      headlineMaxLines: Math.min(contract.headlineMaxLines + 1, ruleSet.typography.headline.maxLines),
      subtitleMaxLines: Math.min(contract.subtitleMaxLines + 1, ruleSet.typography.subtitle.maxLines),
      occupancyMode: 'text-safe',
    }
  } else if (intent.balanceRegime === 'minimal-copy' || densityPreset === 'minimal-copy') {
    contract = {
      ...contract,
      textCoverageRange: [Math.max(contract.textCoverageRange[0] - 0.02, 0.12), Math.min(contract.textCoverageRange[1], 0.26)],
      imageCoverageRange: [contract.imageCoverageRange[0], Math.min(contract.imageCoverageRange[1], format.category === 'marketplace' ? 0.48 : 0.5)],
      headlineMaxLines: Math.min(contract.headlineMaxLines, 3),
      subtitleMaxLines: Math.min(contract.subtitleMaxLines, format.category === 'display' || format.category === 'marketplace' ? 1 : 2),
      occupancyMode: contract.occupancyMode === 'visual-first' ? 'visual-first' : 'spacious',
    }
  } else if (intent.balanceRegime === 'text-first') {
    contract = {
      ...contract,
      textCoverageRange: [Math.min(contract.textCoverageRange[0] + 0.03, 0.36), Math.min(contract.textCoverageRange[1] + 0.05, 0.5)],
      imageCoverageRange: [contract.imageCoverageRange[0], Math.max(contract.imageCoverageRange[1] - 0.06, contract.imageCoverageRange[0] + 0.08)],
      occupancyMode: 'text-safe',
    }
  } else if (intent.balanceRegime === 'image-first') {
    contract = {
      ...contract,
      imageCoverageRange: [Math.max(contract.imageCoverageRange[0], 0.26), Math.min(contract.imageCoverageRange[1] + 0.04, ruleSet.composition.maxImageCoverage)],
      textCoverageRange: [contract.textCoverageRange[0], Math.max(contract.textCoverageRange[1] - 0.04, contract.textCoverageRange[0] + 0.06)],
      occupancyMode: contract.occupancyMode === 'text-safe' && format.category === 'marketplace' ? 'text-safe' : 'visual-first',
    }
  }

  const formatOverride = getFormatContractOverride(format, archetype)
  contract = {
    ...contract,
    ...formatOverride,
    textCoverageRange: formatOverride.textCoverageRange || contract.textCoverageRange,
    imageCoverageRange: formatOverride.imageCoverageRange || contract.imageCoverageRange,
  }

  if (isNoImageMarketplaceCardHeaderPanelLayout({
    format,
    intent,
    assetHint: options?.assetHint,
    imageAnalysis: options?.imageAnalysis,
  })) {
    contract = {
      ...contract,
      textCoverageRange: [Math.max(contract.textCoverageRange[0], 0.22), Math.max(contract.textCoverageRange[1], 0.38)],
      imageCoverageRange: [Math.max(contract.imageCoverageRange[0], 0.24), Math.max(contract.imageCoverageRange[1], 0.34)],
      clusterGapPx: Math.max(contract.clusterGapPx - 2, 10),
      textToImageGapPx: Math.max(contract.textToImageGapPx - 8, 12),
      topReservePx: Math.max(contract.topReservePx, 58),
      ctaReservePx: Math.max(contract.ctaReservePx, 72),
      occupancyMode: 'balanced',
      fallbackMode: 'none',
    }
  } else if (isNoImageMarketplaceCardLayout({ format, assetHint: options?.assetHint, imageAnalysis: options?.imageAnalysis })) {
    contract = {
      ...contract,
      textCoverageRange: [Math.max(contract.textCoverageRange[0], 0.24), Math.max(contract.textCoverageRange[1], 0.4)],
      imageCoverageRange: [Math.max(contract.imageCoverageRange[0], 0.18), Math.max(contract.imageCoverageRange[1], 0.34)],
      clusterGapPx: Math.max(contract.clusterGapPx - 3, 10),
      textToImageGapPx: Math.max(contract.textToImageGapPx - 10, 10),
      topReservePx: Math.max(contract.topReservePx, 64),
      ctaReservePx: Math.max(contract.ctaReservePx, 68),
      occupancyMode: 'text-safe',
      fallbackMode: 'safe-shelf',
    }
  }

  if (safeFallbackArchetype === 'compact-minimal' && format.category === 'marketplace') {
    contract.fallbackMode = 'safe-shelf'
  } else if (safeFallbackArchetype === 'dense-information' && (format.category === 'print' || format.category === 'presentation')) {
    contract.fallbackMode = format.family === 'wide' || format.family === 'landscape' ? 'safe-side' : 'safe-shelf'
  }

  return contract
}

function getRegionCoverage(region: Region) {
  return (region.w * region.h) / 10000
}

function applySafeArchetypeFallback(
  zones: { image: Region; text: Region; logo: Region; badge: Region; cta: Region },
  contract: ArchetypeLayoutContract,
  format: FormatDefinition,
  insets: { x: number; y: number }
) {
  const next = clone(zones)
  const marketplaceTight = format.category === 'marketplace'
  if (contract.fallbackMode === 'safe-side') {
    const textWidth = clamp(
      marketplaceTight
        ? (format.family === 'wide' || format.family === 'landscape' ? 40 : 34)
        : format.family === 'wide' || format.family === 'landscape' ? 34 : 30,
      24,
      marketplaceTight ? 46 : 42
    )
    next.text = normalizeRegion({
      x: insets.x + 1,
      y: Math.max(next.text.y, insets.y + (marketplaceTight ? 6 : 8)),
      w: textWidth,
      h: 100 - (insets.y + 1) * 2 - (marketplaceTight ? 8 : 10),
    })
    next.image = normalizeRegion({
      x: next.text.x + next.text.w + pxToPercentX(contract.textToImageGapPx, format),
      y: insets.y + 1,
      w: 100 - insets.x - (next.text.x + next.text.w + pxToPercentX(contract.textToImageGapPx, format)) - 1,
      h: 100 - (insets.y + 1) * 2,
    })
    next.cta = normalizeRegion({
      x: next.text.x,
      y: next.text.y + next.text.h - 10,
      w: Math.min(next.cta.w || 20, next.text.w),
        h: next.cta.h || 7,
      })
  } else if (contract.fallbackMode === 'safe-shelf') {
    const textHeight = clamp(
      marketplaceTight
        ? format.family === 'portrait' || format.family === 'printPortrait' || format.family === 'skyscraper'
          ? 32
          : 28
        : format.family === 'portrait' || format.family === 'printPortrait' || format.family === 'skyscraper'
          ? 28
          : 24,
      18,
      marketplaceTight ? 38 : 34
    )
    next.image = normalizeRegion({
      x: insets.x + 1,
      y: insets.y + 1,
      w: 100 - (insets.x + 1) * 2,
      h: 100 - (insets.y + 1) * 2 - textHeight - pxToPercentY(contract.textToImageGapPx, format),
    })
    next.text = normalizeRegion({
      x: insets.x + 1,
      y: next.image.y + next.image.h + pxToPercentY(contract.textToImageGapPx, format),
      w: 100 - (insets.x + 1) * 2,
      h: textHeight,
    })
    next.cta = normalizeRegion({
      x: next.text.x,
      y: next.text.y + next.text.h - 8,
      w: Math.min(next.cta.w || 20, next.text.w),
      h: next.cta.h || 7,
    })
  }
  return next
}

function adaptZonesToContract(input: {
  zones: { image: Region; text: Region; logo: Region; badge: Region; cta: Region }
  contract: ArchetypeLayoutContract
  format: FormatDefinition
  profile: ContentProfile
  intent?: LayoutIntent
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  let next = clone(input.zones)
  const { contract, format, profile } = input
  const wideLike = format.family === 'wide' || format.family === 'landscape'
  const marketplaceTight = format.category === 'marketplace'
  const imageBackedProductSupport =
    format.key === 'marketplace-card' &&
    input.intent?.marketplaceTemplateId === 'product-support-card' &&
    !isNoImageMarketplaceCardLayout({
      format,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    })
  const productDominantProductSupport =
    imageBackedProductSupport && input.intent?.marketplaceTemplateVariant === 'image-dominant-square'
  const textFirstPromoLayout =
    format.key === 'marketplace-card' && input.intent?.marketplaceTemplateId === 'text-first-promo'
  const proofBandTextFirst = textFirstPromoLayout && input.intent?.marketplaceTemplateVariant === 'proof-band'
  const imageBackedTextFirst =
    textFirstPromoLayout && input.intent?.marketplaceTemplateSelection?.inputProfile.imageRegime === 'image-backed'
  const noImageTextFirst =
    textFirstPromoLayout && input.intent?.marketplaceTemplateSelection?.inputProfile.imageRegime === 'no-image'
  const noImageHeaderPanel = isNoImageMarketplaceCardHeaderPanelLayout({
    format,
    intent: input.intent,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })
  const textCoverage = getRegionCoverage(next.text)
  const imageCoverage = getRegionCoverage(next.image)
  const targetTextCoverage = noImageHeaderPanel
    ? Math.max(contract.textCoverageRange[0], 0.22)
    : imageBackedTextFirst
      ? proofBandTextFirst
        ? 0.2
        : Math.max(contract.textCoverageRange[0] - 0.05, 0.16)
      : noImageTextFirst && proofBandTextFirst
        ? Math.max(contract.textCoverageRange[0] - 0.04, 0.18)
    : productDominantProductSupport
      ? Math.max(contract.textCoverageRange[0] - 0.1, 0.12)
      : imageBackedProductSupport
        ? Math.max(contract.textCoverageRange[0] - 0.06, 0.16)
    : marketplaceTight
      ? Math.max(contract.textCoverageRange[0], wideLike ? 0.28 : format.family === 'portrait' ? 0.32 : 0.26)
      : contract.textCoverageRange[0]
  const targetImageMax = noImageHeaderPanel
    ? Math.min(contract.imageCoverageRange[1], 0.34)
    : imageBackedTextFirst
      ? Math.max(contract.imageCoverageRange[1], proofBandTextFirst ? 0.16 : 0.14)
      : noImageTextFirst && proofBandTextFirst
        ? Math.max(contract.imageCoverageRange[1], 0.12)
    : productDominantProductSupport
      ? Math.max(contract.imageCoverageRange[1], wideLike ? 0.42 : 0.36)
      : imageBackedProductSupport
        ? Math.max(contract.imageCoverageRange[1], wideLike ? 0.36 : 0.32)
    : marketplaceTight
      ? Math.min(contract.imageCoverageRange[1], getFormatRuleSet(format).composition.maxImageCoverage)
      : contract.imageCoverageRange[1]
  const textNeedsBoost =
    !imageBackedProductSupport &&
    !imageBackedTextFirst &&
    !(noImageTextFirst && proofBandTextFirst) &&
    (profile.density === 'dense' || profile.preferredMessageMode === 'text-first')
  const textGapStep = wideLike ? 6 : 8

  if (textCoverage < targetTextCoverage || textNeedsBoost) {
    if (wideLike) {
      const delta = clamp((targetTextCoverage - textCoverage) * 120 + (textNeedsBoost ? 4 : 0) + (marketplaceTight ? 5 : 0), 0, marketplaceTight ? 20 : 14)
      next.text.w = clamp(next.text.w + delta, 24, 64)
      if (next.image.x > next.text.x) {
        next.image.x = clamp(next.image.x + delta, 0, 100)
      }
      next.image.w = clamp(next.image.w - delta - pxToPercentX(textGapStep, format), marketplaceTight ? 16 : 18, 78)
    } else {
      const delta = clamp((targetTextCoverage - textCoverage) * 120 + (textNeedsBoost ? 5 : 0) + (marketplaceTight ? 6 : 0), 0, marketplaceTight ? 24 : 18)
      next.text.h = clamp(next.text.h + delta, marketplaceTight ? 22 : 18, marketplaceTight ? 56 : 48)
      next.text.y = clamp(next.text.y - delta * 0.35, 0, 100)
      next.image.h = clamp(next.image.h - delta - pxToPercentY(textGapStep, format), marketplaceTight ? 16 : 18, 84)
    }
  }

  if (imageCoverage > targetImageMax) {
    if (wideLike) {
      const delta = marketplaceTight ? 12 : 8
      next.image.w = clamp(next.image.w - delta, marketplaceTight ? 16 : 18, 76)
      if (marketplaceTight) next.text.w = clamp(next.text.w + 4, 24, 66)
    } else {
      const delta = marketplaceTight ? 10 : 8
      next.image.h = clamp(next.image.h - delta, marketplaceTight ? 16 : 18, 84)
      if (marketplaceTight) {
        next.text.h = clamp(next.text.h + (format.family === 'portrait' ? 6 : 4), 18, 58)
        next.text.y = clamp(next.text.y - 2, 0, 100)
      }
    }
  }

  if (marketplaceTight) {
    next.cta.w = clamp(next.cta.w, noImageHeaderPanel ? 18 : 16, wideLike ? 28 : 30)
    next.cta.h = clamp(next.cta.h, noImageHeaderPanel ? 5 : 4.8, 7)
  }

  if (imageBackedProductSupport) {
    next.image = normalizeRegion({
      x: next.image.x,
      y: next.image.y,
      w: Math.max(next.image.w, productDominantProductSupport ? 40 : 36),
      h: Math.max(next.image.h, productDominantProductSupport ? 32 : 28),
    })
    next.text = normalizeRegion({
      x: next.text.x,
      y: clamp(next.text.y, productDominantProductSupport ? 54 : 50, 74),
      w: Math.min(next.text.w, productDominantProductSupport ? 36 : 42),
      h: Math.min(next.text.h, productDominantProductSupport ? 20 : 24),
    })
    next.cta = normalizeRegion({
      x: next.text.x,
      y: clamp(Math.max(next.text.y + next.text.h + 2, next.cta.y), 72, 84),
      w: clamp(next.cta.w, 18, 22),
      h: clamp(next.cta.h, 4.8, 6.4),
    })
  } else if (imageBackedTextFirst) {
    next.image = normalizeRegion({
      x: clamp(Math.max(next.image.x, proofBandTextFirst ? 58 : 58), 0, 100),
      y: clamp(Math.min(next.image.y, 12), 0, 100),
      w: Math.max(next.image.w, proofBandTextFirst ? 28 : 24),
      h: Math.max(next.image.h, proofBandTextFirst ? 26 : 18),
    })
    next.text = normalizeRegion({
      x: next.text.x,
      y: clamp(Math.min(next.text.y, proofBandTextFirst ? 14 : 20), 12, 24),
      w: clamp(next.text.w, proofBandTextFirst ? 52 : 48, proofBandTextFirst ? 56 : 54),
      h: clamp(next.text.h, proofBandTextFirst ? 32 : 30, proofBandTextFirst ? 38 : 38),
    })
    next.cta = normalizeRegion({
      x: next.text.x,
      y: clamp(next.text.y + next.text.h + 1, proofBandTextFirst ? 60 : 68, 72),
      w: clamp(next.cta.w, proofBandTextFirst ? 20 : 18, proofBandTextFirst ? 24 : 22),
      h: clamp(next.cta.h, proofBandTextFirst ? 5.2 : 4.8, 6.4),
    })
  } else if (noImageTextFirst && proofBandTextFirst) {
    next.image = normalizeRegion({
      x: clamp(Math.min(next.image.x, 8), 0, 100),
      y: clamp(Math.min(next.image.y, 10), 0, 100),
      w: Math.max(next.image.w, 72),
      h: clamp(next.image.h, 12, 16),
    })
    next.text = normalizeRegion({
      x: next.text.x,
      y: clamp(next.image.y + next.image.h + 4, 24, 30),
      w: clamp(next.text.w, 68, 74),
      h: clamp(next.text.h, 34, 40),
    })
    next.cta = normalizeRegion({
      x: next.text.x,
      y: clamp(next.text.y + next.text.h + 2, 64, 72),
      w: clamp(next.cta.w, 18, 24),
      h: clamp(next.cta.h, 4.8, 6.4),
    })
  }

  return {
    ...next,
    image: normalizeRegion(next.image),
    text: normalizeRegion(next.text),
    cta: normalizeRegion(next.cta),
  }
}

export function buildLayoutBlocks({
  master,
  format,
  profile,
  typography,
  intent,
}: {
  master: Scene
  format: FormatDefinition
  profile: ContentProfile
  typography: TypographyPlan
  intent: LayoutIntent
  }): LayoutBlock[] {
    const text = getTextMetrics(master, typography, format)
    const cta = getCtaSize(master, format, typography, profile)
    const marketplaceRoleContract = getMarketplaceRoleContract(format)
    const productSupportTemplate = intent.marketplaceTemplateId === 'product-support-card'
    const textFirstPromoTemplate = intent.marketplaceTemplateId === 'text-first-promo'
    const proofBandTextFirstImageBacked =
      textFirstPromoTemplate &&
      intent.marketplaceTemplateVariant === 'proof-band' &&
      intent.marketplaceTemplateSelection?.inputProfile.imageRegime === 'image-backed'
    const imageDominantProductSupport = productSupportTemplate && intent.marketplaceTemplateVariant === 'image-dominant-square'
    const commerceLockupProductSupport = productSupportTemplate && intent.marketplaceTemplateVariant === 'commerce-lockup'
    const headlinePriority = marketplaceRoleContract.enabled ? 100 : 100
    const imagePriority = marketplaceRoleContract.enabled ? 94 : intent.balanceMode === 'text-dominant' ? 86 : 96
    const ctaPriority = marketplaceRoleContract.enabled ? 88 : profile.needsStrongCTA ? 92 : format.category === 'display' ? 88 : 84
    const logoPriority = marketplaceRoleContract.enabled ? 54 : 48
    const subtitlePriority = marketplaceRoleContract.enabled ? 38 : 70
    const badgePriority = marketplaceRoleContract.enabled ? 24 : profile.needsOfferDominance ? 90 : 76
    const blocks: LayoutBlock[] = [
      {
        id: 'image',
        kind: 'image',
        priority: imagePriority,
        intrinsicSize: {
          minW:
            productSupportTemplate
              ? imageDominantProductSupport
                ? 34
                : 30
              : proofBandTextFirstImageBacked
                ? 28
                : isBillboardFamily(intent)
                  ? 26
                  : 24,
          minH:
            productSupportTemplate
              ? imageDominantProductSupport
                ? 34
                : 28
              : proofBandTextFirstImageBacked
                ? 28
                : isPortraitOverlayFamily(intent)
                  ? 62
                  : 24,
          idealW:
            productSupportTemplate
              ? imageDominantProductSupport
                ? 44
                : commerceLockupProductSupport
                  ? 38
                  : 40
              : proofBandTextFirstImageBacked
                ? 32
              : intent.imageMode === 'background'
                ? 92
                : intent.imageMode === 'hero'
                  ? 84
                  : 34,
          idealH:
            productSupportTemplate
              ? imageDominantProductSupport
                ? 46
                : commerceLockupProductSupport
                  ? 40
                  : 42
              : proofBandTextFirstImageBacked
                ? 32
              : intent.imageMode === 'background'
                ? 88
                : intent.imageMode === 'hero'
                  ? 48
                  : 72,
      },
      anchorPreference: intent.imageMode === 'split-left' ? 'top-left' : 'top-right',
      canOverlayImage: false,
      keepAwayFrom: ['headline', 'subtitle', 'cta', 'logo', 'badge'],
    },
      {
        id: 'headline',
        kind: 'headline',
        priority: headlinePriority,
        intrinsicSize: {
          minW: 24,
          minH: text.titleHeight,
          idealW: typography.titleWidth,
        idealH: text.titleHeight,
      },
      contentLength: profile.headlineLength,
      anchorPreference:
        intent.textMode === 'centered' ? 'center' :
        intent.textMode === 'cluster-bottom' ? 'bottom-left' :
        'top-left',
      canOverlayImage: intent.textMode === 'overlay',
      keepAwayFrom: ['image', 'logo', 'badge'],
    },
      {
        id: 'subtitle',
        kind: 'subtitle',
        priority: subtitlePriority,
        intrinsicSize: {
          minW: 24,
          minH: text.subtitleHeight,
          idealW: typography.subtitleWidth,
          idealH: text.subtitleHeight,
      },
      contentLength: profile.subtitleLength + profile.bodyLength,
      anchorPreference:
        intent.textMode === 'centered' ? 'center' :
        intent.textMode === 'cluster-bottom' ? 'bottom-left' :
        'top-left',
      canOverlayImage: intent.textMode === 'overlay',
      keepAwayFrom: ['image', 'logo', 'badge'],
    },
      {
        id: 'cta',
        kind: 'cta',
        priority: ctaPriority,
        intrinsicSize: {
          minW: cta.width,
          minH: cta.height,
          idealW: cta.width,
        idealH: cta.height,
      },
      contentLength: profile.ctaLength,
      anchorPreference: intent.textMode === 'cluster-bottom' ? 'bottom-left' : 'top-left',
      canOverlayImage: intent.textMode === 'overlay',
      keepAwayFrom: ['image'],
    },
      {
        id: 'logo',
        kind: 'logo',
        priority: logoPriority,
        intrinsicSize: {
          minW: marketplaceRoleContract.enabled ? (format.family === 'portrait' ? 7 : 6) : format.family === 'skyscraper' ? 20 : 10,
          minH: marketplaceRoleContract.enabled ? 3.2 : format.family === 'wide' ? 10 : 5,
          idealW: marketplaceRoleContract.enabled ? (format.family === 'portrait' ? 8.5 : 7.5) : format.family === 'skyscraper' ? 22 : 11,
          idealH: marketplaceRoleContract.enabled ? 3.6 : format.family === 'wide' ? 10 : 5,
        },
        anchorPreference: 'top-left',
        canOverlayImage: true,
        keepAwayFrom: ['headline', 'badge'],
      },
      {
        id: 'badge',
        kind: 'badge',
        priority: badgePriority,
        intrinsicSize: {
          minW: marketplaceRoleContract.enabled
            ? clamp(7 + profile.badgeLength * 0.42, 9, format.family === 'portrait' ? 18 : 16)
            : clamp(8 + profile.badgeLength * 0.58, format.family === 'wide' ? 10 : 12, format.family === 'skyscraper' ? 32 : 28),
          minH: marketplaceRoleContract.enabled ? 4 : format.family === 'wide' ? 9 : format.family === 'skyscraper' ? 5 : 5,
          idealW: marketplaceRoleContract.enabled
            ? clamp(8.5 + profile.badgeLength * 0.46 + (profile.needsOfferDominance ? 1.5 : 0), 10, format.family === 'portrait' ? 20 : 18)
            : clamp(10 + profile.badgeLength * 0.64 + (profile.needsOfferDominance ? 3 : 0), 12, format.family === 'skyscraper' ? 36 : 30),
          idealH: marketplaceRoleContract.enabled ? 4.2 : format.family === 'wide' ? 9 : 5,
        },
        contentLength: profile.badgeLength + profile.priceLength,
        anchorPreference: profile.needsOfferDominance ? 'top-left' : 'top-right',
        canOverlayImage: true,
      keepAwayFrom: ['logo', 'headline'],
    },
  ]

  return blocks.sort((left, right) => right.priority - left.priority)
}

export type ReservedRegions = { image: Region; text: Region; logo: Region; badge: Region; cta: Region }

export function reserveMajorRegions(input: {
  format: FormatDefinition
  intent: LayoutIntent
  profile: ContentProfile
  imageAnalysis?: EnhancedImageAnalysis
  brandKit: BrandKit
  ruleSet: FormatRuleSet
  compositionModel?: CompositionModel | null
}): ReservedRegions {
  if (input.compositionModel) return buildModelZones(input.compositionModel, input.format, input.imageAnalysis)
  return buildFamilyZones({
    format: input.format,
    intent: input.intent,
    profile: input.profile,
    imageAnalysis: input.imageAnalysis,
    assetHint: undefined,
    brandKit: input.brandKit,
    ruleSet: input.ruleSet,
  })
}

export function packBlocksIntoRegions(input: {
  blocks: LayoutBlock[]
  scene: Scene
  format: FormatDefinition
  typography: TypographyPlan
  zones: ReservedRegions
  ruleSet: FormatRuleSet
  compositionModel?: CompositionModel | null
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}): Scene {
  return packBlocks({
    blocks: input.blocks,
    scene: input.scene,
    format: input.format,
    typography: input.typography,
    zones: input.zones,
    ruleSet: input.ruleSet,
    compositionModel: input.compositionModel,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })
}

export function extractLayoutBoxes(scene: Scene, format: FormatDefinition): LayoutBoxMap {
  return buildSceneLayoutBoxes(scene, format)
}

export function resolveSafeAreaViolations(scene: Scene, format: FormatDefinition, ruleSet: FormatRuleSet): Scene {
  return applyRuleConstraints(scene, format, ruleSet)
}

export function computeVisualBalance(scene: Scene): { center: { x: number; y: number }; offset: { dx: number; dy: number }; score: number } {
  const center = getSceneWeights(scene)
  const dx = center.x - 50
  const dy = center.y - 50
  const magnitude = Math.sqrt(dx * dx + dy * dy)
  return {
    center: { x: center.x, y: center.y },
    offset: { dx, dy },
    score: clamp(Math.round(100 - magnitude * 1.6), 0, 100),
  }
}

export function detectDeadSpace(scene: Scene, safeArea: Rect): { score: number; deadSpacePercent: number } {
  const textGeometry = buildSceneTextGeometry(scene, {
    key: 'social-square',
    name: 'Scene geometry',
    width: 100,
    height: 100,
    label: 'Scene geometry',
    category: 'social',
    family: 'square',
    packTags: ['promo-pack'],
    scopeStage: 'legacy',
    primaryGenerationMode: 'legacy-freeform',
  })
  const active: Array<{ x: number; y: number; w: number; h: number }> = [
    scene.image,
    textGeometry.headline.rect,
    textGeometry.subtitle?.rect || { x: 0, y: 0, w: 0, h: 0 },
    scene.cta,
    scene.logo,
    scene.badge,
  ].filter((item) => (item.w || 0) > 0 && (item.h || 0) > 0) as Array<{ x: number; y: number; w: number; h: number }>

  const used = active.reduce((sum, item) => sum + item.w * item.h, 0)
  const safeAreaArea = Math.max(safeArea.w * safeArea.h, 1)
  const deadSpace = clamp(1 - used / safeAreaArea, 0, 1)
  return {
    deadSpacePercent: Math.round(deadSpace * 100),
    score: clamp(Math.round(100 - deadSpace * 120), 0, 100),
  }
}

export function refinePackedLayout(input: {
  scene: Scene
  intent: LayoutIntent
  format: FormatDefinition
  profile: ContentProfile
  brandKit: BrandKit
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}): Scene {
  return refineLayout(input)
}

export function convertBlocksToScene(input: {
  blocks: LayoutBlock[]
  scene: Scene
  format: FormatDefinition
  typography: TypographyPlan
  zones: ReservedRegions
  ruleSet: FormatRuleSet
  compositionModel?: CompositionModel | null
}): Scene {
  // Legacy compatibility helper: convert a block+zones solution into the current `Scene` contract.
  // The deterministic refinements are applied by the caller pipeline (`synthesizeLayout`), so keep this minimal and safe.
  const packed = packBlocksIntoRegions(input)
  return finalizeSceneGeometry(resolveSafeAreaViolations(packed, input.format, input.ruleSet), input.format, input.compositionModel)
}

function safeAreaFallback(intent: LayoutIntent, insets: { x: number; y: number }) {
  if (intent.textMode === 'cluster-bottom') return { x: insets.x + 1, y: 58, w: 74, h: 30 }
  if (intent.textMode === 'centered') return { x: 16, y: 22, w: 42, h: 44 }
  if (intent.textMode === 'overlay') return { x: 8, y: 54, w: 70, h: 32 }
  return { x: insets.x, y: 24, w: 40, h: 52 }
}

function chooseSafeTextRegion(intent: LayoutIntent, imageAnalysis: EnhancedImageAnalysis | undefined, insets: { x: number; y: number }, format: FormatDefinition): Region {
  const fallback = safeAreaFallback(intent, insets)
  if (!imageAnalysis?.safeTextAreas?.length) return fallback

  const areas = [...imageAnalysis.safeTextAreas]
  const sorted = areas.sort((left, right) => {
    const leftPenalty =
      intent.textMode === 'cluster-bottom' ? Math.abs((left.y + left.h) - 86) :
      intent.textMode === 'centered' ? Math.abs(left.x + left.w / 2 - 50) + Math.abs(left.y + left.h / 2 - 50) :
      left.x
    const rightPenalty =
      intent.textMode === 'cluster-bottom' ? Math.abs((right.y + right.h) - 86) :
      intent.textMode === 'centered' ? Math.abs(right.x + right.w / 2 - 50) + Math.abs(right.y + right.h / 2 - 50) :
      right.x
    return right.score - rightPenalty * 0.01 - (left.score - leftPenalty * 0.01)
  })
  const chosen = sorted[0]
  if (!chosen) return fallback

  return {
    x: clamp(chosen.x, insets.x, 100 - insets.x - Math.max(chosen.w, fallback.w)),
    y: clamp(chosen.y, insets.y + 4, 72),
    w: clamp(Math.max(chosen.w, fallback.w), fallback.w - 4, fallback.w + 10),
    h: clamp(Math.max(chosen.h, fallback.h), fallback.h - 6, fallback.h + 10),
  }
}

function zoneRectToRegion(rect: Rect, format: FormatDefinition): Region {
  return {
    x: pxToPercentX(rect.x, format),
    y: pxToPercentY(rect.y, format),
    w: pxToPercentX(rect.w, format),
    h: pxToPercentY(rect.h, format),
  }
}

function anchorRegionWithinZone(zone: Region, slot: CompositionModel['slots'][number] | undefined, format: FormatDefinition): Region {
  if (!slot) return zone
  const preferredW = slot.preferredW ? pxToPercentX(slot.preferredW, format) : zone.w
  const preferredH = slot.preferredH ? pxToPercentY(slot.preferredH, format) : zone.h
  const width = clamp(preferredW, slot.minW ? pxToPercentX(slot.minW, format) : 0, Math.min(zone.w, slot.maxW ? pxToPercentX(slot.maxW, format) : zone.w))
  const height = clamp(preferredH, slot.minH ? pxToPercentY(slot.minH, format) : 0, Math.min(zone.h, slot.maxH ? pxToPercentY(slot.maxH, format) : zone.h))
  const anchor = slot.anchor || 'top-left'
  const x =
    anchor === 'center'
      ? zone.x + (zone.w - width) / 2
      : anchor === 'top-right'
        ? zone.x + zone.w - width
        : zone.x
  const y =
    anchor === 'bottom-left' || anchor === 'bottom-center'
      ? zone.y + zone.h - height
      : anchor === 'center'
        ? zone.y + (zone.h - height) / 2
        : zone.y
  return {
    x: clamp(x, zone.x, zone.x + zone.w - width),
    y: clamp(y, zone.y, zone.y + zone.h - height),
    w: width,
    h: height,
  }
}

function findModelSlot(model: CompositionModel | undefined, block: LayoutBlock['kind']) {
  return model?.slots.find((slot) => slot.block === block)
}

function getCompositionZoneRegion(model: CompositionModel, zoneId: string, format: FormatDefinition) {
  const zone = model.zones.find((current) => current.id === zoneId)
  return zone ? zoneRectToRegion(zone.rect, format) : undefined
}

function getRegionIntersection(left: Region, right: Region): Region | null {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const w = Math.min(left.x + left.w, right.x + right.w) - x
  const h = Math.min(left.y + left.h, right.y + right.h) - y
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

function regionArea(region: Region) {
  return Math.max(region.w, 0) * Math.max(region.h, 0)
}

function overlayTextSupportedBySafeArea(
  zone: Region | undefined,
  imageZone: Region | undefined,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  format: FormatDefinition,
  model: CompositionModel
) {
  if (!zone || !imageZone || !imageAnalysis?.safeTextAreas?.length) return zone
  const policy = getOverlaySafetyPolicy(format, model)

  const candidates = imageAnalysis.safeTextAreas
    .filter((area) => area.score >= policy.safeTextScoreMin)
    .map((area) => ({
      score: area.score,
      region: { x: area.x, y: area.y, w: area.w, h: area.h } as Region,
    }))
    .map((candidate) => {
      const clippedToImage = getRegionIntersection(candidate.region, imageZone)
      const clipped = clippedToImage ? getRegionIntersection(clippedToImage, zone) : null
      return clipped ? { score: candidate.score, region: clipped } : null
    })
    .filter((candidate): candidate is { score: number; region: Region } => Boolean(candidate))
    .sort((left, right) => right.score * regionArea(right.region) - left.score * regionArea(left.region))

  const safeCoverage = candidates.reduce((sum, candidate) => sum + regionArea(candidate.region), 0) / Math.max(regionArea(zone), 0.0001)
  const minimumArea = regionArea(zone) * Math.min(Math.max(policy.safeCoverageMin - 0.18, 0.38), 0.72)
  const best = candidates.find((candidate) => regionArea(candidate.region) >= minimumArea) || candidates[0]
  if (!best) return zone

  const widthFactor = safeCoverage >= policy.safeCoverageMin ? 0.72 : 0.58
  const heightFactor = safeCoverage >= policy.safeCoverageMin ? 0.72 : 0.58
  return {
    x: clamp(best.region.x, zone.x, zone.x + Math.max(zone.w - best.region.w, 0)),
    y: clamp(best.region.y, zone.y, zone.y + Math.max(zone.h - best.region.h, 0)),
    w: Math.min(zone.w, Math.max(best.region.w, zone.w * widthFactor)),
    h: Math.min(zone.h, Math.max(best.region.h, zone.h * heightFactor)),
  }
}

function buildModelZones(model: CompositionModel, format: FormatDefinition, imageAnalysis?: EnhancedImageAnalysis) {
  const textSlot = findModelSlot(model, 'headline') || findModelSlot(model, 'subtitle') || findModelSlot(model, 'body')
  const imageSlot = findModelSlot(model, 'image')
  const logoSlot = findModelSlot(model, 'logo')
  const badgeSlot = findModelSlot(model, 'badge') || findModelSlot(model, 'price')
  const ctaSlot = findModelSlot(model, 'cta')

  const imageZone = imageSlot ? anchorRegionWithinZone(getCompositionZoneRegion(model, imageSlot.zoneId, format) || rectToRegion(getFormatRuleSet(format).safeArea, format), imageSlot, format) : undefined
  const rawTextZone = textSlot ? getCompositionZoneRegion(model, textSlot.zoneId, format) : undefined
  const textNeedsOverlaySafety = Boolean(
    getModelOverlapRule('headline', 'image', model) ||
      getModelOverlapRule('subtitle', 'image', model) ||
      getModelOverlapRule('body', 'image', model)
  )
  const textZone = textNeedsOverlaySafety
    ? overlayTextSupportedBySafeArea(rawTextZone, imageZone, imageAnalysis, format, model)
    : rawTextZone
  const logoZone = logoSlot ? anchorRegionWithinZone(getCompositionZoneRegion(model, logoSlot.zoneId, format) || rectToRegion(getFormatRuleSet(format).safeArea, format), logoSlot, format) : undefined
  const badgeZone = badgeSlot ? anchorRegionWithinZone(getCompositionZoneRegion(model, badgeSlot.zoneId, format) || rectToRegion(getFormatRuleSet(format).safeArea, format), badgeSlot, format) : undefined
  const ctaZone = ctaSlot ? anchorRegionWithinZone(getCompositionZoneRegion(model, ctaSlot.zoneId, format) || rectToRegion(getFormatRuleSet(format).safeArea, format), ctaSlot, format) : undefined
  return applyPrimarySquareBaselineZoneGuard(
    {
    image: imageZone || { x: 8, y: 8, w: 84, h: 64 },
    text: textZone || { x: 8, y: 24, w: 44, h: 40 },
    logo: logoZone || { x: 6, y: 6, w: 10, h: 5 },
    badge: badgeZone || { x: 80, y: 6, w: 12, h: 5 },
    cta: ctaZone || { x: 8, y: 84, w: 18, h: 6 },
    },
    format,
    imageAnalysis
  )
}

function applyPrimarySquareBaselineZoneGuard(
  zones: FamilyZoneSet,
  format: FormatDefinition,
  imageAnalysis?: EnhancedImageAnalysis
): FamilyZoneSet {
  if (format.key !== 'social-square') return zones

  const next = clone(zones)
  const imageProfile = imageAnalysis?.imageProfile
  const imageMaxW =
    imageProfile === 'portrait' || imageProfile === 'tall'
      ? 30
      : imageProfile === 'ultraWide'
        ? 28
        : 32
  const imageMaxH = imageProfile === 'ultraWide' ? 26 : imageProfile === 'portrait' || imageProfile === 'tall' ? 34 : 32
  const ctaHeight = clamp(next.cta.h || 6, 5.6, 6.4)
  const ctaYMax = 92 - ctaHeight
  const ctaY = clamp(next.cta.y, 52, Math.min(ctaYMax, 90))
  const textX = clamp(Math.min(next.text.x, 8), 6.5, 10)
  const textY = clamp(Math.min(next.text.y, 18), 14, 22)
  const textW = clamp(Math.max(next.text.w, 38), 36, 42)
  const textBottomCap = ctaY - 11
  const textH = clamp(Math.min(Math.max(next.text.h, 20), textBottomCap - textY), 18, 24)

  next.text = normalizeRegion({
    x: textX,
    y: textY,
    w: textW,
    h: textH,
  })
  next.cta = normalizeRegion({
    x: textX,
    y: ctaY,
    w: clamp(next.cta.w || 20, 18, 22),
    h: ctaHeight,
  })

  const imageX = clamp(Math.max(next.image.x, next.text.x + next.text.w + 8), 54, 66)
  const imageY = clamp(next.image.y, 12, 18)
  const imageBottomCap = next.cta.y - 9
  const imageH = clamp(Math.min(next.image.h, imageBottomCap - imageY), 22, imageMaxH)
  const imageW = clamp(Math.min(next.image.w, imageMaxW), 24, imageMaxW)
  next.image = normalizeRegion({
    x: imageX,
    y: imageY,
    w: imageW,
    h: imageH,
  })

  next.logo = normalizeRegion({
    x: clamp(next.logo.x, 6, 10),
    y: clamp(next.logo.y, 5, 8),
    w: clamp(next.logo.w || 10, 9, 12),
    h: clamp(next.logo.h || 5, 4.2, 5.2),
  })
  next.badge = normalizeRegion({
    x: clamp(Math.max(next.badge.x, next.image.x + 2), 72, 84),
    y: clamp(next.badge.y, 5, 10),
    w: clamp(next.badge.w || 12, 10, 16),
    h: clamp(next.badge.h || 5, 4.2, 5.2),
  })

  return next
}

function getPrimarySquareImageCoverageCap(textClusterCoverage: number) {
  if (textClusterCoverage >= 0.18) return 0.105
  if (textClusterCoverage >= 0.15) return 0.115
  if (textClusterCoverage >= 0.12) return 0.125
  return 0.135
}

function normalizePrimarySquareImageCandidate(candidate: Region, base: Region): Region {
  const maxW = clamp(Math.min(base.w, 30), 22, 30)
  const maxH = clamp(Math.min(base.h, 32), 22, 32)
  let next = normalizeRegion({
    x: candidate.x,
    y: candidate.y,
    w: clamp(candidate.w, 20, maxW),
    h: clamp(candidate.h, 20, maxH),
  })
  const maxArea = 1040
  const area = next.w * next.h
  if (area > maxArea) {
    const scale = Math.sqrt(maxArea / area)
    next = normalizeRegion({
      ...next,
      w: clamp(next.w * scale, 20, maxW),
      h: clamp(next.h * scale, 20, maxH),
    })
  }
  return normalizeRegion({
    x: clamp(next.x, base.x, base.x + base.w - next.w),
    y: clamp(next.y, base.y, base.y + base.h - next.h),
    w: next.w,
    h: next.h,
  })
}

function clampPrimarySquareMaterializedImage(input: {
  image: Region
  safeArea: Region
  textClusterBounds: Rect
  ctaRect: Rect
}) {
  const textRight =
    input.textClusterBounds.w > 0 && input.textClusterBounds.h > 0
      ? input.textClusterBounds.x + input.textClusterBounds.w
      : 46
  const imageX = clamp(Math.max(input.image.x, textRight + 7), 54, 66)
  const imageY = clamp(input.image.y, 12, 18)
  const imageBottomCap = clamp(
    Math.min(
      input.ctaRect.w > 0 && input.ctaRect.h > 0 ? input.ctaRect.y - 8 : input.safeArea.y + input.safeArea.h - 8,
      52
    ),
    34,
    56
  )
  const maxW = 30
  const maxH = clamp(imageBottomCap - imageY, 22, 34)
  let next = normalizeRegion({
    x: imageX,
    y: imageY,
    w: clamp(input.image.w, 22, maxW),
    h: clamp(input.image.h, 22, maxH),
  })
  const maxCoverage = getPrimarySquareImageCoverageCap(
    ((input.textClusterBounds.w || 0) * (input.textClusterBounds.h || 0)) / 10000
  )
  const maxArea = 10000 * maxCoverage
  const area = next.w * next.h
  if (area > maxArea) {
    const scale = Math.sqrt(maxArea / area)
    next = normalizeRegion({
      ...next,
      w: clamp(next.w * scale, 22, maxW),
      h: clamp(next.h * scale, 22, maxH),
    })
  }
  return normalizeRegion({
    x: clamp(next.x, 54, 92 - next.w),
    y: clamp(next.y, 12, imageBottomCap - next.h),
    w: next.w,
    h: next.h,
  })
}

function buildFamilyZones({
  format,
  intent,
  profile,
  imageAnalysis,
  assetHint,
  brandKit,
  ruleSet,
}: {
  format: FormatDefinition
  intent: LayoutIntent
  profile: ContentProfile
  imageAnalysis?: EnhancedImageAnalysis
  assetHint?: AssetHint
  brandKit: BrandKit
  ruleSet: FormatRuleSet
}) {
  const insets = getSafeInsets(format, brandKit.safeZone)
  const safeText = chooseSafeTextRegion(intent, imageAnalysis, insets, format)
  const ruleImage = getRuleZone(ruleSet, 'image', ruleSet.elements.image.allowedZones)
  const ruleText = getRuleZone(ruleSet, 'text', ruleSet.elements.headline.allowedZones)
  const ruleLogo = getRuleZone(ruleSet, 'logo', ruleSet.elements.logo.allowedZones)
  const ruleBadge = getRuleZone(ruleSet, 'badge', ruleSet.elements.badge?.allowedZones)
  const ruleCta = getRuleZone(ruleSet, 'cta', ruleSet.elements.cta.allowedZones)
  const isPrimarySquare = format.key === 'social-square'
  const isPrimaryPortrait = format.key === 'social-portrait'
  const isPrimaryLandscape = format.key === 'social-landscape'
  const isPrimaryDisplayLargeRect = format.key === 'display-large-rect'

  if (intent.family === 'square-hero-overlay' || intent.family === 'square-image-top-text-bottom') {
    const current = {
      image: {
        x: 8,
        y: insets.y + 2,
        w: intent.family === 'square-hero-overlay' ? 86 : 82,
        h: intent.family === 'square-hero-overlay'
          ? (imageAnalysis?.imageProfile === 'ultraWide' ? 42 : isPrimarySquare ? 46 : 54)
          : isPrimarySquare ? 36 : 42,
      },
      text: {
        x: insets.x + 1,
        y: intent.family === 'square-hero-overlay' ? (isPrimarySquare ? 54 : 60) : (isPrimarySquare ? 52 : 58),
        w: profile.density === 'dense' ? (isPrimarySquare ? 62 : 62) : (isPrimarySquare ? 58 : 58),
        h: isPrimarySquare ? 24 : 30,
      },
      logo: { x: insets.x, y: insets.y, w: 12, h: 5.2 },
      badge: { x: 74, y: insets.y, w: 18, h: 5.2 },
      cta: { x: insets.x + 1, y: isPrimarySquare ? 84 : 86, w: 26, h: isPrimarySquare ? 6.8 : 8 },
    }
    if (isNoImageMarketplaceCardLayout({ format, assetHint, imageAnalysis }) && intent.family === 'square-hero-overlay') {
      current.image = {
        x: insets.x + 1,
        y: insets.y + 2,
        w: 100 - (insets.x + 1) * 2,
        h: 34,
      }
      current.text = { x: insets.x + 2, y: 46, w: 76, h: 28 }
      current.cta = { x: insets.x + 2, y: 80, w: 28, h: 6 }
    }
    return applyPrimarySquareBaselineZoneGuard(
      finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [24, 20], text: [24, 16], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
      }),
      format,
      imageAnalysis
    )
  }

  if (intent.family === 'portrait-hero-overlay') {
    const current = {
      image: { x: 4, y: 4, w: 92, h: format.family === 'skyscraper' ? 92 : 88 },
      text: {
        x: clamp(safeText.x, insets.x + 1, 18),
        y: clamp(Math.max(safeText.y, format.family === 'skyscraper' ? 56 : isPrimaryPortrait ? 48 : 54), 46, 64),
        w: format.family === 'skyscraper' ? 78 : 74,
        h: format.family === 'skyscraper' ? 34 : isPrimaryPortrait ? 22 : 28,
      },
      logo: { x: insets.x, y: insets.y, w: format.family === 'skyscraper' ? 22 : 12, h: format.family === 'skyscraper' ? 5 : 4.8 },
      badge: { x: 100 - insets.x - 16, y: insets.y, w: 16, h: format.family === 'skyscraper' ? 5 : 4.8 },
      cta: { x: clamp(safeText.x, insets.x + 1, 18), y: clamp(Math.max(safeText.y, format.family === 'skyscraper' ? 82 : isPrimaryPortrait ? 80 : 78), 72, 88), w: 26, h: isPrimaryPortrait ? 6.8 : 7.6 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [28, 30], text: [24, 18], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'display-rectangle-image-bg') {
    const current = {
      image: { x: 4, y: 6, w: 92, h: 82 },
      text: { x: 8, y: 54, w: 56, h: 26 },
      logo: { x: insets.x, y: insets.y, w: 12, h: 5 },
      badge: { x: 74, y: insets.y, w: 18, h: 5 },
      cta: { x: 8, y: 78, w: 24, h: 7 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [26, 20], text: [24, 14], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'portrait-bottom-card') {
    const current = {
      image: {
        x: format.family === 'skyscraper' ? 10 : insets.x + 1,
        y: insets.y + 3,
        w: format.family === 'skyscraper' ? 80 : 100 - (insets.x + 1) * 2,
        h: format.family === 'printPortrait' ? 38 : format.family === 'skyscraper' ? 28 : imageAnalysis?.imageProfile === 'portrait' || imageAnalysis?.imageProfile === 'tall' ? (isPrimaryPortrait ? 30 : 38) : (isPrimaryPortrait ? 26 : 32),
      },
      text: {
        x: format.family === 'skyscraper' ? 10 : insets.x + 1,
        y: format.family === 'skyscraper' ? 46 : format.family === 'printPortrait' ? 50 : isPrimaryPortrait ? 46 : 52,
        w: format.family === 'skyscraper' ? 76 : format.family === 'printPortrait' ? 70 : isPrimaryPortrait ? 72 : 74,
        h: format.family === 'skyscraper' ? 42 : isPrimaryPortrait ? 26 : 32,
      },
      logo: { x: insets.x, y: insets.y, w: format.family === 'skyscraper' ? 22 : 12, h: format.family === 'skyscraper' ? 5 : 4.8 },
      badge: { x: insets.x, y: format.family === 'skyscraper' ? 38 : 44, w: 18, h: format.family === 'skyscraper' ? 5 : 4.8 },
      cta: { x: format.family === 'skyscraper' ? 10 : insets.x + 1, y: format.family === 'skyscraper' ? 82 : isPrimaryPortrait ? 84 : 86, w: 24, h: isPrimaryPortrait ? 6.6 : 7.2 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [24, 18], text: [24, 18], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'landscape-text-left-image-right' || intent.family === 'landscape-balanced-split') {
    const compactWideBaseline = isPrimaryLandscape || isPrimaryDisplayLargeRect
    const imageW =
      imageAnalysis?.imageProfile === 'portrait' || imageAnalysis?.imageProfile === 'tall'
        ? (compactWideBaseline ? 22 : 24)
        : imageAnalysis?.imageProfile === 'ultraWide'
          ? (compactWideBaseline ? 32 : 34)
          : (compactWideBaseline ? 28 : 30)
    const imageX = intent.imageMode === 'split-left' ? insets.x : 100 - insets.x - imageW
    const textWidth = intent.family === 'landscape-balanced-split' ? (compactWideBaseline ? 46 : 44) : (compactWideBaseline ? 48 : 46)
    const textX = intent.imageMode === 'split-left' ? 100 - insets.x - textWidth : insets.x
    const current = {
      image: { x: imageX, y: compactWideBaseline ? 16 : 18, w: imageW, h: compactWideBaseline ? 52 : 56 },
      text: { x: textX, y: compactWideBaseline ? 18 : 24, w: textWidth, h: compactWideBaseline ? 34 : 42 },
      logo: { x: insets.x, y: insets.y, w: 10, h: 5 },
      badge: { x: textX, y: 14, w: 16, h: 5 },
      cta: { x: textX, y: compactWideBaseline ? 68 : 70, w: 22, h: compactWideBaseline ? 6.6 : 7 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [20, 18], text: [24, 16], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'landscape-image-dominant') {
    const imageW = imageAnalysis?.imageProfile === 'portrait' || imageAnalysis?.imageProfile === 'tall' ? 30 : imageAnalysis?.imageProfile === 'ultraWide' ? 42 : 38
    const current = {
      image: { x: 100 - insets.x - imageW, y: 8, w: imageW, h: 78 },
      text: { x: insets.x, y: 24, w: 34, h: 34 },
      logo: { x: insets.x, y: insets.y, w: 10, h: 5 },
      badge: { x: insets.x, y: 16, w: 16, h: 5 },
      cta: { x: insets.x, y: 64, w: 20, h: 7 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [24, 20], text: [24, 16], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'display-rectangle-balanced') {
    const current = {
      image: { x: 60, y: 14, w: 30, h: 58 },
      text: { x: 8, y: 22, w: 42, h: 40 },
      logo: { x: insets.x, y: insets.y, w: 12, h: 5 },
      badge: { x: 8, y: 14, w: 18, h: 5 },
      cta: { x: 8, y: 68, w: 24, h: 7 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [18, 20], text: [24, 16], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'billboard-wide-hero') {
    const imageW = imageAnalysis?.imageProfile === 'portrait' || imageAnalysis?.imageProfile === 'tall' ? 22 : imageAnalysis?.imageProfile === 'ultraWide' ? 36 : 32
    const imageX = intent.imageMode === 'split-left' ? insets.x : 100 - insets.x - imageW
    const textX = intent.imageMode === 'split-left' ? 100 - insets.x - 32 : insets.x
    const current = {
      image: { x: imageX, y: 7, w: imageW + 4, h: 80 },
      text: { x: textX, y: 28, w: 32, h: 34 },
      logo: { x: insets.x, y: insets.y, w: 9.5, h: 10 },
      badge: { x: textX, y: 18, w: 16, h: 9 },
      cta: { x: textX, y: 68, w: 24, h: 10 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [24, 22], text: [24, 16], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'billboard-wide-balanced' || intent.family === 'leaderboard-compact-horizontal') {
    const imageW = imageAnalysis?.imageProfile === 'portrait' || imageAnalysis?.imageProfile === 'tall' ? 24 : imageAnalysis?.imageProfile === 'ultraWide' ? 40 : 34
    const current = {
      image: { x: 100 - insets.x - imageW, y: intent.family === 'leaderboard-compact-horizontal' ? 14 : 8, w: intent.family === 'leaderboard-compact-horizontal' ? Math.max(imageW - 8, 18) : imageW, h: intent.family === 'leaderboard-compact-horizontal' ? 58 : 76 },
      text: { x: insets.x, y: intent.family === 'leaderboard-compact-horizontal' ? 22 : 26, w: intent.family === 'leaderboard-compact-horizontal' ? 36 : 30, h: 34 },
      logo: { x: insets.x, y: insets.y, w: 9.5, h: 10 },
      badge: { x: 100 - insets.x - 16, y: insets.y, w: 16, h: 9 },
      cta: { x: insets.x, y: intent.family === 'leaderboard-compact-horizontal' ? 60 : 68, w: 24, h: 10 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [18, 16], text: [24, 14], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'presentation-clean-hero' || intent.family === 'presentation-structured-cover') {
    const imageW = imageAnalysis?.imageProfile === 'portrait' || imageAnalysis?.imageProfile === 'tall' ? 30 : imageAnalysis?.imageProfile === 'ultraWide' ? 42 : 36
    const current = {
      image: { x: 100 - insets.x - imageW, y: format.family === 'printPortrait' ? 11 : 14, w: imageW, h: format.family === 'printPortrait' ? 34 : intent.family === 'presentation-clean-hero' ? 62 : 68 },
      text: { x: insets.x, y: format.family === 'printPortrait' ? 48 : intent.family === 'presentation-clean-hero' ? 28 : 32, w: format.family === 'printPortrait' ? 42 : 40, h: format.family === 'printPortrait' ? 34 : 34 },
      logo: { x: insets.x, y: insets.y, w: format.family === 'printPortrait' ? 12 : 10, h: 5 },
      badge: { x: insets.x, y: format.family === 'printPortrait' ? 16 : 18, w: 16, h: 5 },
      cta: { x: insets.x, y: format.family === 'printPortrait' ? 84 : 70, w: 24, h: 7 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [22, 18], text: [24, 16], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  if (intent.family === 'skyscraper-image-top-text-stack' || intent.family === 'skyscraper-split-vertical') {
    const current = {
      image: { x: 8, y: 6, w: 84, h: intent.family === 'skyscraper-image-top-text-stack' ? 34 : 28 },
      text: { x: 10, y: intent.family === 'skyscraper-image-top-text-stack' ? 46 : 38, w: 76, h: 42 },
      logo: { x: insets.x, y: insets.y, w: 22, h: 5 },
      badge: { x: 54, y: insets.y, w: 28, h: 5 },
      cta: { x: 10, y: 86, w: 26, h: 7 },
    }
    return finalizeFamilyZones({
      current,
      format,
      intent,
      profile,
      safeText,
      insets,
      ruleImage,
      ruleText,
      ruleLogo,
      ruleBadge,
      ruleCta,
      assetHint,
      imageAnalysis,
      mins: { image: [20, 20], text: [24, 18], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
    })
  }

  const imageW = imageAnalysis?.imageProfile === 'portrait' || imageAnalysis?.imageProfile === 'tall' ? 28 : imageAnalysis?.imageProfile === 'ultraWide' ? 40 : 36
  const imageX = intent.imageMode === 'split-left' ? insets.x : 100 - insets.x - imageW
  const textX = intent.imageMode === 'split-left' ? 100 - insets.x - 40 : insets.x
  const current = {
    image: { x: imageX, y: 12, w: imageW, h: 72 },
    text: { x: textX, y: 24, w: profile.density === 'dense' ? 42 : 38, h: 38 },
    logo: { x: insets.x, y: insets.y, w: 10, h: 5 },
    badge: { x: textX, y: 15, w: 16, h: 5 },
    cta: { x: textX, y: 68, w: 22, h: 7 },
  }
  return finalizeFamilyZones({
    current,
    format,
    intent,
    profile,
    safeText,
    insets,
    ruleImage,
    ruleText,
    ruleLogo,
    ruleBadge,
    ruleCta,
    assetHint,
    imageAnalysis,
    mins: { image: [20, 18], text: [24, 16], logo: [6, 3], badge: [8, 3], cta: [12, 4] },
  })
}

function packBlocks({
  blocks,
  scene,
  format,
  typography,
  zones,
  ruleSet,
  intent,
  profile,
  compositionModel,
  assetHint,
  imageAnalysis,
}: {
  blocks: LayoutBlock[]
  scene: Scene
  format: FormatDefinition
  typography: TypographyPlan
  zones: { image: Region; text: Region; logo: Region; badge: Region; cta: Region }
  ruleSet: FormatRuleSet
  intent?: LayoutIntent
  profile?: ContentProfile
  compositionModel?: CompositionModel | null
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const next = clone(scene)
  const effectiveIntent = intent || ({
    family: 'landscape-balanced-split',
    presetId: 'landscape-balanced-split',
    mode: 'text-first',
    imageMode: 'split-right',
    textMode: 'cluster-left',
    balanceMode: 'balanced',
    structuralArchetype: 'text-stack',
    balanceRegime: 'balanced',
    occupancyMode: 'balanced',
    } as LayoutIntent)
  const effectiveProfile = profile || ({ density: 'balanced', preferredMessageMode: 'balanced' } as ContentProfile)
  const contract = getArchetypeLayoutContract(effectiveIntent, format, effectiveProfile, ruleSet, {
    assetHint,
    imageAnalysis,
  })
  const adaptedZones = adaptZonesToContract({
    zones,
    contract,
    format,
    profile: effectiveProfile,
    intent: effectiveIntent,
    assetHint,
    imageAnalysis,
  })
  const workingZones =
    contract.fallbackMode !== 'none' &&
    (effectiveIntent.textMode === 'overlay' || effectiveIntent.mode === 'overlay' || effectiveIntent.imageMode === 'background')
      ? applySafeArchetypeFallback(adaptedZones, contract, format, getSafeInsets(format, 'balanced'))
      : adaptedZones
  const zoneProfiles = buildMarketplaceZoneProfiles({
    zones: workingZones,
    format,
    contract,
    intent: effectiveIntent,
    assetHint,
    imageAnalysis,
  })

  const headlineSlot = findModelSlot(compositionModel || undefined, 'headline')
  const subtitleSlot = findModelSlot(compositionModel || undefined, 'subtitle')
  const ctaSlot = findModelSlot(compositionModel || undefined, 'cta')
  const imageSlot = findModelSlot(compositionModel || undefined, 'image')
  const logoSlot = findModelSlot(compositionModel || undefined, 'logo')
  const badgeSlot = findModelSlot(compositionModel || undefined, 'badge')

  const headlineRule = ruleSet.elements.headline
  const subtitleRule = ruleSet.elements.subtitle
  const ctaRule = ruleSet.elements.cta
  const ctaBlock = blocks.find((block) => block.kind === 'cta')
  const logoBlock = blocks.find((block) => block.kind === 'logo')
  const badgeBlock = blocks.find((block) => block.kind === 'badge')
  const marketplaceRoleContract = getMarketplaceRoleContract(format)
  const marketplaceRoleModes = getMarketplaceRoleModeLadder(format)
  const noImageHeaderPanel = isNoImageMarketplaceCardHeaderPanelLayout({
    format,
    intent: effectiveIntent,
    assetHint,
    imageAnalysis,
  })
  const imageBackedProductSupport = isImageBackedProductSupportLayout({
    format,
    intent: effectiveIntent,
    assetHint,
    imageAnalysis,
  })
  const textFirstMarketplaceTemplate =
    format.key === 'marketplace-card' && effectiveIntent.marketplaceTemplateId === 'text-first-promo'
  const proofBandTextFirst = textFirstMarketplaceTemplate && effectiveIntent.marketplaceTemplateVariant === 'proof-band'
  const comparisonLockupProductSupport =
    imageBackedProductSupport && effectiveIntent.marketplaceTemplateVariant === 'comparison-lockup'
  const imageDominantProductSupport =
    imageBackedProductSupport && effectiveIntent.marketplaceTemplateVariant === 'image-dominant-square'

  const archetype = effectiveIntent.structuralArchetype || contract.archetype
  const buildPackingVariants = (): PackingVariant[] => {
      const compactProofSubtitleMode = (mode: MarketplaceRoleMode): MarketplaceRoleMode => ({
        ...mode,
        hideSubtitle: true,
        compactSubtitle: true,
      })
      const baseMode = noImageHeaderPanel
        ? { ...marketplaceRoleModes[0], compactCta: false, minimalLogo: false }
        : marketplaceRoleModes[0]
      const softerMode =
        proofBandTextFirst
          ? compactProofSubtitleMode(marketplaceRoleModes[Math.min(1, marketplaceRoleModes.length - 1)])
          : marketplaceRoleModes[Math.min(1, marketplaceRoleModes.length - 1)]
      const shedMode = marketplaceRoleModes[Math.min(2, marketplaceRoleModes.length - 1)]
      const safeMode = marketplaceRoleModes[Math.min(3, marketplaceRoleModes.length - 1)]
      const variants: PackingVariant[] = [
        {
          id: 'base',
          imageScale:
            noImageHeaderPanel
              ? 1
              : comparisonLockupProductSupport
                ? 1
                : textFirstMarketplaceTemplate
                  ? proofBandTextFirst
                    ? 1.1
                    : 0.96
              : imageDominantProductSupport
                ? 1
                : imageBackedProductSupport
                  ? 0.96
                  : format.category === 'marketplace'
                    ? 0.88
                    : 1,
          ctaAnchors:
            textFirstMarketplaceTemplate && proofBandTextFirst
              ? (['start'] as Array<'start' | 'end'>)
              : (['start', 'end'] as Array<'start' | 'end'>),
          logoAnchors: ['top-left', 'top-right'],
          badgeAnchors: ['top-right', 'top-left'],
          imageShiftBias: noImageHeaderPanel ? 0 : effectiveIntent.imageMode === 'split-right' ? 2 : effectiveIntent.imageMode === 'split-left' ? -2 : 0,
          extraTextInset:
            noImageHeaderPanel
              ? 0
              : textFirstMarketplaceTemplate
                ? 0
              : imageBackedProductSupport
                ? 0
                : format.category === 'marketplace'
                  ? 1
                  : 0,
          roleMode: baseMode,
        },
        {
          id: 'compact-cta-flip',
          imageScale:
            noImageHeaderPanel
              ? 0.96
              : comparisonLockupProductSupport
                ? 0.98
                : textFirstMarketplaceTemplate
                  ? proofBandTextFirst
                    ? 1.06
                    : 0.94
              : imageDominantProductSupport
                ? 0.94
                : imageBackedProductSupport
                  ? 0.9
                  : format.category === 'marketplace'
                    ? 0.82
                    : 0.92,
          ctaAnchors:
            textFirstMarketplaceTemplate && proofBandTextFirst
              ? (['start', 'end'] as Array<'start' | 'end'>)
              : (['end', 'start'] as Array<'start' | 'end'>),
          logoAnchors: ['top-right', 'top-left'],
          badgeAnchors: ['top-left', 'top-right'],
          imageShiftBias: noImageHeaderPanel ? 0 : effectiveIntent.imageMode === 'split-right' ? 3 : -3,
          extraTextInset:
            noImageHeaderPanel
              ? 1
              : textFirstMarketplaceTemplate
                ? 1
              : imageBackedProductSupport
                ? 1
                : format.category === 'marketplace'
                  ? 3
                  : 1,
          roleMode: softerMode,
        },
        {
          id: 'text-safe',
          imageScale:
            noImageHeaderPanel
              ? 0.92
              : comparisonLockupProductSupport
                ? 0.92
                : textFirstMarketplaceTemplate
                  ? proofBandTextFirst
                    ? 1.02
                    : 0.9
              : imageDominantProductSupport
                ? 0.88
                : imageBackedProductSupport
                  ? 0.84
                  : format.category === 'marketplace'
                    ? 0.76
                    : 0.86,
          ctaAnchors:
            textFirstMarketplaceTemplate && proofBandTextFirst
              ? (['start'] as Array<'start' | 'end'>)
              : (['start', 'end'] as Array<'start' | 'end'>),
          logoAnchors: ['top-left', 'bottom-left'],
          badgeAnchors: ['top-right', 'bottom-right'],
          imageShiftBias: noImageHeaderPanel ? 0 : effectiveIntent.imageMode === 'split-left' ? -4 : 4,
          extraTextInset:
            noImageHeaderPanel
              ? 2
              : textFirstMarketplaceTemplate
                ? 2
              : imageBackedProductSupport
                ? 2
                : format.category === 'marketplace'
                  ? 6
                  : 2,
          roleMode: shedMode,
        },
      ]

      if (archetype === 'split-horizontal' || format.family === 'wide' || format.family === 'landscape') {
        variants.push({
          id: 'wide-split-safe',
          imageScale:
            comparisonLockupProductSupport
              ? 0.94
              : imageBackedProductSupport
              ? 0.86
              : format.category === 'marketplace'
                ? 0.74
                : 0.82,
          ctaAnchors: ['end', 'start'] as Array<'start' | 'end'>,
          logoAnchors: ['top-left', 'top-right'],
          badgeAnchors: ['top-right', 'top-left'],
          imageShiftBias: effectiveIntent.imageMode === 'split-left' ? -5 : 5,
          extraTextInset: imageBackedProductSupport ? 2 : format.category === 'marketplace' ? 7 : 2,
          roleMode: safeMode,
        })
      }

      return variants.slice(0, 4)
    }

  const attempts: PackingAttemptResult[] = []
  const variants = buildPackingVariants()

  for (const zoneProfile of zoneProfiles) {
    const headlineRegion = headlineSlot ? anchorRegionWithinZone(zoneProfile.zones.text, headlineSlot, format) : zoneProfile.zones.text
    const subtitleRegion = subtitleSlot ? anchorRegionWithinZone(zoneProfile.zones.text, subtitleSlot, format) : zoneProfile.zones.text
    const ctaRegion = ctaSlot ? anchorRegionWithinZone(zoneProfile.zones.cta, ctaSlot, format) : zoneProfile.zones.cta
    const imageRegion = imageSlot ? anchorRegionWithinZone(zoneProfile.zones.image, imageSlot, format) : zoneProfile.zones.image
    const roleZones: Partial<Record<LayoutBox['kind'], Region>> = {
      image: imageRegion,
      logo: logoSlot ? anchorRegionWithinZone(zoneProfile.zones.logo, logoSlot, format) : zoneProfile.zones.logo,
      badge: badgeSlot ? anchorRegionWithinZone(zoneProfile.zones.badge, badgeSlot, format) : zoneProfile.zones.badge,
      cta: ctaRegion,
    }
    const baseTextRegion = normalizeRegion({
      x: headlineRegion.x,
      y: headlineRegion.y,
      w: Math.max(headlineRegion.w, getMarketplaceTextRegionGuaranteeForIntent(format, effectiveIntent).usableW),
      h: Math.max(
        Math.max(subtitleRegion.y + subtitleRegion.h, headlineRegion.y + headlineRegion.h) - headlineRegion.y,
        getMarketplaceTextRegionGuaranteeForIntent(format, effectiveIntent).usableH
      ),
    })
    const headlineWidth = clamp(
      blocks.find((block) => block.kind === 'headline')?.intrinsicSize.idealW || headlineRegion.w,
      Math.max(pxToPercentX(headlineRule.minW || 0, format), headlineSlot?.minW ? pxToPercentX(headlineSlot.minW, format) : 0),
      Math.min(headlineRegion.w, pxToPercentX(headlineRule.maxW || format.width, format), headlineSlot?.maxW ? pxToPercentX(headlineSlot.maxW, format) : headlineRegion.w)
    )
    const ctaWidth = clamp(
      ctaBlock?.intrinsicSize.idealW || 18,
      Math.max(pxToPercentX(ctaRule.minW || 0, format), ctaSlot?.minW ? pxToPercentX(ctaSlot.minW, format) : 0),
      Math.min(ctaRegion.w, pxToPercentX(ctaRule.maxW || format.width, format), ctaSlot?.maxW ? pxToPercentX(ctaSlot.maxW, format) : ctaRegion.w)
    )
    const ctaHeight = clamp(
      ctaBlock?.intrinsicSize.idealH || 6,
      Math.max(pxToPercentY(ctaRule.minH || 0, format), ctaSlot?.minH ? pxToPercentY(ctaSlot.minH, format) : 0),
      Math.min(ctaRegion.h, pxToPercentY(ctaRule.maxH || format.height, format), ctaSlot?.maxH ? pxToPercentY(ctaSlot.maxH, format) : ctaRegion.h)
    )
    const subtitleWidth = clamp(
      blocks.find((block) => block.kind === 'subtitle')?.intrinsicSize.idealW || subtitleRegion.w,
      Math.max(pxToPercentX(subtitleRule.minW || 0, format), subtitleSlot?.minW ? pxToPercentX(subtitleSlot.minW, format) : 0),
      Math.min(subtitleRegion.w, pxToPercentX(subtitleRule.maxW || format.width, format), subtitleSlot?.maxW ? pxToPercentX(subtitleSlot.maxW, format) : subtitleRegion.w)
    )

    for (const variant of variants) {
      const seeded = applyMarketplaceRoleMode(next, format, variant.roleMode, {
        intent: effectiveIntent,
      })
      seeded.title.w = headlineWidth
      seeded.subtitle.w = variant.roleMode.hideSubtitle && !variant.roleMode.compactSubtitle ? 0 : subtitleWidth
      seeded.subtitle.h = variant.roleMode.hideSubtitle && !variant.roleMode.compactSubtitle ? 0 : seeded.subtitle.h
      seeded.cta.w = variant.roleMode.compactCta && marketplaceRoleContract.enabled ? ctaWidth * marketplaceRoleContract.compactCtaScale : ctaWidth
      seeded.cta.h = variant.roleMode.compactCta && marketplaceRoleContract.enabled ? Math.max(ctaHeight * 0.92, 4.2) : ctaHeight

      const reservations: PackingReservation[] = []
      const logoZone = roleZones.logo || zoneProfile.zones.logo
      const badgeZone = roleZones.badge || zoneProfile.zones.badge

      if (logoBlock && !(marketplaceRoleContract.enabled && variant.roleMode.minimalLogo && variant.roleMode.hideBadge && format.key === 'marketplace-tile')) {
        const logoPlacement = placeRoleReservation({
          kind: 'logo',
          region: logoZone,
          size: (() => {
            const size = getBlockPreferredSize(logoBlock, logoZone, format, ruleSet)
            if (!marketplaceRoleContract.enabled || !variant.roleMode.minimalLogo) return size
            return {
              w: Math.max(size.w * marketplaceRoleContract.logoReserveScale, 6),
              h: Math.max(size.h * marketplaceRoleContract.logoReserveScale, 3),
            }
          })(),
          anchors: variant.logoAnchors,
          reservations,
          format,
          compositionModel,
      })
      if (logoPlacement) {
        seeded.logo.x = logoPlacement.rect.x
        seeded.logo.y = logoPlacement.rect.y
        seeded.logo.w = logoPlacement.rect.w
        seeded.logo.h = logoPlacement.rect.h
        reservations.push({ kind: 'logo', rect: logoPlacement.rect })
      }
    }

      if (badgeBlock && !(marketplaceRoleContract.enabled && variant.roleMode.hideBadge)) {
        const badgePlacement = placeRoleReservation({
          kind: 'badge',
          region: badgeZone,
          size: (() => {
            const size = getBlockPreferredSize(badgeBlock, badgeZone, format, ruleSet)
            if (!marketplaceRoleContract.enabled) return size
            return {
              w: Math.max(size.w * marketplaceRoleContract.badgeReserveScale, 8),
              h: Math.max(size.h * marketplaceRoleContract.badgeReserveScale, 3.4),
            }
          })(),
          anchors: variant.badgeAnchors,
          reservations,
          format,
          compositionModel,
      })
      if (badgePlacement) {
        seeded.badge.x = badgePlacement.rect.x
        seeded.badge.y = badgePlacement.rect.y
        seeded.badge.w = badgePlacement.rect.w
        seeded.badge.h = badgePlacement.rect.h
        reservations.push({ kind: 'badge', rect: badgePlacement.rect })
      }
    }

      const imageCandidates = buildImagePackingCandidates({
        baseRegion: roleZones.image || zoneProfile.zones.image,
        contract,
        variant,
        format,
      })

    let bestVariantAttempt: PackingAttemptResult | null = null

      for (const imageCandidate of imageCandidates) {
      const imageConflict = hasReservationConflict({
        rect: imageCandidate,
        kind: 'image',
        reservations,
        format,
        compositionModel,
      })
      if (imageConflict && imageCandidates.length > 1) continue

      const attemptScene = clone(seeded)
      attemptScene.image.x = imageCandidate.x
      attemptScene.image.y = imageCandidate.y
      attemptScene.image.w = imageCandidate.w
      attemptScene.image.h = imageCandidate.h
      attemptScene.image.rx = format.family === 'wide' ? 22 : format.family === 'skyscraper' ? 18 : 28

      const textRegion = normalizeRegion({
        x: baseTextRegion.x,
        y: baseTextRegion.y,
        w: clamp(baseTextRegion.w + variant.extraTextInset, 18, 100 - baseTextRegion.x),
        h: baseTextRegion.h,
      })
      const effectiveCtaRegion = normalizeRegion({
        x: Math.max(ctaRegion.x, textRegion.x),
        y: ctaRegion.y,
        w: Math.min(ctaRegion.w, textRegion.w),
        h: ctaRegion.h,
      })

      const textFit = fitTextClusterToZones({
        scene: attemptScene,
        format,
        typography,
        ruleSet,
        contract: variant.roleMode.forceTextSafeFallback
          ? {
              ...contract,
              occupancyMode: 'text-safe',
              ctaReservePx: marketplaceRoleContract.enabled
                ? Math.max(contract.ctaReservePx * marketplaceRoleContract.compactCtaReserveScale, 36)
                : contract.ctaReservePx,
            }
          : {
              ...contract,
              ctaReservePx:
                marketplaceRoleContract.enabled && variant.roleMode.compactCta
                  ? Math.max(contract.ctaReservePx * marketplaceRoleContract.compactCtaReserveScale, 36)
                  : contract.ctaReservePx,
            },
        textRegion,
        ctaRegion: effectiveCtaRegion,
        imageRegion: imageCandidate,
        logoRect: seeded.logo.w && seeded.logo.h ? { x: seeded.logo.x, y: seeded.logo.y, w: seeded.logo.w || 0, h: seeded.logo.h || 0 } : undefined,
        badgeRect: seeded.badge.w && seeded.badge.h ? { x: seeded.badge.x, y: seeded.badge.y, w: seeded.badge.w || 0, h: seeded.badge.h || 0 } : undefined,
        compositionModel,
        ctaAnchors: variant.ctaAnchors,
      })

      const candidateReservations = reservations.concat([{ kind: 'image', rect: imageCandidate }])
      if (textFit.ctaRect) candidateReservations.push({ kind: 'cta', rect: textFit.ctaRect })
      if (textFit.headlineRect) candidateReservations.push({ kind: 'headline', rect: textFit.headlineRect })
      if (textFit.subtitleRect) candidateReservations.push({ kind: 'subtitle', rect: textFit.subtitleRect })

        const evaluated = evaluatePackingAttempt({
          scene: textFit.scene,
          format,
          ruleSet,
          compositionModel,
        textFit,
          reservations: candidateReservations,
          textRegion: textFit.textRegion,
          roleZones,
          variantId: `${zoneProfile.id}:${variant.id}:${variant.roleMode.hideSubtitle ? 'nosub' : 'sub'}:${variant.roleMode.hideBadge ? 'nobadge' : 'badge'}:${variant.roleMode.compactCta ? 'compactcta' : 'cta'}:${Math.round(imageCandidate.w * 10)}`,
        })

        if (
          !bestVariantAttempt ||
        evaluated.penalty < bestVariantAttempt.penalty ||
        (evaluated.penalty === bestVariantAttempt.penalty &&
          (evaluated.structuralState.status === 'valid' || evaluated.structuralState.status === 'degraded') &&
          bestVariantAttempt.structuralState.status === 'invalid')
      ) {
        bestVariantAttempt = evaluated
      }

      if (evaluated.success) break
    }

      if (bestVariantAttempt) attempts.push(bestVariantAttempt)
    }
  }

  const selected =
    attempts.sort((a, b) => {
      const statusRank = (value: StructuralLayoutState['status']) => (value === 'valid' ? 0 : value === 'degraded' ? 1 : 2)
      const statusDelta = statusRank(a.structuralState.status) - statusRank(b.structuralState.status)
      if (statusDelta !== 0) return statusDelta
      return a.penalty - b.penalty
    })[0] || {
      scene: next,
      success: false,
      variantId: 'fallback',
      reasons: ['text-fit-failed'] as PackingFailureReason[],
      reservations: [],
      structuralState: evaluateStructuralLayoutState({ scene: next, format, compositionModel }),
      penalty: 999,
    }

  maybeLogPackingAttempt({
    format,
    archetype,
    attempts,
    selected,
  })

  return selected.scene
}

function getBlockWeight(kind: LayoutBlock['kind']) {
  switch (kind) {
    case 'headline':
      return 1.32
    case 'cta':
      return 1.18
    case 'image':
      return 1.12
    case 'badge':
      return 1.08
    case 'logo':
      return 0.54
    default:
      return 0.82
  }
}

function clampElementToModel(scene: Scene, format: FormatDefinition, model: CompositionModel | null | undefined) {
  if (!model) return scene
  const next = clone(scene)
  const applyToElement = (kind: LayoutBlock['kind'], elementKey: keyof Scene) => {
    const slot = findModelSlot(model, kind)
    if (!slot) return
    const zone = getCompositionZoneRegion(model, slot.zoneId, format)
    if (!zone) return
    const anchored = anchorRegionWithinZone(zone, slot, format)
    const element = next[elementKey] as unknown as Record<string, number>
    const currentW = typeof element.w === 'number' ? element.w : anchored.w
    const currentH = typeof element.h === 'number' ? element.h : anchored.h
    const width = clamp(currentW, slot.minW ? pxToPercentX(slot.minW, format) : 0, Math.min(anchored.w, slot.maxW ? pxToPercentX(slot.maxW, format) : anchored.w))
    const height = clamp(currentH, slot.minH ? pxToPercentY(slot.minH, format) : 0, Math.min(anchored.h, slot.maxH ? pxToPercentY(slot.maxH, format) : anchored.h))
    element.w = width
    element.h = height
    element.x = clamp(typeof element.x === 'number' ? element.x : anchored.x, zone.x, zone.x + zone.w - width)
    element.y = clamp(typeof element.y === 'number' ? element.y : anchored.y, zone.y, zone.y + zone.h - height)
  }

  applyToElement('image', 'image')
  applyToElement('logo', 'logo')
  applyToElement('badge', 'badge')
  applyToElement('headline', 'title')
  applyToElement('subtitle', 'subtitle')
  applyToElement('cta', 'cta')
  return next
}

function getHorizontalIntersectionWidth(a: Rect, b: Rect) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
}

function reserveTextRegionFromBlockers(
  region: Region,
  blockers: Rect[],
  minGapY: number,
  minGapX: number
) {
  const next = clone(region)
  for (const blocker of blockers) {
    if (getHorizontalIntersectionWidth(next, blocker) <= 0) continue
    const blockerBottom = blocker.y + blocker.h + minGapY
    if (blocker.y <= next.y + next.h * 0.28 && blockerBottom > next.y) {
      const shrink = blockerBottom - next.y
      next.y += shrink
      next.h = Math.max(next.h - shrink, 8)
    }
    const blockerRight = blocker.x + blocker.w + minGapX
    if (blocker.x <= next.x + next.w * 0.18 && blockerRight > next.x) {
      const shrink = blockerRight - next.x
      next.x += shrink
      next.w = Math.max(next.w - shrink, 16)
    } else if (blocker.x > next.x + next.w * 0.52) {
      next.w = Math.max(blocker.x - minGapX - next.x, 16)
    }
  }
  return normalizeRegion(next)
}

type PackingAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type PackingFailureReason =
  | 'text-fit-failed'
  | 'reservation-conflict'
  | 'spacing-conflict'
  | 'out-of-zone'
  | 'image-pressure'
  | 'safe-area-conflict'

type PackingReservation = {
  kind: LayoutBox['kind']
  rect: Rect
}

type RolePlacementCandidate = {
  anchor: PackingAnchor
  rect: Rect
}

type TextClusterFitResult = {
  scene: Scene
  success: boolean
  reasons: PackingFailureReason[]
  textRegion: Region
  headlineRect?: Rect
  subtitleRect?: Rect
  ctaRect?: Rect
  ctaAnchor?: 'start' | 'end'
}

type PackingAttemptResult = {
  scene: Scene
  success: boolean
  variantId: string
  reasons: PackingFailureReason[]
  reservations: PackingReservation[]
  structuralState: StructuralLayoutState
  penalty: number
}

type PackingVariant = {
  id: string
  imageScale: number
  ctaAnchors: Array<'start' | 'end'>
  logoAnchors: PackingAnchor[]
  badgeAnchors: PackingAnchor[]
  imageShiftBias: number
  extraTextInset: number
  roleMode: MarketplaceRoleMode
}

function regionToRect(region: Region): Rect {
  return { x: region.x, y: region.y, w: region.w, h: region.h }
}

function scorePackingFailure(reason: PackingFailureReason) {
  switch (reason) {
    case 'reservation-conflict':
      return 9
    case 'spacing-conflict':
      return 6
    case 'image-pressure':
      return 5
    case 'safe-area-conflict':
      return 5
    case 'out-of-zone':
      return 4
    case 'text-fit-failed':
      return 8
    default:
      return 3
  }
}

function createUniqueFailureReasons(reasons: PackingFailureReason[]) {
  return Array.from(new Set(reasons))
}

function anchorRectInRegion(region: Region, width: number, height: number, anchor: PackingAnchor): Rect {
  const w = clamp(width, 4, region.w)
  const h = clamp(height, 3, region.h)
  if (anchor === 'top-right') {
    return { x: region.x + region.w - w, y: region.y, w, h }
  }
  if (anchor === 'bottom-left') {
    return { x: region.x, y: region.y + region.h - h, w, h }
  }
  if (anchor === 'bottom-right') {
    return { x: region.x + region.w - w, y: region.y + region.h - h, w, h }
  }
  return { x: region.x, y: region.y, w, h }
}

function getBlockPreferredSize(
  block: LayoutBlock | undefined,
  fallbackRegion: Region,
  format: FormatDefinition,
  ruleSet: FormatRuleSet
) {
  if (!block) {
    return { w: fallbackRegion.w, h: fallbackRegion.h }
  }

  if (block.kind === 'logo' || block.kind === 'badge') {
    return {
      w: clamp(block.intrinsicSize.idealW || fallbackRegion.w, 5, fallbackRegion.w),
      h: clamp(block.intrinsicSize.idealH || fallbackRegion.h, 3, fallbackRegion.h),
    }
  }

  if (block.kind === 'cta') {
    return {
      w: clamp(block.intrinsicSize.idealW || fallbackRegion.w, pxToPercentX(ruleSet.elements.cta.minW || 0, format), fallbackRegion.w),
      h: clamp(block.intrinsicSize.idealH || fallbackRegion.h, pxToPercentY(ruleSet.elements.cta.minH || 0, format), fallbackRegion.h),
    }
  }

  return {
    w: clamp(block.intrinsicSize.idealW || fallbackRegion.w, 8, fallbackRegion.w),
    h: clamp(block.intrinsicSize.idealH || fallbackRegion.h, 4, fallbackRegion.h),
  }
}

function buildRolePlacementCandidates(
  region: Region,
  size: { w: number; h: number },
  anchors: PackingAnchor[]
) {
  const candidates: RolePlacementCandidate[] = []
  for (const anchor of anchors) {
    candidates.push({
      anchor,
      rect: anchorRectInRegion(region, size.w, size.h, anchor),
    })
  }
  return candidates
}

function hasReservationConflict(input: {
  rect: Rect
  kind: LayoutBox['kind']
  reservations: PackingReservation[]
  format: FormatDefinition
  compositionModel?: CompositionModel | null
}) {
  for (const reservation of input.reservations) {
    if (allowsModelOverlap(input.kind, reservation.kind, input.compositionModel)) continue
    if (rectsOverlap(input.rect, reservation.rect).area > 0) return true
    const minGap = getPairGap(input.kind, reservation.kind, input.format)
    if (gapBetweenRects(input.rect, reservation.rect) < minGap) return true
  }
  return false
}

function placeRoleReservation(input: {
  kind: LayoutBox['kind']
  region: Region
  size: { w: number; h: number }
  anchors: PackingAnchor[]
  reservations: PackingReservation[]
  format: FormatDefinition
  compositionModel?: CompositionModel | null
}) {
  const candidates = buildRolePlacementCandidates(input.region, input.size, input.anchors)
  for (const candidate of candidates) {
    if (!containsRect(regionToRect(input.region), candidate.rect)) continue
    if (
      hasReservationConflict({
        rect: candidate.rect,
        kind: input.kind,
        reservations: input.reservations,
        format: input.format,
        compositionModel: input.compositionModel,
      })
    ) {
      continue
    }
    return candidate
  }
  return candidates[0] || null
}

function buildImagePackingCandidates(input: {
  baseRegion: Region
  contract: ArchetypeLayoutContract
  variant: PackingVariant
  format: FormatDefinition
}) {
  const base = normalizeRegion(input.baseRegion)
  const safeShift = clamp(input.variant.imageShiftBias, -6, 6)
  const isPrimarySquare = input.format.key === 'social-square'
  const scale = clamp(input.variant.imageScale, isPrimarySquare ? 0.72 : 0.76, isPrimarySquare ? 0.92 : 1)
  const scaledWidth = clamp(base.w * scale, 16, isPrimarySquare ? Math.min(base.w, 30) : base.w)
  const scaledHeight = clamp(base.h * scale, 14, isPrimarySquare ? Math.min(base.h, 32) : base.h)
  const centeredX = clamp(base.x + (base.w - scaledWidth) / 2, base.x, base.x + base.w - scaledWidth)
  const centeredY = clamp(base.y + (base.h - scaledHeight) / 2, base.y, base.y + base.h - scaledHeight)
  const edgeBiasX = clamp(centeredX + safeShift, base.x, base.x + base.w - scaledWidth)
  const candidates = [
    { x: edgeBiasX, y: centeredY, w: scaledWidth, h: scaledHeight },
    { x: base.x, y: base.y, w: scaledWidth, h: scaledHeight },
    {
      x: clamp(base.x + base.w - scaledWidth, base.x, base.x + base.w - scaledWidth),
      y: centeredY,
      w: scaledWidth,
      h: scaledHeight,
    },
  ].map((candidate) => normalizeRegion(candidate))

  return isPrimarySquare
    ? candidates.map((candidate) => normalizePrimarySquareImageCandidate(candidate, base))
    : candidates
}

function evaluatePackingAttempt(input: {
  scene: Scene
  format: FormatDefinition
  ruleSet: FormatRuleSet
  compositionModel?: CompositionModel | null
  textFit: TextClusterFitResult
  reservations: PackingReservation[]
  textRegion: Region
  roleZones: Partial<Record<LayoutBox['kind'], Region>>
  variantId: string
}) {
  const reasons = [...input.textFit.reasons]
  const safeArea = rectToRegion(input.ruleSet.safeArea, input.format)
  const boxMap = buildSceneLayoutBoxes(input.scene, input.format)
  const collisions = detectBoxCollisions(boxMap.boxes, input.compositionModel)
  const spacingViolations = detectSpacingViolations(boxMap.boxes, 12, input.format, input.compositionModel)
  if (collisions.length > 0) reasons.push('reservation-conflict')
  if (spacingViolations.length > 0) reasons.push('spacing-conflict')
  if (boxMap.boxes.some((box) => !containsRect(safeArea, box.rect))) reasons.push('safe-area-conflict')

  for (const box of boxMap.boxes) {
    const allowedRegion =
      box.kind === 'headline' || box.kind === 'subtitle'
        ? input.textRegion
        : input.roleZones[box.kind]
    if (allowedRegion && !containsRect(regionToRect(allowedRegion), box.rect)) {
      reasons.push('out-of-zone')
    }
  }

  const structuralState = evaluateStructuralLayoutState({
    scene: input.scene,
    format: input.format,
    compositionModel: input.compositionModel,
  })
  const uniqueReasons = createUniqueFailureReasons(reasons)
  const penalty =
    (structuralState.status === 'valid' ? 0 : structuralState.status === 'degraded' ? 16 : 32) +
    uniqueReasons.reduce((sum, reason) => sum + scorePackingFailure(reason), 0) +
    structuralState.findings.reduce(
      (sum, finding) => sum + (finding.severity === 'high' ? 8 : finding.severity === 'medium' ? 4 : 2),
      0
    )

  return {
    scene: input.scene,
    success: input.textFit.success && uniqueReasons.length === 0 && structuralState.status !== 'invalid',
    variantId: input.variantId,
    reasons: uniqueReasons,
    reservations: input.reservations,
    structuralState,
    penalty,
  } satisfies PackingAttemptResult
}

function maybeLogPackingAttempt(input: {
  format: FormatDefinition
  archetype: StructuralArchetype
  attempts: PackingAttemptResult[]
  selected: PackingAttemptResult
}) {
  const debugEnabled =
    typeof import.meta !== 'undefined' &&
    import.meta.env?.DEV &&
    (globalThis as { __LAYOUT_PACK_DEBUG?: boolean }).__LAYOUT_PACK_DEBUG === true

  if (!debugEnabled) return
  console.groupCollapsed(`[layout] packBlocks ${input.format.key} ${input.archetype}`)
  console.table(
    input.attempts.map((attempt) => ({
      variant: attempt.variantId,
      status: attempt.structuralState.status,
      success: attempt.success,
      penalty: attempt.penalty,
      reasons: attempt.reasons.join(', ') || 'ok',
    }))
  )
  console.log('selected', {
    variant: input.selected.variantId,
    status: input.selected.structuralState.status,
    reasons: input.selected.reasons,
  })
  console.groupEnd()
}

type MarketplaceStageGuardMetrics = {
  hotspotScore: number
  penalty: number
  ctaTextGap: number
  textImageGap: number
  imageClusterOverlapArea: number
  roleConflictArea: number
}

function getMarketplaceHotspotScore(state: StructuralLayoutState) {
  let score = 0
  for (const finding of state.findings) {
    if (finding.name === 'major-overlap') score += 18
    else if (finding.name === 'role-placement') score += 12
    else if (finding.name === 'minimum-spacing') score += 10
    else if (finding.name === 'safe-area-compliance') score += 6
    else score += finding.severity === 'high' ? 5 : finding.severity === 'medium' ? 3 : 1
  }
  score += state.metrics.overlapCount * 4
  score += state.metrics.spacingViolationCount * 2
  score += state.metrics.safeAreaViolationCount * 2
  return score
}

function getMarketplaceStageGuardMetrics(scene: Scene, format: FormatDefinition): MarketplaceStageGuardMetrics {
  const state = evaluateStructuralLayoutState({ scene, format })
  const textGeometry = buildSceneTextGeometry(scene, format)
  const textContentBounds = getBounds([
    textGeometry.headline.rect,
    textGeometry.subtitle?.rect || { x: 0, y: 0, w: 0, h: 0 },
  ])
  const ctaRect = { x: scene.cta.x || 0, y: scene.cta.y || 0, w: scene.cta.w || 0, h: scene.cta.h || 0 }
  const imageRect = { x: scene.image.x || 0, y: scene.image.y || 0, w: scene.image.w || 0, h: scene.image.h || 0 }
  const logoRect = { x: scene.logo.x || 0, y: scene.logo.y || 0, w: scene.logo.w || 0, h: scene.logo.h || 0 }
  const badgeRect = { x: scene.badge.x || 0, y: scene.badge.y || 0, w: scene.badge.w || 0, h: scene.badge.h || 0 }
  const ctaTextGap =
    textContentBounds.w > 0 && textContentBounds.h > 0 && ctaRect.w > 0 && ctaRect.h > 0
      ? gapBetweenRects(textContentBounds, ctaRect)
      : 100
  const textImageGap = Math.min(
    textContentBounds.w > 0 && textContentBounds.h > 0 && imageRect.w > 0 && imageRect.h > 0
      ? gapBetweenRects(textContentBounds, imageRect)
      : 100,
    ctaRect.w > 0 && ctaRect.h > 0 && imageRect.w > 0 && imageRect.h > 0
      ? gapBetweenRects(ctaRect, imageRect)
      : 100
  )
  const imageClusterOverlapArea =
    rectsOverlap(textContentBounds, imageRect).area +
    rectsOverlap(ctaRect, imageRect).area
  const roleConflictArea =
    rectsOverlap(textContentBounds, logoRect).area +
    rectsOverlap(textContentBounds, badgeRect).area +
    rectsOverlap(ctaRect, logoRect).area +
    rectsOverlap(ctaRect, badgeRect).area
  const hotspotScore = getMarketplaceHotspotScore(state)
  const penalty =
    hotspotScore * 10 +
    imageClusterOverlapArea * 6 +
    roleConflictArea * 5 +
    Math.max(0, (format.key === 'marketplace-tile' ? 12 : 9) - ctaTextGap) * (format.key === 'marketplace-tile' ? 3 : 2) +
    Math.max(0, 14 - textImageGap) * 2
  return {
    hotspotScore,
    penalty,
    ctaTextGap,
    textImageGap,
    imageClusterOverlapArea,
    roleConflictArea,
  }
}

function getMarketplaceRegressionReasons(
  before: MarketplaceStageGuardMetrics,
  after: MarketplaceStageGuardMetrics,
  format: FormatDefinition
) {
  const reasons: string[] = []
  if (after.hotspotScore > before.hotspotScore) reasons.push('hotspot-score')
  if (after.imageClusterOverlapArea > before.imageClusterOverlapArea + 0.01) reasons.push('image-cluster-overlap')
  if (after.roleConflictArea > before.roleConflictArea + 0.01) reasons.push('role-conflict')
  if (format.key === 'marketplace-tile' && after.ctaTextGap + 0.5 < before.ctaTextGap) reasons.push('cta-spacing')
  if (after.textImageGap + 0.5 < before.textImageGap && after.imageClusterOverlapArea >= before.imageClusterOverlapArea) {
    reasons.push('text-image-gap')
  }
  return reasons
}

function logMarketplaceStageGuard(input: {
  stage: 'refine' | 'constraints'
  format: FormatDefinition
  action: string
  before: MarketplaceStageGuardMetrics
  after: MarketplaceStageGuardMetrics
  reasons?: string[]
}) {
  const debugEnabled =
    typeof import.meta !== 'undefined' &&
    import.meta.env?.DEV &&
    (globalThis as { __MARKETPLACE_STAGE_GUARD_DEBUG?: boolean }).__MARKETPLACE_STAGE_GUARD_DEBUG === true
  if (!debugEnabled) return
  console.debug(`[layout] marketplace-${input.stage}`, {
    format: input.format.key,
    action: input.action,
    beforePenalty: Number(input.before.penalty.toFixed(2)),
    afterPenalty: Number(input.after.penalty.toFixed(2)),
    beforeHotspot: input.before.hotspotScore,
    afterHotspot: input.after.hotspotScore,
    reasons: input.reasons || [],
  })
}

function fitTextClusterToZones(input: {
  scene: Scene
  format: FormatDefinition
  typography: TypographyPlan
  ruleSet: FormatRuleSet
  contract: ArchetypeLayoutContract
  textRegion: Region
  ctaRegion: Region
  imageRegion: Region
  logoRect?: Rect
  badgeRect?: Rect
  compositionModel?: CompositionModel | null
  ctaAnchors?: Array<'start' | 'end'>
}) {
  const next = clone(input.scene)
  const isPrimarySquareFormat = input.format.key === 'social-square'
  const isPrimaryBaselineFormat =
    isPrimarySquareFormat ||
    input.format.key === 'social-portrait' ||
    input.format.key === 'social-landscape' ||
    input.format.key === 'display-large-rect'
  const isPrimaryRecoveryFormat =
    isPrimarySquareFormat ||
    input.format.key === 'social-portrait' ||
    input.format.key === 'social-landscape'
  const headlineRule = input.ruleSet.typography.headline
  const subtitleRule = input.ruleSet.typography.subtitle
  const clusterGap = pxToPercentY(input.contract.clusterGapPx, input.format)
  const squareImageGapBoost = isPrimarySquareFormat ? 6 : 0
  const squareCtaReserveBoost = isPrimarySquareFormat ? 10 : 0
  const imageGap = pxToPercentX(
    input.contract.textToImageGapPx +
      squareImageGapBoost +
      (isPrimaryBaselineFormat ? 2 : 0) +
      (isPrimaryRecoveryFormat ? 2 : 0),
    input.format
  )
  const topReserve = pxToPercentY(input.contract.topReservePx, input.format)
  const ctaReserve = Math.max(
    pxToPercentY(
      input.contract.ctaReservePx +
        squareCtaReserveBoost +
        (isPrimaryBaselineFormat ? 4 : 0) +
        (isPrimaryRecoveryFormat ? 4 : 0),
      input.format
    ),
    (next.cta.h || 0) +
      clusterGap +
      (isPrimarySquareFormat ? 3.5 : isPrimaryBaselineFormat ? 2.5 : 2) +
      (isPrimaryRecoveryFormat ? 1.5 : 0)
  )
  const blockers = [input.logoRect, input.badgeRect].filter((item): item is Rect => Boolean(item && item.w > 0 && item.h > 0))
  const ctaAnchors: Array<'start' | 'end'> = isPrimarySquareFormat
    ? input.ctaAnchors?.length
      ? input.ctaAnchors
      : ['start', 'end']
    : input.ctaAnchors?.length
      ? input.ctaAnchors
      : ['start', 'end']
  let workingTextRegion = reserveTextRegionFromBlockers(
    {
      x: input.textRegion.x,
      y: input.textRegion.y + Math.min(topReserve, input.textRegion.h * 0.22),
      w: input.textRegion.w,
      h: Math.max(input.textRegion.h - Math.min(topReserve, input.textRegion.h * 0.22), 8),
    },
    blockers,
    clusterGap,
    pxToPercentX(10, input.format)
  )

  if (
    !allowsModelOverlap('headline', 'image', input.compositionModel) &&
    rectsOverlap(workingTextRegion, input.imageRegion).area > 0
  ) {
    const separation = pxToPercentX(input.contract.textToImageGapPx, input.format)
    if (input.imageRegion.x >= workingTextRegion.x) {
      workingTextRegion.w = Math.max(input.imageRegion.x - separation - workingTextRegion.x, 18)
    } else {
      const nextX = input.imageRegion.x + input.imageRegion.w + separation
      const delta = nextX - workingTextRegion.x
      workingTextRegion.x = nextX
      workingTextRegion.w = Math.max(workingTextRegion.w - delta, 18)
    }
    workingTextRegion = normalizeRegion(workingTextRegion)
  }

  let titleFont = next.title.fontSize || input.typography.titleSize
  let subtitleFont = next.subtitle.fontSize || input.typography.subtitleSize
  let titleChars = next.title.charsPerLine || input.typography.titleCharsPerLine
  let subtitleChars = next.subtitle.charsPerLine || input.typography.subtitleCharsPerLine
  let titleMaxLines = Math.min(next.title.maxLines || input.typography.titleMaxLines, input.contract.headlineMaxLines)
  let subtitleMaxLines = Math.min(
    next.subtitle.maxLines || input.typography.subtitleMaxLines,
    Math.max(
      1,
      input.contract.subtitleMaxLines -
        (isPrimarySquareFormat ? 1 : 0) -
        (isPrimaryBaselineFormat ? 1 : 0) -
        (isPrimaryRecoveryFormat ? 1 : 0)
    )
  )
  let headlineBox = null as ReturnType<typeof fitSceneTextToRule> | null
  let subtitleBox = null as ReturnType<typeof fitSceneTextToRule> | null
  let ctaY = input.ctaRegion.y
  let ctaX = input.ctaRegion.x
  let ctaAnchor: 'start' | 'end' = ctaAnchors[0]
  const ctaWidth = clamp(next.cta.w || 18, 12, input.ctaRegion.w)
  const ctaHeight = clamp(next.cta.h || 6, 4, Math.max(input.ctaRegion.h, 5))
  let success = false
  const reasons: PackingFailureReason[] = []

  for (let guard = 0; guard < 8; guard += 1) {
    const titleAvailableHeight = Math.max(8, workingTextRegion.h - ctaReserve)
    headlineBox = fitSceneTextToRule({
      role: 'headline',
      text: next.title.text || '',
      x: workingTextRegion.x,
      y: workingTextRegion.y + pxToPercentY(titleFont, input.format),
      width: workingTextRegion.w,
      availableHeight: titleAvailableHeight,
      format: input.format,
      rule: headlineRule,
      preferredFontSize: titleFont,
      preferredCharsPerLine: titleChars,
      preferredMaxLines: titleMaxLines,
      lineHeight: input.typography.lineHeightTitle,
      anchorMode: 'baseline-left',
    })

    const subtitleTop = headlineBox.rect.y + headlineBox.rect.h + clusterGap
    const subtitleAvailableHeight = Math.max(6, workingTextRegion.y + workingTextRegion.h - ctaReserve - subtitleTop)
    subtitleBox = fitSceneTextToRule({
      role: 'subtitle',
      text: next.subtitle.text || '',
      x: workingTextRegion.x,
      y: subtitleTop + pxToPercentY(subtitleFont, input.format),
      width: workingTextRegion.w,
      availableHeight: subtitleAvailableHeight,
      format: input.format,
      rule: subtitleRule,
      preferredFontSize: subtitleFont,
      preferredCharsPerLine: subtitleChars,
      preferredMaxLines: subtitleMaxLines,
      lineHeight: input.typography.lineHeightSubtitle,
      anchorMode: 'baseline-left',
      measurementHint: next.subtitle.measurementHint,
    })

    const subtitleHasBody = Boolean((next.subtitle.text || '').trim())
    const messageBottom = subtitleHasBody
      ? subtitleBox.rect.y + subtitleBox.rect.h
      : headlineBox.rect.y + headlineBox.rect.h
    const messageCtaGap =
      clusterGap + (subtitleHasBody ? pxToPercentY(2, input.format) : pxToPercentY(5, input.format))
    const preferredCtaYFromMessage = messageBottom + messageCtaGap
    const preferredCtaY = isPrimarySquareFormat
      ? clamp(
          preferredCtaYFromMessage,
          input.ctaRegion.y,
          input.ctaRegion.y + input.ctaRegion.h - ctaHeight
        )
      : clamp(
          subtitleBox.rect.y + subtitleBox.rect.h + clusterGap,
          input.ctaRegion.y,
          input.ctaRegion.y + input.ctaRegion.h - ctaHeight
        )

    let chosenCtaRect: Rect | null = null
    let chosenAnchor: 'start' | 'end' = ctaAnchors[0]
    for (const anchor of ctaAnchors) {
      const candidateX =
        anchor === 'end'
          ? clamp(
              Math.min(workingTextRegion.x + workingTextRegion.w - ctaWidth, input.ctaRegion.x + input.ctaRegion.w - ctaWidth),
              input.ctaRegion.x,
              input.ctaRegion.x + input.ctaRegion.w - ctaWidth
            )
          : clamp(workingTextRegion.x, input.ctaRegion.x, input.ctaRegion.x + input.ctaRegion.w - ctaWidth)
      const candidateRect = { x: candidateX, y: preferredCtaY, w: ctaWidth, h: ctaHeight }
      const blockerConflict = blockers.some(
        (blocker) => rectsOverlap(candidateRect, blocker).area > 0 || gapBetweenRects(candidateRect, blocker) < clusterGap
      )
      const imageConflict =
        rectsOverlap(candidateRect, input.imageRegion).area > 0 || gapBetweenRects(candidateRect, input.imageRegion) < imageGap
      if (!blockerConflict && !imageConflict && containsRect(regionToRect(input.ctaRegion), candidateRect)) {
        chosenCtaRect = candidateRect
        chosenAnchor = anchor
        break
      }
    }

    if (!chosenCtaRect) {
      reasons.push('reservation-conflict')
      chosenCtaRect = {
        x: clamp(workingTextRegion.x, input.ctaRegion.x, input.ctaRegion.x + input.ctaRegion.w - ctaWidth),
        y: isPrimarySquareFormat
          ? clamp(preferredCtaY, input.ctaRegion.y, input.ctaRegion.y + input.ctaRegion.h - ctaHeight)
          : isPrimaryBaselineFormat
            ? clamp(
                input.ctaRegion.y + input.ctaRegion.h - ctaHeight,
                input.ctaRegion.y,
                input.ctaRegion.y + input.ctaRegion.h - ctaHeight
              )
            : preferredCtaY,
        w: ctaWidth,
        h: ctaHeight,
      }
    }

    ctaX = chosenCtaRect.x
    ctaY = chosenCtaRect.y
    ctaAnchor = chosenAnchor

    const clusterBottom = Math.max(subtitleBox.rect.y + subtitleBox.rect.h, chosenCtaRect.y + chosenCtaRect.h)
    const fitsVertical = clusterBottom <= workingTextRegion.y + workingTextRegion.h + 0.5
    const fitsHeadlineLines = headlineBox.lineCount <= input.contract.headlineMaxLines
    const fitsSubtitleLines = subtitleBox.lineCount <= input.contract.subtitleMaxLines
    const imageSeparated =
      allowsModelOverlap('headline', 'image', input.compositionModel) ||
      (rectsOverlap(headlineBox.rect, input.imageRegion).area <= 0 &&
        gapBetweenRects(headlineBox.rect, input.imageRegion) >= imageGap)
    const subtitleSeparated =
      allowsModelOverlap('subtitle', 'image', input.compositionModel) ||
      (rectsOverlap(subtitleBox.rect, input.imageRegion).area <= 0 &&
        gapBetweenRects(subtitleBox.rect, input.imageRegion) >= imageGap)
    const ctaSeparated =
      rectsOverlap(chosenCtaRect, input.imageRegion).area <= 0 &&
      gapBetweenRects(chosenCtaRect, input.imageRegion) >= imageGap
    const ctaContained = containsRect(regionToRect(input.ctaRegion), chosenCtaRect)
    const textContained =
      containsRect(regionToRect(workingTextRegion), headlineBox.rect) &&
      containsRect(regionToRect(workingTextRegion), subtitleBox.rect)

    if (fitsVertical && fitsHeadlineLines && fitsSubtitleLines && imageSeparated && subtitleSeparated && ctaSeparated && ctaContained && textContained) {
      success = true
      break
    }

    if (!fitsVertical || !textContained || !ctaContained) reasons.push('text-fit-failed')
    if (!imageSeparated || !subtitleSeparated || !ctaSeparated) reasons.push('image-pressure')

    if (titleFont > headlineRule.minFontSize) titleFont -= 2
    else if (titleChars < 40) titleChars += 2
    else if (titleMaxLines < input.contract.headlineMaxLines) titleMaxLines += 1

    if (isPrimarySquareFormat && subtitleMaxLines > 1) subtitleMaxLines -= 1
    else if (isPrimaryBaselineFormat && subtitleMaxLines > 1) subtitleMaxLines -= 1
    else if (subtitleFont > subtitleRule.minFontSize) subtitleFont -= 1
    else if (subtitleChars < 44) subtitleChars += 2
    else if (subtitleMaxLines < input.contract.subtitleMaxLines) subtitleMaxLines += 1

    if (!imageSeparated || !subtitleSeparated || !ctaSeparated) {
      if (input.imageRegion.x >= workingTextRegion.x + workingTextRegion.w * 0.5) {
        workingTextRegion.w = Math.max(input.imageRegion.x - imageGap - workingTextRegion.x, 18)
      } else {
        const shiftedX = input.imageRegion.x + input.imageRegion.w + imageGap
        const widthDelta = shiftedX - workingTextRegion.x
        workingTextRegion.x = shiftedX
        workingTextRegion.w = Math.max(workingTextRegion.w - widthDelta, 18)
      }
      workingTextRegion = normalizeRegion(workingTextRegion)
    }

    if (!fitsVertical && workingTextRegion.h < input.textRegion.h) {
      workingTextRegion.h = clamp(workingTextRegion.h + 2, workingTextRegion.h, input.textRegion.h)
    }
  }

  if (headlineBox) Object.assign(next.title, applyTextBoxToSceneElement(next.title, clampTextBoxToRegion(headlineBox, workingTextRegion, input.format), input.format))
  if (subtitleBox) {
    Object.assign(
      next.subtitle,
      applyTextBoxToSceneElement(
        next.subtitle,
        clampTextBoxToRegion(subtitleBox, { ...workingTextRegion, y: headlineBox ? headlineBox.rect.y + headlineBox.rect.h + clusterGap : workingTextRegion.y }, input.format),
        input.format
      )
    )
  }
  next.cta.x = ctaX
  next.cta.y = ctaY
  next.cta.w = ctaWidth
  next.cta.h = ctaHeight

  if (!success) reasons.push('text-fit-failed')

  return {
    scene: next,
    success,
    reasons: createUniqueFailureReasons(reasons),
    textRegion: workingTextRegion,
    headlineRect: headlineBox?.rect,
    subtitleRect: subtitleBox?.rect,
    ctaRect: { x: ctaX, y: ctaY, w: ctaWidth, h: ctaHeight },
    ctaAnchor,
  } satisfies TextClusterFitResult
}

function getSceneWeights(scene: Scene) {
  const textGeometry = buildSceneTextGeometry(scene, {
    key: 'social-square',
    name: 'Scene geometry',
    width: 100,
    height: 100,
    label: 'Scene geometry',
    category: 'social',
    family: 'square',
    packTags: ['promo-pack'],
    scopeStage: 'legacy',
    primaryGenerationMode: 'legacy-freeform',
  })
  const items = [
    { kind: 'image', x: scene.image.x || 0, y: scene.image.y || 0, w: scene.image.w || 0, h: scene.image.h || 0 },
    { kind: 'headline', x: textGeometry.headline.rect.x, y: textGeometry.headline.rect.y, w: textGeometry.headline.rect.w, h: textGeometry.headline.rect.h },
    { kind: 'subtitle', x: textGeometry.subtitle?.rect.x || 0, y: textGeometry.subtitle?.rect.y || 0, w: textGeometry.subtitle?.rect.w || 0, h: textGeometry.subtitle?.rect.h || 0 },
    { kind: 'cta', x: scene.cta.x || 0, y: scene.cta.y || 0, w: scene.cta.w || 0, h: scene.cta.h || 0 },
    { kind: 'badge', x: scene.badge.x || 0, y: scene.badge.y || 0, w: scene.badge.w || 0, h: scene.badge.h || 0 },
    { kind: 'logo', x: scene.logo.x || 0, y: scene.logo.y || 0, w: scene.logo.w || 0, h: scene.logo.h || 0 },
  ]

  let total = 0
  let centerX = 0
  let centerY = 0
  for (const item of items) {
    const weight = item.w * item.h * getBlockWeight(item.kind as LayoutBlock['kind'])
    total += weight
    centerX += (item.x + item.w / 2) * weight
    centerY += (item.y + item.h / 2) * weight
  }

  return total
    ? { x: centerX / total, y: centerY / total, total }
    : { x: 50, y: 50, total: 1 }
}

function scoreSquareSafeOverlayRect(
  rect: Region,
  safeAreas: EnhancedImageAnalysis['safeTextAreas'],
  safeTextScoreMin: number
) {
  const totalArea = Math.max(regionArea(rect), 0.0001)
  let weightedScore = 0
  let safeCoverage = 0
  for (const area of safeAreas || []) {
    const hit = getRegionIntersection(rect, { x: area.x, y: area.y, w: area.w, h: area.h })
    if (!hit) continue
    const hitArea = regionArea(hit)
    weightedScore += area.score * hitArea
    if (area.score >= safeTextScoreMin) safeCoverage += hitArea
  }
  return {
    safeScore: weightedScore / totalArea,
    safeCoverage: safeCoverage / totalArea,
  }
}

function findBestSquareOverlaySafePlacement(input: {
  scene: Scene
  format: FormatDefinition
  imageAnalysis?: EnhancedImageAnalysis
  insets: { x: number; y: number }
}) {
  if (input.format.key !== 'social-square' || !input.imageAnalysis?.safeTextAreas?.length) return null
  const policy = getOverlaySafetyPolicy(input.format, { id: 'square-hero-overlay' })
  const baseTitleHeight =
    ((input.scene.title.fontSize || 32) *
      estimateLines(input.scene.title.text, input.scene.title.charsPerLine, input.scene.title.maxLines) *
      1.08) /
    input.format.height *
    100
  const baseSubtitleHeight =
    ((input.scene.subtitle.fontSize || 16) *
      estimateLines(input.scene.subtitle.text, input.scene.subtitle.charsPerLine, input.scene.subtitle.maxLines) *
      1.2) /
    input.format.height *
    100
  const ctaHeight = Math.max(input.scene.cta.h || 7, 6)
  const hasSubtitle = Boolean(input.scene.subtitle.text)
  const baseTitleWidth = clamp(input.scene.title.w || 56, 42, 66)
  const baseSubtitleWidth = clamp(input.scene.subtitle.w || 52, 40, 62)
  const candidateAreas = [...input.imageAnalysis.safeTextAreas]
    .filter((area) => area.score >= policy.safeTextScoreMin - 0.05)
    .map((area) => {
      const lowerBandBonus = area.y >= 52 && area.y <= 74 ? 0.18 : 0
      const leftBiasBonus = area.x <= 18 ? 0.12 : area.x <= 26 ? 0.06 : 0
      const compactBonus = area.w <= 44 ? 0.08 : 0
      return { area, seedScore: area.score + lowerBandBonus + leftBiasBonus + compactBonus }
    })
    .sort((left, right) => right.seedScore - left.seedScore)
    .slice(0, 8)

  let best: {
    titleX: number
    titleY: number
    titleWidth: number
    subtitleY: number
    subtitleWidth: number
    ctaY: number
    rank: number
  } | null = null

  for (const candidate of candidateAreas) {
    const area = candidate.area
    for (const titleWidthScale of [1, 0.94, 0.88, 0.82, 0.76]) {
      const titleWidth = clamp(baseTitleWidth * titleWidthScale, 36, 64)
      for (const subtitleWidthScale of [1, 0.92, 0.84, 0.76, 0.7]) {
        const subtitleWidth = clamp(baseSubtitleWidth * subtitleWidthScale, 32, 58)
        for (const titleHeightScale of [1, 0.94, 0.88]) {
          const titleHeight = Math.max(baseTitleHeight * titleHeightScale, 6.5)
          for (const subtitleHeightScale of [1, 0.9, 0.8, 0.72]) {
            const subtitleHeight = hasSubtitle ? Math.max(baseSubtitleHeight * subtitleHeightScale, 3.4) : 0
            for (const clusterGap of [1.4, 1.1, 0.9]) {
              const clusterHeight =
                titleHeight + (hasSubtitle ? subtitleHeight + clusterGap : 0) + ctaHeight + clusterGap * 2
              if (area.w < Math.max(titleWidth, subtitleWidth) - 1.5 || area.h < clusterHeight - 2.5) continue

              for (const xPad of [1.2, 1.8, 2.6]) {
                const titleX = clamp(area.x + xPad, input.insets.x, Math.min(18, area.x + Math.max(area.w - titleWidth, 0)))
                for (const yPad of [2.4, 3.2, 4]) {
                  const maxTitleY = Math.min(72, area.y + Math.max(area.h - clusterHeight, 0) + 2)
                  const titleY = clamp(Math.max(area.y + yPad, 52), 50, Math.max(50, maxTitleY))
                  const subtitleY = clamp(
                    titleY + titleHeight + clusterGap,
                    titleY + 6.5,
                    Math.min(84, area.y + Math.max(area.h - subtitleHeight - ctaHeight - clusterGap * 1.5, 0))
                  )
                  const ctaY = clamp(
                    subtitleY + (hasSubtitle ? subtitleHeight + clusterGap : 4) + clusterGap,
                    subtitleY + 5.5,
                    92 - ctaHeight
                  )

                  const titleRect = { x: titleX, y: titleY, w: titleWidth, h: titleHeight }
                  const subtitleRect = hasSubtitle
                    ? { x: titleX, y: subtitleY, w: subtitleWidth, h: subtitleHeight }
                    : null
                  const titleMetrics = scoreSquareSafeOverlayRect(titleRect, input.imageAnalysis.safeTextAreas, policy.safeTextScoreMin)
                  const subtitleMetrics = subtitleRect
                    ? scoreSquareSafeOverlayRect(subtitleRect, input.imageAnalysis.safeTextAreas, policy.safeTextScoreMin)
                    : { safeScore: 1, safeCoverage: 1 }
                  const combinedSafeScore =
                    subtitleRect && regionArea(subtitleRect)
                      ? (titleMetrics.safeScore * regionArea(titleRect) + subtitleMetrics.safeScore * regionArea(subtitleRect)) /
                        Math.max(regionArea(titleRect) + regionArea(subtitleRect), 0.0001)
                      : titleMetrics.safeScore
                  const combinedSafeCoverage =
                    subtitleRect && regionArea(subtitleRect)
                      ? (titleMetrics.safeCoverage * regionArea(titleRect) +
                          subtitleMetrics.safeCoverage * regionArea(subtitleRect)) /
                        Math.max(regionArea(titleRect) + regionArea(subtitleRect), 0.0001)
                      : titleMetrics.safeCoverage
                  const nearMissBonus = combinedSafeScore >= policy.safeTextScoreMin - 0.015 ? 0.22 : 0
                  const coverageBonus = combinedSafeCoverage >= Math.max(policy.safeCoverageMin - 0.08, 0.62) ? 0.16 : 0
                  const compactPenalty = titleWidthScale < 0.8 ? 0.04 : 0
                  const subtitlePenalty = subtitleWidthScale < 0.74 ? 0.03 : 0
                  const rank =
                    candidate.seedScore +
                    combinedSafeScore * 1.1 +
                    combinedSafeCoverage * 0.75 +
                    nearMissBonus +
                    coverageBonus -
                    compactPenalty -
                    subtitlePenalty

                  if (!best || rank > best.rank) {
                    best = {
                      titleX,
                      titleY,
                      titleWidth,
                      subtitleY,
                      subtitleWidth,
                      ctaY,
                      rank,
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (!best) return null
  return {
    titleX: best.titleX,
    titleY: best.titleY,
    titleWidth: best.titleWidth,
    subtitleY: best.subtitleY,
    subtitleWidth: best.subtitleWidth,
    ctaY: best.ctaY,
  }
}

function refineLayout({
  scene,
  intent,
  format,
  profile,
  brandKit,
  assetHint,
  imageAnalysis,
}: {
  scene: Scene
  intent: LayoutIntent
  format: FormatDefinition
  profile: ContentProfile
  brandKit: BrandKit
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const next = clone(scene)
  const insets = getSafeInsets(format, brandKit.safeZone)
  const socialSquareRelaxedCtaY = (subtitleTailGap: number, legacyLow: number, legacyHigh: number) =>
    format.key === 'social-square'
      ? clamp(
          Math.max(next.cta.y || 0, (next.subtitle.y || 0) + subtitleTailGap),
          52,
          92 - (next.cta.h || 6)
        )
      : clamp(Math.max(next.cta.y || 0, (next.subtitle.y || 0) + subtitleTailGap), legacyLow, legacyHigh)
  const weights = getSceneWeights(next)
  const textGeometry = buildSceneTextGeometry(next, format)
  const textBottom = Math.max(
    (next.cta.y || 0) + (next.cta.h || 0),
    textGeometry.subtitle ? textGeometry.subtitle.rect.y + textGeometry.subtitle.rect.h : 0,
    textGeometry.headline.rect.y + textGeometry.headline.rect.h
  )
  const imageGap =
    (next.image.x || 0) > (next.title.x || 0)
      ? (next.image.x || 0) - ((next.title.x || 0) + (next.title.w || 0))
      : (next.title.x || 0) - ((next.image.x || 0) + (next.image.w || 0))

  if ((isBillboardFamily(intent) || intent.family === 'landscape-balanced-split' || intent.family === 'landscape-image-dominant') && imageGap > 16) {
    next.image.x = clamp((next.image.x || 0) - Math.min(imageGap - 12, 7), 48, 82)
    next.image.w = clamp((next.image.w || 0) + 2, 28, 42)
  }

  if ((intent.family === 'portrait-hero-overlay' || intent.family === 'portrait-bottom-card' || intent.family === 'skyscraper-image-top-text-stack') && (next.title.y || 0) > 60) {
    const shift = Math.min((next.title.y || 0) - 56, 5)
    next.title.y -= shift
    next.subtitle.y -= shift
    next.cta.y -= shift
  }

  if (weights.x < 44 && isBillboardFamily(intent)) {
    next.image.w = clamp((next.image.w || 0) + 2, 28, 44)
    next.image.x = clamp(100 - insets.x - (next.image.w || 0), 48, 82)
  }

  if (weights.y > 58 && (intent.family === 'portrait-hero-overlay' || intent.family === 'portrait-bottom-card' || intent.family === 'skyscraper-image-top-text-stack' || format.family === 'portrait')) {
    next.title.y = clamp((next.title.y || 0) - 3, 46, 60)
    next.subtitle.y = clamp((next.subtitle.y || 0) - 3, 54, 74)
    next.cta.y = clamp((next.cta.y || 0) - 3, 62, 88)
  }

  if (profile.needsStrongCTA) {
    next.cta.w = clamp((next.cta.w || 0) + 2, format.family === 'wide' ? 14 : 18, format.family === 'skyscraper' ? 54 : 38)
  }

  if (profile.needsOfferDominance) {
    next.badge.w = clamp((next.badge.w || 0) + 2, 12, format.family === 'skyscraper' ? 36 : 30)
    if (format.family === 'wide' || format.family === 'landscape') {
      next.badge.x = next.title.x || insets.x
      next.badge.y = clamp((next.title.y || 20) - (format.family === 'wide' ? 12 : 10), insets.y, 24)
    }
  }

  if (intent.textMode === 'overlay' && imageAnalysis?.safeTextAreas?.length) {
    const squarePlacement = isSquareFamily(intent)
      ? findBestSquareOverlaySafePlacement({ scene: next, format, imageAnalysis, insets })
      : null
    if (squarePlacement) {
      next.title.x = squarePlacement.titleX
      next.title.y = squarePlacement.titleY
      next.title.w = squarePlacement.titleWidth
      next.subtitle.x = next.title.x
      next.subtitle.y = squarePlacement.subtitleY
      next.subtitle.w = squarePlacement.subtitleWidth
      next.cta.x = next.title.x
      next.cta.y = squarePlacement.ctaY
    } else {
      const best = imageAnalysis.safeTextAreas[0]
      if (best && best.score > 0.58 && best.y < 60) {
        next.title.x = clamp(best.x + 2, insets.x, 18)
        next.title.y = clamp(Math.max(best.y + 6, 50), 48, 62)
        next.subtitle.x = next.title.x
        next.cta.x = next.title.x
      }
    }
  }

  if (intent.family === 'square-hero-overlay' && isNoImageMarketplaceCardLayout({ format, assetHint, imageAnalysis })) {
    next.image.x = clamp(next.image.x || 0, insets.x + 1, 12)
    next.image.y = clamp(next.image.y || 0, 10, 14)
    next.image.w = clamp(next.image.w || 0, 82, 88)
    next.image.h = clamp(next.image.h || 0, 30, 36)
    next.title.x = clamp(next.title.x || 0, insets.x + 2, 16)
    next.title.y = clamp(next.title.y || 0, 44, 50)
    next.title.w = clamp(next.title.w || 0, 64, 78)
    next.subtitle.x = next.title.x
    next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, next.title.y + 9), 54, 66)
    next.subtitle.w = clamp(next.subtitle.w || 0, 58, 74)
    next.cta.x = next.title.x
    next.cta.w = clamp(next.cta.w || 0, 18, 24)
    next.cta.h = clamp(next.cta.h || 0, 4.8, 5.8)
    next.cta.y = socialSquareRelaxedCtaY(7, 80, 84)
    next.logo.x = clamp(next.logo.x || 0, insets.x, 12)
    next.logo.y = clamp(next.logo.y || 0, insets.y, 10)
    next.badge.x = clamp(next.badge.x || 0, 68, 80)
    next.badge.y = clamp(next.badge.y || 0, insets.y + 2, 14)
  }

  if (intent.family === 'square-image-top-text-bottom') {
    if (isNoImageMarketplaceCardLayout({ format, assetHint, imageAnalysis })) {
      if (intent.marketplaceTemplateId === 'text-first-promo') {
        const proofBand = intent.marketplaceTemplateVariant === 'proof-band'
        next.image.x = clamp(next.image.x || 0, insets.x + 1, 10)
        next.image.y = clamp(next.image.y || 0, 10, 12)
        next.image.w = clamp(next.image.w || 0, proofBand ? 72 : 66, 84)
        next.image.h = clamp(next.image.h || 0, proofBand ? 12 : 14, proofBand ? 16 : 18)
        next.title.x = clamp(next.title.x || 0, insets.x + 1, 12)
        next.title.y = clamp(next.title.y || 0, 32, 40)
        next.title.w = clamp(next.title.w || 0, 54, 66)
        next.subtitle.x = next.title.x
        next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, next.title.y + 8), 44, 56)
        next.subtitle.w = clamp(next.subtitle.w || 0, 50, 62)
        next.cta.x = next.title.x
        next.cta.w = clamp(next.cta.w || 0, 20, 24)
        next.cta.y = socialSquareRelaxedCtaY(6, 64, 72)
      } else {
        next.image.x = clamp(next.image.x || 0, insets.x + 1, 12)
        next.image.y = clamp(next.image.y || 0, 10, 14)
        next.image.w = clamp(next.image.w || 0, 76, 84)
        next.image.h = clamp(next.image.h || 0, 22, 30)
        next.title.x = clamp(next.title.x || 0, insets.x + 2, 16)
        next.title.y = clamp(next.title.y || 0, 52, 60)
        next.title.w = clamp(next.title.w || 0, 62, 78)
        next.subtitle.x = next.title.x
        next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, next.title.y + 10), 62, 74)
        next.subtitle.w = clamp(next.subtitle.w || 0, 56, 74)
        next.cta.x = next.title.x
        next.cta.w = clamp(next.cta.w || 0, 22, 30)
        next.cta.y = socialSquareRelaxedCtaY(7, 78, 86)
      }
      next.logo.x = clamp(next.logo.x || 0, insets.x, 12)
      next.logo.y = clamp(next.logo.y || 0, insets.y, 10)
      next.badge.x = clamp(next.badge.x || 0, 68, 80)
      next.badge.y = clamp(next.badge.y || 0, insets.y + 2, 14)
    } else {
      if (intent.marketplaceTemplateId === 'product-support-card') {
        if (intent.marketplaceTemplateVariant === 'image-dominant-square') {
          next.image.x = clamp(next.image.x || 0, 44, 50)
          next.image.y = clamp(next.image.y || 0, 10, 14)
          next.image.w = clamp(next.image.w || 0, 42, 48)
          next.image.h = clamp(next.image.h || 0, 40, 48)
          next.title.x = clamp(next.title.x || 0, insets.x + 1, 12)
          next.title.y = clamp(next.title.y || 0, 56, 62)
          next.title.w = clamp(next.title.w || 0, 34, 42)
          next.subtitle.x = next.title.x
          next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, next.title.y + 9), 66, 74)
          next.subtitle.w = clamp(next.subtitle.w || 0, 32, 40)
          next.cta.x = next.title.x
          next.cta.w = clamp(next.cta.w || 0, 20, 24)
          next.cta.y = socialSquareRelaxedCtaY(6, 78, 84)
        } else if (intent.marketplaceTemplateVariant === 'commerce-lockup') {
          next.image.x = clamp(next.image.x || 0, 54, 60)
          next.image.y = clamp(next.image.y || 0, 14, 18)
          next.image.w = clamp(next.image.w || 0, 34, 38)
          next.image.h = clamp(next.image.h || 0, 34, 40)
          next.title.x = clamp(next.title.x || 0, insets.x + 1, 14)
          next.title.y = clamp(next.title.y || 0, 48, 56)
          next.title.w = clamp(next.title.w || 0, 38, 46)
          next.subtitle.x = next.title.x
          next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, next.title.y + 9), 60, 70)
          next.subtitle.w = clamp(next.subtitle.w || 0, 36, 44)
          next.cta.x = next.title.x
          next.cta.w = clamp(next.cta.w || 0, 20, 24)
          next.cta.y = socialSquareRelaxedCtaY(7, 72, 80)
        } else {
          next.image.x = clamp(next.image.x || 0, 46, 54)
          next.image.y = clamp(next.image.y || 0, 12, 16)
          next.image.w = clamp(next.image.w || 0, 40, 46)
          next.image.h = clamp(next.image.h || 0, 38, 46)
          next.title.x = clamp(next.title.x || 0, insets.x + 1, 12)
          next.title.y = clamp(next.title.y || 0, 54, 60)
          next.title.w = clamp(next.title.w || 0, 36, 44)
          next.subtitle.x = next.title.x
          next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, next.title.y + 8), 64, 72)
          next.subtitle.w = clamp(next.subtitle.w || 0, 34, 42)
          next.cta.x = next.title.x
          next.cta.w = clamp(next.cta.w || 0, 20, 24)
          next.cta.y = socialSquareRelaxedCtaY(6, 76, 84)
        }
        next.logo.x = clamp(next.logo.x || 0, insets.x, 12)
        next.logo.y = clamp(next.logo.y || 0, insets.y, 10)
        next.badge.x = clamp(next.badge.x || 0, 62, 74)
        next.badge.y = clamp(next.badge.y || 0, insets.y + 2, 14)
      } else if (intent.marketplaceTemplateId === 'text-first-promo') {
        const proofBand = intent.marketplaceTemplateVariant === 'proof-band'
        next.image.x = clamp(next.image.x || 0, proofBand ? 58 : 56, 64)
        next.image.y = clamp(next.image.y || 0, 10, 14)
        next.image.w = clamp(next.image.w || 0, proofBand ? 26 : 24, proofBand ? 30 : 30)
        next.image.h = clamp(next.image.h || 0, proofBand ? 26 : 18, proofBand ? 30 : 24)
        next.title.x = clamp(next.title.x || 0, insets.x + 1, 12)
        next.title.y = clamp(next.title.y || 0, proofBand ? 22 : 26, proofBand ? 32 : 36)
        next.title.w = clamp(next.title.w || 0, proofBand ? 48 : 46, proofBand ? 54 : 52)
        next.subtitle.x = next.title.x
        next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, next.title.y + (proofBand ? 7 : 8)), proofBand ? 34 : 38, proofBand ? 46 : 52)
        next.subtitle.w = clamp(next.subtitle.w || 0, proofBand ? 46 : 42, proofBand ? 52 : 48)
        next.cta.x = next.title.x
        next.cta.w = clamp(next.cta.w || 0, proofBand ? 20 : 18, proofBand ? 24 : 22)
        next.cta.y = socialSquareRelaxedCtaY(
          proofBand ? 5 : 6,
          proofBand ? 58 : 62,
          proofBand ? 66 : 72
        )
        next.logo.x = clamp(next.logo.x || 0, insets.x, 12)
        next.logo.y = clamp(next.logo.y || 0, insets.y, 10)
        next.badge.x = clamp(next.badge.x || 0, 8, 18)
        next.badge.y = clamp(next.badge.y || 0, insets.y + 2, 14)
      } else {
        next.image.x = clamp(next.image.x || 0, 46, 64)
        next.image.y = clamp(next.image.y || 0, 10, 18)
        next.image.w = clamp(next.image.w || 0, 28, 38)
        next.image.h = clamp(next.image.h || 0, 30, 44)
        next.title.x = clamp(next.title.x || 0, insets.x + 1, 14)
        next.title.y = clamp(next.title.y || 0, 58, 68)
        next.title.w = clamp(next.title.w || 0, 48, 66)
        next.subtitle.x = next.title.x
        next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, next.title.y + 11), 68, 80)
        next.subtitle.w = clamp(next.subtitle.w || 0, 44, 60)
        next.cta.x = next.title.x
        next.cta.y = socialSquareRelaxedCtaY(8, 82, 92)
        next.logo.x = clamp(next.logo.x || 0, insets.x, 12)
        next.logo.y = clamp(next.logo.y || 0, insets.y, 10)
      }
    }
  }

  if (
    textBottom < 78 &&
    (isSquareFamily(intent) || intent.family === 'portrait-bottom-card') &&
    format.key !== 'social-square'
  ) {
    next.cta.y = clamp((next.cta.y || 0) + 2, next.cta.y || 0, 90)
  }

  if (isConstrainedMarketplaceFormat(format)) {
    const beforeMetrics = getMarketplaceStageGuardMetrics(scene, format)
    next.logo.x = clamp(next.logo.x || 0, insets.x, 100 - insets.x - (next.logo.w || 0))
    next.logo.y = clamp(next.logo.y || 0, insets.y, 100 - insets.y - (next.logo.h || 0))
    next.title.x = clamp(next.title.x || 0, insets.x, 100 - insets.x - (next.title.w || 0))
    next.subtitle.x = clamp(next.subtitle.x || 0, insets.x, 100 - insets.x - (next.subtitle.w || 0))
    next.cta.x = clamp(next.cta.x || 0, insets.x, 100 - insets.x - (next.cta.w || 0))
    next.cta.y = clamp(next.cta.y || 0, insets.y, 94 - (next.cta.h || 6))
    const afterMetrics = getMarketplaceStageGuardMetrics(next, format)
    const reasons = getMarketplaceRegressionReasons(beforeMetrics, afterMetrics, format)
    if (reasons.length || afterMetrics.penalty > beforeMetrics.penalty + 0.25) {
      logMarketplaceStageGuard({
        stage: 'refine',
        format,
        action: 'preserve-packed-geometry',
        before: beforeMetrics,
        after: afterMetrics,
        reasons,
      })
      return clone(scene)
    }
    return next
  }

  next.logo.x = clamp(next.logo.x || 0, insets.x, 16)
  next.logo.y = clamp(next.logo.y || 0, insets.y, 16)
  next.title.x = clamp(next.title.x || 0, insets.x, format.family === 'wide' ? 12 : 24)
  next.subtitle.x = next.title.x
  next.cta.x = next.title.x
  next.cta.y = clamp(next.cta.y || 0, (next.subtitle.y || 0) + 5, 94 - (next.cta.h || 6))

  return next
}

function preserveLateProductSupportGeometry(input: {
  scene: Scene
  format: FormatDefinition
  intent: LayoutIntent
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
  compositionModel?: CompositionModel | null
}) {
  if (
    !isImageBackedProductSupportLayout({
      format: input.format,
      intent: input.intent,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    })
  ) {
    return input.scene
  }

  const currentImageW = input.scene.image.w || 0
  const currentImageH = input.scene.image.h || 0
  const comparisonLockup = input.intent.marketplaceTemplateVariant === 'comparison-lockup'
  const targetMinW =
    input.intent.marketplaceTemplateVariant === 'image-dominant-square'
      ? 36
      : comparisonLockup
        ? 34
        : 32
  const targetMinH =
    input.intent.marketplaceTemplateVariant === 'image-dominant-square'
      ? 20
      : comparisonLockup
        ? 24
        : 18
  if (currentImageW >= targetMinW && currentImageH >= targetMinH) {
    return input.scene
  }

  const ruleSet = getFormatRuleSet(input.format)
  const safeArea = rectToRegion(ruleSet.safeArea, input.format)
  const beforeMetrics = getMarketplaceStageGuardMetrics(input.scene, input.format)
  const next = clone(input.scene)
  next.image.w = clamp(Math.max(currentImageW, targetMinW), targetMinW, safeArea.w)
  next.image.h = clamp(Math.max(currentImageH, targetMinH), targetMinH, safeArea.h)
  next.image.x = clamp(
    comparisonLockup ? Math.max(next.image.x || safeArea.x, 54) : next.image.x || safeArea.x,
    safeArea.x,
    safeArea.x + safeArea.w - (next.image.w || 0)
  )
  next.image.y = clamp(next.image.y || safeArea.y, safeArea.y, safeArea.y + safeArea.h - (next.image.h || 0))

  next.title.x = clamp(Math.min(next.title.x || safeArea.x, 14), safeArea.x, 14)
  next.title.w = clamp(
    Math.min(
      next.title.w || targetMinW,
      input.intent.marketplaceTemplateVariant === 'image-dominant-square'
        ? 46
        : comparisonLockup
          ? 48
          : 50
    ),
    comparisonLockup ? 34 : 30,
    comparisonLockup ? 48 : 50
  )
  next.subtitle.x = next.title.x
  next.subtitle.w = clamp(
    Math.min(
      next.subtitle.w || next.title.w,
      input.intent.marketplaceTemplateVariant === 'image-dominant-square'
        ? 42
        : comparisonLockup
          ? 46
          : 46
    ),
    comparisonLockup ? 32 : 28,
    comparisonLockup ? 46 : 46
  )
  next.cta.x = next.title.x
  next.cta.w = clamp(Math.min(next.cta.w || 20, comparisonLockup ? 20 : 22), 18, comparisonLockup ? 20 : 22)
  next.cta.y = clamp(
    Math.max(next.cta.y || 0, (next.subtitle.y || next.title.y || 0) + (comparisonLockup ? 7 : 6)),
    comparisonLockup ? 76 : 74,
    84
  )
  if (comparisonLockup) {
    next.title.y = clamp(Math.min(next.title.y || 58, 58), 52, 60)
    next.subtitle.y = clamp(Math.max(next.subtitle.y || 0, (next.title.y || 0) + 8), 62, 72)
  }

  const afterMetrics = getMarketplaceStageGuardMetrics(next, input.format)
  const reasons = getMarketplaceRegressionReasons(beforeMetrics, afterMetrics, input.format)
  const beforeState = evaluateStructuralLayoutState({
    scene: input.scene,
    format: input.format,
    compositionModel: input.compositionModel,
  })
  const afterState = evaluateStructuralLayoutState({
    scene: next,
    format: input.format,
    compositionModel: input.compositionModel,
  })
  if (isStructuralStateBetter(afterState, beforeState)) {
    return next
  }
  const beforeHigh = beforeState.findings.filter((finding) => finding.severity === 'high').length
  const afterHigh = afterState.findings.filter((finding) => finding.severity === 'high').length
  if (
    getStructuralRank(afterState) >= getStructuralRank(beforeState) &&
    afterHigh <= beforeHigh &&
    afterState.findings.length <= beforeState.findings.length &&
    afterMetrics.penalty < beforeMetrics.penalty
  ) {
    return next
  }
  if (!reasons.length && afterMetrics.penalty <= beforeMetrics.penalty + 0.35) {
    return next
  }

  return input.scene
}

function preserveLateTextFirstPromoGeometry(input: {
  scene: Scene
  format: FormatDefinition
  intent: LayoutIntent
  compositionModel?: CompositionModel | null
}) {
  if (input.format.key !== 'marketplace-card' || input.intent.marketplaceTemplateId !== 'text-first-promo') {
    return input.scene
  }

  const noImageMode = input.intent.marketplaceTemplateSelection?.inputProfile.imageRegime === 'no-image'
  const proofBand = input.intent.marketplaceTemplateVariant === 'proof-band'
  const proofBandImageBacked = proofBand && !noImageMode
  const sellingAngle = input.intent.marketplaceTemplateSelection?.inputProfile.sellingAngle
  const eligibleFootprintLift =
    proofBandImageBacked && (sellingAngle === 'benefit-led' || sellingAngle === 'trust-led')
  const proofPresence = input.intent.marketplaceTemplateSelection?.inputProfile.proofPresence
  const proofHeavy =
    proofPresence !== 'none' ||
    sellingAngle === 'trust-led' ||
    sellingAngle === 'benefit-led' ||
    sellingAngle === 'comparison-led'
  const currentImageW = input.scene.image.w || 0
  const currentImageH = input.scene.image.h || 0
  const currentTitleW = input.scene.title.w || 0
  const currentSubtitleW = input.scene.subtitle.w || 0
  const currentTitleY = input.scene.title.y || 0
  const currentSubtitleY = input.scene.subtitle.y || 0
  const currentCtaY = input.scene.cta.y || 0
  const targetMinImageW = noImageMode ? (proofBand ? 60 : proofHeavy ? 56 : 22) : eligibleFootprintLift ? 30 : proofBand ? 26 : 22
  const targetMinImageH = noImageMode ? (proofBand ? 12 : 14) : eligibleFootprintLift ? 28 : proofBand ? 26 : 18
  const targetMaxImageH = noImageMode ? (proofBand ? 16 : 18) : eligibleFootprintLift ? 32 : proofBand ? 30 : 22
  const targetMaxTitleW = noImageMode ? (proofHeavy ? 62 : 68) : eligibleFootprintLift ? 58 : proofBand ? 56 : 56
  const targetMaxSubtitleW = noImageMode ? (proofHeavy ? 58 : 62) : eligibleFootprintLift ? 56 : proofBand ? 54 : 54
  const targetMaxTitleY = noImageMode ? (proofHeavy ? 42 : 44) : proofBand ? 40 : 56
  const targetMaxSubtitleY = noImageMode ? (proofHeavy ? 54 : 60) : proofBand ? 50 : 66
  const targetMaxCtaY = noImageMode ? (proofHeavy ? 72 : 76) : proofBand ? 66 : 80

  if (
    currentImageW >= targetMinImageW &&
    currentImageH >= targetMinImageH &&
    currentImageH <= targetMaxImageH &&
    currentTitleW <= targetMaxTitleW &&
    currentSubtitleW <= targetMaxSubtitleW &&
    currentTitleY <= targetMaxTitleY &&
    currentSubtitleY <= targetMaxSubtitleY &&
    currentCtaY <= targetMaxCtaY
  ) {
    return input.scene
  }

  const ruleSet = getFormatRuleSet(input.format)
  const safeArea = rectToRegion(ruleSet.safeArea, input.format)
  const beforeMetrics = getMarketplaceStageGuardMetrics(input.scene, input.format)
  const next = clone(input.scene)

  next.image.w = clamp(
    Math.max(currentImageW, targetMinImageW),
    targetMinImageW,
    noImageMode ? safeArea.w - 4 : eligibleFootprintLift ? 32 : 32
  )
  next.image.h = clamp(
    noImageMode ? Math.min(Math.max(currentImageH, targetMinImageH), targetMaxImageH) : Math.max(currentImageH, targetMinImageH),
    targetMinImageH,
    noImageMode ? targetMaxImageH : eligibleFootprintLift ? 32 : 28
  )
  next.image.x = clamp(
    noImageMode ? Math.min(next.image.x || 10, 12) : Math.max(next.image.x || safeArea.x, eligibleFootprintLift ? 64 : 56),
    safeArea.x,
    safeArea.x + safeArea.w - (next.image.w || 0)
  )
  next.image.y = clamp(
    noImageMode ? Math.min(next.image.y || 10, 12) : Math.min(next.image.y || 12, 14),
    safeArea.y,
    safeArea.y + safeArea.h - (next.image.h || 0)
  )

  next.title.x = clamp(Math.min(next.title.x || safeArea.x, 12), safeArea.x, 14)
  next.title.y = clamp(
    noImageMode
      ? Math.min(next.title.y || targetMaxTitleY, targetMaxTitleY)
      : Math.min(next.title.y || targetMaxTitleY, targetMaxTitleY),
    noImageMode ? (proofHeavy ? 34 : 36) : (eligibleFootprintLift ? 24 : proofBand ? 42 : 50),
    targetMaxTitleY
  )
  next.title.w = clamp(Math.min(Math.max(next.title.w || 0, 44), targetMaxTitleW), 44, targetMaxTitleW)
  next.subtitle.x = next.title.x
  const targetMinSubtitleY = noImageMode ? (proofHeavy ? 44 : 46) : (eligibleFootprintLift ? 34 : proofBand ? 40 : 60)
  next.subtitle.y = clamp(
    Math.min(next.subtitle.y || targetMaxSubtitleY, targetMaxSubtitleY),
    Math.max(targetMinSubtitleY, (next.title.y || 0) + 8),
    targetMaxSubtitleY
  )
  next.subtitle.w = clamp(Math.min(Math.max(next.subtitle.w || 0, 42), targetMaxSubtitleW), 42, targetMaxSubtitleW)
  next.cta.x = next.title.x
  next.cta.w = clamp(
    Math.min(Math.max(next.cta.w || 0, eligibleFootprintLift ? 22 : proofHeavy ? 20 : 18), proofBand ? 24 : 22),
    eligibleFootprintLift ? 22 : proofHeavy ? 20 : 18,
    proofBand ? 24 : 22
  )
  const targetMinCtaY = noImageMode ? (proofHeavy ? 64 : 72) : (eligibleFootprintLift ? 56 : proofBand ? 58 : 74)
  next.cta.y = clamp(
    Math.min(next.cta.y || targetMaxCtaY, targetMaxCtaY),
    Math.max(targetMinCtaY, (next.subtitle.y || next.title.y || 0) + (proofHeavy ? 7 : 8)),
    targetMaxCtaY
  )

  if (eligibleFootprintLift) {
    next.title.x = clamp(next.title.x || 12, safeArea.x, 12)
    next.title.w = clamp(next.title.w || 0, 38, 40)
    next.subtitle.x = next.title.x
    next.subtitle.w = clamp(next.subtitle.w || 0, 38, 40)
    next.image.w = clamp(Math.max(next.image.w || 0, 30), 30, 30)
    next.image.h = clamp(Math.max(next.image.h || 0, 30), 30, 32)
    next.image.x = clamp(Math.max(next.image.x || safeArea.x, 64), safeArea.x, safeArea.x + safeArea.w - (next.image.w || 0))
    next.cta.x = next.title.x
    next.cta.w = clamp(Math.max(next.cta.w || 0, 16), 16, 18)
  }

  const afterMetrics = getMarketplaceStageGuardMetrics(next, input.format)
  const reasons = getMarketplaceRegressionReasons(beforeMetrics, afterMetrics, input.format)
  const beforeState = evaluateStructuralLayoutState({
    scene: input.scene,
    format: input.format,
    compositionModel: input.compositionModel,
  })
  const afterState = evaluateStructuralLayoutState({
    scene: next,
    format: input.format,
    compositionModel: input.compositionModel,
  })
  const beforeOccupiedSafeArea = beforeState.metrics.occupiedSafeArea || 0
  const afterOccupiedSafeArea = afterState.metrics.occupiedSafeArea || 0
  if (isStructuralStateBetter(afterState, beforeState)) {
    return next
  }
  const beforeHigh = beforeState.findings.filter((finding) => finding.severity === 'high').length
  const afterHigh = afterState.findings.filter((finding) => finding.severity === 'high').length
  if (
    getStructuralRank(afterState) >= getStructuralRank(beforeState) &&
    afterHigh <= beforeHigh &&
    afterState.findings.length <= beforeState.findings.length &&
    afterMetrics.penalty < beforeMetrics.penalty
  ) {
    return next
  }
  const strongerTextLockup =
    (next.title.w || 0) >= currentTitleW + 4 ||
    (next.subtitle.w || 0) >= currentSubtitleW + 4 ||
    (next.image.w || 0) >= currentImageW + 4
  const tighterCtaAttachment = (next.cta.y || 0) <= currentCtaY - 4
  if (
    getStructuralRank(afterState) >= getStructuralRank(beforeState) &&
    afterHigh <= beforeHigh &&
    (strongerTextLockup || tighterCtaAttachment) &&
    afterMetrics.penalty <= beforeMetrics.penalty + 6
  ) {
    return next
  }
  if (
    eligibleFootprintLift &&
    afterState.metrics.spacingViolationCount <= beforeState.metrics.spacingViolationCount &&
    (afterOccupiedSafeArea >= 0.18 || afterOccupiedSafeArea >= beforeOccupiedSafeArea + 0.008) &&
    afterHigh <= beforeHigh &&
    afterState.findings.every((finding) => finding.name === 'structural-occupancy' || finding.name === 'role-placement')
  ) {
    return next
  }
  if (!reasons.length && afterMetrics.penalty <= beforeMetrics.penalty + 0.35) {
    return next
  }

  return input.scene
}

function getPerceptualCompositeScore(signals: PerceptualSignals) {
  return (
    signals.clusterCohesion * 0.28 +
    signals.ctaIntegration * 0.26 +
    signals.readingFlowClarity * 0.22 +
    signals.visualBalance * 0.14 -
    signals.deadSpaceScore * 0.18 +
    (signals.hasClearPrimary ? 6 : 0)
  )
}

function computeStampedPerceptualSignals(scene: Scene, format: FormatDefinition) {
  const stamped = clone(scene)
  const textGeometry = buildSceneTextGeometry(stamped, format)
  stamped.title.h = textGeometry.headline.h
  if (textGeometry.subtitle) stamped.subtitle.h = textGeometry.subtitle.h
  return computePerceptualSignals(stamped)
}

function roundPerceptualDelta(value: number) {
  return Number(value.toFixed(1))
}

function formatMarketplaceRect(rect?: Rect | null) {
  if (!rect) return undefined
  return `${roundPerceptualDelta(rect.x)},${roundPerceptualDelta(rect.y)},${roundPerceptualDelta(rect.w)},${roundPerceptualDelta(rect.h)}`
}

function buildPerAdjustmentDelta(before: PerceptualSignals, after: PerceptualSignals) {
  return {
    cta: roundPerceptualDelta(after.ctaIntegration - before.ctaIntegration),
    cluster: roundPerceptualDelta(after.clusterCohesion - before.clusterCohesion),
    deadSpace: roundPerceptualDelta(after.deadSpaceScore - before.deadSpaceScore),
    balance: roundPerceptualDelta(after.visualBalance - before.visualBalance),
    readingFlow: roundPerceptualDelta(after.readingFlowClarity - before.readingFlowClarity),
  }
}

function getFamilySubAdjustmentIssues(input: {
  beforeState: StructuralLayoutState
  afterState: StructuralLayoutState
  beforeMetrics: MarketplaceStageGuardMetrics
  afterMetrics: MarketplaceStageGuardMetrics
  format: FormatDefinition
}) {
  const issues = getMarketplaceRegressionReasons(input.beforeMetrics, input.afterMetrics, input.format)
  if (getStructuralRank(input.afterState) < getStructuralRank(input.beforeState)) issues.push('structural-tier')
  if (input.afterState.metrics.overlapCount > input.beforeState.metrics.overlapCount) issues.push('overlap-count')
  if (input.afterState.metrics.safeAreaViolationCount > input.beforeState.metrics.safeAreaViolationCount) {
    issues.push('safe-area-count')
  }
  if (input.afterState.metrics.spacingViolationCount > input.beforeState.metrics.spacingViolationCount + 1) {
    issues.push('spacing-count')
  }
  for (const finding of input.afterState.findings) {
    if (
      (finding.name === 'major-overlap' || finding.name === 'safe-area-compliance') &&
      !issues.includes(finding.name)
    ) {
      issues.push(finding.name)
    }
  }
  return issues
}

function shouldAcceptFamilySubAdjustment(input: {
  family: 'text-first-promo' | 'header-panel-card'
  adjustmentId: string
  beforeState: StructuralLayoutState
  afterState: StructuralLayoutState
  beforeMetrics: MarketplaceStageGuardMetrics
  afterMetrics: MarketplaceStageGuardMetrics
  delta: {
    cta: number
    cluster: number
    deadSpace: number
    balance: number
    readingFlow: number
  }
  beforeSignals: PerceptualSignals
  afterSignals: PerceptualSignals
  issues: string[]
}) {
  const hardIssues = input.issues.filter((issue) => issue !== 'hotspot-score')
  const hardRiskFree =
    getStructuralRank(input.afterState) >= getStructuralRank(input.beforeState) &&
    input.afterState.metrics.overlapCount <= input.beforeState.metrics.overlapCount &&
    input.afterState.metrics.safeAreaViolationCount <= input.beforeState.metrics.safeAreaViolationCount &&
    input.afterMetrics.hotspotScore <= input.beforeMetrics.hotspotScore + 12 &&
    input.afterMetrics.imageClusterOverlapArea <= input.beforeMetrics.imageClusterOverlapArea + 0.02 &&
    input.afterMetrics.roleConflictArea <= input.beforeMetrics.roleConflictArea + 0.02 &&
    !hardIssues.length

  if (!hardRiskFree) return false

  switch (input.adjustmentId) {
    case 'text-first-title-subtitle-tighten':
      return input.delta.cluster >= 8 && input.delta.deadSpace <= 6 && input.delta.balance >= -4
    case 'text-first-subtitle-proof-mass-shape':
      return (
        (input.delta.cluster >= 2 || input.delta.cta >= 2 || input.delta.readingFlow >= 1) &&
        input.delta.deadSpace <= 2 &&
        input.delta.balance >= -1
      )
    case 'text-first-title-subtitle-rhythm-shape':
      return (
        (input.delta.cluster >= 4 || input.delta.readingFlow >= 4 || input.delta.cta >= 4) &&
        input.delta.deadSpace <= 4 &&
        input.delta.balance >= -2
      )
    case 'text-first-cta-x-align':
      return (
        input.delta.cta >= 6 &&
        (input.delta.cluster >= 2 || input.delta.readingFlow >= 1) &&
        input.delta.deadSpace <= 3 &&
        input.delta.balance >= -2
      )
    case 'text-first-cluster-baseline-align':
      return (
        input.delta.cta >= 8 &&
        (input.delta.cluster >= 4 || input.delta.readingFlow >= 2) &&
        input.delta.deadSpace <= 4 &&
        input.delta.balance >= -2
      )
    case 'text-first-cluster-mass-lift':
      return (
        (input.delta.cluster >= 8 || input.delta.readingFlow >= 4) &&
        input.delta.deadSpace <= 6 &&
        input.delta.balance >= -4
      )
    case 'text-first-image-rebalance':
      return (
        input.afterSignals.textDominance >= input.beforeSignals.textDominance + 1 &&
        input.delta.deadSpace <= 4 &&
        input.delta.balance >= -4
      )
    case 'header-panel-panel-gap-reduction':
      return (
        (input.delta.cluster >= 8 || input.delta.readingFlow >= 2) &&
        input.delta.deadSpace <= 6 &&
        input.delta.balance >= -4
      )
    case 'header-panel-cta-stack-pull':
      return (
        input.delta.cta >= 12 &&
        (input.delta.cluster >= 4 || input.delta.readingFlow >= 2) &&
        input.delta.deadSpace <= 8 &&
        input.delta.balance >= -4
      )
    case 'header-panel-message-stack-tighten':
      return input.delta.cluster >= 6 && input.delta.deadSpace <= 6 && input.delta.balance >= -3
    case 'header-panel-image-rebalance':
      return (
        input.afterSignals.textDominance >= input.beforeSignals.textDominance &&
        input.delta.deadSpace <= 6 &&
        input.delta.balance >= -4
      )
    default:
      return false
  }
}

function preserveLateMarketplaceFamilyGeometry(input: {
  scene: Scene
  format: FormatDefinition
  intent: LayoutIntent
  compositionModel?: CompositionModel | null
}): {
  scene: Scene
  diagnostics: MarketplacePerceptualAdjustment & {
    beforeSignals?: PerceptualSignals
    afterSignals?: PerceptualSignals
  }
} {
  if (
    input.format.key !== 'marketplace-card' ||
    !input.intent.marketplaceTemplateId ||
    (input.intent.marketplaceTemplateId !== 'text-first-promo' &&
      input.intent.marketplaceTemplateId !== 'header-panel-card')
  ) {
    return {
      scene: input.scene,
      diagnostics: {
        applied: false,
        blockedBy: 'non-message-first-scope',
        triggers: [],
        adjustments: [],
      },
    }
  }

  const noImageMode = input.intent.marketplaceTemplateSelection?.inputProfile.imageRegime === 'no-image'
  const beforeSignals = computeStampedPerceptualSignals(input.scene, input.format)
  const beforeState = evaluateStructuralLayoutState({
    scene: input.scene,
    format: input.format,
    compositionModel: input.compositionModel,
  })
  const beforeMetrics = getMarketplaceStageGuardMetrics(input.scene, input.format)
  const triggers: string[] = []
  const perAdjustments: NonNullable<MarketplacePerceptualAdjustment['perAdjustments']> = []
  const acceptedAdjustments: string[] = []
  let currentScene = clone(input.scene)
  let currentState = beforeState
  let currentMetrics = beforeMetrics
  let currentSignals = beforeSignals
  const candidateAdjustments: Array<{
    id: string
    label: string
    apply: (scene: Scene) => void
  }> = []

  if (input.intent.marketplaceTemplateId === 'text-first-promo') {
    const textGeometry = buildSceneTextGeometry(currentScene, input.format)
    const titleBox = textGeometry.headline
    const subtitleBox = textGeometry.subtitle
    const titleBottom = titleBox.rect.y + titleBox.rect.h
    const subtitleBottom = subtitleBox ? subtitleBox.rect.y + subtitleBox.h : titleBottom
    const clusterLeft = clamp(
      Math.min(currentScene.title.x || 12, currentScene.subtitle.x || 12, currentScene.cta.x || 12),
      8,
      16
    )
    const ctaGap = Math.max(0, (currentScene.cta.y || 0) - subtitleBottom)
    if (ctaGap > 12 || Math.abs((currentScene.cta.x || 0) - clusterLeft) > 2) {
      triggers.push('text-first-detached-cta-tail')
    }
    if ((subtitleBox && subtitleBox.rect.y - titleBottom > 4) || (currentScene.subtitle.w || 0) < 40) {
      triggers.push('text-first-loose-proof-lockup')
    }
    if (!noImageMode && beforeSignals.primaryElement === 'image' && beforeSignals.textDominance < 34) {
      triggers.push('text-first-support-image-overweight')
    }
    if (beforeSignals.deadSpaceScore > 32) {
      triggers.push('text-first-light-cluster-mass')
    }

    if (triggers.includes('text-first-loose-proof-lockup')) {
      candidateAdjustments.push({
        id: 'text-first-title-subtitle-tighten',
        label: 'tightened text-first proof/message lockup',
        apply: (scene) => {
          const lockupLeft = clamp(
            Math.min(scene.title.x || 12, scene.subtitle.x || 12, scene.cta.x || 12),
            8,
            16
          )
          scene.title.x = lockupLeft
          scene.subtitle.x = lockupLeft
          scene.title.w = clamp(Math.max(scene.title.w || 0, 40), 38, 42)
          scene.subtitle.w = clamp(Math.max(scene.subtitle.w || 0, 38), 36, 40)
          scene.subtitle.y = clamp(
            Math.min(scene.subtitle.y || 0, (scene.title.y || 0) + 8),
            (scene.title.y || 0) + 6,
            (scene.title.y || 0) + 9
          )
        },
      })
    }
    if (
      triggers.includes('text-first-loose-proof-lockup') ||
      triggers.includes('text-first-detached-cta-tail')
    ) {
      candidateAdjustments.push({
        id: 'text-first-subtitle-proof-mass-shape',
        label: 'strengthened text-first subtitle/proof mass inside the message core',
        apply: (scene) => {
          const geometry = buildSceneTextGeometry(scene, input.format)
          const imageBackedProofBand = !noImageMode && input.intent.marketplaceTemplateVariant === 'proof-band'
          const nextSubtitleFont = clamp(
            (scene.subtitle.fontSize || 16) + (imageBackedProofBand ? 1 : noImageMode ? 0.25 : 0.5),
            14,
            17
          )
          const subtitleBaselineOffset = pxToPercentY(nextSubtitleFont, input.format)
          const titleTop = geometry.headline.rect.y
          const currentTitleBottom = geometry.headline.rect.y + geometry.headline.rect.h
          const currentSubtitleTop =
            geometry.subtitle?.rect.y ??
            ((scene.subtitle.y || (currentTitleBottom + subtitleBaselineOffset + 6)) - subtitleBaselineOffset)
          const lockupLeft = clamp(
            Math.min(scene.title.x || 12, scene.subtitle.x || 12),
            8,
            16
          )
          const nextSubtitleTop = clamp(
            Math.min(currentSubtitleTop, currentTitleBottom + (imageBackedProofBand ? 2.8 : 3.2)),
            currentTitleBottom + (imageBackedProofBand ? 2.2 : 2.8),
            currentTitleBottom + (imageBackedProofBand ? 3.4 : 4.2)
          )

          scene.subtitle.x = lockupLeft
          scene.subtitle.y = nextSubtitleTop + subtitleBaselineOffset
          scene.subtitle.measurementHint = 'proof-dense'
          scene.subtitle.w = clamp(
            Math.max(scene.subtitle.w || 0, imageBackedProofBand ? 40 : 39),
            imageBackedProofBand ? 39 : 38,
            imageBackedProofBand ? 42 : 41
          )
          scene.subtitle.fontSize = nextSubtitleFont
          scene.subtitle.charsPerLine = clamp(
            (scene.subtitle.charsPerLine || 30) - (imageBackedProofBand ? 4 : 2),
            18,
            40
          )
          scene.subtitle.maxLines = clamp(
            (scene.subtitle.maxLines || 4) + (imageBackedProofBand ? 1 : 1),
            4,
            imageBackedProofBand ? 6 : 5
          )
          scene.title.y = clamp(
            titleTop + pxToPercentY(scene.title.fontSize || 32, input.format),
            scene.title.y || 0,
            (scene.title.y || 0) + 0.2
          )
        },
      })
    }
    if (
      triggers.includes('text-first-loose-proof-lockup') ||
      triggers.includes('text-first-detached-cta-tail')
    ) {
      candidateAdjustments.push({
        id: 'text-first-title-subtitle-rhythm-shape',
        label: 'shaped text-first title/subtitle rhythm as a tighter message core',
        apply: (scene) => {
          const geometry = buildSceneTextGeometry(scene, input.format)
          const titleHeight = Math.max(geometry.headline.rect.h || scene.title.h || 0, noImageMode ? 8 : 7)
          const subtitleHeight = Math.max(geometry.subtitle?.h || scene.subtitle.h || 0, noImageMode ? 4 : 3.5)
          const currentTitleY = scene.title.y || geometry.headline.rect.y || (noImageMode ? 38 : 34)
          const currentTitleBottom = currentTitleY + titleHeight
          const currentSubtitleY = scene.subtitle.y || (currentTitleBottom + 7)
          const currentCtaY = scene.cta.y || (noImageMode ? 72 : 64)
          const normalizedTitleGap = clamp(currentSubtitleY - currentTitleBottom, 6, noImageMode ? 8 : 7.5)
          const preferredSubtitleToCtaGap = noImageMode ? 8 : 7
          const currentSubtitleToCtaGap = Math.max(
            0,
            currentCtaY - (currentSubtitleY + subtitleHeight)
          )
          const shiftDown = clamp(
            currentSubtitleToCtaGap - (preferredSubtitleToCtaGap + 1),
            0,
            noImageMode ? 1.5 : 2
          )

          let nextTitleY = clamp(
            currentTitleY + shiftDown,
            currentTitleY - 0.5,
            currentTitleY + (noImageMode ? 1.5 : 2)
          )
          let nextSubtitleY = nextTitleY + titleHeight + normalizedTitleGap
          const subtitleCeiling = currentCtaY - subtitleHeight - preferredSubtitleToCtaGap
          if (nextSubtitleY > subtitleCeiling) {
            const overflow = nextSubtitleY - subtitleCeiling
            nextTitleY -= overflow
            nextSubtitleY -= overflow
          }

          scene.title.y = clamp(nextTitleY, noImageMode ? 30 : 26, noImageMode ? 48 : 40)
          scene.subtitle.y = clamp(
            nextSubtitleY,
            scene.title.y + titleHeight + 6,
            currentCtaY - subtitleHeight - preferredSubtitleToCtaGap
          )
        },
      })
    }

      if (triggers.includes('text-first-detached-cta-tail')) {
        candidateAdjustments.push({
          id: 'text-first-cta-x-align',
          label: 'aligned text-first CTA with the message cluster',
          apply: (scene) => {
            const lockupLeft = clamp(
              Math.min(scene.title.x || 12, scene.subtitle.x || 12, scene.cta.x || 12),
              8,
              16
            )
            scene.cta.x = clamp(lockupLeft, lockupLeft, lockupLeft + 1)
            scene.cta.w = clamp(Math.max(scene.cta.w || 0, 16), 16, 17)
          },
        })
        candidateAdjustments.push({
          id: 'text-first-cluster-baseline-align',
          label: 'aligned text-first subtitle and CTA to a shared cluster baseline',
          apply: (scene) => {
            const geometry = buildSceneTextGeometry(scene, input.format)
            const localTitleBottom = geometry.headline.rect.y + geometry.headline.rect.h
            const subtitleHeight = Math.max(geometry.subtitle?.h || scene.subtitle.h || 0, noImageMode ? 4 : 3.5)
            const currentSubtitleY = scene.subtitle.y || (localTitleBottom + 7)
            const currentCtaY = scene.cta.y || (noImageMode ? 72 : 64)
            const currentBlockTop = currentSubtitleY
            const preferredSubtitleY = clamp(
              Math.min(currentSubtitleY, localTitleBottom + 6.5),
              localTitleBottom + 5.5,
              localTitleBottom + 7.5
            )
            const blockShift = clamp(preferredSubtitleY - currentBlockTop, -2, 2)
            const baselineSubtitleY = currentSubtitleY + blockShift
            const preferredGap = noImageMode ? 8 : 7
            const normalizedGap = clamp(
              currentCtaY - (currentSubtitleY + subtitleHeight),
              preferredGap,
              preferredGap + 1
            )
            const targetCtaY = baselineSubtitleY + subtitleHeight + normalizedGap
            const softenedCtaY = currentCtaY + clamp(targetCtaY - currentCtaY, -2, 1)

            scene.subtitle.y = baselineSubtitleY
            scene.cta.y = clamp(
              softenedCtaY,
              baselineSubtitleY + subtitleHeight + preferredGap,
              noImageMode ? 70 : 62
            )
          },
        })
      }

      if (triggers.includes('text-first-light-cluster-mass')) {
        candidateAdjustments.push({
          id: 'text-first-cluster-mass-lift',
          label: 'strengthened text-first cluster footprint',
          apply: (scene) => {
            const lockupLeft = clamp(
              Math.min(scene.title.x || 12, scene.subtitle.x || 12, scene.cta.x || 12),
              8,
              14
            )
            const nextTitleY = clamp(
              Math.min(scene.title.y || 0, noImageMode ? 38 : 32),
              noImageMode ? 32 : 28,
              noImageMode ? 44 : 36
            )
            scene.title.x = lockupLeft
            scene.subtitle.x = lockupLeft
            scene.title.w = clamp(Math.max(scene.title.w || 0, 40), 39, 42)
            scene.subtitle.w = clamp(Math.max(scene.subtitle.w || 0, 38), 37, 40)
            scene.title.y = nextTitleY
            scene.subtitle.y = clamp(
              Math.min(scene.subtitle.y || 0, nextTitleY + 8),
              nextTitleY + 6,
              nextTitleY + 8
            )
          },
        })
      }

      if (triggers.includes('text-first-support-image-overweight')) {
        candidateAdjustments.push({
          id: 'text-first-image-rebalance',
          label: 'kept support image from stealing text-first emphasis',
          apply: (scene) => {
            scene.image.w = clamp((scene.image.w || 0) - 0.75, 28, 30)
            scene.image.h = clamp((scene.image.h || 0) - 0.5, 28, 30)
            scene.image.x = clamp(Math.max(scene.image.x || 0, 66), 62, 100 - (scene.image.w || 0))
          },
        })
      }
  } else {
    const textGeometry = buildSceneTextGeometry(currentScene, input.format)
    const titleBox = textGeometry.headline
    const subtitleBox = textGeometry.subtitle
    const titleBottom = titleBox.rect.y + titleBox.rect.h
    const subtitleBottom = subtitleBox ? subtitleBox.rect.y + subtitleBox.h : titleBottom
    const clusterLeft = clamp(
      Math.min(currentScene.title.x || 12, currentScene.subtitle.x || 12, currentScene.cta.x || 12),
      8,
      16
    )
    const ctaGap = Math.max(0, (currentScene.cta.y || 0) - subtitleBottom)
    const imageBottom = (currentScene.image.y || 0) + (currentScene.image.h || 0)
    const titleTop = titleBox.rect.y
    if (ctaGap > 14 || Math.abs((currentScene.cta.x || 0) - clusterLeft) > 3) {
      triggers.push('header-panel-detached-footer-cta')
    }
    if (titleTop - imageBottom > 10 || beforeSignals.deadSpaceScore > 16) {
      triggers.push('header-panel-flat-panel-gap')
    }
    if (beforeSignals.primaryElement === 'image' && beforeSignals.textDominance < 14) {
      triggers.push('header-panel-image-overweight')
    }

    if (triggers.includes('header-panel-flat-panel-gap')) {
      candidateAdjustments.push({
        id: 'header-panel-panel-gap-reduction',
        label: 'reduced flat header-panel gap under the hero band',
        apply: (scene) => {
          scene.title.y = clamp(Math.min(scene.title.y || 0, noImageMode ? 54 : 52), noImageMode ? 52 : 50, 56)
        },
      })
      candidateAdjustments.push({
        id: 'header-panel-message-stack-tighten',
        label: 'tightened header-panel message stack',
        apply: (scene) => {
          const lockupLeft = clamp(
            Math.min(scene.title.x || 12, scene.subtitle.x || 12, scene.cta.x || 12),
            8,
            16
          )
          scene.title.x = lockupLeft
          scene.subtitle.x = lockupLeft
          scene.subtitle.y = clamp(
            Math.min(scene.subtitle.y || 0, (scene.title.y || 0) + 9),
            (scene.title.y || 0) + 6,
            (scene.title.y || 0) + 10
          )
        },
      })
    }

    if (triggers.includes('header-panel-detached-footer-cta')) {
      candidateAdjustments.push({
        id: 'header-panel-cta-stack-pull',
        label: 'kept header-panel CTA as part of the message stack',
        apply: (scene) => {
          const geometry = buildSceneTextGeometry(scene, input.format)
          const localTitleBottom = geometry.headline.rect.y + geometry.headline.rect.h
          const localSubtitleBottom = geometry.subtitle
            ? geometry.subtitle.rect.y + geometry.subtitle.h
            : localTitleBottom
          const lockupLeft = clamp(
            Math.min(scene.title.x || 12, scene.subtitle.x || 12, scene.cta.x || 12),
            8,
            16
          )
          scene.cta.x = clamp(lockupLeft + 1, lockupLeft, lockupLeft + 4)
          scene.cta.w = clamp(Math.max(scene.cta.w || 0, 16), 16, 18)
          scene.cta.y = clamp(
            Math.min(scene.cta.y || 0, localSubtitleBottom + 8),
            localSubtitleBottom + 6,
            noImageMode ? 76 : 78
          )
        },
      })
    }

    if (triggers.includes('header-panel-image-overweight')) {
      candidateAdjustments.push({
        id: 'header-panel-image-rebalance',
        label: 'rebalanced header-panel emphasis toward the message stack',
        apply: (scene) => {
          scene.image.h = clamp((scene.image.h || 0) - 2, 22, 26)
          scene.title.w = clamp(Math.min(Math.max(scene.title.w || 0, 70), 80), 68, 80)
          scene.subtitle.w = clamp(Math.min(Math.max(scene.subtitle.w || 0, 68), 78), 66, 78)
        },
      })
    }
  }

  if (!candidateAdjustments.length) {
    return {
      scene: input.scene,
      diagnostics: {
        applied: false,
        blockedBy: 'no-family-weakness',
        triggers,
        adjustments: [],
        perAdjustments: [],
        beforeSignals,
      },
    }
  }

  for (const adjustment of candidateAdjustments) {
    const beforeTextGeometry = buildSceneTextGeometry(currentScene, input.format)
    const candidateScene = clone(currentScene)
    adjustment.apply(candidateScene)
    const candidateState = evaluateStructuralLayoutState({
      scene: candidateScene,
      format: input.format,
      compositionModel: input.compositionModel,
    })
    const candidateMetrics = getMarketplaceStageGuardMetrics(candidateScene, input.format)
    const candidateSignals = computeStampedPerceptualSignals(candidateScene, input.format)
    const candidateTextGeometry = buildSceneTextGeometry(candidateScene, input.format)
    const delta = buildPerAdjustmentDelta(currentSignals, candidateSignals)
    const introducedIssues = getFamilySubAdjustmentIssues({
      beforeState: currentState,
      afterState: candidateState,
      beforeMetrics: currentMetrics,
      afterMetrics: candidateMetrics,
      format: input.format,
    })
    const applied = shouldAcceptFamilySubAdjustment({
      family: input.intent.marketplaceTemplateId,
      adjustmentId: adjustment.id,
      beforeState: currentState,
      afterState: candidateState,
      beforeMetrics: currentMetrics,
      afterMetrics: candidateMetrics,
      delta,
      beforeSignals: currentSignals,
      afterSignals: candidateSignals,
      issues: introducedIssues,
    })

    perAdjustments.push({
      id: adjustment.id,
      applied,
      delta,
      introducedIssues: introducedIssues.length ? introducedIssues : undefined,
      effectiveRect:
        adjustment.id === 'text-first-subtitle-proof-mass-shape'
          ? {
              subtitleBefore: formatMarketplaceRect(beforeTextGeometry.subtitle?.rect),
              subtitleAfter: formatMarketplaceRect(candidateTextGeometry.subtitle?.rect),
              subtitleLineCountBefore: beforeTextGeometry.subtitle?.lineCount,
              subtitleLineCountAfter: candidateTextGeometry.subtitle?.lineCount,
              subtitleCharsPerLineBefore: beforeTextGeometry.subtitle?.charsPerLine,
              subtitleCharsPerLineAfter: candidateTextGeometry.subtitle?.charsPerLine,
              subtitleMaxLinesBefore: beforeTextGeometry.subtitle?.maxLines,
              subtitleMaxLinesAfter: candidateTextGeometry.subtitle?.maxLines,
              subtitleLineHeightBefore: beforeTextGeometry.subtitle?.lineHeight,
              subtitleLineHeightAfter: candidateTextGeometry.subtitle?.lineHeight,
              subtitleTextLengthBefore: (currentScene.subtitle.text || '').trim().length,
              subtitleTextLengthAfter: (candidateScene.subtitle.text || '').trim().length,
              subtitleSourceTextLengthBefore: currentScene.subtitle.sourceTextLength,
              subtitleSourceTextLengthAfter: candidateScene.subtitle.sourceTextLength,
              subtitleFallbackUsedBefore: currentScene.subtitle.realizationFallback === 'proof-compact',
              subtitleFallbackUsedAfter: candidateScene.subtitle.realizationFallback === 'proof-compact',
            }
          : undefined,
    })

    if (applied) {
      currentScene = candidateScene
      currentState = candidateState
      currentMetrics = candidateMetrics
      currentSignals = candidateSignals
      acceptedAdjustments.push(adjustment.label)
    }
  }

  if (!acceptedAdjustments.length) {
    return {
      scene: input.scene,
      diagnostics: {
        applied: false,
        blockedBy: 'no-safe-family-gain',
        triggers,
        adjustments: candidateAdjustments.map((adjustment) => adjustment.label),
        perAdjustments,
        beforeSignals,
        afterSignals: currentSignals,
      },
    }
  }

  const afterState = currentState
  const afterMetrics = currentMetrics
  const afterSignals = currentSignals
  const reasons = getMarketplaceRegressionReasons(beforeMetrics, afterMetrics, input.format)
  const beforeHigh = beforeState.findings.filter((finding) => finding.severity === 'high').length
  const afterHigh = afterState.findings.filter((finding) => finding.severity === 'high').length
  const improvedComposite = getPerceptualCompositeScore(afterSignals) - getPerceptualCompositeScore(beforeSignals)
  const improvedCta = afterSignals.ctaIntegration >= beforeSignals.ctaIntegration + 4
  const improvedCluster = afterSignals.clusterCohesion >= beforeSignals.clusterCohesion + 4
  const reducedDeadSpace = afterSignals.deadSpaceScore <= beforeSignals.deadSpaceScore - 4
  const improvedPrimary =
    beforeSignals.primaryElement === 'image' && afterSignals.textDominance >= beforeSignals.textDominance + 4
  const gainSummary = {
    compositeDelta: roundPerceptualDelta(improvedComposite),
    ctaDelta: roundPerceptualDelta(afterSignals.ctaIntegration - beforeSignals.ctaIntegration),
    clusterDelta: roundPerceptualDelta(afterSignals.clusterCohesion - beforeSignals.clusterCohesion),
    deadSpaceDelta: roundPerceptualDelta(afterSignals.deadSpaceScore - beforeSignals.deadSpaceScore),
    visualBalanceDelta: roundPerceptualDelta(afterSignals.visualBalance - beforeSignals.visualBalance),
    textDominanceDelta: roundPerceptualDelta(afterSignals.textDominance - beforeSignals.textDominance),
    readingFlowDelta: roundPerceptualDelta(afterSignals.readingFlowClarity - beforeSignals.readingFlowClarity),
  }
  const acceptedBy: string[] = []
  const structuralSafe =
    getStructuralRank(afterState) >= getStructuralRank(beforeState) && afterHigh <= beforeHigh
  const noStructuralRegression = !reasons.length
  const familyHardRiskFree =
    afterState.metrics.overlapCount <= beforeState.metrics.overlapCount &&
    afterState.metrics.safeAreaViolationCount <= beforeState.metrics.safeAreaViolationCount &&
    afterState.findings.every(
      (finding) =>
        finding.name !== 'major-overlap' &&
        finding.name !== 'safe-area-compliance'
    )
  const familyCoreSafe =
    getStructuralRank(afterState) >= getStructuralRank(beforeState) &&
    familyHardRiskFree &&
    afterMetrics.hotspotScore <= beforeMetrics.hotspotScore + 1 &&
    afterMetrics.imageClusterOverlapArea <= beforeMetrics.imageClusterOverlapArea + 0.02 &&
    afterMetrics.roleConflictArea <= beforeMetrics.roleConflictArea + 0.02
  const textFirstFamily = input.intent.marketplaceTemplateId === 'text-first-promo'
  const headerPanelFamily = input.intent.marketplaceTemplateId === 'header-panel-card'
  const selectionInput = input.intent.marketplaceTemplateSelection?.inputProfile

  const textFirstMessageLockupGain =
    textFirstFamily &&
    familyCoreSafe &&
    afterMetrics.penalty <= beforeMetrics.penalty + 18 &&
    gainSummary.ctaDelta >= 18 &&
    gainSummary.clusterDelta >= 18 &&
    gainSummary.readingFlowDelta >= 6 &&
    gainSummary.deadSpaceDelta <= 24 &&
    gainSummary.visualBalanceDelta >= -8 &&
    afterState.metrics.spacingViolationCount <= beforeState.metrics.spacingViolationCount + 1

  const textFirstBalancedSafeGain =
    textFirstFamily &&
    familyCoreSafe &&
    afterMetrics.penalty <= beforeMetrics.penalty + 12 &&
    gainSummary.ctaDelta >= 12 &&
    gainSummary.clusterDelta >= 12 &&
    gainSummary.deadSpaceDelta <= 12 &&
    gainSummary.visualBalanceDelta >= -6 &&
    gainSummary.textDominanceDelta >= 2 &&
    afterState.metrics.spacingViolationCount <= beforeState.metrics.spacingViolationCount + 1

  const headerPanelStackGain =
    headerPanelFamily &&
    familyCoreSafe &&
    afterMetrics.penalty <= beforeMetrics.penalty + 18 &&
    gainSummary.ctaDelta >= 18 &&
    (gainSummary.clusterDelta >= 12 || gainSummary.readingFlowDelta >= 2) &&
    gainSummary.deadSpaceDelta <= 12 &&
    gainSummary.visualBalanceDelta >= -6 &&
    afterState.metrics.spacingViolationCount <= beforeState.metrics.spacingViolationCount + 1

  if (textFirstMessageLockupGain) acceptedBy.push('text-first-message-lockup-gain')
  if (textFirstBalancedSafeGain) acceptedBy.push('text-first-balanced-safe-gain')
  if (headerPanelStackGain) acceptedBy.push('header-panel-stack-coherence-gain')

  const familySafeSubsetGain =
    acceptedAdjustments.length > 0 &&
    familyHardRiskFree &&
    afterMetrics.hotspotScore <= beforeMetrics.hotspotScore + 12 &&
    afterMetrics.imageClusterOverlapArea <= beforeMetrics.imageClusterOverlapArea + 0.02 &&
    afterMetrics.roleConflictArea <= beforeMetrics.roleConflictArea + 0.02 &&
    afterState.metrics.spacingViolationCount <= beforeState.metrics.spacingViolationCount + 1 &&
    (
      (textFirstFamily &&
        gainSummary.ctaDelta >= 18 &&
        gainSummary.clusterDelta >= 18 &&
        gainSummary.deadSpaceDelta <= 18 &&
        gainSummary.visualBalanceDelta >= -7) ||
      (headerPanelFamily &&
        selectionInput?.sellingAngle !== 'trust-led' &&
        selectionInput?.copyDensity !== 'dense' &&
        gainSummary.ctaDelta >= 18 &&
        (gainSummary.clusterDelta >= 12 || gainSummary.readingFlowDelta >= 2) &&
        gainSummary.deadSpaceDelta <= 10 &&
        gainSummary.visualBalanceDelta >= -4)
    )

  if (familySafeSubsetGain) acceptedBy.push('safe-sub-adjustment-subset')

  if (
    structuralSafe &&
    !reasons.length &&
    (improvedComposite >= 4 || improvedCta || improvedCluster || reducedDeadSpace || improvedPrimary)
  ) {
    return {
      scene: currentScene,
      diagnostics: {
        applied: true,
        triggers,
        adjustments: acceptedAdjustments,
        perAdjustments,
        acceptedBy: ['generic-safe-family-gain'],
        gainSummary,
        beforeSignals,
        afterSignals,
      },
    }
  }

  if (
    structuralSafe &&
    afterMetrics.penalty <= beforeMetrics.penalty + 10 &&
    (improvedComposite >= 2 || improvedCta || improvedCluster || reducedDeadSpace || improvedPrimary)
  ) {
    return {
      scene: currentScene,
      diagnostics: {
        applied: true,
        triggers,
        adjustments: acceptedAdjustments,
        perAdjustments,
        acceptedBy: ['relaxed-safe-family-gain'],
        gainSummary,
        beforeSignals,
        afterSignals,
      },
    }
  }

  if (acceptedBy.length) {
    return {
      scene: currentScene,
      diagnostics: {
        applied: true,
        triggers,
        adjustments: acceptedAdjustments,
        perAdjustments,
        acceptedBy,
        gainSummary,
        beforeSignals,
        afterSignals,
      },
    }
  }

  return {
    scene: input.scene,
    diagnostics: {
      applied: false,
      blockedBy: 'no-safe-family-gain',
      triggers,
      adjustments: acceptedAdjustments.length
        ? acceptedAdjustments
        : candidateAdjustments.map((adjustment) => adjustment.label),
      perAdjustments,
      gainSummary,
      beforeSignals,
      afterSignals,
    },
  }
}

function preserveLateMarketplacePerceptualGeometry(input: {
  scene: Scene
  format: FormatDefinition
  intent: LayoutIntent
  compositionModel?: CompositionModel | null
}): {
  scene: Scene
  diagnostics: MarketplacePerceptualAdjustment & {
    beforeSignals?: PerceptualSignals
    afterSignals?: PerceptualSignals
  }
} {
  if (
    input.format.key !== 'marketplace-card' ||
    !input.intent.marketplaceTemplateId ||
    (input.intent.marketplaceTemplateId !== 'text-first-promo' &&
      input.intent.marketplaceTemplateId !== 'header-panel-card')
  ) {
    return {
      scene: input.scene,
      diagnostics: {
        applied: false,
        blockedBy: 'non-message-first-scope',
        triggers: [],
        adjustments: [],
      },
    }
  }

  const beforeSignals = computePerceptualSignals(input.scene)
  const refinement = refineMarketplaceCardPerceptualComposition({
    scene: input.scene,
    format: input.format,
    intent: input.intent,
    signals: beforeSignals,
  })
  if (!refinement.diagnostics.applied) {
    return {
      scene: input.scene,
      diagnostics: {
        ...refinement.diagnostics,
        beforeSignals,
      },
    }
  }

  const beforeState = evaluateStructuralLayoutState({
    scene: input.scene,
    format: input.format,
    compositionModel: input.compositionModel,
  })
  const beforeMetrics = getMarketplaceStageGuardMetrics(input.scene, input.format)
  const finalized = finalizeSceneGeometry(refinement.scene, input.format, input.compositionModel)
  const stabilized = stabilizeMarketplaceLayout(finalized, input.format, input.compositionModel)
  const simulatedPreserved = preserveLateTextFirstPromoGeometry({
    scene: stabilized,
    format: input.format,
    intent: input.intent,
    compositionModel: input.compositionModel,
  })
  const simulatedFinal = preserveLateMarketplaceFamilyGeometry({
    scene: simulatedPreserved,
    format: input.format,
    intent: input.intent,
    compositionModel: input.compositionModel,
  }).scene
  const afterState = evaluateStructuralLayoutState({
    scene: simulatedFinal,
    format: input.format,
    compositionModel: input.compositionModel,
  })
  const afterSignals = computePerceptualSignals(simulatedFinal)
  const afterMetrics = getMarketplaceStageGuardMetrics(simulatedFinal, input.format)
  const reasons = getMarketplaceRegressionReasons(beforeMetrics, afterMetrics, input.format)

  const beforeHigh = beforeState.findings.filter((finding) => finding.severity === 'high').length
  const afterHigh = afterState.findings.filter((finding) => finding.severity === 'high').length
  const improvedComposite = getPerceptualCompositeScore(afterSignals) - getPerceptualCompositeScore(beforeSignals)
  const improvedCta = afterSignals.ctaIntegration >= beforeSignals.ctaIntegration + 6
  const improvedCluster = afterSignals.clusterCohesion >= beforeSignals.clusterCohesion + 6
  const reducedDeadSpace = afterSignals.deadSpaceScore <= beforeSignals.deadSpaceScore - 6
  const improvedPrimary = beforeSignals.primaryElement === 'image' && afterSignals.primaryElement !== 'image'

  if (
    getStructuralRank(afterState) >= getStructuralRank(beforeState) &&
    afterHigh <= beforeHigh &&
    !reasons.length &&
    (improvedComposite >= 6 || improvedCta || improvedCluster || reducedDeadSpace || improvedPrimary)
  ) {
    return {
      scene: refinement.scene,
      diagnostics: {
        ...refinement.diagnostics,
        beforeSignals,
        afterSignals,
      },
    }
  }

  return {
    scene: input.scene,
    diagnostics: {
      applied: false,
      blockedBy: 'no-safe-perceptual-gain',
      triggers: refinement.diagnostics.triggers,
      adjustments: refinement.diagnostics.adjustments,
      beforeSignals,
      afterSignals,
    },
  }
}

function applyRuleConstraints(scene: Scene, format: FormatDefinition, ruleSet: FormatRuleSet) {
  const next = clone(scene)
  const safeArea = rectToRegion(ruleSet.safeArea, format)
  const imageMinCoverage = ruleSet.composition.minImageCoverage
  const imageMaxCoverage = ruleSet.composition.maxImageCoverage
  const isPrimarySquare = format.key === 'social-square'
  const textGeometry = buildSceneTextGeometry(next, format)
  const textClusterBounds = getBounds([
    textGeometry.headline.rect,
    textGeometry.subtitle?.rect || { x: 0, y: 0, w: 0, h: 0 },
    { x: next.cta.x || 0, y: next.cta.y || 0, w: next.cta.w || 0, h: next.cta.h || 0 },
  ])
  const safeAreaArea = Math.max(safeArea.w * safeArea.h, 0.0001)
  const textClusterCoverage = (textClusterBounds.w * textClusterBounds.h) / safeAreaArea
  let imageCoverage = ((next.image.w || 0) * (next.image.h || 0)) / 10000
  const clampedHeadline = clampTextBoxToRegion(textGeometry.headline, safeArea, format)
  const clampedSubtitle = textGeometry.subtitle ? clampTextBoxToRegion(textGeometry.subtitle, safeArea, format) : undefined

  Object.assign(next.title, applyTextBoxToSceneElement(next.title, clampedHeadline, format))
  if (clampedSubtitle) {
    Object.assign(next.subtitle, applyTextBoxToSceneElement(next.subtitle, clampedSubtitle, format))
  }
  next.cta.x = clamp(next.cta.x || 0, safeArea.x, safeArea.x + safeArea.w - (next.cta.w || 0))
  next.cta.y = clamp(next.cta.y || 0, safeArea.y, safeArea.y + safeArea.h - (next.cta.h || 0))
  next.logo.x = clamp(next.logo.x || 0, safeArea.x, safeArea.x + safeArea.w - (next.logo.w || 0))
  next.logo.y = clamp(next.logo.y || 0, safeArea.y, safeArea.y + safeArea.h - (next.logo.h || 0))
  next.badge.x = clamp(next.badge.x || 0, safeArea.x, safeArea.x + safeArea.w - (next.badge.w || 0))
  next.badge.y = clamp(next.badge.y || 0, safeArea.y, safeArea.y + safeArea.h - (next.badge.h || 0))
  next.image.x = clamp(next.image.x || 0, safeArea.x, safeArea.x + safeArea.w - (next.image.w || 0))
  next.image.y = clamp(next.image.y || 0, safeArea.y, safeArea.y + safeArea.h - (next.image.h || 0))
  if (isPrimarySquare) {
    next.image = clampPrimarySquareMaterializedImage({
      image: normalizeRegion({
        x: next.image.x || 0,
        y: next.image.y || 0,
        w: next.image.w || 0,
        h: next.image.h || 0,
      }),
      safeArea,
      textClusterBounds,
      ctaRect: { x: next.cta.x || 0, y: next.cta.y || 0, w: next.cta.w || 0, h: next.cta.h || 0 },
    })
  }
  const marketplaceSafe = isConstrainedMarketplaceFormat(format)
  const clampedOnly = marketplaceSafe ? clone(next) : null
  const beforeMetrics = marketplaceSafe ? getMarketplaceStageGuardMetrics(scene, format) : null
  const clampedMetrics = marketplaceSafe && clampedOnly ? getMarketplaceStageGuardMetrics(clampedOnly, format) : null

  const targetMinImageCoverage = isPrimarySquare
    ? Math.min(getPrimarySquareImageCoverageCap(textClusterCoverage), Math.max(imageMinCoverage - 0.22, 0.11))
    : textClusterCoverage >= Math.max(ruleSet.composition.minTextCoverage, 0.18)
      ? Math.max(imageMinCoverage - 0.08, 0.18)
      : imageMinCoverage
  const effectiveImageMaxCoverage = isPrimarySquare
    ? Math.min(imageMaxCoverage, getPrimarySquareImageCoverageCap(textClusterCoverage) + 0.025)
    : imageMaxCoverage

  if (imageCoverage < targetMinImageCoverage) {
    const scale = Math.sqrt(targetMinImageCoverage / Math.max(imageCoverage, 0.01))
    if (marketplaceSafe && clampedOnly && clampedMetrics) {
      const grown = clone(next)
      grown.image.w = clamp((grown.image.w || 0) * scale, grown.image.w || 0, safeArea.w)
      grown.image.h = clamp((grown.image.h || 0) * scale, grown.image.h || 0, safeArea.h)
      grown.image.x = clamp(grown.image.x || 0, safeArea.x, safeArea.x + safeArea.w - (grown.image.w || 0))
      grown.image.y = clamp(grown.image.y || 0, safeArea.y, safeArea.y + safeArea.h - (grown.image.h || 0))
      const grownMetrics = getMarketplaceStageGuardMetrics(grown, format)
      const reasons = getMarketplaceRegressionReasons(clampedMetrics, grownMetrics, format)
      if (!reasons.length && grownMetrics.penalty <= clampedMetrics.penalty + 0.25) {
        next.image = clone(grown.image)
      } else {
        logMarketplaceStageGuard({
          stage: 'constraints',
          format,
          action: 'skip-image-growth',
          before: clampedMetrics,
          after: grownMetrics,
          reasons,
        })
      }
    } else {
      next.image.w = clamp((next.image.w || 0) * scale, next.image.w || 0, safeArea.w)
      next.image.h = clamp((next.image.h || 0) * scale, next.image.h || 0, safeArea.h)
    }
  } else if (imageCoverage > effectiveImageMaxCoverage) {
    const scale = Math.sqrt(effectiveImageMaxCoverage / imageCoverage)
    next.image.w = Math.max((next.image.w || 0) * scale, pxToPercentX(ruleSet.elements.image.minW || 0, format))
    next.image.h = Math.max((next.image.h || 0) * scale, pxToPercentY(ruleSet.elements.image.minH || 0, format))
  }
  next.image.x = clamp(next.image.x || 0, safeArea.x, safeArea.x + safeArea.w - (next.image.w || 0))
  next.image.y = clamp(next.image.y || 0, safeArea.y, safeArea.y + safeArea.h - (next.image.h || 0))
  if (isPrimarySquare) {
    next.image = clampPrimarySquareMaterializedImage({
      image: normalizeRegion({
        x: next.image.x || 0,
        y: next.image.y || 0,
        w: next.image.w || 0,
        h: next.image.h || 0,
      }),
      safeArea,
      textClusterBounds,
      ctaRect: { x: next.cta.x || 0, y: next.cta.y || 0, w: next.cta.w || 0, h: next.cta.h || 0 },
    })
  }
  imageCoverage = ((next.image.w || 0) * (next.image.h || 0)) / 10000

  if (imageCoverage > effectiveImageMaxCoverage * 0.98 && textClusterCoverage < Math.max(ruleSet.composition.minTextCoverage * 0.86, 0.12)) {
    next.image.w = Math.max((next.image.w || 0) - 4, pxToPercentX(ruleSet.elements.image.minW || 0, format))
    next.image.h = Math.max((next.image.h || 0) - 4, pxToPercentY(ruleSet.elements.image.minH || 0, format))
    next.image.x = clamp(next.image.x || 0, safeArea.x, safeArea.x + safeArea.w - (next.image.w || 0))
    next.image.y = clamp(next.image.y || 0, safeArea.y, safeArea.y + safeArea.h - (next.image.h || 0))
    if (isPrimarySquare) {
      next.image = clampPrimarySquareMaterializedImage({
        image: normalizeRegion({
          x: next.image.x || 0,
          y: next.image.y || 0,
          w: next.image.w || 0,
          h: next.image.h || 0,
        }),
        safeArea,
        textClusterBounds,
        ctaRect: { x: next.cta.x || 0, y: next.cta.y || 0, w: next.cta.w || 0, h: next.cta.h || 0 },
      })
    }
  }

  if (marketplaceSafe && beforeMetrics && clampedOnly && clampedMetrics) {
    const finalMetrics = getMarketplaceStageGuardMetrics(next, format)
    const finalReasons = getMarketplaceRegressionReasons(beforeMetrics, finalMetrics, format)
    if (finalReasons.length || finalMetrics.penalty > clampedMetrics.penalty + 0.25) {
      logMarketplaceStageGuard({
        stage: 'constraints',
        format,
        action: 'preserve-clamped-layout',
        before: beforeMetrics,
        after: finalMetrics,
        reasons: finalReasons,
      })
      return clampedOnly
    }
  }

  return next
}

function applyPalette(scene: Scene, palette: PalettePlan, assetHint?: AssetHint) {
  const next = clone(scene)
  next.background = [...palette.background]
  next.accent = palette.accent
  next.title.fill = palette.textPrimary
  next.subtitle.fill = palette.textSecondary
  next.subtitle.opacity = assetHint?.detectedContrast === 'low' ? Math.min((next.subtitle.opacity || 0.82) + 0.06, 0.96) : next.subtitle.opacity
  next.cta.bg = palette.ctaBackground
  next.cta.fill = palette.ctaText
  next.badge.bg = palette.badgeBackground
  next.badge.fill = palette.badgeText
  next.badge.bgOpacity = 1
  next.logo.bg = palette.surface
  next.logo.bgOpacity = assetHint?.detectedContrast === 'high' ? 0.26 : 0.16
  next.logo.fill = palette.textPrimary
  return next
}

function applyTypography(scene: Scene, typography: TypographyPlan, brandKit: BrandKit) {
  const next = clone(scene)
  next.title.fontSize = typography.titleSize
  next.title.weight = typography.titleWeight
  next.title.w = typography.titleWidth
  next.title.charsPerLine = typography.titleCharsPerLine
  next.title.maxLines = typography.titleMaxLines
  next.subtitle.fontSize = typography.subtitleSize
  next.subtitle.w = typography.subtitleWidth
  next.subtitle.charsPerLine = typography.subtitleCharsPerLine
  next.subtitle.maxLines = typography.subtitleMaxLines
  next.subtitle.opacity = typography.subtitleOpacity
  next.cta.fontSize = typography.ctaSize
  next.badge.fontSize = typography.badgeSize
  next.cta.rx = brandKit.ctaStyle === 'pill' ? 26 : brandKit.ctaStyle === 'rounded' ? 18 : 10
  return next
}

function mapBlockPlanAction(action: string, format: FormatDefinition): FixAction | null {
  const direct: Partial<Record<string, FixAction>> = {
    'increase-headline-size': 'increase-headline-size',
    'reduce-headline-size': 'reduce-headline-size',
    'reflow-headline': 'reflow-headline',
    'recompute-line-breaks': 'reflow-headline',
    'widen-text-container': 'widen-text-container',
    'narrow-text-container': 'narrow-text-container',
    'loosen-cluster': 'increase-cluster-padding',
    'compress-cluster': 'compress-text-region',
    'change-hierarchy-ratios': 'rebalance-text-cluster',
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
    'change-image-text-dominance': format.category === 'presentation' ? 'switch-to-text-first' : 'switch-to-image-first',
    'reduce-dead-space': 'reduce-dead-space',
    'increase-scale-to-canvas': 'increase-scale-to-canvas',
    'change-layout-family': 'change-layout-family',
  }
  return direct[action] || null
}

export function buildBlockMap(scene: Scene) {
  return {
    headline: scene.title,
    subtitle: scene.subtitle,
    body: scene.subtitle,
    cta: scene.cta,
    logo: scene.logo,
    badge: scene.badge,
    price: scene.badge,
    image: scene.image,
  }
}

export function buildSceneLayoutBoxes(scene: Scene, format: FormatDefinition): LayoutBoxMap {
  const textGeometry = buildSceneTextGeometry(scene, format)
  const boxes: LayoutBox[] = [
    {
      id: 'headline',
      kind: 'headline',
      rect: textGeometry.headline.rect,
      zIndex: 4,
    },
    {
      id: 'subtitle',
      kind: 'subtitle',
      rect: textGeometry.subtitle?.rect || { x: scene.subtitle.x, y: scene.subtitle.y, w: scene.subtitle.w || 0, h: 0 },
      zIndex: 3,
    },
    {
      id: 'cta',
      kind: 'cta',
      rect: {
        x: scene.cta.x,
        y: scene.cta.y,
        w: scene.cta.w || 0,
        h: scene.cta.h || 0,
      },
      zIndex: 5,
    },
    {
      id: 'logo',
      kind: 'logo',
      rect: {
        x: scene.logo.x,
        y: scene.logo.y,
        w: scene.logo.w || 0,
        h: scene.logo.h || 0,
      },
      zIndex: 6,
      locked: true,
    },
    {
      id: 'badge',
      kind: 'badge',
      rect: {
        x: scene.badge.x,
        y: scene.badge.y,
        w: scene.badge.w || 0,
        h: scene.badge.h || 0,
      },
      zIndex: 5,
    },
    {
      id: 'image',
      kind: 'image',
      rect: {
        x: scene.image.x,
        y: scene.image.y,
        w: scene.image.w || 0,
        h: scene.image.h || 0,
      },
      zIndex: 1,
    },
  ]

  return {
    boxes: boxes.filter((box) => box.rect.w > 0 && box.rect.h > 0),
  }
}

export function detectBoxCollisions(boxes: LayoutBox[], compositionModel?: CompositionModel | null): BoxCollision[] {
  const collisions: BoxCollision[] = []
  for (let index = 0; index < boxes.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < boxes.length; compareIndex += 1) {
      const a = boxes[index]
      const b = boxes[compareIndex]
      const overlap = rectsOverlap(a.rect, b.rect)
      if (overlap.area <= 0) continue
      if (allowsModelOverlap(a.kind, b.kind, compositionModel) && getOverlapGeometryAllowance(a, b, compositionModel)) continue
      if (!isForbiddenOverlap(a, b, compositionModel)) continue
      collisions.push({
        a: a.id,
        b: b.id,
        overlapX: overlap.overlapX,
        overlapY: overlap.overlapY,
        area: overlap.area,
      })
    }
  }
  return collisions
}

export function detectSpacingViolations(
  boxes: LayoutBox[],
  minGap: number,
  format?: FormatDefinition,
  compositionModel?: CompositionModel | null
): BoxCollision[] {
  const violations: BoxCollision[] = []
  for (let index = 0; index < boxes.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < boxes.length; compareIndex += 1) {
      const a = boxes[index]
      const b = boxes[compareIndex]
      if (allowsModelOverlap(a.kind, b.kind, compositionModel)) continue
      const overlap = rectsOverlap(a.rect, b.rect)
      if (overlap.area > 0) continue
      const gap = gapBetweenRects(a.rect, b.rect)
      const threshold = format ? getPairGap(a.kind, b.kind, format) : minGap
      if (gap < threshold) {
        violations.push({
          a: a.id,
          b: b.id,
          overlapX: Math.max(0, threshold - gap),
          overlapY: Math.max(0, threshold - gap),
          area: Math.max(0, threshold - gap),
        })
      }
    }
  }
  return violations
}

function syncSceneWithBoxes(scene: Scene, format: FormatDefinition, boxes: LayoutBox[]) {
  const next = clone(scene)
  for (const box of boxes) {
    if (box.kind === 'headline') {
      const geometry = fitSceneTextToRule({
        role: 'headline',
        text: next.title.text || '',
        x: box.rect.x,
        y: box.rect.y + ((next.title.fontSize || 16) / format.height) * 100,
        width: box.rect.w,
        format,
        rule: getFormatRuleSet(format).typography.headline,
        preferredFontSize: next.title.fontSize || 16,
        preferredCharsPerLine: next.title.charsPerLine || 20,
        preferredMaxLines: next.title.maxLines || 3,
        lineHeight: 1.08,
        anchorMode: 'baseline-left',
      })
      Object.assign(next.title, applyTextBoxToSceneElement(next.title, clampTextBoxToRegion(geometry, box.rect, format), format))
      continue
    }
    if (box.kind === 'subtitle' || box.kind === 'body') {
      const geometry = fitSceneTextToRule({
        role: 'subtitle',
        text: next.subtitle.text || '',
        x: box.rect.x,
        y: box.rect.y + ((next.subtitle.fontSize || 14) / format.height) * 100,
        width: box.rect.w,
        format,
        rule: getFormatRuleSet(format).typography.subtitle,
        preferredFontSize: next.subtitle.fontSize || 14,
        preferredCharsPerLine: next.subtitle.charsPerLine || 30,
        preferredMaxLines: next.subtitle.maxLines || 4,
        lineHeight: 1.24,
        anchorMode: 'baseline-left',
        measurementHint: next.subtitle.measurementHint,
      })
      Object.assign(next.subtitle, applyTextBoxToSceneElement(next.subtitle, clampTextBoxToRegion(geometry, box.rect, format), format))
      continue
    }
    if (box.kind === 'cta') {
      next.cta.x = box.rect.x
      next.cta.y = box.rect.y
      next.cta.w = box.rect.w
      next.cta.h = box.rect.h
      continue
    }
    if (box.kind === 'logo') {
      next.logo.x = box.rect.x
      next.logo.y = box.rect.y
      next.logo.w = box.rect.w
      next.logo.h = box.rect.h
      continue
    }
    if (box.kind === 'badge' || box.kind === 'price') {
      next.badge.x = box.rect.x
      next.badge.y = box.rect.y
      next.badge.w = box.rect.w
      next.badge.h = box.rect.h
      continue
    }
    if (box.kind === 'image') {
      next.image.x = box.rect.x
      next.image.y = box.rect.y
      next.image.w = box.rect.w
      next.image.h = box.rect.h
    }
  }
  return next
}

function containsRect(container: Rect, subject: Rect) {
  return (
    subject.x >= container.x &&
    subject.y >= container.y &&
    subject.x + subject.w <= container.x + container.w &&
    subject.y + subject.h <= container.y + container.h
  )
}

function getBounds(rects: Rect[]) {
  const active = rects.filter((rect) => rect.w > 0 && rect.h > 0)
  if (!active.length) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  const left = Math.min(...active.map((rect) => rect.x))
  const top = Math.min(...active.map((rect) => rect.y))
  const right = Math.max(...active.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...active.map((rect) => rect.y + rect.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

function boxIdToKind(id: string): LayoutBox['kind'] {
  if (id === 'headline') return 'headline'
  if (id === 'subtitle') return 'subtitle'
  if (id === 'cta') return 'cta'
  if (id === 'logo') return 'logo'
  if (id === 'badge') return 'badge'
  return 'image'
}

/**
 * Hard structural invariants run on the same final scene geometry that validation and repair consume.
 * This intentionally stays narrower than the rich assessment layer: it answers "is this structurally safe?"
 */
export function evaluateStructuralLayoutState(input: {
  scene: Scene
  format: FormatDefinition
  compositionModel?: CompositionModel | null
}): StructuralLayoutState {
  const { scene, format, compositionModel } = input
  const ruleSet = getFormatRuleSet(format)
  const safeArea = rectToRegion(ruleSet.safeArea, format)
  const boxMap = buildSceneLayoutBoxes(scene, format)
  const collisions = detectBoxCollisions(boxMap.boxes, compositionModel)
  const spacingViolations = detectSpacingViolations(boxMap.boxes, 12, format, compositionModel)
  const safeAreaViolations = boxMap.boxes.filter((box) => !containsRect(safeArea, box.rect))
  const textGeometry = buildSceneTextGeometry(scene, format)
  const textClusterBounds = getBounds([
    textGeometry.headline.rect,
    textGeometry.subtitle?.rect || { x: 0, y: 0, w: 0, h: 0 },
    { x: scene.cta.x || 0, y: scene.cta.y || 0, w: scene.cta.w || 0, h: scene.cta.h || 0 },
  ])
  const safeAreaArea = Math.max(safeArea.w * safeArea.h, 0.0001)
  const textClusterCoverage = (textClusterBounds.w * textClusterBounds.h) / safeAreaArea
  const occupiedSafeArea = Math.min(
    1,
    boxMap.boxes.reduce((sum, box) => sum + box.rect.w * box.rect.h, 0) / safeAreaArea
  )
  const imageCoverage = ((scene.image.w || 0) * (scene.image.h || 0)) / 10000
  const deadSpace = detectDeadSpace(scene, safeArea).deadSpacePercent / 100
  const findings: StructuralLayoutFinding[] = []
  const rolePlacementKinds: LayoutBox['kind'][] = []

  if (collisions.length) {
    findings.push({
      name: 'major-overlap',
      severity: 'high',
      message: 'Major blocks still overlap after synthesis.',
      elements: [...new Set(collisions.flatMap((collision) => [boxIdToKind(collision.a), boxIdToKind(collision.b)]))],
      metrics: {
        count: collisions.length,
        totalOverlapArea: collisions.reduce((sum, collision) => sum + collision.area, 0),
      },
    })
  }

  if (spacingViolations.length) {
    findings.push({
      name: 'minimum-spacing',
      severity: spacingViolations.some((violation) => violation.area > 2.5) ? 'high' : 'medium',
      message: 'Minimum spacing between major blocks is not respected.',
      elements: [...new Set(spacingViolations.flatMap((violation) => [boxIdToKind(violation.a), boxIdToKind(violation.b)]))],
      metrics: {
        count: spacingViolations.length,
        maxGapDeficit: Math.max(...spacingViolations.map((violation) => violation.area)),
      },
    })
  }

  if (safeAreaViolations.length) {
    findings.push({
      name: 'safe-area-compliance',
      severity: 'high',
      message: 'One or more core blocks escape the effective safe area.',
      elements: [...new Set(safeAreaViolations.map((box) => box.kind))],
      metrics: {
        count: safeAreaViolations.length,
      },
    })
  }

  const headlineAreaRatio = (textGeometry.headline.rect.w * textGeometry.headline.rect.h) / safeAreaArea
  const subtitleAreaRatio = textGeometry.subtitle ? (textGeometry.subtitle.rect.w * textGeometry.subtitle.rect.h) / safeAreaArea : 0
  if (
    textGeometry.headline.lineCount > ruleSet.typography.headline.maxLines ||
    headlineAreaRatio > 0.38 ||
    (textGeometry.subtitle && (textGeometry.subtitle.lineCount > ruleSet.typography.subtitle.maxLines || subtitleAreaRatio > 0.28))
  ) {
    findings.push({
      name: 'text-size-sanity',
      severity: 'high',
      message: 'Text occupies an implausibly large share of the format or exceeds configured line discipline.',
      elements: textGeometry.subtitle ? ['headline', 'subtitle'] : ['headline'],
      metrics: {
        headlineLineCount: textGeometry.headline.lineCount,
        subtitleLineCount: textGeometry.subtitle?.lineCount || 0,
        headlineAreaRatio,
        subtitleAreaRatio,
      },
    })
  }

  if (
    imageCoverage > ruleSet.composition.maxImageCoverage + 0.02 ||
    (imageCoverage > ruleSet.composition.maxImageCoverage * 0.96 && textClusterCoverage < Math.max(ruleSet.composition.minTextCoverage * 0.72, 0.1))
  ) {
    findings.push({
      name: 'image-dominance-sanity',
      severity: imageCoverage > ruleSet.composition.maxImageCoverage + 0.04 ? 'high' : 'medium',
      message: 'The image footprint crowds the text structure too aggressively for this format.',
      elements: ['image', 'headline', 'subtitle', 'cta'],
      metrics: {
        imageCoverage,
        textClusterCoverage,
      },
    })
  }

  if (deadSpace > 0.62 || occupiedSafeArea < 0.18 || textClusterCoverage < 0.08) {
    findings.push({
      name: 'structural-occupancy',
      severity: deadSpace > 0.7 && textClusterCoverage < 0.08 ? 'high' : 'medium',
      message: 'The main content is structurally under-using the canvas or over-collapsing into a small region.',
      elements: ['headline', 'subtitle', 'cta', 'image'],
      metrics: {
        deadSpace,
        occupiedSafeArea,
        textClusterCoverage,
      },
    })
  }

  const logoZones = getRuleZones(ruleSet, 'logo', ruleSet.elements.logo.allowedZones)
  const ctaZones = getRuleZones(ruleSet, 'cta', ruleSet.elements.cta.allowedZones)
  const badgeZones = getRuleZones(ruleSet, 'badge', ruleSet.elements.badge?.allowedZones)
  const priceZones = getRuleZones(ruleSet, 'price', ruleSet.elements.price?.allowedZones)
  const logoBox = boxMap.boxes.find((box) => box.kind === 'logo')
  const ctaBox = boxMap.boxes.find((box) => box.kind === 'cta')
  const badgeBox = boxMap.boxes.find((box) => box.kind === 'badge')
  const badgeSemantic = resolveSharedBadgeSemantic(scene)
  const logoOutOfZone = Boolean(logoBox && logoZones.length && !logoZones.some((zone) => containsRect(zone, logoBox.rect)))
  const ctaOutOfZone = Boolean(ctaBox && ctaZones.length && !ctaZones.some((zone) => containsRect(zone, ctaBox.rect)))
  const badgeOutOfZone = Boolean(
    badgeSemantic === 'badge' &&
      badgeBox &&
      badgeZones.length &&
      !badgeZones.some((zone) => containsRect(zone, badgeBox.rect))
  )
  const priceOutOfZone = Boolean(
    badgeSemantic === 'price' &&
      badgeBox &&
      priceZones.length &&
      !priceZones.some((zone) => containsRect(zone, badgeBox.rect))
  )
  if (logoOutOfZone || ctaOutOfZone || badgeOutOfZone || priceOutOfZone) {
    if (logoOutOfZone) rolePlacementKinds.push('logo')
    if (ctaOutOfZone) rolePlacementKinds.push('cta')
    if (badgeOutOfZone) rolePlacementKinds.push('badge')
    if (priceOutOfZone) rolePlacementKinds.push('price')
    findings.push({
      name: 'role-placement',
      severity: 'medium',
      message: 'Role-specific anchor placement is drifting outside the configured format zones.',
      elements: rolePlacementKinds,
      metrics: {
        count: rolePlacementKinds.length,
      },
    })
  }

  const status =
    findings.some((finding) => finding.severity === 'high')
      ? 'invalid'
      : findings.length
        ? 'degraded'
        : 'valid'

  return {
    status,
    findings,
    metrics: {
      overlapCount: collisions.length,
      spacingViolationCount: spacingViolations.length,
      safeAreaViolationCount: safeAreaViolations.length,
      textClusterCoverage,
      occupiedSafeArea,
      imageCoverage,
    },
  }
}

export function finalizeSceneGeometry(scene: Scene, format: FormatDefinition, compositionModel?: CompositionModel | null) {
  const ruleSet = getFormatRuleSet(format)
  let next = applyRuleConstraints(clone(scene), format, ruleSet)

  const boxMap = buildSceneLayoutBoxes(next, format)
  const safeArea = rectToRegion(ruleSet.safeArea, format)
  const collisionResolvedBoxes = resolveBoxCollisions(boxMap.boxes, safeArea, compositionModel, format)
  const resolvedBoxes = resolveSpacingConflicts(collisionResolvedBoxes, safeArea, format, compositionModel)
  next = syncSceneWithBoxes(next, format, resolvedBoxes)
  return applyRuleConstraints(next, format, ruleSet)
}

type MarketplaceRolePlacementIssue = {
  kind: 'cta' | 'logo' | 'badge'
  zone: Rect
  box: LayoutBox
}

type MarketplaceStabilizationMetrics = {
  structuralState: StructuralLayoutState
  spacingViolationCount: number
  rolePlacementCount: number
}

function getMarketplaceStabilizationPriority(kind: LayoutBox['kind']) {
  switch (kind) {
    case 'headline':
      return 6
    case 'image':
      return 5
    case 'cta':
      return 4
    case 'logo':
      return 3
    case 'subtitle':
    case 'body':
      return 2
    case 'badge':
      return 1
    default:
      return 0
  }
}

function isMarketplaceSpacingPair(a: LayoutBox['kind'], b: LayoutBox['kind']) {
  const key = boxKey(a, b)
  return (
    key === boxKey('headline', 'subtitle') ||
    key === boxKey('subtitle', 'cta') ||
    key === boxKey('headline', 'cta') ||
    key === boxKey('headline', 'image') ||
    key === boxKey('subtitle', 'image') ||
    key === boxKey('cta', 'image') ||
    key === boxKey('logo', 'headline') ||
    key === boxKey('logo', 'subtitle') ||
    key === boxKey('badge', 'logo') ||
    key === boxKey('badge', 'headline') ||
    key === boxKey('badge', 'subtitle')
  )
}

function collectMarketplaceSpacingViolations(
  boxes: LayoutBox[],
  format: FormatDefinition,
  compositionModel?: CompositionModel | null
) {
  return detectSpacingViolations(boxes, 12, format, compositionModel).filter((violation) => {
    const a = boxes.find((box) => box.id === violation.a)
    const b = boxes.find((box) => box.id === violation.b)
    return Boolean(a && b && isMarketplaceSpacingPair(a.kind, b.kind))
  })
}

function collectMarketplaceRolePlacementIssues(boxes: LayoutBox[], format: FormatDefinition) {
  const ruleSet = getFormatRuleSet(format)
  const ctaZones = getRuleZones(ruleSet, 'cta', ruleSet.elements.cta.allowedZones)
  const logoZones = getRuleZones(ruleSet, 'logo', ruleSet.elements.logo.allowedZones)
  const badgeZones = getRuleZones(ruleSet, 'badge', ruleSet.elements.badge?.allowedZones)
  const issues: MarketplaceRolePlacementIssue[] = []
  const ctaBox = boxes.find((box) => box.kind === 'cta')
  const logoBox = boxes.find((box) => box.kind === 'logo')
  const badgeBox = boxes.find((box) => box.kind === 'badge')
  if (ctaBox && ctaZones.length && !ctaZones.some((zone) => containsRect(regionToRect(zone), ctaBox.rect))) {
    issues.push({ kind: 'cta', zone: regionToRect(ctaZones[0]), box: ctaBox })
  }
  if (logoBox && logoZones.length && !logoZones.some((zone) => containsRect(regionToRect(zone), logoBox.rect))) {
    issues.push({ kind: 'logo', zone: regionToRect(logoZones[0]), box: logoBox })
  }
  if (badgeBox && badgeZones.length && !badgeZones.some((zone) => containsRect(regionToRect(zone), badgeBox.rect))) {
    issues.push({ kind: 'badge', zone: regionToRect(badgeZones[0]), box: badgeBox })
  }
  return issues
}

function getMarketplaceStabilizationMetrics(
  scene: Scene,
  format: FormatDefinition,
  compositionModel?: CompositionModel | null
): MarketplaceStabilizationMetrics {
  const boxMap = buildSceneLayoutBoxes(scene, format)
  const structuralState = evaluateStructuralLayoutState({ scene, format, compositionModel })
  return {
    structuralState,
    spacingViolationCount: collectMarketplaceSpacingViolations(boxMap.boxes, format, compositionModel).length,
    rolePlacementCount: collectMarketplaceRolePlacementIssues(boxMap.boxes, format).length,
  }
}

function getMarketplaceRoleCandidatePenalty(
  boxes: LayoutBox[],
  candidate: LayoutBox,
  format: FormatDefinition,
  compositionModel?: CompositionModel | null,
  zone?: Rect
) {
  const nextBoxes = boxes.map((box) => (box.id === candidate.id ? clone(candidate) : clone(box)))
  const collisions = detectBoxCollisions(nextBoxes, compositionModel).filter((collision) => collision.a === candidate.id || collision.b === candidate.id)
  const spacing = collectMarketplaceSpacingViolations(nextBoxes, format, compositionModel).filter(
    (violation) => violation.a === candidate.id || violation.b === candidate.id
  )
  const outOfZone = zone ? !containsRect(zone, candidate.rect) : false
  return (
    collisions.reduce((sum, collision) => sum + collision.area * 10, 0) +
    spacing.reduce((sum, violation) => sum + Math.max(violation.area, 1) * 4, 0) +
    (outOfZone ? 40 : 0)
  )
}

function buildMarketplaceAnchorCandidates(box: LayoutBox, zone: Rect, format: FormatDefinition) {
  const fitsW = Math.min(box.rect.w, zone.w)
  const fitsH = Math.min(box.rect.h, zone.h)
  const baseCandidates: Rect[] =
    box.kind === 'cta'
      ? [
          { x: zone.x, y: zone.y + zone.h - fitsH, w: fitsW, h: fitsH },
          { x: zone.x + zone.w - fitsW, y: zone.y + zone.h - fitsH, w: fitsW, h: fitsH },
          { x: zone.x, y: zone.y, w: fitsW, h: fitsH },
          { x: zone.x + zone.w - fitsW, y: zone.y, w: fitsW, h: fitsH },
        ]
      : [
          { x: zone.x, y: zone.y, w: fitsW, h: fitsH },
          { x: zone.x + zone.w - fitsW, y: zone.y, w: fitsW, h: fitsH },
          { x: zone.x, y: zone.y + zone.h - fitsH, w: fitsW, h: fitsH },
          { x: zone.x + zone.w - fitsW, y: zone.y + zone.h - fitsH, w: fitsW, h: fitsH },
        ]
  const compactScale =
    box.kind === 'cta' ? (format.key === 'marketplace-tile' ? 0.88 : 0.92) : box.kind === 'logo' ? 0.9 : 0.92
  const compactW = Math.max(fitsW * compactScale, box.kind === 'cta' ? 10 : 5)
  const compactH = Math.max(fitsH * compactScale, box.kind === 'cta' ? 4 : 3)
  const candidates = [
    ...baseCandidates,
    { x: zone.x, y: zone.y + zone.h - compactH, w: compactW, h: compactH },
    { x: zone.x + zone.w - compactW, y: zone.y + zone.h - compactH, w: compactW, h: compactH },
  ]
  if (box.kind === 'cta') {
    const safeArea = rectToRegion(getFormatRuleSet(format).safeArea, format)
    const safeStrip: Rect = {
      x: safeArea.x,
      y: safeArea.y + safeArea.h - Math.max(compactH + 6, 12),
      w: safeArea.w,
      h: Math.max(compactH + 6, 12),
    }
    candidates.push(
      { x: safeStrip.x, y: safeStrip.y + safeStrip.h - compactH, w: compactW, h: compactH },
      { x: safeStrip.x + safeStrip.w - compactW, y: safeStrip.y + safeStrip.h - compactH, w: compactW, h: compactH }
    )
  }
  return candidates
}

function getMarketplaceRoleZoneRect(kind: 'cta' | 'logo' | 'badge', format: FormatDefinition) {
  const zone = getRuleZone(getFormatRuleSet(format), kind)
  return zone ? regionToRect(zone) : null
}

function maybeLogMarketplaceStabilization(input: {
  format: FormatDefinition
  before: MarketplaceStabilizationMetrics
  after: MarketplaceStabilizationMetrics
  applied: string[]
}) {
  const debugEnabled =
    typeof import.meta !== 'undefined' &&
    import.meta.env?.DEV &&
    (globalThis as { __MARKETPLACE_STABILIZE_DEBUG?: boolean }).__MARKETPLACE_STABILIZE_DEBUG === true
  if (!debugEnabled) return
  console.debug('[layout] marketplace-stabilize', {
    format: input.format.key,
    beforeTier: input.before.structuralState.status,
    afterTier: input.after.structuralState.status,
    beforeSpacing: input.before.spacingViolationCount,
    afterSpacing: input.after.spacingViolationCount,
    beforeRolePlacement: input.before.rolePlacementCount,
    afterRolePlacement: input.after.rolePlacementCount,
    applied: input.applied,
  })
}

function stabilizeMarketplaceLayout(scene: Scene, format: FormatDefinition, compositionModel?: CompositionModel | null) {
  if (!isConstrainedMarketplaceFormat(format)) return scene

  const originalMetrics = getMarketplaceStabilizationMetrics(scene, format, compositionModel)
  const safeArea = rectToRegion(getFormatRuleSet(format).safeArea, format)
  let workingBoxes = buildSceneLayoutBoxes(scene, format).boxes.map((box) => clone(box))
  const applied: string[] = []
  let bestScene = clone(scene)
  let bestMetrics = originalMetrics

  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false
    const roleIssues = collectMarketplaceRolePlacementIssues(workingBoxes, format)
    for (const issue of roleIssues) {
      const target = workingBoxes.find((box) => box.id === issue.box.id)
      if (!target) continue
      const candidates = buildMarketplaceAnchorCandidates(target, issue.zone, format)
      let bestRect = target.rect
      let bestPenalty = getMarketplaceRoleCandidatePenalty(workingBoxes, target, format, compositionModel, issue.zone)
      for (const candidateRect of candidates) {
        const candidateBox = clone(target)
        candidateBox.rect = clone(candidateRect)
        const penalty = getMarketplaceRoleCandidatePenalty(workingBoxes, candidateBox, format, compositionModel, issue.zone)
        if (penalty + 0.01 < bestPenalty) {
          bestPenalty = penalty
          bestRect = clone(candidateRect)
        }
      }
      if (bestRect.x !== target.rect.x || bestRect.y !== target.rect.y || bestRect.w !== target.rect.w || bestRect.h !== target.rect.h) {
        target.rect = bestRect
        changed = true
        applied.push(`role:${target.kind}`)
      }
    }

    const spacingViolations = collectMarketplaceSpacingViolations(workingBoxes, format, compositionModel)
      .sort((left, right) => right.area - left.area)

    for (const violation of spacingViolations) {
      const a = workingBoxes.find((box) => box.id === violation.a)
      const b = workingBoxes.find((box) => box.id === violation.b)
      if (!a || !b) continue
      if (boxKey(a.kind, b.kind) === boxKey('badge', 'logo')) {
        const badge = a.kind === 'badge' ? a : b.kind === 'badge' ? b : null
        const logo = a.kind === 'logo' ? a : b.kind === 'logo' ? b : null
        if (badge && logo) {
          const badgeZone = getMarketplaceRoleZoneRect('badge', format) || safeArea
          const logoZone = getMarketplaceRoleZoneRect('logo', format) || safeArea

          let movedPair = false
          let bestBadgeRect = badge.rect
          let bestBadgePenalty = getMarketplaceRoleCandidatePenalty(workingBoxes, badge, format, compositionModel, badgeZone)
          for (const candidateRect of buildMarketplaceAnchorCandidates(badge, badgeZone, format)) {
            const candidateBadge = clone(badge)
            candidateBadge.rect = clone(candidateRect)
            const penalty = getMarketplaceRoleCandidatePenalty(workingBoxes, candidateBadge, format, compositionModel, badgeZone)
            if (penalty + 0.01 < bestBadgePenalty) {
              bestBadgePenalty = penalty
              bestBadgeRect = clone(candidateRect)
            }
          }
          if (bestBadgeRect.x !== badge.rect.x || bestBadgeRect.y !== badge.rect.y || bestBadgeRect.w !== badge.rect.w || bestBadgeRect.h !== badge.rect.h) {
            badge.rect = bestBadgeRect
            changed = true
            movedPair = true
            applied.push('spacing:badge-logo-badge')
          }

          if (!movedPair) {
            let bestLogoRect = logo.rect
            let bestLogoPenalty = getMarketplaceRoleCandidatePenalty(workingBoxes, logo, format, compositionModel, logoZone)
            for (const candidateRect of buildMarketplaceAnchorCandidates(logo, logoZone, format)) {
              const candidateLogo = clone(logo)
              candidateLogo.rect = clone(candidateRect)
              const penalty = getMarketplaceRoleCandidatePenalty(workingBoxes, candidateLogo, format, compositionModel, logoZone)
              if (penalty + 0.01 < bestLogoPenalty) {
                bestLogoPenalty = penalty
                bestLogoRect = clone(candidateRect)
              }
            }
            if (bestLogoRect.x !== logo.rect.x || bestLogoRect.y !== logo.rect.y || bestLogoRect.w !== logo.rect.w || bestLogoRect.h !== logo.rect.h) {
              logo.rect = bestLogoRect
              changed = true
              applied.push('spacing:badge-logo-logo')
            }
          }
          continue
        }
      }
      const movable =
        getMarketplaceStabilizationPriority(a.kind) >= getMarketplaceStabilizationPriority(b.kind) ? b : a
      const anchor = movable.id === a.id ? b : a
      const deficit = Math.max(violation.area, 0)
      const maxVerticalShift = Math.max(pxToPercentY(8, format), format.key === 'marketplace-tile' ? 5 : 3)
      const maxHorizontalShift = Math.max(pxToPercentX(8, format), format.key === 'marketplace-tile' ? 4 : 2.6)
      const dyMagnitude = Math.min(deficit + 0.8, maxVerticalShift)
      const dxMagnitude = Math.min(deficit + 0.8, maxHorizontalShift)
      const primaryDy = anchor.rect.y <= movable.rect.y ? dyMagnitude : -dyMagnitude
      const primaryDx = anchor.rect.x <= movable.rect.x ? dxMagnitude : -dxMagnitude
      const candidateRects: Rect[] = [
        { ...movable.rect, x: movable.rect.x, y: movable.rect.y + primaryDy },
        { ...movable.rect, x: movable.rect.x + primaryDx, y: movable.rect.y },
      ]
      if (movable.kind === 'cta') {
        const compactW = Math.max(movable.rect.w * (format.key === 'marketplace-tile' ? 0.86 : 0.92), 10)
        const compactH = Math.max(movable.rect.h * 0.94, 4)
        candidateRects.push(
          { x: movable.rect.x, y: movable.rect.y + primaryDy, w: compactW, h: compactH },
          { x: movable.rect.x + primaryDx, y: movable.rect.y, w: compactW, h: compactH }
        )
      } else if (movable.kind === 'image') {
        const compactW = Math.max(movable.rect.w * 0.92, 18)
        const compactH = Math.max(movable.rect.h * 0.92, 18)
        candidateRects.push(
          { x: movable.rect.x + primaryDx, y: movable.rect.y + primaryDy, w: compactW, h: compactH },
          { x: movable.rect.x, y: movable.rect.y + primaryDy, w: compactW, h: compactH }
        )
      }
      const zoneIssue = collectMarketplaceRolePlacementIssues(workingBoxes, format).find((issue) => issue.kind === movable.kind)
      const zone = zoneIssue?.zone || safeArea
      let bestRect = movable.rect
      let bestPenalty = getMarketplaceRoleCandidatePenalty(workingBoxes, movable, format, compositionModel, zone)
      for (const candidateRect of candidateRects) {
        const candidateBox = clone(movable)
        candidateBox.rect = clone(candidateRect)
        moveBoxWithinCanvas(candidateBox, zone, 0, 0)
        const penalty = getMarketplaceRoleCandidatePenalty(workingBoxes, candidateBox, format, compositionModel, zone)
        if (penalty + 0.01 < bestPenalty) {
          bestPenalty = penalty
          bestRect = clone(candidateBox.rect)
        }
      }
      if (bestRect.x !== movable.rect.x || bestRect.y !== movable.rect.y || bestRect.w !== movable.rect.w || bestRect.h !== movable.rect.h) {
        movable.rect = bestRect
        changed = true
        applied.push(`spacing:${movable.kind}`)
      }
    }

    if (!changed) break

    const candidateScene = syncSceneWithBoxes(bestScene, format, workingBoxes)
    const candidateMetrics = getMarketplaceStabilizationMetrics(candidateScene, format, compositionModel)
    const improved =
      getStructuralRank(candidateMetrics.structuralState) > getStructuralRank(bestMetrics.structuralState) ||
      (
        candidateMetrics.spacingViolationCount < bestMetrics.spacingViolationCount &&
        candidateMetrics.rolePlacementCount <= bestMetrics.rolePlacementCount
      ) ||
      (
        candidateMetrics.rolePlacementCount < bestMetrics.rolePlacementCount &&
        candidateMetrics.spacingViolationCount <= bestMetrics.spacingViolationCount
      )
    if (improved) {
      bestScene = candidateScene
      bestMetrics = candidateMetrics
      workingBoxes = buildSceneLayoutBoxes(candidateScene, format).boxes.map((box) => clone(box))
    } else {
      break
    }
  }

  const accepted =
    getStructuralRank(bestMetrics.structuralState) > getStructuralRank(originalMetrics.structuralState) ||
    (
      bestMetrics.spacingViolationCount < originalMetrics.spacingViolationCount &&
      bestMetrics.rolePlacementCount <= originalMetrics.rolePlacementCount
    ) ||
    (
      bestMetrics.rolePlacementCount < originalMetrics.rolePlacementCount &&
      bestMetrics.spacingViolationCount <= originalMetrics.spacingViolationCount
    )

  maybeLogMarketplaceStabilization({
    format,
    before: originalMetrics,
    after: bestMetrics,
    applied,
  })

  return accepted ? bestScene : scene
}

function lateStageMarketplaceImageShrinkScale(phase: 'collision-landscape' | 'collision-portrait' | 'spacing'): number {
  if (phase === 'spacing') return 0.96
  if (phase === 'collision-landscape') return 0.94
  return 0.95
}

function moveBoxWithinCanvas(box: LayoutBox, canvas: Rect, dx: number, dy: number) {
  box.rect.x = clamp(box.rect.x + dx, canvas.x, canvas.x + canvas.w - box.rect.w)
  box.rect.y = clamp(box.rect.y + dy, canvas.y, canvas.y + canvas.h - box.rect.h)
}

function shrinkBox(box: LayoutBox, canvas: Rect, scale: number) {
  const nextW = Math.max(box.rect.w * scale, 4)
  const nextH = Math.max(box.rect.h * scale, 3)
  box.rect.w = Math.min(nextW, canvas.w)
  box.rect.h = Math.min(nextH, canvas.h)
  box.rect.x = clamp(box.rect.x, canvas.x, canvas.x + canvas.w - box.rect.w)
  box.rect.y = clamp(box.rect.y, canvas.y, canvas.y + canvas.h - box.rect.h)
}

export function resolveBoxCollisions(
  boxes: LayoutBox[],
  canvas: Rect,
  compositionModel?: CompositionModel | null,
  format?: FormatDefinition
): LayoutBox[] {
  const resolved = boxes.map((box) => clone(box))
  for (let pass = 0; pass < 6; pass += 1) {
    const collisions = detectBoxCollisions(resolved, compositionModel)
    if (!collisions.length) break
    for (const collision of collisions) {
      const a = resolved.find((box) => box.id === collision.a)
      const b = resolved.find((box) => box.id === collision.b)
      if (!a || !b) continue
      const movable = (a.locked ? b : b.locked ? a : BOX_PRIORITY[a.kind] >= BOX_PRIORITY[b.kind] ? b : a)
      const anchor = movable.id === a.id ? b : a
      const pushX = collision.overlapX > collision.overlapY
      if (movable.kind === 'cta') {
        moveBoxWithinCanvas(movable, canvas, pushX ? 0 : collision.overlapX * 0.1, pushX ? collision.overlapY + 1.5 : 0)
      } else if (movable.kind === 'image') {
        if (canvas.w > canvas.h) {
          shrinkBox(movable, canvas, lateStageMarketplaceImageShrinkScale('collision-landscape'))
          moveBoxWithinCanvas(movable, canvas, anchor.rect.x < movable.rect.x ? 1.5 : -1.5, 0)
        } else {
          shrinkBox(movable, canvas, lateStageMarketplaceImageShrinkScale('collision-portrait'))
          moveBoxWithinCanvas(movable, canvas, 0, 1.5)
        }
      } else if (movable.kind === 'headline') {
        movable.rect.w = Math.max(movable.rect.w - 2, 20)
        moveBoxWithinCanvas(movable, canvas, anchor.rect.x < movable.rect.x ? 1.2 : -1.2, 0)
      } else if (movable.kind === 'subtitle' || movable.kind === 'body') {
        moveBoxWithinCanvas(movable, canvas, 0, anchor.rect.y < movable.rect.y ? 1.2 : -1.2)
        movable.rect.w = Math.max(movable.rect.w - 1.4, 18)
      } else if (movable.kind === 'logo' || movable.kind === 'badge') {
        moveBoxWithinCanvas(movable, canvas, anchor.rect.x < movable.rect.x ? 1.5 : -1.5, anchor.rect.y < movable.rect.y ? 1.2 : -1.2)
      }
    }
  }
  return resolved
}

function resolveSpacingConflicts(
  boxes: LayoutBox[],
  canvas: Rect,
  format: FormatDefinition,
  compositionModel?: CompositionModel | null
) {
  const resolved = boxes.map((box) => clone(box))
  for (let pass = 0; pass < 4; pass += 1) {
    const violations = detectSpacingViolations(resolved, 12, format, compositionModel)
    if (!violations.length) break
    for (const violation of violations) {
      const a = resolved.find((box) => box.id === violation.a)
      const b = resolved.find((box) => box.id === violation.b)
      if (!a || !b) continue
      const movable = (a.locked ? b : b.locked ? a : BOX_PRIORITY[a.kind] >= BOX_PRIORITY[b.kind] ? b : a)
      const anchor = movable.id === a.id ? b : a
      const gap = getPairGap(movable.kind, anchor.kind, format)
      const currentGap = gapBetweenRects(movable.rect, anchor.rect)
      const deficit = Math.max(gap - currentGap, 0)
      if (deficit <= 0) continue

      if (movable.kind === 'cta') {
        moveBoxWithinCanvas(movable, canvas, 0, anchor.rect.y <= movable.rect.y ? deficit + 1 : -(deficit + 1))
      } else if (movable.kind === 'headline' || movable.kind === 'subtitle' || movable.kind === 'body') {
        if (anchor.kind === 'image') {
          if (anchor.rect.x <= movable.rect.x) moveBoxWithinCanvas(movable, canvas, deficit + 1.5, 0)
          else moveBoxWithinCanvas(movable, canvas, -(deficit + 1.5), 0)
          movable.rect.w = Math.max(movable.rect.w - 1.5, 18)
        } else {
          moveBoxWithinCanvas(movable, canvas, 0, anchor.rect.y <= movable.rect.y ? deficit + 1 : -(deficit + 1))
        }
      } else if (movable.kind === 'image') {
        shrinkBox(movable, canvas, lateStageMarketplaceImageShrinkScale('spacing'))
        moveBoxWithinCanvas(movable, canvas, anchor.rect.x < movable.rect.x ? 1.5 : -1.5, 0)
      } else {
        moveBoxWithinCanvas(movable, canvas, anchor.rect.x <= movable.rect.x ? deficit + 1 : -(deficit + 1), 0)
      }
    }
  }
  return resolved
}

export function rebuildTextCluster(
  scene: Scene,
  context: { format: FormatDefinition; actions?: FixAction[] }
) {
  const actions = context.actions?.length
    ? context.actions
    : (['rebalance-text-cluster', 'widen-text-container', 'increase-cluster-padding'] as FixAction[])
  return actions.reduce((current, action) => applyFixAction({ scene: current, action, format: context.format }), clone(scene))
}

export function rebuildImageRegion(
  scene: Scene,
  context: { format: FormatDefinition; actions?: FixAction[] }
) {
  const actions = context.actions?.length
    ? context.actions
    : (['recompute-image-crop', 'change-image-anchor', 'switch-image-role'] as FixAction[])
  return actions.reduce((current, action) => applyFixAction({ scene: current, action, format: context.format }), clone(scene))
}

export function rebuildImageTextRelationship(
  scene: Scene,
  context: { format: FormatDefinition; actions?: FixAction[] }
) {
  const actions = context.actions?.length
    ? context.actions
    : (['rebalance-split-ratio', 'reduce-dead-space'] as FixAction[])
  return actions.reduce((current, action) => applyFixAction({ scene: current, action, format: context.format }), clone(scene))
}

function getStructuralRank(state: StructuralLayoutState) {
  if (state.status === 'valid') return 2
  if (state.status === 'degraded') return 1
  return 0
}

function isStructuralStateBetter(next: StructuralLayoutState, current: StructuralLayoutState) {
  const tierDelta = getStructuralRank(next) - getStructuralRank(current)
  if (tierDelta !== 0) return tierDelta > 0
  const nextHigh = next.findings.filter((finding) => finding.severity === 'high').length
  const currentHigh = current.findings.filter((finding) => finding.severity === 'high').length
  if (nextHigh !== currentHigh) return nextHigh < currentHigh
  if (next.findings.length !== current.findings.length) return next.findings.length < current.findings.length
  return false
}

function repackSceneForValidity(input: {
  scene: Scene
  master: Scene
  format: FormatDefinition
  profile: ContentProfile
  palette: PalettePlan
  typography: TypographyPlan
  intent: LayoutIntent
  brandKit: BrandKit
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
  compositionModel?: CompositionModel | null
  structuralState: StructuralLayoutState
}) {
  let bestScene = input.scene
  let bestState = input.structuralState
  const ruleSet = getFormatRuleSet(input.format)
  const contract = getArchetypeLayoutContract(input.intent, input.format, input.profile, ruleSet, {
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })
  const insets = getSafeInsets(input.format, input.brandKit.safeZone)
  const safeFallbackArchetype = getFormatSafeFallbackArchetype(input.format)
  const shouldForceSafeFallback = safeFallbackArchetype !== getResolvedArchetype(input.intent)
  const preserveProductSupportLayout = isImageBackedProductSupportLayout({
    format: input.format,
    intent: input.intent,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })
  const preserveTextFirstLayout =
    input.format.key === 'marketplace-card' && input.intent.marketplaceTemplateId === 'text-first-promo'
  const proofBandTextFirst = input.intent.marketplaceTemplateVariant === 'proof-band'
  const noImageTextFirst = input.intent.marketplaceTemplateSelection?.inputProfile.imageRegime === 'no-image'
  const proofHeavyTextFirst =
    input.intent.marketplaceTemplateSelection?.inputProfile.proofPresence !== 'none' ||
    input.intent.marketplaceTemplateSelection?.inputProfile.sellingAngle === 'trust-led' ||
    input.intent.marketplaceTemplateSelection?.inputProfile.sellingAngle === 'benefit-led'

  for (let pass = 0; pass < 2; pass += 1) {
    const baseZones = input.compositionModel
      ? buildModelZones(input.compositionModel, input.format, input.imageAnalysis)
      : buildFamilyZones({
          format: input.format,
          intent: input.intent,
          profile: input.profile,
          imageAnalysis: input.imageAnalysis,
          assetHint: input.assetHint,
          brandKit: input.brandKit,
          ruleSet,
        })
    let zones = adaptZonesToContract({
      zones: baseZones,
      contract,
      format: input.format,
      profile: input.profile,
      intent: input.intent,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    })
    const findingNames = new Set(bestState.findings.map((finding) => finding.name))
    if (
      !preserveProductSupportLayout &&
      !preserveTextFirstLayout &&
      (
        findingNames.has('image-dominance-sanity') ||
        findingNames.has('text-size-sanity') ||
        findingNames.has('structural-occupancy') ||
        contract.fallbackMode !== 'none' ||
        (pass > 0 && shouldForceSafeFallback)
      )
    ) {
      zones = applySafeArchetypeFallback(zones, contract, input.format, insets)
    }
    if (preserveTextFirstLayout && findingNames.has('structural-occupancy')) {
      const nextText = normalizeRegion({
        x: zones.text.x,
        y: noImageTextFirst ? (proofHeavyTextFirst ? 24 : clamp(zones.image.y + zones.image.h + 4, 28, 40)) : clamp(zones.text.y, 16, 24),
        w: Math.max(zones.text.w, noImageTextFirst ? 68 : proofBandTextFirst ? 54 : 50),
        h: Math.min(zones.text.h + (noImageTextFirst ? 2 : 4), noImageTextFirst ? 40 : 42),
      })
      zones = {
        ...zones,
        text: nextText,
        image: normalizeRegion({
          x: noImageTextFirst ? Math.min(zones.image.x, 8) : Math.max(zones.image.x, proofBandTextFirst ? 54 : 56),
          y: noImageTextFirst ? Math.min(zones.image.y, 10) : Math.min(zones.image.y, 10),
          w: Math.max(zones.image.w, noImageTextFirst ? (proofBandTextFirst ? 74 : 24) : (proofBandTextFirst ? 30 : 24)),
          h: Math.max(zones.image.h, noImageTextFirst ? (proofBandTextFirst ? 12 : 16) : (proofBandTextFirst ? 22 : 18)),
        }),
        cta: normalizeRegion({
          x: nextText.x,
          y: clamp(nextText.y + nextText.h + 2, noImageTextFirst ? (proofHeavyTextFirst ? 64 : 70) : (proofBandTextFirst ? 66 : 70), 82),
          w: Math.min(Math.max(zones.cta.w, proofBandTextFirst ? 20 : 18), proofBandTextFirst ? 24 : 22),
          h: clamp(zones.cta.h, 4.8, 6.4),
        }),
      }
    }
    if (findingNames.has('safe-area-compliance') || findingNames.has('minimum-spacing') || findingNames.has('major-overlap')) {
      if (preserveProductSupportLayout) {
        zones = {
          ...zones,
          text: normalizeRegion({
            x: zones.text.x,
            y: clamp(zones.text.y + 2, zones.text.y, 72),
            w: Math.max(zones.text.w - 6, input.intent.marketplaceTemplateVariant === 'image-dominant-square' ? 30 : 34),
            h: Math.min(zones.text.h + 4, 28),
          }),
          image: normalizeRegion({
            x: Math.max(zones.image.x - 1, 0),
            y: Math.max(zones.image.y - 1, 0),
            w: Math.max(zones.image.w, input.intent.marketplaceTemplateVariant === 'image-dominant-square' ? 40 : 36),
            h: Math.max(zones.image.h, input.intent.marketplaceTemplateVariant === 'image-dominant-square' ? 34 : 30),
          }),
          cta: normalizeRegion({
            x: zones.text.x,
            y: clamp(zones.text.y + zones.text.h + 2, 72, 84),
            w: Math.min(Math.max(zones.cta.w - 2, 18), 22),
            h: zones.cta.h,
          }),
        }
      } else if (preserveTextFirstLayout) {
        const nextText = normalizeRegion({
          x: zones.text.x,
          y: noImageTextFirst ? clamp(zones.image.y + zones.image.h + (proofHeavyTextFirst ? 2 : 4), proofHeavyTextFirst ? 24 : 28, 40) : clamp(zones.text.y, 16, 24),
          w: Math.max(zones.text.w, noImageTextFirst ? (proofHeavyTextFirst ? 68 : 64) : (proofBandTextFirst ? 54 : 50)),
          h: Math.min(zones.text.h + (noImageTextFirst ? (proofHeavyTextFirst ? -2 : 0) : 2), noImageTextFirst ? (proofHeavyTextFirst ? 36 : 40) : 40),
        })
        zones = {
          ...zones,
          text: nextText,
          image: normalizeRegion({
            x: noImageTextFirst ? Math.min(zones.image.x, 8) : Math.max(zones.image.x, proofBandTextFirst ? 54 : 56),
            y: noImageTextFirst ? Math.min(zones.image.y, 10) : Math.min(zones.image.y, 10),
            w: Math.max(zones.image.w, noImageTextFirst ? (proofBandTextFirst ? 74 : 24) : (proofBandTextFirst ? 30 : 22)),
            h: Math.max(zones.image.h, noImageTextFirst ? (proofBandTextFirst ? 12 : 16) : (proofBandTextFirst ? 22 : 18)),
          }),
          cta: normalizeRegion({
            x: nextText.x,
            y: clamp(nextText.y + nextText.h + 2, noImageTextFirst ? (proofHeavyTextFirst ? 64 : 72) : (proofBandTextFirst ? 66 : 70), 82),
            w: Math.min(Math.max(zones.cta.w, proofBandTextFirst ? 20 : 18), proofBandTextFirst ? 24 : 22),
            h: clamp(zones.cta.h, 4.8, 6.4),
          }),
        }
      } else {
        zones = adaptZonesToContract({
          zones: {
            ...zones,
            text: normalizeRegion({
              x: zones.text.x,
              y: zones.text.y,
              w: Math.max(zones.text.w - 2, 20),
              h: Math.min(zones.text.h + 6, 50),
            }),
            image: normalizeRegion({
              x: zones.image.x,
              y: zones.image.y,
              w: Math.max(zones.image.w - 6, 18),
              h: Math.max(zones.image.h - 6, 18),
            }),
          },
          contract,
          format: input.format,
          profile: input.profile,
          intent: input.intent,
          assetHint: input.assetHint,
          imageAnalysis: input.imageAnalysis,
        })
      }
    }

    let candidate = applyPalette(input.master, input.palette, input.assetHint)
    candidate = applyTypography(candidate, input.typography, input.brandKit)
    candidate.image.fit = getFit(input.imageAnalysis?.focalSuggestion || input.assetHint?.focalSuggestion)
    const blocks = buildLayoutBlocks({ master: candidate, format: input.format, profile: input.profile, typography: input.typography, intent: input.intent })
    candidate = packBlocks({
      blocks,
      scene: candidate,
      format: input.format,
      typography: input.typography,
      zones,
      ruleSet,
      intent: input.intent,
      profile: input.profile,
      compositionModel: input.compositionModel,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    })
    candidate = refineLayout({
      scene: candidate,
      intent: input.intent,
      format: input.format,
      profile: input.profile,
      brandKit: input.brandKit,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
    })
    candidate = clampElementToModel(candidate, input.format, input.compositionModel)
    candidate = preserveLateMarketplacePerceptualGeometry({
      scene: candidate,
      format: input.format,
      intent: input.intent,
      compositionModel: input.compositionModel,
    }).scene
    candidate = finalizeSceneGeometry(candidate, input.format, input.compositionModel)
    candidate = stabilizeMarketplaceLayout(candidate, input.format, input.compositionModel)
    candidate = preserveLateProductSupportGeometry({
      scene: candidate,
      format: input.format,
      intent: input.intent,
      assetHint: input.assetHint,
      imageAnalysis: input.imageAnalysis,
      compositionModel: input.compositionModel,
    })
    candidate = preserveLateTextFirstPromoGeometry({
      scene: candidate,
      format: input.format,
      intent: input.intent,
      compositionModel: input.compositionModel,
    })
    candidate = preserveLateMarketplaceFamilyGeometry({
      scene: candidate,
      format: input.format,
      intent: input.intent,
      compositionModel: input.compositionModel,
    }).scene
    const candidateState = evaluateStructuralLayoutState({ scene: candidate, format: input.format, compositionModel: input.compositionModel })
    if (isStructuralStateBetter(candidateState, bestState)) {
      bestScene = candidate
      bestState = candidateState
    }
  }

  return { scene: bestScene, structuralState: bestState }
}

export function rebuildGlobalComposition(
  scene: Scene,
  context: { format: FormatDefinition; actions?: FixAction[] }
) {
  const actions = context.actions?.length
    ? context.actions
    : (['increase-scale-to-canvas', 'change-layout-family'] as FixAction[])
  return actions.reduce((current, action) => applyFixAction({ scene: current, action, format: context.format }), clone(scene))
}

export function applyBlockFixes(
  scene: Scene,
  fixPlan: LayoutFixPlan,
  context: { format: FormatDefinition }
) {
  let next = clone(scene)
  for (const fix of fixPlan.blockFixes) {
    const actions = fix.actions
      .map((action) => mapBlockPlanAction(action, context.format))
      .filter((action): action is FixAction => Boolean(action))
    if (!actions.length) continue
    if (fix.target === 'image') {
      next = rebuildImageRegion(next, { format: context.format, actions })
      continue
    }
    if (fix.target === 'textCluster') {
      next = rebuildTextCluster(next, { format: context.format, actions })
      continue
    }
    if (fix.target === 'imageText') {
      next = rebuildImageTextRelationship(next, { format: context.format, actions })
      continue
    }
    if (fix.target === 'global') {
      next = rebuildGlobalComposition(next, { format: context.format, actions })
      continue
    }
    actions.forEach((action) => {
      next = applyFixAction({ scene: next, action, format: context.format })
    })
  }
  return next
}

export function synthesizeLayout({
  master,
  format,
  profile,
  palette,
  typography,
  intent,
  brandKit,
  assetHint,
  imageAnalysis,
}: {
  master: Scene
  format: FormatDefinition
  profile: ContentProfile
  palette: PalettePlan
  typography: TypographyPlan
  intent: LayoutIntent
  brandKit: BrandKit
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const ruleSet = getFormatRuleSet(format)
  const resolvedIntent =
    ruleSet.allowedLayoutFamilies.includes(intent.family)
      ? intent
      : { ...intent, family: ruleSet.allowedLayoutFamilies[0], presetId: ruleSet.allowedLayoutFamilies[0] }
  if (shouldSynthesizeMarketplaceLayoutV2(format, resolvedIntent) && resolvedIntent.marketplaceV2Archetype) {
    const effectiveIntent: LayoutIntent = {
      ...resolvedIntent,
      marketplaceTemplateId: undefined,
      marketplaceTemplateZones: undefined,
      marketplaceTemplateSelection: undefined,
      marketplaceTemplateSummary: undefined,
      marketplaceTemplateVariant: undefined,
      compositionModelId: undefined,
    }
    let scene = applyPalette(master, palette, assetHint)
    scene = applyTypography(scene, typography, brandKit)
    scene.image.fit = getFit(imageAnalysis?.focalSuggestion || assetHint?.focalSuggestion)
    scene = buildMarketplaceV2Scene({
      scene,
      format,
      typography,
      archetype: resolvedIntent.marketplaceV2Archetype,
    })
    scene = finalizeSceneGeometry(scene, format, null)
    scene = stabilizeMarketplaceLayout(scene, format, null)
    const structuralState = evaluateStructuralLayoutState({ scene, format, compositionModel: null })
    return { scene, blocks: [], intent: effectiveIntent, structuralState }
  }
  const useTemplateDrivenMarketplaceCard = format.key === 'marketplace-card' && Boolean(resolvedIntent.marketplaceTemplateId)
  const compositionModel = useTemplateDrivenMarketplaceCard
    ? null
    : selectCompositionModel({
        format,
        requestedModelId: resolvedIntent.compositionModelId,
        requestedFamily: resolvedIntent.family,
        denseText: profile.density === 'dense',
      })
  const effectiveIntent =
    compositionModel
      ? {
          ...resolvedIntent,
          compositionModelId: compositionModel.id,
          family: resolveCompositionModelFamily(compositionModel.id),
          presetId: resolveCompositionModelFamily(compositionModel.id),
        }
      : resolvedIntent
  let scene = applyPalette(master, palette, assetHint)
  scene = applyTypography(scene, typography, brandKit)
  scene.image.fit = getFit(imageAnalysis?.focalSuggestion || assetHint?.focalSuggestion)
  const blocks = buildLayoutBlocks({ master: scene, format, profile, typography, intent: effectiveIntent })
  const zones =
    compositionModel
      ? buildModelZones(compositionModel, format, imageAnalysis)
      : buildFamilyZones({ format, intent: effectiveIntent, profile, imageAnalysis, assetHint, brandKit, ruleSet })
  scene = packBlocks({
    blocks,
    scene,
    format,
    typography,
    zones,
    ruleSet,
    intent: effectiveIntent,
    profile,
    compositionModel,
    assetHint,
    imageAnalysis,
  })
  scene = refineLayout({ scene, intent: effectiveIntent, format, profile, brandKit, assetHint, imageAnalysis })
  scene = clampElementToModel(scene, format, compositionModel)
  scene = preserveLateMarketplacePerceptualGeometry({
    scene,
    format,
    intent: effectiveIntent,
    compositionModel,
  }).scene
  scene = finalizeSceneGeometry(scene, format, compositionModel)
  scene = stabilizeMarketplaceLayout(scene, format, compositionModel)
  scene = preserveLateProductSupportGeometry({
    scene,
    format,
    intent: effectiveIntent,
    assetHint,
    imageAnalysis,
    compositionModel,
  })
  scene = preserveLateTextFirstPromoGeometry({
    scene,
    format,
    intent: effectiveIntent,
    compositionModel,
  })
  scene = preserveLateMarketplaceFamilyGeometry({
    scene,
    format,
    intent: effectiveIntent,
    compositionModel,
  }).scene
  let structuralState = evaluateStructuralLayoutState({ scene, format, compositionModel })
  if (structuralState.status !== 'valid') {
    const repacked = repackSceneForValidity({
      scene,
      master,
      format,
      profile,
      palette,
      typography,
      intent: effectiveIntent,
      brandKit,
      assetHint,
      imageAnalysis,
      compositionModel,
      structuralState,
    })
    scene = repacked.scene
    structuralState = repacked.structuralState
  }
  return { scene, blocks, intent: effectiveIntent, structuralState }
}

export type SynthesisStageName =
  | 'packed'
  | 'refined'
  | 'rule-constrained'
  | 'finalized'
  | 'stabilized'
  | 'preserved'
  | 'perceptual-preserved'
  | 'family-shaped'
  | 'final-assessed'

export type SynthesisStageSnapshot = {
  stage: SynthesisStageName
  scene: Scene
  structuralState: StructuralLayoutState
  perceptualAdjustment?: MarketplacePerceptualAdjustment & {
    beforeSignals?: PerceptualSignals
    afterSignals?: PerceptualSignals
  }
}

export type MarketplaceTemplateZoneTrace = {
  templateZones?: ReservedRegions
  reservedZones: ReservedRegions
  adaptedZones: ReservedRegions
  zoneProfiles: Array<{
    id: MarketplaceZoneProfile['id']
    image: ReservedRegions['image']
    text: ReservedRegions['text']
    cta: ReservedRegions['cta']
  }>
}

export function getMarketplaceTemplateZoneTrace(input: {
  format: FormatDefinition
  profile: ContentProfile
  intent: LayoutIntent
  brandKit: BrandKit
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const ruleSet = getFormatRuleSet(input.format)
  const contract = getArchetypeLayoutContract(input.intent, input.format, input.profile, ruleSet, {
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })
  const reservedZones = buildFamilyZones({
    format: input.format,
    intent: input.intent,
    profile: input.profile,
    imageAnalysis: input.imageAnalysis,
    assetHint: input.assetHint,
    brandKit: input.brandKit,
    ruleSet,
  })
  const adaptedZones = adaptZonesToContract({
    zones: reservedZones,
    contract,
    format: input.format,
    profile: input.profile,
    intent: input.intent,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  })
  const zoneProfiles = buildMarketplaceZoneProfiles({
    zones: adaptedZones,
    format: input.format,
    contract,
    intent: input.intent,
    assetHint: input.assetHint,
    imageAnalysis: input.imageAnalysis,
  }).map((profile) => ({
    id: profile.id,
    image: profile.zones.image,
    text: profile.zones.text,
    cta: profile.zones.cta,
  }))

  return {
    templateZones: input.intent.marketplaceTemplateZones
      ? {
          image: input.intent.marketplaceTemplateZones.image,
          text: input.intent.marketplaceTemplateZones.text,
          logo: input.intent.marketplaceTemplateZones.logo,
          badge: input.intent.marketplaceTemplateZones.badge,
          cta: input.intent.marketplaceTemplateZones.cta,
        }
      : undefined,
    reservedZones,
    adaptedZones,
    zoneProfiles,
  } satisfies MarketplaceTemplateZoneTrace
}

export function getSynthesisStageDiagnostics({
  master,
  format,
  profile,
  palette,
  typography,
  intent,
  brandKit,
  assetHint,
  imageAnalysis,
}: {
  master: Scene
  format: FormatDefinition
  profile: ContentProfile
  palette: PalettePlan
  typography: TypographyPlan
  intent: LayoutIntent
  brandKit: BrandKit
  assetHint?: AssetHint
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const ruleSet = getFormatRuleSet(format)
  const resolvedIntent =
    ruleSet.allowedLayoutFamilies.includes(intent.family)
      ? intent
      : { ...intent, family: ruleSet.allowedLayoutFamilies[0], presetId: ruleSet.allowedLayoutFamilies[0] }
  if (shouldSynthesizeMarketplaceLayoutV2(format, resolvedIntent) && resolvedIntent.marketplaceV2Archetype) {
    const effectiveIntent: LayoutIntent = {
      ...resolvedIntent,
      marketplaceTemplateId: undefined,
      marketplaceTemplateZones: undefined,
      marketplaceTemplateSelection: undefined,
      marketplaceTemplateSummary: undefined,
      marketplaceTemplateVariant: undefined,
      compositionModelId: undefined,
    }
    let seeded = applyPalette(master, palette, assetHint)
    seeded = applyTypography(seeded, typography, brandKit)
    seeded.image.fit = getFit(imageAnalysis?.focalSuggestion || assetHint?.focalSuggestion)
    const slotScene = buildMarketplaceV2Scene({
      scene: seeded,
      format,
      typography,
      archetype: resolvedIntent.marketplaceV2Archetype,
    })
    const finalized = finalizeSceneGeometry(slotScene, format, null)
    const stabilized = stabilizeMarketplaceLayout(finalized, format, null)
    const slotState = evaluateStructuralLayoutState({ scene: slotScene, format, compositionModel: null })
    const finalizedState = evaluateStructuralLayoutState({ scene: finalized, format, compositionModel: null })
    const finalState = evaluateStructuralLayoutState({ scene: stabilized, format, compositionModel: null })
    return {
      blocks: [],
      intent: effectiveIntent,
      compositionModelId: undefined,
      repacked: false,
      stages: [
        { stage: 'packed', scene: slotScene, structuralState: slotState },
        { stage: 'finalized', scene: finalized, structuralState: finalizedState },
        { stage: 'stabilized', scene: stabilized, structuralState: finalState },
        { stage: 'final-assessed', scene: stabilized, structuralState: finalState },
      ],
    }
  }
  const useTemplateDrivenMarketplaceCard = format.key === 'marketplace-card' && Boolean(resolvedIntent.marketplaceTemplateId)
  const compositionModel = useTemplateDrivenMarketplaceCard
    ? null
    : selectCompositionModel({
        format,
        requestedModelId: resolvedIntent.compositionModelId,
        requestedFamily: resolvedIntent.family,
        denseText: profile.density === 'dense',
      })
  const effectiveIntent =
    compositionModel
      ? {
          ...resolvedIntent,
          compositionModelId: compositionModel.id,
          family: resolveCompositionModelFamily(compositionModel.id),
          presetId: resolveCompositionModelFamily(compositionModel.id),
        }
      : resolvedIntent

  let seeded = applyPalette(master, palette, assetHint)
  seeded = applyTypography(seeded, typography, brandKit)
  seeded.image.fit = getFit(imageAnalysis?.focalSuggestion || assetHint?.focalSuggestion)
  const blocks = buildLayoutBlocks({ master: seeded, format, profile, typography, intent: effectiveIntent })
  const zones =
    compositionModel
      ? buildModelZones(compositionModel, format, imageAnalysis)
      : buildFamilyZones({ format, intent: effectiveIntent, profile, imageAnalysis, assetHint, brandKit, ruleSet })

  const packed = packBlocks({
    blocks,
    scene: seeded,
    format,
    typography,
    zones,
    ruleSet,
    intent: effectiveIntent,
    profile,
    compositionModel,
    assetHint,
    imageAnalysis,
  })
  const packedState = evaluateStructuralLayoutState({ scene: packed, format, compositionModel })

  const refined = refineLayout({
    scene: packed,
    intent: effectiveIntent,
    format,
    profile,
    brandKit,
    assetHint,
    imageAnalysis,
  })
  const refinedState = evaluateStructuralLayoutState({ scene: refined, format, compositionModel })

  const clamped = clampElementToModel(refined, format, compositionModel)
  const ruleConstrained = applyRuleConstraints(clone(clamped), format, ruleSet)
  const ruleConstrainedState = evaluateStructuralLayoutState({ scene: ruleConstrained, format, compositionModel })
  const perceptualPreserved = preserveLateMarketplacePerceptualGeometry({
    scene: clamped,
    format,
    intent: effectiveIntent,
    compositionModel,
  })
  const perceptualPreservedState = evaluateStructuralLayoutState({
    scene: perceptualPreserved.scene,
    format,
    compositionModel,
  })

  const finalized = finalizeSceneGeometry(perceptualPreserved.scene, format, compositionModel)
  const finalizedState = evaluateStructuralLayoutState({ scene: finalized, format, compositionModel })
  const stabilized = stabilizeMarketplaceLayout(finalized, format, compositionModel)
  const stabilizedState = evaluateStructuralLayoutState({ scene: stabilized, format, compositionModel })
  const preserved = preserveLateProductSupportGeometry({
    scene: stabilized,
    format,
    intent: effectiveIntent,
    assetHint,
    imageAnalysis,
    compositionModel,
  })
  const preservedTextFirst = preserveLateTextFirstPromoGeometry({
    scene: preserved,
    format,
    intent: effectiveIntent,
    compositionModel,
  })
  const preservedTextFirstState = evaluateStructuralLayoutState({ scene: preservedTextFirst, format, compositionModel })
  const familyShaped = preserveLateMarketplaceFamilyGeometry({
    scene: preservedTextFirst,
    format,
    intent: effectiveIntent,
    compositionModel,
  })
  const preservedState = evaluateStructuralLayoutState({ scene: familyShaped.scene, format, compositionModel })

  let finalScene = familyShaped.scene
  let finalState = preservedState
  let repacked = false
  if (finalState.status !== 'valid') {
    const repackResult = repackSceneForValidity({
      scene: familyShaped.scene,
      master,
      format,
      profile,
      palette,
      typography,
      intent: effectiveIntent,
      brandKit,
      assetHint,
      imageAnalysis,
      compositionModel,
      structuralState: finalState,
    })
    finalScene = repackResult.scene
    finalState = repackResult.structuralState
    repacked = true
  }

  return {
    blocks,
    intent: effectiveIntent,
    compositionModelId: compositionModel?.id,
    repacked,
    stages: [
      { stage: 'packed', scene: packed, structuralState: packedState },
      { stage: 'refined', scene: refined, structuralState: refinedState },
      { stage: 'rule-constrained', scene: ruleConstrained, structuralState: ruleConstrainedState },
      {
        stage: 'perceptual-preserved',
        scene: perceptualPreserved.scene,
        structuralState: perceptualPreservedState,
        perceptualAdjustment: perceptualPreserved.diagnostics,
      },
      { stage: 'finalized', scene: finalized, structuralState: finalizedState },
      { stage: 'stabilized', scene: stabilized, structuralState: stabilizedState },
      { stage: 'preserved', scene: preservedTextFirst, structuralState: preservedTextFirstState },
      {
        stage: 'family-shaped',
        scene: familyShaped.scene,
        structuralState: preservedState,
        perceptualAdjustment: familyShaped.diagnostics,
      },
      { stage: 'final-assessed', scene: finalScene, structuralState: finalState },
    ] satisfies SynthesisStageSnapshot[],
  }
}

export function applyFixAction({
  scene,
  action,
  format,
  imageAnalysis,
  compositionModel,
}: {
  scene: Scene
  action: FixAction
  format: FormatDefinition
  imageAnalysis?: EnhancedImageAnalysis
  compositionModel?: CompositionModel | null
}) {
  const next = clone(scene)

  if (action === 'increase-headline-size') action = 'expand-title'
  if (action === 'reduce-headline-size') action = 'compress-title'
  if (action === 'increase-cta-prominence') action = 'promote-cta'
  if (action === 'increase-image-presence') action = 'increase-image-dominance'
  if (action === 'reduce-image-presence') action = 'reduce-image-dominance'
  if (action === 'change-layout-family') action = 'switch-layout'
  if (action === 'lighten-overlay') action = 'boost-contrast'
  if (action === 'darken-overlay') action = 'boost-contrast'
  if (action === 'reflow-headline') action = 'improve-line-breaks'
  if (action === 'expand-text-region') action = 'widen-text-container'
  if (action === 'compress-text-region') action = 'narrow-text-container'

  if (action === 'boost-contrast') {
    next.subtitle.opacity = Math.min((next.subtitle.opacity || 0.82) + 0.08, 0.98)
    next.logo.bgOpacity = Math.min((next.logo.bgOpacity || 0.16) + 0.08, 0.34)
    next.badge.bgOpacity = Math.min((next.badge.bgOpacity || 1) * 0.92, 1)
  }

  if (action === 'expand-spacing') {
    next.subtitle.y = (next.subtitle.y || 0) + 1.6
    next.cta.y = (next.cta.y || 0) + 2
    next.badge.y = Math.max((next.badge.y || 0) - 1, 4)
  }

  if (action === 'rebalance-text-cluster') {
    next.title.y = Math.max((next.title.y || 0) - 3, 18)
    next.subtitle.y = Math.max((next.subtitle.y || 0) - 2.2, 24)
    next.cta.y = Math.max((next.cta.y || 0) - 1.8, 30)
    if (format.family === 'wide' || format.family === 'landscape') {
      next.title.x = Math.max((next.title.x || 0) + 1, 5)
      next.subtitle.x = next.title.x
      next.cta.x = next.title.x
    }
  }

  if (action === 'raise-text-cluster') {
    next.title.y = Math.max((next.title.y || 0) - 4, 14)
    next.subtitle.y = Math.max((next.subtitle.y || 0) - 3.4, 20)
    next.cta.y = Math.max((next.cta.y || 0) - 2.8, 26)
  }

  if (action === 'expand-title') {
    next.title.fontSize = Math.min((next.title.fontSize || 32) + (format.family === 'wide' ? 2 : 3), format.family === 'wide' ? 56 : 112)
    next.title.w = Math.max((next.title.w || 48) - 2, format.family === 'wide' ? 24 : 34)
  }

  if (action === 'compress-title') {
    next.title.fontSize = Math.max((next.title.fontSize || 32) - 2, format.family === 'skyscraper' ? 16 : 22)
    next.title.w = Math.min((next.title.w || 48) + 4, 86)
    next.title.maxLines = Math.min((next.title.maxLines || 3) + 1, 5)
  }

  if (action === 'compress-subtitle') {
    next.subtitle.fontSize = Math.max((next.subtitle.fontSize || 16) - 1, format.family === 'skyscraper' ? 10 : 12)
    next.subtitle.w = Math.min((next.subtitle.w || 52) + 4, 88)
    next.subtitle.maxLines = Math.min((next.subtitle.maxLines || 4) + 1, 6)
  }

  if (action === 'promote-cta') {
    next.cta.w = Math.min((next.cta.w || 16) + (format.family === 'wide' ? 2 : 3), format.family === 'skyscraper' ? 54 : 38)
    next.cta.h = Math.min((next.cta.h || 6) + (format.family === 'wide' ? 1 : 0.4), format.family === 'wide' ? 15 : 8)
    next.cta.fontSize = Math.min((next.cta.fontSize || 16) + 1, 22)
  }

  if (action === 'move-cta-closer-to-text') {
    next.cta.y = Math.max((next.cta.y || 0) - 2.2, (next.subtitle.y || 0) + 6)
  }

  if (action === 'promote-offer') {
    next.badge.w = Math.min((next.badge.w || 12) + 2, format.family === 'skyscraper' ? 36 : 30)
    next.badge.fontSize = Math.min((next.badge.fontSize || 14) + 1, 20)
    next.badge.bgOpacity = 1
  }

  if (action === 'reduce-image-dominance') {
    next.image.w = Math.max((next.image.w || 50) - (format.family === 'wide' ? 6 : 5), 16)
    next.image.h = Math.max((next.image.h || 50) - (format.family === 'wide' ? 6 : 5), 18)
  }

  if (action === 'increase-image-dominance') {
    next.image.w = Math.min((next.image.w || 50) + (format.family === 'wide' ? 8 : 6), 94)
    next.image.h = Math.min((next.image.h || 50) + (format.family === 'wide' ? 5 : 7), 92)
    if (format.family === 'landscape' || format.family === 'wide') {
      next.image.x = Math.max((next.image.x || 0) - 5, 40)
    }
  }

  if (action === 'recompute-image-crop') {
    return applyRecomputeImageCrop({ format, scene: next, imageAnalysis })
  }

  if (action === 'change-image-anchor') {
    return applyChangeImageAnchor({ format, scene: next, imageAnalysis })
  }

  if (action === 'change-image-shape') {
    return applyChangeImageShape({ format, scene: next })
  }

  if (action === 'switch-image-role') {
    if (format.family === 'wide' || format.family === 'landscape') {
      next.image.w = Math.min((next.image.w || 32) + 10, 52)
      next.image.h = Math.min((next.image.h || 70) + 8, 88)
      next.image.x = Math.max((next.image.x || 56) - 8, 34)
      next.title.w = Math.min((next.title.w || 36) + 4, 50)
    } else if (format.family === 'portrait' || format.family === 'printPortrait') {
      next.image.x = 4
      next.image.y = 4
      next.image.w = 92
      next.image.h = Math.min((next.image.h || 38) + 12, 88)
      next.title.y = Math.max((next.title.y || 50) - 4, 44)
    }
  }

  if (action === 'increase-scale-to-canvas') {
    const imageBoost = format.key === 'print-billboard' ? 12 : format.key === 'display-billboard' ? 9 : 8
    next.image.w = Math.min((next.image.w || 40) + imageBoost, 94)
    next.image.h = Math.min((next.image.h || 60) + (format.key === 'print-billboard' ? 10 : 8), 92)
    next.title.fontSize = Math.min((next.title.fontSize || 32) + (format.key === 'print-billboard' ? 10 : format.family === 'wide' ? 6 : 4), 140)
    next.title.w = Math.min((next.title.w || 40) + (format.key === 'display-leaderboard' ? 4 : 6), 84)
    next.subtitle.w = Math.min((next.subtitle.w || 36) + (format.key === 'display-leaderboard' ? 2 : 5), 84)
    if (format.key === 'print-billboard' || format.key === 'display-billboard') {
      next.image.x = Math.max((next.image.x || 0) - 4, 28)
      next.title.x = Math.max((next.title.x || 0) - 1, 4)
      next.subtitle.x = next.title.x
      next.cta.x = next.title.x
    }
  }

  if (action === 'switch-to-text-first') {
    next.image.w = Math.max((next.image.w || 36) - (format.family === 'wide' ? 8 : 6), 18)
    next.image.h = Math.max((next.image.h || 60) - 4, 22)
    next.title.w = Math.min((next.title.w || 38) + 8, 84)
    next.subtitle.w = Math.min((next.subtitle.w || 34) + 8, 84)
    next.title.fontSize = Math.min((next.title.fontSize || 32) + 3, 120)
    next.title.x = Math.max((next.title.x || 8) - 2, 4)
    next.subtitle.x = next.title.x
    next.cta.x = next.title.x
  }

  if (action === 'switch-to-image-first') {
    next.image.w = Math.min((next.image.w || 36) + (format.family === 'wide' ? 10 : 8), 94)
    next.image.h = Math.min((next.image.h || 60) + (format.family === 'wide' ? 8 : 6), 92)
    next.title.w = Math.max((next.title.w || 40) - 4, 24)
    next.subtitle.w = Math.max((next.subtitle.w || 36) - 4, 24)
    if (format.family === 'wide' || format.family === 'landscape') {
      next.image.x = Math.max((next.image.x || 56) - 8, 34)
    }
  }

  if (action === 'reduce-dead-space') {
    if (format.family === 'wide' || format.family === 'landscape') {
      next.image.w = Math.min((next.image.w || 30) + 6, 48)
      next.image.x = Math.max((next.image.x || 0) - 5, 40)
      next.title.w = Math.min((next.title.w || 30) + 4, 48)
      next.subtitle.w = Math.min((next.subtitle.w || 28) + 4, 44)
    } else {
      next.title.y = Math.max((next.title.y || 0) - 4, 14)
      next.subtitle.y = Math.max((next.subtitle.y || 0) - 3, 20)
      next.cta.y = Math.max((next.cta.y || 0) - 2, 26)
    }
  }

  if (action === 'rebalance-split-ratio') {
    const ruleSet = getFormatRuleSet(format)
    const footprintAdjusted = applyRecomputeImageFootprint({ format, scene: next, imageAnalysis })
    // If footprint recompute had nothing to do (already within coverage), keep legacy split-tuning for specific formats.
    if (footprintAdjusted.image.w !== next.image.w || footprintAdjusted.image.h !== next.image.h) {
      return footprintAdjusted
    }
    if (format.key === 'display-leaderboard') {
      next.image.w = clamp((next.image.w || 18) + 2, 8, 14)
      next.image.h = clamp((next.image.h || 58) - 2, 40, 66)
      next.title.w = Math.min((next.title.w || 32) + 6, 44)
      next.subtitle.w = Math.min((next.subtitle.w || 28) + 4, 34)
      next.cta.w = Math.min((next.cta.w || 16) + 2, 24)
      next.cta.x = Math.min((next.cta.x || 0) + 1, 70)
      next.title.y = Math.max((next.title.y || 0) - 1.2, 14)
      next.subtitle.y = Math.max((next.subtitle.y || 0) - 0.8, 18)
    } else if (format.family === 'wide' || format.family === 'landscape') {
      next.image.w = Math.min((next.image.w || 30) + 7, 50)
      next.image.x = Math.max((next.image.x || 0) - 7, 36)
      next.title.w = Math.min((next.title.w || 32) + 5, 50)
      next.subtitle.w = Math.min((next.subtitle.w || 30) + 5, 46)
      next.title.x = Math.max((next.title.x || 6) - 1, 4)
      next.subtitle.x = next.title.x
      next.cta.x = next.title.x
    } else if (format.key === 'display-skyscraper') {
      next.image.h = Math.min((next.image.h || 34) + 6, 42)
      next.title.y = Math.max((next.title.y || 46) - 3, 28)
      next.subtitle.y = Math.max((next.subtitle.y || 60) - 3, 38)
      next.cta.y = Math.max((next.cta.y || 86) - 3, 76)
    } else if (format.family === 'portrait' || format.family === 'printPortrait') {
      next.image.h = Math.min((next.image.h || 36) + 6, 48)
      next.title.y = Math.max((next.title.y || 50) - 3, 42)
      next.subtitle.y = Math.max((next.subtitle.y || 66) - 2, 54)
    }
    // Ensure we didn't violate format coverage constraints too much.
    return applyRecomputeImageFootprint({ format, scene: next, imageAnalysis })
  }

  if (action === 'widen-text-container') {
    next.title.w = Math.min((next.title.w || 42) + 4, format.family === 'wide' ? 42 : 80)
    next.subtitle.w = Math.min((next.subtitle.w || 40) + 4, format.family === 'wide' ? 38 : 82)
    next.title.charsPerLine = Math.min((next.title.charsPerLine || 20) + 2, 32)
    next.subtitle.charsPerLine = Math.min((next.subtitle.charsPerLine || 30) + 2, 42)
  }

  if (action === 'narrow-text-container') {
    next.title.w = Math.max((next.title.w || 42) - 4, 24)
    next.subtitle.w = Math.max((next.subtitle.w || 40) - 4, 24)
    next.title.charsPerLine = Math.max((next.title.charsPerLine || 20) - 2, 12)
    next.subtitle.charsPerLine = Math.max((next.subtitle.charsPerLine || 30) - 2, 16)
  }

  if (action === 'move-logo-to-anchor') {
    next.logo.x = format.family === 'wide' ? 4.8 : 6
    next.logo.y = format.family === 'wide' ? 6.6 : 5.6
    if (format.key === 'social-square') {
      next.logo.w = clamp(next.logo.w || 0, 10, 16)
      next.logo.h = clamp(next.logo.h || 0, 4, 7)
    }
  }

  if (action === 'increase-cluster-padding') {
    next.subtitle.y = (next.subtitle.y || 0) + 1.2
    next.cta.y = (next.cta.y || 0) + 1.8
  }

  if (action === 'improve-line-breaks') {
    next.title.w = Math.min((next.title.w || 42) + 5, format.key === 'social-square' ? 70 : 82)
    next.title.charsPerLine = Math.min((next.title.charsPerLine || 20) + 2, 32)
    next.title.maxLines = Math.min((next.title.maxLines || 3) + 1, 5)
    next.subtitle.w = Math.min((next.subtitle.w || 40) + 4, format.key === 'social-square' ? 68 : 84)
    next.subtitle.charsPerLine = Math.min((next.subtitle.charsPerLine || 30) + 2, 42)
    if (format.key === 'social-square') {
      next.subtitle.fontSize = Math.max((next.subtitle.fontSize || 16) - 1, 14)
    }
  }

  if (action === 'switch-layout') {
    if (format.category === 'presentation') {
      next.image.x = 58
      next.image.y = 14
      next.image.w = 34
      next.image.h = 64
      next.image.rx = 16
      next.title.x = 8
      next.title.y = 24
      next.title.w = 42
      next.subtitle.x = 8
      next.subtitle.y = 48
      next.subtitle.w = 38
      next.cta.x = 8
      next.cta.y = 74
      next.cta.w = Math.min(Math.max(next.cta.w || 18, 16), 22)
      next.badge.x = 8
      next.badge.y = 14
    } else if (format.family === 'wide') {
      next.image.x = 54
      next.image.y = 8
      next.image.w = 40
      next.image.h = 80
      next.title.x = 5
      next.title.y = 24
      next.title.w = 38
      next.subtitle.x = 5
      next.subtitle.y = 48
      next.subtitle.w = 34
      next.cta.x = 5
      next.cta.y = 74
      next.badge.x = 5
      next.badge.y = 16
    } else if (format.family === 'landscape') {
      next.image.x = 56
      next.image.y = 12
      next.image.w = 36
      next.image.h = 70
      next.title.x = 6
      next.title.y = 22
      next.title.w = 46
      next.subtitle.x = 6
      next.subtitle.y = 46
      next.subtitle.w = 40
      next.cta.x = 6
      next.cta.y = 72
      next.badge.x = 6
      next.badge.y = 14
    } else if (format.family === 'portrait' || format.family === 'printPortrait' || format.family === 'skyscraper') {
      next.image.x = format.family === 'skyscraper' ? 10 : 8
      next.image.y = 6
      next.image.w = format.family === 'skyscraper' ? 80 : 84
      next.image.h = format.family === 'skyscraper' ? 34 : 42
      next.title.x = format.family === 'skyscraper' ? 10 : 8
      next.title.y = format.family === 'skyscraper' ? 42 : 50
      next.title.w = format.family === 'skyscraper' ? 76 : 74
      next.subtitle.x = next.title.x
      next.subtitle.y = format.family === 'skyscraper' ? 62 : 64
      next.subtitle.w = format.family === 'skyscraper' ? 72 : 68
      next.cta.x = next.title.x
      next.cta.y = format.family === 'skyscraper' ? 84 : 82
      next.cta.w = Math.max(next.cta.w || 18, format.family === 'skyscraper' ? 28 : 20)
    } else {
      next.image.x = 52
      next.image.y = 10
      next.image.w = 34
      next.image.h = 40
      next.image.rx = 18
      next.title.x = 8
      next.title.y = 60
      next.title.w = 60
      next.subtitle.x = 8
      next.subtitle.y = 74
      next.subtitle.w = 54
      next.cta.x = 8
      next.cta.y = 88
      next.cta.w = Math.max(next.cta.w || 18, 18)
      next.logo.x = 6
      next.logo.y = 6
      next.badge.x = 74
      next.badge.y = 8
    }
  }

  return finalizeSceneGeometry(next, format, compositionModel)
}
