import { describe, expect, it } from 'vitest'

import { applySquareSubtitleCtaPairingStructuralRepairDebug } from './autoAdapt'
import type { Scene } from './types'

function baseSquareScene(overrides?: Partial<Scene>): Scene {
  return {
    background: ['#111111', '#222222'],
    accent: '#ffffff',
    title: {
      x: 8,
      y: 38,
      w: 40,
      h: 14,
      text: 'Short headline',
      fontSize: 40,
      maxLines: 2,
    },
    subtitle: {
      x: 8,
      y: 54,
      w: 36,
      h: 6,
      text: 'Supporting line',
      fontSize: 16,
      maxLines: 2,
    },
    cta: {
      x: 8,
      y: 84,
      w: 22,
      h: 6.6,
      text: 'Shop now',
      fontSize: 16,
      maxLines: 1,
    },
    badge: { x: 76, y: 18, w: 10, h: 4, text: '' },
    logo: { x: 8, y: 8, w: 14, h: 4, text: '' },
    image: { x: 54, y: 14, w: 30, h: 36 },
    ...overrides,
  }
}

describe('social-square CTA anchored to message cluster', () => {
  it('structural repair places CTA just below subtitle, not in a fixed bottom lane', () => {
    const repaired = applySquareSubtitleCtaPairingStructuralRepairDebug({
      scene: baseSquareScene(),
      formatKey: 'social-square',
    })
    const subtitleBottom = (repaired.subtitle.y || 0) + (repaired.subtitle.h || 0)
    expect(repaired.cta.y || 0).toBeLessThan(80)
    expect(repaired.cta.y || 0).toBeGreaterThanOrEqual(subtitleBottom + 3.5)
    expect(repaired.cta.y || 0).toBeLessThanOrEqual(92 - (repaired.cta.h || 6))
  })

  it('title-only repair keeps CTA within a tight band under the title', () => {
    const repaired = applySquareSubtitleCtaPairingStructuralRepairDebug({
      scene: baseSquareScene({
        subtitle: {
          x: 8,
          y: 54,
          w: 36,
          h: 6,
          text: '',
          fontSize: 16,
          maxLines: 1,
        },
      }),
      formatKey: 'social-square',
    })
    const titleBottom = (repaired.title.y || 0) + (repaired.title.h || 0)
    expect((repaired.subtitle.text || '').trim()).toBe('')
    expect(repaired.cta.y || 0).toBeLessThan(78)
    expect(repaired.cta.y || 0).toBeGreaterThanOrEqual(titleBottom + 2)
  })
})
