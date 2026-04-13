import { mkdirSync, existsSync } from 'fs'
import { Buffer } from 'node:buffer'
import { test, expect } from '@playwright/test'
import { auditScene } from './lib/designRules'

// All base format keys (see e2e/smoke.test.ts — ALL_FORMAT_KEYS)
const ALL_FORMAT_KEYS = [
  'social-square',
  'social-portrait',
  'story-vertical',
  'social-landscape',
  'display-mpu',
  'display-large-rect',
  'display-leaderboard',
  'display-skyscraper',
  'display-halfpage',
  'display-billboard',
  'marketplace-card',
  'marketplace-tile',
  'marketplace-highlight',
  'print-flyer-a5',
  'print-poster-a4',
  'print-billboard',
  'presentation-hero',
  'presentation-cover',
  'presentation-onepager',
] as const

// Primary UI only mounts marketplace-card + marketplace-highlight (see getPrimaryPreviewFormats).
const VISUAL_CASES = [
  { formatKey: 'marketplace-highlight', archetypeId: 'image-hero', label: 'highlight hero' },
  { formatKey: 'marketplace-card', archetypeId: 'v2-card-split-image-right', label: 'card split-right' },
  { formatKey: 'marketplace-card', archetypeId: 'v2-card-text-only', label: 'card text-only' },
  { formatKey: 'marketplace-highlight', archetypeId: 'v2-card-full-bleed-overlay', label: 'highlight full-bleed' },
] as const

const FORMAT_KEY_SET = new Set<string>(ALL_FORMAT_KEYS)

/** 1×1 PNG — inlined so tests do not depend on network or extra repo assets */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

for (const c of VISUAL_CASES) {
  if (!FORMAT_KEY_SET.has(c.formatKey)) {
    throw new Error(`Unknown formatKey in VISUAL_CASES: ${c.formatKey}`)
  }

  test(`visual design: ${c.label}`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')

    await page.locator('#file-main-image').setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })
    await page.waitForFunction(
      () => document.querySelectorAll('svg.preview-svg image[href]').length > 0,
      undefined,
      { timeout: 15_000 },
    )

    const editSelect = page.locator('select').filter({ hasText: 'Master layout' })
    if ((await editSelect.count()) > 0) {
      await editSelect.selectOption(c.formatKey).catch(() => {
        // Format may not be in edit mode dropdown — that's OK, it still renders in preview grid
      })
    }

    // Preview is SVG-only (no <canvas>); wait for the format’s SVG like Part C
    await page.waitForSelector(`[data-format-key="${c.formatKey}"] svg.preview-svg`, { timeout: 15_000 })

    const geo = await page.evaluate((formatKey) => {
      const container = document.querySelector(`[data-format-key="${formatKey}"]`)
      if (!container) return null

      const svg = container.querySelector('svg.preview-svg')
      if (!svg) return null

      const vb = svg.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? []
      const vbW = vb[2] ?? 0
      const vbH = vb[3] ?? 0

      function getGeom(el: Element | null) {
        if (!el) return null
        let bbox: DOMRect
        try {
          bbox = (el as SVGGraphicsElement).getBBox()
        } catch {
          return null
        }
        if (bbox.width === 0 && bbox.height === 0) return null

        const fsAttr =
          el.getAttribute('font-size') ??
          el.querySelector('text, tspan')?.getAttribute('font-size') ??
          null
        const fontSize = fsAttr ? parseFloat(fsAttr) : null

        return {
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
      }

      function getTextFs(t: SVGTextElement): number {
        const a =
          t.getAttribute('font-size') ?? t.querySelector('tspan')?.getAttribute('font-size') ?? ''
        const n = parseFloat(a)
        return Number.isFinite(n) ? n : 0
      }

      const logoEl = svg.querySelector('image[preserveAspectRatio="xMidYMid meet"]')
      const allImages = [...svg.querySelectorAll('image')]
      /* HEURISTIC: prefer a non-logo image on the right (split-card photo panel); else first non-logo */
      const nonLogo = allImages.filter((img) => img !== logoEl)
      const rightImage = nonLogo.find((img) => {
        let b: DOMRect
        try {
          b = (img as SVGGraphicsElement).getBBox()
        } catch {
          return false
        }
        return b.width > 0 && b.height > 0 && b.x + b.width / 2 > vbW * 0.5
      })
      const mainImageEl = rightImage ?? nonLogo[0] ?? allImages[0] ?? null

      const texts = [...svg.querySelectorAll('text')] as SVGTextElement[]
      const textsWithFs = texts.filter((t) => getTextFs(t) > 0)
      textsWithFs.sort((a, b) => getTextFs(b) - getTextFs(a))

      /* HEURISTIC: headline = largest text in left half (split layouts); else largest overall */
      const leftTexts = textsWithFs.filter((t) => {
        let b: DOMRect
        try {
          b = (t as SVGGraphicsElement).getBBox()
        } catch {
          return false
        }
        return b.width > 0 && b.height > 0 && b.x + b.width / 2 < vbW * 0.52
      })
      const headlineEl = (leftTexts.sort((a, b) => getTextFs(b) - getTextFs(a))[0] ?? textsWithFs[0]) ?? null
      const hFs = headlineEl ? getTextFs(headlineEl) : 0
      const subtitleEl =
        textsWithFs.find((t) => t !== headlineEl && getTextFs(t) > 0 && getTextFs(t) < hFs) ?? null

      const pillRect = svg.querySelector('rect[rx="999"]')
      const siblingText =
        pillRect?.nextElementSibling?.tagName.toLowerCase() === 'text' ? pillRect.nextElementSibling : null
      /* HEURISTIC: CTA label — pill sibling or 15/16px label not headline/subtitle */
      let ctaTextEl: Element | null = siblingText
      if (!ctaTextEl) {
        ctaTextEl =
          texts.find((t) => {
            const fs = getTextFs(t)
            return (
              (fs === 15 || fs === 16) && t !== headlineEl && t !== subtitleEl
            )
          }) ?? null
      }

      /* HEURISTIC: badge — first <g> with direct child rect rx="20" + text (CanvasPreview badge group) */
      let badgeEl: Element | null = null
      for (const g of svg.querySelectorAll('g')) {
        const r = g.querySelector(':scope > rect[rx="20"]')
        const t = g.querySelector(':scope > text')
        if (r && t) {
          badgeEl = t
          break
        }
      }

      return {
        vbW,
        vbH,
        image: getGeom(mainImageEl),
        headline: getGeom(headlineEl),
        subtitle: getGeom(subtitleEl),
        cta: getGeom(ctaTextEl),
        badge: getGeom(badgeEl),
        logo: getGeom(logoEl),
      }
    }, c.formatKey)

    if (!geo) {
      test.skip(true, `Format ${c.formatKey} not rendered`)
      return
    }

    const allNull = !geo.image && !geo.headline && !geo.cta
    if (allNull) {
      console.warn(
        `[VisualQA] SVG elements not queryable — review selectors (format=${c.formatKey}, archetype=${c.archetypeId})`,
      )
      test.skip(true, 'SVG elements not queryable — review selectors')
      return
    }

    const audit = auditScene(geo, c.archetypeId)

    console.log(`\n[VisualQA] ${c.label} (${c.archetypeId})`)
    for (const r of audit.results) {
      console.log(`  ${r.passed ? '✓' : '✗'} ${r.rule}: ${r.score.toFixed(2)} — ${r.detail}`)
    }
    console.log(`  Overall: ${audit.overallScore.toFixed(2)} → ${audit.passed ? 'PASS' : 'FAIL'}`)

    const dir = 'e2e/test-results'
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await page
      .locator(`[data-format-key="${c.formatKey}"]`)
      .first()
      .screenshot({ path: `${dir}/${c.formatKey}-${c.archetypeId}.png` })
      .catch(() => {
        /* screenshot failure must never fail the test */
      })

    await test.info().attach('design-audit', {
      body: JSON.stringify(audit, null, 2),
      contentType: 'application/json',
    })

    expect(
      audit.passed,
      `[VisualQA] FAIL ${c.label}\n` +
        `  Score: ${audit.overallScore.toFixed(2)}\n` +
        audit.results
          .filter((r) => !r.passed)
          .map((r) => `  ✗ ${r.rule} (${r.score.toFixed(2)}): ${r.detail}`)
          .join('\n'),
    ).toBe(true)
  })
}
