import { describe, expect, it } from 'vitest'

import { profileContent } from './contentProfile'
import { FORMAT_MAP } from './presets'
import { buildMarketplaceCardTemplateVariantPlans } from './templateVariantGeneration'
import type { Scene } from './types'

function createScene(): Scene {
  return {
    background: ['#111827', '#1f2937', '#374151'],
    title: { text: 'New insulated bottle for daily hydration', x: 0, y: 0, w: 0, h: 0 },
    subtitle: { text: 'Leakproof product design with lightweight steel body and easy everyday carry.', x: 0, y: 0, w: 0, h: 0 },
    cta: { text: 'Buy now', x: 0, y: 0, w: 0, h: 0 },
    badge: { text: 'New', x: 0, y: 0, w: 0, h: 0 },
    logo: { text: '', x: 0, y: 0, w: 0, h: 0 },
    image: { x: 0, y: 0, w: 0, h: 0 },
    chip: '',
  } as Scene
}

describe('marketplace-card template variant generation', () => {
  it('adds an image-dominant-square variant for image-backed product-support templates in product-led cases', () => {
    const master = createScene()
    const generated = buildMarketplaceCardTemplateVariantPlans({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile: profileContent(master),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
    })

    const productSupportPlans = generated.plans.filter((plan) => plan.templateId === 'product-support-card')
    expect(productSupportPlans.some((plan) => plan.templateVariant === 'image-dominant-square')).toBe(true)
  })

  it('keeps commerce-lockup for image-backed product-support templates outside strict product-dominant cases', () => {
    const master = createScene()
    master.title.text = 'Trusted quality with verified support'
    master.subtitle.text = 'Reliable performance, guarantee coverage, and reviewer confidence for careful buyers.'
    master.cta.text = 'Learn more'
    master.badge.text = 'Verified'

    const generated = buildMarketplaceCardTemplateVariantPlans({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile: profileContent(master),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
    })

    const productSupportPlans = generated.plans.filter((plan) => plan.templateId === 'product-support-card')
    expect(productSupportPlans.some((plan) => plan.templateVariant === 'commerce-lockup')).toBe(true)
  })

  it('adds a proof-band variant for trust-heavy text-first cases', () => {
    const master = createScene()
    master.title.text = 'Trusted hydration with verified quality'
    master.subtitle.text = 'Reviewed product performance, guarantee-backed materials, and reliable everyday use.'
    master.cta.text = 'Learn more'
    master.badge.text = 'Verified'

    const generated = buildMarketplaceCardTemplateVariantPlans({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile: profileContent(master),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
    })

    const textFirstPlans = generated.plans.filter((plan) => plan.templateId === 'text-first-promo')
    expect(textFirstPlans.some((plan) => plan.templateVariant === 'proof-band')).toBe(true)
  })

  it('adds a comparison-lockup variant for comparison-led product-support cases', () => {
    const master = createScene()
    master.title.text = 'Compare the new bottle vs your old routine'
    master.subtitle.text = 'See the side-by-side product difference in carry comfort, insulation, and durability.'
    master.cta.text = 'Learn more'
    master.badge.text = 'Compare'

    const generated = buildMarketplaceCardTemplateVariantPlans({
      format: FORMAT_MAP['marketplace-card'],
      master,
      profile: profileContent(master),
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
    })

    const productSupportPlans = generated.plans.filter((plan) => plan.templateId === 'product-support-card')
    expect(productSupportPlans.some((plan) => plan.templateVariant === 'comparison-lockup')).toBe(true)
  })
})
