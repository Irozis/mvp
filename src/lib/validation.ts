import { buildSceneLayoutBoxes, detectBoxCollisions, detectSpacingViolations, evaluateStructuralLayoutState } from './layoutEngine'
import { getOverlaySafetyPolicy } from './overlayPolicies'
import { FORMAT_MAP } from './presets'
import { getFormatRuleSet } from './formatRules'
import { getCompositionModel, getCompositionModelsForFormat, selectCompositionModel } from './formatCompositionModels'
import { analyzeTextRhythm } from './typographyEngine'
import { buildSceneTextGeometry } from './textGeometry'
import { splitTextIntoLines } from './utils'
import { getVisualAssessment } from './visualEvaluation'
import type {
  AILayoutReview,
  CompositionModelId,
  CtaAnalysis,
  EnhancedImageAnalysis,
  FixAction,
  FormatDefinition,
  FormatFamily,
  FormatKey,
  FormatSpecificMetrics,
  GlobalLayoutAnalysis,
  ImageBlockAnalysis,
  ImageTextRelationshipAnalysis,
  CompositionModel,
  LayoutBoxMap,
  LayoutAssessment,
  LayoutAnalysis,
  LayoutIssue,
  LayoutQualityMetrics,
  LogoAnalysis,
  Scene,
  ScoreTrust,
  TextBlockAnalysis,
  TextClusterAnalysis,
} from './types'

type Rect = {
  label?: string
  x: number
  y: number
  w: number
  h: number
}

type RectMap = ReturnType<typeof getRectangles>

const ISSUE_PRIORITY: Record<LayoutIssue['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const CRITICAL_ISSUE_CODES = new Set([
  'box-collision',
  'headline-image-overlap',
  'headline-logo-overlap',
  'text-cta-overlap',
  'out-of-bounds',
  'outside-safe-area',
  'violates-allowed-zone',
  'violates-headline-line-limit',
  'violates-image-footprint-rule',
  'violates-cta-size-rule',
])

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function roundMetric(value: number) {
  return Math.round(clamp(value, 0, 100))
}

function getNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' ? value : fallback
}

function textHeightPx(fontSize: number, lines: number, lineHeight = 1.1) {
  return fontSize * lines * lineHeight
}

function estimateLines(text: string | undefined, charsPerLine: number | undefined, maxLines: number | undefined) {
  const contentLength = (text || '').trim().length
  const capacity = Math.max(charsPerLine || 1, 1)
  return clamp(Math.ceil(contentLength / capacity) || 1, 1, Math.max(maxLines || 1, 1))
}

function hexToRgb(hex: string) {
  const cleaned = (hex || '#ffffff').replace('#', '')
  const normalized = cleaned.length === 3 ? cleaned.split('').map((part) => `${part}${part}`).join('') : cleaned
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const normalize = (channel: number) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const sr = normalize(r)
  const sg = normalize(g)
  const sb = normalize(b)
  return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb
}

function contrastRatio(left: string, right: string) {
  const a = relativeLuminance(left)
  const b = relativeLuminance(right)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

function intersects(left: Rect, right: Rect) {
  return !(left.x + left.w <= right.x || right.x + right.w <= left.x || left.y + left.h <= right.y || right.y + right.h <= left.y)
}

function containsRect(container: Rect, subject: Rect) {
  return subject.x >= container.x && subject.y >= container.y && subject.x + subject.w <= container.x + container.w && subject.y + subject.h <= container.y + container.h
}

function intersectionArea(left: Rect, right: Rect) {
  const overlapX = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
  const overlapY = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y))
  return overlapX * overlapY
}

function overlapRatio(left: Rect, right: Rect) {
  const area = Math.max(left.w * left.h, 0.0001)
  return intersectionArea(left, right) / area
}

function normalizeRectWithinImage(rect: Rect, image: Rect): Rect {
  return {
    x: ((rect.x - image.x) / Math.max(image.w, 0.0001)) * 100,
    y: ((rect.y - image.y) / Math.max(image.h, 0.0001)) * 100,
    w: (rect.w / Math.max(image.w, 0.0001)) * 100,
    h: (rect.h / Math.max(image.h, 0.0001)) * 100,
  }
}

function estimateBrightnessForArea(imageAnalysis: EnhancedImageAnalysis, area: Rect) {
  const points = imageAnalysis.brightnessMap.filter(
    (point) => point.x >= area.x && point.x <= area.x + area.w && point.y >= area.y && point.y <= area.y + area.h
  )
  if (!points.length) {
    return imageAnalysis.mood === 'dark' ? 0.22 : 0.78
  }
  return average(points.map((point) => point.score))
}

function grayscaleHex(brightness: number) {
  const channel = Math.round(clamp(brightness, 0, 1) * 255)
  const part = channel.toString(16).padStart(2, '0')
  return `#${part}${part}${part}`
}

function zoneRectToPercent(x: number, y: number, w: number, h: number, format: FormatDefinition): Rect {
  return {
    label: 'Rule',
    x: (x / format.width) * 100,
    y: (y / format.height) * 100,
    w: (w / format.width) * 100,
    h: (h / format.height) * 100,
  }
}

function getAllowedZoneIdsForRole(ruleSet: ReturnType<typeof getFormatRuleSet>, role: 'image' | 'text' | 'cta' | 'logo' | 'badge' | 'price') {
  if (role === 'text') {
    return Array.from(
      new Set([
        ...(ruleSet.elements.headline.allowedZones || []),
        ...(ruleSet.elements.subtitle.allowedZones || []),
        ...(ruleSet.elements.body.allowedZones || []),
      ])
    )
  }

  const element =
    role === 'image'
      ? ruleSet.elements.image
      : role === 'cta'
        ? ruleSet.elements.cta
        : role === 'logo'
          ? ruleSet.elements.logo
          : role === 'badge'
            ? ruleSet.elements.badge
            : ruleSet.elements.price

  return Array.from(new Set(element?.allowedZones || []))
}

function getAllowedZoneRects(role: 'image' | 'text' | 'cta' | 'logo' | 'badge' | 'price', format: FormatDefinition) {
  const ruleSet = getFormatRuleSet(format)
  const allowedZoneIds = getAllowedZoneIdsForRole(ruleSet, role)
  const zones =
    allowedZoneIds.length > 0
      ? ruleSet.zones.filter((current) => current.role === role && allowedZoneIds.includes(current.id))
      : ruleSet.zones.filter((current) => current.role === role)
  return zones.map((zone) => zoneRectToPercent(zone.rect.x, zone.rect.y, zone.rect.w, zone.rect.h, format))
}

function getAllowedZoneRect(role: 'image' | 'text' | 'cta' | 'logo' | 'badge' | 'price', format: FormatDefinition) {
  return getAllowedZoneRects(role, format)[0] || null
}

function isRectInsideAllowedZones(role: 'image' | 'text' | 'cta' | 'logo' | 'badge' | 'price', rect: Rect, format: FormatDefinition) {
  const zones = getAllowedZoneRects(role, format)
  if (!zones.length) return true
  return zones.some((zone) => containsRect(zone, rect))
}

function getModelZoneRect(model: CompositionModel, zoneId: string, format: FormatDefinition) {
  const zone = model.zones.find((current) => current.id === zoneId)
  if (!zone) return null
  return zoneRectToPercent(zone.rect.x, zone.rect.y, zone.rect.w, zone.rect.h, format)
}

function sceneRectForSlot(rects: RectMap, block: CompositionModel['slots'][number]['block']) {
  if (block === 'headline') return rects.title
  if (block === 'subtitle' || block === 'body') return rects.subtitle
  if (block === 'cta') return rects.cta
  if (block === 'logo') return rects.logo
  if (block === 'image') return rects.image
  if (block === 'badge' || block === 'price') return rects.badge
  return null
}

function sceneRectForKind(rects: RectMap, kind: CompositionModel['slots'][number]['block']) {
  return sceneRectForSlot(rects, kind)
}

function computeModelComplianceScore(scene: Scene, format: FormatDefinition, rects: RectMap, model: CompositionModel) {
  let score = 0
  for (const slot of model.slots) {
    const rect = sceneRectForSlot(rects, slot.block)
    const zone = getModelZoneRect(model, slot.zoneId, format)
    if (!rect || !zone) continue
    if (containsRect(zone, rect)) score += 2
    const widthOk =
      (!slot.minW || rect.w >= (slot.minW / format.width) * 100 - 0.5) &&
      (!slot.maxW || rect.w <= (slot.maxW / format.width) * 100 + 0.5)
    const heightOk =
      (!slot.minH || rect.h >= (slot.minH / format.height) * 100 - 0.5) &&
      (!slot.maxH || rect.h <= (slot.maxH / format.height) * 100 + 0.5)
    if (widthOk && heightOk) score += 1
  }
  const imageCoverage = (rects.image.w * rects.image.h) / 10000
  if (imageCoverage >= model.minImageCoverage && imageCoverage <= model.maxImageCoverage) score += 2
  return score
}

export function getModelComplianceScore(scene: Scene, format: FormatDefinition, model: CompositionModel) {
  return computeModelComplianceScore(scene, format, getRectangles(scene, format), model)
}

function chooseBestCompositionModel(scene: Scene, format: FormatDefinition, rects: RectMap) {
  const exact = getCompositionModelsForFormat(format)
  if (!exact.length) return null
  return exact
    .map((model) => ({ model, score: computeModelComplianceScore(scene, format, rects, model) }))
    .sort((left, right) => right.score - left.score)[0]?.model || null
}

function resolveAssessmentCompositionModel(
  scene: Scene,
  format: FormatDefinition,
  rects: RectMap,
  expectedCompositionModelId?: CompositionModelId
) {
  if (expectedCompositionModelId) {
    const expectedModel = getCompositionModel(format, expectedCompositionModelId)
    if (expectedModel) return expectedModel
  }

  return (
    chooseBestCompositionModel(scene, format, rects) ||
    selectCompositionModel({
      format,
      denseText: ((scene.title.text || '').length + (scene.subtitle.text || '').length) > 120,
    })
  )
}

function getEffectiveModelImageCoverageBounds(model: CompositionModel, format: FormatDefinition) {
  const imageSlot = model.slots.find((slot) => slot.block === 'image')
  const imageZone = imageSlot ? model.zones.find((zone) => zone.id === imageSlot.zoneId) : null
  if (!imageSlot || !imageZone) {
    return {
      minCoverage: model.minImageCoverage,
      maxCoverage: model.maxImageCoverage,
    }
  }

  const maxW = Math.min(imageSlot.maxW || imageZone.rect.w, imageZone.rect.w)
  const maxH = Math.min(imageSlot.maxH || imageZone.rect.h, imageZone.rect.h)
  const preferredW = Math.min(imageSlot.preferredW || maxW, maxW)
  const preferredH = Math.min(imageSlot.preferredH || maxH, maxH)
  const preferredCoverage = (preferredW / format.width) * (preferredH / format.height)
  const maxCoverage = (maxW / format.width) * (maxH / format.height)
  const minCoverage = Math.min(model.minImageCoverage, preferredCoverage)

  return {
    minCoverage,
    maxCoverage: Math.max(minCoverage, Math.min(model.maxImageCoverage, maxCoverage)),
  }
}

function bounds(rects: Rect[]) {
  const active = rects.filter((rect) => rect.w > 0 && rect.h > 0)
  return {
    left: Math.min(...active.map((rect) => rect.x)),
    top: Math.min(...active.map((rect) => rect.y)),
    right: Math.max(...active.map((rect) => rect.x + rect.w)),
    bottom: Math.max(...active.map((rect) => rect.y + rect.h)),
  }
}

function severityToLevel(severity: LayoutIssue['severity']) {
  if (severity === 'critical') return 'error'
  if (severity === 'high') return 'error'
  if (severity === 'medium') return 'warning'
  return 'ok'
}

function normalizeIssueSeverity(code: string, severity: LayoutIssue['severity']) {
  return CRITICAL_ISSUE_CODES.has(code) ? 'critical' : severity
}

function pushIssue(
  issues: LayoutIssue[],
  fixes: Set<FixAction>,
  code: string,
  severity: LayoutIssue['severity'],
  message: string,
  suggestedFix?: string,
  fix?: FixAction
) {
  const normalizedSeverity = normalizeIssueSeverity(code, severity)
  const existing = issues.find((issue) => issue.code === code)
  if (existing) {
    if (ISSUE_PRIORITY[normalizedSeverity] < ISSUE_PRIORITY[existing.severity]) {
      existing.severity = normalizedSeverity
      existing.message = message
      existing.suggestedFix = suggestedFix
      existing.level = severityToLevel(normalizedSeverity)
      existing.text = message
    }
  } else {
    issues.push({
      code,
      severity: normalizedSeverity,
      message,
      suggestedFix,
      level: severityToLevel(normalizedSeverity),
      text: message,
    })
  }

  if (fix) fixes.add(fix)
}

function average(values: number[]) {
  if (!values.length) return 100
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function getFormatFamily(format: FormatDefinition): FormatFamily {
  if (format.category === 'presentation') return 'presentation'
  if (format.key === 'print-billboard') return 'billboard'
  if (format.key === 'print-flyer-a5') return 'flyer'
  if (format.key === 'print-poster-a4') return 'poster'
  if (format.key === 'display-mpu' || format.key === 'display-large-rect') return 'display-rectangle'
  if (format.key === 'display-skyscraper' || format.key === 'display-halfpage') return 'display-skyscraper'
  if (format.key === 'display-leaderboard' || format.key === 'display-billboard') return 'display-leaderboard'
  if (format.family === 'square') return 'square'
  if (format.family === 'portrait' || format.family === 'skyscraper') return 'portrait'
  if (format.family === 'landscape') return 'landscape'
  if (format.family === 'wide') return 'billboard'
  return 'landscape'
}

function verdictFromScore(score: number) {
  if (score >= 97) return 'Exceptional'
  if (score >= 90) return 'Production-ready'
  if (score >= 80) return 'Strong'
  if (score >= 65) return 'Acceptable'
  if (score >= 50) return 'Weak'
  return 'Poor'
}

let aiLayoutReviewer:
  | ((scene: Scene, context: { format: FormatDefinition; assessment: Omit<LayoutAssessment, 'aiReview'> }) => Promise<AILayoutReview>)
  | null = null

export function setAILayoutReviewer(
  reviewer:
    | ((scene: Scene, context: { format: FormatDefinition; assessment: Omit<LayoutAssessment, 'aiReview'> }) => Promise<AILayoutReview>)
    | null
) {
  aiLayoutReviewer = reviewer
}

export function getRectangles(scene: Scene, format: FormatDefinition) {
  const textGeometry = buildSceneTextGeometry(scene, format)

  const image: Rect = {
    label: 'Image',
    x: getNumber(scene.image.x, 0),
    y: getNumber(scene.image.y, 0),
    w: getNumber(scene.image.w, 0),
    h: getNumber(scene.image.h, 0),
  }
  const logo: Rect = {
    label: 'Logo',
    x: getNumber(scene.logo.x, 0),
    y: getNumber(scene.logo.y, 0),
    w: getNumber(scene.logo.w, 0),
    h: getNumber(scene.logo.h, 0),
  }
  const badge: Rect = {
    label: 'Badge',
    x: getNumber(scene.badge.x, 0),
    y: getNumber(scene.badge.y, 0),
    w: getNumber(scene.badge.w, 0),
    h: getNumber(scene.badge.h, 0),
  }
  const cta: Rect = {
    label: 'CTA',
    x: getNumber(scene.cta.x, 0),
    y: getNumber(scene.cta.y, 0),
    w: getNumber(scene.cta.w, 0),
    h: getNumber(scene.cta.h, 0),
  }
  const title: Rect = {
    label: 'Headline',
    x: textGeometry.headline.rect.x,
    y: textGeometry.headline.rect.y,
    w: textGeometry.headline.rect.w,
    h: textGeometry.headline.rect.h,
  }
  const subtitle: Rect = {
    label: 'Text',
    x: textGeometry.subtitle?.rect.x || getNumber(scene.subtitle.x, 0),
    y: textGeometry.subtitle?.rect.y || getNumber(scene.subtitle.y, 0),
    w: textGeometry.subtitle?.rect.w || getNumber(scene.subtitle.w, 0),
    h: textGeometry.subtitle?.rect.h || 0,
  }

  return { image, logo, badge, cta, title, subtitle }
}

function applyStructuralStateToAssessment(structuralState: ReturnType<typeof evaluateStructuralLayoutState>, issues: LayoutIssue[], fixes: Set<FixAction>) {
  for (const finding of structuralState.findings) {
    const code = `structural-${finding.name}`
    const severity =
      finding.severity === 'high'
        ? 'critical'
        : finding.severity === 'medium'
          ? 'high'
          : 'medium'
    const suggestedFix =
      finding.name === 'major-overlap' || finding.name === 'minimum-spacing'
        ? 'Rebuild the local geometry so blocks no longer collide.'
        : finding.name === 'safe-area-compliance'
          ? 'Pull the affected blocks back into the effective safe area.'
          : finding.name === 'text-size-sanity'
            ? 'Refit the text block before scoring or repair.'
            : finding.name === 'image-dominance-sanity'
              ? 'Rebalance the image region before accepting this layout.'
              : finding.name === 'structural-occupancy'
                ? 'Expand the main content footprint instead of leaving the canvas under-used.'
                : 'Return role-bound blocks to their format-specific anchor zones.'
    const fix =
      finding.name === 'major-overlap'
        ? 'rebalance-text-cluster'
        : finding.name === 'minimum-spacing'
          ? 'increase-cluster-padding'
          : finding.name === 'safe-area-compliance'
            ? 'rebalance-text-cluster'
            : finding.name === 'text-size-sanity'
              ? 'reflow-headline'
              : finding.name === 'image-dominance-sanity'
                ? 'rebalance-split-ratio'
                : finding.name === 'structural-occupancy'
                  ? 'reduce-dead-space'
                  : 'move-logo-to-anchor'

    pushIssue(issues, fixes, code, severity, `Structural invariant: ${finding.message}`, suggestedFix, fix)
  }
}

function getTextBounds(rects: RectMap) {
  return bounds([rects.title, rects.subtitle, rects.cta])
}

function getWeight(rect: Rect, emphasis: number) {
  return rect.w * rect.h * emphasis
}

function getVisualMass(rects: RectMap) {
  const entries = [
    { rect: rects.image, emphasis: 1.08 },
    { rect: rects.title, emphasis: 1.36 },
    { rect: rects.subtitle, emphasis: 0.8 },
    { rect: rects.cta, emphasis: 1.2 },
    { rect: rects.logo, emphasis: 0.48 },
    { rect: rects.badge, emphasis: 0.96 },
  ]

  let total = 0
  let left = 0
  let right = 0
  let top = 0
  let bottom = 0
  let centerX = 0
  let centerY = 0

  for (const entry of entries) {
    const weight = getWeight(entry.rect, entry.emphasis)
    const cx = entry.rect.x + entry.rect.w / 2
    const cy = entry.rect.y + entry.rect.h / 2
    total += weight
    centerX += cx * weight
    centerY += cy * weight
    if (cx <= 50) left += weight
    else right += weight
    if (cy <= 50) top += weight
    else bottom += weight
  }

  return {
    total: Math.max(total, 1),
    centerX: centerX / Math.max(total, 1),
    centerY: centerY / Math.max(total, 1),
    left,
    right,
    top,
    bottom,
  }
}

function collectStructuralIssues(rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  const all = [rects.image, rects.logo, rects.badge, rects.cta, rects.title, rects.subtitle]

  all.forEach((rect) => {
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > 100 || rect.y + rect.h > 100) {
      pushIssue(issues, fixes, 'out-of-bounds', 'high', `${rect.label} goes outside the canvas bounds.`, 'Rebuild the composition for this format.', 'change-layout-family')
    }
  })

  ;([
    [rects.title, rects.image, 'headline-image-overlap'],
    [rects.title, rects.logo, 'headline-logo-overlap'],
    [rects.subtitle, rects.image, 'text-image-overlap'],
    [rects.cta, rects.image, 'cta-image-overlap'],
    [rects.title, rects.cta, 'headline-cta-overlap'],
    [rects.subtitle, rects.cta, 'text-cta-overlap'],
    [rects.logo, rects.badge, 'logo-badge-overlap'],
  ] as Array<[Rect, Rect, string]>).forEach(([left, right, code]) => {
    if (intersects(left, right)) {
      pushIssue(issues, fixes, code, 'high', `${left.label} overlaps with ${right.label}.`, 'Increase spacing and re-anchor the cluster.', 'increase-cluster-padding')
    }
  })
}

function getReadabilityMetric(scene: Scene, format: FormatDefinition, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const family = getFormatFamily(format)
  const titleMin =
    format.key === 'print-billboard' ? 92 :
    format.key === 'display-billboard' ? 28 :
    family === 'billboard' ? 26 :
    family === 'landscape' ? 26 :
    family === 'square' ? 34 :
    family === 'portrait' ? 34 :
    family === 'flyer' || family === 'poster' || family === 'presentation' ? 30 :
    18
  const subtitleMin =
    format.key === 'print-billboard' ? 16 :
    family === 'display-leaderboard' ? 9 :
    family === 'display-rectangle' ? 11 :
    family === 'display-skyscraper' ? 11 :
    family === 'billboard' ? 14 :
    family === 'landscape' ? 13 :
    family === 'square' ? 15 :
    family === 'portrait' ? 15 :
    14

  if (getNumber(scene.title.fontSize, 0) < titleMin) {
    score -= 24
    pushIssue(
      issues,
      fixes,
      family === 'display-leaderboard' ? 'tiny-headline-for-leaderboard' : 'headline-too-weak',
      'high',
      family === 'display-leaderboard' ? 'Headline is too small for a leaderboard and loses immediate scanability.' : 'Headline is too weak for the format.',
      'Increase headline prominence and reduce visual competition.',
      'increase-headline-size'
    )
  }
  if (getNumber(scene.subtitle.fontSize, 0) < subtitleMin) {
    score -= 18
    pushIssue(issues, fixes, 'body-too-small', 'medium', 'Supporting text is too small for comfortable reading.', 'Widen the text container or reduce density.', 'widen-text-container')
  }
  if (getNumber(scene.cta.fontSize, 0) < (family.startsWith('display') ? 11 : 12)) {
    score -= 14
    pushIssue(issues, fixes, 'cta-too-small', 'medium', 'CTA label is too small to feel actionable.', 'Increase CTA size and proximity.', 'increase-cta-prominence')
  }

  return roundMetric(score)
}

function getContrastMetric(scene: Scene, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const bg = scene.background[1]
  const titleContrast = contrastRatio(scene.title.fill || '#ffffff', bg)
  const subtitleContrast = contrastRatio(scene.subtitle.fill || '#ffffff', bg)
  const ctaContrast = contrastRatio(scene.cta.fill || '#0f172a', scene.cta.bg || '#ffffff')

  if (titleContrast < 4.2) {
    score -= 22
    pushIssue(issues, fixes, 'headline-low-contrast', 'high', 'Headline contrast is insufficient.', 'Improve text contrast or lighten the local backdrop.', 'darken-overlay')
  }
  if (subtitleContrast < 3.2) {
    score -= 16
    pushIssue(issues, fixes, 'text-low-contrast', 'medium', 'Supporting text contrast is too weak.', 'Use a lighter text tone or cleaner local backdrop.', 'darken-overlay')
  }
  if (ctaContrast < 3.4) {
    score -= 14
    pushIssue(issues, fixes, 'cta-low-contrast', 'medium', 'CTA contrast is too weak for a primary action.', 'Increase CTA contrast and separation.', 'increase-cta-prominence')
  }
  return roundMetric(score)
}

function getTextHierarchyMetric(scene: Scene, format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const titleArea = rects.title.w * rects.title.h
  const subtitleArea = rects.subtitle.w * rects.subtitle.h
  const ctaArea = rects.cta.w * rects.cta.h
  const family = getFormatFamily(format)

  if ((scene.title.fontSize || 0) <= (scene.subtitle.fontSize || 0) * 1.4) {
    score -= 20
    pushIssue(issues, fixes, 'headline-too-weak', 'high', 'Headline does not clearly lead the hierarchy.', 'Increase headline size and reduce body competition.', 'increase-headline-size')
  }
  if (titleArea < subtitleArea * 0.9) {
    score -= 16
    pushIssue(issues, fixes, 'display-hierarchy-too-weak', family.startsWith('display') ? 'high' : 'medium', 'Hierarchy feels flat and does not read like a designed message block.', 'Increase headline dominance and simplify supporting copy.', 'increase-headline-size')
  }
  if ((family === 'billboard' || family === 'landscape') && ctaArea < titleArea * 0.12) {
    score -= 12
    pushIssue(issues, fixes, family === 'billboard' ? 'headline-lacks-dominance-for-wide-format' : 'cta-too-weak', 'medium', family === 'billboard' ? 'Headline lacks enough dominance for a wide format.' : 'CTA is visually underweighted for a wide layout.', 'Strengthen the key message block and CTA.', 'increase-cta-prominence')
  }

  return roundMetric(score)
}

function getVisualBalanceMetric(format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  const mass = getVisualMass(rects)
  const horizontal = Math.abs(mass.left - mass.right) / mass.total
  const vertical = Math.abs(mass.top - mass.bottom) / mass.total
  const centerPenalty = (Math.abs(mass.centerX - 50) + Math.abs(mass.centerY - 50)) / 2
  let score = 100 - horizontal * 84 - vertical * 74 - centerPenalty * 0.42
  const family = getFormatFamily(format)

  if (horizontal > 0.3) {
    pushIssue(
      issues,
      fixes,
      family === 'square' ? 'imbalanced-square-composition' : family === 'billboard' || family === 'landscape' ? 'inactive-empty-space' : 'visual-balance-broken',
      'high',
      family === 'square'
        ? 'Square composition feels imbalanced and drifts to one side.'
        : family === 'billboard' || family === 'landscape'
          ? 'Wide layout leaves one side visually inactive.'
          : 'Visual balance is broken across the canvas.',
      'Redistribute visual mass and reduce one-sided weight.',
      family === 'billboard' || family === 'landscape' ? 'rebalance-split-ratio' : 'rebalance-text-cluster'
    )
  }

  if (vertical > 0.32) {
    pushIssue(
      issues,
      fixes,
      family === 'portrait' ? 'bottom-heavy-layout' : 'text-cluster-too-heavy',
      'medium',
      family === 'portrait' ? 'Vertical layout feels too heavy near the bottom.' : 'Content cluster feels too heavy in one vertical zone.',
      'Raise the cluster and rebalance whitespace.',
      'raise-text-cluster'
    )
  }

  return roundMetric(score)
}

function getSpacingQualityMetric(format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const titleToSubtitle = rects.subtitle.y - (rects.title.y + rects.title.h)
  const subtitleToCta = rects.cta.y - (rects.subtitle.y + rects.subtitle.h)
  const textToImageGap = rects.image.x > rects.title.x ? rects.image.x - (rects.title.x + rects.title.w) : rects.title.x - (rects.image.x + rects.image.w)

  if (titleToSubtitle < 2 || subtitleToCta < 2) {
    score -= 18
    pushIssue(issues, fixes, 'insufficient-breathing-room', 'high', 'Text cluster is cramped and loses breathing room.', 'Increase internal padding and cluster spacing.', 'increase-cluster-padding')
  }
  if (textToImageGap < 4 && !intersects(rects.title, rects.image) && !intersects(rects.subtitle, rects.image)) {
    score -= 16
    pushIssue(issues, fixes, getFormatFamily(format) === 'display-skyscraper' ? 'image-text-spacing-weak' : 'insufficient-spacing-between-image-and-text', 'medium', 'Insufficient spacing between image and text weakens the composition.', 'Increase separation or rebalance the split ratio.', 'rebalance-split-ratio')
  }
  return roundMetric(score)
}

function getCtaProminenceMetric(scene: Scene, rects: RectMap, format: FormatDefinition, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const family = getFormatFamily(format)
  const ruleSet = getFormatRuleSet(format)
  const marketplaceCompact = format.category === 'marketplace'
  const ctaArea = rects.cta.w * rects.cta.h
  const titleArea = rects.title.w * rects.title.h
  const minWidth =
    marketplaceCompact
      ? Math.max(((ruleSet.elements.cta.minW || 0) / format.width) * 100, 10)
      : format.key === 'display-billboard'
        ? 14
        : family === 'display-leaderboard'
          ? 10
          : family.startsWith('display')
            ? 12
            : family === 'billboard'
              ? 12
              : 16

  if (rects.cta.w < minWidth) {
    score -= 18
    pushIssue(
      issues,
      fixes,
      family.startsWith('display') ? 'cta-not-clear-at-small-size' : 'cta-too-weak',
      'high',
      family.startsWith('display') ? 'CTA is not clear enough at small display size.' : 'CTA lacks prominence.',
      'Increase CTA size, contrast, and whitespace around it.',
      'increase-cta-prominence'
    )
  }
  if (ctaArea < titleArea * (marketplaceCompact ? 0.1 : 0.14)) {
    score -= 14
    pushIssue(issues, fixes, 'cta-too-weak', 'medium', 'CTA reads like a decorative detail instead of the intended action.', 'Move CTA closer and give it more weight.', 'move-cta-closer-to-text')
  }
  if (rects.cta.y > (marketplaceCompact ? 94 : 90)) {
    score -= 12
    pushIssue(issues, fixes, 'cta-too-close-to-edge', 'medium', 'CTA sits too close to the lower edge.', 'Raise the CTA and tighten the message cluster.', 'raise-text-cluster')
  }
  return roundMetric(score)
}

function getLogoPlacementMetric(format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const leftEdge = rects.logo.x
  const topEdge = rects.logo.y
  const rightEdge = 100 - (rects.logo.x + rects.logo.w)
  const family = getFormatFamily(format)

  if (leftEdge < 4 || topEdge < 4 || rightEdge < 4) {
    score -= 18
    pushIssue(
      issues,
      fixes,
      family === 'presentation' ? 'presentation-anchor-missing' : 'logo-unanchored',
      'medium',
      family === 'presentation' ? 'Presentation layout is missing a clean visual anchor.' : 'Logo placement feels unanchored.',
      'Move the logo to a cleaner anchor and give it safe margin.',
      'move-logo-to-anchor'
    )
  }
  if (rects.logo.y > 16) {
    score -= 8
    pushIssue(issues, fixes, 'logo-too-low', 'low', 'Logo sits too low to act as a structural anchor.', 'Return the logo to the top anchor.', 'move-logo-to-anchor')
  }
  return roundMetric(score)
}

function getImageTextHarmonyMetric(format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const textBounds = getTextBounds(rects)
  const imageGap = rects.image.x > textBounds.left ? rects.image.x - textBounds.right : textBounds.left - (rects.image.x + rects.image.w)
  const family = getFormatFamily(format)
  const marketplaceCompact = format.category === 'marketplace'

  if (imageGap > (family === 'billboard' || family === 'landscape' ? 18 : 14)) {
    score -= 18
    pushIssue(
      issues,
      fixes,
      family === 'display-leaderboard' ? 'image-card-too-detached' : 'image-detached',
      'high',
      family === 'display-leaderboard' ? 'Image card feels detached from the compact horizontal banner.' : 'Image feels detached from the text cluster.',
      'Reduce dead space and strengthen image-text relationship.',
      'reduce-dead-space'
    )
  }
  if ((family === 'billboard' || family === 'landscape') && rects.image.w < (marketplaceCompact ? 16 : 24)) {
    score -= 16
    pushIssue(issues, fixes, 'image-detached', 'medium', 'Image is too weak for the horizontal canvas and loses compositional role.', 'Increase image footprint or rebalance the split ratio.', 'increase-image-presence')
  }
  return roundMetric(score)
}

function getNegativeSpaceMetric(format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const union = bounds([rects.image, rects.title, rects.subtitle, rects.cta, rects.logo, rects.badge])
  const occupied = (union.right - union.left) * (union.bottom - union.top)
  const fillRatio = occupied / 10000
  const rightVoid = 100 - Math.max(rects.image.x + rects.image.w, rects.title.x + rects.title.w, rects.subtitle.x + rects.subtitle.w, rects.cta.x + rects.cta.w)
  const family = getFormatFamily(format)

  if (fillRatio < (format.key === 'print-billboard' ? 0.5 : format.key === 'display-billboard' ? 0.44 : family === 'billboard' ? 0.46 : family === 'landscape' ? 0.42 : family === 'square' ? 0.38 : 0.34)) {
    score -= 16
    pushIssue(
      issues,
      fixes,
      family === 'square'
        ? 'corner-dead-space'
        : family === 'display-leaderboard'
          ? 'banner-underfilled'
          : family === 'billboard' || family === 'landscape'
            ? 'inactive-empty-space'
            : 'too-much-dead-space',
      'medium',
      family === 'square'
        ? 'Square composition leaves dead corners and loses compact cohesion.'
        : family === 'display-leaderboard'
          ? 'Leaderboard feels underfilled and does not use the narrow height efficiently.'
          : family === 'billboard' || family === 'landscape'
            ? 'Layout feels too empty for the width of the canvas.'
          : 'Too much dead space weakens the composition.',
      'Rebalance image and text regions to use the canvas better.',
      'reduce-dead-space'
    )
  }

  if ((family === 'billboard' || family === 'landscape' || family === 'display-leaderboard') && rightVoid > (format.key === 'display-billboard' ? 16 : 18)) {
    score -= 18
    pushIssue(
      issues,
      fixes,
      family === 'billboard' ? 'inactive-wide-space' : family === 'display-leaderboard' ? 'banner-underfilled' : 'inactive-empty-space',
      'high',
      family === 'billboard'
        ? 'Billboard composition leaves inactive wide space and feels underspread.'
        : family === 'display-leaderboard'
          ? 'Leaderboard banner feels underfilled and compositionally weak.'
          : 'Wide layout leaves inactive empty space.',
      'Increase image role, widen the text cluster, or switch to a stronger wide composition.',
      'rebalance-split-ratio'
    )
  }
  return roundMetric(score)
}

function getClusterCohesionMetric(rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const clusterTop = rects.title.y
  const clusterBottom = rects.cta.y + rects.cta.h
  const clusterHeight = clusterBottom - clusterTop
  const ctaGap = rects.cta.y - (rects.subtitle.y + rects.subtitle.h)

  if (clusterHeight > 38 && rects.title.w < 50) {
    score -= 12
    pushIssue(issues, fixes, 'cluster-stretched', 'medium', 'Text cluster is stretched and loses cohesion.', 'Compress the cluster and redistribute vertical rhythm.', 'rebalance-text-cluster')
  }
  if (ctaGap > 9) {
    score -= 12
    pushIssue(issues, fixes, 'cluster-fragmented', 'medium', 'CTA is not visually tied to the message cluster.', 'Move CTA closer and tighten the rhythm.', 'move-cta-closer-to-text')
  }
  return roundMetric(score)
}

function getRatioSuitabilityMetric(format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const textBounds = getTextBounds(rects)
  const emptyBottom = 100 - textBounds.bottom
  const family = getFormatFamily(format)

  if ((family === 'portrait' || family === 'flyer' || family === 'poster' || family === 'display-skyscraper') && textBounds.top > 62) {
    score -= 18
    pushIssue(
      issues,
      fixes,
      family === 'portrait' || family === 'display-skyscraper' ? 'text-cluster-too-low' : 'slide-structure-weak',
      'high',
      family === 'portrait' || family === 'display-skyscraper'
        ? 'Text cluster sits too low for the vertical composition.'
        : 'Composition sits too low and lacks print/presentation discipline.',
      'Raise the cluster and rebalance vertical flow.',
      'raise-text-cluster'
    )
  }

  if (family === 'square' && emptyBottom > 14) {
    score -= 12
    pushIssue(issues, fixes, 'headline-not-central-enough', 'medium', 'Square layout underuses the lower zone and loses compact focus.', 'Tighten block relationships and reduce dead space.', 'reduce-dead-space')
  }
  if ((family === 'billboard' || family === 'landscape') && rects.title.w < 26) {
    score -= 10
    pushIssue(
      issues,
      fixes,
      family === 'billboard' ? 'composition-underscaled' : 'wide-layout-underuses-width',
      'medium',
      family === 'billboard' ? 'Composition feels underscaled for the width of the canvas.' : 'Horizontal layout does not use the canvas width strongly enough.',
      'Widen the text region or strengthen the wide composition.',
      'widen-text-container'
    )
  }
  return roundMetric(score)
}

function getOverlayHeavinessMetric(scene: Scene, rects: RectMap, format: FormatDefinition, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const family = getFormatFamily(format)
  const overlayLike = rects.image.w > 88 && rects.image.h > 84
  const overlayWeight = (scene.logo.bgOpacity || 0) + (scene.badge.bgOpacity || 0) + (1 - (scene.subtitle.opacity || 0.84))

  if (overlayLike && overlayWeight > 1.2) {
    score -= 18
    pushIssue(
      issues,
      fixes,
      family === 'portrait' ? 'overlay-block-too-heavy' : 'overlay-too-heavy',
      'high',
      family === 'portrait' ? 'Bottom overlay block is too heavy for the vertical composition.' : 'Overlay is too heavy and flattens the composition.',
      'Lighten overlay treatment and keep only local support behind text.',
      'lighten-overlay'
    )
  }

  return roundMetric(score)
}

function getTextRhythmMetric(scene: Scene, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const titleLines = splitTextIntoLines(scene.title.text || '', scene.title.charsPerLine || 20, scene.title.maxLines || 3)
  const subtitleLines = splitTextIntoLines(scene.subtitle.text || '', scene.subtitle.charsPerLine || 30, scene.subtitle.maxLines || 4)
  const lineVariance = (lines: string[]) => {
    if (lines.length <= 1) return 0
    const lengths = lines.map((line) => line.length)
    const avg = lengths.reduce((sum, value) => sum + value, 0) / lengths.length
    return lengths.reduce((sum, value) => sum + Math.abs(value - avg), 0) / lengths.length
  }

  const titleVariance = lineVariance(titleLines)
  const subtitleVariance = lineVariance(subtitleLines)
  if (titleLines.length >= 3 && titleVariance > 7) {
    score -= 14
    pushIssue(issues, fixes, 'headline-rhythm-poor', 'medium', 'Headline rhythm is poor and the lines feel uneven.', 'Improve line breaks or widen the headline block.', 'improve-line-breaks')
  }
  if (subtitleLines.length >= 3 && subtitleVariance > 10) {
    score -= 10
    pushIssue(issues, fixes, 'text-rhythm-poor', 'low', 'Supporting text rhythm feels uneven.', 'Adjust text measure and line breaks.', 'improve-line-breaks')
  }
  return roundMetric(score)
}

function getLineBreakQualityMetric(scene: Scene, issues: LayoutIssue[], fixes: Set<FixAction>) {
  let score = 100
  const titleLines = splitTextIntoLines(scene.title.text || '', scene.title.charsPerLine || 20, scene.title.maxLines || 3)
  const subtitleLines = splitTextIntoLines(scene.subtitle.text || '', scene.subtitle.charsPerLine || 30, scene.subtitle.maxLines || 4)

  const hasAwkwardOrphan = (lines: string[]) => lines.some((line, index) => index === lines.length - 1 && line.trim().split(/\s+/).length === 1 && line.trim().length <= 6)
  const hasMicroLine = (lines: string[]) => lines.some((line, index) => index > 0 && line.trim().length <= 4)

  if (hasAwkwardOrphan(titleLines) || hasMicroLine(titleLines)) {
    score -= 16
    pushIssue(issues, fixes, 'line-breaks-awkward', 'medium', 'Headline line breaks are awkward.', 'Improve line breaks and headline measure.', 'improve-line-breaks')
  }
  if (hasAwkwardOrphan(subtitleLines) || hasMicroLine(subtitleLines)) {
    score -= 10
    pushIssue(issues, fixes, 'line-breaks-awkward', 'low', 'Supporting text line breaks are awkward.', 'Widen the text container or reflow the copy.', 'improve-line-breaks')
  }
  return roundMetric(score)
}

function getScaleToCanvasMetric(format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  const family = getFormatFamily(format)
  const textBounds = getTextBounds(rects)
  const occupiedBounds = bounds([rects.image, rects.title, rects.subtitle, rects.cta, rects.logo, rects.badge])
  const widthUsage = occupiedBounds.right - occupiedBounds.left
  const heightUsage = occupiedBounds.bottom - occupiedBounds.top
  const titleScale = rects.title.w * rects.title.h
  let score = 100

  if ((family === 'billboard' || family === 'display-leaderboard') && widthUsage < (format.key === 'print-billboard' ? 80 : format.key === 'display-billboard' ? 78 : 74)) {
    score -= 24
    pushIssue(
      issues,
      fixes,
      family === 'billboard' ? 'web-banner-inside-billboard' : 'underuses-width',
      'high',
      family === 'billboard' ? 'Layout feels like a web banner placed inside a billboard canvas.' : 'Wide display layout underuses the canvas width.',
      'Increase scale-to-canvas and strengthen horizontal spread.',
      'rebalance-split-ratio'
    )
  }

  if (family === 'billboard' && titleScale < (format.key === 'print-billboard' ? 260 : 220)) {
    score -= 20
    pushIssue(issues, fixes, 'headline-lacks-dominance-for-wide-format', 'high', 'Headline lacks dominance for a billboard-scale layout.', 'Increase headline scale and reduce the web-banner feel.', 'increase-headline-size')
  }

  if (family === 'presentation' && heightUsage < 52) {
    score -= 14
    pushIssue(issues, fixes, 'slide-structure-weak', 'medium', 'Presentation layout feels underscaled and lacks slide structure.', 'Enlarge the main message block and improve slide composure.', 'widen-text-container')
  }

  if ((family === 'flyer' || family === 'poster') && textBounds.bottom < 76) {
    score -= 12
    pushIssue(issues, fixes, 'print-discipline-weak', 'medium', 'Print layout feels underscaled and too digital for the page.', 'Strengthen print hierarchy and use more of the page intentionally.', 'increase-headline-size')
  }

  if (family === 'display-leaderboard') {
    const clusterHeight = textBounds.bottom - textBounds.top
    if (clusterHeight > (format.key === 'display-billboard' ? 54 : 38)) {
      score -= 18
      pushIssue(issues, fixes, 'compressed-horizontal-failure', 'high', format.key === 'display-billboard' ? 'Horizontal hierarchy is too tall for a display billboard and weakens scanability.' : 'Horizontal compression failed and the text stack is too tall for a leaderboard.', 'Reduce line count and switch to a more compact horizontal strategy.', 'compress-text-region')
    }
    if (rects.title.y + rects.title.h > (format.key === 'display-billboard' ? 82 : 86) || rects.subtitle.y + rects.subtitle.h > (format.key === 'display-billboard' ? 88 : 92) || rects.cta.y + rects.cta.h > (format.key === 'display-billboard' ? 90 : 96)) {
      score -= 20
      pushIssue(issues, fixes, 'text-out-of-bounds', 'high', 'Text stack overflows the available leaderboard height.', 'Compress the hierarchy and rebuild the horizontal cluster.', 'compress-text-region')
    }
  }

  return roundMetric(score)
}

function getFormatSpecificMetrics(format: FormatDefinition, rects: RectMap, metrics: LayoutQualityMetrics, issues: LayoutIssue[], fixes: Set<FixAction>): FormatSpecificMetrics {
  const family = getFormatFamily(format)
  const textBounds = getTextBounds(rects)
  const occupiedBounds = bounds([rects.image, rects.title, rects.subtitle, rects.cta, rects.logo, rects.badge])
  const mass = getVisualMass(rects)
  const widthUsage = clamp((occupiedBounds.right - occupiedBounds.left) * 1.2, 0, 100)
  const verticalBalance = roundMetric(100 - Math.abs(mass.centerY - 46) * 2.8)
  const horizontalSpread = roundMetric(100 - Math.abs(mass.centerX - 50) * 2.2 - Math.max(0, 72 - (occupiedBounds.right - occupiedBounds.left)) * 0.9)
  const printDiscipline = roundMetric(average([metrics.spacingQuality, metrics.textHierarchy, metrics.lineBreakQuality, metrics.scaleToCanvas]))
  const billboardScale = roundMetric(average([metrics.scaleToCanvas, metrics.textHierarchy, widthUsage]))
  const displayDensityControl = roundMetric(average([metrics.readability, metrics.clusterCohesion, 100 - Math.max(0, textBounds.bottom - textBounds.top - 42) * 2]))
  const slideComposure = roundMetric(average([metrics.visualBalance, metrics.spacingQuality, metrics.scaleToCanvas]))

  if (family === 'square' && (mass.centerX < 41 || mass.centerX > 59)) {
    pushIssue(issues, fixes, 'imbalanced-square-composition', 'medium', 'Square composition lacks compact central balance.', 'Tighten block relationships and reduce corner dead space.', 'rebalance-text-cluster')
  }
  if (family === 'square' && metrics.clusterCohesion < 74) {
    pushIssue(issues, fixes, 'weak-square-cohesion', 'medium', 'Square layout lacks compact cohesion between image and message.', 'Tighten the square composition and reduce detached spacing.', 'reduce-dead-space')
  }

  if (family === 'portrait') {
    if (mass.centerY > 58) {
      pushIssue(issues, fixes, 'vertical-flow-weak', 'medium', 'Vertical reading flow is weak and the composition collapses downward.', 'Raise the text cluster and lighten the lower block.', 'raise-text-cluster')
    }
    if (rects.cta.y > 88) {
      pushIssue(issues, fixes, 'cta-too-close-to-edge', 'medium', 'CTA is too close to the lower safe zone.', 'Raise the CTA and tighten the lower cluster.', 'raise-text-cluster')
    }
  }

  if (family === 'landscape' && widthUsage < 72) {
    pushIssue(issues, fixes, 'underuses-width', 'medium', 'Landscape layout underuses the width of the canvas.', 'Widen the message cluster and strengthen horizontal spread.', 'rebalance-split-ratio')
  }
  if ((family === 'landscape' || family === 'display-leaderboard' || family === 'billboard') && horizontalSpread < 74) {
    pushIssue(issues, fixes, 'horizontal-spread-weak', 'medium', 'Horizontal spread is weak for the width of the format.', 'Spread image and text mass more confidently across the canvas.', 'rebalance-split-ratio')
  }

  if (family === 'display-rectangle' && displayDensityControl < 72) {
    pushIssue(issues, fixes, 'too-dense-for-small-format', 'high', 'Small display format is too dense and loses clarity.', 'Simplify hierarchy and tighten the message.', 'widen-text-container')
  }

  if (family === 'display-skyscraper' && verticalBalance < 78) {
    pushIssue(issues, fixes, 'text-cluster-too-low', 'high', 'Skyscraper layout lets the message drift too low.', 'Raise the text cluster and keep the CTA inside a safer action zone.', 'raise-text-cluster')
  }
  if (family === 'display-skyscraper' && metrics.clusterCohesion < 76) {
    pushIssue(issues, fixes, 'vertical-fragmentation', 'medium', 'Skyscraper composition feels fragmented from top to bottom.', 'Rebuild the vertical stack and tighten image/text progression.', 'rebalance-text-cluster')
  }

  if (family === 'display-leaderboard' && horizontalSpread < (format.key === 'display-billboard' ? 76 : 72)) {
    pushIssue(issues, fixes, 'web-banner-inside-wide-canvas', 'high', 'Leaderboard feels underfilled and lacks strong horizontal spread.', 'Increase image scale and rebalance the split ratio.', 'rebalance-split-ratio')
  }

  if (family === 'billboard') {
    if (billboardScale < (format.key === 'print-billboard' ? 82 : 76)) {
      pushIssue(issues, fixes, 'billboard-scale-too-weak', 'high', 'Composition is underscaled for a billboard-style canvas.', 'Increase scale-to-canvas and strengthen the wide family choice.', 'increase-scale-to-canvas')
    }
    if (horizontalSpread < (format.key === 'print-billboard' ? 78 : 74)) {
      pushIssue(issues, fixes, 'inactive-wide-space', 'medium', 'Negative space feels inactive instead of intentional.', 'Spread the composition more confidently across the canvas.', 'rebalance-split-ratio')
    }
  }

  if ((family === 'flyer' || family === 'poster') && printDiscipline < 74) {
    pushIssue(issues, fixes, 'print-discipline-weak', 'medium', 'Print composition lacks the alignment discipline expected from a flyer/poster.', 'Tighten spacing and strengthen print hierarchy.', 'increase-cluster-padding')
  }

  if (family === 'presentation') {
    if (slideComposure < 76) {
      pushIssue(issues, fixes, 'slide-structure-weak', 'high', 'Presentation composition feels too banner-like and lacks slide structure.', 'Strengthen the main message block and reduce ad-like tension.', 'change-layout-family')
    }
    if (rects.cta.w > 26) {
      pushIssue(issues, fixes, 'too-banner-like-for-slide', 'medium', 'CTA treatment feels too banner-like for a presentation slide.', 'Reduce CTA aggressiveness and strengthen slide composure.', 'reduce-image-presence')
    }
  }

  return {
    widthUsage: family === 'landscape' || family === 'display-leaderboard' || family === 'billboard' ? widthUsage : undefined,
    verticalBalance: family === 'portrait' || family === 'display-skyscraper' || family === 'flyer' || family === 'poster' ? verticalBalance : undefined,
    horizontalSpread: family === 'landscape' || family === 'display-leaderboard' || family === 'billboard' ? horizontalSpread : undefined,
    printDiscipline: family === 'flyer' || family === 'poster' ? printDiscipline : undefined,
    billboardScale: family === 'billboard' ? billboardScale : undefined,
    displayDensityControl: family.startsWith('display') ? displayDensityControl : undefined,
    slideComposure: family === 'presentation' ? slideComposure : undefined,
  }
}

function deriveTopIssues(issues: LayoutIssue[]) {
  return [...issues]
    .sort((left, right) => ISSUE_PRIORITY[left.severity] - ISSUE_PRIORITY[right.severity])
    .slice(0, 4)
}

function computeWeightedBaseScore(metrics: LayoutQualityMetrics) {
  const weights = {
    readability: 0.12,
    contrast: 0.08,
    textHierarchy: 0.12,
    visualBalance: 0.14,
    spacingQuality: 0.1,
    ctaProminence: 0.08,
    logoPlacement: 0.05,
    imageTextHarmony: 0.1,
    negativeSpaceBalance: 0.08,
    clusterCohesion: 0.08,
    ratioSuitability: 0.03,
    overlayHeaviness: 0.04,
    textRhythm: 0.04,
    lineBreakQuality: 0.04,
    scaleToCanvas: 0.08,
  } as const

  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0)
  const total =
    metrics.readability * weights.readability +
    metrics.contrast * weights.contrast +
    metrics.textHierarchy * weights.textHierarchy +
    metrics.visualBalance * weights.visualBalance +
    metrics.spacingQuality * weights.spacingQuality +
    metrics.ctaProminence * weights.ctaProminence +
    metrics.logoPlacement * weights.logoPlacement +
    metrics.imageTextHarmony * weights.imageTextHarmony +
    metrics.negativeSpaceBalance * weights.negativeSpaceBalance +
    metrics.clusterCohesion * weights.clusterCohesion +
    metrics.ratioSuitability * weights.ratioSuitability +
    metrics.overlayHeaviness * weights.overlayHeaviness +
    metrics.textRhythm * weights.textRhythm +
    metrics.lineBreakQuality * weights.lineBreakQuality +
    metrics.scaleToCanvas * weights.scaleToCanvas

  return total / totalWeight
}

function metricAverage(values: number[]) {
  return roundMetric(average(values.map((value) => clamp(value, 0, 100))))
}

function getGap(left: Rect, right: Rect) {
  const horizontal = Math.max(0, Math.max(left.x - (right.x + right.w), right.x - (left.x + left.w)))
  const vertical = Math.max(0, Math.max(left.y - (right.y + right.h), right.y - (left.y + left.h)))
  return Math.max(horizontal, vertical)
}

function hasDigits(text?: string) {
  return /\d/.test(text || '')
}

function estimateTextWidthFit(rect: Rect, maxAllowedWidth: number) {
  if (maxAllowedWidth <= 0) return 100
  const ratio = rect.w / maxAllowedWidth
  if (ratio <= 1) return 100 - Math.max(0, 0.7 - ratio) * 24
  return 100 - Math.min((ratio - 1) * 90, 60)
}

function estimateBreathingRoom(subject: Rect, neighbors: Rect[]) {
  const active = neighbors.filter((neighbor) => neighbor.w > 0 && neighbor.h > 0)
  if (!active.length) return 100
  const gap = Math.min(...active.map((neighbor) => getGap(subject, neighbor)))
  return roundMetric(clamp(gap * 10, 10, 100))
}

function issueCodes(issues: LayoutIssue[]) {
  return issues.map((issue) => issue.code)
}

function collectBlockSuggestedFixes(codes: string[], mapping: Record<string, string>) {
  return uniqueStringArray(
    codes
      .map((code) => mapping[code])
      .filter((value): value is string => Boolean(value))
  )
}

function uniqueStringArray(values: string[]) {
  return [...new Set(values)]
}

function getSafeAreaRect(format: FormatDefinition) {
  const ruleSet = getFormatRuleSet(format)
  return zoneRectToPercent(ruleSet.safeArea.x, ruleSet.safeArea.y, ruleSet.safeArea.w, ruleSet.safeArea.h, format)
}

function getTextClusterRect(rects: RectMap): Rect {
  const boundsRect = getTextBounds(rects)
  return {
    label: 'Text cluster',
    x: boundsRect.left,
    y: boundsRect.top,
    w: boundsRect.right - boundsRect.left,
    h: boundsRect.bottom - boundsRect.top,
  }
}

function getHeadlineScaleMetric(scene: Scene, format: FormatDefinition) {
  const rule = getFormatRuleSet(format).typography.headline
  const size = getNumber(scene.title.fontSize, rule.preferredFontSize)
  const preferred = rule.preferredFontSize
  return roundMetric(100 - Math.min(Math.abs(size - preferred) / Math.max(preferred, 1) * 110, 55))
}

export function analyzeHeadlineBlock(scene: Scene, format: FormatDefinition): TextBlockAnalysis {
  const rects = getRectangles(scene, format)
  const ruleSet = getFormatRuleSet(format)
  const lineBreakQuality = getLineBreakQualityMetric(scene, [], new Set())
  const readability = roundMetric(average([getReadabilityMetric(scene, format, [], new Set()), getContrastMetric(scene, [], new Set())]))
  const hierarchyStrength = roundMetric(
    100 -
      Math.max(0, ((scene.subtitle.fontSize || 1) * 1.6 - (scene.title.fontSize || 0))) * 3 -
      Math.max(0, ((scene.cta.fontSize || 1) * 1.3 - (scene.title.fontSize || 0))) * 2
  )
  const widthFit = roundMetric(estimateTextWidthFit(rects.title, (ruleSet.typography.headline.maxWidth / format.width) * 100))
  const titleLines = estimateLines(scene.title.text, scene.title.charsPerLine, scene.title.maxLines)
  const density = roundMetric(100 - Math.max(0, titleLines - ruleSet.typography.headline.maxLines) * 22 - Math.max(0, ((scene.title.text || '').length - 56) * 0.5))
  const breathingRoom = estimateBreathingRoom(rects.title, [rects.subtitle, rects.image, rects.logo, rects.badge])
  const scaleToFormat = getHeadlineScaleMetric(scene, format)
  const issues: string[] = []

  if ((scene.title.fontSize || 0) < ruleSet.typography.headline.minFontSize) issues.push('headline-too-small-for-format')
  if ((scene.title.fontSize || 0) > ruleSet.typography.headline.maxFontSize) issues.push('headline-too-large-for-column')
  if (lineBreakQuality < 74) issues.push('headline-line-breaks-awkward')
  if (hierarchyStrength < 74) issues.push('headline-lacks-dominance')
  if (density < 72) issues.push('headline-too-dense')

  return {
    blockId: 'headline',
    role: 'headline',
    score: metricAverage([readability, lineBreakQuality, hierarchyStrength, widthFit, density, breathingRoom, scaleToFormat]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'headline-too-small-for-format': 'increase-headline-size',
      'headline-too-large-for-column': 'reduce-headline-size',
      'headline-line-breaks-awkward': 'reflow-headline',
      'headline-lacks-dominance': 'change-hierarchy-ratios',
      'headline-too-dense': 'widen-text-container',
    }),
    metrics: {
      readability,
      lineBreakQuality,
      hierarchyStrength,
      widthFit,
      density,
      breathingRoom,
      scaleToFormat,
    },
  }
}

export function analyzeSubtitleBlock(scene: Scene, format: FormatDefinition): TextBlockAnalysis | undefined {
  if (!(scene.subtitle.text || '').trim()) return undefined
  const rects = getRectangles(scene, format)
  const ruleSet = getFormatRuleSet(format)
  const readability = roundMetric(average([getReadabilityMetric(scene, format, [], new Set()), getContrastMetric(scene, [], new Set())]))
  const lineBreakQuality = roundMetric(analyzeTextRhythm(scene.subtitle.text || '', scene.subtitle.charsPerLine || 24, scene.subtitle.maxLines || 3))
  const hierarchyStrength = roundMetric(clamp(((scene.title.fontSize || 1) / Math.max(scene.subtitle.fontSize || 1, 1)) * 34, 0, 100))
  const widthFit = roundMetric(estimateTextWidthFit(rects.subtitle, (ruleSet.typography.subtitle.maxWidth / format.width) * 100))
  const subtitleLines = estimateLines(scene.subtitle.text, scene.subtitle.charsPerLine, scene.subtitle.maxLines)
  const density = roundMetric(100 - Math.max(0, subtitleLines - ruleSet.typography.subtitle.maxLines) * 18 - Math.max(0, ((scene.subtitle.text || '').length - 110) * 0.15))
  const breathingRoom = estimateBreathingRoom(rects.subtitle, [rects.title, rects.cta, rects.image])
  const scaleToFormat = roundMetric(
    100 - Math.min(Math.abs((scene.subtitle.fontSize || ruleSet.typography.subtitle.preferredFontSize) - ruleSet.typography.subtitle.preferredFontSize) / Math.max(ruleSet.typography.subtitle.preferredFontSize, 1) * 120, 55)
  )
  const issues: string[] = []

  if (density < 72) issues.push('subtitle-too-dense')
  if (breathingRoom < 68) issues.push('text-insufficient-breathing-room')

  return {
    blockId: 'subtitle',
    role: 'subtitle',
    score: metricAverage([readability, lineBreakQuality, hierarchyStrength, widthFit, density, breathingRoom, scaleToFormat]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'subtitle-too-dense': 'compress-cluster',
      'text-insufficient-breathing-room': 'loosen-cluster',
    }),
    metrics: {
      readability,
      lineBreakQuality,
      hierarchyStrength,
      widthFit,
      density,
      breathingRoom,
      scaleToFormat,
    },
  }
}

export function analyzeBodyBlock(scene: Scene, format: FormatDefinition): TextBlockAnalysis | undefined {
  if (!(scene.subtitle.text || '').trim() || (scene.subtitle.text || '').length < 80) return undefined
  const rects = getRectangles(scene, format)
  const ruleSet = getFormatRuleSet(format)
  const readability = roundMetric(clamp(((scene.subtitle.fontSize || 0) / Math.max(ruleSet.typography.body.preferredFontSize, 1)) * 100, 0, 100))
  const lineBreakQuality = roundMetric(analyzeTextRhythm(scene.subtitle.text || '', Math.max((scene.subtitle.charsPerLine || 24) - 2, 12), scene.subtitle.maxLines || 4))
  const hierarchyStrength = roundMetric(clamp(((scene.title.fontSize || 1) / Math.max(scene.subtitle.fontSize || 1, 1)) * 28, 0, 100))
  const widthFit = roundMetric(estimateTextWidthFit(rects.subtitle, (ruleSet.typography.body.maxWidth / format.width) * 100))
  const density = roundMetric(100 - Math.max(0, ((scene.subtitle.text || '').length - 160) * 0.22))
  const breathingRoom = estimateBreathingRoom(rects.subtitle, [rects.cta, rects.image])
  const scaleToFormat = roundMetric(clamp(readability * 0.9 + widthFit * 0.1, 0, 100))
  const issues: string[] = []

  if ((scene.subtitle.fontSize || 0) < ruleSet.typography.body.minFontSize) issues.push('body-too-small')
  if (widthFit < 72) issues.push('body-too-wide')
  if (getGap(rects.subtitle, rects.cta) < 2) issues.push('body-too-close-to-cta')
  if (breathingRoom < 66) issues.push('text-insufficient-breathing-room')

  return {
    blockId: 'body',
    role: 'body',
    score: metricAverage([readability, lineBreakQuality, hierarchyStrength, widthFit, density, breathingRoom, scaleToFormat]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'body-too-small': 'increase-body-size',
      'body-too-wide': 'narrow-text-container',
      'body-too-close-to-cta': 'move-cta-closer-to-text',
      'text-insufficient-breathing-room': 'loosen-cluster',
    }),
    metrics: {
      readability,
      lineBreakQuality,
      hierarchyStrength,
      widthFit,
      density,
      breathingRoom,
      scaleToFormat,
    },
  }
}

export function analyzeBadgeBlock(scene: Scene, format: FormatDefinition): TextBlockAnalysis | undefined {
  if (!(scene.badge.text || '').trim()) return undefined
  const rects = getRectangles(scene, format)
  const readability = roundMetric(average([getContrastMetric(scene, [], new Set()), clamp((scene.badge.fontSize || 12) * 5, 0, 100)]))
  const lineBreakQuality = 100
  const hierarchyStrength = roundMetric(clamp(((scene.title.fontSize || 1) / Math.max(scene.badge.fontSize || 1, 1)) * 22, 0, 100))
  const widthFit = roundMetric(clamp(rects.badge.w > 30 ? 72 : 96, 0, 100))
  const density = roundMetric(100 - Math.max(0, ((scene.badge.text || '').length - 22) * 1.8))
  const breathingRoom = estimateBreathingRoom(rects.badge, [rects.logo, rects.title])
  const scaleToFormat = roundMetric(clamp((scene.badge.fontSize || 12) * 5.5, 0, 100))
  const issues: string[] = []

  if (density < 68) issues.push('subtitle-too-dense')
  if (breathingRoom < 64) issues.push('text-insufficient-breathing-room')

  return {
    blockId: 'badge',
    role: 'badge',
    score: metricAverage([readability, lineBreakQuality, hierarchyStrength, widthFit, density, breathingRoom, scaleToFormat]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'subtitle-too-dense': 'reduce-badge-prominence',
      'text-insufficient-breathing-room': 'reposition-badge',
    }),
    metrics: {
      readability,
      lineBreakQuality,
      hierarchyStrength,
      widthFit,
      density,
      breathingRoom,
      scaleToFormat,
    },
  }
}

export function analyzePriceBlock(scene: Scene, format: FormatDefinition): TextBlockAnalysis | undefined {
  const sourceText = hasDigits(scene.badge.text) ? scene.badge.text : undefined
  if (!sourceText) return undefined
  const rects = getRectangles(scene, format)
  const readability = roundMetric(average([getContrastMetric(scene, [], new Set()), clamp((scene.badge.fontSize || 12) * 4.8, 0, 100)]))
  const lineBreakQuality = 100
  const hierarchyStrength = roundMetric(clamp(((scene.title.fontSize || 1) / Math.max(scene.badge.fontSize || 1, 1)) * 28, 0, 100))
  const widthFit = roundMetric(clamp(rects.badge.w > 26 ? 76 : 94, 0, 100))
  const density = roundMetric(100 - Math.max(0, (sourceText.length - 16) * 2.4))
  const breathingRoom = estimateBreathingRoom(rects.badge, [rects.title, rects.cta])
  const scaleToFormat = roundMetric(clamp((scene.badge.fontSize || 12) * 5.4, 0, 100))
  const issues: string[] = []

  if (hierarchyStrength < 60) issues.push('headline-lacks-dominance')
  if (breathingRoom < 66) issues.push('text-insufficient-breathing-room')

  return {
    blockId: 'price',
    role: 'price',
    score: metricAverage([readability, lineBreakQuality, hierarchyStrength, widthFit, density, breathingRoom, scaleToFormat]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'headline-lacks-dominance': 'rebalance-text-hierarchy',
      'text-insufficient-breathing-room': 'integrate-badge-into-cluster',
    }),
    metrics: {
      readability,
      lineBreakQuality,
      hierarchyStrength,
      widthFit,
      density,
      breathingRoom,
      scaleToFormat,
    },
  }
}

export function analyzeCtaBlock(scene: Scene, format: FormatDefinition): CtaAnalysis {
  const rects = getRectangles(scene, format)
  const ruleSet = getFormatRuleSet(format)
  const textCluster = getTextClusterRect(rects)
  const prominence = getCtaProminenceMetric(scene, rects, format, [], new Set())
  const readability = roundMetric(average([getContrastMetric(scene, [], new Set()), clamp((scene.cta.fontSize || 12) * 5.4, 0, 100)]))
  const spacing = estimateBreathingRoom(rects.cta, [rects.subtitle, rects.image])
  const safeArea = getSafeAreaRect(format)
  const edgeGap = Math.min(
    rects.cta.x - safeArea.x,
    rects.cta.y - safeArea.y,
    safeArea.x + safeArea.w - (rects.cta.x + rects.cta.w),
    safeArea.y + safeArea.h - (rects.cta.y + rects.cta.h)
  )
  const edgeSafety = roundMetric(clamp(edgeGap * 8, 0, 100))
  const clusterIntegration = roundMetric(100 - Math.min(getGap(rects.cta, textCluster) * 12, 60))
  const actionClarity = roundMetric(clamp((scene.cta.w || 0) * 3 + (scene.cta.h || 0) * 4 + (scene.cta.fontSize || 12) * 2, 0, 100))
  const issues: string[] = []

  if (prominence < 72) issues.push('cta-too-weak')
  if ((scene.cta.w || 0) < (ruleSet.elements.cta.minW || 0) / format.width * 100 || (scene.cta.h || 0) < (ruleSet.elements.cta.minH || 0) / format.height * 100) {
    issues.push('cta-too-small')
  }
  if (edgeSafety < 72) issues.push('cta-too-close-to-edge')
  if (clusterIntegration < 74) issues.push('cta-too-far-from-text')
  if (actionClarity < 70) issues.push('cta-reads-as-decorative')

  return {
    blockId: 'cta',
    role: 'cta',
    score: metricAverage([prominence, readability, spacing, edgeSafety, clusterIntegration, actionClarity]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'cta-too-weak': 'increase-cta-size',
      'cta-too-small': 'increase-cta-size',
      'cta-too-close-to-edge': 'reposition-cta',
      'cta-too-far-from-text': 'move-cta-closer-to-text',
      'cta-reads-as-decorative': 'increase-cta-contrast',
    }),
    metrics: {
      prominence,
      readability,
      spacing,
      edgeSafety,
      clusterIntegration,
      actionClarity,
    },
  }
}

export function analyzeLogoBlock(scene: Scene, format: FormatDefinition): LogoAnalysis {
  const rects = getRectangles(scene, format)
  const logoPlacement = getLogoPlacementMetric(format, rects, [], new Set())
  const scaleFit = roundMetric(clamp((scene.logo.w || 0) * 5, 0, 100))
  const spacing = estimateBreathingRoom(rects.logo, [rects.title, rects.badge, rects.image])
  const hierarchyInterference = roundMetric(100 - Math.min(intersects(rects.logo, rects.title) ? 70 : getGap(rects.logo, rects.title) < 2 ? 44 : 0, 100))
  const zoneValidity = roundMetric(isRectInsideAllowedZones('logo', rects.logo, format) ? 100 : 58)
  const anchorStrength = roundMetric(average([logoPlacement, zoneValidity, spacing]))
  const issues: string[] = []

  if (anchorStrength < 72) issues.push('logo-unanchored')
  if (scaleFit < 56) issues.push('logo-too-small')
  if (scaleFit > 96) issues.push('logo-too-large')
  if (zoneValidity < 80) issues.push('logo-in-invalid-zone')
  if (hierarchyInterference < 72) issues.push('logo-conflicts-with-hierarchy')

  return {
    blockId: 'logo',
    role: 'logo',
    score: metricAverage([anchorStrength, scaleFit, spacing, hierarchyInterference, zoneValidity]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'logo-unanchored': 'move-logo-to-anchor-zone',
      'logo-too-small': 'resize-logo',
      'logo-too-large': 'resize-logo',
      'logo-in-invalid-zone': 'move-logo-to-anchor-zone',
      'logo-conflicts-with-hierarchy': 'improve-spacing-around-logo',
    }),
    metrics: {
      anchorStrength,
      scaleFit,
      spacing,
      hierarchyInterference,
      zoneValidity,
    },
  }
}

export function analyzeImageBlock(scene: Scene, format: FormatDefinition): ImageBlockAnalysis {
  const rects = getRectangles(scene, format)
  const formatFamily = getFormatFamily(format)
  const coverage = (rects.image.w * rects.image.h) / 10000
  const ruleSet = getFormatRuleSet(format)
  const marketplaceCompact = format.category === 'marketplace'
  const cropQuality = roundMetric(
    100 -
      (scene.image.fit?.includes('slice') ? 8 : 18) -
      (formatFamily === 'portrait' && !scene.image.fit?.includes('YMin') ? 10 : 0)
  )
  const focalPreservation = roundMetric(scene.image.fit?.includes('YMin') || scene.image.fit?.includes('YMid') ? 88 : 74)
  const footprintSuitability = roundMetric(
    100 -
      Math.max(0, (ruleSet.composition.minImageCoverage - coverage) * 180) -
      Math.max(0, (coverage - ruleSet.composition.maxImageCoverage) * 140)
  )
  const formatFit = roundMetric(average([footprintSuitability, getRatioSuitabilityMetric(format, rects, [], new Set())]))
  const marketplacePreferredCoverage = (ruleSet.composition.minImageCoverage + ruleSet.composition.maxImageCoverage) / 2
  const marketplaceCoverageSpread = Math.max((ruleSet.composition.maxImageCoverage - ruleSet.composition.minImageCoverage) / 2, 0.06)
  const visualRoleStrength = roundMetric(
    marketplaceCompact
      ? clamp(100 - (Math.abs(coverage - marketplacePreferredCoverage) / marketplaceCoverageSpread) * 30, 42, 100)
      : formatFamily === 'billboard' || formatFamily === 'portrait'
        ? clamp(coverage * 160, 0, 100)
        : formatFamily === 'display-leaderboard'
          ? 100 - Math.max(0, (coverage - 0.32) * 180)
          : clamp(coverage * 190, 0, 100)
  )
  const compositionIntegration = getImageTextHarmonyMetric(format, rects, [], new Set())
  const shapeSuitability = roundMetric(
    100 -
      (formatFamily === 'presentation' && (scene.image.rx || 0) > 24 ? 24 : 0) -
      (formatFamily === 'display-leaderboard' && rects.image.h > 70 ? 18 : 0)
  )
  const issues: string[] = []

  if (cropQuality < 74) issues.push('image-crop-weak')
  if (footprintSuitability < 72 && coverage < ruleSet.composition.minImageCoverage) issues.push('image-footprint-too-small')
  if (footprintSuitability < 72 && coverage > ruleSet.composition.maxImageCoverage) issues.push('image-footprint-too-large')
  if (visualRoleStrength < 72) issues.push('image-role-weak')
  if (compositionIntegration < 72) issues.push('image-detached')
  if (shapeSuitability < 72) issues.push('image-shape-unsuitable')
  if (formatFit < 74) issues.push('image-format-fit-weak')

  return {
    blockId: 'image',
    role: 'image',
    score: metricAverage([cropQuality, focalPreservation, footprintSuitability, formatFit, visualRoleStrength, compositionIntegration, shapeSuitability]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'image-crop-weak': 'recompute-image-crop',
      'image-footprint-too-small': 'change-image-footprint',
      'image-footprint-too-large': 'change-image-footprint',
      'image-role-weak': 'change-image-role',
      'image-detached': 'rebalance-image-text-relationship',
      'image-shape-unsuitable': 'change-image-shape',
      'image-format-fit-weak': 'change-image-anchor',
    }),
    metrics: {
      cropQuality,
      focalPreservation,
      footprintSuitability,
      formatFit,
      visualRoleStrength,
      compositionIntegration,
      shapeSuitability,
    },
  }
}

export function analyzeTextCluster(scene: Scene, format: FormatDefinition): TextClusterAnalysis {
  const rects = getRectangles(scene, format)
  const textCluster = getTextClusterRect(rects)
  const cohesion = getClusterCohesionMetric(rects, [], new Set())
  const rhythm = roundMetric(average([getTextRhythmMetric(scene, [], new Set()), getLineBreakQualityMetric(scene, [], new Set())]))
  const hierarchy = getTextHierarchyMetric(scene, format, rects, [], new Set())
  const spacing = getSpacingQualityMetric(format, rects, [], new Set())
  const mass = getVisualMass(rects)
  const verticalFlow = roundMetric(100 - Math.abs(mass.centerY - (getFormatFamily(format) === 'portrait' ? 46 : 50)) * 2.2)
  const horizontalFlow = roundMetric(100 - Math.abs(mass.centerX - 44) * (getFormatFamily(format) === 'landscape' || getFormatFamily(format) === 'billboard' || getFormatFamily(format) === 'display-leaderboard' ? 2.1 : 1.3))
  const issues: string[] = []

  if (spacing < 72) issues.push('text-cluster-too-tight')
  if (verticalFlow < 70) issues.push('text-cluster-too-heavy')
  if (horizontalFlow < 70) issues.push('text-cluster-too-stretched')
  if (cohesion < 72) issues.push('text-cluster-fragmented')
  if (getFormatFamily(format) === 'portrait' && verticalFlow < 76) issues.push('text-cluster-vertical-flow-weak')

  return {
    score: metricAverage([cohesion, rhythm, hierarchy, spacing, verticalFlow, horizontalFlow]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'text-cluster-too-tight': 'loosen-cluster',
      'text-cluster-too-heavy': 'raise-cluster',
      'text-cluster-too-stretched': 'compress-cluster',
      'text-cluster-fragmented': 'rebuild-cluster-layout',
      'text-cluster-vertical-flow-weak': 'raise-cluster',
    }),
    metrics: {
      cohesion,
      rhythm,
      hierarchy,
      spacing,
      verticalFlow,
      horizontalFlow,
    },
  }
}

export function analyzeImageTextRelationship(scene: Scene, format: FormatDefinition): ImageTextRelationshipAnalysis {
  const rects = getRectangles(scene, format)
  const image = rects.image
  const textCluster = getTextClusterRect(rects)
  const gap = getGap(image, textCluster)
  const integration = getImageTextHarmonyMetric(format, rects, [], new Set())
  const balance = roundMetric(100 - Math.abs(image.w * image.h - textCluster.w * textCluster.h) / Math.max(image.w * image.h, textCluster.w * textCluster.h, 1) * 100)
  const spacing = roundMetric(clamp(100 - Math.abs(gap - (getFormatFamily(format) === 'display-leaderboard' ? 4 : 8)) * 7, 0, 100))
  const dominanceFit = roundMetric(
    getFormatFamily(format) === 'portrait' || getFormatFamily(format) === 'billboard'
      ? clamp((image.w * image.h) / Math.max(textCluster.w * textCluster.h, 1) * 65, 0, 100)
      : clamp(100 - Math.abs((image.w * image.h) / Math.max(textCluster.w * textCluster.h, 1) - 1.15) * 42, 0, 100)
  )
  const splitQuality = roundMetric(
    getFormatFamily(format) === 'landscape' || getFormatFamily(format) === 'billboard' || getFormatFamily(format) === 'display-leaderboard'
      ? average([balance, spacing, getRatioSuitabilityMetric(format, rects, [], new Set())])
      : average([integration, spacing])
  )
  const proximity = roundMetric(clamp(100 - gap * 10, 0, 100))
  const issues: string[] = []

  if (integration < 72) issues.push('image-text-detached')
  if (splitQuality < 72) issues.push('split-ratio-weak')
  if (spacing < 72) issues.push('image-text-spacing-weak')
  if (dominanceFit < 72) issues.push('dominance-mismatch')

  return {
    score: metricAverage([integration, balance, spacing, dominanceFit, splitQuality, proximity]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'image-text-detached': 'move-image-closer-or-farther',
      'split-ratio-weak': 'rebalance-split-ratio',
      'image-text-spacing-weak': 'adjust-image-text-spacing',
      'dominance-mismatch': 'change-image-text-dominance',
    }),
    metrics: {
      integration,
      balance,
      spacing,
      dominanceFit,
      splitQuality,
      proximity,
    },
  }
}

export function analyzeGlobalLayout(scene: Scene, format: FormatDefinition): GlobalLayoutAnalysis {
  const rects = getRectangles(scene, format)
  const visualBalance = getVisualBalanceMetric(format, rects, [], new Set())
  const negativeSpaceUse = getNegativeSpaceMetric(format, rects, [], new Set())
  const formatSuitability = getRatioSuitabilityMetric(format, rects, [], new Set())
  const scaleToCanvas = getScaleToCanvasMetric(format, rects, [], new Set())
  const campaignConsistency = roundMetric(average([visualBalance, formatSuitability, getClusterCohesionMetric(rects, [], new Set())]))
  const deadSpacePenalty = roundMetric(100 - negativeSpaceUse)
  const issues: string[] = []

  if ((getFormatFamily(format) === 'landscape' || getFormatFamily(format) === 'billboard' || getFormatFamily(format) === 'display-leaderboard') && (getFormatSpecificMetrics(format, rects, {
    readability: 100,
    contrast: 100,
    textHierarchy: 100,
    visualBalance,
    spacingQuality: 100,
    ctaProminence: 100,
    logoPlacement: 100,
    imageTextHarmony: 100,
    negativeSpaceBalance: negativeSpaceUse,
    clusterCohesion: 100,
    ratioSuitability: formatSuitability,
    overlayHeaviness: 100,
    textRhythm: 100,
    lineBreakQuality: 100,
    scaleToCanvas,
  }, [], new Set()).widthUsage || 100) < 72) {
    issues.push('layout-underuses-width')
  }
  if ((getFormatFamily(format) === 'portrait' || getFormatFamily(format) === 'display-skyscraper') && visualBalance < 72) issues.push('layout-underuses-height')
  if (scaleToCanvas < 74) issues.push('composition-underscaled')
  if (negativeSpaceUse < 72) issues.push('inactive-empty-space')
  if (formatSuitability < 74) issues.push('format-fit-weak')
  if (deadSpacePenalty > 28) issues.push('dead-space-dominates')

  return {
    score: metricAverage([visualBalance, negativeSpaceUse, formatSuitability, scaleToCanvas, campaignConsistency, 100 - deadSpacePenalty]),
    issues,
    suggestedFixes: collectBlockSuggestedFixes(issues, {
      'layout-underuses-width': 'increase-scale-to-canvas',
      'layout-underuses-height': 'raise-cluster',
      'composition-underscaled': 'increase-scale-to-canvas',
      'inactive-empty-space': 'reduce-dead-space',
      'format-fit-weak': 'change-layout-family',
      'dead-space-dominates': 'reduce-dead-space',
    }),
    metrics: {
      visualBalance,
      negativeSpaceUse,
      formatSuitability,
      scaleToCanvas,
      campaignConsistency,
      deadSpacePenalty,
    },
  }
}

export function analyzeFullLayout(scene: Scene, format: FormatDefinition): LayoutAnalysis {
  const headline = analyzeHeadlineBlock(scene, format)
  const subtitle = analyzeSubtitleBlock(scene, format)
  const body = analyzeBodyBlock(scene, format)
  const badge = analyzeBadgeBlock(scene, format)
  const price = analyzePriceBlock(scene, format)
  const cta = analyzeCtaBlock(scene, format)
  const logo = analyzeLogoBlock(scene, format)
  const image = analyzeImageBlock(scene, format)
  const textCluster = analyzeTextCluster(scene, format)
  const imageText = analyzeImageTextRelationship(scene, format)
  const global = analyzeGlobalLayout(scene, format)

  const blockAnalyses = [headline, subtitle, body, badge, price, cta, logo, image].filter(Boolean) as Array<
    TextBlockAnalysis | CtaAnalysis | LogoAnalysis | ImageBlockAnalysis
  >
  const overallScore = metricAverage([
    ...blockAnalyses.map((analysis) => analysis.score),
    textCluster.score,
    imageText.score,
    global.score,
  ])
  const prioritizedIssues = uniqueStringArray([
    ...blockAnalyses.flatMap((analysis) => analysis.issues),
    ...textCluster.issues,
    ...imageText.issues,
    ...global.issues,
  ])

  return {
    blocks: {
      headline,
      subtitle,
      body,
      badge,
      price,
      cta,
      logo,
      image,
    },
    clusters: {
      textCluster,
      imageText,
    },
    global,
    overallScore,
    effectiveScore: overallScore,
    prioritizedIssues,
  }
}

export function getSceneAssessment(
  scene: Scene,
  format: FormatDefinition,
  options?: {
    expectedCompositionModelId?: CompositionModelId
    imageAnalysis?: EnhancedImageAnalysis
  }
): LayoutAssessment {
  const issues: LayoutIssue[] = []
  const fixes = new Set<FixAction>()
  const rects = getRectangles(scene, format)
  const formatFamily = getFormatFamily(format)
  const inferredModel = resolveAssessmentCompositionModel(scene, format, rects, options?.expectedCompositionModelId)
  const structuralState = evaluateStructuralLayoutState({ scene, format, compositionModel: inferredModel })

  applyStructuralStateToAssessment(structuralState, issues, fixes)

  collectRuleIssues(scene, format, rects, issues, fixes)
  collectCompositionModelIssues(scene, format, rects, inferredModel, issues, fixes)
  collectOverlaySafetyIssues(scene, format, rects, inferredModel, options?.imageAnalysis, issues, fixes)
  collectStructuralIssues(rects, issues, fixes)
  const boxModel = buildSceneLayoutBoxes(scene, format)
  const { collisions, spacingViolations } = collectBoxModelIssues(scene, format, inferredModel, issues, fixes)

  const metrics: LayoutQualityMetrics = {
    readability: getReadabilityMetric(scene, format, issues, fixes),
    contrast: getContrastMetric(scene, issues, fixes),
    textHierarchy: getTextHierarchyMetric(scene, format, rects, issues, fixes),
    visualBalance: getVisualBalanceMetric(format, rects, issues, fixes),
    spacingQuality: getSpacingQualityMetric(format, rects, issues, fixes),
    ctaProminence: getCtaProminenceMetric(scene, rects, format, issues, fixes),
    logoPlacement: getLogoPlacementMetric(format, rects, issues, fixes),
    imageTextHarmony: getImageTextHarmonyMetric(format, rects, issues, fixes),
    negativeSpaceBalance: getNegativeSpaceMetric(format, rects, issues, fixes),
    clusterCohesion: getClusterCohesionMetric(rects, issues, fixes),
    ratioSuitability: getRatioSuitabilityMetric(format, rects, issues, fixes),
    overlayHeaviness: getOverlayHeavinessMetric(scene, rects, format, issues, fixes),
    textRhythm: getTextRhythmMetric(scene, issues, fixes),
    lineBreakQuality: getLineBreakQualityMetric(scene, issues, fixes),
    scaleToCanvas: getScaleToCanvasMetric(format, rects, issues, fixes),
  }

  const formatSpecificMetrics = getFormatSpecificMetrics(format, rects, metrics, issues, fixes)
  const layoutAnalysis = analyzeFullLayout(scene, format)
  const specificValues = Object.values(formatSpecificMetrics).filter((value): value is number => typeof value === 'number')
  const baseScore = computeWeightedBaseScore(metrics)
  const specificScore = average(specificValues)

  let score = baseScore * 0.82 + specificScore * 0.18
  const criticalSeverity = issues.filter((issue) => issue.severity === 'critical').length
  const highSeverity = issues.filter((issue) => issue.severity === 'high').length
  const mediumSeverity = issues.filter((issue) => issue.severity === 'medium').length
  score -= criticalSeverity * 9 + highSeverity * 5.2 + mediumSeverity * 2.2
  score -= structuralState.status === 'invalid' ? 14 : structuralState.status === 'degraded' ? 6 : 0
  score = clamp(Math.round(score), 0, 100)

  const surfacedIssues = deriveTopIssues(issues)
  if (!surfacedIssues.length) {
    surfacedIssues.push({
      code: 'layout-strong',
      severity: 'low',
      message: 'Layout looks balanced and production-ready.',
      level: 'ok',
      text: 'Layout looks balanced and production-ready.',
    })
  }

  const baseAssessment: LayoutAssessment = {
    score,
    verdict: verdictFromScore(score),
    issues: surfacedIssues,
    recommendedFixes: [...fixes],
    metrics,
    formatSpecificMetrics,
    formatFamily,
    layoutBoxes: boxModel,
    collisions,
    spacingViolations,
    compositionModelId: inferredModel?.id,
    compositionZones: inferredModel?.zones,
    structuralState,
    layoutAnalysis: {
      ...layoutAnalysis,
      effectiveScore: score,
    },
  }
  const visual = getVisualAssessment({
    scene,
    format,
    assessment: baseAssessment,
    imageAnalysis: options?.imageAnalysis,
  })

  return {
    ...baseAssessment,
    visual,
  }
}

function buildHeuristicAIReview(scene: Scene, context: { format: FormatDefinition; assessment: LayoutAssessment }): AILayoutReview {
  const metrics = context.assessment.metrics
  const specific = context.assessment.formatSpecificMetrics
  const family = context.assessment.formatFamily || getFormatFamily(context.format)
  const issues = context.assessment.issues.map((issue) => issue.message)
  const recommendations: string[] = []
  const likelyRootCauses: string[] = []

  let score = context.assessment.score

  if ((metrics?.visualBalance || 100) < 72) {
    score -= 8
    recommendations.push('Rebalance visual mass so the composition stops collapsing to one side.')
    likelyRootCauses.push('visual balance')
  }
  if ((metrics?.ctaProminence || 100) < 72) {
    score -= 6
    recommendations.push('Promote the CTA so it reads as a deliberate action, not a decorative detail.')
    likelyRootCauses.push('weak CTA')
  }
  if ((metrics?.negativeSpaceBalance || 100) < 72) {
    score -= 7
    recommendations.push('Reduce dead zones and make the format feel intentionally used.')
    likelyRootCauses.push('inactive space')
  }
  if ((metrics?.overlayHeaviness || 100) < 76) {
    score -= 5
    recommendations.push('Lighten the overlay so readability is preserved without flattening the image.')
    likelyRootCauses.push('heavy overlay')
  }
  if ((metrics?.lineBreakQuality || 100) < 76 || (metrics?.textRhythm || 100) < 76) {
    score -= 5
    recommendations.push('Improve line breaks and text rhythm so the typography feels composed, not just fitted.')
    likelyRootCauses.push('text rhythm')
  }
  if ((metrics?.imageTextHarmony || 100) < 74) {
    score -= 6
    recommendations.push('Tighten the relationship between the image and the message cluster.')
    likelyRootCauses.push('image-text disconnect')
  }
  if ((metrics?.scaleToCanvas || 100) < 74) {
    score -= 8
    recommendations.push('Increase scale-to-canvas so the composition feels intentional for this format.')
    likelyRootCauses.push('underscaled composition')
  }

  if (family === 'billboard' && (specific?.billboardScale || 100) < 74) {
    score -= 10
    recommendations.push('This still reads like a web banner inside a billboard canvas. Use a more forceful wide composition.')
    likelyRootCauses.push('web-banner feel')
  }
  if (family === 'presentation' && (specific?.slideComposure || 100) < 76) {
    score -= 8
    recommendations.push('Reduce ad-like tension and strengthen slide-like structure and anchoring.')
    likelyRootCauses.push('banner-like slide')
  }
  if (family === 'portrait' && (specific?.verticalBalance || 100) < 74) {
    score -= 7
    recommendations.push('Raise the text cluster and restore a cleaner vertical reading path.')
    likelyRootCauses.push('bottom-heavy vertical flow')
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    issues,
    recommendations,
    likelyRootCauses,
    likelyRootCause: likelyRootCauses,
  }
}

function collectRuleIssues(scene: Scene, format: FormatDefinition, rects: RectMap, issues: LayoutIssue[], fixes: Set<FixAction>) {
  const ruleSet = getFormatRuleSet(format)
  const safeArea = zoneRectToPercent(ruleSet.safeArea.x, ruleSet.safeArea.y, ruleSet.safeArea.w, ruleSet.safeArea.h, format)
  const outerLeft = (ruleSet.outerMargins.left / format.width) * 100
  const outerRight = 100 - (ruleSet.outerMargins.right / format.width) * 100
  const outerTop = (ruleSet.outerMargins.top / format.height) * 100
  const outerBottom = 100 - (ruleSet.outerMargins.bottom / format.height) * 100
  const textBounds = getTextBounds(rects)
  const textRect: Rect = {
    label: 'Text cluster',
    x: textBounds.left,
    y: textBounds.top,
    w: textBounds.right - textBounds.left,
    h: textBounds.bottom - textBounds.top,
  }
  const titleLines = estimateLines(scene.title.text, scene.title.charsPerLine, scene.title.maxLines)

  if (![rects.title, rects.subtitle, rects.cta, rects.logo, rects.badge].every((rect) => containsRect(safeArea, rect))) {
    pushIssue(issues, fixes, 'violates-safe-area', 'high', 'Core content escapes the safe area for this format.', 'Move blocks back inside the safe region.', 'rebalance-text-cluster')
  }
  if (textRect.x < outerLeft || textRect.x + textRect.w > outerRight || textRect.y < outerTop || textRect.y + textRect.h > outerBottom) {
    pushIssue(issues, fixes, 'violates-outer-margin', 'medium', 'The text cluster pushes past the required outer margins.', 'Increase edge spacing and pull content inward.', 'increase-cluster-padding')
  }
  const subtitleGap = rects.subtitle.y - (rects.title.y + rects.title.h)
  const ctaGap = rects.cta.y - (rects.subtitle.y + rects.subtitle.h)
  const minGap = (ruleSet.spacing.sm / format.height) * 100
  if (subtitleGap < minGap || ctaGap < minGap) {
    pushIssue(issues, fixes, 'violates-inner-spacing', 'medium', 'Internal spacing does not meet the format rule set.', 'Open up the text cluster and CTA spacing.', 'expand-spacing')
  }
  if ((scene.title.fontSize || 0) < ruleSet.typography.headline.minFontSize || (scene.title.fontSize || 0) > ruleSet.typography.headline.maxFontSize) {
    pushIssue(issues, fixes, 'violates-headline-size-rule', 'medium', 'Headline size falls outside the permitted range for this format.', 'Clamp headline scale to the format rule set.', (scene.title.fontSize || 0) < ruleSet.typography.headline.minFontSize ? 'increase-headline-size' : 'reduce-headline-size')
  }
  if (titleLines > ruleSet.typography.headline.maxLines) {
    pushIssue(issues, fixes, 'violates-headline-line-limit', 'medium', 'Headline exceeds the allowed line count for this format.', 'Reflow the headline or switch to a stronger family.', 'reflow-headline')
  }
  if ((scene.cta.w || 0) < (ruleSet.elements.cta.minW || 0) / format.width * 100 || (scene.cta.h || 0) < (ruleSet.elements.cta.minH || 0) / format.height * 100) {
    pushIssue(issues, fixes, 'violates-cta-size-rule', 'medium', 'CTA is smaller than the minimum size required by this format.', 'Promote CTA and resize it inside the allowed zone.', 'increase-cta-prominence')
  }
  if (!isRectInsideAllowedZones('logo', rects.logo, format)) {
    pushIssue(issues, fixes, 'violates-logo-zone-rule', 'medium', 'Logo is outside its allowed anchor zone.', 'Move logo back to the designated anchor region.', 'move-logo-to-anchor')
  }
  const imageCoverage = ((rects.image.w * rects.image.h) / 10000)
  if (imageCoverage < ruleSet.composition.minImageCoverage || imageCoverage > ruleSet.composition.maxImageCoverage) {
    pushIssue(issues, fixes, 'violates-image-footprint-rule', 'medium', 'Image footprint is outside the allowed coverage range.', 'Rebalance image region and crop for this format.', imageCoverage < ruleSet.composition.minImageCoverage ? 'increase-image-presence' : 'reduce-image-presence')
  }
  if (!isRectInsideAllowedZones('image', rects.image, format) || !isRectInsideAllowedZones('text', textRect, format) || !isRectInsideAllowedZones('cta', rects.cta, format)) {
    pushIssue(issues, fixes, 'violates-allowed-zone', 'medium', 'One or more blocks sit outside their allowed layout zones.', 'Rebuild regions using the format rule set.', 'change-layout-family')
  }
  const expectedColumn = safeArea.w / ruleSet.grid.columns
  const titleGridOffset = Math.abs(((rects.title.x - safeArea.x) % expectedColumn + expectedColumn) % expectedColumn)
  if (titleGridOffset > Math.max(expectedColumn * 0.35, 1.5)) {
    pushIssue(issues, fixes, 'violates-format-grid', 'low', 'Primary content is drifting off the intended grid rhythm.', 'Snap major blocks back to the format grid.', 'rebalance-text-cluster')
  }
}

function collectCompositionModelIssues(
  scene: Scene,
  format: FormatDefinition,
  rects: RectMap,
  model: CompositionModel | null,
  issues: LayoutIssue[],
  fixes: Set<FixAction>
) {
  if (!model) return
  for (const slot of model.slots) {
    const rect = sceneRectForSlot(rects, slot.block)
    const zone = getModelZoneRect(model, slot.zoneId, format)
    if (!rect || !zone) continue
    if (!containsRect(zone, rect)) {
      const code =
        slot.block === 'cta'
          ? 'violates-model-cta-placement'
          : slot.block === 'logo'
            ? 'violates-model-logo-anchor'
            : 'violates-model-slot'
      pushIssue(
        issues,
        fixes,
        code,
        slot.required ? 'high' : 'medium',
        `${rect.label || slot.block} sits outside the selected composition slot.`,
        'Repack the block inside the model zone or switch to another composition model.',
        slot.block === 'cta' ? 'move-cta-closer-to-text' : slot.block === 'logo' ? 'move-logo-to-anchor' : 'change-layout-family'
      )
    }

    const widthMin = slot.minW ? (slot.minW / format.width) * 100 : null
    const widthMax = slot.maxW ? (slot.maxW / format.width) * 100 : null
    const heightMin = slot.minH ? (slot.minH / format.height) * 100 : null
    const heightMax = slot.maxH ? (slot.maxH / format.height) * 100 : null
    if ((widthMin !== null && rect.w < widthMin - 0.5) || (widthMax !== null && rect.w > widthMax + 0.5) || (heightMin !== null && rect.h < heightMin - 0.5) || (heightMax !== null && rect.h > heightMax + 0.5)) {
      pushIssue(
        issues,
        fixes,
        'violates-model-block-size',
        slot.required ? 'high' : 'medium',
        `${rect.label || slot.block} falls outside the model size bounds.`,
        'Clamp the block size to the model slot or rebuild this composition.',
        slot.block === 'headline' ? 'reflow-headline' : slot.block === 'image' ? 'rebalance-split-ratio' : 'rebalance-text-cluster'
      )
    }
  }

  const imageCoverage = (rects.image.w * rects.image.h) / 10000
  const { minCoverage, maxCoverage } = getEffectiveModelImageCoverageBounds(model, format)
  if (imageCoverage < minCoverage - 0.01 || imageCoverage > maxCoverage + 0.01) {
    pushIssue(
      issues,
      fixes,
      'violates-model-image-role',
      'high',
      'Image footprint does not match the selected composition model.',
      'Resize the image region or switch to a composition model with the right image role.',
      'switch-image-role'
    )
  }

  const textBounds = getTextBounds(rects)
  const textCoverage = ((textBounds.right - textBounds.left) * (textBounds.bottom - textBounds.top)) / 10000
  if (textCoverage < model.minTextCoverage * 0.55 || textCoverage > model.maxTextCoverage * 1.45) {
    pushIssue(
      issues,
      fixes,
      'violates-model-text-structure',
      'medium',
      'Text cluster no longer matches the scale and structure of the selected composition model.',
      'Rebuild the text cluster or switch to a denser/sparser model.',
      'rebalance-text-cluster'
    )
  }
}

function collectOverlaySafetyIssues(
  scene: Scene,
  format: FormatDefinition,
  rects: RectMap,
  model: CompositionModel | null,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  issues: LayoutIssue[],
  fixes: Set<FixAction>
) {
  if (!model?.allowedOverlaps?.length || !imageAnalysis) return
  const imageRect = sceneRectForKind(rects, 'image')
  if (!imageRect) return
  const ruleSet = getFormatRuleSet(format)
  const safeArea = zoneRectToPercent(ruleSet.safeArea.x, ruleSet.safeArea.y, ruleSet.safeArea.w, ruleSet.safeArea.h, format)
  const policy = getOverlaySafetyPolicy(format, model)

  for (const rule of model.allowedOverlaps) {
    if (rule.a !== 'image' && rule.b !== 'image') continue
    const overlayKind = rule.a === 'image' ? rule.b : rule.a
    const overlayRect = sceneRectForKind(rects, overlayKind)
    if (!overlayRect) continue
    if (!intersects(overlayRect, imageRect)) continue

    const normalized = normalizeRectWithinImage(overlayRect, imageRect)
    const safeCoverage =
      imageAnalysis.safeTextAreas
        .filter((area) => area.score >= policy.safeTextScoreMin)
        .reduce((sum, area) => sum + intersectionArea(area, normalized), 0) / Math.max(normalized.w * normalized.h, 0.0001)
    const canvasSafeCoverage = intersectionArea(overlayRect, safeArea) / Math.max(overlayRect.w * overlayRect.h, 0.0001)

    if (rule.requiresSafeTextArea && (safeCoverage < policy.safeCoverageMin || canvasSafeCoverage < policy.safeAreaCoverageMin)) {
      pushIssue(
        issues,
        fixes,
        'overlay-outside-safe-text-area',
        'high',
        `${overlayKind} does not keep enough coverage inside safe text and format-safe regions.`,
        'Move the overlay block into a safer part of the image or switch away from overlay.',
        overlayKind === 'headline' ? 'reflow-headline' : 'change-layout-family'
      )
    }

    if (rule.protectSubject && imageAnalysis.subjectBox && overlapRatio(imageAnalysis.subjectBox, normalized) > 0.06) {
      pushIssue(
        issues,
        fixes,
        'overlay-over-subject',
        'high',
        `${overlayKind} cuts into the focal subject area of the image.`,
        'Protect the subject by moving the overlay or switching composition model.',
        'switch-image-role'
      )
    }

    if (rule.maxOverlapRatio && overlapRatio(imageRect, overlayRect) > rule.maxOverlapRatio) {
      pushIssue(
        issues,
        fixes,
        'overlay-too-large',
        'medium',
        `${overlayKind} takes too much of the image area for this overlay model.`,
        'Reduce overlay footprint or move to a stronger split composition.',
        overlayKind === 'headline' ? 'narrow-text-container' : 'change-layout-family'
      )
    }

    if (rule.minContrast && (overlayKind === 'headline' || overlayKind === 'subtitle' || overlayKind === 'body')) {
      const areaBrightness = estimateBrightnessForArea(imageAnalysis, normalized)
      const textFill =
        overlayKind === 'headline' ? scene.title.fill || '#ffffff' :
        overlayKind === 'subtitle' || overlayKind === 'body' ? scene.subtitle.fill || '#ffffff' :
        '#ffffff'
      const contrast = contrastRatio(textFill, grayscaleHex(areaBrightness))
      if (contrast < rule.minContrast) {
        pushIssue(
          issues,
          fixes,
          'overlay-contrast-too-low',
          'high',
          `${overlayKind} loses too much contrast against the image.`,
          'Use a darker support area, move the text, or leave the overlay model.',
          'darken-overlay'
        )
      }
    }
  }
}

function collectBoxModelIssues(
  scene: Scene,
  format: FormatDefinition,
  compositionModel: CompositionModel | null,
  issues: LayoutIssue[],
  fixes: Set<FixAction>
) {
  const ruleSet = getFormatRuleSet(format)
  const boxMap = buildSceneLayoutBoxes(scene, format)
  const collisions = detectBoxCollisions(boxMap.boxes, compositionModel)
  const spacingViolations = detectSpacingViolations(boxMap.boxes, 12, format, compositionModel)
  const safeAreaPx = ruleSet.safeArea

  for (const collision of collisions) {
    const left = boxMap.boxes.find((box) => box.id === collision.a)
    const right = boxMap.boxes.find((box) => box.id === collision.b)
    pushIssue(
      issues,
      fixes,
      'box-collision',
      'high',
      `${left?.kind || collision.a} overlaps ${right?.kind || collision.b}.`,
      'Separate the conflicting blocks and rebuild their local geometry.',
      left?.kind === 'image' || right?.kind === 'image' ? 'rebalance-split-ratio' : 'rebalance-text-cluster'
    )
    const current = issues[issues.length - 1]
    if (current) current.meta = { a: collision.a, b: collision.b, overlapArea: collision.area }
  }

  for (const spacing of spacingViolations.slice(0, 8)) {
    const left = boxMap.boxes.find((box) => box.id === spacing.a)
    const right = boxMap.boxes.find((box) => box.id === spacing.b)
    pushIssue(
      issues,
      fixes,
      'insufficient-gap',
      'medium',
      `${left?.kind || spacing.a} is too close to ${right?.kind || spacing.b}.`,
      'Increase safe spacing between the conflicting blocks.',
      left?.kind === 'cta' || right?.kind === 'cta' ? 'move-cta-closer-to-text' : 'increase-cluster-padding'
    )
    const current = issues[issues.length - 1]
    if (current) current.meta = { a: spacing.a, b: spacing.b, gapDeficit: spacing.area }
  }

  for (const box of boxMap.boxes) {
    const rectPx = percentRectToPixelRect(box.rect, format)
    if (rectPx.x < 0 || rectPx.y < 0 || rectPx.x + rectPx.w > format.width || rectPx.y + rectPx.h > format.height) {
      pushIssue(issues, fixes, 'out-of-bounds', 'high', `${box.kind} is outside the canvas bounds.`, 'Move the block back inside the canvas.', 'rebalance-text-cluster')
      const current = issues[issues.length - 1]
      if (current) current.meta = { a: box.id }
    }
    if (
      rectPx.x < safeAreaPx.x ||
      rectPx.y < safeAreaPx.y ||
      rectPx.x + rectPx.w > safeAreaPx.x + safeAreaPx.w ||
      rectPx.y + rectPx.h > safeAreaPx.y + safeAreaPx.h
    ) {
      pushIssue(issues, fixes, 'outside-safe-area', 'high', `${box.kind} extends outside the safe area.`, 'Snap the block back into the safe area.', box.kind === 'logo' ? 'move-logo-to-anchor' : 'rebalance-text-cluster')
      const current = issues[issues.length - 1]
      if (current) current.meta = { a: box.id }
    }
  }

  return { boxMap, collisions, spacingViolations }
}

function percentRectToPixelRect(rect: Rect, format: FormatDefinition) {
  return {
    x: (rect.x / 100) * format.width,
    y: (rect.y / 100) * format.height,
    w: (rect.w / 100) * format.width,
    h: (rect.h / 100) * format.height,
  }
}

export function computeScoreTrust(assessment: LayoutAssessment, aiReview?: AILayoutReview): ScoreTrust {
  const deterministicScore = assessment.score
  const aiReviewScore = aiReview?.score ?? deterministicScore
  const disagreement = Math.abs(deterministicScore - aiReviewScore)
  const criticalIssues = assessment.issues.filter((issue) => issue.severity === 'critical').length
  const highIssues = assessment.issues.filter((issue) => issue.severity === 'high').length
  const mediumIssues = assessment.issues.filter((issue) => issue.severity === 'medium').length
  const strongAICritique = (aiReview?.recommendations.length || 0) >= 3 || (aiReview?.likelyRootCauses?.length || 0) >= 2
  const weighted =
    disagreement > 14
      ? deterministicScore * 0.35 + aiReviewScore * 0.65
      : deterministicScore * 0.62 + aiReviewScore * 0.38
  const penalty = criticalIssues * 4.2 + highIssues * 2.6 + mediumIssues * 1.1 + (strongAICritique && aiReviewScore < deterministicScore ? 4 : 0)
  const effectiveScore = clamp(Math.round(weighted - penalty), 0, 100)

  return {
    deterministicScore,
    aiReviewScore,
    disagreement,
    effectiveScore,
    needsHumanAttention: criticalIssues > 0 || disagreement >= 16 || (strongAICritique && effectiveScore <= deterministicScore - 8),
  }
}

export async function aiReviewLayout(scene: Scene, context: { format: FormatDefinition; assessment: LayoutAssessment }): Promise<AILayoutReview> {
  const heuristic = buildHeuristicAIReview(scene, context)
  if (!aiLayoutReviewer) return heuristic

  try {
    const { aiReview: _ignored, ...assessment } = context.assessment
    return await aiLayoutReviewer(scene, { format: context.format, assessment })
  } catch {
    return heuristic
  }
}

export function getSceneValidation(scene: Scene, format: { width: number; height: number }) {
  const fallback: FormatDefinition = {
    key: 'social-square',
    name: 'Fallback',
    width: format.width,
    height: format.height,
    label: 'Fallback',
    category: 'social',
    family: 'square',
    packTags: ['promo-pack'],
    scopeStage: 'legacy',
    primaryGenerationMode: 'legacy-freeform',
  }
  return getSceneAssessment(scene, fallback).issues
}

export function getFormatAssessment(
  formatKey: FormatKey,
  scene: Scene,
  expectedCompositionModelId?: CompositionModelId,
  imageAnalysis?: EnhancedImageAnalysis
) {
  return getSceneAssessment(scene, FORMAT_MAP[formatKey], { expectedCompositionModelId, imageAnalysis })
}
