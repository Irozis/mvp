import { getMarketplaceCardTemplateById, getMarketplaceCardTemplates } from './templateDefinitions'
import type {
  AssetHint,
  ContentProfile,
  EnhancedImageAnalysis,
  FormatDefinition,
  GoalKey,
  ImageProfile,
  MarketplaceCardTemplateDefinition,
  MarketplaceCardTemplateId,
  MarketplaceCardTemplateSelectionInputProfile,
  MarketplaceCardTemplateSelectionReasonCode,
  MarketplaceCardTemplateSelectionResult,
  TemplateSupportLevel,
  VisualSystemKey,
} from './types'

export type MarketplaceCardTemplateSelectionInput = {
  format: FormatDefinition
  profile: ContentProfile
  goal: GoalKey
  visualSystem: VisualSystemKey
  imageAnalysis?: EnhancedImageAnalysis
  assetHint?: AssetHint
  imageProfile?: ImageProfile
  hasLogo?: boolean
  rotationIndex?: number
}

type TemplateScore = {
  templateId: MarketplaceCardTemplateId
  score: number
  positiveFactors: string[]
  penalties: string[]
  reasonCodes: MarketplaceCardTemplateSelectionReasonCode[]
}

function dedupeTemplateIds(templateIds: MarketplaceCardTemplateId[]) {
  return Array.from(new Set(templateIds))
}

function getSelectionInputProfile({
  profile,
  imageAnalysis,
  assetHint,
  imageProfile,
  hasLogo,
}: Omit<MarketplaceCardTemplateSelectionInput, 'format' | 'goal' | 'visualSystem'>): MarketplaceCardTemplateSelectionInputProfile {
  const resolvedImageProfile = imageAnalysis?.imageProfile || assetHint?.imageProfile || imageProfile
  const hasRealImage = Boolean(imageAnalysis || assetHint?.enhancedImage || resolvedImageProfile)
  const totalCopy = profile.headlineLength + profile.subtitleLength + profile.bodyLength
  const copyDensity: MarketplaceCardTemplateSelectionInputProfile['copyDensity'] =
    profile.density === 'dense' || totalCopy > 170
      ? 'dense'
      : totalCopy <= 70 && profile.subtitleLength <= 36
        ? 'short'
        : 'balanced'
  const ctaFlow: MarketplaceCardTemplateSelectionInputProfile['ctaFlow'] =
    profile.ctaLength <= 0
      ? 'none'
      : profile.needsStrongCTA || profile.ctaImportance === 'high'
        ? 'strong'
        : profile.ctaLength <= 12
          ? 'compact'
          : 'standard'

  return {
    hasRealImage,
    imageRegime: hasRealImage ? 'image-backed' : 'no-image',
    imageProfile: resolvedImageProfile,
    copyDensity,
    preferredMessageMode: profile.preferredMessageMode,
    messageType: profile.messageType,
    promoIntensity: profile.promoIntensity,
    sellingAngle: profile.sellingAngle,
    primaryConversionAction: profile.primaryConversionAction,
    offerStrength: profile.offerStrength,
    proofPresence: profile.proofPresence,
    productVisualNeed: profile.productVisualNeed,
    messageCompressionNeed: profile.messageCompressionNeed,
    marketplaceCommercialHint: profile.marketplaceCommercialHint,
    ctaFlow,
    subtitlePresent: profile.subtitleLength > 0,
    badgePresent: profile.badgeLength > 0,
    logoPresent: Boolean(hasLogo),
    ctaPresent: profile.ctaLength > 0,
  }
}

function buildDecisionSummary(
  selectedTemplateId: MarketplaceCardTemplateId,
  reasonCodes: MarketplaceCardTemplateSelectionReasonCode[],
  inputProfile: MarketplaceCardTemplateSelectionInputProfile
) {
  const selected = getMarketplaceCardTemplateById(selectedTemplateId)
  const imageSummary = inputProfile.hasRealImage ? 'Image-backed' : 'No-image'
  const densitySummary = `${inputProfile.copyDensity} copy`
  const reasonSummary = reasonCodes.join(', ')
  return `${imageSummary} marketplace-card with ${densitySummary} and ${inputProfile.sellingAngle} commercial intent; selected ${selected.displayName} (${selected.id}) because ${reasonSummary}.`
}

function applyScore(
  state: { score: number; positiveFactors: string[]; penalties: string[] },
  delta: number,
  label: string
) {
  state.score += delta
  if (delta >= 0) {
    state.positiveFactors.push(`${delta >= 0 ? '+' : ''}${delta} ${label}`)
  } else {
    state.penalties.push(`${delta} ${label}`)
  }
}

function supportScore(level: TemplateSupportLevel, preferred = 8, supported = 3, avoid = -24) {
  if (level === 'preferred') return preferred
  if (level === 'supported') return supported
  return avoid
}

function scoreTemplateFit(
  template: MarketplaceCardTemplateDefinition,
  inputProfile: MarketplaceCardTemplateSelectionInputProfile,
  input: MarketplaceCardTemplateSelectionInput
): TemplateScore {
  const state = {
    score: 0,
    positiveFactors: [] as string[],
    penalties: [] as string[],
  }
  const reasonCodes = new Set<MarketplaceCardTemplateSelectionReasonCode>()

  const imageSupport =
    inputProfile.imageRegime === 'no-image' ? template.suitability.noImage : template.suitability.imageBacked
  applyScore(
    state,
    supportScore(imageSupport, 12, 2, -45),
    inputProfile.imageRegime === 'no-image' ? 'no-image regime fit' : 'image-backed regime fit'
  )
  reasonCodes.add(inputProfile.imageRegime === 'no-image' ? 'no-image' : 'image-backed')

  const densitySupport =
    inputProfile.copyDensity === 'dense'
      ? template.suitability.denseCopy
      : inputProfile.copyDensity === 'short'
        ? template.suitability.shortCopy
        : 'supported'
  applyScore(state, supportScore(densitySupport, 5, 2, -8), `${inputProfile.copyDensity} copy fit`)
  if (inputProfile.copyDensity === 'dense') reasonCodes.add('dense-copy')
  if (inputProfile.copyDensity === 'short') reasonCodes.add('short-copy')

  if (inputProfile.ctaFlow === 'compact') {
    applyScore(state, supportScore(template.suitability.compactCtaFlow, 3, 1, -4), 'compact CTA fit')
    reasonCodes.add('compact-cta-flow')
  }

  if (template.preferredCopyDensity?.includes(inputProfile.copyDensity)) {
    applyScore(state, 3, 'preferred copy density')
  }

  if (template.supportedSellingAngles?.includes(inputProfile.sellingAngle)) {
    applyScore(state, 7, `selling angle ${inputProfile.sellingAngle}`)
    reasonCodes.add('selling-angle-match')
  }

  if (template.commercialRole === inputProfile.marketplaceCommercialHint) {
    applyScore(state, 9, `commercial role ${inputProfile.marketplaceCommercialHint}`)
    reasonCodes.add('commercial-pattern-match')
  }

  if (template.preferredConversionActions?.includes(inputProfile.primaryConversionAction)) {
    applyScore(state, 3, `conversion action ${inputProfile.primaryConversionAction}`)
  }

  if (inputProfile.offerStrength === 'strong' || inputProfile.offerStrength === 'medium') {
    if (
      template.commercialRole === 'marketplace-price-punch' ||
      template.commercialRole === 'marketplace-compact-offer'
    ) {
      applyScore(state, 5, `${inputProfile.offerStrength} offer fit`)
      reasonCodes.add('strong-offer')
    } else if (template.contentBehavior === 'minimal' && inputProfile.offerStrength === 'strong') {
      applyScore(state, -4, 'strong offer overloads minimal template')
    }
  }

  if (inputProfile.proofPresence !== 'none') {
    if (template.proofRole?.includes(inputProfile.proofPresence)) {
      applyScore(state, 5, `proof type ${inputProfile.proofPresence}`)
      reasonCodes.add('proof-led')
    } else if (template.contentBehavior === 'minimal') {
      applyScore(state, -3, 'proof-heavy copy mismatches minimal template')
    }
  }

  if (inputProfile.productVisualNeed === 'critical') {
    if (template.imagePolicy.role === 'product-anchor' || template.commercialRole === 'marketplace-product-hero') {
      applyScore(state, 10, 'critical product visual need')
      reasonCodes.add('product-visual-critical')
    } else {
      applyScore(state, -10, 'critical product visual need mismatch')
    }
  } else if (inputProfile.productVisualNeed === 'useful') {
    if (template.imagePolicy.role !== 'optional-accent') applyScore(state, 2, 'useful product visual support')
  } else if (template.contentBehavior === 'minimal') {
    applyScore(state, 2, 'optional product visual suits minimal template')
  }

  if (inputProfile.messageCompressionNeed === 'high') {
    if (template.commercialRole === 'marketplace-compact-offer') {
      applyScore(state, 5, 'high compression fit')
      reasonCodes.add('high-compression')
    } else if (template.contentBehavior === 'balanced') {
      applyScore(state, 2, 'balanced template can absorb compression')
    }
  } else if (inputProfile.messageCompressionNeed === 'low' && template.contentBehavior === 'minimal') {
    applyScore(state, 2, 'low compression suits minimal template')
  }

  if (inputProfile.preferredMessageMode === 'text-first' && template.id === 'text-first-promo') {
    applyScore(state, 3, 'text-first message mode')
    reasonCodes.add('text-dominant-message')
  }
  if (inputProfile.preferredMessageMode === 'image-first' && template.id === 'product-support-card') {
    applyScore(state, 4, 'image-first message mode')
    reasonCodes.add('product-support')
  }

  if (!inputProfile.hasRealImage) {
    if (template.id === 'header-panel-card') {
      applyScore(state, 8, 'default no-image header fit')
      if (inputProfile.copyDensity === 'balanced') applyScore(state, 4, 'balanced no-image card')
      if (inputProfile.messageCompressionNeed !== 'high') applyScore(state, 3, 'calmer no-image rhythm')
    }
    if (template.id === 'text-first-promo') {
      if (inputProfile.copyDensity === 'dense') {
        applyScore(state, 4, 'dense no-image text-led copy')
      } else {
        applyScore(state, -8, 'text-first too aggressive for default no-image')
      }
      if (inputProfile.proofPresence !== 'none' || inputProfile.messageCompressionNeed === 'high') {
        applyScore(state, 4, 'proof/compression supports text-first no-image')
      }
    }
    if (template.id === 'product-support-card') {
      applyScore(state, -12, 'product-support requires a real image')
    }
    if (template.id === 'minimal-promo-card' && inputProfile.copyDensity !== 'short') {
      applyScore(state, -5, 'minimal template too sparse for this no-image copy load')
    }
  } else {
    if (template.id === 'header-panel-card' && inputProfile.productVisualNeed === 'critical') {
      applyScore(state, -6, 'header-panel underuses required product visual')
    }
    if (
      template.id === 'text-first-promo' &&
      (inputProfile.sellingAngle === 'benefit-led' || inputProfile.sellingAngle === 'trust-led')
    ) {
      applyScore(state, 4, 'image-backed benefit/proof promo')
    }
    if (
      template.id === 'product-support-card' &&
      (inputProfile.sellingAngle === 'product-led' ||
        inputProfile.sellingAngle === 'catalog-led' ||
        inputProfile.productVisualNeed === 'critical')
    ) {
      applyScore(state, 7, 'image-backed product support')
    }
  }

  if (input.goal === 'performance-banners' && inputProfile.offerStrength !== 'none') {
    applyScore(state, 2, 'performance goal favors offer clarity')
  }
  if (input.visualSystem === 'product-card' && template.id === 'product-support-card' && inputProfile.hasRealImage) {
    applyScore(state, 2, 'product-card visual system')
  }

  if (
    reasonCodes.size === 1 &&
    reasonCodes.has(inputProfile.imageRegime === 'no-image' ? 'no-image' : 'image-backed')
  ) {
    reasonCodes.add('promo-default')
  }

  return {
    templateId: template.id,
    score: state.score,
    positiveFactors: state.positiveFactors,
    penalties: state.penalties,
    reasonCodes: Array.from(reasonCodes),
  }
}

function rankMarketplaceCardTemplates(input: MarketplaceCardTemplateSelectionInput) {
  const inputProfile = getSelectionInputProfile(input)
  const rankedTemplates = getMarketplaceCardTemplates()
    .map((template) => scoreTemplateFit(template, inputProfile, input))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.templateId.localeCompare(right.templateId)
    })

  return {
    inputProfile,
    rankedTemplates,
  }
}

export function selectMarketplaceCardTemplate(
  input: MarketplaceCardTemplateSelectionInput
): MarketplaceCardTemplateSelectionResult {
  const { inputProfile, rankedTemplates } = rankMarketplaceCardTemplates(input)
  if (!rankedTemplates.length) {
    throw new Error('No marketplace card templates available for selection.')
  }
  const rot = input.rotationIndex ?? 0
  const selected = rankedTemplates[rot % rankedTemplates.length]
  const alternativeTemplateIds = dedupeTemplateIds(rankedTemplates.slice(1, 4).map((entry) => entry.templateId))
  const reasonCodes = Array.from(new Set(selected.reasonCodes))

  return {
    selectedTemplateId: selected.templateId,
    alternativeTemplateIds,
    reasonCodes,
    decisionSummary: buildDecisionSummary(selected.templateId, reasonCodes, inputProfile),
    inputProfile,
    debug: {
      rankedTemplates: rankedTemplates.map((entry) => ({
        templateId: entry.templateId,
        totalScore: entry.score,
        positiveFactors: entry.positiveFactors,
        penalties: entry.penalties,
        reasonCodes: entry.reasonCodes,
      })),
    },
  }
}

export function getAlternativeMarketplaceCardTemplates(
  input: MarketplaceCardTemplateSelectionInput
) {
  const selection = selectMarketplaceCardTemplate(input)
  return selection.alternativeTemplateIds.map((templateId) => getMarketplaceCardTemplateById(templateId))
}

export function explainMarketplaceCardTemplateSelection(
  input: MarketplaceCardTemplateSelectionInput
) {
  const selection = selectMarketplaceCardTemplate(input)
  return {
    ...selection,
    selectedTemplate: getMarketplaceCardTemplateById(selection.selectedTemplateId),
    alternativeTemplates: selection.alternativeTemplateIds.map((templateId) =>
      getMarketplaceCardTemplateById(templateId)
    ),
  }
}

export function getMarketplaceCardTemplateSelectionDebug(
  input: MarketplaceCardTemplateSelectionInput
) {
  return rankMarketplaceCardTemplates(input)
}
