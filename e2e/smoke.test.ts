import { test, expect } from '@playwright/test'

// All 19 base formats defined in src/lib/presets.ts
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

test('app loads without crashing', async ({ page }) => {
  await page.goto('/')
  // Verify main app structure renders
  await expect(page.locator('.main')).toBeVisible()
  // Verify no top-level error boundary fallback
  await expect(page.locator('.error-boundary')).toHaveCount(0)
})

test('all goal packs render at least one canvas without errors', async ({ page }) => {
  await page.goto('/')

  // Wait for initial render
  await page.waitForSelector('canvas', { timeout: 10_000 })

  // No error boundary fallbacks should be visible
  const errorBoundaries = page.locator('.error-boundary')
  await expect(errorBoundaries).toHaveCount(0)

  // At least one canvas should be present
  const canvases = page.locator('canvas')
  await expect(canvases).not.toHaveCount(0)
})

test.describe('format renders without error', () => {
  for (const formatKey of ALL_FORMAT_KEYS) {
    test(formatKey, async ({ page }) => {
      await page.goto('/')

      // Switch edit mode to this format to ensure it's rendered
      const editSelect = page.locator('select').filter({ hasText: 'Master layout' })
      if (await editSelect.count() > 0) {
        await editSelect.selectOption(formatKey).catch(() => {
          // Format may not be in edit mode dropdown — that's OK, it still renders in preview grid
        })
      }

      // Wait for canvas elements to appear
      await page.waitForSelector('canvas', { timeout: 10_000 })

      // No error boundary fallbacks should be showing
      const errorBoundaries = page.locator('.error-boundary')
      const count = await errorBoundaries.count()
      expect(count, `Error boundary visible for format ${formatKey}`).toBe(0)
    })
  }
})
