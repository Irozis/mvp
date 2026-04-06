import { buildProject, getPreviewCandidateDiagnostics } from '../../src/lib/autoAdapt'
import { BRAND_TEMPLATES } from '../../src/lib/presets'
import type { FormatKey } from '../../src/lib/types'

const formatKey: FormatKey = 'marketplace-card'

const CLASS_LABELS: Record<string, string> = {
  'overlay-balanced': 'Current Support-Overlay Card',
  'split-vertical': 'Split Support Card',
  'dense-information': 'Text-first Promo Card',
  'split-horizontal': 'Header Panel Card',
  'compact-minimal': 'Compact Minimal Card',
  'text-stack': 'Text Stack Card',
}

function round(value?: number) {
  return Math.round((value || 0) * 10) / 10
}

function geometry(scene: ReturnType<typeof getPreviewCandidateDiagnostics>['selectedCandidate']['scene']) {
  return {
    image: `${round(scene.image.x)},${round(scene.image.y)},${round(scene.image.w)},${round(scene.image.h)}`,
    title: `${round(scene.title.x)},${round(scene.title.y)},${round(scene.title.w)},${round(scene.title.h)}`,
    subtitle: `${round(scene.subtitle.x)},${round(scene.subtitle.y)},${round(scene.subtitle.w)},${round(scene.subtitle.h)}`,
    cta: `${round(scene.cta.x)},${round(scene.cta.y)},${round(scene.cta.w)},${round(scene.cta.h)}`,
  }
}

function main() {
  const brandKit = BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit
  const project = buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit,
  })

  const diagnostics = getPreviewCandidateDiagnostics({
    master: project.master,
    formatKey,
    visualSystem: project.visualSystem,
    brandKit: project.brandKit,
    goal: project.goal,
    assetHint: project.assetHint,
  })

  const bestByArchetype = new Map<string, (typeof diagnostics.allCandidates)[number]>()
  for (const candidate of diagnostics.allCandidates) {
    const current = bestByArchetype.get(candidate.structuralArchetype)
    if (!current) {
      bestByArchetype.set(candidate.structuralArchetype, candidate)
      continue
    }
    if (candidate.scoreTrust.effectiveScore > current.scoreTrust.effectiveScore) {
      bestByArchetype.set(candidate.structuralArchetype, candidate)
    }
  }

  const rows = ['overlay-balanced', 'split-horizontal', 'split-vertical', 'dense-information', 'compact-minimal']
    .map((archetype) => bestByArchetype.get(archetype))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .map((candidate) => ({
      class: CLASS_LABELS[candidate.structuralArchetype] || candidate.structuralArchetype,
      archetype: candidate.structuralArchetype,
      strategy: candidate.strategyLabel,
      family: candidate.intent.family,
      model: candidate.intent.compositionModelId || 'none',
      status: candidate.structuralStatus,
      rawScore: candidate.assessment.score.toFixed(2),
      effective: candidate.scoreTrust.effectiveScore.toFixed(2),
      visual: (candidate.assessment.visual?.overallScore || 0).toFixed(2),
      issues: candidate.assessment.issues.map((issue) => issue.code).join(', ') || 'none',
      geometry: JSON.stringify(geometry(candidate.scene)),
      selected: candidate.strategyLabel === diagnostics.selectedCandidate.strategyLabel ? 'yes' : 'no',
    }))

  console.log('# No-image Marketplace-card Composition Pivot Analysis')
  console.log('')
  console.log(
    `selected=${diagnostics.selectedCandidate.strategyLabel} (${diagnostics.selectedCandidate.structuralArchetype}) family=${diagnostics.selectedCandidate.intent.family} model=${diagnostics.selectedCandidate.intent.compositionModelId || 'none'}`
  )
  console.log(
    `selectedScores=raw:${diagnostics.selectedCandidate.assessment.score.toFixed(2)} effective:${diagnostics.selectedCandidate.scoreTrust.effectiveScore.toFixed(2)} visual:${(diagnostics.selectedCandidate.assessment.visual?.overallScore || 0).toFixed(2)}`
  )
  console.log('')
  console.table(rows)
}

main()
