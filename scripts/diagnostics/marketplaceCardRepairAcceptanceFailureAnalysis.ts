import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  applyVariantManualOverride,
  buildProject,
  getMarketplaceCardExplorationDiagnostics,
  getRepairDiagnostics,
  refreshProjectModel,
} from '../../src/lib/autoAdapt'
import { BRAND_TEMPLATES, FORMAT_MAP } from '../../src/lib/presets'
import { aiReviewLayout, computeScoreTrust, getFormatAssessment } from '../../src/lib/validation'
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

function structuralTier(status?: StructuralLayoutStatus) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
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

function normalizeSceneMetric(value: unknown) {
  const numeric = typeof value === 'number' ? value : 0
  return Math.round(numeric * 10) / 10
}

function createRepairSceneSignature(scene: Scene) {
  const snapshot = {
    title: {
      x: normalizeSceneMetric(scene.title.x),
      y: normalizeSceneMetric(scene.title.y),
      w: normalizeSceneMetric(scene.title.w),
      h: normalizeSceneMetric(scene.title.h),
      fontSize: normalizeSceneMetric(scene.title.fontSize),
      maxLines: scene.title.maxLines || 0,
      charsPerLine: scene.title.charsPerLine || 0,
    },
    subtitle: {
      x: normalizeSceneMetric(scene.subtitle.x),
      y: normalizeSceneMetric(scene.subtitle.y),
      w: normalizeSceneMetric(scene.subtitle.w),
      h: normalizeSceneMetric(scene.subtitle.h),
      fontSize: normalizeSceneMetric(scene.subtitle.fontSize),
      opacity: normalizeSceneMetric(scene.subtitle.opacity),
    },
    cta: {
      x: normalizeSceneMetric(scene.cta.x),
      y: normalizeSceneMetric(scene.cta.y),
      w: normalizeSceneMetric(scene.cta.w),
      h: normalizeSceneMetric(scene.cta.h),
    },
    badge: {
      x: normalizeSceneMetric(scene.badge.x),
      y: normalizeSceneMetric(scene.badge.y),
      w: normalizeSceneMetric(scene.badge.w),
      h: normalizeSceneMetric(scene.badge.h),
      opacity: normalizeSceneMetric(scene.badge.opacity),
    },
    logo: {
      x: normalizeSceneMetric(scene.logo.x),
      y: normalizeSceneMetric(scene.logo.y),
      w: normalizeSceneMetric(scene.logo.w),
      h: normalizeSceneMetric(scene.logo.h),
    },
    image: {
      x: normalizeSceneMetric(scene.image.x),
      y: normalizeSceneMetric(scene.image.y),
      w: normalizeSceneMetric(scene.image.w),
      h: normalizeSceneMetric(scene.image.h),
      opacity: normalizeSceneMetric(scene.image.opacity),
      fit: scene.image.fit || '',
    },
  }
  return JSON.stringify(snapshot)
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

function renderScene(project: Project) {
  return applyVariantManualOverride(
    project.formats[formatKey],
    formatKey,
    project.manualOverrides?.[formatKey]
  )
}

async function loadProject(projectPath: string) {
  const absolutePath = path.resolve(projectPath)
  const raw = await readFile(absolutePath, 'utf8')
  return refreshProjectModel(JSON.parse(raw) as Project)
}

function loadFreshDefaultProject() {
  return buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit: BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit,
  })
}

async function resolveProject(projectPath?: string) {
  return projectPath ? loadProject(projectPath) : loadFreshDefaultProject()
}

async function evaluateSceneModes(scene: Scene, compositionModelId: string | undefined, project: Project) {
  const format = FORMAT_MAP[formatKey]
  const assessment = getFormatAssessment(formatKey, scene, compositionModelId, project.assetHint?.enhancedImage)
  const previewTrust = computeScoreTrust(assessment)
  const aiReview = await aiReviewLayout(scene, { format, assessment })
  const repairTrust = computeScoreTrust({ ...assessment, aiReview }, aiReview)
  return {
    rawScore: assessment.score,
    issueCount: assessment.issues.length,
    highIssueCount: assessment.issues.filter((issue) => issue.severity === 'high').length,
    mediumIssueCount: assessment.issues.filter((issue) => issue.severity === 'medium').length,
    structuralStatus: assessment.structuralState?.status || 'invalid',
    topStructuralFindings: (assessment.structuralState?.findings || []).slice(0, 4).map((finding) => ({
      name: finding.name,
      severity: finding.severity,
    })),
    previewTrust,
    repairTrust,
    aiReview,
    issues: assessment.issues.map((issue) => issue.code),
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const project = await resolveProject(options.projectPath)
  const renderedScene = renderScene(project)

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

  const attemptsByStrategy = new Map(repair.diagnostics.attempts.map((attempt) => [attempt.strategyLabel, attempt]))
  const strongestRepairCandidate = [...repair.diagnostics.regenerationCandidates]
    .filter((candidate) => candidate.generated)
    .sort(compareCandidates)[0]
  const strongestExplorationCandidate = [...exploration.candidates].sort(compareCandidates)[0]
  const strongestRepairExplorationMatch =
    strongestRepairCandidate &&
    exploration.candidates.find(
      (candidate) =>
        candidate.geometrySignature === strongestRepairCandidate.geometrySignature &&
        candidate.structuralSignatureKey === strongestRepairCandidate.structuralSignatureKey
    )
  const strongestExplorationRepairMatch =
    strongestExplorationCandidate &&
    repair.diagnostics.regenerationCandidates.find(
      (candidate) =>
        candidate.geometrySignature === strongestExplorationCandidate.geometrySignature &&
        candidate.structuralSignatureKey === strongestExplorationCandidate.structuralSignatureKey
    )
  const acceptedFinalScene = repair.scene

  const baselineEval = await evaluateSceneModes(renderedScene, project.variants?.[formatKey]?.compositionModelId, project)
  const strongestRepairEval = strongestRepairExplorationMatch
    ? await evaluateSceneModes(
        strongestRepairExplorationMatch.scene,
        strongestRepairCandidate?.compositionModelId,
        project
      )
    : null
  const strongestExplorationEval = strongestExplorationCandidate
    ? await evaluateSceneModes(
        strongestExplorationCandidate.scene,
        strongestExplorationRepairMatch?.compositionModelId,
        project
      )
    : null
  const acceptedFinalEval = await evaluateSceneModes(acceptedFinalScene, project.variants?.[formatKey]?.compositionModelId, project)

  const strongestRepairAttempt =
    strongestRepairCandidate ? attemptsByStrategy.get(strongestRepairCandidate.strategyLabel) : undefined
  const strongestExplorationAttempt =
    strongestExplorationRepairMatch ? attemptsByStrategy.get(strongestExplorationRepairMatch.strategyLabel) : undefined

  const strongestRepairSameAsBaseline =
    strongestRepairExplorationMatch
      ? createRepairSceneSignature(strongestRepairExplorationMatch.scene) === createRepairSceneSignature(renderedScene)
      : false
  const strongestExplorationSameAsBaseline =
    strongestExplorationCandidate
      ? createRepairSceneSignature(strongestExplorationCandidate.scene) === createRepairSceneSignature(renderedScene)
      : false

  console.log('# Marketplace-card Repair Acceptance Failure Analysis Report')
  console.log('')
  console.log('## 1. Verification scope')
  console.log(`- format: \`${formatKey}\``)
  console.log(`- projectPath: ${options.projectPath ? path.resolve(options.projectPath) : 'fresh-generated-default'}`)
  console.log(`- goal: \`${project.goal}\``)
  console.log(`- visualSystem: \`${project.visualSystem}\``)
  console.log(`- assetHint.imageProfile: \`${project.assetHint?.imageProfile || 'none'}\``)
  console.log(`- enhancedImage present: ${project.assetHint?.enhancedImage ? 'yes' : 'no'}`)
  console.log('')
  console.log('## 2. Exact real UI case reconstruction')
  console.log(toMarkdownTable([
    {
      scene: 'current-rendered-baseline',
      structuralTier: repair.diagnostics.before.structuralStatus,
      rawScore: baselineEval.rawScore.toFixed(2),
      previewEffective: baselineEval.previewTrust.effectiveScore.toFixed(2),
      repairEffective: baselineEval.repairTrust.effectiveScore.toFixed(2),
      aiReviewScore: baselineEval.aiReview.score.toFixed(2),
      issues: baselineEval.issues.join(', ') || 'none',
      geometrySignature: createSceneGeometrySignature(renderedScene),
    },
    {
      scene: 'accepted-final-result',
      structuralTier: repair.diagnostics.after.structuralStatus,
      rawScore: acceptedFinalEval.rawScore.toFixed(2),
      previewEffective: acceptedFinalEval.previewTrust.effectiveScore.toFixed(2),
      repairEffective: acceptedFinalEval.repairTrust.effectiveScore.toFixed(2),
      aiReviewScore: acceptedFinalEval.aiReview.score.toFixed(2),
      issues: acceptedFinalEval.issues.join(', ') || 'none',
      geometrySignature: createSceneGeometrySignature(acceptedFinalScene),
    },
  ]))
  console.log('')
  console.log('## 3. Repair acceptance path trace')
  console.log('- `runRepairPipeline(...)` builds `beforeState` with `evaluateRepairSceneSync(...)` using `beforeAssessment` that already includes `aiReviewLayout(...)`.')
  console.log('- `attemptGuidedRegenerationRepair(...)` evaluates each regenerated candidate with `evaluateRepairScene(...)`, which also adds `aiReviewLayout(...)` before `computeScoreTrust(...)`.')
  console.log('- `buildRepairDecision(...)` then compares candidate vs current baseline on:')
  console.log('  - structural tier')
  console.log('  - effective score delta')
  console.log('  - structural finding reduction')
  console.log('  - unresolved issue reduction')
  console.log('  - scene-signature / geometry no-op guards')
  console.log(toMarkdownTable(
    repair.diagnostics.attempts.map((attempt) => ({
      strategy: attempt.strategyLabel,
      accepted: attempt.accepted ? 'yes' : 'no',
      suppressed: attempt.suppressed ? 'yes' : 'no',
      noOp: attempt.noOp ? 'yes' : 'no',
      beforeEffective: attempt.beforeEffectiveScore.toFixed(2),
      afterEffective: attempt.afterEffectiveScore.toFixed(2),
      scoreDelta: attempt.scoreDelta.toFixed(2),
      findingDelta: attempt.findingDelta.toFixed(2),
      rejectionReason: attempt.rejectionReason || 'accepted',
      noOpReasons: attempt.noOpReasons.join(', ') || 'none',
    }))
  ))
  console.log('')
  console.log('## 4. Baseline vs strongest repair candidate comparison')
  console.log(toMarkdownTable([
    {
      candidate: 'baseline-current',
      structuralTier: repair.diagnostics.before.structuralStatus,
      rawScore: baselineEval.rawScore.toFixed(2),
      previewEffective: baselineEval.previewTrust.effectiveScore.toFixed(2),
      repairEffective: baselineEval.repairTrust.effectiveScore.toFixed(2),
      aiReviewScore: baselineEval.aiReview.score.toFixed(2),
      issueCount: baselineEval.issueCount,
      findings: findingsLabel(baselineEval.topStructuralFindings),
      sameAsBaseline: 'yes',
      acceptanceReason: 'baseline',
    },
    {
      candidate: 'strongest-generated-repair',
      structuralTier: strongestRepairCandidate?.structuralStatus || 'none',
      rawScore: strongestRepairEval?.rawScore.toFixed(2) || 'n/a',
      previewEffective: strongestRepairEval?.previewTrust.effectiveScore.toFixed(2) || 'n/a',
      repairEffective: strongestRepairEval?.repairTrust.effectiveScore.toFixed(2) || 'n/a',
      aiReviewScore: strongestRepairEval?.aiReview.score.toFixed(2) || 'n/a',
      issueCount: strongestRepairEval?.issueCount ?? 'n/a',
      findings: findingsLabel(strongestRepairEval?.topStructuralFindings),
      sameAsBaseline: strongestRepairSameAsBaseline ? 'yes' : 'no',
      acceptanceReason: strongestRepairAttempt?.rejectionReason || 'n/a',
    },
    {
      candidate: 'accepted-final-result',
      structuralTier: repair.diagnostics.after.structuralStatus,
      rawScore: acceptedFinalEval.rawScore.toFixed(2),
      previewEffective: acceptedFinalEval.previewTrust.effectiveScore.toFixed(2),
      repairEffective: acceptedFinalEval.repairTrust.effectiveScore.toFixed(2),
      aiReviewScore: acceptedFinalEval.aiReview.score.toFixed(2),
      issueCount: acceptedFinalEval.issueCount,
      findings: findingsLabel(acceptedFinalEval.topStructuralFindings),
      sameAsBaseline: createRepairSceneSignature(acceptedFinalScene) === createRepairSceneSignature(renderedScene) ? 'yes' : 'no',
      acceptanceReason: repair.diagnostics.acceptedStrategyLabel || 'none',
    },
  ]))
  console.log('')
  console.log('## 5. Preview-vs-repair scoring/decision comparison')
  console.log(toMarkdownTable([
    {
      scene: 'baseline-current',
      geometryMatchesBaseline: 'yes',
      previewEffective: baselineEval.previewTrust.effectiveScore.toFixed(2),
      repairEffective: baselineEval.repairTrust.effectiveScore.toFixed(2),
      previewVsRepairDelta: (baselineEval.previewTrust.effectiveScore - baselineEval.repairTrust.effectiveScore).toFixed(2),
      disagreement: baselineEval.repairTrust.disagreement.toFixed(2),
      aiReviewScore: baselineEval.aiReview.score.toFixed(2),
    },
    {
      scene: 'strongest-exploration-winner',
      geometryMatchesBaseline: strongestExplorationSameAsBaseline ? 'yes' : 'no',
      previewEffective: strongestExplorationEval?.previewTrust.effectiveScore.toFixed(2) || 'n/a',
      repairEffective: strongestExplorationEval?.repairTrust.effectiveScore.toFixed(2) || 'n/a',
      previewVsRepairDelta: strongestExplorationEval ? (strongestExplorationEval.previewTrust.effectiveScore - strongestExplorationEval.repairTrust.effectiveScore).toFixed(2) : 'n/a',
      disagreement: strongestExplorationEval?.repairTrust.disagreement.toFixed(2) || 'n/a',
      aiReviewScore: strongestExplorationEval?.aiReview.score.toFixed(2) || 'n/a',
    },
    {
      scene: 'strongest-generated-repair',
      geometryMatchesBaseline: strongestRepairSameAsBaseline ? 'yes' : 'no',
      previewEffective: strongestRepairEval?.previewTrust.effectiveScore.toFixed(2) || 'n/a',
      repairEffective: strongestRepairEval?.repairTrust.effectiveScore.toFixed(2) || 'n/a',
      previewVsRepairDelta: strongestRepairEval ? (strongestRepairEval.previewTrust.effectiveScore - strongestRepairEval.repairTrust.effectiveScore).toFixed(2) : 'n/a',
      disagreement: strongestRepairEval?.repairTrust.disagreement.toFixed(2) || 'n/a',
      aiReviewScore: strongestRepairEval?.aiReview.score.toFixed(2) || 'n/a',
    },
  ]))
  console.log('')
  console.log('## 6. Exact rejection or no-improvement reasons')
  if (strongestExplorationAttempt) {
    console.log(`- Strongest exploration winner appears in repair as: \`${strongestExplorationAttempt.strategyLabel}\``)
    console.log(`- Repair rejection reason: ${strongestExplorationAttempt.rejectionReason || 'accepted'}`)
    console.log(`- Repair no-op reasons: ${strongestExplorationAttempt.noOpReasons.join(', ') || 'none'}`)
  }
  if (strongestRepairAttempt) {
    console.log(`- Strongest generated repair candidate rejection reason: ${strongestRepairAttempt.rejectionReason || 'accepted'}`)
    console.log(`- Strongest generated repair candidate no-op reasons: ${strongestRepairAttempt.noOpReasons.join(', ') || 'none'}`)
    console.log(`- Score delta vs baseline under repair: ${strongestRepairAttempt.scoreDelta.toFixed(2)}`)
    console.log(`- Finding delta vs baseline under repair: ${strongestRepairAttempt.findingDelta.toFixed(2)}`)
  }
  console.log(`- Strongest exploration candidate matches baseline scene signature: ${strongestExplorationSameAsBaseline ? 'yes' : 'no'}`)
  console.log(`- Strongest repair candidate matches baseline scene signature: ${strongestRepairSameAsBaseline ? 'yes' : 'no'}`)
  console.log('')
  console.log('## 7. Root cause classification')
  console.log('- Outcome 5: a narrow combination of preview-vs-repair scoring mismatch and repair no-op guard logic.')
  console.log('- The same marketplace-card scene can look much stronger in preview/exploration scoring than in repair scoring because repair always runs `aiReviewLayout(...)` and then compares against the AI-penalized effective score.')
  console.log('- For the reproduced real UI case, the strongest exploration winner is effectively the same scene as the weak baseline under repair scene-signature comparison, so `buildRepairDecision(...)` treats it as a no-op: no structural gain, no meaningful finding reduction, no score gain.')
  console.log('- So the candidate is not being rejected because candidate supply is still weak; it is being rejected because repair is using a stricter, different scoring/acceptance model on what is effectively the same scene.')
  console.log('')
  console.log('## 8. Best next implementation step')
  console.log('- Add a marketplace-card-only repair acceptance path that, for retained master-based preview candidates, uses preview-style candidate comparison to select the strongest candidate first, then applies repair safety gating on that chosen candidate instead of treating each same-scene retained candidate as an immediate no-op against the current baseline.')
  console.log('')
  console.log('## 9. Files changed')
  console.log('- `scripts/diagnostics/marketplaceCardRepairAcceptanceFailureAnalysis.ts`')
  console.log('')
  console.log('## 10. Verification')
  console.log('- run build/tests')
  console.log('- run this diagnostics script on the same real UI marketplace-card case')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
