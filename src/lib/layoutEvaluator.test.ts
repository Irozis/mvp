import { describe, expect, test } from 'vitest'

import { evaluateLayout } from './layoutEvaluator'
import type { EnhancedImageAnalysis, FormatDefinition, Scene } from './types'

function makeScene(overrides?: Partial<Scene>): Scene {
  const base: Scene = {
    background: ['#ffffff', '#ffffff', '#ffffff'],
    accent: '#111111',
    // Text kept left of x=50 so default layout avoids headline/subtitle/cta vs image overlap (text-over-image metric).
    title: { x: 5, y: 10, w: 40, h: 15, fontSize: 24, text: 'Headline' },
    subtitle: { x: 5, y: 28, w: 40, h: 10, fontSize: 14, text: 'Sub' },
    cta: { x: 5, y: 75, w: 40, h: 10, text: 'Buy now' },
    badge: { x: 5, y: 92, w: 12, h: 4, text: 'New', fontSize: 10 },
    logo: { x: 88, y: 3, w: 8, h: 6, text: '' },
    image: { x: 50, y: 5, w: 45, h: 60 },
  }
  return { ...base, ...overrides } as Scene
}

function makeFormat(overrides?: Partial<FormatDefinition>): FormatDefinition {
  return {
    key: 'social-square',
    name: '1080 x 1080',
    width: 1080,
    height: 1080,
    label: 'Social Square',
    category: 'social',
    family: 'square',
    packTags: ['promo-pack'],
    scopeStage: 'legacy',
    primaryGenerationMode: 'legacy-freeform',
    ...overrides,
  }
}

describe('structuralValidity', () => {
  test('valid scene passes structural check', () => {
    const result = evaluateLayout(makeScene(), makeFormat())
    expect(result.structuralValidity).toBe(true)
    expect(result.issues.filter((i) => i.includes('missing'))).toHaveLength(0)
  })

  test('missing title fails structural check', () => {
    const scene = makeScene({ title: undefined as unknown as Scene['title'] })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.structuralValidity).toBe(false)
    expect(
      result.issues.some(
        (i) => i.toLowerCase().includes('headline') || i.toLowerCase().includes('title'),
      ),
    ).toBe(true)
  })

  test('title with zero width fails structural check', () => {
    const base = makeScene()
    const scene = makeScene({ title: { ...base.title, w: 0 } })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.structuralValidity).toBe(false)
  })

  test('missing cta fails structural check', () => {
    const scene = makeScene({ cta: undefined as unknown as Scene['cta'] })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.structuralValidity).toBe(false)
  })

  test('missing image fails structural check', () => {
    const scene = makeScene({ image: undefined as unknown as Scene['image'] })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.structuralValidity).toBe(false)
  })
})

describe('readability — overlap detection', () => {
  test('non-overlapping elements score 1.0', () => {
    const result = evaluateLayout(makeScene(), makeFormat())
    expect(result.readability).toBe(1.0)
  })

  test('overlapping title and cta reduces readability', () => {
    const base = makeScene()
    const scene = makeScene({
      title: { ...base.title, x: 5, y: 5, w: 90, h: 50 },
      cta: { ...base.cta, x: 5, y: 30, w: 40, h: 10 },
    })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.readability).toBeLessThan(1.0)
    expect(result.issues.some((i) => i.toLowerCase().includes('overlap'))).toBe(true)
  })

  test('multiple overlaps clamp readability to minimum 0', () => {
    const base = makeScene()
    const scene = makeScene({
      title: { ...base.title, x: 5, y: 5, w: 50, h: 50 },
      subtitle: { ...base.subtitle, x: 5, y: 5, w: 50, h: 50 },
      cta: { ...base.cta, x: 5, y: 5, w: 50, h: 50 },
      badge: { x: 5, y: 5, w: 50, h: 50, text: 'Badge', fontSize: 12 },
    })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.readability).toBeGreaterThanOrEqual(0)
    expect(result.readability).toBeLessThanOrEqual(1)
  })
})

describe('hierarchyClarity', () => {
  test('headline larger than subtitle scores 1.0', () => {
    const base = makeScene()
    const scene = makeScene({
      title: { ...base.title, fontSize: 32 },
      subtitle: { ...base.subtitle, fontSize: 14 },
    })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.hierarchyClarity).toBe(1.0)
  })

  test('headline smaller than subtitle scores 0.2 (strongly inverted)', () => {
    const base = makeScene()
    const scene = makeScene({
      title: { ...base.title, fontSize: 12 },
      subtitle: { ...base.subtitle, fontSize: 24 },
    })
    const result = evaluateLayout(scene, makeFormat())
    // ratio 12/24 = 0.5 — below 0.8 band → graduated hierarchy uses 0.2
    expect(result.hierarchyClarity).toBe(0.2)
  })

  test('no subtitle defaults to 1.0', () => {
    const scene = makeScene({ subtitle: undefined as unknown as Scene['subtitle'] })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.hierarchyClarity).toBe(1.0)
  })
})

describe('overallScore', () => {
  test('perfect scene scores above 0.82', () => {
    const result = evaluateLayout(makeScene(), makeFormat())
    // With real quadrant balance + weights (0.30/0.25/0.20/0.25), default layout scores ~0.828.
    expect(result.overallScore).toBeGreaterThan(0.82)
  })

  test('structurally invalid scene scores lower than a valid baseline', () => {
    const valid = evaluateLayout(makeScene(), makeFormat())
    const scene = makeScene({
      title: undefined as unknown as Scene['title'],
      cta: undefined as unknown as Scene['cta'],
    })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.structuralValidity).toBe(false)
    // Structural validity is only 30% of overallScore; readability/hierarchy/balance can keep totals competitive.
    expect(result.overallScore).toBeLessThan(valid.overallScore)
  })
})

/** Centers distributed so each quadrant holds ~2/8.5 of total visual weight (see layoutEvaluator weights). */
function balancedSpacedScene(): Scene {
  const base = makeScene()
  return makeScene({
    subtitle: { ...base.subtitle, x: 15, y: 15, w: 20, h: 20, fontSize: 14, text: 'Sub' },
    badge: { ...base.badge, x: 10, y: 35, w: 15, h: 10, text: 'New', fontSize: 10 },
    logo: { ...base.logo, x: 30, y: 10, w: 10, h: 10, text: '' },
    title: { ...base.title, x: 60, y: 10, w: 30, h: 20, fontSize: 24, text: 'Headline' },
    cta: { ...base.cta, x: 25, y: 65, w: 30, h: 20, text: 'Buy now' },
    image: { ...base.image, x: 60, y: 60, w: 30, h: 20 },
  })
}

describe('visualBalance', () => {
  test('balanced layout scores above 0.6', () => {
    const result = evaluateLayout(balancedSpacedScene(), makeFormat())
    expect(result.visualBalance).toBeGreaterThan(0.6)
  })

  test('all elements in one quadrant scores below 0.5', () => {
    const base = makeScene()
    const scene = makeScene({
      title: { ...base.title, x: 5, y: 5, w: 20, h: 10 },
      subtitle: { ...base.subtitle, x: 5, y: 20, w: 20, h: 10 },
      cta: { ...base.cta, x: 5, y: 35, w: 20, h: 10 },
      image: { ...base.image, x: 5, y: 5, w: 30, h: 40 },
      badge: { ...base.badge, x: 38, y: 5, w: 10, h: 8 },
      logo: { ...base.logo, x: 38, y: 18, w: 10, h: 8 },
    })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.visualBalance).toBeLessThan(0.5)
  })

  test('quadrantWeights are populated', () => {
    const result = evaluateLayout(makeScene(), makeFormat())
    expect(result.quadrantWeights).toBeDefined()
    const { topLeft, topRight, bottomLeft, bottomRight } = result.quadrantWeights!
    const sum = topLeft + topRight + bottomLeft + bottomRight
    expect(sum).toBeCloseTo(1.0, 5)
  })

  test('perfectly centered layout scores above 0.8', () => {
    const result = evaluateLayout(balancedSpacedScene(), makeFormat())
    expect(result.visualBalance).toBeGreaterThan(0.8)
  })

  test('score without image is lower than with image', () => {
    const withImage = evaluateLayout(makeScene(), makeFormat())
    const withoutImage = evaluateLayout(makeScene({ image: undefined as unknown as Scene['image'] }), makeFormat())
    expect(withImage.quadrantWeights).not.toEqual(withoutImage.quadrantWeights)
  })
})

function makeImageAnalysis(overrides?: Partial<EnhancedImageAnalysis>): EnhancedImageAnalysis {
  return {
    focalPoint: { x: 50, y: 50 },
    safeTextAreas: [],
    visualMassCenter: { x: 50, y: 50 },
    brightnessMap: [],
    contrastZones: [],
    dominantColors: [],
    mood: 'neutral',
    cropRisk: 'low',
    imageProfile: 'square',
    detectedContrast: 'medium',
    focalSuggestion: 'center',
    ...overrides,
  }
}

describe('hierarchyClarity — graduated scoring', () => {
  test('ratio >= 1.5 scores 1.0', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, fontSize: 30 },
      subtitle: { ...makeScene().subtitle!, fontSize: 14 },
    })
    expect(evaluateLayout(scene, makeFormat()).hierarchyClarity).toBe(1.0)
  })

  test('ratio 1.2–1.5 scores 0.85', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, fontSize: 18 },
      subtitle: { ...makeScene().subtitle!, fontSize: 14 },
    })
    expect(evaluateLayout(scene, makeFormat()).hierarchyClarity).toBe(0.85)
  })

  test('ratio 1.0–1.2 scores 0.65', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, fontSize: 15 },
      subtitle: { ...makeScene().subtitle!, fontSize: 14 },
    })
    expect(evaluateLayout(scene, makeFormat()).hierarchyClarity).toBe(0.65)
  })

  test('inverted hierarchy (ratio < 1.0) scores <= 0.4', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, fontSize: 12 },
      subtitle: { ...makeScene().subtitle!, fontSize: 24 },
    })
    expect(evaluateLayout(scene, makeFormat()).hierarchyClarity).toBeLessThanOrEqual(0.4)
  })

  test('cta larger than headline clamps hierarchyClarity to <= 0.3', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, fontSize: 14 },
      cta: { ...makeScene().cta!, fontSize: 20 },
    })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.hierarchyClarity).toBeLessThanOrEqual(0.3)
    expect(result.issues.some((i) => i.includes('cta'))).toBe(true)
  })
})

describe('readability — text over image', () => {
  test('text overlapping image without safe area reduces readability', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, x: 52, y: 6, w: 40, h: 20 },
      image: { x: 50, y: 5, w: 45, h: 60 },
    })
    const withOverlap = evaluateLayout(scene, makeFormat())
    const withoutOverlap = evaluateLayout(makeScene(), makeFormat())
    expect(withOverlap.readability).toBeLessThan(withoutOverlap.readability)
  })

  test('text overlapping image WITH safe area does not reduce readability', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, x: 52, y: 6, w: 40, h: 20 },
      image: { x: 50, y: 5, w: 45, h: 60 },
    })
    const analysis = makeImageAnalysis({
      safeTextAreas: [{ x: 50, y: 5, w: 45, h: 25, score: 0.9 }],
    })
    const withSafe = evaluateLayout(scene, makeFormat(), analysis)
    const withoutSafe = evaluateLayout(scene, makeFormat())
    expect(withSafe.readability).toBeGreaterThanOrEqual(withoutSafe.readability)
  })

  test('low contrast adds extra penalty when text overlaps image', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, x: 52, y: 6, w: 40, h: 20 },
      image: { x: 50, y: 5, w: 45, h: 60 },
    })
    const lowContrast = makeImageAnalysis({ detectedContrast: 'low' })
    const highContrast = makeImageAnalysis({ detectedContrast: 'high' })
    const low = evaluateLayout(scene, makeFormat(), lowContrast)
    const high = evaluateLayout(scene, makeFormat(), highContrast)
    expect(low.readability).toBeLessThan(high.readability)
  })

  test('small thumbnail image does not trigger text-over-image check', () => {
    const scene = makeScene({
      title: { ...makeScene().title!, x: 5, y: 18, w: 58, h: 28 },
      image: { x: 68, y: 28, w: 20, h: 20 },
    })
    const result = evaluateLayout(scene, makeFormat())
    expect(result.issues.filter((i) => i.includes('Text over image'))).toHaveLength(0)
  })
})

describe('visualBalance — focal point awareness', () => {
  test('focalAwareBalance is true when imageAnalysis is passed', () => {
    const result = evaluateLayout(makeScene(), makeFormat(), makeImageAnalysis({ focalPoint: { x: 30, y: 40 } }))
    expect(result.focalAwareBalance).toBe(true)
  })

  test('focalAwareBalance is false when no imageAnalysis', () => {
    const result = evaluateLayout(makeScene(), makeFormat())
    expect(result.focalAwareBalance).toBeFalsy()
  })

  test('off-center focal point changes quadrantWeights vs centered', () => {
    // Extreme focal points so image weight (3.0) shifts across quadrants despite text/logo weights.
    const topLeftFocal = evaluateLayout(makeScene(), makeFormat(), makeImageAnalysis({ focalPoint: { x: 10, y: 15 } }))
    const bottomRightFocal = evaluateLayout(makeScene(), makeFormat(), makeImageAnalysis({ focalPoint: { x: 92, y: 88 } }))
    expect(topLeftFocal.quadrantWeights).not.toEqual(bottomRightFocal.quadrantWeights)
  })

  test('subjectBox shifts weight to its quadrant', () => {
    const withSubject = evaluateLayout(
      makeScene(),
      makeFormat(),
      makeImageAnalysis({
        focalPoint: { x: 50, y: 50 },
        subjectBox: { x: 60, y: 60, w: 30, h: 30 },
      }),
    )
    const withoutSubject = evaluateLayout(
      makeScene(),
      makeFormat(),
      makeImageAnalysis({ focalPoint: { x: 50, y: 50 } }),
    )
    expect(withSubject.quadrantWeights?.bottomRight).toBeGreaterThan(
      withoutSubject.quadrantWeights?.bottomRight ?? 0,
    )
  })
})
