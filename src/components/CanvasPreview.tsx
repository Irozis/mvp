import { useMemo, useRef } from 'react'
import { Download, FileText, Image as ImageIcon, Sparkles } from 'lucide-react'
import { percentX, percentY, rgba, splitTextIntoLines } from '../lib/utils'
import { getFormatRuleSet } from '../lib/formatRules'
import type { BrandKit, FixResult, FormatDefinition, LayoutAssessment, LayoutDebugOptions, LayoutElementKind, Scene } from '../lib/types'

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
}) {
  const lines = splitTextIntoLines(text, maxCharsPerLine, maxLines)

  return (
    <text x={x} y={y} fill={fill} opacity={opacity} fontSize={fontSize} fontWeight={weight} fontFamily={fontFamily}>
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 0 : fontSize * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  )
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
  fixResult,
  onExportPng,
  onExportJpg,
  onExportPdf,
  debugOptions,
  selectedBlockId,
  editable,
  showSafeArea,
  onSelectBlock,
  onPatchBlock,
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
  fixResult?: FixResult | null
  onExportPng: () => void
  onExportJpg: () => void
  onExportPdf: () => void
  debugOptions?: LayoutDebugOptions
  selectedBlockId?: LayoutElementKind | null
  editable?: boolean
  showSafeArea?: boolean
  onSelectBlock?: (blockId: LayoutElementKind | null) => void
  onPatchBlock?: (blockId: LayoutElementKind, patch: { x?: number; y?: number; w?: number; h?: number }) => void
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
  const textPanelX = Math.max(titleX - 28, 22)
  const textPanelY = Math.max(titleY - (scene.title.fontSize || 32) * 1.05, 18)
  const textPanelW = Math.min(Math.max(percentX(Math.max(scene.title.w || 0, scene.subtitle.w || 0, scene.cta.w || 0) + 8, width), ctaX + ctaW - textPanelX + 24), width - textPanelX - 22)
  const textPanelH = Math.min(ctaY + ctaH - textPanelY + 30, height - textPanelY - 18)

  const topIssues = assessment.issues.slice(0, 3)
  const shownScore = fixResult?.effectiveAfterScore ?? assessment.score
  const confidence =
    fixResult?.scoreTrust.needsHumanAttention ? 'low' :
    (fixResult?.scoreTrust.disagreement || 0) >= 10 ? 'medium' :
    'high'
  const severityLabel = shownScore < 50 ? 'poor' : shownScore < 65 ? 'weak' : shownScore < 80 ? 'acceptable' : shownScore < 90 ? 'strong' : shownScore < 97 ? 'production-ready' : 'exceptional'
  const formatFamily = assessment.formatFamily || format.family
  const hasRemainingWork = (fixResult?.remainingIssues.length || 0) > 0 || (fixResult?.scoreTrust.needsHumanAttention ?? false)
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
    <div className="preview-wrap">
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
        <button className="button button-outline" onClick={onExportPng}>
          <Download size={16} />
          PNG
        </button>
        <button className="button button-outline" onClick={onExportJpg}>
          <ImageIcon size={16} />
          JPG
        </button>
        <button className="button button-outline" onClick={onExportPdf}>
          <FileText size={16} />
          PDF
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
              <stop offset="0%" stopColor={rgba(scene.background[0], immersiveImage ? 0.82 : 0.16)} />
              <stop offset="100%" stopColor={rgba(scene.background[1], immersiveImage ? 0.48 : 0.1)} />
            </linearGradient>
            <linearGradient id={vignetteId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(15,23,42,0)" />
              <stop offset="100%" stopColor="rgba(15,23,42,0.34)" />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x={image.x} y={image.y} width={image.w} height={image.h} rx={scene.image.rx || 28} ry={scene.image.rx || 28} />
            </clipPath>
          </defs>

          <rect x="0" y="0" width={width} height={height} rx="36" fill={`url(#${gradientId})`} />
          <circle cx={width * 0.78} cy={height * 0.16} r={Math.min(width, height) * 0.18} fill={`url(#${glowId})`} />

          {imageUrl ? (
            <g>
              <image
                href={imageUrl}
                x={image.x}
                y={image.y}
                width={image.w}
                height={image.h}
                preserveAspectRatio={scene.image.fit || 'xMidYMid slice'}
                clipPath={`url(#${clipId})`}
              />
              {immersiveImage && <rect x={image.x} y={image.y} width={image.w} height={image.h} rx={scene.image.rx || 28} fill={`url(#${vignetteId})`} />}
              <rect x={image.x} y={image.y} width={image.w} height={image.h} rx={scene.image.rx || 28} fill="none" stroke="rgba(255,255,255,0.2)" />
            </g>
          ) : (
            <g>
              <rect x={image.x} y={image.y} width={image.w} height={image.h} rx={scene.image.rx || 28} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.24)" />
              <text x={image.x + image.w / 2} y={image.y + image.h / 2} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="18" fontFamily={brandKit.fontFamily}>
                Add main image
              </text>
            </g>
          )}

          {immersiveImage && <rect x={textPanelX} y={textPanelY} width={textPanelW} height={textPanelH} rx="26" fill={`url(#${textPanelId})`} stroke="rgba(255,255,255,0.12)" />}

          <rect x={logoX} y={logoY} width={logoW} height={logoH} rx="14" fill={rgba(scene.logo.bg || '#ffffff', scene.logo.bgOpacity ?? 0.08)} stroke="rgba(255,255,255,0.2)" />
          {logoUrl ? (
            <image href={logoUrl} x={logoX + 8} y={logoY + 6} width={logoW - 16} height={logoH - 12} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <text x={logoX + logoW / 2} y={logoY + logoH / 2 + 4} textAnchor="middle" fill={scene.logo.fill || '#fff'} fontSize="12" fontWeight="600" fontFamily={brandKit.fontFamily}>
              LOGO
            </text>
          )}

          <rect x={badgeX} y={badgeY} width={badgeW} height={badgeH} rx="20" fill={rgba(scene.badge.bg || '#fff', scene.badge.bgOpacity ?? 0.08)} stroke="rgba(255,255,255,0.24)" />
          <text x={badgeX + badgeW / 2} y={badgeY + badgeH / 2 + 6} textAnchor="middle" fill={scene.badge.fill || '#fff'} fontSize={scene.badge.fontSize || 16} fontWeight="700" fontFamily={brandKit.fontFamily}>
            {scene.badge.text}
          </text>

          <SvgText text={scene.title.text || ''} x={titleX} y={titleY} fontSize={scene.title.fontSize || 32} fill={scene.title.fill || '#fff'} weight={scene.title.weight || 700} maxCharsPerLine={scene.title.charsPerLine || 20} maxLines={scene.title.maxLines || 3} fontFamily={brandKit.fontFamily} />
          <SvgText text={scene.subtitle.text || ''} x={subtitleX} y={subtitleY} fontSize={scene.subtitle.fontSize || 16} fill={scene.subtitle.fill || '#fff'} weight={scene.subtitle.weight || 400} maxCharsPerLine={scene.subtitle.charsPerLine || 30} maxLines={scene.subtitle.maxLines || 4} lineHeight={1.28} opacity={scene.subtitle.opacity ?? 0.88} fontFamily={brandKit.fontFamily} />

          <rect x={ctaX} y={ctaY} width={ctaW} height={ctaH} rx={scene.cta.rx || 26} fill={scene.cta.bg || '#fff'} />
          <text x={ctaX + ctaW / 2} y={ctaY + ctaH / 2 + 6} textAnchor="middle" fill={scene.cta.fill || '#0f172a'} fontSize={scene.cta.fontSize || 16} fontWeight="700" fontFamily={brandKit.fontFamily}>
            {scene.cta.text}
          </text>

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
