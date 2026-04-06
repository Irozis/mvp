import { getMarketplaceCardTemplateById } from './templateDefinitions'
import { selectMarketplaceCardTemplate } from './templateSelection'
import type {
  AssetHint,
  ContentProfile,
  EnhancedImageAnalysis,
  FormatDefinition,
  GoalKey,
  ImageProfile,
  LayoutIntent,
  MarketplaceCardTemplateId,
  MarketplaceCardTemplateSelectionResult,
  MarketplaceCardTemplateZoneStructure,
  Scene,
  VisualSystemKey,
} from './types'

export type MarketplaceCardTemplateAdapterInput = {
  format: FormatDefinition
  master: Scene
  profile: ContentProfile
  goal: GoalKey
  visualSystem: VisualSystemKey
  imageAnalysis?: EnhancedImageAnalysis
  assetHint?: AssetHint
  imageProfile?: ImageProfile
  selectedTemplate?: MarketplaceCardTemplateSelectionResult
  variantMode?: 'base' | 'commerce-lockup' | 'image-dominant-square' | 'proof-band' | 'comparison-lockup'
}

export type MarketplaceCardTemplateAdaptationResult = {
  templateId: MarketplaceCardTemplateId
  selection: MarketplaceCardTemplateSelectionResult
  intent: LayoutIntent
  zoneStructure: MarketplaceCardTemplateZoneStructure
  adaptationSummary: string
  debug: {
    noImageMode: boolean
    copyDensity: 'short' | 'balanced' | 'dense'
    hasSubtitle: boolean
    hasBadge: boolean
    hasLogo: boolean
    hasCta: boolean
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function region(x: number, y: number, w: number, h: number): MarketplaceCardTemplateZoneStructure['image'] {
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100), w: clamp(w, 4, 100 - x), h: clamp(h, 4, 100 - y) }
}

function summarizeTemplateAdaptation(
  templateId: MarketplaceCardTemplateId,
  selection: MarketplaceCardTemplateSelectionResult,
  variantMode: 'base' | 'commerce-lockup' | 'image-dominant-square' | 'proof-band' | 'comparison-lockup'
) {
  const regime = selection.inputProfile.imageRegime === 'no-image' ? 'no-image' : 'image-backed'
  const variantSuffix =
    variantMode === 'commerce-lockup'
      ? ' using commerce-lockup variant'
      : variantMode === 'image-dominant-square'
        ? ' using image-dominant-square variant'
        : variantMode === 'proof-band'
          ? ' using proof-band variant'
          : variantMode === 'comparison-lockup'
            ? ' using comparison-lockup variant'
        : ''
  return `${templateId} adapted for ${regime} marketplace-card with ${selection.inputProfile.copyDensity} copy and ${selection.inputProfile.ctaFlow} CTA flow${variantSuffix}.`
}

function buildHeaderPanelZones(input: {
  noImageMode: boolean
  denseCopy: boolean
  hasBadge: boolean
  hasLogo: boolean
}) {
  const panelHeight = input.denseCopy ? 32 : 30
  return {
    image: region(8, 8, 84, panelHeight),
    text: region(10, 42, input.denseCopy ? 74 : 70, input.denseCopy ? 28 : 24),
    cta: region(10, input.denseCopy ? 78 : 74, 26, 7),
    logo: region(8, 8, input.hasLogo ? 12 : 8, 5),
    badge: region(input.hasBadge ? 72 : 78, 10, input.hasBadge ? 18 : 12, 5),
  } satisfies MarketplaceCardTemplateZoneStructure
}

function buildTextFirstZones(input: {
  noImageMode: boolean
  denseCopy: boolean
  hasBadge: boolean
  hasLogo: boolean
  variantMode: 'base' | 'commerce-lockup' | 'image-dominant-square' | 'proof-band' | 'comparison-lockup'
}) {
  if (input.variantMode === 'proof-band') {
    return {
      image: input.noImageMode
        ? region(8, 10, 82, input.denseCopy ? 12 : 14)
        : region(58, 10, input.denseCopy ? 28 : 30, input.denseCopy ? 26 : 28),
      text: region(8, input.noImageMode ? 24 : 14, input.noImageMode ? 72 : 52, input.denseCopy ? 42 : 34),
      cta: region(8, input.noImageMode ? (input.denseCopy ? 68 : 66) : (input.denseCopy ? 60 : 62), input.noImageMode ? 24 : 22, 6.4),
      logo: region(8, 8, input.hasLogo ? 12 : 8, 5),
      badge: input.noImageMode
        ? region(8, 16, input.hasBadge ? 18 : 12, 4.6)
        : region(8, input.hasBadge ? 14 : 10, input.hasBadge ? 18 : 12, 4.8),
    } satisfies MarketplaceCardTemplateZoneStructure
  }

  return {
    image: input.noImageMode ? region(68, 12, 20, 18) : region(64, 12, 24, 22),
    text: region(8, 18, input.denseCopy ? 70 : 66, input.denseCopy ? 42 : 36),
    cta: region(8, input.denseCopy ? 72 : 68, 24, 7),
    logo: region(8, 8, input.hasLogo ? 12 : 8, 5),
    badge: region(8, input.hasBadge ? 14 : 10, input.hasBadge ? 18 : 12, 5),
  } satisfies MarketplaceCardTemplateZoneStructure
}

function buildProductSupportZones(input: {
  denseCopy: boolean
  hasBadge: boolean
  hasLogo: boolean
  variantMode: 'base' | 'commerce-lockup' | 'image-dominant-square' | 'proof-band' | 'comparison-lockup'
}) {
  if (input.variantMode === 'comparison-lockup') {
    return {
      image: region(54, input.denseCopy ? 12 : 14, input.denseCopy ? 32 : 34, input.denseCopy ? 30 : 32),
      text: region(8, input.denseCopy ? 48 : 50, input.denseCopy ? 46 : 44, input.denseCopy ? 26 : 24),
      cta: region(8, input.denseCopy ? 78 : 76, 20, 6.2),
      logo: region(8, 8, input.hasLogo ? 12 : 8, 5),
      badge: region(input.hasBadge ? 64 : 72, 10, input.hasBadge ? 18 : 12, 5),
    } satisfies MarketplaceCardTemplateZoneStructure
  }

  if (input.variantMode === 'image-dominant-square') {
    return {
      image: region(44, input.denseCopy ? 10 : 12, input.denseCopy ? 42 : 44, input.denseCopy ? 42 : 46),
      text: region(8, input.denseCopy ? 50 : 56, input.denseCopy ? 36 : 34, input.denseCopy ? 20 : 16),
      cta: region(8, input.denseCopy ? 74 : 78, 22, 6.4),
      logo: region(8, 8, input.hasLogo ? 12 : 8, 5),
      badge: region(input.hasBadge ? 62 : 72, 10, input.hasBadge ? 20 : 12, 5),
    } satisfies MarketplaceCardTemplateZoneStructure
  }

  if (input.variantMode === 'commerce-lockup') {
    return {
      image: region(52, input.denseCopy ? 12 : 14, input.denseCopy ? 34 : 36, input.denseCopy ? 36 : 38),
      text: region(10, input.denseCopy ? 48 : 52, input.denseCopy ? 38 : 40, input.denseCopy ? 20 : 18),
      cta: region(10, input.denseCopy ? 72 : 70, 22, 6.6),
      logo: region(8, 8, input.hasLogo ? 12 : 8, 5),
      badge: region(input.hasBadge ? 64 : 72, 10, input.hasBadge ? 18 : 12, 5),
    } satisfies MarketplaceCardTemplateZoneStructure
  }

  const imageX = input.denseCopy ? 46 : 48
  const imageY = input.denseCopy ? 12 : 12
  const imageW = input.denseCopy ? 40 : 42
  const imageH = input.denseCopy ? 40 : 44
  const textX = 8
  const textY = input.denseCopy ? 50 : 54
  const textW = input.denseCopy ? 38 : 40
  const textH = input.denseCopy ? 22 : 18
  const ctaY = input.denseCopy ? 76 : 78

  return {
    image: region(imageX, imageY, imageW, imageH),
    text: region(textX, textY, textW, textH),
    cta: region(textX, ctaY, 24, 7),
    logo: region(8, 8, input.hasLogo ? 12 : 8, 5),
    badge: region(input.hasBadge ? 66 : 74, 10, input.hasBadge ? 20 : 12, 5),
  } satisfies MarketplaceCardTemplateZoneStructure
}

function buildMinimalZones(input: {
  noImageMode: boolean
  hasBadge: boolean
  hasLogo: boolean
}) {
  return {
    image: input.noImageMode ? region(12, 12, 76, 16) : region(14, 12, 72, 20),
    text: region(12, 42, 52, 16),
    cta: region(12, 64, 20, 6),
    logo: region(10, 8, input.hasLogo ? 10 : 7, 4.6),
    badge: region(input.hasBadge ? 74 : 80, 10, input.hasBadge ? 14 : 10, 4.6),
  } satisfies MarketplaceCardTemplateZoneStructure
}

function buildTemplateZoneStructure(input: {
  templateId: MarketplaceCardTemplateId
  noImageMode: boolean
  copyDensity: 'short' | 'balanced' | 'dense'
  hasSubtitle: boolean
  hasBadge: boolean
  hasLogo: boolean
  variantMode: 'base' | 'commerce-lockup' | 'image-dominant-square' | 'proof-band' | 'comparison-lockup'
}) {
  const denseCopy = input.copyDensity === 'dense' || input.hasSubtitle

  switch (input.templateId) {
    case 'text-first-promo':
      return buildTextFirstZones({
        noImageMode: input.noImageMode,
        denseCopy,
        hasBadge: input.hasBadge,
        hasLogo: input.hasLogo,
        variantMode: input.variantMode,
      })
    case 'product-support-card':
      return buildProductSupportZones({
        denseCopy,
        hasBadge: input.hasBadge,
        hasLogo: input.hasLogo,
        variantMode: input.variantMode,
      })
    case 'minimal-promo-card':
      return buildMinimalZones({
        noImageMode: input.noImageMode,
        hasBadge: input.hasBadge,
        hasLogo: input.hasLogo,
      })
    case 'header-panel-card':
    default:
      return buildHeaderPanelZones({
        noImageMode: input.noImageMode,
        denseCopy,
        hasBadge: input.hasBadge,
        hasLogo: input.hasLogo,
      })
  }
}

export function adaptMarketplaceCardTemplate(
  input: MarketplaceCardTemplateAdapterInput
): MarketplaceCardTemplateAdaptationResult {
  const selection =
    input.selectedTemplate ||
    selectMarketplaceCardTemplate({
      format: input.format,
      profile: input.profile,
      goal: input.goal,
      visualSystem: input.visualSystem,
      imageAnalysis: input.imageAnalysis,
      assetHint: input.assetHint,
      imageProfile: input.imageProfile,
      hasLogo: Boolean(input.master.logo?.w && input.master.logo?.h),
    })
  const template = getMarketplaceCardTemplateById(selection.selectedTemplateId)
  const variantMode = input.variantMode || 'base'
  const noImageMode = selection.inputProfile.imageRegime === 'no-image'
  const hasSubtitle = Boolean((input.master.subtitle.text || '').trim().length)
  const hasBadge = Boolean((input.master.badge.text || input.master.chip || '').trim().length)
  const hasLogo = Boolean(input.master.logo?.w && input.master.logo?.h)
  const hasCta = Boolean((input.master.cta.text || '').trim().length)
  const zoneStructure = buildTemplateZoneStructure({
    templateId: template.id,
    noImageMode,
    copyDensity: selection.inputProfile.copyDensity,
    hasSubtitle,
    hasBadge,
    hasLogo,
    variantMode,
  })

  const intent: LayoutIntent = {
    family: template.runtimeHints.family,
    presetId: template.runtimeHints.family,
    marketplaceTemplateId: template.id,
    marketplaceTemplateVariant: variantMode,
    marketplaceTemplateSelection: selection,
    marketplaceTemplateZones: zoneStructure,
    marketplaceTemplateSummary: summarizeTemplateAdaptation(template.id, selection, variantMode),
    structuralArchetype: template.runtimeHints.structuralArchetype,
    balanceRegime: template.runtimeHints.balanceRegime,
    occupancyMode: template.runtimeHints.occupancyMode,
    imageMode: template.runtimeHints.imageMode,
    textMode: template.runtimeHints.textMode,
    balanceMode: template.runtimeHints.balanceMode,
    mode: template.runtimeHints.mode,
    tension:
      input.profile.semanticType === 'luxury'
        ? 'premium'
        : input.profile.semanticType === 'editorial'
          ? 'editorial'
          : input.profile.promoIntensity === 'high'
            ? 'promo'
            : 'calm',
    sourceFamily: input.format.family,
  }

  return {
    templateId: template.id,
    selection,
    intent,
    zoneStructure,
    adaptationSummary: summarizeTemplateAdaptation(template.id, selection, variantMode),
    debug: {
      noImageMode,
      copyDensity: selection.inputProfile.copyDensity,
      hasSubtitle,
      hasBadge,
      hasLogo,
      hasCta,
    },
  }
}

export function getTemplateAdaptationDebug(input: MarketplaceCardTemplateAdapterInput) {
  return adaptMarketplaceCardTemplate(input)
}
