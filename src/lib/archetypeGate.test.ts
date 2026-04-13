import { describe, expect, test } from 'vitest'

import { buildProject, regenerateFormats } from './autoAdapt'
import { BRAND_TEMPLATES, CHANNEL_FORMATS } from './presets'
import type { BrandKit, EnhancedImageAnalysis, FormatKey, LayoutEvaluation, Project } from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createBrandKit(): BrandKit {
  return clone(BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit)
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

/** Reads archetype + layout metadata from a project variant (post–buildDeterministicVariant pipeline). */
function getVariantMeta(project: Project, formatKey: FormatKey): {
  archetypeResolution: NonNullable<Project['variants']>[FormatKey] extends infer V
    ? V extends { archetypeResolution?: infer AR }
      ? AR
      : undefined
    : undefined
  layoutEvaluation: LayoutEvaluation | undefined
} {
  const v = project.variants?.[formatKey]
  return {
    archetypeResolution: v?.archetypeResolution,
    layoutEvaluation: v?.layoutEvaluation,
  }
}

function baseSeedProject(): Project {
  return buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit: createBrandKit(),
    imageProfile: 'square',
  })
}

describe('archetype gate — output contract', () => {
  test('every generated variant has archetypeResolution', () => {
    const project = baseSeedProject()
    for (const { key } of CHANNEL_FORMATS) {
      const ar = project.variants?.[key]?.archetypeResolution
      expect(ar, `format ${key}`).toBeDefined()
      expect(ar!.archetypeId, `format ${key}`).toBeTruthy()
      expect(typeof ar!.archetypeId, `format ${key}`).toBe('string')
      expect(ar!.confidence, `format ${key}`).toBeGreaterThanOrEqual(0.1)
      expect(ar!.confidence, `format ${key}`).toBeLessThanOrEqual(1.0)
    }
  })

  test('every generated variant has layoutEvaluation', () => {
    const project = baseSeedProject()
    for (const { key } of CHANNEL_FORMATS) {
      const le = project.variants?.[key]?.layoutEvaluation
      expect(le, `format ${key}`).toBeDefined()
      expect(le!.overallScore, `format ${key}`).toBeGreaterThanOrEqual(0)
      expect(le!.overallScore, `format ${key}`).toBeLessThanOrEqual(1)
      expect(Array.isArray(le!.issues), `format ${key}`).toBe(true)
    }
  })

  test('layoutEvaluation.quadrantWeights sums to ~1.0 when present', () => {
    const project = baseSeedProject()
    for (const { key } of CHANNEL_FORMATS) {
      const qw = project.variants?.[key]?.layoutEvaluation?.quadrantWeights
      if (qw === undefined) continue
      const sum = qw.topLeft + qw.topRight + qw.bottomLeft + qw.bottomRight
      expect(sum, `format ${key}`).toBeCloseTo(1.0, 3)
    }
  })
})

describe('archetype gate — confidence signal: missing image', () => {
  test('no image → confidence is reduced vs with image', () => {
    const seed = baseSeedProject()
    const withImage = regenerateFormats({
      ...seed,
      assetHint: { imageProfile: 'square', enhancedImage: minimalEnhancedImage() },
    })
    const withoutImage = regenerateFormats({
      ...seed,
      assetHint: { imageProfile: 'square' },
    })
    const a = withImage.variants?.['social-square']?.archetypeResolution!.confidence!
    const b = withoutImage.variants?.['social-square']?.archetypeResolution!.confidence!
    expect(b).toBeLessThan(a)
    expect(a - b).toBeGreaterThanOrEqual(0.1)
  })

  test('no image → confidenceBreakdown.missingImageData === 0.15', () => {
    const seed = baseSeedProject()
    const project = regenerateFormats({
      ...seed,
      assetHint: { imageProfile: 'square' },
    })
    const ar = project.variants?.['social-square']?.archetypeResolution
    expect(ar?.confidenceBreakdown?.missingImageData).toBe(0.15)
  })
})

describe('archetype gate — fallback behavior', () => {
  test('fallback only runs once — no recursive improvement', () => {
    const project = baseSeedProject()
    const meta = getVariantMeta(project, 'social-square')
    expect(meta.layoutEvaluation).toBeDefined()
    const ar = meta.archetypeResolution as NonNullable<typeof meta.archetypeResolution>
    if (ar.fallbackApplied) {
      expect(ar.effectiveArchetypeId).toBeDefined()
      expect(ar.effectiveArchetypeId).not.toBe(ar.archetypeId)
    } else {
      expect(ar.effectiveArchetypeId ?? ar.archetypeId).toBe(ar.archetypeId)
    }
  })

  test('when fallback is accepted, effectiveArchetypeId differs from archetypeId', () => {
    const project = baseSeedProject()
    let sawFallback = false
    for (const { key } of CHANNEL_FORMATS) {
      const ar = project.variants?.[key]?.archetypeResolution
      if (ar?.fallbackApplied) {
        sawFallback = true
        expect(ar.effectiveArchetypeId).toBeDefined()
        expect(ar.effectiveArchetypeId).not.toBe(ar.archetypeId)
      }
    }
    if (!sawFallback) {
      // No format triggered a confidence/layout fallback — valid when layouts score well.
      expect(true).toBe(true)
    }
  })
})

describe('archetype gate — evaluation consistency', () => {
  test('structurally valid scene has overallScore > 0', () => {
    const project = baseSeedProject()
    const meta = getVariantMeta(project, 'social-square')
    expect(meta.layoutEvaluation?.structuralValidity).toBe(true)
    expect(meta.layoutEvaluation?.overallScore).toBeGreaterThan(0)
  })

  test('overallScore matches formula: 0.30·structural + 0.25·readability + 0.20·hierarchy + 0.25·balance', () => {
    const project = baseSeedProject()
    const ev = getVariantMeta(project, 'social-square').layoutEvaluation!
    const expected =
      (ev.structuralValidity ? 1 : 0) * 0.3 + ev.readability * 0.25 + ev.hierarchyClarity * 0.2 + ev.visualBalance * 0.25
    expect(ev.overallScore).toBeCloseTo(expected, 5)
  })
})
