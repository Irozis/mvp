import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildProject } from './autoAdapt'
import { BRAND_TEMPLATES } from './presets'
import { loadSavedProjects, saveProjectRecord } from './storage'
import type { BrandKit, Project } from './types'

const STORAGE_KEY = 'adaptive-graphics-saved-projects-v1'

class MemoryStorage {
  private store = new Map<string, string>()

  clear() {
    this.store.clear()
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number) {
    return [...this.store.keys()][index] || null
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  get length() {
    return this.store.size
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

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

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

describe('storage contract', () => {
  it('round-trips a saved project without losing key data', () => {
    const project = createProject()

    saveProjectRecord(null, 'Launch campaign', project, 'Initial draft')
    const loaded = loadSavedProjects()

    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Launch campaign')
    expect(loaded[0].project.template).toBe(project.template)
    expect(loaded[0].project.master.title.text).toBe(project.master.title.text)
    expect(loaded[0].project.formats['social-square'].title.text).toBe(project.formats['social-square'].title.text)
    expect(loaded[0].versions).toHaveLength(1)
    expect(loaded[0].versions[0].note).toBe('Initial draft')
  })

  it('returns an empty list for malformed JSON in storage', () => {
    localStorage.setItem(STORAGE_KEY, '{broken json')

    expect(loadSavedProjects()).toEqual([])
  })

  it('caps version history at twenty entries when saving the same project repeatedly', () => {
    const baseProject = createProject()
    const created = saveProjectRecord(null, 'Launch campaign', baseProject, 'v0')
    const existingId = created[0].id

    for (let index = 1; index <= 24; index += 1) {
      const nextProject = clone(baseProject)
      nextProject.master.title.text = `Launch headline ${index}`
      saveProjectRecord(existingId, 'Launch campaign', nextProject, `v${index}`)
    }

    const loaded = loadSavedProjects()

    expect(loaded).toHaveLength(1)
    expect(loaded[0].versions).toHaveLength(20)
    expect(loaded[0].versions[0].note).toBe('v24')
    expect(loaded[0].versions[0].project.master.title.text).toBe('Launch headline 24')
  })
})
