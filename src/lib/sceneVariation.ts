import type { Scene } from './types'

/** Post-layout scene tweak for rotated preview builds. Identity until variation hooks are wired. */
export function applySceneVariation(scene: Scene, _rotationIndex: number): Scene {
  return scene
}
