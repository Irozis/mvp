import { describe, expect, it } from 'vitest'

import { autoAdaptFormat, createMasterScene, getPreviewCandidateDiagnostics } from './autoAdapt'
import { BRAND_TEMPLATES } from './presets'
import { getFormatAssessment } from './validation'
import type { BrandKit, FormatKey, LayoutAssessment } from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createBrandKit(): BrandKit {
  return clone(BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit)
}

function getImageProfile(formatKey: FormatKey): 'square' | 'portrait' | 'landscape' {
  if (formatKey === 'social-square') return 'square'
  if (formatKey === 'social-portrait') return 'portrait'
  return 'landscape'
}

function getStructuralPenalty(assessment: LayoutAssessment) {
  return (assessment.structuralState?.findings || []).reduce((sum, finding) => {
    const severityWeight = finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1
    const findingWeight =
      finding.name === 'major-overlap'
        ? 100
        : finding.name === 'minimum-spacing'
          ? 70
          : finding.name === 'safe-area-compliance'
            ? 55
            : finding.name === 'role-placement'
              ? 45
              : finding.name === 'text-size-sanity'
                ? 28
                : finding.name === 'image-dominance-sanity'
                  ? 18
                  : 12
    return sum + severityWeight * findingWeight
  }, 0)
}

function countStructuralFinding(assessment: LayoutAssessment, name: string) {
  return (assessment.structuralState?.findings || []).filter((finding) => finding.name === name).length
}

function getRectOverlapArea(
  a: { x?: number; y?: number; w?: number; h?: number },
  b: { x?: number; y?: number; w?: number; h?: number }
) {
  const overlapX = Math.max(0, Math.min((a.x || 0) + (a.w || 0), (b.x || 0) + (b.w || 0)) - Math.max(a.x || 0, b.x || 0))
  const overlapY = Math.max(0, Math.min((a.y || 0) + (a.h || 0), (b.y || 0) + (b.h || 0)) - Math.max(a.y || 0, b.y || 0))
  return overlapX * overlapY
}

function getSceneTextClusterBounds(scene: {
  title: { x?: number; y?: number; w?: number; h?: number }
  subtitle: { x?: number; y?: number; w?: number; h?: number }
}) {
  const rects = [scene.title, scene.subtitle].filter((rect) => (rect.w || 0) > 0 && (rect.h || 0) > 0)
  const left = Math.min(...rects.map((rect) => rect.x || 0))
  const top = Math.min(...rects.map((rect) => rect.y || 0))
  const right = Math.max(...rects.map((rect) => (rect.x || 0) + (rect.w || 0)))
  const bottom = Math.max(...rects.map((rect) => (rect.y || 0) + (rect.h || 0)))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

function getImageCoverage(scene: { image: { w?: number; h?: number } }) {
  return ((scene.image.w || 0) * (scene.image.h || 0)) / 10000
}

describe('generation quality gates for primary formats', () => {
  it('preview planning adds bounded recovery diversity for targeted recovery formats', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)
    const formats: FormatKey[] = [
      'social-square',
      'social-portrait',
      'social-landscape',
      'display-large-rect',
    ]

    for (const formatKey of formats) {
      const diagnostics = getPreviewCandidateDiagnostics({
        master,
        formatKey,
        visualSystem: 'product-card',
        brandKit,
        goal: 'promo-pack',
        assetHint: { imageProfile: getImageProfile(formatKey) },
      })

      expect(diagnostics.allCandidates.length).toBeGreaterThanOrEqual(6)
      expect(
        diagnostics.allCandidates.some(
          (candidate) =>
            candidate.strategyLabel.startsWith('recovery-') ||
            (candidate.fixStage !== 'base' && candidate.intent.occupancyMode === 'text-safe')
        )
      ).toBe(true)
    }
  })

  it('selection prefers a structurally safer fallback over the raw base candidate on tough formats', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)

    ;(['social-square', 'display-mpu', 'display-large-rect'] as FormatKey[]).forEach((formatKey) => {
      const diagnostics = getPreviewCandidateDiagnostics({
        master,
        formatKey,
        visualSystem: 'product-card',
        brandKit,
        goal: 'promo-pack',
        assetHint: { imageProfile: getImageProfile(formatKey) },
      })

      const basePenalty = getStructuralPenalty(diagnostics.baseCandidate.assessment)
      const selectedPenalty = getStructuralPenalty(diagnostics.selectedCandidate.assessment)

      expect(diagnostics.selectedCandidate.highStructuralFindingCount).toBeLessThanOrEqual(
        diagnostics.baseCandidate.highStructuralFindingCount
      )
      expect(diagnostics.selectedCandidate.criticalIssueCount).toBeLessThanOrEqual(
        diagnostics.baseCandidate.criticalIssueCount
      )
      expect(selectedPenalty).toBeLessThanOrEqual(basePenalty)
    })
  })

  it('primary social baseline selects a no-worse pre-final candidate with bounded recovery diversity', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)

    ;(['social-square', 'social-portrait', 'social-landscape'] as FormatKey[]).forEach((formatKey) => {
      const diagnostics = getPreviewCandidateDiagnostics({
        master,
        formatKey,
        visualSystem: 'product-card',
        brandKit,
        goal: 'promo-pack',
        assetHint: { imageProfile: getImageProfile(formatKey) },
      })

      expect(diagnostics.allCandidates.length).toBeGreaterThanOrEqual(6)
      expect(getStructuralPenalty(diagnostics.selectedCandidate.assessment)).toBeLessThanOrEqual(
        getStructuralPenalty(diagnostics.baseCandidate.assessment)
      )
      expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'minimum-spacing')).toBeLessThanOrEqual(
        countStructuralFinding(diagnostics.baseCandidate.assessment, 'minimum-spacing')
      )
      expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'role-placement')).toBeLessThanOrEqual(
        countStructuralFinding(diagnostics.baseCandidate.assessment, 'role-placement')
      )
      expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'major-overlap')).toBeLessThanOrEqual(
        countStructuralFinding(diagnostics.baseCandidate.assessment, 'major-overlap')
      )
    })
  })

  it('social-square baseline reduces image dominance and key structural pressure before final rescue logic', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)
    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey: 'social-square',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
    })

    expect(getStructuralPenalty(diagnostics.selectedCandidate.assessment)).toBeLessThanOrEqual(
      getStructuralPenalty(diagnostics.baseCandidate.assessment)
    )
    expect(diagnostics.selectedCandidate.highStructuralFindingCount).toBeLessThanOrEqual(
      diagnostics.baseCandidate.highStructuralFindingCount
    )
    expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'image-dominance-sanity')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'image-dominance-sanity')
    )
    expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'minimum-spacing')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'minimum-spacing')
    )
    expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'role-placement')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'role-placement')
    )
    expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'major-overlap')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'major-overlap')
    )
    expect(getImageCoverage(diagnostics.selectedCandidate.scene)).toBeLessThanOrEqual(0.15)
  })

  it('display-large-rect baseline keeps text-image-cta packing safer before repair-aware finalization', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)
    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey: 'display-large-rect',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint: { imageProfile: 'landscape' },
    })

    expect(getStructuralPenalty(diagnostics.selectedCandidate.assessment)).toBeLessThan(
      getStructuralPenalty(diagnostics.baseCandidate.assessment)
    )
    expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'minimum-spacing')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'minimum-spacing')
    )
    expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'role-placement')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'role-placement')
    )
  })

  it('post-selection auto-fix does not regress the structural recovery profile on social recovery formats', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)
    const formats: FormatKey[] = ['social-square', 'social-portrait', 'social-landscape']
    for (const formatKey of formats) {
      const diagnostics = getPreviewCandidateDiagnostics({
        master,
        formatKey,
        visualSystem: 'product-card',
        brandKit,
        goal: 'promo-pack',
        assetHint: { imageProfile: getImageProfile(formatKey) },
      })
      const beforePenalty = getStructuralPenalty(diagnostics.selectedCandidate.assessment)
      const afterPenalty = getStructuralPenalty(diagnostics.postSelectionFix.assessment)
      const beforeStatus = diagnostics.selectedCandidate.assessment.structuralState?.status || 'invalid'
      const afterStatus = diagnostics.postSelectionFix.assessment.structuralState?.status || 'invalid'
      const beforeFindings = diagnostics.selectedCandidate.assessment.structuralState?.findings.length || 0
      const afterFindings = diagnostics.postSelectionFix.assessment.structuralState?.findings.length || 0
      const beforeCritical = diagnostics.selectedCandidate.assessment.structuralState?.findings.filter((finding) => finding.severity === 'high').length || 0
      const afterCritical = diagnostics.postSelectionFix.assessment.structuralState?.findings.filter((finding) => finding.severity === 'high').length || 0

      expect(getStructuralPenalty(diagnostics.postSelectionFix.assessment)).toBeLessThanOrEqual(beforePenalty)
      expect(afterFindings).toBeLessThanOrEqual(beforeFindings)
      expect(afterCritical).toBeLessThanOrEqual(beforeCritical)
      expect(afterStatus === beforeStatus || afterStatus === 'degraded' || afterStatus === 'valid').toBe(true)
      expect(diagnostics.postSelectionFix.strategyLabel.length).toBeGreaterThan(0)
      if (diagnostics.postSelectionFix.reselectionApplied) {
        expect(diagnostics.postSelectionFix.strategyLabel.startsWith('repair-aware:')).toBe(true)
        expect(afterPenalty).toBeLessThan(beforePenalty)
      }
    }
  })

  it('autoAdaptFormat preserves or improves the selected recovery-oriented candidate quality on social recovery formats', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)

    ;(['social-square', 'social-portrait', 'social-landscape'] as FormatKey[]).forEach((formatKey) => {
      const diagnostics = getPreviewCandidateDiagnostics({
        master,
        formatKey,
        visualSystem: 'product-card',
        brandKit,
        goal: 'promo-pack',
        assetHint: { imageProfile: getImageProfile(formatKey) },
      })
      const scene = autoAdaptFormat(master, formatKey, 'product-card', brandKit, getImageProfile(formatKey))
      const assessment = getFormatAssessment(formatKey, scene)

      expect(getStructuralPenalty(assessment)).toBeLessThanOrEqual(
        getStructuralPenalty(diagnostics.selectedCandidate.assessment)
      )
      expect((assessment.structuralState?.findings.length || 0)).toBeLessThanOrEqual(
        diagnostics.selectedCandidate.assessment.structuralState?.findings.length || 0
      )
    })
  })

  it('social-square final output benefits from stronger baseline geometry, not only rescue ordering', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)
    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey: 'social-square',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
    })
    const scene = autoAdaptFormat(master, 'social-square', 'product-card', brandKit, 'square')
    const assessment = getFormatAssessment('social-square', scene)

    expect(getStructuralPenalty(assessment)).toBeLessThanOrEqual(
      getStructuralPenalty(diagnostics.baseCandidate.assessment)
    )
    expect(countStructuralFinding(assessment, 'minimum-spacing')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'minimum-spacing')
    )
    expect(countStructuralFinding(assessment, 'role-placement')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'role-placement')
    )
    expect(countStructuralFinding(assessment, 'major-overlap')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'major-overlap')
    )
    expect(getImageCoverage(scene)).toBeLessThanOrEqual(0.15)
    const textClusterBounds = getSceneTextClusterBounds(scene)
    expect(getRectOverlapArea(scene.image, textClusterBounds)).toBe(0)
    expect((scene.image.y || 0) + (scene.image.h || 0)).toBeLessThanOrEqual((scene.cta.y || 0) - 5)
  })

  it('social-square image materialization keeps the final image box inside the guarded square envelope', () => {
    const brandKit = createBrandKit()
    const master = createMasterScene('promo', brandKit)
    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey: 'social-square',
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint: { imageProfile: 'square' },
    })
    const selected = diagnostics.selectedCandidate.scene

    expect(getImageCoverage(selected)).toBeLessThanOrEqual(0.15)
    expect((selected.image.x || 0)).toBeGreaterThanOrEqual(52)
    expect((selected.image.y || 0)).toBeGreaterThanOrEqual(11)
    expect((selected.image.x || 0) + (selected.image.w || 0)).toBeLessThanOrEqual(92)
    expect((selected.image.y || 0) + (selected.image.h || 0)).toBeLessThanOrEqual((selected.cta.y || 0) - 5)
    expect(countStructuralFinding(diagnostics.selectedCandidate.assessment, 'image-dominance-sanity')).toBeLessThanOrEqual(
      countStructuralFinding(diagnostics.baseCandidate.assessment, 'image-dominance-sanity')
    )
  })
})
