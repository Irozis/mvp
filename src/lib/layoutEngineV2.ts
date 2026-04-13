import { finalizeSceneGeometry, stabilizeMarketplaceLayout } from './layoutEngine'
import { getFormatRuleSet } from './formatRules'
import type {
  BrandKit,
  ContentProfile,
  EnhancedImageAnalysis,
  FormatDefinition,
  Scene,
  SceneElement,
  VisualSystemKey,
} from './types'

// —— V2-only types ——
// `supportedFamilies` uses string[] intentionally — temporary V2 prototype compromise
// to avoid FormatFamily union import complications.

export type ArchetypeId =
  | 'split-right-image'
  | 'split-left-image'
  | 'hero-overlay-bottom'
  | 'hero-overlay-center'
  | 'product-card-top'
  | 'text-dominant'
  | 'leaderboard-split'
  | 'skyscraper-stack'

export type SlotName = 'image' | 'headline' | 'subtitle' | 'cta' | 'logo' | 'badge'

export type Slot = {
  name: SlotName
  x: number
  y: number
  w: number
  h: number
  minFontSize?: number
  maxFontSize?: number
  maxLines?: number
  zIndex: number
}

export type V2Archetype = {
  id: ArchetypeId
  label: string
  slots: Slot[]
  supportedFamilies: string[]
  overlayText: boolean
}

export type DesignObjective = {
  hierarchyClarity: number
  visualBalance: number
  ctaVisibility: number
  imageImpact: number
  readability: number
  spacingQuality: number
}

export type ObjectiveWeights = {
  hierarchyClarity: number
  visualBalance: number
  ctaVisibility: number
  imageImpact: number
  readability: number
  spacingQuality: number
}

export type V2LayoutResult = {
  scene: Scene
  archetypeId: ArchetypeId
  score: number
  objective: DesignObjective
  constraintViolations: string[]
}

const MIN_RECT: SceneElement = { x: 0, y: 0, w: 0, h: 0 }

function safeSceneElement(el: unknown): SceneElement {
  if (el && typeof el === 'object') return { ...MIN_RECT, ...(el as SceneElement) }
  return { ...MIN_RECT }
}

export const ARCHETYPES: Record<ArchetypeId, V2Archetype> = {
  'split-right-image': {
    id: 'split-right-image',
    label: 'Split — image right',
    overlayText: false,
    supportedFamilies: ['square'],
    slots: [
      { name: 'image', x: 42, y: 0, w: 58, h: 100, zIndex: 1 },
      { name: 'logo', x: 6, y: 4, w: 12, h: 6, zIndex: 5 },
      { name: 'badge', x: 6, y: 11, w: 18, h: 5, zIndex: 5 },
      {
        name: 'headline',
        x: 6,
        y: 18,
        w: 32,
        h: 26,
        zIndex: 3,
        minFontSize: 32,
        maxFontSize: 56,
        maxLines: 3,
      },
      {
        name: 'subtitle',
        x: 6,
        y: 50,
        w: 32,
        h: 12,
        zIndex: 3,
        minFontSize: 14,
        maxFontSize: 18,
        maxLines: 2,
      },
      { name: 'cta', x: 6, y: 68, w: 26, h: 9, zIndex: 4, minFontSize: 14 },
    ],
  },
  'hero-overlay-bottom': {
    id: 'hero-overlay-bottom',
    label: 'Hero — text card bottom',
    overlayText: true,
    supportedFamilies: ['portrait', 'square'],
    slots: [
      { name: 'image', x: 0, y: 0, w: 100, h: 100, zIndex: 1 },
      { name: 'logo', x: 5, y: 4, w: 12, h: 5, zIndex: 5 },
      { name: 'badge', x: 80, y: 4, w: 15, h: 5, zIndex: 5 },
      {
        name: 'headline',
        x: 5,
        y: 58,
        w: 86,
        h: 18,
        zIndex: 3,
        minFontSize: 34,
        maxFontSize: 64,
        maxLines: 3,
      },
      {
        name: 'subtitle',
        x: 5,
        y: 79,
        w: 80,
        h: 8,
        zIndex: 3,
        minFontSize: 14,
        maxFontSize: 17,
        maxLines: 2,
      },
      { name: 'cta', x: 5, y: 89, w: 30, h: 8, zIndex: 4, minFontSize: 14 },
    ],
  },
  'product-card-top': {
    id: 'product-card-top',
    label: 'Product — image top',
    overlayText: false,
    supportedFamilies: ['square', 'portrait'],
    slots: [
      { name: 'image', x: 5, y: 3, w: 90, h: 52, zIndex: 1 },
      { name: 'logo', x: 5, y: 4, w: 12, h: 5, zIndex: 5 },
      { name: 'badge', x: 76, y: 4, w: 16, h: 5, zIndex: 5 },
      {
        name: 'headline',
        x: 5,
        y: 58,
        w: 76,
        h: 18,
        zIndex: 3,
        minFontSize: 28,
        maxFontSize: 52,
        maxLines: 3,
      },
      {
        name: 'subtitle',
        x: 5,
        y: 78,
        w: 72,
        h: 8,
        zIndex: 3,
        minFontSize: 13,
        maxFontSize: 18,
        maxLines: 2,
      },
      { name: 'cta', x: 5, y: 88, w: 28, h: 8, zIndex: 4, minFontSize: 14 },
    ],
  },
  'leaderboard-split': {
    id: 'leaderboard-split',
    label: 'Leaderboard — horizontal split',
    overlayText: false,
    supportedFamilies: ['landscape', 'display-rectangle'],
    slots: [
      { name: 'image', x: 56, y: 5, w: 40, h: 88, zIndex: 1 },
      { name: 'logo', x: 3, y: 5, w: 14, h: 8, zIndex: 5 },
      { name: 'badge', x: 36, y: 5, w: 16, h: 8, zIndex: 5 },
      {
        name: 'headline',
        x: 3,
        y: 20,
        w: 48,
        h: 30,
        zIndex: 3,
        minFontSize: 24,
        maxFontSize: 48,
        maxLines: 2,
      },
      {
        name: 'subtitle',
        x: 3,
        y: 55,
        w: 46,
        h: 16,
        zIndex: 3,
        minFontSize: 12,
        maxFontSize: 18,
        maxLines: 3,
      },
      { name: 'cta', x: 3, y: 76, w: 22, h: 14, zIndex: 4, minFontSize: 13 },
    ],
  },
  'skyscraper-stack': {
    id: 'skyscraper-stack',
    label: 'Skyscraper — vertical stack',
    overlayText: false,
    supportedFamilies: ['display-skyscraper', 'display-leaderboard'],
    slots: [
      { name: 'image', x: 5, y: 3, w: 90, h: 44, zIndex: 1 },
      { name: 'logo', x: 5, y: 4, w: 18, h: 5, zIndex: 5 },
      { name: 'badge', x: 72, y: 4, w: 22, h: 5, zIndex: 5 },
      {
        name: 'headline',
        x: 5,
        y: 50,
        w: 88,
        h: 24,
        zIndex: 3,
        minFontSize: 18,
        maxFontSize: 32,
        maxLines: 4,
      },
      {
        name: 'subtitle',
        x: 5,
        y: 76,
        w: 84,
        h: 12,
        zIndex: 3,
        minFontSize: 12,
        maxFontSize: 16,
        maxLines: 3,
      },
      { name: 'cta', x: 12, y: 90, w: 74, h: 8, zIndex: 4, minFontSize: 13 },
    ],
  },
  'text-dominant': {
    id: 'text-dominant',
    label: 'Text dominant',
    overlayText: false,
    supportedFamilies: ['square', 'landscape', 'portrait'],
    slots: [
      { name: 'image', x: 58, y: 10, w: 36, h: 68, zIndex: 1 },
      { name: 'logo', x: 4, y: 4, w: 12, h: 5, zIndex: 5 },
      { name: 'badge', x: 4, y: 11, w: 18, h: 5, zIndex: 5 },
      {
        name: 'headline',
        x: 4,
        y: 10,
        w: 50,
        h: 36,
        zIndex: 3,
        minFontSize: 28,
        maxFontSize: 56,
        maxLines: 4,
      },
      {
        name: 'subtitle',
        x: 4,
        y: 50,
        w: 48,
        h: 18,
        zIndex: 3,
        minFontSize: 13,
        maxFontSize: 18,
        maxLines: 4,
      },
      { name: 'cta', x: 4, y: 72, w: 26, h: 9, zIndex: 4, minFontSize: 14 },
    ],
  },
  'split-left-image': {
    id: 'split-left-image',
    label: 'Split — image left',
    overlayText: false,
    supportedFamilies: ['square', 'landscape'],
    slots: [
      { name: 'image', x: 0, y: 0, w: 55, h: 100, zIndex: 1 },
      { name: 'logo', x: 58, y: 5, w: 12, h: 6, zIndex: 5 },
      { name: 'badge', x: 76, y: 5, w: 16, h: 5, zIndex: 5 },
      {
        name: 'headline',
        x: 58,
        y: 15,
        w: 36,
        h: 28,
        zIndex: 3,
        minFontSize: 28,
        maxFontSize: 56,
        maxLines: 3,
      },
      {
        name: 'subtitle',
        x: 58,
        y: 47,
        w: 36,
        h: 14,
        zIndex: 3,
        minFontSize: 13,
        maxFontSize: 18,
        maxLines: 3,
      },
      { name: 'cta', x: 58, y: 65, w: 24, h: 9, zIndex: 4, minFontSize: 14 },
    ],
  },
  'hero-overlay-center': {
    id: 'hero-overlay-center',
    label: 'Hero — centered overlay',
    overlayText: true,
    supportedFamilies: ['square', 'portrait', 'landscape'],
    slots: [
      { name: 'image', x: 0, y: 0, w: 100, h: 100, zIndex: 1 },
      { name: 'logo', x: 5, y: 4, w: 12, h: 5, zIndex: 5 },
      { name: 'badge', x: 80, y: 4, w: 15, h: 5, zIndex: 5 },
      {
        name: 'headline',
        x: 10,
        y: 30,
        w: 80,
        h: 24,
        zIndex: 3,
        minFontSize: 32,
        maxFontSize: 72,
        maxLines: 3,
      },
      {
        name: 'subtitle',
        x: 10,
        y: 58,
        w: 76,
        h: 12,
        zIndex: 3,
        minFontSize: 14,
        maxFontSize: 20,
        maxLines: 2,
      },
      { name: 'cta', x: 30, y: 74, w: 40, h: 9, zIndex: 4, minFontSize: 14 },
    ],
  },
}

export function selectArchetypeForFormat(
  format: FormatDefinition,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  profile: ContentProfile,
  _visualSystem: VisualSystemKey
): ArchetypeId {
  if (format.key === 'marketplace-card') return 'split-right-image'
  if (format.key === 'marketplace-highlight') return 'hero-overlay-bottom'
  if (format.key === 'marketplace-tile') return 'leaderboard-split'
  if (format.key === 'display-skyscraper' || format.key === 'display-halfpage') return 'skyscraper-stack'
  if (format.key === 'display-leaderboard' || format.key === 'display-billboard') return 'leaderboard-split'

  const family = format.family as string
  const hasImage = Boolean(imageAnalysis?.imageProfile)
  const textFirst = profile?.preferredMessageMode === 'text-first'

  if (family === 'portrait') {
    if (textFirst || !hasImage) return 'text-dominant'
    return 'hero-overlay-bottom'
  }
  if (family === 'square') {
    if (textFirst) return 'product-card-top'
    if (imageAnalysis?.mood === 'dark') return 'hero-overlay-bottom'
    return 'split-right-image'
  }
  if (family === 'landscape' || family === 'display-rectangle') {
    return 'leaderboard-split'
  }
  if (family === 'billboard') return 'leaderboard-split'
  if (family === 'display-skyscraper') return 'skyscraper-stack'

  return 'split-right-image'
}

function applySlotToElement(el: SceneElement, s: Slot): void {
  el.x = s.x
  el.y = s.y
  el.w = s.w
  if (s.h != null) el.h = s.h
}

export function buildSceneFromArchetypeV2(
  master: Scene,
  archetype: V2Archetype,
  brandKit: BrandKit,
  imageAnalysis: EnhancedImageAnalysis | undefined
): Scene {
  const scene: Scene = JSON.parse(JSON.stringify(master)) as Scene

  scene.title = safeSceneElement(scene.title)
  scene.title.text = scene.title.text ?? ''
  scene.title.fontSize = scene.title.fontSize ?? 40

  scene.subtitle = safeSceneElement(scene.subtitle)
  scene.subtitle.text = scene.subtitle.text ?? ''
  scene.subtitle.fontSize = scene.subtitle.fontSize ?? 16

  scene.cta = safeSceneElement(scene.cta)
  scene.cta.text = scene.cta.text ?? ''

  scene.logo = safeSceneElement(scene.logo)
  scene.badge = safeSceneElement(scene.badge)
  scene.badge.text = scene.badge.text ?? ''

  scene.image = safeSceneElement(scene.image)

  const slot = (name: SlotName) => archetype.slots.find((x) => x.name === name)

  const imgSlot = slot('image')
  if (imgSlot) {
    applySlotToElement(scene.image, imgSlot)
    if (imageAnalysis?.focalPoint) {
      scene.image.focalX = imageAnalysis.focalPoint.x
      scene.image.focalY = imageAnalysis.focalPoint.y
    }
  }

  const hlSlot = slot('headline')
  if (hlSlot) {
    applySlotToElement(scene.title, hlSlot)
    const masterFs = master.title?.fontSize ?? 32
    const subFs = master.subtitle?.fontSize ?? 16
    scene.title.fontSize = Math.max(
      hlSlot.minFontSize ?? 32,
      Math.min(hlSlot.maxFontSize ?? 64, masterFs)
    )
    if ((scene.title.fontSize ?? 32) < subFs * 2) {
      scene.title.fontSize = Math.round(subFs * 2.2)
    }
    scene.title.maxLines = hlSlot.maxLines ?? 3
    scene.title.weight = 700
    scene.title.fill = '#FFFFFF'
  }

  const subSlot = slot('subtitle')
  if (subSlot) {
    applySlotToElement(scene.subtitle, subSlot)
    const masterSubFs = master.subtitle?.fontSize ?? 16
    scene.subtitle.fontSize = Math.max(
      subSlot.minFontSize ?? 14,
      Math.min(subSlot.maxFontSize ?? 20, masterSubFs)
    )
    scene.subtitle.maxLines = subSlot.maxLines ?? 3
    scene.subtitle.opacity = 0.75
    scene.subtitle.fill = '#FFFFFF'
  }

  const ctaSlot = slot('cta')
  if (ctaSlot) {
    applySlotToElement(scene.cta, ctaSlot)
    scene.cta.fontSize = Math.max(ctaSlot.minFontSize ?? 14, 14)
    scene.cta.bg = brandKit?.accentColor || '#E11D48'
    scene.cta.fill = '#FFFFFF'
    const style = brandKit?.ctaStyle
    scene.cta.rx = style === 'pill' ? 26 : style === 'rounded' ? 14 : 4
  }

  const logoSlot = slot('logo')
  if (logoSlot) applySlotToElement(scene.logo, logoSlot)

  const badgeSlot = slot('badge')
  if (badgeSlot) {
    applySlotToElement(scene.badge, badgeSlot)
    scene.badge.bg = brandKit?.accentColor || '#E11D48'
    scene.badge.bgOpacity = 1
  }

  return scene
}

function hexLumV2(hex: string): number {
  const c = (hex || '#000').replace('#', '').padEnd(6, '0')
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function scoreDesignObjective(
  scene: Scene,
  archetype: V2Archetype,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  weights: ObjectiveWeights
): { score: number; objective: DesignObjective } {
  void imageAnalysis
  const tFs = scene.title?.fontSize ?? 32
  const sFs = scene.subtitle?.fontSize ?? 16
  const hierarchyClarity = Math.min(1, Math.max(0, (tFs / Math.max(sFs, 1) - 1) / 2.5))

  const imgX = scene.image?.x ?? 0
  const imgW = scene.image?.w ?? 0
  const txtX = scene.title?.x ?? 0
  const txtW = scene.title?.w ?? 30
  const imgCx = imgX + imgW / 2
  const txtCx = txtX + txtW / 2
  const separation = Math.abs(imgCx - txtCx) / 100
  const visualBalance = Math.min(1, separation * 2.5)

  const ctaArea = ((scene.cta?.w ?? 0) * (scene.cta?.h ?? 0)) / 10000
  const ctaVisibility = Math.min(1, ctaArea / 0.018)

  const imgArea = ((scene.image?.w ?? 0) * (scene.image?.h ?? 0)) / 10000
  const idealArea = archetype.overlayText ? 0.8 : 0.45
  const imageImpact = 1 - Math.min(1, Math.abs(imgArea - idealArea) / Math.max(idealArea, 0.01))

  const fill = scene.title?.fill || '#ffffff'
  const bgLum = hexLumV2(scene.background?.[1] || '#0f172a')
  const txtLum = hexLumV2(fill)
  const cr = (Math.max(bgLum, txtLum) + 0.05) / (Math.min(bgLum, txtLum) + 0.05)
  const readability = Math.min(1, (cr - 1) / 6)

  const titleBottom = (scene.title?.y ?? 0) + (tFs * (scene.title?.maxLines ?? 3)) / 8
  const ctaTop = scene.cta?.y ?? 80
  const gap = ctaTop - titleBottom
  const spacingQuality =
    gap >= 4 && gap <= 35 ? Math.max(0, 1 - Math.abs(gap - 15) / 20) : gap < 4 ? 0.1 : 0.5

  const objective: DesignObjective = {
    hierarchyClarity,
    visualBalance,
    ctaVisibility,
    imageImpact,
    readability,
    spacingQuality,
  }

  const score =
    weights.hierarchyClarity * hierarchyClarity +
    weights.visualBalance * visualBalance +
    weights.ctaVisibility * ctaVisibility +
    weights.imageImpact * imageImpact +
    weights.readability * readability +
    weights.spacingQuality * spacingQuality

  return { score, objective }
}

function getV2El(scene: Scene, name: SlotName): SceneElement | undefined {
  const map: Record<SlotName, SceneElement | undefined> = {
    headline: scene.title,
    subtitle: scene.subtitle,
    cta: scene.cta,
    logo: scene.logo,
    badge: scene.badge,
    image: scene.image,
  }
  return map[name]
}

export function checkV2Constraints(scene: Scene, archetype: V2Archetype): string[] {
  const violations: string[] = []
  const margin = 3

  for (const s of archetype.slots) {
    const el = getV2El(scene, s.name)
    if (!el) continue
    const x = el.x ?? 0
    const y = el.y ?? 0
    const w = el.w ?? 0
    const h = el.h ?? 0

    if (s.name !== 'image') {
      if (x < margin) violations.push(`${s.name}: left edge ${x} < ${margin}`)
      if (y < margin) violations.push(`${s.name}: top edge ${y} < ${margin}`)
      if (x + w > 100 - margin) violations.push(`${s.name}: right overflow ${x + w}`)
      if (y + h > 100 - margin) violations.push(`${s.name}: bottom overflow ${y + h}`)
    }
    if (s.minFontSize && (el.fontSize ?? 0) < s.minFontSize) {
      violations.push(`${s.name}: fontSize ${el.fontSize} < min ${s.minFontSize}`)
    }
    if (s.name === 'cta' && h < 6) violations.push(`cta too short: ${h}`)
    if (s.name === 'cta' && w < 16) violations.push(`cta too narrow: ${w}`)
  }

  return violations
}

const ADJUSTMENTS = [
  { el: 'headline' as const, field: 'y' as const, d: -2 },
  { el: 'headline' as const, field: 'y' as const, d: +2 },
  { el: 'headline' as const, field: 'fontSize' as const, d: +2 },
  { el: 'headline' as const, field: 'fontSize' as const, d: -2 },
  { el: 'cta' as const, field: 'y' as const, d: -2 },
  { el: 'cta' as const, field: 'y' as const, d: +2 },
  { el: 'cta' as const, field: 'w' as const, d: +2 },
  { el: 'subtitle' as const, field: 'y' as const, d: -2 },
  { el: 'subtitle' as const, field: 'y' as const, d: +2 },
  { el: 'subtitle' as const, field: 'fontSize' as const, d: -1 },
] as const

export function optimizeLayoutV2(
  initialScene: Scene,
  archetype: V2Archetype,
  imageAnalysis: EnhancedImageAnalysis | undefined,
  weights: ObjectiveWeights
): V2LayoutResult {
  let current: Scene = JSON.parse(JSON.stringify(initialScene)) as Scene
  let { score, objective } = scoreDesignObjective(current, archetype, imageAnalysis, weights)

  for (const adj of ADJUSTMENTS) {
    const candidate: Scene = JSON.parse(JSON.stringify(current)) as Scene
    const el = getV2El(candidate, adj.el)
    if (!el) continue

    const prev = (el[adj.field] as number | undefined) ?? 0
    el[adj.field] =
      adj.field === 'fontSize'
        ? Math.max(12, Math.min(72, prev + adj.d))
        : Math.max(2, Math.min(96, prev + adj.d))

    const newViolations = checkV2Constraints(candidate, archetype)
    const currentViolations = checkV2Constraints(current, archetype)
    if (newViolations.length > currentViolations.length) continue

    const { score: ns, objective: no } = scoreDesignObjective(candidate, archetype, imageAnalysis, weights)

    if (ns > score) {
      current = candidate
      score = ns
      objective = no
    }
  }

  return {
    scene: current,
    archetypeId: archetype.id,
    score,
    objective,
    constraintViolations: checkV2Constraints(current, archetype),
  }
}

export const DEFAULT_WEIGHTS_V2: ObjectiveWeights = {
  hierarchyClarity: 0.3,
  visualBalance: 0.25,
  ctaVisibility: 0.2,
  imageImpact: 0.15,
  readability: 0.05,
  spacingQuality: 0.05,
}

export function synthesizeLayoutV2(input: {
  master: Scene
  format: FormatDefinition
  profile: ContentProfile
  brandKit: BrandKit
  imageAnalysis?: EnhancedImageAnalysis
  visualSystem: VisualSystemKey
  weights?: ObjectiveWeights
}): V2LayoutResult {
  const archetypeId = selectArchetypeForFormat(
    input.format,
    input.imageAnalysis,
    input.profile,
    input.visualSystem
  )
  const archetype = ARCHETYPES[archetypeId]
  const weights = input.weights ?? DEFAULT_WEIGHTS_V2

  const initial = buildSceneFromArchetypeV2(input.master, archetype, input.brandKit, input.imageAnalysis)

  return optimizeLayoutV2(initial, archetype, input.imageAnalysis, weights)
}

function cloneV1<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function clampV1(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/** Mirrors `layoutEngine.reanchorCtaToCluster` (no-op for marketplace formats). */
function reanchorCtaToClusterAfterV2(scene: Scene, format: FormatDefinition): Scene {
  if (format.family !== 'square' && format.family !== 'portrait') return scene
  if (format.category === 'marketplace') return scene
  const subtitleBottom = (scene.subtitle.y || 0) + (scene.subtitle.h || 0)
  const ctaY = scene.cta.y || 0
  const ctaH = scene.cta.h || 6
  const subtitleRight = (scene.subtitle.x || 0) + (scene.subtitle.w || 0)
  if ((scene.cta.x || 0) > subtitleRight * 0.85) return scene
  if (ctaY - subtitleBottom <= 18) return scene
  const next = cloneV1(scene)
  const ruleSet = getFormatRuleSet(format)
  const safeMinY = (ruleSet.safeArea.y / format.height) * 100 + 1
  const safeMaxY = ((ruleSet.safeArea.y + ruleSet.safeArea.h) / format.height) * 100 - ctaH - 1
  next.cta.y = clampV1(subtitleBottom + 6, safeMinY, safeMaxY)
  return next
}

/** Mirrors `layoutEngine.adjustTextContrastForOverlay`. */
function adjustTextContrastForOverlayAfterV2(scene: Scene, imageAnalysis?: EnhancedImageAnalysis): Scene {
  if (!imageAnalysis?.mood || imageAnalysis.mood === 'neutral') return scene
  if ((scene.image.w || 0) < 74 && (scene.image.h || 0) < 64) return scene
  const next = cloneV1(scene)
  const titleIsLight = (next.title.fill || '#f8fafc') !== '#0f172a' && (next.title.fill || '#f8fafc') !== '#1e293b'
  const mismatch = (titleIsLight && imageAnalysis.mood === 'light') || (!titleIsLight && imageAnalysis.mood === 'dark')
  if (!mismatch) return scene
  if (imageAnalysis.mood === 'light') {
    next.title.fill = '#0f172a'
    next.subtitle.fill = '#1e293b'
  } else {
    next.title.fill = '#f8fafc'
    next.subtitle.fill = '#e2e8f0'
  }
  next.overlayStrength = Math.min((next.overlayStrength || 0.2) + 0.14, 0.4)
  return next
}

/**
 * Same order as `synthesizeLayout` post-pack: finalize → stabilize → reanchor → contrast.
 * `compositionModel: null` is valid (see marketplace branch in `synthesizeLayout`).
 */
export function applyV1LayoutGeometryAfterV2(
  scene: Scene,
  format: FormatDefinition,
  imageAnalysis?: EnhancedImageAnalysis
): Scene {
  let next = scene
  next = finalizeSceneGeometry(next, format, null)
  next = stabilizeMarketplaceLayout(next, format, null)
  next = reanchorCtaToClusterAfterV2(next, format)
  next = adjustTextContrastForOverlayAfterV2(next, imageAnalysis)
  return next
}
