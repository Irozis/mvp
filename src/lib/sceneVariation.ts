import type { Scene } from './types'


type SceneVariationPreset = {
  /** Font weight only — no geometry; use sparingly. */
  title?: { weight?: number }
  subtitle?: { opacity?: number }
  cta?: { rx?: number }
}

// Variation presets — stylistic only (no position/size/line layout changes)
const VARIATION_PRESETS: Array<SceneVariationPreset | null> = [
  null, // 0 = default

  // 1 = sharp style — square CTA button edges
  {
    cta: { rx: 0 },
  },

  // 2 = pill style — fully rounded CTA button
  {
    cta: { rx: 999 },
  },

  // 3 = reduced subtitle — subtitle more transparent
  {
    subtitle: { opacity: 0.4 },
    cta: { rx: 4 },
  },
]

function cloneScene(scene: Scene): Scene {
  return typeof structuredClone === 'function'
    ? structuredClone(scene)
    : (JSON.parse(JSON.stringify(scene)) as Scene)
}

export function applySceneVariation(scene: Scene, rotationIndex: number): Scene {
  const preset = VARIATION_PRESETS[rotationIndex % VARIATION_PRESETS.length]
  if (!preset) return scene

  const s = cloneScene(scene)

  if (preset.title?.weight !== undefined) {
    s.title.weight = preset.title.weight
  }

  if (preset.subtitle && s.subtitle && preset.subtitle.opacity !== undefined) {
    s.subtitle.opacity = preset.subtitle.opacity
  }

  if (preset.cta && s.cta && preset.cta.rx !== undefined) {
    s.cta.rx = preset.cta.rx
  }

  return s

}
