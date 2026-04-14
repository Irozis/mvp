import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Download, FileText, Image as ImageIcon, Sparkles } from 'lucide-react'
import { percentX, percentY, rgba, splitTextIntoLines } from '../lib/utils'
import { getFormatRuleSet } from '../lib/formatRules'
import type { BrandKit, FixResult, FormatDefinition, LayoutAssessment, LayoutDebugOptions, LayoutElementKind, Scene } from '../lib/types'

/** True when subtitle should render in full-bleed highlight (non-empty, not generic placeholder). */
function hasRenderableSubtitle(text: string | undefined): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  return !/^subtitle$/i.test(t)
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5
}

/** Normalize to `#rrggbb` for luminance helpers; returns null if not parseable. */
function normalizeHex6(color: string): string | null {
  const raw = color.trim()
  if (!raw.startsWith('#')) return null
  if (raw.length === 4 && /^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
  }
  if (raw.length === 7 && /^#[0-9a-fA-F]{6}$/.test(raw)) return raw
  return null
}

/** Title / subtitle / CTA text on Pattern A left panel: extreme dark/light backgrounds get fixed fills. */
function patternALeftPanelTextFill(hexBg: string): string | undefined {
  const hex = normalizeHex6(hexBg)
  if (!hex) return undefined
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  const lightByMidpoint = isLightColor(hex)
  if (luminance < 0.3) return '#ffffff'
  if (luminance > 0.7 && lightByMidpoint) return '#1a1a1a'
  return undefined
}

function SvgText({
  text,
  x,
  y,
  fontSize,
  fill,
  weight,
  maxCharsPerLine,
  maxLines,
  fontFamily,
  lineHeight = 1.1,
  opacity = 1,
  textAnchor = 'start',
  letterSpacing,
  dataRole,
}: {
  text: string
  x: number
  y: number
  fontSize: number
  fill: string
  weight: number
  maxCharsPerLine: number
  maxLines: number
  fontFamily: string
  lineHeight?: number
  opacity?: number
  textAnchor?: 'start' | 'middle' | 'end'
  letterSpacing?: string | number
  dataRole?: string
}) {
  const lines = splitTextIntoLines(text, maxCharsPerLine, maxLines)

  return (
    <text data-role={dataRole} x={x} y={y} textAnchor={textAnchor} fill={fill} opacity={opacity} fontSize={fontSize} fontWeight={weight} fontFamily={fontFamily} letterSpacing={letterSpacing}>
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 0 : fontSize * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

function layoutCardPatternA(scene: Scene, width: number, height: number) {
  const pad = 40
  const leftW = width * 0.44
  const title = scene.title.text || ''
  let titleFs = title.length > 15 ? Math.max(64, width * 0.07) : Math.max(80, width * 0.09)
  const leftPanelHeight = height
  if (titleFs * 3 > leftPanelHeight * 0.6) {
    titleFs *= 0.8
  }
  const leftPanelInner = leftW - pad * 2
  if (title.length > 0) {
    const maxFsByCharWidth = leftPanelInner / (title.length * 0.55)
    if (titleFs > maxFsByCharWidth) titleFs = maxFsByCharWidth
  }
  titleFs = Math.max(48, Math.min(titleFs, leftPanelInner / 5))
  const subFs = Math.max(20, width * 0.018)
  const ctaMinW = Math.max(140, (scene.cta.text || '').length * 9 + 56)
  const ctaH = Math.max(percentY(scene.cta.h || 7, height), 48)
  const ctaW = Math.min(Math.max(percentX(scene.cta.w || 28, leftW), ctaMinW), leftW - pad * 2)
  const titleLines = splitTextIntoLines(scene.title.text || '', scene.title.charsPerLine || 16, scene.title.maxLines || 3)
  const subLines = splitTextIntoLines(scene.subtitle.text || '', scene.subtitle.charsPerLine || 34, scene.subtitle.maxLines || 4)
  const titleLH = titleFs * 1.08
  const subLH = subFs * 1.3
  const n = titleLines.length
  const m = subLines.length
  const hasSub = hasRenderableSubtitle(scene.subtitle.text) && m > 0
  const titleBlockH = n * titleLH

  let totalTextH: number
  if (hasSub) {
    totalTextH = titleFs + titleBlockH + 43 + (m - 1) * subLH + subFs + ctaH
  } else {
    totalTextH = titleFs + titleBlockH + 16 + ctaH
  }

  const clusterTop = (height - totalTextH) / 2
  const titleY = clusterTop + titleFs
  const accentLineY = titleY + (titleLines.length - 1) * titleLH + 8

  let subY: number
  let ctaY: number
  if (hasSub) {
    subY = accentLineY + 3 + 16 + subFs * 0.88
    ctaY = clusterTop + totalTextH - ctaH
  } else {
    subY = titleY + titleBlockH + 16 + subFs
    ctaY = clusterTop + totalTextH - ctaH
  }

  return {
    pad,
    leftW,
    titleX: pad,
    titleY,
    titleFs,
    titleLH,
    accentLineY,
    subX: pad,
    subY,
    subFs,
    subLH,
    ctaX: pad,
    ctaY,
    ctaW,
    ctaH,
  }
}

function layoutCardPatternC(scene: Scene, width: number, height: number) {
  const pad = 48
  const titleFs = Math.min(Math.max(height * 0.12, 56), height * 0.22)
  const subFs = Math.min(scene.subtitle.fontSize || 20, 24)
  const ctaMinW = Math.max(140, (scene.cta.text || '').length * 9 + 56)
  const ctaH = Math.max(percentY(scene.cta.h || 7, height), 48)
  const ctaW = Math.max(percentX(scene.cta.w || 24, width), ctaMinW)
  const titleLines = splitTextIntoLines(scene.title.text || '', scene.title.charsPerLine || 14, 3)
  const subLines = splitTextIntoLines(scene.subtitle.text || '', scene.subtitle.charsPerLine || 36, scene.subtitle.maxLines || 3)
  const titleLH = titleFs * 1.05
  const subLH = subFs * 1.32
  const topChrome = 96
  return {
    pad,
    titleX: pad,
    titleY: pad + topChrome + titleFs * 0.86,
    titleFs,
    titleLH,
    subX: pad,
    subY: pad + topChrome + titleLines.length * titleLH + 24,
    subFs,
    subLH,
    ctaX: pad,
    ctaY: height - pad - ctaH,
    ctaW,
    ctaH,
    imageBoxW: width * 0.35,
    imageBoxH: Math.min(height * 0.38, width * 0.34),
    subLines,
  }
}

function layoutHighlightPatternB(scene: Scene, width: number, height: number) {
  const padX = 36
  const titleFs = Math.max(scene.title.fontSize || 40, 36)
  const subFs = Math.max(20, width * 0.018)
  const ctaMinW = Math.max(140, (scene.cta.text || '').length * 9 + 56)
  const ctaH = Math.max(percentY(scene.cta.h || 6.5, height), 48)
  const ctaW = Math.min(Math.max(percentX(scene.cta.w || 28, width), ctaMinW), width - padX * 2)
  const titleLines = splitTextIntoLines(scene.title.text || '', scene.title.charsPerLine || 18, scene.title.maxLines || 3)
  const subLines = splitTextIntoLines(scene.subtitle.text || '', scene.subtitle.charsPerLine || 34, scene.subtitle.maxLines || 3)
  const titleLH = titleFs * 1.06
  const subLH = subFs * 1.3
  const contentTop = height * 0.65
  const titleY = contentTop + titleFs * 0.85
  return {
    padX,
    titleX: width / 2,
    titleY,
    titleFs,
    titleLH,
    subX: width / 2,
    subY: titleY + (titleLines.length - 1) * titleLH + 16 + subFs,
    subFs,
    subLH,
    ctaX: width / 2 - ctaW / 2,
    ctaY: height - 36 - ctaH,
    ctaW,
    ctaH,
  }
}

function layoutHighlightPatternA(scene: Scene, width: number, height: number) {
  const splitY = height * 0.55
  const pad = 36
  const titleFs = Math.max(scene.title.fontSize || 34, 30)
  const subFs = scene.subtitle.fontSize || 16
  const ctaMinW = Math.max(140, (scene.cta.text || '').length * 9 + 56)
  const ctaH = Math.max(percentY(scene.cta.h || 6.5, height), 48)
  const ctaW = Math.min(Math.max(percentX(scene.cta.w || 28, width), ctaMinW), width - pad * 2)
  const titleLines = splitTextIntoLines(scene.title.text || '', scene.title.charsPerLine || 20, scene.title.maxLines || 3)
  const subLines = splitTextIntoLines(scene.subtitle.text || '', scene.subtitle.charsPerLine || 36, scene.subtitle.maxLines || 4)
  const titleLH = titleFs * 1.08
  const subLH = subFs * 1.3
  const bottomH = height - splitY
  const stackH = titleLines.length * titleLH + (subLines.length ? 16 : 0) + subLines.length * subLH + 16 + ctaH
  const top = splitY + (bottomH - stackH) / 2
  return {
    splitY,
    /** Height of the top image panel (same as splitY). */
    imageH: splitY,
    pad,
    titleX: pad,
    titleY: top + titleFs * 0.86,
    titleFs,
    titleLH,
    subX: pad,
    subY: top + titleLines.length * titleLH + 16 + subFs,
    subFs,
    subLH,
    ctaX: pad,
    ctaY: top + titleLines.length * titleLH + (subLines.length ? 16 : 0) + subLines.length * subLH + 16,
    ctaW,
    ctaH,
  }
}

function wrapImageZoom(
  bounds: { x: number; y: number; w: number; h: number },
  zoom: number | undefined,
  node: ReactElement,
) {
  const z = zoom ?? 1
  if (!Number.isFinite(z) || z <= 1) return node
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  return <g transform={`translate(${cx} ${cy}) scale(${z}) translate(${-cx} ${-cy})`}>{node}</g>
}

/** SVG preserveAspectRatio alignment (before ` slice`) from focal point and format family. */
function focalSliceAlign(format: FormatDefinition, focalX: number, focalY: number): string {
  if (format.family === 'square') {
    if (focalX < 35) return 'xMinYMid'
    if (focalX > 65) return 'xMaxYMid'
    return 'xMidYMid'
  }
  if (format.family === 'portrait') {
    if (focalY < 40) return 'xMidYMin'
    if (focalY > 60) return 'xMidYMax'
    return 'xMidYMid'
  }
  return 'xMidYMid'
}

function renderImage(
  imageUrl: string,
  bounds: { x: number; y: number; w: number; h: number },
  scene: Scene,
  format: FormatDefinition,
  imageDims: { w: number; h: number } | null,
  clipPathId?: string,
) {
  const focalX = scene.image.focalX ?? 50
  const focalY = scene.image.focalY ?? 50
  const align = focalSliceAlign(format, focalX, focalY)
  const wantsMeet = (scene.image.fit || '').endsWith('meet')
  const fallbackPreserveAspectRatio = wantsMeet ? (scene.image.fit || `${align} meet`) : `${align} slice`
  const clipPath = clipPathId ? `url(#${clipPathId})` : undefined
  const zoom = scene.image.imageZoom ?? 1
  if (!wantsMeet && imageDims && imageDims.w > 0 && imageDims.h > 0) {
    const scale = Math.max(bounds.w / imageDims.w, bounds.h / imageDims.h) * zoom
    const scaledW = imageDims.w * scale
    const scaledH = imageDims.h * scale
    const desiredX = bounds.x + bounds.w / 2 - (focalX / 100) * scaledW
    const desiredY = bounds.y + bounds.h / 2 - (focalY / 100) * scaledH
    const imgX = Math.min(Math.max(desiredX, bounds.x + bounds.w - scaledW), bounds.x)
    const imgY = Math.min(Math.max(desiredY, bounds.y + bounds.h - scaledH), bounds.y)
    return <image href={imageUrl} x={imgX} y={imgY} width={scaledW} height={scaledH} preserveAspectRatio={`${align} slice`} clipPath={clipPath} />
  }
  const img = (
    <image href={imageUrl} x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} preserveAspectRatio={fallbackPreserveAspectRatio} clipPath={clipPath} />
  )
  return wrapImageZoom(bounds, zoom > 1 ? zoom : undefined, img)
}

export function CanvasPreview({
  format,
  scene,
  brandKit,
  assessment,
  imageUrl,
  logoUrl,
  previewRef,
  onFixLayout,
  onTryDifferentLayout,
  isFixing,
  isExporting,
  fixResult,
  aiReviewed,
  onExportPng,
  onExportJpg,
  onExportPdf,
  debugOptions,
  selectedBlockId,
  editable,
  showSafeArea,
  onSelectBlock,
  onPatchBlock,
  /** Effective layout archetype for diagnostics (e2e reads `data-archetype-id` on `.preview-wrap`). */
  previewArchetypeId,
}: {
  format: FormatDefinition
  scene: Scene
  brandKit: BrandKit
  assessment: LayoutAssessment
  imageUrl: string
  logoUrl: string
  previewRef: (node: HTMLDivElement | null) => void
  onFixLayout: () => void
  onTryDifferentLayout: () => void
  isFixing?: boolean
  isExporting?: boolean
  fixResult?: FixResult | null
  aiReviewed?: boolean
  onExportPng: () => void
  onExportJpg: () => void
  onExportPdf: () => void
  debugOptions?: LayoutDebugOptions
  selectedBlockId?: LayoutElementKind | null
  editable?: boolean
  showSafeArea?: boolean
  onSelectBlock?: (blockId: LayoutElementKind | null) => void
  onPatchBlock?: (blockId: LayoutElementKind, patch: { x?: number; y?: number; w?: number; h?: number }) => void
  previewArchetypeId?: string
}) {
  const { width, height } = format
  const gradientId = `grad-${format.key}`
  const glowId = `glow-${format.key}`
  const clipId = `clip-${format.key}`
  const textPanelId = `text-panel-${format.key}`
  const vignetteId = `vignette-${format.key}`

  const image = {
    x: percentX(scene.image.x, width),
    y: percentY(scene.image.y, height),
    w: percentX(scene.image.w || 0, width),
    h: percentY(scene.image.h || 0, height),
  }

  const titleX = percentX(scene.title.x, width)
  const titleY = percentY(scene.title.y, height)
  const subtitleX = percentX(scene.subtitle.x, width)
  const subtitleY = percentY(scene.subtitle.y, height)
  const ctaX = percentX(scene.cta.x, width)
  const ctaY = percentY(scene.cta.y, height)
  const ctaW = percentX(scene.cta.w || 0, width)
  const ctaH = percentY(scene.cta.h || 0, height)
  const badgeX = percentX(scene.badge.x, width)
  const badgeY = percentY(scene.badge.y, height)
  const badgeW = percentX(scene.badge.w || 0, width)
  const badgeH = percentY(scene.badge.h || 0, height)
  const logoX = percentX(scene.logo.x, width)
  const logoY = percentY(scene.logo.y, height)
  const logoW = percentX(scene.logo.w || 0, width)
  const logoH = percentY(scene.logo.h || 0, height)
  const immersiveImage = (scene.image.w || 0) >= 78 || (scene.image.h || 0) >= 70
  const needsVignette =
    immersiveImage || format.family === 'portrait' || (scene.image.h || 0) >= 55
  // Determine panel base color: must contrast with the text fill to ensure readability on any image
  const titleFill = scene.title.fill || '#f8fafc'
  const titleIsLight = titleFill !== '#0f172a' && titleFill !== '#1e293b'
  const panelBase = titleIsLight ? '#050d1a' : '#f0f4f8'
  const overlayStr = scene.overlayStrength ?? 0.20
  const panelOpacityTop = immersiveImage ? Math.min(0.62 + overlayStr * 1.4, 0.88) : 0.14
  const panelOpacityBottom = immersiveImage ? Math.min(0.28 + overlayStr, 0.56) : 0.08
  const textPanelX = Math.max(titleX - 28, 22)
  const textPanelY = Math.max(titleY - (scene.title.fontSize || 32) * 1.05, 18)
  const textPanelW = Math.min(Math.max(percentX(Math.max(scene.title.w || 0, scene.subtitle.w || 0, scene.cta.w || 0) + 8, width), ctaX + ctaW - textPanelX + 24), width - textPanelX - 22)
  const textPanelH = Math.min(ctaY + ctaH - textPanelY + 30, height - textPanelY - 18)
  const textPanelRx = Math.min(26, Math.max(textPanelW / 2 - 2, 4))

  const topIssues = assessment.issues.slice(0, 3)
  const shownScore = fixResult?.effectiveAfterScore ?? assessment.score
  const confidence =
    fixResult?.scoreTrust.needsHumanAttention ? 'low' :
    (fixResult?.scoreTrust.disagreement || 0) >= 10 ? 'medium' :
    'high'
  const severityLabel = shownScore < 50 ? 'poor' : shownScore < 65 ? 'weak' : shownScore < 80 ? 'acceptable' : shownScore < 90 ? 'strong' : shownScore < 97 ? 'production-ready' : 'exceptional'
  const formatFamily = assessment.formatFamily || format.family
  const hasRemainingWork = (fixResult?.remainingIssues.length || 0) > 0 || (fixResult?.scoreTrust.needsHumanAttention ?? false)
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!imageUrl) { setImageDims(null); return }
    const img = new window.Image()
    img.onload = () => setImageDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = imageUrl
  }, [imageUrl])

  const [logoDims, setLogoDims] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!logoUrl) { setLogoDims(null); return }
    const img = new window.Image()
    img.onload = () => setLogoDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = logoUrl
  }, [logoUrl])

  // Adjust logo container width to match the logo's actual aspect ratio
  const logoAspect = logoDims && logoDims.h > 0 ? logoDims.w / logoDims.h : 2.8
  const adjustedLogoW = Math.min(Math.max(logoH * logoAspect, logoH), logoW * 1.5)
  const isMarketplaceCard = format.key === 'marketplace-card'
  const isMarketplaceHighlight = format.key === 'marketplace-highlight'
  const useCardPatternA = isMarketplaceCard && Boolean(imageUrl)
  const useCardPatternC = isMarketplaceCard && !imageUrl
  const useHighlightAltPatternA = isMarketplaceHighlight && Boolean(imageUrl) && assessment.compositionModelId === 'portrait-bottom-card'
  const useHighlightPatternB = isMarketplaceHighlight && Boolean(imageUrl) && !useHighlightAltPatternA
  const badgeText = scene.badge?.text ?? ''
  const showBadge = Boolean(badgeText) && !['Campaign', 'Badge', 'Label', 'Tag'].includes(badgeText)
  const cardA = useCardPatternA ? layoutCardPatternA(scene, width, height) : null
  const cardC = useCardPatternC ? layoutCardPatternC(scene, width, height) : null
  const highlightB = useHighlightPatternB ? layoutHighlightPatternB(scene, width, height) : null
  const highlightA = useHighlightAltPatternA ? layoutHighlightPatternA(scene, width, height) : null
  const useProPatterns = useCardPatternA || useCardPatternC || useHighlightPatternB || useHighlightAltPatternA
  const ctaFontSize = 16
  const fallbackCtaW = Math.max(ctaW, Math.max(140, (scene.cta.text || '').length * 9 + 56))
  const fallbackCtaH = Math.max(ctaH, 48)
  const ctaBg = scene.cta.bg || scene.accent || '#ffffff'
  const parseHexColor = (color: string) => {
    const hex = color.trim()
    const expanded = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
    if (!/^#[0-9a-fA-F]{6}$/.test(expanded)) return null
    return {
      r: parseInt(expanded.slice(1, 3), 16),
      g: parseInt(expanded.slice(3, 5), 16),
      b: parseInt(expanded.slice(5, 7), 16),
    }
  }
  const getRelativeLuminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const toLinear = (value: number) => {
      const channel = value / 255
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    }
    const lr = toLinear(r)
    const lg = toLinear(g)
    const lb = toLinear(b)
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
  }
  const ctaFillAuto = (() => {
    const parsed = parseHexColor(ctaBg)
    if (!parsed) return scene.cta.fill || '#ffffff'
    return getRelativeLuminance(parsed) < 0.5 ? '#ffffff' : '#0f172a'
  })()
  const highlightPatternBCtaBg = (() => {
    const bg = scene.cta.bg?.trim()
    if (bg && bg.toLowerCase() !== '#000000') return bg
    return scene.accent || '#ff6b35'
  })()
  const highlightPatternBCtaFill = (() => {
    const parsed = parseHexColor(highlightPatternBCtaBg)
    if (!parsed) return scene.cta.fill || '#ffffff'
    return getRelativeLuminance(parsed) < 0.5 ? '#ffffff' : '#0f172a'
  })()
  /** Mirrors `EnhancedImageAnalysis.focalPoint` once copied onto `scene.image` by layout / analysis. */
  const focalX = scene.image.focalX ?? 50
  const focalY = scene.image.focalY ?? 50
  const patternASplitPreserveAspect = `${focalSliceAlign(format, focalX, focalY)} slice`

  const leftPanelBg = useCardPatternA ? '#1A1F2E' : scene.background[0] || '#1a1a1a'
  const patternALeftAutoText = patternALeftPanelTextFill(leftPanelBg)
  const patternATitleFill = patternALeftAutoText ?? scene.title.fill ?? '#0f172a'
  const patternASubtitleFill = patternALeftAutoText ?? scene.subtitle.fill ?? '#0f172a'
  const patternACtaTextFill = patternALeftAutoText ?? scene.cta.fill ?? ctaFillAuto

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragState = useRef<{
    blockId: LayoutElementKind
    mode: 'move' | 'resize'
    startX: number
    startY: number
    origin: { x: number; y: number; w: number; h: number }
  } | null>(null)
  const boxes = assessment.layoutBoxes?.boxes || []
  const collisionIds = new Set(
    (debugOptions?.showCollisions ? (assessment.collisions || []).flatMap((collision) => [collision.a, collision.b]) : []).concat(
      debugOptions?.showCollisions ? (assessment.spacingViolations || []).flatMap((violation) => [violation.a, violation.b]) : []
    )
  )
  const safeArea = useMemo(() => {
    const ruleSet = getFormatRuleSet(format)
    return {
      x: ruleSet.safeArea.x,
      y: ruleSet.safeArea.y,
      w: ruleSet.safeArea.w,
      h: ruleSet.safeArea.h,
    }
  }, [format])

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const bounds = svg.getBoundingClientRect()
    return {
      x: ((clientX - bounds.left) / bounds.width) * width,
      y: ((clientY - bounds.top) / bounds.height) * height,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState.current || !onPatchBlock) return
    const point = toSvgPoint(event.clientX, event.clientY)
    if (!point) return
    const dxPercent = ((point.x - dragState.current.startX) / width) * 100
    const dyPercent = ((point.y - dragState.current.startY) / height) * 100
    if (dragState.current.mode === 'move') {
      onPatchBlock(dragState.current.blockId, {
        x: dragState.current.origin.x + dxPercent,
        y: dragState.current.origin.y + dyPercent,
      })
      return
    }
    onPatchBlock(dragState.current.blockId, {
      w: Math.max(dragState.current.origin.w + dxPercent, 4),
      h: Math.max(dragState.current.origin.h + dyPercent, 3),
    })
  }

  const endPointerInteraction = () => {
    dragState.current = null
  }

  return (
    <div className="preview-wrap" data-format-key={format.key} data-archetype-id={previewArchetypeId ?? undefined}>
      <div className="space-between preview-head">
        <div>
          <div className="preview-title">{format.label}</div>
          <div className="muted">{format.name} | {format.category}</div>
          <div className="muted">Format family: <strong>{formatFamily}</strong></div>
          {assessment.structuralState && <div className="muted">Structural state: <strong>{assessment.structuralState.status}</strong></div>}
          {assessment.visual && <div className="muted">Visual quality: <strong>{assessment.visual.overallScore}/100 | {assessment.visual.band}</strong></div>}
        </div>
        <div className={`score-pill score-${shownScore >= 97 ? 'excellent' : shownScore >= 80 ? 'good' : shownScore >= 65 ? 'fair' : 'weak'}`}>
          {shownScore}/100 | {severityLabel}
        </div>
      </div>

      <div className="preview-toolbar">
        <button className="button" onClick={onFixLayout} disabled={isFixing}>
          <Sparkles size={16} />
          {isFixing ? 'Fixing...' : fixResult?.canFixAgain ? 'Fix again' : 'Fix layout'}
        </button>
        {fixResult?.canFixAgain && (
          <button className="button button-outline" onClick={onTryDifferentLayout} disabled={isFixing}>
            Try different layout
          </button>
        )}
        <button className="button button-outline" onClick={onExportPng} disabled={isExporting}>
          <Download size={16} />
          {isExporting ? '...' : 'PNG'}
        </button>
        <button className="button button-outline" onClick={onExportJpg} disabled={isExporting}>
          <ImageIcon size={16} />
          {isExporting ? '...' : 'JPG'}
        </button>
        <button className="button button-outline" onClick={onExportPdf} disabled={isExporting}>
          <FileText size={16} />
          {isExporting ? '...' : 'PDF'}
        </button>
      </div>

      <div className="stack">
        <div className="muted">Quality: <strong>{severityLabel}</strong></div>
        <div className="muted">Confidence: <strong>{confidence}</strong></div>
        {assessment.visual?.warnings[0] ? (
          <div className="muted">Visual note: <strong>{assessment.visual.warnings[0]}</strong></div>
        ) : null}
        {topIssues.map((issue) => (
          <div key={issue.code} className={`alert ${issue.severity === 'high' ? 'error' : issue.severity === 'medium' ? 'warning' : 'ok'}`}>
            {issue.message}
          </div>
        ))}
        {fixResult && (
          <div className="panel">
            <div className="section-title">What changed</div>
            <div className="muted">Score: {fixResult.beforeScore} {'->'} {fixResult.afterScore}</div>
            <div className="muted">Effective: {fixResult.effectiveBeforeScore} {'->'} {fixResult.effectiveAfterScore}</div>
            <div className="muted">Confidence: {confidence}</div>
            {fixResult.actionsApplied.slice(0, 4).map((action) => (
              <div key={action} className="hint">{action}</div>
            ))}
            {fixResult.remainingIssues.length > 0 && <div className="hint">Still weak: {fixResult.remainingIssues.slice(0, 3).join(', ')}</div>}
            {!fixResult.canFixAgain && !hasRemainingWork && <div className="hint">Layout stabilized.</div>}
          </div>
        )}
      </div>

      {aiReviewed ? (
        <span className="ai-reviewed-badge">✓ AI reviewed</span>
      ) : null}

      <div ref={previewRef} className="preview-card">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`preview-svg ${editable ? 'preview-svg-editable' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerInteraction}
          onPointerLeave={endPointerInteraction}
          onPointerDown={() => {
            if (!editable) return
            onSelectBlock?.(null)
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={scene.background[0]} />
              <stop offset="55%" stopColor={scene.background[1]} />
              <stop offset="100%" stopColor={scene.background[2]} />
            </linearGradient>
            <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={scene.accent} stopOpacity="0.26" />
              <stop offset="100%" stopColor={scene.accent} stopOpacity="0" />
            </radialGradient>
            <linearGradient id={textPanelId} x1="0" y1="0" x2="0.92" y2="1">
              <stop offset="0%" stopColor={rgba(panelBase, panelOpacityTop)} />
              <stop offset="100%" stopColor={rgba(panelBase, panelOpacityBottom)} />
            </linearGradient>
            <linearGradient id={vignetteId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="45%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.72)" />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x={image.x} y={image.y} width={image.w} height={image.h} rx={scene.image.rx || 28} ry={scene.image.rx || 28} />
            </clipPath>
            <clipPath id={`${clipId}-right-half`}>
              <rect
                x={useCardPatternA && cardA ? cardA.leftW : width * 0.5}
                y={0}
                width={useCardPatternA && cardA ? width - cardA.leftW : width * 0.5}
                height={height}
              />
            </clipPath>
            <clipPath id={`${clipId}-top-split`}>
              <rect x={0} y={0} width={width} height={height * 0.55} />
            </clipPath>
            <linearGradient id={`${gradientId}-highlight-overlay`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="40%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.75)" />
            </linearGradient>
          </defs>

          {useCardPatternA && cardA ? (
            <g>
              {format.key === 'marketplace-card' && imageUrl && (
                <rect x={0} y={0} width={width * 0.44} height={height} rx={0} fill="#1A1F2E" opacity={0.97} />
              )}
              <g data-role="image" clipPath={`url(#${clipId}-right-half)`}>
                <rect x={cardA.leftW} y={0} width={width - cardA.leftW} height={height} fill="white" />
                {wrapImageZoom(
                  { x: cardA.leftW, y: 0, w: width - cardA.leftW, h: height },
                  scene.image.imageZoom && scene.image.imageZoom > 1 ? scene.image.imageZoom : undefined,
                  <image
                    href={imageUrl}
                    x={cardA.leftW}
                    y={0}
                    width={width - cardA.leftW}
                    height={height}
                    preserveAspectRatio={
                      scene.image.imageZoom && scene.image.imageZoom > 1
                        ? `${focalSliceAlign(format, focalX, focalY)} slice`
                        : patternASplitPreserveAspect
                    }
                  />,
                )}
              </g>
              {showBadge ? (
                <g data-role="badge">
                  <rect x={cardA.leftW - badgeW - cardA.pad} y={cardA.pad} width={badgeW} height={badgeH} rx={20} fill={rgba(scene.badge.bg || '#fff', scene.badge.bgOpacity ?? 0.2)} stroke="rgba(15,23,42,0.1)" />
                  <text x={cardA.leftW - badgeW / 2 - cardA.pad} y={cardA.pad + badgeH / 2 + 6} textAnchor="middle" fill={scene.badge.fill || '#0f172a'} fontSize={scene.badge.fontSize || 16} fontWeight="700" fontFamily={brandKit.fontFamily}>{scene.badge.text}</text>
                </g>
              ) : null}
              <SvgText dataRole="headline" text={scene.title.text || ''} x={cardA.titleX} y={cardA.titleY} fontSize={cardA.titleFs} fill={patternATitleFill} weight={scene.title.weight || 700} maxCharsPerLine={scene.title.charsPerLine || 16} maxLines={scene.title.maxLines || 3} lineHeight={cardA.titleLH / cardA.titleFs} fontFamily={brandKit.fontFamily} letterSpacing={cardA.titleFs > 60 ? -0.5 : undefined} />
              {hasRenderableSubtitle(scene.subtitle.text) ? (
                <rect x={cardA.pad} y={cardA.accentLineY} width={40} height={3} rx={1.5} fill={scene.accent || scene.cta.bg} />
              ) : null}
              <SvgText dataRole="subtitle" text={scene.subtitle.text || ''} x={cardA.subX} y={cardA.subY} fontSize={cardA.subFs} fill={patternASubtitleFill} weight={500} maxCharsPerLine={scene.subtitle.charsPerLine || 34} maxLines={scene.subtitle.maxLines || 4} lineHeight={cardA.subLH / cardA.subFs} opacity={0.88} fontFamily={brandKit.fontFamily} letterSpacing={0.3} />
              <g data-role="cta">
                <rect x={cardA.ctaX} y={cardA.ctaY} width={cardA.ctaW} height={cardA.ctaH} rx={999} fill={scene.accent} />
                <text x={cardA.ctaX + cardA.ctaW / 2} y={cardA.ctaY + cardA.ctaH / 2 + 6} textAnchor="middle" fill={patternACtaTextFill} fontSize={15} fontWeight="700" letterSpacing={0.8} fontFamily={brandKit.fontFamily}>{(scene.cta.text || '').toUpperCase()}</text>
              </g>
            </g>
          ) : null}

          {useCardPatternC && cardC ? (
            <g>
              <rect x={0} y={0} width={width} height={height} fill={scene.background[0]} />
              <SvgText dataRole="headline" text={scene.title.text || ''} x={cardC.titleX} y={cardC.titleY} fontSize={cardC.titleFs} fill={scene.title.fill || '#0f172a'} weight={scene.title.weight || 800} maxCharsPerLine={scene.title.charsPerLine || 14} maxLines={3} lineHeight={cardC.titleLH / cardC.titleFs} fontFamily={brandKit.fontFamily} letterSpacing={cardC.titleFs > 60 ? -0.5 : undefined} />
              <SvgText dataRole="subtitle" text={scene.subtitle.text || ''} x={cardC.subX} y={cardC.subY} fontSize={cardC.subFs} fill={scene.subtitle.fill || '#0f172a'} weight={scene.subtitle.weight || 400} maxCharsPerLine={scene.subtitle.charsPerLine || 36} maxLines={scene.subtitle.maxLines || 3} lineHeight={cardC.subLH / cardC.subFs} opacity={0.6} fontFamily={brandKit.fontFamily} />
              <g data-role="cta">
                <rect x={cardC.ctaX} y={cardC.ctaY} width={cardC.ctaW} height={cardC.ctaH} rx={999} fill={scene.accent} />
                <text x={cardC.ctaX + cardC.ctaW / 2} y={cardC.ctaY + cardC.ctaH / 2 + 6} textAnchor="middle" fill={ctaFillAuto} fontSize={15} fontWeight="700" letterSpacing={0.8} fontFamily={brandKit.fontFamily}>{(scene.cta.text || '').toUpperCase()}</text>
              </g>
              <rect x={width - cardC.imageBoxW - cardC.pad} y={height - cardC.imageBoxH - cardC.pad} width={cardC.imageBoxW} height={cardC.imageBoxH} rx={22} fill="rgba(255,255,255,0.12)" stroke="rgba(15,23,42,0.14)" />
              <text x={width - cardC.imageBoxW / 2 - cardC.pad} y={height - cardC.imageBoxH / 2 - cardC.pad + 5} textAnchor="middle" fill="rgba(15,23,42,0.5)" fontSize={17} fontFamily={brandKit.fontFamily}>Add main image</text>
              {showBadge ? (
                <g data-role="badge">
                  <rect x={width - badgeW - cardC.pad} y={cardC.pad} width={badgeW} height={badgeH} rx={20} fill={rgba(scene.badge.bg || '#fff', scene.badge.bgOpacity ?? 0.2)} stroke="rgba(15,23,42,0.1)" />
                  <text x={width - badgeW / 2 - cardC.pad} y={cardC.pad + badgeH / 2 + 6} textAnchor="middle" fill={scene.badge.fill || '#0f172a'} fontSize={scene.badge.fontSize || 16} fontWeight="700" fontFamily={brandKit.fontFamily}>{scene.badge.text}</text>
                </g>
              ) : null}
            </g>
          ) : null}

          {useHighlightPatternB && highlightB ? (
            <g>
              <rect x={0} y={0} width={width} height={height} fill="white" />
              <g data-role="image">{renderImage(imageUrl, { x: 0, y: 0, w: width, h: height }, scene, format, imageDims)}</g>
              <rect x={0} y={0} width={width} height={height} fill={`url(#${gradientId}-highlight-overlay)`} />
              {showBadge ? (
                <g>
                  <rect x={width - badgeW - highlightB.padX} y={highlightB.padX} width={badgeW} height={badgeH} rx={20} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.25)" />
                  <text x={width - badgeW / 2 - highlightB.padX} y={highlightB.padX + badgeH / 2 + 6} textAnchor="middle" fill="#fff" fontSize={scene.badge.fontSize || 16} fontWeight="700" fontFamily={brandKit.fontFamily}>{scene.badge.text}</text>
                </g>
              ) : null}
              <SvgText dataRole="headline" text={scene.title.text || ''} x={highlightB.titleX} y={highlightB.titleY} fontSize={highlightB.titleFs} fill="#fff" weight={scene.title.weight || 700} maxCharsPerLine={scene.title.charsPerLine || 18} maxLines={scene.title.maxLines || 3} lineHeight={highlightB.titleLH / highlightB.titleFs} textAnchor="middle" fontFamily={brandKit.fontFamily} letterSpacing={highlightB.titleFs > 60 ? -0.5 : undefined} />
              {hasRenderableSubtitle(scene.subtitle.text) ? (
                <SvgText dataRole="subtitle" text={scene.subtitle.text || ''} x={highlightB.subX} y={highlightB.subY} fontSize={highlightB.subFs} fill="#fff" weight={500} maxCharsPerLine={scene.subtitle.charsPerLine || 34} maxLines={scene.subtitle.maxLines || 3} lineHeight={highlightB.subLH / highlightB.subFs} opacity={0.88} textAnchor="middle" fontFamily={brandKit.fontFamily} letterSpacing={0.3} />
              ) : null}
              <g data-role="cta">
                <rect x={highlightB.ctaX} y={highlightB.ctaY} width={highlightB.ctaW} height={highlightB.ctaH} rx={999} fill={highlightPatternBCtaBg} stroke="#fff" strokeWidth={2} />
                <text x={highlightB.ctaX + highlightB.ctaW / 2} y={highlightB.ctaY + highlightB.ctaH / 2 + 6} textAnchor="middle" fill={highlightPatternBCtaFill} fontSize={15} fontWeight="700" letterSpacing={0.8} fontFamily={brandKit.fontFamily}>{(scene.cta.text || '').toUpperCase()}</text>
              </g>
            </g>
          ) : null}

          {useHighlightAltPatternA && highlightA ? (
            <g>
              <rect x={0} y={0} width={width} height={highlightA.imageH} fill="white" />
              <g data-role="image">{renderImage(imageUrl, { x: 0, y: 0, w: width, h: highlightA.splitY }, scene, format, imageDims, `${clipId}-top-split`)}</g>
              <rect x={0} y={highlightA.splitY} width={width} height={height - highlightA.splitY} fill={scene.background[0]} />
              {showBadge ? (
                <g data-role="badge">
                  <rect x={width - badgeW - highlightA.pad} y={highlightA.pad} width={badgeW} height={badgeH} rx={20} fill={rgba(scene.badge.bg || '#fff', scene.badge.bgOpacity ?? 0.2)} stroke="rgba(15,23,42,0.1)" />
                  <text x={width - badgeW / 2 - highlightA.pad} y={highlightA.pad + badgeH / 2 + 6} textAnchor="middle" fill={scene.badge.fill || '#0f172a'} fontSize={scene.badge.fontSize || 16} fontWeight="700" fontFamily={brandKit.fontFamily}>{scene.badge.text}</text>
                </g>
              ) : null}
              <SvgText dataRole="headline" text={scene.title.text || ''} x={highlightA.titleX} y={highlightA.titleY} fontSize={highlightA.titleFs} fill={scene.title.fill || '#0f172a'} weight={scene.title.weight || 700} maxCharsPerLine={scene.title.charsPerLine || 20} maxLines={scene.title.maxLines || 3} lineHeight={highlightA.titleLH / highlightA.titleFs} fontFamily={brandKit.fontFamily} letterSpacing={highlightA.titleFs > 60 ? -0.5 : undefined} />
              <SvgText dataRole="subtitle" text={scene.subtitle.text || ''} x={highlightA.subX} y={highlightA.subY} fontSize={highlightA.subFs} fill={scene.subtitle.fill || '#0f172a'} weight={scene.subtitle.weight || 400} maxCharsPerLine={scene.subtitle.charsPerLine || 36} maxLines={scene.subtitle.maxLines || 4} lineHeight={highlightA.subLH / highlightA.subFs} opacity={0.6} fontFamily={brandKit.fontFamily} />
              <g data-role="cta">
                <rect x={highlightA.ctaX} y={highlightA.ctaY} width={highlightA.ctaW} height={highlightA.ctaH} rx={999} fill={scene.accent} />
                <text x={highlightA.ctaX + highlightA.ctaW / 2} y={highlightA.ctaY + highlightA.ctaH / 2 + 6} textAnchor="middle" fill={ctaFillAuto} fontSize={15} fontWeight="700" letterSpacing={0.8} fontFamily={brandKit.fontFamily}>{(scene.cta.text || '').toUpperCase()}</text>
              </g>
            </g>
          ) : null}

          {!useProPatterns ? (
            <g>
              <rect x="0" y="0" width={width} height={height} rx="36" fill={`url(#${gradientId})`} />
              <circle cx={width * 0.78} cy={height * 0.16} r={Math.min(width, height) * 0.18} fill={`url(#${glowId})`} />

              {imageUrl ? (
                <g data-role="image">
                  {(() => {
                    const align = focalSliceAlign(format, focalX, focalY)
                    const wantsMeet = (scene.image.fit || '').endsWith('meet')
                    const fallbackPreserveAspectRatio = wantsMeet ? (scene.image.fit || `${align} meet`) : `${align} slice`
                    if (!wantsMeet && imageDims && imageDims.w > 0 && imageDims.h > 0) {
                      const zoom = scene.image.imageZoom ?? 1
                      const scale = Math.max(image.w / imageDims.w, image.h / imageDims.h) * zoom
                      const scaledW = imageDims.w * scale
                      const scaledH = imageDims.h * scale
                      const desiredX = image.x + image.w / 2 - (focalX / 100) * scaledW
                      const desiredY = image.y + image.h / 2 - (focalY / 100) * scaledH
                      const imgX = Math.min(Math.max(desiredX, image.x + image.w - scaledW), image.x)
                      const imgY = Math.min(Math.max(desiredY, image.y + image.h - scaledH), image.y)
                      return <image href={imageUrl} x={imgX} y={imgY} width={scaledW} height={scaledH} clipPath={`url(#${clipId})`} />
                    }
                    const b = { x: image.x, y: image.y, w: image.w, h: image.h }
                    const z = scene.image.imageZoom ?? 1
                    return wrapImageZoom(
                      b,
                      z > 1 ? z : undefined,
                      <image
                        href={imageUrl}
                        x={image.x}
                        y={image.y}
                        width={image.w}
                        height={image.h}
                        preserveAspectRatio={fallbackPreserveAspectRatio}
                        clipPath={`url(#${clipId})`}
                      />,
                    )
                  })()}
                  {needsVignette && (
                    <rect x={image.x} y={image.y} width={image.w} height={image.h} rx={scene.image.rx || 28} fill={`url(#${vignetteId})`} />
                  )}
                  {(() => {
                    const titleOverImage =
                      (scene.title.y || 0) > (scene.image.y || 0) &&
                      (scene.title.y || 0) < (scene.image.y || 0) + (scene.image.h || 0)
                    if (!titleOverImage || !imageUrl) return null
                    const scrimId = `scrim-${format.key}`
                    const scrimY = Math.max(titleY - 24, image.y)
                    const scrimH = Math.min(ctaY + ctaH - scrimY + 32, image.y + image.h - scrimY)
                    return (
                      <g>
                        <defs>
                          <linearGradient id={scrimId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                            <stop offset="30%" stopColor="rgba(0,0,0,0.52)" />
                            <stop offset="100%" stopColor="rgba(0,0,0,0.72)" />
                          </linearGradient>
                        </defs>
                        <rect x={image.x} y={scrimY} width={image.w} height={scrimH} rx={0} fill={`url(#${scrimId})`} />
                      </g>
                    )
                  })()}
                  {imageUrl &&
                    immersiveImage &&
                    assessment?.visual &&
                    (() => {
                      const f = (scene.title.fill || '').toUpperCase()
                      return f === '#0F172A' || f === '#1C1917'
                    })() && (
                      <rect
                        x={image.x}
                        y={image.y}
                        width={image.w}
                        height={image.h}
                        rx={scene.image.rx || 28}
                        fill="rgba(0,0,0,0.18)"
                      />
                    )}
                  <rect
                    x={image.x}
                    y={image.y}
                    width={image.w}
                    height={image.h}
                    rx={scene.image.rx || 28}
                    fill="none"
                    stroke={scene.image.strokeColor || 'rgba(255,255,255,0.2)'}
                  />
                </g>
              ) : (
                <g>
                  <rect x={image.x} y={image.y} width={image.w} height={image.h} rx={scene.image.rx || 28} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.24)" />
                  <text x={image.x + image.w / 2} y={image.y + image.h / 2} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="18" fontFamily={brandKit.fontFamily}>
                    Add main image
                  </text>
                </g>
              )}

              {immersiveImage && (
                <rect
                  x={textPanelX}
                  y={textPanelY}
                  width={textPanelW}
                  height={textPanelH}
                  rx={textPanelRx}
                  ry={textPanelRx}
                  fill={`url(#${textPanelId})`}
                  stroke="rgba(255,255,255,0.12)"
                />
              )}

              {logoUrl ? (
                <g data-role="logo">
                  <rect x={logoX} y={logoY} width={adjustedLogoW} height={logoH} rx="14" fill={rgba(scene.logo.bg || '#ffffff', scene.logo.bgOpacity ?? 0.08)} stroke="rgba(255,255,255,0.2)" />
                  <image href={logoUrl} x={logoX + 8} y={logoY + 6} width={adjustedLogoW - 16} height={logoH - 12} preserveAspectRatio="xMidYMid meet" />
                </g>
              ) : null}

              {showBadge ? (
                <g data-role="badge">
                  <rect x={badgeX} y={badgeY} width={badgeW} height={badgeH} rx="20" fill={rgba(scene.badge.bg || '#fff', scene.badge.bgOpacity ?? 0.08)} stroke="rgba(255,255,255,0.24)" />
                  <text x={badgeX + badgeW / 2} y={badgeY + badgeH / 2 + 6} textAnchor="middle" fill={scene.badge.fill || '#fff'} fontSize={scene.badge.fontSize || 16} fontWeight="700" fontFamily={brandKit.fontFamily}>
                    {scene.badge.text}
                  </text>
                </g>
              ) : null}

              <SvgText dataRole="headline" text={scene.title.text || ''} x={titleX} y={titleY} fontSize={scene.title.fontSize || 32} fill={scene.title.fill || '#fff'} weight={scene.title.weight || 700} maxCharsPerLine={scene.title.charsPerLine || 20} maxLines={scene.title.maxLines || 3} fontFamily={brandKit.fontFamily} letterSpacing={(scene.title.fontSize || 32) > 60 ? -0.5 : undefined} />
              <SvgText dataRole="subtitle" text={scene.subtitle.text || ''} x={subtitleX} y={subtitleY} fontSize={scene.subtitle.fontSize || 16} fill={scene.subtitle.fill || '#fff'} weight={scene.subtitle.weight || 400} maxCharsPerLine={scene.subtitle.charsPerLine || 30} maxLines={scene.subtitle.maxLines || 4} lineHeight={1.28} opacity={scene.subtitle.opacity ?? 0.88} fontFamily={brandKit.fontFamily} />

              <g data-role="cta">
                <rect x={ctaX} y={ctaY} width={fallbackCtaW} height={fallbackCtaH} rx={scene.cta.rx || 26} fill={scene.cta.bg || '#fff'} />
                <text x={ctaX + fallbackCtaW / 2} y={ctaY + fallbackCtaH / 2 + 6} textAnchor="middle" fill={ctaFillAuto} fontSize={ctaFontSize} fontWeight="700" fontFamily={brandKit.fontFamily}>
                  {scene.cta.text}
                </text>
              </g>
            </g>
          ) : null}

          {editable && showSafeArea && (
            <g>
              <rect
                x={safeArea.x}
                y={safeArea.y}
                width={safeArea.w}
                height={safeArea.h}
                fill="none"
                stroke="rgba(14,116,144,0.8)"
                strokeWidth={2}
                strokeDasharray="10 8"
              />
            </g>
          )}

          {debugOptions?.showBoxes && (
            <g>
              {(assessment.compositionZones || []).map((zone) => (
                <g key={`zone-${zone.id}`}>
                  <rect
                    x={zone.rect.x}
                    y={zone.rect.y}
                    width={zone.rect.w}
                    height={zone.rect.h}
                    fill="rgba(14,116,144,0.04)"
                    stroke="rgba(14,116,144,0.42)"
                    strokeWidth={1.5}
                    strokeDasharray="6 6"
                  />
                  {debugOptions.showBoxLabels && (
                    <g>
                      <rect x={zone.rect.x} y={Math.max(zone.rect.y - 16, 2)} width={Math.max(zone.id.length * 6 + 12, 56)} height={14} rx={7} fill="rgba(14,116,144,0.82)" />
                      <text x={zone.rect.x + 6} y={Math.max(zone.rect.y - 6, 12)} fill="#fff" fontSize="9" fontWeight="700" fontFamily={brandKit.fontFamily}>
                        {zone.id}
                      </text>
                    </g>
                  )}
                </g>
              ))}
              {boxes.map((box) => {
                const boxX = percentX(box.rect.x, width)
                const boxY = percentY(box.rect.y, height)
                const boxW = percentX(box.rect.w, width)
                const boxH = percentY(box.rect.h, height)
                const isConflict = collisionIds.has(box.id)
                return (
                  <g key={box.id}>
                    <rect
                      x={boxX}
                      y={boxY}
                      width={boxW}
                      height={boxH}
                      fill={isConflict ? 'rgba(255,0,0,0.14)' : 'rgba(255,0,0,0.06)'}
                      stroke={isConflict ? 'rgba(255,0,0,0.96)' : 'rgba(255,64,64,0.8)'}
                      strokeWidth={isConflict ? 3 : 2}
                      strokeDasharray={isConflict ? '0' : '8 6'}
                    />
                    {debugOptions.showBoxLabels && (
                      <g>
                        <rect x={boxX} y={Math.max(boxY - 18, 2)} width={Math.max(box.kind.length * 7 + 14, 56)} height={16} rx={8} fill={isConflict ? 'rgba(255,0,0,0.9)' : 'rgba(127,29,29,0.82)'} />
                        <text x={boxX + 8} y={Math.max(boxY - 6, 14)} fill="#fff" fontSize="10" fontWeight="700" fontFamily={brandKit.fontFamily}>
                          {box.kind}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
              {debugOptions.showCollisions &&
                assessment.issues
                  .filter((issue) => issue.code === 'box-collision' || issue.code === 'insufficient-gap' || issue.code === 'out-of-bounds' || issue.code === 'outside-safe-area')
                  .slice(0, 4)
                  .map((issue, index) => (
                    <g key={`${issue.code}-${index}`}>
                      <rect x={16} y={height - 24 - index * 20} width={Math.min(width - 32, Math.max(issue.message.length * 6 + 18, 140))} height={16} rx={8} fill={issue.code === 'box-collision' ? 'rgba(220,38,38,0.92)' : 'rgba(127,29,29,0.84)'} />
                      <text x={24} y={height - 13 - index * 20} fill="#fff" fontSize="10" fontWeight="700" fontFamily={brandKit.fontFamily}>
                        {issue.message}
                      </text>
                    </g>
                  ))}
            </g>
          )}

          {editable && (
            <g>
              {boxes.map((box) => {
                const boxX = percentX(box.rect.x, width)
                const boxY = percentY(box.rect.y, height)
                const boxW = percentX(box.rect.w, width)
                const boxH = percentY(box.rect.h, height)
                const selected = selectedBlockId === box.kind
                return (
                  <g key={`editor-${box.id}`}>
                    <rect
                      x={boxX}
                      y={boxY}
                      width={boxW}
                      height={boxH}
                      fill="transparent"
                      stroke={selected ? 'rgba(14,116,144,0.95)' : 'transparent'}
                      strokeWidth={selected ? 3 : 1}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        onSelectBlock?.(box.kind)
                        const point = toSvgPoint(event.clientX, event.clientY)
                        if (!point) return
                        dragState.current = {
                          blockId: box.kind,
                          mode: 'move',
                          startX: point.x,
                          startY: point.y,
                          origin: { ...box.rect },
                        }
                      }}
                    />
                    {selected && (box.kind === 'image' || box.kind === 'headline' || box.kind === 'subtitle' || box.kind === 'cta' || box.kind === 'badge' || box.kind === 'logo') && (
                      <rect
                        x={boxX + boxW - 10}
                        y={boxY + boxH - 10}
                        width={10}
                        height={10}
                        rx={4}
                        fill="rgba(14,116,144,0.95)"
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          const point = toSvgPoint(event.clientX, event.clientY)
                          if (!point) return
                          dragState.current = {
                            blockId: box.kind,
                            mode: 'resize',
                            startX: point.x,
                            startY: point.y,
                            origin: { ...box.rect },
                          }
                        }}
                      />
                    )}
                  </g>
                )
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
