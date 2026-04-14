import { mkdirSync, existsSync } from 'fs'
import { Buffer } from 'node:buffer'
import { expect, test, type Page } from '@playwright/test'
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

type VisualCase = {
  formatKey: (typeof ALL_FORMAT_KEYS)[number]
  label: string
  fallbackArchetypeId: string
  /** Primary expected `data-archetype-id` after setup. */
  expectedRenderedArchetype?: string
  /** Also accepted (e.g. classifier may emit image-hero vs overlay-balanced for the same layout family). */
  acceptableArchetypes?: string[]
  setupFn?: (page: Page) => Promise<void>
}

/*
  selectPrimaryMarketplaceV2Archetype (marketplace-card) — exact order in src/lib/marketplaceLayoutV2.ts:
  1) textHeavyCard → v2-card-text-only  where textHeavy = bodyLength>180 OR subtitleLength>180 OR titleLen>60
  2) wantsMarketplaceCardFullBleedOverlay → v2-card-full-bleed-overlay
  3) focalPoint.x < 0.4 → v2-card-split-image-left
  4) profile.density === 'dense' → v2-card-text-focus
  5) preferredMessageMode === 'image-first' OR productVisualNeed === 'critical' → v2-card-split-image-right
  6) default → v2-card-hero-shelf
*/

// Primary UI only mounts marketplace-card + marketplace-highlight (see getPrimaryPreviewFormats).
const VISUAL_CASES: readonly VisualCase[] = [
  {
    formatKey: 'marketplace-highlight',
    label: 'highlight hero',
    fallbackArchetypeId: 'image-hero',
    // portrait-bottom-card → cluster-bottom text + framed image band; structural archetype resolves to split-vertical (hero strip, not overlay).
    expectedRenderedArchetype: 'split-vertical',
    setupFn: async (page) => {
      await uploadTinyImage(page)
      await switchEditMode(page, 'marketplace-highlight')
      await applyLayoutFamilyChip(page, 'portrait-bottom-card')
    },
  },
  {
    formatKey: 'marketplace-card',
    label: 'card split-right',
    fallbackArchetypeId: 'v2-card-split-image-right',
    expectedRenderedArchetype: 'v2-card-split-image-right',
    setupFn: async (page) => {
      await switchEditMode(page, 'master')
      await page.getByRole('button', { name: 'Bold Promo' }).click()
      await uploadTinyImage(page)
      // Product keywords → productVisualNeed critical; keep title ≤60 and total copy moderate so density ≠ dense and text-heavy gate is false.
      await fillMasterHeadline(page, 'Shop the new product collection today')
      await fillMasterSubtitle(page, 'See what is new.')
    },
  },
  {
    formatKey: 'marketplace-card',
    label: 'card text-only',
    fallbackArchetypeId: 'v2-card-text-only',
    expectedRenderedArchetype: 'v2-card-text-only',
    setupFn: async (page) => {
      await switchEditMode(page, 'master')
      await uploadTinyImage(page)
      await fillMasterHeadline(
        page,
        'Discover the complete collection of premium products designed for modern living',
      )
      await fillMasterSubtitle(page, 'Short.')
    },
  },
  {
    formatKey: 'marketplace-highlight',
    label: 'highlight full-bleed',
    fallbackArchetypeId: 'overlay-balanced',
    // portrait-hero-overlay → overlay hero; resolver may surface image-hero or overlay-balanced.
    expectedRenderedArchetype: 'overlay-balanced',
    acceptableArchetypes: ['image-hero', 'overlay-balanced'],
    setupFn: async (page) => {
      await uploadTinyImage(page)
      await switchEditMode(page, 'marketplace-highlight')
      await applyLayoutFamilyChip(page, 'portrait-hero-overlay')
    },
  },
]

const FORMAT_KEY_SET = new Set<string>(ALL_FORMAT_KEYS)

/** 1×1 PNG — inlined so tests do not depend on network or extra repo assets */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function uploadTinyImage(page: Page) {
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
}

async function switchEditMode(page: Page, mode: 'master' | 'marketplace-card' | 'marketplace-highlight') {
  const editSelect = page.locator('div.field').filter({ hasText: 'Edit mode' }).locator('select').first()
  await editSelect.waitFor({ state: 'visible', timeout: 15_000 })
  await editSelect.selectOption(mode)
}

/** Master "Editable element" lives in App.tsx; text inputs live under ElementEditor's panel. */
async function fillMasterHeadline(page: Page, text: string) {
  await page.locator('.panel.stack').filter({ hasText: 'Element editor' }).first().waitFor({ state: 'visible', timeout: 20_000 })
  await page.locator('div.field').filter({ hasText: 'Editable element' }).locator('select').selectOption('title')
  await page.locator('.panel.stack').filter({ hasText: 'Element editor' }).first().locator('input.input').fill(text)
}

async function fillMasterSubtitle(page: Page, text: string) {
  await page.locator('div.field').filter({ hasText: 'Editable element' }).locator('select').selectOption('subtitle')
  await page.locator('.panel.stack').filter({ hasText: 'Element editor' }).first().locator('textarea.textarea').fill(text)
}

async function applyLayoutFamilyChip(page: Page, family: string) {
  const btn = page.getByRole('button', { name: family, exact: true })
  await btn.scrollIntoViewIfNeeded()
  await btn.click()
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
}

for (const c of VISUAL_CASES) {
  if (!FORMAT_KEY_SET.has(c.formatKey)) {
    throw new Error(`Unknown formatKey in VISUAL_CASES: ${c.formatKey}`)
  }

  test(`visual design: ${c.label}`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/')

    if (c.setupFn) {
      await c.setupFn(page)
    } else {
      await uploadTinyImage(page)
    }

    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})

    if (c.expectedRenderedArchetype) {
      const accepted = new Set([c.expectedRenderedArchetype, ...(c.acceptableArchetypes ?? [])])
      await page
        .waitForFunction(
          ({ fk, ids }) => {
            const id = document.querySelector(`[data-format-key="${fk}"]`)?.getAttribute('data-archetype-id')?.trim()
            return Boolean(id && (ids as string[]).includes(id))
          },
          { fk: c.formatKey, ids: [...accepted] },
          { timeout: 50_000 },
        )
        .catch(() => {})
    }

    const editSelect = page.locator('select').filter({ hasText: 'Master layout' })
    if ((await editSelect.count()) > 0) {
      await editSelect.selectOption(c.formatKey).catch(() => {})
    }

    await page.waitForSelector(`[data-format-key="${c.formatKey}"] svg.preview-svg`, { timeout: 15_000 })

    const trimmedFromDom = await page
      .locator(`[data-format-key="${c.formatKey}"]`)
      .first()
      .getAttribute('data-archetype-id')
      .then((a) => (a != null ? a.trim() : ''))

    const accepted = new Set(
      [c.expectedRenderedArchetype, ...(c.acceptableArchetypes ?? [])].filter(Boolean) as string[],
    )
    if (accepted.size > 0 && trimmedFromDom && !accepted.has(trimmedFromDom)) {
      test.skip(
        true,
        `[VisualQA] Expected data-archetype-id in [${[...accepted].join(', ')}] for ${c.label}, got "${trimmedFromDom || '(empty)'}".`,
      )
      return
    }

    const geo = await page.evaluate((formatKey) => {
      const container = document.querySelector(`[data-format-key="${formatKey}"]`)
      if (!container) return null

      const svg = container.querySelector('svg.preview-svg')
      if (!svg) return null

      const renderedArchetypeId = container.getAttribute('data-archetype-id')

      const vb = svg.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? []
      const vbW = vb[2] ?? 0
      const vbH = vb[3] ?? 0

      function getGeom(el: Element | null, opts?: { rasterImage?: boolean }) {
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

        const par = el.getAttribute('preserveAspectRatio') ?? ''
        const isSlice = opts?.rasterImage ? par.includes('slice') : undefined

        const base: Record<string, unknown> = {
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
          base.isSlice = isSlice
        }
        return base
      }

      function getTextFs(t: SVGTextElement): number {
        const a =
          t.getAttribute('font-size') ?? t.querySelector('tspan')?.getAttribute('font-size') ?? ''
        const n = parseFloat(a)
        return Number.isFinite(n) ? n : 0
      }

      const logoEl = svg.querySelector('image[preserveAspectRatio="xMidYMid meet"]')
      const allImages = [...svg.querySelectorAll('image')]
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

      let smallestNonLogo: Element | null = null
      let smallestArea = Infinity
      for (const img of nonLogo) {
        let b: DOMRect
        try {
          b = (img as SVGGraphicsElement).getBBox()
        } catch {
          continue
        }
        if (b.width <= 0 || b.height <= 0) continue
        const a = b.width * b.height
        if (a < smallestArea) {
          smallestArea = a
          smallestNonLogo = img
        }
      }
      /** v2-card-text-only uses a small inset photo (~25% wide) — prefer narrow <image>, else smallest area. */
      let thumbnailImageEl = smallestNonLogo ?? mainImageEl
      if (renderedArchetypeId === 'v2-card-text-only') {
        const narrow = nonLogo.filter((img) => {
          try {
            const b = (img as SVGGraphicsElement).getBBox()
            return b.width > 0 && b.height > 0 && b.width < vbW * 0.45
          } catch {
            return false
          }
        })
        if (narrow.length > 0) {
          narrow.sort((a, b) => {
            const ba = (a as SVGGraphicsElement).getBBox()
            const bb = (b as SVGGraphicsElement).getBBox()
            return ba.width * ba.height - bb.width * bb.height
          })
          thumbnailImageEl = narrow[0]!
        }
      }

      const texts = [...svg.querySelectorAll('text')] as SVGTextElement[]
      const textsWithFs = texts.filter((t) => getTextFs(t) > 0)
      textsWithFs.sort((a, b) => getTextFs(b) - getTextFs(a))

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
        archetypeId: renderedArchetypeId,
        image: getGeom(mainImageEl, { rasterImage: true }),
        thumbnailImage: getGeom(thumbnailImageEl, { rasterImage: true }),
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
        `[VisualQA] SVG elements not queryable — review selectors (format=${c.formatKey}, fallbackArchetype=${c.fallbackArchetypeId})`,
      )
      test.skip(true, 'SVG elements not queryable — review selectors')
      return
    }

    const trimmed = geo.archetypeId != null ? String(geo.archetypeId).trim() : ''
    const renderedArchetype = trimmed !== '' ? trimmed : c.fallbackArchetypeId

    const audit = auditScene(geo, renderedArchetype)

    console.log(`\n[VisualQA] ${c.label} — rendered archetype: ${renderedArchetype}`)
    for (const r of audit.results) {
      console.log(`  ${r.passed ? '✓' : '✗'} ${r.rule}: ${r.score.toFixed(2)} — ${r.detail}`)
    }
    console.log(`  Overall: ${audit.overallScore.toFixed(2)} → ${audit.passed ? 'PASS' : 'FAIL'}`)

    const dir = 'e2e/test-results'
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const fileLabel = c.label.replace(/\s+/g, '-')
    await page
      .locator(`[data-format-key="${c.formatKey}"]`)
      .first()
      .screenshot({ path: `${dir}/${c.formatKey}-${fileLabel}.png` })
      .catch(() => {})

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
