import { describe, expect, it } from 'vitest'

import { computePerceptualSignals } from './perceptualSignals'
import type { Scene } from './types'

function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    background: ['#ffffff', '#f5f5f5', '#eeeeee'],
    accent: '#111111',
    title: {
      x: 10,
      y: 12,
      w: 42,
      h: 8,
      text: 'Strong headline',
    },
    subtitle: {
      x: 10,
      y: 24,
      w: 42,
      h: 8,
      text: 'Supportive subtitle',
    },
    cta: {
      x: 10,
      y: 36,
      w: 18,
      h: 6,
      text: 'Shop now',
    },
    badge: {
      x: 8,
      y: 8,
      w: 12,
      h: 6,
      text: '',
    },
    logo: {
      x: 80,
      y: 8,
      w: 12,
      h: 6,
      text: '',
    },
    image: {
      x: 62,
      y: 10,
      w: 26,
      h: 30,
      text: '',
    },
    ...overrides,
  }
}

describe('computePerceptualSignals', () => {
  it('gives low CTA integration when the CTA is detached from the message cluster', () => {
    const scene = createScene({
      cta: {
        x: 76,
        y: 84,
        w: 14,
        h: 5,
        text: 'Learn more',
      },
    })

    const signals = computePerceptualSignals(scene)

    expect(signals.ctaIntegration).toBeLessThan(40)
  })

  it('flags dead space when one side of the layout stays mostly empty', () => {
    const scene = createScene({
      image: {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        text: '',
      },
      title: {
        x: 8,
        y: 14,
        w: 30,
        h: 8,
        text: 'Left-heavy headline',
      },
      subtitle: {
        x: 8,
        y: 26,
        w: 28,
        h: 8,
        text: 'All content stays left',
      },
      cta: {
        x: 8,
        y: 38,
        w: 16,
        h: 6,
        text: 'Claim',
      },
    })

    const signals = computePerceptualSignals(scene)

    expect(signals.deadSpaceScore).toBeGreaterThan(60)
  })

  it('detects when no single element reads as a clear primary', () => {
    const scene = createScene({
      title: {
        x: 10,
        y: 12,
        w: 22,
        h: 10,
        text: 'Balanced',
      },
      image: {
        x: 60,
        y: 10,
        w: 16,
        h: 18,
        text: '',
      },
      cta: {
        x: 10,
        y: 30,
        w: 14,
        h: 6,
        text: 'Learn',
      },
    })

    const signals = computePerceptualSignals(scene)

    expect(signals.hasClearPrimary).toBe(false)
    expect(signals.primaryElement).toBe('none')
  })

  it('rewards a tight text cluster with strong cohesion and CTA attachment', () => {
    const scene = createScene({
      title: {
        x: 8,
        y: 14,
        w: 50,
        h: 8,
        text: 'Headline',
      },
      subtitle: {
        x: 8,
        y: 24,
        w: 50,
        h: 8,
        text: 'Support copy',
      },
      cta: {
        x: 8,
        y: 34,
        w: 18,
        h: 6,
        text: 'Shop now',
      },
    })

    const signals = computePerceptualSignals(scene)

    expect(signals.clusterCohesion).toBeGreaterThan(70)
    expect(signals.ctaIntegration).toBeGreaterThan(75)
  })
})
