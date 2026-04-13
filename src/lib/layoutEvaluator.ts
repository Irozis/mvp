import type { FormatDefinition, LayoutEvaluation, Scene, SceneElement } from './types'

export type { LayoutEvaluation } from './types'

type TextSlot = 'headline' | 'subtitle' | 'cta' | 'badge'

function getBox(el: SceneElement | undefined): { x: number; y: number; w: number; h: number } | null {
  if (!el) return null
  const w = el.w
  const h = el.h
  if (w === undefined || h === undefined || w <= 0 || h <= 0) return null
  return { x: el.x, y: el.y, w, h }
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function sceneTextElement(scene: Scene, slot: TextSlot): SceneElement {
  switch (slot) {
    case 'headline':
      return scene.title
    case 'subtitle':
      return scene.subtitle
    case 'cta':
      return scene.cta
    case 'badge':
      return scene.badge
  }
}

const MAX_QUADRANT_DEVIATION = 0.375

function quadrantFromCenter(cx: number, cy: number): 'q1' | 'q2' | 'q3' | 'q4' {
  if (cx < 50 && cy < 50) return 'q1'
  if (cx >= 50 && cy < 50) return 'q2'
  if (cx < 50 && cy >= 50) return 'q3'
  return 'q4'
}

function computeVisualBalance(scene: Scene): {
  visualBalance: number
  quadrantWeights?: LayoutEvaluation['quadrantWeights']
} {
  const weighted: Array<{ el: SceneElement | undefined; weight: number }> = [
    { el: scene.image, weight: 3.0 },
    { el: scene.title, weight: 2.0 },
    { el: scene.cta, weight: 1.5 },
    { el: scene.subtitle, weight: 1.0 },
    { el: scene.badge, weight: 0.5 },
    { el: scene.logo, weight: 0.5 },
  ]

  let q1 = 0
  let q2 = 0
  let q3 = 0
  let q4 = 0

  for (const { el, weight } of weighted) {
    const box = getBox(el)
    if (!box) continue
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const q = quadrantFromCenter(cx, cy)
    if (q === 'q1') q1 += weight
    else if (q === 'q2') q2 += weight
    else if (q === 'q3') q3 += weight
    else q4 += weight
  }

  const totalWeight = q1 + q2 + q3 + q4
  if (totalWeight === 0) {
    return { visualBalance: 0.75, quadrantWeights: undefined }
  }

  const q1n = q1 / totalWeight
  const q2n = q2 / totalWeight
  const q3n = q3 / totalWeight
  const q4n = q4 / totalWeight

  const deviation =
    (Math.abs(q1n - 0.25) + Math.abs(q2n - 0.25) + Math.abs(q3n - 0.25) + Math.abs(q4n - 0.25)) / 4
  const normalizedDeviation = deviation / MAX_QUADRANT_DEVIATION
  const visualBalance = Math.max(0, Math.min(1, 1.0 - normalizedDeviation))

  return {
    visualBalance,
    quadrantWeights: {
      topLeft: q1n,
      topRight: q2n,
      bottomLeft: q3n,
      bottomRight: q4n,
    },
  }
}

/**
 * Pure layout metrics from scene geometry in percent space (0–100).
 * Does not mutate inputs. `format` is accepted for API alignment with `synthesizeLayout` and future checks.
 */
export function evaluateLayout(scene: Scene, format: FormatDefinition): LayoutEvaluation {
  const issues: string[] = []

  // CHECK 1 — structural validity (headline = title, cta, image)
  const structuralSlots: Array<{ label: string; el: SceneElement }> = [
    { label: 'headline', el: scene.title },
    { label: 'cta', el: scene.cta },
    { label: 'image', el: scene.image },
  ]
  let structuralValidity = true
  for (const { label, el } of structuralSlots) {
    if (el == null) {
      structuralValidity = false
      issues.push(`Structural: required slot "${label}" is missing`)
      continue
    }
    const w = el.w
    const h = el.h
    if (w === undefined || h === undefined || w <= 0 || h <= 0) {
      structuralValidity = false
      issues.push(
        `Structural: required slot "${label}" is missing or has non-positive width/height (w=${String(w)}, h=${String(h)})`,
      )
    }
  }

  // CHECK 2 — readability (text overlap)
  const textSlots: TextSlot[] = ['headline', 'subtitle', 'cta', 'badge']
  const boxes: Array<{ slot: TextSlot; box: { x: number; y: number; w: number; h: number } }> = []
  for (const slot of textSlots) {
    const box = getBox(sceneTextElement(scene, slot))
    if (box) boxes.push({ slot, box })
  }
  let overlapCount = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (rectsOverlap(boxes[i].box, boxes[j].box)) {
        overlapCount += 1
        issues.push(`Overlap: ${boxes[i].slot} and ${boxes[j].slot}`)
      }
    }
  }
  let readability = Math.max(0, Math.min(1, 1.0 - overlapCount * 0.3))

  // CHECK 3 — hierarchy clarity (title vs subtitle fontSize)
  const headlineFs = scene.title?.fontSize
  const subtitleFs = scene.subtitle?.fontSize
  let hierarchyClarity: number
  if (headlineFs !== undefined && subtitleFs !== undefined) {
    hierarchyClarity = headlineFs > subtitleFs ? 1.0 : 0.4
  } else if (headlineFs !== undefined) {
    hierarchyClarity = 1.0
  } else {
    hierarchyClarity = 0.5
  }

  // CHECK 4 — visual balance (quadrant weight distribution)
  const { visualBalance, quadrantWeights } = computeVisualBalance(scene)

  const overallScore =
    (structuralValidity ? 1.0 : 0.0) * 0.3 +
    readability * 0.25 +
    hierarchyClarity * 0.2 +
    visualBalance * 0.25

  return {
    hierarchyClarity,
    visualBalance,
    readability,
    structuralValidity,
    overallScore,
    issues,
    quadrantWeights,
  }
}
