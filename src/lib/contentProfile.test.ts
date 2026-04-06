import { describe, expect, it } from 'vitest'

import { profileContent } from './contentProfile'
import type { Scene } from './types'

function sceneFromText(input: {
  title: string
  subtitle?: string
  cta?: string
  badge?: string
}): Scene {
  return {
    background: ['#111827', '#1f2937', '#374151'],
    title: { text: input.title, x: 0, y: 0, w: 0, h: 0 },
    subtitle: { text: input.subtitle || '', x: 0, y: 0, w: 0, h: 0 },
    cta: { text: input.cta || '', x: 0, y: 0, w: 0, h: 0 },
    badge: { text: input.badge || '', x: 0, y: 0, w: 0, h: 0 },
    logo: { text: '', x: 0, y: 0, w: 0, h: 0 },
    image: { x: 0, y: 0, w: 0, h: 0 },
    chip: '',
  } as Scene
}

describe('content profiling commercial heuristics', () => {
  it('prefers product-led over urgency for new product copy with product semantics', () => {
    const profile = profileContent(
      sceneFromText({
        title: 'New insulated bottle for daily hydration',
        subtitle: 'Leakproof product design with lightweight steel body.',
        cta: 'Buy now',
        badge: 'New',
      })
    )

    expect(profile.sellingAngle).toBe('product-led')
    expect(profile.productVisualNeed).toBe('critical')
  })

  it('keeps feature-heavy benefit copy out of trust-led by default', () => {
    const profile = profileContent(
      sceneFromText({
        title: 'Feel lighter and move easier every day',
        subtitle: 'Comfort-led upgrade with simple routine benefits and fast everyday payoff.',
        cta: 'Shop now',
      })
    )

    expect(profile.sellingAngle).toBe('benefit-led')
  })
})
