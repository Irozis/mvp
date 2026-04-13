import { afterEach, describe, expect, it, vi } from 'vitest'

import { getRepairDiagnostics } from './autoAdapt'
import { computePalette } from './colorEngine'
import { profileContent } from './contentProfile'
import { synthesizeLayout } from './layoutEngine'
import {
  allMarketplaceCardV2Archetypes,
  buildMarketplaceV2BaseLayoutIntent,
  buildMarketplaceV2Scene,
  isMarketplaceLayoutV2Enabled,
  selectPrimaryMarketplaceV2Archetype,
} from './marketplaceLayoutV2'
import { BRAND_TEMPLATES, FORMAT_MAP, baseScene } from './presets'
import { computeTypography } from './typographyEngine'
import { classifyScenario } from './scenarioClassifier'
import type { BrandKit } from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('marketplaceLayoutV2', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is disabled without Vite env flag', () => {
    vi.stubEnv('VITE_MARKETPLACE_LAYOUT_V2', '')
    expect(isMarketplaceLayoutV2Enabled()).toBe(false)
  })

  it('is enabled when VITE_MARKETPLACE_LAYOUT_V2 is true', () => {
    vi.stubEnv('VITE_MARKETPLACE_LAYOUT_V2', 'true')
    expect(isMarketplaceLayoutV2Enabled()).toBe(true)
  })

  it('synthesizeLayout uses slot path for marketplace-card when flag and intent are set', () => {
    vi.stubEnv('VITE_MARKETPLACE_LAYOUT_V2', 'true')
    const brandKit = clone(BRAND_TEMPLATES[0].brandKit) as BrandKit
    const master = baseScene('promo', brandKit.background, brandKit.accent)
    const format = FORMAT_MAP['marketplace-card']
    const profile = profileContent(master)
    const scenario = classifyScenario({
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
    })
    const palette = computePalette({ brandKit, visualSystem: 'product-card', scenario })
    const intent = {
      ...buildMarketplaceV2BaseLayoutIntent({ formatKey: 'marketplace-card', profile }),
      marketplaceV2Archetype: 'v2-card-split-image-right' as const,
    }
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
    const { scene, intent: outIntent, blocks } = synthesizeLayout({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })

    expect(outIntent.marketplaceLayoutEngine).toBe('v2-slot')
    expect(blocks).toEqual([])
    expect(scene.image.w || 0).toBeGreaterThan(30)
    expect(scene.image.x || 0).toBeGreaterThan(40)
    expect(scene.title.x || 0).toBeLessThan(50)
    expect(scene.cta.h || 0).toBeGreaterThan(4)
  })

  it('exposes card archetypes for preview enumeration', () => {
    expect(allMarketplaceCardV2Archetypes()).toHaveLength(6)
  })

  it('selects hero-shelf for balanced copy even when profile is text-first (e.g. marketplace-benefit-stack)', () => {
    const brandKit = clone(BRAND_TEMPLATES[0].brandKit) as BrandKit
    const master = baseScene('promo', brandKit.background, brandKit.accent)
    const profile = profileContent(master)
    expect(profile.preferredMessageMode).toBe('text-first')
    expect(profile.density).not.toBe('dense')
    expect(selectPrimaryMarketplaceV2Archetype({ formatKey: 'marketplace-card', profile })).toBe('v2-card-hero-shelf')
  })

  it('selects text-focus only for dense marketplace-card profiles', () => {
    const brandKit = clone(BRAND_TEMPLATES[0].brandKit) as BrandKit
    const master = baseScene('promo', brandKit.background, brandKit.accent)
    const profile = { ...profileContent(master), density: 'dense' as const }
    expect(selectPrimaryMarketplaceV2Archetype({ formatKey: 'marketplace-card', profile })).toBe('v2-card-text-focus')
  })

  it('buildMarketplaceV2Scene assigns stable tile split slots', () => {
    const brandKit = clone(BRAND_TEMPLATES[0].brandKit) as BrandKit
    const master = baseScene('promo', brandKit.background, brandKit.accent)
    const format = FORMAT_MAP['marketplace-tile']
    const profile = profileContent(master)
    const scenario = classifyScenario({
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
    })
    const intent = buildMarketplaceV2BaseLayoutIntent({ formatKey: 'marketplace-tile', profile })
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
    const scene = buildMarketplaceV2Scene({
      scene: master,
      format,
      typography,
      archetype: 'v2-tile-split-balanced',
    })
    expect(scene.image.x || 0).toBeGreaterThan(48)
    expect(scene.title.x || 0).toBeLessThan(10)
  })

  it('fixLayout falls through to legacy repair when V2 slot bypass does not improve score', async () => {
    vi.stubEnv('VITE_MARKETPLACE_LAYOUT_V2', 'true')
    const brandKit = clone(BRAND_TEMPLATES[0].brandKit) as BrandKit
    const master = baseScene('promo', brandKit.background, brandKit.accent)
    const format = FORMAT_MAP['marketplace-card']
    const profile = profileContent(master)
    const scenario = classifyScenario({
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
    })
    const palette = computePalette({ brandKit, visualSystem: 'product-card', scenario })
    const intent = {
      ...buildMarketplaceV2BaseLayoutIntent({ formatKey: 'marketplace-card', profile }),
      marketplaceV2Archetype: 'v2-card-hero-shelf' as const,
    }
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
    const { diagnostics, result } = await getRepairDiagnostics({
      scene,
      regenerationMasterScene: master,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
    })
    expect(diagnostics.searchRuns.length).toBeGreaterThan(0)
    expect(result.v2SlotLayoutPreserved).toBeUndefined()
  })
})
