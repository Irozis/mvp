import type { EnhancedImageAnalysis, ImageAsset, ImageProfile } from './imageAnalysis'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function focalSuggestionFromPoint(focal: { x: number; y: number }): EnhancedImageAnalysis['focalSuggestion'] {
  if (focal.y < 34) return 'top'
  if (focal.x < 36) return 'left'
  if (focal.x > 64) return 'right'
  return 'center'
}

function buildBrightnessMap(focal: { x: number; y: number }, mood: 'light' | 'dark' | 'neutral'): EnhancedImageAnalysis['brightnessMap'] {
  const base = mood === 'light' ? 0.72 : mood === 'dark' ? 0.38 : 0.55
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function mimeTypeFromDataUrl(url: string): string {
  const match = url.match(/^data:([^;,]+)/)
  return match?.[1]?.trim() || 'image/jpeg'
}

function guessMimeTypeFromPath(url: string): string {
  const lower = url.split('?')[0]?.toLowerCase() ?? ''
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'image/jpeg'
}

async function urlToBase64AndMime(url: string): Promise<{ base64: string; mimeType: string }> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',')
    if (comma < 0) throw new Error('Invalid data URL: missing comma separator.')
    const mimeType = mimeTypeFromDataUrl(url)
    const base64 = url.slice(comma + 1)
    if (!base64) throw new Error('Invalid data URL: empty payload.')
    return { base64, mimeType }
  }

  let response: Response
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'omit' })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`Failed to fetch image: ${message}`)
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
  }
  let buffer: ArrayBuffer
  try {
    buffer = await response.arrayBuffer()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`Failed to read image data: ${message}`)
  }
  const base64 = arrayBufferToBase64(buffer)
  const headerType = response.headers.get('content-type')?.split(';')[0]?.trim()
  const mimeType = headerType && headerType.startsWith('image/') ? headerType : guessMimeTypeFromPath(url)
  return { base64, mimeType }
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m)
  if (match?.[1]) return match[1].trim()
  return trimmed
}

function parseMood(raw: unknown): 'light' | 'dark' | 'neutral' {
  if (raw === 'neutral') return 'neutral'
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
  if (typeof raw === 'string' && raw in map) return map[raw]!
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

  if (!isPoint(o.focalPoint)) throw new Error('AI response JSON must include focalPoint { x, y }.')
  if (!isPoint(o.visualMassCenter)) throw new Error('AI response JSON must include visualMassCenter { x, y }.')

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
        ) return null
        return {
          x: clamp(z.x, 0, 100),
          y: clamp(z.y, 0, 100),
          w: clamp(z.w, 0, 100),
          h: clamp(z.h, 0, 100),
          score: clamp(z.score, 0, 1),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 3)
  }
  if (safeTextAreas.length === 0) {
    safeTextAreas = [{ x: 8, y: 8, w: 36, h: 28, score: 0.72 }]
  }

  let dominantColors: string[] = []
  if (Array.isArray(o.dominantColors)) {
    dominantColors = o.dominantColors
      .filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
      .slice(0, 3)
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

export async function groqImageAnalyzer(image: ImageAsset): Promise<EnhancedImageAnalysis> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('Groq API key is not set (VITE_GROQ_API_KEY)')
  }

  const { base64, mimeType } = await urlToBase64AndMime(image.url)
  const dataUrl = `data:${mimeType};base64,${base64}`

  const body = {
    model: GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 800,
    messages: [
      {
        role: 'system',
        content: 'You are an image analysis assistant. Respond ONLY with valid JSON, no markdown, no explanation.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
          {
            type: 'text',
            text: 'Analyze this image and return JSON with these fields: focalPoint ({x, y} as 0-100 percentages where main subject is), visualMassCenter ({x, y} 0-100), safeTextAreas (array of up to 3 zones {x, y, w, h, score} where text can be placed without blocking subject, score 0-1), mood ("light" | "dark" | "neutral"), cropRisk ("low" | "medium" | "high"), dominantColors (array of 3 hex colors), imageProfile ("landscape" | "square" | "portrait" | "tall" | "ultraWide"), detectedContrast ("low" | "medium" | "high")',
          },
        ],
      },
    ],
  }

  let response: Response
  try {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`Groq API request failed: ${message}`)
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Groq API error:', response.status, errorText)
    throw new Error(errorText || `${response.status} ${response.statusText || 'Unknown error'}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Groq API response was not valid JSON.')
  }

  const text = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Groq API response did not include choices[0].message.content.')
  }

  const jsonText = stripJsonFence(text)

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
