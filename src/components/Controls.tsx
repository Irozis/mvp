import { CHANNEL_FORMATS, FONT_OPTIONS, LAYOUT_PRESETS } from '../lib/presets'
import type { BrandKit, FormatKey, Scene, SelectedElement } from '../lib/types'

export function BasicControls({
  formatKey,
  applyLayoutPreset,
}: {
  formatKey: FormatKey
  applyLayoutPreset: (id: string, format: FormatKey) => void
}) {
  const format = CHANNEL_FORMATS.find((item) => item.key === formatKey) || CHANNEL_FORMATS[0]
  const presets = LAYOUT_PRESETS[format.family]
  const featured = presets.filter((preset) => preset.featured)
  const extras = presets.filter((preset) => !preset.featured)

  return (
    <div className="panel">
      <div className="section-title">Layout presets</div>
      <label className="label">Recommended compositions for {format.label}</label>
      <select className="select" defaultValue="" onChange={(event) => event.target.value && applyLayoutPreset(event.target.value, formatKey)}>
        <option value="" disabled>
          Choose a composition
        </option>
        {featured.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
        {extras.length > 0 && (
          <optgroup label="More options">
            {extras.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  )
}

export function BrandEditor({
  brandKit,
  updateBrandKit,
}: {
  brandKit: BrandKit
  updateBrandKit: (patch: Partial<BrandKit>) => void
}) {
  return (
    <div className="panel stack">
      <div className="section-title">Brand system</div>

      <div className="field">
        <label className="label">Brand name</label>
        <input className="input" value={brandKit.name} onChange={(event) => updateBrandKit({ name: event.target.value })} />
      </div>

      <div className="field">
        <label className="label">Font direction</label>
        <select className="select" value={brandKit.fontFamily} onChange={(event) => updateBrandKit({ fontFamily: event.target.value })}>
          {FONT_OPTIONS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="label">Tone of voice</label>
        <input className="input" value={brandKit.toneOfVoice} onChange={(event) => updateBrandKit({ toneOfVoice: event.target.value })} />
      </div>

      <div className="row">
        <div className="field">
          <label className="label">Primary color</label>
          <input className="color" type="color" value={brandKit.primaryColor} onChange={(event) => updateBrandKit({ primaryColor: event.target.value })} />
        </div>
        <div className="field">
          <label className="label">Accent color</label>
          <input className="color" type="color" value={brandKit.accentColor} onChange={(event) => updateBrandKit({ accentColor: event.target.value })} />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label className="label">Gradient 1</label>
          <input
            className="color"
            type="color"
            value={brandKit.background[0]}
            onChange={(event) => updateBrandKit({ background: [event.target.value, brandKit.background[1], brandKit.background[2]] })}
          />
        </div>
        <div className="field">
          <label className="label">Gradient 2</label>
          <input
            className="color"
            type="color"
            value={brandKit.background[1]}
            onChange={(event) => updateBrandKit({ background: [brandKit.background[0], event.target.value, brandKit.background[2]] })}
          />
        </div>
        <div className="field">
          <label className="label">Gradient 3</label>
          <input
            className="color"
            type="color"
            value={brandKit.background[2]}
            onChange={(event) => updateBrandKit({ background: [brandKit.background[0], brandKit.background[1], event.target.value] })}
          />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label className="label">CTA style</label>
          <select className="select" value={brandKit.ctaStyle} onChange={(event) => updateBrandKit({ ctaStyle: event.target.value as BrandKit['ctaStyle'] })}>
            <option value="pill">Pill</option>
            <option value="rounded">Rounded</option>
            <option value="sharp">Sharp</option>
          </select>
        </div>
        <div className="field">
          <label className="label">Safe zone</label>
          <select className="select" value={brandKit.safeZone} onChange={(event) => updateBrandKit({ safeZone: event.target.value as BrandKit['safeZone'] })}>
            <option value="compact">Compact</option>
            <option value="balanced">Balanced</option>
            <option value="airy">Airy</option>
          </select>
        </div>
      </div>
    </div>
  )
}

export function ElementEditor({
  selectedElement,
  scene,
  updateElement,
  updateRoot,
}: {
  selectedElement: SelectedElement
  scene: Scene
  updateElement: (key: SelectedElement, patch: Record<string, unknown>) => void
  updateRoot: (patch: Record<string, unknown>) => void
}) {
  const selected = scene[selectedElement]

  return (
    <div className="panel stack">
      <div className="section-title">Element editor</div>

      {(selectedElement === 'title' || selectedElement === 'subtitle' || selectedElement === 'cta' || selectedElement === 'badge') && (
        <div className="field">
          <label className="label">Text</label>
          {selectedElement === 'subtitle' ? (
            <textarea className="textarea" value={selected.text || ''} onChange={(event) => updateElement(selectedElement, { text: event.target.value })} />
          ) : (
            <input className="input" value={selected.text || ''} onChange={(event) => updateElement(selectedElement, { text: event.target.value })} />
          )}
        </div>
      )}

      {'x' in selected && <Range label="X" value={selected.x || 0} onChange={(value) => updateElement(selectedElement, { x: value })} max={100} />}
      {'y' in selected && <Range label="Y" value={selected.y || 0} onChange={(value) => updateElement(selectedElement, { y: value })} max={100} />}
      {'w' in selected && <Range label="Width" value={selected.w || 0} onChange={(value) => updateElement(selectedElement, { w: value })} min={4} max={92} />}
      {'h' in selected && <Range label="Height" value={selected.h || 0} onChange={(value) => updateElement(selectedElement, { h: value })} min={3} max={94} />}
      {'fontSize' in selected && <Range label="Font size" value={selected.fontSize || 16} onChange={(value) => updateElement(selectedElement, { fontSize: value })} min={10} max={72} />}
      {'maxLines' in selected && <Range label="Max lines" value={selected.maxLines || 3} onChange={(value) => updateElement(selectedElement, { maxLines: value })} min={1} max={6} />}
      {'charsPerLine' in selected && <Range label="Chars per line" value={selected.charsPerLine || 20} onChange={(value) => updateElement(selectedElement, { charsPerLine: value })} min={8} max={60} />}
      {'fill' in selected && (
        <div className="field">
          <label className="label">Text color</label>
          <input className="color" type="color" value={String(selected.fill).startsWith('#') ? String(selected.fill) : '#ffffff'} onChange={(event) => updateElement(selectedElement, { fill: event.target.value })} />
        </div>
      )}
      {'bg' in selected && (
        <div className="field">
          <label className="label">Background color</label>
          <input className="color" type="color" value={String(selected.bg).startsWith('#') ? String(selected.bg) : '#ffffff'} onChange={(event) => updateElement(selectedElement, { bg: event.target.value })} />
        </div>
      )}
      {'fit' in selected && (
        <div className="field">
          <label className="label">Image crop</label>
          <select className="select" value={selected.fit} onChange={(event) => updateElement(selectedElement, { fit: event.target.value })}>
            <option value="xMidYMid slice">Center crop</option>
            <option value="xMidYMin slice">Top crop</option>
            <option value="xMidYMax slice">Bottom crop</option>
            <option value="xMinYMid slice">Left crop</option>
            <option value="xMaxYMid slice">Right crop</option>
            <option value="xMidYMid meet">Contain</option>
          </select>
        </div>
      )}

      <div className="section-title">Scene palette override</div>
      <div className="row">
        <div className="field">
          <label className="label">Gradient 1</label>
          <input className="color" type="color" value={scene.background[0]} onChange={(event) => updateRoot({ background: [event.target.value, scene.background[1], scene.background[2]] })} />
        </div>
        <div className="field">
          <label className="label">Gradient 2</label>
          <input className="color" type="color" value={scene.background[1]} onChange={(event) => updateRoot({ background: [scene.background[0], event.target.value, scene.background[2]] })} />
        </div>
        <div className="field">
          <label className="label">Gradient 3</label>
          <input className="color" type="color" value={scene.background[2]} onChange={(event) => updateRoot({ background: [scene.background[0], scene.background[1], event.target.value] })} />
        </div>
      </div>
      <div className="field">
        <label className="label">Accent color</label>
        <input className="color" type="color" value={scene.accent} onChange={(event) => updateRoot({ accent: event.target.value })} />
      </div>
    </div>
  )
}

function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="field">
      <div className="space-between small">
        <label className="label">{label}</label>
        <span>{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  )
}
