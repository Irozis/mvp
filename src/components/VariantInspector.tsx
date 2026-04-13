import { useMemo } from 'react'
import { getFormatRuleSet } from '../lib/formatRules'
import type {
  FormatDefinition,
  LayoutAssessment,
  LayoutElementKind,
  LayoutEvaluation,
  LayoutIntentFamily,
  ManualBlockOverride,
  Scene,
  Variant,
  VariantManualOverride,
  SessionTelemetry,
} from '../lib/types'

type BlockAnalysisLike = {
  score: number
  issues: string[]
  suggestedFixes: string[]
  metrics: Record<string, number>
}

const BLOCK_LABELS: Record<LayoutElementKind, string> = {
  headline: 'Headline',
  subtitle: 'Subtitle',
  body: 'Body',
  cta: 'CTA',
  logo: 'Logo',
  image: 'Image',
  badge: 'Badge',
  price: 'Price',
}

function formatMetricLabel(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/-/g, ' ').replace(/^./, (match) => match.toUpperCase())
}

function Range({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="field">
      <div className="space-between small">
        <label className="label">{label}</label>
        <span>{Math.round(value * 10) / 10}</span>
      </div>
      <input type="range" min={min} max={max} step="0.5" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  )
}

function getBlockAnalysis(assessment: LayoutAssessment, blockId: LayoutElementKind | null | undefined): BlockAnalysisLike | null {
  if (!blockId) return null
  const blocks = assessment.layoutAnalysis?.blocks
  if (!blocks) return null
  if (blockId === 'headline') return blocks.headline || null
  if (blockId === 'subtitle') return blocks.subtitle || null
  if (blockId === 'body') return blocks.body || null
  if (blockId === 'badge') return blocks.badge || null
  if (blockId === 'price') return blocks.price || null
  if (blockId === 'cta') return blocks.cta || null
  if (blockId === 'logo') return blocks.logo || null
  if (blockId === 'image') return blocks.image || null
  return null
}

export function VariantInspector({
  format,
  scene,
  assessment,
  selectedBlockId,
  manualOverride,
  onSelectBlock,
  onPatchBlock,
  onResetBlock,
  onResetVariant,
  onSelectImageRole,
  onApplyLayoutFamily,
  archetypeResolution,
  layoutEvaluation,
  sessionTelemetry,
  onResetTelemetry,
}: {
  format: FormatDefinition
  scene: Scene
  assessment: LayoutAssessment
  selectedBlockId?: LayoutElementKind | null
  manualOverride?: VariantManualOverride
  archetypeResolution?: Variant['archetypeResolution']
  layoutEvaluation?: LayoutEvaluation
  sessionTelemetry?: SessionTelemetry | null
  onResetTelemetry?: () => void
  onSelectBlock: (blockId: LayoutElementKind) => void
  onPatchBlock: (blockId: LayoutElementKind, patch: Partial<ManualBlockOverride>) => void
  onResetBlock: (blockId: LayoutElementKind) => void
  onResetVariant: () => void
  onSelectImageRole: (role: VariantManualOverride['imageRolePreset']) => void
  onApplyLayoutFamily: (family: LayoutIntentFamily) => void
}) {
  const ruleSet = useMemo(() => getFormatRuleSet(format), [format])
  const availableBlocks = useMemo(
    () =>
      Array.from(new Set((assessment.layoutBoxes?.boxes || []).map((box) => box.kind))).filter(
        (kind): kind is LayoutElementKind => Boolean(kind)
      ),
    [assessment.layoutBoxes]
  )
  const selectedBox = (assessment.layoutBoxes?.boxes || []).find((box) => box.kind === selectedBlockId) || null
  const selectedAnalysis = getBlockAnalysis(assessment, selectedBlockId)

  const effectiveArchetypeId = archetypeResolution
    ? archetypeResolution.effectiveArchetypeId ?? archetypeResolution.archetypeId
    : undefined
  const originalArchetypeId = archetypeResolution?.archetypeId
  const showFallbackUsed =
    archetypeResolution &&
    originalArchetypeId != null &&
    effectiveArchetypeId != null &&
    effectiveArchetypeId !== originalArchetypeId
  const confidenceBarColor =
    archetypeResolution == null
      ? '#e5e7eb'
      : archetypeResolution.confidence >= 0.8
        ? '#16a34a'
        : archetypeResolution.confidence >= 0.65
          ? '#d97706'
          : '#dc2626'

  return (
    <div className="panel stack">
      <div className="space-between">
        <div>
          <div className="section-title">Manual polish</div>
          <div className="hint">Edits stay inside format rules and are revalidated before preview.</div>
        </div>
        <button className="button button-outline" onClick={onResetVariant}>
          Reset variant polish
        </button>
      </div>

      <div className="inspector-chip-grid">
        {availableBlocks.map((kind) => (
          <button key={kind} className={`pack-chip ${selectedBlockId === kind ? 'active' : ''}`} onClick={() => onSelectBlock(kind)}>
            <span>{BLOCK_LABELS[kind]}</span>
          </button>
        ))}
      </div>

      {selectedBlockId && selectedBox && (
        <div className="panel stack inspector-panel">
          <div className="space-between">
            <div className="section-title">{BLOCK_LABELS[selectedBlockId]} geometry</div>
            <button className="button button-outline" onClick={() => onResetBlock(selectedBlockId)}>
              Reset block
            </button>
          </div>
          <div className="inspector-metrics">
            <Range label="X" value={selectedBox.rect.x} min={0} max={100} onChange={(value) => onPatchBlock(selectedBlockId, { x: value })} />
            <Range label="Y" value={selectedBox.rect.y} min={0} max={100} onChange={(value) => onPatchBlock(selectedBlockId, { y: value })} />
            <Range label="Width" value={selectedBox.rect.w} min={4} max={96} onChange={(value) => onPatchBlock(selectedBlockId, { w: value })} />
            <Range label="Height" value={selectedBox.rect.h} min={3} max={96} onChange={(value) => onPatchBlock(selectedBlockId, { h: value })} />
          </div>

          {(selectedBlockId === 'headline' || selectedBlockId === 'subtitle' || selectedBlockId === 'badge') && (
            <div className="inspector-metrics">
              <Range
                label="Font size"
                value={
                  selectedBlockId === 'headline'
                    ? scene.title.fontSize || 24
                    : selectedBlockId === 'subtitle'
                      ? scene.subtitle.fontSize || 14
                      : scene.badge.fontSize || 12
                }
                min={10}
                max={96}
                onChange={(value) => onPatchBlock(selectedBlockId, { fontSize: value })}
              />
              <Range
                label="Chars/line"
                value={selectedBlockId === 'headline' ? scene.title.charsPerLine || 20 : selectedBlockId === 'subtitle' ? scene.subtitle.charsPerLine || 28 : 20}
                min={8}
                max={42}
                onChange={(value) => onPatchBlock(selectedBlockId, { charsPerLine: value })}
              />
              <Range
                label="Max lines"
                value={selectedBlockId === 'headline' ? scene.title.maxLines || 3 : selectedBlockId === 'subtitle' ? scene.subtitle.maxLines || 4 : scene.badge.maxLines || 2}
                min={1}
                max={6}
                onChange={(value) => onPatchBlock(selectedBlockId, { maxLines: value })}
              />
            </div>
          )}

          {selectedBlockId === 'image' && (
            <div className="field">
              <label className="label">Crop mode</label>
              <select className="select" value={manualOverride?.blocks?.image?.fit || 'xMidYMid slice'} onChange={(event) => onPatchBlock('image', { fit: event.target.value })}>
                <option value="xMidYMid slice">Center crop</option>
                <option value="xMidYMin slice">Top crop</option>
                <option value="xMidYMax slice">Bottom crop</option>
                <option value="xMinYMid slice">Left crop</option>
                <option value="xMaxYMid slice">Right crop</option>
                <option value="xMidYMid meet">Contain</option>
              </select>
            </div>
          )}

          {selectedAnalysis && (
            <div className="stack">
              <div className="muted">
                Block score: <strong>{selectedAnalysis.score}</strong>
              </div>
              {selectedAnalysis.issues.slice(0, 3).map((issue) => (
                <div key={issue} className="alert warning">
                  {issue}
                </div>
              ))}
              {selectedAnalysis.suggestedFixes.slice(0, 3).map((item) => (
                <div key={item} className="hint">
                  Suggested: {item}
                </div>
              ))}
              <div className="metric-list">
                {Object.entries(selectedAnalysis.metrics).map(([key, value]) => (
                  <div key={key} className="metric-row">
                    <span>{formatMetricLabel(key)}</span>
                    <strong>{Math.round(value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label className="label">Image role</label>
        <select className="select" value={manualOverride?.imageRolePreset || 'hero'} onChange={(event) => onSelectImageRole(event.target.value as VariantManualOverride['imageRolePreset'])}>
          <option value="hero">Hero</option>
          <option value="background">Background</option>
          <option value="framed">Framed</option>
          <option value="split-left">Split left</option>
          <option value="split-right">Split right</option>
          <option value="accent">Accent</option>
        </select>
      </div>

      <div className="stack">
        <div className="section-title">Allowed layout families</div>
        <div className="inspector-chip-grid">
          {ruleSet.allowedLayoutFamilies.map((family) => (
            <button
              key={family}
              className={`pack-chip ${manualOverride?.selectedLayoutFamily === family ? 'active' : ''}`}
              onClick={() => onApplyLayoutFamily(family as LayoutIntentFamily)}
            >
              <span>{family}</span>
            </button>
          ))}
        </div>
      </div>

      {archetypeResolution && (
        <details className="stack" style={{ marginTop: 8 }}>
          <summary className="section-title" style={{ cursor: 'pointer', listStyle: 'none' }}>
            Archetype
          </summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="space-between small">
              <span className="label">
                <strong>Archetype ID</strong>
              </span>
              <code style={{ fontSize: '0.85em' }}>{effectiveArchetypeId}</code>
            </div>
            <div className="field">
              <div className="space-between small">
                <span className="label">Confidence</span>
                <span>{archetypeResolution.confidence.toFixed(2)}</span>
              </div>
              <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${archetypeResolution.confidence * 100}%`,
                    height: '100%',
                    background: confidenceBarColor,
                  }}
                />
              </div>
            </div>
            {layoutEvaluation?.quadrantWeights && (() => {
              const vb = layoutEvaluation.visualBalance
              const tier = vb >= 0.8 ? 'green' : vb >= 0.65 ? 'amber' : 'red'
              const rgba =
                tier === 'green' ? ([34, 197, 94] as const) : tier === 'amber' ? ([245, 158, 11] as const) : ([239, 68, 68] as const)
              const labelColor = tier === 'green' ? '#15803d' : tier === 'amber' ? '#b45309' : '#b91c1c'
              const qw = layoutEvaluation.quadrantWeights!
              const cells = [qw.topLeft, qw.topRight, qw.bottomLeft, qw.bottomRight]
              const cellAlpha = (w: number) => Math.min(0.9, Math.max(0.15, 0.15 + w * 2.5))
              return (
                <div style={{ marginTop: 6 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Balance {vb.toFixed(2)}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '38px 38px',
                      gridTemplateRows: '38px 38px',
                      gap: 4,
                      width: 'fit-content',
                      margin: '8px 0',
                    }}
                  >
                    {cells.map((w, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 4,
                          backgroundColor: `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${cellAlpha(w)})`,
                          fontSize: 11,
                          fontWeight: 500,
                          color: labelColor,
                        }}
                      >
                        {Math.round(w * 100)}%
                      </div>
                    ))}
                  </div>
                  <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
                    Visual weight distribution
                  </div>
                </div>
              )
            })()}
            <div className="muted" style={{ fontSize: '0.85em' }}>
              {archetypeResolution.reason}
            </div>
            {showFallbackUsed && (
              <div className="small">
                <span className="label">Fallback used</span>
                <div className="muted" style={{ fontSize: '0.85em' }}>
                  Yes — <code>{effectiveArchetypeId}</code> (initial selection: <code>{originalArchetypeId}</code>)
                </div>
              </div>
            )}
            {archetypeResolution.confidence < 0.8 && archetypeResolution.confidenceBreakdown && (
              <div className="metric-list" style={{ marginTop: 4 }}>
                {(
                  [
                    ['Archetype source', archetypeResolution.confidenceBreakdown.archetypeSource],
                    ['Scenario ambiguity', archetypeResolution.confidenceBreakdown.scenarioAmbiguity],
                    ['Missing image data', archetypeResolution.confidenceBreakdown.missingImageData],
                    ['Format mismatch', archetypeResolution.confidenceBreakdown.formatMismatch],
                  ] as const
                ).map(([label, amount]) => (
                  <div key={label} className="metric-row">
                    <span>{label}</span>
                    <span style={{ color: amount > 0 ? '#dc2626' : '#9ca3af' }}>{amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {sessionTelemetry && sessionTelemetry.exportCount > 0 && (
        <details className="stack" style={{ marginTop: 8 }}>
          <summary className="section-title" style={{ cursor: 'pointer', listStyle: 'none' }}>
            Session stats
          </summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <div>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 11,
                  background: 'var(--color-background-secondary, #f3f4f6)',
                  border: '1px solid var(--color-border-tertiary, #e5e7eb)',
                  borderRadius: 'var(--border-radius-md, 6px)',
                  padding: '2px 8px',
                  marginRight: 6,
                }}
              >
                Exports: {sessionTelemetry.exportCount}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 11,
                  background: 'var(--color-background-secondary, #f3f4f6)',
                  border: '1px solid var(--color-border-tertiary, #e5e7eb)',
                  borderRadius: 'var(--border-radius-md, 6px)',
                  padding: '2px 8px',
                  marginRight: 6,
                }}
              >
                Variants: {sessionTelemetry.variantCount}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 11,
                  background: 'var(--color-background-secondary, #f3f4f6)',
                  border: '1px solid var(--color-border-tertiary, #e5e7eb)',
                  borderRadius: 'var(--border-radius-md, 6px)',
                  padding: '2px 8px',
                  marginRight: 6,
                }}
              >
                Avg score: {sessionTelemetry.avgOverallScore.toFixed(2)}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 11,
                  background: 'var(--color-background-secondary, #f3f4f6)',
                  border: '1px solid var(--color-border-tertiary, #e5e7eb)',
                  borderRadius: 'var(--border-radius-md, 6px)',
                  padding: '2px 8px',
                  marginRight: 6,
                }}
              >
                Fallback rate: {Math.round(sessionTelemetry.fallbackRate * 100)}%
              </span>
            </div>

            <table
              style={{
                width: '100%',
                fontSize: 11,
                borderCollapse: 'collapse',
                marginTop: 8,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--color-background-secondary, #f3f4f6)',
                    color: 'var(--color-text-secondary, #6b7280)',
                  }}
                >
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Archetype</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Uses</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Avg score</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Fallbacks</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Low conf</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(sessionTelemetry.archetypes)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
                  .map((row, index) => {
                    const avg = row.count > 0 ? row.totalScore / row.count : 0
                    const avgColor =
                      avg >= 0.8
                        ? 'var(--color-text-success, #16a34a)'
                        : avg >= 0.65
                          ? 'var(--color-text-warning, #d97706)'
                          : 'var(--color-text-danger, #dc2626)'
                    const label =
                      row.archetypeId.length > 28 ? `${row.archetypeId.slice(0, 25)}…` : row.archetypeId
                    return (
                      <tr
                        key={row.archetypeId}
                        style={{
                          background: index % 2 === 1 ? 'rgba(243, 244, 246, 0.5)' : 'transparent',
                        }}
                      >
                        <td
                          style={{
                            fontFamily: 'ui-monospace, monospace',
                            maxWidth: 160,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            padding: '4px 6px',
                          }}
                          title={row.archetypeId}
                        >
                          {label}
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 6px' }}>{row.count}</td>
                        <td style={{ textAlign: 'right', padding: '4px 6px', color: avgColor }}>{avg.toFixed(2)}</td>
                        <td
                          style={{
                            textAlign: 'right',
                            padding: '4px 6px',
                            color: row.fallbacks > 0 ? '#dc2626' : 'var(--color-text-secondary, #9ca3af)',
                          }}
                        >
                          {row.fallbacks}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            padding: '4px 6px',
                            color: row.lowConfidence > 0 ? '#d97706' : 'var(--color-text-secondary, #9ca3af)',
                          }}
                        >
                          {row.lowConfidence}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>

            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: 'var(--color-text-secondary, #6b7280)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>Total issues flagged: {sessionTelemetry.totalIssues}</span>
              {onResetTelemetry && (
                <button
                  type="button"
                  onClick={onResetTelemetry}
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-danger, #dc2626)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Clear session
                </button>
              )}
            </div>
          </div>
        </details>
      )}
    </div>
  )
}
