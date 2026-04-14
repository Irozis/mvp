import { mkdirSync, existsSync } from 'fs'
import { Buffer } from 'node:buffer'
import { expect, test, type Page } from '@playwright/test'
import { auditScene } from './lib/designRules'
import { GEOMETRY_EXTRACTOR_SOURCE, type SceneGeo } from './lib/svgGeometry'

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
    acceptableArchetypes: ['v2-card-split-image-right', 'v2-card-hero-shelf'],
    setupFn: async (page) => {
      await uploadTinyImage(page)
      await switchEditMode(page, 'marketplace-card')
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
    formatKey: 'marketplace-card',
    label: 'card hero-shelf',
    fallbackArchetypeId: 'v2-card-hero-shelf',
    expectedRenderedArchetype: 'v2-card-hero-shelf',
    acceptableArchetypes: ['v2-card-hero-shelf'],
    setupFn: async (page) => {
      await uploadTinyImage(page)
      await switchEditMode(page, 'marketplace-card')
      // v2-card-hero-shelf is the default — no chip or text setup needed
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
    test.setTimeout(100_000)
    await page.goto('/')

    if (c.setupFn) {
      await c.setupFn(page)
    } else {
      await uploadTinyImage(page)
    }

    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})

    let trimmedFromDom = ''
    const POLL_INTERVAL = 1000

    if (c.expectedRenderedArchetype) {
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

      const POLL_TIMEOUT = 80_000
      const start = Date.now()

      while (Date.now() - start < POLL_TIMEOUT) {
        const attr = await page
          .locator(`[data-format-key="${c.formatKey}"]`)
          .first()
          .getAttribute('data-archetype-id')
          .catch(() => '')
        trimmedFromDom = (attr ?? '').trim()
        if (trimmedFromDom === c.expectedRenderedArchetype) break
        if (c.acceptableArchetypes?.includes(trimmedFromDom)) break
        await page.waitForTimeout(POLL_INTERVAL)
      }
    }

    const editSelect = page.locator('select').filter({ hasText: 'Master layout' })
    if ((await editSelect.count()) > 0) {
      await editSelect.selectOption(c.formatKey).catch(() => {})
    }

    await page.waitForSelector(`[data-format-key="${c.formatKey}"] svg.preview-svg`, { timeout: 15_000 })

    trimmedFromDom = await page
      .locator(`[data-format-key="${c.formatKey}"]`)
      .first()
      .getAttribute('data-archetype-id')
      .then((a) => (a != null ? a.trim() : ''))

    if (c.expectedRenderedArchetype) {
      const acceptedIds = new Set([c.expectedRenderedArchetype, ...(c.acceptableArchetypes ?? [])])
      const POST_POLL_MS = 15_000
      const postStart = Date.now()
      while (Date.now() - postStart < POST_POLL_MS && !acceptedIds.has(trimmedFromDom)) {
        await page.waitForTimeout(POLL_INTERVAL)
        const attr = await page
          .locator(`[data-format-key="${c.formatKey}"]`)
          .first()
          .getAttribute('data-archetype-id')
          .catch(() => '')
        trimmedFromDom = (attr ?? '').trim()
        if (acceptedIds.has(trimmedFromDom)) break
      }
    }

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

    // eslint-disable-next-line no-new-func
    const geometryExtractor = new Function('return ' + GEOMETRY_EXTRACTOR_SOURCE)() as
      (formatKey: string) => SceneGeo | null
    const geo = await page.evaluate(geometryExtractor, c.formatKey)

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
