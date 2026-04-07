import type { EnhancedImageAnalysis, ImageAsset, ImageProfile } from './imageAnalysis'

const MODEL = 'claude-sonnet-4-20250514'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_SIDE = 2048

const SYSTEM_PROMPT = `You analyze images for advertising layout on marketplaces.

Respond with ONLY valid JSON (no markdown, no code fences, no text before or after the JSON object).

The JSON object must have exactly these keys:
- focalPoint: { "x": number, "y": number } — main subject center in percent 0–100
- visualMassCenter: { "x": number, "y": number } — weighted visual mass in percent 0–100
- safeTextAreas: array of { "x", "y", "w", "h", "score" } — regions good for overlay text; x,y,w,h in percent 0–100, score in 0–1
- mood: "light" | "dark" | "neutral"
- cropRisk: "low" | "medium" | "high"
- dominantColors: string[] — hex colors like "#RRGGBB"
- imageProfile: "landscape" | "square" | "portrait" | "tall" | "ultraWide"
- detectedContrast: "low" | "medium" | "high"`

const USER_INSTRUCTION = `Return one JSON object with focalPoint, visualMassCenter, safeTextAreas, mood, cropRisk, dominantColors, imageProfile, and detectedContrast as specified.`

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function focalSuggestionFromPoint(focal: { x: number; y: number }): EnhancedImageAnalysis['focalSuggestion'] {
  if (focal.y < 34) return 'top'
  if (focal.x < 36) return 'left'
  if (focal.x > 64) return 'right'
  return 'center'
}

function buildBrightnessMap(focal: { x: number; y: number }, mood: 'light' | 'dark'): EnhancedImageAnalysis['brightnessMap'] {
  const base = mood === 'light' ? 0.72 : 0.38
  const centers = [25, 50, 75]
  const map: EnhancedImageAnalysis['brightnessMap'] = []
  for (const y of centers) {
    for (const x of centers) {
      const dist = Math.hypot(x - focal.x, y - focal.y)
      const score = clamp(base + (50 - dist) / 200, 0, 1)
      map.push({ x, y, score })
    }
  }
  return map
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image.'))
    image.src = url
  })
}

async function loadImageForJpeg(url: string): Promise<HTMLImageElement> {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
    }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      return await loadImageElement(objectUrl)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }
  return loadImageElement(url)
}

async function urlToJpegBase64(url: string): Promise<string> {
  const img = await loadImageForJpeg(url)
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (w <= 0 || h <= 0) {
    throw new Error('Invalid image dimensions.')
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  w = Math.max(1, Math.round(w * scale))
  h = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Could not render image for analysis.')
  }
  ctx.drawImage(img, 0, 0, w, h)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  const comma = dataUrl.indexOf(',')
  if (comma < 0) {
    throw new Error('Could not encode image as JPEG.')
  }
  return dataUrl.slice(comma + 1)
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m)
  if (match?.[1]) {
    return match[1].trim()
  }
  return trimmed
}

function parseMood(raw: unknown): 'light' | 'dark' {
  if (raw === 'neutral') return 'light'
  if (raw === 'light' || raw === 'dark') return raw
  return 'dark'
}

function parseImageProfile(raw: unknown): ImageProfile {
  const map: Record<string, ImageProfile> = {
    landscape: 'landscape',
    square: 'square',
    portrait: 'portrait',
    tall: 'tall',
    ultraWide: 'ultraWide',
    ultrawide: 'ultraWide',
    'ultra-wide': 'ultraWide',
    ultra_wide: 'ultraWide',
  }
  if (typeof raw === 'string' && raw in map) {
    return map[raw]!
  }
  return 'square'
}

function parseCropRisk(raw: unknown): EnhancedImageAnalysis['cropRisk'] {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw
  return 'medium'
}

function parseContrast(raw: unknown): EnhancedImageAnalysis['detectedContrast'] {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw
  return 'medium'
}

function isPoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return typeof o.x === 'number' && typeof o.y === 'number' && Number.isFinite(o.x) && Number.isFinite(o.y)
}

function parseEnhancedFromJson(parsed: unknown): EnhancedImageAnalysis {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI response JSON must be an object.')
  }
  const o = parsed as Record<string, unknown>

  if (!isPoint(o.focalPoint)) {
    throw new Error('AI response JSON must include focalPoint { x, y }.')
  }
  if (!isPoint(o.visualMassCenter)) {
    throw new Error('AI response JSON must include visualMassCenter { x, y }.')
  }

  const focalPoint = {
    x: clamp(o.focalPoint.x, 0, 100),
    y: clamp(o.focalPoint.y, 0, 100),
  }
  const visualMassCenter = {
    x: clamp(o.visualMassCenter.x, 0, 100),
    y: clamp(o.visualMassCenter.y, 0, 100),
  }

  const mood = parseMood(o.mood)
  const cropRisk = parseCropRisk(o.cropRisk)
  const imageProfile = parseImageProfile(o.imageProfile)
  const detectedContrast = parseContrast(o.detectedContrast)

  let safeTextAreas: EnhancedImageAnalysis['safeTextAreas'] = []
  if (Array.isArray(o.safeTextAreas)) {
    safeTextAreas = o.safeTextAreas
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const z = item as Record<string, unknown>
        if (
          typeof z.x !== 'number' ||
          typeof z.y !== 'number' ||
          typeof z.w !== 'number' ||
          typeof z.h !== 'number' ||
          typeof z.score !== 'number'
        ) {
          return null
        }
        return {
          x: clamp(z.x, 0, 100),
          y: clamp(z.y, 0, 100),
          w: clamp(z.w, 0, 100),
          h: clamp(z.h, 0, 100),
          score: clamp(z.score, 0, 1),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }
  if (safeTextAreas.length === 0) {
    safeTextAreas = [{ x: 8, y: 8, w: 36, h: 28, score: 0.72 }]
  }

  let dominantColors: string[] = []
  if (Array.isArray(o.dominantColors)) {
    dominantColors = o.dominantColors.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
  }
  if (dominantColors.length === 0) {
    dominantColors = ['#0f172a', '#1e293b', '#38bdf8', '#f8fafc']
  }

  const focalSuggestion = focalSuggestionFromPoint(focalPoint)
  const brightnessMap = buildBrightnessMap(focalPoint, mood)

  const subjectBox: EnhancedImageAnalysis['subjectBox'] = {
    x: clamp(focalPoint.x - 18, 0, 82),
    y: clamp(focalPoint.y - 20, 0, 80),
    w: 36,
    h: 40,
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

export async function anthropicImageAnalyzer(image: ImageAsset): Promise<EnhancedImageAnalysis> {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (key === undefined || key === null || String(key).trim() === '') {
    throw new Error('VITE_ANTHROPIC_API_KEY is not set')
  }

  const base64 = await urlToJpegBase64(image.url)

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': String(key).trim(),
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: USER_INSTRUCTION,
              },
            ],
          },
        ],
      }),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`Anthropic request failed: ${message}`)
  }

  if (!response.ok) {
    let detail = ''
    try {
      detail = await response.text()
    } catch {
      detail = ''
    }
    throw new Error(
      `Anthropic API error ${response.status}: ${detail || response.statusText || 'Unknown error'}`
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Anthropic response was not valid JSON.')
  }

  const content = (body as { content?: Array<{ type?: string; text?: string }> }).content
  const textBlock = Array.isArray(content) ? content.find((b) => b?.type === 'text' && typeof b.text === 'string') : undefined
  const rawText = textBlock?.text
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Anthropic response did not include text content.')
  }

  const jsonText = stripJsonFence(rawText)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`Failed to parse AI JSON: ${message}`)
  }

  try {
    return parseEnhancedFromJson(parsed)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`Invalid AI analysis JSON: ${message}`)
  }
}
