import type { Scene } from './types'

export type SharedBadgeSemantic = 'badge' | 'price' | 'none'

function trimText(text?: string) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

export function hasVisibleSceneRegion(input: { w?: number; h?: number }) {
  return (input.w || 0) > 0 && (input.h || 0) > 0
}

export function looksLikePriceBadgeText(text?: string) {
  const normalized = trimText(text)
  if (!normalized) return false
  if (/%/.test(normalized)) return false
  if (/\b(off|sale|save|new|free|limited|bonus|gift|deal)\b/i.test(normalized)) return false
  if (/[$€£¥₹₽]/.test(normalized)) return true
  return /^(from\s+)?\d{1,4}(?:[.,]\d{1,2})?(?:\s?(?:usd|eur|rub|руб|р))?$/i.test(normalized)
}

export function resolveSharedBadgeSemantic(scene: Scene): SharedBadgeSemantic {
  const text = trimText(scene.badge.text)
  if (!text && !hasVisibleSceneRegion(scene.badge)) return 'none'
  return looksLikePriceBadgeText(text) ? 'price' : 'badge'
}
