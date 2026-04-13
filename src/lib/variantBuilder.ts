// Auto-split from autoAdapt.ts — do not edit logic here directly.

import { CHANNEL_FORMATS, FORMAT_MAP } from './presets'
import {
  adaptBadgeAndImageToParent,
  adaptCtaToParent,
  adaptElementsToBrandKit,
  adaptTextAndLogoToParent,
} from './elementAdaptor'
import { computePalette } from './colorEngine'
import { profileContent } from './contentProfile'
import { chooseLayoutIntent, classifyScenario, resolveArchetype } from './scenarioClassifier'
import { evaluateLayout } from './layoutEvaluator'
import { evaluateStructuralLayoutState, synthesizeLayout } from './layoutEngine'
import { applyV1LayoutGeometryAfterV2, synthesizeLayoutV2 } from './layoutEngineV2'
import { computeTypography } from './typographyEngine'
import { computeScoreTrust, getFormatAssessment } from './validation'
import { runAutoFix } from './repairOrchestrator'
import {
  LAYOUT_ENGINE_V2_ENABLED,
  clampMarketplaceSceneReadability,
  finalizePrimarySelectedOutcomeSync,
  selectBestPreviewCandidate,
} from './autoAdapt'
import type {
  AssetHint,
  BrandKit,
  FormatKey,
  LayoutArchetypeId,
  LayoutEvaluation,
  Project,
  Scene,
  Variant,
  VariantManualOverride,
  VisualSystemKey,
} from './types'

export function buildDeterministicVariant({
  master,
  formatKey,
  visualSystem,
  brandKit,
  goal,
  assetHint,
  manualOverrides,
}: {
  master: Scene
  formatKey: FormatKey
  visualSystem: VisualSystemKey
  brandKit: BrandKit
  goal: Project['goal']
  assetHint?: AssetHint
  manualOverrides?: VariantManualOverride
}): {
  scene: Scene
  archetypeResolution: NonNullable<Variant['archetypeResolution']>
  layoutEvaluation: LayoutEvaluation
} {
  const format = FORMAT_MAP[formatKey]
  const contentProfile = profileContent(master)
  const scenario = classifyScenario({
    profile: contentProfile,
    goal,
    visualSystem,
    imageProfile: assetHint?.imageProfile,
  })
  const intent = chooseLayoutIntent({
    format,
    master,
    profile: contentProfile,
    imageAnalysis: assetHint?.enhancedImage,
    visualSystem,
    goal,
    assetHint,
  })

  const applyDeterministicPostLayout = (base: Scene): Scene => {
    let out = adaptElementsToBrandKit(base, brandKit)
    const ctaManualOverride = manualOverrides?.blocks?.cta
    out = adaptCtaToParent(out, assetHint?.enhancedImage, brandKit, ctaManualOverride, formatKey)
    if (assetHint?.enhancedImage) {
      const blocks = manualOverrides?.blocks
      out = adaptTextAndLogoToParent(out, assetHint.enhancedImage, brandKit, {
        title: blocks?.title ?? blocks?.headline,
        subtitle: blocks?.subtitle,
        logo: blocks?.logo,
      }, formatKey)
      out = adaptBadgeAndImageToParent(out, assetHint.enhancedImage, brandKit, {
        badge: blocks?.badge,
        image: blocks?.image,
      }, formatKey)
    }
    return clampMarketplaceSceneReadability(out, formatKey)
  }

  const tryArchetypeFallbackOnce = (
    sceneForEval: Scene,
  ): {
    scene: Scene
    resolution: NonNullable<Variant['archetypeResolution']>
    evaluation: LayoutEvaluation
  } => {
    const initialResolution = resolveArchetype({
      format,
      master,
      profile: contentProfile,
      imageAnalysis: assetHint?.enhancedImage,
      visualSystem,
      goal,
      assetHint,
    })

    const finish = (
      scene: Scene,
      fallbackApplied: boolean,
      evaluation: LayoutEvaluation,
    ): {
      scene: Scene
      resolution: NonNullable<Variant['archetypeResolution']>
      evaluation: LayoutEvaluation
    } => {
      const effectiveArchetypeId: LayoutArchetypeId =
        fallbackApplied && initialResolution.fallback
          ? initialResolution.fallback
          : initialResolution.archetypeId
      return {
        scene,
        resolution: {
          ...initialResolution,
          fallbackApplied,
          effectiveArchetypeId,
        },
        evaluation,
      }
    }

    try {
      function executeFallback(
        fallbackArchetypeId: LayoutArchetypeId,
        baselineOverallScore: number,
      ): Scene | null {
        const fallbackIntent = chooseLayoutIntent({
          format,
          master,
          profile: contentProfile,
          imageAnalysis: assetHint?.enhancedImage,
          visualSystem,
          goal,
          assetHint,
          forcedStructuralArchetype: fallbackArchetypeId,
        })
        const palette = computePalette({
          brandKit,
          visualSystem,
          scenario,
          imageDominantColors: assetHint?.enhancedImage?.dominantColors,
        })
        const typography = computeTypography({
          format,
          profile: contentProfile,
          scenario,
          visualSystem,
          brandKit,
          intent: fallbackIntent,
          headlineText: master.title.text,
          subtitleText: master.subtitle.text,
          fixStage: 'base',
        })
        const { scene: rawFallback } = synthesizeLayout({
          master,
          format,
          profile: contentProfile,
          palette,
          typography,
          intent: fallbackIntent,
          brandKit,
          assetHint,
          imageAnalysis: assetHint?.enhancedImage,
        })
        const fallbackAdapted = applyDeterministicPostLayout(rawFallback)
        const fallbackEval = evaluateLayout(fallbackAdapted, format, assetHint?.enhancedImage)
        if (fallbackEval.overallScore > baselineOverallScore) {
          return fallbackAdapted
        }
        return null
      }

      const _evaluation = evaluateLayout(sceneForEval, format, assetHint?.enhancedImage)

      if (
        initialResolution.confidence < 0.65 &&
        initialResolution.fallback
      ) {
        const proactiveScene = executeFallback(
          initialResolution.fallback,
          _evaluation.overallScore,
        )
        if (proactiveScene) {
          const proactiveEval = evaluateLayout(proactiveScene, format, assetHint?.enhancedImage)
          console.info('[ArchetypeGate] Low confidence, proactive archetype switch', {
            confidence: initialResolution.confidence,
            breakdown: initialResolution.confidenceBreakdown,
            from: initialResolution.archetypeId,
            to: initialResolution.fallback,
          })
          console.info('[ArchetypeGate] Accepted fallback archetype', {
            archetypeId: initialResolution.fallback,
            score: proactiveEval.overallScore,
          })
          return finish(proactiveScene, true, proactiveEval)
        }
      }

      if (!_evaluation.structuralValidity || _evaluation.overallScore < 0.6) {
        console.warn('[ArchetypeGate] Switching archetype', {
          from: initialResolution.archetypeId,
          to: initialResolution.fallback,
          score: _evaluation.overallScore,
          issues: _evaluation.issues,
          formatId: format.key,
        })

        if (initialResolution.fallback) {
          const reactiveScene = executeFallback(
            initialResolution.fallback,
            _evaluation.overallScore,
          )
          if (reactiveScene) {
            const reactiveEval = evaluateLayout(reactiveScene, format, assetHint?.enhancedImage)
            console.info('[ArchetypeGate] Accepted fallback archetype', {
              archetypeId: initialResolution.fallback,
              score: reactiveEval.overallScore,
            })
            return finish(reactiveScene, true, reactiveEval)
          }
          console.warn('[ArchetypeGate] Fallback did not improve score, keeping original')
        }
      }
      return finish(sceneForEval, false, _evaluation)
    } catch (_gateErr) {
      console.warn('[ArchetypeGate] Evaluation error (non-fatal):', _gateErr)
      return finish(sceneForEval, false, evaluateLayout(sceneForEval, format, assetHint?.enhancedImage))
    }
  }

  if (LAYOUT_ENGINE_V2_ENABLED) {
    try {
      const v2Result = synthesizeLayoutV2({
        master,
        format: FORMAT_MAP[formatKey],
        profile: contentProfile,
        brandKit,
        imageAnalysis: assetHint?.enhancedImage,
        visualSystem,
      })

      if (v2Result.constraintViolations.length <= 3) {
        const fmt = FORMAT_MAP[formatKey]
        let v2Scene = applyV1LayoutGeometryAfterV2(v2Result.scene, fmt, assetHint?.enhancedImage)

        const v2State = evaluateStructuralLayoutState({ scene: v2Scene, format: fmt, compositionModel: null })

        if (v2State.status === 'valid' || v2State.status === 'degraded') {
          v2Scene = adaptElementsToBrandKit(v2Scene, brandKit)
          v2Scene = adaptCtaToParent(v2Scene, assetHint?.enhancedImage, brandKit, undefined, formatKey)
          if (assetHint?.enhancedImage) {
            v2Scene = adaptTextAndLogoToParent(v2Scene, assetHint.enhancedImage, brandKit, undefined, formatKey)
            v2Scene = adaptBadgeAndImageToParent(v2Scene, assetHint.enhancedImage, brandKit, undefined, formatKey)
          }
          v2Scene = clampMarketplaceSceneReadability(v2Scene, formatKey)
          const v2Gate = tryArchetypeFallbackOnce(v2Scene)

          return {
            scene: v2Gate.scene,
            archetypeResolution: v2Gate.resolution,
            layoutEvaluation: v2Gate.evaluation,
          }
        }
      }
    } catch (err) {
      console.warn('[V2] failed, falling back to V1:', err)
    }
  }

  const selection = selectBestPreviewCandidate({
    master,
    formatKey,
    profile: contentProfile,
    scenario,
    visualSystem,
    brandKit,
    assetHint,
    imageAnalysis: assetHint?.enhancedImage,
    baseIntent: intent,
    goal,
    baseFixStage: 'base',
    allowFamilyAlternatives: true,
    allowModelAlternatives: true,
  })
  const fixedScene = runAutoFix(
    selection.selected.scene,
    formatKey,
    selection.selected.assessment,
    assetHint?.enhancedImage,
    selection.selected.intent.compositionModelId,
    {
      master,
      profile: contentProfile,
      scenario,
      visualSystem,
      brandKit,
      goal,
      assetHint,
      imageAnalysis: assetHint?.enhancedImage,
      baseIntent: intent,
    }
  )
  const fixedAssessment = getFormatAssessment(
    formatKey,
    fixedScene,
    selection.selected.intent.compositionModelId,
    assetHint?.enhancedImage
  )
  const fixedTrust = computeScoreTrust(fixedAssessment)
  const finalized = finalizePrimarySelectedOutcomeSync({
    formatKey,
    selection,
    currentScene: fixedScene,
    currentAssessment: fixedAssessment,
    currentScoreTrust: fixedTrust,
    imageAnalysis: assetHint?.enhancedImage,
    escalationContext: {
      master,
      profile: contentProfile,
      scenario,
      visualSystem,
      brandKit,
      goal,
      assetHint,
      imageAnalysis: assetHint?.enhancedImage,
      baseIntent: intent,
    },
  }).scene
  let scene = applyDeterministicPostLayout(finalized)
  const v1Gate = tryArchetypeFallbackOnce(scene)

  return {
    scene: v1Gate.scene,
    archetypeResolution: v1Gate.resolution,
    layoutEvaluation: v1Gate.evaluation,
  }
}

export function buildVariant(
  project: Pick<Project, 'master' | 'visualSystem' | 'brandKit' | 'assetHint' | 'goal' | 'manualOverrides'>,
  formatKey: FormatKey
) {
  return buildDeterministicVariant({
    master: project.master,
    formatKey,
    visualSystem: project.visualSystem,
    brandKit: project.brandKit,
    goal: project.goal,
    assetHint: project.assetHint,
    manualOverrides: project.manualOverrides?.[formatKey],
  })
}

export function buildFormatRecord(project: Pick<Project, 'master' | 'visualSystem' | 'brandKit' | 'assetHint' | 'goal' | 'manualOverrides'>): {
  formats: Record<FormatKey, Scene>
  archetypeResolutionByFormat: Partial<Record<FormatKey, NonNullable<Variant['archetypeResolution']>>>
  layoutEvaluationByFormat: Partial<Record<FormatKey, LayoutEvaluation>>
} {
  const pairs = CHANNEL_FORMATS.map((format) => {
    const built = buildVariant(project, format.key)
    return [format.key, built] as const
  })
  return {
    formats: Object.fromEntries(pairs.map(([k, v]) => [k, v.scene])) as Record<FormatKey, Scene>,
    archetypeResolutionByFormat: Object.fromEntries(pairs.map(([k, v]) => [k, v.archetypeResolution])) as Partial<
      Record<FormatKey, NonNullable<Variant['archetypeResolution']>>
    >,
    layoutEvaluationByFormat: Object.fromEntries(pairs.map(([k, v]) => [k, v.layoutEvaluation])) as Partial<
      Record<FormatKey, LayoutEvaluation>
    >,
  }
}
