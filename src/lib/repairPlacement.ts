import { getFormatRuleSet } from './formatRules'
import { resolveSharedBadgeSemantic } from './placementRoleMapping'
import { FORMAT_MAP } from './presets'
import type {
  FormatDefinition,
  FormatKey,
  LayoutAssessment,
  PlacementViolationDiagnostics,
  PlacementViolationRole,
  PlacementViolationSeverity,
  Rect,
  RepairCandidateGateDiagnostics,
  RepairObjectiveThresholds,
  RepairRejectionReason,
  Scene,
} from './types'
import { getRectangles } from './validation'

type PlacementRole = Exclude<PlacementViolationRole, 'multiple' | 'unknown'>
type PlacementEvaluationContext = {
  candidateKind?: string
  strategyLabel?: string
  badgeSemanticallyActive?: boolean
  badgeVisuallyCritical?: boolean
}
type TitlePlacementDebugPayload = {
  role: 'title'
  rect: Rect
  allowedZone: Rect[]
  preferredZone: Rect[]
  distanceFromAllowed: number
  severity: PlacementViolationSeverity
}

type PlacementRoleMetrics = {
  role: PlacementRole
  eligible: boolean
  eligibilityReason: string | null
  preferredZoneDistance: number
  allowedZoneDistance: number
  rect: Rect | null
  allowedZones: Rect[]
  preferredZones: Rect[]
  zonePaddingApplied: number
}

type SquareDisplayTextClusterDiagnostics = {
  titlePlacementDistance: number
  titlePreferredDistance: number
  combinedAllowedDistance: number
  combinedPreferredDistance: number
  rawCtaToCombinedTextDistance: number
  adjustedCtaToCombinedTextDistance: number
  subtitleAttachmentDistance: number
  subtitleAttachmentQuality: number
  combinedClusterFootprint: number
  subtitleInflationContribution: number
  titlePrimaryAnchorWeight: number
  subtitleSecondaryMassWeight: number
  titleDominatesMainTextPlacement: boolean
  subtitleDetached: boolean
  ctaCollisionPersistsAfterSubtitleAdjustment: boolean
  severeDrivenByCombinedClusterOnly: boolean
  wouldBecomeMilderUnderAttachmentAwarePolicy: boolean
  wouldBecomeMilderUnderSquareSubtitleCtaPolicy: boolean
  adjustedTextRect: Rect
  adjustedAllowedDistance: number
  adjustedPreferredDistance: number
}

type LandscapeDisplayImagePlacementDiagnostics = {
  rawAllowedDistance: number
  rawPreferredDistance: number
  adjustedAllowedDistance: number
  adjustedPreferredDistance: number
  splitSideOccupancy: number
  supportsReadingFlow: boolean
  matchesLandscapeSplitPattern: boolean
  structurallyAcceptableFootprint: boolean
  wouldBecomeMilderUnderLandscapeImagePolicy: boolean
}

type LandscapeDisplayTextClusterDiagnostics = {
  titlePlacementDistance: number
  titlePreferredDistance: number
  combinedAllowedDistance: number
  combinedPreferredDistance: number
  rawCombinedMessageAllowedDistance: number
  rawCombinedMessagePreferredDistance: number
  adjustedAllowedDistance: number
  adjustedPreferredDistance: number
  adjustedCtaAllowedDistance: number
  adjustedCtaPreferredDistance: number
  subtitleAttachmentDistance: number
  ctaAttachmentDistance: number
  ctaAnchorDistance: number
  ctaAnchorVerticalGap: number
  ctaAnchorHorizontalOffset: number
  ctaAttachmentSeverity: PlacementViolationSeverity
  ctaWithinSplitLayoutTolerance: boolean
  ctaReadingFlowContinuity: number
  ctaMessageAssociationScore: number
  ctaAnchorWouldBecomeMilder: boolean
  disconnectDrivenPrimarilyByGap: boolean
  disconnectDrivenPrimarilyByHorizontalOffset: boolean
  clusterFootprint: number
  messageClusterHeight: number
  messageClusterWidth: number
  subtitleInflationContribution: number
  subtitleInflatesMainly: boolean
  titlePrimaryAnchorWeight: number
  subtitleSecondaryMassWeight: number
  titleDominatesMainTextPlacement: boolean
  subtitleDetached: boolean
  ctaDetached: boolean
  textImageSplitCoherent: boolean
  messageClusterTooTall: boolean
  messageClusterTooWide: boolean
  severeDrivenByCombinedClusterOnly: boolean
  severeDrivenBySubtitleInflationOnly: boolean
  wouldBecomeMilderUnderAttachmentAwarePolicy: boolean
  wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy: boolean
  wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy: boolean
  titleSubtitleVerticalGap: number
  titleSubtitleHorizontalOffset: number
  titleCtaDistance: number
  subtitleCtaDistance: number
  fullClusterCoherent: boolean
}

const PLACEMENT_ROLES: PlacementRole[] = ['text', 'cta', 'image', 'logo', 'badge', 'price']

function round(value: number) {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function classifyDistanceBand(allowedDistance: number, preferredDistance: number): PlacementViolationSeverity {
  if (allowedDistance <= 2 && preferredDistance <= 5) return 'mild'
  if (allowedDistance <= 6 && preferredDistance <= 12) return 'moderate'
  return 'severe'
}

function bounds(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.w))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  }
}

function getRectDistance(a: Rect | null, b: Rect | null) {
  if (!a || !b) return 0
  const horizontalGap = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const verticalGap = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  if (horizontalGap === 0) return round(verticalGap)
  if (verticalGap === 0) return round(horizontalGap)
  return round(Math.sqrt(horizontalGap * horizontalGap + verticalGap * verticalGap))
}

function getOverlapArea(a: Rect | null, b: Rect | null) {
  if (!a || !b) return 0
  const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return round(overlapX * overlapY)
}

function containsRect(container: Rect, subject: Rect) {
  return (
    subject.x >= container.x &&
    subject.y >= container.y &&
    subject.x + subject.w <= container.x + container.w &&
    subject.y + subject.h <= container.y + container.h
  )
}

function zoneRectToPercent(rect: Rect, format: FormatDefinition): Rect {
  return {
    x: (rect.x / format.width) * 100,
    y: (rect.y / format.height) * 100,
    w: (rect.w / format.width) * 100,
    h: (rect.h / format.height) * 100,
  }
}

function padZone(zone: Rect, padding: number): Rect {
  if (padding <= 0) return zone
  const x = clamp(zone.x - padding, 0, 100)
  const y = clamp(zone.y - padding, 0, 100)
  const right = clamp(zone.x + zone.w + padding, 0, 100)
  const bottom = clamp(zone.y + zone.h + padding, 0, 100)
  return {
    x,
    y,
    w: clamp(right - x, 0, 100 - x),
    h: clamp(bottom - y, 0, 100 - y),
  }
}

function getAllZoneIdsForRole(
  ruleSet: ReturnType<typeof getFormatRuleSet>,
  role: PlacementRole
) {
  return Array.from(new Set(ruleSet.zones.filter((zone) => zone.role === role).map((zone) => zone.id)))
}

function trimText(text?: string) {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function isLandscapeDisplayBadgeContext(format: FormatDefinition) {
  return (
    format.category === 'display' &&
    [
      'display-mpu',
      'display-large-rect',
      'display-leaderboard',
      'display-billboard',
    ].includes(format.key)
  )
}

function isBadgeVisuallyCritical(text?: string) {
  const normalized = trimText(text).toLowerCase()
  if (!normalized) return false
  return ['sale', 'save', 'off', 'deal', 'bonus', 'free', 'new', 'limited', 'hot'].some((token) =>
    normalized.includes(token)
  )
}

function isSquareImageStrategyContext(
  format: FormatDefinition,
  context?: PlacementEvaluationContext
) {
  if (format.key !== 'social-square') return false
  if (context?.candidateKind === 'image-balance-repair') return true
  if (context?.candidateKind === 'guided-regeneration-repair') return true
  const strategy = (context?.strategyLabel || '').toLowerCase()
  return ['image', 'overlay', 'hero', 'split'].some((token) => strategy.includes(token))
}

function isLandscapeDisplayImageContext(
  format: FormatDefinition,
  context?: PlacementEvaluationContext
) {
  if (!['display-mpu', 'display-large-rect'].includes(format.key)) return false
  return true
}

function isLandscapeDisplayTextContext(
  format: FormatDefinition,
  context?: PlacementEvaluationContext
) {
  if (!['display-mpu', 'display-large-rect'].includes(format.key)) return false
  return true
}

function isSquareDisplayTextContext(
  format: FormatDefinition,
  context?: PlacementEvaluationContext
) {
  if (format.key !== 'social-square') return false
  if (context?.candidateKind === 'guided-regeneration-repair') return true
  if (context?.candidateKind === 'image-balance-repair') return true
  const strategy = (context?.strategyLabel || '').toLowerCase()
  return ['overlay', 'dense', 'compact', 'text', 'hero'].some((token) => strategy.includes(token))
}

function getZonePadding(
  role: PlacementRole,
  format: FormatDefinition,
  context: PlacementEvaluationContext | undefined,
  zoneKind: 'allowed' | 'preferred'
) {
  if (role === 'badge' && isLandscapeDisplayBadgeContext(format)) {
    const critical = Boolean(context?.badgeVisuallyCritical)
    return zoneKind === 'preferred' ? (critical ? 4 : 8) : critical ? 4 : 6
  }
  if (role === 'text' && isLandscapeDisplayTextContext(format, context)) {
    return zoneKind === 'preferred' ? 6 : 4
  }
  if (role === 'text' && isSquareDisplayTextContext(format, context)) {
    return zoneKind === 'preferred' ? 8 : 6
  }
  if (role !== 'image') return 0
  if (isSquareImageStrategyContext(format, context)) {
    return zoneKind === 'preferred' ? 12 : 8
  }
  if (isLandscapeDisplayImageContext(format, context)) {
    return zoneKind === 'preferred' ? 8 : 6
  }
  if (format.category !== 'display') return 0
  if (format.key === 'display-leaderboard' || format.key === 'display-billboard') return 2
  if (format.key === 'display-skyscraper' || format.key === 'display-halfpage') return 3
  return 4
}

function getAllowedZoneIdsForRole(
  ruleSet: ReturnType<typeof getFormatRuleSet>,
  role: PlacementRole,
  format: FormatDefinition,
  context?: PlacementEvaluationContext
) {
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

  if (role === 'image' && isSquareImageStrategyContext(format, context)) {
    return getAllZoneIdsForRole(ruleSet, role)
  }

  if (role === 'image' && isLandscapeDisplayImageContext(format, context)) {
    return getAllZoneIdsForRole(ruleSet, role)
  }

  if (role === 'badge' && isLandscapeDisplayBadgeContext(format)) {
    return getAllZoneIdsForRole(ruleSet, role)
  }

  return Array.from(new Set(element?.allowedZones || []))
}

function getLandscapeDisplayBadgeSupportZones(format: FormatDefinition): Rect[] {
  const ruleSet = getFormatRuleSet(format)
  const safe = zoneRectToPercent(ruleSet.safeArea, format)
  const logoZones = ruleSet.zones
    .filter((zone) => zone.role === 'logo')
    .map((zone) => zoneRectToPercent(zone.rect, format))
  const topBandHeight = clamp(safe.h * 0.22, 12, format.key === 'display-billboard' ? 18 : 16)
  const topBand: Rect = {
    x: safe.x,
    y: safe.y,
    w: safe.w,
    h: topBandHeight,
  }
  return [topBand, ...logoZones]
}

function getSquareDisplayTextSupportZones(format: FormatDefinition): Rect[] {
  const ruleSet = getFormatRuleSet(format)
  const safe = zoneRectToPercent(ruleSet.safeArea, format)
  const lowerLeft: Rect = {
    x: clamp(safe.x + 1.5, 0, 100),
    y: clamp(safe.y + safe.h * 0.42, 0, 100),
    w: clamp(safe.w * 0.54, 0, 100),
    h: clamp(safe.h * 0.34, 0, 100),
  }
  const lowerCenter: Rect = {
    x: clamp(safe.x + 2, 0, 100),
    y: clamp(safe.y + safe.h * 0.41, 0, 100),
    w: clamp(safe.w * 0.62, 0, 100),
    h: clamp(safe.h * 0.38, 0, 100),
  }
  const overlayLower: Rect = {
    x: clamp(safe.x + 1, 0, 100),
    y: clamp(safe.y + safe.h * 0.39, 0, 100),
    w: clamp(safe.w * 0.5, 0, 100),
    h: clamp(safe.h * 0.32, 0, 100),
  }
  return [lowerLeft, lowerCenter, overlayLower]
}

function getLandscapeDisplayTextSupportZones(format: FormatDefinition): Rect[] {
  const ruleSet = getFormatRuleSet(format)
  const safe = zoneRectToPercent(ruleSet.safeArea, format)
  const leftColumn: Rect = {
    x: clamp(safe.x, 0, 100),
    y: clamp(safe.y + safe.h * 0.18, 0, 100),
    w: clamp(safe.w * 0.5, 0, 100),
    h: clamp(safe.h * 0.42, 0, 100),
  }
  const leftTall: Rect = {
    x: clamp(safe.x, 0, 100),
    y: clamp(safe.y + safe.h * 0.16, 0, 100),
    w: clamp(safe.w * 0.52, 0, 100),
    h: clamp(safe.h * 0.46, 0, 100),
  }
  const leftSplitSupport: Rect = {
    x: clamp(safe.x + safe.w * 0.01, 0, 100),
    y: clamp(safe.y + safe.h * 0.2, 0, 100),
    w: clamp(safe.w * 0.48, 0, 100),
    h: clamp(safe.h * 0.5, 0, 100),
  }
  return [leftColumn, leftTall, leftSplitSupport]
}

function getSquareDisplayImageSupportZones(format: FormatDefinition): Rect[] {
  const ruleSet = getFormatRuleSet(format)
  const safe = zoneRectToPercent(ruleSet.safeArea, format)
  const lowerWide: Rect = {
    x: clamp(safe.x, 0, 100),
    y: clamp(safe.y + safe.h * 0.38, 0, 100),
    w: clamp(safe.w * 0.76, 0, 100),
    h: clamp(safe.h * 0.44, 0, 100),
  }
  const leftOverlay: Rect = {
    x: clamp(safe.x, 0, 100),
    y: clamp(safe.y + safe.h * 0.42, 0, 100),
    w: clamp(safe.w * 0.7, 0, 100),
    h: clamp(safe.h * 0.4, 0, 100),
  }
  const lowerCenter: Rect = {
    x: clamp(safe.x + safe.w * 0.04, 0, 100),
    y: clamp(safe.y + safe.h * 0.34, 0, 100),
    w: clamp(safe.w * 0.68, 0, 100),
    h: clamp(safe.h * 0.46, 0, 100),
  }
  return [lowerWide, leftOverlay, lowerCenter]
}

function getLandscapeDisplayImageSupportZones(format: FormatDefinition): Rect[] {
  const ruleSet = getFormatRuleSet(format)
  const safe = zoneRectToPercent(ruleSet.safeArea, format)
  const rightSplit: Rect = {
    x: clamp(safe.x + safe.w * 0.52, 0, 100),
    y: clamp(safe.y + safe.h * 0.02, 0, 100),
    w: clamp(safe.w * 0.42, 0, 100),
    h: clamp(safe.h * 0.76, 0, 100),
  }
  const rightTall: Rect = {
    x: clamp(safe.x + safe.w * 0.56, 0, 100),
    y: clamp(safe.y + safe.h * 0.01, 0, 100),
    w: clamp(safe.w * 0.38, 0, 100),
    h: clamp(safe.h * 0.82, 0, 100),
  }
  const centeredRight: Rect = {
    x: clamp(safe.x + safe.w * 0.5, 0, 100),
    y: clamp(safe.y + safe.h * 0.08, 0, 100),
    w: clamp(safe.w * 0.44, 0, 100),
    h: clamp(safe.h * 0.68, 0, 100),
  }
  return [rightSplit, rightTall, centeredRight]
}

function getAllowedZoneRects(
  role: PlacementRole,
  format: FormatDefinition,
  context?: PlacementEvaluationContext
): Rect[] {
  const ruleSet = getFormatRuleSet(format)
  const allowedZoneIds = getAllowedZoneIdsForRole(ruleSet, role, format, context)
  const zones =
    allowedZoneIds.length > 0
      ? ruleSet.zones.filter((current) => current.role === role && allowedZoneIds.includes(current.id))
      : ruleSet.zones.filter((current) => current.role === role)
  const padding = getZonePadding(role, format, context, 'allowed')
  const baseZones = zones.map((zone) => padZone(zoneRectToPercent(zone.rect, format), padding))
  if (role === 'image' && isLandscapeDisplayImageContext(format, context)) {
    const supportZones = getLandscapeDisplayImageSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  if (role === 'image' && isSquareImageStrategyContext(format, context)) {
    const supportZones = getSquareDisplayImageSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  if (role === 'text' && isLandscapeDisplayTextContext(format, context)) {
    const supportZones = getLandscapeDisplayTextSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  if (role === 'text' && isSquareDisplayTextContext(format, context)) {
    const supportZones = getSquareDisplayTextSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  if (role === 'badge' && isLandscapeDisplayBadgeContext(format)) {
    const supportZones = getLandscapeDisplayBadgeSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  return baseZones
}

function getPreferredZoneRects(
  role: PlacementRole,
  assessment: LayoutAssessment,
  format: FormatDefinition,
  context?: PlacementEvaluationContext
): Rect[] {
  const ruleSet = getFormatRuleSet(format)
  const compositionZones = (assessment.compositionZones || []).filter((zone) => zone.role === role)
  const zones =
    role === 'image' && isSquareImageStrategyContext(format, context)
      ? [...compositionZones, ...ruleSet.zones.filter((zone) => zone.role === role)]
      : role === 'badge' && isLandscapeDisplayBadgeContext(format)
        ? [
            ...compositionZones,
            ...ruleSet.zones.filter((zone) => zone.role === role),
            ...ruleSet.zones.filter((zone) => zone.role === 'logo'),
          ]
      : compositionZones
  if (!zones.length && role === 'text') {
    return (assessment.compositionZones || [])
      .filter((zone) => zone.role === 'text')
      .map((zone) => padZone(zoneRectToPercent(zone.rect, format), getZonePadding(role, format, context, 'preferred')))
  }
  const padding = getZonePadding(role, format, context, 'preferred')
  const baseZones = zones.map((zone) => padZone(zoneRectToPercent(zone.rect, format), padding))
  if (role === 'image' && isLandscapeDisplayImageContext(format, context)) {
    const supportZones = getLandscapeDisplayImageSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  if (role === 'image' && isSquareImageStrategyContext(format, context)) {
    const supportZones = getSquareDisplayImageSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  if (role === 'text' && isLandscapeDisplayTextContext(format, context)) {
    const supportZones = getLandscapeDisplayTextSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  if (role === 'text' && isSquareDisplayTextContext(format, context)) {
    const supportZones = getSquareDisplayTextSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  if (role === 'badge' && isLandscapeDisplayBadgeContext(format)) {
    const supportZones = getLandscapeDisplayBadgeSupportZones(format).map((zone) => padZone(zone, padding))
    return [...baseZones, ...supportZones]
  }
  return baseZones
}

function getTitleAllowedZoneRects(format: FormatDefinition): Rect[] {
  const ruleSet = getFormatRuleSet(format)
  const allowedZoneIds = Array.from(new Set(ruleSet.elements.headline.allowedZones || []))
  const zones =
    allowedZoneIds.length > 0
      ? ruleSet.zones.filter((current) => current.role === 'text' && allowedZoneIds.includes(current.id))
      : ruleSet.zones.filter((current) => current.role === 'text')
  return zones.map((zone) => zoneRectToPercent(zone.rect, format))
}

function getTitlePreferredZoneRects(
  assessment: LayoutAssessment,
  format: FormatDefinition,
  context?: PlacementEvaluationContext
): Rect[] {
  return getPreferredZoneRects('text', assessment, format, context)
}

function getRoleRect(scene: Scene, format: FormatDefinition, role: PlacementRole): Rect | null {
  const rects = getRectangles(scene, format)
  if (role === 'text') return bounds([rects.title, rects.subtitle])
  if (role === 'cta') return rects.cta
  if (role === 'image') return rects.image
  if (role === 'logo') return rects.logo
  const badgeSemantic = resolveSharedBadgeSemantic(scene)
  if (role === 'badge') return badgeSemantic === 'badge' ? rects.badge : null
  if (role === 'price') return badgeSemantic === 'price' ? rects.badge : null
  return null
}

function getContainmentDistance(subject: Rect, zone: Rect) {
  if (containsRect(zone, subject)) return 0
  const leftOverflow = Math.max(zone.x - subject.x, 0)
  const topOverflow = Math.max(zone.y - subject.y, 0)
  const rightOverflow = Math.max(subject.x + subject.w - (zone.x + zone.w), 0)
  const bottomOverflow = Math.max(subject.y + subject.h - (zone.y + zone.h), 0)
  return round(leftOverflow + topOverflow + rightOverflow + bottomOverflow)
}

function getMinDistanceToZones(subject: Rect, zones: Rect[]) {
  if (!zones.length) return 0
  return Math.min(...zones.map((zone) => getContainmentDistance(subject, zone)))
}

function shouldLogPlacementDebug() {
  const runtime = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>
    }
  }
  return runtime.process?.env?.DEBUG_PLACEMENT_VIOLATION === '1'
}

function maybeLogTitlePlacementDebug(input: {
  scene: Scene
  assessment: LayoutAssessment
  formatKey: FormatKey
  severity: PlacementViolationSeverity
}) {
  if (!shouldLogPlacementDebug()) return
  const format = FORMAT_MAP[input.formatKey]
  const rects = getRectangles(input.scene, format)
  const allowedZone = getTitleAllowedZoneRects(format)
  const preferredZone = getTitlePreferredZoneRects(input.assessment, format)
  const payload: TitlePlacementDebugPayload = {
    role: 'title',
    rect: rects.title,
    allowedZone,
    preferredZone,
    distanceFromAllowed: round(getMinDistanceToZones(rects.title, allowedZone)),
    severity: input.severity,
  }
  console.log(payload)
}

function getClusterIntegrity(assessment: LayoutAssessment) {
  return clamp(
    assessment.perceptual?.clusterCohesion ??
      assessment.metrics?.clusterCohesion ??
      ((assessment.visual?.debug?.clusterHarmony as number | undefined) ?? 0),
    0,
    100
  )
}

function getVisualHierarchyPreserved(assessment: LayoutAssessment) {
  const hierarchy =
    assessment.visual?.breakdown.focusHierarchy ??
    assessment.metrics?.textHierarchy ??
    100
  const hasPrimary =
    assessment.perceptual?.hasClearPrimary ??
    Boolean(assessment.visual?.debug?.focusDominant)
  return hierarchy >= 68 && hasPrimary
}

function getBadgeAffectsCoreReadingFlow(scene: Scene, format: FormatDefinition) {
  const rects = getRectangles(scene, format)
  const badge = rects.badge
  const textBounds = bounds([rects.title, rects.subtitle])
  if (!badge || badge.w <= 0 || badge.h <= 0) return false
  const overlapsText = !(
    badge.x + badge.w <= textBounds.x ||
    textBounds.x + textBounds.w <= badge.x ||
    badge.y + badge.h <= textBounds.y ||
    textBounds.y + textBounds.h <= badge.y
  )
  const verticalGap = textBounds.y - (badge.y + badge.h)
  return overlapsText || (verticalGap >= 0 && verticalGap <= 4)
}

function getRoleMetrics(
  scene: Scene,
  assessment: LayoutAssessment,
  formatKey: FormatKey,
  context?: PlacementEvaluationContext
): PlacementRoleMetrics[] {
  const format = FORMAT_MAP[formatKey]
  const badgeSemantic = resolveSharedBadgeSemantic(scene)
  return PLACEMENT_ROLES.map((role) => {
    const allowedZones = getAllowedZoneRects(role, format, context)
    const preferredZones = getPreferredZoneRects(role, assessment, format, context)
    const rect = getRoleRect(scene, format, role)
    const zonePaddingApplied = Math.max(
      getZonePadding(role, format, context, 'allowed'),
      getZonePadding(role, format, context, 'preferred')
    )
    const noRenderableRect = !rect || rect.w <= 0 || rect.h <= 0
    let eligible = !noRenderableRect
    let eligibilityReason: string | null = noRenderableRect ? 'missing-rect' : null

    if (role === 'badge' && badgeSemantic === 'price') {
      eligible = false
      eligibilityReason =
        allowedZones.length || preferredZones.length
          ? 'shared-badge-rect-is-price-semantic'
          : 'price-semantic-without-badge-placement'
    } else if (role === 'price') {
      if (badgeSemantic !== 'price') {
        eligible = false
        eligibilityReason = 'price-not-semantically-present'
      } else if (!allowedZones.length && !preferredZones.length) {
        eligible = false
        eligibilityReason = 'price-has-no-placement-zones'
      }
    }

    if (!eligible) {
      return {
        role,
        eligible,
        eligibilityReason,
        preferredZoneDistance: 0,
        allowedZoneDistance: 0,
        rect,
        allowedZones,
        preferredZones,
        zonePaddingApplied,
      }
    }

    if (!rect) {
      return {
        role,
        eligible: false,
        eligibilityReason: 'missing-rect',
        preferredZoneDistance: 0,
        allowedZoneDistance: 0,
        rect: null,
        allowedZones,
        preferredZones,
        zonePaddingApplied,
      }
    }
    return {
      role,
      eligible: true,
      eligibilityReason: null,
      preferredZoneDistance: round(getMinDistanceToZones(rect, preferredZones.length ? preferredZones : allowedZones)),
      allowedZoneDistance: round(getMinDistanceToZones(rect, allowedZones)),
      rect,
      allowedZones,
      preferredZones,
      zonePaddingApplied,
    }
  })
}

function getSquareDisplayTextClusterDiagnostics(input: {
  scene: Scene
  assessment: LayoutAssessment
  formatKey: FormatKey
  roleMetrics: PlacementRoleMetrics[]
  context?: PlacementEvaluationContext
}): SquareDisplayTextClusterDiagnostics | null {
  const format = FORMAT_MAP[input.formatKey]
  if (!isSquareDisplayTextContext(format, input.context)) return null
  const textMetric = input.roleMetrics.find((entry) => entry.role === 'text' && entry.eligible)
  if (!textMetric?.rect) return null

  const rects = getRectangles(input.scene, format)
  const titleRect = rects.title
  const subtitleRect = rects.subtitle
  const ctaRect = rects.cta
  const combinedRect = bounds([titleRect, subtitleRect])
  const allowedZones = textMetric.allowedZones
  const preferredZones = textMetric.preferredZones.length ? textMetric.preferredZones : textMetric.allowedZones
  const ruleSet = getFormatRuleSet(format)
  const safeArea = zoneRectToPercent(ruleSet.safeArea, format)

  const titlePlacementDistance = round(getMinDistanceToZones(titleRect, allowedZones))
  const titlePreferredDistance = round(getMinDistanceToZones(titleRect, preferredZones))
  const combinedAllowedDistance = round(getMinDistanceToZones(combinedRect, allowedZones))
  const combinedPreferredDistance = round(getMinDistanceToZones(combinedRect, preferredZones))
  const verticalGap = subtitleRect.y - (titleRect.y + titleRect.h)
  const horizontalOffset = Math.abs(subtitleRect.x - titleRect.x)
  const safeAreaFootprint =
    safeArea.w > 0 && safeArea.h > 0 ? (combinedRect.w * combinedRect.h) / (safeArea.w * safeArea.h) : 0
  const combinedClusterFootprint = round(safeAreaFootprint * 100)
  const subtitleInflationContribution = round(
    Math.max(
      0,
      combinedAllowedDistance - titlePlacementDistance,
      combinedPreferredDistance - titlePreferredDistance,
      combinedRect.h - titleRect.h
    )
  )
  const subtitleAttachmentDistance = round(
    Math.max(0, verticalGap - 12) * 0.55 +
      Math.max(0, horizontalOffset - 6) * 0.45 +
      (subtitleRect.y + 1 < titleRect.y ? 4 : 0)
  )
  const subtitleAttachmentQuality = round(
    clamp(
      100 -
        subtitleAttachmentDistance * 12 -
        Math.max(0, verticalGap - 10) * 1.8 -
        Math.max(0, horizontalOffset - 6) * 2.5,
      0,
      100
    )
  )
  const subtitleDetached =
    verticalGap > 18 ||
    horizontalOffset > 10 ||
    subtitleRect.y + 1 < titleRect.y ||
    (subtitleInflationContribution > 10 && verticalGap > 16)
  const oversizedCluster =
    combinedClusterFootprint > 26 ||
    combinedRect.h > safeArea.h * 0.42 ||
    combinedRect.w > safeArea.w * 0.72
  const titleDominatesMainTextPlacement =
    titlePlacementDistance >= combinedAllowedDistance * 0.65 ||
    titlePreferredDistance >= combinedPreferredDistance * 0.65
  const titlePrimaryAnchorWeight = round(
    subtitleDetached ? 0.72 : clamp(0.82 + subtitleAttachmentQuality / 1000, 0.82, 0.92)
  )
  const subtitleSecondaryMassWeight = round(
    subtitleDetached
      ? 0.88
      : clamp(
          0.14 + Math.min(subtitleInflationContribution, 24) / 180 - subtitleAttachmentQuality / 900,
          0.14,
          0.28
        )
  )
  const severeDrivenByCombinedClusterOnly =
    classifyDistanceBand(combinedAllowedDistance, combinedPreferredDistance) === 'severe' &&
    classifyDistanceBand(titlePlacementDistance, titlePreferredDistance) !== 'severe' &&
    !subtitleDetached &&
    !oversizedCluster

  const titleRight = titleRect.x + titleRect.w
  const titleBottom = titleRect.y + titleRect.h
  const subtitleRight = subtitleRect.x + subtitleRect.w
  const subtitleBottom = subtitleRect.y + subtitleRect.h
  const adjustedRight = round(
    Math.max(
      titleRight,
      titleRight + Math.max(0, subtitleRight - titleRight) * clamp(subtitleSecondaryMassWeight + 0.08, 0.18, 0.38)
    )
  )
  const adjustedBottom = round(
    Math.max(
      titleBottom,
      titleBottom +
        Math.max(0, subtitleBottom - titleBottom) *
          clamp(subtitleSecondaryMassWeight + (subtitleDetached ? 0.22 : 0), 0.18, 0.92)
    )
  )
  const adjustedTextRect: Rect = {
    x: round(Math.min(titleRect.x, subtitleRect.x)),
    y: round(Math.min(titleRect.y, subtitleRect.y)),
    w: round(Math.max(titleRect.w, adjustedRight - Math.min(titleRect.x, subtitleRect.x))),
    h: round(Math.max(titleRect.h, adjustedBottom - Math.min(titleRect.y, subtitleRect.y))),
  }
  const rawCtaToCombinedTextDistance = round(getRectDistance(ctaRect, combinedRect))
  const adjustedCtaToCombinedTextDistance = round(getRectDistance(ctaRect, adjustedTextRect))
  const rawCtaOverlapRisk =
    getOverlapArea(ctaRect, subtitleRect) > 0 ||
    getOverlapArea(ctaRect, combinedRect) > 0
  const adjustedCtaOverlapRisk =
    getOverlapArea(ctaRect, adjustedTextRect) > 0 || getOverlapArea(ctaRect, subtitleRect) > 0
  const ctaHorizontalOffset = round(Math.abs(ctaRect.x - titleRect.x))
  const ctaVerticalGap = round(Math.max(0, ctaRect.y - adjustedBottom))
  const ctaReadingFlowContinuity = round(
    clamp(100 - Math.max(0, ctaVerticalGap - 8) * 6 - Math.max(0, ctaHorizontalOffset - 10) * 3.5, 0, 100)
  )
  const ctaMessageAssociationScore = round(
    clamp(
      100 -
        Math.max(0, adjustedCtaToCombinedTextDistance - 4) * 10 -
        Math.max(0, ctaHorizontalOffset - 12) * 2.5 -
        Math.max(0, ctaVerticalGap - 10) * 4,
      0,
      100
    )
  )
  const ctaPairingCoherent =
    ctaReadingFlowContinuity >= 72 &&
    ctaMessageAssociationScore >= 72 &&
    ctaHorizontalOffset <= 14
  const adjustedSafeAreaFootprint =
    safeArea.w > 0 && safeArea.h > 0
      ? (adjustedTextRect.w * adjustedTextRect.h) / (safeArea.w * safeArea.h)
      : 0
  const adjustedClusterFootprint = round(adjustedSafeAreaFootprint * 100)
  const adjustedClusterTooTall =
    adjustedClusterFootprint > 24 ||
    adjustedTextRect.h > safeArea.h * 0.36 ||
    adjustedTextRect.w > safeArea.w * 0.74
  const ctaCollisionPersistsAfterSubtitleAdjustment =
    adjustedCtaOverlapRisk ||
    adjustedClusterTooTall ||
    subtitleDetached ||
    !ctaPairingCoherent ||
    adjustedCtaToCombinedTextDistance <= 1.5
  const squareSubtitleCtaNearPass =
    titlePlacementDistance <= 2.5 &&
    !subtitleDetached &&
    subtitleAttachmentQuality >= 70 &&
    !adjustedClusterTooTall &&
    !ctaCollisionPersistsAfterSubtitleAdjustment &&
    (rawCtaOverlapRisk || rawCtaToCombinedTextDistance <= 2.5 || severeDrivenByCombinedClusterOnly)

  let adjustedAllowedDistance = combinedAllowedDistance
  let adjustedPreferredDistance = combinedPreferredDistance
  if (squareSubtitleCtaNearPass) {
    adjustedAllowedDistance = round(
      titlePlacementDistance * titlePrimaryAnchorWeight +
        Math.max(0, combinedAllowedDistance - titlePlacementDistance) * subtitleSecondaryMassWeight +
        subtitleAttachmentDistance * 0.14 +
        Math.max(0, adjustedCtaToCombinedTextDistance - 2) * 0.08
    )
    adjustedPreferredDistance = round(
      titlePreferredDistance * titlePrimaryAnchorWeight +
        Math.max(0, combinedPreferredDistance - titlePreferredDistance) * subtitleSecondaryMassWeight +
        subtitleAttachmentDistance * 0.16 +
        Math.max(0, adjustedCtaToCombinedTextDistance - 2) * 0.1
    )
  } else if (!subtitleDetached && !oversizedCluster) {
    adjustedAllowedDistance = round(
      titlePlacementDistance * titlePrimaryAnchorWeight +
        Math.max(0, combinedAllowedDistance - titlePlacementDistance) * subtitleSecondaryMassWeight +
        subtitleAttachmentDistance * 0.35
    )
    adjustedPreferredDistance = round(
      titlePreferredDistance * titlePrimaryAnchorWeight +
        Math.max(0, combinedPreferredDistance - titlePreferredDistance) * subtitleSecondaryMassWeight +
        subtitleAttachmentDistance * 0.4
    )
  } else if (subtitleDetached) {
    adjustedAllowedDistance = round(
      titlePlacementDistance +
        Math.max(0, combinedAllowedDistance - titlePlacementDistance) * 0.9 +
        subtitleAttachmentDistance * 0.6
    )
    adjustedPreferredDistance = round(
      titlePreferredDistance +
        Math.max(0, combinedPreferredDistance - titlePreferredDistance) * 0.92 +
        subtitleAttachmentDistance * 0.65
    )
  }

  adjustedAllowedDistance = round(Math.min(combinedAllowedDistance, adjustedAllowedDistance))
  adjustedPreferredDistance = round(Math.min(combinedPreferredDistance, adjustedPreferredDistance))

  const wouldBecomeMilderUnderAttachmentAwarePolicy =
    classifyDistanceBand(adjustedAllowedDistance, adjustedPreferredDistance) !==
    classifyDistanceBand(combinedAllowedDistance, combinedPreferredDistance)
  const wouldBecomeMilderUnderSquareSubtitleCtaPolicy =
    squareSubtitleCtaNearPass ||
    (wouldBecomeMilderUnderAttachmentAwarePolicy && !ctaCollisionPersistsAfterSubtitleAdjustment)

  return {
    titlePlacementDistance,
    titlePreferredDistance,
    combinedAllowedDistance,
    combinedPreferredDistance,
    rawCtaToCombinedTextDistance,
    adjustedCtaToCombinedTextDistance,
    subtitleAttachmentDistance,
    subtitleAttachmentQuality,
    combinedClusterFootprint,
    subtitleInflationContribution,
    titlePrimaryAnchorWeight,
    subtitleSecondaryMassWeight,
    titleDominatesMainTextPlacement,
    subtitleDetached,
    ctaCollisionPersistsAfterSubtitleAdjustment,
    severeDrivenByCombinedClusterOnly,
    wouldBecomeMilderUnderAttachmentAwarePolicy,
    wouldBecomeMilderUnderSquareSubtitleCtaPolicy,
    adjustedTextRect,
    adjustedAllowedDistance,
    adjustedPreferredDistance,
  }
}

function getLandscapeDisplayImagePlacementDiagnostics(input: {
  scene: Scene
  assessment: LayoutAssessment
  formatKey: FormatKey
  roleMetrics: PlacementRoleMetrics[]
  context?: PlacementEvaluationContext
}): LandscapeDisplayImagePlacementDiagnostics | null {
  const format = FORMAT_MAP[input.formatKey]
  if (!isLandscapeDisplayImageContext(format, input.context)) return null
  const imageMetric = input.roleMetrics.find((entry) => entry.role === 'image' && entry.eligible)
  if (!imageMetric?.rect) return null

  const ruleSet = getFormatRuleSet(format)
  const safe = zoneRectToPercent(ruleSet.safeArea, format)
  const rawAllowedZones = getAllowedZoneRects('image', format)
  const rawPreferredZones = getPreferredZoneRects('image', input.assessment, format)
  const rawAllowedDistance = round(getMinDistanceToZones(imageMetric.rect, rawAllowedZones))
  const rawPreferredDistance = round(
    getMinDistanceToZones(imageMetric.rect, rawPreferredZones.length ? rawPreferredZones : rawAllowedZones)
  )
  const rects = getRectangles(input.scene, format)
  const textBounds = bounds([rects.title, rects.subtitle, rects.cta])
  const imageRect = rects.image
  const safeMidX = safe.x + safe.w / 2
  const imageCenterX = imageRect.x + imageRect.w / 2
  const imageRightCoverage = clamp((imageRect.x + imageRect.w - safeMidX) / Math.max(safe.w / 2, 1), 0, 1)
  const splitSideOccupancy = round(imageRightCoverage * 100)
  const supportsReadingFlow = textBounds.x + textBounds.w <= imageRect.x + 4
  const matchesLandscapeSplitPattern =
    imageCenterX >= safeMidX &&
    textBounds.x + textBounds.w <= safeMidX + 2 &&
    imageRect.h >= safe.h * 0.52
  const structurallyAcceptableFootprint =
    imageRect.w <= safe.w * 0.5 &&
    imageRect.h <= safe.h * 0.88 &&
    imageRect.h >= safe.h * 0.42 &&
    imageRect.x >= safe.x &&
    imageRect.x + imageRect.w <= safe.x + safe.w + 4
  const wouldBecomeMilderUnderLandscapeImagePolicy =
    classifyDistanceBand(imageMetric.allowedZoneDistance, imageMetric.preferredZoneDistance) !==
    classifyDistanceBand(rawAllowedDistance, rawPreferredDistance)

  return {
    rawAllowedDistance,
    rawPreferredDistance,
    adjustedAllowedDistance: imageMetric.allowedZoneDistance,
    adjustedPreferredDistance: imageMetric.preferredZoneDistance,
    splitSideOccupancy,
    supportsReadingFlow,
    matchesLandscapeSplitPattern,
    structurallyAcceptableFootprint,
    wouldBecomeMilderUnderLandscapeImagePolicy,
  }
}

function getLandscapeDisplayTextClusterDiagnostics(input: {
  scene: Scene
  assessment: LayoutAssessment
  formatKey: FormatKey
  roleMetrics: PlacementRoleMetrics[]
  context?: PlacementEvaluationContext
}): LandscapeDisplayTextClusterDiagnostics | null {
  const format = FORMAT_MAP[input.formatKey]
  if (!isLandscapeDisplayTextContext(format, input.context)) return null
  const textMetric = input.roleMetrics.find((entry) => entry.role === 'text' && entry.eligible)
  const ctaMetric = input.roleMetrics.find((entry) => entry.role === 'cta' && entry.eligible)
  if (!textMetric?.rect || !ctaMetric?.rect) return null

  const rects = getRectangles(input.scene, format)
  const titleRect = rects.title
  const subtitleRect = rects.subtitle
  const ctaRect = rects.cta
  const messageRect = bounds([titleRect, subtitleRect])
  const allowedZones = textMetric.allowedZones
  const preferredZones = textMetric.preferredZones.length ? textMetric.preferredZones : textMetric.allowedZones
  const imageZones = getAllowedZoneRects('image', format, input.context)
  const imageRect = rects.image
  const ruleSet = getFormatRuleSet(format)
  const safeArea = zoneRectToPercent(ruleSet.safeArea, format)
  const ctaAllowedZones = ctaMetric.allowedZones
  const ctaPreferredZones = ctaMetric.preferredZones.length ? ctaMetric.preferredZones : ctaMetric.allowedZones

  const titlePlacementDistance = round(getMinDistanceToZones(titleRect, allowedZones))
  const titlePreferredDistance = round(getMinDistanceToZones(titleRect, preferredZones))
  const rawCombinedMessageAllowedDistance = round(getMinDistanceToZones(messageRect, allowedZones))
  const rawCombinedMessagePreferredDistance = round(getMinDistanceToZones(messageRect, preferredZones))
  const rawCtaAllowedDistance = round(getMinDistanceToZones(ctaRect, ctaAllowedZones))
  const rawCtaPreferredDistance = round(getMinDistanceToZones(ctaRect, ctaPreferredZones))
  const titleBottom = titleRect.y + titleRect.h
  const subtitleBottom = subtitleRect.y + subtitleRect.h
  const titleSubtitleVerticalGap = round(subtitleRect.y - titleBottom)
  const titleSubtitleHorizontalOffset = round(Math.abs(subtitleRect.x - titleRect.x))
  const titleCtaDistance = round(Math.max(0, ctaRect.y - titleBottom))
  const subtitleCtaDistance = round(Math.max(0, ctaRect.y - subtitleBottom))
  const subtitleAttachmentDistance = round(
    Math.max(0, titleSubtitleVerticalGap - 10) * 0.6 +
      Math.max(0, titleSubtitleHorizontalOffset - 8) * 0.4 +
      (subtitleRect.y + 1 < titleRect.y ? 5 : 0)
  )
  const ctaHorizontalOffset = Math.abs(ctaRect.x - titleRect.x)
  const ctaAnchorVerticalGap = subtitleCtaDistance
  const ctaAnchorHorizontalOffset = round(ctaHorizontalOffset)
  const ctaAttachmentDistance = round(
    Math.max(0, subtitleCtaDistance - 10) * 0.55 +
      Math.max(0, ctaHorizontalOffset - 10) * 0.25 +
      Math.max(0, titleCtaDistance - 24) * 0.2
  )
  const ctaReadingFlowContinuity = round(
    clamp(
      100 -
        Math.max(0, subtitleCtaDistance - 12) * 5 -
        Math.max(0, ctaHorizontalOffset - 10) * 6 -
        (ctaRect.y + 1 < subtitleRect.y ? 18 : 0),
      0,
      100
    )
  )
  const ctaMessageAssociationScore = round(
    clamp(
      100 -
        Math.max(0, subtitleCtaDistance - 10) * 4.5 -
        Math.max(0, titleCtaDistance - 28) * 2.5 -
        Math.max(0, ctaHorizontalOffset - 8) * 5,
      0,
      100
    )
  )
  const subtitleDetached =
    titleSubtitleVerticalGap > 16 ||
    titleSubtitleHorizontalOffset > 12 ||
    subtitleRect.y + 1 < titleRect.y
  const messageAnchorReady =
    titlePlacementDistance <= 3 &&
    subtitleAttachmentDistance <= 2 &&
    !subtitleDetached &&
    titleSubtitleHorizontalOffset <= 8 &&
    ctaRect.y >= subtitleRect.y &&
    ctaRect.y >= titleRect.y
  const ctaBelongsToMessageSide =
    !imageRect || ctaRect.x + ctaRect.w <= imageRect.x + 4
  const ctaStrongAssociation =
    ctaReadingFlowContinuity >= 74 &&
    ctaMessageAssociationScore >= 72 &&
    ctaAnchorHorizontalOffset <= 12 &&
    ctaBelongsToMessageSide
  const ctaWithinSplitLayoutTolerance =
    (subtitleCtaDistance <= 18 &&
      titleCtaDistance <= 34 &&
      ctaHorizontalOffset <= 10 &&
      ctaRect.y >= subtitleRect.y &&
      ctaReadingFlowContinuity >= 70 &&
      ctaMessageAssociationScore >= 68) ||
    (messageAnchorReady &&
      ctaStrongAssociation &&
      ctaAnchorVerticalGap <= 26 &&
      titleCtaDistance <= 42)
  const disconnectDrivenPrimarilyByGap =
    subtitleCtaDistance > 14 && subtitleCtaDistance >= ctaHorizontalOffset * 1.8
  const disconnectDrivenPrimarilyByHorizontalOffset =
    ctaHorizontalOffset > 10 && ctaHorizontalOffset >= subtitleCtaDistance * 0.8
  const safeAreaFootprint =
    safeArea.w > 0 && safeArea.h > 0 ? (messageRect.w * messageRect.h) / (safeArea.w * safeArea.h) : 0
  const clusterFootprint = round(safeAreaFootprint * 100)
  const messageClusterHeight = round(messageRect.h)
  const messageClusterWidth = round(messageRect.w)
  const maxAllowedHeight = Math.max(0, ...allowedZones.map((zone) => zone.h))
  const maxAllowedWidth = Math.max(0, ...allowedZones.map((zone) => zone.w))
  const subtitleInflationContribution = round(
    Math.max(
      0,
      rawCombinedMessageAllowedDistance - titlePlacementDistance,
      rawCombinedMessagePreferredDistance - titlePreferredDistance,
      messageRect.h - titleRect.h
    )
  )
  const ctaAnchorDistance = round(
    Math.max(0, ctaAnchorVerticalGap - (ctaStrongAssociation ? 18 : 12)) * (ctaStrongAssociation ? 0.28 : 0.42) +
      Math.max(0, ctaAnchorHorizontalOffset - (ctaStrongAssociation ? 12 : 9)) * 0.32 +
      Math.max(0, titleCtaDistance - (messageAnchorReady ? 38 : 30)) * 0.16 +
      (!ctaBelongsToMessageSide ? 1.8 : 0)
  )
  const ctaAttachmentSeverity =
    ctaWithinSplitLayoutTolerance
      ? 'mild'
      : ctaMessageAssociationScore >= 58 &&
            ctaReadingFlowContinuity >= 56 &&
            ctaAnchorDistance <= 4.5
        ? 'moderate'
        : 'severe'
  const ctaDetached =
    !ctaWithinSplitLayoutTolerance &&
    ((ctaAttachmentSeverity === 'severe' &&
      (ctaAnchorVerticalGap > 24 || ctaAnchorHorizontalOffset > 14 || !ctaBelongsToMessageSide)) ||
      ctaAnchorVerticalGap > 30 ||
      ctaAnchorHorizontalOffset > 18 ||
      ctaRect.y + 1 < subtitleRect.y)
  const textImageSplitCoherent =
    imageZones.length > 0
      ? imageZones.some((zone) => messageRect.x + messageRect.w <= zone.x + 6 || imageRect.x >= messageRect.x + messageRect.w - 2)
      : messageRect.x + messageRect.w <= imageRect.x + 6
  const fullClusterCoherent = !subtitleDetached && !ctaDetached && textImageSplitCoherent
  const landscapeSplitMessageNearPass =
    titlePlacementDistance <= 4 &&
    titlePreferredDistance <= 6 &&
    subtitleAttachmentDistance <= 2 &&
    !subtitleDetached &&
    textImageSplitCoherent &&
    ctaWithinSplitLayoutTolerance
  const titleDominatesMainTextPlacement =
    titlePlacementDistance >= rawCombinedMessageAllowedDistance * 0.65 ||
    titlePreferredDistance >= rawCombinedMessagePreferredDistance * 0.65
  const subtitleInflatesMainly =
    subtitleInflationContribution >= 10 &&
    subtitleAttachmentDistance <= 4 &&
    titlePlacementDistance <= 6
  const titlePrimaryAnchorWeight = round(
    clamp(
      !subtitleDetached && textImageSplitCoherent
        ? 0.86 - Math.max(0, titlePlacementDistance - 2) * 0.03
        : 0.68 - Math.max(0, titlePlacementDistance - 2) * 0.02,
      0.55,
      0.9
    )
  )
  const subtitleSecondaryMassWeight = round(
    clamp(
      subtitleDetached
        ? 0.82
        : subtitleInflatesMainly
          ? 0.18 + Math.max(0, subtitleAttachmentDistance - 1) * 0.06
          : 0.34 + subtitleAttachmentDistance * 0.04,
      0.16,
      0.9
    )
  )
  const messageClusterTooTall =
    (maxAllowedHeight > 0 &&
      messageRect.h > maxAllowedHeight * (landscapeSplitMessageNearPass ? 1.18 : 1.08)) ||
    clusterFootprint > (landscapeSplitMessageNearPass ? 30 : 26) ||
    messageRect.h > safeArea.h * (landscapeSplitMessageNearPass ? 0.48 : 0.42)
  const messageClusterTooWide =
    (maxAllowedWidth > 0 &&
      messageRect.w > maxAllowedWidth * (landscapeSplitMessageNearPass ? 1.1 : 1.06)) ||
    messageRect.w > safeArea.w * (landscapeSplitMessageNearPass ? 0.62 : 0.58)
  const oversizedCluster = messageClusterTooTall || messageClusterTooWide
  const severeDrivenByCombinedClusterOnly =
    classifyDistanceBand(rawCombinedMessageAllowedDistance, rawCombinedMessagePreferredDistance) === 'severe' &&
    classifyDistanceBand(titlePlacementDistance, titlePreferredDistance) !== 'severe' &&
    !subtitleDetached &&
    !ctaDetached &&
    !oversizedCluster
  const severeDrivenBySubtitleInflationOnly =
    classifyDistanceBand(rawCombinedMessageAllowedDistance, rawCombinedMessagePreferredDistance) === 'severe' &&
    classifyDistanceBand(titlePlacementDistance, titlePreferredDistance) !== 'severe' &&
    subtitleInflatesMainly &&
    !subtitleDetached &&
    textImageSplitCoherent &&
    fullClusterCoherent &&
    !messageClusterTooWide

  let adjustedAllowedDistance = rawCombinedMessageAllowedDistance
  let adjustedPreferredDistance = rawCombinedMessagePreferredDistance
  let adjustedCtaAllowedDistance = rawCtaAllowedDistance
  let adjustedCtaPreferredDistance = rawCtaPreferredDistance
  if (severeDrivenBySubtitleInflationOnly) {
    adjustedAllowedDistance = round(
      titlePlacementDistance * titlePrimaryAnchorWeight +
        Math.max(0, rawCombinedMessageAllowedDistance - titlePlacementDistance) * subtitleSecondaryMassWeight +
        subtitleAttachmentDistance * 0.22
    )
    adjustedPreferredDistance = round(
      titlePreferredDistance * titlePrimaryAnchorWeight +
        Math.max(0, rawCombinedMessagePreferredDistance - titlePreferredDistance) * subtitleSecondaryMassWeight +
        subtitleAttachmentDistance * 0.24
    )
  } else if (!subtitleDetached && !ctaDetached && !oversizedCluster) {
    adjustedAllowedDistance = round(
      titlePlacementDistance * titlePrimaryAnchorWeight +
        Math.max(0, rawCombinedMessageAllowedDistance - titlePlacementDistance) * subtitleSecondaryMassWeight +
        subtitleAttachmentDistance * 0.3 +
        ctaAttachmentDistance * 0.28
    )
    adjustedPreferredDistance = round(
      titlePreferredDistance * titlePrimaryAnchorWeight +
        Math.max(0, rawCombinedMessagePreferredDistance - titlePreferredDistance) * subtitleSecondaryMassWeight +
        subtitleAttachmentDistance * 0.32 +
        ctaAttachmentDistance * 0.3
    )
  } else if (subtitleDetached || ctaDetached) {
    adjustedAllowedDistance = round(
      titlePlacementDistance +
        Math.max(0, rawCombinedMessageAllowedDistance - titlePlacementDistance) * 0.88 +
        subtitleAttachmentDistance * 0.4 +
        ctaAttachmentDistance * 0.45
    )
    adjustedPreferredDistance = round(
      titlePreferredDistance +
        Math.max(0, rawCombinedMessagePreferredDistance - titlePreferredDistance) * 0.9 +
        subtitleAttachmentDistance * 0.42 +
        ctaAttachmentDistance * 0.48
    )
  }

  if (landscapeSplitMessageNearPass && !oversizedCluster) {
    adjustedAllowedDistance = round(
      titlePlacementDistance * Math.max(titlePrimaryAnchorWeight, 0.88) +
        Math.max(0, rawCombinedMessageAllowedDistance - titlePlacementDistance) *
          Math.min(subtitleSecondaryMassWeight, 0.14) +
        subtitleAttachmentDistance * 0.16 +
        ctaAnchorDistance * 0.08
    )
    adjustedPreferredDistance = round(
      titlePreferredDistance * Math.max(titlePrimaryAnchorWeight, 0.88) +
        Math.max(0, rawCombinedMessagePreferredDistance - titlePreferredDistance) *
          Math.min(subtitleSecondaryMassWeight, 0.16) +
        subtitleAttachmentDistance * 0.18 +
        ctaAnchorDistance * 0.1
    )
  }

  const ctaAnchorWouldBecomeMilder =
    (ctaWithinSplitLayoutTolerance || (messageAnchorReady && ctaStrongAssociation)) &&
    ctaAttachmentSeverity !== 'severe'

  if (ctaAnchorWouldBecomeMilder && textImageSplitCoherent && !subtitleDetached) {
    adjustedCtaAllowedDistance = round(
      Math.min(
        rawCtaAllowedDistance,
        Math.max(0.8, rawCtaAllowedDistance * (ctaWithinSplitLayoutTolerance ? 0.28 : 0.38))
      )
    )
    adjustedCtaPreferredDistance = round(
      Math.min(
        rawCtaPreferredDistance,
        Math.max(1.2, rawCtaPreferredDistance * (ctaWithinSplitLayoutTolerance ? 0.34 : 0.42))
      )
    )
    adjustedAllowedDistance = round(
      titlePlacementDistance * titlePrimaryAnchorWeight +
        Math.max(0, rawCombinedMessageAllowedDistance - titlePlacementDistance) * Math.min(subtitleSecondaryMassWeight, 0.2) +
        subtitleAttachmentDistance * 0.18 +
        ctaAnchorDistance * (ctaWithinSplitLayoutTolerance ? 0.1 : 0.16)
    )
    adjustedPreferredDistance = round(
      titlePreferredDistance * titlePrimaryAnchorWeight +
        Math.max(0, rawCombinedMessagePreferredDistance - titlePreferredDistance) * Math.min(subtitleSecondaryMassWeight, 0.22) +
        subtitleAttachmentDistance * 0.2 +
        ctaAnchorDistance * (ctaWithinSplitLayoutTolerance ? 0.12 : 0.18)
    )
  }

  adjustedAllowedDistance = round(Math.min(rawCombinedMessageAllowedDistance, adjustedAllowedDistance))
  adjustedPreferredDistance = round(Math.min(rawCombinedMessagePreferredDistance, adjustedPreferredDistance))
  adjustedCtaAllowedDistance = round(Math.min(rawCtaAllowedDistance, adjustedCtaAllowedDistance))
  adjustedCtaPreferredDistance = round(Math.min(rawCtaPreferredDistance, adjustedCtaPreferredDistance))

  return {
    titlePlacementDistance,
    titlePreferredDistance,
    combinedAllowedDistance: rawCombinedMessageAllowedDistance,
    combinedPreferredDistance: rawCombinedMessagePreferredDistance,
    rawCombinedMessageAllowedDistance,
    rawCombinedMessagePreferredDistance,
    adjustedAllowedDistance,
    adjustedPreferredDistance,
    adjustedCtaAllowedDistance,
    adjustedCtaPreferredDistance,
    subtitleAttachmentDistance,
    ctaAttachmentDistance,
    ctaAnchorDistance,
    ctaAnchorVerticalGap,
    ctaAnchorHorizontalOffset,
    ctaAttachmentSeverity,
    ctaWithinSplitLayoutTolerance,
    ctaReadingFlowContinuity,
    ctaMessageAssociationScore,
    ctaAnchorWouldBecomeMilder,
    disconnectDrivenPrimarilyByGap,
    disconnectDrivenPrimarilyByHorizontalOffset,
    clusterFootprint,
    messageClusterHeight,
    messageClusterWidth,
    subtitleInflationContribution,
    subtitleInflatesMainly,
    titlePrimaryAnchorWeight,
    subtitleSecondaryMassWeight,
    titleDominatesMainTextPlacement,
    subtitleDetached,
    ctaDetached,
    textImageSplitCoherent,
    messageClusterTooTall,
    messageClusterTooWide,
    severeDrivenByCombinedClusterOnly,
    severeDrivenBySubtitleInflationOnly,
    wouldBecomeMilderUnderAttachmentAwarePolicy:
      classifyDistanceBand(adjustedAllowedDistance, adjustedPreferredDistance) !==
      classifyDistanceBand(rawCombinedMessageAllowedDistance, rawCombinedMessagePreferredDistance),
    wouldBecomeMilderUnderAttachmentAwareLandscapeMessagePolicy:
      classifyDistanceBand(adjustedAllowedDistance, adjustedPreferredDistance) !==
        classifyDistanceBand(rawCombinedMessageAllowedDistance, rawCombinedMessagePreferredDistance) ||
      severeDrivenBySubtitleInflationOnly,
    wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy:
      classifyDistanceBand(adjustedCtaAllowedDistance, adjustedCtaPreferredDistance) !==
        classifyDistanceBand(rawCtaAllowedDistance, rawCtaPreferredDistance) ||
      (ctaAttachmentSeverity === 'mild' && !ctaDetached),
    titleSubtitleVerticalGap,
    titleSubtitleHorizontalOffset,
    titleCtaDistance,
    subtitleCtaDistance,
    fullClusterCoherent,
  }
}

function getViolationRoles(metrics: PlacementRoleMetrics[]) {
  return metrics
    .filter((entry) => entry.eligible && (entry.allowedZoneDistance > 2 || entry.preferredZoneDistance > 5))
    .sort((left, right) => {
      const leftDistance = Math.max(left.allowedZoneDistance, left.preferredZoneDistance)
      const rightDistance = Math.max(right.allowedZoneDistance, right.preferredZoneDistance)
      if (rightDistance !== leftDistance) return rightDistance - leftDistance
      return left.role.localeCompare(right.role)
    })
}

function getDominantRole(violations: PlacementRoleMetrics[]): PlacementViolationRole {
  if (!violations.length) return 'unknown'
  if (violations.length === 1) return violations[0].role
  const [first, second] = violations
  const firstDistance = Math.max(first.allowedZoneDistance, first.preferredZoneDistance)
  const secondDistance = Math.max(second.allowedZoneDistance, second.preferredZoneDistance)
  if (secondDistance >= firstDistance * 0.8) return 'multiple'
  return first.role
}

export function classifyPlacementViolation(input: {
  scene: Scene
  assessment: LayoutAssessment
  formatKey: FormatKey
  candidateKind?: string
  strategyLabel?: string
}): PlacementViolationDiagnostics {
  const format = FORMAT_MAP[input.formatKey]
  const rects = getRectangles(input.scene, format)
  const badgeSemantic = resolveSharedBadgeSemantic(input.scene)
  const badgeSemanticallyActive = badgeSemantic === 'badge' && Boolean(trimText(input.scene.badge.text))
  const badgeVisuallyCritical = badgeSemanticallyActive && isBadgeVisuallyCritical(input.scene.badge.text)
  const badgeAffectsCoreReadingFlow = getBadgeAffectsCoreReadingFlow(input.scene, format)
  const badgeLikelyOptional =
    isLandscapeDisplayBadgeContext(format) &&
    badgeSemanticallyActive &&
    !badgeVisuallyCritical &&
    !badgeAffectsCoreReadingFlow
  const context: PlacementEvaluationContext = {
    candidateKind: input.candidateKind,
    strategyLabel: input.strategyLabel,
    badgeSemanticallyActive,
    badgeVisuallyCritical,
  }
  const roleMetrics = getRoleMetrics(input.scene, input.assessment, input.formatKey, context)
  const textCluster = getSquareDisplayTextClusterDiagnostics({
    scene: input.scene,
    assessment: input.assessment,
    formatKey: input.formatKey,
    roleMetrics,
    context,
  })
  const landscapeTextCluster = getLandscapeDisplayTextClusterDiagnostics({
    scene: input.scene,
    assessment: input.assessment,
    formatKey: input.formatKey,
    roleMetrics,
    context,
  })
  const imagePlacement = getLandscapeDisplayImagePlacementDiagnostics({
    scene: input.scene,
    assessment: input.assessment,
    formatKey: input.formatKey,
    roleMetrics,
    context,
  })
  if (textCluster) {
    const textEntry = roleMetrics.find((entry) => entry.role === 'text')
    if (textEntry) {
      textEntry.allowedZoneDistance = textCluster.adjustedAllowedDistance
      textEntry.preferredZoneDistance = textCluster.adjustedPreferredDistance
    }
  }
  if (landscapeTextCluster) {
    const textEntry = roleMetrics.find((entry) => entry.role === 'text')
    if (textEntry) {
      textEntry.allowedZoneDistance = landscapeTextCluster.adjustedAllowedDistance
      textEntry.preferredZoneDistance = landscapeTextCluster.adjustedPreferredDistance
    }
    const ctaEntry = roleMetrics.find((entry) => entry.role === 'cta')
    if (ctaEntry) {
      ctaEntry.allowedZoneDistance = landscapeTextCluster.adjustedCtaAllowedDistance
      ctaEntry.preferredZoneDistance = landscapeTextCluster.adjustedCtaPreferredDistance
    }
  }
  const violations = getViolationRoles(roleMetrics)
  const nonBadgeMaxDistance = Math.max(
    0,
    ...violations
      .filter((entry) => entry.role !== 'badge')
      .map((entry) => Math.max(entry.allowedZoneDistance, entry.preferredZoneDistance))
  )
  const badgeCanBeDeprioritized =
    badgeLikelyOptional &&
    violations.some((entry) => entry.role === 'badge') &&
    nonBadgeMaxDistance <= 12
  const effectiveViolations = badgeCanBeDeprioritized
    ? violations.filter((entry) => entry.role !== 'badge')
    : violations
  const rolePlacementFinding = (input.assessment.structuralState?.findings || []).find(
    (finding) => finding.name === 'role-placement'
  )
  const clusterIntegrity = round(getClusterIntegrity(input.assessment))
  const visualHierarchyPreserved = getVisualHierarchyPreserved(input.assessment)
  const dominantRole = getDominantRole(effectiveViolations)
  const avgAllowed = round(average(effectiveViolations.map((entry) => entry.allowedZoneDistance)))
  const avgPreferred = round(average(effectiveViolations.map((entry) => entry.preferredZoneDistance)))
  const dominantMetrics =
    effectiveViolations[0] ||
    roleMetrics.find((entry) => entry.role === 'text') || {
      role: 'unknown' as PlacementViolationRole,
      preferredZoneDistance: 0,
      allowedZoneDistance: 0,
    }

  if (!effectiveViolations.length && !rolePlacementFinding) {
    return {
      role: 'unknown',
      violatingRoles: [],
      preferredZoneDistance: 0,
      allowedZoneDistance: 0,
      avgAllowedDistance: 0,
      avgPreferredDistance: 0,
      clusterIntegrity,
      visualHierarchyPreserved,
      likelyIntentional: true,
      badgeSemanticallyActive,
      badgeVisuallyCritical,
      badgeAffectsCoreReadingFlow,
      badgeLikelyOptional,
      severity: 'none',
      reasons: [],
      perRole: roleMetrics.map((entry) => ({
        role: entry.role,
        eligible: entry.eligible,
        eligibilityReason: entry.eligibilityReason,
        allowedDistance: entry.allowedZoneDistance,
        preferredDistance: entry.preferredZoneDistance,
        rect: entry.rect,
        allowedZones: entry.allowedZones,
        preferredZones: entry.preferredZones,
        allowedZonesCount: entry.allowedZones.length,
        preferredZonesCount: entry.preferredZones.length,
        zonePaddingApplied: entry.zonePaddingApplied,
      })),
      skippedRoles: roleMetrics
        .filter((entry) => !entry.eligible && entry.eligibilityReason)
        .map((entry) => ({
          role: entry.role,
          reason: entry.eligibilityReason || 'skipped',
        })),
      textBoxes: {
        titleRect: rects.title,
        subtitleRect: rects.subtitle,
        combinedBoundsRect: bounds([rects.title, rects.subtitle]),
      },
      textCluster: textCluster || undefined,
      landscapeTextCluster: landscapeTextCluster || undefined,
      imagePlacement: imagePlacement || undefined,
    }
  }

  const likelyIntentional =
    avgAllowed <= 2 &&
    avgPreferred <= 5 &&
    clusterIntegrity >= 70 &&
    visualHierarchyPreserved

  const reasons: string[] = []
  if (dominantMetrics.allowedZoneDistance > 0) {
    reasons.push(`allowed-zone-drift:${dominantMetrics.allowedZoneDistance}`)
  }
  if (dominantMetrics.preferredZoneDistance > 0) {
    reasons.push(`preferred-zone-drift:${dominantMetrics.preferredZoneDistance}`)
  }
  if (avgAllowed > 0) reasons.push(`avg-allowed-zone-drift:${avgAllowed}`)
  if (avgPreferred > 0) reasons.push(`avg-preferred-zone-drift:${avgPreferred}`)
  if (textCluster?.subtitleDetached) reasons.push('subtitle-detached')
  if (textCluster?.severeDrivenByCombinedClusterOnly) reasons.push('combined-text-cluster-inflated')
  if (textCluster?.wouldBecomeMilderUnderAttachmentAwarePolicy) {
    reasons.push('attachment-aware-text-cluster-would-be-milder')
  }
  if (landscapeTextCluster?.subtitleDetached) reasons.push('landscape-subtitle-detached')
  if (landscapeTextCluster?.ctaDetached) reasons.push('landscape-cta-detached')
  if (landscapeTextCluster?.ctaWithinSplitLayoutTolerance) reasons.push('landscape-cta-within-split-tolerance')
  if (!landscapeTextCluster?.textImageSplitCoherent && landscapeTextCluster) {
    reasons.push('landscape-text-image-split-incoherent')
  }
  if (landscapeTextCluster?.severeDrivenByCombinedClusterOnly) {
    reasons.push('landscape-combined-cluster-inflated')
  }
  if (landscapeTextCluster?.wouldBecomeMilderUnderAttachmentAwarePolicy) {
    reasons.push('attachment-aware-landscape-cluster-would-be-milder')
  }
  if (landscapeTextCluster?.wouldBecomeMilderUnderLandscapeCtaAttachmentPolicy) {
    reasons.push('attachment-aware-landscape-cta-would-be-milder')
  }
  if (imagePlacement?.wouldBecomeMilderUnderLandscapeImagePolicy) {
    reasons.push('landscape-image-policy-would-be-milder')
  }
  if (clusterIntegrity < 60) reasons.push('cluster-integrity-low')
  if (!visualHierarchyPreserved) reasons.push('visual-hierarchy-weak')
  if (likelyIntentional) reasons.push('likely-intentional-offset')
  if (effectiveViolations.length > 1) reasons.push('multiple-roles-drifting')
  if (badgeCanBeDeprioritized) reasons.push('optional-badge-deprioritized')
  if (rolePlacementFinding?.severity === 'high') reasons.push('high-severity-role-placement-finding')

  let severity = classifyDistanceBand(avgAllowed, avgPreferred)

  if (rolePlacementFinding?.severity === 'high' && severity === 'mild' && avgAllowed > 2) {
    severity = 'moderate'
  }
  if (effectiveViolations.length >= 3 && dominantMetrics.allowedZoneDistance > 6) {
    severity = 'severe'
  }
  if (!visualHierarchyPreserved && avgAllowed > 6 && avgPreferred > 12) {
    severity = 'severe'
  }

  maybeLogTitlePlacementDebug({
    scene: input.scene,
    assessment: input.assessment,
    formatKey: input.formatKey,
    severity,
  })

  return {
    role: dominantRole,
    violatingRoles: effectiveViolations.map((entry) => entry.role),
    preferredZoneDistance: dominantMetrics.preferredZoneDistance,
    allowedZoneDistance: dominantMetrics.allowedZoneDistance,
    avgAllowedDistance: avgAllowed,
    avgPreferredDistance: avgPreferred,
    clusterIntegrity,
    visualHierarchyPreserved,
    likelyIntentional,
    badgeSemanticallyActive,
    badgeVisuallyCritical,
    badgeAffectsCoreReadingFlow,
    badgeLikelyOptional,
    severity,
    reasons,
    perRole: roleMetrics.map((entry) => ({
      role: entry.role,
      eligible: entry.eligible,
      eligibilityReason: entry.eligibilityReason,
      allowedDistance: entry.allowedZoneDistance,
      preferredDistance: entry.preferredZoneDistance,
      rect: entry.rect,
      allowedZones: entry.allowedZones,
      preferredZones: entry.preferredZones,
      allowedZonesCount: entry.allowedZones.length,
      preferredZonesCount: entry.preferredZones.length,
      zonePaddingApplied: entry.zonePaddingApplied,
    })),
    skippedRoles: roleMetrics
      .filter((entry) => !entry.eligible && entry.eligibilityReason)
      .map((entry) => ({
        role: entry.role,
        reason: entry.eligibilityReason || 'skipped',
      })),
    textBoxes: {
      titleRect: rects.title,
      subtitleRect: rects.subtitle,
      combinedBoundsRect: bounds([rects.title, rects.subtitle]),
    },
    textCluster: textCluster || undefined,
    landscapeTextCluster: landscapeTextCluster || undefined,
    imagePlacement: imagePlacement || undefined,
  }
}

export function simulateSoftPlacementPolicy(input: {
  aggregateScore: number
  baselineAggregateScore: number
  rejectionReasons: RepairRejectionReason[]
  gateOutcomes: RepairCandidateGateDiagnostics
  placement: PlacementViolationDiagnostics
  thresholds: RepairObjectiveThresholds
}) {
  const severity = input.placement.severity
  const penalty =
    severity === 'mild'
      ? input.thresholds.softPlacementPenalty.mild
      : severity === 'moderate'
        ? input.thresholds.softPlacementPenalty.moderate
        : severity === 'severe'
          ? input.thresholds.softPlacementPenalty.severe
          : 0
  const adjustedAggregateScore = round(input.aggregateScore - penalty)
  const adjustedDelta = round(adjustedAggregateScore - input.baselineAggregateScore)
  const remainingReasons = input.rejectionReasons.filter((reason) => reason !== 'role-placement-out-of-zone')
  const aggregateBelowBaseline = adjustedAggregateScore < input.baselineAggregateScore
  const noNetGain = adjustedDelta < input.thresholds.minAggregateGain
  const passableSeverity =
    severity !== 'severe' &&
    (severity === input.thresholds.softPlacementPassMaxSeverity ||
      severity === 'mild' ||
      (input.thresholds.softPlacementPassMaxSeverity === 'moderate' && severity === 'moderate'))

  const otherHardGate = remainingReasons.some((reason) =>
    [
      'repeat-suppressed',
      'legacy-safety-rejection',
      'hard-structural-invalidity',
      'spacing-threshold-exceeded',
      'confidence-collapse',
    ].includes(reason)
  )

  const wouldPassWithSoftPlacement =
    input.gateOutcomes.rolePlacementOutOfZone &&
    passableSeverity &&
    !otherHardGate &&
    !aggregateBelowBaseline &&
    !noNetGain

  return {
    softPlacementPenalty: round(penalty),
    adjustedAggregateScore,
    wouldPassWithSoftPlacement,
    wouldBeatBaselineWithSoftPlacement: adjustedAggregateScore > input.baselineAggregateScore,
  }
}
