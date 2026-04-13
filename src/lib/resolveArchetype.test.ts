import { describe, expect, test } from 'vitest'

import { FORMAT_MAP } from './presets'
import { profileContent } from './contentProfile'
import { resolveArchetype } from './scenarioClassifier'
import type { EnhancedImageAnalysis, Scene } from './types'

/** Minimal scene for resolveArchetype inputs (layout tests use richer defaults). */
function makeMasterScene(): Scene {
  return {
    background: ['#ffffff', '#ffffff', '#ffffff'],
    accent: '#111111',
    title: { x: 5, y: 5, w: 90, h: 15, fontSize: 24, text: 'Headline' },
    subtitle: { x: 5, y: 25, w: 90, h: 10, fontSize: 14, text: 'Sub' },
    cta: { x: 5, y: 75, w: 40, h: 10, text: 'Buy now' },
    badge: { x: 5, y: 92, w: 12, h: 4, text: 'New', fontSize: 10 },
    logo: { x: 88, y: 3, w: 8, h: 6, text: '' },
    image: { x: 50, y: 5, w: 45, h: 60 },
  }
}

function minimalEnhancedImage(): EnhancedImageAnalysis {
  return {
    focalPoint: { x: 50, y: 50 },
    safeTextAreas: [],
    visualMassCenter: { x: 50, y: 50 },
    brightnessMap: [],
    contrastZones: [],
    dominantColors: ['#222222'],
    mood: 'neutral',
    cropRisk: 'low',
    imageProfile: 'square',
    detectedContrast: 'medium',
    focalSuggestion: 'center',
  }
}

function makeResolveArgs(overrides: Partial<Parameters<typeof resolveArchetype>[0]> = {}): Parameters<typeof resolveArchetype>[0] {
  const master = makeMasterScene()
  return {
    format: FORMAT_MAP['social-square'],
    master,
    profile: profileContent(master),
    imageAnalysis: undefined,
    visualSystem: 'bold-promo',
    goal: 'promo-pack',
    assetHint: undefined,
    ...overrides,
  }
}

describe('output contract', () => {
  test('always returns a valid LayoutArchetypeId', () => {
    const result = resolveArchetype(makeResolveArgs())
    expect(result.archetypeId).toBeTruthy()
    expect(typeof result.archetypeId).toBe('string')
  })

  test('confidence is within [0.1, 1.0]', () => {
    const result = resolveArchetype(makeResolveArgs())
    expect(result.confidence).toBeGreaterThanOrEqual(0.1)
    expect(result.confidence).toBeLessThanOrEqual(1.0)
  })

  test('confidenceBreakdown is always populated', () => {
    const result = resolveArchetype(makeResolveArgs())
    expect(result.confidenceBreakdown).toBeDefined()
    expect(result.confidenceBreakdown!.archetypeSource).toBeGreaterThanOrEqual(0)
    expect(result.confidenceBreakdown!.scenarioAmbiguity).toBeGreaterThanOrEqual(0)
    expect(result.confidenceBreakdown!.missingImageData).toBeGreaterThanOrEqual(0)
    expect(result.confidenceBreakdown!.formatMismatch).toBeGreaterThanOrEqual(0)
  })

  test('reason is a non-empty string', () => {
    const result = resolveArchetype(makeResolveArgs())
    expect(typeof result.reason).toBe('string')
    expect(result.reason.length).toBeGreaterThan(0)
  })
})

describe('confidence signals', () => {
  test('missing image analysis reduces confidence', () => {
    const withImage = resolveArchetype(
      makeResolveArgs({
        assetHint: { enhancedImage: minimalEnhancedImage() },
      }),
    )
    const withoutImage = resolveArchetype(
      makeResolveArgs({
        assetHint: undefined,
      }),
    )
    expect(withoutImage.confidence).toBeLessThan(withImage.confidence)
    expect(withoutImage.confidenceBreakdown!.missingImageData).toBe(0.15)
  })

  test('missing image sets missingImageData breakdown to 0.15', () => {
    const result = resolveArchetype(makeResolveArgs({ assetHint: undefined }))
    expect(result.confidenceBreakdown!.missingImageData).toBe(0.15)
  })

  test('with image sets missingImageData breakdown to 0', () => {
    const result = resolveArchetype(
      makeResolveArgs({
        assetHint: { enhancedImage: minimalEnhancedImage() },
      }),
    )
    expect(result.confidenceBreakdown!.missingImageData).toBe(0)
  })
})

describe('fallback field', () => {
  test('fallback is undefined or a valid LayoutArchetypeId string', () => {
    const result = resolveArchetype(makeResolveArgs())
    if (result.fallback !== undefined) {
      expect(typeof result.fallback).toBe('string')
      expect(result.fallback.length).toBeGreaterThan(0)
    }
  })
})
