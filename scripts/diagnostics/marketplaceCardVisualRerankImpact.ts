import { BRAND_TEMPLATES, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, getPreviewCandidateDiagnostics } from '../../src/lib/autoAdapt'
import type { AssetHint, TemplateKey } from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'
process.env.REPAIR_DEBUG = '0'

const templates: TemplateKey[] = ['promo', 'product', 'article']
const sampledBrandImagePairs: Array<{ brandTemplateKey: string; imageProfile?: AssetHint['imageProfile'] }> = [
  { brandTemplateKey: 'startup-blue', imageProfile: undefined },
  { brandTemplateKey: 'retail-impact', imageProfile: 'landscape' },
  { brandTemplateKey: 'editorial-serene', imageProfile: 'portrait' },
  { brandTemplateKey: 'startup-blue', imageProfile: 'square' },
  { brandTemplateKey: 'retail-impact', imageProfile: 'ultraWide' },
]

type Candidate = ReturnType<typeof getPreviewCandidateDiagnostics>['allCandidates'][number]

function structuralTier(status: Candidate['structuralStatus']) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

function oldComparator(left: Candidate, right: Candidate) {
  const tierDelta = structuralTier(right.structuralStatus) - structuralTier(left.structuralStatus)
  if (tierDelta !== 0) return tierDelta

  const scoreDelta = right.scoreTrust.effectiveScore - left.scoreTrust.effectiveScore
  if (scoreDelta !== 0) return scoreDelta

  const highFindingDelta = left.highStructuralFindingCount - right.highStructuralFindingCount
  if (highFindingDelta !== 0) return highFindingDelta

  const criticalIssueDelta = left.criticalIssueCount - right.criticalIssueCount
  if (criticalIssueDelta !== 0) return criticalIssueDelta

  const highIssueDelta = left.highIssueCount - right.highIssueCount
  if (highIssueDelta !== 0) return highIssueDelta

  const findingCountDelta = left.structuralFindingCount - right.structuralFindingCount
  if (findingCountDelta !== 0) return findingCountDelta

  const issueCountDelta = left.issueCount - right.issueCount
  if (issueCountDelta !== 0) return issueCountDelta

  return left.strategyLabel.localeCompare(right.strategyLabel)
}

async function main() {
  let contexts = 0
  let changedSelections = 0
  let visualGainSum = 0
  let scoreDeltaSum = 0
  let closeSafeAlternatives = 0
  let closeSafeVisualUpsets = 0
  let broaderSafeVisualUpsets = 0
  const examples: Array<Record<string, string | number>> = []
  const opportunityExamples: Array<Record<string, string | number>> = []
  const broaderOpportunityExamples: Array<Record<string, string | number>> = []

  for (const template of templates) {
    for (const goal of GOAL_PRESETS.slice(0, 4)) {
      for (const visualSystem of VISUAL_SYSTEMS.slice(0, 5)) {
        for (const pair of sampledBrandImagePairs) {
          contexts += 1
          const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === pair.brandTemplateKey) || BRAND_TEMPLATES[0]
          const master = createMasterScene(template, brandTemplate.brandKit)
          const diagnostics = getPreviewCandidateDiagnostics({
            master,
            formatKey: 'marketplace-card',
            visualSystem: visualSystem.key,
            brandKit: brandTemplate.brandKit,
            goal: goal.key,
            assetHint: pair.imageProfile ? { imageProfile: pair.imageProfile } : undefined,
            expandedBudget: 10,
          })
          const current = diagnostics.selectedCandidate
          const old = [...diagnostics.allCandidates].sort(oldComparator)[0]
          const closeSafeAlternative = diagnostics.allCandidates
            .filter((candidate) => candidate.strategyLabel !== current.strategyLabel)
            .find((candidate) => {
              return (
                candidate.structuralStatus === current.structuralStatus &&
                candidate.structuralStatus !== 'invalid' &&
                Math.abs(candidate.scoreTrust.effectiveScore - current.scoreTrust.effectiveScore) <= 6 &&
                candidate.highStructuralFindingCount === current.highStructuralFindingCount &&
                candidate.criticalIssueCount === current.criticalIssueCount &&
                candidate.highIssueCount === current.highIssueCount
              )
            })

          if (closeSafeAlternative) {
            closeSafeAlternatives += 1
            const currentVisual = current.assessment.visual?.overallScore || 0
            const alternativeVisual = closeSafeAlternative.assessment.visual?.overallScore || 0
            if (alternativeVisual - currentVisual >= 4) {
              closeSafeVisualUpsets += 1
              if (opportunityExamples.length < 8) {
                opportunityExamples.push({
                  template,
                  goal: goal.key,
                  visualSystem: visualSystem.key,
                  imageProfile: pair.imageProfile || 'none',
                  currentStrategy: current.strategyLabel,
                  currentScore: current.scoreTrust.effectiveScore.toFixed(2),
                  currentVisual,
                  alternativeStrategy: closeSafeAlternative.strategyLabel,
                  alternativeScore: closeSafeAlternative.scoreTrust.effectiveScore.toFixed(2),
                  alternativeVisual,
                })
              }
            }
          }

          const broaderSafeAlternative = diagnostics.allCandidates
            .filter((candidate) => candidate.strategyLabel !== current.strategyLabel)
            .find((candidate) => {
              return (
                candidate.structuralStatus === current.structuralStatus &&
                candidate.structuralStatus !== 'invalid' &&
                Math.abs(candidate.scoreTrust.effectiveScore - current.scoreTrust.effectiveScore) <= 8 &&
                candidate.highStructuralFindingCount === current.highStructuralFindingCount &&
                candidate.criticalIssueCount === current.criticalIssueCount
              )
            })

          if (broaderSafeAlternative) {
            const currentVisual = current.assessment.visual?.overallScore || 0
            const alternativeVisual = broaderSafeAlternative.assessment.visual?.overallScore || 0
            if (alternativeVisual - currentVisual >= 6) {
              broaderSafeVisualUpsets += 1
              if (broaderOpportunityExamples.length < 8) {
                broaderOpportunityExamples.push({
                  template,
                  goal: goal.key,
                  visualSystem: visualSystem.key,
                  imageProfile: pair.imageProfile || 'none',
                  currentStrategy: current.strategyLabel,
                  currentScore: current.scoreTrust.effectiveScore.toFixed(2),
                  currentVisual,
                  alternativeStrategy: broaderSafeAlternative.strategyLabel,
                  alternativeScore: broaderSafeAlternative.scoreTrust.effectiveScore.toFixed(2),
                  alternativeVisual,
                })
              }
            }
          }

          if (current.strategyLabel !== old.strategyLabel) {
            changedSelections += 1
            visualGainSum += (current.assessment.visual?.overallScore || 0) - (old.assessment.visual?.overallScore || 0)
            scoreDeltaSum += current.scoreTrust.effectiveScore - old.scoreTrust.effectiveScore
            if (examples.length < 8) {
              examples.push({
                template,
                goal: goal.key,
                visualSystem: visualSystem.key,
                imageProfile: pair.imageProfile || 'none',
                oldStrategy: old.strategyLabel,
                oldVisual: old.assessment.visual?.overallScore || 0,
                oldScore: old.scoreTrust.effectiveScore.toFixed(2),
                newStrategy: current.strategyLabel,
                newVisual: current.assessment.visual?.overallScore || 0,
                newScore: current.scoreTrust.effectiveScore.toFixed(2),
              })
            }
          }
        }
      }
    }
  }

  console.log('# Marketplace-card visual rerank impact')
  console.log(`contexts=${contexts}`)
  console.log(`changedSelections=${changedSelections}`)
  console.log(`changedRate=${((changedSelections / Math.max(1, contexts)) * 100).toFixed(1)}%`)
  console.log(`avgVisualGain=${changedSelections ? (visualGainSum / changedSelections).toFixed(2) : '0.00'}`)
  console.log(`avgEffectiveScoreDelta=${changedSelections ? (scoreDeltaSum / changedSelections).toFixed(2) : '0.00'}`)
  console.log(`closeSafeAlternatives=${closeSafeAlternatives}`)
  console.log(`closeSafeVisualUpsets=${closeSafeVisualUpsets}`)
  console.log(`broaderSafeVisualUpsets=${broaderSafeVisualUpsets}`)
  if (examples.length) console.table(examples)
  if (opportunityExamples.length) {
    console.log('close safe visual-upset opportunities:')
    console.table(opportunityExamples)
  }
  if (broaderOpportunityExamples.length) {
    console.log('broader safe visual-upset opportunities:')
    console.table(broaderOpportunityExamples)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
