import { describe, expect, it } from 'vitest'
import { FORMAT_MAP } from './presets'
import { recomputeTextBlockTypography, reflowHeadlineForRegion } from './typographyEngine'

describe('typographyEngine', () => {
  it('reflows headline when region width changes', () => {
    const format = FORMAT_MAP['social-square']
    const plan = {
      titleSize: 60,
      titleWeight: 800,
      titleWidth: 58,
      titleCharsPerLine: 20,
      titleMaxLines: 3,
      subtitleSize: 20,
      subtitleWidth: 54,
      subtitleCharsPerLine: 32,
      subtitleMaxLines: 4,
      subtitleOpacity: 0.84,
      ctaSize: 16,
      badgeSize: 14,
      lineHeightTitle: 1.08,
      lineHeightSubtitle: 1.24,
      alignment: 'left' as const,
    }

    const text = 'Adaptive creative layout that stays readable everywhere'
    const wide = reflowHeadlineForRegion({ text, regionWidthPercent: 70, format, plan })
    const narrow = reflowHeadlineForRegion({ text, regionWidthPercent: 30, format, plan })
    expect(wide.charsPerLine).toBeGreaterThan(narrow.charsPerLine)
  })

  it('recomputeTextBlockTypography returns rule-bounded values', () => {
    const format = FORMAT_MAP['display-mpu']
    const plan = {
      titleSize: 24,
      titleWeight: 800,
      titleWidth: 40,
      titleCharsPerLine: 18,
      titleMaxLines: 3,
      subtitleSize: 13,
      subtitleWidth: 34,
      subtitleCharsPerLine: 24,
      subtitleMaxLines: 3,
      subtitleOpacity: 0.84,
      ctaSize: 12,
      badgeSize: 11,
      lineHeightTitle: 1.08,
      lineHeightSubtitle: 1.24,
      alignment: 'left' as const,
      bodySize: 11,
      bodyWidth: 34,
    }

    const result = recomputeTextBlockTypography({
      role: 'subtitle',
      text: 'Short subtitle',
      regionWidthPercent: 60,
      format,
      plan,
    })

    expect(result.fontSize).toBeGreaterThan(0)
    expect(result.width).toBeGreaterThan(0)
    expect(result.maxLines).toBeGreaterThan(0)
  })
})

