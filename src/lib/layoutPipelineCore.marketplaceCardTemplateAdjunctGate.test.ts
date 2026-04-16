import { describe, expect, it } from 'vitest'
import { shouldRunMarketplaceCardTemplateAdjunctPipeline } from './layoutPipelineCore'

describe('shouldRunMarketplaceCardTemplateAdjunctPipeline (marketplace-card template-adjunct gate)', () => {
  it('runs adjuncts for marketplace-card when marketplaceTemplateId is present (non–v2-slot)', () => {
    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'marketplace-card',
        marketplaceLayoutEngine: undefined,
        marketplaceTemplateId: 'header-panel-card',
      })
    ).toBe(true)
  })

  it('skips adjuncts for marketplace-card when marketplaceTemplateId is absent', () => {
    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'marketplace-card',
        marketplaceLayoutEngine: undefined,
        marketplaceTemplateId: undefined,
      })
    ).toBe(false)
  })

  it('does not run marketplace-card adjuncts for non–marketplace-card formats even if a template id is set', () => {
    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'social-square',
        marketplaceLayoutEngine: undefined,
        marketplaceTemplateId: 'header-panel-card',
      })
    ).toBe(false)
  })

  it('skips adjuncts on v2-slot marketplace-card (shared with marketplace-tile skip rule)', () => {
    expect(
      shouldRunMarketplaceCardTemplateAdjunctPipeline({
        formatKey: 'marketplace-card',
        marketplaceLayoutEngine: 'v2-slot',
        marketplaceTemplateId: 'header-panel-card',
      })
    ).toBe(false)
  })
})
