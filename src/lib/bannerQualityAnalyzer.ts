import { getContrastingText } from './imageAnalysis'
import type { Scene } from './types'
import type { BannerQualityResult, BannerSceneSummaryPayload } from './bannerQualityGroqShared'

export type { BannerQualityResult, BannerQualityAxis } from './bannerQualityGroqShared'

function hasRenderableSubtitle(text: string | undefined): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  return !/^subtitle$/i.test(t)
}

function sceneToSummary(scene: Scene): BannerSceneSummaryPayload {
  return {
    titleText: scene.title.text ?? '',
    subtitleText: scene.subtitle.text ?? '',
    ctaText: scene.cta.text ?? '',
    accent: scene.accent,
    background: scene.background,
    titleFontSize: scene.title.fontSize,
    titleFill: scene.title.fill,
    subtitleFill: scene.subtitle.fill,
    ctaBg: scene.cta.bg,
    ctaFill: scene.cta.fill,
  }
}

async function postAnalyzeBanner(body: Record<string, unknown>): Promise<BannerQualityResult> {
  const response = await fetch('/api/analyze-banner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = await response.text()
    try {
      const j = JSON.parse(detail) as { error?: string }
      if (j.error) detail = j.error
    } catch {
      /* keep raw */
    }
    throw new Error(detail || `Banner analysis failed (${response.status})`)
  }
  return (await response.json()) as BannerQualityResult
}

export async function analyzeBannerQuality(svgElement: SVGSVGElement, sceneFallback?: Scene): Promise<BannerQualityResult> {
  const { toPng } = await import('html-to-image')

  try {
    const pngDataUrl = await Promise.race([
      toPng(svgElement as unknown as HTMLElement, {
        cacheBust: true,
        skipFonts: true,
        backgroundColor: '#ffffff',
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('toPng timeout')), 5000)),
    ])
    return postAnalyzeBanner({ svgDataUrl: pngDataUrl })
  } catch (e) {
    console.warn('[banner-analysis] toPng failed or timed out (CORS/timeout); trying scene-summary fallback if available', e)
    if (sceneFallback) {
      return postAnalyzeBanner({ sceneSummary: sceneToSummary(sceneFallback) })
    }
    console.warn('[banner-analysis] skipping banner analysis (no scene fallback)')
    throw e instanceof Error ? e : new Error(String(e))
  }
}

export function applyBannerQualityAutofixes(scene: Scene, result: BannerQualityResult): { scene: Scene; changed: boolean } {
  let changed = false
  const next: Scene = {
    ...scene,
    title: { ...scene.title },
    subtitle: { ...scene.subtitle },
    cta: { ...scene.cta },
    image: { ...scene.image },
  }

  if (result.title.score < 7 && result.title.fix === 'increase_size') {
    const base = next.title.fontSize ?? 48
    next.title.fontSize = Math.round(base * 1.2)
    changed = true
  }

  if (result.cta.score < 7 && result.cta.fix === 'improve_contrast') {
    next.cta.bg = next.accent
    next.cta.fill = getContrastingText(next.accent)
    changed = true
  }

  if (result.subtitle.score < 7 && result.subtitle.fix === 'add_subtitle' && !hasRenderableSubtitle(next.subtitle.text)) {
    const words = (next.title.text?.trim() ?? '').split(/\s+/).filter(Boolean).slice(0, 5)
    if (words.length > 0) {
      next.subtitle.text = words.join(' ')
      changed = true
    }
  }

  if (result.image.score < 7 && result.image.fix === 'zoom_in') {
    next.image.fit = 'xMidYMid slice'
    next.image.imageZoom = 1.2
    changed = true
  }

  return { scene: next, changed }
}
