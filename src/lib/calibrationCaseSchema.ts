import type {
  BrandTemplateKey,
  FormatKey,
  GoalKey,
  ImageProfile,
  LayoutAssessment,
  RepairCalibrationSnapshot,
  RepairSearchConfigOverride,
  RepairSearchTelemetry,
  ScoreTrust,
  Scene,
  TemplateKey,
  VisualSystemKey,
} from './types'

export type CalibrationCaseFormat = 'square' | 'landscape' | 'portrait'

export type CalibrationCaseStatus = 'success' | 'parse-error' | 'execution-error' | 'skipped'

export type CalibrationCaseNotes = {
  id: string
  family: string
  format: CalibrationCaseFormat
  source: string
  category?: string
  expectedProblems: string[]
  expectedBehavior: string[]
  tags: string[]
  comment?: string
  formatKey?: FormatKey
  template?: TemplateKey
  visualSystem?: VisualSystemKey
  goal?: GoalKey
  brandTemplateKey?: BrandTemplateKey
  imageProfile?: ImageProfile
  content?: Partial<{
    title: string
    subtitle: string
    cta: string
    badge: string
  }>
  repairConfig?: RepairSearchConfigOverride
}

export type CalibrationCaseVerdict = {
  fixedVsBaseline: 'better' | 'same' | 'worse'
  humanAcceptedWinner: boolean
  baselineHumanVerdict?: 'good' | 'acceptable' | 'bad'
  fixedHumanVerdict?: 'good' | 'acceptable' | 'bad'
  reasonTags?: string[]
  notes?: string
}

export type CalibrationInputAsset = {
  path: string
  filename: string
  extension: 'png' | 'jpg' | 'jpeg'
  mimeType: 'image/png' | 'image/jpeg'
  sizeBytes: number
  width?: number
  height?: number
}

export type CalibrationCaseInput = {
  id: string
  caseDir: string
  relativeDir: string
  folderFormat: CalibrationCaseFormat
  category: string
  notesPath: string
  inputAsset: CalibrationInputAsset
  verdictPath?: string
  notes: CalibrationCaseNotes
  verdict?: CalibrationCaseVerdict
}

export type CalibrationParseError = {
  caseId: string
  caseDir: string
  filePath?: string
  code:
    | 'root-invalid'
    | 'missing-notes'
    | 'missing-input-asset'
    | 'multiple-input-assets'
    | 'invalid-json'
    | 'invalid-schema'
    | 'folder-format-mismatch'
    | 'id-mismatch'
    | 'unsupported-format-family'
    | 'invalid-verdict'
  message: string
}

export type CalibrationCaseArtifactPaths = {
  input: string
  notes: string
  verdict?: string
  baseline?: string
  winner?: string
  telemetry?: string
  calibration?: string
  report?: string
  previewBaseline?: string
  previewWinner?: string
}

export type CalibrationCaseExecutionSummary = {
  formatKey: FormatKey
  baselineScene: Scene
  winnerScene: Scene
  baselineAssessment: LayoutAssessment
  winnerAssessment: LayoutAssessment
  baselineScoreTrust: ScoreTrust
  winnerScoreTrust: ScoreTrust
  baselineAggregateScore: number
  winnerAggregateScore: number
  aggregateDelta: number
  baselineWon: boolean
  winnerCandidateId: string
  winnerCandidateKind: string
  winnerStrategyLabel: string
  dominantTags: string[]
  dominantPenalties: string[]
  telemetry: RepairSearchTelemetry
  calibration: RepairCalibrationSnapshot
  diagnosticsSummary: {
    finalChanged: boolean
    acceptedImprovement: boolean
    attemptCount: number
    regenerationCandidateCount: number
    classification: string
    searchRunCount: number
  }
}

export type CalibrationCaseRunResult = {
  caseId: string
  caseDir: string
  relativeDir: string
  status: CalibrationCaseStatus
  category?: string
  family?: string
  format?: CalibrationCaseFormat
  formatKey?: FormatKey
  artifactPaths: CalibrationCaseArtifactPaths
  baselineAggregate?: number
  winnerAggregate?: number
  aggregateDelta?: number
  baselineWon?: boolean
  winnerAccepted?: boolean
  winnerCandidateKind?: string
  winnerStrategyLabel?: string
  baselineConfidence?: number
  winnerConfidence?: number
  winnerConfidenceDelta?: number
  candidateCount?: number
  rejectedCandidateCount?: number
  topRejectionReasons?: string[]
  dominantTags: string[]
  dominantPenalties: string[]
  reviewPriority?: 'urgent-review' | 'high-review' | 'medium-review' | 'low-review'
  reviewScore?: number
  whyReview?: string
  shortSummary?: string
  humanVerdictPresent?: boolean
  fixedVsBaseline?: CalibrationCaseVerdict['fixedVsBaseline']
  humanAcceptedWinner?: boolean
  machineHumanAgreement?: boolean | null
  agreementType?: string | null
  parseErrors?: CalibrationParseError[]
  executionError?: {
    name: string
    message: string
  }
}

export type CalibrationDatasetSummary = {
  totalCasesFound: number
  validCases: number
  invalidCases: number
  executedCases: number
  successCount: number
  parseErrorCount: number
  executionErrorCount: number
  skippedCount: number
  baselineWinCount: number
  candidateWinCount: number
  perFormatCounts: Record<CalibrationCaseFormat, number>
  perCategoryCounts: Record<string, number>
  perFamilyCounts: Record<string, number>
  aggregateDelta: {
    total: number
    average: number
    max: number
    min: number
  }
  averageWinnerGain: number
  topRejectionReasons: Array<{ reason: string; count: number }>
  topDominantTags: Array<{ tag: string; count: number }>
  candidateKindWinDistribution: Array<{ candidateKind: string; count: number }>
  failedCases: Array<{ caseId: string; status: CalibrationCaseStatus; reason: string }>
}

export type CalibrationDatasetReport = {
  generatedAt: string
  root: string
  strictMode: boolean
  filters: {
    family?: string
    format?: CalibrationCaseFormat
    caseId?: string
    limit?: number
  }
  previewGeneration: {
    requested: boolean
    supported: boolean
    generated: boolean
    reason?: string
  }
  summary: CalibrationDatasetSummary
  cases: CalibrationCaseRunResult[]
  parseErrors: CalibrationParseError[]
}

export type CalibrationDatasetFilter = {
  family?: string
  format?: CalibrationCaseFormat
  caseId?: string
  limit?: number
}

export type CalibrationDatasetParseMode = 'strict' | 'lenient'

export type CalibrationDatasetParseResult = {
  root: string
  strictMode: boolean
  cases: CalibrationCaseInput[]
  parseErrors: CalibrationParseError[]
  totalCasesFound: number
  shouldAbortExecution: boolean
}

export type CalibrationSchemaParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: CalibrationParseError[] }

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function buildSchemaError(
  code: CalibrationParseError['code'],
  caseDir: string,
  filePath: string,
  message: string,
  caseId = 'unknown'
): CalibrationParseError {
  return {
    caseId,
    caseDir,
    filePath,
    code,
    message,
  }
}

function requireString(
  input: Record<string, unknown>,
  key: string,
  caseDir: string,
  filePath: string,
  caseId: string,
  errors: CalibrationParseError[]
) {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(
      buildSchemaError('invalid-schema', caseDir, filePath, `Field "${key}" must be a non-empty string.`, caseId)
    )
    return undefined
  }
  return value.trim()
}

export function parseCalibrationCaseNotes(
  raw: unknown,
  input: { caseDir: string; filePath: string }
): CalibrationSchemaParseResult<CalibrationCaseNotes> {
  if (!isObject(raw)) {
    return {
      ok: false,
      errors: [
        buildSchemaError('invalid-schema', input.caseDir, input.filePath, 'notes.json must contain a JSON object.'),
      ],
    }
  }

  const provisionalCaseId =
    typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : 'unknown'
  const errors: CalibrationParseError[] = []
  const id = requireString(raw, 'id', input.caseDir, input.filePath, provisionalCaseId, errors)
  const family = requireString(raw, 'family', input.caseDir, input.filePath, provisionalCaseId, errors)
  const source = requireString(raw, 'source', input.caseDir, input.filePath, provisionalCaseId, errors)
  const category =
    raw.category === undefined
      ? undefined
      : typeof raw.category === 'string' && raw.category.trim()
        ? raw.category.trim()
        : undefined
  const formatValue = raw.format
  const format =
    formatValue === 'square' || formatValue === 'landscape' || formatValue === 'portrait'
      ? formatValue
      : undefined

  if (!format) {
    errors.push(
      buildSchemaError(
        'invalid-schema',
        input.caseDir,
        input.filePath,
        'Field "format" must be one of: square, landscape, portrait.',
        provisionalCaseId
      )
    )
  }

  if (
    raw.category !== undefined &&
    !(typeof raw.category === 'string' && raw.category.trim())
  ) {
    errors.push(
      buildSchemaError(
        'invalid-schema',
        input.caseDir,
        input.filePath,
        'Field "category" must be a non-empty string when provided.',
        provisionalCaseId
      )
    )
  }

  const expectedProblems = raw.expectedProblems === undefined ? [] : raw.expectedProblems
  const expectedBehavior = raw.expectedBehavior === undefined ? [] : raw.expectedBehavior
  const tags = raw.tags === undefined ? [] : raw.tags

  if (!asStringArray(expectedProblems)) {
    errors.push(
      buildSchemaError(
        'invalid-schema',
        input.caseDir,
        input.filePath,
        'Field "expectedProblems" must be an array of strings.',
        provisionalCaseId
      )
    )
  }
  if (!asStringArray(expectedBehavior)) {
    errors.push(
      buildSchemaError(
        'invalid-schema',
        input.caseDir,
        input.filePath,
        'Field "expectedBehavior" must be an array of strings.',
        provisionalCaseId
      )
    )
  }
  if (!asStringArray(tags)) {
    errors.push(
      buildSchemaError(
        'invalid-schema',
        input.caseDir,
        input.filePath,
        'Field "tags" must be an array of strings.',
        provisionalCaseId
      )
    )
  }

  const contentValue = raw.content
  if (contentValue !== undefined && !isObject(contentValue)) {
    errors.push(
      buildSchemaError(
        'invalid-schema',
        input.caseDir,
        input.filePath,
        'Field "content" must be an object when provided.',
        provisionalCaseId
      )
    )
  }

  if (errors.length || !id || !family || !source || !format) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: {
      id,
      family,
      format,
      source,
      category,
      expectedProblems: expectedProblems as string[],
      expectedBehavior: expectedBehavior as string[],
      tags: tags as string[],
      comment: typeof raw.comment === 'string' && raw.comment.trim() ? raw.comment.trim() : undefined,
      formatKey: typeof raw.formatKey === 'string' ? (raw.formatKey as FormatKey) : undefined,
      template: typeof raw.template === 'string' ? (raw.template as TemplateKey) : undefined,
      visualSystem: typeof raw.visualSystem === 'string' ? (raw.visualSystem as VisualSystemKey) : undefined,
      goal: typeof raw.goal === 'string' ? (raw.goal as GoalKey) : undefined,
      brandTemplateKey:
        typeof raw.brandTemplateKey === 'string' ? (raw.brandTemplateKey as BrandTemplateKey) : undefined,
      imageProfile: typeof raw.imageProfile === 'string' ? (raw.imageProfile as ImageProfile) : undefined,
      content: isObject(contentValue)
        ? {
            title: typeof contentValue.title === 'string' ? contentValue.title : undefined,
            subtitle: typeof contentValue.subtitle === 'string' ? contentValue.subtitle : undefined,
            cta: typeof contentValue.cta === 'string' ? contentValue.cta : undefined,
            badge: typeof contentValue.badge === 'string' ? contentValue.badge : undefined,
          }
        : undefined,
      repairConfig: isObject(raw.repairConfig) ? (raw.repairConfig as RepairSearchConfigOverride) : undefined,
    },
  }
}

export function parseCalibrationCaseVerdict(
  raw: unknown,
  input: { caseDir: string; filePath: string; caseId: string }
): CalibrationSchemaParseResult<CalibrationCaseVerdict> {
  if (!isObject(raw)) {
    return {
      ok: false,
      errors: [
        buildSchemaError(
          'invalid-verdict',
          input.caseDir,
          input.filePath,
          'verdict.json must contain a JSON object.',
          input.caseId
        ),
      ],
    }
  }

  const errors: CalibrationParseError[] = []
  const fixedVsBaseline =
    raw.fixedVsBaseline === 'better' || raw.fixedVsBaseline === 'same' || raw.fixedVsBaseline === 'worse'
      ? raw.fixedVsBaseline
      : undefined
  if (!fixedVsBaseline) {
    errors.push(
      buildSchemaError(
        'invalid-verdict',
        input.caseDir,
        input.filePath,
        'Field "fixedVsBaseline" must be one of: better, same, worse.',
        input.caseId
      )
    )
  }

  if (typeof raw.humanAcceptedWinner !== 'boolean') {
    errors.push(
      buildSchemaError(
        'invalid-verdict',
        input.caseDir,
        input.filePath,
        'Field "humanAcceptedWinner" must be a boolean.',
        input.caseId
      )
    )
  }

  if (raw.reasonTags !== undefined && !asStringArray(raw.reasonTags)) {
    errors.push(
      buildSchemaError(
        'invalid-verdict',
        input.caseDir,
        input.filePath,
        'Field "reasonTags" must be an array of strings when provided.',
        input.caseId
      )
    )
  }

  const humanVerdictValues = ['good', 'acceptable', 'bad']
  for (const key of ['baselineHumanVerdict', 'fixedHumanVerdict'] as const) {
    const value = raw[key]
    if (value !== undefined && (typeof value !== 'string' || !humanVerdictValues.includes(value))) {
      errors.push(
        buildSchemaError(
          'invalid-verdict',
          input.caseDir,
          input.filePath,
          `Field "${key}" must be one of: good, acceptable, bad.`,
          input.caseId
        )
      )
    }
  }

  if (errors.length || !fixedVsBaseline || typeof raw.humanAcceptedWinner !== 'boolean') {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: {
      fixedVsBaseline,
      humanAcceptedWinner: raw.humanAcceptedWinner,
      baselineHumanVerdict:
        typeof raw.baselineHumanVerdict === 'string'
          ? (raw.baselineHumanVerdict as 'good' | 'acceptable' | 'bad')
          : undefined,
      fixedHumanVerdict:
        typeof raw.fixedHumanVerdict === 'string'
          ? (raw.fixedHumanVerdict as 'good' | 'acceptable' | 'bad')
          : undefined,
      reasonTags: Array.isArray(raw.reasonTags) ? (raw.reasonTags as string[]) : undefined,
      notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined,
    },
  }
}
