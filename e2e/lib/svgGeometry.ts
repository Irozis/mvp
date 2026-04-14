export type Elem = {
  x: number
  y: number
  width: number
  height: number
  fontSize: number | null
  clipped: boolean
  isSlice?: boolean
} | null

export interface SceneGeo {
  vbW: number
  vbH: number
  archetypeId?: string | null
  image?: Elem
  thumbnailImage?: Elem
  headline?: Elem
  subtitle?: Elem
  cta?: Elem
  badge?: Elem
  logo?: Elem
}

export const GEOMETRY_EXTRACTOR_SOURCE = `(formatKey) => {
  const container = document.querySelector(\`[data-format-key="\${formatKey}"]\`)
  if (!container) return null

  const svg = container.querySelector('svg.preview-svg')
  if (!svg) return null

  const renderedArchetypeId = container.getAttribute('data-archetype-id')
  const vb = svg.getAttribute('viewBox')?.split(/\\s+/).map(Number) ?? []
  const vbW = vb[2] ?? 0
  const vbH = vb[3] ?? 0

  function getGeom(el, opts) {
    if (!el) return null
    let bbox
    try {
      bbox = el.getBBox()
    } catch {
      return null
    }
    if (bbox.width === 0 && bbox.height === 0) return null

    const fsAttr =
      el.getAttribute('font-size') ??
      el.querySelector?.('text, tspan')?.getAttribute('font-size') ??
      null
    const parsedFs = fsAttr ? parseFloat(fsAttr) : null
    const fontSize = Number.isFinite(parsedFs) ? parsedFs : null

    const par =
      el.getAttribute('preserveAspectRatio') ??
      el.querySelector?.('image')?.getAttribute('preserveAspectRatio') ??
      ''

    const base = {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      fontSize,
      clipped:
        bbox.x < -2 ||
        bbox.y < -2 ||
        bbox.x + bbox.width > vbW + 2 ||
        bbox.y + bbox.height > vbH + 2,
    }
    if (opts?.rasterImage) {
      base.isSlice = par.includes('slice')
    }
    return base
  }

  // STABLE: role-based selector for primary raster image
  const imageEl = svg.querySelector('[data-role="image"] image, [data-role="image"]')
  // STABLE: role-based selector for headline text
  const headlineEl = svg.querySelector('[data-role="headline"]')
  // STABLE: role-based selector for subtitle text
  const subtitleEl = svg.querySelector('[data-role="subtitle"]')
  // STABLE: role-based selector for CTA block wrapper/text
  const ctaEl = svg.querySelector('[data-role="cta"]')
  // STABLE: role-based selector for badge block wrapper/text
  const badgeEl = svg.querySelector('[data-role="badge"]')
  // STABLE: role-based selector for logo wrapper/image
  const logoEl = svg.querySelector('[data-role="logo"]')

  return {
    vbW,
    vbH,
    archetypeId: renderedArchetypeId,
    image: getGeom(imageEl, { rasterImage: true }),
    thumbnailImage: getGeom(imageEl, { rasterImage: true }),
    headline: getGeom(headlineEl),
    subtitle: getGeom(subtitleEl),
    cta: getGeom(ctaEl),
    badge: getGeom(badgeEl),
    logo: getGeom(logoEl),
  }
}`
