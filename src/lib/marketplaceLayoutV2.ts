import type {
  ContentProfile,
  EnhancedImageAnalysis,
  FormatDefinition,
  FormatKey,
  LayoutIntent,
  MarketplaceV2ArchetypeId,
  Scene,
  StructuralArchetype,
  TypographyPlan,
} from './types'
import { getFormatRuleSet } from './formatRules'
import { applyTextBoxToSceneElement, clampTextBoxToRegion, fitSceneTextToRule } from './textGeometry'

export type { MarketplaceV2ArchetypeId } from './types'

// V2 is the default layout path as of 2026-04-09.
// V1 fallback is preserved in layoutEngine.ts for rollback — do not delete until V2 is confirmed stable in prod.
// To disable: set VITE_MARKETPLACE_LAYOUT_V2=false (or unset) in environment variables.
export function isMarketplaceLayoutV2Enabled(): boolean {
  return import.meta.env.VITE_MARKETPLACE_LAYOUT_V2 === 'true'
}

export function marketplaceV2FormatKeys(): ReadonlyArray<FormatKey> {
  return ['marketplace-card', 'marketplace-tile']
}

export function isMarketplaceV2FormatKey(key: FormatKey): boolean {
  return key === 'marketplace-card' || key === 'marketplace-tile'
}

export function allMarketplaceCardV2Archetypes(): MarketplaceV2ArchetypeId[] {
  return [
    'v2-card-split-image-right',
    'v2-card-hero-shelf',
    'v2-card-text-focus',
    'v2-card-split-image-left',
    'v2-card-full-bleed-overlay',
    'v2-card-text-only',
  ]
}

export function allMarketplaceTileV2Archetypes(): MarketplaceV2ArchetypeId[] {
  return ['v2-tile-split-balanced', 'v2-tile-image-forward', 'v2-tile-image-left']
}

function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene
}

/**
 * Heuristic for full-bleed overlay: `EnhancedImageAnalysis` has no `dominantMood` / `visualComplexity`;
 * we use mood + profile tone/semanticType, subject-box area as focal strength, and crop/contrast guards.
 */
function wantsMarketplaceCardFullBleedOverlay(
  imageAnalysis: EnhancedImageAnalysis,
  profile: ContentProfile
): boolean {
  if (imageAnalysis.cropRisk === 'high' || imageAnalysis.detectedContrast === 'low') return false
  const strongVisual =
    imageAnalysis.mood === 'dark' ||
    profile.semanticType === 'luxury' ||
    profile.tone === 'bold' ||
    profile.tone === 'premium'
  const subjectCoverageHigh =
    imageAnalysis.subjectBox != null &&
    imageAnalysis.subjectBox.w * imageAnalysis.subjectBox.h >= 24 * 24
  return Boolean(imageAnalysis.focalPoint) && (strongVisual || subjectCoverageHigh)
}

/**
 * Primary archetype for base intent: image-forward promos → split; dense copy → text-focus; default hero shelf.
 * Marketplace-card: only dense copy routes to text-focus. A broad `text-first` mode (e.g. from
 * marketplace-benefit-stack) is not enough — it starved the image and ran before image-first/critical checks.
 */
export function selectPrimaryMarketplaceV2Archetype(input: {
  formatKey: 'marketplace-card' | 'marketplace-tile'
  profile: ContentProfile
  /** Used for text-length signals; optional for callers that only have profile. */
  master?: Scene
  imageAnalysis?: EnhancedImageAnalysis
}): MarketplaceV2ArchetypeId {
  const titleLen = (input.master?.title.text ?? '').length
  // Scene has no `body` field; `profile.bodyLength` / subtitle length reflect master copy from `extractCreativeInput`.
  const textHeavyCard =
    input.profile.bodyLength > 180 || input.profile.subtitleLength > 180 || titleLen > 60

  if (input.formatKey === 'marketplace-tile') {
    if (input.imageAnalysis && input.imageAnalysis.focalPoint.x < 0.4) {
      return 'v2-tile-image-left'
    }
    if (input.profile.preferredMessageMode === 'image-first' || input.profile.productVisualNeed === 'critical') {
      return 'v2-tile-image-forward'
    }
    return 'v2-tile-split-balanced'
  }

  if (textHeavyCard) {
    return 'v2-card-text-only'
  }
  if (input.imageAnalysis && wantsMarketplaceCardFullBleedOverlay(input.imageAnalysis, input.profile)) {
    return 'v2-card-full-bleed-overlay'
  }
  if (input.imageAnalysis && input.imageAnalysis.focalPoint.x < 0.4) {
    return 'v2-card-split-image-left'
  }
  if (input.profile.density === 'dense') {
    return 'v2-card-text-focus'
  }
  if (input.profile.preferredMessageMode === 'image-first' || input.profile.productVisualNeed === 'critical') {
    return 'v2-card-split-image-right'
  }
  return 'v2-card-hero-shelf'
}

export function buildMarketplaceV2BaseLayoutIntent(input: {
  formatKey: 'marketplace-card' | 'marketplace-tile'
  profile: ContentProfile
  master?: Scene
  imageAnalysis?: EnhancedImageAnalysis
}): LayoutIntent {
  const archetype = selectPrimaryMarketplaceV2Archetype(input)
  if (input.formatKey === 'marketplace-card') {
    const imageMode: LayoutIntent['imageMode'] =
      archetype === 'v2-card-full-bleed-overlay'
        ? 'background'
        : archetype === 'v2-card-text-only'
          ? 'framed'
          : archetype === 'v2-card-split-image-left'
            ? 'split-left'
            : 'split-right'
    const textMode: LayoutIntent['textMode'] =
      archetype === 'v2-card-full-bleed-overlay' ? 'overlay' : 'cluster-left'
    const mode: LayoutIntent['mode'] =
      archetype === 'v2-card-full-bleed-overlay'
        ? 'overlay'
        : archetype === 'v2-card-text-only'
          ? 'text-first'
          : 'split'
    const structuralArchetype: StructuralArchetype =
      archetype === 'v2-card-text-focus' || archetype === 'v2-card-text-only'
        ? 'dense-information'
        : archetype === 'v2-card-full-bleed-overlay'
          ? 'overlay-balanced'
          : archetype === 'v2-card-hero-shelf'
            ? 'image-hero'
            : 'split-horizontal'
    return {
      family: 'square-image-top-text-bottom',
      presetId: 'square-image-top-text-bottom',
      marketplaceLayoutEngine: 'v2-slot',
      marketplaceV2Archetype: archetype,
      imageMode,
      textMode,
      balanceMode: 'balanced',
      tension: 'calm',
      mode,
      sourceFamily: 'square',
      structuralArchetype,
    }
  }
  return {
    family: 'landscape-balanced-split',
    presetId: 'landscape-balanced-split',
    marketplaceLayoutEngine: 'v2-slot',
    marketplaceV2Archetype: archetype,
    imageMode: archetype === 'v2-tile-image-left' ? 'split-left' : 'split-right',
    textMode: 'cluster-left',
    balanceMode: 'balanced',
    tension: 'calm',
    mode: 'split',
    sourceFamily: 'landscape',
    structuralArchetype: 'split-horizontal',
  }
}

type SlotPack = {
  image: { x: number; y: number; w: number; h: number; rx: number }
  logo: { x: number; y: number; w: number; h: number }
  badge: { x: number; y: number; w: number; h: number }
  headline: { x: number; y: number; w: number; h: number }
  subtitle: { x: number; y: number; w: number; h: number }
  cta: { x: number; y: number; w: number; h: number }
}

export function slotsForArchetype(format: FormatDefinition, archetype: MarketplaceV2ArchetypeId): SlotPack {
  if (format.key === 'marketplace-card') {
    if (archetype === 'v2-card-split-image-right') {
      // Text column + inset image: ≥12% width gap (here ~12.5%) so image sits closer to copy for a single composition; logo/badge in format zones.
      return {
        image: { x: 53, y: 12, w: 37, h: 76, rx: 3.2 },
        logo: { x: 6.5, y: 6, w: 11, h: 4.2 },
        badge: { x: 72, y: 12, w: 12.5, h: 4.2 },
        headline: { x: 6.5, y: 28, w: 34, h: 28 },
        subtitle: { x: 6.5, y: 54, w: 34, h: 24 },
        cta: { x: 8, y: 80, w: 21, h: 4.6 },
      }
    }
    if (archetype === 'v2-card-text-focus') {
      // Image–headline ≥12% vertical gap; badge y matches badge-top-right; CTA inside bottom CTA zone + safe area.
      return {
        image: { x: 10, y: 27, w: 80, h: 9, rx: 3 },
        logo: { x: 6.5, y: 6, w: 11, h: 4.2 },
        badge: { x: 76, y: 12, w: 9, h: 4.2 },
        headline: { x: 6.5, y: 48, w: 86, h: 18 },
        subtitle: { x: 6.5, y: 66, w: 82, h: 12 },
        cta: { x: 8, y: 80, w: 21, h: 4.6 },
      }
    }
    if (archetype === 'v2-card-split-image-left') {
      return {
        image: { x: 10, y: 12, w: 37, h: 76, rx: 3.2 },
        logo: { x: 82, y: 6, w: 11, h: 4.2 },
        badge: { x: 10, y: 12, w: 12.5, h: 4.2 },
        headline: { x: 53, y: 28, w: 34, h: 28 },
        subtitle: { x: 53, y: 54, w: 34, h: 24 },
        cta: { x: 56, y: 80, w: 21, h: 4.6 },
      }
    }
    if (archetype === 'v2-card-full-bleed-overlay') {
      return {
        image: { x: 0, y: 0, w: 100, h: 100, rx: 0 },
        logo: { x: 6.5, y: 6, w: 11, h: 4.2 },
        badge: { x: 76, y: 6, w: 14, h: 4.2 },
        headline: { x: 6.5, y: 52, w: 86, h: 16 },
        subtitle: { x: 6.5, y: 68, w: 82, h: 10 },
        cta: { x: 8, y: 82, w: 21, h: 4.6 },
      }
    }
    if (archetype === 'v2-card-text-only') {
      return {
        image: { x: 68, y: 28, w: 25, h: 22, rx: 2 },
        logo: { x: 6.5, y: 6, w: 11, h: 4.2 },
        badge: { x: 72, y: 6, w: 18, h: 4.2 },
        headline: { x: 6.5, y: 18, w: 58, h: 28 },
        subtitle: { x: 6.5, y: 50, w: 86, h: 22 },
        cta: { x: 8, y: 80, w: 21, h: 4.6 },
      }
    }
    // v2-card-hero-shelf — shorter hero band so headline clears image by ≥12%; badge/CTA aligned to rule zones.
    return {
      image: { x: 7, y: 27, w: 86, h: 17, rx: 2.8 },
      logo: { x: 6.5, y: 6, w: 11, h: 4.2 },
      badge: { x: 76, y: 12, w: 9, h: 4.2 },
      headline: { x: 7, y: 56, w: 78, h: 12 },
      subtitle: { x: 7, y: 72, w: 74, h: 12 },
      cta: { x: 8, y: 80, w: 21, h: 4.6 },
    }
  }
  if (archetype === 'v2-tile-image-forward') {
    // Logo/badge/CTA aligned to marketplace-tile rule zones; image inset for ≥12% text–image separation.
    return {
      image: { x: 57, y: 8, w: 35, h: 84, rx: 2.2 },
      logo: { x: 5, y: 7.05, w: 11, h: 6.25 },
      badge: { x: 78, y: 15.5, w: 11, h: 5.5 },
      headline: { x: 5, y: 28, w: 38, h: 22 },
      subtitle: { x: 5, y: 44, w: 38, h: 18 },
      cta: { x: 5, y: 71.02, w: 18, h: 5.73 },
    }
  }
  if (archetype === 'v2-tile-image-left') {
    return {
      image: { x: 8, y: 11, w: 35, h: 78, rx: 2.2 },
      logo: { x: 79, y: 7.05, w: 11, h: 6.25 },
      badge: { x: 8, y: 15.5, w: 11, h: 5.5 },
      headline: { x: 50, y: 28, w: 42, h: 22 },
      subtitle: { x: 50, y: 44, w: 42, h: 18 },
      cta: { x: 50, y: 71.02, w: 18, h: 5.73 },
    }
  }
  // v2-tile-split-balanced
  return {
    image: { x: 57, y: 11, w: 35, h: 78, rx: 2.2 },
    logo: { x: 5, y: 7.05, w: 11, h: 6.25 },
    badge: { x: 78, y: 15.5, w: 11, h: 5.5 },
    headline: { x: 5, y: 28, w: 40, h: 22 },
    subtitle: { x: 5, y: 44, w: 40, h: 18 },
    cta: { x: 5, y: 71.02, w: 18, h: 5.73 },
  }
}

function ctaWidthFromText(text: string, minW: number, maxW: number): number {
  const t = (text || '').trim()
  const est = Math.min(maxW, Math.max(minW, 8 + t.length * 1.15))
  return Math.round(est * 10) / 10
}

/**
 * Deterministic percent-space layout: assigns image/logo/badge/cta rects and fits headline + subtitle into fixed slots.
 */
export function buildMarketplaceV2Scene(input: {
  scene: Scene
  format: FormatDefinition
  typography: TypographyPlan
  archetype: MarketplaceV2ArchetypeId
}): Scene {
  const { format, typography } = input
  const ruleSet = getFormatRuleSet(format)
  const slots = slotsForArchetype(format, input.archetype)
  const next = cloneScene(input.scene)

  next.image = {
    ...next.image,
    x: slots.image.x,
    y: slots.image.y,
    w: slots.image.w,
    h: slots.image.h,
    rx: slots.image.rx,
  }

  next.logo = {
    ...next.logo,
    x: slots.logo.x,
    y: slots.logo.y,
    w: slots.logo.w,
    h: slots.logo.h,
  }

  const badgeText = (next.badge.text || '').trim()
  if (badgeText) {
    next.badge = {
      ...next.badge,
      x: slots.badge.x,
      y: slots.badge.y,
      w: slots.badge.w,
      h: slots.badge.h,
    }
  } else {
    next.badge = { ...next.badge, x: 0, y: 0, w: 0, h: 0 }
  }

  const ctaW = ctaWidthFromText(next.cta.text || '', 16, slots.cta.w)
  next.cta = {
    ...next.cta,
    x: slots.cta.x,
    y: slots.cta.y,
    w: Math.min(ctaW, slots.cta.w),
    h: slots.cta.h,
    rx: format.key === 'marketplace-tile' ? 20 : 24,
  }

  const headRule = ruleSet.typography.headline
  const subRule = ruleSet.typography.subtitle
  const headRegion = { x: slots.headline.x, y: slots.headline.y, w: slots.headline.w, h: slots.headline.h }
  const subRegion = { x: slots.subtitle.x, y: slots.subtitle.y, w: slots.subtitle.w, h: slots.subtitle.h }

  const headBaselineY = headRegion.y + (next.title.fontSize || typography.titleSize || 40) / format.height * 100 * 0.85
  const tileTightLines = format.key === 'marketplace-tile'
  const headGeom = fitSceneTextToRule({
    role: 'headline',
    text: next.title.text,
    x: headRegion.x,
    y: headBaselineY,
    width: headRegion.w,
    availableHeight: headRegion.h,
    format,
    rule: headRule,
    preferredFontSize: next.title.fontSize || typography.titleSize || 40,
    preferredCharsPerLine: next.title.charsPerLine || typography.titleCharsPerLine || 22,
    preferredMaxLines: tileTightLines ? Math.min(next.title.maxLines || 3, 1) : next.title.maxLines || 3,
    lineHeight: 1.08,
    anchorMode: 'baseline-left',
  })
  Object.assign(next.title, applyTextBoxToSceneElement(next.title, clampTextBoxToRegion(headGeom, headRegion, format), format))

  // Match layoutEngine spacing thresholds (see getPairGap): headline↔subtitle ≥14% height; subtitle↔cta ≥16%; card stacks need extra CTA clearance.
  const minHeadToSubGapY = format.key === 'marketplace-tile' ? 15.25 : 15
  const minSubToCtaGapY = format.key === 'marketplace-card' ? 17.35 : 16
  const subTop = headGeom.rect.y + headGeom.rect.h + minHeadToSubGapY
  const maxSubBottom =
    format.key === 'marketplace-card'
      ? slots.cta.y - minSubToCtaGapY
      : Math.min(subRegion.y + subRegion.h, slots.cta.y - minSubToCtaGapY)
  const subBaselineY = subTop + (next.subtitle.fontSize || typography.subtitleSize || 18) / format.height * 100 * 0.9
  const subAvail = Math.max(4, Math.min(subRegion.y + subRegion.h - subTop, Math.max(0, maxSubBottom - subTop)))
  const subGeom = fitSceneTextToRule({
    role: 'subtitle',
    text: next.subtitle.text,
    x: subRegion.x,
    y: Math.min(subBaselineY, subRegion.y + subRegion.h * 0.35),
    width: subRegion.w,
    availableHeight: subAvail,
    format,
    rule: subRule,
    preferredFontSize: next.subtitle.fontSize || typography.subtitleSize || 18,
    preferredCharsPerLine: next.subtitle.charsPerLine || typography.subtitleCharsPerLine || 30,
    preferredMaxLines: tileTightLines
      ? Math.min(next.subtitle.maxLines || typography.subtitleMaxLines || 4, 1)
      : next.subtitle.maxLines || typography.subtitleMaxLines || 4,
    lineHeight: 1.22,
    anchorMode: 'baseline-left',
    measurementHint: next.subtitle.measurementHint,
  })
  const subClamped = clampTextBoxToRegion(subGeom, { ...subRegion, y: subTop, h: subAvail }, format)
  Object.assign(next.subtitle, applyTextBoxToSceneElement(next.subtitle, subClamped, format))

  return next
}

export function structuralArchetypeForMarketplaceV2Archetype(arch: MarketplaceV2ArchetypeId): StructuralArchetype {
  switch (arch) {
    case 'v2-card-text-focus':
    case 'v2-card-text-only':
      return 'dense-information'
    case 'v2-card-full-bleed-overlay':
      return 'overlay-balanced'
    case 'v2-card-hero-shelf':
      return 'image-hero'
    default:
      return 'split-horizontal'
  }
}

export function shouldSynthesizeMarketplaceLayoutV2(format: FormatDefinition, intent: LayoutIntent): boolean {
  return (
    isMarketplaceLayoutV2Enabled() &&
    intent.marketplaceLayoutEngine === 'v2-slot' &&
    isMarketplaceV2FormatKey(format.key) &&
    Boolean(intent.marketplaceV2Archetype)
  )
}
