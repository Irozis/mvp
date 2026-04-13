import { describe, it, expect, beforeEach } from 'vitest'
import { setLayoutEngineV2, LAYOUT_ENGINE_V2_ENABLED } from './autoAdapt'

// Reset flag before each test — module state must not leak
beforeEach(() => {
  setLayoutEngineV2(false)
})

describe('V2 feature flag', () => {
  it('is false by default', () => {
    expect(LAYOUT_ENGINE_V2_ENABLED).toBe(false)
  })

  it('setLayoutEngineV2(true) enables the flag', () => {
    setLayoutEngineV2(true)
    expect(LAYOUT_ENGINE_V2_ENABLED).toBe(true)
  })

  it('setLayoutEngineV2(false) disables the flag', () => {
    setLayoutEngineV2(true)
    setLayoutEngineV2(false)
    expect(LAYOUT_ENGINE_V2_ENABLED).toBe(false)
  })

  it('flag resets to false after beforeEach', () => {
    expect(LAYOUT_ENGINE_V2_ENABLED).toBe(false)
  })
})
