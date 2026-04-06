import { describe, expect, it } from 'vitest'

import { autoAdaptFormat, buildProject, createMasterScene, fixLayout, regenerateFormats } from './autoAdapt'
import { BRAND_TEMPLATES, FORMAT_MAP } from './presets'
import { getFormatAssessment } from './validation'
import type { BrandKit, FormatKey, Project, Scene } from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createBrandKit(): BrandKit {
  return clone(BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit)
}

function expectSceneToBeUsable(scene: Scene, master: Scene, formatKey: FormatKey) {
  expect(scene.title.text).toBe(master.title.text)
  expect(scene.subtitle.text).toBe(master.subtitle.text)
  expect(scene.cta.text).toBe(master.cta.text)
  expect(scene.image.w).toBeGreaterThan(0)
  expect(scene.image.h).toBeGreaterThan(0)
  expect(scene.title.w).toBeGreaterThan(0)
  expect(scene.title.x).toBeGreaterThanOrEqual(0)
  expect(scene.title.y).toBeGreaterThanOrEqual(0)
  expect(scene.cta.x).toBeGreaterThanOrEqual(0)
  expect(scene.cta.y).toBeGreaterThanOrEqual(0)

  const assessment = getFormatAssessment(formatKey, scene)
  expect(assessment.layoutBoxes?.boxes.length || 0).toBeGreaterThan(0)
  expect(assessment.structuralState).toBeTruthy()
}

function createSpacingBroken(scene: Scene): Scene {
  const next = clone(scene)
  next.subtitle.y = (next.title.y || 0) + 6
  next.cta.y = (next.subtitle.y || 0) + 5
  next.cta.x = next.title.x
  return next
}

describe('project pipeline public APIs', () => {
  it('buildProject creates a usable project model with master scene, formats, variants, and metadata', () => {
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
      imageProfile: 'square',
    })

    expect(project.id).toBeTruthy()
    expect(project.updatedAt).toBeTruthy()
    expect(project.master.title.text).toBeTruthy()
    expect(project.master.subtitle.text).toBeTruthy()
    expect(project.contentBlocks?.length).toBeGreaterThanOrEqual(4)
    expect(project.variants?.['social-square']?.formatKey).toBe('social-square')
    expect(project.variants?.['social-portrait']?.formatKey).toBe('social-portrait')
    expect(project.variants?.['display-mpu']?.formatKey).toBe('display-mpu')
    expect(project.formats['social-square']).toBeTruthy()
    expect(project.formats['social-portrait']).toBeTruthy()
    expect(project.formats['display-mpu']).toBeTruthy()
  })

  it('createMasterScene preserves predictable role order and brand styling anchors', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)

    expect(master.background).toEqual(brandKit.background)
    expect(master.accent).toBe(brandKit.accentColor)
    expect(master.title.text).toBeTruthy()
    expect(master.subtitle.text).toBeTruthy()
    expect(master.cta.text).toBeTruthy()
    expect(master.title.y).toBeLessThan(master.subtitle.y || 0)
    expect(master.subtitle.y).toBeLessThan(master.cta.y || 0)
    expect(master.image.w).toBeGreaterThan(0)
    expect(master.logo.w).toBeGreaterThan(0)
  })

  it('autoAdaptFormat returns structurally usable scenes for primary supported formats', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)
    const formats: Array<{ key: FormatKey; imageProfile: 'square' | 'portrait' | 'landscape' }> = [
      { key: 'social-square', imageProfile: 'square' },
      { key: 'social-portrait', imageProfile: 'portrait' },
      { key: 'display-mpu', imageProfile: 'landscape' },
    ]

    for (const format of formats) {
      const scene = autoAdaptFormat(master, format.key, 'product-card', brandKit, format.imageProfile)
      expectSceneToBeUsable(scene, master, format.key)
    }
  })

  it('regenerateFormats rebuilds adapted formats from updated master content', () => {
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit: createBrandKit(),
      imageProfile: 'square',
    })

    const updated: Project = {
      ...project,
      master: {
        ...clone(project.master),
        title: {
          ...clone(project.master.title),
          text: 'Updated launch headline',
        },
      },
    }

    const regenerated = regenerateFormats(updated)

    expect(regenerated.formats['social-square'].title.text).toBe('Updated launch headline')
    expect(regenerated.formats['social-portrait'].title.text).toBe('Updated launch headline')
    expect(regenerated.variants?.['social-square']?.scene.title.text).toBe('Updated launch headline')
    expect(regenerated.updatedAt).toBeTruthy()
  })

  it('supports a compact public pipeline from build to adapt, validate, repair, and serialize', async () => {
    const brandKit = createBrandKit()
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit,
      imageProfile: 'square',
    })

    const adapted = autoAdaptFormat(project.master, 'social-square', 'product-card', brandKit, 'square')
    const broken = createSpacingBroken(adapted)
    const before = getFormatAssessment('social-square', broken)
    const repaired = await fixLayout({
      scene: broken,
      regenerationMasterScene: project.master,
      formatKey: 'social-square',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
    })

    const payload = JSON.parse(
      JSON.stringify({
        projectId: project.id,
        formatKey: 'social-square',
        repairedScene: repaired.scene,
      })
    ) as {
      projectId: string
      formatKey: FormatKey
      repairedScene: Scene
    }

    expect(FORMAT_MAP[payload.formatKey].family).toBe('square')
    expect(payload.repairedScene.title.text).toBe(project.master.title.text)
    expect(before.issues.length).toBeGreaterThan(0)
    expect(repaired.result).toBeTruthy()
    expect(typeof repaired.assessment.score).toBe('number')
  })
})
