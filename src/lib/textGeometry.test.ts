import { describe, expect, it } from 'vitest'
import { FORMAT_MAP } from './presets'
import { computeTextBoxGeometry, fitTextBoxWithinRegion, fitSceneTextToRule } from './textGeometry'

const format = FORMAT_MAP['social-square']

const baseInput = {
  role: 'title' as const,
  text: 'Hello world',
  x: 10,
  y: 20,
  width: 60,
  preferredFontSize: 50,
  preferredCharsPerLine: 20,
  preferredMaxLines: 3,
  minFontSize: 10,
  maxFontSize: 80,
  lineHeight: 1.1,
}

// Edge case 1: minFontSize=0 — should never produce fontSize=0 (invisible text)
it('fitTextBoxWithinRegion: minFontSize=0 never returns fontSize=0', () => {
  const result = fitTextBoxWithinRegion(
    { ...baseInput, preferredFontSize: 5, minFontSize: 0, maxFontSize: 8, availableHeight: 0.001 },
    format
  )
  expect(result.fontSize).toBeGreaterThan(0)
})

// Edge case 2: negative availableHeight — loop must not spin forever, returns finite result
it('fitTextBoxWithinRegion: negative availableHeight returns finite height without infinite loop', () => {
  const start = Date.now()
  const result = fitTextBoxWithinRegion(
    { ...baseInput, availableHeight: -20 },
    format
  )
  expect(Date.now() - start).toBeLessThan(50) // must complete fast (no infinite loop)
  expect(result.fontSize).toBeGreaterThanOrEqual(baseInput.minFontSize)
  expect(isFinite(result.h)).toBe(true)
})

// Edge case 3: whitespace-only text returns height=0 without crashing
it('computeTextBoxGeometry: whitespace-only text returns zero height', () => {
  const result = computeTextBoxGeometry(
    { role: 'title', text: '   ', x: 10, y: 20, width: 60, fontSize: 40, lineHeight: 1.1, charsPerLine: 20, maxLines: 3 },
    format
  )
  expect(result.h).toBe(0)
  expect(result.lineCount).toBe(0)
})

// Edge case 4: very long single word (no spaces) — must not crash, must return positive fontSize
it('fitSceneTextToRule: very long single word (no spaces) returns positive fontSize', () => {
  const rule = { minFontSize: 8, maxFontSize: 80, maxLines: 4 }
  const result = fitSceneTextToRule({
    role: 'title',
    text: 'Antidisestablishmentarianism',
    x: 10,
    y: 20,
    width: 30,
    availableHeight: 5,
    format,
    rule,
    preferredFontSize: 50,
    preferredCharsPerLine: 10,
    preferredMaxLines: 3,
    lineHeight: 1.1,
  })
  expect(result.fontSize).toBeGreaterThan(0)
  expect(isFinite(result.h)).toBe(true)
})
