import { afterEach, describe, expect, it, vi } from 'vitest'

import { profileContent } from './contentProfile'
import { allMarketplaceCardV2Archetypes, buildMarketplaceV2BaseLayoutIntent } from './marketplaceLayoutV2'
import * as marketplaceLayoutV2 from './marketplaceLayoutV2'
import { buildPreviewCandidatePlans } from './layoutPipelineCore'
import { FORMAT_MAP, BRAND_TEMPLATES, baseScene } from './presets'
import { classifyScenario } from './scenarioClassifier'
import { computePalette } from './colorEngine'
import { computeTypography } from './typographyEngine'
import { synthesizeLayout } from './layoutEngine'
import * as templateVariantGeneration from './templateVariantGeneration'
import type { BrandKit } from './types'

/** Snapshot before tests replace the module export with spies (avoids mock recursion). */
const buildMarketplaceCardTemplateVariantPlansOriginal =
  templateVariantGeneration.buildMarketplaceCardTemplateVariantPlans

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createMarketplaceCardInputs() {
  const brandKit = clone(BRAND_TEMPLATES[0].brandKit) as BrandKit
  const master = baseScene('promo', brandKit.background, brandKit.accent)
  const profile = profileContent(master)
  const format = FORMAT_MAP['marketplace-card']
  const seed = buildMarketplaceCardTemplateVariantPlansOriginal({
    format,
    master,
    profile,
    goal: 'promo-pack',
    visualSystem: 'product-card',
    assetHint: { imageProfile: 'square' },
  })
  const baseIntent = seed.plans[0].intent
  return { master, profile, baseIntent }
}

function createSocialSquareBaseIntent() {
  const brandKit = clone(BRAND_TEMPLATES[0].brandKit) as BrandKit
  const master = baseScene('promo', brandKit.background, brandKit.accent)
  const format = FORMAT_MAP['social-square']
  const profile = profileContent(master)
  const scenario = classifyScenario({
    profile,
    goal: 'promo-pack',
    visualSystem: 'product-card',
  })
  const palette = computePalette({ brandKit, visualSystem: 'product-card', scenario })
  const intent = buildMarketplaceV2BaseLayoutIntent({ formatKey: 'marketplace-card', profile })
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
  const { intent: layoutIntent } = synthesizeLayout({
    master,
    format,
    profile,
    palette,
    typography,
    intent,
    brandKit,
  })
  return { master, profile, baseIntent: layoutIntent }
}

describe('buildPreviewCandidatePlans — marketplace-card non-V2 template preview breadth cap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('limits template-derived preview attempts to Math.min(budget, allMarketplaceCardV2Archetypes().length)', () => {
    vi.spyOn(marketplaceLayoutV2, 'isMarketplaceLayoutV2Enabled').mockReturnValue(false)
    const templateSpy = vi.spyOn(templateVariantGeneration, 'buildMarketplaceCardTemplateVariantPlans').mockImplementation((input) => {
      const out = buildMarketplaceCardTemplateVariantPlansOriginal(input)
      const template = out.plans[0]
      if (!template) {
        throw new Error('expected at least one marketplace-card template variant plan')
      }
      const inflated = Array.from({ length: 20 }, (_, i) => ({
        ...template,
        id: `inflated-${i}`,
        strategyLabel: `inflated-${i}`,
      }))
      return { ...out, plans: inflated }
    })

    const { master, profile, baseIntent } = createMarketplaceCardInputs()
    const cap = allMarketplaceCardV2Archetypes().length
    const budget = 10
    const { meta } = buildPreviewCandidatePlans({
      formatKey: 'marketplace-card',
      master,
      profile,
      baseIntent,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      budget,
    })

    expect(templateSpy).toHaveBeenCalled()
    expect(meta.attemptedPlans).toBe(Math.min(budget, cap))
  })

  it('uses budget when it is tighter than the archetype cap', () => {
    vi.spyOn(marketplaceLayoutV2, 'isMarketplaceLayoutV2Enabled').mockReturnValue(false)
    vi.spyOn(templateVariantGeneration, 'buildMarketplaceCardTemplateVariantPlans').mockImplementation((input) => {
      const out = buildMarketplaceCardTemplateVariantPlansOriginal(input)
      const template = out.plans[0]
      if (!template) {
        throw new Error('expected at least one marketplace-card template variant plan')
      }
      const inflated = Array.from({ length: 20 }, (_, i) => ({
        ...template,
        id: `inflated-${i}`,
        strategyLabel: `inflated-${i}`,
      }))
      return { ...out, plans: inflated }
    })

    const { master, profile, baseIntent } = createMarketplaceCardInputs()
    const budget = 3
    const { meta } = buildPreviewCandidatePlans({
      formatKey: 'marketplace-card',
      master,
      profile,
      baseIntent,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      budget,
    })

    expect(meta.attemptedPlans).toBe(Math.min(budget, allMarketplaceCardV2Archetypes().length))
  })
})

describe('buildPreviewCandidatePlans — marketplace-card V2 path', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not invoke the marketplace-card template variant plan builder', () => {
    vi.spyOn(marketplaceLayoutV2, 'isMarketplaceLayoutV2Enabled').mockReturnValue(true)
    const templateSpy = vi.spyOn(templateVariantGeneration, 'buildMarketplaceCardTemplateVariantPlans').mockImplementation(() => {
      throw new Error('buildMarketplaceCardTemplateVariantPlans should not run when marketplace layout V2 is enabled')
    })

    const { master, profile, baseIntent } = createMarketplaceCardInputs()
    const { plans, meta } = buildPreviewCandidatePlans({
      formatKey: 'marketplace-card',
      master,
      profile,
      baseIntent,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint: { imageProfile: 'square' },
      budget: 10,
    })

    expect(templateSpy).not.toHaveBeenCalled()
    expect(plans.every((p) => p.strategyLabel.startsWith('marketplace-v2-'))).toBe(true)
    expect(meta.attemptedPlans).toBe(allMarketplaceCardV2Archetypes().length)
  })
})

describe('buildPreviewCandidatePlans — non–marketplace-card formats', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not invoke the marketplace-card template variant plan builder', () => {
    vi.spyOn(marketplaceLayoutV2, 'isMarketplaceLayoutV2Enabled').mockReturnValue(false)
    const templateSpy = vi.spyOn(templateVariantGeneration, 'buildMarketplaceCardTemplateVariantPlans').mockImplementation(() => {
      throw new Error('buildMarketplaceCardTemplateVariantPlans should not run for non–marketplace-card preview planning')
    })

    const { master, profile, baseIntent } = createSocialSquareBaseIntent()
    const { plans } = buildPreviewCandidatePlans({
      formatKey: 'social-square',
      master,
      profile,
      baseIntent,
      goal: 'promo-pack',
      visualSystem: 'product-card',
    })

    expect(templateSpy).not.toHaveBeenCalled()
    expect(plans.length).toBeGreaterThan(0)
  })
})
