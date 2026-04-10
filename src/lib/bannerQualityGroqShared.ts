export const BANNER_QUALITY_GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

const BANNER_CRITIC_PROMPT = `You are a professional banner design critic. Analyze this marketing banner and return ONLY valid JSON.

Rate each element 0-10 and provide specific fix if score < 7:

{
  "title": { "score": 0-10, "issue": "string or null", "fix": "increase_size|improve_contrast|reposition|none" },
  "subtitle": { "score": 0-10, "issue": "string or null", "fix": "increase_size|improve_contrast|add_subtitle|none" },
  "cta": { "score": 0-10, "issue": "string or null", "fix": "increase_size|improve_contrast|reposition|none" },
  "image": { "score": 0-10, "issue": "string or null", "fix": "recrop|zoom_in|none" },
  "composition": { "score": 0-10, "issue": "string or null", "fix": "rebalance|none" },
  "overall": 0-10
}`

export type BannerQualityAxis = {
  score: number
  issue: string | null
  fix: string
}

export type BannerQualityResult = {
  title: BannerQualityAxis
  subtitle: BannerQualityAxis
  cta: BannerQualityAxis
  image: BannerQualityAxis
  composition: BannerQualityAxis
  overall: number
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m)
  if (match?.[1]) return match[1].trim()
  return trimmed
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(10, n))
}

function parseAxis(raw: unknown, fallbackFix: string): BannerQualityAxis {
  if (!raw || typeof raw !== 'object') {
    return { score: 0, issue: null, fix: 'none' }
  }
  const o = raw as Record<string, unknown>
  const score = clampScore(typeof o.score === 'number' ? o.score : Number(o.score))
  const issue = o.issue === null || o.issue === undefined ? null : String(o.issue)
  const fix = typeof o.fix === 'string' ? o.fix : fallbackFix
  return { score, issue, fix }
}

export function parseBannerQualityFromAssistantText(text: string): BannerQualityResult {
  const jsonText = stripJsonFence(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`Failed to parse banner quality JSON: ${message}`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Banner quality JSON must be an object.')
  }
  const o = parsed as Record<string, unknown>
  const overall = clampScore(typeof o.overall === 'number' ? o.overall : Number(o.overall))
  return {
    title: parseAxis(o.title, 'none'),
    subtitle: parseAxis(o.subtitle, 'none'),
    cta: parseAxis(o.cta, 'none'),
    image: parseAxis(o.image, 'none'),
    composition: parseAxis(o.composition, 'none'),
    overall,
  }
}

export function buildGroqBannerQualityRequestBody(svgDataUrl: string): Record<string, unknown> {
  if (typeof svgDataUrl !== 'string' || !svgDataUrl.startsWith('data:image/')) {
    throw new Error('svgDataUrl must be a data URL for a raster image (PNG).')
  }
  return {
    model: BANNER_QUALITY_GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 900,
    messages: [
      {
        role: 'system',
        content: 'You are a professional banner design critic. Respond ONLY with valid JSON, no markdown fences, no explanation.',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: svgDataUrl } },
          { type: 'text', text: BANNER_CRITIC_PROMPT },
        ],
      },
    ],
  }
}

/** Plain-text scene snapshot when PNG export fails (e.g. CORS on embedded images). */
export type BannerSceneSummaryPayload = {
  titleText: string
  subtitleText: string
  ctaText: string
  accent: string
  background: [string, string, string]
  titleFontSize?: number
  titleFill?: string
  subtitleFill?: string
  ctaBg?: string
  ctaFill?: string
}

const SCENE_ONLY_PREAMBLE = `No raster image of the banner is available (export failed, often due to cross-origin images). Infer quality only from this structured scene data. Be conservative; set image scores to mid-range with fix "none" unless text implies obvious image issues.

Scene JSON:
`

export function isBannerSceneSummaryPayload(value: unknown): value is BannerSceneSummaryPayload {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  if (typeof o.titleText !== 'string' || typeof o.subtitleText !== 'string' || typeof o.ctaText !== 'string') return false
  if (typeof o.accent !== 'string') return false
  if (!Array.isArray(o.background) || o.background.length < 3) return false
  if (!o.background.every((c) => typeof c === 'string')) return false
  return true
}

export function buildGroqBannerQualitySceneSummaryBody(summary: BannerSceneSummaryPayload): Record<string, unknown> {
  return {
    model: BANNER_QUALITY_GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 900,
    messages: [
      {
        role: 'system',
        content: 'You are a professional banner design critic. Respond ONLY with valid JSON, no markdown fences, no explanation.',
      },
      {
        role: 'user',
        content: `${SCENE_ONLY_PREAMBLE}${JSON.stringify(summary)}\n\n${BANNER_CRITIC_PROMPT}`,
      },
    ],
  }
}
