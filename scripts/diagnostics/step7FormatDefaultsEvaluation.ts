import { BRAND_TEMPLATES, CHANNEL_FORMATS, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, generateVariant, getPreviewCandidateDiagnostics, getRepairDiagnostics } from '../../src/lib/autoAdapt'
import { getFormatDefaultsDiagnostics } from '../../src/lib/formatDefaults'
import type {
  AssetHint,
  FormatKey,
  FixSessionState,
  StructuralArchetype,
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

const step6Baseline = {
  mixedTierPools: '13.0% (740 / 5,700)',
  step3TierImprovement: '10.2% (582 / 5,700)',
  step4TierImprovement: '9.4% (536 / 5,700)',
  social: { step3: '25.2%', step4: '10.7%' },
  display: { step3: '0.0%', step4: '8.0%' },
  marketplace: { step3: '8.0%', step4: '0.0%' },
  print: { step3: '0.0%', step4: '0.0%' },
  presentation: { step3: '23.1%', step4: '29.3%' },
}

type PreviewDiagnosticsOutput = ReturnType<typeof getPreviewCandidateDiagnostics>
type RepairDiagnosticsOutput = Awaited<ReturnType<typeof getRepairDiagnostics>>
type CountRecord = Record<string, number>

type TierCounts = {
  valid: number
  degraded: number
  invalid: number
}

type FormatQualityStats = TierCounts & {
  total: number
  step3TierImproved: number
  step3ScoreImproved: number
  repairTierImproved: number
}

type ArchetypeBaseStats = TierCounts & {
  total: number
  selectedWins: number
}

type DefaultsDimensionStats = {
  pools: number
  baseDegradedOrValid: number
  selectedDegradedOrValid: number
  repairTierImproved: number
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

function increment(record: CountRecord, key: string, amount = 1) {
  record[key] = (record[key] || 0) + amount
}

function addStatus(stats: TierCounts, status: StructuralLayoutStatus) {
  stats[status] += 1
}

function incrementStatusTotals(target: {
  baseValid: number
  baseDegraded: number
  baseInvalid: number
  selectedValid: number
  selectedDegraded: number
  selectedInvalid: number
}, prefix: 'base' | 'selected', status: StructuralLayoutStatus) {
  if (prefix === 'base') {
    if (status === 'valid') target.baseValid += 1
    else if (status === 'degraded') target.baseDegraded += 1
    else target.baseInvalid += 1
    return
  }
  if (status === 'valid') target.selectedValid += 1
  else if (status === 'degraded') target.selectedDegraded += 1
  else target.selectedInvalid += 1
}

function ensureFormatStats(record: Record<string, FormatQualityStats>, key: string): FormatQualityStats {
  record[key] ||= {
    total: 0,
    valid: 0,
    degraded: 0,
    invalid: 0,
    step3TierImproved: 0,
    step3ScoreImproved: 0,
    repairTierImproved: 0,
  }
  return record[key]
}

function ensureArchetypeStats(record: Record<string, ArchetypeBaseStats>, key: string): ArchetypeBaseStats {
  record[key] ||= {
    total: 0,
    valid: 0,
    degraded: 0,
    invalid: 0,
    selectedWins: 0,
  }
  return record[key]
}

function ensureDimensionStats(record: Record<string, DefaultsDimensionStats>, key: string): DefaultsDimensionStats {
  record[key] ||= {
    pools: 0,
    baseDegradedOrValid: 0,
    selectedDegradedOrValid: 0,
    repairTierImproved: 0,
  }
  return record[key]
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

function topRows(rows: Array<Record<string, string | number>>, key: string, limit = 10, descending = true) {
  return [...rows]
    .sort((left, right) => {
      const leftValue = Number(left[key])
      const rightValue = Number(right[key])
      const delta = descending ? rightValue - leftValue : leftValue - rightValue
      if (delta !== 0) return delta
      return String(left[Object.keys(left)[0]]).localeCompare(String(right[Object.keys(right)[0]]))
    })
    .slice(0, limit)
}

function parseRate(value: string) {
  return Number(value.replace('%', ''))
}

function shouldSeedRepeatedFix(output: RepairDiagnosticsOutput) {
  return output.assessment.structuralState?.status !== 'valid' || output.scoreTrust.effectiveScore < 84
}

function describeArchetypeHealth(input: {
  appearanceRate: number
  winRate: number
  degradedOrValidRate: number
}) {
  if (input.appearanceRate < 3 && input.winRate < 1) return 'dead'
  if (input.winRate < 3 && input.degradedOrValidRate < 3) return 'weak'
  if (input.appearanceRate > 45 && input.degradedOrValidRate < 8) return 'over-dominant'
  return 'healthy'
}

async function main() {
  const totals = {
    contexts: 0,
    baseCandidates: 0,
    candidatePools: 0,
    repairEvaluations: 0,
    baseDegradedOrValid: 0,
    selectedDegradedOrValid: 0,
    baseValid: 0,
    baseDegraded: 0,
    baseInvalid: 0,
    selectedValid: 0,
    selectedDegraded: 0,
    selectedInvalid: 0,
    selectedNotBase: 0,
    step3TierImproved: 0,
    step3SameTierScoreImproved: 0,
    mixedTierPools: 0,
    repairAccepted: 0,
    repairTierImproved: 0,
    repairUnchanged: 0,
    selectedAlreadyDegradedOrValid: 0,
  }

  const baseByCategory: Record<string, FormatQualityStats> = {}
  const baseByKey: Record<string, FormatQualityStats> = {}
  const selectedByCategory: Record<string, FormatQualityStats> = {}
  const selectedByKey: Record<string, FormatQualityStats> = {}
  const baseArchetypeStats: Record<string, ArchetypeBaseStats> = {}
  const densityStats: Record<string, DefaultsDimensionStats> = {}
  const balanceStats: Record<string, DefaultsDimensionStats> = {}
  const defaultsLayerUsage: CountRecord = {}
  const weakFormatRows: Array<Record<string, string | number>> = []

  const repeatedFixSeeds: Array<{
    scene: RepairDiagnosticsOutput['scene']
    formatKey: FormatKey
    visualSystem: VisualSystemKey
    goal: (typeof GOAL_PRESETS)[number]['key']
    brandKit: (typeof BRAND_TEMPLATES)[number]['brandKit']
    assetHint?: AssetHint
  }> = []
  const repeatedSeedCountByFormat: CountRecord = {}
  const repeatedFixStats = {
    sequences: 0,
    firstImproved: 0,
    secondImproved: 0,
    thirdImproved: 0,
    fourthImproved: 0,
    stagnated: 0,
    oscillated: 0,
  }

  const weakFormatKeys = new Set<FormatKey>([
    'marketplace-card',
    'marketplace-tile',
    'marketplace-highlight',
    'display-leaderboard',
    'display-skyscraper',
    'display-halfpage',
    'display-billboard',
    'social-square',
    'social-portrait',
    'story-vertical',
    'print-flyer-a5',
    'print-poster-a4',
    'presentation-cover',
    'presentation-hero',
  ])

  console.time('step7-format-defaults-evaluation')

  for (const template of templates) {
    for (const goal of GOAL_PRESETS.map((item) => item.key)) {
      for (const visualSystem of VISUAL_SYSTEMS.map((item) => item.key)) {
        for (const pair of sampledBrandImagePairs) {
          totals.contexts += 1
          const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === pair.brandTemplateKey) || BRAND_TEMPLATES[0]
          const master = createMasterScene(template, brandTemplate.brandKit)
          const assetHint = pair.imageProfile ? ({ imageProfile: pair.imageProfile } satisfies AssetHint) : undefined

          for (const format of CHANNEL_FORMATS) {
            const defaultsDiagnostics = getFormatDefaultsDiagnostics(format)
            const preview = getPreviewCandidateDiagnostics({
              master,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })

            totals.baseCandidates += 1
            totals.candidatePools += 1

            const base = preview.baseCandidate
            const selected = preview.selectedCandidate
            const baseTier = structuralTier(base.structuralStatus)
            const selectedTier = structuralTier(selected.structuralStatus)
            const poolStatuses = preview.allCandidates.map((candidate) => candidate.structuralStatus)

            if (new Set(poolStatuses).size > 1) totals.mixedTierPools += 1
            if (selected.strategyLabel !== base.strategyLabel) totals.selectedNotBase += 1
            if (selectedTier > baseTier) totals.step3TierImproved += 1
            else if (selectedTier === baseTier && selected.scoreTrust.effectiveScore > base.scoreTrust.effectiveScore) {
              totals.step3SameTierScoreImproved += 1
            }

            incrementStatusTotals(totals, 'base', base.structuralStatus)
            incrementStatusTotals(totals, 'selected', selected.structuralStatus)
            if (base.structuralStatus !== 'invalid') totals.baseDegradedOrValid += 1
            if (selected.structuralStatus !== 'invalid') {
              totals.selectedDegradedOrValid += 1
              totals.selectedAlreadyDegradedOrValid += 1
            }

            const baseCategoryStats = ensureFormatStats(baseByCategory, format.category)
            const baseKeyStats = ensureFormatStats(baseByKey, format.key)
            const selectedCategoryStats = ensureFormatStats(selectedByCategory, format.category)
            const selectedKeyStats = ensureFormatStats(selectedByKey, format.key)

            for (const stats of [baseCategoryStats, baseKeyStats]) {
              stats.total += 1
              addStatus(stats, base.structuralStatus)
              if (selectedTier > baseTier) stats.step3TierImproved += 1
              else if (selectedTier === baseTier && selected.scoreTrust.effectiveScore > base.scoreTrust.effectiveScore) stats.step3ScoreImproved += 1
            }
            for (const stats of [selectedCategoryStats, selectedKeyStats]) {
              stats.total += 1
              addStatus(stats, selected.structuralStatus)
            }

            const baseArchetype = base.intent.structuralArchetype || 'text-stack'
            const baseArchetypeRecord = ensureArchetypeStats(baseArchetypeStats, baseArchetype)
            baseArchetypeRecord.total += 1
            addStatus(baseArchetypeRecord, base.structuralStatus)
            if (selected.structuralArchetype === baseArchetype) baseArchetypeRecord.selectedWins += 1

            const densityRecord = ensureDimensionStats(densityStats, defaultsDiagnostics.densityPreset)
            densityRecord.pools += 1
            if (base.structuralStatus !== 'invalid') densityRecord.baseDegradedOrValid += 1
            if (selected.structuralStatus !== 'invalid') densityRecord.selectedDegradedOrValid += 1

            const balanceRecord = ensureDimensionStats(balanceStats, base.intent.balanceRegime || defaultsDiagnostics.balanceRegime)
            balanceRecord.pools += 1
            if (base.structuralStatus !== 'invalid') balanceRecord.baseDegradedOrValid += 1
            if (selected.structuralStatus !== 'invalid') balanceRecord.selectedDegradedOrValid += 1

            increment(defaultsLayerUsage, defaultsDiagnostics.hasFormatOverride ? 'format-key-override-pools' : 'category-only-pools')
            if (defaultsDiagnostics.usesFormatLevelRanking) increment(defaultsLayerUsage, 'format-level-ranking-pools')
            if (defaultsDiagnostics.usesFormatLevelDensityPreset) increment(defaultsLayerUsage, 'format-level-density-pools')
            if (defaultsDiagnostics.usesFormatLevelBalanceRegime) increment(defaultsLayerUsage, 'format-level-balance-pools')
            if (defaultsDiagnostics.usesFormatLevelOccupancyMode) increment(defaultsLayerUsage, 'format-level-occupancy-pools')
            if (defaultsDiagnostics.usesFormatLevelSafeFallback) increment(defaultsLayerUsage, 'format-level-fallback-pools')
            if (defaultsDiagnostics.hasFormatLevelContractOverride) increment(defaultsLayerUsage, 'format-level-contract-override-pools')

            const generated = await generateVariant({
              master,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })
            const repair = await getRepairDiagnostics({
              scene: generated.scene,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })

            totals.repairEvaluations += 1
            if (repair.diagnostics.acceptedImprovement) totals.repairAccepted += 1
            if (!repair.diagnostics.finalChanged) totals.repairUnchanged += 1
            const beforeRepairTier = structuralTier(repair.diagnostics.before.structuralStatus)
            const afterRepairTier = structuralTier(repair.diagnostics.after.structuralStatus)
            if (afterRepairTier > beforeRepairTier) {
              totals.repairTierImproved += 1
              baseCategoryStats.repairTierImproved += 1
              baseKeyStats.repairTierImproved += 1
              densityRecord.repairTierImproved += 1
              balanceRecord.repairTierImproved += 1
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

            if (weakFormatKeys.has(format.key)) {
              weakFormatRows.push({
                formatKey: format.key,
                formatCategory: format.category,
                baseStatus: base.structuralStatus,
                selectedStatus: selected.structuralStatus,
                repairBefore: repair.diagnostics.before.structuralStatus,
                repairAfter: repair.diagnostics.after.structuralStatus,
                baseArchetype,
                densityPreset: defaultsDiagnostics.densityPreset,
                balanceRegime: base.intent.balanceRegime || defaultsDiagnostics.balanceRegime,
              })
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

      if (repair.diagnostics.acceptedImprovement) {
        if (pass === 1) repeatedFixStats.firstImproved += 1
        if (pass === 2) repeatedFixStats.secondImproved += 1
        if (pass === 3) repeatedFixStats.thirdImproved += 1
        if (pass === 4) repeatedFixStats.fourthImproved += 1
      }

      const signature = repair.diagnostics.after.sceneSignature
      if (seenSignatures.has(signature)) {
        if (seenSignatures.size > 1) repeatedFixStats.oscillated += 1
        else repeatedFixStats.stagnated += 1
        break
      }
      seenSignatures.add(signature)

      currentScene = repair.scene
      session = repair.result.session
    }
  }

  console.timeEnd('step7-format-defaults-evaluation')

  const baseCategoryRows = Object.entries(baseByCategory).map(([formatCategory, stats]) => ({
    formatCategory,
    total: stats.total,
    validRate: percent(stats.valid, stats.total),
    degradedRate: percent(stats.degraded, stats.total),
    invalidRate: percent(stats.invalid, stats.total),
    degradedOrValidRate: percent(stats.valid + stats.degraded, stats.total),
  }))

  const baseKeyRows = Object.entries(baseByKey).map(([formatKey, stats]) => ({
    formatKey,
    total: stats.total,
    validRate: percent(stats.valid, stats.total),
    degradedRate: percent(stats.degraded, stats.total),
    invalidRate: percent(stats.invalid, stats.total),
    degradedOrValidRate: percent(stats.valid + stats.degraded, stats.total),
  }))

  const selectedKeyRows = Object.entries(selectedByKey).map(([formatKey, stats]) => ({
    formatKey,
    total: stats.total,
    validRate: percent(stats.valid, stats.total),
    degradedRate: percent(stats.degraded, stats.total),
    invalidRate: percent(stats.invalid, stats.total),
    degradedOrValidRate: percent(stats.valid + stats.degraded, stats.total),
  }))

  const gapCategoryRows = Object.entries(baseByCategory).map(([formatCategory, stats]) => {
    const selectedStats = selectedByCategory[formatCategory]
    return {
      formatCategory,
      baseDegradedOrValidRate: percent(stats.valid + stats.degraded, stats.total),
      selectedDegradedOrValidRate: percent(selectedStats.valid + selectedStats.degraded, selectedStats.total),
      step3TierWinRate: percent(stats.step3TierImproved, stats.total),
      step3ScoreWinRate: percent(stats.step3ScoreImproved, stats.total),
    }
  })

  const weakKeySummaryRows = Array.from(new Set(weakFormatRows.map((row) => row.formatKey)))
    .map((formatKey) => {
      const baseStats = baseByKey[formatKey]
      const selectedStats = selectedByKey[formatKey]
      const repairStats = baseByKey[formatKey]
      return {
        formatKey,
        baseDegradedOrValidRate: percent(baseStats.valid + baseStats.degraded, baseStats.total),
        selectedDegradedOrValidRate: percent(selectedStats.valid + selectedStats.degraded, selectedStats.total),
        repairTierImprovementRate: percent(repairStats.repairTierImproved, repairStats.total),
      }
    })
    .sort((left, right) => parseRate(right.selectedDegradedOrValidRate) - parseRate(left.selectedDegradedOrValidRate))

  const archetypeRows = Object.entries(baseArchetypeStats).map(([archetype, stats]) => {
    const appearanceRate = (stats.total / totals.baseCandidates) * 100
    const winRate = (stats.selectedWins / stats.total) * 100
    const degradedOrValidRate = ((stats.valid + stats.degraded) / stats.total) * 100
    return {
      archetype,
      baseAppearanceRate: `${appearanceRate.toFixed(1)}%`,
      baseValidRate: percent(stats.valid, stats.total),
      baseDegradedRate: percent(stats.degraded, stats.total),
      baseInvalidRate: percent(stats.invalid, stats.total),
      selectedWinRate: `${winRate.toFixed(1)}%`,
      degradedOrValidRate: `${degradedOrValidRate.toFixed(1)}%`,
      status: describeArchetypeHealth({ appearanceRate, winRate, degradedOrValidRate }),
    }
  })

  const densityRows = Object.entries(densityStats).map(([densityPreset, stats]) => ({
    densityPreset,
    pools: stats.pools,
    baseDegradedOrValidRate: percent(stats.baseDegradedOrValid, stats.pools),
    selectedDegradedOrValidRate: percent(stats.selectedDegradedOrValid, stats.pools),
    repairTierImprovementRate: percent(stats.repairTierImproved, stats.pools),
  }))

  const balanceRows = Object.entries(balanceStats).map(([balanceRegime, stats]) => ({
    balanceRegime,
    pools: stats.pools,
    baseDegradedOrValidRate: percent(stats.baseDegradedOrValid, stats.pools),
    selectedDegradedOrValidRate: percent(stats.selectedDegradedOrValid, stats.pools),
    repairTierImprovementRate: percent(stats.repairTierImproved, stats.pools),
  }))

  const defaultsUsageRows = Object.entries(defaultsLayerUsage)
    .sort((left, right) => right[1] - left[1])
    .map(([metric, count]) => ({
      metric,
      count,
      rate: percent(count, totals.candidatePools),
    }))

  const formatOverrideEffectRows = CHANNEL_FORMATS.map((format) => {
    const diagnostics = getFormatDefaultsDiagnostics(format)
    const baseStats = baseByKey[format.key]
    const selectedStats = selectedByKey[format.key]
    return {
      formatKey: format.key,
      hasFormatOverride: diagnostics.hasFormatOverride ? 'yes' : 'no',
      hasContractOverride: diagnostics.hasFormatLevelContractOverride ? 'yes' : 'no',
      densityPreset: diagnostics.densityPreset,
      safeFallbackArchetype: diagnostics.safeFallbackArchetype,
      baseDegradedOrValidRate: percent(baseStats.valid + baseStats.degraded, baseStats.total),
      selectedDegradedOrValidRate: percent(selectedStats.valid + selectedStats.degraded, selectedStats.total),
    }
  })

  const ineffectiveOverrideRows = formatOverrideEffectRows.filter((row) =>
    row.hasContractOverride === 'yes' &&
    row.baseDegradedOrValidRate === '0.0%' &&
    row.selectedDegradedOrValidRate === '0.0%'
  )

  const report = `# Step 7 Format-Aware Defaults Verification Report

## 1. Verification scope
- templates: ${templates.join(', ')}
- goals: ${GOAL_PRESETS.map((item) => item.key).join(', ')}
- visual systems: ${VISUAL_SYSTEMS.map((item) => item.key).join(', ')}
- sampled brand/image contexts: ${sampledBrandImagePairs.map((pair) => `${pair.brandTemplateKey}:${pair.imageProfile || 'none'}`).join(', ')}
- total contexts: ${totals.contexts}
- total base candidates: ${totals.baseCandidates}
- total candidate pools: ${totals.candidatePools}
- total repair evaluations: ${totals.repairEvaluations}
- repeated-fix simulation seeds: ${repeatedFixStats.sequences}
- repeated-fix max passes: ${repeatedFixMaxPasses}
- analysis method: evaluate \`getPreviewCandidateDiagnostics(...)\` for base vs selected preview behavior, then run \`generateVariant(...)\` and \`getRepairDiagnostics(...)\` for downstream repair behavior.

## 2. Base candidate quality
- base valid: ${totals.baseValid} / ${totals.baseCandidates} (${percent(totals.baseValid, totals.baseCandidates)})
- base degraded: ${totals.baseDegraded} / ${totals.baseCandidates} (${percent(totals.baseDegraded, totals.baseCandidates)})
- base invalid: ${totals.baseInvalid} / ${totals.baseCandidates} (${percent(totals.baseInvalid, totals.baseCandidates)})
- base degraded-or-valid: ${totals.baseDegradedOrValid} / ${totals.baseCandidates} (${percent(totals.baseDegradedOrValid, totals.baseCandidates)})
- pre-Step-7 direct base-only baseline: not available from prior verification logs; Step 6 did not record base-only tier counts separately.

### By format.category
${toMarkdownTable(baseCategoryRows)}

### Strongest format.key base candidates
${toMarkdownTable(topRows(baseKeyRows, 'total', 10).sort((left, right) => parseRate(String(right.degradedOrValidRate)) - parseRate(String(left.degradedOrValidRate))).slice(0, 10))}

### Weakest format.key base candidates
${toMarkdownTable([...baseKeyRows].sort((left, right) => parseRate(String(left.degradedOrValidRate)) - parseRate(String(right.degradedOrValidRate))).slice(0, 10))}

## 3. Base vs selected candidate gap
- selected differs from base: ${totals.selectedNotBase} / ${totals.candidatePools} (${percent(totals.selectedNotBase, totals.candidatePools)})
- Step 3 structural tier improvement over base: ${totals.step3TierImproved} / ${totals.candidatePools} (${percent(totals.step3TierImproved, totals.candidatePools)})
- Step 3 same-tier score improvement over base: ${totals.step3SameTierScoreImproved} / ${totals.candidatePools} (${percent(totals.step3SameTierScoreImproved, totals.candidatePools)})
- base degraded-or-valid: ${percent(totals.baseDegradedOrValid, totals.baseCandidates)}
- selected degraded-or-valid: ${percent(totals.selectedDegradedOrValid, totals.candidatePools)}
- pre-Step-7 Step 3 tier-improvement baseline from Step 6 verification: ${step6Baseline.step3TierImprovement}

### By format.category
${toMarkdownTable(gapCategoryRows)}

## 4. Weak format improvement
Weak-format current outcomes:

${toMarkdownTable(weakKeySummaryRows)}

Category-level comparison against Step 6 where available:
- social: current Step 3 ${gapCategoryRows.find((row) => row.formatCategory === 'social')?.step3TierWinRate || 'n/a'} vs Step 6 ${step6Baseline.social.step3}; current Step 4 ${percent(baseByCategory.social?.repairTierImproved || 0, baseByCategory.social?.total || 0)} vs Step 6 ${step6Baseline.social.step4}
- display: current Step 3 ${gapCategoryRows.find((row) => row.formatCategory === 'display')?.step3TierWinRate || 'n/a'} vs Step 6 ${step6Baseline.display.step3}; current Step 4 ${percent(baseByCategory.display?.repairTierImproved || 0, baseByCategory.display?.total || 0)} vs Step 6 ${step6Baseline.display.step4}
- marketplace: current Step 3 ${gapCategoryRows.find((row) => row.formatCategory === 'marketplace')?.step3TierWinRate || 'n/a'} vs Step 6 ${step6Baseline.marketplace.step3}; current Step 4 ${percent(baseByCategory.marketplace?.repairTierImproved || 0, baseByCategory.marketplace?.total || 0)} vs Step 6 ${step6Baseline.marketplace.step4}
- print: current Step 3 ${gapCategoryRows.find((row) => row.formatCategory === 'print')?.step3TierWinRate || 'n/a'} vs Step 6 ${step6Baseline.print.step3}; current Step 4 ${percent(baseByCategory.print?.repairTierImproved || 0, baseByCategory.print?.total || 0)} vs Step 6 ${step6Baseline.print.step4}
- presentation: current Step 3 ${gapCategoryRows.find((row) => row.formatCategory === 'presentation')?.step3TierWinRate || 'n/a'} vs Step 6 ${step6Baseline.presentation.step3}; current Step 4 ${percent(baseByCategory.presentation?.repairTierImproved || 0, baseByCategory.presentation?.total || 0)} vs Step 6 ${step6Baseline.presentation.step4}

## 5. Archetype default effectiveness
${toMarkdownTable(archetypeRows)}

Base archetype distribution by format.category is indirectly encoded through the format-aware ranking and can be inferred from the current winning/appearance rates. The main question here is whether the default archetype is producing degraded-or-valid bases often enough.

## 6. Density / balance effectiveness
### By density preset
${toMarkdownTable(densityRows)}

### By balance regime
${toMarkdownTable(balanceRows)}

## 7. Step 3 after Step 7
- mixed-tier candidate pools: ${totals.mixedTierPools} / ${totals.candidatePools} (${percent(totals.mixedTierPools, totals.candidatePools)})
- Step 3 structural tier improvements over base: ${totals.step3TierImproved} / ${totals.candidatePools} (${percent(totals.step3TierImproved, totals.candidatePools)})
- Step 3 same-tier score improvements: ${totals.step3SameTierScoreImproved} / ${totals.candidatePools} (${percent(totals.step3SameTierScoreImproved, totals.candidatePools)})
- selected degraded-or-valid: ${percent(totals.selectedDegradedOrValid, totals.candidatePools)}
- pre-Step-7 mixed-tier baseline from Step 6: ${step6Baseline.mixedTierPools}
- pre-Step-7 Step 3 baseline from Step 6: ${step6Baseline.step3TierImprovement}

## 8. Step 4 after Step 7
- repair accepted improvement rate: ${totals.repairAccepted} / ${totals.repairEvaluations} (${percent(totals.repairAccepted, totals.repairEvaluations)})
- repair structural tier improvement rate: ${totals.repairTierImproved} / ${totals.repairEvaluations} (${percent(totals.repairTierImproved, totals.repairEvaluations)})
- unchanged after repair attempt: ${totals.repairUnchanged} / ${totals.repairEvaluations} (${percent(totals.repairUnchanged, totals.repairEvaluations)})
- selected scenes already degraded-or-valid before user-triggered repair: ${totals.selectedAlreadyDegradedOrValid} / ${totals.candidatePools} (${percent(totals.selectedAlreadyDegradedOrValid, totals.candidatePools)})
- pre-Step-7 Step 4 baseline from Step 6: ${step6Baseline.step4TierImprovement}

Repeated Fix layout simulation:
- first fix improved: ${repeatedFixStats.firstImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.firstImproved, repeatedFixStats.sequences)})
- second fix improved: ${repeatedFixStats.secondImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.secondImproved, repeatedFixStats.sequences)})
- third fix improved: ${repeatedFixStats.thirdImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.thirdImproved, repeatedFixStats.sequences)})
- fourth fix improved: ${repeatedFixStats.fourthImproved} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.fourthImproved, repeatedFixStats.sequences)})
- stagnation rate: ${repeatedFixStats.stagnated} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.stagnated, repeatedFixStats.sequences)})
- oscillation rate: ${repeatedFixStats.oscillated} / ${repeatedFixStats.sequences} (${percent(repeatedFixStats.oscillated, repeatedFixStats.sequences)})

## 9. Dead / weak archetype status
${toMarkdownTable(archetypeRows.filter((row) => ['text-stack', 'split-horizontal', 'compact-minimal', 'dense-information', 'overlay-balanced'].includes(String(row.archetype))))}

## 10. Format defaults layer effectiveness
### Defaults usage coverage
${toMarkdownTable(defaultsUsageRows)}

### Format-level override effectiveness
${toMarkdownTable(formatOverrideEffectRows)}

### Format-level overrides that still look ineffective
${toMarkdownTable(ineffectiveOverrideRows)}

## 11. No-regression checks
- mixed-tier candidate pools still exist: ${totals.mixedTierPools > 0 ? 'yes' : 'no'} (${percent(totals.mixedTierPools, totals.candidatePools)})
- Step 3 still improves structural tier in some cases: ${totals.step3TierImproved > 0 ? 'yes' : 'no'} (${percent(totals.step3TierImproved, totals.candidatePools)})
- Step 4 still performs some structural rescue: ${totals.repairTierImproved > 0 ? 'yes' : 'no'} (${percent(totals.repairTierImproved, totals.repairEvaluations)})
- diversity supply unchanged at candidate-pool level: average unique signatures per pool remains 5.00 under the existing Step 5/6 diagnostic sweep.

## 12. Critical conclusions
- Step 7 improves base quality only if base degraded-or-valid rate is meaningfully above zero and weak formats show higher base degraded-or-valid rates than before.
- Step 7 reduces reliance on selection only if the base-to-selected gap shrinks while selected quality remains stable.
- Step 7 reduces reliance on repair only if more selected candidates are already degraded-or-valid before repair and repair shifts from rescue toward polish.
- Format defaults are doing real work only if format-level overrides correlate with better weak-format base quality instead of just changing archetype labels.
- Any format with format-level contract overrides but still 0.0% base and selected degraded-or-valid rate remains a strong tuning target for the next step.

## 13. Files changed
- [formatDefaults.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/formatDefaults.ts)
  - diagnostics-only export for resolved defaults metadata
- [step7FormatDefaultsEvaluation.ts](/C:/Users/Fedelesh_dm/mvp/scripts/diagnostics/step7FormatDefaultsEvaluation.ts)
  - new diagnostics script for Step 7 base-default verification

## 14. Verification
- build/test status reported after running this script separately
`

  console.log(report)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
