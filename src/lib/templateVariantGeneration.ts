import { adaptMarketplaceCardTemplate } from './templateAdapter'
import { selectMarketplaceCardTemplate } from './templateSelection'
import type {
  AssetHint,
  ContentProfile,
  EnhancedImageAnalysis,
  FormatDefinition,
  GoalKey,
  LayoutIntent,
  MarketplaceCardTemplateSelectionResult,
  Scene,
  VisualSystemKey,
} from './types'

export type MarketplaceCardTemplateVariantPlan = {
  id: string
  templateId: NonNullable<LayoutIntent['marketplaceTemplateId']>
  templateVariant: NonNullable<LayoutIntent['marketplaceTemplateVariant']>
  strategyLabel: string
  fixStage: 'base' | 'local' | 'regional' | 'structural'
  intent: LayoutIntent
  selectionReason: string
  selection: MarketplaceCardTemplateSelectionResult
}

function dedupe<T>(values: T[]) {
  return Array.from(new Set(values))
}

function buildVariantSelection(
  selection: MarketplaceCardTemplateSelectionResult,
  selectedTemplateId: MarketplaceCardTemplateVariantPlan['templateId']
): MarketplaceCardTemplateSelectionResult {
  const alternatives = dedupe(
    [selection.selectedTemplateId, ...selection.alternativeTemplateIds].filter(
      (templateId) => templateId !== selectedTemplateId
    )
  ).slice(0, 2)

  return {
    ...selection,
    selectedTemplateId,
    alternativeTemplateIds: alternatives,
    decisionSummary: `${selection.inputProfile.imageRegime} marketplace-card variant using ${selectedTemplateId}.`,
  }
}

function getProductSupportVariantModes(
  selection: MarketplaceCardTemplateSelectionResult,
  templateId: MarketplaceCardTemplateVariantPlan['templateId']
) {
  if (
    templateId !== 'product-support-card' ||
    selection.inputProfile.imageRegime !== 'image-backed'
  ) {
    return ['base'] as const
  }

  const productDominantCase =
    selection.inputProfile.productVisualNeed === 'critical' ||
    selection.inputProfile.sellingAngle === 'product-led' ||
    selection.inputProfile.sellingAngle === 'catalog-led' ||
    selection.inputProfile.sellingAngle === 'comparison-led'

  if (selection.inputProfile.sellingAngle === 'comparison-led') {
    return ['base', 'comparison-lockup'] as const
  }

  return productDominantCase
    ? (['base', 'image-dominant-square'] as const)
    : (['base', 'commerce-lockup'] as const)
}

function getTextFirstVariantModes(
  selection: MarketplaceCardTemplateSelectionResult,
  templateId: MarketplaceCardTemplateVariantPlan['templateId']
) {
  if (templateId !== 'text-first-promo') {
    return ['base'] as const
  }

  const proofOrTrustCase =
    selection.inputProfile.proofPresence !== 'none' ||
    selection.inputProfile.sellingAngle === 'trust-led' ||
    selection.inputProfile.sellingAngle === 'benefit-led' ||
    selection.inputProfile.copyDensity === 'dense'

  return proofOrTrustCase
    ? (['base', 'proof-band'] as const)
    : (['base'] as const)
}

function getTemplateVariantModes(
  selection: MarketplaceCardTemplateSelectionResult,
  templateId: MarketplaceCardTemplateVariantPlan['templateId']
) {
  if (templateId === 'product-support-card') {
    return getProductSupportVariantModes(selection, templateId)
  }

  if (templateId === 'text-first-promo') {
    return getTextFirstVariantModes(selection, templateId)
  }

  return ['base'] as const
}

function buildVariantPlanId(templateId: MarketplaceCardTemplateVariantPlan['templateId'], variantMode: MarketplaceCardTemplateVariantPlan['templateVariant']) {
  return variantMode === 'base' ? `template-${templateId}` : `template-${templateId}-${variantMode}`
}

function buildVariantStrategyLabel(
  templateId: MarketplaceCardTemplateVariantPlan['templateId'],
  variantMode: MarketplaceCardTemplateVariantPlan['templateVariant'],
  index: number
) {
  if (variantMode === 'base') {
    return index === 0 ? `template-${templateId}-primary` : `template-${templateId}-alternative-${index}`
  }

  return (
    index === 0
      ? `template-${templateId}-${variantMode}-primary`
      : `template-${templateId}-${variantMode}-alternative-${index}`
  )
}

export function buildMarketplaceCardTemplateVariantPlans(input: {
  format: FormatDefinition
  master: Scene
  profile: ContentProfile
  goal: GoalKey
  visualSystem: VisualSystemKey
  imageAnalysis?: EnhancedImageAnalysis
  assetHint?: AssetHint
  baseIntent?: LayoutIntent
  baseFixStage?: 'base' | 'local' | 'regional' | 'structural'
}) {
  const baseFixStage = input.baseFixStage || 'base'
  const selection =
    input.baseIntent?.marketplaceTemplateSelection ||
    selectMarketplaceCardTemplate({
      format: input.format,
      profile: input.profile,
      goal: input.goal,
      visualSystem: input.visualSystem,
      imageAnalysis: input.imageAnalysis,
      assetHint: input.assetHint,
      hasLogo: Boolean(input.master.logo?.w && input.master.logo?.h),
    })

  const orderedTemplateIds = dedupe([
    selection.selectedTemplateId,
    ...selection.alternativeTemplateIds,
  ]).slice(0, 4)

  const plans = orderedTemplateIds.flatMap((templateId, index) => {
    const variantSelection = buildVariantSelection(selection, templateId)
    const variantModes = getTemplateVariantModes(selection, templateId)

    return variantModes.map((variantMode) => {
      const adaptation = adaptMarketplaceCardTemplate({
        format: input.format,
        master: input.master,
        profile: input.profile,
        goal: input.goal,
        visualSystem: input.visualSystem,
        imageAnalysis: input.imageAnalysis,
        assetHint: input.assetHint,
        selectedTemplate: variantSelection,
        variantMode,
      })

      return {
        id: buildVariantPlanId(templateId, variantMode),
        templateId,
        templateVariant: variantMode,
        strategyLabel: buildVariantStrategyLabel(templateId, variantMode, index),
        fixStage: variantMode === 'base' ? baseFixStage : 'regional',
        intent: adaptation.intent,
        selectionReason:
          variantMode === 'base'
            ? (index === 0 ? 'selected primary template variant' : `alternative template variant:${templateId}`)
            : `product-support ${variantMode} variant:${templateId}`,
        selection: variantSelection,
      } satisfies MarketplaceCardTemplateVariantPlan
    })
  })

  return {
    selection,
    plans,
  }
}
