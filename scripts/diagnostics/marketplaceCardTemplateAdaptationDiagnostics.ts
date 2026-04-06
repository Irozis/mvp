import { buildProject } from '../../src/lib/autoAdapt'
import { profileContent } from '../../src/lib/contentProfile'
import { BRAND_TEMPLATES, FORMAT_MAP } from '../../src/lib/presets'
import { chooseLayoutIntent } from '../../src/lib/scenarioClassifier'
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

function createDenseNoImageScene(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Save more on the launch collection this week'
  next.subtitle.text = 'Bundle-ready promo message with stronger product detail, clearer offer framing, and support for a denser marketplace card.'
  next.cta.text = 'See offers'
  next.badge.text = 'Limited'
  return next
}

function createMinimalNoImageScene(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Spring essentials'
  next.subtitle.text = ''
  next.cta.text = 'View'
  next.badge.text = ''
  return next
}

function summarize(label: string, master: Scene, imageProfile?: ImageProfile) {
  const profile = profileContent(master)
  const intent = chooseLayoutIntent({
    format: FORMAT_MAP['marketplace-card'],
    master,
    profile,
    visualSystem: 'product-card',
    goal: 'promo-pack',
    assetHint: imageProfile ? { imageProfile } : undefined,
  })

  return {
    scenario: label,
    template: intent.marketplaceTemplateId || 'n/a',
    family: intent.family,
    archetype: intent.structuralArchetype || 'n/a',
    summary: intent.marketplaceTemplateSummary || 'n/a',
    imageZone: intent.marketplaceTemplateZones
      ? `${intent.marketplaceTemplateZones.image.x},${intent.marketplaceTemplateZones.image.y},${intent.marketplaceTemplateZones.image.w},${intent.marketplaceTemplateZones.image.h}`
      : 'n/a',
    textZone: intent.marketplaceTemplateZones
      ? `${intent.marketplaceTemplateZones.text.x},${intent.marketplaceTemplateZones.text.y},${intent.marketplaceTemplateZones.text.w},${intent.marketplaceTemplateZones.text.h}`
      : 'n/a',
    ctaZone: intent.marketplaceTemplateZones
      ? `${intent.marketplaceTemplateZones.cta.x},${intent.marketplaceTemplateZones.cta.y},${intent.marketplaceTemplateZones.cta.w},${intent.marketplaceTemplateZones.cta.h}`
      : 'n/a',
  }
}

function main() {
  const noImageProject = createProject()
  const imageBackedProject = createProject('square')

  console.log('# Marketplace-card Template Adaptation Diagnostics')
  console.table([
    summarize('default no-image', noImageProject.master),
    summarize('dense no-image', createDenseNoImageScene(noImageProject.master)),
    summarize('minimal no-image', createMinimalNoImageScene(noImageProject.master)),
    summarize('image-backed square', imageBackedProject.master, 'square'),
  ])
}

main()
