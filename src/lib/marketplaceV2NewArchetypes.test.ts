import { describe, expect, test } from 'vitest'

import { slotsForArchetype } from './marketplaceLayoutV2'
import type { FormatDefinition } from './types'

const cardFormat = {
  key: 'marketplace-card',
  name: 'Test card',
  width: 800,
  height: 800,
  label: 'Test',
  category: 'marketplace',
  family: 'square',
  packTags: ['promo-pack'],
  scopeStage: 'active',
  primaryGenerationMode: 'template-assist-primary',
} satisfies FormatDefinition

const tileFormat = {
  key: 'marketplace-tile',
  name: 'Test tile',
  width: 400,
  height: 400,
  label: 'Test',
  category: 'marketplace',
  family: 'landscape',
  packTags: ['promo-pack'],
  scopeStage: 'active',
  primaryGenerationMode: 'template-assist-primary',
} satisfies FormatDefinition

const NEW_CARD_ARCHETYPES = [
  'v2-card-split-image-left',
  'v2-card-full-bleed-overlay',
  'v2-card-text-only',
] as const

const NEW_TILE_ARCHETYPES = ['v2-tile-image-left'] as const

describe('new card archetypes — slot completeness', () => {
  NEW_CARD_ARCHETYPES.forEach((archetypeId) => {
    test(`${archetypeId} has valid slot dimensions`, () => {
      const slots = slotsForArchetype(cardFormat, archetypeId)
      expect(slots).toBeDefined()

      expect(slots.image.w).toBeGreaterThan(0)
      expect(slots.image.h).toBeGreaterThan(0)
      expect(slots.headline.w).toBeGreaterThan(0)
      expect(slots.headline.h).toBeGreaterThan(0)
      expect(slots.cta.w).toBeGreaterThan(0)
      expect(slots.cta.h).toBeGreaterThan(0)

      for (const slot of [slots.image, slots.headline, slots.cta, slots.logo, slots.badge, slots.subtitle]) {
        expect(slot.x).toBeGreaterThanOrEqual(0)
        expect(slot.x).toBeLessThanOrEqual(100)
        expect(slot.y).toBeGreaterThanOrEqual(0)
        expect(slot.y).toBeLessThanOrEqual(100)
        expect(slot.x + slot.w).toBeLessThanOrEqual(102)
        expect(slot.y + slot.h).toBeLessThanOrEqual(102)
      }
    })
  })
})

describe('new tile archetypes — slot completeness', () => {
  NEW_TILE_ARCHETYPES.forEach((archetypeId) => {
    test(`${archetypeId} has valid slot dimensions`, () => {
      const slots = slotsForArchetype(tileFormat, archetypeId)
      expect(slots).toBeDefined()
      expect(slots.image.w).toBeGreaterThan(0)
      expect(slots.image.h).toBeGreaterThan(0)
      expect(slots.headline.w).toBeGreaterThan(0)
      expect(slots.headline.h).toBeGreaterThan(0)
      expect(slots.cta.w).toBeGreaterThan(0)
      expect(slots.cta.h).toBeGreaterThan(0)
      expect(slots.logo.w).toBeGreaterThan(0)
      expect(slots.subtitle.w).toBeGreaterThan(0)
    })
  })
})

describe('v2-card-split-image-left — image is on the left', () => {
  test('image center x < 50 (left half)', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-split-image-left')
    const imageCenterX = slots.image.x + slots.image.w / 2
    expect(imageCenterX).toBeLessThan(50)
  })

  test('headline center x > 50 (right half)', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-split-image-left')
    const headlineCenterX = slots.headline.x + slots.headline.w / 2
    expect(headlineCenterX).toBeGreaterThan(50)
  })

  test('image and headline do not overlap horizontally', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-split-image-left')
    const imageRight = slots.image.x + slots.image.w
    const headlineLeft = slots.headline.x
    expect(headlineLeft).toBeGreaterThanOrEqual(imageRight - 2)
  })
})

describe('v2-card-full-bleed-overlay — image fills canvas', () => {
  test('image covers full width (w === 100)', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-full-bleed-overlay')
    expect(slots.image.w).toBe(100)
  })

  test('image covers full height (h === 100)', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-full-bleed-overlay')
    expect(slots.image.h).toBe(100)
  })

  test('image starts at origin (x=0, y=0)', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-full-bleed-overlay')
    expect(slots.image.x).toBe(0)
    expect(slots.image.y).toBe(0)
  })

  test('headline is in lower half (center y > 50)', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-full-bleed-overlay')
    const headlineCenterY = slots.headline.y + slots.headline.h / 2
    expect(headlineCenterY).toBeGreaterThan(50)
  })
})

describe('v2-card-text-only — image is small thumbnail', () => {
  test('image area < 10% of canvas (w*h < 1000)', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-text-only')
    const area = slots.image.w * slots.image.h
    expect(area).toBeLessThan(1000)
  })

  test('headline region is wider than image region', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-text-only')
    expect(slots.headline.w).toBeGreaterThan(slots.image.w)
  })

  test('subtitle region width > 80% of canvas', () => {
    const slots = slotsForArchetype(cardFormat, 'v2-card-text-only')
    expect(slots.subtitle.w).toBeGreaterThan(80)
  })
})

describe('v2-tile-image-left — mirrors split-balanced', () => {
  test('image center x < 50 (left half)', () => {
    const slots = slotsForArchetype(tileFormat, 'v2-tile-image-left')
    const imageCenterX = slots.image.x + slots.image.w / 2
    expect(imageCenterX).toBeLessThan(50)
  })

  test('headline center x > 50 (right half)', () => {
    const slots = slotsForArchetype(tileFormat, 'v2-tile-image-left')
    const headlineCenterX = slots.headline.x + slots.headline.w / 2
    expect(headlineCenterX).toBeGreaterThan(50)
  })
})
