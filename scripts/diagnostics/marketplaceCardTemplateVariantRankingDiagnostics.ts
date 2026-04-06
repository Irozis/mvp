import { buildProject, getPreviewCandidateDiagnostics } from '../../src/lib/autoAdapt'
import { BRAND_TEMPLATES } from '../../src/lib/presets'
import type { FormatKey, ImageProfile } from '../../src/lib/types'

const formatKey: FormatKey = 'marketplace-card'

function createProject(imageProfile?: ImageProfile) {
  return buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit: BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit,
    imageProfile,
  })
}

function summarizeDiagnostics(label: string, imageProfile?: ImageProfile) {
  const project = createProject(imageProfile)
  const diagnostics = getPreviewCandidateDiagnostics({
    master: project.master,
    formatKey,
    visualSystem: project.visualSystem,
    brandKit: project.brandKit,
    goal: project.goal,
    assetHint: project.assetHint,
  })

  console.log(`## ${label}`)
  console.table(
    diagnostics.allCandidates.map((candidate, index) => ({
      rank: index + 1,
      strategy: candidate.strategyLabel,
      template: candidate.intent.marketplaceTemplateId || 'n/a',
      status: candidate.structuralStatus,
      effectiveScore: candidate.scoreTrust.effectiveScore.toFixed(2),
      visualScore: (candidate.assessment.visual?.overallScore || 0).toFixed(2),
      visualBand: candidate.assessment.visual?.band || 'n/a',
      issues: candidate.assessment.issues.map((issue) => issue.code).slice(0, 3).join(', ') || 'none',
    }))
  )
  console.log('winner:', diagnostics.selectedCandidate.intent.marketplaceTemplateId || 'n/a')
  console.log(
    'alternatives:',
    diagnostics.allCandidates.slice(1, 4).map((candidate) => candidate.intent.marketplaceTemplateId || 'n/a').join(', ') || 'none'
  )
}

function main() {
  console.log('# Marketplace-card Template Variant Ranking Diagnostics')
  summarizeDiagnostics('no-image default')
  summarizeDiagnostics('image-backed square', 'square')
}

main()
