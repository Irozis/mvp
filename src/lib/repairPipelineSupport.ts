/**
 * Repair pipeline internals re-exported from autoAdapt for repairOrchestrator.
 * Keeps repairOrchestrator from importing autoAdapt.ts directly.
 */
export type {
  AutoFixStructuralEscalationContext,
  RepairAttempt,
  RepairDiagnostics,
  RepairRegenerationCandidateDiagnostics,
} from './autoAdapt'

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
  clone,
  collectFixActions,
  createRepairAttemptSignature,
  createRepairSceneSignature,
  evaluateRepairScene,
  evaluateRepairSceneSync,
  getDefaultPreviewCandidateBudget,
  getStructuralTierRank,
  logRepairAttemptSummary,
  pickBestAcceptedRepair,
  pickPrimaryStructuralEscalationCandidate,
  selectBestPreviewCandidate,
  selectRepairSearchWinner,
  shouldAllowAnotherFix,
  shouldStartWithLocalRepair,
  supportsPrimaryStructuralEscalation,
  toRepairAttemptDiagnostics,
  toRepairRegenerationCandidateDiagnostics,
  unique,
  unresolvedIssueCount,
} from './autoAdapt'
