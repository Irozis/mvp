import { afterEach, describe, expect, it, vi } from 'vitest'

import { getRepairDiagnostics } from './autoAdapt'
import { computePalette } from './colorEngine'
import { profileContent } from './contentProfile'
import { getSynthesisStageDiagnostics, synthesizeLayout } from './layoutEngine'
import {
  allMarketplaceCardV2Archetypes,
  buildMarketplaceV2BaseLayoutIntent,
  buildMarketplaceV2Scene,
  isMarketplaceLayoutV2Enabled,
  selectPrimaryMarketplaceV2Archetype,
} from './marketplaceLayoutV2'
import { BRAND_TEMPLATES, FORMAT_MAP, baseScene } from './presets'
import { computeTypography } from './typographyEngine'
import { chooseLayoutIntent, classifyScenario } from './scenarioClassifier'
import type { BrandKit } from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function assertSynthesisMatchesDiagnostics(
  synth: ReturnType<typeof synthesizeLayout>,
  diag: ReturnType<typeof getSynthesisStageDiagnostics>,
) {
  expect(synth.blocks).toEqual(diag.blocks)
  expect(synth.intent).toEqual(diag.intent)
  expect(diag.compositionModelId).toBe(synth.intent.compositionModelId)
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
    const { scene, intent: outIntent, blocks, layoutPathMetadata } = synthesizeLayout({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })

    expect(outIntent.marketplaceLayoutEngine).toBe('v2-slot')
    expect(layoutPathMetadata).toBe('layout-path:marketplace-card:v2-slot')
    expect(blocks).toEqual([])
    expect(scene.image.w || 0).toBeGreaterThan(30)
    expect(scene.image.x || 0).toBeGreaterThan(40)
    expect(scene.title.x || 0).toBeLessThan(50)
    expect(scene.cta.h || 0).toBeGreaterThan(4)
  })

  it('does not expose marketplace-card slot marker for non-marketplace-card flows', () => {
    vi.stubEnv('VITE_MARKETPLACE_LAYOUT_V2', 'true')
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
    const result = synthesizeLayout({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })

    expect(result.layoutPathMetadata).toBeUndefined()
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

describe('marketplace synthesis route selection (regression)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('selects marketplace-v2-slot when shouldSynthesizeMarketplaceLayoutV2 holds; diagnostics stay aligned with synthesizeLayout', () => {
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
    const synth = synthesizeLayout({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })
    const diag = getSynthesisStageDiagnostics({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })

    expect(synth.blocks).toEqual([])
    expect(diag.blocks).toEqual([])
    expect(diag.stages.map((s) => s.stage)).toEqual(['packed', 'finalized', 'stabilized', 'final-assessed'])
    expect(diag.stages.some((s) => s.stage === 'refined')).toBe(false)
    assertSynthesisMatchesDiagnostics(synth, diag)
  })

  it('selects marketplace-card-template-driven for marketplace-card + marketplaceTemplateId when not on V2 slot; diagnostics stay aligned', () => {
    vi.stubEnv('VITE_MARKETPLACE_LAYOUT_V2', '')
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
      marketplaceTemplateId: 'regression-template-driven-route',
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
    const synth = synthesizeLayout({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })
    const diag = getSynthesisStageDiagnostics({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })

    expect(synth.intent.marketplaceTemplateId).toBe('regression-template-driven-route')
    expect(diag.compositionModelId).toBeUndefined()
    expect(diag.stages.some((s) => s.stage === 'refined')).toBe(true)
    assertSynthesisMatchesDiagnostics(synth, diag)
  })

  it('selects composition-packing for non-marketplace V2 template routes; diagnostics stay aligned', () => {
    vi.stubEnv('VITE_MARKETPLACE_LAYOUT_V2', 'true')
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
    const intent = chooseLayoutIntent({
      format,
      master,
      profile,
      visualSystem: 'product-card',
      goal: 'promo-pack',
    })
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
    const synth = synthesizeLayout({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })
    const diag = getSynthesisStageDiagnostics({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })

    expect(diag.stages.map((s) => s.stage)).not.toEqual(['packed', 'finalized', 'stabilized', 'final-assessed'])
    expect(diag.stages.some((s) => s.stage === 'refined')).toBe(true)
    expect(diag.compositionModelId).toBe(synth.intent.compositionModelId)
    expect(diag.compositionModelId).toBeTruthy()
    assertSynthesisMatchesDiagnostics(synth, diag)
  })

  it('selects composition-packing for marketplace-card without template id when V2 is off; diagnostics stay aligned', () => {
    vi.stubEnv('VITE_MARKETPLACE_LAYOUT_V2', '')
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
    const synth = synthesizeLayout({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })
    const diag = getSynthesisStageDiagnostics({
      master,
      format,
      profile,
      palette,
      typography,
      intent,
      brandKit,
    })

    expect(intent.marketplaceTemplateId).toBeUndefined()
    expect(diag.stages.some((s) => s.stage === 'refined')).toBe(true)
    assertSynthesisMatchesDiagnostics(synth, diag)
  })
})
