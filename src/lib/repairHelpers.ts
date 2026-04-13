// Repair pipeline helpers.
// Extracted from autoAdapt.ts to break the repair cycle.
// repairOrchestrator imports from here directly.

export type { AutoFixStructuralEscalationContext } from './layoutPipelineCore'

export type {
  RepairAttempt,
  RepairDiagnostics,
  RepairRegenerationCandidateDiagnostics,
} from './autoAdapt'

export {
  clone,
  getDefaultPreviewCandidateBudget,
  getStructuralTierRank,
  selectBestPreviewCandidate,
  unique,
  unresolvedIssueCount,
} from './layoutPipelineCore'

export {
  REPAIR_HISTORY_LIMIT,
  analysisToIssueBuckets,
  attemptGuidedRegenerationRepair,
  attemptLocalStructuralRepair,
  buildFixPlanFromAnalysis,
  buildMarketplaceV2SlotFixBypassOutcome,
  buildPrimaryStructuralEscalationStrategy,
  buildRepairDecision,
  chooseFixStrategy,
  classifyStructuralFailure,
  collectFixActions,
  createRepairAttemptSignature,
  createRepairSceneSignature,
  evaluateRepairScene,
  evaluateRepairSceneSync,
  logRepairAttemptSummary,
  pickBestAcceptedRepair,
  pickPrimaryStructuralEscalationCandidate,
  selectRepairSearchWinner,
  shouldAllowAnotherFix,
  shouldStartWithLocalRepair,
  supportsPrimaryStructuralEscalation,
  toRepairAttemptDiagnostics,
  toRepairRegenerationCandidateDiagnostics,
} from './autoAdapt'
