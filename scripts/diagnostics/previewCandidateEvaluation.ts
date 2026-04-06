import { BRAND_TEMPLATES, CHANNEL_FORMATS, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, getPreviewCandidateDiagnostics } from '../../src/lib/autoAdapt'
import type { AssetHint, FormatKey, LayoutAssessment, StructuralLayoutStatus, TemplateKey } from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'

const templates: TemplateKey[] = ['promo', 'product', 'article']
const imageProfiles: Array<AssetHint['imageProfile'] | undefined> = [undefined, 'landscape', 'square', 'portrait', 'ultraWide']
const expandedBudget = 7

type StatusTransition = 'invalid->degraded' | 'degraded->valid' | 'invalid->valid'

function structuralTier(status: StructuralLayoutStatus) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

function effectiveScore(assessment: LayoutAssessment) {
  return assessment.layoutAnalysis?.effectiveScore ?? assessment.score
}

function compareByAssessmentScore(left: ReturnType<typeof getPreviewCandidateDiagnostics>['allCandidates'][number], right: ReturnType<typeof getPreviewCandidateDiagnostics>['allCandidates'][number]) {
  const tierDelta = structuralTier(right.structuralStatus) - structuralTier(left.structuralStatus)
  if (tierDelta !== 0) return tierDelta

  const scoreDelta = right.assessment.score - left.assessment.score
  if (scoreDelta !== 0) return scoreDelta

  const leftHighStructural = (left.assessment.structuralState?.findings || []).filter((finding) => finding.severity === 'high').length
  const rightHighStructural = (right.assessment.structuralState?.findings || []).filter((finding) => finding.severity === 'high').length
  if (leftHighStructural !== rightHighStructural) return leftHighStructural - rightHighStructural

  const leftCritical = left.assessment.issues.filter((issue) => issue.severity === 'critical').length
  const rightCritical = right.assessment.issues.filter((issue) => issue.severity === 'critical').length
  if (leftCritical !== rightCritical) return leftCritical - rightCritical

  const leftHigh = left.assessment.issues.filter((issue) => issue.severity === 'high').length
  const rightHigh = right.assessment.issues.filter((issue) => issue.severity === 'high').length
  if (leftHigh !== rightHigh) return leftHigh - rightHigh

  return left.strategyLabel.localeCompare(right.strategyLabel)
}

function topEntries(record: Record<string, number>, limit = 5) {
  return Object.entries(record)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
    .slice(0, limit)
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function comparePenaltyTuple(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0)
    if (delta !== 0) return delta
  }
  return 0
}

function toMarkdownTable(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return '_none_'
  const headers = Object.keys(rows[0])
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${headers.map((header) => String(row[header])).join(' | ')} |`),
  ]
  return lines.join('\n')
}

async function main() {
  const totals = {
    contexts: 0,
    formatEvaluations: 0,
    selectedNotBase: 0,
    structuralImproved: 0,
    effectiveScoreImproved: 0,
    effectiveScoreWorsened: 0,
    postFixStructuralWorsened: 0,
    postFixScoreWorsened: 0,
    expandedBudgetBetterTier: 0,
    expandedBudgetBetterScore: 0,
    rankingSignalDisagreed: 0,
    rankingSignalTrustBetterSevere: 0,
    rankingSignalScoreBetterSevere: 0,
    mixedStructuralPools: 0,
  }

  const transitionCounts: Record<StatusTransition, number> = {
    'invalid->degraded': 0,
    'degraded->valid': 0,
    'invalid->valid': 0,
  }
  const strategyAppearances: Record<string, number> = {}
  const strategyWins: Record<string, number> = {}
  const categoryBenefit: Record<string, number> = {}
  const keyBenefit: Record<string, number> = {}
  const categoryStructuralBenefit: Record<string, number> = {}
  const keyStructuralBenefit: Record<string, number> = {}
  const categoryExpandedMisses: Record<string, number> = {}
  const keyExpandedMisses: Record<string, number> = {}

  console.time('preview-candidate-evaluation')

  for (const template of templates) {
    for (const goal of GOAL_PRESETS.map((item) => item.key)) {
      for (const visualSystem of VISUAL_SYSTEMS.map((item) => item.key)) {
        for (const brandTemplate of BRAND_TEMPLATES) {
          for (const imageProfile of imageProfiles) {
            totals.contexts += 1
            const master = createMasterScene(template, brandTemplate.brandKit)
            const assetHint = imageProfile ? ({ imageProfile } satisfies AssetHint) : undefined

            for (const format of CHANNEL_FORMATS) {
              totals.formatEvaluations += 1
              const diagnostics = getPreviewCandidateDiagnostics({
                master,
                formatKey: format.key,
                visualSystem,
                brandKit: brandTemplate.brandKit,
                goal,
                assetHint,
                expandedBudget,
              })

              const base = diagnostics.baseCandidate
              const selected = diagnostics.selectedCandidate
              const postFix = diagnostics.postSelectionFix
              const expanded = diagnostics.expandedBudgetCandidate

              diagnostics.allCandidates.forEach((candidate) => increment(strategyAppearances, candidate.strategyLabel))
              increment(strategyWins, selected.strategyLabel)

              if (new Set(diagnostics.allCandidates.map((candidate) => candidate.structuralStatus)).size > 1) {
                totals.mixedStructuralPools += 1
              }

              if (selected.strategyLabel !== base.strategyLabel) {
                totals.selectedNotBase += 1
              }

              const baseTier = structuralTier(base.structuralStatus)
              const selectedTier = structuralTier(selected.structuralStatus)
              if (selectedTier > baseTier) {
                totals.structuralImproved += 1
                if (base.structuralStatus === 'invalid' && selected.structuralStatus === 'degraded') transitionCounts['invalid->degraded'] += 1
                if (base.structuralStatus === 'degraded' && selected.structuralStatus === 'valid') transitionCounts['degraded->valid'] += 1
                if (base.structuralStatus === 'invalid' && selected.structuralStatus === 'valid') transitionCounts['invalid->valid'] += 1
                increment(categoryStructuralBenefit, format.category)
                increment(keyStructuralBenefit, format.key)
              }

              if (selected.scoreTrust.effectiveScore > base.scoreTrust.effectiveScore) {
                totals.effectiveScoreImproved += 1
              } else if (selected.scoreTrust.effectiveScore < base.scoreTrust.effectiveScore) {
                totals.effectiveScoreWorsened += 1
              }

              const meaningfulBenefit =
                selected.strategyLabel !== base.strategyLabel &&
                (selectedTier > baseTier || selected.scoreTrust.effectiveScore > base.scoreTrust.effectiveScore)
              if (meaningfulBenefit) {
                increment(categoryBenefit, format.category)
                increment(keyBenefit, format.key)
              }

              const postFixTier = structuralTier(postFix.assessment.structuralState?.status || 'invalid')
              if (postFixTier < selectedTier) {
                totals.postFixStructuralWorsened += 1
              }
              if (postFix.scoreTrust.effectiveScore < selected.scoreTrust.effectiveScore) {
                totals.postFixScoreWorsened += 1
              }

              if (expanded) {
                const expandedTier = structuralTier(expanded.structuralStatus)
                if (expandedTier > selectedTier) {
                  totals.expandedBudgetBetterTier += 1
                  increment(categoryExpandedMisses, format.category)
                  increment(keyExpandedMisses, format.key)
                } else if (expandedTier === selectedTier && expanded.scoreTrust.effectiveScore > selected.scoreTrust.effectiveScore) {
                  totals.expandedBudgetBetterScore += 1
                  increment(categoryExpandedMisses, format.category)
                  increment(keyExpandedMisses, format.key)
                }
              }

              const scoreSorted = [...diagnostics.allCandidates].sort(compareByAssessmentScore)
              const scoreChosen = scoreSorted[0]
              if (scoreChosen.strategyLabel !== selected.strategyLabel) {
                totals.rankingSignalDisagreed += 1
                const trustPenalty = [
                  selected.assessment.issues.filter((issue) => issue.severity === 'critical').length,
                  selected.assessment.issues.filter((issue) => issue.severity === 'high').length,
                  selected.assessment.issues.filter((issue) => issue.severity === 'medium').length,
                ]
                const scorePenalty = [
                  scoreChosen.assessment.issues.filter((issue) => issue.severity === 'critical').length,
                  scoreChosen.assessment.issues.filter((issue) => issue.severity === 'high').length,
                  scoreChosen.assessment.issues.filter((issue) => issue.severity === 'medium').length,
                ]
                const penaltyDelta = comparePenaltyTuple(trustPenalty, scorePenalty)
                if (penaltyDelta < 0) totals.rankingSignalTrustBetterSevere += 1
                else if (penaltyDelta > 0) totals.rankingSignalScoreBetterSevere += 1
              }
            }
          }
        }
      }
    }
  }

  console.timeEnd('preview-candidate-evaluation')

  const redundantStrategies = topEntries(strategyAppearances, 20)
    .map(([strategy, appearances]) => ({
      strategy,
      appearances,
      wins: strategyWins[strategy] || 0,
      winRate: `${((((strategyWins[strategy] || 0) / appearances) || 0) * 100).toFixed(1)}%`,
    }))

  const trulyRedundant = redundantStrategies.filter((row) => row.wins === 0 || (row.wins / row.appearances) < 0.01)

  const categoryBenefitRows = topEntries(categoryBenefit, 10).map(([category, count]) => ({
    formatCategory: category,
    meaningfulWins: count,
    structuralWins: categoryStructuralBenefit[category] || 0,
    expandedBudgetMisses: categoryExpandedMisses[category] || 0,
  }))

  const keyBenefitRows = topEntries(keyBenefit, 12).map(([formatKey, count]) => ({
    formatKey,
    meaningfulWins: count,
    structuralWins: keyStructuralBenefit[formatKey] || 0,
    expandedBudgetMisses: keyExpandedMisses[formatKey] || 0,
  }))

  const report = `# Step 3 Candidate Selection Verification

## Sample
- templates: ${templates.join(', ')}
- goals: ${GOAL_PRESETS.map((item) => item.key).join(', ')}
- visual systems: ${VISUAL_SYSTEMS.map((item) => item.key).join(', ')}
- brand templates: ${BRAND_TEMPLATES.map((item) => item.key).join(', ')}
- image profiles: ${imageProfiles.map((item) => item || 'none').join(', ')}
- contexts: ${totals.contexts}
- format evaluations: ${totals.formatEvaluations}
- expanded diagnostics budget: ${expandedBudget}

## 1. Selected candidate vs base heuristic
- selected preview candidate is not the base heuristic candidate in ${totals.selectedNotBase} / ${totals.formatEvaluations} cases (${((totals.selectedNotBase / totals.formatEvaluations) * 100).toFixed(1)}%)

## 2. Structural tier improvements vs base
- any structural tier improvement: ${totals.structuralImproved} / ${totals.formatEvaluations} (${((totals.structuralImproved / totals.formatEvaluations) * 100).toFixed(1)}%)
- candidate pools with mixed structural tiers: ${totals.mixedStructuralPools} / ${totals.formatEvaluations} (${((totals.mixedStructuralPools / totals.formatEvaluations) * 100).toFixed(1)}%)
- invalid -> degraded: ${transitionCounts['invalid->degraded']}
- degraded -> valid: ${transitionCounts['degraded->valid']}
- invalid -> valid: ${transitionCounts['invalid->valid']}

## 3. Effective score improvement vs base
- improved effective score: ${totals.effectiveScoreImproved} / ${totals.formatEvaluations} (${((totals.effectiveScoreImproved / totals.formatEvaluations) * 100).toFixed(1)}%)
- worsened effective score: ${totals.effectiveScoreWorsened} / ${totals.formatEvaluations} (${((totals.effectiveScoreWorsened / totals.formatEvaluations) * 100).toFixed(1)}%)

## 4. Candidate dimensions and redundancy
${toMarkdownTable(redundantStrategies)}

### Near-redundant strategies
${toMarkdownTable(trulyRedundant)}

## 5. Post-selection runAutoFix regression check
- structural tier worsened after post-selection runAutoFix: ${totals.postFixStructuralWorsened} / ${totals.formatEvaluations} (${((totals.postFixStructuralWorsened / totals.formatEvaluations) * 100).toFixed(1)}%)
- effective score worsened after post-selection runAutoFix: ${totals.postFixScoreWorsened} / ${totals.formatEvaluations} (${((totals.postFixScoreWorsened / totals.formatEvaluations) * 100).toFixed(1)}%)

## 6. Budget-4 sufficiency vs expanded budget
- expanded budget finds a better structural tier than budget 4 in ${totals.expandedBudgetBetterTier} / ${totals.formatEvaluations} cases (${((totals.expandedBudgetBetterTier / totals.formatEvaluations) * 100).toFixed(1)}%)
- expanded budget finds same tier but better effective score in ${totals.expandedBudgetBetterScore} / ${totals.formatEvaluations} cases (${((totals.expandedBudgetBetterScore / totals.formatEvaluations) * 100).toFixed(1)}%)

## 7. Biggest beneficiaries
### By category
${toMarkdownTable(categoryBenefitRows)}

### By format key
${toMarkdownTable(keyBenefitRows)}

## 8. Ranking signal check
- computeScoreTrust-based tie-break differs from plain assessment.score in ${totals.rankingSignalDisagreed} / ${totals.formatEvaluations} cases (${((totals.rankingSignalDisagreed / totals.formatEvaluations) * 100).toFixed(1)}%)
- among disagreements, computeScoreTrust picks the lower-severity candidate in ${totals.rankingSignalTrustBetterSevere} cases
- among disagreements, plain assessment.score picks the lower-severity candidate in ${totals.rankingSignalScoreBetterSevere} cases
`

  console.log(report)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
