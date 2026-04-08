import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./groqImageAnalyzer', () => ({
  groqImageAnalyzer: vi.fn(),
}))

import {
  aiAnalyzeImage,
  analyzeReferenceImage,
  buildHeuristicImageAnalysisFromPixels,
  setAIImageAnalyzer,
} from './imageAnalysis'
import { groqImageAnalyzer } from './groqImageAnalyzer'

const groqImageAnalyzerMock = vi.mocked(groqImageAnalyzer)

function createPixels(width: number, height: number, rgb: [number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = rgb[0]
    pixels[index + 1] = rgb[1]
    pixels[index + 2] = rgb[2]
    pixels[index + 3] = 255
  }
  return pixels
}

function installImageCanvasStubs(input: { width: number; height: number; pixels: Uint8ClampedArray }) {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

  class MockImage {
    naturalWidth = input.width
    naturalHeight = input.height
    crossOrigin = ''
    onload: null | (() => void) = null
    onerror: null | (() => void) = null

    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }

  const canvas = {
    width: input.width,
    height: input.height,
    getContext: () => ({
      drawImage: () => undefined,
      getImageData: () => ({ data: input.pixels }),
    }),
  }

  Object.defineProperty(globalThis, 'Image', {
    value: MockImage,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'document', {
    value: {
      createElement: (tag: string) => {
        if (tag !== 'canvas') {
          throw new Error(`Unexpected element: ${tag}`)
        }
        return canvas
      },
    },
    configurable: true,
    writable: true,
  })

  return () => {
    if (originalImage) {
      Object.defineProperty(globalThis, 'Image', originalImage)
    } else {
      delete (globalThis as Record<string, unknown>).Image
    }

    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument)
    } else {
      delete (globalThis as Record<string, unknown>).document
    }
  }
}

afterEach(() => {
  setAIImageAnalyzer(null)
  groqImageAnalyzerMock.mockReset()
})

describe('image analysis', () => {
  it('builds deterministic heuristic analysis from supported raster pixels', () => {
    const analysis = buildHeuristicImageAnalysisFromPixels({
      width: 12,
      height: 12,
      pixels: createPixels(12, 12, [32, 96, 200]),
    })

    expect(analysis.imageProfile).toBe('square')
    expect(analysis.dominantColors.length).toBeGreaterThan(0)
    expect(analysis.safeTextAreas.length).toBeGreaterThan(0)
    expect(analysis.brightnessMap.length).toBeGreaterThan(0)
    expect(analysis.focalSuggestion).toBeTruthy()
  })

  it('returns the mocked Groq analysis when analyzer succeeds', async () => {
    const expected = {
      focalPoint: { x: 42, y: 38 },
      safeTextAreas: [{ x: 8, y: 8, w: 24, h: 24, score: 0.8 }],
      visualMassCenter: { x: 44, y: 42 },
      brightnessMap: [{ x: 50, y: 50, score: 0.6 }],
      contrastZones: [],
      dominantColors: ['#112233', '#445566'],
      mood: 'dark' as const,
      cropRisk: 'low' as const,
      imageProfile: 'square' as const,
      detectedContrast: 'medium' as const,
      focalSuggestion: 'center' as const,
    }
    groqImageAnalyzerMock.mockResolvedValueOnce(expected)

    const result = await aiAnalyzeImage({ url: 'https://example.com/sample.png', role: 'main-image', id: 'asset-1', createdAt: '', updatedAt: '' })

    expect(result).toEqual(expected)
  })

  it('falls back to deterministic heuristics when the Groq analyzer fails', async () => {
    const restore = installImageCanvasStubs({
      width: 120,
      height: 80,
      pixels: createPixels(32, 32, [180, 140, 90]),
    })
    groqImageAnalyzerMock.mockRejectedValueOnce(new Error('fail'))

    try {
      const result = await aiAnalyzeImage({ url: 'https://example.com/fallback.png', role: 'main-image', id: 'asset-1', createdAt: '', updatedAt: '' })

      expect(result.imageProfile).toBe('landscape')
      expect(result.brightnessMap.length).toBeGreaterThan(0)
      expect(result.dominantColors.length).toBeGreaterThan(0)
      expect(result.safeTextAreas.length).toBeGreaterThan(0)
    } finally {
      restore()
    }
  })

  it('returns fallback reference analysis for unsupported pdf inputs', async () => {
    const result = await analyzeReferenceImage('data:application/pdf;base64,abc')

    expect(result.suggestedFamily).toBe('landscape')
    expect(result.mood).toBe('dark')
    expect(result.palette.length).toBe(4)
  })

  it('derives palette and family for supported raster reference analysis', async () => {
    const restore = installImageCanvasStubs({
      width: 100,
      height: 100,
      pixels: createPixels(16, 16, [240, 210, 80]),
    })

    try {
      const result = await analyzeReferenceImage('https://example.com/reference.png')

      expect(result.suggestedFamily).toBe('square')
      expect(result.palette.length).toBe(4)
      expect(result.accent).toMatch(/^#/)
      expect(result.foreground).toMatch(/^#/)
    } finally {
      restore()
    }
  })
})
