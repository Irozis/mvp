import { describe, expect, it } from 'vitest'

import { autoAdaptFormat, buildProject, createMasterScene, getRepairDiagnostics } from './autoAdapt'
import { BRAND_TEMPLATES } from './presets'
import { getFormatAssessment, getSceneValidation } from './validation'
import type { BrandKit, LayoutIssue, Scene } from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createBrandKit(): BrandKit {
  return clone(BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit)
}

function createBrokenCollisionScene(): Scene {
  const scene = createMasterScene('promo', createBrandKit())
  scene.title.x = 8
  scene.title.y = 54
  scene.title.w = 62
  scene.title.h = 16
  scene.subtitle.x = 8
  scene.subtitle.y = 58
  scene.subtitle.w = 58
  scene.subtitle.h = 12
  scene.cta.x = 8
  scene.cta.y = 61
  scene.cta.w = 24
  scene.cta.h = 8
  scene.image.x = 12
  scene.image.y = 52
  scene.image.w = 62
  scene.image.h = 26
  return scene
}

function createSpacingBroken(scene: Scene): Scene {
  const next = clone(scene)
  next.subtitle.y = (next.title.y || 0) + 6
  next.cta.y = (next.subtitle.y || 0) + 5
  next.cta.x = next.title.x
  return next
}

function createCrampedMarketplaceBaseline(scene: Scene): Scene {
  const next = clone(scene)
  next.title.y = (next.title.y || 0) + 6
  next.subtitle.y = (next.title.y || 0) + 3
  next.cta.y = (next.subtitle.y || 0) + 4
  return next
}

function createStableCleanSquareScene(): Scene {
  return {
    background: ['#111111', '#222222', '#333333'],
    accent: '#ffffff',
    title: {
      x: 8,
      y: 62,
      w: 40,
      h: 10,
      text: 'Launch smarter',
      fontSize: 36,
      charsPerLine: 16,
      maxLines: 2,
    },
    subtitle: {
      x: 8,
      y: 74,
      w: 38,
      h: 6,
      text: 'Short supporting copy',
      fontSize: 18,
      charsPerLine: 22,
      maxLines: 2,
    },
    cta: {
      x: 8,
      y: 86,
      w: 20,
      h: 6,
      text: 'Shop now',
      fontSize: 16,
      maxLines: 1,
    },
    badge: { x: 76, y: 18, w: 10, h: 4, text: '' },
    logo: { x: 8, y: 8, w: 14, h: 4, text: '' },
    image: { x: 54, y: 14, w: 30, h: 36 },
  }
}

function countHighSeverityIssues(issues: LayoutIssue[]) {
  return issues.filter((issue) => issue.severity === 'critical' || issue.severity === 'high').length
}

describe('validation behavior', () => {
  it('detects an obviously broken square scene with real collisions', () => {
    const broken = createBrokenCollisionScene()
    const assessment = getFormatAssessment('social-square', broken)
    const sceneIssues = getSceneValidation(broken, { width: 1080, height: 1080 })
    const issueCodes = [...assessment.issues, ...sceneIssues].map((issue) => issue.code)

    expect(assessment.issues.length).toBeGreaterThan(0)
    expect(countHighSeverityIssues(assessment.issues)).toBeGreaterThan(0)
    expect(issueCodes.some((code) => code.includes('collision') || code.includes('overlap') || code.includes('bounds'))).toBe(true)
  })

  it('does not flag a clean square control scene with collision-like false positives', () => {
    const assessment = getFormatAssessment('social-square', createStableCleanSquareScene())
    const issueCodes = new Set(assessment.issues.map((issue) => issue.code))

    expect(issueCodes.has('box-collision')).toBe(false)
    expect(issueCodes.has('headline-image-overlap')).toBe(false)
    expect(issueCodes.has('text-cta-overlap')).toBe(false)
    expect(issueCodes.has('out-of-bounds')).toBe(false)
    expect(issueCodes.has('outside-safe-area')).toBe(false)
  })

  it('finds materially better repair candidates for a cramped marketplace layout', async () => {
    const brandKit = createBrandKit()
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit,
      imageProfile: 'square',
    })
    const adapted = autoAdaptFormat(project.master, 'marketplace-card', 'product-card', brandKit, 'square')
    const broken = createCrampedMarketplaceBaseline(adapted)
    const before = getFormatAssessment('marketplace-card', broken)
    const diagnostics = await getRepairDiagnostics({
      scene: broken,
      regenerationMasterScene: project.master,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
      forceAlternativeLayout: true,
    })
    const candidates = diagnostics.diagnostics.selection?.telemetry.candidates || []
    const improvingCandidate = candidates.find(
      (candidate) => candidate.candidateKind !== 'current' && candidate.aggregateDelta > 0
    )

    expect(before.issues.length).toBeGreaterThan(0)
    expect(diagnostics.diagnostics.searchRuns.length).toBeGreaterThan(0)
    expect(improvingCandidate).toBeTruthy()
    expect(improvingCandidate?.aggregateDelta || 0).toBeGreaterThan(0)
    expect(improvingCandidate?.structuralStatus === 'degraded' || improvingCandidate?.structuralStatus === 'valid').toBe(true)
  })
})
