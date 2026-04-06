import { BRAND_TEMPLATES, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, getPreviewCandidateDiagnostics } from '../../src/lib/autoAdapt'
import type { AssetHint, TemplateKey } from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'

const templates: TemplateKey[] = ['promo', 'product', 'article']
const sampledBrandImagePairs: Array<{ brandTemplateKey: string; imageProfile?: AssetHint['imageProfile'] }> = [
  { brandTemplateKey: 'startup-blue', imageProfile: undefined },
  { brandTemplateKey: 'retail-impact', imageProfile: 'landscape' },
  { brandTemplateKey: 'editorial-serene', imageProfile: 'portrait' },
  { brandTemplateKey: 'startup-blue', imageProfile: 'square' },
  { brandTemplateKey: 'retail-impact', imageProfile: 'ultraWide' },
]

type Distribution = Record<string, number>

function add(map: Distribution, key: string) {
  map[key] = (map[key] || 0) + 1
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

async function main() {
  const baseArchetypes: Distribution = {}
  const selectedArchetypes: Distribution = {}
  const baseStrategies: Distribution = {}
  const selectedStrategies: Distribution = {}
  const selectedFromBase: Distribution = {}

  let contexts = 0
  let selectedNotBase = 0
  let baseImageCoverage = 0
  let selectedImageCoverage = 0
  let baseTitleWidth = 0
  let selectedTitleWidth = 0
  let baseCtaY = 0
  let selectedCtaY = 0

  for (const template of templates) {
    for (const goal of GOAL_PRESETS) {
      for (const visualSystem of VISUAL_SYSTEMS) {
        for (const pair of sampledBrandImagePairs) {
          contexts += 1
          const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === pair.brandTemplateKey) || BRAND_TEMPLATES[0]
          const master = createMasterScene(template, brandTemplate.brandKit)
          const assetHint = pair.imageProfile ? ({ imageProfile: pair.imageProfile } satisfies AssetHint) : undefined

          const preview = getPreviewCandidateDiagnostics({
            master,
            formatKey: 'marketplace-tile',
            visualSystem,
            brandKit: brandTemplate.brandKit,
            goal,
            assetHint,
          })

          const base = preview.baseCandidate
          const selected = preview.selectedCandidate
          add(baseArchetypes, base.structuralArchetype)
          add(selectedArchetypes, selected.structuralArchetype)
          add(baseStrategies, base.strategyLabel)
          add(selectedStrategies, selected.strategyLabel)
          add(selectedFromBase, `${base.structuralArchetype} -> ${selected.structuralArchetype}`)

          if (base.strategyLabel !== selected.strategyLabel) selectedNotBase += 1
          baseImageCoverage += ((base.scene.image.w || 0) * (base.scene.image.h || 0)) / 10000
          selectedImageCoverage += ((selected.scene.image.w || 0) * (selected.scene.image.h || 0)) / 10000
          baseTitleWidth += base.scene.title.w || 0
          selectedTitleWidth += selected.scene.title.w || 0
          baseCtaY += selected.scene.cta ? base.scene.cta.y || 0 : 0
          selectedCtaY += selected.scene.cta ? selected.scene.cta.y || 0 : 0
        }
      }
    }
  }

  console.log('# marketplace-tile base vs selected')
  console.log(`contexts=${contexts}`)
  console.log(`selectedNotBase=${selectedNotBase}`)
  console.log(`avgBaseImageCoverage=${round(baseImageCoverage / contexts)}`)
  console.log(`avgSelectedImageCoverage=${round(selectedImageCoverage / contexts)}`)
  console.log(`avgBaseTitleWidth=${round(baseTitleWidth / contexts)}`)
  console.log(`avgSelectedTitleWidth=${round(selectedTitleWidth / contexts)}`)
  console.log(`avgBaseCtaY=${round(baseCtaY / contexts)}`)
  console.log(`avgSelectedCtaY=${round(selectedCtaY / contexts)}`)
  console.log('baseArchetypes')
  console.table(baseArchetypes)
  console.log('selectedArchetypes')
  console.table(selectedArchetypes)
  console.log('baseStrategies')
  console.table(baseStrategies)
  console.log('selectedStrategies')
  console.table(selectedStrategies)
  console.log('base->selected archetype transitions')
  console.table(selectedFromBase)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
