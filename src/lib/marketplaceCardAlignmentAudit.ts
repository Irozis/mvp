import type {
  MarketplaceCardTemplateId,
  MarketplaceCardTemplateSelectionResult,
  StructuralLayoutStatus,
  VisualAssessmentBand,
} from './types'

export type MarketplaceCardRuntimeCandidateSnapshot = {
  templateId: MarketplaceCardTemplateId | 'n/a'
  strategyLabel: string
  structuralStatus: StructuralLayoutStatus
  effectiveScore: number
  visualScore: number
  visualBand: VisualAssessmentBand
  highStructuralFindingCount: number
  criticalIssueCount: number
  highIssueCount: number
  issueCount: number
}

export type MarketplaceCardSemanticRuntimeAlignmentStatus =
  | 'aligned'
  | 'acceptable-drift'
  | 'suspicious-drift'

export type MarketplaceCardSemanticRuntimeDriftReason =
  | 'structural-safety-override'
  | 'visual-quality-rerank'
  | 'near-equal-runtime-boundary'
  | 'image-regime-incompatibility'
  | 'template-variant-underperformance'
  | 'weak-template-boundary'
  | 'semantic-scoring-too-weak'
  | 'insufficient-commercial-metadata'

export type MarketplaceCardSemanticRuntimeAlignment = {
  status: MarketplaceCardSemanticRuntimeAlignmentStatus
  reasons: MarketplaceCardSemanticRuntimeDriftReason[]
  summary: string
  semanticPrimaryTemplateId: MarketplaceCardTemplateId
  runtimeWinnerTemplateId: MarketplaceCardTemplateId | 'n/a'
  semanticPrimaryRuntimeCandidate?: MarketplaceCardRuntimeCandidateSnapshot
  semanticPrimarySemanticScore?: number
  runtimeWinnerSemanticScore?: number
}

function getStructuralTierRank(status: StructuralLayoutStatus) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

function findSemanticScore(
  selection: MarketplaceCardTemplateSelectionResult,
  templateId: MarketplaceCardTemplateId | 'n/a'
) {
  if (templateId === 'n/a') return undefined
  return selection.debug?.rankedTemplates.find((entry) => entry.templateId === templateId)?.totalScore
}

function uniqueReasons(reasons: MarketplaceCardSemanticRuntimeDriftReason[]) {
  return Array.from(new Set(reasons))
}

export function classifyMarketplaceCardSemanticRuntimeAlignment(input: {
  selection: MarketplaceCardTemplateSelectionResult
  runtimeWinner: MarketplaceCardRuntimeCandidateSnapshot
  runtimeCandidates: MarketplaceCardRuntimeCandidateSnapshot[]
}): MarketplaceCardSemanticRuntimeAlignment {
  const semanticPrimaryTemplateId = input.selection.selectedTemplateId
  const runtimeWinnerTemplateId = input.runtimeWinner.templateId
  const semanticPrimaryRuntimeCandidate = input.runtimeCandidates.find(
    (candidate) => candidate.templateId === semanticPrimaryTemplateId
  )
  const semanticPrimarySemanticScore = findSemanticScore(input.selection, semanticPrimaryTemplateId)
  const runtimeWinnerSemanticScore = findSemanticScore(input.selection, runtimeWinnerTemplateId)

  if (semanticPrimaryTemplateId === runtimeWinnerTemplateId) {
    return {
      status: 'aligned',
      reasons: [],
      summary: `${semanticPrimaryTemplateId} stayed aligned from semantic selection into runtime winner.`,
      semanticPrimaryTemplateId,
      runtimeWinnerTemplateId,
      semanticPrimaryRuntimeCandidate,
      semanticPrimarySemanticScore,
      runtimeWinnerSemanticScore,
    }
  }

  const reasons: MarketplaceCardSemanticRuntimeDriftReason[] = []
  const runnerUpGap =
    input.selection.debug?.rankedTemplates && input.selection.debug.rankedTemplates.length > 1
      ? input.selection.debug.rankedTemplates[0].totalScore - input.selection.debug.rankedTemplates[1].totalScore
      : undefined

  if (!semanticPrimaryRuntimeCandidate) {
    reasons.push('weak-template-boundary')
  } else {
    const tierDelta =
      getStructuralTierRank(input.runtimeWinner.structuralStatus) -
      getStructuralTierRank(semanticPrimaryRuntimeCandidate.structuralStatus)
    const effectiveDelta = input.runtimeWinner.effectiveScore - semanticPrimaryRuntimeCandidate.effectiveScore
    const visualDelta = input.runtimeWinner.visualScore - semanticPrimaryRuntimeCandidate.visualScore
    const criticalIssueDelta =
      semanticPrimaryRuntimeCandidate.criticalIssueCount - input.runtimeWinner.criticalIssueCount
    const highIssueDelta =
      semanticPrimaryRuntimeCandidate.highIssueCount - input.runtimeWinner.highIssueCount

    if (
      tierDelta > 0 ||
      input.runtimeWinner.criticalIssueCount < semanticPrimaryRuntimeCandidate.criticalIssueCount ||
      input.runtimeWinner.highStructuralFindingCount < semanticPrimaryRuntimeCandidate.highStructuralFindingCount ||
      input.runtimeWinner.highIssueCount < semanticPrimaryRuntimeCandidate.highIssueCount
    ) {
      reasons.push('structural-safety-override')
    }

    if (
      tierDelta === 0 &&
      Math.abs(effectiveDelta) <= 4 &&
      visualDelta >= 4
    ) {
      reasons.push('visual-quality-rerank')
    }

    if (
      tierDelta === 0 &&
      effectiveDelta >= 6
    ) {
      reasons.push('template-variant-underperformance')
    }

    if (
      tierDelta === 0 &&
      Math.abs(effectiveDelta) <= 2 &&
      Math.abs(visualDelta) <= 3 &&
      criticalIssueDelta <= 1 &&
      highIssueDelta <= 1
    ) {
      reasons.push('near-equal-runtime-boundary')
    }
  }

  if (
    input.selection.inputProfile.imageRegime === 'no-image' &&
    semanticPrimaryTemplateId === 'product-support-card'
  ) {
    reasons.push('image-regime-incompatibility')
  }

  if (
    input.selection.inputProfile.imageRegime === 'image-backed' &&
    input.selection.inputProfile.productVisualNeed === 'critical' &&
    runtimeWinnerTemplateId === 'product-support-card' &&
    semanticPrimaryTemplateId !== 'product-support-card'
  ) {
    reasons.push('semantic-scoring-too-weak')
  }

  if (runnerUpGap !== undefined && runnerUpGap <= 3) {
    reasons.push('weak-template-boundary')
  }

  if (!reasons.length) {
    reasons.push(
      input.selection.debug?.rankedTemplates?.length
        ? 'semantic-scoring-too-weak'
        : 'insufficient-commercial-metadata'
    )
  }

  const unique = uniqueReasons(reasons)
  const acceptableReasons = new Set<MarketplaceCardSemanticRuntimeDriftReason>([
    'structural-safety-override',
    'visual-quality-rerank',
    'near-equal-runtime-boundary',
    'template-variant-underperformance',
  ])
  const status = unique.some((reason) => acceptableReasons.has(reason))
    ? 'acceptable-drift'
    : 'suspicious-drift'

  return {
    status,
    reasons: unique,
    summary: `${semanticPrimaryTemplateId} drifted to ${runtimeWinnerTemplateId} because ${unique.join(', ')}.`,
    semanticPrimaryTemplateId,
    runtimeWinnerTemplateId,
    semanticPrimaryRuntimeCandidate,
    semanticPrimarySemanticScore,
    runtimeWinnerSemanticScore,
  }
}
