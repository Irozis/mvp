import { describe, expect, it } from 'vitest'

import { computePalette } from './colorEngine'
import { profileContent } from './contentProfile'
import { getMarketplaceTemplateZoneTrace, getSynthesisStageDiagnostics } from './layoutEngine'
import { adaptMarketplaceCardTemplate } from './templateAdapter'
import { BRAND_TEMPLATES, FORMAT_MAP } from './presets'
import type { MarketplaceCardTemplateSelectionResult, Scene } from './types'
import { computeTypography } from './typographyEngine'

function createScene(): Scene {
  return {
    background: ['#111827', '#1f2937', '#374151'],
    title: { text: 'New insulated bottle for daily hydration', x: 0, y: 0, w: 0, h: 0 },
    subtitle: { text: 'Leakproof product design with lightweight steel body.', x: 0, y: 0, w: 0, h: 0 },
    cta: { text: 'Buy now', x: 0, y: 0, w: 0, h: 0 },
    badge: { text: 'New', x: 0, y: 0, w: 0, h: 0 },
    logo: { text: '', x: 0, y: 0, w: 0, h: 0 },
    image: { x: 0, y: 0, w: 0, h: 0 },
    chip: '',
  } as Scene
}

function createSelection(
  selectedTemplateId: MarketplaceCardTemplateSelectionResult['selectedTemplateId'],
  overrides?: Partial<MarketplaceCardTemplateSelectionResult['inputProfile']>
): MarketplaceCardTemplateSelectionResult {
  return {
    selectedTemplateId,
    alternativeTemplateIds: ['header-panel-card', 'text-first-promo', 'product-support-card', 'minimal-promo-card']
      .filter((templateId) => templateId !== selectedTemplateId)
      .slice(0, 3) as MarketplaceCardTemplateSelectionResult['alternativeTemplateIds'],
    reasonCodes: ['image-backed', 'product-visual-critical'],
    decisionSummary: 'test selection',
    inputProfile: {
      hasRealImage: true,
      imageRegime: 'image-backed',
      imageProfile: 'square',
      copyDensity: 'balanced',
      preferredMessageMode: 'balanced',
      messageType: 'product',
      promoIntensity: 'medium',
      sellingAngle: 'product-led',
      primaryConversionAction: 'shop',
      offerStrength: 'none',
      proofPresence: 'feature',
      productVisualNeed: 'critical',
      messageCompressionNeed: 'medium',
      marketplaceCommercialHint: 'marketplace-product-hero',
      ctaFlow: 'strong',
      subtitlePresent: true,
      badgePresent: true,
      logoPresent: false,
      ctaPresent: true,
      ...overrides,
    },
  }
}

function createBrandKit() {
  return BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit
}

describe('marketplace-card template adapter', () => {
  it('gives product-support-card a stronger image-dominant split structure', () => {
    const adaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master: createScene(),
      profile: profileContent(createScene()),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      selectedTemplate: createSelection('product-support-card'),
    })

    expect(adaptation.intent.marketplaceTemplateId).toBe('product-support-card')
    expect(adaptation.intent.imageMode).toBe('split-right')
    expect(adaptation.zoneStructure.image.x).toBeGreaterThan(adaptation.zoneStructure.text.x)
    expect(adaptation.zoneStructure.image.w * adaptation.zoneStructure.image.h).toBeGreaterThan(
      adaptation.zoneStructure.text.w * adaptation.zoneStructure.text.h
    )
    expect(adaptation.zoneStructure.cta.x).toBe(adaptation.zoneStructure.text.x)
    expect(adaptation.zoneStructure.cta.y).toBeGreaterThan(adaptation.zoneStructure.text.y)
  })

  it('builds an image-dominant-square product-support variant with a larger product footprint', () => {
    const selectedTemplate = createSelection('product-support-card')
    const baseAdaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master: createScene(),
      profile: profileContent(createScene()),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'landscape' },
      selectedTemplate,
      variantMode: 'base',
    })
    const dominantAdaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master: createScene(),
      profile: profileContent(createScene()),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'landscape' },
      selectedTemplate,
      variantMode: 'image-dominant-square',
    })

    expect(dominantAdaptation.intent.marketplaceTemplateVariant).toBe('image-dominant-square')
    expect(dominantAdaptation.zoneStructure.image.w).toBeGreaterThan(baseAdaptation.zoneStructure.image.w)
    expect(dominantAdaptation.zoneStructure.image.h).toBeGreaterThan(baseAdaptation.zoneStructure.image.h)
    expect(dominantAdaptation.zoneStructure.text.w).toBeLessThan(baseAdaptation.zoneStructure.text.w)
    expect(dominantAdaptation.zoneStructure.cta.x).toBe(dominantAdaptation.zoneStructure.text.x)
  })

  it('preserves a minimum product image footprint through late synthesis stages', () => {
    const master = createScene()
    const profile = profileContent(master)
    const brandKit = createBrandKit()
    const adaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'landscape' },
      selectedTemplate: createSelection('product-support-card'),
      variantMode: 'image-dominant-square',
    })
    const palette = computePalette({
      brandKit,
      visualSystem: 'product-card',
      scenario: 'product-card',
    })
    const typography = computeTypography({
      format: FORMAT_MAP['marketplace-card'],
      profile,
      scenario: 'product-card',
      visualSystem: 'product-card',
      brandKit,
      intent: adaptation.intent,
      headlineText: master.title.text,
      subtitleText: master.subtitle.text,
      fixStage: 'base',
    })
    const synthesis = getSynthesisStageDiagnostics({
      master,
      format: FORMAT_MAP['marketplace-card'],
      profile,
      palette,
      typography,
      intent: adaptation.intent,
      brandKit,
      assetHint: { imageProfile: 'landscape' },
    })
    const finalStage = synthesis.stages[synthesis.stages.length - 1]

    expect(finalStage.scene.image.w || 0).toBeGreaterThanOrEqual(32)
    expect(finalStage.scene.image.h || 0).toBeGreaterThanOrEqual(18)
  })

  it('keeps product-support adapted zones from collapsing into text-safe image strips', () => {
    const master = createScene()
    const profile = profileContent(master)
    const adaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'landscape' },
      selectedTemplate: createSelection('product-support-card'),
      variantMode: 'image-dominant-square',
    })

    const zoneTrace = getMarketplaceTemplateZoneTrace({
      format: FORMAT_MAP['marketplace-card'],
      profile,
      intent: adaptation.intent,
      brandKit: createBrandKit(),
      assetHint: { imageProfile: 'landscape' },
    })

    expect(zoneTrace.adaptedZones.image.w).toBeGreaterThanOrEqual(40)
    expect(zoneTrace.adaptedZones.image.h).toBeGreaterThanOrEqual(32)
    expect(zoneTrace.adaptedZones.text.w).toBeLessThanOrEqual(36)
  })

  it('builds a proof-band text-first variant with a stronger trust strip and narrower message lockup', () => {
    const master = createScene()
    master.title.text = 'Trusted product quality for everyday hydration'
    master.subtitle.text = 'Verified reviews, guarantee-backed materials, and reliable daily performance.'
    master.cta.text = 'Learn more'
    master.badge.text = 'Verified'

    const baseAdaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile: profileContent(master),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      selectedTemplate: createSelection('text-first-promo', {
        sellingAngle: 'trust-led',
        primaryConversionAction: 'learn',
        proofPresence: 'review',
        productVisualNeed: 'useful',
      }),
      variantMode: 'base',
    })
    const proofBandAdaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile: profileContent(master),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      selectedTemplate: createSelection('text-first-promo', {
        sellingAngle: 'trust-led',
        primaryConversionAction: 'learn',
        proofPresence: 'review',
        productVisualNeed: 'useful',
      }),
      variantMode: 'proof-band',
    })

    expect(proofBandAdaptation.intent.marketplaceTemplateVariant).toBe('proof-band')
    expect(proofBandAdaptation.zoneStructure.image.w).toBeGreaterThan(baseAdaptation.zoneStructure.image.w)
    expect(proofBandAdaptation.zoneStructure.image.h).toBeGreaterThan(baseAdaptation.zoneStructure.image.h)
    expect(proofBandAdaptation.zoneStructure.text.w).toBeLessThan(baseAdaptation.zoneStructure.text.w)
  })

  it('surfaces image-backed text-first late family-shaping diagnostics before final synthesis locks in', () => {
    const master = createScene()
    master.title.text = 'Verified quality with strong everyday benefits'
    master.subtitle.text = 'Trusted reviews, reliable performance, and guarantee-backed confidence for buyers.'
    master.cta.text = 'Learn more'
    master.badge.text = 'Top rated'

    const profile = profileContent(master)
    const brandKit = createBrandKit()
    const adaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      selectedTemplate: createSelection('text-first-promo', {
        imageRegime: 'image-backed',
        imageProfile: 'square',
        sellingAngle: 'trust-led',
        primaryConversionAction: 'learn',
        proofPresence: 'review',
        productVisualNeed: 'useful',
        messageCompressionNeed: 'medium',
      }),
      variantMode: 'proof-band',
    })
    const palette = computePalette({
      brandKit,
      visualSystem: 'product-card',
      scenario: 'text-heavy-ad',
    })
    const typography = computeTypography({
      format: FORMAT_MAP['marketplace-card'],
      profile,
      scenario: 'text-heavy-ad',
      visualSystem: 'product-card',
      brandKit,
      intent: adaptation.intent,
      headlineText: master.title.text,
      subtitleText: master.subtitle.text,
      fixStage: 'base',
    })
    const synthesis = getSynthesisStageDiagnostics({
      master,
      format: FORMAT_MAP['marketplace-card'],
      profile,
      palette,
      typography,
      intent: adaptation.intent,
      brandKit,
      assetHint: { imageProfile: 'square' },
    })
    const familyStage = synthesis.stages.find((stage) => stage.stage === 'family-shaped')
    const finalStage = synthesis.stages[synthesis.stages.length - 1]
    const ctaXAlignAdjustment = familyStage?.perceptualAdjustment?.perAdjustments?.find(
      (entry) => entry.id === 'text-first-cta-x-align'
    )
    const rhythmAdjustment = familyStage?.perceptualAdjustment?.perAdjustments?.find(
      (entry) => entry.id === 'text-first-title-subtitle-rhythm-shape'
    )
    const subtitleMassAdjustment = familyStage?.perceptualAdjustment?.perAdjustments?.find(
      (entry) => entry.id === 'text-first-subtitle-proof-mass-shape'
    )
    const baselineAlignAdjustment = familyStage?.perceptualAdjustment?.perAdjustments?.find(
      (entry) => entry.id === 'text-first-cluster-baseline-align'
    )

    expect(familyStage?.perceptualAdjustment?.triggers).toContain('text-first-detached-cta-tail')
    expect(ctaXAlignAdjustment?.applied).toBe(false)
    expect(ctaXAlignAdjustment?.introducedIssues).toBeUndefined()
    expect(ctaXAlignAdjustment?.delta.cta || 0).toBe(0)
    expect((ctaXAlignAdjustment?.delta.deadSpace || 0)).toBeLessThanOrEqual(0)
    expect(rhythmAdjustment).toBeDefined()
    expect((rhythmAdjustment?.delta.readingFlow || 0)).toBeGreaterThanOrEqual(2)
    expect((rhythmAdjustment?.delta.deadSpace || 0)).toBeLessThanOrEqual(4)
    expect((rhythmAdjustment?.delta.balance || 0)).toBeGreaterThanOrEqual(-2)
    expect(subtitleMassAdjustment).toBeDefined()
    expect((subtitleMassAdjustment?.delta.cluster || 0)).toBeGreaterThanOrEqual(0)
    expect((subtitleMassAdjustment?.delta.deadSpace || 0)).toBeLessThanOrEqual(2)
    expect((subtitleMassAdjustment?.delta.balance || 0)).toBeGreaterThanOrEqual(-1)
    expect(subtitleMassAdjustment?.introducedIssues).toBeUndefined()
    expect(subtitleMassAdjustment?.effectiveRect?.subtitleBefore).toBeDefined()
    expect(subtitleMassAdjustment?.effectiveRect?.subtitleAfter).toBeDefined()
    expect(subtitleMassAdjustment?.effectiveRect?.subtitleLineCountBefore).toBeDefined()
    expect(subtitleMassAdjustment?.effectiveRect?.subtitleLineCountAfter).toBeDefined()
    expect(
      (subtitleMassAdjustment?.effectiveRect?.subtitleCharsPerLineAfter || 0)
    ).toBeLessThan(
      subtitleMassAdjustment?.effectiveRect?.subtitleCharsPerLineBefore || Number.POSITIVE_INFINITY
    )
    expect(
      (subtitleMassAdjustment?.effectiveRect?.subtitleMaxLinesAfter || 0)
    ).toBeGreaterThan(
      subtitleMassAdjustment?.effectiveRect?.subtitleMaxLinesBefore || 0
    )
    expect(baselineAlignAdjustment?.applied).toBe(false)
    expect(baselineAlignAdjustment?.delta.cta || 0).toBeGreaterThanOrEqual(0)
    expect((baselineAlignAdjustment?.delta.deadSpace || 0)).toBeLessThanOrEqual(4)
    expect((baselineAlignAdjustment?.delta.balance || 0)).toBeGreaterThanOrEqual(-2)
    expect((baselineAlignAdjustment?.delta.readingFlow || 0)).toBeGreaterThanOrEqual(1)
    expect(finalStage.scene.image.w || 0).toBeGreaterThanOrEqual(30)
    expect(finalStage.scene.image.h || 0).toBeGreaterThanOrEqual(28)
    expect(finalStage.scene.title.y || 0).toBeLessThanOrEqual(50)
    expect(finalStage.scene.cta.y || 0).toBeLessThanOrEqual(66)
    expect(finalStage.scene.cta.w || 0).toBeGreaterThanOrEqual(18)
    expect(finalStage.structuralState.status).toBe('valid')
    expect(finalStage.structuralState.metrics.occupiedSafeArea).toBeGreaterThanOrEqual(0.18)
  })

  it('keeps no-image dense trust text-first layouts from collapsing into a low text slab', () => {
    const master = createScene()
    master.title.text = 'Trusted results backed by verified reviews'
    master.subtitle.text =
      'Top-rated quality with reviewer feedback, reliable performance, and guarantee coverage for buyers who need proof before they shop.'
    master.cta.text = 'Learn more'
    master.badge.text = 'Verified'

    const profile = profileContent(master)
    const brandKit = createBrandKit()
    const adaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      selectedTemplate: createSelection('text-first-promo', {
        hasRealImage: false,
        imageRegime: 'no-image',
        imageProfile: 'square',
        copyDensity: 'dense',
        sellingAngle: 'trust-led',
        primaryConversionAction: 'learn',
        proofPresence: 'review',
        productVisualNeed: 'useful',
      }),
      variantMode: 'proof-band',
    })
    const palette = computePalette({
      brandKit,
      visualSystem: 'product-card',
      scenario: 'text-heavy-ad',
    })
    const typography = computeTypography({
      format: FORMAT_MAP['marketplace-card'],
      profile,
      scenario: 'text-heavy-ad',
      visualSystem: 'product-card',
      brandKit,
      intent: adaptation.intent,
      headlineText: master.title.text,
      subtitleText: master.subtitle.text,
      fixStage: 'base',
    })
    const synthesis = getSynthesisStageDiagnostics({
      master,
      format: FORMAT_MAP['marketplace-card'],
      profile,
      palette,
      typography,
      intent: adaptation.intent,
      brandKit,
    })
    const finalStage = synthesis.stages[synthesis.stages.length - 1]

    expect(finalStage.scene.title.y || 0).toBeLessThanOrEqual(44)
    expect(finalStage.scene.cta.y || 0).toBeLessThanOrEqual(72)
    expect(finalStage.scene.image.h || 0).toBeLessThanOrEqual(18)
  })

  it('captures header-panel late shaping opportunities without destabilizing the calm stack', () => {
    const master = createScene()
    master.title.text = 'Clear everyday benefits without a hard offer'
    master.subtitle.text = 'A calm marketplace card with support copy that still needs a stronger CTA lockup.'
    master.cta.text = 'Learn more'
    master.badge.text = 'New'

    const profile = profileContent(master)
    const brandKit = createBrandKit()
    const adaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      selectedTemplate: createSelection('header-panel-card', {
        hasRealImage: false,
        imageRegime: 'no-image',
        copyDensity: 'balanced',
        sellingAngle: 'benefit-led',
        primaryConversionAction: 'learn',
        proofPresence: 'none',
        productVisualNeed: 'optional',
      }),
      variantMode: 'base',
    })
    const palette = computePalette({
      brandKit,
      visualSystem: 'product-card',
      scenario: 'text-heavy-ad',
    })
    const typography = computeTypography({
      format: FORMAT_MAP['marketplace-card'],
      profile,
      scenario: 'text-heavy-ad',
      visualSystem: 'product-card',
      brandKit,
      intent: adaptation.intent,
      headlineText: master.title.text,
      subtitleText: master.subtitle.text,
      fixStage: 'base',
    })
    const synthesis = getSynthesisStageDiagnostics({
      master,
      format: FORMAT_MAP['marketplace-card'],
      profile,
      palette,
      typography,
      intent: adaptation.intent,
      brandKit,
    })
    const familyStage = synthesis.stages.find((stage) => stage.stage === 'family-shaped')
    const finalStage = synthesis.stages[synthesis.stages.length - 1]
    const ctaPullAdjustment = familyStage?.perceptualAdjustment?.perAdjustments?.find(
      (entry) => entry.id === 'header-panel-cta-stack-pull'
    )

    expect(familyStage?.perceptualAdjustment?.triggers).toContain('header-panel-detached-footer-cta')
    expect(familyStage?.perceptualAdjustment?.adjustments).toContain('kept header-panel CTA as part of the message stack')
    expect(familyStage?.perceptualAdjustment?.applied).toBe(true)
    expect(familyStage?.perceptualAdjustment?.acceptedBy).toContain('safe-sub-adjustment-subset')
    expect(ctaPullAdjustment?.applied).toBe(true)
    expect(ctaPullAdjustment?.introducedIssues).toContain('hotspot-score')
    expect((familyStage?.perceptualAdjustment?.gainSummary?.ctaDelta || 0)).toBeGreaterThanOrEqual(18)
    expect((familyStage?.perceptualAdjustment?.gainSummary?.deadSpaceDelta || 0)).toBeLessThanOrEqual(8)
    expect((familyStage?.perceptualAdjustment?.afterSignals?.ctaIntegration || 0)).toBeGreaterThan(
      familyStage?.perceptualAdjustment?.beforeSignals?.ctaIntegration || 0
    )
    expect(finalStage.scene.cta.y || 0).toBeLessThanOrEqual(80)
    expect(finalStage.scene.cta.x).toBeLessThanOrEqual(26)
    expect(finalStage.scene.title.y || 0).toBeLessThanOrEqual(56)
  })

  it('builds a comparison-lockup product-support variant with wider comparison copy support', () => {
    const master = createScene()
    master.title.text = 'Compare the new bottle vs your old routine'
    master.subtitle.text = 'See side-by-side product improvement in insulation, carry comfort, and durability.'
    master.cta.text = 'Learn more'
    master.badge.text = 'Compare'

    const baseAdaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile: profileContent(master),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      selectedTemplate: createSelection('product-support-card'),
      variantMode: 'base',
    })
    const comparisonAdaptation = adaptMarketplaceCardTemplate({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile: profileContent(master),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      selectedTemplate: createSelection('product-support-card'),
      variantMode: 'comparison-lockup',
    })

    expect(comparisonAdaptation.intent.marketplaceTemplateVariant).toBe('comparison-lockup')
    expect(comparisonAdaptation.zoneStructure.text.w).toBeGreaterThan(baseAdaptation.zoneStructure.text.w)
    expect(comparisonAdaptation.zoneStructure.text.h).toBeGreaterThan(baseAdaptation.zoneStructure.text.h)
    expect(comparisonAdaptation.zoneStructure.image.w).toBeLessThan(baseAdaptation.zoneStructure.image.w)
  })
})
