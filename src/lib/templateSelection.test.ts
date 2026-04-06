import { describe, expect, it } from 'vitest'

import { FORMAT_MAP } from './presets'
import { explainMarketplaceCardTemplateSelection, selectMarketplaceCardTemplate } from './templateSelection'
import type { ContentProfile } from './types'

function createProfile(overrides: Partial<ContentProfile> = {}): ContentProfile {
  return {
    headlineLength: 28,
    subtitleLength: 24,
    bodyLength: 0,
    ctaLength: 8,
    badgeLength: 6,
    priceLength: 0,
    density: 'balanced',
    textWeight: 58,
    hasOffer: false,
    offerWeight: 0,
    preferredMessageMode: 'balanced',
    messageType: 'promo',
    promoIntensity: 'medium',
    tone: 'bold',
    ctaImportance: 'high',
    semanticType: 'promo',
    headlineTone: 'direct',
    needsStrongCTA: true,
    needsOfferDominance: false,
    sellingAngle: 'benefit-led',
    primaryConversionAction: 'shop',
    offerStrength: 'weak',
    proofPresence: 'none',
    productVisualNeed: 'optional',
    messageCompressionNeed: 'medium',
    marketplaceCommercialHint: 'marketplace-benefit-stack',
    ...overrides,
  }
}

describe('marketplace-card template selection', () => {
  const format = FORMAT_MAP['marketplace-card']

  it('keeps compact no-image offers away from text-first-promo by default', () => {
    const selection = selectMarketplaceCardTemplate({
      format,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      profile: createProfile({
        density: 'light',
        subtitleLength: 0,
        badgeLength: 0,
        ctaLength: 8,
        promoIntensity: 'high',
        sellingAngle: 'urgency-led',
        primaryConversionAction: 'claim',
        offerStrength: 'medium',
        productVisualNeed: 'optional',
        messageCompressionNeed: 'low',
        marketplaceCommercialHint: 'marketplace-price-punch',
      }),
    })

    expect(selection.selectedTemplateId).toBe('header-panel-card')
    expect(selection.selectedTemplateId).not.toBe('text-first-promo')
  })

  it('prefers product-support-card for image-backed product-led cases', () => {
    const selection = selectMarketplaceCardTemplate({
      format,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      profile: createProfile({
        messageType: 'product',
        semanticType: 'product',
        preferredMessageMode: 'image-first',
        sellingAngle: 'product-led',
        primaryConversionAction: 'shop',
        offerStrength: 'medium',
        proofPresence: 'feature',
        productVisualNeed: 'critical',
        messageCompressionNeed: 'medium',
        marketplaceCommercialHint: 'marketplace-product-hero',
      }),
    })

    expect(selection.selectedTemplateId).toBe('product-support-card')
  })

  it('uses proof-oriented metadata for trust-led cases', () => {
    const explanation = explainMarketplaceCardTemplateSelection({
      format,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      profile: createProfile({
        density: 'dense',
        preferredMessageMode: 'text-first',
        sellingAngle: 'trust-led',
        primaryConversionAction: 'learn',
        offerStrength: 'none',
        proofPresence: 'review',
        productVisualNeed: 'useful',
        messageCompressionNeed: 'high',
        marketplaceCommercialHint: 'marketplace-proof-led',
      }),
    })

    expect(explanation.selectedTemplateId).toBe('text-first-promo')
    const winningDebug = explanation.debug?.rankedTemplates.find(
      (entry) => entry.templateId === explanation.selectedTemplateId
    )
    expect(winningDebug?.reasonCodes).toContain('proof-led')
  })

  it('treats catalog-led cases as product-visual-critical', () => {
    const selection = selectMarketplaceCardTemplate({
      format,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'landscape' },
      profile: createProfile({
        messageType: 'product',
        semanticType: 'product',
        preferredMessageMode: 'image-first',
        sellingAngle: 'catalog-led',
        primaryConversionAction: 'browse',
        offerStrength: 'weak',
        proofPresence: 'feature',
        productVisualNeed: 'critical',
        messageCompressionNeed: 'high',
        marketplaceCommercialHint: 'marketplace-catalog-tile',
      }),
    })

    expect(selection.selectedTemplateId).toBe('product-support-card')
  })
})
