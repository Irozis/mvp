import { BRAND_TEMPLATES, CHANNEL_FORMATS, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, getPreviewCandidateDiagnostics } from '../../src/lib/autoAdapt'
import type { AssetHint, FormatKey, TemplateKey } from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'

const templates: TemplateKey[] = ['promo', 'product', 'article']
const sampledBrandImagePairs: Array<{ brandTemplateKey: string; imageProfile?: AssetHint['imageProfile'] }> = [
  { brandTemplateKey: 'startup-blue', imageProfile: undefined },
  { brandTemplateKey: 'retail-impact', imageProfile: 'landscape' },
  { brandTemplateKey: 'editorial-serene', imageProfile: 'portrait' },
  { brandTemplateKey: 'startup-blue', imageProfile: 'square' },
  { brandTemplateKey: 'retail-impact', imageProfile: 'ultraWide' },
]

const marketplaceKeys = new Set<FormatKey>(['marketplace-tile', 'marketplace-card', 'marketplace-highlight'])

type Stat = {
  total: number
  baseDegradedOrValid: number
  selectedDegradedOrValid: number
  selectedNotBase: number
}

function percent(value: number, total: number) {
  if (!total) return '0.0%'
  return `${((value / total) * 100).toFixed(1)}%`
}

async function main() {
  const targetFormats = CHANNEL_FORMATS.filter((format) => marketplaceKeys.has(format.key))
  const stats: Record<string, Stat> = {}

  for (const format of targetFormats) {
    stats[format.key] = {
      total: 0,
      baseDegradedOrValid: 0,
      selectedDegradedOrValid: 0,
      selectedNotBase: 0,
    }
  }

  let contexts = 0
  for (const template of templates) {
    for (const goal of GOAL_PRESETS) {
      for (const visualSystem of VISUAL_SYSTEMS) {
        for (const pair of sampledBrandImagePairs) {
          contexts += 1
          const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === pair.brandTemplateKey) || BRAND_TEMPLATES[0]
          const master = createMasterScene(template, brandTemplate.brandKit)
          const assetHint = pair.imageProfile ? ({ imageProfile: pair.imageProfile } satisfies AssetHint) : undefined

          for (const format of targetFormats) {
            const preview = getPreviewCandidateDiagnostics({
              master,
              formatKey: format.key,
              visualSystem,
              brandKit: brandTemplate.brandKit,
              goal,
              assetHint,
            })
            const base = preview.baseCandidate
            const selected = preview.selectedCandidate
            const record = stats[format.key]
            record.total += 1
            if (base.structuralStatus !== 'invalid') record.baseDegradedOrValid += 1
            if (selected.structuralStatus !== 'invalid') record.selectedDegradedOrValid += 1
            if (base.strategyLabel !== selected.strategyLabel) record.selectedNotBase += 1
          }
        }
      }
    }
  }

  console.log('# Step G1 marketplace packBlocks spot check')
  console.log(`contexts=${contexts}`)
  console.table(
    targetFormats.map((format) => {
      const record = stats[format.key]
      return {
        formatKey: format.key,
        total: record.total,
        baseDegradedOrValid: `${record.baseDegradedOrValid} (${percent(record.baseDegradedOrValid, record.total)})`,
        selectedDegradedOrValid: `${record.selectedDegradedOrValid} (${percent(record.selectedDegradedOrValid, record.total)})`,
        selectedNotBase: `${record.selectedNotBase} (${percent(record.selectedNotBase, record.total)})`,
      }
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
