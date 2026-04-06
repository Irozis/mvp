import { describe, expect, it } from 'vitest'

import { buildProject, getPreviewCandidateDiagnostics } from './autoAdapt'
import { BRAND_TEMPLATES } from './presets'
import type { Scene } from './types'

function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene
}

function createBrandKit() {
  return BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit
}

function mutateImageComparison(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Compare the new serum vs your old routine'
  next.subtitle.text = 'See better hydration, smoother texture, and side-by-side product improvement.'
  next.cta.text = 'Learn more'
  next.badge.text = 'Compare'
  return next
}

function mutateNoImageTrustDense(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Trusted results backed by verified reviews'
  next.subtitle.text =
    'Top-rated quality with reviewer feedback, reliable performance, and guarantee coverage for buyers who need proof before they shop.'
  next.cta.text = 'Learn more'
  next.badge.text = 'Verified'
  return next
}

function mutateImageTrust(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Verified quality with 5-star customer support'
  next.subtitle.text = 'Trusted performance, strong ratings, and guarantee-backed confidence.'
  next.cta.text = 'Learn more'
  next.badge.text = 'Top rated'
  return next
}

describe('marketplace-card commercial ranking integration', () => {
  it('keeps safe no-image default selection stable when commercial tie-break is blocked by structural status', () => {
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
    })

    const diagnostics = getPreviewCandidateDiagnostics({
      master: project.master,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
      goal: 'promo-pack',
    })

    expect(diagnostics.selectedCandidate.intent.marketplaceTemplateId).toBe('header-panel-card')
    expect(diagnostics.rankingDiagnostics?.commercialDecision?.applied).toBe(false)
    expect(diagnostics.rankingDiagnostics?.commercialDecision?.blockedBy).toBe('structural-status')
  })

  it('blocks commercial tie-break when structural score gap is still too large', () => {
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
      imageProfile: 'square',
    })
    const master = mutateImageComparison(project.master)

    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
    })

    expect(diagnostics.selectedCandidate.intent.marketplaceTemplateId).toBe('product-support-card')
    expect(diagnostics.rankingDiagnostics?.commercialDecision?.applied).toBe(false)
    expect(diagnostics.rankingDiagnostics?.commercialDecision?.blockedBy).toBe('structural-status')
  })

  it('aligns no-image dense trust cases by relaxing only formal text-first penalties', () => {
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
    })
    const master = mutateNoImageTrustDense(project.master)

    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
      goal: 'promo-pack',
    })

    const textFirstBase = diagnostics.allCandidates.find(
      (candidate) =>
        candidate.intent.marketplaceTemplateId === 'text-first-promo' &&
        candidate.intent.marketplaceTemplateVariant === 'base'
    )

    expect(textFirstBase?.evaluationAlignment?.applied).toBe(true)
    expect(textFirstBase?.evaluationAlignment?.relaxedIssueCodes).toContain('violates-image-footprint-rule')
    expect(textFirstBase?.evaluationAlignment?.relaxedIssueCodes).toContain('violates-allowed-zone')
    expect(textFirstBase?.evaluationAlignment?.adjustedEffectiveScore).toBeGreaterThan(
      textFirstBase?.evaluationAlignment?.originalEffectiveScore || 0
    )
    expect(diagnostics.selectedCandidate.intent.marketplaceTemplateId).toBe('text-first-promo')
  })

  it('lets image-backed trust text-first proof-band candidates win once late footprint lift makes them valid', () => {
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
      imageProfile: 'square',
    })
    const master = mutateImageTrust(project.master)

    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
    })

    const textFirstProofBand = diagnostics.allCandidates.find(
      (candidate) =>
        candidate.intent.marketplaceTemplateId === 'text-first-promo' &&
        candidate.intent.marketplaceTemplateVariant === 'proof-band'
    )

    expect(textFirstProofBand?.evaluationAlignment?.applied).toBe(true)
    expect(textFirstProofBand?.structuralStatus).toBe('valid')
    expect(textFirstProofBand?.evaluationAlignment?.relaxedIssueCodes).toContain('violates-image-footprint-rule')
    expect(textFirstProofBand?.perceptualSignals?.ctaIntegration || 0).toBeGreaterThan(20)
    expect(textFirstProofBand?.perceptualSignals?.clusterCohesion || 0).toBeGreaterThan(40)
    expect(textFirstProofBand?.perceptualSignals?.deadSpaceScore || 0).toBeGreaterThanOrEqual(0)
    expect(diagnostics.selectedCandidate.intent.marketplaceTemplateId).toBe('text-first-promo')
    expect(diagnostics.selectedCandidate.intent.marketplaceTemplateVariant).toBe('proof-band')
    expect(diagnostics.selectedCandidate.perceptualSignals?.primaryElement).not.toBeUndefined()
  })
})
