import { BRAND_TEMPLATES, CHANNEL_FORMATS, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, generateVariant, getPreviewCandidateDiagnostics, getRepairDiagnostics } from '../../src/lib/autoAdapt'
import type {
  AssetHint,
  FixSessionState,
  StructuralArchetype,
  StructuralLayoutStatus,
  StructuralSignature,
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

const previousBaseline = {
  previewMixedTierPoolsRate: '0.0% (0 / 17,100)',
  previewTierImprovementRate: '0.0% (0 / 17,100)',
  repairTierImprovementRate: '0.0% (0 / 5,700)',
  repeatedFixSecondPlusRate: '0.0%',
  repeatedFixStagnationRate: '100.0%',
}

type PreviewDiagnosticsOutput = ReturnType<typeof getPreviewCandidateDiagnostics>
type RepairDiagnosticsOutput = Awaited<ReturnType<typeof getRepairDiagnostics>>
type CountRecord = Record<string, number>

type PreviewAggregate = {
  pools: number
  candidateCount: number
  uniqueSignatures: number
  uniqueArchetypes: number
  multiArchetypePools: number
  mixedTierPools: number
  selectionTierImproved: number
}

type ArchetypeStats = {
  candidateCount: number
  poolPresence: number
  wins: number
  valid: number
  degraded: number
  invalid: number
  selectedScores: number[]
  byCategory: Record<string, { appearances: number; wins: number }>
  byKey: Record<string, { appearances: number; wins: number }>
}

type StrategyStats = {
  attempts: number
  accepted: number
  tierImproved: number
}

function increment(record: CountRecord, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function ensureAggregate(record: Record<string, PreviewAggregate>, key: string): PreviewAggregate {
  record[key] ||= {
    pools: 0,
    candidateCount: 0,
    uniqueSignatures: 0,
    uniqueArchetypes: 0,
    multiArchetypePools: 0,
    mixedTierPools: 0,
    selectionTierImproved: 0,
  }
  return record[key]
}

function ensureArchetypeStats(record: Record<string, ArchetypeStats>, key: string): ArchetypeStats {
  record[key] ||= {
    candidateCount: 0,
    poolPresence: 0,
    wins: 0,
    valid: 0,
    degraded: 0,
    invalid: 0,
    selectedScores: [],
    byCategory: {},
    byKey: {},
  }
  return record[key]
}

function ensureStrategyStats(record: Record<string, StrategyStats>, key: string): StrategyStats {
  record[key] ||= {
    attempts: 0,
    accepted: 0,
    tierImproved: 0,
  }
  return record[key]
}

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

function topEntries(record: CountRecord, limit = 8, descending = true) {
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

function structuralSignatureKey(signature: StructuralSignature) {
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

function normalizeMetric(value?: number) {
  return Math.round((value || 0) * 10) / 10
}

function sceneGeometrySignature(scene: PreviewDiagnosticsOutput['allCandidates'][number]['scene'] | RepairDiagnosticsOutput['scene']) {
  return JSON.stringify({
    title: {
      x: normalizeMetric(scene.title.x),
      y: normalizeMetric(scene.title.y),
      w: normalizeMetric(scene.title.w),
      h: normalizeMetric(scene.title.h),
      fontSize: normalizeMetric(scene.title.fontSize),
      lines: scene.title.maxLines || 0,
    },
    subtitle: {
      x: normalizeMetric(scene.subtitle.x),
      y: normalizeMetric(scene.subtitle.y),
      w: normalizeMetric(scene.subtitle.w),
      h: normalizeMetric(scene.subtitle.h),
      fontSize: normalizeMetric(scene.subtitle.fontSize),
      opacity: normalizeMetric(scene.subtitle.opacity),
    },
    cta: {
      x: normalizeMetric(scene.cta.x),
      y: normalizeMetric(scene.cta.y),
      w: normalizeMetric(scene.cta.w),
      h: normalizeMetric(scene.cta.h),
    },
    badge: {
      x: normalizeMetric(scene.badge.x),
      y: normalizeMetric(scene.badge.y),
      w: normalizeMetric(scene.badge.w),
      h: normalizeMetric(scene.badge.h),
    },
    logo: {
      x: normalizeMetric(scene.logo.x),
      y: normalizeMetric(scene.logo.y),
      w: normalizeMetric(scene.logo.w),
      h: normalizeMetric(scene.logo.h),
    },
    image: {
      x: normalizeMetric(scene.image.x),
      y: normalizeMetric(scene.image.y),
      w: normalizeMetric(scene.image.w),
      h: normalizeMetric(scene.image.h),
      fit: scene.image.fit,
    },
  })
}

function classifyPool(statuses: StructuralLayoutStatus[]) {
  const uniqueStatuses = Array.from(new Set(statuses)).sort()
  if (uniqueStatuses.length === 1) return `only-${uniqueStatuses[0]}`
  if (uniqueStatuses.length === 2) return `mixed-${uniqueStatuses.join('-')}`
  return 'mixed-valid-degraded-invalid'
}

function shouldSeedRepeatedFix(output: RepairDiagnosticsOutput) {
  return output.assessment.structuralState?.status !== 'valid' || output.scoreTrust.effectiveScore < 84
}

function parseRegenerationArchetype(label: string): StructuralArchetype | undefined {
  const normalized = label.endsWith('-regeneration') ? label.slice(0, -'-regeneration'.length) : label
  if (normalized.startsWith('guided-stronger-')) return normalized.slice('guided-stronger-'.length) as StructuralArchetype
  if (normalized.startsWith('guided-')) return normalized.slice('guided-'.length) as StructuralArchetype
  return undefined
}

async function main() {
  const previewTotals = {
    contexts: 0,
    candidatePools: 0,
    totalCandidates: 0,
    totalUniqueSignatures: 0,
    totalUniqueArchetypes: 0,
    multiArchetypePools: 0,
    mixedTierPools: 0,
    selectedNotBase: 0,
    structuralTierImproved: 0,
    sameTierScoreImproved: 0,
    pruningHitPools: 0,
    attemptedPlans: 0,
    acceptedPlans: 0,
    prunedStructuralDuplicates: 0,
    budgetRejectedPlans: 0,
    duplicateSignaturePoolsAfterPruning: 0,
    differentSignaturePairs: 0,
    differentSignatureDifferentGeometryPairs: 0,
    differentSignatureSameGeometryPairs: 0,
    differentArchetypeSameGeometryPairs: 0,
  }

  const previewTransitions: CountRecord = {
    'invalid->degraded': 0,
    'degraded->valid': 0,
    'invalid->valid': 0,
  }
  const poolClassCounts: CountRecord = {}
  const previewCategoryStats: Record<string, PreviewAggregate> = {}
  const previewKeyStats: Record<string, PreviewAggregate> = {}
  const archetypeStats: Record<string, ArchetypeStats> = {}

  const repairTotals = {
    evaluations: 0,
    acceptedImprovements: 0,
    rejected: 0,
    unchanged: 0,
    structuralTierImproved: 0,
    sameTierScoreImproved: 0,
    localTierImprovedAttempts: 0,
    localAcceptedAttempts: 0,
    localAttempts: 0,
    regenerationTierImprovedAttempts: 0,
    regenerationAcceptedAttempts: 0,
    regenerationAttempts: 0,
    regenerationEscapeAttempts: 0,
    regenerationAcceptedEscapeAttempts: 0,
    regenerationAcceptedEscapeWithTierGain: 0,
  }
  const repairTransitions: CountRecord = {
    'invalid->degraded': 0,
    'degraded->valid': 0,
    'invalid->valid': 0,
  }
  const repairCategoryStats: Record<string, { total: number; tierImproved: number }> = {}
  const repairKeyStats: Record<string, { total: number; tierImproved: number }> = {}
  const repairStrategyStats: Record<string, StrategyStats> = {}

  const repeatedFixSeeds: Array<{
    scene: RepairDiagnosticsOutput['scene']
    formatKey: PreviewDiagnosticsOutput['formatKey']
    visualSystem: VisualSystemKey
    goal: (typeof GOAL_PRESETS)[number]['key']
    brandKit: (typeof BRAND_TEMPLATES)[number]['brandKit']
    assetHint?: AssetHint
  }> = []
  const repeatedSeedCountByFormat: CountRecord = {}
  const repeatedFixStats = {
    sequences: 0,
    totalCalls: 0,
    firstImproved: 0,
    secondImproved: 0,
    thirdImproved: 0,
    fourthImproved: 0,
    stagnated: 0,
    oscillated: 0,
    exhausted: 0,
    averageImprovementPasses: 0,
  }

  console.time('step5-structural-diversity-evaluation')

  for (const template of templates) {
    for (const goal of GOAL_PRESETS.map((item) => item.key)) {
      for (const visualSystem of VISUAL_SYSTEMS.map((item) => item.key)) {
        for (const pair of sampledBrandImagePairs) {
          previewTotals.contexts += 1
          const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === pair.brandTemplateKey) || BRAND_TEMPLATES[0]
          const master = createMasterScene(template, brandTemplate.brandKit)
          const assetHint = pair.imageProfile ? ({ imageProfile: pair.imageProfile } satisfies AssetHint) : undefined

          for (const format of CHANNEL_FORMATS) {
            const preview = getPreviewCandidateDiagnostics({
              master,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })

            previewTotals.candidatePools += 1
            previewTotals.totalCandidates += preview.allCandidates.length
            previewTotals.totalUniqueSignatures += new Set(preview.allCandidates.map((candidate) => structuralSignatureKey(candidate.structuralSignature))).size
            previewTotals.totalUniqueArchetypes += new Set(preview.allCandidates.map((candidate) => candidate.structuralArchetype)).size
            previewTotals.attemptedPlans += preview.planBuild.attemptedPlans
            previewTotals.acceptedPlans += preview.planBuild.acceptedPlans
            previewTotals.prunedStructuralDuplicates += preview.planBuild.prunedStructuralDuplicates
            previewTotals.budgetRejectedPlans += preview.planBuild.budgetRejectedPlans
            if (preview.planBuild.prunedStructuralDuplicates > 0) previewTotals.pruningHitPools += 1

            const poolStatuses = preview.allCandidates.map((candidate) => candidate.structuralStatus)
            const uniqueArchetypes = new Set(preview.allCandidates.map((candidate) => candidate.structuralArchetype))
            const uniqueSignatures = new Set(preview.allCandidates.map((candidate) => structuralSignatureKey(candidate.structuralSignature)))
            const geometryKeys = preview.allCandidates.map((candidate) => sceneGeometrySignature(candidate.scene))
            if (uniqueArchetypes.size > 1) previewTotals.multiArchetypePools += 1
            if (new Set(poolStatuses).size > 1) previewTotals.mixedTierPools += 1
            if (uniqueSignatures.size !== preview.allCandidates.length) previewTotals.duplicateSignaturePoolsAfterPruning += 1
            increment(poolClassCounts, classifyPool(poolStatuses))

            const categoryAggregate = ensureAggregate(previewCategoryStats, format.category)
            const keyAggregate = ensureAggregate(previewKeyStats, format.key)
            for (const aggregate of [categoryAggregate, keyAggregate]) {
              aggregate.pools += 1
              aggregate.candidateCount += preview.allCandidates.length
              aggregate.uniqueSignatures += uniqueSignatures.size
              aggregate.uniqueArchetypes += uniqueArchetypes.size
              if (uniqueArchetypes.size > 1) aggregate.multiArchetypePools += 1
              if (new Set(poolStatuses).size > 1) aggregate.mixedTierPools += 1
            }

            for (let left = 0; left < preview.allCandidates.length; left += 1) {
              for (let right = left + 1; right < preview.allCandidates.length; right += 1) {
                const leftCandidate = preview.allCandidates[left]
                const rightCandidate = preview.allCandidates[right]
                const leftSignature = structuralSignatureKey(leftCandidate.structuralSignature)
                const rightSignature = structuralSignatureKey(rightCandidate.structuralSignature)
                if (leftSignature === rightSignature) continue
                previewTotals.differentSignaturePairs += 1
                const sameGeometry = geometryKeys[left] === geometryKeys[right]
                if (sameGeometry) {
                  previewTotals.differentSignatureSameGeometryPairs += 1
                  if (leftCandidate.structuralArchetype !== rightCandidate.structuralArchetype) {
                    previewTotals.differentArchetypeSameGeometryPairs += 1
                  }
                } else {
                  previewTotals.differentSignatureDifferentGeometryPairs += 1
                }
              }
            }

            const seenArchetypesInPool = new Set<StructuralArchetype>()
            for (const candidate of preview.allCandidates) {
              const stats = ensureArchetypeStats(archetypeStats, candidate.structuralArchetype)
              stats.candidateCount += 1
              stats[candidate.structuralStatus] += 1
              stats.byCategory[format.category] ||= { appearances: 0, wins: 0 }
              stats.byKey[format.key] ||= { appearances: 0, wins: 0 }
              stats.byCategory[format.category].appearances += 1
              stats.byKey[format.key].appearances += 1
              if (!seenArchetypesInPool.has(candidate.structuralArchetype)) {
                stats.poolPresence += 1
                seenArchetypesInPool.add(candidate.structuralArchetype)
              }
            }

            const selected = preview.selectedCandidate
            const base = preview.baseCandidate
            const selectedArchetypeStats = ensureArchetypeStats(archetypeStats, selected.structuralArchetype)
            selectedArchetypeStats.wins += 1
            selectedArchetypeStats.selectedScores.push(selected.scoreTrust.effectiveScore)
            selectedArchetypeStats.byCategory[format.category] ||= { appearances: 0, wins: 0 }
            selectedArchetypeStats.byKey[format.key] ||= { appearances: 0, wins: 0 }
            selectedArchetypeStats.byCategory[format.category].wins += 1
            selectedArchetypeStats.byKey[format.key].wins += 1

            if (selected.strategyLabel !== base.strategyLabel) {
              previewTotals.selectedNotBase += 1
            }

            const baseTier = structuralTier(base.structuralStatus)
            const selectedTier = structuralTier(selected.structuralStatus)
            if (selectedTier > baseTier) {
              previewTotals.structuralTierImproved += 1
              increment(previewTransitions, `${base.structuralStatus}->${selected.structuralStatus}`)
              categoryAggregate.selectionTierImproved += 1
              keyAggregate.selectionTierImproved += 1
            } else if (selectedTier === baseTier && selected.scoreTrust.effectiveScore > base.scoreTrust.effectiveScore) {
              previewTotals.sameTierScoreImproved += 1
            }

            const generated = await generateVariant({
              master,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })
            const baselineArchetype = generated.intent.structuralArchetype || preview.selectedCandidate.structuralArchetype
            const repair = await getRepairDiagnostics({
              scene: generated.scene,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })

            repairTotals.evaluations += 1
            repairCategoryStats[format.category] ||= { total: 0, tierImproved: 0 }
            repairKeyStats[format.key] ||= { total: 0, tierImproved: 0 }
            repairCategoryStats[format.category].total += 1
            repairKeyStats[format.key].total += 1

            const beforeTier = structuralTier(repair.diagnostics.before.structuralStatus)
            const afterTier = structuralTier(repair.diagnostics.after.structuralStatus)
            if (repair.diagnostics.acceptedImprovement) repairTotals.acceptedImprovements += 1
            else repairTotals.rejected += 1
            if (!repair.diagnostics.finalChanged) repairTotals.unchanged += 1
            if (afterTier > beforeTier) {
              repairTotals.structuralTierImproved += 1
              increment(repairTransitions, `${repair.diagnostics.before.structuralStatus}->${repair.diagnostics.after.structuralStatus}`)
              repairCategoryStats[format.category].tierImproved += 1
              repairKeyStats[format.key].tierImproved += 1
            } else if (
              repair.diagnostics.acceptedImprovement &&
              afterTier === beforeTier &&
              repair.result.repair &&
              repair.result.repair.scoreDelta > 0
            ) {
              repairTotals.sameTierScoreImproved += 1
            }

            for (const attempt of repair.diagnostics.attempts) {
              const stats = ensureStrategyStats(repairStrategyStats, attempt.strategyLabel)
              stats.attempts += 1
              if (attempt.accepted) stats.accepted += 1
              if (structuralTier(attempt.afterStructuralStatus) > structuralTier(attempt.beforeStructuralStatus)) {
                stats.tierImproved += 1
              }

              if (attempt.strategyKind === 'local-structural') {
                repairTotals.localAttempts += 1
                if (attempt.accepted) repairTotals.localAcceptedAttempts += 1
                if (structuralTier(attempt.afterStructuralStatus) > structuralTier(attempt.beforeStructuralStatus)) {
                  repairTotals.localTierImprovedAttempts += 1
                }
              } else {
                repairTotals.regenerationAttempts += 1
                if (attempt.accepted) repairTotals.regenerationAcceptedAttempts += 1
                if (structuralTier(attempt.afterStructuralStatus) > structuralTier(attempt.beforeStructuralStatus)) {
                  repairTotals.regenerationTierImprovedAttempts += 1
                }
                const targetArchetype = parseRegenerationArchetype(attempt.strategyLabel)
                if (targetArchetype && targetArchetype !== baselineArchetype) {
                  repairTotals.regenerationEscapeAttempts += 1
                  if (attempt.accepted) repairTotals.regenerationAcceptedEscapeAttempts += 1
                  if (attempt.accepted && structuralTier(attempt.afterStructuralStatus) > structuralTier(attempt.beforeStructuralStatus)) {
                    repairTotals.regenerationAcceptedEscapeWithTierGain += 1
                  }
                }
              }
            }

            if (
              shouldSeedRepeatedFix(repair) &&
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

  for (const seed of repeatedFixSeeds) {
    repeatedFixStats.sequences += 1
    let currentScene = seed.scene
    let session: FixSessionState | undefined
    const seenSignatures = new Set<string>()
    let improvementPasses = 0
    let ended = false

    for (let pass = 1; pass <= repeatedFixMaxPasses; pass += 1) {
      const repair = await getRepairDiagnostics({
        scene: currentScene,
        formatKey: seed.formatKey,
        visualSystem: seed.visualSystem,
        brandKit: seed.brandKit,
        goal: seed.goal,
        assetHint: seed.assetHint,
        previousFixState: session,
      })

      repeatedFixStats.totalCalls += 1
      if (repair.diagnostics.acceptedImprovement) {
        improvementPasses += 1
        if (pass === 1) repeatedFixStats.firstImproved += 1
        if (pass === 2) repeatedFixStats.secondImproved += 1
        if (pass === 3) repeatedFixStats.thirdImproved += 1
        if (pass === 4) repeatedFixStats.fourthImproved += 1
      }

      const signature = repair.diagnostics.after.sceneSignature
      if (seenSignatures.has(signature)) {
        if (seenSignatures.size > 1) repeatedFixStats.oscillated += 1
        else repeatedFixStats.stagnated += 1
        ended = true
        break
      }
      seenSignatures.add(signature)

      currentScene = repair.scene
      session = repair.result.session

      if (!repair.result.canFixAgain) {
        repeatedFixStats.exhausted += 1
        ended = true
        break
      }
    }

    repeatedFixStats.averageImprovementPasses += improvementPasses
    if (!ended) {
      repeatedFixStats.stagnated += 1
    }
  }

  repeatedFixStats.averageImprovementPasses =
    repeatedFixStats.sequences === 0 ? 0 : repeatedFixStats.averageImprovementPasses / repeatedFixStats.sequences

  console.timeEnd('step5-structural-diversity-evaluation')

  const categoryRows = Object.entries(previewCategoryStats)
    .map(([category, stats]) => ({
      formatCategory: category,
      pools: stats.pools,
      avgUniqueSignatures: (stats.uniqueSignatures / Math.max(stats.pools, 1)).toFixed(2),
      avgUniqueArchetypes: (stats.uniqueArchetypes / Math.max(stats.pools, 1)).toFixed(2),
      mixedTierRate: percent(stats.mixedTierPools, stats.pools),
      step3TierWinRate: percent(stats.selectionTierImproved, stats.pools),
      step4TierWinRate: percent(repairCategoryStats[category]?.tierImproved || 0, repairCategoryStats[category]?.total || 0),
    }))
    .sort((left, right) => Number(right.avgUniqueSignatures) - Number(left.avgUniqueSignatures))

  const keyRows = Object.entries(previewKeyStats)
    .map(([formatKey, stats]) => ({
      formatKey,
      pools: stats.pools,
      avgUniqueSignatures: (stats.uniqueSignatures / Math.max(stats.pools, 1)).toFixed(2),
      avgUniqueArchetypes: (stats.uniqueArchetypes / Math.max(stats.pools, 1)).toFixed(2),
      mixedTierRate: percent(stats.mixedTierPools, stats.pools),
      step3TierWinRate: percent(stats.selectionTierImproved, stats.pools),
      step4TierWinRate: percent(repairKeyStats[formatKey]?.tierImproved || 0, repairKeyStats[formatKey]?.total || 0),
    }))
    .sort((left, right) => Number(right.avgUniqueSignatures) - Number(left.avgUniqueSignatures))

  const archetypeRows = Object.entries(archetypeStats)
    .map(([archetype, stats]) => {
      const bestCategoryEntry = Object.entries(stats.byCategory)
        .map(([category, value]) => ({ category, winRate: value.wins / Math.max(value.appearances, 1) }))
        .sort((left, right) => right.winRate - left.winRate || left.category.localeCompare(right.category))[0]
      const weakestCategoryEntry = Object.entries(stats.byCategory)
        .map(([category, value]) => ({ category, winRate: value.wins / Math.max(value.appearances, 1) }))
        .sort((left, right) => left.winRate - right.winRate || left.category.localeCompare(right.category))[0]
      return {
        archetype,
        candidateCount: stats.candidateCount,
        poolPresence: stats.poolPresence,
        validRate: percent(stats.valid, stats.candidateCount),
        degradedRate: percent(stats.degraded, stats.candidateCount),
        invalidRate: percent(stats.invalid, stats.candidateCount),
        winRate: percent(stats.wins, stats.candidateCount),
        avgSelectedScore: average(stats.selectedScores).toFixed(2),
        bestCategory: bestCategoryEntry ? `${bestCategoryEntry.category} (${(bestCategoryEntry.winRate * 100).toFixed(1)}%)` : 'n/a',
        weakestCategory: weakestCategoryEntry ? `${weakestCategoryEntry.category} (${(weakestCategoryEntry.winRate * 100).toFixed(1)}%)` : 'n/a',
      }
    })
    .sort((left, right) => right.candidateCount - left.candidateCount || left.archetype.localeCompare(right.archetype))

  const archetypeWinByCategoryRows = topEntries(
    Object.fromEntries(
      Object.entries(archetypeStats).flatMap(([archetype, stats]) =>
        Object.entries(stats.byCategory).map(([category, value]) => [`${archetype} @ ${category}`, value.wins])
      )
    ),
    12
  ).map(([entry, wins]) => ({ archetypeCategory: entry, wins }))

  const archetypeWinByKeyRows = topEntries(
    Object.fromEntries(
      Object.entries(archetypeStats).flatMap(([archetype, stats]) =>
        Object.entries(stats.byKey).map(([formatKey, value]) => [`${archetype} @ ${formatKey}`, value.wins])
      )
    ),
    12
  ).map(([entry, wins]) => ({ archetypeFormat: entry, wins }))

  const deadArchetypes = archetypeRows.filter((row) => row.winRate === '0.0%' || row.candidateCount < previewTotals.candidatePools * 0.02)
  const weakStrategyRows = Object.entries(repairStrategyStats)
    .map(([strategy, stats]) => ({
      strategy,
      attempts: stats.attempts,
      acceptedRate: percent(stats.accepted, stats.attempts),
      tierImprovedRate: percent(stats.tierImproved, stats.attempts),
    }))
    .sort((left, right) => right.attempts - left.attempts)

  const report = `# Step 5 Structural Diversity Verification Report

## 1. Verification scope
- templates: ${templates.join(', ')}
- goals: ${GOAL_PRESETS.map((item) => item.key).join(', ')}
- visual systems: ${VISUAL_SYSTEMS.map((item) => item.key).join(', ')}
- sampled brand/image contexts: ${sampledBrandImagePairs.map((pair) => `${pair.brandTemplateKey}:${pair.imageProfile || 'none'}`).join(', ')}
- total contexts: ${previewTotals.contexts}
- total candidate pools evaluated: ${previewTotals.candidatePools}
- total repair evaluations: ${repairTotals.evaluations}
- repeated-fix simulation seeds: ${repeatedFixStats.sequences}
- repeated-fix max passes: ${repeatedFixMaxPasses}
- preview candidate budget assumption: 5
- analysis method: use \`getPreviewCandidateDiagnostics(...)\` for preview pool analysis, then generate actual preview output through \`generateVariant(...)\` and verify Step 4 repair behavior through \`getRepairDiagnostics(...)\`.

## 2. Candidate pool diversity
- average unique structural signatures per pool: ${(previewTotals.totalUniqueSignatures / Math.max(previewTotals.candidatePools, 1)).toFixed(2)}
- average unique structural archetypes per pool: ${(previewTotals.totalUniqueArchetypes / Math.max(previewTotals.candidatePools, 1)).toFixed(2)}
- pools with more than one structural archetype: ${previewTotals.multiArchetypePools} / ${previewTotals.candidatePools} (${percent(previewTotals.multiArchetypePools, previewTotals.candidatePools)})
- pools with structural duplicate pruning fired: ${previewTotals.pruningHitPools} / ${previewTotals.candidatePools} (${percent(previewTotals.pruningHitPools, previewTotals.candidatePools)})
- structurally duplicate plans pruned before evaluation: ${previewTotals.prunedStructuralDuplicates} / ${previewTotals.attemptedPlans} attempted plans (${percent(previewTotals.prunedStructuralDuplicates, previewTotals.attemptedPlans)})
- plans dropped by budget after structural pruning: ${previewTotals.budgetRejectedPlans}
- evaluated pools that still contained duplicate structural signatures after pruning: ${previewTotals.duplicateSignaturePoolsAfterPruning}

### Diversity by format.category
${toMarkdownTable(categoryRows)}

### Strongest format.key pools by average unique signatures
${toMarkdownTable(keyRows.slice(0, 12))}

### Weakest format.key pools by average unique signatures
${toMarkdownTable([...keyRows].slice(-12).reverse())}

## 3. Mixed-tier candidate pools
- mixed-tier pools overall: ${previewTotals.mixedTierPools} / ${previewTotals.candidatePools} (${percent(previewTotals.mixedTierPools, previewTotals.candidatePools)})
- pre-Step-5 baseline mixed-tier pools: ${previousBaseline.previewMixedTierPoolsRate}

${toMarkdownTable(Object.entries(poolClassCounts).sort((left, right) => right[1] - left[1]).map(([poolClass, count]) => ({
  poolClass,
  count,
  rate: percent(count, previewTotals.candidatePools),
})))}

## 4. Step 3 structural tier improvement
- selected candidate differs from base heuristic candidate: ${previewTotals.selectedNotBase} / ${previewTotals.candidatePools} (${percent(previewTotals.selectedNotBase, previewTotals.candidatePools)})
- structural tier improvements vs base: ${previewTotals.structuralTierImproved} / ${previewTotals.candidatePools} (${percent(previewTotals.structuralTierImproved, previewTotals.candidatePools)})
- pre-Step-5 baseline structural tier improvements: ${previousBaseline.previewTierImprovementRate}
- same-tier effective score improvements vs base: ${previewTotals.sameTierScoreImproved} / ${previewTotals.candidatePools} (${percent(previewTotals.sameTierScoreImproved, previewTotals.candidatePools)})

${toMarkdownTable(Object.entries(previewTransitions).map(([transition, count]) => ({
  transition,
  count,
  rate: percent(count, previewTotals.candidatePools),
})))}

## 5. Archetype win rates
${toMarkdownTable(archetypeRows.map((row) => ({
  archetype: row.archetype,
  candidateCount: row.candidateCount,
  poolPresence: row.poolPresence,
  winRate: row.winRate,
  avgSelectedScore: row.avgSelectedScore,
})))}

### Archetype wins by format.category
${toMarkdownTable(archetypeWinByCategoryRows)}

### Archetype wins by format.key
${toMarkdownTable(archetypeWinByKeyRows)}

## 6. Archetype effectiveness
${toMarkdownTable(archetypeRows)}

## 7. Step 4 repair/regeneration after Step 5
- final repair structural tier improvements: ${repairTotals.structuralTierImproved} / ${repairTotals.evaluations} (${percent(repairTotals.structuralTierImproved, repairTotals.evaluations)})
- pre-Step-5 baseline repair structural tier improvements: ${previousBaseline.repairTierImprovementRate}
- accepted repair improvements overall: ${repairTotals.acceptedImprovements} / ${repairTotals.evaluations} (${percent(repairTotals.acceptedImprovements, repairTotals.evaluations)})
- unchanged because no acceptable improvement was found: ${repairTotals.unchanged} / ${repairTotals.evaluations} (${percent(repairTotals.unchanged, repairTotals.evaluations)})
- same-tier score improvements after repair: ${repairTotals.sameTierScoreImproved} / ${repairTotals.evaluations} (${percent(repairTotals.sameTierScoreImproved, repairTotals.evaluations)})
- local repair tier-improving attempts: ${repairTotals.localTierImprovedAttempts} / ${repairTotals.localAttempts} (${percent(repairTotals.localTierImprovedAttempts, repairTotals.localAttempts)})
- guided regeneration tier-improving attempts: ${repairTotals.regenerationTierImprovedAttempts} / ${repairTotals.regenerationAttempts} (${percent(repairTotals.regenerationTierImprovedAttempts, repairTotals.regenerationAttempts)})
- regeneration attempts targeting a different archetype than the baseline preview: ${repairTotals.regenerationEscapeAttempts}
- accepted regeneration escape attempts: ${repairTotals.regenerationAcceptedEscapeAttempts} / ${Math.max(repairTotals.regenerationEscapeAttempts, 1)} (${percent(repairTotals.regenerationAcceptedEscapeAttempts, Math.max(repairTotals.regenerationEscapeAttempts, 1))})
- accepted regeneration escape attempts with structural tier gain: ${repairTotals.regenerationAcceptedEscapeWithTierGain}

${toMarkdownTable(Object.entries(repairTransitions).map(([transition, count]) => ({
  transition,
  count,
  rate: percent(count, repairTotals.evaluations),
})))}

## 8. Repeated Fix layout behavior
- first fix improved: ${repeatedFixStats.firstImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.firstImproved, repeatedFixStats.sequences)})
- second fix improved: ${repeatedFixStats.secondImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.secondImproved, repeatedFixStats.sequences)})
- third fix improved: ${repeatedFixStats.thirdImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.thirdImproved, repeatedFixStats.sequences)})
- fourth fix improved: ${repeatedFixStats.fourthImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.fourthImproved, repeatedFixStats.sequences)})
- stagnation rate: ${repeatedFixStats.stagnated} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.stagnated, repeatedFixStats.sequences)})
- oscillation rate: ${repeatedFixStats.oscillated} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.oscillated, repeatedFixStats.sequences)})
- exhaustion rate: ${repeatedFixStats.exhausted} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.exhausted, repeatedFixStats.sequences)})
- average accepted improvement passes per repeated-fix sequence: ${repeatedFixStats.averageImprovementPasses.toFixed(2)}
- pre-Step-5 baseline second-or-later improvement rate: ${previousBaseline.repeatedFixSecondPlusRate}
- pre-Step-5 baseline stagnation rate: ${previousBaseline.repeatedFixStagnationRate}

## 9. Format/category impact
### Format categories
${toMarkdownTable(categoryRows)}

### Strongest format keys overall
${toMarkdownTable(keyRows.slice(0, 12))}

### Weakest format keys overall
${toMarkdownTable([...keyRows].slice(-12).reverse())}

## 10. Structural signature effectiveness
- different structural-signature pairs with different geometry signatures: ${previewTotals.differentSignatureDifferentGeometryPairs} / ${Math.max(previewTotals.differentSignaturePairs, 1)} (${percent(previewTotals.differentSignatureDifferentGeometryPairs, Math.max(previewTotals.differentSignaturePairs, 1))})
- different structural-signature pairs that still collapsed to the same geometry signature: ${previewTotals.differentSignatureSameGeometryPairs} / ${Math.max(previewTotals.differentSignaturePairs, 1)} (${percent(previewTotals.differentSignatureSameGeometryPairs, Math.max(previewTotals.differentSignaturePairs, 1))})
- different-archetype candidate pairs that collapsed to the same geometry signature: ${previewTotals.differentArchetypeSameGeometryPairs}
- structurally duplicate plans pruned before evaluation: ${previewTotals.prunedStructuralDuplicates}
- evaluated pools with duplicate structural signatures after pruning: ${previewTotals.duplicateSignaturePoolsAfterPruning}

## 11. Dead/weak branches
### Weak or dead archetypes
${toMarkdownTable(deadArchetypes)}

### Repair strategy branch health
${toMarkdownTable(weakStrategyRows)}

## 12. Critical conclusions
- Step 5 created real structural diversity if and only if candidate pools now show more than one structural signature/archetype per pool and mixed-tier pools rise above the previous zero baseline.
- Step 5 materially helps Step 3 only if the structural tier improvement count is now non-zero; otherwise it is still mostly same-tier score selection.
- Step 5 materially helps Step 4 only if repair/regeneration now shows non-zero tier rescue and repeated-fix stagnation falls below the previous 100% baseline.
- Archetypes are a real source of diversity only if they both appear broadly and win meaningfully; archetypes with zero or near-zero wins remain effectively dead.
- Structural signature pruning is doing real work only if duplicate plans are being removed before evaluation while evaluated pools remain duplicate-free afterward.

## 13. Files changed
- [autoAdapt.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts)
  - diagnostics-only preview plan build metadata added to \`PreviewCandidateDiagnostics\`
- [step5StructuralDiversityEvaluation.ts](/C:/Users/Fedelesh_dm/mvp/scripts/diagnostics/step5StructuralDiversityEvaluation.ts)
  - new diagnostics script for Step 5 preview diversity and repair verification

## 14. Verification
- build/test status reported after running this script separately
`

  console.log(report)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
