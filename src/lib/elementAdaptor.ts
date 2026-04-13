import { contrastRatio, getContrastingText } from './colorEngine'
import type { BrandKit, EnhancedImageAnalysis, EnhancedImageArea, FormatKey, Scene, SceneElement } from './types'

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function normalizeHex6(hex: string): string | null {
  const raw = hex.trim()
  if (!raw.startsWith('#')) return null
  const n = raw.slice(1)
  if (n.length === 3 && /^[0-9a-fA-F]{3}$/.test(n)) {
    return `#${n[0]}${n[0]}${n[1]}${n[1]}${n[2]}${n[2]}`
  }
  if (n.length === 6 && /^[0-9a-fA-F]{6}$/.test(n)) return `#${n}`
  return null
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const full = normalizeHex6(hex)
  if (!full) return { h: 0, s: 0, l: 0 }
  const r = parseInt(full.slice(1, 3), 16) / 255
  const g = parseInt(full.slice(3, 5), 16) / 255
  const b = parseInt(full.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const hRaw =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6
  return { h: hRaw * 360, s: s * 100, l: l * 100 }
}

function mostVividColor(colors: string[]): string {
  const parsed = colors.map((c) => normalizeHex6(c)).filter((c): c is string => Boolean(c))
  if (!parsed.length) return '#000000'
  let bestColor = parsed[0]
  let bestSaturation = -1
  for (const color of parsed) {
    const hsl = hexToHsl(color)
    if (hsl.s > bestSaturation) {
      bestSaturation = hsl.s
      bestColor = color
    }
  }
  if (bestSaturation < 20) {
    let darkest = parsed[0]
    let lowestL = 101
    for (const color of parsed) {
      const hsl = hexToHsl(color)
      if (hsl.l < lowestL) {
        lowestL = hsl.l
        darkest = color
      }
    }
    return darkest
  }
  return bestColor
}

function isGoodCtaColor(h: { s: number; l: number }): boolean {
  if (h.s < 40) return false
  if (h.l > 72) return false
  if (h.l < 18) return false
  return true
}

function mostContrastingColor(against: string, candidates: string[]): string {
  let best = candidates[0]
  let bestScore = contrastRatio(best, against)
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]
    const s = contrastRatio(c, against)
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}

function isDarkPrimaryRange(hex: string): boolean {
  const raw = hex.trim()
  if (!raw.startsWith('#')) return false
  const n = raw.slice(1)
  const full =
    n.length === 3 && /^[0-9a-fA-F]{3}$/.test(n)
      ? `${n[0]}${n[0]}${n[1]}${n[1]}${n[2]}${n[2]}`
      : n.length === 6 && /^[0-9a-fA-F]{6}$/.test(n)
        ? n
        : ''
  if (!full) return false
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum < 0.18
}

function resolvePrimaryTextFill(brandKit: BrandKit, imageAnalysis: EnhancedImageAnalysis | undefined): string {
  let fill = brandKit.primaryColor
  if (imageAnalysis?.mood === 'dark' && isDarkPrimaryRange(brandKit.primaryColor)) {
    fill = '#FFFFFF'
  }
  return fill
}

/**
 * Marketplace card/tile/highlight use strict layout zones — skip adaptive text/CTA geometry.
 * Prefer explicit `formatKey` when available; otherwise use geometry heuristic.
 */
function isMarketplaceZoneLayoutScene(scene: Scene, formatKey?: FormatKey | string): boolean {
  if (formatKey === 'marketplace-highlight' || formatKey === 'marketplace-card' || formatKey === 'marketplace-tile') {
    return true
  }
  if (!scene.image?.w || !scene.image?.h) return false
  return (
    scene.image.w > 0 &&
    scene.image.h > 0 &&
    ((scene.title.y || 0) > 55 || (scene.image.h || 0) > 50)
  )
}

export function adaptCtaToParent(
  scene: Scene,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  brandKit: BrandKit,
  manualOverride?: Partial<SceneElement>,
  formatKey?: FormatKey | string,
): Scene {
  const next: Scene = JSON.parse(JSON.stringify(scene)) as Scene
  const candidates = ['#FFFFFF', '#000000', brandKit.accentColor, brandKit.primaryColor]
  const imgW = next.image.w ?? 0
  const imgH = next.image.h ?? 0
  const parentIsImage = imgW > 0 && imgH > 0

  if (parentIsImage) {
    const palette = imageAnalysis?.dominantColors?.filter(Boolean) ?? []
    const dominant = imageAnalysis?.dominantColors?.[0] ?? next.background[1]
    const fallbackCtaColors = ['#E11D48', '#2563EB', '#D97706', '#16A34A']
    if (palette.length) {
      const vividColor = mostVividColor(palette)
      const hsl = hexToHsl(vividColor)
      if (hsl.s > 25 && isGoodCtaColor(hsl)) {
        next.cta.bg = vividColor
      } else {
        const accentHsl = hexToHsl(brandKit.accentColor)
        if (isGoodCtaColor(accentHsl)) {
          next.cta.bg = brandKit.accentColor
        } else {
          next.cta.bg = mostContrastingColor(dominant, fallbackCtaColors)
        }
      }
    } else {
      const accentHsl = hexToHsl(brandKit.accentColor)
      if (isGoodCtaColor(accentHsl)) {
        next.cta.bg = brandKit.accentColor
      } else {
        next.cta.bg = mostContrastingColor(dominant, fallbackCtaColors)
      }
    }
    next.cta.fill = getContrastingText(next.cta.bg)
    if (!isMarketplaceZoneLayoutScene(next, formatKey)) {
      const irx = next.image.rx ?? 0
      next.cta.rx = irx >= 24 ? 26 : irx >= 10 ? 14 : 4
      const imageArea = (imgW * imgH) / 10000
      next.cta.w = clamp(imageArea * 28, 14, 30)
      next.cta.h = clamp(imageArea * 9, 5, 8)
    } else {
      next.cta.rx = brandKit.ctaStyle === 'pill' ? 26 : brandKit.ctaStyle === 'rounded' ? 14 : 4
    }
  } else {
    const bgMid = next.background[1]
    next.cta.bg = mostContrastingColor(bgMid, candidates)
    next.cta.fill = getContrastingText(next.cta.bg)
    if (brandKit.ctaStyle === 'pill') {
      next.cta.rx = 26
    } else if (brandKit.ctaStyle === 'rounded') {
      next.cta.rx = 14
    } else {
      next.cta.rx = 4
    }
  }

  const CTA_MIN_W = 16
  const CTA_MIN_H = 6
  if ((next.cta.w || 0) < CTA_MIN_W) next.cta.w = CTA_MIN_W
  if ((next.cta.h || 0) < CTA_MIN_H) next.cta.h = CTA_MIN_H
  if ((next.cta.fontSize || 0) < 14) next.cta.fontSize = 14

  if (manualOverride) {
    Object.assign(next.cta, manualOverride)
  }

  return next
}

const TEXT_LOGO_TITLE_CANDIDATES = ['#FFFFFF', '#F8FAFC', '#0F172A', '#1E293B'] as const

function pickBestSafeTextArea(areas: EnhancedImageArea[] | undefined): EnhancedImageArea | null {
  if (!areas?.length) return null
  const qualified = areas.filter((a) => a.score >= 0.6)
  if (!qualified.length) return null
  return qualified.reduce((best, a) => (a.score > best.score ? a : best))
}

function subtitleOpacityFromContrast(analysis: EnhancedImageAnalysis | undefined): number {
  const c = analysis?.detectedContrast
  if (c === 'low') return 0.95
  if (c === 'high') return 0.72
  return 0.84
}

export function adaptTextAndLogoToParent(
  scene: Scene,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  brandKit: BrandKit,
  manualOverrides?: {
    title?: Partial<SceneElement>
    subtitle?: Partial<SceneElement>
    logo?: Partial<SceneElement>
  },
  formatKey?: FormatKey | string,
): Scene {
  const next: Scene = JSON.parse(JSON.stringify(scene)) as Scene
  const imgW = next.image.w ?? 0
  const imgH = next.image.h ?? 0
  const parentIsImage = imgW > 0 && imgH > 0

  const titleCandidates = [...TEXT_LOGO_TITLE_CANDIDATES, brandKit.primaryColor]

  if (parentIsImage) {
    const mood = imageAnalysis?.mood
    if (mood === 'light') {
      next.title.fill = '#0F172A'
    } else if (mood === 'dark') {
      next.title.fill = '#FFFFFF'
    } else if (mood === 'neutral') {
      next.title.fill = '#FFFFFF'
    } else {
      const baseForTitle = imageAnalysis?.dominantColors?.[0] ?? next.background[1]
      next.title.fill = mostContrastingColor(baseForTitle, titleCandidates)
    }

    const isMarketplaceFormat = isMarketplaceZoneLayoutScene(next, formatKey)
    const bestArea = pickBestSafeTextArea(imageAnalysis?.safeTextAreas)

    if (bestArea && !isMarketplaceFormat) {
      const availableW = bestArea.w
      const baseFs = next.title.fontSize ?? 48
      let fs = baseFs
      if (availableW < 30) fs = baseFs * 0.85
      else if (availableW > 55) fs = baseFs * 1.1
      next.title.fontSize = Math.round(clamp(fs, 18, 72))
      next.title.x = bestArea.x + 2
      next.title.y = bestArea.y + 4
      next.title.w = bestArea.w - 4
      const fsAfter = next.title.fontSize ?? 48
      const maxLines = next.title.maxLines ?? 2
      const estimatedTitleH = (fsAfter / 1080) * 100 * maxLines * 1.1
      next.subtitle.x = next.title.x
      next.subtitle.y = next.title.y + estimatedTitleH + 2
      next.subtitle.w = next.title.w
    } else if (!isMarketplaceFormat && !bestArea) {
      const fs = next.title.fontSize ?? 48
      const maxLines = next.title.maxLines ?? 2
      const estimatedTitleH = (fs / 1080) * 100 * maxLines * 1.1
      next.subtitle.x = next.title.x
      next.subtitle.y = next.title.y + estimatedTitleH + 2
      next.subtitle.w = next.title.w
    }

    next.subtitle.opacity = subtitleOpacityFromContrast(imageAnalysis)
    next.subtitle.fill = next.title.fill

    const contrast = imageAnalysis?.detectedContrast
    if (contrast === 'high') next.logo.bgOpacity = 0.28
    else if (contrast === 'low') next.logo.bgOpacity = 0.1
    else next.logo.bgOpacity = 0.16

    const logoBase = imageAnalysis?.dominantColors?.[0] ?? next.background[1]
    const logoCandidates = ['#FFFFFF', '#000000', brandKit.primaryColor]
    next.logo.bg = mostContrastingColor(logoBase, logoCandidates)
    next.logo.fill = getContrastingText(next.logo.bg)
  } else {
    next.title.fill = mostContrastingColor(next.background[1], titleCandidates)

    next.subtitle.fill = next.title.fill
    next.subtitle.opacity = subtitleOpacityFromContrast(imageAnalysis)

    next.logo.bg = brandKit.primaryColor
    next.logo.bgOpacity = 0.1
    next.logo.fill = getContrastingText(brandKit.primaryColor)
  }

  if (manualOverrides?.title) Object.assign(next.title, manualOverrides.title)
  if (manualOverrides?.subtitle) Object.assign(next.subtitle, manualOverrides.subtitle)
  if (manualOverrides?.logo) Object.assign(next.logo, manualOverrides.logo)

  return next
}

function hexLuminance(hex: string): number | null {
  const raw = hex.trim()
  if (!raw.startsWith('#')) return null
  const n = raw.slice(1)
  const full =
    n.length === 3 && /^[0-9a-fA-F]{3}$/.test(n)
      ? `${n[0]}${n[0]}${n[1]}${n[1]}${n[2]}${n[2]}`
      : n.length === 6 && /^[0-9a-fA-F]{6}$/.test(n)
        ? n
        : ''
  if (!full) return null
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function adaptBadgeAndImageToParent(
  scene: Scene,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  brandKit: BrandKit,
  manualOverrides?: {
    badge?: Partial<SceneElement>
    image?: Partial<SceneElement>
  },
  formatKey?: FormatKey | string,
): Scene {
  const next: Scene = JSON.parse(JSON.stringify(scene)) as Scene
  const imgW = next.image.w ?? 0
  const imgH = next.image.h ?? 0
  const parentIsImage = imgW > 0 && imgH > 0

  if (parentIsImage) {
    const badgeBase = imageAnalysis?.dominantColors?.[0] ?? next.background[1]
    const badgeCandidates = [brandKit.accentColor, '#FFFFFF', '#000000', '#F8FAFC']
    next.badge.bg = mostContrastingColor(badgeBase, badgeCandidates)
    next.badge.fill = getContrastingText(next.badge.bg)
    next.badge.bgOpacity = 1

    const mp = isMarketplaceZoneLayoutScene(next, formatKey)
    if (!mp) {
      const irx = next.image.rx ?? 0
      if (irx >= 24) {
        next.badge.rx = 20
      } else if (irx >= 10) {
        next.badge.rx = 10
      } else {
        next.badge.rx = 4
      }

      const imageArea = (imgW * imgH) / 10000
      next.badge.w = clamp(imageArea * 18, 10, 22)
      next.badge.h = clamp(imageArea * 6, 4, 7)

      const bgTopLum = hexLuminance(next.background[0]) ?? 0.5
      if (bgTopLum >= 0.15) {
        const rx = next.image.rx ?? 0
        if (rx >= 24) {
          next.image.rx = 20
        } else if (rx < 10) {
          next.image.rx = 14
        }
      }
    } else {
      if (brandKit.ctaStyle === 'pill') {
        next.badge.rx = 20
      } else if (brandKit.ctaStyle === 'rounded') {
        next.badge.rx = 10
      } else {
        next.badge.rx = 4
      }
    }

    const mood = imageAnalysis?.mood
    if (mood === 'dark') {
      next.image.strokeColor = 'rgba(255,255,255,0.20)'
    } else if (mood === 'light') {
      next.image.strokeColor = 'rgba(0,0,0,0.10)'
    } else {
      next.image.strokeColor = 'rgba(255,255,255,0.15)'
    }
  } else {
    next.badge.bg = brandKit.accentColor
    next.badge.fill = getContrastingText(brandKit.accentColor)
    next.badge.bgOpacity = 1
    if (brandKit.ctaStyle === 'pill') {
      next.badge.rx = 20
    } else if (brandKit.ctaStyle === 'rounded') {
      next.badge.rx = 10
    } else {
      next.badge.rx = 4
    }
  }

  if (manualOverrides?.badge) Object.assign(next.badge, manualOverrides.badge)
  if (manualOverrides?.image) Object.assign(next.image, manualOverrides.image)

  return next
}

export function adaptElementsToContext(
  scene: Scene,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  brandKit: BrandKit,
): Scene {
  const next: Scene = JSON.parse(JSON.stringify(scene)) as Scene
  const primaryFill = resolvePrimaryTextFill(brandKit, imageAnalysis)

  const profile = imageAnalysis?.imageProfile
  if (profile === 'portrait' || profile === 'tall') {
    const base = next.title.fontSize ?? 48
    next.title.fontSize = Math.round(base * 0.9)
  } else if (profile === 'ultraWide') {
    const base = next.title.fontSize ?? 48
    next.title.fontSize = Math.round(base * 1.1)
  }

  next.title.fill = primaryFill

  if (imageAnalysis?.detectedContrast === 'low') {
    next.subtitle.opacity = 0.95
  } else if (imageAnalysis?.detectedContrast === 'high') {
    next.subtitle.opacity = 0.78
  } else {
    next.subtitle.opacity = 0.86
  }
  next.subtitle.fill = primaryFill

  next.cta.bg = brandKit.accentColor
  next.cta.fill = getContrastingText(brandKit.accentColor)
  if (brandKit.ctaStyle === 'pill') {
    next.cta.rx = 26
  } else if (brandKit.ctaStyle === 'rounded') {
    next.cta.rx = 14
  } else {
    next.cta.rx = 4
  }

  next.logo.bgOpacity = imageAnalysis?.detectedContrast === 'high' ? 0.22 : 0.12

  next.badge.bg = brandKit.accentColor
  next.badge.fill = getContrastingText(brandKit.accentColor)
  next.badge.bgOpacity = 1

  if (imageAnalysis?.focalPoint) {
    next.image.focalX = imageAnalysis.focalPoint.x
    next.image.focalY = imageAnalysis.focalPoint.y
  }

  return next
}

function titleWeightFromTone(toneOfVoice: string): number {
  const t = toneOfVoice.toLowerCase()
  if (t.includes('bold') || t.includes('energetic')) return 800
  if (t.includes('refined') || t.includes('polished')) return 600
  return 720
}

export function adaptElementsToBrandKit(scene: Scene, brandKit: BrandKit): Scene {
  const next: Scene = JSON.parse(JSON.stringify(scene)) as Scene

  next.title.fontFamily = brandKit.fontFamily
  next.title.weight = titleWeightFromTone(brandKit.toneOfVoice)

  next.subtitle.fontFamily = brandKit.fontFamily
  next.subtitle.weight = 400

  next.cta.bg = brandKit.accentColor
  next.cta.fill = getContrastingText(brandKit.accentColor)
  if (brandKit.ctaStyle === 'pill') {
    next.cta.rx = 26
  } else if (brandKit.ctaStyle === 'rounded') {
    next.cta.rx = 14
  } else {
    next.cta.rx = 4
  }

  next.logo.bg = brandKit.primaryColor
  next.logo.bgOpacity = 0.1
  next.logo.fill = getContrastingText(brandKit.primaryColor)

  next.badge.bg = brandKit.accentColor
  next.badge.fill = getContrastingText(brandKit.accentColor)
  next.badge.bgOpacity = 1

  next.background = [...brandKit.background] as [string, string, string]
  next.accent = brandKit.accentColor

  return next
}
