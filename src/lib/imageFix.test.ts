import { describe, expect, it } from 'vitest'
import { FORMAT_MAP } from './presets'
import { getFormatRuleSet } from './formatRules'
import type { Scene } from './types'
import { recomputeImageFootprint } from './imageAnalysis'

function coverage(scene: Scene) {
  return ((scene.image.w || 0) * (scene.image.h || 0)) / 10000
}

describe('image fixes', () => {
  it('recomputeImageFootprint clamps image coverage into format rules', () => {
    const format = FORMAT_MAP['social-square']
    const rules = getFormatRuleSet(format)
    const scene: Scene = {
      background: ['#000000', '#111111', '#222222'],
      accent: '#ffffff',
      title: { x: 8, y: 60, w: 50, fontSize: 44, charsPerLine: 18, maxLines: 3, weight: 800, fill: '#fff', text: 'Test' },
      subtitle: { x: 8, y: 76, w: 50, fontSize: 18, charsPerLine: 28, maxLines: 4, weight: 400, fill: '#fff', text: 'Sub' },
      cta: { x: 8, y: 90, w: 18, h: 6, fontSize: 16, bg: '#fff', fill: '#000', text: 'Buy' },
      badge: { x: 80, y: 6, w: 12, h: 5, fontSize: 14, bg: '#fff', bgOpacity: 0.2, fill: '#fff', text: 'Badge' },
      logo: { x: 6, y: 6, w: 10, h: 5, bg: '#fff', bgOpacity: 0.1, fill: '#fff' },
      image: { x: 8, y: 8, w: 10, h: 10, rx: 18, fit: 'xMidYMid slice' }, // too small
    }

    const before = coverage(scene)
    expect(before).toBeLessThan(rules.composition.minImageCoverage)

    const fixed = recomputeImageFootprint({ format, scene })
    const after = coverage(fixed)
    expect(after).toBeGreaterThanOrEqual(rules.composition.minImageCoverage - 0.01)
    expect(after).toBeLessThanOrEqual(rules.composition.maxImageCoverage + 0.01)
  })
})

