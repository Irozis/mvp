import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildProject, getPreviewCandidateDiagnostics } from '../../src/lib/autoAdapt'
import { computePalette } from '../../src/lib/colorEngine'
import { profileContent } from '../../src/lib/contentProfile'
import { synthesizeLayout } from '../../src/lib/layoutEngine'
import { BRAND_TEMPLATES, FORMAT_MAP } from '../../src/lib/presets'
import { classifyScenario } from '../../src/lib/scenarioClassifier'
import { adaptMarketplaceCardTemplate } from '../../src/lib/templateAdapter'
import { getMarketplaceCardTemplates } from '../../src/lib/templateDefinitions'
import { selectMarketplaceCardTemplate } from '../../src/lib/templateSelection'
import { computeTypography } from '../../src/lib/typographyEngine'
import { computeScoreTrust, getFormatAssessment } from '../../src/lib/validation'
import type {
  AssetHint,
  BrandKit,
  ContentProfile,
  FormatKey,
  ImageProfile,
  LayoutAssessment,
  MarketplaceCardTemplateId,
  MarketplaceCardTemplateSelectionResult,
  Project,
  Scene,
  VisualAssessmentBand,
  VisualAssessmentBreakdown,
} from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'
process.env.REPAIR_DEBUG = '0'

const formatKey: FormatKey = 'marketplace-card'
const outDir = path.join(process.cwd(), 'artifacts', 'marketplace-card-template-quality-audit', 'v1')

type AuditCaseDefinition = {
  id: string
  label: string
  imageProfile?: ImageProfile
  mutate?: (scene: Scene) => Scene
}

type AuditTemplateEvaluation = {
  templateId: MarketplaceCardTemplateId
  templateLabel: string
  scenarioId: string
  scenarioLabel: string
  imageRegime: 'no-image' | 'image-backed'
  selectedBySelector: boolean
  consideredInRuntimeSet: boolean
  runtimeRank?: number
  runtimeWinner: boolean
  structuralStatus: string
  effectiveScore: number
  rawScore: number
  visualScore: number
  visualBand: VisualAssessmentBand
  visualBreakdown: VisualAssessmentBreakdown
  warnings: string[]
  strengths: string[]
  issues: string[]
  geometry: {
    title: string
    subtitle: string
    image: string
    cta: string
    imageToTitleGap: number
    textToCtaGap: number
  }
  previewArtifact: string
  productSummary: string
  failureModes: string[]
}

type AuditCaseReport = {
  id: string
  label: string
  imageProfile?: ImageProfile
  selector: MarketplaceCardTemplateSelectionResult
  runtimeWinnerTemplateId: MarketplaceCardTemplateId | 'n/a'
  runtimeCandidates: Array<{
    rank: number
    templateId: MarketplaceCardTemplateId | 'n/a'
    strategyLabel: string
    structuralStatus: string
    effectiveScore: number
    visualScore: number
    visualBand: VisualAssessmentBand
    issues: string[]
  }>
  forcedBestTemplateId: MarketplaceCardTemplateId
  forcedEvaluations: AuditTemplateEvaluation[]
}

function round(value?: number) {
  return Math.round((value || 0) * 10) / 10
}

function truncate(value: string, max = 42) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function percentX(value: number, width: number) {
  return Math.round((value / 100) * width)
}

function percentY(value: number, height: number) {
  return Math.round((value / 100) * height)
}

function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene
}

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

function createDensePromoScene(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Save more on the launch collection this week'
  next.subtitle.text =
    'Bundle-ready promo message with stronger offer framing, clearer product support, and enough copy to stress the denser marketplace card templates.'
  next.cta.text = 'See offers'
  next.badge.text = 'Limited'
  return next
}

function createMinimalPromoScene(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Weekend picks'
  next.subtitle.text = ''
  next.cta.text = 'View'
  next.badge.text = ''
  return next
}

function createProductSupportScene(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'New arrivals for daily comfort'
  next.subtitle.text = 'Product-led update with pickup-ready offer support.'
  next.cta.text = 'Buy now'
  next.badge.text = 'New'
  return next
}

const AUDIT_CASES: AuditCaseDefinition[] = [
  { id: 'default-no-image', label: 'Default no-image' },
  { id: 'dense-no-image', label: 'Dense no-image', mutate: createDensePromoScene },
  { id: 'minimal-no-image', label: 'Minimal no-image', mutate: createMinimalPromoScene },
  { id: 'default-image-square', label: 'Default image-backed square', imageProfile: 'square' },
  { id: 'dense-image-square', label: 'Dense image-backed square', imageProfile: 'square', mutate: createDensePromoScene },
  { id: 'product-image-landscape', label: 'Product-led image-backed landscape', imageProfile: 'landscape', mutate: createProductSupportScene },
]

function createCaseProject(definition: AuditCaseDefinition) {
  const project = createProject(definition.imageProfile)
  const master = definition.mutate ? definition.mutate(project.master) : cloneScene(project.master)
  const assetHint = definition.imageProfile ? ({ imageProfile: definition.imageProfile } satisfies AssetHint) : undefined

  return {
    project: {
      ...project,
      master,
      assetHint,
    } satisfies Project,
    master,
    assetHint,
  }
}

function renderSceneSvg(scene: Scene) {
  const format = FORMAT_MAP[formatKey]
  const width = format.width
  const height = format.height
  const x = (value?: number) => percentX(value || 0, width)
  const y = (value?: number) => percentY(value || 0, height)
  const w = (value?: number) => percentX(value || 0, width)
  const h = (value?: number) => percentY(value || 0, height)
  const bgA = scene.background?.[0] || '#0f172a'
  const bgB = scene.background?.[1] || '#1e293b'
  const bgC = scene.background?.[2] || '#334155'

  const titleText = (scene.title.text || 'Headline').trim()
  const subtitleText = (scene.subtitle.text || '').trim()
  const ctaText = (scene.cta.text || '').trim()

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="50%" stop-color="${bgB}" />
      <stop offset="100%" stop-color="${bgC}" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" rx="28" />
  <rect x="${x(scene.image.x)}" y="${y(scene.image.y)}" width="${w(scene.image.w)}" height="${h(scene.image.h)}" rx="20" fill="#e2e8f0" fill-opacity="0.22" stroke="#ffffff" stroke-opacity="0.18"/>
  <rect x="${x(scene.logo.x)}" y="${y(scene.logo.y)}" width="${w(scene.logo.w)}" height="${h(scene.logo.h)}" rx="10" fill="#ffffff" fill-opacity="0.14"/>
  <rect x="${x(scene.badge.x)}" y="${y(scene.badge.y)}" width="${w(scene.badge.w)}" height="${h(scene.badge.h)}" rx="10" fill="#ffffff" fill-opacity="0.14"/>
  <text x="${x(scene.title.x)}" y="${y(scene.title.y) + 34}" fill="${scene.title.fill || '#ffffff'}" font-size="${Math.max(scene.title.fontSize || 26, 18)}" font-weight="${scene.title.weight || 700}" font-family="Arial, sans-serif">${escapeHtml(truncate(titleText, 36))}</text>
  ${subtitleText ? `<text x="${x(scene.subtitle.x)}" y="${y(scene.subtitle.y) + 22}" fill="${scene.subtitle.fill || '#ffffff'}" opacity="${scene.subtitle.opacity || 0.9}" font-size="${Math.max(scene.subtitle.fontSize || 16, 12)}" font-family="Arial, sans-serif">${escapeHtml(truncate(subtitleText, 58))}</text>` : ''}
  <rect x="${x(scene.cta.x)}" y="${y(scene.cta.y)}" width="${w(scene.cta.w)}" height="${h(scene.cta.h)}" rx="14" fill="${scene.cta.bg || '#ffffff'}" />
  ${ctaText ? `<text x="${x(scene.cta.x) + 12}" y="${y(scene.cta.y) + Math.max(h(scene.cta.h) * 0.62, 16)}" fill="${scene.cta.fill || '#111827'}" font-size="${Math.max(scene.cta.fontSize || 16, 12)}" font-family="Arial, sans-serif">${escapeHtml(truncate(ctaText, 18))}</text>` : ''}
</svg>`
}

function countHighStructuralFindings(assessment: LayoutAssessment) {
  return (assessment.structuralState?.findings || []).filter((finding) => finding.severity === 'high').length
}

function countCriticalIssues(assessment: LayoutAssessment) {
  return assessment.issues.filter((issue) => issue.severity === 'critical').length
}

function getVisualBandRank(band: VisualAssessmentBand) {
  if (band === 'strong') return 3
  if (band === 'acceptable') return 2
  if (band === 'weak') return 1
  return 0
}

function getStructuralTierRank(status: string) {
  if (status === 'valid') return 2
  if (status === 'degraded') return 1
  return 0
}

function compareEvaluations(left: AuditTemplateEvaluation, right: AuditTemplateEvaluation) {
  const tierDelta = getStructuralTierRank(right.structuralStatus) - getStructuralTierRank(left.structuralStatus)
  if (tierDelta !== 0) return tierDelta

  const scoreDelta = right.effectiveScore - left.effectiveScore
  if (Math.abs(scoreDelta) > 5) return scoreDelta

  const highFindingDelta =
    left.failureModes.filter((mode) => mode === 'structural-risk').length -
    right.failureModes.filter((mode) => mode === 'structural-risk').length
  if (highFindingDelta !== 0) return highFindingDelta

  const visualDelta = right.visualScore - left.visualScore
  if (Math.abs(visualDelta) >= 4) return visualDelta

  const visualBandDelta = getVisualBandRank(right.visualBand) - getVisualBandRank(left.visualBand)
  if (visualBandDelta !== 0) return visualBandDelta

  if (scoreDelta !== 0) return scoreDelta

  const issueCountDelta = left.issues.length - right.issues.length
  if (issueCountDelta !== 0) return issueCountDelta

  return left.templateId.localeCompare(right.templateId)
}

function mapFailureModes(input: {
  assessment: LayoutAssessment
  visualBand: VisualAssessmentBand
  visualScore: number
}) {
  const warnings = input.assessment.visual?.warnings || []
  const issues = input.assessment.issues.map((issue) => issue.code)
  const breakdown = input.assessment.visual?.breakdown
  const failureModes = new Set<string>()
  const combined = `${warnings.join(' ')} ${issues.join(' ')}`.toLowerCase()

  if (combined.includes('cta') || (breakdown?.ctaQuality || 0) < 58) failureModes.add('weak-cta')
  if (
    combined.includes('image') ||
    combined.includes('support') ||
    combined.includes('footprint') ||
    (breakdown?.textImageHarmony || 0) < 58
  ) {
    failureModes.add('weak-top-support')
  }
  if (combined.includes('detached') || combined.includes('ratio') || (breakdown?.textImageHarmony || 0) < 56) {
    failureModes.add('detached-text-image')
  }
  if (
    combined.includes('empty space') ||
    combined.includes('canvas underused') ||
    combined.includes('accidental') ||
    (breakdown?.negativeSpaceQuality || 0) < 58
  ) {
    failureModes.add('accidental-dead-space')
  }
  if (combined.includes('focus') || combined.includes('dominant') || (breakdown?.focusHierarchy || 0) < 58) {
    failureModes.add('weak-hierarchy')
  }
  if (combined.includes('coherent') || input.visualBand === 'poor' || input.visualScore < 60) {
    failureModes.add('bland-composition')
  }
  if (
    input.assessment.structuralState?.status !== 'valid' ||
    countHighStructuralFindings(input.assessment) > 0 ||
    countCriticalIssues(input.assessment) > 0
  ) {
    failureModes.add('structural-risk')
  }

  return Array.from(failureModes)
}

function summarizeGeometry(scene: Scene) {
  const imageBottom = round((scene.image.y || 0) + (scene.image.h || 0))
  const titleTop = round(scene.title.y || 0)
  const subtitleBottom = round((scene.subtitle.y || 0) + (scene.subtitle.h || 0))
  const ctaTop = round(scene.cta.y || 0)
  const messageBottom = subtitleBottom > 0 ? subtitleBottom : round((scene.title.y || 0) + (scene.title.h || 0))

  return {
    title: [round(scene.title.x), round(scene.title.y), round(scene.title.w), round(scene.title.h)].join(':'),
    subtitle: [round(scene.subtitle.x), round(scene.subtitle.y), round(scene.subtitle.w), round(scene.subtitle.h)].join(':'),
    image: [round(scene.image.x), round(scene.image.y), round(scene.image.w), round(scene.image.h)].join(':'),
    cta: [round(scene.cta.x), round(scene.cta.y), round(scene.cta.w), round(scene.cta.h)].join(':'),
    imageToTitleGap: round(titleTop - imageBottom),
    textToCtaGap: round(ctaTop - messageBottom),
  }
}

function buildProductSummary(input: {
  templateId: MarketplaceCardTemplateId
  assessment: LayoutAssessment
  visualScore: number
  geometry: ReturnType<typeof summarizeGeometry>
  failureModes: string[]
}) {
  const warnings = input.assessment.visual?.warnings || []
  if (input.assessment.structuralState?.status !== 'valid') {
    return `Structurally risky product pattern. Main blockers: ${
      warnings.slice(0, 2).join(' | ') ||
      input.assessment.issues.map((issue) => issue.code).slice(0, 2).join(' | ') ||
      'structural instability'
    }.`
  }
  if (input.visualScore >= 68 && input.failureModes.length <= 2) {
    return `Most convincing current ${input.templateId} card. Rhythm is coherent and gaps stay controlled (${input.geometry.imageToTitleGap}% image-to-title, ${input.geometry.textToCtaGap}% text-to-CTA).`
  }
  if (input.visualScore >= 60) {
    return `Usable product card, but still carries visible polish debt. Main product weaknesses: ${
      input.failureModes.slice(0, 2).join(', ') || 'minor compositional softness'
    }.`
  }
  return `Technically acceptable in places, but still reads bland or under-composed. Main problems: ${
    input.failureModes.slice(0, 3).join(', ') || 'weak composition'
  }.`
}

function createForcedSelection(
  selection: MarketplaceCardTemplateSelectionResult,
  templateId: MarketplaceCardTemplateId
): MarketplaceCardTemplateSelectionResult {
  const alternatives = [
    selection.selectedTemplateId,
    ...selection.alternativeTemplateIds,
    ...getMarketplaceCardTemplates().map((template) => template.id),
  ].filter(
    (id, index, values): id is MarketplaceCardTemplateId =>
      values.indexOf(id as MarketplaceCardTemplateId) === index && id !== templateId
  )

  return {
    ...selection,
    selectedTemplateId: templateId,
    alternativeTemplateIds: alternatives.slice(0, 3),
    decisionSummary: `${selection.inputProfile.imageRegime} marketplace-card audit forcing ${templateId}.`,
  }
}

function synthesizeTemplateScene(input: {
  master: Scene
  brandKit: BrandKit
  profile: ContentProfile
  scenario: ReturnType<typeof classifyScenario>
  assetHint?: AssetHint
  selection: MarketplaceCardTemplateSelectionResult
  templateId: MarketplaceCardTemplateId
}) {
  const forcedSelection = createForcedSelection(input.selection, input.templateId)
  const adaptation = adaptMarketplaceCardTemplate({
    format: FORMAT_MAP[formatKey],
    master: input.master,
    profile: input.profile,
    goal: 'promo-pack',
    visualSystem: 'product-card',
    assetHint: input.assetHint,
    selectedTemplate: forcedSelection,
  })
  const typography = computeTypography({
    format: FORMAT_MAP[formatKey],
    profile: input.profile,
    scenario: input.scenario,
    visualSystem: 'product-card',
    brandKit: input.brandKit,
    intent: adaptation.intent,
    headlineText: input.master.title.text,
    subtitleText: input.master.subtitle.text,
    fixStage: 'base',
  })
  const palette = computePalette({
    brandKit: input.brandKit,
    visualSystem: 'product-card',
    scenario: input.scenario,
  })

  return synthesizeLayout({
    master: input.master,
    format: FORMAT_MAP[formatKey],
    profile: input.profile,
    palette,
    typography,
    intent: adaptation.intent,
    brandKit: input.brandKit,
    assetHint: input.assetHint,
    imageAnalysis: input.assetHint?.enhancedImage,
  })
}

function evaluateTemplate(input: {
  master: Scene
  brandKit: BrandKit
  profile: ContentProfile
  scenario: ReturnType<typeof classifyScenario>
  assetHint?: AssetHint
  selection: MarketplaceCardTemplateSelectionResult
  templateId: MarketplaceCardTemplateId
  caseId: string
  caseLabel: string
  runtimeCandidates: AuditCaseReport['runtimeCandidates']
}) {
  const synthesized = synthesizeTemplateScene({
    master: input.master,
    brandKit: input.brandKit,
    profile: input.profile,
    scenario: input.scenario,
    assetHint: input.assetHint,
    selection: input.selection,
    templateId: input.templateId,
  })
  const assessment = getFormatAssessment(
    formatKey,
    synthesized.scene,
    synthesized.intent.compositionModelId,
    input.assetHint?.enhancedImage
  )
  const scoreTrust = computeScoreTrust(assessment)
  const visualScore = round(assessment.visual?.overallScore || 0)
  const visualBand = assessment.visual?.band || 'poor'
  const templateDefinition = getMarketplaceCardTemplates().find((template) => template.id === input.templateId)!
  const runtimeMatch = input.runtimeCandidates.find((candidate) => candidate.templateId === input.templateId)
  const geometry = summarizeGeometry(synthesized.scene)
  const failureModes = mapFailureModes({
    assessment,
    visualBand,
    visualScore,
  })

  return {
    templateId: input.templateId,
    templateLabel: templateDefinition.displayName,
    scenarioId: input.caseId,
    scenarioLabel: input.caseLabel,
    imageRegime: input.selection.inputProfile.imageRegime,
    selectedBySelector: input.selection.selectedTemplateId === input.templateId,
    consideredInRuntimeSet: Boolean(runtimeMatch),
    runtimeRank: runtimeMatch?.rank,
    runtimeWinner: runtimeMatch?.rank === 1,
    structuralStatus: assessment.structuralState?.status || 'invalid',
    effectiveScore: round(scoreTrust.effectiveScore),
    rawScore: round(assessment.score),
    visualScore,
    visualBand,
    visualBreakdown: assessment.visual?.breakdown || {
      focusHierarchy: 0,
      compositionBalance: 0,
      textImageHarmony: 0,
      ctaQuality: 0,
      negativeSpaceQuality: 0,
      coherence: 0,
    },
    warnings: assessment.visual?.warnings || [],
    strengths: assessment.visual?.strengths || [],
    issues: assessment.issues.map((issue) => issue.code),
    geometry,
    previewArtifact: `${input.caseId}--${input.templateId}.svg`,
    productSummary: buildProductSummary({
      templateId: input.templateId,
      assessment,
      visualScore,
      geometry,
      failureModes,
    }),
    failureModes,
  } satisfies AuditTemplateEvaluation
}

function aggregateTemplateFindings(caseReports: AuditCaseReport[]) {
  const aggregates = new Map<
    MarketplaceCardTemplateId,
    {
      templateId: MarketplaceCardTemplateId
      templateLabel: string
      evaluations: AuditTemplateEvaluation[]
      runtimeWinCount: number
      forcedTopRankCount: number
    }
  >()

  for (const caseReport of caseReports) {
    for (const evaluation of caseReport.forcedEvaluations) {
      const current = aggregates.get(evaluation.templateId) || {
        templateId: evaluation.templateId,
        templateLabel: evaluation.templateLabel,
        evaluations: [],
        runtimeWinCount: 0,
        forcedTopRankCount: 0,
      }
      current.evaluations.push(evaluation)
      if (evaluation.runtimeWinner) current.runtimeWinCount += 1
      if (caseReport.forcedBestTemplateId === evaluation.templateId) current.forcedTopRankCount += 1
      aggregates.set(evaluation.templateId, current)
    }
  }

  return Array.from(aggregates.values())
    .map((aggregate) => {
      const total = aggregate.evaluations.length || 1
      const validCount = aggregate.evaluations.filter((entry) => entry.structuralStatus === 'valid').length
      const degradedCount = aggregate.evaluations.filter((entry) => entry.structuralStatus === 'degraded').length
      const invalidCount = aggregate.evaluations.filter((entry) => entry.structuralStatus === 'invalid').length
      const avgEffectiveScore = round(aggregate.evaluations.reduce((sum, entry) => sum + entry.effectiveScore, 0) / total)
      const avgVisualScore = round(aggregate.evaluations.reduce((sum, entry) => sum + entry.visualScore, 0) / total)
      const failureModeCounts = new Map<string, number>()
      const warningCounts = new Map<string, number>()

      for (const evaluation of aggregate.evaluations) {
        for (const failureMode of evaluation.failureModes) {
          failureModeCounts.set(failureMode, (failureModeCounts.get(failureMode) || 0) + 1)
        }
        for (const warning of evaluation.warnings) {
          warningCounts.set(warning, (warningCounts.get(warning) || 0) + 1)
        }
      }

      const topFailureModes = Array.from(failureModeCounts.entries())
        .sort((left, right) => {
          if (right[1] !== left[1]) return right[1] - left[1]
          return left[0].localeCompare(right[0])
        })
        .slice(0, 3)
        .map(([failureMode]) => failureMode)

      const topWarnings = Array.from(warningCounts.entries())
        .sort((left, right) => {
          if (right[1] !== left[1]) return right[1] - left[1]
          return left[0].localeCompare(right[0])
        })
        .slice(0, 3)
        .map(([warning]) => warning)

      const bestEvaluation = [...aggregate.evaluations].sort(compareEvaluations)[0]
      const worstEvaluation = [...aggregate.evaluations].sort((left, right) => compareEvaluations(right, left))[0]
      const validRate = validCount / total

      let verdict = 'keep, tune'
      let action = 'Keep, but target the leading failure modes'
      if (validRate >= 0.8 && avgVisualScore >= 66 && aggregate.forcedTopRankCount >= 1) {
        verdict = 'keep'
        action = 'Keep as an active template'
      } else if (validRate >= 0.6 && avgVisualScore >= 60) {
        verdict = 'keep, tune'
        action = 'Keep, but target the leading failure modes'
      } else if (validRate >= 0.4 && avgVisualScore >= 54) {
        verdict = 'demote'
        action = 'Demote in active rotation until tuned'
      } else {
        verdict = 'remove from active rotation'
        action = 'Remove or park as legacy fallback unless a focused rebuild is planned'
      }

      return {
        templateId: aggregate.templateId,
        templateLabel: aggregate.templateLabel,
        verdict,
        action,
        runtimeWinCount: aggregate.runtimeWinCount,
        forcedTopRankCount: aggregate.forcedTopRankCount,
        avgEffectiveScore,
        avgVisualScore,
        validCount,
        degradedCount,
        invalidCount,
        topFailureModes,
        topWarnings,
        strongestScenario: bestEvaluation.scenarioLabel,
        weakestScenario: worstEvaluation.scenarioLabel,
        strongestSummary: bestEvaluation.productSummary,
        weakestSummary: worstEvaluation.productSummary,
      }
    })
    .sort((left, right) => left.templateId.localeCompare(right.templateId))
}

function buildSummary(caseReports: AuditCaseReport[]) {
  const noImageEvaluations = caseReports
    .filter((entry) => entry.selector.inputProfile.imageRegime === 'no-image')
    .map((entry) => [...entry.forcedEvaluations].sort(compareEvaluations)[0])
  const imageBackedEvaluations = caseReports
    .filter((entry) => entry.selector.inputProfile.imageRegime === 'image-backed')
    .map((entry) => [...entry.forcedEvaluations].sort(compareEvaluations)[0])
  const allEvaluations = caseReports.flatMap((entry) => entry.forcedEvaluations)

  const strongestNoImage = [...noImageEvaluations].sort(compareEvaluations)[0]
  const strongestImageBacked = [...imageBackedEvaluations].sort(compareEvaluations)[0]
  const weakestOverall = [...allEvaluations].sort((left, right) => compareEvaluations(right, left))[0]
  const failureModeCounts = new Map<string, number>()
  for (const evaluation of allEvaluations) {
    for (const failureMode of evaluation.failureModes) {
      failureModeCounts.set(failureMode, (failureModeCounts.get(failureMode) || 0) + 1)
    }
  }

  const recurringFailureModes = Array.from(failureModeCounts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })
    .slice(0, 5)
    .map(([failureMode, count]) => ({ failureMode, count }))

  return {
    strongestNoImageTemplate: strongestNoImage.templateId,
    strongestNoImageCase: strongestNoImage.scenarioLabel,
    strongestImageBackedTemplate: strongestImageBacked.templateId,
    strongestImageBackedCase: strongestImageBacked.scenarioLabel,
    weakestTemplate: weakestOverall.templateId,
    weakestCase: weakestOverall.scenarioLabel,
    recurringFailureModes,
  }
}

function buildHtmlReport(input: {
  caseReports: AuditCaseReport[]
  templateSummaries: ReturnType<typeof aggregateTemplateFindings>
  summary: ReturnType<typeof buildSummary>
}) {
  const templateCards = input.templateSummaries
    .map(
      (summary) => `
      <article class="summary-card">
        <h3>${escapeHtml(summary.templateLabel)}</h3>
        <p><strong>Verdict:</strong> ${escapeHtml(summary.verdict)}</p>
        <p><strong>Action:</strong> ${escapeHtml(summary.action)}</p>
        <p><strong>Avg structural / visual:</strong> ${summary.avgEffectiveScore} / ${summary.avgVisualScore}</p>
        <p><strong>Status counts:</strong> valid ${summary.validCount}, degraded ${summary.degradedCount}, invalid ${summary.invalidCount}</p>
        <p><strong>Runtime wins:</strong> ${summary.runtimeWinCount} | <strong>Forced best:</strong> ${summary.forcedTopRankCount}</p>
        <p><strong>Strongest scenario:</strong> ${escapeHtml(summary.strongestScenario)}</p>
        <p><strong>Weakest scenario:</strong> ${escapeHtml(summary.weakestScenario)}</p>
        <p><strong>Top failure modes:</strong> ${escapeHtml(summary.topFailureModes.join(' | ') || 'none')}</p>
      </article>
    `
    )
    .join('\n')

  const caseSections = input.caseReports
    .map((caseReport) => {
      const cards = caseReport.forcedEvaluations
        .map(
          (evaluation) => `
          <article class="variant-card ${evaluation.runtimeWinner ? 'winner' : ''}">
            <img src="./${escapeHtml(evaluation.previewArtifact)}" alt="${escapeHtml(`${caseReport.id}-${evaluation.templateId}`)}" />
            <div class="meta">
              <h4>${escapeHtml(evaluation.templateLabel)}</h4>
              <p><strong>Selector:</strong> ${evaluation.selectedBySelector ? 'selected primary' : 'not primary'} | <strong>Runtime rank:</strong> ${evaluation.runtimeRank || 'not included'}</p>
              <p><strong>Structural / visual:</strong> ${escapeHtml(evaluation.structuralStatus)} ${evaluation.effectiveScore} / ${evaluation.visualScore} ${escapeHtml(evaluation.visualBand)}</p>
              <p><strong>Warnings:</strong> ${escapeHtml(evaluation.warnings.slice(0, 2).join(' | ') || 'none')}</p>
              <p><strong>Failure modes:</strong> ${escapeHtml(evaluation.failureModes.join(' | ') || 'none')}</p>
              <p><strong>Geometry:</strong> image ${escapeHtml(evaluation.geometry.image)} | title ${escapeHtml(evaluation.geometry.title)} | cta ${escapeHtml(evaluation.geometry.cta)}</p>
              <p>${escapeHtml(evaluation.productSummary)}</p>
            </div>
          </article>
        `
        )
        .join('\n')

      return `
        <section class="case-section">
          <h2>${escapeHtml(caseReport.label)}</h2>
          <p><strong>Selector winner:</strong> ${escapeHtml(caseReport.selector.selectedTemplateId)} | <strong>Runtime winner:</strong> ${escapeHtml(caseReport.runtimeWinnerTemplateId)} | <strong>Forced best:</strong> ${escapeHtml(caseReport.forcedBestTemplateId)}</p>
          <p><strong>Runtime candidates:</strong> ${escapeHtml(caseReport.runtimeCandidates.map((candidate) => `${candidate.rank}.${candidate.templateId}`).join(', '))}</p>
          <div class="grid">${cards}</div>
        </section>
      `
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Marketplace-card Template Quality Audit</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
    a { color: #93c5fd; }
    .summary-grid, .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
    .summary-card, .variant-card { background: #111827; border: 1px solid #334155; border-radius: 16px; overflow: hidden; }
    .winner { border-color: #60a5fa; box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4); }
    img { display: block; width: 100%; height: auto; background: #020617; }
    .meta { padding: 14px 16px 18px; }
    h1, h2, h3, h4 { margin: 0 0 10px; }
    p { margin: 6px 0; font-size: 14px; line-height: 1.4; }
    .case-section { margin-top: 28px; }
  </style>
</head>
<body>
  <h1>Marketplace-card Template Quality Audit</h1>
  <p>JSON report: <a href="./report.json">report.json</a></p>
  <p><strong>Strongest no-image:</strong> ${escapeHtml(input.summary.strongestNoImageTemplate)} (${escapeHtml(input.summary.strongestNoImageCase)})</p>
  <p><strong>Strongest image-backed:</strong> ${escapeHtml(input.summary.strongestImageBackedTemplate)} (${escapeHtml(input.summary.strongestImageBackedCase)})</p>
  <p><strong>Weakest current template:</strong> ${escapeHtml(input.summary.weakestTemplate)} (${escapeHtml(input.summary.weakestCase)})</p>
  <p><strong>Recurring failure modes:</strong> ${escapeHtml(input.summary.recurringFailureModes.map((entry) => `${entry.failureMode} (${entry.count})`).join(' | '))}</p>
  <section>
    <h2>Per-template verdicts</h2>
    <div class="summary-grid">${templateCards}</div>
  </section>
  ${caseSections}
</body>
</html>`
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const brandKit = createBrandKit()
  const caseReports: AuditCaseReport[] = []

  for (const definition of AUDIT_CASES) {
    const { master, assetHint } = createCaseProject(definition)
    const profile = profileContent(master)
    const scenario = classifyScenario({
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      imageProfile: assetHint?.imageProfile,
    })
    const selector = selectMarketplaceCardTemplate({
      format: FORMAT_MAP[formatKey],
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint,
      imageProfile: assetHint?.imageProfile,
      hasLogo: Boolean(master.logo?.w && master.logo?.h),
    })
    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey,
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint,
    })
    const runtimeCandidates = diagnostics.allCandidates.map((candidate, index) => ({
      rank: index + 1,
      templateId: candidate.intent.marketplaceTemplateId || 'n/a',
      strategyLabel: candidate.strategyLabel,
      structuralStatus: candidate.structuralStatus,
      effectiveScore: round(candidate.scoreTrust.effectiveScore),
      visualScore: round(candidate.assessment.visual?.overallScore || 0),
      visualBand: candidate.assessment.visual?.band || 'poor',
      issues: candidate.assessment.issues.map((issue) => issue.code).slice(0, 4),
    }))

    const forcedEvaluations = getMarketplaceCardTemplates().map((template) =>
      evaluateTemplate({
        master,
        brandKit,
        profile,
        scenario,
        assetHint,
        selection: selector,
        templateId: template.id,
        caseId: definition.id,
        caseLabel: definition.label,
        runtimeCandidates,
      })
    )

    const forcedBestTemplate = [...forcedEvaluations].sort(compareEvaluations)[0]

    for (const evaluation of forcedEvaluations) {
      const synthesized = synthesizeTemplateScene({
        master,
        brandKit,
        profile,
        scenario,
        assetHint,
        selection: selector,
        templateId: evaluation.templateId,
      })
      await writeFile(path.join(outDir, evaluation.previewArtifact), renderSceneSvg(synthesized.scene), 'utf8')
    }

    caseReports.push({
      id: definition.id,
      label: definition.label,
      imageProfile: definition.imageProfile,
      selector,
      runtimeWinnerTemplateId: diagnostics.selectedCandidate.intent.marketplaceTemplateId || 'n/a',
      runtimeCandidates,
      forcedBestTemplateId: forcedBestTemplate.templateId,
      forcedEvaluations,
    })
  }

  const templateSummaries = aggregateTemplateFindings(caseReports)
  const summary = buildSummary(caseReports)
  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'marketplace-card template quality audit',
    cases: caseReports,
    templates: templateSummaries,
    summary,
  }

  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  await writeFile(path.join(outDir, 'index.html'), buildHtmlReport({ caseReports, templateSummaries, summary }), 'utf8')

  console.log('# Marketplace-card Template Quality Audit')
  console.log(`outDir=${outDir}`)
  console.table(
    templateSummaries.map((summaryEntry) => ({
      template: summaryEntry.templateId,
      verdict: summaryEntry.verdict,
      action: summaryEntry.action,
      avgEffective: summaryEntry.avgEffectiveScore,
      avgVisual: summaryEntry.avgVisualScore,
      valid: summaryEntry.validCount,
      degraded: summaryEntry.degradedCount,
      invalid: summaryEntry.invalidCount,
      runtimeWins: summaryEntry.runtimeWinCount,
      forcedBest: summaryEntry.forcedTopRankCount,
      topFailureModes: summaryEntry.topFailureModes.join(', ') || 'none',
    }))
  )
  console.log('strongestNoImage=', summary.strongestNoImageTemplate, 'case=', summary.strongestNoImageCase)
  console.log('strongestImageBacked=', summary.strongestImageBackedTemplate, 'case=', summary.strongestImageBackedCase)
  console.log('weakestTemplate=', summary.weakestTemplate, 'case=', summary.weakestCase)
  console.log(
    'recurringFailureModes=',
    summary.recurringFailureModes.map((entry) => `${entry.failureMode}:${entry.count}`).join(', ')
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
