import { getFormatRuleSet } from './formatRules'
import type { FormatDefinition, LayoutIntent, PerceptualSignals, Rect, Scene } from './types'

export type MarketplacePerceptualAdjustment = {
  applied: boolean
  blockedBy?: string
  triggers: string[]
  adjustments: string[]
  perAdjustments?: Array<{
    id: string
    applied: boolean
    delta: {
      cta: number
      cluster: number
      deadSpace: number
      balance: number
      readingFlow: number
    }
    introducedIssues?: string[]
  effectiveRect?: {
    subtitleBefore?: string
    subtitleAfter?: string
    subtitleLineCountBefore?: number
    subtitleLineCountAfter?: number
    subtitleCharsPerLineBefore?: number
    subtitleCharsPerLineAfter?: number
    subtitleMaxLinesBefore?: number
    subtitleMaxLinesAfter?: number
    subtitleLineHeightBefore?: number
    subtitleLineHeightAfter?: number
    subtitleTextLengthBefore?: number
    subtitleTextLengthAfter?: number
    subtitleSourceTextLengthBefore?: number
    subtitleSourceTextLengthAfter?: number
    subtitleFallbackUsedBefore?: boolean
    subtitleFallbackUsedAfter?: boolean
  }
}>
  acceptedBy?: string[]
  gainSummary?: {
    compositeDelta: number
    ctaDelta: number
    clusterDelta: number
    deadSpaceDelta: number
    visualBalanceDelta: number
    textDominanceDelta: number
    readingFlowDelta: number
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function rectBottom(rect: { y: number; h?: number }) {
  return rect.y + (rect.h || 0)
}

function getTextBounds(scene: Scene): Rect {
  const titleRight = scene.title.x + (scene.title.w || 0)
  const subtitleRight = scene.subtitle.x + (scene.subtitle.w || 0)
  const ctaRight = scene.cta.x + (scene.cta.w || 0)
  const bottom = Math.max(rectBottom(scene.title), rectBottom(scene.subtitle), rectBottom(scene.cta))
  return {
    x: Math.min(scene.title.x, scene.subtitle.x, scene.cta.x),
    y: Math.min(scene.title.y, scene.subtitle.y, scene.cta.y),
    w: Math.max(titleRight, subtitleRight, ctaRight) - Math.min(scene.title.x, scene.subtitle.x, scene.cta.x),
    h: bottom - Math.min(scene.title.y, scene.subtitle.y, scene.cta.y),
  }
}

export function refineMarketplaceCardPerceptualComposition(input: {
  scene: Scene
  format: FormatDefinition
  intent: LayoutIntent
  signals: PerceptualSignals
}): {
  scene: Scene
  diagnostics: MarketplacePerceptualAdjustment
} {
  const templateId = input.intent.marketplaceTemplateId
  if (input.format.key !== 'marketplace-card' || !templateId) {
    return {
      scene: input.scene,
      diagnostics: {
        applied: false,
        blockedBy: 'non-marketplace-template',
        triggers: [],
        adjustments: [],
      },
    }
  }

  if (templateId === 'product-support-card') {
    return {
      scene: input.scene,
      diagnostics: {
        applied: false,
        blockedBy: 'image-dominant-template',
        triggers: [],
        adjustments: [],
      },
    }
  }

  const noImageMode = input.intent.marketplaceTemplateSelection?.inputProfile.imageRegime === 'no-image'
  const templatePrefersTextPrimary = templateId === 'text-first-promo' || templateId === 'header-panel-card'

  const triggers: string[] = []
  if (input.signals.ctaIntegration < 48) triggers.push('low-cta-integration')
  if (input.signals.clusterCohesion < 62) triggers.push('weak-cluster-cohesion')
  if (input.signals.deadSpaceScore > 32) triggers.push('high-dead-space')
  if (templatePrefersTextPrimary && input.signals.primaryElement === 'image' && input.signals.textDominance < 52) {
    triggers.push('image-overweight-vs-message')
  }

  if (!triggers.length) {
    return {
      scene: input.scene,
      diagnostics: {
        applied: false,
        blockedBy: 'no-perceptual-weakness',
        triggers: [],
        adjustments: [],
      },
    }
  }

  const safe = getFormatRuleSet(input.format).safeArea
  const next = clone(input.scene)
  const adjustments: string[] = []
  const currentTextBounds = getTextBounds(next)
  const clusterLeft = clamp(Math.min(next.title.x || 0, next.subtitle.x || 0, next.cta.x || 0), safe.x, safe.x + 10)

  if (triggers.includes('weak-cluster-cohesion')) {
    next.title.x = clusterLeft
    next.subtitle.x = clusterLeft
    next.cta.x = clusterLeft
    next.subtitle.y = clamp(
      Math.min(next.subtitle.y || 0, (next.title.y || 0) + 10),
      (next.title.y || 0) + 7,
      (next.title.y || 0) + 10
    )
    next.title.w = clamp(Math.max(next.title.w || 0, Math.min(56, currentTextBounds.w + 4)), 38, 56)
    next.subtitle.w = clamp(Math.max(next.subtitle.w || 0, Math.min(54, currentTextBounds.w + 2)), 34, 54)
    adjustments.push('tightened title/subtitle cluster')
  }

  if (triggers.includes('low-cta-integration')) {
    const anchorY = (next.subtitle.h || 0) > 0 ? rectBottom(next.subtitle) : rectBottom(next.title)
    next.cta.x = clusterLeft
    next.cta.y = clamp(
      Math.min(next.cta.y || 0, anchorY + 6),
      anchorY + 5,
      noImageMode ? 76 : 74
    )
    next.cta.w = clamp(Math.max(next.cta.w || 0, 18), 18, 24)
    adjustments.push('pulled CTA into message cluster')
  }

  if (triggers.includes('high-dead-space')) {
    next.title.w = clamp(Math.max(next.title.w || 0, currentTextBounds.w + 6), 40, 60)
    next.subtitle.w = clamp(Math.max(next.subtitle.w || 0, currentTextBounds.w + 4), 36, 56)
    if (!noImageMode) {
      next.image.x = clamp(Math.min(next.image.x || safe.x, 60), 54, safe.x + safe.w - (next.image.w || 0))
      next.image.y = clamp(Math.max((next.image.y || 0) - 1.5, safe.y + 8), safe.y, safe.y + 16)
    } else {
      next.title.y = clamp(Math.max((next.title.y || 0) - 2, safe.y + 18), safe.y + 18, 46)
      next.subtitle.y = clamp(Math.max((next.subtitle.y || 0) - 2, (next.title.y || 0) + 7), (next.title.y || 0) + 7, 58)
    }
    adjustments.push('reduced purposeless dead space')
  }

  if (triggers.includes('image-overweight-vs-message')) {
    if (!noImageMode) {
      next.image.w = clamp((next.image.w || 0) * 0.92, 20, 30)
      next.image.h = clamp((next.image.h || 0) * 0.94, 20, 32)
      next.image.x = clamp(Math.max(next.image.x || safe.x, 62), 58, safe.x + safe.w - (next.image.w || 0))
    }
    next.title.w = clamp(Math.max(next.title.w || 0, 44), 44, 60)
    next.subtitle.w = clamp(Math.max(next.subtitle.w || 0, 40), 40, 56)
    adjustments.push('rebalanced primary emphasis toward message cluster')
  }

  return {
    scene: next,
    diagnostics: {
      applied: adjustments.length > 0,
      triggers,
      adjustments,
    },
  }
}
