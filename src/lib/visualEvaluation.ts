import type {
  EnhancedImageAnalysis,
  FormatDefinition,
  LayoutAssessment,
  Scene,
  VisualAssessment,
  VisualAssessmentBand,
  VisualAssessmentBreakdown,
} from './types'

type VisualEvaluationContext = {
  scene: Scene
  format: FormatDefinition
  assessment: LayoutAssessment
  imageAnalysis?: EnhancedImageAnalysis
}

type Rect = {
  x: number
  y: number
  w: number
  h: number
}

type SceneTextBlock = {
  x: number
  y: number
  w?: number
  h?: number
  text?: string
  fontSize?: number
  maxLines?: number
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function rectArea(rect: Rect) {
  return Math.max(0, rect.w) * Math.max(0, rect.h)
}

function centerOf(rect: Rect) {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  }
}

function mergeRects(rects: Rect[]) {
  if (!rects.length) return null
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h))
  return {
    x,
    y,
    w: maxX - x,
    h: maxY - y,
  }
}

function distanceBetweenRects(left: Rect, right: Rect) {
  const dx = Math.max(0, Math.max(left.x - (right.x + right.w), right.x - (left.x + left.w)))
  const dy = Math.max(0, Math.max(left.y - (right.y + right.h), right.y - (left.y + left.h)))
  return Math.sqrt(dx * dx + dy * dy)
}

function bandFromScore(score: number): VisualAssessmentBand {
  if (score >= 82) return 'strong'
  if (score >= 68) return 'acceptable'
  if (score >= 52) return 'weak'
  return 'poor'
}

function uniqueMessages(messages: string[]) {
  return [...new Set(messages.filter(Boolean))]
}

function estimateTextHeight(block: SceneTextBlock, formatHeight: number, fallbackLines: number) {
  if ((block.h || 0) > 0) return block.h || 0
  if (!block.text?.trim()) return 0
  const fontSize = block.fontSize || 16
  const lines = Math.max(1, block.maxLines || fallbackLines)
  const normalizedLineHeight = (fontSize * 1.22 * 100) / Math.max(1, formatHeight)
  return Math.max(3.2, normalizedLineHeight * lines)
}

function getSceneRects(scene: Scene, formatHeight: number) {
  const title = {
    x: scene.title.x,
    y: scene.title.y,
    w: scene.title.w || 0,
    h: estimateTextHeight(scene.title, formatHeight, 2),
  }
  const subtitle = {
    x: scene.subtitle.x,
    y: scene.subtitle.y,
    w: scene.subtitle.w || 0,
    h: estimateTextHeight(scene.subtitle, formatHeight, 2),
  }
  const cta = { x: scene.cta.x, y: scene.cta.y, w: scene.cta.w || 0, h: scene.cta.h || 0 }
  const image = { x: scene.image.x, y: scene.image.y, w: scene.image.w || 0, h: scene.image.h || 0 }
  const logo = { x: scene.logo.x, y: scene.logo.y, w: scene.logo.w || 0, h: scene.logo.h || 0 }
  const badge = { x: scene.badge.x, y: scene.badge.y, w: scene.badge.w || 0, h: scene.badge.h || 0 }
  const textCluster = mergeRects([title, subtitle, cta].filter((rect) => rectArea(rect) > 0))
  const textOnlyCluster = mergeRects([title, subtitle].filter((rect) => rectArea(rect) > 0))
  const occupiedBounds = mergeRects([title, subtitle, cta, image, logo, badge].filter((rect) => rectArea(rect) > 0))

  return { title, subtitle, cta, image, logo, badge, textCluster, textOnlyCluster, occupiedBounds }
}

function getFocusHierarchyScore(context: VisualEvaluationContext) {
  const { scene } = context
  const rects = getSceneRects(scene, context.format.height)
  const warnings: string[] = []
  const strengths: string[] = []
  const titleWeight = rectArea(rects.title) * 1.1 + (scene.title.fontSize || 0) * 2.2
  const imageWeight = rectArea(rects.image) * 0.95
  const ctaWeight = rectArea(rects.cta) * 1.15 + (scene.cta.h || 0) * 5
  const logoWeight = rectArea(rects.logo) * 0.35
  const badgeWeight = rectArea(rects.badge) * 0.55
  const weights = [
    { key: 'title', value: titleWeight },
    { key: 'image', value: imageWeight },
    { key: 'cta', value: ctaWeight },
    { key: 'logo', value: logoWeight },
    { key: 'badge', value: badgeWeight },
  ].sort((left, right) => right.value - left.value)
  const dominant = weights[0]
  const runnerUp = weights[1]
  const clarity = dominant.value / Math.max(1, runnerUp.value)

  let score = 56 + clamp((clarity - 1) * 24, -18, 26)
  if (dominant.key !== 'title' && dominant.key !== 'image') {
    score -= 10
    warnings.push('No clear primary focus.')
  }
  if (titleWeight < imageWeight * 0.55 && titleWeight < ctaWeight * 0.9) {
    score -= 8
    warnings.push('Headline is not visually dominant enough.')
  }
  if (dominant.key === 'title' && clarity >= 1.2) strengths.push('Headline establishes a readable primary focus.')
  if (dominant.key === 'image' && clarity >= 1.15) strengths.push('Image carries a clear primary focal role.')

  return {
    score: clamp(Math.round(score)),
    warnings,
    strengths,
    debug: {
      dominantFocus: dominant.key,
      dominantWeight: Math.round(dominant.value),
      runnerUpWeight: Math.round(runnerUp.value),
      clarity: Math.round(clarity * 100) / 100,
    },
  }
}

function getCompositionBalanceScore(context: VisualEvaluationContext) {
  const rects = getSceneRects(context.scene, context.format.height)
  const warnings: string[] = []
  const strengths: string[] = []
  const weightedRects = [
    { rect: rects.title, weight: 1.2 },
    { rect: rects.subtitle, weight: 0.6 },
    { rect: rects.cta, weight: 0.85 },
    { rect: rects.image, weight: 1.1 },
    { rect: rects.logo, weight: 0.35 },
    { rect: rects.badge, weight: 0.45 },
  ].filter((entry) => rectArea(entry.rect) > 0)
  const totalWeight = weightedRects.reduce((sum, entry) => sum + rectArea(entry.rect) * entry.weight, 0) || 1
  const center = weightedRects.reduce(
    (sum, entry) => {
      const point = centerOf(entry.rect)
      const weightedArea = rectArea(entry.rect) * entry.weight
      return {
        x: sum.x + point.x * weightedArea,
        y: sum.y + point.y * weightedArea,
      }
    },
    { x: 0, y: 0 }
  )
  const centerX = center.x / totalWeight
  const centerY = center.y / totalWeight
  const textCluster = rects.textCluster
  const headlineCluster = rects.textOnlyCluster || textCluster
  const occupiedBounds = rects.occupiedBounds
  const imageCenter = centerOf(rects.image)
  const textCenter = headlineCluster ? centerOf(headlineCluster) : imageCenter
  const occupiedCenter = occupiedBounds ? centerOf(occupiedBounds) : { x: centerX, y: centerY }
  const verticalStack =
    Boolean(headlineCluster) &&
    rectArea(rects.image) > 0 &&
    Math.abs(imageCenter.x - textCenter.x) <= 18 &&
    Math.abs(imageCenter.y - textCenter.y) >= 16
  const offsetX = Math.abs(centerX - 50)
  const offsetY = Math.abs(centerY - 50)
  const usefulAsymmetry =
    context.format.category === 'marketplace' &&
    Boolean(headlineCluster) &&
    rectArea(rects.image) > 0 &&
    Math.abs(imageCenter.x - textCenter.x) <= 20 &&
    Math.abs(imageCenter.y - textCenter.y) >= 14
  const compactMarketplaceStack =
    context.format.category === 'marketplace' &&
    usefulAsymmetry &&
    Boolean(occupiedBounds) &&
    occupiedBounds!.w >= 52 &&
    occupiedBounds!.h >= 34 &&
    Math.abs(occupiedCenter.x - 50) <= 16 &&
    (!headlineCluster || headlineCluster.w >= 44)
  const offsetScale = compactMarketplaceStack ? 0.22 : verticalStack || usefulAsymmetry ? 0.34 : 1
  const offset = Math.sqrt(offsetX ** 2 + (offsetY * offsetScale) ** 2)
  const quadrantWeights = [0, 0, 0, 0]
  weightedRects.forEach((entry) => {
    const point = centerOf(entry.rect)
    const weightedArea = rectArea(entry.rect) * entry.weight
    const index = point.x < 50 ? (point.y < 50 ? 0 : 2) : point.y < 50 ? 1 : 3
    quadrantWeights[index] += weightedArea
  })
  const maxShare = Math.max(...quadrantWeights) / totalWeight
  const balanceAnchorBonus =
    compactMarketplaceStack && occupiedBounds
      ? clamp(14 - Math.abs(occupiedCenter.x - 50) * 1.2 - Math.max(0, 62 - occupiedBounds.w) * 0.18, 0, 14)
      : 0
  const offsetPenaltyScale = compactMarketplaceStack ? 0.26 : usefulAsymmetry ? 0.58 : 0.95
  const maxShareThreshold = compactMarketplaceStack ? 0.9 : usefulAsymmetry ? 0.66 : 0.46
  const maxSharePenaltyScale = compactMarketplaceStack ? 6 : usefulAsymmetry ? 24 : 55

  let score =
    88 -
    offset * offsetPenaltyScale -
    Math.max(0, maxShare - maxShareThreshold) * maxSharePenaltyScale +
    balanceAnchorBonus
  if (offset > (compactMarketplaceStack ? 38 : usefulAsymmetry ? 29 : 22)) {
    warnings.push('Visual mass collapses into one corner.')
    score -= 8
  }
  if (maxShare > (compactMarketplaceStack ? 0.92 : usefulAsymmetry ? 0.72 : 0.58)) {
    warnings.push('Composition lacks counterweight.')
    score -= 8
  }
  if (offset < 13 && maxShare < 0.5) strengths.push('Visual mass feels intentionally balanced across the canvas.')
  if (usefulAsymmetry && offset <= 24) strengths.push('Asymmetry feels intentional rather than accidental.')
  if (compactMarketplaceStack) strengths.push('Compact stack reads as a deliberate marketplace composition.')

  return {
    score: clamp(Math.round(score)),
    warnings,
    strengths,
    debug: {
      visualCenterX: Math.round(centerX * 10) / 10,
      visualCenterY: Math.round(centerY * 10) / 10,
      verticalStack,
      usefulAsymmetry,
      compactMarketplaceStack,
      centerOffset: Math.round(offset * 10) / 10,
      balanceAnchorBonus: Math.round(balanceAnchorBonus * 10) / 10,
      dominantQuadrantShare: Math.round(maxShare * 100) / 100,
    },
  }
}

function getTextImageHarmonyScore(context: VisualEvaluationContext) {
  const rects = getSceneRects(context.scene, context.format.height)
  const warnings: string[] = []
  const strengths: string[] = []
  const textCluster = rects.textCluster
  const image = rects.image
  const imageCoverage = rectArea(image) / 100
  const textCoverage = rectArea(textCluster || rects.title) / 100
  const ratio = imageCoverage / Math.max(1, textCoverage)
  const gap = textCluster ? distanceBetweenRects(textCluster, image) : 0

  let score = 78
  score -= Math.abs(ratio - 1.1) * 14
  score -= Math.max(0, gap - 8) * 1.4
  if (imageCoverage < 7.5) {
    score -= 14
    warnings.push('Image feels detached from the text cluster.')
  }
  if (!context.imageAnalysis && imageCoverage < 12) {
    score -= 10
    warnings.push('Image presence is too weak to support the message.')
  }
  if (ratio < 0.45 || ratio > 2.8) {
    score -= 8
    warnings.push('Text-image ratio feels weak.')
  }
  if (gap > 18) warnings.push('Image feels compositionally detached from the message.')
  if (ratio >= 0.7 && ratio <= 1.8 && gap <= 10) strengths.push('Text and image read as a coordinated composition.')

  return {
    score: clamp(Math.round(score)),
    warnings,
    strengths,
    debug: {
      imageCoverage: Math.round(imageCoverage * 10) / 10,
      textCoverage: Math.round(textCoverage * 10) / 10,
      imageTextRatio: Math.round(ratio * 100) / 100,
      imageTextGap: Math.round(gap * 10) / 10,
    },
  }
}

function getCtaQualityScore(context: VisualEvaluationContext) {
  const rects = getSceneRects(context.scene, context.format.height)
  const warnings: string[] = []
  const strengths: string[] = []
  const ctaArea = rectArea(rects.cta)
  const ctaGap = rects.textOnlyCluster ? distanceBetweenRects(rects.textOnlyCluster, rects.cta) : 0
  const ctaCenter = centerOf(rects.cta)
  const textCenter = rects.textOnlyCluster ? centerOf(rects.textOnlyCluster) : ctaCenter
  const horizontalDrift = Math.abs(ctaCenter.x - textCenter.x)

  let score = 52 + (ctaArea - 48) * 0.55 - Math.max(0, ctaGap - 6) * 2.1 - Math.max(0, horizontalDrift - 18) * 0.7
  if (ctaArea < 60) {
    score -= Math.min(14, (60 - ctaArea) * 0.55)
    warnings.push('CTA feels underweighted.')
  }
  if (ctaGap > 12 || horizontalDrift > 24) warnings.push('CTA looks detached from the message.')
  if (ctaArea >= 56 && ctaGap <= 8) strengths.push('CTA feels integrated with the message cluster.')

  return {
    score: clamp(Math.round(score)),
    warnings,
    strengths,
    debug: {
      ctaArea: Math.round(ctaArea * 10) / 10,
      ctaGap: Math.round(ctaGap * 10) / 10,
      ctaHorizontalDrift: Math.round(horizontalDrift * 10) / 10,
    },
  }
}

function getNegativeSpaceQualityScore(context: VisualEvaluationContext) {
  const rects = getSceneRects(context.scene, context.format.height)
  const warnings: string[] = []
  const strengths: string[] = []
  const occupiedBounds = rects.occupiedBounds
  if (!occupiedBounds) {
    return {
      score: 30,
      warnings: ['Canvas underused without compositional payoff.'],
      strengths,
      debug: {
        occupiedBoundsRatio: 0,
      },
    }
  }

  const occupiedBoundsRatio = rectArea(occupiedBounds) / 10000
  const actualCoverage =
    (rectArea(rects.title) +
      rectArea(rects.subtitle) +
      rectArea(rects.cta) +
      rectArea(rects.image) +
      rectArea(rects.logo) +
      rectArea(rects.badge)) /
    10000
  const emptyRatio = 1 - occupiedBoundsRatio
  let score = 84 - Math.max(0, 0.34 - occupiedBoundsRatio) * 130 - Math.max(0, emptyRatio - 0.52) * 70
  score -= Math.max(0, 0.28 - actualCoverage) * 55

  if (occupiedBoundsRatio < 0.32 || emptyRatio > 0.58) warnings.push('Empty space feels accidental.')
  if (actualCoverage < 0.22) warnings.push('Canvas underused without compositional payoff.')
  if (occupiedBoundsRatio >= 0.38 && occupiedBoundsRatio <= 0.76 && emptyRatio <= 0.5) {
    strengths.push('Negative space feels intentional rather than abandoned.')
  }

  return {
    score: clamp(Math.round(score)),
    warnings,
    strengths,
    debug: {
      occupiedBoundsRatio: Math.round(occupiedBoundsRatio * 100) / 100,
      actualCoverage: Math.round(actualCoverage * 100) / 100,
      emptyRatio: Math.round(emptyRatio * 100) / 100,
    },
  }
}

function getCoherenceScore(context: VisualEvaluationContext, breakdown: Omit<VisualAssessmentBreakdown, 'coherence'>) {
  const rects = getSceneRects(context.scene, context.format.height)
  const warnings: string[] = []
  const strengths: string[] = []
  const averageAxis = average(Object.values(breakdown))
  const imageCoverage = rectArea(rects.image) / 100
  const occupiedBoundsRatio = rects.occupiedBounds ? rectArea(rects.occupiedBounds) / 10000 : 0
  let score = averageAxis

  if (imageCoverage < 8 && breakdown.negativeSpaceQuality < 60) {
    score -= 10
    warnings.push('Layout feels technically arranged but not compositionally convincing.')
  }
  if (breakdown.focusHierarchy < 58 && breakdown.ctaQuality < 58) {
    score -= 8
    warnings.push('Composition lacks a confident message hierarchy.')
  }
  if (occupiedBoundsRatio < 0.32 && breakdown.textImageHarmony < 60) {
    score -= 8
  }
  if (averageAxis >= 72) strengths.push('Overall composition reads as a coherent advertising layout.')

  return {
    score: clamp(Math.round(score)),
    warnings,
    strengths,
    debug: {
      averageAxis: Math.round(averageAxis * 10) / 10,
      imageCoverage: Math.round(imageCoverage * 10) / 10,
      occupiedBoundsRatio: Math.round(occupiedBoundsRatio * 100) / 100,
    },
  }
}

export function getVisualAssessment(context: VisualEvaluationContext): VisualAssessment {
  const focusHierarchy = getFocusHierarchyScore(context)
  const compositionBalance = getCompositionBalanceScore(context)
  const textImageHarmony = getTextImageHarmonyScore(context)
  const ctaQuality = getCtaQualityScore(context)
  const negativeSpaceQuality = getNegativeSpaceQualityScore(context)
  const coherence = getCoherenceScore(context, {
    focusHierarchy: focusHierarchy.score,
    compositionBalance: compositionBalance.score,
    textImageHarmony: textImageHarmony.score,
    ctaQuality: ctaQuality.score,
    negativeSpaceQuality: negativeSpaceQuality.score,
  })

  const breakdown: VisualAssessmentBreakdown = {
    focusHierarchy: focusHierarchy.score,
    compositionBalance: compositionBalance.score,
    textImageHarmony: textImageHarmony.score,
    ctaQuality: ctaQuality.score,
    negativeSpaceQuality: negativeSpaceQuality.score,
    coherence: coherence.score,
  }

  const weightedScore =
    breakdown.focusHierarchy * 0.24 +
    breakdown.compositionBalance * 0.2 +
    breakdown.textImageHarmony * 0.18 +
    breakdown.ctaQuality * 0.14 +
    breakdown.negativeSpaceQuality * 0.12 +
    breakdown.coherence * 0.12
  const structuralPenalty =
    context.assessment.structuralState?.status === 'invalid'
      ? 18
      : context.assessment.structuralState?.status === 'degraded'
        ? 8
        : 0
  const overallScore = clamp(Math.round(weightedScore - structuralPenalty))

  return {
    overallScore,
    band: bandFromScore(overallScore),
    breakdown,
    warnings: uniqueMessages([
      ...focusHierarchy.warnings,
      ...compositionBalance.warnings,
      ...textImageHarmony.warnings,
      ...ctaQuality.warnings,
      ...negativeSpaceQuality.warnings,
      ...coherence.warnings,
    ]).slice(0, 6),
    strengths: uniqueMessages([
      ...focusHierarchy.strengths,
      ...compositionBalance.strengths,
      ...textImageHarmony.strengths,
      ...ctaQuality.strengths,
      ...negativeSpaceQuality.strengths,
      ...coherence.strengths,
    ]).slice(0, 4),
    debug: {
      imageAnalysisPresent: Boolean(context.imageAnalysis),
      focusDominant: focusHierarchy.debug?.dominantFocus || null,
      visualBalance: compositionBalance.score,
      compositionBalanceDebug: compositionBalance.debug,
      clusterHarmony: textImageHarmony.score,
      ctaSupport: ctaQuality.score,
      emptySpaceIntentionality: negativeSpaceQuality.score,
      structuralPenalty,
    },
  }
}
