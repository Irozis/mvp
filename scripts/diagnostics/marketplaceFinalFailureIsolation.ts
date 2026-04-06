import { BRAND_TEMPLATES, CHANNEL_FORMATS, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, getPreviewCandidateStageDiagnostics } from '../../src/lib/autoAdapt'
import type {
  AssetHint,
  FormatKey,
  LayoutAssessment,
  Scene,
  StructuralInvariantName,
  StructuralLayoutFinding,
  StructuralLayoutStatus,
  TemplateKey,
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
const marketplaceKeys = new Set<FormatKey>(['marketplace-card', 'marketplace-tile', 'marketplace-highlight'])

type CandidateKind = 'base' | 'selected'
type StageName = 'packed' | 'refined' | 'rule-constrained' | 'finalized' | 'final-assessed'
type CountRecord = Record<string, number>

function increment(record: CountRecord, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function structuralTier(status: StructuralLayoutStatus) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

function findingWeight(findings: StructuralLayoutFinding[]) {
  return findings.reduce((sum, finding) => sum + (finding.severity === 'high' ? 3 : finding.severity === 'medium' ? 2 : 1), 0)
}

function percent(value: number, total: number) {
  if (!total) return '0.0%'
  return `${((value / total) * 100).toFixed(1)}%`
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

function topRows(rows: Array<Record<string, string | number>>, key: string, limit = 10) {
  return [...rows]
    .sort((left, right) => {
      const delta = Number(right[key]) - Number(left[key])
      if (delta !== 0) return delta
      return String(left[Object.keys(left)[0]]).localeCompare(String(right[Object.keys(right)[0]]))
    })
    .slice(0, limit)
}

function collectFindingCounts(target: CountRecord, findings: StructuralLayoutFinding[]) {
  for (const finding of findings) increment(target, finding.name)
}

function diffFindingNames(previous: StructuralLayoutFinding[], next: StructuralLayoutFinding[]) {
  const previousNames = new Set(previous.map((finding) => finding.name))
  return next.filter((finding) => !previousNames.has(finding.name)).map((finding) => finding.name)
}

function sceneDelta(previous: Scene, next: Scene) {
  const keys: Array<keyof Scene> = ['title', 'subtitle', 'cta', 'logo', 'badge', 'image']
  let total = 0
  let changedElements = 0
  for (const key of keys) {
    const before = previous[key] as { x?: number; y?: number; w?: number; h?: number }
    const after = next[key] as { x?: number; y?: number; w?: number; h?: number }
    const delta =
      Math.abs((before.x || 0) - (after.x || 0)) +
      Math.abs((before.y || 0) - (after.y || 0)) +
      Math.abs((before.w || 0) - (after.w || 0)) +
      Math.abs((before.h || 0) - (after.h || 0))
    total += delta
    if (delta > 0.5) changedElements += 1
  }
  return { total, changedElements }
}

function finalAssessmentFindings(assessment: LayoutAssessment) {
  return assessment.structuralState?.findings || []
}

async function main() {
  const targetFormats = CHANNEL_FORMATS.filter((format) => marketplaceKeys.has(format.key))
  const totals = {
    contexts: 0,
    candidateStageEvaluations: 0,
    baseEvaluations: 0,
    selectedEvaluations: 0,
  }

  const finalFindingCounts: Record<CandidateKind, CountRecord> = { base: {}, selected: {} }
  const finalFindingByFormat: Record<string, CountRecord> = {}
  const finalStatusByFormat: Record<string, CountRecord> = {}
  const stageIntroductions: Record<string, CountRecord> = {}
  const stageStatusCounts: Record<string, CountRecord> = {}
  const stageWorsenCounts: Record<string, CountRecord> = {}
  const stageGeometryDeltaTotals: Record<string, { total: number; changedElements: number; samples: number }> = {}
  const finalGeometryWorsen = {
    ruleToFinalize: 0,
    finalizeToAssessed: 0,
    repackedCount: 0,
  }
  const finalGeometryWorsenReasons: Record<'ruleToFinalize' | 'finalizeToAssessed', CountRecord> = {
    ruleToFinalize: {},
    finalizeToAssessed: {},
  }

  for (const template of templates) {
    for (const goal of GOAL_PRESETS) {
      for (const visualSystem of VISUAL_SYSTEMS) {
        for (const pair of sampledBrandImagePairs) {
          totals.contexts += 1
          const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === pair.brandTemplateKey) || BRAND_TEMPLATES[0]
          const master = createMasterScene(template, brandTemplate.brandKit)
          const assetHint = pair.imageProfile ? ({ imageProfile: pair.imageProfile } satisfies AssetHint) : undefined

          for (const format of targetFormats) {
            const diagnostics = getPreviewCandidateStageDiagnostics({
              master,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })

            const candidates: Array<{ kind: CandidateKind; value: typeof diagnostics.baseCandidate }> = [
              { kind: 'base', value: diagnostics.baseCandidate },
              { kind: 'selected', value: diagnostics.selectedCandidate },
            ]

            for (const candidate of candidates) {
              totals.candidateStageEvaluations += 1
              if (candidate.kind === 'base') totals.baseEvaluations += 1
              else totals.selectedEvaluations += 1

              const finalFindings = finalAssessmentFindings(candidate.value.finalAssessment)
              collectFindingCounts(finalFindingCounts[candidate.kind], finalFindings)
              finalFindingByFormat[format.key] ||= {}
              collectFindingCounts(finalFindingByFormat[format.key], finalFindings)
              finalStatusByFormat[format.key] ||= {}
              increment(finalStatusByFormat[format.key], candidate.value.finalAssessment.structuralState?.status || 'invalid')

              const stages = candidate.value.stages
              if (candidate.value.repacked) finalGeometryWorsen.repackedCount += 1
              for (let index = 0; index < stages.length; index += 1) {
                const stage = stages[index]
                const stageKey = `${candidate.kind}:${stage.stage}`
                stageStatusCounts[stageKey] ||= {}
                increment(stageStatusCounts[stageKey], stage.structuralState.status)
                collectFindingCounts(stageIntroductions[stageKey] ||= {}, stage.structuralState.findings)

                if (index === 0) continue
                const previous = stages[index - 1]
                const transitionKey = `${candidate.kind}:${previous.stage}->${stage.stage}`
                const introduced = diffFindingNames(previous.structuralState.findings, stage.structuralState.findings)
                const delta = sceneDelta(previous.scene, stage.scene)
                stageGeometryDeltaTotals[transitionKey] ||= { total: 0, changedElements: 0, samples: 0 }
                stageGeometryDeltaTotals[transitionKey].total += delta.total
                stageGeometryDeltaTotals[transitionKey].changedElements += delta.changedElements
                stageGeometryDeltaTotals[transitionKey].samples += 1
                for (const name of introduced) increment(stageIntroductions[transitionKey] ||= {}, name)

                const previousTier = structuralTier(previous.structuralState.status)
                const nextTier = structuralTier(stage.structuralState.status)
                const previousWeight = findingWeight(previous.structuralState.findings)
                const nextWeight = findingWeight(stage.structuralState.findings)
                const worsened = nextTier < previousTier || (nextTier === previousTier && nextWeight > previousWeight)
                if (worsened) {
                  stageWorsenCounts[transitionKey] ||= {}
                  increment(stageWorsenCounts[transitionKey], 'count')
                  for (const name of introduced.length ? introduced : stage.structuralState.findings.map((finding) => finding.name)) {
                    increment(stageWorsenCounts[transitionKey], name)
                  }
                }

                if (previous.stage === 'rule-constrained' && stage.stage === 'finalized' && worsened) {
                  finalGeometryWorsen.ruleToFinalize += 1
                  for (const name of introduced.length ? introduced : stage.structuralState.findings.map((finding) => finding.name)) {
                    increment(finalGeometryWorsenReasons.ruleToFinalize, name)
                  }
                }

                if (previous.stage === 'finalized' && stage.stage === 'final-assessed' && worsened) {
                  finalGeometryWorsen.finalizeToAssessed += 1
                  for (const name of introduced.length ? introduced : stage.structuralState.findings.map((finding) => finding.name)) {
                    increment(finalGeometryWorsenReasons.finalizeToAssessed, name)
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const finalFailureRows = ['base', 'selected'].flatMap((kind) =>
    Object.entries(finalFindingCounts[kind as CandidateKind]).map(([finding, count]) => ({
      candidate: kind,
      finding,
      count,
      rate: percent(count, kind === 'base' ? totals.baseEvaluations : totals.selectedEvaluations),
    }))
  )

  const byFormatRows = targetFormats.map((format) => {
    const statusCounts = finalStatusByFormat[format.key] || {}
    const findingCounts = finalFindingByFormat[format.key] || {}
    const topFinding =
      Object.entries(findingCounts)
        .sort((left, right) => right[1] - left[1])[0]?.[0] || 'none'
    return {
      formatKey: format.key,
      valid: statusCounts.valid || 0,
      degraded: statusCounts.degraded || 0,
      invalid: statusCounts.invalid || 0,
      topFinding,
    }
  })

  const stageEmergenceRows = Object.entries(stageWorsenCounts)
    .map(([transition, counts]) => ({
      transition,
      worsenCount: counts.count || 0,
      topIntroducedFinding:
        Object.entries(counts)
          .filter(([name]) => name !== 'count')
          .sort((left, right) => right[1] - left[1])[0]?.[0] || 'none',
    }))
    .filter((row) => row.worsenCount > 0)

  const geometryRows = Object.entries(stageGeometryDeltaTotals).map(([transition, stats]) => ({
    transition,
    avgGeometryDelta: (stats.total / Math.max(stats.samples, 1)).toFixed(2),
    avgChangedElements: (stats.changedElements / Math.max(stats.samples, 1)).toFixed(2),
  }))

  const dominantBlockers = topRows(
    Object.entries(finalFindingCounts.selected).map(([finding, count]) => ({ finding, count })),
    'count',
    6
  )

  const hotspotRows = [
    {
      hotspot: 'applyRuleConstraints',
      file: 'src/lib/layoutEngine.ts',
      evidence:
        Object.keys(stageIntroductions['selected:refined->rule-constrained'] || {}).length
          ? Object.entries(stageIntroductions['selected:refined->rule-constrained'])
              .sort((left, right) => right[1] - left[1])[0]?.[0] || 'none'
          : 'none',
    },
    {
      hotspot: 'finalizeSceneGeometry / resolveSpacingConflicts',
      file: 'src/lib/layoutEngine.ts',
      evidence:
        Object.entries(finalGeometryWorsenReasons.ruleToFinalize)
          .sort((left, right) => right[1] - left[1])[0]?.[0] || 'none',
    },
    {
      hotspot: 'repackSceneForValidity',
      file: 'src/lib/layoutEngine.ts',
      evidence:
        Object.entries(finalGeometryWorsenReasons.finalizeToAssessed)
          .sort((left, right) => right[1] - left[1])[0]?.[0] || 'none',
    },
  ]

  console.log(`# Step 7.1C Marketplace Final Failure Isolation Report

## 1. Verification scope
- formats: marketplace-card, marketplace-tile, marketplace-highlight
- sample: 3 templates x 4 goals x 5 visual systems x 5 brand/image contexts
- contexts: ${totals.contexts}
- base candidate stage evaluations: ${totals.baseEvaluations}
- selected candidate stage evaluations: ${totals.selectedEvaluations}
- analysis method: \`getPreviewCandidateStageDiagnostics(...)\` on the normal preview path, with stage snapshots from \`packBlocks -> refineLayout -> applyRuleConstraints -> finalizeSceneGeometry -> final assessment/repack\`.

## 2. Final failure distribution
${toMarkdownTable(topRows(finalFailureRows, 'count', 12))}

## 3. Failure distribution by marketplace format
${toMarkdownTable(byFormatRows)}

## 4. Stage-by-stage failure emergence
${toMarkdownTable(topRows(stageEmergenceRows, 'worsenCount', 12))}

Stage geometry deltas:
${toMarkdownTable(topRows(geometryRows, 'avgGeometryDelta', 10))}

## 5. Whether final geometry resolution worsens marketplace scenes
- rule-constrained -> finalized worsened: ${finalGeometryWorsen.ruleToFinalize}
- finalized -> final-assessed worsened: ${finalGeometryWorsen.finalizeToAssessed}
- final repack triggered: ${finalGeometryWorsen.repackedCount}

Top findings introduced when rule-constrained -> finalized worsened:
${toMarkdownTable(topRows(Object.entries(finalGeometryWorsenReasons.ruleToFinalize).map(([finding, count]) => ({ finding, count })), 'count', 6))}

Top findings introduced when finalized -> final-assessed worsened:
${toMarkdownTable(topRows(Object.entries(finalGeometryWorsenReasons.finalizeToAssessed).map(([finding, count]) => ({ finding, count })), 'count', 6))}

## 6. Dominant blocker findings
${toMarkdownTable(dominantBlockers)}

## 7. Concrete code hotspots to fix next
${toMarkdownTable(hotspotRows)}

## 8. Files changed
- src/lib/layoutEngine.ts
- src/lib/autoAdapt.ts
- scripts/diagnostics/marketplaceFinalFailureIsolation.ts

## 9. Verification
- diagnostics script: scripts/diagnostics/marketplaceFinalFailureIsolation.ts
`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
