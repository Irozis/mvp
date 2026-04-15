import { useRef, useState } from 'react'
import { Sparkles, Upload, LayoutTemplate } from 'lucide-react'
import { loadFileAsDataUrl } from '../lib/utils'

type EntryMode = 'compose' | 'reference' | 'brand-template'

type Props = {
  onStart: (mode: EntryMode, imageUrl?: string) => void
}

export function Onboarding({ onStart }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setLoading(true)
    try {
      const url = await loadFileAsDataUrl(file)
      onStart('reference', url)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="onboarding">
      <header className="onboarding-header">
        <span className="onboarding-eyebrow">ADAPTIVE CREATIVE STUDIO</span>
        <h1 className="onboarding-title">
          Build once. Ship<br />marketplace-ready layouts.
        </h1>
        <p className="onboarding-subtitle">
          From one master creative, export marketplace card and product highlight
          formats with consistent branding and validation.
        </p>
      </header>

      <div className="onboarding-cards">
        <div
          className={`onboarding-card onboarding-card--primary${dragOver ? ' onboarding-card--dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) await handleFile(file)
            }}
          />
          <div className="onboarding-card-icon"><Upload size={18} /></div>
          <div className="onboarding-card-body">
            <h2 className="onboarding-card-title">
              {loading ? 'Uploading…' : 'Import reference image'}
            </h2>
            <p className="onboarding-card-desc">
              Upload a product photo or existing creative — we'll analyse it and
              generate marketplace-optimised layouts automatically.
            </p>
          </div>
          <div className="onboarding-card-cta">
            <span className="button button-primary">
              {dragOver ? 'Drop to upload' : 'Choose file'}
            </span>
            <span className="onboarding-card-hint">or drag an image here</span>
          </div>
        </div>

        <button
          className="onboarding-card onboarding-card--secondary"
          onClick={() => onStart('compose')}
        >
          <div className="onboarding-card-icon"><Sparkles size={18} /></div>
          <div className="onboarding-card-body">
            <h2 className="onboarding-card-title">Build master creative</h2>
            <p className="onboarding-card-desc">
              Start from a blank canvas with full control over layout, copy,
              colors, and composition.
            </p>
          </div>
          <span className="onboarding-card-cta">
            <span className="button button-outline">Create new →</span>
          </span>
        </button>

        <button
          className="onboarding-card onboarding-card--tertiary"
          onClick={() => onStart('brand-template')}
        >
          <div className="onboarding-card-icon"><LayoutTemplate size={18} /></div>
          <div className="onboarding-card-body">
            <h2 className="onboarding-card-title">Start from brand template</h2>
            <p className="onboarding-card-desc">
              Pick a pre-built visual system aligned to a campaign goal and
              customise from there.
            </p>
          </div>
          <span className="onboarding-card-cta">
            <span className="button button-outline">Browse templates →</span>
          </span>
        </button>
      </div>

      <div className="onboarding-steps">
        {[
          { n: '1', title: 'Choose mode', desc: 'Create from scratch, import a layout reference, or start from a brand template.' },
          { n: '2', title: 'Define the pack', desc: 'This demo focuses on the marketplace adaptive pack: card and highlight outputs.' },
          { n: '3', title: 'Select direction', desc: 'Pick a visual system suited to product-led marketplace layouts, then review all sizes.' },
          { n: '4', title: 'Save and export', desc: 'Track versions, reopen projects later, and export PNG, JPG, PDF, or JSON.' },
        ].map(({ n, title, desc }) => (
          <div key={n} className="onboarding-step">
            <span className="onboarding-step-num">{n}.</span>
            <strong className="onboarding-step-title">{title}</strong>
            <p className="onboarding-step-desc">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
