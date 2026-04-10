import type { FormatDefinition, FormatKey, GoalPreset } from './types'

// Diploma product framing:
// the primary supported product is a template-assisted adaptive marketplace layout system.
// Broad freeform multi-family generation remains available as legacy infrastructure,
// diagnostics input, and fallback experimentation, but it is not the main delivery promise.

export const ACTIVE_SUPPORTED_FORMATS: FormatKey[] = [
  'marketplace-card',
  'marketplace-highlight',
]

export const PRIMARY_DIPLOMA_FORMATS: FormatKey[] = [
  'marketplace-card',
  'marketplace-highlight',
]

export const TEMPLATE_ASSIST_FLOW = [
  'input',
  'template-selection',
  'template-adaptation',
  'structural-validation',
  'visual-assessment',
  'preview-export',
] as const

export function isActiveSupportedFormat(formatKey: FormatKey) {
  return ACTIVE_SUPPORTED_FORMATS.includes(formatKey)
}

export function getPrimaryPreviewFormats(
  formats: FormatDefinition[],
  goalPreset?: GoalPreset
) {
  // Only keys that are both declared for the goal and in the active product scope (never e.g. legacy tile alone).
  const goalKeysMatchingActive =
    goalPreset?.includedFormats?.filter((key) => isActiveSupportedFormat(key)) ?? []

  if (goalKeysMatchingActive.length) {
    return formats.filter((format) => goalKeysMatchingActive.includes(format.key))
  }

  const primary = formats.filter((format) => PRIMARY_DIPLOMA_FORMATS.includes(format.key))
  if (primary.length) return primary

  return formats.filter((format) => isActiveSupportedFormat(format.key))
}

export function getGoalScopeNote(goalPreset?: GoalPreset) {
  if (!goalPreset) {
    return 'Primary UI scope is marketplace-card and marketplace-highlight. Broader freeform families remain legacy/fallback.'
  }
  if (goalPreset.scopeStage === 'legacy') {
    return 'This goal is kept as a legacy exploration/export preset. The main UI still prioritizes the active marketplace scope.'
  }
  return 'This goal follows the active diploma scope: marketplace-first adaptive layouts with validation and visual assessment.'
}
