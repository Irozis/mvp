import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FORMAT_MAP } from '../../src/lib/presets'
import { getCompositionModel } from '../../src/lib/formatCompositionModels'
import { getOverlaySafetyPolicy } from '../../src/lib/overlayPolicies'
import type { Rect } from '../../src/lib/types'
import type { CalibrationManifestEntry, ExtractedAnnotation, CaseMetrics } from './socialSquareCalibration.shared'
import { computeCaseMetrics, parsePng, registerImagePixels } from './socialSquareCalibration.shared'

type FailureEntry = {
  id: string
  bucket: 'core' | 'stress' | 'reject'
  classification: string
  outcome: 'still-fail' | 'suspicious-pass'
  taxonomy: string
  mainReasons: string[]
  issueCause: 'thresholds' | 'layout engine' | 'repair logic' | 'dataset classification'
}

type Evaluation = {
  pass: boolean
  failures: string[]
}

type RepairStrategy =
  | 'none'
  | 'soft-square-reflow'
  | 'square-safe-zone-repack'
  | 'square-near-miss-safe-text'
  | 'square-constrained-text-model'
  | 'square-ultra-constrained-micro-band'
  | 'square-balanced-card-fallback'
  | 'ambiguous-skip'
  | 'inspect-only'

type RepairCandidate = {
  strategy: RepairStrategy
  annotation: ExtractedAnnotation
  metrics: CaseMetrics
  evaluation: Evaluation
}

type RepairCase = {
  id: string
  bucket: 'core' | 'stress' | 'reject'
  classification: string
  priority: 'priority' | 'secondary' | 'ambiguous' | 'suspicious' | 'other'
  strategy: RepairStrategy
  before: Evaluation
  after: Evaluation
  beforeMetrics: CaseMetrics
  afterMetrics: CaseMetrics
  improved: boolean
  regressed: boolean
  suspiciousAfter: boolean
  failureAnalysis?: FailureEntry
  imageDataUri: string
  original: ExtractedAnnotation
  repaired: ExtractedAnnotation
}

const ROOT = process.cwd()
const REPORTS_ROOT = path.join(ROOT, 'dataset', 'social-square', 'reports')
const EXTRACTED_ROOT = path.join(ROOT, 'dataset', 'social-square', 'extracted')
const SOCIAL_SQUARE = FORMAT_MAP['social-square']
const HERO_MODEL = getCompositionModel(SOCIAL_SQUARE, 'square-hero-overlay')
const CARD_MODEL = getCompositionModel(SOCIAL_SQUARE, 'square-balanced-card')
const POLICY = getOverlaySafetyPolicy(SOCIAL_SQUARE, HERO_MODEL)

const DUPLICATE_MAP: Record<string, { canonicalId: string }> = {
  'Group 1': { canonicalId: 'Group 16' },
}

const PRIORITY_CASES = new Set(['Group 10', 'Group 6', 'Group 12', 'Group 15'])
const SECONDARY_CASES = new Set(['Group 3', 'Group 20', 'Group 21', 'Group 22', 'Group 24'])
const AMBIGUOUS_CASES = new Set(['Group 5', 'Group 18'])
const SUSPICIOUS_CASES = new Set(['Group 23'])

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, precision = 4) {
  const scale = 10 ** precision
  return Math.round(value * scale) / scale
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function parseJson<T>(content: string) {
  return JSON.parse(content) as T
}

function isExcludedDuplicate(id: string) {
  return Boolean(DUPLICATE_MAP[id])
}

function mergeRects(rects: Rect[]) {
  if (!rects.length) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

function zoneToCaseRect(zoneId: string, width: number, height: number, model = HERO_MODEL) {
  const zone = model?.zones.find((current) => current.id === zoneId)
  if (!zone) throw new Error(`Missing zone ${zoneId} in social-square composition model.`)
  return {
    x: (zone.rect.x / SOCIAL_SQUARE.width) * width,
    y: (zone.rect.y / SOCIAL_SQUARE.height) * height,
    w: (zone.rect.w / SOCIAL_SQUARE.width) * width,
    h: (zone.rect.h / SOCIAL_SQUARE.height) * height,
  }
}

function fitRect(source: Rect | null, zone: Rect, options?: { widthScale?: number; heightScale?: number; yOffset?: number; xOffset?: number }) {
  if (!source) return null
  const widthScale = options?.widthScale ?? 1
  const heightScale = options?.heightScale ?? 1
  const xOffset = options?.xOffset ?? 0
  const yOffset = options?.yOffset ?? 0
  const width = clamp(source.w * widthScale, zone.w * 0.22, zone.w * 0.86)
  const height = clamp(source.h * heightScale, zone.h * 0.08, zone.h * 0.36)
  return {
    x: clamp(zone.x + zone.w * xOffset, zone.x, zone.x + zone.w - width),
    y: clamp(zone.y + zone.h * yOffset, zone.y, zone.y + zone.h - height),
    w: width,
    h: height,
  }
}

function computeEvaluation(metrics: CaseMetrics): Evaluation {
  const failures: string[] = []
  if (typeof metrics.headlineOverlapRatio === 'number' && metrics.headlineOverlapRatio > (POLICY.maxOverlapByKind.headline ?? Infinity)) {
    failures.push(`headline ${round(metrics.headlineOverlapRatio)} > ${POLICY.maxOverlapByKind.headline}`)
  }
  if (typeof metrics.subtitleOverlapRatio === 'number' && metrics.subtitleOverlapRatio > (POLICY.maxOverlapByKind.subtitle ?? Infinity)) {
    failures.push(`subtitle ${round(metrics.subtitleOverlapRatio)} > ${POLICY.maxOverlapByKind.subtitle}`)
  }
  if (typeof metrics.logoOverlapRatio === 'number' && metrics.logoOverlapRatio > (POLICY.maxOverlapByKind.logo ?? Infinity)) {
    failures.push(`logo ${round(metrics.logoOverlapRatio)} > ${POLICY.maxOverlapByKind.logo}`)
  }
  if (typeof metrics.badgeOverlapRatio === 'number' && metrics.badgeOverlapRatio > (POLICY.maxOverlapByKind.badge ?? Infinity)) {
    failures.push(`badge ${round(metrics.badgeOverlapRatio)} > ${POLICY.maxOverlapByKind.badge}`)
  }
  if (typeof metrics.safeTextScore === 'number' && metrics.safeTextScore < POLICY.safeTextScoreMin) {
    failures.push(`safeTextScore ${round(metrics.safeTextScore)} < ${POLICY.safeTextScoreMin}`)
  }
  if (typeof metrics.safeAreaCoverage === 'number' && metrics.safeAreaCoverage < POLICY.safeAreaCoverageMin) {
    failures.push(`safeAreaCoverage ${round(metrics.safeAreaCoverage)} < ${POLICY.safeAreaCoverageMin}`)
  }
  return { pass: failures.length === 0, failures }
}

function isNearThreshold(value: number | null, threshold: number, direction: 'max' | 'min', epsilon: number) {
  if (typeof value !== 'number') return false
  const delta = direction === 'max' ? threshold - value : value - threshold
  return delta >= 0 && delta <= epsilon
}

function isSquareOverlayExhaustedCase(metrics: CaseMetrics, evaluation: Evaluation, failureEntry?: FailureEntry) {
  const safeFailure = evaluation.failures.some((reason) => reason.startsWith('safeTextScore') || reason.startsWith('safeAreaCoverage'))
  if (!safeFailure) return false
  if (failureEntry?.taxonomy === 'invalid/stress-like composition' || failureEntry?.taxonomy === 'slot/composition failure') return false
  const headlineOkay =
    typeof metrics.headlineOverlapRatio !== 'number' || metrics.headlineOverlapRatio <= (POLICY.maxOverlapByKind.headline ?? 0) + 0.003
  const subtitleOkay =
    typeof metrics.subtitleOverlapRatio !== 'number' || metrics.subtitleOverlapRatio <= (POLICY.maxOverlapByKind.subtitle ?? 0) + 0.004
  const safeTextNearMiss =
    typeof metrics.safeTextScore === 'number' && metrics.safeTextScore >= POLICY.safeTextScoreMin - 0.03
  const safeAreaMostlyOkay =
    typeof metrics.safeAreaCoverage !== 'number' || metrics.safeAreaCoverage >= Math.max(POLICY.safeAreaCoverageMin - 0.08, 0.14)
  return headlineOkay && subtitleOkay && (safeTextNearMiss || safeAreaMostlyOkay)
}

function isSuspiciousPass(metrics: CaseMetrics, classification: string, evaluation: Evaluation) {
  if (!evaluation.pass) return false
  if (classification === 'ambiguous') return true
  return (
    isNearThreshold(metrics.headlineOverlapRatio, POLICY.maxOverlapByKind.headline ?? 0, 'max', 0.002) ||
    isNearThreshold(metrics.subtitleOverlapRatio, POLICY.maxOverlapByKind.subtitle ?? 0, 'max', 0.002) ||
    isNearThreshold(metrics.badgeOverlapRatio, POLICY.maxOverlapByKind.badge ?? 0, 'max', 0.0015) ||
    isNearThreshold(metrics.safeTextScore, POLICY.safeTextScoreMin, 'min', 0.025) ||
    isNearThreshold(metrics.safeAreaCoverage, POLICY.safeAreaCoverageMin, 'min', 0.05)
  )
}

function getPriority(id: string): RepairCase['priority'] {
  if (PRIORITY_CASES.has(id)) return 'priority'
  if (SECONDARY_CASES.has(id)) return 'secondary'
  if (AMBIGUOUS_CASES.has(id)) return 'ambiguous'
  if (SUSPICIOUS_CASES.has(id)) return 'suspicious'
  return 'other'
}

function moveClusterToOverlaySafeBand(annotation: ExtractedAnnotation) {
  const next = clone(annotation)
  const textZone = zoneToCaseRect('text-overlay-lower-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const logoZone = zoneToCaseRect('logo-top-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const badgeZone = zoneToCaseRect('badge-top-right', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const headline = mergeRects(next.headlineRects)
  const subtitle = mergeRects(next.subtitleRects)

  const headlineRect = fitRect(headline, textZone, {
    widthScale: 0.88,
    heightScale: 0.9,
    xOffset: 0.02,
    yOffset: 0.08,
  })
  const subtitleRect =
    subtitle && headlineRect
      ? {
          ...fitRect(subtitle, textZone, {
            widthScale: 0.9,
            heightScale: 0.84,
            xOffset: 0.03,
            yOffset: 0.42,
          })!,
          y: clamp(headlineRect.y + headlineRect.h + textZone.h * 0.08, textZone.y + textZone.h * 0.3, textZone.y + textZone.h * 0.72),
        }
      : subtitle
        ? fitRect(subtitle, textZone, { widthScale: 0.9, heightScale: 0.84, xOffset: 0.03, yOffset: 0.4 })
        : null

  next.headlineRects = headlineRect ? [headlineRect] : []
  next.subtitleRects = subtitleRect ? [subtitleRect] : []
  if (next.logoRect) {
    next.logoRect = fitRect(next.logoRect, logoZone, { widthScale: 0.92, heightScale: 0.92, xOffset: 0.04, yOffset: 0.08 })
  }
  if (next.badgeRect) {
    const rect = fitRect(next.badgeRect, badgeZone, { widthScale: 0.88, heightScale: 0.88, xOffset: 0.34, yOffset: 0.04 })
    next.badgeRect = rect ? { ...rect, x: badgeZone.x + badgeZone.w - rect.w - badgeZone.w * 0.06 } : next.badgeRect
  }
  return next
}

function applySoftReflow(annotation: ExtractedAnnotation) {
  const next = clone(annotation)
  const textZone = zoneToCaseRect('text-overlay-lower-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const headline = mergeRects(next.headlineRects)
  const subtitle = mergeRects(next.subtitleRects)

  if (headline) {
    const rect = fitRect(headline, textZone, { widthScale: 0.92, heightScale: 0.9, xOffset: 0.02, yOffset: 0.06 })
    next.headlineRects = rect ? [rect] : next.headlineRects
  }
  if (subtitle) {
    const rect = fitRect(subtitle, textZone, { widthScale: 0.82, heightScale: 0.8, xOffset: 0.02, yOffset: 0.4 })
    if (rect && next.headlineRects[0]) {
      rect.y = clamp(next.headlineRects[0].y + next.headlineRects[0].h + textZone.h * 0.08, textZone.y + textZone.h * 0.3, textZone.y + textZone.h * 0.72)
      next.subtitleRects = [rect]
    }
  }
  return next
}

function applyBalancedCardFallback(annotation: ExtractedAnnotation) {
  const next = clone(annotation)
  const textZone = zoneToCaseRect('text-bottom-left', next.imageSize.w, next.imageSize.h, CARD_MODEL)
  const logoZone = zoneToCaseRect('logo-top-left', next.imageSize.w, next.imageSize.h, CARD_MODEL)
  const badgeZone = zoneToCaseRect('badge-top-right', next.imageSize.w, next.imageSize.h, CARD_MODEL)
  const headline = mergeRects(next.headlineRects)
  const subtitle = mergeRects(next.subtitleRects)

  const headlineRect = fitRect(headline, textZone, {
    widthScale: 0.84,
    heightScale: 0.84,
    xOffset: 0.02,
    yOffset: 0.06,
  })
  const subtitleRect =
    subtitle && headlineRect
      ? {
          ...fitRect(subtitle, textZone, {
            widthScale: 0.78,
            heightScale: 0.74,
            xOffset: 0.02,
            yOffset: 0.36,
          })!,
          y: clamp(headlineRect.y + headlineRect.h + textZone.h * 0.08, textZone.y + textZone.h * 0.28, textZone.y + textZone.h * 0.72),
        }
      : subtitle
        ? fitRect(subtitle, textZone, { widthScale: 0.78, heightScale: 0.74, xOffset: 0.02, yOffset: 0.36 })
        : null

  next.headlineRects = headlineRect ? [headlineRect] : []
  next.subtitleRects = subtitleRect ? [subtitleRect] : []
  if (next.logoRect) {
    next.logoRect = fitRect(next.logoRect, logoZone, { widthScale: 0.92, heightScale: 0.92, xOffset: 0.04, yOffset: 0.08 })
  }
  if (next.badgeRect) {
    const rect = fitRect(next.badgeRect, badgeZone, { widthScale: 0.78, heightScale: 0.78, xOffset: 0.34, yOffset: 0.06 })
    next.badgeRect = rect ? { ...rect, x: badgeZone.x + badgeZone.w - rect.w - badgeZone.w * 0.08 } : next.badgeRect
  }
  return next
}

function failureCount(evaluation: Evaluation) {
  return evaluation.failures.length
}

function metricPenalty(metrics: CaseMetrics) {
  const overlapPenalty =
    (metrics.headlineOverlapRatio || 0) * 5 +
    (metrics.subtitleOverlapRatio || 0) * 4 +
    (metrics.badgeOverlapRatio || 0) * 3
  const safePenalty =
    Math.max(0, POLICY.safeTextScoreMin - (metrics.safeTextScore || 0)) * 6 +
    Math.max(0, POLICY.safeAreaCoverageMin - (metrics.safeAreaCoverage || 0)) * 4
  return overlapPenalty + safePenalty
}

function chooseBetterCandidate(current: RepairCandidate, candidate: RepairCandidate) {
  const currentFailures = failureCount(current.evaluation)
  const candidateFailures = failureCount(candidate.evaluation)
  if (candidateFailures < currentFailures) return candidate
  if (candidateFailures > currentFailures) return current

  const currentPenalty = metricPenalty(current.metrics)
  const candidatePenalty = metricPenalty(candidate.metrics)
  if (candidatePenalty < currentPenalty - 0.0001) return candidate
  if (candidatePenalty > currentPenalty + 0.0001) return current

  if ((candidate.metrics.safeTextScore || 0) > (current.metrics.safeTextScore || 0)) return candidate
  if ((candidate.metrics.safeAreaCoverage || 0) > (current.metrics.safeAreaCoverage || 0)) return candidate
  return current
}

function buildOverlayCandidate(
  annotation: ExtractedAnnotation,
  strategy: RepairStrategy,
  options: {
    headlineWidthScale: number
    headlineHeightScale: number
    subtitleWidthScale: number
    subtitleHeightScale: number
    headlineXOffset: number
    headlineYOffset: number
    subtitleYOffset: number
  }
) {
  const next = clone(annotation)
  const textZone = zoneToCaseRect('text-overlay-lower-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const logoZone = zoneToCaseRect('logo-top-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const badgeZone = zoneToCaseRect('badge-top-right', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const headline = mergeRects(next.headlineRects)
  const subtitle = mergeRects(next.subtitleRects)

  const headlineRect = fitRect(headline, textZone, {
    widthScale: options.headlineWidthScale,
    heightScale: options.headlineHeightScale,
    xOffset: options.headlineXOffset,
    yOffset: options.headlineYOffset,
  })
  const subtitleRect =
    subtitle && headlineRect
      ? {
          ...fitRect(subtitle, textZone, {
            widthScale: options.subtitleWidthScale,
            heightScale: options.subtitleHeightScale,
            xOffset: options.headlineXOffset,
            yOffset: options.subtitleYOffset,
          })!,
          y: clamp(headlineRect.y + headlineRect.h + textZone.h * 0.06, textZone.y + textZone.h * 0.24, textZone.y + textZone.h * 0.76),
        }
      : null

  next.headlineRects = headlineRect ? [headlineRect] : []
  next.subtitleRects = subtitleRect ? [subtitleRect] : []
  if (next.logoRect) {
    next.logoRect = fitRect(next.logoRect, logoZone, { widthScale: 0.92, heightScale: 0.92, xOffset: 0.04, yOffset: 0.08 })
  }
  if (next.badgeRect) {
    const rect = fitRect(next.badgeRect, badgeZone, { widthScale: 0.78, heightScale: 0.78, xOffset: 0.24, yOffset: 0.06 })
    next.badgeRect = rect ? { ...rect, x: badgeZone.x + badgeZone.w - rect.w - badgeZone.w * 0.08 } : next.badgeRect
  }
  return { strategy, annotation: next }
}

function buildNearMissSafeTextCandidate(annotation: ExtractedAnnotation) {
  const next = clone(annotation)
  const textZone = zoneToCaseRect('text-overlay-lower-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const logoZone = zoneToCaseRect('logo-top-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const badgeZone = zoneToCaseRect('badge-top-right', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const headline = mergeRects(next.headlineRects)
  const subtitle = mergeRects(next.subtitleRects)
  let best = evaluateCandidate({ strategy: 'square-near-miss-safe-text', annotation: clone(annotation) })

  for (const headlineWidthScale of [0.9, 0.84, 0.78, 0.72]) {
    for (const headlineHeightScale of [0.88, 0.8, 0.72]) {
      for (const subtitleWidthScale of [0.8, 0.72, 0.64, 0.58]) {
        for (const subtitleHeightScale of [0.72, 0.64, 0.56]) {
          for (const headlineXOffset of [0.0, 0.04, 0.08, 0.12]) {
            for (const headlineYOffset of [0.04, 0.1, 0.16, 0.22, 0.28]) {
              const candidate = clone(next)
              const headlineRect = fitRect(headline, textZone, {
                widthScale: headlineWidthScale,
                heightScale: headlineHeightScale,
                xOffset: headlineXOffset,
                yOffset: headlineYOffset,
              })
              const subtitleRect =
                subtitle && headlineRect
                  ? {
                      ...fitRect(subtitle, textZone, {
                        widthScale: subtitleWidthScale,
                        heightScale: subtitleHeightScale,
                        xOffset: headlineXOffset,
                        yOffset: Math.min(headlineYOffset + 0.16, 0.56),
                      })!,
                      y: clamp(
                        headlineRect.y + headlineRect.h + textZone.h * 0.035,
                        textZone.y + textZone.h * 0.18,
                        textZone.y + textZone.h * 0.7
                      ),
                    }
                  : null

              candidate.headlineRects = headlineRect ? [headlineRect] : []
              candidate.subtitleRects = subtitleRect ? [subtitleRect] : []
              if (candidate.logoRect) {
                candidate.logoRect = fitRect(candidate.logoRect, logoZone, {
                  widthScale: 0.9,
                  heightScale: 0.9,
                  xOffset: 0.04,
                  yOffset: 0.04,
                })
              }
              if (candidate.badgeRect) {
                const rect = fitRect(candidate.badgeRect, badgeZone, {
                  widthScale: 0.72,
                  heightScale: 0.72,
                  xOffset: 0.28,
                  yOffset: 0.06,
                })
                candidate.badgeRect = rect ? { ...rect, x: badgeZone.x + badgeZone.w - rect.w - badgeZone.w * 0.08 } : candidate.badgeRect
              }

              best = chooseBetterCandidate(best, evaluateCandidate({ strategy: 'square-near-miss-safe-text', annotation: candidate }))
            }
          }
        }
      }
    }
  }

  return best
}

function buildConstrainedTextModelCandidate(annotation: ExtractedAnnotation) {
  const next = clone(annotation)
  const textZone = zoneToCaseRect('text-overlay-lower-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const logoZone = zoneToCaseRect('logo-top-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const badgeZone = zoneToCaseRect('badge-top-right', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const headline = mergeRects(next.headlineRects)
  const subtitle = mergeRects(next.subtitleRects)
  let best = evaluateCandidate({ strategy: 'square-constrained-text-model', annotation: clone(annotation) })

  for (const headlineWidthScale of [0.66, 0.58, 0.5, 0.42]) {
    for (const headlineHeightScale of [0.84, 0.72, 0.6]) {
      for (const headlineXOffset of [0.0, 0.06, 0.12, 0.18, 0.24]) {
        for (const headlineYOffset of [0.04, 0.12, 0.2, 0.28, 0.36]) {
          for (const dropSubtitle of subtitle ? [false, true] : [false]) {
            const candidate = clone(next)
            const headlineRect = fitRect(headline, textZone, {
              widthScale: headlineWidthScale,
              heightScale: headlineHeightScale,
              xOffset: headlineXOffset,
              yOffset: headlineYOffset,
            })
            candidate.headlineRects = headlineRect ? [headlineRect] : []

            if (subtitle && !dropSubtitle && headlineRect) {
              const subtitleRect = {
                ...fitRect(subtitle, textZone, {
                  widthScale: 0.52,
                  heightScale: 0.44,
                  xOffset: headlineXOffset,
                  yOffset: Math.min(headlineYOffset + 0.2, 0.64),
                })!,
                y: clamp(
                  headlineRect.y + headlineRect.h + textZone.h * 0.03,
                  textZone.y + textZone.h * 0.18,
                  textZone.y + textZone.h * 0.72
                ),
              }
              candidate.subtitleRects = [subtitleRect]
            } else {
              candidate.subtitleRects = []
            }

            if (candidate.logoRect) {
              candidate.logoRect = fitRect(candidate.logoRect, logoZone, {
                widthScale: 0.88,
                heightScale: 0.88,
                xOffset: 0.04,
                yOffset: 0.04,
              })
            }
            if (candidate.badgeRect) {
              const rect = fitRect(candidate.badgeRect, badgeZone, {
                widthScale: 0.68,
                heightScale: 0.68,
                xOffset: 0.3,
                yOffset: 0.06,
              })
              candidate.badgeRect = rect ? { ...rect, x: badgeZone.x + badgeZone.w - rect.w - badgeZone.w * 0.08 } : candidate.badgeRect
            }

            best = chooseBetterCandidate(best, evaluateCandidate({ strategy: 'square-constrained-text-model', annotation: candidate }))
          }
        }
      }
    }
  }

  return best
}

function buildUltraConstrainedMicroBandCandidate(annotation: ExtractedAnnotation) {
  const next = clone(annotation)
  const textZone = zoneToCaseRect('text-overlay-lower-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const logoZone = zoneToCaseRect('logo-top-left', next.imageSize.w, next.imageSize.h, HERO_MODEL)
  const headline = mergeRects(next.headlineRects)
  let best = evaluateCandidate({ strategy: 'square-ultra-constrained-micro-band', annotation: clone(annotation) })

  for (const headlineWidthScale of [0.46, 0.4, 0.34, 0.28]) {
    for (const headlineHeightScale of [0.78, 0.68, 0.58, 0.5]) {
      for (const headlineXOffset of [0.0, 0.08, 0.16, 0.24, 0.32]) {
        for (const headlineYOffset of [0.02, 0.1, 0.18, 0.26, 0.34, 0.42]) {
          const candidate = clone(next)
          const headlineRect = fitRect(headline, textZone, {
            widthScale: headlineWidthScale,
            heightScale: headlineHeightScale,
            xOffset: headlineXOffset,
            yOffset: headlineYOffset,
          })
          candidate.headlineRects = headlineRect ? [headlineRect] : []
          candidate.subtitleRects = []
          if (candidate.logoRect) {
            candidate.logoRect = fitRect(candidate.logoRect, logoZone, {
              widthScale: 0.86,
              heightScale: 0.86,
              xOffset: 0.04,
              yOffset: 0.04,
            })
          }
          best = chooseBetterCandidate(best, evaluateCandidate({ strategy: 'square-ultra-constrained-micro-band', annotation: candidate }))
        }
      }
    }
  }

  return best
}

function buildBalancedCardCandidate(
  annotation: ExtractedAnnotation,
  strategy: RepairStrategy,
  options: {
    headlineWidthScale: number
    subtitleWidthScale: number
    headlineYOffset: number
    subtitleYOffset: number
  }
) {
  const next = clone(annotation)
  const textZone = zoneToCaseRect('text-bottom-left', next.imageSize.w, next.imageSize.h, CARD_MODEL)
  const logoZone = zoneToCaseRect('logo-top-left', next.imageSize.w, next.imageSize.h, CARD_MODEL)
  const badgeZone = zoneToCaseRect('badge-top-right', next.imageSize.w, next.imageSize.h, CARD_MODEL)
  const headline = mergeRects(next.headlineRects)
  const subtitle = mergeRects(next.subtitleRects)
  const headlineRect = fitRect(headline, textZone, {
    widthScale: options.headlineWidthScale,
    heightScale: 0.82,
    xOffset: 0.02,
    yOffset: options.headlineYOffset,
  })
  const subtitleRect =
    subtitle && headlineRect
      ? {
          ...fitRect(subtitle, textZone, {
            widthScale: options.subtitleWidthScale,
            heightScale: 0.74,
            xOffset: 0.02,
            yOffset: options.subtitleYOffset,
          })!,
          y: clamp(headlineRect.y + headlineRect.h + textZone.h * 0.07, textZone.y + textZone.h * 0.26, textZone.y + textZone.h * 0.78),
        }
      : null

  next.headlineRects = headlineRect ? [headlineRect] : []
  next.subtitleRects = subtitleRect ? [subtitleRect] : []
  if (next.logoRect) {
    next.logoRect = fitRect(next.logoRect, logoZone, { widthScale: 0.92, heightScale: 0.92, xOffset: 0.04, yOffset: 0.08 })
  }
  if (next.badgeRect) {
    const rect = fitRect(next.badgeRect, badgeZone, { widthScale: 0.72, heightScale: 0.72, xOffset: 0.28, yOffset: 0.06 })
    next.badgeRect = rect ? { ...rect, x: badgeZone.x + badgeZone.w - rect.w - badgeZone.w * 0.08 } : next.badgeRect
  }
  return { strategy, annotation: next }
}

function evaluateCandidate(candidate: { strategy: RepairStrategy; annotation: ExtractedAnnotation }): RepairCandidate {
  const metrics = computeCaseMetrics(candidate.annotation)
  return {
    ...candidate,
    metrics,
    evaluation: computeEvaluation(metrics),
  }
}

function repairAnnotation(annotation: ExtractedAnnotation, beforeMetrics: CaseMetrics, beforeEvaluation: Evaluation, failureEntry?: FailureEntry) {
  if (annotation.classification === 'ambiguous') {
    return evaluateCandidate({ strategy: 'ambiguous-skip', annotation: clone(annotation) })
  }
  if (SUSPICIOUS_CASES.has(annotation.id)) {
    return evaluateCandidate({ strategy: 'inspect-only', annotation: clone(annotation) })
  }

  const nearThresholdText =
    (typeof beforeMetrics.headlineOverlapRatio === 'number' && beforeMetrics.headlineOverlapRatio <= (POLICY.maxOverlapByKind.headline ?? 0) + 0.004) ||
    (typeof beforeMetrics.subtitleOverlapRatio === 'number' && beforeMetrics.subtitleOverlapRatio <= (POLICY.maxOverlapByKind.subtitle ?? 0) + 0.006)

  const safeFailure = beforeEvaluation.failures.some((reason) => reason.startsWith('safeTextScore') || reason.startsWith('safeAreaCoverage'))
  const structuralFailure =
    failureEntry?.taxonomy === 'invalid/stress-like composition' ||
    failureEntry?.taxonomy === 'slot/composition failure' ||
    (typeof beforeMetrics.subtitleOverlapRatio === 'number' && beforeMetrics.subtitleOverlapRatio > 0.03) ||
    (typeof beforeMetrics.headlineOverlapRatio === 'number' && beforeMetrics.headlineOverlapRatio > 0.03)
  const overlayExhausted = isSquareOverlayExhaustedCase(beforeMetrics, beforeEvaluation, failureEntry)
  const candidates: RepairCandidate[] = [evaluateCandidate({ strategy: 'none', annotation: clone(annotation) })]

  if (safeFailure || nearThresholdText || PRIORITY_CASES.has(annotation.id)) {
    if (
      safeFailure &&
      !structuralFailure &&
      (!failureEntry || failureEntry.issueCause === 'thresholds' || failureEntry.issueCause === 'repair logic')
    ) {
      candidates.push(buildNearMissSafeTextCandidate(annotation))
      candidates.push(buildConstrainedTextModelCandidate(annotation))
      candidates.push(buildUltraConstrainedMicroBandCandidate(annotation))
    }
    for (const headlineWidthScale of [0.94, 0.88, 0.82]) {
      for (const subtitleWidthScale of [0.84, 0.78, 0.72]) {
        for (const headlineYOffset of [0.06, 0.12, 0.18]) {
          candidates.push(
            evaluateCandidate(
              buildOverlayCandidate(annotation, safeFailure ? 'square-safe-zone-repack' : 'soft-square-reflow', {
                headlineWidthScale,
                headlineHeightScale: safeFailure ? 0.84 : 0.9,
                subtitleWidthScale,
                subtitleHeightScale: safeFailure ? 0.72 : 0.8,
                headlineXOffset: 0.02,
                headlineYOffset,
                subtitleYOffset: headlineYOffset + 0.22,
              })
            )
          )
        }
      }
    }
  }

  if (structuralFailure || overlayExhausted) {
    for (const headlineWidthScale of [0.86, 0.8, 0.74]) {
      for (const subtitleWidthScale of [0.78, 0.72, 0.66]) {
        for (const headlineYOffset of [0.06, 0.12, 0.18]) {
          candidates.push(
            evaluateCandidate(
              buildBalancedCardCandidate(annotation, 'square-balanced-card-fallback', {
                headlineWidthScale,
                subtitleWidthScale,
                headlineYOffset,
                subtitleYOffset: headlineYOffset + 0.24,
              })
            )
          )
        }
      }
    }
  }

  return candidates.reduce((best, candidate) => chooseBetterCandidate(best, candidate))
}

function rectSvg(rect: Rect | null, color: string, label: string, dashed = false) {
  if (!rect) return ''
  return `
    <rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="4" fill="none" stroke="${color}" stroke-width="3" ${dashed ? 'stroke-dasharray="8 6"' : ''}/>
    <text x="${rect.x + 4}" y="${Math.max(rect.y - 6, 14)}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${color}">${xmlEscape(label)}</text>
  `
}

function shortReasons(evaluation: Evaluation) {
  return evaluation.failures.length ? evaluation.failures.slice(0, 2) : ['passes current square policy']
}

function buildContactSheet(title: string, cases: RepairCase[], mode: 'before' | 'after') {
  const columns = 4
  const cardW = 250
  const cardH = 350
  const gap = 20
  const margin = 24
  const headerH = 96
  const rows = Math.max(1, Math.ceil(cases.length / columns))
  const width = margin * 2 + columns * cardW + (columns - 1) * gap
  const height = margin * 2 + headerH + rows * cardH + (rows - 1) * gap
  const passCount = cases.filter((entry) => (mode === 'before' ? entry.before.pass : entry.after.pass)).length

  const cards = cases.map((entry, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = margin + column * (cardW + gap)
    const y = margin + headerH + row * (cardH + gap)
    const result = mode === 'before' ? entry.before : entry.after
    const border = result.pass ? '#199b46' : '#d93025'
    const band = result.pass ? '#dff7e5' : '#fde7e4'
    const label = result.pass ? 'PASS' : 'FAIL'
    const reasonLines = shortReasons(result)
    const annotation = mode === 'before' ? entry.original : entry.repaired
    const headline = mergeRects(annotation.headlineRects)
    const subtitle = mergeRects(annotation.subtitleRects)
    const strategyLine = mode === 'after' ? `strategy: ${entry.strategy}` : `priority: ${entry.priority}`

    return `
      <g transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="14" fill="#ffffff" stroke="${border}" stroke-width="3"/>
        <rect x="0" y="0" width="${cardW}" height="36" rx="14" fill="${band}"/>
        <text x="14" y="23" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="${border}">${label}</text>
        <text x="${cardW - 14}" y="23" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#4a5568">${xmlEscape(entry.id)}</text>
        <g transform="translate(14, 48)">
          <rect x="0" y="0" width="${cardW - 28}" height="188" rx="10" fill="#f2f4f8" stroke="#d6dbe5"/>
          <image x="0" y="0" width="${cardW - 28}" height="188" preserveAspectRatio="xMidYMid meet" href="${entry.imageDataUri}" />
          <g transform="scale(${(cardW - 28) / annotation.imageSize.w}, ${188 / annotation.imageSize.h})">
            ${rectSvg(annotation.heroSubjectRect, '#ff6b6b', 'hero')}
            ${rectSvg(headline, mode === 'after' ? '#ffffff' : '#22c55e', 'headline', mode === 'after')}
            ${rectSvg(subtitle, mode === 'after' ? '#93c5fd' : '#06b6d4', 'subtitle', mode === 'after')}
            ${rectSvg(annotation.logoRect, mode === 'after' ? '#f8fafc' : '#8b5cf6', 'logo', mode === 'after')}
            ${rectSvg(annotation.badgeRect, mode === 'after' ? '#fde047' : '#eab308', 'badge', mode === 'after')}
          </g>
        </g>
        <text x="14" y="258" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#1f2937">${xmlEscape(entry.bucket)} / ${xmlEscape(entry.classification)}</text>
        <text x="14" y="278" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">${xmlEscape(strategyLine)}</text>
        <text x="14" y="302" font-family="Arial, sans-serif" font-size="12" fill="#364152">${xmlEscape(reasonLines[0] ?? '')}</text>
        <text x="14" y="320" font-family="Arial, sans-serif" font-size="12" fill="#364152">${xmlEscape(reasonLines[1] ?? '')}</text>
      </g>
    `
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f7f8fb"/>
  <text x="${margin}" y="${margin + 22}" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111827">${xmlEscape(title)}</text>
  <text x="${margin}" y="${margin + 52}" font-family="Arial, sans-serif" font-size="15" fill="#4b5563">Cases: ${cases.length} | Pass: ${passCount}/${cases.length}</text>
  <text x="${margin}" y="${margin + 74}" font-family="Arial, sans-serif" font-size="13" fill="#6b7280">Duplicate handling: Group 1 excluded; Group 16 kept as canonical stress case.</text>
  ${cards.join('\n')}
</svg>`
}

function buildReport(cases: RepairCase[], beforePath: string, afterPath: string) {
  const priorityCases = cases.filter((entry) => PRIORITY_CASES.has(entry.id))
  const improved = cases.filter((entry) => entry.improved)
  const stillFail = cases.filter((entry) => !entry.after.pass)
  const suspiciousAfter = cases.filter((entry) => entry.suspiciousAfter)
  const regressions = cases.filter((entry) => entry.regressed)
  const watchedCases = ['Group 6', 'Group 12']
    .map((id) => cases.find((entry) => entry.id === id))
    .filter((entry): entry is RepairCase => Boolean(entry))
  const priorityDiagnosis = priorityCases
    .map((entry) => {
      const failure = entry.failureAnalysis
      return `### ${entry.id}
- before: ${entry.before.failures.join('; ') || 'pass'}
- after: ${entry.after.failures.join('; ') || 'pass'}
- strategy: \`${entry.strategy}\`
- failure taxonomy: ${failure?.taxonomy || 'n/a'}
- main reasons: ${(failure?.mainReasons || []).join('; ') || 'n/a'}
- issue cause: ${failure?.issueCause || 'n/a'}`
    })
    .join('\n\n')

  const bullets = (entries: RepairCase[], formatter: (entry: RepairCase) => string) =>
    entries.length ? entries.map((entry) => `- ${formatter(entry)}`).join('\n') : '- none'

  const suspiciousBefore = cases.filter((entry) =>
    isSuspiciousPass(entry.beforeMetrics, entry.classification, entry.before)
  )
  const suspiciousBeforeIds = new Set(suspiciousBefore.map((entry) => entry.id))
  const suspiciousCreated = suspiciousAfter.filter((entry) => !suspiciousBeforeIds.has(entry.id))
  const suspiciousRetained = suspiciousAfter.filter((entry) => suspiciousBeforeIds.has(entry.id))
  const suspiciousBeforeCount = suspiciousBefore.length
  const allWatchedStillFail = watchedCases.length > 0 && watchedCases.every((entry) => !entry.after.pass)
  const closeOutRecommendation = allWatchedStillFail && regressions.length === 0
  const describeBottlenecks = (entry: RepairCase) => {
    const bottlenecks: string[] = []
    if ((entry.beforeMetrics.headlineOverlapRatio || 0) > (POLICY.maxOverlapByKind.headline ?? 0)) bottlenecks.push('headline width/height pressure')
    if ((entry.beforeMetrics.subtitleOverlapRatio || 0) > (POLICY.maxOverlapByKind.subtitle ?? 0)) bottlenecks.push('subtitle pressure')
    if (
      typeof entry.beforeMetrics.safeTextScore === 'number' &&
      entry.beforeMetrics.safeTextScore < POLICY.safeTextScoreMin &&
      ((entry.beforeMetrics.headlineOverlapRatio || 0) <= (POLICY.maxOverlapByKind.headline ?? 0) + 0.003)
    ) {
      bottlenecks.push('constrained safe text band geometry')
      bottlenecks.push('line-break inefficiency')
    }
    if (
      typeof entry.beforeMetrics.safeAreaCoverage === 'number' &&
      entry.beforeMetrics.safeAreaCoverage < POLICY.safeAreaCoverageMin
    ) {
      bottlenecks.push('spacing/block-stack inefficiency')
    }
    return bottlenecks.length ? bottlenecks.join('; ') : 'no dominant bottleneck detected'
  }

  return `# Social Square Ultra-Constrained Micro-Band

## Visual previews
![Repair before](${beforePath})

![Repair after](${afterPath})

## What changed in logic
- square repair now includes an ultra-constrained headline micro-band search for near-valid hero squares
- this mode tests very narrow local headline bands, stronger line-break pressure, multiple micro-band placements, and harder subtitle suppression
- thresholds remain unchanged; this pass only changes square edge-case text geometry behavior

## Group 6 / 12 status
${watchedCases
  .map(
    (entry) => `### ${entry.id}
- after outcome: ${entry.after.pass ? 'pass' : 'fail'}
- strategy: \`${entry.strategy}\`
- bottlenecks: ${describeBottlenecks(entry)}
- before: ${entry.before.failures.join('; ') || 'pass'}
- after: ${entry.after.failures.join('; ') || 'pass'}`
  )
  .join('\n\n')}

## Priority diagnosis
${priorityDiagnosis}

## Improved still-fail cases
${bullets(improved, (entry) => `${entry.id}: ${entry.before.failures.join('; ') || 'pass'} -> ${entry.after.failures.join('; ') || 'pass'}`)}

## Remaining fail cases
${bullets(stillFail, (entry) => `${entry.id}: ${entry.after.failures.join('; ') || 'still fail'}`)}

## Suspicious passes after repair
${bullets(suspiciousAfter, (entry) => `${entry.id}: ${entry.after.failures.join('; ') || 'pass but near gate'}${entry.id === 'Group 23' ? ' [inspected suspicious pass]' : ''}`)}

## Effect on suspicious passes
- suspicious passes before repair: ${suspiciousBeforeCount}
- suspicious passes after repair: ${suspiciousAfter.length}
- suspicious passes that were already present before repair: ${suspiciousRetained.length}
- suspicious passes created by this repair pass: ${suspiciousCreated.length}
- suspicious pass delta: ${suspiciousAfter.length - suspiciousBeforeCount >= 0 ? '+' : ''}${suspiciousAfter.length - suspiciousBeforeCount}

## Regressions
${bullets(regressions, (entry) => `${entry.id}: ${entry.before.failures.join('; ') || 'pass'} -> ${entry.after.failures.join('; ') || 'fail'}`)}

## Recommendation
- keep current square thresholds unchanged
- keep the social-square policy as-is
- use this micro-band pass only as a square repair improvement, not as a threshold rewrite
- ${closeOutRecommendation
    ? 'close social-square as sufficiently optimized for now; Group 6 and Group 12 remain known outliers'
    : 'keep social-square open for one more targeted pass only if new evidence appears outside these two outliers'}
- Group 23 still needs manual review as a suspicious pass, but this pass should not block the square repair rollout
`
}

async function main() {
  await mkdir(REPORTS_ROOT, { recursive: true })
  const annotations = parseJson<ExtractedAnnotation[]>(await readFile(path.join(EXTRACTED_ROOT, 'annotations.json'), 'utf8'))
  const manifest = parseJson<CalibrationManifestEntry[]>(await readFile(path.join(EXTRACTED_ROOT, 'manifest.json'), 'utf8'))
  const failureAnalysisJson = parseJson<{ analyses: FailureEntry[] }>(await readFile(path.join(REPORTS_ROOT, 'failure-analysis.json'), 'utf8'))
  const failureById = new Map(failureAnalysisJson.analyses.map((entry) => [entry.id, entry]))
  const manifestById = new Map(manifest.map((entry) => [entry.id, entry]))

  const reviewAnnotations = annotations.filter((entry) => entry.bucket !== 'reject' && !isExcludedDuplicate(entry.id))
  const cases: RepairCase[] = []

  for (const annotation of reviewAnnotations) {
    const manifestEntry = manifestById.get(annotation.id)
    if (!manifestEntry) continue
    const imagePath = path.join(ROOT, 'dataset', 'social-square', annotation.bucket, annotation.filename)
    const imageBuffer = await readFile(imagePath)
    const decoded = parsePng(imageBuffer)
    registerImagePixels(annotation.id, decoded.pixels)
    const beforeMetrics = computeCaseMetrics(annotation)
    const before = computeEvaluation(beforeMetrics)
    const failureEntry = failureById.get(annotation.id)
    const repairedResult = repairAnnotation(annotation, beforeMetrics, before, failureEntry)
    const afterMetrics = computeCaseMetrics(repairedResult.annotation)
    const after = computeEvaluation(afterMetrics)

    cases.push({
      id: annotation.id,
      bucket: annotation.bucket,
      classification: annotation.classification || 'clean',
      priority: getPriority(annotation.id),
      strategy: repairedResult.strategy,
      before,
      after,
      beforeMetrics,
      afterMetrics,
      improved: !before.pass && after.pass,
      regressed: before.pass && !after.pass,
      suspiciousAfter: isSuspiciousPass(afterMetrics, annotation.classification || 'clean', after),
      failureAnalysis: failureEntry,
      imageDataUri: `data:image/png;base64,${imageBuffer.toString('base64')}`,
      original: annotation,
      repaired: repairedResult.annotation,
    })
  }

  cases.sort((left, right) => {
    const priorityOrder = { priority: 0, secondary: 1, ambiguous: 2, suspicious: 3, other: 4 }
    const bucketOrder = { core: 0, stress: 1, reject: 2 }
    return (
      priorityOrder[left.priority] - priorityOrder[right.priority] ||
      bucketOrder[left.bucket] - bucketOrder[right.bucket] ||
      left.id.localeCompare(right.id, undefined, { numeric: true })
    )
  })

  const beforePath = path.join(REPORTS_ROOT, 'contact-sheet-square-micro-band-before.svg')
  const afterPath = path.join(REPORTS_ROOT, 'contact-sheet-square-micro-band-after.svg')
  const reportPath = path.join(REPORTS_ROOT, 'report-square-micro-band.md')
  const jsonPath = path.join(REPORTS_ROOT, 'square-micro-band.json')
  const legacyBeforePath = path.join(REPORTS_ROOT, 'contact-sheet-repair-before.svg')
  const legacyAfterPath = path.join(REPORTS_ROOT, 'contact-sheet-repair-after.svg')
  const legacyReportPath = path.join(REPORTS_ROOT, 'report-repair-improvements.md')
  const legacyJsonPath = path.join(REPORTS_ROOT, 'repair-improvements.json')
  const beforeSvg = buildContactSheet('Social Square Micro-Band Preview - Before', cases, 'before')
  const afterSvg = buildContactSheet('Social Square Micro-Band Preview - After', cases, 'after')
  const report = buildReport(cases, beforePath, afterPath)
  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      annotations: path.join(EXTRACTED_ROOT, 'annotations.json'),
      manifest: path.join(EXTRACTED_ROOT, 'manifest.json'),
      failureAnalysis: path.join(REPORTS_ROOT, 'failure-analysis.json'),
      policy: path.join(ROOT, 'src', 'lib', 'overlayPolicies.ts'),
    },
    summary: {
      total: cases.length,
      improved: cases.filter((entry) => entry.improved).length,
      unchangedPasses: cases.filter((entry) => entry.before.pass && entry.after.pass).length,
      stillFail: cases.filter((entry) => !entry.after.pass).length,
      suspiciousPassesAfter: cases.filter((entry) => entry.suspiciousAfter).length,
      regressions: cases.filter((entry) => entry.regressed).length,
    },
    priorityStatus: ['Group 6', 'Group 12'].map((id) => {
      const entry = cases.find((item) => item.id === id)
      return entry
        ? {
            id: entry.id,
            strategy: entry.strategy,
            afterPass: entry.after.pass,
            beforeFailures: entry.before.failures,
            afterFailures: entry.after.failures,
          }
        : { id, missing: true }
    }),
    priorityDiagnosis: cases
      .filter((entry) => PRIORITY_CASES.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        strategy: entry.strategy,
        beforeFailures: entry.before.failures,
        afterFailures: entry.after.failures,
        failureTaxonomy: entry.failureAnalysis?.taxonomy || null,
        issueCause: entry.failureAnalysis?.issueCause || null,
      })),
    cases: cases.map((entry) => ({
      id: entry.id,
      bucket: entry.bucket,
      classification: entry.classification,
      priority: entry.priority,
      strategy: entry.strategy,
      before: entry.before,
      after: entry.after,
      beforeMetrics: entry.beforeMetrics,
      afterMetrics: entry.afterMetrics,
      improved: entry.improved,
      regressed: entry.regressed,
      suspiciousAfter: entry.suspiciousAfter,
      failureTaxonomy: entry.failureAnalysis?.taxonomy || null,
      issueCause: entry.failureAnalysis?.issueCause || null,
    })),
  }
  await writeFile(beforePath, beforeSvg, 'utf8')
  await writeFile(afterPath, afterSvg, 'utf8')
  await writeFile(reportPath, report, 'utf8')
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8')
  await writeFile(legacyBeforePath, beforeSvg, 'utf8')
  await writeFile(legacyAfterPath, afterSvg, 'utf8')
  await writeFile(legacyReportPath, report, 'utf8')
  await writeFile(legacyJsonPath, JSON.stringify(payload, null, 2), 'utf8')
  console.log('Generated social-square micro-band artifacts')
  console.log(`- ${beforePath}`)
  console.log(`- ${afterPath}`)
  console.log(`- ${reportPath}`)
  console.log(`- ${jsonPath}`)
  return

  await writeFile(beforePath, buildContactSheet('Social Square Repair Preview — Before', cases, 'before'), 'utf8')
  await writeFile(afterPath, buildContactSheet('Social Square Repair Preview — After', cases, 'after'), 'utf8')
  await writeFile(reportPath, buildReport(cases, beforePath, afterPath), 'utf8')
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sources: {
          annotations: path.join(EXTRACTED_ROOT, 'annotations.json'),
          manifest: path.join(EXTRACTED_ROOT, 'manifest.json'),
          failureAnalysis: path.join(REPORTS_ROOT, 'failure-analysis.json'),
          policy: path.join(ROOT, 'src', 'lib', 'overlayPolicies.ts'),
        },
        summary: {
          total: cases.length,
          improved: cases.filter((entry) => entry.improved).length,
          unchangedPasses: cases.filter((entry) => entry.before.pass && entry.after.pass).length,
          stillFail: cases.filter((entry) => !entry.after.pass).length,
          suspiciousPassesAfter: cases.filter((entry) => entry.suspiciousAfter).length,
          regressions: cases.filter((entry) => entry.regressed).length,
        },
        priorityDiagnosis: cases
          .filter((entry) => PRIORITY_CASES.has(entry.id))
          .map((entry) => ({
            id: entry.id,
            strategy: entry.strategy,
            beforeFailures: entry.before.failures,
            afterFailures: entry.after.failures,
            failureTaxonomy: entry.failureAnalysis?.taxonomy || null,
            issueCause: entry.failureAnalysis?.issueCause || null,
          })),
        cases: cases.map((entry) => ({
          id: entry.id,
          bucket: entry.bucket,
          classification: entry.classification,
          priority: entry.priority,
          strategy: entry.strategy,
          before: entry.before,
          after: entry.after,
          beforeMetrics: entry.beforeMetrics,
          afterMetrics: entry.afterMetrics,
          improved: entry.improved,
          regressed: entry.regressed,
          suspiciousAfter: entry.suspiciousAfter,
          failureTaxonomy: entry.failureAnalysis?.taxonomy || null,
          issueCause: entry.failureAnalysis?.issueCause || null,
        })),
      },
      null,
      2
    ),
    'utf8'
  )

  console.log('Generated social-square repair improvement artifacts')
  console.log(`- ${beforePath}`)
  console.log(`- ${afterPath}`)
  console.log(`- ${reportPath}`)
  console.log(`- ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
