import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  applyVariantManualOverride,
  buildProject,
  getMarketplaceCardExplorationDiagnostics,
  getPreviewCandidateDiagnostics,
  getRepairDiagnostics,
  refreshProjectModel,
  regenerateFormats,
} from '../../src/lib/autoAdapt'
import { BRAND_TEMPLATES } from '../../src/lib/presets'
import { getFormatAssessment } from '../../src/lib/validation'
import type { FormatKey, Project, Scene, StructuralLayoutStatus } from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'
process.env.REPAIR_DEBUG = '0'

const formatKey: FormatKey = 'marketplace-card'

type CliOptions = {
  projectPath?: string
}

function parseArgs(argv: string[]): CliOptions {
  const params = new Map<string, string>()
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const [key, value] = arg.slice(2).split('=')
    if (!key) continue
    params.set(key, value || 'true')
  }
  return {
    projectPath: params.get('project'),
  }
}

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

function structuralStatusOf(scene: Scene, project: Project): StructuralLayoutStatus {
  const assessment = getFormatAssessment(
    formatKey,
    scene,
    project.variants?.[formatKey]?.compositionModelId,
    project.assetHint?.enhancedImage
  )
  return assessment.structuralState?.status || 'invalid'
}

function assessmentSummary(scene: Scene, project: Project) {
  const assessment = getFormatAssessment(
    formatKey,
    scene,
    project.variants?.[formatKey]?.compositionModelId,
    project.assetHint?.enhancedImage
  )
  return {
    status: assessment.structuralState?.status || 'invalid',
    score: assessment.score,
    issueCodes: assessment.issues.map((issue) => issue.code),
    issueMessages: assessment.issues.slice(0, 3).map((issue) => issue.message),
    compositionModelId: assessment.compositionModelId || project.variants?.[formatKey]?.compositionModelId || 'n/a',
  }
}

function renderScene(project: Project) {
  return applyVariantManualOverride(
    project.formats[formatKey],
    formatKey,
    project.manualOverrides?.[formatKey]
  )
}

async function loadProject(projectPath?: string) {
  if (!projectPath) {
    return buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit: BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit,
    })
  }

  const absolutePath = path.resolve(projectPath)
  const raw = await readFile(absolutePath, 'utf8')
  return refreshProjectModel(JSON.parse(raw) as Project)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const loadedProject = await loadProject(options.projectPath)
  const renderedScene = renderScene(loadedProject)
  const renderedSummary = assessmentSummary(renderedScene, loadedProject)
  const renderedGeometrySignature = createSceneGeometrySignature(renderedScene)

  const regeneratedProject = regenerateFormats({
    ...loadedProject,
    manualOverrides: loadedProject.manualOverrides || {},
  })
  const regeneratedScene = renderScene(regeneratedProject)
  const regeneratedSummary = assessmentSummary(regeneratedScene, regeneratedProject)
  const regeneratedGeometrySignature = createSceneGeometrySignature(regeneratedScene)

  const previewDiagnostics = getPreviewCandidateDiagnostics({
    master: loadedProject.master,
    formatKey,
    visualSystem: loadedProject.visualSystem,
    brandKit: loadedProject.brandKit,
    goal: loadedProject.goal,
    assetHint: loadedProject.assetHint,
    expandedBudget: 10,
  })
  const previewSelectedGeometrySignature = createSceneGeometrySignature(previewDiagnostics.selectedCandidate.scene)

  const repair1 = await getRepairDiagnostics({
    scene: renderedScene,
    regenerationMasterScene: loadedProject.master,
    formatKey,
    visualSystem: loadedProject.visualSystem,
    brandKit: loadedProject.brandKit,
    goal: loadedProject.goal,
    assetHint: loadedProject.assetHint,
  })
  const repair2 = await getRepairDiagnostics({
    scene: repair1.scene,
    regenerationMasterScene: loadedProject.master,
    formatKey,
    visualSystem: loadedProject.visualSystem,
    brandKit: loadedProject.brandKit,
    goal: loadedProject.goal,
    assetHint: loadedProject.assetHint,
    previousFixState: repair1.result.session,
  })

  const exploration = getMarketplaceCardExplorationDiagnostics({
    master: loadedProject.master,
    visualSystem: loadedProject.visualSystem,
    brandKit: loadedProject.brandKit,
    goal: loadedProject.goal,
    assetHint: loadedProject.assetHint,
    explorationBudget: 24,
    variationIndex: 0,
  })
  const weakestExplorationCandidate =
    [...exploration.candidates]
      .sort((left, right) => left.effectiveScore - right.effectiveScore)[0] || exploration.candidates[0]

  const oldLifecycleWeakRepair = await getRepairDiagnostics({
    scene: weakestExplorationCandidate.scene,
    formatKey,
    visualSystem: loadedProject.visualSystem,
    brandKit: loadedProject.brandKit,
    goal: loadedProject.goal,
    assetHint: loadedProject.assetHint,
  })
  const newLifecycleWeakRepair = await getRepairDiagnostics({
    scene: weakestExplorationCandidate.scene,
    regenerationMasterScene: loadedProject.master,
    formatKey,
    visualSystem: loadedProject.visualSystem,
    brandKit: loadedProject.brandKit,
    goal: loadedProject.goal,
    assetHint: loadedProject.assetHint,
  })

  console.log('# Marketplace UI mismatch analysis')
  console.log(`projectPath=${options.projectPath ? path.resolve(options.projectPath) : 'fresh-generated-default'}`)
  console.table([
    {
      scene: 'ui-rendered-current',
      status: renderedSummary.status,
      score: renderedSummary.score,
      compositionModelId: renderedSummary.compositionModelId,
      geometrySignature: renderedGeometrySignature,
    },
    {
      scene: 'fresh-regenerated-from-master',
      status: regeneratedSummary.status,
      score: regeneratedSummary.score,
      compositionModelId: regeneratedSummary.compositionModelId,
      geometrySignature: regeneratedGeometrySignature,
    },
    {
      scene: 'preview-diagnostics-selected',
      status: previewDiagnostics.selectedCandidate.structuralStatus,
      score: previewDiagnostics.selectedCandidate.scoreTrust.effectiveScore,
      compositionModelId: previewDiagnostics.selectedCandidate.assessment.compositionModelId || 'n/a',
      geometrySignature: previewSelectedGeometrySignature,
    },
  ])

  console.table([
    {
      comparison: 'ui-vs-regenerated',
      sameGeometry: renderedGeometrySignature === regeneratedGeometrySignature ? 'yes' : 'no',
      sameStatus: renderedSummary.status === regeneratedSummary.status ? 'yes' : 'no',
      sameIssues: JSON.stringify(renderedSummary.issueCodes) === JSON.stringify(regeneratedSummary.issueCodes) ? 'yes' : 'no',
    },
    {
      comparison: 'ui-vs-preview-selected',
      sameGeometry: renderedGeometrySignature === previewSelectedGeometrySignature ? 'yes' : 'no',
      sameStatus: renderedSummary.status === previewDiagnostics.selectedCandidate.structuralStatus ? 'yes' : 'no',
      sameIssues:
        JSON.stringify(renderedSummary.issueCodes) ===
        JSON.stringify(previewDiagnostics.selectedCandidate.assessment.issues.map((issue) => issue.code))
          ? 'yes'
          : 'no',
    },
  ])

  console.log('\nCurrent UI-visible issues:')
  console.log(renderedSummary.issueCodes.join(', ') || 'none')
  console.log(renderedSummary.issueMessages.join(' | ') || 'none')

  console.log('\nFresh regenerated issues:')
  console.log(regeneratedSummary.issueCodes.join(', ') || 'none')
  console.log(regeneratedSummary.issueMessages.join(' | ') || 'none')

  console.log('\nPreview selected issues:')
  console.log(previewDiagnostics.selectedCandidate.assessment.issues.map((issue) => issue.code).join(', ') || 'none')
  console.log(
    previewDiagnostics.selectedCandidate.assessment.issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join(' | ') || 'none'
  )

  console.log('\nFix click simulation:')
  console.table([
    {
      step: 'fix-1',
      usesMasterScene: repair1.diagnostics.regenerationSource.usesMasterScene ? 'yes' : 'no',
      regenerationDiffers: repair1.diagnostics.regenerationSource.differsFromCurrent ? 'yes' : 'no',
      beforeStatus: repair1.diagnostics.before.structuralStatus,
      afterStatus: repair1.diagnostics.after.structuralStatus,
      changed: repair1.diagnostics.finalChanged ? 'yes' : 'no',
      accepted: repair1.diagnostics.acceptedImprovement ? 'yes' : 'no',
      acceptedStrategy: repair1.diagnostics.acceptedStrategyLabel || 'none',
      canFixAgain: repair1.result.canFixAgain ? 'yes' : 'no',
      escalated: repair1.diagnostics.escalated ? 'yes' : 'no',
      escalationReasons: repair1.diagnostics.escalationReasons.join(', ') || 'none',
    },
    {
      step: 'fix-2',
      usesMasterScene: repair2.diagnostics.regenerationSource.usesMasterScene ? 'yes' : 'no',
      regenerationDiffers: repair2.diagnostics.regenerationSource.differsFromCurrent ? 'yes' : 'no',
      beforeStatus: repair2.diagnostics.before.structuralStatus,
      afterStatus: repair2.diagnostics.after.structuralStatus,
      changed: repair2.diagnostics.finalChanged ? 'yes' : 'no',
      accepted: repair2.diagnostics.acceptedImprovement ? 'yes' : 'no',
      acceptedStrategy: repair2.diagnostics.acceptedStrategyLabel || 'none',
      canFixAgain: repair2.result.canFixAgain ? 'yes' : 'no',
      escalated: repair2.diagnostics.escalated ? 'yes' : 'no',
      escalationReasons: repair2.diagnostics.escalationReasons.join(', ') || 'none',
    },
  ])

  console.log('\nFix-2 attempt diagnostics:')
  console.table(
    repair2.diagnostics.attempts.map((attempt) => ({
      strategy: attempt.strategyLabel,
      accepted: attempt.accepted ? 'yes' : 'no',
      suppressed: attempt.suppressed ? 'yes' : 'no',
      repeatedWeakOutcome: attempt.repeatedWeakOutcome ? 'yes' : 'no',
      noOp: attempt.noOp ? 'yes' : 'no',
      rejectionReason: attempt.rejectionReason || 'n/a',
    }))
  )

  console.log('\nWeak current scene lifecycle comparison:')
  console.table([
    {
      lifecycle: 'old-scene-based-regeneration',
      weakCandidateStrategy: weakestExplorationCandidate.strategyLabel,
      weakCandidateScore: weakestExplorationCandidate.effectiveScore.toFixed(2),
      usesMasterScene: oldLifecycleWeakRepair.diagnostics.regenerationSource.usesMasterScene ? 'yes' : 'no',
      regenerationDiffers: oldLifecycleWeakRepair.diagnostics.regenerationSource.differsFromCurrent ? 'yes' : 'no',
      changed: oldLifecycleWeakRepair.diagnostics.finalChanged ? 'yes' : 'no',
      accepted: oldLifecycleWeakRepair.diagnostics.acceptedImprovement ? 'yes' : 'no',
      acceptedStrategy: oldLifecycleWeakRepair.diagnostics.acceptedStrategyLabel || 'none',
      afterStatus: oldLifecycleWeakRepair.diagnostics.after.structuralStatus,
      afterEffectiveScore: oldLifecycleWeakRepair.diagnostics.after.effectiveScore,
    },
    {
      lifecycle: 'new-master-based-regeneration',
      weakCandidateStrategy: weakestExplorationCandidate.strategyLabel,
      weakCandidateScore: weakestExplorationCandidate.effectiveScore.toFixed(2),
      usesMasterScene: newLifecycleWeakRepair.diagnostics.regenerationSource.usesMasterScene ? 'yes' : 'no',
      regenerationDiffers: newLifecycleWeakRepair.diagnostics.regenerationSource.differsFromCurrent ? 'yes' : 'no',
      changed: newLifecycleWeakRepair.diagnostics.finalChanged ? 'yes' : 'no',
      accepted: newLifecycleWeakRepair.diagnostics.acceptedImprovement ? 'yes' : 'no',
      acceptedStrategy: newLifecycleWeakRepair.diagnostics.acceptedStrategyLabel || 'none',
      afterStatus: newLifecycleWeakRepair.diagnostics.after.structuralStatus,
      afterEffectiveScore: newLifecycleWeakRepair.diagnostics.after.effectiveScore,
    },
  ])
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
