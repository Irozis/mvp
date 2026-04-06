import { inflateSync } from 'node:zlib'
import { FORMAT_MAP } from '../../src/lib/presets'
import { getCompositionModel } from '../../src/lib/formatCompositionModels'
import { getFormatRuleSet } from '../../src/lib/formatRules'
import { getOverlaySafetyPolicy } from '../../src/lib/overlayPolicies'

export type BucketName = 'core' | 'stress' | 'reject'

export type AnnotationClassification = 'clean' | 'ambiguous' | 'incomplete'

type Rect = {
  x: number
  y: number
  w: number
  h: number
}

type ColorKey = 'red' | 'green' | 'cyan' | 'purple' | 'yellow'

export type CalibrationManifestEntry = {
  id: string
  filename: string
  bucket: BucketName
  sourceBucket?: BucketName
  width: number
  height: number
  notes?: string
  classification?: AnnotationClassification
  classificationSource?: 'extracted' | 'manual-triage'
}

export type ExtractedAnnotation = {
  id: string
  bucket: BucketName
  sourceBucket?: BucketName
  filename: string
  imageSize: { w: number; h: number }
  heroSubjectRect: Rect | null
  headlineRects: Rect[]
  subtitleRects: Rect[]
  logoRect: Rect | null
  badgeRect: Rect | null
  flags: string[]
  classification?: AnnotationClassification
  classificationSource?: 'extracted' | 'manual-triage'
}

export type CaseMetrics = {
  id: string
  filename: string
  bucket: BucketName
  width: number
  height: number
  flags: string[]
  headlineOverlapRatio: number | null
  subtitleOverlapRatio: number | null
  logoOverlapRatio: number | null
  badgeOverlapRatio: number | null
  safeTextScore: number | null
  safeCoverage: number | null
  safeAreaCoverage: number | null
}

export type MetricSummary = {
  count: number
  valid_count: number
  invalid_count: number
  mean: number | null
  median: number | null
  p90: number | null
  p95: number | null
  max: number | null
}

export type ThresholdRecord = {
  metric: string
  currentPolicy: number | null
  measured: {
    source: string
    p10?: number | null
    p90?: number | null
    p95?: number | null
    max?: number | null
  } | null
  candidate: number | null
  status: 'measured' | 'candidate' | 'insufficient-data'
  reason: string
}

type DecodedPng = {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

type Component = Rect & {
  pixels: number
}

const SOCIAL_SQUARE = FORMAT_MAP['social-square']
const SOCIAL_SQUARE_RULESET = getFormatRuleSet(SOCIAL_SQUARE)
const SOCIAL_SQUARE_MODEL = getCompositionModel(SOCIAL_SQUARE, 'square-hero-overlay')
const SOCIAL_SQUARE_POLICY = getOverlaySafetyPolicy(SOCIAL_SQUARE, SOCIAL_SQUARE_MODEL)

const MANUAL_CLASSIFICATION_OVERRIDES: Partial<Record<string, AnnotationClassification>> = {
  'Group 4': 'clean',
  'Group 5': 'ambiguous',
  'Group 6': 'clean',
  'Group 7': 'clean',
  'Group 10': 'clean',
  'Group 18': 'ambiguous',
  'Group 19': 'clean',
  'Group 20': 'clean',
  'Group 21': 'clean',
  'Group 23': 'clean',
  'Group 24': 'clean',
}

const MANUAL_BUCKET_OVERRIDES: Partial<Record<string, BucketName>> = {
  'Group 6': 'stress',
  'Group 20': 'stress',
}

const COLOR_CONFIG: Record<
  ColorKey,
  {
    match: (r: number, g: number, b: number, a: number) => boolean
    minPixels: number
    mergeGap: number
    singleton: boolean
  }
> = {
  red: {
    match: (r, g, b, a) => a > 100 && r >= 180 && g <= 110 && b <= 110 && r - Math.max(g, b) >= 70,
    minPixels: 18,
    mergeGap: 6,
    singleton: true,
  },
  green: {
    match: (r, g, b, a) => a > 100 && g >= 140 && r <= 140 && b <= 140 && g - Math.max(r, b) >= 30,
    minPixels: 12,
    mergeGap: 6,
    singleton: false,
  },
  cyan: {
    match: (r, g, b, a) => a > 100 && g >= 140 && b >= 140 && r <= 140,
    minPixels: 12,
    mergeGap: 6,
    singleton: false,
  },
  purple: {
    match: (r, g, b, a) => a > 100 && r >= 110 && b >= 110 && g <= 120,
    minPixels: 12,
    mergeGap: 4,
    singleton: true,
  },
  yellow: {
    match: (r, g, b, a) => a > 100 && r >= 180 && g >= 180 && b <= 130,
    minPixels: 12,
    mergeGap: 4,
    singleton: true,
  },
}

const METRIC_KEYS: Array<keyof Omit<CaseMetrics, 'id' | 'filename' | 'bucket' | 'width' | 'height' | 'flags'>> = [
  'headlineOverlapRatio',
  'subtitleOverlapRatio',
  'logoOverlapRatio',
  'badgeOverlapRatio',
  'safeTextScore',
  'safeCoverage',
  'safeAreaCoverage',
]

function rectArea(rect: Rect) {
  return Math.max(rect.w, 0) * Math.max(rect.h, 0)
}

function intersects(left: Rect, right: Rect) {
  return !(left.x + left.w <= right.x || right.x + right.w <= left.x || left.y + left.h <= right.y || right.y + right.h <= left.y)
}

function intersectionArea(left: Rect, right: Rect) {
  const overlapX = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
  const overlapY = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y))
  return overlapX * overlapY
}

function round(value: number, precision = 4) {
  const scale = 10 ** precision
  return Math.round(value * scale) / scale
}

function roundUpTo(value: number, step = 0.01) {
  return Math.ceil(value / step) * step
}

function roundDownTo(value: number, step = 0.01) {
  return Math.floor(value / step) * step
}

function quantile(values: number[], q: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function summarizeMetric(values: Array<number | null>): MetricSummary {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const mean = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
  return {
    count: values.length,
    valid_count: valid.length,
    invalid_count: values.length - valid.length,
    mean: mean === null ? null : round(mean),
    median: quantile(valid, 0.5) === null ? null : round(quantile(valid, 0.5)!),
    p90: quantile(valid, 0.9) === null ? null : round(quantile(valid, 0.9)!),
    p95: quantile(valid, 0.95) === null ? null : round(quantile(valid, 0.95)!),
    max: valid.length ? round(Math.max(...valid)) : null,
  }
}

function mergeRects(rects: Rect[]) {
  if (!rects.length) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

function componentDistance(left: Rect, right: Rect) {
  const dx = Math.max(0, Math.max(left.x - (right.x + right.w), right.x - (left.x + left.w)))
  const dy = Math.max(0, Math.max(left.y - (right.y + right.h), right.y - (left.y + left.h)))
  return Math.max(dx, dy)
}

function mergeNearbyComponents(components: Component[], gap: number) {
  const queue = [...components]
  const merged: Component[] = []

  while (queue.length) {
    let current = queue.shift()!
    let changed = true

    while (changed) {
      changed = false
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const candidate = queue[index]
        const shouldMerge =
          componentDistance(current, candidate) <= gap ||
          intersects(
            { x: current.x - gap, y: current.y - gap, w: current.w + gap * 2, h: current.h + gap * 2 },
            candidate
          )
        if (!shouldMerge) continue
        queue.splice(index, 1)
        const mergedRect = mergeRects([current, candidate])!
        current = {
          ...mergedRect,
          pixels: current.pixels + candidate.pixels,
        }
        changed = true
      }
    }

    merged.push(current)
  }

  return merged.sort((a, b) => a.y - b.y || a.x - b.x)
}

function pngPaethPredictor(left: number, up: number, upLeft: number) {
  const base = left + up - upLeft
  const leftDelta = Math.abs(base - left)
  const upDelta = Math.abs(base - up)
  const upLeftDelta = Math.abs(base - upLeft)
  if (leftDelta <= upDelta && leftDelta <= upLeftDelta) return left
  if (upDelta <= upLeftDelta) return up
  return upLeft
}

export function parsePng(buffer: Buffer): DecodedPng {
  const signature = buffer.subarray(0, 8)
  const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!signature.equals(expected)) {
    throw new Error('Unsupported file: not a PNG.')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 8
  let colorType = 6
  let interlace = 0
  const idatParts: Buffer[] = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    offset += 4
    const type = buffer.subarray(offset, offset + 4).toString('ascii')
    offset += 4
    const data = buffer.subarray(offset, offset + length)
    offset += length
    offset += 4

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idatParts.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (!width || !height) throw new Error('PNG is missing IHDR dimensions.')
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}.`)
  if (interlace !== 0) throw new Error('Interlaced PNG is not supported by this calibration runner.')

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0
  if (!channels) throw new Error(`Unsupported PNG color type: ${colorType}.`)

  const inflated = inflateSync(Buffer.concat(idatParts))
  const stride = width * channels
  const raw = Buffer.alloc(height * stride)
  let srcOffset = 0
  let dstOffset = 0

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[srcOffset]
    srcOffset += 1
    for (let x = 0; x < stride; x += 1) {
      const byte = inflated[srcOffset]
      srcOffset += 1
      const left = x >= channels ? raw[dstOffset + x - channels] : 0
      const up = y > 0 ? raw[dstOffset + x - stride] : 0
      const upLeft = y > 0 && x >= channels ? raw[dstOffset + x - stride - channels] : 0

      let value = byte
      if (filter === 1) value = (byte + left) & 0xff
      if (filter === 2) value = (byte + up) & 0xff
      if (filter === 3) value = (byte + Math.floor((left + up) / 2)) & 0xff
      if (filter === 4) value = (byte + pngPaethPredictor(left, up, upLeft)) & 0xff
      raw[dstOffset + x] = value
    }
    dstOffset += stride
  }

  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0, out = 0; index < raw.length; index += channels, out += 4) {
    if (colorType === 6) {
      pixels[out] = raw[index]
      pixels[out + 1] = raw[index + 1]
      pixels[out + 2] = raw[index + 2]
      pixels[out + 3] = raw[index + 3]
    } else if (colorType === 2) {
      pixels[out] = raw[index]
      pixels[out + 1] = raw[index + 1]
      pixels[out + 2] = raw[index + 2]
      pixels[out + 3] = 255
    } else if (colorType === 0) {
      pixels[out] = raw[index]
      pixels[out + 1] = raw[index]
      pixels[out + 2] = raw[index]
      pixels[out + 3] = 255
    } else {
      pixels[out] = raw[index]
      pixels[out + 1] = raw[index]
      pixels[out + 2] = raw[index]
      pixels[out + 3] = raw[index + 1]
    }
  }

  return { width, height, pixels }
}

function buildColorMask(image: DecodedPng, key: ColorKey) {
  const config = COLOR_CONFIG[key]
  const mask = new Uint8Array(image.width * image.height)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4
      if (config.match(image.pixels[index], image.pixels[index + 1], image.pixels[index + 2], image.pixels[index + 3])) {
        mask[y * image.width + x] = 1
      }
    }
  }
  return mask
}

function detectComponents(image: DecodedPng, mask: Uint8Array): Component[] {
  const visited = new Uint8Array(mask.length)
  const components: Component[] = []
  const neighbors = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ]

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue
    const queue = [index]
    visited[index] = 1
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = -1
    let maxY = -1
    let pixels = 0

    while (queue.length) {
      const current = queue.pop()!
      const x = current % image.width
      const y = Math.floor(current / image.width)
      pixels += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      for (const [dx, dy] of neighbors) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue
        const next = ny * image.width + nx
        if (!mask[next] || visited[next]) continue
        visited[next] = 1
        queue.push(next)
      }
    }

    components.push({
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      pixels,
    })
  }

  return components
}

function cleanAnnotationPixels(image: DecodedPng) {
  const cleaned = new Uint8ClampedArray(image.pixels)
  const annotationMask = new Uint8Array(image.width * image.height)

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4
      if (
        COLOR_CONFIG.red.match(cleaned[index], cleaned[index + 1], cleaned[index + 2], cleaned[index + 3]) ||
        COLOR_CONFIG.green.match(cleaned[index], cleaned[index + 1], cleaned[index + 2], cleaned[index + 3]) ||
        COLOR_CONFIG.cyan.match(cleaned[index], cleaned[index + 1], cleaned[index + 2], cleaned[index + 3]) ||
        COLOR_CONFIG.purple.match(cleaned[index], cleaned[index + 1], cleaned[index + 2], cleaned[index + 3]) ||
        COLOR_CONFIG.yellow.match(cleaned[index], cleaned[index + 1], cleaned[index + 2], cleaned[index + 3])
      ) {
        annotationMask[y * image.width + x] = 1
      }
    }
  }

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const flatIndex = y * image.width + x
      if (!annotationMask[flatIndex]) continue

      let samples = 0
      let sumR = 0
      let sumG = 0
      let sumB = 0
      let sumA = 0

      for (let radius = 1; radius <= 6 && !samples; radius += 1) {
        for (let ny = Math.max(0, y - radius); ny <= Math.min(image.height - 1, y + radius); ny += 1) {
          for (let nx = Math.max(0, x - radius); nx <= Math.min(image.width - 1, x + radius); nx += 1) {
            const candidateFlat = ny * image.width + nx
            if (annotationMask[candidateFlat]) continue
            const sampleIndex = candidateFlat * 4
            sumR += cleaned[sampleIndex]
            sumG += cleaned[sampleIndex + 1]
            sumB += cleaned[sampleIndex + 2]
            sumA += cleaned[sampleIndex + 3]
            samples += 1
          }
        }
      }

      if (!samples) continue
      const pixelIndex = flatIndex * 4
      cleaned[pixelIndex] = Math.round(sumR / samples)
      cleaned[pixelIndex + 1] = Math.round(sumG / samples)
      cleaned[pixelIndex + 2] = Math.round(sumB / samples)
      cleaned[pixelIndex + 3] = Math.round(sumA / samples)
    }
  }

  return cleaned
}

function scrubTextRectsForBackgroundSampling(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  textRects: Rect[]
) {
  const cleaned = new Uint8ClampedArray(pixels)

  for (const rect of textRects) {
    const startX = Math.max(0, Math.floor(rect.x))
    const startY = Math.max(0, Math.floor(rect.y))
    const endX = Math.min(width, Math.ceil(rect.x + rect.w))
    const endY = Math.min(height, Math.ceil(rect.y + rect.h))
    let samples = 0
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let sumA = 0

    for (let radius = 2; radius <= 10 && !samples; radius += 2) {
      for (let y = Math.max(0, startY - radius); y < Math.min(height, endY + radius); y += 1) {
        for (let x = Math.max(0, startX - radius); x < Math.min(width, endX + radius); x += 1) {
          const isInside = x >= startX && x < endX && y >= startY && y < endY
          const isRing =
            x < startX || x >= endX || y < startY || y >= endY
          if (!isRing || isInside) continue
          const index = (y * width + x) * 4
          sumR += cleaned[index]
          sumG += cleaned[index + 1]
          sumB += cleaned[index + 2]
          sumA += cleaned[index + 3]
          samples += 1
        }
      }
    }

    if (!samples) continue
    const fillR = Math.round(sumR / samples)
    const fillG = Math.round(sumG / samples)
    const fillB = Math.round(sumB / samples)
    const fillA = Math.round(sumA / samples)

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const index = (y * width + x) * 4
        cleaned[index] = fillR
        cleaned[index + 1] = fillG
        cleaned[index + 2] = fillB
        cleaned[index + 3] = fillA
      }
    }
  }

  return cleaned
}

export function extractAnnotationFromOverlay(
  image: DecodedPng,
  entry: Pick<CalibrationManifestEntry, 'id' | 'bucket' | 'filename'>
): ExtractedAnnotation {
  const flags = new Set<string>()

  const buildRects = (key: ColorKey) => {
    const config = COLOR_CONFIG[key]
    const components = detectComponents(image, buildColorMask(image, key))
    const significant = components.filter((component) => component.pixels >= config.minPixels && component.w >= 3 && component.h >= 3)
    const merged = mergeNearbyComponents(significant, config.mergeGap)
    if (config.singleton && merged.length > 1) flags.add('ambiguous')
    if (!config.singleton && merged.length > 6) flags.add('ambiguous')
    return merged.map(({ x, y, w, h }) => ({ x, y, w, h }))
  }

  const heroSubjectRects = buildRects('red')
  const headlineRects = buildRects('green')
  const subtitleRects = buildRects('cyan')
  const logoRects = buildRects('purple')
  const badgeRects = buildRects('yellow')

  if (!heroSubjectRects.length) flags.add('incomplete')

  const classification = getEffectiveAnnotationClassification({
    id: entry.id,
    bucket: entry.bucket,
    filename: entry.filename,
    imageSize: { w: image.width, h: image.height },
    heroSubjectRect: heroSubjectRects[0] || null,
    headlineRects,
    subtitleRects,
    logoRect: logoRects[0] || null,
    badgeRect: badgeRects[0] || null,
    flags: [...flags],
  })
  const classificationSource = MANUAL_CLASSIFICATION_OVERRIDES[entry.id] ? 'manual-triage' : 'extracted'
  const effectiveBucket = getEffectiveBucket({ id: entry.id, bucket: entry.bucket })

  return {
    id: entry.id,
    bucket: effectiveBucket,
    sourceBucket: entry.bucket,
    filename: entry.filename,
    imageSize: { w: image.width, h: image.height },
    heroSubjectRect: heroSubjectRects[0] || null,
    headlineRects,
    subtitleRects,
    logoRect: logoRects[0] || null,
    badgeRect: badgeRects[0] || null,
    flags: [...flags],
    classification,
    classificationSource,
  }
}

export function getExtractedAnnotationClassification(annotation: Pick<ExtractedAnnotation, 'flags'>): AnnotationClassification {
  if (annotation.flags.includes('incomplete')) return 'incomplete'
  if (annotation.flags.includes('ambiguous')) return 'ambiguous'
  return 'clean'
}

export function getEffectiveAnnotationClassification(
  annotation: Pick<ExtractedAnnotation, 'id' | 'flags'>
): AnnotationClassification {
  return MANUAL_CLASSIFICATION_OVERRIDES[annotation.id] ?? getExtractedAnnotationClassification(annotation)
}

export function getAnnotationClassificationSource(annotation: Pick<ExtractedAnnotation, 'id'>) {
  return MANUAL_CLASSIFICATION_OVERRIDES[annotation.id] ? 'manual-triage' : 'extracted'
}

export function getEffectiveBucket<T extends Pick<ExtractedAnnotation, 'id' | 'bucket'>>(annotation: T): BucketName {
  return MANUAL_BUCKET_OVERRIDES[annotation.id] ?? annotation.bucket
}

function toPixelRect(area: Rect, width: number, height: number): Rect {
  return {
    x: (area.x / 100) * width,
    y: (area.y / 100) * height,
    w: (area.w / 100) * width,
    h: (area.h / 100) * height,
  }
}

export function computeSafeMetrics(
  textRects: Rect[],
  safeAreas: Array<Rect & { score: number }>,
  safeArea: Rect,
  safeTextScoreMin: number
) {
  const totalArea = textRects.reduce((sum, rect) => sum + rectArea(rect), 0)
  if (!totalArea) {
    return {
      safeTextScore: null,
      safeCoverage: null,
      safeAreaCoverage: null,
    }
  }

  let scoreArea = 0
  let coverageArea = 0
  let safeAreaCovered = 0

  for (const rect of textRects) {
    safeAreaCovered += intersectionArea(rect, safeArea)
    for (const area of safeAreas) {
      const overlap = intersectionArea(rect, area)
      if (!overlap) continue
      scoreArea += overlap * area.score
      if (area.score >= safeTextScoreMin) {
        coverageArea += overlap
      }
    }
  }

  return {
    safeTextScore: round(scoreArea / totalArea),
    safeCoverage: round(coverageArea / totalArea),
    safeAreaCoverage: round(safeAreaCovered / totalArea),
  }
}

const annotationToImagePixels = new Map<string, Uint8ClampedArray>()
const recomputeCoverageRegistry = new Map<
  string,
  {
    samples: Array<{ area: number; score: number }>
    safeAreaCoverage: number | null
  }
>()

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function buildTextSafetySamples(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  textRects: Rect[]
) {
  const samples: Array<{ area: number; score: number }> = []
  let safeAreaCovered = 0
  let totalArea = 0

  for (const rect of textRects) {
    const clampedRect = {
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
      w: Math.max(0, Math.min(width - Math.floor(rect.x), Math.ceil(rect.w))),
      h: Math.max(0, Math.min(height - Math.floor(rect.y), Math.ceil(rect.h))),
    }
    const cell = Math.max(8, Math.min(18, Math.round(Math.min(clampedRect.w, clampedRect.h, 48) / 3)))
    totalArea += rectArea(clampedRect)
    safeAreaCovered += intersectionArea(clampedRect, SOCIAL_SQUARE_RULESET.safeArea)

    for (let startY = clampedRect.y; startY < clampedRect.y + clampedRect.h; startY += cell) {
      for (let startX = clampedRect.x; startX < clampedRect.x + clampedRect.w; startX += cell) {
        const endX = Math.min(clampedRect.x + clampedRect.w, startX + cell)
        const endY = Math.min(clampedRect.y + clampedRect.h, startY + cell)
        const area = Math.max(1, (endX - startX) * (endY - startY))
        let lumSum = 0
        let edgeSum = 0

        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            const index = (y * width + x) * 4
            const lum = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]
            const rightIndex = x + 1 < endX ? index + 4 : index
            const downIndex = y + 1 < endY ? index + width * 4 : index
            const lumRight = 0.2126 * pixels[rightIndex] + 0.7152 * pixels[rightIndex + 1] + 0.0722 * pixels[rightIndex + 2]
            const lumDown = 0.2126 * pixels[downIndex] + 0.7152 * pixels[downIndex + 1] + 0.0722 * pixels[downIndex + 2]

            lumSum += lum
            edgeSum += Math.abs(lum - lumRight) + Math.abs(lum - lumDown)
          }
        }

        const avgLum = lumSum / area
        const avgEdge = edgeSum / area
        const score = clamp((1 - avgEdge / 96) * 0.75 + (Math.abs(avgLum - 128) / 128) * 0.25, 0, 1)
        samples.push({ area, score })
      }
    }
  }

  return {
    samples,
    safeAreaCoverage: totalArea ? round(safeAreaCovered / totalArea) : null,
  }
}

function computeSafeMetricsFromSamples(
  samples: Array<{ area: number; score: number }>,
  safeAreaCoverage: number | null,
  safeTextScoreMin: number
) {
  const totalArea = samples.reduce((sum, sample) => sum + sample.area, 0)
  if (!totalArea) {
    return {
      safeTextScore: null,
      safeCoverage: null,
      safeAreaCoverage,
    }
  }

  const weightedScore = samples.reduce((sum, sample) => sum + sample.area * sample.score, 0) / totalArea
  const weightedCoverage =
    samples.filter((sample) => sample.score >= safeTextScoreMin).reduce((sum, sample) => sum + sample.area, 0) / totalArea

  return {
    safeTextScore: round(weightedScore),
    safeCoverage: round(weightedCoverage),
    safeAreaCoverage,
  }
}

export function registerImagePixels(id: string, pixels: Uint8ClampedArray) {
  annotationToImagePixels.set(id, pixels)
}

export function registerCoverageInputs(annotation: ExtractedAnnotation, imagePixels: Uint8ClampedArray) {
  const annotationCleaned = cleanAnnotationPixels({
    width: annotation.imageSize.w,
    height: annotation.imageSize.h,
    pixels: imagePixels,
  } as DecodedPng)
  const samplingPixels = scrubTextRectsForBackgroundSampling(
    annotationCleaned,
    annotation.imageSize.w,
    annotation.imageSize.h,
    [...annotation.headlineRects, ...annotation.subtitleRects]
  )
  const sampled = buildTextSafetySamples(
    samplingPixels,
    annotation.imageSize.w,
    annotation.imageSize.h,
    [...annotation.headlineRects, ...annotation.subtitleRects]
  )
  recomputeCoverageRegistry.set(annotation.id, {
    samples: sampled.samples,
    safeAreaCoverage: sampled.safeAreaCoverage,
  })
}

function recalculateCoverageForMetric(id: string, safeTextScoreMin: number) {
  const payload = recomputeCoverageRegistry.get(id)
  if (!payload) return null
  return computeSafeMetricsFromSamples(payload.samples, payload.safeAreaCoverage, safeTextScoreMin).safeCoverage
}

export function computeCaseMetrics(annotation: ExtractedAnnotation): CaseMetrics {
  const originalPixels = annotationToImagePixels.get(annotation.id)
  if (!originalPixels) {
    throw new Error(`Missing registered image pixels for ${annotation.id}.`)
  }

  const cleanedPixels = cleanAnnotationPixels({
    width: annotation.imageSize.w,
    height: annotation.imageSize.h,
    pixels: originalPixels,
  } as DecodedPng)
  const samplingPixels = scrubTextRectsForBackgroundSampling(
    cleanedPixels,
    annotation.imageSize.w,
    annotation.imageSize.h,
    [...annotation.headlineRects, ...annotation.subtitleRects]
  )

  const imageSlot = SOCIAL_SQUARE_MODEL?.slots.find((slot) => slot.block === 'image')
  const imageZone = imageSlot ? SOCIAL_SQUARE_MODEL?.zones.find((zone) => zone.id === imageSlot.zoneId) : null
  const imageRect = imageZone ? imageZone.rect : { x: 72, y: 96, w: 936, h: 748 }
  const imageArea = Math.max(rectArea(imageRect), 1)
  const headlineRect = mergeRects(annotation.headlineRects)
  const subtitleRect = mergeRects(annotation.subtitleRects)
  const sampled = buildTextSafetySamples(
    samplingPixels,
    annotation.imageSize.w,
    annotation.imageSize.h,
    [...annotation.headlineRects, ...annotation.subtitleRects]
  )
  const safeMetrics = computeSafeMetricsFromSamples(
    sampled.samples,
    sampled.safeAreaCoverage,
    SOCIAL_SQUARE_POLICY.safeTextScoreMin
  )

  return {
    id: annotation.id,
    filename: annotation.filename,
    bucket: annotation.bucket,
    width: annotation.imageSize.w,
    height: annotation.imageSize.h,
    flags: annotation.flags,
    headlineOverlapRatio: headlineRect ? round(intersectionArea(headlineRect, imageRect) / imageArea) : null,
    subtitleOverlapRatio: subtitleRect ? round(intersectionArea(subtitleRect, imageRect) / imageArea) : null,
    logoOverlapRatio: annotation.logoRect ? round(intersectionArea(annotation.logoRect, imageRect) / imageArea) : null,
    badgeOverlapRatio: annotation.badgeRect ? round(intersectionArea(annotation.badgeRect, imageRect) / imageArea) : null,
    safeTextScore: safeMetrics.safeTextScore,
    safeCoverage: safeMetrics.safeCoverage,
    safeAreaCoverage: safeMetrics.safeAreaCoverage,
  }
}

export function getBucketSummary(metrics: CaseMetrics[]) {
  return Object.fromEntries(METRIC_KEYS.map((key) => [key, summarizeMetric(metrics.map((row) => row[key]))])) as Record<
    (typeof METRIC_KEYS)[number],
    MetricSummary
  >
}

export function buildThresholdCandidates(coreMetrics: CaseMetrics[]) {
  const overlapMetrics: Array<{ key: keyof CaseMetrics; policyValue: number | undefined; candidateKey: string }> = [
    { key: 'headlineOverlapRatio', policyValue: SOCIAL_SQUARE_POLICY.maxOverlapByKind.headline, candidateKey: 'headline maxOverlapRatio' },
    { key: 'subtitleOverlapRatio', policyValue: SOCIAL_SQUARE_POLICY.maxOverlapByKind.subtitle, candidateKey: 'subtitle maxOverlapRatio' },
    { key: 'logoOverlapRatio', policyValue: SOCIAL_SQUARE_POLICY.maxOverlapByKind.logo, candidateKey: 'logo maxOverlapRatio' },
    { key: 'badgeOverlapRatio', policyValue: SOCIAL_SQUARE_POLICY.maxOverlapByKind.badge, candidateKey: 'badge maxOverlapRatio' },
  ]

  const records: ThresholdRecord[] = []

  for (const metric of overlapMetrics) {
    const values = coreMetrics.map((row) => row[metric.key] as number | null)
    const valid = values.filter((value): value is number => typeof value === 'number')
    const weakSignal =
      (metric.key === 'logoOverlapRatio' || metric.key === 'badgeOverlapRatio') &&
      valid.length > 0 &&
      Math.max(...valid) <= 0.005
    if (valid.length < 4 || weakSignal) {
      records.push({
        metric: metric.candidateKey,
        currentPolicy: metric.policyValue ?? null,
        measured: null,
        candidate: null,
        status: 'insufficient-data',
        reason: weakSignal
          ? 'insufficient signal in core bucket (too few meaningful non-zero overlaps)'
          : 'insufficient data in core bucket (need at least 4 valid observations)',
      })
      continue
    }
    const p90 = quantile(valid, 0.9)
    const p95 = quantile(valid, 0.95)
    const max = Math.max(...valid)
    const candidate = round(roundUpTo(Math.min(max + 0.01, Math.max(p95 || 0, (p90 || 0) + 0.01)), 0.01), 2)
    records.push({
      metric: metric.candidateKey,
      currentPolicy: metric.policyValue ?? null,
      measured: {
        source: 'core',
        p90: p90 === null ? null : round(p90),
        p95: p95 === null ? null : round(p95),
        max: round(max),
      },
      candidate,
      status: 'candidate',
      reason: 'core upper-tail heuristic: max(p95, p90 + 0.01), rounded up to 0.01 and capped near observed max',
    })
  }

  const safeTextValues = coreMetrics.map((row) => row.safeTextScore)
  const validSafeText = safeTextValues.filter((value): value is number => typeof value === 'number')
  if (validSafeText.length >= 3) {
    const p10 = quantile(validSafeText, 0.1)
    records.push({
      metric: 'safeTextScoreMin',
      currentPolicy: SOCIAL_SQUARE_POLICY.safeTextScoreMin,
      measured: { source: 'core', p10: p10 === null ? null : round(p10) },
      candidate: p10 === null ? null : round(roundDownTo(Math.max(0, p10 - 0.01), 0.01), 2),
      status: 'candidate',
      reason: 'core lower-tail heuristic: p10 - 0.01, rounded down to 0.01',
    })
  } else {
    records.push({
      metric: 'safeTextScoreMin',
      currentPolicy: SOCIAL_SQUARE_POLICY.safeTextScoreMin,
      measured: null,
      candidate: null,
      status: 'insufficient-data',
      reason: 'insufficient data in core bucket',
    })
  }

  const safeTextCandidate = records.find((record) => record.metric === 'safeTextScoreMin')?.candidate ?? SOCIAL_SQUARE_POLICY.safeTextScoreMin
  const recomputedCoreCoverage = coreMetrics.map((metric) => recalculateCoverageForMetric(metric.id, safeTextCandidate))
  const validCoverage = recomputedCoreCoverage.filter((value): value is number => typeof value === 'number')
  if (validCoverage.length >= 3) {
    const p10 = quantile(validCoverage, 0.1)
    records.push({
      metric: 'safeCoverageMin',
      currentPolicy: SOCIAL_SQUARE_POLICY.safeCoverageMin,
      measured: { source: 'core', p10: p10 === null ? null : round(p10) },
      candidate: p10 === null ? null : round(roundDownTo(Math.max(0, p10 - 0.02), 0.01), 2),
      status: 'candidate',
      reason: 'core lower-tail heuristic after recomputing coverage at candidate safeTextScoreMin: p10 - 0.02',
    })
  } else {
    records.push({
      metric: 'safeCoverageMin',
      currentPolicy: SOCIAL_SQUARE_POLICY.safeCoverageMin,
      measured: null,
      candidate: null,
      status: 'insufficient-data',
      reason: 'insufficient data in core bucket',
    })
  }

  const safeAreaValues = coreMetrics.map((row) => row.safeAreaCoverage)
  const validSafeArea = safeAreaValues.filter((value): value is number => typeof value === 'number')
  if (validSafeArea.length >= 3) {
    const p10 = quantile(validSafeArea, 0.1)
    records.push({
      metric: 'safeAreaCoverageMin',
      currentPolicy: SOCIAL_SQUARE_POLICY.safeAreaCoverageMin,
      measured: { source: 'core', p10: p10 === null ? null : round(p10) },
      candidate: p10 === null ? null : round(roundDownTo(Math.max(0, p10 - 0.02), 0.01), 2),
      status: 'candidate',
      reason: 'core lower-tail heuristic: p10 - 0.02, rounded down to 0.01',
    })
  } else {
    records.push({
      metric: 'safeAreaCoverageMin',
      currentPolicy: SOCIAL_SQUARE_POLICY.safeAreaCoverageMin,
      measured: null,
      candidate: null,
      status: 'insufficient-data',
      reason: 'insufficient data in core bucket',
    })
  }

  return records
}

export function evaluateThresholdsOnCases(metrics: CaseMetrics[], thresholds: ThresholdRecord[]) {
  const map = Object.fromEntries(
    thresholds.filter((record) => record.candidate !== null).map((record) => [record.metric, record.candidate as number])
  ) as Record<string, number>

  return metrics.map((metric) => {
    const failures: string[] = []
    const safeCoverage = recalculateCoverageForMetric(metric.id, map.safeTextScoreMin ?? SOCIAL_SQUARE_POLICY.safeTextScoreMin)
    if (typeof metric.headlineOverlapRatio === 'number' && typeof map['headline maxOverlapRatio'] === 'number' && metric.headlineOverlapRatio > map['headline maxOverlapRatio']) {
      failures.push(`headlineOverlapRatio ${round(metric.headlineOverlapRatio)} > ${map['headline maxOverlapRatio']}`)
    }
    if (typeof metric.subtitleOverlapRatio === 'number' && typeof map['subtitle maxOverlapRatio'] === 'number' && metric.subtitleOverlapRatio > map['subtitle maxOverlapRatio']) {
      failures.push(`subtitleOverlapRatio ${round(metric.subtitleOverlapRatio)} > ${map['subtitle maxOverlapRatio']}`)
    }
    if (typeof metric.logoOverlapRatio === 'number' && typeof map['logo maxOverlapRatio'] === 'number' && metric.logoOverlapRatio > map['logo maxOverlapRatio']) {
      failures.push(`logoOverlapRatio ${round(metric.logoOverlapRatio)} > ${map['logo maxOverlapRatio']}`)
    }
    if (typeof metric.badgeOverlapRatio === 'number' && typeof map['badge maxOverlapRatio'] === 'number' && metric.badgeOverlapRatio > map['badge maxOverlapRatio']) {
      failures.push(`badgeOverlapRatio ${round(metric.badgeOverlapRatio)} > ${map['badge maxOverlapRatio']}`)
    }
    if (typeof metric.safeTextScore === 'number' && typeof map.safeTextScoreMin === 'number' && metric.safeTextScore < map.safeTextScoreMin) {
      failures.push(`safeTextScore ${round(metric.safeTextScore)} < ${map.safeTextScoreMin}`)
    }
    if (typeof safeCoverage === 'number' && typeof map.safeCoverageMin === 'number' && safeCoverage < map.safeCoverageMin) {
      failures.push(`safeCoverage ${round(safeCoverage)} < ${map.safeCoverageMin}`)
    }
    if (typeof metric.safeAreaCoverage === 'number' && typeof map.safeAreaCoverageMin === 'number' && metric.safeAreaCoverage < map.safeAreaCoverageMin) {
      failures.push(`safeAreaCoverage ${round(metric.safeAreaCoverage)} < ${map.safeAreaCoverageMin}`)
    }

    const nearMargin = (reason: string) => {
      const match = reason.match(/([0-9.]+)\s[<>]\s([0-9.]+)$/)
      if (!match) return false
      return Math.abs(Number(match[1]) - Number(match[2])) <= 0.03
    }

    return {
      id: metric.id,
      filename: metric.filename,
      bucket: metric.bucket,
      pass: failures.length === 0,
      reasons: failures,
      falseRejectRisk: failures.length > 0 && failures.every(nearMargin),
      falsePassRisk:
        failures.length === 0 &&
        [
          typeof metric.headlineOverlapRatio === 'number' && typeof map['headline maxOverlapRatio'] === 'number'
            ? Math.abs(metric.headlineOverlapRatio - map['headline maxOverlapRatio'])
            : null,
          typeof metric.safeTextScore === 'number' && typeof map.safeTextScoreMin === 'number'
            ? Math.abs(metric.safeTextScore - map.safeTextScoreMin)
            : null,
        ].some((value) => typeof value === 'number' && value <= 0.03),
    }
  })
}

export function buildMetricsCsv(metrics: CaseMetrics[]) {
  const header = ['id', 'filename', 'bucket', 'width', 'height', 'flags', ...METRIC_KEYS]
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value)
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  const rows = metrics.map((metric) =>
    [metric.id, metric.filename, metric.bucket, metric.width, metric.height, metric.flags.join('|'), ...METRIC_KEYS.map((key) => metric[key] ?? '')]
      .map(escape)
      .join(',')
  )

  return [header.join(','), ...rows].join('\n')
}

export function buildReportMarkdown(input: {
  manifest: CalibrationManifestEntry[]
  annotations: ExtractedAnnotation[]
  coreMetrics: CaseMetrics[]
  stressMetrics: CaseMetrics[]
  rejectMetrics: CaseMetrics[]
  thresholds: ThresholdRecord[]
  stressEvaluation: ReturnType<typeof evaluateThresholdsOnCases>
}) {
  const inventory = {
    core: input.manifest.filter((entry) => entry.bucket === 'core').length,
    stress: input.manifest.filter((entry) => entry.bucket === 'stress').length,
    reject: input.manifest.filter((entry) => entry.bucket === 'reject').length,
  }
  const heroValid = input.annotations.filter((entry) => entry.bucket !== 'reject' && entry.heroSubjectRect).length
  const incomplete = input.annotations.filter((entry) => entry.flags.includes('incomplete')).map((entry) => `- ${entry.id} (${entry.bucket})`)
  const ambiguous = input.annotations.filter((entry) => entry.flags.includes('ambiguous')).map((entry) => `- ${entry.id} (${entry.bucket})`)

  const formatSummary = (label: string, metrics: CaseMetrics[]) =>
    `### ${label}

| Metric | count | valid | invalid | mean | median | p90 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${METRIC_KEYS.map((key) => {
  const summary = summarizeMetric(metrics.map((row) => row[key]))
  return `| ${key} | ${summary.count} | ${summary.valid_count} | ${summary.invalid_count} | ${summary.mean ?? '-'} | ${summary.median ?? '-'} | ${summary.p90 ?? '-'} | ${summary.p95 ?? '-'} | ${summary.max ?? '-'} |`
}).join('\n')}
`

  const thresholdTable = `| Metric | Current policy | Measured from data | Candidate | Status | Notes |
| --- | ---: | --- | ---: | --- | --- |
${input.thresholds
  .map((record) => {
    const measured = record.measured
      ? Object.entries(record.measured)
          .filter(([key]) => key !== 'source')
          .map(([key, value]) => `${key}=${value ?? '-'}`)
          .join(', ')
      : '-'
    return `| ${record.metric} | ${record.currentPolicy ?? '-'} | ${measured} | ${record.candidate ?? '-'} | ${record.status} | ${record.reason} |`
  })
  .join('\n')}`

  const stressLines = input.stressEvaluation
    .map((entry) => {
      const verdict = entry.pass ? 'pass' : 'fail'
      const risks = [entry.falseRejectRisk ? 'possible false reject' : null, entry.falsePassRisk ? 'possible false pass' : null]
        .filter(Boolean)
        .join(', ')
      return `- ${entry.id}: ${verdict}${entry.reasons.length ? ` - ${entry.reasons.join('; ')}` : ''}${risks ? ` [${risks}]` : ''}`
    })
    .join('\n')

  return `# Social Square Calibration Report

## Repo overview
- Current overlap policy: [overlayPolicies.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/overlayPolicies.ts)
- Current hero/model validation: [validation.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/validation.ts)
- Current format config: [formatRules.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/formatRules.ts)
- Current composition model: [formatCompositionModels.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/formatCompositionModels.ts)

## Dataset inventory
- core: ${inventory.core}
- stress: ${inventory.stress}
- reject: ${inventory.reject}
- valid for hero calibration: ${heroValid}

## Incomplete cases
${incomplete.length ? incomplete.join('\n') : '- none'}

## Ambiguous cases
${ambiguous.length ? ambiguous.join('\n') : '- none'}

## Measured from data
${formatSummary('Core', input.coreMetrics)}
${formatSummary('Stress', input.stressMetrics)}

## Inferred / candidate thresholds
${thresholdTable}

## Insufficient data
${input.thresholds.filter((record) => record.status === 'insufficient-data').map((record) => `- ${record.metric}: ${record.reason}`).join('\n') || '- none'}

## Stress-test results
${stressLines || '- no stress cases'}

## Notes
- Thresholds were fitted only on the core bucket.
- Stress bucket is used for robustness checks, not for fitting.
- safeCoverage is recomputed against the candidate safeTextScoreMin during threshold evaluation.
- reject bucket is kept for inventory/diagnostics only in this first pass.
`
}

export function buildExtractionReportMarkdown(input: {
  manifest: CalibrationManifestEntry[]
  annotations: ExtractedAnnotation[]
}) {
  const inventory = {
    core: input.manifest.filter((entry) => entry.bucket === 'core').length,
    stress: input.manifest.filter((entry) => entry.bucket === 'stress').length,
    reject: input.manifest.filter((entry) => entry.bucket === 'reject').length,
  }
  const heroValid = input.annotations.filter((entry) => entry.bucket !== 'reject' && entry.heroSubjectRect).length
  const incomplete = input.annotations
    .filter((entry) => (entry.classification ?? getEffectiveAnnotationClassification(entry)) === 'incomplete')
    .map((entry) => `- ${entry.id} (${entry.bucket})`)
  const ambiguous = input.annotations
    .filter((entry) => (entry.classification ?? getEffectiveAnnotationClassification(entry)) === 'ambiguous')
    .map((entry) => `- ${entry.id} (${entry.bucket})`)

  return `# Social Square Extraction Report

## Inventory
- core: ${inventory.core}
- stress: ${inventory.stress}
- reject: ${inventory.reject}
- valid for hero calibration: ${heroValid}

## Problem Cases
### Incomplete
${incomplete.length ? incomplete.join('\n') : '- none'}

### Ambiguous
${ambiguous.length ? ambiguous.join('\n') : '- none'}

## Notes
- This stage only builds dataset manifest and extracts annotated bounding boxes from overlay PNG files.
- No threshold tuning or production policy changes were applied.
- Flags are conservative:
  - \`incomplete\` means the red hero subject box was not found.
  - \`ambiguous\` means singleton elements split into multiple strong components or text colors fragmented unusually heavily.
- Effective classification may include manual triage overrides on top of raw extracted flags.
`
}
