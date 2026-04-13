export const BANNER_QUALITY_GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

const BANNER_CRITIC_PROMPT = `You are a professional banner designer reviewing a screenshot of a marketplace banner. When a screenshot is attached, analyze the VISUAL composition from the screenshot pixels, not just text metadata. When no image is attached (scene-only), infer conservatively from the scene data provided above.

Return ONLY valid JSON (no markdown fences, no explanation) with:

- overallScore (0-100): visual quality score
- band: "strong" | "acceptable" | "weak"
- issues: array of strings describing visual problems you can see (or inferred problems in scene-only mode)
- autofixes: array of objects { "action": string, "reason": string } where action is one of: "zoom_in", "zoom_out", "rebalance", "increase_contrast", "shift_text_left", "shift_text_right", "increase_cta_size", "darken_overlay"
- visualNote: one sentence describing the main composition problem

Also include these legacy fields (used by downstream autofix): rate each 0-10 with fix if score < 7:
- title: { "score", "issue", "fix": "increase_size|improve_contrast|reposition|none" }
- subtitle: { "score", "issue", "fix": "increase_size|improve_contrast|add_subtitle|none" }
- cta: { "score", "issue", "fix": "increase_size|improve_contrast|reposition|none" }
- image: { "score", "issue", "fix": "recrop|zoom_in|none" }
- composition: { "score", "issue", "fix": "rebalance|none" }
- overall: 0-10 (may align with overallScore / 10)`

export type BannerQualityAxis = {
  score: number
  issue: string | null
  fix: string
}

export type BannerQualityBand = 'strong' | 'acceptable' | 'weak'

export type BannerAutofixItem = {
  action: string
  reason: string
}

export type BannerQualityResult = {
  title: BannerQualityAxis
  subtitle: BannerQualityAxis
  cta: BannerQualityAxis
  image: BannerQualityAxis
  composition: BannerQualityAxis
  overall: number
  overallScore?: number
  band?: BannerQualityBand
  issues?: string[]
  autofixes?: BannerAutofixItem[]
  visualNote?: string
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

function defaultAxis(): BannerQualityAxis {
  return { score: 7, issue: null, fix: 'none' }
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

function parseAxisOrDefault(raw: unknown, fallbackFix: string): BannerQualityAxis {
  if (!raw || typeof raw !== 'object') return defaultAxis()
  return parseAxis(raw, fallbackFix)
}

function parseBand(raw: unknown): BannerQualityBand | undefined {
  if (raw !== 'strong' && raw !== 'acceptable' && raw !== 'weak') return undefined
  return raw
}

function parseIssues(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw.filter((x) => typeof x === 'string').map(String)
  return out.length ? out : undefined
}

function parseAutofixes(raw: unknown): BannerAutofixItem[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: BannerAutofixItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const a = item as Record<string, unknown>
    if (typeof a.action !== 'string' || typeof a.reason !== 'string') continue
    out.push({ action: a.action, reason: a.reason })
  }
  return out.length ? out : undefined
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
  const overallFromScore =
    typeof o.overallScore === 'number' && Number.isFinite(o.overallScore)
      ? clampScore(o.overallScore / 10)
      : undefined
  const overallRaw = o.overall
  const overall =
    typeof overallRaw === 'number' || (typeof overallRaw === 'string' && overallRaw.trim() !== '')
      ? clampScore(typeof overallRaw === 'number' ? overallRaw : Number(overallRaw))
      : overallFromScore !== undefined
        ? overallFromScore
        : 7

  const overallScoreRaw = o.overallScore
  const overallScore =
    typeof overallScoreRaw === 'number' && Number.isFinite(overallScoreRaw)
      ? Math.max(0, Math.min(100, overallScoreRaw))
      : undefined

  return {
    title: parseAxisOrDefault(o.title, 'none'),
    subtitle: parseAxisOrDefault(o.subtitle, 'none'),
    cta: parseAxisOrDefault(o.cta, 'none'),
    image: parseAxisOrDefault(o.image, 'none'),
    composition: parseAxisOrDefault(o.composition, 'none'),
    overall,
    overallScore,
    band: parseBand(o.band),
    issues: parseIssues(o.issues),
    autofixes: parseAutofixes(o.autofixes),
    visualNote: typeof o.visualNote === 'string' ? o.visualNote : undefined,
  }
}

export function buildGroqBannerQualityRequestBody(svgDataUrl: string): Record<string, unknown> {
  if (typeof svgDataUrl !== 'string' || !svgDataUrl.startsWith('data:image/')) {
    throw new Error('svgDataUrl must be a data URL for a raster image (PNG).')
  }
  return {
    model: BANNER_QUALITY_GROQ_MODEL,
    temperature: 0.1,
    max_tokens: 1200,
    messages: [
      {
        role: 'system',
        content:
          'You are a professional banner designer. Respond ONLY with valid JSON, no markdown fences, no explanation. When an image is provided, judge visual composition from pixels.',
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
    max_tokens: 1200,
    messages: [
      {
        role: 'system',
        content:
          'You are a professional banner designer. Respond ONLY with valid JSON, no markdown fences, no explanation. Infer conservatively from scene data when no image is attached.',
      },
      {
        role: 'user',
        content: `${SCENE_ONLY_PREAMBLE}${JSON.stringify(summary)}\n\n${BANNER_CRITIC_PROMPT}`,
      },
    ],
  }
}
