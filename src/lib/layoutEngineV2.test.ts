import { describe, expect, it } from 'vitest'
import {
  ARCHETYPES,
  buildSceneFromArchetypeV2,
  checkV2Constraints,
  optimizeLayoutV2,
  scoreDesignObjective,
  selectArchetypeForFormat,
  synthesizeLayoutV2,
} from './layoutEngineV2'

const mockFormat = (key: string, family: string) =>
  ({ key, family, width: 1200, height: 1200 } as any)

const mockProfile = (mode = 'balanced') =>
  ({ preferredMessageMode: mode, density: 'balanced' } as any)

const mockBrandKit = () =>
  ({
    accentColor: '#3b82f6',
    primaryColor: '#ffffff',
    ctaStyle: 'pill',
    background: ['#0f172a', '#1e293b', '#334155'],
    fontFamily: 'Inter',
  } as any)

const mockMaster = () =>
  ({
    background: ['#0f172a', '#1e293b', '#334155'],
    accent: '#3b82f6',
    chip: '',
    title: { x: 0, y: 0, w: 0, text: 'Test headline', fontSize: 40 },
    subtitle: { x: 0, y: 0, w: 0, text: 'Subtitle', fontSize: 16 },
    cta: { x: 0, y: 0, w: 0, h: 0, text: 'Buy now' },
    logo: { x: 0, y: 0, w: 0, h: 0 },
    badge: { x: 0, y: 0, w: 0, h: 0, text: 'New' },
    image: { x: 0, y: 0, w: 0, h: 0 },
  } as any)

describe('layoutEngineV2', () => {
  it("selectArchetypeForFormat('marketplace-card') → 'split-right-image'", () => {
    expect(selectArchetypeForFormat(mockFormat('marketplace-card', 'square'), undefined, mockProfile(), 'minimal')).toBe(
      'split-right-image'
    )
  })

  it('selectArchetypeForFormat: marketplace-card rotationIndex cycles layout archetype pool', () => {
    const f = mockFormat('marketplace-card', 'square')
    expect(selectArchetypeForFormat(f, undefined, mockProfile(), 'minimal', 0)).toBe('split-right-image')
    expect(selectArchetypeForFormat(f, undefined, mockProfile(), 'minimal', 1)).toBe('split-left-image')
    expect(selectArchetypeForFormat(f, undefined, mockProfile(), 'minimal', 2)).toBe('hero-overlay-bottom')
    expect(selectArchetypeForFormat(f, undefined, mockProfile(), 'minimal', 3)).toBe('product-card-top')
  })

  it("selectArchetypeForFormat('marketplace-highlight') → 'hero-overlay-bottom'", () => {
    expect(
      selectArchetypeForFormat(mockFormat('marketplace-highlight', 'portrait'), undefined, mockProfile(), 'minimal')
    ).toBe('hero-overlay-bottom')
  })

  it('buildSceneFromArchetypeV2 split-right-image: image.x===42, image.w===58', () => {
    const arch = ARCHETYPES['split-right-image']
    const scene = buildSceneFromArchetypeV2(mockMaster(), arch, mockBrandKit(), undefined)
    expect(scene.image?.x).toBe(42)
    expect(scene.image?.w).toBe(58)
  })

  it('buildSceneFromArchetypeV2 split-right-image: cta.rx===26 (pill)', () => {
    const arch = ARCHETYPES['split-right-image']
    const scene = buildSceneFromArchetypeV2(mockMaster(), arch, mockBrandKit(), undefined)
    expect(scene.cta?.rx).toBe(26)
  })

  it('buildSceneFromArchetypeV2: title.fontSize >= subtitle.fontSize * 2', () => {
    const arch = ARCHETYPES['split-right-image']
    const scene = buildSceneFromArchetypeV2(mockMaster(), arch, mockBrandKit(), undefined)
    expect(scene.title?.fontSize ?? 0).toBeGreaterThanOrEqual((scene.subtitle?.fontSize ?? 0) * 2)
  })

  it('scoreDesignObjective: score > 0.4 for a well-placed split-right-image scene', () => {
    const arch = ARCHETYPES['split-right-image']
    const scene = buildSceneFromArchetypeV2(mockMaster(), arch, mockBrandKit(), undefined)
    const { score } = scoreDesignObjective(scene, arch, undefined, {
      hierarchyClarity: 0.3,
      visualBalance: 0.25,
      ctaVisibility: 0.2,
      imageImpact: 0.15,
      readability: 0.05,
      spacingQuality: 0.05,
    })
    expect(score).toBeGreaterThan(0.4)
  })

  it('checkV2Constraints: returns [] for a valid well-placed scene', () => {
    const arch = ARCHETYPES['split-right-image']
    const scene = buildSceneFromArchetypeV2(mockMaster(), arch, mockBrandKit(), undefined)
    expect(checkV2Constraints(scene, arch)).toEqual([])
  })

  it("synthesizeLayoutV2: archetypeId==='split-right-image' for marketplace-card", () => {
    const result = synthesizeLayoutV2({
      master: mockMaster(),
      format: mockFormat('marketplace-card', 'square'),
      profile: mockProfile(),
      brandKit: mockBrandKit(),
      visualSystem: 'minimal',
    })
    expect(result.archetypeId).toBe('split-right-image')
  })

  it('synthesizeLayoutV2: score > 0 for marketplace-card', () => {
    const result = synthesizeLayoutV2({
      master: mockMaster(),
      format: mockFormat('marketplace-card', 'square'),
      profile: mockProfile(),
      brandKit: mockBrandKit(),
      visualSystem: 'minimal',
    })
    expect(result.score).toBeGreaterThan(0)
  })

  it('optimizeLayoutV2: final score >= initial score (never degrades)', () => {
    const arch = ARCHETYPES['split-right-image']
    const initialScene = buildSceneFromArchetypeV2(mockMaster(), arch, mockBrandKit(), undefined)
    const initial = scoreDesignObjective(initialScene, arch, undefined, {
      hierarchyClarity: 0.3,
      visualBalance: 0.25,
      ctaVisibility: 0.2,
      imageImpact: 0.15,
      readability: 0.05,
      spacingQuality: 0.05,
    })
    const result = optimizeLayoutV2(initialScene, arch, undefined, {
      hierarchyClarity: 0.3,
      visualBalance: 0.25,
      ctaVisibility: 0.2,
      imageImpact: 0.15,
      readability: 0.05,
      spacingQuality: 0.05,
    })
    expect(result.score).toBeGreaterThanOrEqual(initial.score)
  })

  it('optimizeLayoutV2 does not accept a candidate that increases constraint violations count', () => {
    const arch = ARCHETYPES['split-right-image']
    const built = buildSceneFromArchetypeV2(mockMaster(), arch, mockBrandKit(), undefined)
    const atBoundary = JSON.parse(JSON.stringify(built)) as typeof built
    atBoundary.cta.y = 94

    const initialViolations = checkV2Constraints(atBoundary, arch)
    const initialBottom = (atBoundary.cta?.y ?? 0) + (atBoundary.cta?.h ?? 0)

    const result = optimizeLayoutV2(atBoundary, arch, undefined, {
      hierarchyClarity: 0.3,
      visualBalance: 0.25,
      ctaVisibility: 0.2,
      imageImpact: 0.15,
      readability: 0.05,
      spacingQuality: 0.05,
    })

    expect(result.constraintViolations.length).toBeLessThanOrEqual(initialViolations.length)
    const finalBottom = (result.scene.cta?.y ?? 0) + (result.scene.cta?.h ?? 0)
    expect(finalBottom).toBeLessThanOrEqual(initialBottom)
  })
})
