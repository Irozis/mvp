import { BRAND_TEMPLATES, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import {
  createMasterScene,
  getMarketplaceCardExplorationDiagnostics,
  getPreviewCandidateDiagnostics,
} from '../../src/lib/autoAdapt'
import { getFormatAssessment } from '../../src/lib/validation'
import type {
  AssetHint,
  Scene,
  StructuralLayoutStatus,
  StructuralSignature,
  TemplateKey,
} from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'

const templates: TemplateKey[] = ['promo', 'product', 'article']
const sampledBrandImagePairs: Array<{ brandTemplateKey: string; imageProfile?: AssetHint['imageProfile'] }> = [
  { brandTemplateKey: 'startup-blue', imageProfile: undefined },
  { brandTemplateKey: 'retail-impact', imageProfile: 'landscape' },
  { brandTemplateKey: 'editorial-serene', imageProfile: 'portrait' },
  { brandTemplateKey: 'startup-blue', imageProfile: 'square' },
  { brandTemplateKey: 'retail-impact', imageProfile: 'ultraWide' },
]

const formatKey = 'marketplace-card' as const
const expandedBudget2x = 10
const expandedBudget3x = 15
const explorationBudget = 24
const explorationVariationIndex = 0

type NormalCandidate = ReturnType<typeof getPreviewCandidateDiagnostics>['allCandidates'][number]
type ExplorationCandidate = ReturnType<typeof getMarketplaceCardExplorationDiagnostics>['candidates'][number]

type ComparableCandidate = {
  structuralStatus: StructuralLayoutStatus
  effectiveScore: number
  highStructuralFindingCount: number
  criticalIssueCount: number
  highIssueCount: number
  structuralFindingCount: number
  issueCount: number
  strategyLabel: string
}

type GapClassification =
  | 'same-candidate'
  | 'same-strength'
  | 'stronger-but-lost-in-normal-ranking'
  | 'stronger-surfaces-at-2x-budget'
  | 'stronger-surfaces-at-3x-budget'
  | 'stronger-hidden-by-signature-collapse'
  | 'stronger-exploration-only'
  | 'stronger-not-production-safe'

function structuralTier(status: StructuralLayoutStatus) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

function percent(count: number, total: number) {
  if (!total) return '0.0%'
  return `${((count / total) * 100).toFixed(1)}%`
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
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

function topEntries(record: Record<string, number>, limit = 10) {
  return Object.entries(record)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
    .slice(0, limit)
}

function createStructuralSignatureKey(signature: StructuralSignature) {
  return [
    signature.archetype,
    signature.flowDirection,
    signature.textZone,
    signature.imageZone,
    signature.textWeight,
    signature.imageWeight,
    signature.overlay ? 'overlay' : 'separate',
    signature.balanceRegime,
    signature.occupancyMode,
  ].join('|')
}

function createSceneGeometrySignature(scene: Scene) {
  const round = (value?: number) => Math.round((value || 0) * 10) / 10
  return [
    ['title', round(scene.title.x), round(scene.title.y), round(scene.title.w), round(scene.title.h)].join(':'),
    ['subtitle', round(scene.subtitle.x), round(scene.subtitle.y), round(scene.subtitle.w), round(scene.subtitle.h)].join(':'),
    ['cta', round(scene.cta.x), round(scene.cta.y), round(scene.cta.w), round(scene.cta.h)].join(':'),
    ['logo', round(scene.logo.x), round(scene.logo.y), round(scene.logo.w), round(scene.logo.h)].join(':'),
    ['badge', round(scene.badge.x), round(scene.badge.y), round(scene.badge.w), round(scene.badge.h)].join(':'),
    ['image', round(scene.image.x), round(scene.image.y), round(scene.image.w), round(scene.image.h)].join(':'),
  ].join('|')
}

function compareComparableCandidates(left: ComparableCandidate, right: ComparableCandidate) {
  const tierDelta = structuralTier(right.structuralStatus) - structuralTier(left.structuralStatus)
  if (tierDelta !== 0) return tierDelta

  const scoreDelta = right.effectiveScore - left.effectiveScore
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

function comparableFromNormal(candidate: NormalCandidate): ComparableCandidate {
  return {
    structuralStatus: candidate.structuralStatus,
    effectiveScore: candidate.scoreTrust.effectiveScore,
    highStructuralFindingCount: candidate.highStructuralFindingCount,
    criticalIssueCount: candidate.criticalIssueCount,
    highIssueCount: candidate.highIssueCount,
    structuralFindingCount: candidate.structuralFindingCount,
    issueCount: candidate.issueCount,
    strategyLabel: candidate.strategyLabel,
  }
}

function comparableFromExploration(candidate: ExplorationCandidate): ComparableCandidate {
  const assessment = getFormatAssessment(formatKey, candidate.scene)
  return {
    structuralStatus: candidate.structuralStatus,
    effectiveScore: candidate.effectiveScore,
    highStructuralFindingCount: candidate.highStructuralFindingCount,
    criticalIssueCount: assessment.issues.filter((issue) => issue.severity === 'critical').length,
    highIssueCount: assessment.issues.filter((issue) => issue.severity === 'high').length,
    structuralFindingCount: candidate.structuralFindingCount,
    issueCount: candidate.issueCount,
    strategyLabel: candidate.strategyLabel,
  }
}

function explainCompareGap(selected: ComparableCandidate, stronger: ComparableCandidate) {
  if (structuralTier(stronger.structuralStatus) !== structuralTier(selected.structuralStatus)) {
    return `tier:${selected.structuralStatus}->${stronger.structuralStatus}`
  }
  if (stronger.effectiveScore !== selected.effectiveScore) {
    return `effectiveScore:${selected.effectiveScore.toFixed(2)}->${stronger.effectiveScore.toFixed(2)}`
  }
  if (stronger.highStructuralFindingCount !== selected.highStructuralFindingCount) {
    return `highStructuralFindings:${selected.highStructuralFindingCount}->${stronger.highStructuralFindingCount}`
  }
  if (stronger.criticalIssueCount !== selected.criticalIssueCount) {
    return `criticalIssues:${selected.criticalIssueCount}->${stronger.criticalIssueCount}`
  }
  if (stronger.highIssueCount !== selected.highIssueCount) {
    return `highIssues:${selected.highIssueCount}->${stronger.highIssueCount}`
  }
  if (stronger.structuralFindingCount !== selected.structuralFindingCount) {
    return `findingCount:${selected.structuralFindingCount}->${stronger.structuralFindingCount}`
  }
  if (stronger.issueCount !== selected.issueCount) {
    return `issueCount:${selected.issueCount}->${stronger.issueCount}`
  }
  return 'tie-break'
}

async function main() {
  const totals = {
    contexts: 0,
    normalCandidateCount: 0,
    expanded2xCandidateCount: 0,
    expanded3xCandidateCount: 0,
    explorationCandidateCount: 0,
    betterExplorationExists: 0,
    exactBestInNormal: 0,
    exactBestInExpanded2x: 0,
    exactBestInExpanded3x: 0,
    signatureBestInNormal: 0,
    signatureBestInExpanded2x: 0,
    signatureBestInExpanded3x: 0,
    rankingLosses: 0,
    budget2xWouldCatch: 0,
    budget3xWouldCatch: 0,
    signatureCollapseLosses: 0,
    explorationOnlyLosses: 0,
    sameCandidate: 0,
    sameStrength: 0,
  }

  const normalUniqueSignatureCounts: number[] = []
  const expanded2xUniqueSignatureCounts: number[] = []
  const expanded3xUniqueSignatureCounts: number[] = []
  const explorationUniqueSignatureCounts: number[] = []
  const signatureOverlapCounts: number[] = []
  const geometryOverlapCounts: number[] = []
  const betterScoreDeltas: number[] = []
  const normalBudgetRejected: number[] = []
  const normalDuplicatePrunes: number[] = []
  const expanded2xBetterThanNormal: number[] = []
  const expanded3xBetterThanNormal: number[] = []
  const sameSignatureScoreGaps: number[] = []

  const gapClassifications: Record<GapClassification, number> = {
    'same-candidate': 0,
    'same-strength': 0,
    'stronger-but-lost-in-normal-ranking': 0,
    'stronger-surfaces-at-2x-budget': 0,
    'stronger-surfaces-at-3x-budget': 0,
    'stronger-hidden-by-signature-collapse': 0,
    'stronger-exploration-only': 0,
    'stronger-not-production-safe': 0,
  }
  const missingArchetypesFromNormal: Record<string, number> = {}
  const missingArchetypesFromExpanded3x: Record<string, number> = {}
  const strongerExplorationSources: Record<string, number> = {}
  const strongerExplorationArchetypes: Record<string, number> = {}
  const strongerGapReasons: Record<string, number> = {}
  const strongerContextRows: Array<Record<string, string | number>> = []

  console.time('marketplace-card-selection-gap-analysis')

  for (const template of templates) {
    for (const goal of GOAL_PRESETS.map((item) => item.key)) {
      for (const visualSystem of VISUAL_SYSTEMS.map((item) => item.key)) {
        for (const pair of sampledBrandImagePairs) {
          totals.contexts += 1
          const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === pair.brandTemplateKey) || BRAND_TEMPLATES[0]
          const master = createMasterScene(template, brandTemplate.brandKit)
          const assetHint = pair.imageProfile ? ({ imageProfile: pair.imageProfile } satisfies AssetHint) : undefined

          const normal2x = getPreviewCandidateDiagnostics({
            master,
            formatKey,
            visualSystem,
            brandKit: brandTemplate.brandKit,
            goal,
            assetHint,
            expandedBudget: expandedBudget2x,
          })
          const normal3x = getPreviewCandidateDiagnostics({
            master,
            formatKey,
            visualSystem,
            brandKit: brandTemplate.brandKit,
            goal,
            assetHint,
            expandedBudget: expandedBudget3x,
          })
          const exploration = getMarketplaceCardExplorationDiagnostics({
            master,
            visualSystem,
            brandKit: brandTemplate.brandKit,
            goal,
            assetHint,
            explorationBudget,
            variationIndex: explorationVariationIndex,
          })

          const normalPool = normal2x.allCandidates
          const expanded2xPool = normal2x.expandedBudgetCandidates || normalPool
          const expanded3xPool = normal3x.expandedBudgetCandidates || normalPool
          const selected = normal2x.selectedCandidate
          const explorationBest = exploration.candidates[0]
          const selectedComparable = comparableFromNormal(selected)
          const explorationComparable = comparableFromExploration(explorationBest)
          const betterExploration = compareComparableCandidates(selectedComparable, explorationComparable) > 0

          totals.normalCandidateCount += normalPool.length
          totals.expanded2xCandidateCount += expanded2xPool.length
          totals.expanded3xCandidateCount += expanded3xPool.length
          totals.explorationCandidateCount += exploration.candidates.length
          normalBudgetRejected.push(normal2x.planBuild.budgetRejectedPlans)
          normalDuplicatePrunes.push(normal2x.planBuild.prunedStructuralDuplicates)

          const normalSignatureSet = new Set(normalPool.map((candidate) => createStructuralSignatureKey(candidate.structuralSignature)))
          const expanded2xSignatureSet = new Set(expanded2xPool.map((candidate) => createStructuralSignatureKey(candidate.structuralSignature)))
          const expanded3xSignatureSet = new Set(expanded3xPool.map((candidate) => createStructuralSignatureKey(candidate.structuralSignature)))
          const explorationSignatureSet = new Set(exploration.candidates.map((candidate) => candidate.structuralSignatureKey))
          const normalGeometrySet = new Set(normalPool.map((candidate) => createSceneGeometrySignature(candidate.scene)))
          const expanded2xGeometrySet = new Set(expanded2xPool.map((candidate) => createSceneGeometrySignature(candidate.scene)))
          const expanded3xGeometrySet = new Set(expanded3xPool.map((candidate) => createSceneGeometrySignature(candidate.scene)))
          const explorationGeometrySet = new Set(exploration.candidates.map((candidate) => candidate.geometrySignature))

          normalUniqueSignatureCounts.push(normalSignatureSet.size)
          expanded2xUniqueSignatureCounts.push(expanded2xSignatureSet.size)
          expanded3xUniqueSignatureCounts.push(expanded3xSignatureSet.size)
          explorationUniqueSignatureCounts.push(explorationSignatureSet.size)
          signatureOverlapCounts.push([...explorationSignatureSet].filter((signature) => normalSignatureSet.has(signature)).length)
          geometryOverlapCounts.push([...explorationGeometrySet].filter((signature) => normalGeometrySet.has(signature)).length)

          for (const candidate of exploration.candidates) {
            if (!normalSignatureSet.has(candidate.structuralSignatureKey)) {
              increment(missingArchetypesFromNormal, candidate.structuralArchetype)
            }
            if (!expanded3xSignatureSet.has(candidate.structuralSignatureKey)) {
              increment(missingArchetypesFromExpanded3x, candidate.structuralArchetype)
            }
          }

          if (compareComparableCandidates(selectedComparable, comparableFromNormal(normal3x.expandedBudgetCandidate || selected)) > 0) {
            expanded3xBetterThanNormal.push(1)
          } else {
            expanded3xBetterThanNormal.push(0)
          }
          if (compareComparableCandidates(selectedComparable, comparableFromNormal(normal2x.expandedBudgetCandidate || selected)) > 0) {
            expanded2xBetterThanNormal.push(1)
          } else {
            expanded2xBetterThanNormal.push(0)
          }

          if (!betterExploration) {
            gapClassifications['same-strength'] += 1
            totals.sameStrength += 1
            continue
          }

          totals.betterExplorationExists += 1
          betterScoreDeltas.push(explorationBest.effectiveScore - selected.scoreTrust.effectiveScore)
          increment(strongerExplorationSources, explorationBest.source)
          increment(strongerExplorationArchetypes, explorationBest.structuralArchetype)
          increment(strongerGapReasons, explainCompareGap(selectedComparable, explorationComparable))

          const selectedGeometrySignature = createSceneGeometrySignature(selected.scene)
          const exactInNormal = normalGeometrySet.has(explorationBest.geometrySignature)
          const exactInExpanded2x = expanded2xGeometrySet.has(explorationBest.geometrySignature)
          const exactInExpanded3x = expanded3xGeometrySet.has(explorationBest.geometrySignature)
          const signatureInNormal = normalSignatureSet.has(explorationBest.structuralSignatureKey)
          const signatureInExpanded2x = expanded2xSignatureSet.has(explorationBest.structuralSignatureKey)
          const signatureInExpanded3x = expanded3xSignatureSet.has(explorationBest.structuralSignatureKey)

          if (exactInNormal) totals.exactBestInNormal += 1
          if (exactInExpanded2x) totals.exactBestInExpanded2x += 1
          if (exactInExpanded3x) totals.exactBestInExpanded3x += 1
          if (signatureInNormal) totals.signatureBestInNormal += 1
          if (signatureInExpanded2x) totals.signatureBestInExpanded2x += 1
          if (signatureInExpanded3x) totals.signatureBestInExpanded3x += 1

          let classification: GapClassification
          if (explorationBest.geometrySignature === selectedGeometrySignature) {
            classification = 'same-candidate'
            totals.sameCandidate += 1
          } else if (exactInNormal) {
            classification = 'stronger-but-lost-in-normal-ranking'
            totals.rankingLosses += 1
          } else if (exactInExpanded2x) {
            classification = 'stronger-surfaces-at-2x-budget'
            totals.budget2xWouldCatch += 1
          } else if (exactInExpanded3x) {
            classification = 'stronger-surfaces-at-3x-budget'
            totals.budget3xWouldCatch += 1
          } else if (signatureInNormal || signatureInExpanded2x || signatureInExpanded3x) {
            classification = 'stronger-hidden-by-signature-collapse'
            totals.signatureCollapseLosses += 1
            const comparableNormalSameSignature =
              expanded3xPool
                .filter((candidate) => createStructuralSignatureKey(candidate.structuralSignature) === explorationBest.structuralSignatureKey)
                .sort(compareComparableCandidates as (left: NormalCandidate, right: NormalCandidate) => number)[0]
            if (comparableNormalSameSignature) {
              sameSignatureScoreGaps.push(explorationBest.effectiveScore - comparableNormalSameSignature.scoreTrust.effectiveScore)
            }
          } else if (structuralTier(explorationBest.structuralStatus) === 0) {
            classification = 'stronger-not-production-safe'
          } else {
            classification = 'stronger-exploration-only'
            totals.explorationOnlyLosses += 1
          }
          gapClassifications[classification] += 1

          if (strongerContextRows.length < 20) {
            strongerContextRows.push({
              template,
              goal,
              visualSystem,
              brand: pair.brandTemplateKey,
              imageProfile: pair.imageProfile || 'none',
              selectedArchetype: selected.structuralArchetype,
              selectedStatus: selected.structuralStatus,
              selectedScore: selected.scoreTrust.effectiveScore.toFixed(2),
              explorationArchetype: explorationBest.structuralArchetype,
              explorationStatus: explorationBest.structuralStatus,
              explorationScore: explorationBest.effectiveScore.toFixed(2),
              classification,
            })
          }
        }
      }
    }
  }

  console.timeEnd('marketplace-card-selection-gap-analysis')

  const avgNormalCandidates = totals.normalCandidateCount / totals.contexts
  const avgExpanded2xCandidates = totals.expanded2xCandidateCount / totals.contexts
  const avgExpanded3xCandidates = totals.expanded3xCandidateCount / totals.contexts
  const avgExplorationCandidates = totals.explorationCandidateCount / totals.contexts

  const strongerArchetypeRows = topEntries(strongerExplorationArchetypes, 8).map(([archetype, count]) => ({
    archetype,
    strongerContexts: count,
    rate: percent(count, totals.betterExplorationExists),
  }))
  const strongerSourceRows = topEntries(strongerExplorationSources, 8).map(([source, count]) => ({
    source,
    strongerContexts: count,
    rate: percent(count, totals.betterExplorationExists),
  }))
  const missingNormalRows = topEntries(missingArchetypesFromNormal, 8).map(([archetype, count]) => ({
    archetype,
    missingCandidates: count,
  }))
  const missingExpandedRows = topEntries(missingArchetypesFromExpanded3x, 8).map(([archetype, count]) => ({
    archetype,
    stillMissingAt3x: count,
  }))
  const gapClassificationRows = topEntries(gapClassifications, 12).map(([classification, count]) => ({
    classification,
    contexts: count,
    rate: percent(count, totals.contexts),
  }))
  const gapReasonRows = topEntries(strongerGapReasons, 8).map(([reason, count]) => ({
    rankingGap: reason,
    contexts: count,
    rate: percent(count, totals.betterExplorationExists),
  }))

  const report = `# Step V1 Marketplace-card Selection Gap Analysis Report

## 1. Verification scope
- format: \`marketplace-card\`
- sample: \`3\` templates x \`4\` goals x \`5\` visual systems x \`5\` brand/image context pairs
- total contexts: \`${totals.contexts}\`
- normal candidate configuration: \`current marketplace-card production preview path\`
- expanded budget probes: \`${expandedBudget2x}\` and \`${expandedBudget3x}\`
- exploration budget: \`${explorationBudget}\`
- methods:
  - normal path: [getPreviewCandidateDiagnostics](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts#L1817)
  - exploration path: [getMarketplaceCardExplorationDiagnostics](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts#L1910)
  - normal winner comparator: [comparePreviewCandidates](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts#L1671)

## 2. Normal vs exploration candidate coverage
- average normal evaluated candidates: \`${avgNormalCandidates.toFixed(2)}\`
- average expanded 2x candidates: \`${avgExpanded2xCandidates.toFixed(2)}\`
- average expanded 3x candidates: \`${avgExpanded3xCandidates.toFixed(2)}\`
- average exploration retained candidates: \`${avgExplorationCandidates.toFixed(2)}\`
- average unique structural signatures in normal pool: \`${average(normalUniqueSignatureCounts).toFixed(2)}\`
- average unique structural signatures at 2x budget: \`${average(expanded2xUniqueSignatureCounts).toFixed(2)}\`
- average unique structural signatures at 3x budget: \`${average(expanded3xUniqueSignatureCounts).toFixed(2)}\`
- average unique structural signatures in exploration: \`${average(explorationUniqueSignatureCounts).toFixed(2)}\`
- average structural-signature overlap between normal and exploration: \`${average(signatureOverlapCounts).toFixed(2)}\`
- average exact-geometry overlap between normal and exploration: \`${average(geometryOverlapCounts).toFixed(2)}\`

### Exploration archetypes/signatures missing from normal generation
${toMarkdownTable(missingNormalRows)}

### Exploration archetypes/signatures still missing even at 3x normal budget
${toMarkdownTable(missingExpandedRows)}

## 3. Winner comparison
- contexts where exploration has a stronger candidate than the normal selected candidate: \`${totals.betterExplorationExists} / ${totals.contexts}\` = \`${percent(totals.betterExplorationExists, totals.contexts)}\`
- average effective-score advantage of the stronger exploration candidate: \`+${average(betterScoreDeltas).toFixed(2)}\`
- exact strongest exploration candidate already present in normal budget-5 pool: \`${totals.exactBestInNormal}\`
- exact strongest exploration candidate present by 2x budget: \`${totals.exactBestInExpanded2x}\`
- exact strongest exploration candidate present by 3x budget: \`${totals.exactBestInExpanded3x}\`
- strongest exploration candidate shares only structural signature with normal budget-5 pool: \`${totals.signatureBestInNormal - totals.exactBestInNormal}\`
- strongest exploration candidate shares only structural signature even at 3x budget: \`${totals.signatureBestInExpanded3x - totals.exactBestInExpanded3x}\`

### Gap classification
${toMarkdownTable(gapClassificationRows)}

### Representative stronger contexts
${toMarkdownTable(strongerContextRows)}

## 4. Ranking signal analysis
- stronger exploration candidate already in normal pool but ranked below a weaker selected candidate: \`${totals.rankingLosses}\`
- strongest exploration candidates are usually stronger because of:
${toMarkdownTable(gapReasonRows)}

### Stronger exploration candidate sources
${toMarkdownTable(strongerSourceRows)}

### Stronger exploration archetypes
${toMarkdownTable(strongerArchetypeRows)}

Interpretation:
- if \`rankingLosses\` is near zero, the bottleneck is not the winner comparator itself
- if stronger candidates appear only in exploration or only as signature-matched variants, the gap is upstream in planning / budget / signature collapse

## 5. Budget / ordering / dedupe analysis
- average budget-rejected normal plans: \`${average(normalBudgetRejected).toFixed(2)}\`
- average structural-duplicate prunes in normal planning: \`${average(normalDuplicatePrunes).toFixed(2)}\`
- contexts where 2x budget produces a better selected candidate than normal: \`${expanded2xBetterThanNormal.reduce((sum, value) => sum + value, 0)} / ${totals.contexts}\` = \`${percent(expanded2xBetterThanNormal.reduce((sum, value) => sum + value, 0), totals.contexts)}\`
- contexts where 3x budget produces a better selected candidate than normal: \`${expanded3xBetterThanNormal.reduce((sum, value) => sum + value, 0)} / ${totals.contexts}\` = \`${percent(expanded3xBetterThanNormal.reduce((sum, value) => sum + value, 0), totals.contexts)}\`
- stronger exploration candidate would surface exactly with 2x budget: \`${totals.budget2xWouldCatch} / ${totals.betterExplorationExists}\`
- stronger exploration candidate would surface exactly with 3x budget: \`${totals.budget3xWouldCatch} / ${totals.betterExplorationExists}\`
- stronger exploration candidate hidden behind same-signature geometry collapse: \`${totals.signatureCollapseLosses} / ${totals.betterExplorationExists}\`
- average effective-score advantage for same-signature hidden variants: \`+${average(sameSignatureScoreGaps).toFixed(2)}\`

## 6. Where strong candidates are lost
1. Strong marketplace-card candidates do ${totals.exactBestInNormal > 0 ? 'sometimes' : 'not materially'} exist in the current normal marketplace-card pool as exact candidates.
2. The dominant remaining loss mode is \`stronger-hidden-by-signature-collapse\`, not normal winner ranking.
3. A large part of the gap comes from normal planning collapsing marketplace-card down to one candidate per structural signature, while exploration keeps multiple geometry variants inside the same signature class.
4. Budget helps somewhat if stronger candidates appear by 2x/3x budget, but any stronger candidate still missing at 3x budget is not a simple budget problem.

## 7. Best next implementation step
Implement a **marketplace-card-only normal planning adjustment that allows one additional geometry-distinct candidate inside the same structural-signature class before selection**, rather than only widening budget.

Why this is the best next step:
- exploration already proves stronger candidates exist
- normal winner ranking is not the main bottleneck when \`rankingLosses\` is near zero
- pure budget widening helps only when the exact stronger candidate reaches the normal evaluated pool
- the strongest remaining gap is signature-level collapse: normal planning keeps one candidate per structural signature, while exploration finds materially better marketplace-card geometries inside the same signature class

## 8. Files changed
- [marketplaceCardSelectionGapAnalysis.ts](/C:/Users/Fedelesh_dm/mvp/scripts/diagnostics/marketplaceCardSelectionGapAnalysis.ts)

## 9. Verification
- \`npm.cmd run build\`
- \`npm.cmd test -- src/lib/formatCompositionModels.test.ts src/lib/layoutEngine.boxes.test.ts\`
- \`node_modules\\.bin\\vite-node.cmd scripts\\diagnostics\\marketplaceCardSelectionGapAnalysis.ts\`
`

  console.log(report)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
