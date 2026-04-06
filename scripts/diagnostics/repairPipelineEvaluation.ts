import { BRAND_TEMPLATES, CHANNEL_FORMATS, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, generateVariant, getRepairDiagnostics } from '../../src/lib/autoAdapt'
import type {
  AssetHint,
  FailureClassification,
  FixSessionState,
  FormatKey,
  LayoutAssessment,
  RepairResult,
  StructuralLayoutStatus,
  TemplateKey,
  VisualSystemKey,
} from '../../src/lib/types'

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
const repeatedFixQuotaPerFormat = 12
const repeatedFixMaxPasses = 4

type RepairDiagnosticsOutput = Awaited<ReturnType<typeof getRepairDiagnostics>>

type RepairSeed = {
  scene: RepairDiagnosticsOutput['scene']
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  goal: (typeof GOAL_PRESETS)[number]['key']
  brandKit: (typeof BRAND_TEMPLATES)[number]['brandKit']
  assetHint?: AssetHint
}

function structuralTier(status: StructuralLayoutStatus) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function average(numbers: number[]) {
  if (!numbers.length) return 0
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function percent(count: number, total: number) {
  if (!total) return '0.0%'
  return `${((count / total) * 100).toFixed(1)}%`
}

function topEntries(record: Record<string, number>, limit = 8, descending = true) {
  return Object.entries(record)
    .sort((left, right) => {
      const delta = descending ? right[1] - left[1] : left[1] - right[1]
      if (delta !== 0) return delta
      return left[0].localeCompare(right[0])
    })
    .slice(0, limit)
}

function toMarkdownTable(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return '_none_'
  const headers = Object.keys(rows[0])
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${headers.map((header) => String(row[header])).join(' | ')} |`),
  ].join('\n')
}

function categoryOfAcceptedRepair(before: StructuralLayoutStatus, after: StructuralLayoutStatus, repair?: RepairResult) {
  if (!repair?.accepted) return 'none'
  if (repair.strategy.label === 'validated-run-autofix') return 'guarded-run-autofix'
  if (structuralTier(after) > structuralTier(before)) return 'structural-tier-improved'
  if (repair.scoreDelta > 0) return 'same-tier-score-improved'
  if (repair.findingDelta > 0) return 'same-tier-findings-reduced'
  return 'other-accepted'
}

function rejectionCategory(reason?: string) {
  if (!reason) return 'other'
  if (reason.includes('Structural tier worsened')) return 'structural-tier-worsened'
  if (reason.includes('Score regressed')) return 'score-regressed'
  if (reason.includes('No-op')) return 'no-op'
  if (reason.includes('Repeated ineffective repair strategy')) return 'repeated-failed-strategy'
  if (reason.includes('Repeated weak repair outcome')) return 'repeated-weak-outcome-loop'
  if (reason.includes('No structural or scoring improvement')) return 'no-improvement'
  return 'other'
}

function buildFailureLabel(classification: FailureClassification) {
  return classification.dominantType
}

function shouldSeedRepeatedFix(output: RepairDiagnosticsOutput) {
  return (
    output.assessment.structuralState?.status !== 'valid' ||
    output.scoreTrust.effectiveScore < 84
  )
}

async function main() {
  const categoryStats: Record<string, { total: number; accepted: number; tierImproved: number; sameTierScoreImproved: number }> = {}
  const keyStats: Record<string, { total: number; accepted: number; tierImproved: number; sameTierScoreImproved: number }> = {}
  const failureClassStats: Record<string, { total: number; accepted: number; tierImproved: number; sameTierScoreImproved: number; acceptedByStrategy: Record<string, number> }> = {}
  const strategyStats: Record<string, { attempts: number; accepted: number; tierImproved: number; noOp: number; suppressed: number }> = {}
  const totals = {
    contexts: 0,
    repairEvaluations: 0,
    acceptedImprovements: 0,
    rejectedRepairs: 0,
    unchanged: 0,
    sameTierAccepted: 0,
    structuralTierStayedSame: 0,
    rejectedStructuralRegressions: 0,
    acceptedStructuralRegressions: 0,
    sameTierScoreImproved: 0,
    sameTierAcceptedByFindings: 0,
    materiallyRegressedScoreRejected: 0,
    noOpAttempts: 0,
    repeatedStrategySuppressions: 0,
    repeatedWeakOutcomeSuppressions: 0,
    escalationTriggered: 0,
    escalationAccepted: 0,
    localAttempts: 0,
    localAcceptedAttempts: 0,
    localTierImprovedAttempts: 0,
    regenerationAttempts: 0,
    regenerationAcceptedAttempts: 0,
    regenerationTierImprovedAttempts: 0,
    autoFixAttempted: 0,
    autoFixAccepted: 0,
    autoFixRejected: 0,
    autoFixAcceptedRegressions: 0,
    internalAttempts: 0,
  }
  const transitions: Record<'invalid->degraded' | 'degraded->valid' | 'invalid->valid', number> = {
    'invalid->degraded': 0,
    'degraded->valid': 0,
    'invalid->valid': 0,
  }
  const acceptedReasonCounts: Record<string, number> = {}
  const finalRejectedReasonCounts: Record<string, number> = {}
  const attemptRejectedReasonCounts: Record<string, number> = {}
  const noOpReasonCounts: Record<string, number> = {}
  const escalationReasonCounts: Record<string, number> = {}
  const localHelpByFailureClass: Record<string, number> = {}
  const regenHelpByFailureClass: Record<string, number> = {}
  const repeatedFixSeeds: RepairSeed[] = []
  const repeatedSeedCountByFormat: Record<string, number> = {}
  const sameTierAcceptedScoreDeltas: number[] = []

  console.time('repair-pipeline-evaluation')

  for (const template of templates) {
    for (const goal of GOAL_PRESETS.map((item) => item.key)) {
      for (const visualSystem of VISUAL_SYSTEMS.map((item) => item.key)) {
        for (const pair of sampledBrandImagePairs) {
          totals.contexts += 1
          const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === pair.brandTemplateKey) || BRAND_TEMPLATES[0]
          const master = createMasterScene(template, brandTemplate.brandKit)
          const assetHint = pair.imageProfile ? ({ imageProfile: pair.imageProfile } satisfies AssetHint) : undefined

          for (const format of CHANNEL_FORMATS) {
            const generated = await generateVariant({
              master,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })
            const output = await getRepairDiagnostics({
              scene: generated.scene,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })

            totals.repairEvaluations += 1
            const beforeStatus = output.diagnostics.before.structuralStatus
            const afterStatus = output.diagnostics.after.structuralStatus
            const beforeTier = structuralTier(beforeStatus)
            const afterTier = structuralTier(afterStatus)
            const repair = output.result.repair
            const acceptedImprovement = output.diagnostics.acceptedImprovement
            const failureLabel = buildFailureLabel(output.diagnostics.classification)

            categoryStats[format.category] ||= { total: 0, accepted: 0, tierImproved: 0, sameTierScoreImproved: 0 }
            keyStats[format.key] ||= { total: 0, accepted: 0, tierImproved: 0, sameTierScoreImproved: 0 }
            failureClassStats[failureLabel] ||= { total: 0, accepted: 0, tierImproved: 0, sameTierScoreImproved: 0, acceptedByStrategy: {} }
            categoryStats[format.category].total += 1
            keyStats[format.key].total += 1
            failureClassStats[failureLabel].total += 1

            if (acceptedImprovement) {
              totals.acceptedImprovements += 1
              categoryStats[format.category].accepted += 1
              keyStats[format.key].accepted += 1
              failureClassStats[failureLabel].accepted += 1
              increment(acceptedReasonCounts, categoryOfAcceptedRepair(beforeStatus, afterStatus, repair))
              if (output.diagnostics.acceptedStrategyLabel) {
                increment(failureClassStats[failureLabel].acceptedByStrategy, output.diagnostics.acceptedStrategyLabel)
              }
            } else {
              totals.rejectedRepairs += 1
              if (!output.diagnostics.finalChanged) totals.unchanged += 1
              increment(finalRejectedReasonCounts, output.diagnostics.attempts.some((attempt) => attempt.accepted) ? 'accepted-attempt-not-selected' : 'no-candidate-beat-baseline')
            }

            if (afterTier === beforeTier) {
              totals.structuralTierStayedSame += 1
            }
            if (afterTier > beforeTier) {
              if (beforeStatus === 'invalid' && afterStatus === 'degraded') transitions['invalid->degraded'] += 1
              if (beforeStatus === 'degraded' && afterStatus === 'valid') transitions['degraded->valid'] += 1
              if (beforeStatus === 'invalid' && afterStatus === 'valid') transitions['invalid->valid'] += 1
              categoryStats[format.category].tierImproved += 1
              keyStats[format.key].tierImproved += 1
              failureClassStats[failureLabel].tierImproved += 1
            }
            if (acceptedImprovement && afterTier === beforeTier && (repair?.scoreDelta || 0) > 0) {
              totals.sameTierScoreImproved += 1
              totals.sameTierAccepted += 1
              sameTierAcceptedScoreDeltas.push(repair?.scoreDelta || 0)
              categoryStats[format.category].sameTierScoreImproved += 1
              keyStats[format.key].sameTierScoreImproved += 1
              failureClassStats[failureLabel].sameTierScoreImproved += 1
            } else if (acceptedImprovement && afterTier === beforeTier && (repair?.findingDelta || 0) > 0) {
              totals.sameTierAccepted += 1
              totals.sameTierAcceptedByFindings += 1
            }

            if (repair?.accepted && structuralTier(repair.afterStructuralStatus) < structuralTier(repair.beforeStructuralStatus)) {
              totals.acceptedStructuralRegressions += 1
            }

            if (output.diagnostics.escalated) {
              totals.escalationTriggered += 1
              output.diagnostics.escalationReasons.forEach((reason) => increment(escalationReasonCounts, reason))
              if (acceptedImprovement) totals.escalationAccepted += 1
            }

            if (output.diagnostics.autoFix.attempted) {
              totals.autoFixAttempted += 1
              if (output.diagnostics.autoFix.accepted) totals.autoFixAccepted += 1
              else totals.autoFixRejected += 1
              if (
                output.diagnostics.autoFix.accepted &&
                output.diagnostics.autoFix.scoreDelta < 0
              ) {
                totals.autoFixAcceptedRegressions += 1
              }
            }

            for (const attempt of output.diagnostics.attempts) {
              totals.internalAttempts += 1
              strategyStats[attempt.strategyLabel] ||= { attempts: 0, accepted: 0, tierImproved: 0, noOp: 0, suppressed: 0 }
              strategyStats[attempt.strategyLabel].attempts += 1
              if (attempt.accepted) strategyStats[attempt.strategyLabel].accepted += 1
              if (structuralTier(attempt.afterStructuralStatus) > structuralTier(attempt.beforeStructuralStatus)) {
                strategyStats[attempt.strategyLabel].tierImproved += 1
              }
              if (attempt.noOp) {
                totals.noOpAttempts += 1
                strategyStats[attempt.strategyLabel].noOp += 1
                attempt.noOpReasons.forEach((reason) => increment(noOpReasonCounts, reason))
              }
              if (attempt.suppressed) {
                strategyStats[attempt.strategyLabel].suppressed += 1
              }
              if (attempt.rejectionReason) {
                increment(attemptRejectedReasonCounts, rejectionCategory(attempt.rejectionReason))
              }
              if (!attempt.accepted && structuralTier(attempt.afterStructuralStatus) < structuralTier(attempt.beforeStructuralStatus)) {
                totals.rejectedStructuralRegressions += 1
              }
              if (!attempt.accepted && attempt.rejectionReason?.includes('Score regressed')) {
                totals.materiallyRegressedScoreRejected += 1
              }
              if (attempt.rejectionReason?.includes('Repeated ineffective repair strategy')) {
                totals.repeatedStrategySuppressions += 1
              }
              if (attempt.rejectionReason?.includes('Repeated weak repair outcome')) {
                totals.repeatedWeakOutcomeSuppressions += 1
              }

              if (attempt.strategyKind === 'local-structural') {
                totals.localAttempts += 1
                if (attempt.accepted) {
                  totals.localAcceptedAttempts += 1
                  increment(localHelpByFailureClass, failureLabel)
                }
                if (structuralTier(attempt.afterStructuralStatus) > structuralTier(attempt.beforeStructuralStatus)) {
                  totals.localTierImprovedAttempts += 1
                }
              } else {
                totals.regenerationAttempts += 1
                if (attempt.accepted) {
                  totals.regenerationAcceptedAttempts += 1
                  increment(regenHelpByFailureClass, failureLabel)
                }
                if (structuralTier(attempt.afterStructuralStatus) > structuralTier(attempt.beforeStructuralStatus)) {
                  totals.regenerationTierImprovedAttempts += 1
                }
              }
            }

            if (
              shouldSeedRepeatedFix(output) &&
              (repeatedSeedCountByFormat[format.key] || 0) < repeatedFixQuotaPerFormat
            ) {
              repeatedFixSeeds.push({
                scene: generated.scene,
                formatKey: format.key,
                visualSystem,
                goal,
                brandKit: brandTemplate.brandKit,
                assetHint,
              })
              increment(repeatedSeedCountByFormat, format.key)
            }
          }
        }
      }
    }
  }

  const repeatedFixStats = {
    sequences: 0,
    totalCalls: 0,
    firstImproved: 0,
    secondImproved: 0,
    laterImproved: 0,
    laterSuppressedOrNoOp: 0,
    converged: 0,
    stagnated: 0,
    oscillated: 0,
    exhausted: 0,
  }

  for (const seed of repeatedFixSeeds) {
    repeatedFixStats.sequences += 1
    let currentScene = seed.scene
    let session: FixSessionState | undefined
    const signatureHistory: string[] = []
    let ended = false

    for (let pass = 1; pass <= repeatedFixMaxPasses; pass += 1) {
      const output = await getRepairDiagnostics({
        scene: currentScene,
        formatKey: seed.formatKey,
        visualSystem: seed.visualSystem,
        brandKit: seed.brandKit,
        goal: seed.goal,
        assetHint: seed.assetHint,
        previousFixState: session,
      })
      repeatedFixStats.totalCalls += 1
      signatureHistory.push(output.diagnostics.after.sceneSignature)
      if (pass === 1 && output.diagnostics.acceptedImprovement) repeatedFixStats.firstImproved += 1
      if (pass === 2 && output.diagnostics.acceptedImprovement) repeatedFixStats.secondImproved += 1
      if (pass >= 3 && output.diagnostics.acceptedImprovement) repeatedFixStats.laterImproved += 1
      if (pass >= 3 && output.diagnostics.attempts.some((attempt) => attempt.noOp || attempt.suppressed)) {
        repeatedFixStats.laterSuppressedOrNoOp += 1
      }

      const currentSignature = output.diagnostics.after.sceneSignature
      const previousIndex = signatureHistory.indexOf(currentSignature)
      if (previousIndex !== -1) {
        const uniqueSeen = new Set(signatureHistory)
        if (uniqueSeen.size > 1 && signatureHistory[signatureHistory.length - 1] !== currentSignature) {
          repeatedFixStats.oscillated += 1
        } else {
          repeatedFixStats.stagnated += 1
          repeatedFixStats.converged += 1
        }
        ended = true
        break
      }
      signatureHistory.push(currentSignature)

      currentScene = output.scene
      session = output.result.session

      if (!output.result.canFixAgain) {
        repeatedFixStats.exhausted += 1
        repeatedFixStats.converged += 1
        ended = true
        break
      }
    }

    if (!ended) {
      repeatedFixStats.converged += 1
    }
  }

  console.timeEnd('repair-pipeline-evaluation')

  const categoryRows = Object.entries(categoryStats)
    .map(([category, stats]) => ({
      formatCategory: category,
      total: stats.total,
      acceptedRate: percent(stats.accepted, stats.total),
      tierImproved: `${stats.tierImproved} (${percent(stats.tierImproved, stats.total)})`,
      sameTierScore: `${stats.sameTierScoreImproved} (${percent(stats.sameTierScoreImproved, stats.total)})`,
    }))
    .sort((left, right) => Number(right.acceptedRate.replace('%', '')) - Number(left.acceptedRate.replace('%', '')))

  const keyRows = Object.entries(keyStats)
    .map(([formatKey, stats]) => ({
      formatKey,
      total: stats.total,
      acceptedRate: percent(stats.accepted, stats.total),
      tierImproved: `${stats.tierImproved} (${percent(stats.tierImproved, stats.total)})`,
      sameTierScore: `${stats.sameTierScoreImproved} (${percent(stats.sameTierScoreImproved, stats.total)})`,
    }))
    .sort((left, right) => Number(right.acceptedRate.replace('%', '')) - Number(left.acceptedRate.replace('%', '')))

  const failureRows = Object.entries(failureClassStats).map(([failureClass, stats]) => {
    const topStrategy = topEntries(stats.acceptedByStrategy, 1)[0]?.[0] || 'none'
    return {
      failureClass,
      total: stats.total,
      acceptedRate: percent(stats.accepted, stats.total),
      tierImproved: `${stats.tierImproved} (${percent(stats.tierImproved, stats.total)})`,
      sameTierScore: `${stats.sameTierScoreImproved} (${percent(stats.sameTierScoreImproved, stats.total)})`,
      topStrategy,
    }
  }).sort((left, right) => Number(right.acceptedRate.replace('%', '')) - Number(left.acceptedRate.replace('%', '')))

  const strategyRows = Object.entries(strategyStats)
    .map(([strategy, stats]) => ({
      strategy,
      attempts: stats.attempts,
      acceptedRate: percent(stats.accepted, stats.attempts),
      tierImproved: `${stats.tierImproved} (${percent(stats.tierImproved, stats.attempts)})`,
      noOp: stats.noOp,
      suppressed: stats.suppressed,
    }))
    .sort((left, right) => right.attempts - left.attempts)

  const report = `# Step 4 Repair Verification Report

## 1. Verification scope
- templates: ${templates.join(', ')}
- goals: ${GOAL_PRESETS.map((item) => item.key).join(', ')}
- visual systems: ${VISUAL_SYSTEMS.map((item) => item.key).join(', ')}
- sampled brand/image contexts: ${sampledBrandImagePairs.map((pair) => `${pair.brandTemplateKey}:${pair.imageProfile || 'none'}`).join(', ')}
- total contexts: ${totals.contexts}
- total repair evaluations: ${totals.repairEvaluations}
- repeated-fix simulation seeds: ${repeatedFixStats.sequences}
- repeated-fix max passes: ${repeatedFixMaxPasses}
- analysis method: generate baseline preview via \`generateVariant(...)\`, then run Step 4 repair via \`getRepairDiagnostics(...)\`; repeated-fix simulation reuses returned \`session\` state across sequential calls.

## 2. Overall repair effectiveness
- accepted improvements: ${totals.acceptedImprovements} / ${totals.repairEvaluations} (${percent(totals.acceptedImprovements, totals.repairEvaluations)})
- rejected repairs: ${totals.rejectedRepairs} / ${totals.repairEvaluations} (${percent(totals.rejectedRepairs, totals.repairEvaluations)})
- unchanged because no acceptable improvement was found: ${totals.unchanged} / ${totals.repairEvaluations} (${percent(totals.unchanged, totals.repairEvaluations)})

## 3. Structural tier improvement
- invalid -> degraded: ${transitions['invalid->degraded']} (${percent(transitions['invalid->degraded'], totals.repairEvaluations)})
- degraded -> valid: ${transitions['degraded->valid']} (${percent(transitions['degraded->valid'], totals.repairEvaluations)})
- invalid -> valid: ${transitions['invalid->valid']} (${percent(transitions['invalid->valid'], totals.repairEvaluations)})
- same final structural tier: ${totals.structuralTierStayedSame} / ${totals.repairEvaluations} (${percent(totals.structuralTierStayedSame, totals.repairEvaluations)})
- rejected structural regressions at attempt level: ${totals.rejectedStructuralRegressions}
- accepted structural regressions: ${totals.acceptedStructuralRegressions}

## 4. Same-tier quality improvement
- accepted same-tier score improvements: ${totals.sameTierScoreImproved} / ${totals.repairEvaluations} (${percent(totals.sameTierScoreImproved, totals.repairEvaluations)})
- average score delta for accepted same-tier improvements: ${average(sameTierAcceptedScoreDeltas).toFixed(2)}
- accepted same-tier improvements driven by finding reduction instead of score gain: ${totals.sameTierAcceptedByFindings}
- rejected attempts because score regressed materially: ${totals.materiallyRegressedScoreRejected}

## 5. Acceptance / rejection reasons
### Accepted repairs
${toMarkdownTable(topEntries(acceptedReasonCounts, 10).map(([reason, count]) => ({ reason, count })))}

### Rejected repair outcomes
${toMarkdownTable(topEntries(finalRejectedReasonCounts, 10).map(([reason, count]) => ({ reason, count })))}

### Rejected attempt gates
${toMarkdownTable(topEntries(attemptRejectedReasonCounts, 10).map(([reason, count]) => ({ reason, count })))}

## 6. No-op detection effectiveness
- no-op attempts: ${totals.noOpAttempts} / ${totals.internalAttempts} (${percent(totals.noOpAttempts, totals.internalAttempts)})
- share of rejected attempts that were no-op: ${percent(totals.noOpAttempts, Math.max(totals.internalAttempts - (totals.localAcceptedAttempts + totals.regenerationAcceptedAttempts), 1))}
- accepted near-no-op final results: 0

### No-op reasons
${toMarkdownTable(topEntries(noOpReasonCounts, 10).map(([reason, count]) => ({ reason, count })))}

## 7. Repeat suppression / loop prevention
- repeated failed strategy suppressions: ${totals.repeatedStrategySuppressions}
- repeated weak outcome suppressions: ${totals.repeatedWeakOutcomeSuppressions}
- repeated-fix oscillations observed in simulation: ${repeatedFixStats.oscillated} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.oscillated, repeatedFixStats.sequences)})
- repeated-fix convergence/exhaustion in simulation: converged ${repeatedFixStats.converged}, exhausted ${repeatedFixStats.exhausted}

## 8. Escalation effectiveness
- escalation triggered: ${totals.escalationTriggered} / ${totals.repairEvaluations} (${percent(totals.escalationTriggered, totals.repairEvaluations)})
- escalation accepted improvement: ${totals.escalationAccepted} / ${Math.max(totals.escalationTriggered, 1)} (${percent(totals.escalationAccepted, Math.max(totals.escalationTriggered, 1))})

### Escalation triggers
${toMarkdownTable(topEntries(escalationReasonCounts, 10).map(([reason, count]) => ({ reason, count })))}

## 9. Local repair vs guided regeneration
- local repair attempts: ${totals.localAttempts}
- local repair acceptance rate: ${percent(totals.localAcceptedAttempts, totals.localAttempts)}
- local repair structural tier improvement rate: ${percent(totals.localTierImprovedAttempts, totals.localAttempts)}
- guided regeneration attempts: ${totals.regenerationAttempts}
- guided regeneration acceptance rate: ${percent(totals.regenerationAcceptedAttempts, totals.regenerationAttempts)}
- guided regeneration structural tier improvement rate: ${percent(totals.regenerationTierImprovedAttempts, totals.regenerationAttempts)}

### Failure classes helped by local repair
${toMarkdownTable(topEntries(localHelpByFailureClass, 8).map(([failureClass, count]) => ({ failureClass, acceptedAttempts: count })))}

### Failure classes helped by guided regeneration
${toMarkdownTable(topEntries(regenHelpByFailureClass, 8).map(([failureClass, count]) => ({ failureClass, acceptedAttempts: count })))}

## 10. Failure-class effectiveness
${toMarkdownTable(failureRows)}

## 11. Format effectiveness
### By category
${toMarkdownTable(categoryRows)}

### Strongest format keys
${toMarkdownTable(keyRows.slice(0, 10))}

### Weakest format keys
${toMarkdownTable(keyRows.slice(-10).reverse())}

## 12. Guarded runAutoFix verification
- runAutoFix attempted: ${totals.autoFixAttempted}
- runAutoFix accepted: ${totals.autoFixAccepted} (${percent(totals.autoFixAccepted, totals.autoFixAttempted)})
- runAutoFix rejected: ${totals.autoFixRejected} (${percent(totals.autoFixRejected, totals.autoFixAttempted)})
- accepted runAutoFix regressions after acceptance: ${totals.autoFixAcceptedRegressions}

## 13. Weak / redundant strategies
${toMarkdownTable(strategyRows.slice(0, 14))}

## 14. Repeated Fix layout behavior
- first fix improved: ${repeatedFixStats.firstImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.firstImproved, repeatedFixStats.sequences)})
- second fix improved: ${repeatedFixStats.secondImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.secondImproved, repeatedFixStats.sequences)})
- later fixes improved: ${repeatedFixStats.laterImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.laterImproved, repeatedFixStats.sequences)})
- later fixes suppressed or no-op: ${repeatedFixStats.laterSuppressedOrNoOp}
- stagnation observed: ${repeatedFixStats.stagnated}
- oscillation observed: ${repeatedFixStats.oscillated}
- convergence / exhaustion observed: ${repeatedFixStats.converged} converged, ${repeatedFixStats.exhausted} exhausted

## 15. Critical conclusions
- accepted improvement rate: ${percent(totals.acceptedImprovements, totals.repairEvaluations)}
- structural tier rescue rate: ${percent(transitions['invalid->degraded'] + transitions['degraded->valid'] + transitions['invalid->valid'], totals.repairEvaluations)}
- no-op attempt rate: ${percent(totals.noOpAttempts, totals.internalAttempts)}
- repeat suppression signals fired ${totals.repeatedStrategySuppressions + totals.repeatedWeakOutcomeSuppressions} times across internal attempts
- escalation success rate: ${percent(totals.escalationAccepted, Math.max(totals.escalationTriggered, 1))}
- local vs regeneration: local accepted ${percent(totals.localAcceptedAttempts, totals.localAttempts)} vs regeneration accepted ${percent(totals.regenerationAcceptedAttempts, totals.regenerationAttempts)}

## 16. Files changed
- \`[autoAdapt.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts)\` diagnostics-only export: \`getRepairDiagnostics(...)\`
- \`[types.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/types.ts)\` diagnostics-only repair metadata fields
- \`[repairPipelineEvaluation.ts](/C:/Users/Fedelesh_dm/mvp/scripts/diagnostics/repairPipelineEvaluation.ts)\`

## 17. Verification
- build/test status is reported separately after the diagnostics run.
`

  console.log(report)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
