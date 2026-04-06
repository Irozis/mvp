import { splitTextIntoLines } from './utils'
import type { BrandKit, ContentProfile, FormatDefinition, LayoutIntent, ScenarioKey, TypographyPlan, VisualSystemKey } from './types'
import { getFormatRuleSet } from './formatRules'
import { getFormatBalanceDefaults, getFormatDensityPreset } from './formatDefaults'
import { computeTextBoxGeometry, fitSceneTextToRule, fitTextBoxWithinRegion } from './textGeometry'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number) {
  return Math.round(value)
}

function getShortEdge(format: FormatDefinition) {
  return Math.min(format.width, format.height)
}

function getBaseTitleFactor(format: FormatDefinition) {
  if (format.family === 'wide') return 0.17
  if (format.family === 'landscape') return 0.094
  if (format.family === 'square') return 0.078
  if (format.family === 'portrait') return format.height > 1600 ? 0.071 : 0.067
  if (format.family === 'printPortrait') return 0.072
  return 0.15
}

function getBaseWidths(format: FormatDefinition) {
  if (format.family === 'wide') return { title: 30, subtitle: 28, titleChars: 16, subtitleChars: 24 }
  if (format.family === 'landscape') return { title: 40, subtitle: 36, titleChars: 18, subtitleChars: 28 }
  if (format.family === 'square') return { title: 58, subtitle: 54, titleChars: 18, subtitleChars: 28 }
  if (format.family === 'portrait') return { title: 72, subtitle: 66, titleChars: 17, subtitleChars: 26 }
  if (format.family === 'printPortrait') return { title: 68, subtitle: 64, titleChars: 20, subtitleChars: 34 }
  return { title: 76, subtitle: 74, titleChars: 14, subtitleChars: 18 }
}

function getIntentWidthAdjust(intent?: LayoutIntent) {
  if (!intent) return { title: 0, subtitle: 0, titleChars: 0, subtitleChars: 0 }
  if (intent.family === 'landscape-text-left-image-right') return { title: 4, subtitle: 6, titleChars: 2, subtitleChars: 2 }
  if (intent.family === 'billboard-wide-hero' || intent.family === 'billboard-wide-balanced' || intent.family === 'leaderboard-compact-horizontal') return { title: -2, subtitle: -2, titleChars: -2, subtitleChars: -2 }
  if (intent.family === 'portrait-hero-overlay' || intent.family === 'display-rectangle-image-bg') return { title: 2, subtitle: 0, titleChars: 0, subtitleChars: 0 }
  if (intent.family === 'portrait-bottom-card') return { title: 4, subtitle: 4, titleChars: 2, subtitleChars: 2 }
  if (intent.family === 'presentation-clean-hero' || intent.family === 'presentation-structured-cover') return { title: 3, subtitle: 3, titleChars: 2, subtitleChars: 2 }
  return { title: 0, subtitle: 0, titleChars: 0, subtitleChars: 0 }
}

function hasAwkwardEnding(text: string, charsPerLine: number, maxLines: number) {
  const lines = splitTextIntoLines(text, charsPerLine, maxLines)
  if (!lines.length) return false
  const last = lines[lines.length - 1].trim()
  return last.split(/\s+/).length === 1 && last.length <= 6
}

export function analyzeTextRhythm(text: string, charsPerLine: number, maxLines: number) {
  const lines = splitTextIntoLines(text, charsPerLine, maxLines)
  if (lines.length <= 1) return 100
  const lengths = lines.map((line) => line.length)
  const average = lengths.reduce((sum, value) => sum + value, 0) / lengths.length
  const variance = lengths.reduce((sum, value) => sum + Math.abs(value - average), 0) / lengths.length
  return clamp(Math.round(100 - variance * 4.2 - (hasAwkwardEnding(text, charsPerLine, maxLines) ? 14 : 0)), 0, 100)
}

export function computeTypography({
  format,
  profile,
  scenario,
  visualSystem,
  brandKit,
  intent,
  headlineText,
  subtitleText,
  fixStage = 'base',
}: {
  format: FormatDefinition
  profile: ContentProfile
  scenario: ScenarioKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  intent?: LayoutIntent
  headlineText?: string
  subtitleText?: string
  fixStage?: 'base' | 'local' | 'regional' | 'structural'
}): TypographyPlan {
  const ruleSet = getFormatRuleSet(format)
  const shortEdge = getShortEdge(format)
  const widths = getBaseWidths(format)
  const intentAdjust = getIntentWidthAdjust(intent)
  const densityPreset = getFormatDensityPreset({ format, profile })
  const formatBalanceDefaults = getFormatBalanceDefaults({ format, profile })
  const safeBoost = brandKit.safeZone === 'airy' ? 1.04 : brandKit.safeZone === 'compact' ? 0.96 : 1
  const densityFactor = profile.density === 'dense' ? 0.9 : profile.density === 'light' ? 1.06 : 1
  const scenarioFactor =
    scenario === 'short-promo' ? 1.12 :
    scenario === 'bold-offer' ? 1.08 :
    scenario === 'luxury-minimal' ? 0.96 :
    scenario === 'editorial-story' ? 0.98 :
    scenario === 'product-card' ? 1.01 :
    0.94

  let titleSize = shortEdge * getBaseTitleFactor(format) * densityFactor * scenarioFactor * safeBoost
  let subtitleSize = titleSize * (scenario === 'luxury-minimal' ? 0.33 : scenario === 'text-heavy-ad' ? 0.42 : 0.38)
  let titleWidth = widths.title + intentAdjust.title
  let subtitleWidth = widths.subtitle + intentAdjust.subtitle
  let titleCharsPerLine = widths.titleChars + intentAdjust.titleChars
  let subtitleCharsPerLine = widths.subtitleChars + intentAdjust.subtitleChars
  let titleMaxLines = format.family === 'wide' ? 2 : format.family === 'landscape' ? 3 : 4
  let subtitleMaxLines = format.family === 'wide' ? 2 : format.family === 'landscape' ? 4 : 5

  if (densityPreset === 'minimal-copy') {
    titleMaxLines = Math.min(titleMaxLines, format.category === 'marketplace' || format.key === 'display-leaderboard' ? 2 : 3)
    subtitleMaxLines = Math.min(subtitleMaxLines, format.category === 'display' || format.category === 'marketplace' ? 1 : 2)
    subtitleSize *= 0.92
    subtitleWidth -= format.family === 'wide' ? 2 : 0
  } else if (densityPreset === 'dense-copy') {
    titleSize *= 0.96
    subtitleSize *= 0.94
    titleWidth += 4
    subtitleWidth += 6
    titleCharsPerLine += 1
    subtitleCharsPerLine += 3
    titleMaxLines += 1
    subtitleMaxLines += 1
  }

  if (formatBalanceDefaults.balanceRegime === 'text-first' || formatBalanceDefaults.balanceRegime === 'dense-copy') {
    titleWidth += 2
    subtitleWidth += 3
    subtitleCharsPerLine += 1
  } else if (formatBalanceDefaults.balanceRegime === 'image-first') {
    titleWidth -= 1
    subtitleWidth -= 2
    subtitleSize *= 0.94
  }

  if (formatBalanceDefaults.occupancyMode === 'spacious') {
    titleSize *= 0.98
    subtitleSize *= 0.94
  } else if (formatBalanceDefaults.occupancyMode === 'text-safe') {
    titleWidth += 2
    subtitleWidth += 2
  }

  if (format.key === 'display-leaderboard') {
    titleWidth = 38
    subtitleWidth = 28
    titleCharsPerLine = profile.headlineLength <= 26 ? 24 : 20
    subtitleCharsPerLine = 22
    titleMaxLines = profile.headlineLength <= 28 ? 1 : 2
    subtitleMaxLines = profile.subtitleLength <= 36 && profile.bodyLength <= 18 ? 1 : 2
  }

  if (format.key === 'display-mpu' || format.key === 'display-large-rect') {
    titleWidth = Math.min(titleWidth, 40)
    subtitleWidth = Math.min(subtitleWidth, 34)
    titleMaxLines = Math.min(titleMaxLines, 3)
    subtitleMaxLines = Math.min(subtitleMaxLines, 3)
  }

  if (format.key === 'display-skyscraper' || format.key === 'display-halfpage') {
    titleWidth = Math.min(titleWidth, format.key === 'display-skyscraper' ? 76 : 72)
    subtitleWidth = Math.min(subtitleWidth, format.key === 'display-skyscraper' ? 72 : 68)
    titleMaxLines = Math.min(titleMaxLines + 1, 5)
    subtitleMaxLines = Math.min(subtitleMaxLines + 1, 5)
  }

  if (format.key === 'social-square') {
    if (intent?.family === 'square-hero-overlay') {
      if (profile.headlineLength > 18) {
        titleSize *= 0.96
        titleWidth += 2
        titleCharsPerLine += 1
      }
      if (profile.subtitleLength > 18 || profile.density === 'dense') {
        subtitleSize *= 0.92
        subtitleWidth += 3
        subtitleCharsPerLine += 2
        subtitleMaxLines = Math.min(subtitleMaxLines, 3)
      }
      if (fixStage === 'regional' || fixStage === 'structural') {
        titleWidth += 2
        subtitleWidth += 3
        subtitleSize *= 0.96
      }
    }

    if (intent?.family === 'square-image-top-text-bottom') {
      titleWidth += 5
      subtitleWidth += 6
      titleCharsPerLine += 2
      subtitleCharsPerLine += 2
      subtitleSize *= 0.94
      if (fixStage === 'structural') {
        titleWidth += 2
        subtitleWidth += 2
        titleMaxLines = Math.min(titleMaxLines + 1, 4)
      }
    }
  }

  if (profile.headlineLength <= 24) {
    titleSize *= 1.12
    titleWidth -= format.family === 'wide' ? 2 : 4
    titleMaxLines = Math.max(2, titleMaxLines - 1)
  } else if (profile.headlineLength >= 60) {
    titleSize *= 0.88
    titleWidth += format.family === 'wide' ? 4 : 8
    titleCharsPerLine += 2
    titleMaxLines += 1
  }

  if (profile.subtitleLength >= 110) {
    subtitleSize *= 0.92
    subtitleWidth += format.family === 'wide' ? 4 : 8
    subtitleCharsPerLine += 2
    subtitleMaxLines += 1
  } else if (profile.subtitleLength <= 40) {
    subtitleWidth -= 4
  }

  if (profile.bodyLength > 80) {
    subtitleSize *= 0.94
    subtitleWidth += 4
    subtitleCharsPerLine += 2
    subtitleMaxLines += 1
  }

  if (format.family === 'wide') {
    titleSize = clamp(titleSize, 18, 56)
    subtitleSize = clamp(subtitleSize, 10, 18)
    titleWidth = clamp(titleWidth + (profile.density === 'dense' ? 4 : 0), 24, 42)
    subtitleWidth = clamp(subtitleWidth + (profile.density === 'dense' ? 4 : 0), 24, 38)
  } else if (format.family === 'landscape') {
    titleSize = clamp(titleSize, 26, 78)
    subtitleSize = clamp(subtitleSize, 13, 28)
    titleWidth = clamp(titleWidth, 34, 52)
    subtitleWidth = clamp(subtitleWidth, 32, 46)
  } else if (format.family === 'square') {
    titleSize = clamp(titleSize, 34, 92)
    subtitleSize = clamp(subtitleSize, 15, 30)
    titleWidth = clamp(titleWidth, 46, 68)
    subtitleWidth = clamp(subtitleWidth, 44, 62)
    if (format.key === 'social-square' && intent?.family === 'square-hero-overlay') {
      titleWidth = clamp(titleWidth, 48, 66)
      subtitleWidth = clamp(subtitleWidth, 46, 64)
      subtitleSize = clamp(subtitleSize, 14, 26)
    }
    if (format.key === 'social-square' && intent?.family === 'square-image-top-text-bottom') {
      titleWidth = clamp(titleWidth, 50, 70)
      subtitleWidth = clamp(subtitleWidth, 48, 68)
    }
  } else if (format.family === 'portrait') {
    titleSize = clamp(titleSize, 34, 88)
    subtitleSize = clamp(subtitleSize, 15, 28)
    titleWidth = clamp(titleWidth, 58, 80)
    subtitleWidth = clamp(subtitleWidth, 54, 74)
  } else if (format.family === 'printPortrait') {
    titleSize = clamp(titleSize, 42, 112)
    subtitleSize = clamp(subtitleSize, 18, 30)
    titleWidth = clamp(titleWidth, 56, 74)
    subtitleWidth = clamp(subtitleWidth, 54, 70)
  } else {
    titleSize = clamp(titleSize, 22, 42)
    subtitleSize = clamp(subtitleSize, 11, 18)
    titleWidth = clamp(titleWidth, 68, 84)
    subtitleWidth = clamp(subtitleWidth, 68, 82)
  }

  if (scenario === 'bold-offer') {
    titleSize = clamp(titleSize * 1.06, titleSize, titleSize + 8)
  }

  if (scenario === 'text-heavy-ad') {
    titleWidth += 4
    subtitleWidth += 6
    titleCharsPerLine += 2
    subtitleCharsPerLine += 2
  }

  if (visualSystem === 'luxury-clean') {
    titleWidth -= 2
    subtitleWidth -= 2
  }

  if (visualSystem === 'editorial' || scenario === 'editorial-story') {
    subtitleMaxLines += 1
  }

  if (intent?.balanceMode === 'text-dominant') {
    titleWidth += 3
    subtitleWidth += 4
    titleCharsPerLine += 1
    subtitleCharsPerLine += 2
  }

  if (intent?.family === 'portrait-hero-overlay' || intent?.family === 'display-rectangle-image-bg') {
    titleSize = clamp(titleSize * 1.04, titleSize, titleSize + 6)
  }

  if (
    intent?.family === 'billboard-wide-hero' ||
    intent?.family === 'billboard-wide-balanced' ||
    intent?.family === 'leaderboard-compact-horizontal'
  ) {
    titleSize = clamp(titleSize * (profile.headlineLength > 42 ? 0.96 : 1.08), 18, 58)
    subtitleSize = clamp(subtitleSize * 0.96, 10, 18)
  }

  if (fixStage === 'regional') {
    if (format.family === 'wide' || format.family === 'landscape') {
      titleSize *= 1.08
      titleWidth += 4
      subtitleWidth += 3
    }
    if (format.family === 'portrait' || format.family === 'printPortrait' || format.family === 'skyscraper') {
      titleWidth += 4
      subtitleWidth += 4
      titleSize *= 1.04
    }
    if (format.key === 'display-leaderboard') {
      titleSize *= 1.04
      titleWidth += 2
      subtitleWidth = Math.min(subtitleWidth, 28)
    }
    if (format.key === 'display-skyscraper') {
      titleSize *= 1.05
      subtitleWidth += 2
    }
    if (format.key === 'display-billboard' || format.key === 'print-billboard') {
      titleSize *= 1.08
      titleWidth += 4
      subtitleWidth += 3
    }
  }

  if (fixStage === 'structural') {
    if (format.family === 'wide') {
      titleSize *= 1.16
      subtitleSize *= 1.04
      titleWidth += 8
      subtitleWidth += 6
      titleCharsPerLine += 2
      subtitleCharsPerLine += 2
    } else if (format.family === 'landscape') {
      titleSize *= 1.12
      titleWidth += 6
      subtitleWidth += 4
    } else if (format.family === 'portrait' || format.family === 'printPortrait') {
      titleSize *= 1.08
      titleWidth += 6
      subtitleWidth += 5
      titleMaxLines += 1
    } else if (format.family === 'square') {
      titleSize *= 1.06
      titleWidth += 4
      subtitleWidth += 3
    } else {
      titleWidth += 3
      subtitleWidth += 3
      titleSize *= 1.04
    }
    if (format.key === 'display-leaderboard') {
      titleSize *= 1.06
      titleWidth += 2
      subtitleSize *= 0.94
      subtitleMaxLines = Math.min(subtitleMaxLines, 1)
    }
    if (format.key === 'display-skyscraper') {
      titleSize *= 1.06
      titleWidth += 2
      subtitleWidth += 2
    }
    if (format.key === 'display-billboard') {
      titleSize *= 1.12
      titleWidth += 6
      subtitleWidth += 4
    }
    if (format.key === 'print-billboard') {
      titleSize *= 1.14
      titleWidth += 8
      subtitleWidth += 6
    }
  }

  if (format.key === 'display-leaderboard') {
    titleSize *= profile.headlineLength > 34 ? 0.92 : 1.08
    subtitleSize *= 0.9
    subtitleWidth = Math.min(subtitleWidth, 30)
    if (profile.subtitleLength > 56 || profile.bodyLength > 32) {
      subtitleCharsPerLine = Math.max(subtitleCharsPerLine - 4, 16)
    }
    if (profile.headlineLength > 44) {
      titleCharsPerLine = Math.max(titleCharsPerLine - 2, 18)
      titleWidth = Math.min(titleWidth, 36)
    }
  }

  if (format.key === 'display-billboard') {
    titleSize *= profile.headlineLength > 40 ? 1.02 : 1.1
    subtitleSize *= 0.96
    titleWidth += 4
    subtitleWidth += 2
  }

  if (format.key === 'print-billboard') {
    titleSize *= 1.18
    titleWidth += 8
    subtitleWidth += 6
  }

  if (format.category === 'presentation') {
    titleSize *= 1.06
    subtitleSize *= 0.96
    titleWidth += 4
    subtitleWidth += 2
  }

  if (hasAwkwardEnding(headlineText || '', titleCharsPerLine, titleMaxLines)) {
    titleWidth += 2
    titleCharsPerLine += 1
  }

  const ctaBoost = fixStage === 'structural' ? 1.14 : fixStage === 'regional' ? 1.08 : 1
  const ctaBase = (format.family === 'wide' ? titleSize * 0.38 : titleSize * 0.28) * (profile.needsStrongCTA || profile.ctaImportance === 'high' ? 1.08 : 1) * ctaBoost
  const badgeBase = scenario === 'bold-offer' ? titleSize * 0.34 : titleSize * 0.26

  const targetTitleLines = clamp(round(titleMaxLines - (profile.headlineLength <= 24 ? 1 : 0)), 2, 5)
  const titleRhythm = analyzeTextRhythm(headlineText || '', titleCharsPerLine, targetTitleLines)
  const subtitleRhythm = analyzeTextRhythm(subtitleText || '', subtitleCharsPerLine, clamp(round(subtitleMaxLines), 2, 6))
  if (titleRhythm < 72) {
    titleWidth += 2
    titleCharsPerLine += 1
  }
  if (subtitleRhythm < 72) {
    subtitleWidth += 2
    subtitleCharsPerLine += 1
  }

  if (format.family === 'wide') {
    titleSize = clamp(titleSize, 18, fixStage === 'structural' ? 64 : 58)
    subtitleSize = clamp(subtitleSize, 10, 20)
  } else if (format.family === 'landscape') {
    titleSize = clamp(titleSize, 26, fixStage === 'structural' ? 86 : 78)
    subtitleSize = clamp(subtitleSize, 13, 30)
  } else if (format.family === 'portrait') {
    titleSize = clamp(titleSize, 34, fixStage === 'structural' ? 96 : 88)
    subtitleSize = clamp(subtitleSize, 15, 30)
  } else if (format.family === 'printPortrait') {
    titleSize = clamp(titleSize, 42, fixStage === 'structural' ? 120 : 112)
    subtitleSize = clamp(subtitleSize, 18, 32)
  } else if (format.family === 'square') {
    titleSize = clamp(titleSize, 34, fixStage === 'structural' ? 98 : 92)
    subtitleSize = clamp(subtitleSize, 15, 32)
  }

  const headlineRule = ruleSet.typography.headline
  const subtitleRule = ruleSet.typography.subtitle
  const bodyRule = ruleSet.typography.body
  const ctaRule = ruleSet.typography.cta
  const finalTitleSize = clamp(round(titleSize), headlineRule.minFontSize, headlineRule.maxFontSize)
  const finalSubtitleSize = clamp(round(subtitleSize), subtitleRule.minFontSize, subtitleRule.maxFontSize)
  const finalTitleWidth = clamp(round(titleWidth), 24, Math.round((headlineRule.maxWidth / format.width) * 100))
  const finalSubtitleWidth = clamp(round(subtitleWidth), 24, Math.round((subtitleRule.maxWidth / format.width) * 100))
  const finalTitleMaxLines = clamp(round(titleMaxLines), 1, headlineRule.maxLines)
  const finalSubtitleMaxLines = clamp(round(subtitleMaxLines), 1, subtitleRule.maxLines)
  const finalLineHeightTitle = clamp(
    scenario === 'editorial-story' ? 1.03 : visualSystem === 'luxury-clean' ? 1.05 : 1.08,
    headlineRule.minLineHeight,
    headlineRule.maxLineHeight
  )
  const finalLineHeightSubtitle = clamp(
    scenario === 'luxury-minimal' ? 1.34 : scenario === 'text-heavy-ad' ? 1.3 : 1.24,
    subtitleRule.minLineHeight,
    subtitleRule.maxLineHeight
  )

  return {
    titleSize: finalTitleSize,
    titleWeight: visualSystem === 'luxury-clean' ? 700 : visualSystem === 'editorial' ? 760 : 800,
    titleWidth: finalTitleWidth,
    titleCharsPerLine: clamp(round(titleCharsPerLine), 12, 30),
    titleMaxLines: finalTitleMaxLines,
    subtitleSize: finalSubtitleSize,
    subtitleWidth: finalSubtitleWidth,
    subtitleCharsPerLine: clamp(round(subtitleCharsPerLine), 16, 42),
    subtitleMaxLines: finalSubtitleMaxLines,
    subtitleOpacity: scenario === 'luxury-minimal' ? 0.74 : scenario === 'bold-offer' ? 0.9 : 0.84,
    ctaSize: clamp(round(ctaBase), ctaRule.minFontSize, ctaRule.maxFontSize),
    badgeSize: clamp(round(badgeBase), 11, 20),
    lineHeightTitle: finalLineHeightTitle,
    lineHeightSubtitle: finalLineHeightSubtitle,
    alignment: format.category === 'presentation' && visualSystem === 'luxury-clean' ? 'center' : 'left',
    targetTitleLines,
    targetSubtitleLines: clamp(round(subtitleMaxLines), 2, 6),
    overlayStrengthBias: intent?.textMode === 'overlay' ? 0.06 : 0,
    bodySize: clamp(bodyRule.preferredFontSize, bodyRule.minFontSize, bodyRule.maxFontSize),
    bodyWidth: clamp(Math.round((bodyRule.maxWidth / format.width) * 100), 20, 84),
  }
}

export function reflowHeadlineForRegion(input: {
  text: string
  regionWidthPercent: number
  format: FormatDefinition
  plan: TypographyPlan
}) {
  const headlineRule = getFormatRuleSet(input.format).typography.headline
  const widthBias = clamp(input.regionWidthPercent, 18, Math.round((headlineRule.maxWidth / input.format.width) * 100))
  const charsPerLine = clamp(
    Math.round((input.plan.titleCharsPerLine || 18) * (widthBias / Math.max(input.plan.titleWidth || widthBias, 1))),
    10,
    34
  )
  const maxLines = clamp(input.plan.titleMaxLines + (input.text.length > 42 ? 1 : 0), 1, headlineRule.maxLines)
  const fitted = fitSceneTextToRule({
    role: 'headline',
    text: input.text,
    x: 0,
    y: input.plan.titleSize || headlineRule.preferredFontSize,
    width: widthBias,
    format: input.format,
    rule: headlineRule,
    preferredFontSize: clamp(
      Math.round((input.plan.titleSize || headlineRule.preferredFontSize) * (input.text.length > 42 ? 0.96 : 1.04)),
      headlineRule.minFontSize,
      headlineRule.maxFontSize
    ),
    preferredCharsPerLine: charsPerLine,
    preferredMaxLines: maxLines,
    lineHeight: input.plan.lineHeightTitle,
    anchorMode: 'baseline-left',
  })

  return {
    fontSize: fitted.fontSize,
    width: widthBias,
    charsPerLine: fitted.charsPerLine,
    maxLines: fitted.maxLines,
    lines: fitted.lines,
  }
}

export function recomputeTextBlockTypography(input: {
  role: 'headline' | 'subtitle' | 'body'
  text?: string
  regionWidthPercent: number
  format: FormatDefinition
  plan: TypographyPlan
}) {
  const ruleSet = getFormatRuleSet(input.format)
  if (input.role === 'headline') {
    return reflowHeadlineForRegion({
      text: input.text || '',
      regionWidthPercent: input.regionWidthPercent,
      format: input.format,
      plan: input.plan,
    })
  }

  const rule = input.role === 'subtitle' ? ruleSet.typography.subtitle : ruleSet.typography.body
  const baseWidth = clamp(input.regionWidthPercent, 18, Math.round((rule.maxWidth / input.format.width) * 100))
  const charsPerLine = clamp(
    Math.round((input.role === 'subtitle' ? input.plan.subtitleCharsPerLine : 32) * (baseWidth / Math.max((input.role === 'subtitle' ? input.plan.subtitleWidth : input.plan.bodyWidth) || baseWidth, 1))),
    14,
    48
  )
  const maxLines = clamp(input.role === 'subtitle' ? input.plan.subtitleMaxLines : 6, 1, rule.maxLines)
  const fitted = fitSceneTextToRule({
    role: input.role,
    text: input.text || '',
    x: 0,
    y: input.role === 'subtitle' ? input.plan.subtitleSize : input.plan.bodySize || rule.preferredFontSize,
    width: baseWidth,
    format: input.format,
    rule,
    preferredFontSize: clamp(
      Math.round(input.role === 'subtitle' ? input.plan.subtitleSize : input.plan.bodySize || rule.preferredFontSize),
      rule.minFontSize,
      rule.maxFontSize
    ),
    preferredCharsPerLine: charsPerLine,
    preferredMaxLines: maxLines,
    lineHeight: input.role === 'subtitle' ? input.plan.lineHeightSubtitle : rule.preferredLineHeight,
    anchorMode: 'baseline-left',
  })
  return {
    fontSize: fitted.fontSize,
    width: baseWidth,
    charsPerLine: fitted.charsPerLine,
    maxLines: fitted.maxLines,
    lines: fitted.lines,
  }
}

export function recomputeClusterTypography(input: {
  format: FormatDefinition
  profile: ContentProfile
  scenario: ScenarioKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  intent?: LayoutIntent
  headlineText?: string
  subtitleText?: string
  titleRegionWidthPercent?: number
  subtitleRegionWidthPercent?: number
  fixStage?: 'base' | 'local' | 'regional' | 'structural'
}) {
  const plan = computeTypography({
    format: input.format,
    profile: input.profile,
    scenario: input.scenario,
    visualSystem: input.visualSystem,
    brandKit: input.brandKit,
    intent: input.intent,
    headlineText: input.headlineText,
    subtitleText: input.subtitleText,
    fixStage: input.fixStage,
  })

  const headline = reflowHeadlineForRegion({
    text: input.headlineText || '',
    regionWidthPercent: input.titleRegionWidthPercent || plan.titleWidth,
    format: input.format,
    plan,
  })
  const subtitle = recomputeTextBlockTypography({
    role: 'subtitle',
    text: input.subtitleText,
    regionWidthPercent: input.subtitleRegionWidthPercent || plan.subtitleWidth,
    format: input.format,
    plan,
  })

  return {
    ...plan,
    titleSize: headline.fontSize,
    titleWidth: headline.width,
    titleCharsPerLine: headline.charsPerLine,
    titleMaxLines: headline.maxLines,
    subtitleSize: subtitle.fontSize,
    subtitleWidth: subtitle.width,
    subtitleCharsPerLine: subtitle.charsPerLine,
    subtitleMaxLines: subtitle.maxLines,
  }
}

export function measureTextBlock(input: {
  text: string
  fontSize: number
  charsPerLine: number
  maxLines: number
  lineHeight: number
}) {
  const syntheticFormat: FormatDefinition = {
    key: 'social-square',
    name: 'Synthetic text measure',
    width: 100,
    height: 100,
    label: 'Synthetic text measure',
    category: 'social',
    family: 'square',
    packTags: ['promo-pack'],
    scopeStage: 'legacy',
    primaryGenerationMode: 'legacy-freeform',
  }
  const geometry = computeTextBoxGeometry({
    role: 'headline',
    text: input.text || '',
    x: 0,
    y: input.fontSize,
    width: 100,
    fontSize: input.fontSize,
    lineHeight: input.lineHeight,
    charsPerLine: Math.max(input.charsPerLine, 1),
    maxLines: Math.max(input.maxLines, 1),
    anchorMode: 'baseline-left',
  }, syntheticFormat)
  return {
    lines: geometry.lines,
    lineCount: geometry.lineCount,
    heightPx: geometry.h,
  }
}

export function fitTextWithinConstraints(input: {
  text: string
  format: FormatDefinition
  role: 'headline' | 'subtitle' | 'body' | 'cta' | 'badge' | 'price'
  targetWidthPercent: number
  preferredFontSize?: number
  preferredCharsPerLine?: number
  preferredMaxLines?: number
}) {
  const rules = getFormatRuleSet(input.format).typography
  const rule =
    input.role === 'headline'
      ? rules.headline
      : input.role === 'subtitle'
        ? rules.subtitle
        : input.role === 'body'
          ? rules.body
          : input.role === 'cta'
            ? rules.cta
            : input.role === 'badge'
              ? rules.badge || rules.subtitle
              : rules.price || rules.subtitle

  const width = clamp(input.targetWidthPercent, 18, Math.round((rule.maxWidth / input.format.width) * 100))
  const fitted = fitTextBoxWithinRegion({
    role: input.role,
    text: input.text || '',
    x: 0,
    y: input.preferredFontSize ?? rule.preferredFontSize,
    width,
    preferredFontSize: Math.round(input.preferredFontSize ?? rule.preferredFontSize),
    preferredCharsPerLine: Math.round(input.preferredCharsPerLine ?? Math.max(12, Math.min(42, (width / 100) * 48))),
    preferredMaxLines: Math.round(input.preferredMaxLines ?? rule.maxLines),
    minFontSize: rule.minFontSize,
    maxFontSize: rule.maxFontSize,
    maxAllowedLines: rule.maxLines,
    lineHeight: rule.preferredLineHeight,
    anchorMode: 'baseline-left',
  }, input.format)

  return {
    width,
    fontSize: fitted.fontSize,
    charsPerLine: fitted.charsPerLine,
    maxLines: fitted.maxLines,
    lines: fitted.lines,
  }
}

export function calculateCtaTypography(input: { format: FormatDefinition; text: string }) {
  const rule = getFormatRuleSet(input.format).typography.cta
  const length = (input.text || '').trim().length
  const base = rule.preferredFontSize + (length <= 10 ? 1 : length >= 22 ? -1 : 0)
  return {
    fontSize: clamp(Math.round(base), rule.minFontSize, rule.maxFontSize),
    maxLines: 1,
  }
}
