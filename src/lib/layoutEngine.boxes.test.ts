import { describe, expect, it } from 'vitest'
import type { LayoutBox } from './types'
import { detectBoxCollisions, detectSpacingViolations } from './layoutEngine'
import { FORMAT_MAP } from './presets'
import { getCompositionModel } from './formatCompositionModels'

describe('layoutEngine box geometry', () => {
  it('detectBoxCollisions detects forbidden overlaps', () => {
    const boxes: LayoutBox[] = [
      { id: 'headline', kind: 'headline', rect: { x: 10, y: 10, w: 40, h: 20 } },
      { id: 'image', kind: 'image', rect: { x: 20, y: 15, w: 40, h: 40 } },
    ]
    const collisions = detectBoxCollisions(boxes)
    expect(collisions.length).toBeGreaterThan(0)
  })

  it('detectSpacingViolations flags too-tight gaps', () => {
    const format = FORMAT_MAP['social-square']
    const boxes: LayoutBox[] = [
      { id: 'headline', kind: 'headline', rect: { x: 10, y: 10, w: 40, h: 10 } },
      { id: 'subtitle', kind: 'subtitle', rect: { x: 10, y: 21, w: 40, h: 10 } }, // gap 1
    ]
    const violations = detectSpacingViolations(boxes, 18, format)
    expect(violations.length).toBeGreaterThan(0)
  })

  it('allows model-approved logo over image only in a top corner', () => {
    const model = getCompositionModel(FORMAT_MAP['social-square'], 'square-hero-overlay')
    const cornerBoxes: LayoutBox[] = [
      { id: 'image', kind: 'image', rect: { x: 10, y: 10, w: 80, h: 70 } },
      { id: 'logo', kind: 'logo', rect: { x: 12, y: 12, w: 14, h: 8 } },
    ]
    const centeredBoxes: LayoutBox[] = [
      { id: 'image', kind: 'image', rect: { x: 10, y: 10, w: 80, h: 70 } },
      { id: 'logo', kind: 'logo', rect: { x: 38, y: 30, w: 14, h: 8 } },
    ]

    expect(detectBoxCollisions(cornerBoxes, model)).toHaveLength(0)
    expect(detectBoxCollisions(centeredBoxes, model).length).toBeGreaterThan(0)
  })
})
