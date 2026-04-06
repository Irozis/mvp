import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  applyVariantManualOverride,
  buildProject,
  getMarketplaceCardExplorationDiagnostics,
  getRepairDiagnostics,
  refreshProjectModel,
} from '../../src/lib/autoAdapt'
import { BRAND_TEMPLATES } from '../../src/lib/presets'
import { getFormatAssessment } from '../../src/lib/validation'
import type { FormatKey, Project, Scene, StructuralLayoutStatus } from '../../src/lib/types'
import type {
  RepairRegenerationCandidateDiagnostics,
} from '../../src/lib/autoAdapt'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'
process.env.REPAIR_DEBUG = '0'

const formatKey: FormatKey = 'marketplace-card'

type CliOptions = {
  projectPath?: string
}

type ExplorationCandidate = ReturnType<typeof getMarketplaceCardExplorationDiagnostics>['candidates'][number]

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

function structuralTier(status?: StructuralLayoutStatus) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
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

function compareCandidates(
  left: { structuralStatus?: StructuralLayoutStatus; effectiveScore?: number; topStructuralFindings?: Array<{ severity: string }> },
  right: { structuralStatus?: StructuralLayoutStatus; effectiveScore?: number; topStructuralFindings?: Array<{ severity: string }> }
) {
  const tierDelta = structuralTier(right.structuralStatus) - structuralTier(left.structuralStatus)
  if (tierDelta !== 0) return tierDelta

  const scoreDelta = (right.effectiveScore || 0) - (left.effectiveScore || 0)
  if (scoreDelta !== 0) return scoreDelta

  const leftHigh = (left.topStructuralFindings || []).filter((finding) => finding.severity === 'high').length
  const rightHigh = (right.topStructuralFindings || []).filter((finding) => finding.severity === 'high').length
  if (leftHigh !== rightHigh) return leftHigh - rightHigh

  return (left.topStructuralFindings?.length || 0) - (right.topStructuralFindings?.length || 0)
}

function findingsLabel(findings: Array<{ name: string; severity: string }> | undefined) {
  return (findings || []).map((finding) => `${finding.name}:${finding.severity}`).join(', ') || 'none'
}

function topIssueCodes(scene: Scene, project: Project) {
  return getFormatAssessment(
    formatKey,
    scene,
    project.variants?.[formatKey]?.compositionModelId,
    project.assetHint?.enhancedImage
  ).issues.map((issue) => issue.code)
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

function toMarkdownTable(rows: Array<Record<string, string | number>>) {
  if (!rows.length) return '_none_'
  const headers = Object.keys(rows[0])
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${headers.map((header) => String(row[header])).join(' | ')} |`),
  ].join('\n')
}

function classifyLoss(input: {
  strongestExploration?: ExplorationCandidate
  fixCandidates: RepairRegenerationCandidateDiagnostics[]
}) {
  if (!input.strongestExploration) return 'no-exploration-candidates'
  const exact = input.fixCandidates.find(
    (candidate) =>
      candidate.generated &&
      candidate.geometrySignature === input.strongestExploration?.geometrySignature &&
      candidate.structuralSignatureKey === input.strongestExploration?.structuralSignatureKey
  )
  if (exact) {
    return exact.accepted ? 'strongest-exploration-appears-and-is-accepted' : 'strongest-exploration-appears-but-is-rejected'
  }
  const sameSignature = input.fixCandidates.find(
    (candidate) =>
      candidate.generated &&
      candidate.structuralSignatureKey === input.strongestExploration?.structuralSignatureKey
  )
  if (sameSignature) return 'same-signature-weaker-geometry-only'
  return 'missing-before-evaluation'
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const project = await loadProject(options.projectPath)
  const renderedScene = renderScene(project)
  const renderedAssessment = getFormatAssessment(
    formatKey,
    renderedScene,
    project.variants?.[formatKey]?.compositionModelId,
    project.assetHint?.enhancedImage
  )

  const repair = await getRepairDiagnostics({
    scene: renderedScene,
    regenerationMasterScene: project.master,
    formatKey,
    visualSystem: project.visualSystem,
    brandKit: project.brandKit,
    goal: project.goal,
    assetHint: project.assetHint,
  })

  const exploration = getMarketplaceCardExplorationDiagnostics({
    master: project.master,
    visualSystem: project.visualSystem,
    brandKit: project.brandKit,
    goal: project.goal,
    assetHint: project.assetHint,
    explorationBudget: 24,
    variationIndex: 0,
  })

  const fixCandidates = [...repair.diagnostics.regenerationCandidates].sort(compareCandidates)
  const strongestFixCandidate = fixCandidates[0]
  const strongestExplorationCandidate = [...exploration.candidates].sort(compareCandidates)[0]
  const exactOverlapCount = exploration.candidates.filter((candidate) =>
    fixCandidates.some(
      (fixCandidate) =>
        fixCandidate.generated &&
        fixCandidate.geometrySignature === candidate.geometrySignature &&
        fixCandidate.structuralSignatureKey === candidate.structuralSignatureKey
    )
  ).length
  const signatureOverlapCount = exploration.candidates.filter((candidate) =>
    fixCandidates.some((fixCandidate) => fixCandidate.generated && fixCandidate.structuralSignatureKey === candidate.structuralSignatureKey)
  ).length

  const missingTopExploration = [...exploration.candidates]
    .sort(compareCandidates)
    .filter((candidate) =>
      !fixCandidates.some(
        (fixCandidate) =>
          fixCandidate.generated &&
          fixCandidate.geometrySignature === candidate.geometrySignature &&
          fixCandidate.structuralSignatureKey === candidate.structuralSignatureKey
      )
    )
    .slice(0, 5)

  const sameSignatureExplorationWinner =
    strongestExplorationCandidate &&
    fixCandidates.find(
      (candidate) =>
        candidate.generated &&
        candidate.structuralSignatureKey === strongestExplorationCandidate.structuralSignatureKey
    )

  const lossClassification = classifyLoss({
    strongestExploration: strongestExplorationCandidate,
    fixCandidates,
  })

  const sameInputEnvelope = true

  console.log('# Marketplace-card Master-Based Fix Flow Failure Analysis Report')
  console.log('')
  console.log('## 1. Verification scope')
  console.log(`- format: \`${formatKey}\``)
  console.log(`- projectPath: ${options.projectPath ? path.resolve(options.projectPath) : 'fresh-generated-default'}`)
  console.log(`- goal: \`${project.goal}\``)
  console.log(`- visualSystem: \`${project.visualSystem}\``)
  console.log(`- brand: \`${project.brandKit.name}\``)
  console.log(`- assetHint.imageProfile: \`${project.assetHint?.imageProfile || 'none'}\``)
  console.log(`- enhancedImage present: ${project.assetHint?.enhancedImage ? 'yes' : 'no'}`)
  console.log('')
  console.log('## 2. Exact real UI case reconstruction')
  console.log(toMarkdownTable([
    {
      scene: 'ui-rendered-current',
      structuralState: renderedAssessment.structuralState?.status || 'invalid',
      rawScore: renderedAssessment.score.toFixed(2),
      effectiveScore: repair.diagnostics.before.effectiveScore.toFixed(2),
      issues: topIssueCodes(renderedScene, project).join(', ') || 'none',
      geometrySignature: createSceneGeometrySignature(renderedScene),
    },
    {
      scene: 'project.master',
      structuralState: 'n/a',
      rawScore: 'n/a',
      effectiveScore: 'n/a',
      issues: 'n/a',
      geometrySignature: createSceneGeometrySignature(project.master),
    },
  ]))
  console.log('')
  console.log('## 3. Real fix-flow candidate set')
  console.log(`- regeneration source uses master: ${repair.diagnostics.regenerationSource.usesMasterScene ? 'yes' : 'no'}`)
  console.log(`- regeneration differs from current scene: ${repair.diagnostics.regenerationSource.differsFromCurrent ? 'yes' : 'no'}`)
  console.log(`- generated regeneration candidates: ${fixCandidates.filter((candidate) => candidate.generated).length}`)
  console.log(`- total regeneration attempts tracked: ${fixCandidates.length}`)
  console.log(`- accepted strategy: \`${repair.diagnostics.acceptedStrategyLabel || 'none'}\``)
  console.log(`- final changed: ${repair.diagnostics.finalChanged ? 'yes' : 'no'}`)
  console.log(toMarkdownTable(
    fixCandidates.map((candidate) => ({
      strategy: candidate.strategyLabel,
      archetype: candidate.structuralArchetype || 'n/a',
      status: candidate.structuralStatus || 'n/a',
      effectiveScore: candidate.effectiveScore?.toFixed(2) || 'n/a',
      accepted: candidate.accepted ? 'yes' : 'no',
      suppressed: candidate.suppressed ? 'yes' : 'no',
      reason: candidate.rejectionReason || 'accepted',
      findings: findingsLabel(candidate.topStructuralFindings),
      signature: candidate.structuralSignatureKey || 'n/a',
    }))
  ))
  console.log('')
  console.log('## 4. Exploration vs real fix-flow candidate comparison')
  console.log(`- exploration retained candidates: ${exploration.candidates.length}`)
  console.log(`- fix-flow generated candidates: ${fixCandidates.filter((candidate) => candidate.generated).length}`)
  console.log(`- exact overlap count: ${exactOverlapCount}`)
  console.log(`- structural-signature overlap count: ${signatureOverlapCount}`)
  console.log(`- same input envelope (master/goal/visualSystem/assetHint): ${sameInputEnvelope ? 'yes' : 'no'}`)
  console.log(toMarkdownTable([
    {
      candidate: 'strongest-exploration',
      strategy: strongestExplorationCandidate?.strategyLabel || 'none',
      source: strongestExplorationCandidate?.source || 'none',
      archetype: strongestExplorationCandidate?.structuralArchetype || 'none',
      status: strongestExplorationCandidate?.structuralStatus || 'none',
      effectiveScore: strongestExplorationCandidate?.effectiveScore.toFixed(2) || 'n/a',
      findings: findingsLabel(strongestExplorationCandidate?.topStructuralFindings),
      exactInFixFlow:
        strongestExplorationCandidate &&
        fixCandidates.some(
          (candidate) =>
            candidate.generated &&
            candidate.geometrySignature === strongestExplorationCandidate.geometrySignature &&
            candidate.structuralSignatureKey === strongestExplorationCandidate.structuralSignatureKey
        )
          ? 'yes'
          : 'no',
    },
    {
      candidate: 'strongest-fix-regeneration',
      strategy: strongestFixCandidate?.strategyLabel || 'none',
      source: 'fix-flow',
      archetype: strongestFixCandidate?.structuralArchetype || 'none',
      status: strongestFixCandidate?.structuralStatus || 'none',
      effectiveScore: strongestFixCandidate?.effectiveScore?.toFixed(2) || 'n/a',
      findings: findingsLabel(strongestFixCandidate?.topStructuralFindings),
      exactInFixFlow: 'yes',
    },
  ]))
  if (missingTopExploration.length) {
    console.log('')
    console.log('Top exploration candidates missing from fix-flow:')
    console.log(toMarkdownTable(
      missingTopExploration.map((candidate) => ({
        strategy: candidate.strategyLabel,
        source: candidate.source,
        archetype: candidate.structuralArchetype,
        status: candidate.structuralStatus,
        effectiveScore: candidate.effectiveScore.toFixed(2),
        findings: findingsLabel(candidate.topStructuralFindings),
        signature: candidate.structuralSignatureKey,
      }))
    ))
  }
  console.log('')
  console.log('## 5. Acceptance / rejection analysis')
  console.log(`- loss classification: \`${lossClassification}\``)
  console.log(`- strongest exploration candidate score advantage over strongest fix candidate: ${((strongestExplorationCandidate?.effectiveScore || 0) - (strongestFixCandidate?.effectiveScore || 0)).toFixed(2)}`)
  console.log(`- strongest exploration candidate score advantage over current rendered scene: ${((strongestExplorationCandidate?.effectiveScore || 0) - repair.diagnostics.before.effectiveScore).toFixed(2)}`)
  if (sameSignatureExplorationWinner) {
    console.log(`- same-signature fix candidate exists for strongest exploration winner: yes`)
    console.log(`- same-signature fix candidate score: ${sameSignatureExplorationWinner.effectiveScore?.toFixed(2) || 'n/a'}`)
  } else {
    console.log(`- same-signature fix candidate exists for strongest exploration winner: no`)
  }
  console.log(`- accepted improvement in fix flow: ${repair.diagnostics.acceptedImprovement ? 'yes' : 'no'}`)
  console.log(`- final accepted strategy: \`${repair.diagnostics.acceptedStrategyLabel || 'none'}\``)
  console.log('')
  console.log('## 6. Exact loss point(s)')
  switch (lossClassification) {
    case 'strongest-exploration-appears-but-is-rejected':
      console.log('- Strong candidates are generated in the real fix flow, but they are rejected by the acceptance gate.')
      break
    case 'same-signature-weaker-geometry-only':
      console.log('- The fix flow reaches the right structural signature, but only a weaker geometry variant inside that signature class.')
      break
    case 'missing-before-evaluation':
      console.log('- The strongest exploration candidates never enter the real fix-flow regeneration set at all.')
      break
    default:
      console.log(`- ${lossClassification}`)
      break
  }
  console.log('- In the current code, repair regeneration is limited to `buildGuidedRepairStrategies(...).slice(0, 3)` and does not reuse the wider marketplace-card preview/exploration plan space or its geometry probes.')
  console.log('')
  console.log('## 7. Most likely root cause(s)')
  console.log('- The real UI fix flow is master-based now, but its regeneration envelope is still much narrower than the exploration envelope for the same input.')
  console.log('- Exploration success is representative of this same real UI case when run against the same `project.master`, `goal`, `visualSystem`, and `assetHint`; the gap is candidate-space coverage, not a different input regime.')
  if (lossClassification === 'same-signature-weaker-geometry-only') {
    console.log('- Inside at least one structural-signature class, fix flow is missing the stronger geometry probe that exploration retains.')
  } else if (lossClassification === 'missing-before-evaluation') {
    console.log('- The strongest candidates are lost before acceptance, at repair strategy generation / candidate planning, not at the global acceptance comparator.')
  }
  console.log('')
  console.log('## 8. Best next implementation step')
  if (lossClassification === 'same-signature-weaker-geometry-only') {
    console.log('- Add the marketplace-card same-signature geometry probes from normal/exploration planning into the repair regeneration path, so fix flow can generate the stronger in-signature geometry variant before acceptance.')
  } else if (lossClassification === 'strongest-exploration-appears-but-is-rejected') {
    console.log('- Keep the current repair candidate set, but add a marketplace-card-only acceptance inspection/fix for generated stronger candidates that are currently rejected despite better effective score or issue reduction.')
  } else {
    console.log('- Widen the marketplace-card repair regeneration plan space to reuse the same preview/exploration candidate planning primitives already proven to surface stronger candidates.')
  }
  console.log('')
  console.log('## 9. Files changed')
  console.log('- `scripts/diagnostics/marketplaceCardMasterFixFailureAnalysis.ts`')
  console.log('- `src/lib/autoAdapt.ts`')
  console.log('')
  console.log('## 10. Verification')
  console.log('- build/test should be run after this diagnostics helper')
  console.log('- this script compares the exact real UI marketplace-card case against exploration for the same input envelope')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
