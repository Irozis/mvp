import { buildProject } from '../../src/lib/autoAdapt'
import { profileContent } from '../../src/lib/contentProfile'
import { BRAND_TEMPLATES, FORMAT_MAP } from '../../src/lib/presets'
import { explainMarketplaceCardTemplateSelection } from '../../src/lib/templateSelection'
import type { ImageProfile, Scene } from '../../src/lib/types'

function createBrandKit() {
  return BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit
}

function createProject(imageProfile?: ImageProfile) {
  return buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit: createBrandKit(),
    imageProfile,
  })
}

function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene
}

function createMinimalNoImageScene(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'New drop today'
  next.subtitle.text = ''
  next.cta.text = 'Shop now'
  next.badge.text = ''
  return next
}

function createDenseNoImageScene(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Save more on the launch collection this week'
  next.subtitle.text = 'Bundle-ready promo message with stronger product detail, clearer offer framing, and support for a denser marketplace card.'
  next.cta.text = 'See offers'
  next.badge.text = 'Limited'
  return next
}

function summarizeScenario(label: string, scene: Scene, imageProfile?: ImageProfile) {
  const profile = profileContent(scene)
  const explanation = explainMarketplaceCardTemplateSelection({
    format: FORMAT_MAP['marketplace-card'],
    profile,
    goal: 'promo-pack',
    visualSystem: 'product-card',
    assetHint: imageProfile ? { imageProfile } : undefined,
  })

  return {
    scenario: label,
    selectedTemplate: explanation.selectedTemplateId,
    alternatives: explanation.alternativeTemplateIds.join(', '),
    reasonCodes: explanation.reasonCodes.join(', '),
    imageRegime: explanation.inputProfile.imageRegime,
    copyDensity: explanation.inputProfile.copyDensity,
    ctaFlow: explanation.inputProfile.ctaFlow,
    summary: explanation.decisionSummary,
  }
}

function logDebugSelection(label: string, scene: Scene, imageProfile?: ImageProfile) {
  const profile = profileContent(scene)
  const explanation = explainMarketplaceCardTemplateSelection({
    format: FORMAT_MAP['marketplace-card'],
    profile,
    goal: 'promo-pack',
    visualSystem: 'product-card',
    assetHint: imageProfile ? { imageProfile } : undefined,
  })

  console.log(`\n## ${label}`)
  console.table(
    (explanation.debug?.rankedTemplates || []).map((entry) => ({
      template: entry.templateId,
      score: entry.totalScore,
      reasons: entry.reasonCodes.join(', ') || 'none',
      positives: entry.positiveFactors.slice(0, 3).join(' | ') || 'none',
      penalties: entry.penalties.slice(0, 2).join(' | ') || 'none',
    }))
  )
}

function main() {
  const noImageProject = createProject()
  const imageBackedProject = createProject('square')

  console.log('# Marketplace-card Template Selection Diagnostics')
  console.table([
    summarizeScenario('default no-image', noImageProject.master),
    summarizeScenario('minimal no-image', createMinimalNoImageScene(noImageProject.master)),
    summarizeScenario('dense no-image', createDenseNoImageScene(noImageProject.master)),
    summarizeScenario('image-backed square', imageBackedProject.master, 'square'),
  ])
  logDebugSelection('default no-image score trace', noImageProject.master)
  logDebugSelection('minimal no-image score trace', createMinimalNoImageScene(noImageProject.master))
  logDebugSelection('dense no-image score trace', createDenseNoImageScene(noImageProject.master))
  logDebugSelection('image-backed square score trace', imageBackedProject.master, 'square')
}

main()
