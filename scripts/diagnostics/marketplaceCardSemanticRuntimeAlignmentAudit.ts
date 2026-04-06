import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildProject, getPreviewCandidateDiagnostics } from '../../src/lib/autoAdapt'
import { computePalette } from '../../src/lib/colorEngine'
import { profileContent } from '../../src/lib/contentProfile'
import {
  classifyMarketplaceCardSemanticRuntimeAlignment,
  type MarketplaceCardRuntimeCandidateSnapshot,
} from '../../src/lib/marketplaceCardAlignmentAudit'
import { getMarketplaceTemplateZoneTrace, getSynthesisStageDiagnostics } from '../../src/lib/layoutEngine'
import { BRAND_TEMPLATES, FORMAT_MAP } from '../../src/lib/presets'
import { classifyScenario } from '../../src/lib/scenarioClassifier'
import { explainMarketplaceCardTemplateSelection } from '../../src/lib/templateSelection'
import { computeTypography } from '../../src/lib/typographyEngine'
import type {
  AssetHint,
  BrandKit,
  ContentProfile,
  FormatKey,
  ImageProfile,
  PreviewCandidateDiagnostics,
  Project,
  Scene,
} from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'
process.env.REPAIR_DEBUG = '0'

const formatKey: FormatKey = 'marketplace-card'
const outDir = path.join(process.cwd(), 'artifacts', 'marketplace-card-semantic-runtime-alignment-audit', 'v1')

type AuditCaseDefinition = {
  id: string
  label: string
  imageProfile?: ImageProfile
  mutate?: (scene: Scene) => Scene
}

function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene
}

function createBrandKit(): BrandKit {
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

function mutateNoImageCompactPrice(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Save 30% today'
  next.subtitle.text = 'Limited deal on everyday essentials.'
  next.cta.text = 'Claim now'
  next.badge.text = '30% off'
  return next
}

function mutateNoImageTrustDense(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Trusted results backed by verified reviews'
  next.subtitle.text =
    'Top-rated quality with reviewer feedback, reliable performance, and guarantee coverage for buyers who need proof before they shop.'
  next.cta.text = 'Learn more'
  next.badge.text = 'Verified'
  return next
}

function mutateImageProduct(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'New insulated bottle for daily hydration'
  next.subtitle.text = 'Leakproof product design with lightweight steel body and easy everyday carry.'
  next.cta.text = 'Buy now'
  next.badge.text = 'New'
  return next
}

function mutateImageBenefit(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Feel lighter and move easier every day'
  next.subtitle.text = 'Comfort-led upgrade with simple routine benefits and fast everyday payoff.'
  next.cta.text = 'Shop now'
  next.badge.text = ''
  return next
}

function mutateImageTrust(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Verified quality with 5-star customer support'
  next.subtitle.text = 'Trusted performance, strong ratings, and guarantee-backed confidence.'
  next.cta.text = 'Learn more'
  next.badge.text = 'Top rated'
  return next
}

function mutateCatalog(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Browse the full spring catalog'
  next.subtitle.text = 'Explore styles, variants, and sizes across the latest assortment.'
  next.cta.text = 'Browse all'
  next.badge.text = 'Collection'
  return next
}

function mutateUrgency(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Today only: limited stock offer'
  next.subtitle.text = 'Hurry now before the drop ends tonight.'
  next.cta.text = 'Claim now'
  next.badge.text = 'Ends today'
  return next
}

function mutateComparison(scene: Scene) {
  const next = cloneScene(scene)
  next.title.text = 'Compare the new serum vs your old routine'
  next.subtitle.text = 'See better hydration, smoother texture, and side-by-side product improvement.'
  next.cta.text = 'Learn more'
  next.badge.text = 'Compare'
  return next
}

const AUDIT_CASES: AuditCaseDefinition[] = [
  { id: 'no-image-benefit-balanced', label: 'No-image balanced benefit-led' },
  { id: 'no-image-price-compact', label: 'No-image compact price-led', mutate: mutateNoImageCompactPrice },
  { id: 'no-image-trust-dense', label: 'Dense no-image trust/proof-heavy', mutate: mutateNoImageTrustDense },
  { id: 'image-product-led', label: 'Image-backed product-led', imageProfile: 'landscape', mutate: mutateImageProduct },
  { id: 'image-benefit-led', label: 'Image-backed benefit-led', imageProfile: 'square', mutate: mutateImageBenefit },
  { id: 'image-trust-led', label: 'Image-backed trust-led', imageProfile: 'square', mutate: mutateImageTrust },
  { id: 'image-catalog-led', label: 'Catalog-led image-backed', imageProfile: 'square', mutate: mutateCatalog },
  { id: 'no-image-urgency-led', label: 'No-image urgency-led', mutate: mutateUrgency },
  { id: 'image-comparison-led', label: 'Image-backed comparison-led', imageProfile: 'square', mutate: mutateComparison },
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

function toRuntimeSnapshot(diagnostics: PreviewCandidateDiagnostics): MarketplaceCardRuntimeCandidateSnapshot[] {
  return diagnostics.allCandidates.map((candidate) => ({
    templateId: candidate.intent.marketplaceTemplateId || 'n/a',
    strategyLabel: candidate.strategyLabel,
    structuralStatus: candidate.structuralStatus,
    effectiveScore: candidate.scoreTrust.effectiveScore,
    visualScore: candidate.assessment.visual?.overallScore || 0,
    visualBand: candidate.assessment.visual?.band || 'poor',
    highStructuralFindingCount: candidate.highStructuralFindingCount,
    criticalIssueCount: candidate.criticalIssueCount,
    highIssueCount: candidate.highIssueCount,
    issueCount: candidate.issueCount,
  }))
}

function detailedRuntimeCandidates(diagnostics: PreviewCandidateDiagnostics) {
  return diagnostics.allCandidates.map((candidate, index) => ({
    rank: index + 1,
    candidateId: candidate.id,
    strategyLabel: candidate.strategyLabel,
    templateId: candidate.intent.marketplaceTemplateId || 'n/a',
    templateVariant: candidate.intent.marketplaceTemplateVariant || 'base',
    structuralStatus: candidate.structuralStatus,
    effectiveScore: candidate.scoreTrust.effectiveScore,
    visualScore: candidate.assessment.visual?.overallScore || 0,
    visualBand: candidate.assessment.visual?.band || 'poor',
    highStructuralFindingCount: candidate.highStructuralFindingCount,
    criticalIssueCount: candidate.criticalIssueCount,
    highIssueCount: candidate.highIssueCount,
    issueCount: candidate.issueCount,
    scoreTrust: {
      deterministicScore: candidate.scoreTrust.deterministicScore,
      aiReviewScore: candidate.scoreTrust.aiReviewScore,
      disagreement: candidate.scoreTrust.disagreement,
      effectiveScore: candidate.scoreTrust.effectiveScore,
    },
    commercialScore: candidate.commercialPreference?.score || 0,
    commercialConfidence: candidate.commercialPreference?.confidence || 'weak',
    commercialReasons: candidate.commercialPreference?.reasons || [],
    perceptual: candidate.perceptualSignals
      ? {
          hasClearPrimary: candidate.perceptualSignals.hasClearPrimary,
          primaryElement: candidate.perceptualSignals.primaryElement,
          clusterCohesion: candidate.perceptualSignals.clusterCohesion,
          ctaIntegration: candidate.perceptualSignals.ctaIntegration,
          visualBalance: candidate.perceptualSignals.visualBalance,
          deadSpaceScore: candidate.perceptualSignals.deadSpaceScore,
          imageDominance: candidate.perceptualSignals.imageDominance,
          textDominance: candidate.perceptualSignals.textDominance,
          readingFlowClarity: candidate.perceptualSignals.readingFlowClarity,
        }
      : undefined,
    perceptualPreference: candidate.perceptualPreference
      ? {
          score: candidate.perceptualPreference.score,
          reasons: candidate.perceptualPreference.reasons,
        }
      : undefined,
    perceptualAdjustment: candidate.perceptualAdjustment
      ? {
          applied: candidate.perceptualAdjustment.applied,
          blockedBy: candidate.perceptualAdjustment.blockedBy,
          triggers: candidate.perceptualAdjustment.triggers,
          adjustments: candidate.perceptualAdjustment.adjustments,
          perAdjustments: candidate.perceptualAdjustment.perAdjustments?.map((entry) => ({
            id: entry.id,
            applied: entry.applied,
            delta: entry.delta,
            introducedIssues: entry.introducedIssues,
            effectiveRect: entry.effectiveRect,
          })),
          acceptedBy: candidate.perceptualAdjustment.acceptedBy,
          gainSummary: candidate.perceptualAdjustment.gainSummary,
          originalSignals: candidate.perceptualAdjustment.originalSignals,
          adjustedSignals: candidate.perceptualAdjustment.adjustedSignals,
          originalStructuralStatus: candidate.perceptualAdjustment.originalStructuralStatus,
          adjustedStructuralStatus: candidate.perceptualAdjustment.adjustedStructuralStatus,
          originalEffectiveScore: candidate.perceptualAdjustment.originalEffectiveScore,
          adjustedEffectiveScore: candidate.perceptualAdjustment.adjustedEffectiveScore,
        }
      : undefined,
    evaluationAlignment: candidate.evaluationAlignment
      ? {
          applied: candidate.evaluationAlignment.applied,
          blockedBy: candidate.evaluationAlignment.blockedBy,
          reasons: candidate.evaluationAlignment.reasons,
          originalStructuralStatus: candidate.evaluationAlignment.originalStructuralStatus,
          adjustedStructuralStatus: candidate.evaluationAlignment.adjustedStructuralStatus,
          originalEffectiveScore: candidate.evaluationAlignment.originalEffectiveScore,
          adjustedEffectiveScore: candidate.evaluationAlignment.adjustedEffectiveScore,
          scoreDelta: candidate.evaluationAlignment.scoreDelta,
          relaxedIssueCodes: candidate.evaluationAlignment.relaxedIssueCodes,
          relaxedFindingNames: candidate.evaluationAlignment.relaxedFindingNames,
        }
      : undefined,
    structuralMetrics: candidate.assessment.structuralState?.metrics,
    keyMetrics: candidate.assessment.metrics
      ? {
          textHierarchy: candidate.assessment.metrics.textHierarchy,
          spacingQuality: candidate.assessment.metrics.spacingQuality,
          ctaProminence: candidate.assessment.metrics.ctaProminence,
          imageTextHarmony: candidate.assessment.metrics.imageTextHarmony,
          negativeSpaceBalance: candidate.assessment.metrics.negativeSpaceBalance,
          clusterCohesion: candidate.assessment.metrics.clusterCohesion,
          scaleToCanvas: candidate.assessment.metrics.scaleToCanvas,
        }
      : undefined,
    ctaMetrics: candidate.assessment.layoutAnalysis?.blocks.cta?.metrics,
    textClusterMetrics: candidate.assessment.layoutAnalysis?.clusters.textCluster?.metrics,
    imageTextMetrics: candidate.assessment.layoutAnalysis?.clusters.imageText?.metrics,
    globalMetrics: candidate.assessment.layoutAnalysis?.global.metrics,
    issues: candidate.assessment.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
    })),
    topIssues: candidate.assessment.issues.slice(0, 3).map((issue) => issue.name),
    topFindings: (candidate.assessment.structuralState?.findings || []).slice(0, 3).map((finding) => finding.name),
    findings: (candidate.assessment.structuralState?.findings || []).map((finding) => ({
      name: finding.name,
      severity: finding.severity,
      metrics: finding.metrics,
      elements: finding.elements,
    })),
    geometry: {
      image: { x: candidate.scene.image.x, y: candidate.scene.image.y, w: candidate.scene.image.w, h: candidate.scene.image.h },
      title: { x: candidate.scene.title.x, y: candidate.scene.title.y, w: candidate.scene.title.w, h: candidate.scene.title.h },
      subtitle: { x: candidate.scene.subtitle.x, y: candidate.scene.subtitle.y, w: candidate.scene.subtitle.w, h: candidate.scene.subtitle.h },
      cta: { x: candidate.scene.cta.x, y: candidate.scene.cta.y, w: candidate.scene.cta.w, h: candidate.scene.cta.h },
    },
  }))
}

function summarizeProfile(profile: ContentProfile) {
  return {
    sellingAngle: profile.sellingAngle,
    action: profile.primaryConversionAction,
    offerStrength: profile.offerStrength,
    proof: profile.proofPresence,
    productVisualNeed: profile.productVisualNeed,
    compression: profile.messageCompressionNeed,
    density: profile.density,
  }
}

function topSemanticScores(explanation: ReturnType<typeof explainMarketplaceCardTemplateSelection>) {
  return (explanation.debug?.rankedTemplates || []).slice(0, 3).map((entry) => ({
    templateId: entry.templateId,
    score: entry.totalScore,
    reasons: entry.reasonCodes,
  }))
}

function topRuntimeCandidates(runtimeCandidates: MarketplaceCardRuntimeCandidateSnapshot[]) {
  return runtimeCandidates.slice(0, 3).map((candidate, index) => ({
    rank: index + 1,
    templateId: candidate.templateId,
    structuralStatus: candidate.structuralStatus,
    effectiveScore: candidate.effectiveScore,
    visualScore: candidate.visualScore,
    visualBand: candidate.visualBand,
  }))
}

function buildCandidateStageTrace(input: {
  master: Scene
  assetHint?: AssetHint
  brandKit: BrandKit
  profile: ContentProfile
  scenario: ReturnType<typeof classifyScenario>
  visualSystem: 'product-card'
  candidate: PreviewCandidateDiagnostics['allCandidates'][number]
}) {
  const palette = computePalette({
    brandKit: input.brandKit,
    visualSystem: input.visualSystem,
    scenario: input.scenario,
  })
  const typography = computeTypography({
    format: FORMAT_MAP[formatKey],
    profile: input.profile,
    scenario: input.scenario,
    visualSystem: input.visualSystem,
    brandKit: input.brandKit,
    intent: input.candidate.intent,
    headlineText: input.master.title.text,
    subtitleText: input.master.subtitle.text,
    fixStage: input.candidate.fixStage,
  })
  const synthesis = getSynthesisStageDiagnostics({
    master: input.master,
    format: FORMAT_MAP[formatKey],
    profile: input.profile,
    palette,
    typography,
    intent: input.candidate.intent,
    brandKit: input.brandKit,
    assetHint: input.assetHint,
    imageAnalysis: input.assetHint?.enhancedImage,
  })

  return synthesis.stages.map((stage) => ({
    stage: stage.stage,
    status: stage.structuralState.status,
    image: {
      x: stage.scene.image.x,
      y: stage.scene.image.y,
      w: stage.scene.image.w,
      h: stage.scene.image.h,
    },
    title: {
      x: stage.scene.title.x,
      y: stage.scene.title.y,
      w: stage.scene.title.w,
      h: stage.scene.title.h,
    },
    subtitle: {
      x: stage.scene.subtitle.x,
      y: stage.scene.subtitle.y,
      w: stage.scene.subtitle.w,
      h: stage.scene.subtitle.h,
    },
    cta: {
      x: stage.scene.cta.x,
      y: stage.scene.cta.y,
      w: stage.scene.cta.w,
      h: stage.scene.cta.h,
    },
        perceptualAdjustment: stage.perceptualAdjustment
          ? {
              applied: stage.perceptualAdjustment.applied,
              blockedBy: stage.perceptualAdjustment.blockedBy,
              triggers: stage.perceptualAdjustment.triggers,
              adjustments: stage.perceptualAdjustment.adjustments,
              perAdjustments: stage.perceptualAdjustment.perAdjustments?.map((entry) => ({
                id: entry.id,
                applied: entry.applied,
                delta: entry.delta,
                introducedIssues: entry.introducedIssues,
                effectiveRect: entry.effectiveRect,
              })),
              acceptedBy: stage.perceptualAdjustment.acceptedBy,
              gainSummary: stage.perceptualAdjustment.gainSummary,
              beforeSignals: stage.perceptualAdjustment.beforeSignals,
              afterSignals: stage.perceptualAdjustment.afterSignals,
        }
      : undefined,
  }))
}

function summarizeLateImageFlattening(input: {
  zoneTrace?: ReturnType<typeof getMarketplaceTemplateZoneTrace>
  intendedImage?: { x: number; y: number; w: number; h: number }
  stages: ReturnType<typeof buildCandidateStageTrace>
}) {
  if (!input.intendedImage || !input.stages.length) return 'no-template-zone-trace'

  const adaptedImage = input.zoneTrace?.adaptedZones.image
  if (
    adaptedImage &&
    (adaptedImage.w < input.intendedImage.w - 4 || adaptedImage.h < input.intendedImage.h - 8)
  ) {
    return `template->adapted shrink ${input.intendedImage.w}x${input.intendedImage.h} -> ${adaptedImage.w}x${adaptedImage.h}`
  }

  const byStage = input.stages
  let largestDrop: { from: string; to: string; areaDelta: number; fromW: number; fromH: number; toW: number; toH: number } | null = null

  for (let index = 1; index < byStage.length; index += 1) {
    const previous = byStage[index - 1]
    const current = byStage[index]
    const previousArea = (previous.image.w || 0) * (previous.image.h || 0)
    const currentArea = (current.image.w || 0) * (current.image.h || 0)
    const areaDelta = previousArea - currentArea
    if (areaDelta > 0 && (!largestDrop || areaDelta > largestDrop.areaDelta)) {
      largestDrop = {
        from: previous.stage,
        to: current.stage,
        areaDelta,
        fromW: previous.image.w || 0,
        fromH: previous.image.h || 0,
        toW: current.image.w || 0,
        toH: current.image.h || 0,
      }
    }
  }

  const finalStage = byStage[byStage.length - 1]
  if (!largestDrop) {
    return `image preserved near ${finalStage.image.w}x${finalStage.image.h} at ${finalStage.stage}`
  }

  return `largest image drop ${largestDrop.from}->${largestDrop.to}: ${largestDrop.fromW}x${largestDrop.fromH} -> ${largestDrop.toW}x${largestDrop.toH}`
}

async function main() {
  const brandKit = createBrandKit()
  const reports = AUDIT_CASES.map((definition) => {
    const { master, assetHint } = createCaseProject(definition)
    const profile = profileContent(master)
    const scenario = classifyScenario({
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      imageProfile: assetHint?.imageProfile,
    })
    const explanation = explainMarketplaceCardTemplateSelection({
      format: FORMAT_MAP[formatKey],
      profile,
      goal: 'promo-pack',
      visualSystem: 'product-card',
      assetHint,
    })
    const diagnostics = getPreviewCandidateDiagnostics({
      master,
      formatKey,
      visualSystem: 'product-card',
      brandKit,
      goal: 'promo-pack',
      assetHint,
    })
    const runtimeCandidates = toRuntimeSnapshot(diagnostics)
    const runtimeWinner = runtimeCandidates[0]
    const alignment = classifyMarketplaceCardSemanticRuntimeAlignment({
      selection: explanation,
      runtimeWinner,
      runtimeCandidates,
    })
    const semanticPrimaryCandidate =
      diagnostics.allCandidates.find((candidate) => candidate.intent.marketplaceTemplateId === explanation.selectedTemplateId) ||
      diagnostics.allCandidates[0]
    const runtimeWinnerCandidate = diagnostics.allCandidates[0]
    const semanticPrimaryStageTrace = semanticPrimaryCandidate
      ? buildCandidateStageTrace({
          master,
          assetHint,
          brandKit,
          profile,
          scenario,
          visualSystem: 'product-card',
          candidate: semanticPrimaryCandidate,
        })
      : []
    const semanticPrimaryZoneTrace = semanticPrimaryCandidate
      ? getMarketplaceTemplateZoneTrace({
          format: FORMAT_MAP[formatKey],
          profile,
          intent: semanticPrimaryCandidate.intent,
          brandKit,
          assetHint,
          imageAnalysis: assetHint?.enhancedImage,
        })
      : undefined
    const runtimeWinnerStageTrace = runtimeWinnerCandidate
      ? buildCandidateStageTrace({
          master,
          assetHint,
          brandKit,
          profile,
          scenario,
          visualSystem: 'product-card',
          candidate: runtimeWinnerCandidate,
        })
      : []

    return {
      id: definition.id,
      label: definition.label,
      scenario,
      profile: summarizeProfile(profile),
      semanticPrimaryTemplate: explanation.selectedTemplateId,
      semanticTopRankedTemplates: topSemanticScores(explanation),
      runtimeWinnerTemplate: runtimeWinner.templateId,
      runtimeTopCandidates: topRuntimeCandidates(runtimeCandidates),
      runtimeCandidateDetails: detailedRuntimeCandidates(diagnostics),
      rankingDiagnostics: diagnostics.rankingDiagnostics,
      semanticPrimaryStageTrace,
      semanticPrimaryZoneTrace,
      runtimeWinnerStageTrace,
      semanticPrimaryFlatteningSummary: summarizeLateImageFlattening({
        zoneTrace: semanticPrimaryZoneTrace,
        intendedImage: semanticPrimaryCandidate?.intent.marketplaceTemplateZones?.image,
        stages: semanticPrimaryStageTrace,
      }),
      alignment,
    }
  })

  const summary = reports.reduce(
    (acc, report) => {
      acc[report.alignment.status] += 1
      return acc
    },
    { aligned: 0, 'acceptable-drift': 0, 'suspicious-drift': 0 }
  )

  console.log('# Marketplace-card Semantic/Runtime Alignment Audit')
  console.table(
    reports.map((report) => ({
      caseId: report.id,
      commercial: `${report.profile.sellingAngle} / ${report.profile.offerStrength} / ${report.profile.productVisualNeed}`,
      semanticPrimary: report.semanticPrimaryTemplate,
      runtimeWinner: report.runtimeWinnerTemplate,
      topSemantic: report.semanticTopRankedTemplates
        .map((entry) => `${entry.templateId}:${entry.score}`)
        .join(', '),
      winnerSignal: report.runtimeTopCandidates[0]
        ? `${report.runtimeTopCandidates[0].structuralStatus} / ${report.runtimeTopCandidates[0].effectiveScore} / v${report.runtimeTopCandidates[0].visualScore}`
        : 'n/a',
      commercialDecision: report.rankingDiagnostics?.commercialDecision?.applied
        ? `${report.rankingDiagnostics.commercialDecision.preferredTemplateId}:${report.rankingDiagnostics.commercialDecision.commercialScoreDelta}`
        : report.rankingDiagnostics?.commercialDecision?.blockedBy || 'none',
      perceptualDecision: report.rankingDiagnostics?.perceptualDecision?.applied
        ? `${report.rankingDiagnostics.perceptualDecision.selectedTemplateId}:${report.rankingDiagnostics.perceptualDecision.perceptualScoreDelta}`
        : report.rankingDiagnostics?.perceptualDecision?.blockedBy || 'none',
      winnerPerceptual: report.runtimeCandidateDetails[0]?.perceptual
        ? `${report.runtimeCandidateDetails[0].perceptual.primaryElement}/${report.runtimeCandidateDetails[0].perceptual.clusterCohesion}/${report.runtimeCandidateDetails[0].perceptual.ctaIntegration}/${report.runtimeCandidateDetails[0].perceptual.deadSpaceScore}`
        : 'n/a',
      winnerAdjustment: report.runtimeCandidateDetails[0]?.perceptualAdjustment?.applied
        ? report.runtimeCandidateDetails[0].perceptualAdjustment.adjustments.join(', ')
        : report.runtimeCandidateDetails[0]?.perceptualAdjustment?.blockedBy || 'none',
      alignment: report.alignment.status,
      driftReasons: report.alignment.reasons.join(', ') || 'none',
    }))
  )

  console.log('\n# Alignment counts')
  console.table([summary])

  const tracedDrift = reports.filter(
    (report) =>
      report.id === 'image-product-led' ||
      report.id === 'image-catalog-led' ||
      report.id === 'image-comparison-led'
  )
  if (tracedDrift.length) {
    console.log('\n# Product-support stage traces')
    for (const report of tracedDrift) {
      console.log(`\n## ${report.id}`)
      console.log(`semantic=${report.semanticPrimaryTemplate} runtime=${report.runtimeWinnerTemplate}`)
      console.log(`flattening=${report.semanticPrimaryFlatteningSummary}`)
      console.log(`commercial=${report.rankingDiagnostics?.commercialDecision?.reason || 'n/a'}`)
      if (report.semanticPrimaryZoneTrace) {
        console.table([
          {
            stage: 'template-zone',
            imageBox: `${report.semanticPrimaryZoneTrace.templateZones?.image.w ?? 0}x${report.semanticPrimaryZoneTrace.templateZones?.image.h ?? 0}`,
            textBox: `${report.semanticPrimaryZoneTrace.templateZones?.text.w ?? 0}x${report.semanticPrimaryZoneTrace.templateZones?.text.h ?? 0}`,
            ctaBox: `${report.semanticPrimaryZoneTrace.templateZones?.cta.w ?? 0}x${report.semanticPrimaryZoneTrace.templateZones?.cta.h ?? 0}`,
          },
          {
            stage: 'adapted-zone',
            imageBox: `${report.semanticPrimaryZoneTrace.adaptedZones.image.w}x${report.semanticPrimaryZoneTrace.adaptedZones.image.h}`,
            textBox: `${report.semanticPrimaryZoneTrace.adaptedZones.text.w}x${report.semanticPrimaryZoneTrace.adaptedZones.text.h}`,
            ctaBox: `${report.semanticPrimaryZoneTrace.adaptedZones.cta.w}x${report.semanticPrimaryZoneTrace.adaptedZones.cta.h}`,
          },
          ...report.semanticPrimaryZoneTrace.zoneProfiles.map((zoneProfile) => ({
            stage: `zone-profile:${zoneProfile.id}`,
            imageBox: `${zoneProfile.image.w}x${zoneProfile.image.h}`,
            textBox: `${zoneProfile.text.w}x${zoneProfile.text.h}`,
            ctaBox: `${zoneProfile.cta.w}x${zoneProfile.cta.h}`,
          })),
        ])
      }
      console.table(
        report.semanticPrimaryStageTrace.map((stage) => ({
          stage: stage.stage,
          status: stage.status,
          imageBox: `${stage.image.x},${stage.image.y},${stage.image.w},${stage.image.h}`,
          titleBox: `${stage.title.x},${stage.title.y},${stage.title.w},${stage.title.h}`,
          subtitleBox: `${stage.subtitle.x},${stage.subtitle.y},${stage.subtitle.w},${stage.subtitle.h}`,
          ctaBox: `${stage.cta.x},${stage.cta.y},${stage.cta.w},${stage.cta.h}`,
        }))
      )
    }
  }

  const suspicious = reports.filter((report) => report.alignment.status === 'suspicious-drift')
  if (suspicious.length) {
    console.log('\n# Suspicious drift details')
    console.table(
      suspicious.map((report) => ({
        caseId: report.id,
        semanticPrimary: report.semanticPrimaryTemplate,
        runtimeWinner: report.runtimeWinnerTemplate,
        reasons: report.alignment.reasons.join(', '),
        summary: report.alignment.summary,
      }))
    )
    console.log('\n# Suspicious candidate details')
    for (const report of suspicious) {
      console.log(`\n## ${report.id}`)
      console.table(
        report.runtimeCandidateDetails.map((candidate) => ({
          rank: candidate.rank,
          template: `${candidate.templateId}:${candidate.templateVariant}`,
          strategy: candidate.strategyLabel,
          structuralStatus: candidate.structuralStatus,
          effectiveScore: candidate.effectiveScore,
          visualScore: candidate.visualScore,
          commercialScore: candidate.commercialScore,
          commercialConfidence: candidate.commercialConfidence,
          commercialReasons: candidate.commercialReasons.join(', ') || 'none',
          issues: candidate.topIssues.join(', ') || 'none',
          findings: candidate.topFindings.join(', ') || 'none',
          imageBox: `${candidate.geometry.image.x},${candidate.geometry.image.y},${candidate.geometry.image.w},${candidate.geometry.image.h}`,
          ctaBox: `${candidate.geometry.cta.x},${candidate.geometry.cta.y},${candidate.geometry.cta.w},${candidate.geometry.cta.h}`,
        }))
      )
    }
  }

  await mkdir(outDir, { recursive: true })
  await writeFile(
    path.join(outDir, 'report.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary,
        reports,
      },
      null,
      2
    ),
    'utf8'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
