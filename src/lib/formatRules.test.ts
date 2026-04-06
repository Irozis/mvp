import { describe, expect, it } from 'vitest'
import { FORMAT_MAP } from './presets'
import { getFormatRuleSet } from './formatRules'

describe('formatRules', () => {
  it('returns a ruleset matching format width/height', () => {
    const format = FORMAT_MAP['social-square']
    const rules = getFormatRuleSet(format)
    expect(rules.width).toBe(format.width)
    expect(rules.height).toBe(format.height)
    expect(rules.safeArea.w).toBeGreaterThan(0)
    expect(rules.safeArea.h).toBeGreaterThan(0)
  })
})

