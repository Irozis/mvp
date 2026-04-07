import { getImageProfile } from './assetProfile'
import type { EnhancedImageAnalysis, FormatDefinition, ImageAsset, ImageBlockAnalysis, LayoutFamily, Scene } from './types'
import { getFormatRuleSet } from './formatRules'

export type ReferenceAnalysis = {
  palette: string[]
  background: [string, string, string]
  accent: string
  foreground: string
  mood: 'dark' | 'light'
  suggestedFamily: LayoutFamily
}

type Bucket = {
  count: number
  r: number
  g: number
  b: number
}

const FALLBACK_ANALYSIS: ReferenceAnalysis = {
  palette: ['#0f172a', '#1e293b', '#38bdf8', '#f8fafc'],
  background: ['#0f172a', '#1e293b', '#334155'],
  accent: '#38bdf8',
  foreground: '#f8fafc',
  mood: 'dark',
  suggestedFamily: 'landscape',
}

let aiImageAnalyzer: ((image: ImageAsset) => Promise<EnhancedImageAnalysis>) | null = null

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
const rgbToHex = (r: number, g: number, b: number) => `#${toHex(r)}${toHex(g)}${toHex(b)}`

function hexToRgb(hex: string) {
  const cleaned = hex.replace('#', '')
  const normalized = cleaned.length === 3 ? cleaned.split('').map((part) => `${part}${part}`).join('') : cleaned
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function saturation(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function getReadableTextColor(hex: string) {
  return luminance(hex) > 0.56 ? '#0f172a' : '#f8fafc'
}

function inferFamily(width: number, height: number): LayoutFamily {
  const ratio = width / height
  if (ratio >= 2.2) return 'wide'
  if (ratio >= 1.12) return 'landscape'
  if (ratio <= 0.38) return 'skyscraper'
  if (ratio <= 0.8) return 'portrait'
  return 'square'
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image.'))
    image.src = url
  })
}

function buildGridPoints(size: number) {
  const points: number[] = []
  const step = 100 / size
  for (let index = 0; index < size; index += 1) {
    points.push(index * step + step / 2)
  }
  return points
}

function overlapRatio(
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number }
) {
  const overlapW = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
  const overlapH = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y))
  const overlapArea = overlapW * overlapH
  const leftArea = Math.max(left.w * left.h, 1)
  return overlapArea / leftArea
}

function quantizePalette(pixels: Uint8ClampedArray) {
  const buckets = new Map<string, Bucket>()
  let avgR = 0
  let avgG = 0
  let avgB = 0
  let samples = 0

  for (let index = 0; index < pixels.length; index += 16) {
    const r = pixels[index]
    const g = pixels[index + 1]
    const b = pixels[index + 2]
    const alpha = pixels[index + 3]
    if (alpha < 180) continue

    avgR += r
    avgG += g
    avgB += b
    samples += 1

    const qr = Math.round(r / 32) * 32
    const qg = Math.round(g / 32) * 32
    const qb = Math.round(b / 32) * 32
    const key = `${qr}-${qg}-${qb}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }

  const palette = [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .map((bucket) => rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count))
    .filter((hex, index, list) => list.indexOf(hex) === index)
    .slice(0, 6)

  return {
    palette,
    averageHex: samples ? rgbToHex(avgR / samples, avgG / samples, avgB / samples) : '#64748b',
  }
}

const CANVAS_ANALYSIS_SIZE = 64

function canvasPixelBrightness(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function canvasPixelSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function canvasPixelEnergy(r: number, g: number, b: number): number {
  const br = canvasPixelBrightness(r, g, b)
  const sat = canvasPixelSaturation(r, g, b)
  const centerBias = 1 - Math.abs(br - 0.5) * 2
  return sat * 0.6 + centerBias * 0.4
}

function stdDevOfBrightness(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function focalSuggestionFromCanvasPoint(focal: { x: number; y: number }): EnhancedImageAnalysis['focalSuggestion'] {
  if (focal.y < 34) return 'top'
  if (focal.x < 36) return 'left'
  if (focal.x > 64) return 'right'
  return 'center'
}

function cropRiskFromFocalPoint(focal: { x: number; y: number }): EnhancedImageAnalysis['cropRisk'] {
  const { x, y } = focal
  if (x < 15 || x > 85 || y < 15 || y > 85) return 'high'
  if (x < 25 || x > 75 || y < 25 || y > 75) return 'medium'
  return 'low'
}

function imageProfileFromAspectRatio(ratio: number): EnhancedImageAnalysis['imageProfile'] {
  if (ratio > 2.0) return 'ultraWide'
  if (ratio > 1.3) return 'landscape'
  if (ratio >= 0.85 && ratio <= 1.15) return 'square'
  if (ratio >= 0.6 && ratio <= 0.85) return 'portrait'
  return 'tall'
}

function zoneAxisBounds(index: number, divisions: number, total: number): [number, number] {
  const start = Math.floor((index * total) / divisions)
  const end = Math.floor(((index + 1) * total) / divisions)
  return [start, end]
}

function topFrequentColorsFromPixels(pixels: Uint8ClampedArray, limit: number): string[] {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index]!
    const g = pixels[index + 1]!
    const b = pixels[index + 2]!
    const alpha = pixels[index + 3]!
    if (alpha < 128) continue
    const qr = Math.round(r / 32) * 32
    const qg = Math.round(g / 32) * 32
    const qb = Math.round(b / 32) * 32
    const key = `${qr}-${qg}-${qb}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }
  return [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .map((bucket) => rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count))
}

function buildCanvasEnhancedAnalysis(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  naturalWidth: number,
  naturalHeight: number
): EnhancedImageAnalysis {
  const brightnessValues: number[] = []
  let maxEnergy = -Infinity
  let focalPx = 0
  let focalPy = 0
  let sumBrightness = 0
  let sumBrightnessX = 0
  let sumBrightnessY = 0

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const i = (py * width + px) * 4
      const r = pixels[i]!
      const g = pixels[i + 1]!
      const b = pixels[i + 2]!
      const alpha = pixels[i + 3]!
      if (alpha < 180) continue

      const br = canvasPixelBrightness(r, g, b)
      brightnessValues.push(br)
      sumBrightness += br
      sumBrightnessX += px * br
      sumBrightnessY += py * br

      const energy = canvasPixelEnergy(r, g, b)
      if (energy > maxEnergy) {
        maxEnergy = energy
        focalPx = px
        focalPy = py
      }
    }
  }

  const aspectRatio = naturalWidth / Math.max(1, naturalHeight)
  const emptyFallback = (): EnhancedImageAnalysis => ({
    focalPoint: { x: 50, y: 50 },
    subjectBox: { x: 32, y: 30, w: 36, h: 40 },
    safeTextAreas: [
      { x: (100 / 3) * 0, y: (100 / 3) * 0, w: 100 / 3, h: 100 / 3, score: 0.5 },
      { x: (100 / 3) * 1, y: (100 / 3) * 1, w: 100 / 3, h: 100 / 3, score: 0.5 },
      { x: (100 / 3) * 2, y: (100 / 3) * 2, w: 100 / 3, h: 100 / 3, score: 0.5 },
    ],
    visualMassCenter: { x: 50, y: 50 },
    brightnessMap: Array.from({ length: 9 }, (_, index) => {
      const col = index % 3
      const row = Math.floor(index / 3)
      return { x: ((col + 0.5) / 3) * 100, y: ((row + 0.5) / 3) * 100, score: 0.5 }
    }),
    contrastZones: [],
    dominantColors: FALLBACK_ANALYSIS.palette.slice(0, 3),
    mood: 'neutral',
    cropRisk: 'low',
    imageProfile: imageProfileFromAspectRatio(aspectRatio),
    detectedContrast: 'low',
    focalSuggestion: 'center',
  })

  if (brightnessValues.length === 0) {
    return emptyFallback()
  }

  const meanBrightness = sumBrightness / brightnessValues.length
  const stdDev = stdDevOfBrightness(brightnessValues)

  let mood: EnhancedImageAnalysis['mood']
  if (meanBrightness > 0.6) mood = 'light'
  else if (meanBrightness < 0.4) mood = 'dark'
  else mood = 'neutral'

  let detectedContrast: EnhancedImageAnalysis['detectedContrast']
  if (stdDev > 0.25) detectedContrast = 'high'
  else if (stdDev > 0.12) detectedContrast = 'medium'
  else detectedContrast = 'low'

  const hasFocal = Number.isFinite(maxEnergy)
  const focalPoint = hasFocal
    ? {
        x: clamp(((focalPx + 0.5) / width) * 100, 0, 100),
        y: clamp(((focalPy + 0.5) / height) * 100, 0, 100),
      }
    : { x: 50, y: 50 }

  const totalW = sumBrightness
  const visualMassCenter =
    totalW > 1e-9
      ? {
          x: clamp(((sumBrightnessX / totalW + 0.5) / width) * 100, 0, 100),
          y: clamp(((sumBrightnessY / totalW + 0.5) / height) * 100, 0, 100),
        }
      : { x: 50, y: 50 }

  const cropRisk = cropRiskFromFocalPoint(focalPoint)
  const imageProfile = imageProfileFromAspectRatio(aspectRatio)
  const focalSuggestion = focalSuggestionFromCanvasPoint(focalPoint)

  const gridDivisions = 3
  const zoneScores: EnhancedImageAnalysis['safeTextAreas'] = []
  for (let row = 0; row < gridDivisions; row += 1) {
    for (let col = 0; col < gridDivisions; col += 1) {
      const [x0, x1] = zoneAxisBounds(col, gridDivisions, width)
      const [y0, y1] = zoneAxisBounds(row, gridDivisions, height)
      const zoneBrightness: number[] = []
      let minL = 1
      let maxL = 0
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const idx = (y * width + x) * 4
          const r = pixels[idx]!
          const g = pixels[idx + 1]!
          const b = pixels[idx + 2]!
          const a = pixels[idx + 3]!
          if (a < 180) continue
          const lb = canvasPixelBrightness(r, g, b)
          zoneBrightness.push(lb)
          minL = Math.min(minL, lb)
          maxL = Math.max(maxL, lb)
        }
      }
      if (zoneBrightness.length === 0) continue
      const zoneStd = stdDevOfBrightness(zoneBrightness)
      const uniformity = 1 - Math.min(1, Math.max(0, maxL - minL))
      const score = clamp((1 - zoneStd) * 0.5 + uniformity * 0.5, 0, 1)
      const zoneW = 100 / gridDivisions
      zoneScores.push({
        x: col * zoneW,
        y: row * zoneW,
        w: zoneW,
        h: zoneW,
        score,
      })
    }
  }
  zoneScores.sort((left, right) => right.score - left.score)
  const safeTextAreas = zoneScores.slice(0, 3)

  const brightnessMap: EnhancedImageAnalysis['brightnessMap'] = []
  for (let row = 0; row < gridDivisions; row += 1) {
    for (let col = 0; col < gridDivisions; col += 1) {
      const pctX = ((col + 0.5) / gridDivisions) * 100
      const pctY = ((row + 0.5) / gridDivisions) * 100
      const sx = Math.min(width - 1, Math.max(0, Math.floor((pctX / 100) * width)))
      const sy = Math.min(height - 1, Math.max(0, Math.floor((pctY / 100) * height)))
      const idx = (sy * width + sx) * 4
      const r = pixels[idx]!
      const g = pixels[idx + 1]!
      const b = pixels[idx + 2]!
      const score = canvasPixelBrightness(r, g, b)
      brightnessMap.push({ x: pctX, y: pctY, score: clamp(score, 0, 1) })
    }
  }

  const { palette } = quantizePalette(pixels)
  let dominantColors = palette.slice(0, 3)
  if (dominantColors.length < 3) {
    const extra = topFrequentColorsFromPixels(pixels, 6)
    dominantColors = [...new Set([...dominantColors, ...extra])].slice(0, 3)
  }
  if (dominantColors.length === 0) {
    dominantColors = FALLBACK_ANALYSIS.palette.slice(0, 3)
  }

  const subjectBox: EnhancedImageAnalysis['subjectBox'] = {
    x: clamp(focalPoint.x - 18, 0, 82),
    y: clamp(focalPoint.y - 20, 0, 80),
    w: naturalWidth > naturalHeight ? 36 : 32,
    h: naturalHeight >= naturalWidth ? 40 : 34,
  }

  return {
    focalPoint,
    subjectBox,
    safeTextAreas,
    visualMassCenter,
    brightnessMap,
    contrastZones: [],
    dominantColors,
    mood,
    cropRisk,
    imageProfile,
    detectedContrast,
    focalSuggestion,
  }
}

export async function canvasAnalyzeImageUrl(url: string): Promise<EnhancedImageAnalysis> {
  const image = await loadImage(url)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return {
      focalPoint: { x: 50, y: 50 },
      safeTextAreas: [{ x: 8, y: 8, w: 36, h: 28, score: 0.72 }],
      visualMassCenter: { x: 50, y: 50 },
      brightnessMap: [{ x: 50, y: 50, score: 0.5 }],
      contrastZones: [],
      dominantColors: FALLBACK_ANALYSIS.palette,
      mood: 'dark',
      cropRisk: 'medium',
      imageProfile: imageProfileFromAspectRatio(image.naturalWidth / Math.max(1, image.naturalHeight)),
      detectedContrast: 'medium',
      focalSuggestion: 'center',
    }
  }
  canvas.width = CANVAS_ANALYSIS_SIZE
  canvas.height = CANVAS_ANALYSIS_SIZE
  context.drawImage(image, 0, 0, CANVAS_ANALYSIS_SIZE, CANVAS_ANALYSIS_SIZE)
  const pixels = context.getImageData(0, 0, CANVAS_ANALYSIS_SIZE, CANVAS_ANALYSIS_SIZE).data
  return buildCanvasEnhancedAnalysis(
    pixels,
    CANVAS_ANALYSIS_SIZE,
    CANVAS_ANALYSIS_SIZE,
    image.naturalWidth,
    image.naturalHeight
  )
}

export async function canvasAnalyzeImage(image: ImageAsset): Promise<EnhancedImageAnalysis> {
  if (!image.url || image.url.startsWith('data:application/pdf')) {
    return {
      focalPoint: { x: 50, y: 50 },
      safeTextAreas: [{ x: 8, y: 8, w: 36, h: 28, score: 0.72 }],
      visualMassCenter: { x: 50, y: 50 },
      brightnessMap: [{ x: 50, y: 50, score: 0.5 }],
      contrastZones: [],
      dominantColors: FALLBACK_ANALYSIS.palette,
      mood: 'dark',
      cropRisk: 'medium',
      imageProfile: 'landscape',
      detectedContrast: 'medium',
      focalSuggestion: 'center',
    }
  }
  return canvasAnalyzeImageUrl(image.url)
}

function buildHeuristicImageAnalysis(image: HTMLImageElement, pixels: Uint8ClampedArray, width: number, height: number): EnhancedImageAnalysis {
  const gridSize = 6
  const cellW = Math.max(1, Math.floor(width / gridSize))
  const cellH = Math.max(1, Math.floor(height / gridSize))
  const centers = buildGridPoints(gridSize)
  const brightnessMap: EnhancedImageAnalysis['brightnessMap'] = []
  const contrastZones: EnhancedImageAnalysis['contrastZones'] = []
  const safeTextAreas: EnhancedImageAnalysis['safeTextAreas'] = []

  let minLum = 255
  let maxLum = 0
  let totalMass = 0
  let massX = 0
  let massY = 0
  let focalScore = -1
  let focalPoint = { x: 50, y: 50 }
  let subjectBox: EnhancedImageAnalysis['subjectBox']

  const gradientThreshold = 34

  for (let gy = 0; gy < gridSize; gy += 1) {
    for (let gx = 0; gx < gridSize; gx += 1) {
      let lumSum = 0
      let lumDiff = 0
      let count = 0
      const startX = gx * cellW
      const startY = gy * cellH
      const endX = gx === gridSize - 1 ? width : startX + cellW
      const endY = gy === gridSize - 1 ? height : startY + cellH

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = (y * width + x) * 4
          const r = pixels[index]
          const g = pixels[index + 1]
          const b = pixels[index + 2]
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
          const nextX = x + 1 < endX ? index + 4 : index
          const nextY = y + 1 < endY ? index + width * 4 : index
          const lumRight = 0.2126 * pixels[nextX] + 0.7152 * pixels[nextX + 1] + 0.0722 * pixels[nextX + 2]
          const lumDown = 0.2126 * pixels[nextY] + 0.7152 * pixels[nextY + 1] + 0.0722 * pixels[nextY + 2]
          const edgeEnergy = Math.abs(lum - lumRight) + Math.abs(lum - lumDown)

          lumSum += lum
          lumDiff += edgeEnergy
          count += 1
          minLum = Math.min(minLum, lum)
          maxLum = Math.max(maxLum, lum)
        }
      }

      const avgLum = count ? lumSum / count : 0
      const edgeScore = count ? lumDiff / count : 0
      const prominence = edgeScore * (1 + Math.abs(avgLum - 128) / 128)
      const centerX = centers[gx]
      const centerY = centers[gy]

      brightnessMap.push({ x: centerX, y: centerY, score: clamp(avgLum / 255, 0, 1) })

      if (edgeScore >= gradientThreshold) {
        contrastZones.push({
          x: (startX / width) * 100,
          y: (startY / height) * 100,
          w: ((endX - startX) / width) * 100,
          h: ((endY - startY) / height) * 100,
          score: clamp(edgeScore / 128, 0, 1),
        })
      }

      const safeScore = clamp((1 - edgeScore / 96) * 0.75 + (Math.abs(avgLum - 128) / 128) * 0.25, 0, 1)
      if (safeScore > 0.42) {
        safeTextAreas.push({
          x: (startX / width) * 100,
          y: (startY / height) * 100,
          w: ((endX - startX) / width) * 100,
          h: ((endY - startY) / height) * 100,
          score: safeScore,
        })
      }

      totalMass += prominence
      massX += centerX * prominence
      massY += centerY * prominence

      if (prominence > focalScore) {
        focalScore = prominence
        focalPoint = { x: centerX, y: centerY }
        subjectBox = {
          x: clamp(centerX - 18, 0, 82),
          y: clamp(centerY - 20, 0, 80),
          w: image.naturalWidth > image.naturalHeight ? 36 : 32,
          h: image.naturalHeight >= image.naturalWidth ? 40 : 34,
        }
      }
    }
  }

  const { palette, averageHex } = quantizePalette(pixels)
  const mood = luminance(averageHex) > 0.58 ? 'light' : 'dark'
  const contrastRange = maxLum - minLum
  const detectedContrast = contrastRange > 170 ? 'high' : contrastRange > 95 ? 'medium' : 'low'
  const safeAreas = safeTextAreas
    .map((area) => {
      const overlapPenalty = subjectBox ? overlapRatio(area, subjectBox) : 0
      return {
        ...area,
        score: clamp(area.score - overlapPenalty * 0.75, 0, 1),
      }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
  const imageProfile = getImageProfile(image.naturalWidth, image.naturalHeight)
  const cropRisk =
    subjectBox && (
      subjectBox.x < 10 ||
      subjectBox.x + subjectBox.w > 90 ||
      subjectBox.y < 10 ||
      subjectBox.y + subjectBox.h > 90 ||
      subjectBox.w > 42 ||
      subjectBox.h > 46
    )
      ? 'high'
      : subjectBox && (
          subjectBox.x < 18 ||
          subjectBox.x + subjectBox.w > 82 ||
          subjectBox.y < 18 ||
          subjectBox.y + subjectBox.h > 82 ||
          subjectBox.w > 36 ||
          subjectBox.h > 40
        )
        ? 'medium'
        : 'low'

  const focalSuggestion =
    focalPoint.y < 34 ? 'top' :
    focalPoint.x < 36 ? 'left' :
    focalPoint.x > 64 ? 'right' :
    'center'

  return {
    focalPoint,
    subjectBox,
    safeTextAreas: safeAreas,
    visualMassCenter: totalMass ? { x: massX / totalMass, y: massY / totalMass } : { x: 50, y: 50 },
    brightnessMap,
    contrastZones,
    dominantColors: palette.length ? palette : FALLBACK_ANALYSIS.palette,
    mood,
    cropRisk,
    imageProfile,
    detectedContrast,
    focalSuggestion,
  }
}

export function buildHeuristicImageAnalysisFromPixels(input: {
  width: number
  height: number
  pixels: Uint8ClampedArray
}): EnhancedImageAnalysis {
  const imageLike = {
    naturalWidth: input.width,
    naturalHeight: input.height,
  } as HTMLImageElement

  return buildHeuristicImageAnalysis(imageLike, input.pixels, input.width, input.height)
}

export function setAIImageAnalyzer(analyzer: ((image: ImageAsset) => Promise<EnhancedImageAnalysis>) | null) {
  aiImageAnalyzer = analyzer
}

export const registerAiImageAnalyzer = setAIImageAnalyzer

export type { EnhancedImageAnalysis, ImageAsset, ImageProfile } from './types'

export async function aiAnalyzeImage(imageAsset: ImageAsset): Promise<EnhancedImageAnalysis> {
  if (!imageAsset.url || imageAsset.url.startsWith('data:application/pdf')) {
    return {
      focalPoint: { x: 50, y: 50 },
      safeTextAreas: [{ x: 8, y: 8, w: 36, h: 28, score: 0.72 }],
      visualMassCenter: { x: 50, y: 50 },
      brightnessMap: [{ x: 50, y: 50, score: 0.5 }],
      contrastZones: [],
      dominantColors: FALLBACK_ANALYSIS.palette,
      mood: 'dark',
      cropRisk: 'medium',
      imageProfile: 'landscape',
      detectedContrast: 'medium',
      focalSuggestion: 'center',
    }
  }

  if (aiImageAnalyzer) {
    try {
      return await aiImageAnalyzer(imageAsset)
    } catch {
      // fall through to deterministic heuristics
    }
  }

  const image = await loadImage(imageAsset.url)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return {
      focalPoint: { x: 50, y: 50 },
      safeTextAreas: [{ x: 8, y: 8, w: 36, h: 28, score: 0.72 }],
      visualMassCenter: { x: 50, y: 50 },
      brightnessMap: [{ x: 50, y: 50, score: 0.5 }],
      contrastZones: [],
      dominantColors: FALLBACK_ANALYSIS.palette,
      mood: 'dark',
      cropRisk: 'medium',
      imageProfile: getImageProfile(image.naturalWidth, image.naturalHeight),
      detectedContrast: 'medium',
      focalSuggestion: 'center',
    }
  }

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = longestSide > 96 ? 96 / longestSide : 1
  canvas.width = Math.max(12, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(12, Math.round(image.naturalHeight * scale))
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  return buildHeuristicImageAnalysis(image, pixels, canvas.width, canvas.height)
}

export async function analyzeReferenceImage(url: string): Promise<ReferenceAnalysis> {
  if (!url || url.startsWith('data:application/pdf')) return FALLBACK_ANALYSIS

  const image = await loadImage(url)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return FALLBACK_ANALYSIS

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = longestSide > 72 ? 72 / longestSide : 1
  canvas.width = Math.max(8, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(8, Math.round(image.naturalHeight * scale))
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const { palette, averageHex } = quantizePalette(pixels)
  const completePalette = palette.length >= 4 ? palette : [...palette, ...FALLBACK_ANALYSIS.palette].slice(0, 4)
  const byLuma = [...completePalette].sort((left, right) => luminance(left) - luminance(right))
  const accent =
    [...completePalette].sort((left, right) => saturation(right) + luminance(right) * 0.2 - (saturation(left) + luminance(left) * 0.2))[0] ||
    FALLBACK_ANALYSIS.accent
  const mood = luminance(averageHex) > 0.58 ? 'light' : 'dark'

  return {
    palette: completePalette,
    background: [
      byLuma[0] || FALLBACK_ANALYSIS.background[0],
      byLuma[Math.floor(byLuma.length / 2)] || FALLBACK_ANALYSIS.background[1],
      byLuma[byLuma.length - 1] || FALLBACK_ANALYSIS.background[2],
    ],
    accent,
    foreground: getReadableTextColor(averageHex),
    mood,
    suggestedFamily: inferFamily(image.naturalWidth, image.naturalHeight),
  }
}

export function getContrastingText(hex: string) {
  return getReadableTextColor(hex)
}

export function evaluateCropQuality(
  imageAnalysis: EnhancedImageAnalysis | undefined,
  sceneImage: Scene['image']
) {
  if (!imageAnalysis) return 72
  let score = 84
  if (imageAnalysis.cropRisk === 'high') score -= 22
  else if (imageAnalysis.cropRisk === 'medium') score -= 10
  if (imageAnalysis.focalSuggestion === 'top' && !sceneImage.fit?.includes('YMin')) score -= 12
  if (imageAnalysis.focalSuggestion === 'left' && !sceneImage.fit?.includes('xMin')) score -= 10
  if (imageAnalysis.focalSuggestion === 'right' && !sceneImage.fit?.includes('xMax')) score -= 10
  if (!sceneImage.fit?.includes('slice')) score -= 6
  return clamp(score, 0, 100)
}

export function evaluateFootprintSuitability(
  format: FormatDefinition,
  sceneImage: Scene['image']
) {
  const coverage = ((sceneImage.w || 0) * (sceneImage.h || 0)) / 10000
  const minMap: Record<string, number> = {
    square: 0.35,
    portrait: 0.45,
    landscape: 0.28,
    'display-rectangle': 0.18,
    'display-skyscraper': 0.3,
    'display-leaderboard': 0.1,
    billboard: 0.26,
    flyer: 0.3,
    poster: 0.3,
    presentation: 0.22,
  }
  const maxMap: Record<string, number> = {
    square: 0.72,
    portrait: 0.85,
    landscape: 0.65,
    'display-rectangle': 0.52,
    'display-skyscraper': 0.72,
    'display-leaderboard': 0.38,
    billboard: 0.7,
    flyer: 0.72,
    poster: 0.72,
    presentation: 0.58,
  }
  const family =
    format.category === 'presentation'
      ? 'presentation'
      : format.key === 'print-billboard'
        ? 'billboard'
        : format.key === 'print-flyer-a5'
          ? 'flyer'
          : format.key === 'print-poster-a4'
            ? 'poster'
            : format.key === 'display-mpu' || format.key === 'display-large-rect'
              ? 'display-rectangle'
              : format.key === 'display-skyscraper' || format.key === 'display-halfpage'
                ? 'display-skyscraper'
                : format.key === 'display-leaderboard' || format.key === 'display-billboard'
                  ? 'display-leaderboard'
                  : format.family === 'wide'
                    ? 'billboard'
                    : format.family
  const minCoverage = minMap[family] || 0.22
  const maxCoverage = maxMap[family] || 0.62
  return clamp(
    Math.round(100 - Math.max(0, (minCoverage - coverage) * 180) - Math.max(0, (coverage - maxCoverage) * 150)),
    0,
    100
  )
}

export function evaluateImageRoleSuitability(
  format: FormatDefinition,
  scene: Scene,
  imageAnalysis?: EnhancedImageAnalysis
) {
  const coverage = ((scene.image.w || 0) * (scene.image.h || 0)) / 10000
  let score = 82
  if ((format.family === 'wide' || format.key === 'print-billboard') && coverage < 0.26) score -= 28
  if ((format.family === 'portrait' || format.key === 'display-halfpage') && coverage < 0.42) score -= 20
  if (format.key === 'display-leaderboard' && coverage > 0.36) score -= 20
  if (format.category === 'presentation' && (scene.image.rx || 0) > 24) score -= 12
  if (imageAnalysis?.mood === 'dark' && (scene.image.fit || '').includes('meet')) score -= 6
  return clamp(score, 0, 100)
}

export function suggestImageFixes(input: {
  format: FormatDefinition
  scene: Scene
  imageAnalysis?: EnhancedImageAnalysis
}) {
  const fixes: string[] = []
  const cropQuality = evaluateCropQuality(input.imageAnalysis, input.scene.image)
  const footprintSuitability = evaluateFootprintSuitability(input.format, input.scene.image)
  const roleSuitability = evaluateImageRoleSuitability(input.format, input.scene, input.imageAnalysis)
  if (cropQuality < 74) fixes.push('recompute-image-crop')
  if (footprintSuitability < 72) fixes.push('change-image-footprint')
  if (roleSuitability < 72) fixes.push('change-image-role')
  if ((input.scene.image.rx || 0) > 28 && input.format.category !== 'presentation') fixes.push('change-image-shape')
  return [...new Set(fixes)]
}

export function analyzeImageAsBlock(input: {
  format: FormatDefinition
  scene: Scene
  imageAnalysis?: EnhancedImageAnalysis
}): ImageBlockAnalysis {
  const cropQuality = evaluateCropQuality(input.imageAnalysis, input.scene.image)
  const focalPreservation = clamp(
    cropQuality + (input.imageAnalysis?.subjectBox ? 8 : 0) - (input.imageAnalysis?.cropRisk === 'high' ? 8 : 0),
    0,
    100
  )
  const footprintSuitability = evaluateFootprintSuitability(input.format, input.scene.image)
  const formatFit = Math.round((footprintSuitability + cropQuality) / 2)
  const visualRoleStrength = evaluateImageRoleSuitability(input.format, input.scene, input.imageAnalysis)
  const compositionIntegration = clamp(
    100 - Math.max(0, Math.abs((input.scene.image.x || 0) - (input.scene.title.x || 0)) - 42) * 2,
    0,
    100
  )
  const shapeSuitability = clamp(
    input.format.key === 'display-leaderboard' && (input.scene.image.h || 0) > 70
      ? 62
      : input.format.category === 'presentation' && (input.scene.image.rx || 0) > 24
        ? 68
        : 88,
    0,
    100
  )
  const issues: string[] = []
  if (cropQuality < 74) issues.push('image-crop-weak')
  if (footprintSuitability < 72 && ((input.scene.image.w || 0) * (input.scene.image.h || 0)) / 10000 < 0.2) issues.push('image-footprint-too-small')
  if (footprintSuitability < 72 && ((input.scene.image.w || 0) * (input.scene.image.h || 0)) / 10000 > 0.6) issues.push('image-footprint-too-large')
  if (visualRoleStrength < 72) issues.push('image-role-weak')
  if (compositionIntegration < 72) issues.push('image-detached')
  if (shapeSuitability < 72) issues.push('image-shape-unsuitable')
  if (formatFit < 74) issues.push('image-format-fit-weak')

  return {
    blockId: 'image',
    role: 'image',
    score: Math.round((cropQuality + focalPreservation + footprintSuitability + formatFit + visualRoleStrength + compositionIntegration + shapeSuitability) / 7),
    issues,
    suggestedFixes: suggestImageFixes(input),
    metrics: {
      cropQuality,
      focalPreservation,
      footprintSuitability,
      formatFit,
      visualRoleStrength,
      compositionIntegration,
      shapeSuitability,
    },
  }
}

export function getImageFitForFocalSuggestion(focal: EnhancedImageAnalysis['focalSuggestion'] | undefined) {
  if (focal === 'top') return 'xMidYMin slice'
  if (focal === 'left') return 'xMinYMid slice'
  if (focal === 'right') return 'xMaxYMid slice'
  return 'xMidYMid slice'
}

export function recomputeImageCrop(input: {
  format: FormatDefinition
  scene: Scene
  imageAnalysis?: EnhancedImageAnalysis
}): Scene {
  const next: Scene = JSON.parse(JSON.stringify(input.scene))
  const fit = getImageFitForFocalSuggestion(input.imageAnalysis?.focalSuggestion)
  // Prefer slice for ad formats; allow meet only when image is clearly an accent.
  const coverage = ((next.image.w || 0) * (next.image.h || 0)) / 10000
  const wantsMeet = input.format.category === 'presentation' && coverage < 0.24
  next.image.fit = wantsMeet ? fit.replace('slice', 'meet') : fit
  return next
}

export function recomputeImageFootprint(input: {
  format: FormatDefinition
  scene: Scene
  imageAnalysis?: EnhancedImageAnalysis
}): Scene {
  const next: Scene = JSON.parse(JSON.stringify(input.scene))
  const ruleSet = getFormatRuleSet(input.format)
  const safe = ruleSet.safeArea
  const safeW = (safe.w / input.format.width) * 100
  const safeH = (safe.h / input.format.height) * 100
  const minCoverage = ruleSet.composition.minImageCoverage
  const maxCoverage = ruleSet.composition.maxImageCoverage

  const currentW = next.image.w || 0
  const currentH = next.image.h || 0
  const currentCoverage = (currentW * currentH) / 10000
  if (currentCoverage <= 0) return next

  let targetCoverage = currentCoverage
  if (currentCoverage < minCoverage) targetCoverage = minCoverage
  if (currentCoverage > maxCoverage) targetCoverage = maxCoverage
  if (Math.abs(targetCoverage - currentCoverage) < 0.01) return next

  const scale = Math.sqrt(targetCoverage / currentCoverage)
  const minW = ruleSet.elements.image.minW ? (ruleSet.elements.image.minW / input.format.width) * 100 : 6
  const minH = ruleSet.elements.image.minH ? (ruleSet.elements.image.minH / input.format.height) * 100 : 6
  next.image.w = clamp(currentW * scale, minW, safeW)
  next.image.h = clamp(currentH * scale, minH, safeH)
  // Keep inside safe area (percent-space).
  const safeX = (safe.x / input.format.width) * 100
  const safeY = (safe.y / input.format.height) * 100
  next.image.x = clamp(next.image.x || safeX, safeX, safeX + safeW - (next.image.w || 0))
  next.image.y = clamp(next.image.y || safeY, safeY, safeY + safeH - (next.image.h || 0))
  return next
}

export function changeImageAnchor(input: {
  format: FormatDefinition
  scene: Scene
  imageAnalysis?: EnhancedImageAnalysis
  anchor?: 'top-left' | 'top-right' | 'center'
}): Scene {
  const next: Scene = JSON.parse(JSON.stringify(input.scene))
  const ruleSet = getFormatRuleSet(input.format)
  const safe = ruleSet.safeArea
  const safeX = (safe.x / input.format.width) * 100
  const safeY = (safe.y / input.format.height) * 100
  const safeW = (safe.w / input.format.width) * 100
  const safeH = (safe.h / input.format.height) * 100
  const w = next.image.w || 0
  const h = next.image.h || 0
  const anchor = input.anchor || (input.imageAnalysis?.focalSuggestion === 'left' ? 'top-left' : input.imageAnalysis?.focalSuggestion === 'right' ? 'top-right' : 'center')

  next.image.x =
    anchor === 'center'
      ? safeX + (safeW - w) / 2
      : anchor === 'top-right'
        ? safeX + safeW - w
        : safeX
  next.image.y = anchor === 'center' ? safeY + (safeH - h) / 2 : safeY
  next.image.x = clamp(next.image.x, safeX, safeX + safeW - w)
  next.image.y = clamp(next.image.y, safeY, safeY + safeH - h)
  return next
}

export function changeImageShape(input: { format: FormatDefinition; scene: Scene; mode?: 'sharper' | 'rounder' }): Scene {
  const next: Scene = JSON.parse(JSON.stringify(input.scene))
  const base =
    input.format.category === 'presentation'
      ? 18
      : input.format.key === 'display-leaderboard'
        ? 14
        : input.format.family === 'wide'
          ? 22
          : input.format.family === 'skyscraper'
            ? 18
            : 28
  next.image.rx = input.mode === 'sharper' ? clamp(base - 10, 6, base) : input.mode === 'rounder' ? clamp(base + 8, base, 32) : base
  return next
}
