import { describe, expect, test } from 'vitest'

import { selectPrimaryMarketplaceV2Archetype } from './marketplaceLayoutV2'
import type { ContentProfile, EnhancedImageAnalysis, FormatDefinition, Scene, SceneElement } from './types'

/** Minimal fixtures for `slotsForArchetype` / layout consumers; selection only uses `format.key`. */
function makeCardFormat(): FormatDefinition {
  return {
    key: 'marketplace-card',
    name: 'Test card',
    width: 1200,
    height: 1200,
    label: 'Test',
    category: 'marketplace',
    family: 'square',
    packTags: ['promo-pack'],
    scopeStage: 'active',
    primaryGenerationMode: 'template-assist-primary',
  }
}

function makeTileFormat(): FormatDefinition {
  return {
    key: 'marketplace-tile',
    name: 'Test tile',
    width: 1200,
    height: 628,
    label: 'Test',
    category: 'marketplace',
    family: 'landscape',
    packTags: ['promo-pack'],
    scopeStage: 'active',
    primaryGenerationMode: 'template-assist-primary',
  }
}

function makeProfile(overrides: Partial<ContentProfile> = {}): ContentProfile {
  return {
    headlineLength: 12,
    subtitleLength: 8,
    bodyLength: 0,
    ctaLength: 4,
    badgeLength: 0,
    priceLength: 0,
    density: 'balanced',
    textWeight: 40,
    hasOffer: false,
    offerWeight: 0,
    preferredMessageMode: 'balanced',
    messageType: 'promo',
    promoIntensity: 'medium',
    tone: 'clean',
    ctaImportance: 'medium',
    semanticType: 'promo',
    headlineTone: 'direct',
    needsStrongCTA: false,
    needsOfferDominance: false,
    sellingAngle: 'benefit-led',
    primaryConversionAction: 'shop',
    offerStrength: 'weak',
    proofPresence: 'none',
    productVisualNeed: 'optional',
    messageCompressionNeed: 'medium',
    marketplaceCommercialHint: 'marketplace-catalog-tile',
    ...overrides,
  }
}

function makeMaster(overrides: Partial<Scene> = {}): Scene {
  const title: SceneElement = {
    x: 8,
    y: 12,
    w: 80,
    fontSize: 40,
    fill: '#ffffff',
    text: 'Hi',
    ...overrides.title,
  }
  const base: Scene = {
    background: ['#0f172a', '#0f172a', '#0f172a'],
    accent: '#38bdf8',
    title,
    subtitle: {
      x: 8,
      y: 50,
      w: 70,
      fontSize: 18,
      fill: '#e2e8f0',
      opacity: 0.95,
      text: 'Sub',
      ...overrides.subtitle,
    },
    cta: {
      x: 8,
      y: 88,
      w: 20,
      h: 6,
      fontSize: 17,
      bg: '#ffffff',
      fill: '#0f172a',
      text: 'Go',
      ...overrides.cta,
    },
    badge: {
      x: 82,
      y: 6,
      w: 12,
      h: 5,
      fontSize: 14,
      fill: '#ffffff',
      text: '',
      ...overrides.badge,
    },
    logo: {
      x: 5,
      y: 5,
      w: 12,
      h: 5,
      fontSize: 12,
      fill: '#ffffff',
      text: '',
      ...overrides.logo,
    },
    image: {
      x: 45,
      y: 25,
      w: 45,
      h: 50,
      fill: '#334155',
      ...overrides.image,
    },
  }
  return {
    ...base,
    ...overrides,
    title: { ...base.title, ...overrides.title },
    subtitle: { ...base.subtitle, ...overrides.subtitle },
    cta: { ...base.cta, ...overrides.cta },
    badge: { ...base.badge, ...overrides.badge },
    logo: { ...base.logo, ...overrides.logo },
    image: { ...base.image, ...overrides.image },
  }
}

function makeImageAnalysis(overrides: Partial<EnhancedImageAnalysis> = {}): EnhancedImageAnalysis {
  return {
    focalPoint: { x: 0.5, y: 0.5 },
    safeTextAreas: [],
    visualMassCenter: { x: 50, y: 50 },
    brightnessMap: [],
    contrastZones: [],
    dominantColors: ['#000000', '#111111', '#222222'],
    mood: 'neutral',
    cropRisk: 'low',
    imageProfile: 'square',
    detectedContrast: 'medium',
    focalSuggestion: 'center',
    ...overrides,
  }
}

describe('card archetype selection', () => {
  test('text-heavy content → v2-card-text-only', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile({ bodyLength: 181, subtitleLength: 0, headlineLength: 10 }),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis(),
    })
    expect(result).toBe('v2-card-text-only')
  })

  test('left focal point → v2-card-split-image-left', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile({ tone: 'clean', semanticType: 'promo' }),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis({
        focalPoint: { x: 0.2, y: 0.5 },
        mood: 'light',
        detectedContrast: 'medium',
      }),
    })
    expect(result).toBe('v2-card-split-image-left')
  })

  test('right focal point → NOT v2-card-split-image-left', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile(),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis({ focalPoint: { x: 0.8, y: 0.5 } }),
    })
    expect(result).not.toBe('v2-card-split-image-left')
  })

  test('dark mood + readable image → v2-card-full-bleed-overlay before split-left', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile({ tone: 'clean', semanticType: 'promo' }),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis({
        focalPoint: { x: 0.2, y: 0.5 },
        mood: 'dark',
        cropRisk: 'low',
        detectedContrast: 'high',
      }),
    })
    expect(result).toBe('v2-card-full-bleed-overlay')
  })

  test('dense copy (not text-heavy) → v2-card-text-focus', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile({ density: 'dense', bodyLength: 100, subtitleLength: 100 }),
      master: makeMaster(),
    })
    expect(result).toBe('v2-card-text-focus')
  })

  test('image-first + critical product → v2-card-split-image-right when no stronger signal', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile({
        preferredMessageMode: 'image-first',
        productVisualNeed: 'critical',
        density: 'balanced',
      }),
      master: makeMaster(),
    })
    expect(result).toBe('v2-card-split-image-right')
  })

  test('balanced defaults → v2-card-hero-shelf', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile(),
      master: makeMaster(),
    })
    expect(result).toBe('v2-card-hero-shelf')
  })
})

describe('tile archetype selection', () => {
  test('left focal point → v2-tile-image-left', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-tile',
      profile: makeProfile(),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis({ focalPoint: { x: 0.2, y: 0.5 } }),
    })
    expect(result).toBe('v2-tile-image-left')
  })

  test('right focal point → NOT v2-tile-image-left', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-tile',
      profile: makeProfile(),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis({ focalPoint: { x: 0.8, y: 0.5 } }),
    })
    expect(result).not.toBe('v2-tile-image-left')
  })

  test('image-first tile → v2-tile-image-forward when focal not left', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-tile',
      profile: makeProfile({ preferredMessageMode: 'image-first', productVisualNeed: 'critical' }),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis({ focalPoint: { x: 0.75, y: 0.5 } }),
    })
    expect(result).toBe('v2-tile-image-forward')
  })
})

describe('selection completeness', () => {
  test('format fixtures are marketplace V2 format keys', () => {
    expect(makeCardFormat().key).toBe('marketplace-card')
    expect(makeTileFormat().key).toBe('marketplace-tile')
  })

  test('always returns a defined MarketplaceV2ArchetypeId', () => {
    const cardResult = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile(),
      master: makeMaster(),
    })
    expect(cardResult).toBeTruthy()
    expect(typeof cardResult).toBe('string')
  })

  test('card selection never returns a tile archetype id', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-card',
      profile: makeProfile(),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis(),
    })
    expect(result).not.toContain('tile')
  })

  test('tile selection never returns a card archetype id', () => {
    const result = selectPrimaryMarketplaceV2Archetype({
      formatKey: 'marketplace-tile',
      profile: makeProfile(),
      master: makeMaster(),
      imageAnalysis: makeImageAnalysis(),
    })
    expect(result).not.toContain('card')
  })
})
