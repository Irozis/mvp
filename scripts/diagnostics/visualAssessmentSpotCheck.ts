import { buildProject } from '../../src/lib/autoAdapt'
import { BRAND_TEMPLATES } from '../../src/lib/presets'
import { getFormatAssessment } from '../../src/lib/validation'
import type { FormatKey } from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'
process.env.REPAIR_DEBUG = '0'

const formats: FormatKey[] = ['marketplace-card', 'social-square']

function main() {
  const project = buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit: BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit,
  })

  console.log('# Visual Assessment Spot Check')
  console.table(
    formats.map((formatKey) => {
      const assessment = getFormatAssessment(formatKey, project.formats[formatKey], project.variants?.[formatKey]?.compositionModelId)
      return {
        format: formatKey,
        score: assessment.score,
        visualScore: assessment.visual?.overallScore ?? 'n/a',
        visualBand: assessment.visual?.band ?? 'n/a',
        topVisualWarning: assessment.visual?.warnings[0] || 'none',
        structuralState: assessment.structuralState?.status || 'n/a',
      }
    })
  )
}

main()
