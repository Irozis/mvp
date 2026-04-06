import { getContrastingText } from './imageAnalysis'
import type { BrandKit, PalettePlan, ScenarioKey, VisualSystemKey } from './types'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function hexToRgb(hex: string) {
  const cleaned = hex.replace('#', '')
  const normalized = cleaned.length === 3 ? cleaned.split('').map((part) => `${part}${part}`).join('') : cleaned
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0')).join('')}`
}

function mix(hexA: string, hexB: string, ratio: number) {
  const left = hexToRgb(hexA)
  const right = hexToRgb(hexB)
  const weight = clamp(ratio, 0, 1)
  return rgbToHex(
    left.r + (right.r - left.r) * weight,
    left.g + (right.g - left.g) * weight,
    left.b + (right.b - left.b) * weight
  )
}

export function computePalette({
  brandKit,
  visualSystem,
  scenario,
}: {
  brandKit: BrandKit
  visualSystem: VisualSystemKey
  scenario: ScenarioKey
}): PalettePlan {
  const accent = brandKit.accentColor
  const baseBackground = [...brandKit.background] as [string, string, string]
  const isPromo = scenario === 'bold-offer'
  const isLuxury = scenario === 'luxury-minimal' || visualSystem === 'luxury-clean'
  const isEditorial = scenario === 'editorial-story' || visualSystem === 'editorial'

  const background: [string, string, string] = isLuxury
    ? [mix(baseBackground[0], '#ffffff', 0.18), mix(baseBackground[1], '#f7f0e8', 0.2), mix(baseBackground[2], '#d9c7aa', 0.16)]
    : isPromo
      ? [mix(baseBackground[0], accent, 0.1), baseBackground[1], mix(baseBackground[2], accent, 0.18)]
      : isEditorial
        ? [mix(baseBackground[0], '#ffffff', 0.08), mix(baseBackground[1], '#dbe4ea', 0.1), baseBackground[2]]
        : baseBackground

  const textPrimary = getContrastingText(background[1])
  const textSecondary = mix(textPrimary, background[1], textPrimary === '#0f172a' ? 0.28 : 0.18)
  const ctaBackground = isLuxury ? mix(accent, '#ffffff', 0.08) : accent
  const ctaText = getContrastingText(ctaBackground)
  const badgeBackground = isPromo ? accent : mix(background[0], '#ffffff', textPrimary === '#0f172a' ? 0.82 : 0.12)
  const badgeText = getContrastingText(badgeBackground)
  const surface = mix(background[0], textPrimary === '#0f172a' ? '#ffffff' : '#111827', textPrimary === '#0f172a' ? 0.78 : 0.24)

  return {
    background,
    surface,
    textPrimary,
    textSecondary,
    accent,
    ctaBackground,
    ctaText,
    badgeBackground,
    badgeText,
    overlayStrength: isPromo ? 0.26 : isLuxury ? 0.14 : isEditorial ? 0.18 : 0.2,
  }
}
