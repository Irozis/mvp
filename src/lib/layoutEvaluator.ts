import type { EnhancedImageAnalysis, FormatDefinition, LayoutEvaluation, Scene, SceneElement } from './types'

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

function addQuadrantWeight(
  q: 'q1' | 'q2' | 'q3' | 'q4',
  weight: number,
  buckets: { q1: number; q2: number; q3: number; q4: number },
): void {
  if (q === 'q1') buckets.q1 += weight
  else if (q === 'q2') buckets.q2 += weight
  else if (q === 'q3') buckets.q3 += weight
  else buckets.q4 += weight
}

function computeVisualBalance(
  scene: Scene,
  imageAnalysis?: EnhancedImageAnalysis,
): {
  visualBalance: number
  quadrantWeights?: LayoutEvaluation['quadrantWeights']
  focalAwareBalance?: boolean
} {
  let focalAwareBalance: boolean | undefined

  const buckets = { q1: 0, q2: 0, q3: 0, q4: 0 }

  const imgBox = getBox(scene.image)

  if (scene.image && imgBox) {
    let imageCx: number
    let imageCy: number
    if (imageAnalysis?.focalPoint) {
      imageCx = imgBox.x + (imageAnalysis.focalPoint.x / 100) * imgBox.w
      imageCy = imgBox.y + (imageAnalysis.focalPoint.y / 100) * imgBox.h
      focalAwareBalance = true
    } else {
      imageCx = imgBox.x + imgBox.w / 2
      imageCy = imgBox.y + imgBox.h / 2
      if (imageAnalysis) focalAwareBalance = false
    }
    const qImg = quadrantFromCenter(imageCx, imageCy)
    addQuadrantWeight(qImg, 3.0, buckets)
  }

  if (
    imageAnalysis?.subjectBox &&
    imageAnalysis.subjectBox.w * imageAnalysis.subjectBox.h > 200 &&
    imgBox
  ) {
    const sb = imageAnalysis.subjectBox
    const subCx = imgBox.x + ((sb.x + sb.w / 2) / 100) * imgBox.w
    const subCy = imgBox.y + ((sb.y + sb.h / 2) / 100) * imgBox.h
    const qs = quadrantFromCenter(subCx, subCy)
    addQuadrantWeight(qs, 1.5, buckets)
  }

  const weighted: Array<{ el: SceneElement | undefined; weight: number }> = [
    { el: scene.title, weight: 2.0 },
    { el: scene.cta, weight: 1.5 },
    { el: scene.subtitle, weight: 1.0 },
    { el: scene.badge, weight: 0.5 },
    { el: scene.logo, weight: 0.5 },
  ]

  for (const { el, weight } of weighted) {
    const box = getBox(el)
    if (!box) continue
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    const q = quadrantFromCenter(cx, cy)
    addQuadrantWeight(q, weight, buckets)
  }

  const totalWeight = buckets.q1 + buckets.q2 + buckets.q3 + buckets.q4
  if (totalWeight === 0) {
    return { visualBalance: 0.75, quadrantWeights: undefined, focalAwareBalance }
  }

  const q1n = buckets.q1 / totalWeight
  const q2n = buckets.q2 / totalWeight
  const q3n = buckets.q3 / totalWeight
  const q4n = buckets.q4 / totalWeight

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
    focalAwareBalance,
  }
}

/**
 * Pure layout metrics from scene geometry in percent space (0–100).
 * Does not mutate inputs. `format` is accepted for API alignment with `synthesizeLayout` and future checks.
 */
export function evaluateLayout(
  scene: Scene,
  format: FormatDefinition,
  imageAnalysis?: EnhancedImageAnalysis,
): LayoutEvaluation {
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

  // Text-over-image penalty
  const imageBox = getBox(scene.image)
  if (imageBox && imageBox.w * imageBox.h > 500) {
    const TEXT_OVER_IMAGE_SLOTS = ['headline', 'subtitle', 'cta'] as const
    let textOverImageCount = 0

    for (const slot of TEXT_OVER_IMAGE_SLOTS) {
      const box = getBox(sceneTextElement(scene, slot))
      if (!box) continue
      if (!rectsOverlap(box, imageBox)) continue

      let isSafe = false
      if (imageAnalysis?.safeTextAreas?.length) {
        isSafe = imageAnalysis.safeTextAreas.some(
          (area) =>
            area.score >= 0.6 &&
            rectsOverlap(box, { x: area.x, y: area.y, w: area.w, h: area.h }),
        )
      }

      if (!isSafe) {
        textOverImageCount += 1
        issues.push(`Text over image: ${slot} overlaps image without safe area`)
      }
    }

    if (textOverImageCount > 0 && imageAnalysis?.detectedContrast === 'low') {
      textOverImageCount += 1
      issues.push('Readability: low image contrast with text overlay')
    }

    readability = Math.max(0, readability - textOverImageCount * 0.2)
  }

  // CHECK 3 — hierarchy clarity (title vs subtitle fontSize)
  const headlineFs = scene.title?.fontSize
  const subtitleFs = scene.subtitle?.fontSize
  let hierarchyClarity: number
  if (headlineFs !== undefined && subtitleFs !== undefined) {
    if (subtitleFs === 0) {
      hierarchyClarity = 1.0
    } else {
      const ratio = headlineFs / subtitleFs
      if (ratio >= 1.5) hierarchyClarity = 1.0
      else if (ratio >= 1.2) hierarchyClarity = 0.85
      else if (ratio >= 1.0) hierarchyClarity = 0.65
      else if (ratio >= 0.8) hierarchyClarity = 0.4
      else hierarchyClarity = 0.2
    }
  } else if (headlineFs !== undefined) {
    hierarchyClarity = 1.0
  } else {
    hierarchyClarity = 0.5
  }

  if (scene.cta?.fontSize !== undefined && scene.title?.fontSize !== undefined) {
    if (scene.cta.fontSize > scene.title.fontSize) {
      hierarchyClarity = Math.min(hierarchyClarity, 0.3)
      issues.push('Hierarchy: cta fontSize exceeds headline')
    }
  }

  // CHECK 4 — visual balance (quadrant weight distribution)
  const { visualBalance, quadrantWeights, focalAwareBalance } = computeVisualBalance(scene, imageAnalysis)

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
    ...(focalAwareBalance !== undefined ? { focalAwareBalance } : {}),
  }
}
