import { describe, expect, it } from 'vitest'
import {
  buildThresholdCandidates,
  computeSafeMetrics,
  extractAnnotationFromOverlay,
} from './socialSquareCalibration.shared'

function makeImage(width: number, height: number) {
  return {
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4).fill(255),
  }
}

function paintRect(
  image: { width: number; height: number; pixels: Uint8ClampedArray },
  rect: { x: number; y: number; w: number; h: number },
  rgb: [number, number, number]
) {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const index = (y * image.width + x) * 4
      image.pixels[index] = rgb[0]
      image.pixels[index + 1] = rgb[1]
      image.pixels[index + 2] = rgb[2]
      image.pixels[index + 3] = 255
    }
  }
}

describe('socialSquareCalibration', () => {
  it('extracts core overlay rectangles by color', () => {
    const image = makeImage(40, 40)
    paintRect(image, { x: 10, y: 12, w: 14, h: 16 }, [255, 0, 0])
    paintRect(image, { x: 4, y: 4, w: 12, h: 6 }, [0, 255, 0])
    paintRect(image, { x: 4, y: 14, w: 10, h: 4 }, [0, 255, 255])
    paintRect(image, { x: 28, y: 4, w: 6, h: 4 }, [180, 0, 180])
    paintRect(image, { x: 28, y: 12, w: 8, h: 5 }, [255, 255, 0])

    const annotation = extractAnnotationFromOverlay(image, {
      id: 'Synthetic 1',
      bucket: 'core',
      filename: 'Synthetic 1.png',
    })

    expect(annotation.heroSubjectRect).toEqual({ x: 10, y: 12, w: 14, h: 16 })
    expect(annotation.headlineRects).toEqual([{ x: 4, y: 4, w: 12, h: 6 }])
    expect(annotation.subtitleRects).toEqual([{ x: 4, y: 14, w: 10, h: 4 }])
    expect(annotation.logoRect).toEqual({ x: 28, y: 4, w: 6, h: 4 })
    expect(annotation.badgeRect).toEqual({ x: 28, y: 12, w: 8, h: 5 })
    expect(annotation.flags).toEqual([])
  })

  it('ignores tiny artifacts and marks incomplete or ambiguous cases conservatively', () => {
    const incompleteImage = makeImage(60, 60)
    paintRect(incompleteImage, { x: 6, y: 6, w: 10, h: 6 }, [0, 255, 0])
    paintRect(incompleteImage, { x: 2, y: 2, w: 2, h: 2 }, [255, 0, 0])

    const incomplete = extractAnnotationFromOverlay(incompleteImage, {
      id: 'Incomplete',
      bucket: 'stress',
      filename: 'Incomplete.png',
    })

    expect(incomplete.heroSubjectRect).toBeNull()
    expect(incomplete.flags).toContain('incomplete')

    const ambiguousImage = makeImage(80, 80)
    paintRect(ambiguousImage, { x: 8, y: 8, w: 14, h: 14 }, [255, 0, 0])
    paintRect(ambiguousImage, { x: 8, y: 30, w: 12, h: 8 }, [180, 0, 180])
    paintRect(ambiguousImage, { x: 44, y: 30, w: 12, h: 8 }, [180, 0, 180])

    const ambiguous = extractAnnotationFromOverlay(ambiguousImage, {
      id: 'Ambiguous',
      bucket: 'stress',
      filename: 'Ambiguous.png',
    })

    expect(ambiguous.heroSubjectRect).toEqual({ x: 8, y: 8, w: 14, h: 14 })
    expect(ambiguous.logoRect).toEqual({ x: 8, y: 30, w: 12, h: 8 })
    expect(ambiguous.flags).toContain('ambiguous')
  })

  it('computes safe metrics over text coverage', () => {
    const metrics = computeSafeMetrics(
      [{ x: 10, y: 10, w: 20, h: 10 }],
      [
        { x: 10, y: 10, w: 10, h: 10, score: 0.8 },
        { x: 20, y: 10, w: 10, h: 10, score: 0.5 },
      ],
      { x: 0, y: 0, w: 40, h: 40 },
      0.6
    )

    expect(metrics.safeTextScore).toBe(0.65)
    expect(metrics.safeCoverage).toBe(0.5)
    expect(metrics.safeAreaCoverage).toBe(1)
  })

  it('builds candidate thresholds from core metrics only', () => {
    const records = buildThresholdCandidates([
      {
        id: 'A',
        filename: 'A.png',
        bucket: 'core',
        width: 1080,
        height: 1080,
        flags: [],
        headlineOverlapRatio: 0.18,
        subtitleOverlapRatio: 0.16,
        logoOverlapRatio: 0.03,
        badgeOverlapRatio: 0.05,
        safeTextScore: 0.61,
        safeCoverage: 0.74,
        safeAreaCoverage: 0.9,
      },
      {
        id: 'B',
        filename: 'B.png',
        bucket: 'core',
        width: 1080,
        height: 1080,
        flags: [],
        headlineOverlapRatio: 0.2,
        subtitleOverlapRatio: 0.17,
        logoOverlapRatio: 0.04,
        badgeOverlapRatio: 0.06,
        safeTextScore: 0.6,
        safeCoverage: 0.73,
        safeAreaCoverage: 0.88,
      },
      {
        id: 'C',
        filename: 'C.png',
        bucket: 'core',
        width: 1080,
        height: 1080,
        flags: [],
        headlineOverlapRatio: 0.22,
        subtitleOverlapRatio: 0.19,
        logoOverlapRatio: 0.05,
        badgeOverlapRatio: 0.07,
        safeTextScore: 0.59,
        safeCoverage: 0.71,
        safeAreaCoverage: 0.87,
      },
      {
        id: 'D',
        filename: 'D.png',
        bucket: 'core',
        width: 1080,
        height: 1080,
        flags: [],
        headlineOverlapRatio: 0.21,
        subtitleOverlapRatio: 0.18,
        logoOverlapRatio: 0.04,
        badgeOverlapRatio: 0.06,
        safeTextScore: 0.6,
        safeCoverage: 0.72,
        safeAreaCoverage: 0.89,
      },
    ])

    const headlineCandidate = records.find((record) => record.metric === 'headline maxOverlapRatio')?.candidate
    const safeTextCandidate = records.find((record) => record.metric === 'safeTextScoreMin')?.candidate

    expect(typeof headlineCandidate).toBe('number')
    expect(typeof safeTextCandidate).toBe('number')
    expect(headlineCandidate as number).toBeGreaterThanOrEqual(0.22)
    expect(safeTextCandidate as number).toBeLessThanOrEqual(0.59)
  })
})
