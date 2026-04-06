import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type {
  CalibrationCaseExecutionSummary,
  CalibrationCaseInput,
  CalibrationCaseNotes,
} from './calibrationCaseSchema'
import { runCalibrationDataset } from './calibrationRunner'

const TEMP_ROOTS: string[] = []
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbWQAAAAASUVORK5CYII=',
  'base64'
)

async function createTempDatasetRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'calibration-review-'))
  TEMP_ROOTS.push(root)
  return root
}

async function createCase(
  root: string,
  input: {
    folder: 'square' | 'landscape' | 'portrait'
    category?: string
    id: string
    notes?: Partial<CalibrationCaseNotes>
    verdict?: Record<string, unknown>
  }
) {
  const caseDir = input.category
    ? path.join(root, input.category, input.folder, input.id)
    : path.join(root, input.folder, input.id)
  await mkdir(caseDir, { recursive: true })
  const notes: CalibrationCaseNotes = {
    id: input.id,
    family: 'marketplace',
    format: input.folder,
    source: 'manual',
    expectedProblems: ['cramped-text'],
    expectedBehavior: ['preserve-layout-structure'],
    tags: ['test-case'],
    ...input.notes,
  }
  await writeFile(path.join(caseDir, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8')
  await writeFile(path.join(caseDir, 'input.png'), PNG_1X1)
  if (input.verdict) {
    await writeFile(path.join(caseDir, 'verdict.json'), JSON.stringify(input.verdict, null, 2), 'utf8')
  }
  return caseDir
}

function createFakeExecutionSummary(
  caseInput: CalibrationCaseInput,
  input?: {
    baselineWon?: boolean
    baselineAggregate?: number
    winnerAggregate?: number
    winnerCandidateKind?: string
    winnerConfidenceDelta?: number
    dominantTags?: string[]
    dominantPenalties?: string[]
    rejectionReasons?: string[]
  }
) {
  const baselineWon = Boolean(input?.baselineWon)
  const baselineAggregate = input?.baselineAggregate ?? 40
  const winnerAggregate = input?.winnerAggregate ?? (baselineWon ? baselineAggregate : 52)
  const aggregateDelta = winnerAggregate - baselineAggregate
  const winnerCandidateKind = baselineWon ? 'baseline' : (input?.winnerCandidateKind || 'local-structural-repair')
  const dominantTags = input?.dominantTags || ['structured']
  const dominantPenalties = input?.dominantPenalties || ['weak-balance']
  const rejectionReasons = input?.rejectionReasons || ['spacing-threshold-exceeded']
  const scene = {
    background: ['#000000', '#111111', '#222222'],
    accent: '#ffffff',
    title: { x: 10, y: 10, w: 40, h: 20, text: 'Headline' },
    subtitle: { x: 10, y: 34, w: 40, h: 12, text: 'Subtitle' },
    cta: { x: 10, y: 52, w: 18, h: 6, text: 'CTA' },
    badge: { x: 70, y: 8, w: 10, h: 5, text: 'Badge' },
    logo: { x: 8, y: 8, w: 10, h: 5 },
    image: { x: 55, y: 14, w: 30, h: 40 },
  }
  const assessment = {
    score: winnerAggregate,
    verdict: 'ok',
    issues: [],
    structuralState: {
      status: 'valid',
      findings: [],
    },
  }
  const objective = (aggregateScore: number, aggregateDeltaValue: number, accepted: boolean, kind: string, label: string) => ({
    candidateId: `${kind}:${label}`,
    strategyLabel: label,
    candidateKind: kind,
    structuralStatus: 'valid',
    effectiveScore: aggregateScore,
    aggregateScore,
    aggregateDelta: aggregateDeltaValue,
    accepted,
    rejectionReasons: accepted ? [] : rejectionReasons,
    gateOutcomes: {
      repeatSuppressed: false,
      legacySafetyRejected: false,
      hardStructuralInvalidity: false,
      rolePlacementOutOfZone: false,
      spacingThresholdExceeded: !accepted,
      confidenceCollapse: false,
      aggregateBelowBaseline: !accepted,
      noNetGain: baselineWon,
    },
    summaryTags: dominantTags,
    penaltyTags: dominantPenalties,
    objective: {
      structuralValidity: 90,
      perceptualQuality: 70,
      commercialStrength: 65,
      familyFidelity: 80,
      sideEffectCost: 5,
      aggregateScore,
      weights: {
        structuralValidity: 0.35,
        perceptualQuality: 0.25,
        commercialStrength: 0.15,
        familyFidelity: 0.15,
        sideEffectCost: 0.1,
      },
    },
    confidence: {
      effectiveScore: aggregateScore,
      disagreement: 0,
      needsHumanAttention: false,
    },
    confidenceDelta: 0,
    structuralFindingDelta: 0,
  })

  return {
    formatKey: caseInput.notes.formatKey || 'marketplace-card',
    baselineScene: scene,
    winnerScene: scene,
    baselineAssessment: assessment,
    winnerAssessment: assessment,
    baselineScoreTrust: { deterministicScore: 50, aiReviewScore: 50, disagreement: 0, effectiveScore: 50, needsHumanAttention: false },
    winnerScoreTrust: { deterministicScore: 60, aiReviewScore: 60, disagreement: 0, effectiveScore: 60, needsHumanAttention: false },
    baselineAggregateScore: baselineAggregate,
    winnerAggregateScore: winnerAggregate,
    aggregateDelta,
    baselineWon,
    winnerCandidateId: baselineWon ? 'baseline' : 'candidate-1',
    winnerCandidateKind,
    winnerStrategyLabel: baselineWon ? 'baseline' : 'winner',
    dominantTags,
    dominantPenalties,
    telemetry: {
      formatKey: caseInput.notes.formatKey || 'marketplace-card',
      formatFamily: 'square',
      aspectMode: caseInput.notes.format,
      baselineCandidateId: 'baseline',
      baselineAggregateScore: baselineAggregate,
      baselineConfidence: { effectiveScore: 50, disagreement: 0, needsHumanAttention: false },
      winnerCandidateId: baselineWon ? 'baseline' : 'candidate-1',
      winnerCandidateKind,
      winnerStrategyLabel: baselineWon ? 'baseline' : 'winner',
      winnerAggregateScore: winnerAggregate,
      winnerDeltaVsBaseline: aggregateDelta,
      winnerConfidence: { effectiveScore: 60, disagreement: 0, needsHumanAttention: false },
      winnerConfidenceDelta: input?.winnerConfidenceDelta ?? 0,
      baselineWon,
      candidateBudgetUsage: {
        configured: 8,
        nonBaselineEvaluated: 2,
        totalEvaluated: 3,
        remaining: 6,
        combinationConfigured: 2,
        combinationEvaluated: 1,
      },
      dominantTags,
      dominantPenalties,
      candidates: [
        {
          candidateId: 'baseline',
          strategyLabel: 'baseline',
          candidateKind: 'baseline',
          structuralStatus: 'valid',
          aggregateScore: baselineAggregate,
          aggregateDelta: 0,
          accepted: baselineWon,
          rejectionReasons: [],
          gateOutcomes: {
            repeatSuppressed: false,
            legacySafetyRejected: false,
            hardStructuralInvalidity: false,
            rolePlacementOutOfZone: false,
            spacingThresholdExceeded: false,
            confidenceCollapse: false,
            aggregateBelowBaseline: false,
            noNetGain: false,
          },
          summaryTags: dominantTags,
          penaltyTags: [],
          confidence: {
            effectiveScore: 50,
            disagreement: 0,
            needsHumanAttention: false,
          },
          confidenceDelta: 0,
        },
        {
          candidateId: 'candidate-1',
          strategyLabel: 'winner',
          candidateKind: winnerCandidateKind,
          structuralStatus: 'valid',
          aggregateScore: winnerAggregate,
          aggregateDelta,
          accepted: !baselineWon,
          rejectionReasons: baselineWon ? rejectionReasons : [],
          gateOutcomes: {
            repeatSuppressed: false,
            legacySafetyRejected: false,
            hardStructuralInvalidity: false,
            rolePlacementOutOfZone: false,
            spacingThresholdExceeded: baselineWon,
            confidenceCollapse: false,
            aggregateBelowBaseline: baselineWon,
            noNetGain: baselineWon,
          },
          summaryTags: dominantTags,
          penaltyTags: dominantPenalties,
          confidence: {
            effectiveScore: 60,
            disagreement: 0,
            needsHumanAttention: false,
          },
          confidenceDelta: input?.winnerConfidenceDelta ?? 0,
        },
      ],
    },
    calibration: {
      formatKey: caseInput.notes.formatKey || 'marketplace-card',
      formatFamily: 'square',
      aspectMode: caseInput.notes.format,
      thresholds: {
        minAggregateGain: 0.75,
        maxConfidenceRegression: 8,
        maxSpacingViolationIncrease: 1,
        maxSpacingGapDeficitIncrease: 1.2,
        allowRolePlacement: false,
      },
      objectiveProfile: {
        weights: {
          structuralValidity: 0.35,
          perceptualQuality: 0.25,
          commercialStrength: 0.15,
          familyFidelity: 0.15,
          sideEffectCost: 0.1,
        },
        perceptualWeights: {
          cluster: 0.2,
          cta: 0.2,
          balance: 0.2,
          deadSpaceQuality: 0.15,
          readingFlow: 0.15,
          overall: 0.1,
        },
        sideEffectWeights: {
          disagreement: 1,
          deadSpace: 1,
          unresolved: 1,
          high: 1,
          critical: 1,
          geometry: 1,
          clusterRegression: 1,
          balanceRegression: 1,
          readingFlowRegression: 1,
          ctaDisconnectRegression: 1,
          verticalSeparationRegression: 1,
          inactiveSideRegression: 1,
        },
      },
      baseline: objective(baselineAggregate, 0, false, 'baseline', 'baseline'),
      winner: objective(winnerAggregate, aggregateDelta, !baselineWon, winnerCandidateKind, baselineWon ? 'baseline' : 'winner'),
      candidateComparisons: [
        objective(baselineAggregate, 0, false, 'baseline', 'baseline'),
        objective(winnerAggregate, aggregateDelta, !baselineWon, winnerCandidateKind, baselineWon ? 'baseline' : 'winner'),
      ],
    },
    diagnosticsSummary: {
      finalChanged: !baselineWon,
      acceptedImprovement: !baselineWon,
      attemptCount: 2,
      regenerationCandidateCount: 0,
      classification: 'mixed',
      searchRunCount: 1,
    },
  } as unknown as CalibrationCaseExecutionSummary
}

afterEach(async () => {
  while (TEMP_ROOTS.length) {
    const root = TEMP_ROOTS.pop()
    if (!root) continue
    await rm(root, { recursive: true, force: true })
  }
})

describe('calibration review outputs', () => {
  it('preserves category in case and dataset review reports', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { category: 'cta', folder: 'square', id: 'case-cta-001' })

    const result = await runCalibrationDataset({
      root,
      mode: 'lenient',
      executor: async (caseInput) => createFakeExecutionSummary(caseInput),
    })

    const caseReport = JSON.parse(
      await readFile(path.join(root, 'cta', 'square', 'case-cta-001', 'report.json'), 'utf8')
    )
    expect(caseReport.category).toBe('cta')
    expect(result.report.summary.perCategoryCounts.cta).toBe(1)
    expect(result.reviewReport.averageScoreDeltaByCategory[0]?.key).toBe('cta')
  })

  it('computes review priority and escalates negative deltas', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { category: 'structure', folder: 'square', id: 'case-negative' })

    const result = await runCalibrationDataset({
      root,
      mode: 'lenient',
      executor: async (caseInput) =>
        createFakeExecutionSummary(caseInput, {
          baselineWon: false,
          baselineAggregate: 42,
          winnerAggregate: 38,
          dominantTags: ['structural-drift'],
          dominantPenalties: ['family-mismatch'],
        }),
    })

    expect(result.report.cases[0]?.reviewPriority).toBe('urgent-review')
    expect(result.reviewReport.casesToReviewFirst[0]?.caseId).toBe('case-negative')
  })

  it('populates verdict agreement fields when verdict.json exists', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, {
      category: 'balance',
      folder: 'square',
      id: 'case-agreement',
      verdict: {
        fixedVsBaseline: 'better',
        humanAcceptedWinner: true,
      },
    })

    const result = await runCalibrationDataset({
      root,
      mode: 'lenient',
      executor: async (caseInput) => createFakeExecutionSummary(caseInput, { baselineWon: false }),
    })

    const caseResult = result.report.cases[0]
    expect(caseResult?.humanVerdictPresent).toBe(true)
    expect(caseResult?.machineHumanAgreement).toBe(true)
    expect(caseResult?.agreementType).toBe('machine-and-human-picked-winner')
  })

  it('builds a sorted review queue and aggregates by category and format', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { category: 'spacing', folder: 'square', id: 'case-spacing' })
    await createCase(root, { category: 'balance', folder: 'landscape', id: 'case-balance', notes: { format: 'landscape' } })
    await createCase(root, { category: 'cta', folder: 'portrait', id: 'case-cta', notes: { format: 'portrait' } })

    const result = await runCalibrationDataset({
      root,
      mode: 'lenient',
      reviewConfig: {
        reviewQueueSize: 2,
      },
      executor: async (caseInput) => {
        if (caseInput.id === 'case-spacing') {
          return createFakeExecutionSummary(caseInput, {
            baselineWon: false,
            baselineAggregate: 44,
            winnerAggregate: 40,
            dominantTags: ['insufficient-breathing-room'],
          })
        }
        if (caseInput.id === 'case-balance') {
          return createFakeExecutionSummary(caseInput, {
            baselineWon: true,
            dominantPenalties: ['inactive-empty-space'],
          })
        }
        return createFakeExecutionSummary(caseInput, {
          baselineWon: false,
          baselineAggregate: 40,
          winnerAggregate: 41,
          winnerConfidenceDelta: -7,
        })
      },
    })

    expect(result.reviewReport.casesToReviewFirst).toHaveLength(2)
    expect(result.reviewReport.casesToReviewFirst[0]?.caseId).toBe('case-spacing')
    expect(result.reviewReport.averageScoreDeltaByFormat.map((entry) => entry.key)).toEqual(
      expect.arrayContaining(['square', 'landscape', 'portrait'])
    )
    expect(result.reviewReport.topCategoriesNeedingReview[0]?.category).toBeTruthy()
  })

  it('generates deterministic short summaries', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { category: 'cta', folder: 'square', id: 'case-baseline-retained' })

    const result = await runCalibrationDataset({
      root,
      mode: 'lenient',
      executor: async (caseInput) =>
        createFakeExecutionSummary(caseInput, {
          baselineWon: true,
          dominantPenalties: ['weak-image-footprint'],
          rejectionReasons: ['spacing-threshold-exceeded'],
        }),
    })

    expect(result.report.cases[0]?.shortSummary).toBe(
      'Baseline retained; candidates were blocked by spacing-threshold-exceeded or failed to deliver a safe net gain.'
    )
  })
})
