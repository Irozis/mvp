import { splitTextIntoLines } from './utils'
import type { FormatDefinition, Rect, Scene, SceneElement, SceneTextGeometry, TextAnchorMode, TextLayoutBox, TextLayoutRole, TypographyRule } from './types'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function percentYFromPx(value: number, format: FormatDefinition) {
  return (value / format.height) * 100
}

type TextGeometryInput = {
  role: TextLayoutRole
  text?: string
  x: number
  y: number
  width: number
  fontSize: number
  lineHeight: number
  charsPerLine: number
  maxLines: number
  anchorMode?: TextAnchorMode
  measurementHint?: SceneElement['measurementHint']
}

function resolveTextMeasurement(input: {
  role: TextLayoutRole
  text?: string
  charsPerLine: number
  maxLines: number
  lineHeight: number
  measurementHint?: SceneElement['measurementHint']
}) {
  let charsPerLine = Math.max(input.charsPerLine, 1)
  let maxLines = Math.max(input.maxLines, 1)
  let lineHeight = input.lineHeight
  const text = (input.text || '').trim()

  if (input.role === 'subtitle' && input.measurementHint === 'proof-dense' && text.length) {
    charsPerLine = Math.max(charsPerLine - 2, 20)
    maxLines = Math.min(Math.max(maxLines, text.length >= 72 ? 4 : 3), 5)
    lineHeight = clamp(lineHeight - 0.02, 1.18, lineHeight)
  }

  return {
    charsPerLine,
    maxLines,
    lineHeight,
  }
}

/**
 * Authoritative text box model for the layout engine.
 *
 * The current renderer anchors headline/subtitle text by baseline, while most
 * layout logic wants a top-left rectangle for overlap/safe-area checks.
 * This helper is the single bridge between those semantics.
 */
export function computeTextBoxGeometry(input: TextGeometryInput, format: FormatDefinition): TextLayoutBox {
  const text = input.text || ''
  const measurement = resolveTextMeasurement({
    role: input.role,
    text,
    charsPerLine: input.charsPerLine,
    maxLines: input.maxLines,
    lineHeight: input.lineHeight,
    measurementHint: input.measurementHint,
  })
  const lines = splitTextIntoLines(text, measurement.charsPerLine, measurement.maxLines)
  const lineCount = Math.max(lines.length, text.trim() ? 1 : 0)
  const heightPx = lineCount > 0 ? input.fontSize * lineCount * measurement.lineHeight : 0
  const height = percentYFromPx(heightPx, format)
  const anchorMode = input.anchorMode || 'baseline-left'
  const top =
    anchorMode === 'baseline-left'
      ? input.y - percentYFromPx(input.fontSize, format)
      : anchorMode === 'center'
        ? input.y - height / 2
        : input.y
  const rect: Rect = {
    x: input.x,
    y: top,
    w: input.width,
    h: height,
  }

  return {
    role: input.role,
    text,
    lines,
    lineCount,
    x: input.x,
    y: input.y,
    w: input.width,
    h: height,
    top,
    baseline: anchorMode === 'baseline-left' ? input.y : top + percentYFromPx(input.fontSize, format),
    fontSize: input.fontSize,
    lineHeight: measurement.lineHeight,
    charsPerLine: measurement.charsPerLine,
    maxLines: measurement.maxLines,
    anchorMode,
    rect,
  }
}

/**
 * Convert an authoritative text box back into the persisted SceneElement shape.
 * This keeps baseline-based text placement consistent after collision repair or safe-area clamping.
 */
export function applyTextBoxToSceneElement(element: SceneElement, box: TextLayoutBox, format: FormatDefinition): SceneElement {
  return {
    ...element,
    x: box.x,
    y: box.anchorMode === 'baseline-left' ? box.baseline : box.top,
    w: box.w,
    fontSize: box.fontSize,
    charsPerLine: box.charsPerLine,
    maxLines: box.maxLines,
  }
}

type FitTextBoxInput = {
  role: TextLayoutRole
  text?: string
  x: number
  y: number
  width: number
  availableHeight?: number
  preferredFontSize: number
  preferredCharsPerLine: number
  preferredMaxLines: number
  minFontSize: number
  maxFontSize: number
  maxCharsPerLine?: number
  maxAllowedLines?: number
  lineHeight: number
  anchorMode?: TextAnchorMode
  measurementHint?: SceneElement['measurementHint']
}

/**
 * Deterministic fit loop used by synthesis and validation alike.
 * It stays heuristic, but every subsystem now reads the same fitted box.
 */
export function fitTextBoxWithinRegion(input: FitTextBoxInput, format: FormatDefinition): TextLayoutBox {
  let fontSize = clamp(Math.round(input.preferredFontSize), input.minFontSize, input.maxFontSize)
  let charsPerLine = Math.max(Math.round(input.preferredCharsPerLine), 1)
  let maxLines = Math.max(Math.round(input.preferredMaxLines), 1)
  const maxChars = Math.max(input.maxCharsPerLine || charsPerLine + 8, charsPerLine)
  const maxAllowedLines = Math.max(input.maxAllowedLines || maxLines, maxLines)

  let geometry = computeTextBoxGeometry({
    role: input.role,
    text: input.text,
    x: input.x,
    y: input.y,
    width: input.width,
    fontSize,
    lineHeight: input.lineHeight,
    charsPerLine,
    maxLines,
    anchorMode: input.anchorMode,
    measurementHint: input.measurementHint,
  }, format)

  const fitsHeight = () => input.availableHeight === undefined || geometry.h <= input.availableHeight + 0.25
  let guard = 0
  while (!fitsHeight() && guard < 32) {
    if (charsPerLine < maxChars) {
      charsPerLine += 1
    } else if (maxLines < maxAllowedLines) {
      maxLines += 1
    } else if (fontSize > input.minFontSize) {
      fontSize -= 1
    } else {
      break
    }
    geometry = computeTextBoxGeometry({
      role: input.role,
      text: input.text,
      x: input.x,
      y: input.y,
      width: input.width,
      fontSize,
      lineHeight: input.lineHeight,
      charsPerLine,
      maxLines,
      anchorMode: input.anchorMode,
      measurementHint: input.measurementHint,
    }, format)
    guard += 1
  }

  return geometry
}

function buildSceneTextBox(
  role: TextLayoutRole,
  element: SceneElement,
  format: FormatDefinition,
  lineHeight: number,
  fallbackFontSize: number,
  fallbackCharsPerLine: number,
  fallbackMaxLines: number
) {
  const text = element.text || ''
  return computeTextBoxGeometry({
    role,
    text,
    x: element.x || 0,
    y: element.y || 0,
    width: element.w || 0,
    fontSize: element.fontSize || fallbackFontSize,
    lineHeight,
    charsPerLine: element.charsPerLine || fallbackCharsPerLine,
    maxLines: element.maxLines || fallbackMaxLines,
    anchorMode: 'baseline-left',
    measurementHint: element.measurementHint,
  }, format)
}

export function buildSceneTextGeometry(scene: Scene, format: FormatDefinition): SceneTextGeometry {
  return {
    headline: buildSceneTextBox('headline', scene.title, format, 1.08, 32, 20, 3),
    subtitle: buildSceneTextBox('subtitle', scene.subtitle, format, 1.24, 16, 30, 4),
    body:
      (scene.subtitle.text || '').trim().length >= 80
        ? buildSceneTextBox('body', scene.subtitle, format, 1.24, 16, 30, 4)
        : undefined,
  }
}

export function clampTextBoxToRegion(box: TextLayoutBox, region: Rect, format: FormatDefinition): TextLayoutBox {
  const clampedX = clamp(box.x, region.x, region.x + region.w - box.w)
  const clampedTop = clamp(box.top, region.y, region.y + region.h - box.h)
  const y =
    box.anchorMode === 'baseline-left'
      ? clampedTop + percentYFromPx(box.fontSize, format)
      : box.anchorMode === 'center'
        ? clampedTop + box.h / 2
        : clampedTop

  return {
    ...box,
    x: clampedX,
    y,
    top: clampedTop,
    baseline: box.anchorMode === 'baseline-left' ? y : clampedTop + percentYFromPx(box.fontSize, format),
    rect: {
      x: clampedX,
      y: clampedTop,
      w: box.w,
      h: box.h,
    },
  }
}

export function fitSceneTextToRule(input: {
  role: TextLayoutRole
  text?: string
  x: number
  y: number
  width: number
  availableHeight?: number
  format: FormatDefinition
  rule: TypographyRule
  preferredFontSize: number
  preferredCharsPerLine: number
  preferredMaxLines: number
  lineHeight: number
  anchorMode?: TextAnchorMode
  measurementHint?: SceneElement['measurementHint']
}) {
  return fitTextBoxWithinRegion({
    role: input.role,
    text: input.text,
    x: input.x,
    y: input.y,
    width: input.width,
    availableHeight: input.availableHeight,
    preferredFontSize: input.preferredFontSize,
    preferredCharsPerLine: input.preferredCharsPerLine,
    preferredMaxLines: input.preferredMaxLines,
    minFontSize: input.rule.minFontSize,
    maxFontSize: input.rule.maxFontSize,
    maxAllowedLines: input.rule.maxLines,
    lineHeight: input.lineHeight,
    anchorMode: input.anchorMode,
    measurementHint: input.measurementHint,
  }, input.format)
}
