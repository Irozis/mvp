import {
  applyVariantManualOverride,
  buildProject,
  getRepairDiagnostics,
} from '../../src/lib/autoAdapt'
import { BRAND_TEMPLATES, FORMAT_MAP } from '../../src/lib/presets'
import { aiReviewLayout, computeScoreTrust, getFormatAssessment } from '../../src/lib/validation'
import type { FormatKey, ImageProfile, Project, Scene } from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'
process.env.REPAIR_DEBUG = '0'

const formatKey: FormatKey = 'marketplace-card'

function round(value?: number) {
  return Math.round((value || 0) * 10) / 10
}

function createSceneGeometrySignature(scene: Scene) {
  return [
    ['title', round(scene.title.x), round(scene.title.y), round(scene.title.w), round(scene.title.h)].join(':'),
    ['subtitle', round(scene.subtitle.x), round(scene.subtitle.y), round(scene.subtitle.w), round(scene.subtitle.h)].join(':'),
    ['cta', round(scene.cta.x), round(scene.cta.y), round(scene.cta.w), round(scene.cta.h)].join(':'),
    ['logo', round(scene.logo.x), round(scene.logo.y), round(scene.logo.w), round(scene.logo.h)].join(':'),
    ['badge', round(scene.badge.x), round(scene.badge.y), round(scene.badge.w), round(scene.badge.h)].join(':'),
    ['image', round(scene.image.x), round(scene.image.y), round(scene.image.w), round(scene.image.h)].join(':'),
  ].join('|')
}

function renderScene(project: Project) {
  return applyVariantManualOverride(
    project.formats[formatKey],
    formatKey,
    project.manualOverrides?.[formatKey]
  )
}

async function summarizeScene(scene: Scene, project: Project) {
  const assessment = getFormatAssessment(
    formatKey,
    scene,
    project.variants?.[formatKey]?.compositionModelId,
    project.assetHint?.enhancedImage
  )
  const previewTrust = computeScoreTrust(assessment)
  const aiReview = await aiReviewLayout(scene, { format: FORMAT_MAP[formatKey], assessment })
  const repairTrust = computeScoreTrust({ ...assessment, aiReview }, aiReview)
  return {
    status: assessment.structuralState?.status || 'invalid',
    rawScore: assessment.score.toFixed(2),
    previewEffective: previewTrust.effectiveScore.toFixed(2),
    repairEffective: repairTrust.effectiveScore.toFixed(2),
    visual: (assessment.visual?.overallScore || 0).toFixed(2),
    issues: assessment.issues.map((issue) => issue.code).join(', ') || 'none',
    geometrySignature: createSceneGeometrySignature(scene),
  }
}

function buildScenario(imageProfile?: ImageProfile) {
  return buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit: BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit,
    imageProfile,
  })
}

async function analyzeScenario(label: string, imageProfile?: ImageProfile) {
  const project = buildScenario(imageProfile)
  const baselineScene = renderScene(project)
  const baselineSummary = await summarizeScene(baselineScene, project)

  const fix1 = await getRepairDiagnostics({
    scene: baselineScene,
    regenerationMasterScene: project.master,
    formatKey,
    visualSystem: project.visualSystem,
    brandKit: project.brandKit,
    goal: project.goal,
    assetHint: project.assetHint,
  })
  const fix2 = await getRepairDiagnostics({
    scene: fix1.scene,
    regenerationMasterScene: project.master,
    formatKey,
    visualSystem: project.visualSystem,
    brandKit: project.brandKit,
    goal: project.goal,
    assetHint: project.assetHint,
    previousFixState: fix1.result.session,
  })

  const firstAccepted = fix1.diagnostics.regenerationCandidates.find(
    (candidate) => candidate.strategyLabel === fix1.diagnostics.acceptedStrategyLabel
  )
  const secondAccepted = fix2.diagnostics.regenerationCandidates.find(
    (candidate) => candidate.strategyLabel === fix2.diagnostics.acceptedStrategyLabel
  )
  const fix1Summary = await summarizeScene(fix1.scene, project)
  const fix2Summary = await summarizeScene(fix2.scene, project)

  console.log(`## ${label}`)
  console.table([
    {
      scene: 'baseline',
      status: baselineSummary.status,
      rawScore: baselineSummary.rawScore,
      previewEffective: baselineSummary.previewEffective,
      repairEffective: baselineSummary.repairEffective,
      visual: baselineSummary.visual,
      issues: baselineSummary.issues,
      geometry: baselineSummary.geometrySignature,
    },
    {
      scene: 'fix-1 accepted',
      status: fix1Summary.status,
      rawScore: fix1Summary.rawScore,
      previewEffective: fix1Summary.previewEffective,
      repairEffective: fix1Summary.repairEffective,
      visual: fix1Summary.visual,
      issues: fix1Summary.issues,
      geometry: fix1Summary.geometrySignature,
    },
    {
      scene: 'fix-2 accepted',
      status: fix2Summary.status,
      rawScore: fix2Summary.rawScore,
      previewEffective: fix2Summary.previewEffective,
      repairEffective: fix2Summary.repairEffective,
      visual: fix2Summary.visual,
      issues: fix2Summary.issues,
      geometry: fix2Summary.geometrySignature,
    },
  ])

  console.table(
    fix1.diagnostics.regenerationCandidates.map((candidate) => ({
      strategy: candidate.strategyLabel,
      archetype: candidate.structuralArchetype || 'n/a',
      accepted: candidate.accepted ? 'yes' : 'no',
      suppressed: candidate.suppressed ? 'yes' : 'no',
      repeatedWeak: candidate.repeatedWeakOutcome ? 'yes' : 'no',
      repairEffective: candidate.effectiveScore?.toFixed(2) || 'n/a',
      visual: (candidate as { assessment?: { visual?: { overallScore?: number } } }).assessment?.visual?.overallScore || 0,
      sameGeometryAsBaseline: candidate.geometrySignature === baselineSummary.geometrySignature ? 'yes' : 'no',
      reason: candidate.rejectionReason || 'accepted',
    }))
  )

  console.log(`fix-1 strategy: ${fix1.diagnostics.acceptedStrategyLabel || 'none'} (${firstAccepted?.structuralArchetype || 'n/a'})`)
  console.log(`fix-2 strategy: ${fix2.diagnostics.acceptedStrategyLabel || 'none'} (${secondAccepted?.structuralArchetype || 'n/a'})`)
  console.log('')
}

async function main() {
  console.log('# Marketplace-card First Repair Winner Analysis')
  console.log('')
  await analyzeScenario('Fresh default / no-image', undefined)
  await analyzeScenario('Image-profile square', 'square')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
