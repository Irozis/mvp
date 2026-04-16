import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runRepairPipeline } from './repairOrchestrator'

const { buildMarketplaceV2SlotFixBypassOutcomeMock } = vi.hoisted(() => ({
  buildMarketplaceV2SlotFixBypassOutcomeMock: vi.fn(),
}))

vi.mock('./repairHelpers', async () => {
  const actual = await vi.importActual<typeof import('./repairHelpers')>('./repairHelpers')
  return {
    ...actual,
    createRepairSceneSignature: vi.fn(() => 'scene-signature'),
    evaluateRepairSceneSync: vi.fn(() => ({
      scene: {},
      assessment: { score: 72, issues: [], structuralState: { status: 'valid', findings: [] } },
      scoreTrust: { effectiveScore: 72, disagreement: 0, needsHumanAttention: false },
      sceneSignature: 'scene-signature',
      structuralStatus: 'valid',
      strategyLabel: 'current',
      actions: [],
    })),
    buildMarketplaceV2SlotFixBypassOutcome: buildMarketplaceV2SlotFixBypassOutcomeMock,
  }
})

vi.mock('./marketplaceLayoutV2', async () => {
  const actual = await vi.importActual<typeof import('./marketplaceLayoutV2')>('./marketplaceLayoutV2')
  return {
    ...actual,
    isMarketplaceLayoutV2Enabled: vi.fn(() => true),
    isMarketplaceV2FormatKey: vi.fn((formatKey: string) => formatKey === 'marketplace-card' || formatKey === 'marketplace-tile'),
  }
})

vi.mock('./validation', async () => {
  const actual = await vi.importActual<typeof import('./validation')>('./validation')
  return {
    ...actual,
    aiReviewLayout: vi.fn(async () => ({})),
    getFormatAssessment: vi.fn(() => ({
      score: 72,
      issues: [],
      structuralState: { status: 'valid', findings: [] },
    })),
    getFormatFamily: vi.fn(() => 'square'),
  }
})

const scene = {
  background: ['#111', '#222'],
  accent: '#fff',
  title: { text: 'Title' },
  subtitle: { text: 'Subtitle' },
  cta: { text: 'Buy' },
  logo: {},
  badge: {},
  image: {},
} as any

function makeBypassOutcome(reasons: string[]) {
  return {
    scene,
    assessment: { score: 72, issues: [], structuralState: { status: 'valid', findings: [] } },
    scoreTrust: { effectiveScore: 70, disagreement: 0, needsHumanAttention: false },
    diagnostics: {
      formatKey: 'marketplace-card',
      classification: { dominantType: 'none', severity: 'low' },
      regenerationSource: {
        usesMasterScene: false,
        currentSceneSignature: 'scene-signature',
        regenerationSceneSignature: 'scene-signature',
        differsFromCurrent: false,
      },
      before: { structuralStatus: 'valid', effectiveScore: 70, sceneSignature: 'scene-signature' },
      after: { structuralStatus: 'valid', effectiveScore: 70, sceneSignature: 'scene-signature' },
      finalChanged: true,
      acceptedImprovement: false,
      escalated: false,
      escalationReasons: reasons,
      searchRuns: [],
      attempts: [],
      regenerationCandidates: [],
      autoFix: {
        attempted: false,
        accepted: false,
        scoreDelta: 0,
        structuralBefore: 'valid',
        structuralAfter: 'valid',
      },
    },
    result: {
      beforeScore: 72,
      afterScore: 72,
      effectiveBeforeScore: 70,
      effectiveAfterScore: 71,
      actionsApplied: [],
      actionsRejected: [],
      resolvedIssues: [],
      remainingIssues: [],
      canFixAgain: false,
      session: { iteration: 1 },
      scoreTrust: { effectiveScore: 71, disagreement: 0, needsHumanAttention: false },
      v2SlotLayoutPreserved: true,
    },
  } as any
}

describe('repairOrchestrator marketplace-card V2 bypass marker', () => {
  beforeEach(() => {
    buildMarketplaceV2SlotFixBypassOutcomeMock.mockReset()
  })

  it('appends the marketplace-card V2 slot bypass marker when bypass path is returned', async () => {
    buildMarketplaceV2SlotFixBypassOutcomeMock.mockResolvedValue(
      makeBypassOutcome(['marketplace-v2-slot-layout-preserved'])
    )

    const output = await runRepairPipeline({
      scene,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit: { background: ['#111'], accentColor: '#fff' } as any,
      goal: 'promo-pack',
    })

    expect(output.diagnostics.escalationReasons).toContain('repair-bypass:marketplace-card:v2-slot-preserved')
  })

  it('does not duplicate the bypass marker when already present', async () => {
    buildMarketplaceV2SlotFixBypassOutcomeMock.mockResolvedValue(
      makeBypassOutcome([
        'marketplace-v2-slot-layout-preserved',
        'repair-bypass:marketplace-card:v2-slot-preserved',
      ])
    )

    const output = await runRepairPipeline({
      scene,
      formatKey: 'marketplace-card',
      visualSystem: 'product-card',
      brandKit: { background: ['#111'], accentColor: '#fff' } as any,
      goal: 'promo-pack',
    })

    const matches = output.diagnostics.escalationReasons.filter(
      (reason) => reason === 'repair-bypass:marketplace-card:v2-slot-preserved'
    )
    expect(matches).toHaveLength(1)
  })
})
