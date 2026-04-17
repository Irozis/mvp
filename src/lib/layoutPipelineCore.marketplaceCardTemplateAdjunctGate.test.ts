import { describe, expect, it } from 'vitest'

import { shouldRunMarketplaceCardTemplateAdjunctPipeline } from './layoutPipelineCore'

describe('shouldRunMarketplaceCardTemplateAdjunctPipeline (marketplace-card template adjunct gate)', () => {
  it('returns false when marketplace-card intent carries marketplaceV2Archetype', () => {
    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'marketplace-card',
        marketplaceV2Archetype: 'v2-card-hero-shelf',
        marketplaceTemplateId: 'text-first-promo',
      })
    ).toBe(false)
  })

  it('preserves prior gate behavior when marketplaceV2Archetype is absent', () => {
    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'marketplace-card',
        marketplaceTemplateId: 'text-first-promo',
      })
    ).toBe(true)

    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'marketplace-card',
      })
    ).toBe(false)

    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'marketplace-card',
        marketplaceLayoutEngine: 'v2-slot',
        marketplaceTemplateId: 'text-first-promo',
      })
    ).toBe(false)
  })

  it('returns false for non-marketplace-card formats regardless of template id', () => {
    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'social-square',
        marketplaceTemplateId: 'text-first-promo',
      })
    ).toBe(false)
  })
})
