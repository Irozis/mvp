import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildProject } from './autoAdapt'
import { BRAND_TEMPLATES } from './presets'
import { loadTelemetry, recordExport, resetTelemetry } from './sessionTelemetry'
import type { BrandKit, LayoutEvaluation, Project, Variant } from './types'

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createBrandKit(): BrandKit {
  return clone(BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit)
}

function createProject(): Project {
  return buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit: createBrandKit(),
    imageProfile: 'square',
  })
}

function baseLayoutEvaluation(overallScore: number, issues: string[] = []): LayoutEvaluation {
  return {
    hierarchyClarity: 0.7,
    visualBalance: 0.7,
    readability: 0.7,
    structuralValidity: true,
    overallScore,
    issues,
  }
}

function patchVariant(
  project: Project,
  formatKey: keyof NonNullable<Project['variants']>,
  patch: Partial<Variant>,
): Project {
  const next = structuredClone(project)
  const v = next.variants?.[formatKey]
  if (!v) throw new Error(`missing variant ${String(formatKey)}`)
  next.variants = { ...next.variants, [formatKey]: { ...v, ...patch } }
  return next
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
  } else {
    delete (globalThis as Record<string, unknown>).localStorage
  }
})

describe('recordExport', () => {
  it('first export creates telemetry with exportCount 1', () => {
    const base = createProject()
    const project = patchVariant(base, 'social-square', {
      archetypeResolution: {
        archetypeId: 'split-vertical',
        confidence: 0.9,
        reason: 'test',
      },
      layoutEvaluation: baseLayoutEvaluation(0.85, []),
    })

    const result = recordExport(project)
    expect(result.exportCount).toBe(1)
    expect(result.sessionStartedAt).toBeTruthy()
    expect(result.lastExportedAt).toBeTruthy()
  })

  it('second export increments exportCount to 2', () => {
    const base = createProject()
    const project = patchVariant(base, 'social-square', {
      archetypeResolution: {
        archetypeId: 'split-vertical',
        confidence: 0.9,
        reason: 'test',
      },
      layoutEvaluation: baseLayoutEvaluation(0.85, []),
    })

    recordExport(project)
    const result = recordExport(project)
    expect(result.exportCount).toBe(2)
  })

  it('archetypes record accumulates per archetypeId', () => {
    const base = createProject()
    const project = patchVariant(base, 'social-square', {
      archetypeResolution: {
        archetypeId: 'split-vertical',
        confidence: 0.9,
        reason: 'test',
      },
      layoutEvaluation: baseLayoutEvaluation(0.85, []),
    })

    const result = recordExport(project)
    expect(result.archetypes['split-vertical']).toBeDefined()
    expect(result.archetypes['split-vertical'].count).toBeGreaterThan(0)
  })

  it('fallbackRate is 0 when no fallbacks applied', () => {
    const base = createProject()
    const project = patchVariant(base, 'social-square', {
      archetypeResolution: {
        archetypeId: 'split-vertical',
        confidence: 0.9,
        reason: 'test',
        fallbackApplied: false,
      },
      layoutEvaluation: baseLayoutEvaluation(0.85, []),
    })

    const result = recordExport(project)
    expect(result.fallbackRate).toBe(0)
  })

  it('fallbackRate > 0 when fallback was applied', () => {
    const base = createProject()
    const project = patchVariant(base, 'social-square', {
      archetypeResolution: {
        archetypeId: 'split-vertical',
        confidence: 0.9,
        reason: 'test',
        fallbackApplied: true,
      },
      layoutEvaluation: baseLayoutEvaluation(0.85, []),
    })

    const result = recordExport(project)
    expect(result.fallbackRate).toBeGreaterThan(0)
  })

  it('resetTelemetry clears stored data', () => {
    const base = createProject()
    const project = patchVariant(base, 'social-square', {
      archetypeResolution: {
        archetypeId: 'split-vertical',
        confidence: 0.9,
        reason: 'test',
      },
      layoutEvaluation: baseLayoutEvaluation(0.85, []),
    })

    recordExport(project)
    resetTelemetry()
    expect(loadTelemetry()).toBeNull()
  })

  it('variants without archetypeResolution are skipped', () => {
    const base = createProject()
    const v = base.variants?.['social-square']
    if (!v) throw new Error('expected social-square')
    const stripped: Variant = { ...v, layoutEvaluation: baseLayoutEvaluation(0.5, []) }
    delete (stripped as { archetypeResolution?: unknown }).archetypeResolution

    const project: Project = {
      ...base,
      variants: { 'social-square': stripped },
    }

    const result = recordExport(project)
    expect(result.variantCount).toBe(0)
    expect(result.exportCount).toBe(1)
  })

  it('avgOverallScore is correct average across variants', () => {
    const base = createProject()
    const sq = patchVariant(base, 'social-square', {
      archetypeResolution: {
        archetypeId: 'split-vertical',
        confidence: 0.9,
        reason: 'test',
      },
      layoutEvaluation: baseLayoutEvaluation(0.8, []),
    }).variants?.['social-square']
    const sp = patchVariant(base, 'social-portrait', {
      archetypeResolution: {
        archetypeId: 'split-vertical',
        confidence: 0.9,
        reason: 'test',
      },
      layoutEvaluation: baseLayoutEvaluation(0.6, []),
    }).variants?.['social-portrait']
    if (!sq || !sp) throw new Error('expected variants')

    const project: Project = {
      ...base,
      variants: { 'social-square': sq, 'social-portrait': sp },
    }

    const result = recordExport(project)
    expect(result.avgOverallScore).toBeCloseTo(0.7, 5)
  })
})
