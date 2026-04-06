import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type {
  CalibrationCaseExecutionSummary,
  CalibrationCaseInput,
  CalibrationCaseNotes,
} from './calibrationCaseSchema'
import { parseCalibrationDataset } from './calibrationDataset'
import { runCalibrationDataset } from './calibrationRunner'

const TEMP_ROOTS: string[] = []
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbWQAAAAASUVORK5CYII=',
  'base64'
)

async function createTempDatasetRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'calibration-dataset-'))
  TEMP_ROOTS.push(root)
  return root
}

async function createCase(
  root: string,
  input: {
    folder: 'square' | 'landscape' | 'portrait'
    id: string
    notes?: Partial<CalibrationCaseNotes>
    notesRaw?: string
    includeInput?: boolean
    verdict?: Record<string, unknown>
  }
) {
  const caseDir = path.join(root, input.folder, input.id)
  await mkdir(caseDir, { recursive: true })
  if (input.notesRaw !== undefined) {
    await writeFile(path.join(caseDir, 'notes.json'), input.notesRaw, 'utf8')
  } else {
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
  }
  if (input.includeInput !== false) {
    await writeFile(path.join(caseDir, 'input.png'), PNG_1X1)
  }
  if (input.verdict) {
    await writeFile(path.join(caseDir, 'verdict.json'), JSON.stringify(input.verdict, null, 2), 'utf8')
  }
  return caseDir
}

function createFakeExecutionSummary(caseInput: CalibrationCaseInput, input?: {
  baselineWon?: boolean
  baselineAggregate?: number
  winnerAggregate?: number
  winnerCandidateKind?: string
}) {
  const baselineWon = Boolean(input?.baselineWon)
  const baselineAggregate = input?.baselineAggregate ?? 40
  const winnerAggregate = baselineWon ? baselineAggregate : (input?.winnerAggregate ?? 52)
  const aggregateDelta = winnerAggregate - baselineAggregate
  const winnerCandidateKind = baselineWon ? 'baseline' : (input?.winnerCandidateKind || 'local-structural-repair')
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
    summaryTags: ['structured'],
    penaltyTags: ['weak-balance'],
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
    dominantTags: ['structured'],
    dominantPenalties: ['weak-balance'],
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
      winnerConfidenceDelta: 0,
      baselineWon,
      candidateBudgetUsage: {
        configured: 8,
        nonBaselineEvaluated: 1,
        totalEvaluated: 2,
        remaining: 7,
        combinationConfigured: 2,
        combinationEvaluated: 0,
      },
      dominantTags: ['structured'],
      dominantPenalties: ['weak-balance'],
      candidates: [],
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
      attemptCount: 1,
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

describe('calibration dataset pipeline', () => {
  it('parses a valid calibration case', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { folder: 'square', id: 'case-001-organics' })

    const parsed = await parseCalibrationDataset({ root, mode: 'lenient' })

    expect(parsed.cases).toHaveLength(1)
    expect(parsed.parseErrors).toHaveLength(0)
    expect(parsed.cases[0].notes.id).toBe('case-001-organics')
    expect(parsed.cases[0].folderFormat).toBe('square')
  })

  it('reports invalid notes.json parsing clearly', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, {
      folder: 'square',
      id: 'case-001-organics',
      notesRaw: '{"id":"case-001-organics","family":"marketplace",',
    })

    const parsed = await parseCalibrationDataset({ root, mode: 'lenient' })

    expect(parsed.cases).toHaveLength(0)
    expect(parsed.parseErrors[0]?.code).toBe('invalid-json')
  })

  it('reports missing input assets', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { folder: 'square', id: 'case-001-organics', includeInput: false })

    const parsed = await parseCalibrationDataset({ root, mode: 'lenient' })

    expect(parsed.cases).toHaveLength(0)
    expect(parsed.parseErrors.some((error) => error.code === 'missing-input-asset')).toBe(true)
  })

  it('supports strict and lenient parsing modes', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { folder: 'square', id: 'case-valid' })
    await createCase(root, { folder: 'square', id: 'case-invalid', includeInput: false })

    const lenient = await parseCalibrationDataset({ root, mode: 'lenient' })
    const strict = await parseCalibrationDataset({ root, mode: 'strict' })

    expect(lenient.shouldAbortExecution).toBe(false)
    expect(lenient.cases).toHaveLength(1)
    expect(strict.shouldAbortExecution).toBe(true)
    expect(strict.cases).toHaveLength(1)
  })

  it('writes expected artifacts for a successful batch run', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { folder: 'square', id: 'case-001-organics' })

    const result = await runCalibrationDataset({
      root,
      mode: 'lenient',
      executor: async (caseInput) => createFakeExecutionSummary(caseInput),
    })

    const caseDir = path.join(root, 'square', 'case-001-organics')
    for (const filename of ['baseline.json', 'winner.json', 'telemetry.json', 'calibration.json', 'report.json']) {
      const content = await readFile(path.join(caseDir, filename), 'utf8')
      expect(content.length).toBeGreaterThan(0)
    }
    expect(await readFile(result.reportPath, 'utf8')).toContain('"summary"')
  })

  it('preserves verdict.json during batch runs', async () => {
    const root = await createTempDatasetRoot()
    const verdict = {
      fixedVsBaseline: 'better',
      humanAcceptedWinner: true,
      notes: 'keep me',
    }
    const caseDir = await createCase(root, { folder: 'square', id: 'case-001-organics', verdict })

    await runCalibrationDataset({
      root,
      mode: 'lenient',
      executor: async (caseInput) => createFakeExecutionSummary(caseInput),
    })

    const afterVerdict = JSON.parse(await readFile(path.join(caseDir, 'verdict.json'), 'utf8'))
    expect(afterVerdict).toEqual(verdict)
  })

  it('builds a dataset summary report across success and failure cases', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { folder: 'square', id: 'case-success' })
    await createCase(root, { folder: 'square', id: 'case-failure' })
    await createCase(root, { folder: 'portrait', id: 'case-parse-error', includeInput: false })

    const result = await runCalibrationDataset({
      root,
      mode: 'lenient',
      executor: async (caseInput) => {
        if (caseInput.id === 'case-failure') throw new Error('boom')
        return createFakeExecutionSummary(caseInput, { baselineWon: caseInput.id === 'case-success' })
      },
    })

    expect(result.report.summary.successCount).toBe(1)
    expect(result.report.summary.executionErrorCount).toBe(1)
    expect(result.report.summary.parseErrorCount).toBe(1)
    expect(result.report.summary.failedCases.length).toBeGreaterThan(0)
  })

  it('filters by format, family, and case id', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { folder: 'square', id: 'case-marketplace', notes: { family: 'marketplace' } })
    await createCase(root, { folder: 'landscape', id: 'case-social', notes: { family: 'social', format: 'landscape' } })

    const byFormat = await runCalibrationDataset({
      root,
      mode: 'lenient',
      filter: { format: 'square' },
      executor: async (caseInput) => createFakeExecutionSummary(caseInput),
    })
    const byFamily = await runCalibrationDataset({
      root,
      mode: 'lenient',
      filter: { family: 'social' },
      executor: async (caseInput) => createFakeExecutionSummary(caseInput),
    })
    const byCase = await runCalibrationDataset({
      root,
      mode: 'lenient',
      filter: { caseId: 'case-marketplace' },
      executor: async (caseInput) => createFakeExecutionSummary(caseInput),
    })

    expect(byFormat.report.summary.executedCases).toBe(1)
    expect(byFamily.report.summary.executedCases).toBe(1)
    expect(byCase.report.summary.executedCases).toBe(1)
    expect(byCase.report.cases[0]?.caseId).toBe('case-marketplace')
  })

  it('captures execution failures without crashing lenient mode', async () => {
    const root = await createTempDatasetRoot()
    await createCase(root, { folder: 'square', id: 'case-success' })
    await createCase(root, { folder: 'square', id: 'case-execution-error' })

    const result = await runCalibrationDataset({
      root,
      mode: 'lenient',
      executor: async (caseInput) => {
        if (caseInput.id === 'case-execution-error') throw new Error('executor failed')
        return createFakeExecutionSummary(caseInput, {
          baselineWon: false,
          winnerCandidateKind: 'guided-regeneration-repair',
        })
      },
    })

    expect(result.report.summary.successCount).toBe(1)
    expect(result.report.summary.executionErrorCount).toBe(1)
    expect(result.shouldFail).toBe(false)
    expect(result.report.cases.some((entry) => entry.status === 'execution-error')).toBe(true)
  })
})
