import { describe, expect, it } from 'vitest'

import { FORMAT_MAP } from './presets'
import { computePerceptualSignals } from './perceptualSignals'
import { refineMarketplaceCardPerceptualComposition } from './perceptualRefinement'
import type { LayoutIntent, Scene } from './types'

function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    background: ['#ffffff', '#f4f4f4', '#eaeaea'],
    accent: '#111111',
    title: { x: 12, y: 16, w: 36, h: 8, text: 'Headline' },
    subtitle: { x: 12, y: 30, w: 34, h: 8, text: 'Support line' },
    cta: { x: 12, y: 76, w: 14, h: 5, text: 'Learn more' },
    badge: { x: 8, y: 8, w: 10, h: 5, text: '' },
    logo: { x: 80, y: 8, w: 10, h: 5, text: '' },
    image: { x: 62, y: 12, w: 28, h: 28, text: '' },
    ...overrides,
  }
}

function createIntent(overrides: Partial<LayoutIntent> = {}): LayoutIntent {
  return {
    family: 'square-image-top-text-bottom',
    compositionModelId: 'square-balanced-card',
    marketplaceTemplateId: 'text-first-promo',
    marketplaceTemplateVariant: 'proof-band',
    marketplaceTemplateSelection: {
      selectedTemplateId: 'text-first-promo',
      alternativeTemplateIds: ['header-panel-card'],
      reasonCodes: ['proof-led'],
      decisionSummary: 'trust-led proof-band',
      inputProfile: {
        imageRegime: 'image-backed',
        hasRealImage: true,
        imageProfile: 'square',
        copyDensity: 'balanced',
        preferredMessageMode: 'text-first',
        messageType: 'promo',
        promoIntensity: 'medium',
        subtitlePresent: true,
        badgePresent: true,
        sellingAngle: 'trust-led',
        primaryConversionAction: 'learn',
        offerStrength: 'none',
        proofPresence: 'review',
        productVisualNeed: 'useful',
        messageCompressionNeed: 'medium',
        marketplaceCommercialHint: 'marketplace-proof-led',
        ctaFlow: 'compact',
        logoPresent: false,
        ctaPresent: true,
      },
    },
    imageMode: 'split-right',
    textMode: 'cluster-left',
    balanceMode: 'text-dominant',
    tension: 'promo',
    mode: 'text-first',
    structuralArchetype: 'dense-information',
    balanceRegime: 'text-first',
    occupancyMode: 'balanced',
    ...overrides,
  }
}

describe('refineMarketplaceCardPerceptualComposition', () => {
  const format = FORMAT_MAP['marketplace-card']

  it('pulls a detached CTA closer to the text cluster', () => {
    const scene = createScene({
      cta: { x: 20, y: 82, w: 14, h: 5, text: 'Learn more' },
    })
    const before = computePerceptualSignals(scene)

    const refined = refineMarketplaceCardPerceptualComposition({
      scene,
      format,
      intent: createIntent(),
      signals: before,
    })
    const after = computePerceptualSignals(refined.scene)

    expect(refined.diagnostics.applied).toBe(true)
    expect(refined.diagnostics.triggers).toContain('low-cta-integration')
    expect(after.ctaIntegration).toBeGreaterThan(before.ctaIntegration)
  })

  it('tightens a weak text cluster into a more cohesive lockup', () => {
    const scene = createScene({
      subtitle: { x: 20, y: 38, w: 24, h: 8, text: 'Offset support' },
      cta: { x: 26, y: 76, w: 14, h: 5, text: 'Learn more' },
    })
    const before = computePerceptualSignals(scene)

    const refined = refineMarketplaceCardPerceptualComposition({
      scene,
      format,
      intent: createIntent(),
      signals: before,
    })
    const after = computePerceptualSignals(refined.scene)

    expect(refined.diagnostics.triggers).toContain('weak-cluster-cohesion')
    expect(after.clusterCohesion).toBeGreaterThan(before.clusterCohesion)
  })

  it('reduces dead space in no-image message-led cards', () => {
    const scene = createScene({
      image: { x: 8, y: 8, w: 76, h: 12, text: '' },
      title: { x: 12, y: 44, w: 28, h: 8, text: 'Calm message' },
      subtitle: { x: 12, y: 58, w: 24, h: 8, text: 'Short support' },
      cta: { x: 12, y: 80, w: 14, h: 5, text: 'Shop' },
    })
    const before = computePerceptualSignals(scene)

    const refined = refineMarketplaceCardPerceptualComposition({
      scene,
      format,
      intent: createIntent({
        marketplaceTemplateId: 'header-panel-card',
        marketplaceTemplateVariant: 'base',
        marketplaceTemplateSelection: {
          ...createIntent().marketplaceTemplateSelection!,
          selectedTemplateId: 'header-panel-card',
          inputProfile: {
            ...createIntent().marketplaceTemplateSelection!.inputProfile,
            imageRegime: 'no-image',
            sellingAngle: 'benefit-led',
            marketplaceCommercialHint: 'marketplace-benefit-stack',
          },
        },
      }),
      signals: before,
    })
    const after = computePerceptualSignals(refined.scene)

    expect(refined.diagnostics.triggers).toContain('high-dead-space')
    expect(after.deadSpaceScore).toBeLessThan(before.deadSpaceScore)
  })

  it('rebalances message-first templates when image dominates too strongly', () => {
    const scene = createScene({
      image: { x: 60, y: 10, w: 34, h: 34, text: '' },
      title: { x: 10, y: 18, w: 28, h: 8, text: 'Trust-led message' },
      subtitle: { x: 10, y: 32, w: 24, h: 8, text: 'Proof copy' },
    })
    const before = computePerceptualSignals(scene)

    const refined = refineMarketplaceCardPerceptualComposition({
      scene,
      format,
      intent: createIntent(),
      signals: before,
    })
    const after = computePerceptualSignals(refined.scene)

    expect(refined.diagnostics.triggers).toContain('image-overweight-vs-message')
    expect(after.imageDominance).toBeLessThanOrEqual(before.imageDominance)
    expect(after.textDominance).toBeGreaterThanOrEqual(before.textDominance)
  })
})
