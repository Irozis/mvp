import type { Elem, SceneGeo } from './svgGeometry'

export interface RuleResult {
  rule: string
  passed: boolean
  score: number
  detail: string
}

export interface DesignAudit {
  results: RuleResult[]
  overallScore: number
  passed: boolean
}

const MAX_QUADRANT_DEVIATION = 0.375

function quadrantFromCenter(cxPct: number, cyPct: number): 'q1' | 'q2' | 'q3' | 'q4' {
  if (cxPct < 50 && cyPct < 50) return 'q1'
  if (cxPct >= 50 && cyPct < 50) return 'q2'
  if (cxPct < 50 && cyPct >= 50) return 'q3'
  return 'q4'
}

function center(el: Elem): { cx: number; cy: number } | null {
  if (!el) return null
  return { cx: el.x + el.width / 2, cy: el.y + el.height / 2 }
}

function elemCenterPct(el: Elem, vbW: number, vbH: number): { cxPct: number; cyPct: number } | null {
  if (!el || vbW <= 0 || vbH <= 0) return null
  const c = center(el)
  if (!c) return null
  return {
    cxPct: (c.cx / vbW) * 100,
    cyPct: (c.cy / vbH) * 100,
  }
}

function shouldCountClipped(el: Elem): boolean {
  if (!el) return false
  if (el.isSlice) return false
  return el.clipped
}

export function checkProportions(geo: SceneGeo): RuleResult {
  const candidates: Array<{ key: string; el: Elem }> = [
    { key: 'image', el: geo.image ?? null },
    { key: 'headline', el: geo.headline ?? null },
    { key: 'cta', el: geo.cta ?? null },
  ]
  const clipped = candidates.filter((c) => c.el && shouldCountClipped(c.el)).map((c) => c.key)
  const clippedCount = clipped.length
  const score = Math.max(0, 1.0 - clippedCount * 0.4)
  return {
    rule: 'proportions',
    passed: score >= 0.6,
    score,
    detail: clippedCount === 0 ? 'all elements within bounds' : `clipped: ${clipped.join(', ')}`,
  }
}

export function checkTypography(geo: SceneGeo): RuleResult {
  const headlineFs = geo.headline?.fontSize ?? null
  const subtitleFs = geo.subtitle?.fontSize ?? null
  const ctaFs = geo.cta?.fontSize ?? null

  if (headlineFs === null && subtitleFs === null) {
    return {
      rule: 'typography hierarchy',
      passed: true,
      score: 0.5,
      detail: 'font-size not readable from SVG — heuristic fallback',
    }
  }

  let score = 0.5
  let detail = ''

  if (headlineFs != null) {
    if (subtitleFs != null) {
      const ratio = headlineFs / subtitleFs
      if (ratio >= 1.5) score = 1.0
      else if (ratio >= 1.2) score = 0.85
      else if (ratio >= 1.0) score = 0.65
      else if (ratio >= 0.8) score = 0.4
      else score = 0.2
      detail = `headline/subtitle ratio ${ratio.toFixed(2)}`
    } else {
      score = 1.0
      detail = 'subtitle font-size not found — cannot compare'
    }
  } else {
    detail = 'headline font-size not found — cannot compare'
    score = 0.5
  }

  if (ctaFs !== null && headlineFs !== null && ctaFs > headlineFs) {
    score = Math.min(score, 0.3)
    detail = detail ? `${detail} | CTA larger than headline` : 'CTA larger than headline'
  }

  return {
    rule: 'typography hierarchy',
    passed: score >= 0.6,
    score,
    detail: detail || 'typography hierarchy',
  }
}

function addQ(
  q: 'q1' | 'q2' | 'q3' | 'q4',
  w: number,
  buckets: { q1: number; q2: number; q3: number; q4: number },
): void {
  if (q === 'q1') buckets.q1 += w
  else if (q === 'q2') buckets.q2 += w
  else if (q === 'q3') buckets.q3 += w
  else buckets.q4 += w
}

export function checkBalance(geo: SceneGeo, archetypeId: string): RuleResult {
  const vbW = geo.vbW
  const vbH = geo.vbH
  const buckets = { q1: 0, q2: 0, q3: 0, q4: 0 }

  const weighted: Array<{ el: Elem; weight: number }> = [
    { el: geo.image ?? null, weight: 3 },
    { el: geo.headline ?? null, weight: 2 },
    { el: geo.cta ?? null, weight: 1.5 },
    { el: geo.subtitle ?? null, weight: 1 },
    { el: geo.badge ?? null, weight: 0.5 },
    { el: geo.logo ?? null, weight: 0.5 },
  ]

  for (const { el, weight } of weighted) {
    if (!el) continue
    const pct = elemCenterPct(el, vbW, vbH)
    if (!pct) continue
    const q = quadrantFromCenter(pct.cxPct, pct.cyPct)
    addQ(q, weight, buckets)
  }

  const totalWeight = buckets.q1 + buckets.q2 + buckets.q3 + buckets.q4
  if (totalWeight === 0) {
    return {
      rule: 'composition balance',
      passed: true,
      score: 0.75,
      detail: 'no weighted elements — skipped',
    }
  }

  const q1n = buckets.q1 / totalWeight
  const q2n = buckets.q2 / totalWeight
  const q3n = buckets.q3 / totalWeight
  const q4n = buckets.q4 / totalWeight

  const deviation =
    (Math.abs(q1n - 0.25) + Math.abs(q2n - 0.25) + Math.abs(q3n - 0.25) + Math.abs(q4n - 0.25)) / 4
  const normalizedDeviation = deviation / MAX_QUADRANT_DEVIATION
  const rawScore = Math.max(0, Math.min(1, 1.0 - normalizedDeviation))

  let minPass = 0.5
  let thresholdLabel = 'default (hero/balanced/unknown)'

  if (
    archetypeId.includes('image-hero') ||
    archetypeId.includes('hero-shelf') ||
    archetypeId === 'overlay-balanced'
  ) {
    minPass = 0.3
    thresholdLabel = 'hero-family (>=0.30)'
  } else if (archetypeId.includes('split-') || archetypeId === 'split-vertical') {
    minPass = 0.3
    thresholdLabel = 'split family (>=0.30)'
  } else if (archetypeId === 'v2-card-full-bleed-overlay') {
    minPass = 0.3
    thresholdLabel = 'full-bleed-overlay (>=0.30)'
  } else if (
    archetypeId === 'v2-card-text-only' ||
    archetypeId === 'text-stack' ||
    archetypeId === 'dense-information' ||
    archetypeId.includes('text-focus')
  ) {
    minPass = 0.35
    thresholdLabel = 'text-heavy (>=0.35)'
  }

  return {
    rule: 'composition balance',
    passed: rawScore >= minPass,
    score: rawScore,
    detail: `q=${q1n.toFixed(2)}/${q2n.toFixed(2)}/${q3n.toFixed(2)}/${q4n.toFixed(2)} threshold ${thresholdLabel} (need ${minPass.toFixed(2)})`,
  }
}

export function checkArchetypeMatch(geo: SceneGeo, archetypeId: string): RuleResult {
  const img = center(geo.image ?? null)
  const head = center(geo.headline ?? null)
  const vbW = geo.vbW
  const vbH = geo.vbH
  const midX = vbW * 0.5
  const midY = vbH * 0.5

  const splitRightGroup =
    archetypeId === 'v2-card-split-image-right' ||
    archetypeId === 'v2-tile-split-balanced' ||
    archetypeId === 'split-vertical'

  if (splitRightGroup) {
    const imgRight = Boolean(img && img.cx > midX)
    const headLeft = Boolean(head && head.cx < midX)
    const hits = [imgRight, headLeft].filter(Boolean).length
    const score = hits === 2 ? 1.0 : hits === 1 ? 0.5 : 0.0
    return {
      rule: 'archetype match',
      passed: score >= 0.5,
      score,
      detail: `split-right: imageRight=${imgRight} headlineLeft=${headLeft}`,
    }
  }

  const splitLeftGroup = archetypeId === 'v2-card-split-image-left' || archetypeId === 'v2-tile-image-left'
  if (splitLeftGroup) {
    const imgLeft = Boolean(img && img.cx < midX)
    const headRight = Boolean(head && head.cx > midX)
    const hits = [imgLeft, headRight].filter(Boolean).length
    const score = hits === 2 ? 1.0 : hits === 1 ? 0.5 : 0.0
    return {
      rule: 'archetype match',
      passed: score >= 0.5,
      score,
      detail: `split-left: imageLeft=${imgLeft} headlineRight=${headRight}`,
    }
  }

  if (archetypeId === 'v2-card-full-bleed-overlay') {
    const fillsW = Boolean(geo.image && geo.image.width >= vbW * 0.9)
    const fillsH = Boolean(geo.image && geo.image.height >= vbH * 0.9)
    const textLow = Boolean(head && head.cy > vbH * 0.45)
    const hits = [fillsW, fillsH, textLow].filter(Boolean).length
    const score = hits === 3 ? 1.0 : hits === 2 ? 0.7 : hits === 1 ? 0.3 : 0.0
    return {
      rule: 'archetype match',
      passed: score >= 0.5,
      score,
      detail: `full-bleed: fillsW=${fillsW} fillsH=${fillsH} textLow=${textLow}`,
    }
  }

  if (archetypeId === 'v2-card-hero-shelf') {
    const shelfImg = Boolean(geo.image && geo.image.height < geo.vbH * 0.30)
    const headlineBelow = Boolean(
      geo.headline &&
      (geo.headline.y + geo.headline.height / 2) > geo.vbH * 0.40
    )
    const hits = [shelfImg, headlineBelow].filter(Boolean).length
    const score = hits === 2 ? 1.0 : hits === 1 ? 0.5 : 0.3
    return {
      rule: 'archetype match',
      passed: score >= 0.5,
      score,
      detail: `hero-shelf: shelfImg=${shelfImg} headlineBelow=${headlineBelow}`,
    }
  }

  const textOnlyGroup =
    archetypeId === 'v2-card-text-only' || archetypeId === 'text-stack' || archetypeId === 'dense-information'
  if (textOnlyGroup) {
    const imgForThumb = geo.thumbnailImage ?? geo.image
    const imgArea = imgForThumb ? imgForThumb.width * imgForThumb.height : 0
    const cap = vbW * vbH
    // v2-card-text-only slot is ~25×22% of canvas (~5.5% area); 0.15×cap matches that in viewBox units.
    // When the SVG still exposes a large split-column <image>, thumbnailImage may remain wide — allow <60% canvas so we stay below full-bleed while rejecting edge-to-edge fills.
    const smallImg =
      !imgForThumb ||
      (archetypeId === 'v2-card-text-only' ? imgArea < cap * 0.6 : imgArea < cap * 0.15)
    const wideHead = Boolean(geo.headline && geo.headline.width > vbW * 0.4)
    const hits = [smallImg, wideHead].filter(Boolean).length
    const score = hits === 2 ? 1.0 : hits === 1 ? 0.5 : 0.0
    return {
      rule: 'archetype match',
      passed: score >= 0.5,
      score,
      detail: `text-only: smallImg=${smallImg} wideHead=${wideHead}`,
    }
  }

  const heroGroup =
    archetypeId === 'image-hero' || archetypeId === 'v2-card-hero-shelf' || archetypeId === 'overlay-balanced'
  if (heroGroup) {
    const largeImg = Boolean(geo.image && geo.image.width > vbW * 0.6)
    const score = largeImg ? 1.0 : 0.3
    return {
      rule: 'archetype match',
      passed: score >= 0.5,
      score,
      detail: `hero: largeImg=${largeImg}`,
    }
  }

  return {
    rule: 'archetype match',
    passed: true,
    score: 0.75,
    detail: `No geometric rule defined for archetype: ${archetypeId}`,
  }
}

export function auditScene(geo: SceneGeo, archetypeId: string): DesignAudit {
  const results = [
    checkProportions(geo),
    checkTypography(geo),
    checkBalance(geo, archetypeId),
    checkArchetypeMatch(geo, archetypeId),
  ]
  const overallScore =
    results[0].score * 0.3 + results[1].score * 0.25 + results[2].score * 0.25 + results[3].score * 0.2
  return {
    results,
    overallScore,
    passed: overallScore >= 0.65,
  }
}
