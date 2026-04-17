import { describe, expect, it } from 'vitest'

import { computePalette } from './colorEngine'
import { profileContent } from './contentProfile'
import { synthesizeLayout } from './layoutEngine'
import { adaptMarketplaceCardTemplate } from './templateAdapter'
import { BRAND_TEMPLATES, FORMAT_MAP } from './presets'
import { classifyScenario } from './scenarioClassifier'
import { computeTypography } from './typographyEngine'
import type { MarketplaceCardTemplateSelectionResult, Scene } from './types'

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
    },
  }
}

function createBrandKit() {
  return BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit
}

describe('template zone ownership', () => {
  it('template zones reach the final scene geometry', () => {
    const master = createScene()
    const format = FORMAT_MAP['marketplace-card']
    const profile = profileContent(master)
    const brandKit = createBrandKit()
    const scenario = classifyScenario({
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
    })

    const adaptation = adaptMarketplaceCardTemplate({
      format,
      master,
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      selectedTemplate: createSelection('product-support-card'),
    })

    const { intent, zoneStructure } = adaptation

    const palette = computePalette({ brandKit, visualSystem: 'product-card', scenario })
    const typography = computeTypography({
      format,
      profile,
      scenario,
      visualSystem: 'product-card',
      brandKit,
      intent,
      headlineText: master.title.text,
      subtitleText: master.subtitle.text,
    })

    const { scene } = synthesizeLayout({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })

    const imageCenterX = (scene.image.x || 0) + (scene.image.w || 0) / 2
    const imageCenterY = (scene.image.y || 0) + (scene.image.h || 0) / 2
    const zoneImageCenterX = zoneStructure.image.x + zoneStructure.image.w / 2
    const zoneImageCenterY = zoneStructure.image.y + zoneStructure.image.h / 2
    expect(Math.abs(imageCenterX - zoneImageCenterX)).toBeLessThanOrEqual(15)
    expect(Math.abs(imageCenterY - zoneImageCenterY)).toBeLessThanOrEqual(15)

    const titleX = scene.title.x || 0
    expect(titleX).toBeGreaterThanOrEqual(zoneStructure.text.x - 10)
    expect(titleX).toBeLessThanOrEqual(zoneStructure.text.x + zoneStructure.text.w + 10)

    expect(scene.cta.y || 0).toBeGreaterThan(scene.title.y || 0)
  })
})
