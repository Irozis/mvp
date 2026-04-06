import { useMemo } from 'react'
import { getFormatRuleSet } from '../lib/formatRules'
import type {
  FormatDefinition,
  LayoutAssessment,
  LayoutElementKind,
  LayoutIntentFamily,
  ManualBlockOverride,
  Scene,
  VariantManualOverride,
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
}: {
  format: FormatDefinition
  scene: Scene
  assessment: LayoutAssessment
  selectedBlockId?: LayoutElementKind | null
  manualOverride?: VariantManualOverride
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
    </div>
  )
}
