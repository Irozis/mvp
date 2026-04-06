import type { LayoutAssessment, PerceptualSignals, Rect, Scene, SceneElement } from './types'

type ActiveElementKind = 'image' | 'headline' | 'subtitle' | 'cta'

type ActiveElement = {
  kind: ActiveElementKind
  rect: Rect
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function hasRenderableText(element: SceneElement) {
  return typeof element.text === 'string' ? element.text.trim().length > 0 : false
}

function toRect(kind: ActiveElementKind, element: SceneElement, options?: { requireText?: boolean }): ActiveElement | null {
  const width = typeof element.w === 'number' ? element.w : 0
  const height = typeof element.h === 'number' ? element.h : 0
  if (width <= 0 || height <= 0) return null
  if (options?.requireText && !hasRenderableText(element)) return null
  return {
    kind,
    rect: {
      x: element.x,
      y: element.y,
      w: width,
      h: height,
    },
  }
}

function getRight(rect: Rect) {
  return rect.x + rect.w
}

function getBottom(rect: Rect) {
  return rect.y + rect.h
}

function getArea(rect: Rect) {
  return Math.max(0, rect.w) * Math.max(0, rect.h)
}

function getCenter(rect: Rect) {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  }
}

function unionRect(rects: Rect[]) {
  if (!rects.length) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => getRight(rect)))
  const bottom = Math.max(...rects.map((rect) => getBottom(rect)))
  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  } satisfies Rect
}

function gapBetweenRects(a: Rect, b: Rect) {
  const horizontalGap = Math.max(0, Math.max(a.x - getRight(b), b.x - getRight(a)))
  const verticalGap = Math.max(0, Math.max(a.y - getBottom(b), b.y - getBottom(a)))
  return Math.sqrt(horizontalGap ** 2 + verticalGap ** 2)
}

function centerDistance(a: Rect, b: Rect) {
  const first = getCenter(a)
  const second = getCenter(b)
  return Math.sqrt((first.x - second.x) ** 2 + (first.y - second.y) ** 2)
}

function getTextElements(scene: Scene) {
  return [
    toRect('headline', scene.title, { requireText: true }),
    toRect('subtitle', scene.subtitle, { requireText: true }),
    toRect('cta', scene.cta, { requireText: true }),
  ].filter((value): value is ActiveElement => Boolean(value))
}

function getActiveElements(scene: Scene) {
  return [
    toRect('image', scene.image),
    ...getTextElements(scene),
  ].filter((value): value is ActiveElement => Boolean(value))
}

function computePrimaryElement(elements: ActiveElement[]): Pick<PerceptualSignals, 'hasClearPrimary' | 'primaryElement'> {
  const candidates = [
    {
      kind: 'image' as const,
      score: getArea(elements.find((element) => element.kind === 'image')?.rect || { x: 0, y: 0, w: 0, h: 0 }),
    },
    {
      kind: 'headline' as const,
      score: getArea(elements.find((element) => element.kind === 'headline')?.rect || { x: 0, y: 0, w: 0, h: 0 }) * 1.12,
    },
    {
      kind: 'cta' as const,
      score: getArea(elements.find((element) => element.kind === 'cta')?.rect || { x: 0, y: 0, w: 0, h: 0 }) * 1.18,
    },
  ].sort((left, right) => right.score - left.score)

  const winner = candidates[0]
  const runnerUp = candidates[1]
  if (!winner || winner.score <= 0) {
    return { hasClearPrimary: false, primaryElement: 'none' }
  }
  if (!runnerUp || winner.score >= runnerUp.score * 1.3) {
    return { hasClearPrimary: true, primaryElement: winner.kind }
  }
  return { hasClearPrimary: false, primaryElement: 'none' }
}

function computeClusterCohesion(textElements: ActiveElement[]) {
  if (textElements.length < 2) return 50
  const rects = textElements.map((element) => element.rect)
  const bounds = unionRect(rects)
  if (!bounds) return 50
  const totalArea = rects.reduce((sum, rect) => sum + getArea(rect), 0)
  const boundsArea = getArea(bounds)
  const compactnessPenalty = Math.max(0, boundsArea - totalArea) / 28
  const pairDistances: number[] = []
  for (let index = 1; index < rects.length; index += 1) {
    pairDistances.push(gapBetweenRects(rects[index - 1], rects[index]))
  }
  const averageGap = pairDistances.reduce((sum, value) => sum + value, 0) / Math.max(1, pairDistances.length)
  const spreadPenalty = averageGap * 4.6 + compactnessPenalty
  return clampScore(100 - spreadPenalty)
}

function computeCtaIntegration(textElements: ActiveElement[]) {
  const cta = textElements.find((element) => element.kind === 'cta')
  const textWithoutCta = textElements.filter((element) => element.kind !== 'cta')
  if (!cta || !textWithoutCta.length) return 35
  const textBounds = unionRect(textWithoutCta.map((element) => element.rect))
  if (!textBounds) return 35
  const gap = gapBetweenRects(cta.rect, textBounds)
  const alignmentDelta = Math.min(
    Math.abs(cta.rect.x - textBounds.x),
    Math.abs(getCenter(cta.rect).x - getCenter(textBounds).x)
  )
  const gapPenalty = gap * 6.4
  const alignmentPenalty = alignmentDelta * 1.8
  const detachedFooterPenalty = cta.rect.y > getBottom(textBounds) + 10 ? 10 : 0
  return clampScore(100 - gapPenalty - alignmentPenalty - detachedFooterPenalty)
}

function computeVisualBalance(elements: ActiveElement[]) {
  if (!elements.length) return 0
  const totalArea = elements.reduce((sum, element) => sum + getArea(element.rect), 0)
  if (totalArea <= 0) return 0
  const weightedCenter = elements.reduce(
    (acc, element) => {
      const area = getArea(element.rect)
      const center = getCenter(element.rect)
      acc.x += center.x * area
      acc.y += center.y * area
      return acc
    },
    { x: 0, y: 0 }
  )
  const centroid = { x: weightedCenter.x / totalArea, y: weightedCenter.y / totalArea }
  const centroidDrift = Math.sqrt((centroid.x - 50) ** 2 + (centroid.y - 50) ** 2)
  const leftArea = elements
    .filter((element) => getCenter(element.rect).x < 50)
    .reduce((sum, element) => sum + getArea(element.rect), 0)
  const rightArea = totalArea - leftArea
  const topArea = elements
    .filter((element) => getCenter(element.rect).y < 50)
    .reduce((sum, element) => sum + getArea(element.rect), 0)
  const bottomArea = totalArea - topArea
  const horizontalImbalance = Math.abs(leftArea - rightArea) / totalArea
  const verticalImbalance = Math.abs(topArea - bottomArea) / totalArea
  return clampScore(100 - centroidDrift * 1.8 - horizontalImbalance * 42 - verticalImbalance * 36)
}

function computeDeadSpaceScore(elements: ActiveElement[], assessment?: LayoutAssessment) {
  if (!elements.length) return 100
  const bounds = unionRect(elements.map((element) => element.rect))
  if (!bounds) return 100
  const occupiedArea = elements.reduce((sum, element) => sum + getArea(element.rect), 0)
  const normalizedOccupiedArea = Math.min(1, occupiedArea / 10000)
  const structuralOccupiedArea = assessment?.structuralState?.metrics.occupiedSafeArea || normalizedOccupiedArea
  const left = bounds.x
  const right = 100 - getRight(bounds)
  const top = bounds.y
  const bottom = 100 - getBottom(bounds)
  const emptySidePenalty = Math.max(left, right, top, bottom) * 0.8
  const sparsePenalty = Math.max(0, 0.26 - structuralOccupiedArea) * 260
  return clampScore(emptySidePenalty + sparsePenalty)
}

function computeDominance(elements: ActiveElement[]) {
  const image = elements.find((element) => element.kind === 'image')
  const totalArea = elements.reduce((sum, element) => sum + getArea(element.rect), 0) || 1
  const imageArea = image ? getArea(image.rect) : 0
  const textArea = elements
    .filter((element) => element.kind !== 'image')
    .reduce((sum, element) => sum + getArea(element.rect), 0)
  return {
    imageDominance: clampScore((imageArea / totalArea) * 100),
    textDominance: clampScore((textArea / totalArea) * 100),
  }
}

function computeReadingFlowClarity(textElements: ActiveElement[]) {
  const headline = textElements.find((element) => element.kind === 'headline')
  const subtitle = textElements.find((element) => element.kind === 'subtitle')
  const cta = textElements.find((element) => element.kind === 'cta')
  if (!headline || !cta) return 35
  let penalty = 0
  if (subtitle && subtitle.rect.y < headline.rect.y) penalty += 18
  if (cta.rect.y + cta.rect.h < headline.rect.y + headline.rect.h) penalty += 26
  if (subtitle && cta.rect.y + cta.rect.h < subtitle.rect.y + subtitle.rect.h) penalty += 18
  const headlineToCtaDistance = centerDistance(headline.rect, cta.rect)
  penalty += Math.max(0, headlineToCtaDistance - 28) * 1.2
  if (subtitle) {
    penalty += Math.abs(subtitle.rect.x - headline.rect.x) * 0.9
  }
  penalty += Math.abs(cta.rect.x - headline.rect.x) * 0.7
  return clampScore(100 - penalty)
}

export function computePerceptualSignals(scene: Scene, assessment?: LayoutAssessment): PerceptualSignals {
  const elements = getActiveElements(scene)
  const textElements = getTextElements(scene)
  const primary = computePrimaryElement(elements)
  return {
    ...primary,
    clusterCohesion: computeClusterCohesion(textElements),
    ctaIntegration: computeCtaIntegration(textElements),
    visualBalance: computeVisualBalance(elements),
    deadSpaceScore: computeDeadSpaceScore(elements, assessment),
    ...computeDominance(elements),
    readingFlowClarity: computeReadingFlowClarity(textElements),
  }
}
