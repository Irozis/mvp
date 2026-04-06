import { describe, expect, it } from 'vitest'
import { FORMAT_MAP } from './presets'
import { getCompositionModel, getCompositionModelsForFormat, selectCompositionModel } from './formatCompositionModels'
import { getOverlaySafetyPolicy } from './overlayPolicies'

describe('formatCompositionModels', () => {
  it('has at least 2 models for a base format', () => {
    const models = getCompositionModelsForFormat(FORMAT_MAP['social-square'])
    expect(models.length).toBeGreaterThanOrEqual(2)
  })

  it('selectCompositionModel respects requestedModelId when available', () => {
    const format = FORMAT_MAP['social-square']
    const models = getCompositionModelsForFormat(format)
    const requested = models[1]!
    const selected = selectCompositionModel({ format, requestedModelId: requested.id })
    expect(selected?.id).toBe(requested.id)
  })

  it('supports a dedicated hero overlay model for social landscape', () => {
    const format = FORMAT_MAP['social-landscape']
    const selected = selectCompositionModel({ format, requestedFamily: 'landscape-image-dominant' })
    expect(selected?.id).toBe('landscape-hero-overlay')
  })

  it('keeps small display background models on a strict no-overlap baseline', () => {
    const model = getCompositionModel(FORMAT_MAP['display-mpu'], 'display-rectangle-image-bg')
    expect(model?.allowedOverlaps || []).toHaveLength(0)
  })

  it('uses tuned social square hero overlay thresholds', () => {
    const format = FORMAT_MAP['social-square']
    const model = getCompositionModel(format, 'square-hero-overlay')
    const policy = getOverlaySafetyPolicy(format, model)
    expect(policy.safeTextScoreMin).toBe(0.87)
    expect(policy.safeCoverageMin).toBe(0.7)
    expect(policy.safeAreaCoverageMin).toBe(0.22)
    expect(policy.maxOverlapByKind.headline).toBe(0.0125)
    expect(policy.maxOverlapByKind.subtitle).toBe(0.015)
  })

  it('uses tuned wide hero thresholds for billboard and presentation', () => {
    const billboardFormat = FORMAT_MAP['print-billboard']
    const billboardPolicy = getOverlaySafetyPolicy(
      billboardFormat,
      getCompositionModel(billboardFormat, 'billboard-wide-hero')
    )
    const presentationFormat = FORMAT_MAP['presentation-hero']
    const presentationPolicy = getOverlaySafetyPolicy(
      presentationFormat,
      getCompositionModel(presentationFormat, 'presentation-clean-hero')
    )

    expect(billboardPolicy.maxOverlapByKind.headline).toBe(0.36)
    expect(billboardPolicy.safeCoverageMin).toBe(0.8)
    expect(presentationPolicy.maxOverlapByKind.headline).toBe(0.18)
    expect(presentationPolicy.safeAreaCoverageMin).toBe(0.92)
  })
})
