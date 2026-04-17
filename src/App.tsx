import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArchiveRestore,
  ChevronDown,
  Download,
  FileJson,
  FolderOpen,
  Library,
  RefreshCcw,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Onboarding } from './components/Onboarding'
import { FilePicker } from './components/FilePicker'
import { CanvasPreview } from './components/CanvasPreview'
import { VariantInspector } from './components/VariantInspector'
import { ValidationSummary } from './components/ValidationSummary'
import { BrandEditor, ElementEditor } from './components/Controls'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  applyBrandTemplate,
  applyVariantManualOverride,
  buildProject,
  fixLayout,
  generateVariant,
  refreshProjectModel,
  regenerateFormats,
  setLayoutEngineV2,
} from './lib/autoAdapt'
import { analyzeBannerQuality, applyBannerQualityAutofixes, type BannerQualityResult } from './lib/bannerQualityAnalyzer'
import { analyzeAssetCharacteristics, getImageProfileLabel } from './lib/assetProfile'
import { aiAnalyzeImage, analyzeReferenceImage, getContrastingText, type ReferenceAnalysis } from './lib/imageAnalysis'
import { getFormatRuleSet } from './lib/formatRules'
import { BRAND_TEMPLATES, CHANNEL_FORMATS, DEMO_PROJECTS, FORMAT_MAP, GOAL_PRESETS, LAYOUT_PRESETS, UI_GOAL_PRESETS, VISUAL_SYSTEMS } from './lib/presets'
import { buildCreativeExportJSON } from './lib/creativeJsonExport'
import { loadTelemetry, recordExport, resetTelemetry } from './lib/sessionTelemetry'
import { localProjectRepository } from './lib/storage'
import { buildStructuralDiagnosticsSnapshot, createStructuralDiagnosticsSignature, logStructuralDiagnostics } from './lib/structuralDiagnostics'
import { getFormatAssessment } from './lib/validation'
import { getPrimaryPreviewFormats } from './lib/productScope'
import type {
  BrandTemplateKey,
  FormatKey,
  FixSessionState,
  FixResult,
  GoalKey,
  ImageProfile,
  LayoutDebugOptions,
  LayoutElementKind,
  LayoutIntent,
  LayoutIntentFamily,
  ManualBlockOverride,
  Project,
  SavedProject,
  SessionTelemetry,
  Scene,
  SelectedElement,
  TemplateKey,
  VariantManualOverride,
  VisualSystemKey,
} from './lib/types'

type EntryMode = 'compose' | 'reference' | 'brand-template'
type StatusTone = 'neutral' | 'success' | 'warning' | 'error'

const templates: TemplateKey[] = ['promo', 'product', 'article']
const selectedOptions: SelectedElement[] = ['title', 'subtitle', 'cta', 'badge', 'logo', 'image']

function createDefaultProject() {
  return buildProject('promo', {
    goal: 'promo-pack',
    visualSystem: 'product-card',
    brandKit: BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit,
  })
}

function getSuggestedDirections(imageProfile?: ImageProfile) {
  if (imageProfile === 'portrait' || imageProfile === 'tall') {
    return ['product-card', 'bold-promo', 'minimal', 'luxury-clean'] as VisualSystemKey[]
  }
  return ['product-card', 'bold-promo', 'minimal', 'editorial', 'luxury-clean'] as VisualSystemKey[]
}

function isProjectShape(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Boolean(candidate.template && candidate.goal && candidate.visualSystem && candidate.brandKit && candidate.master && candidate.formats)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]+/g, '')
}

/** Rotates structural layout families for "Try different layout" (0=text-stack, 1=image-hero, 2=split-style). */
function tryDifferentLayoutOverride(formatKey: FormatKey, rotationIndex: number): Partial<LayoutIntent> {
  const format = FORMAT_MAP[formatKey]
  const allowed = getFormatRuleSet(format).allowedLayoutFamilies
  const i = rotationIndex % 3

  const resolve = (preferred: [LayoutIntentFamily, LayoutIntentFamily, LayoutIntentFamily]): LayoutIntentFamily => {
    const raw = preferred[i]
    if (allowed.includes(raw)) return raw
    return allowed[i % allowed.length]
  }

  let family: LayoutIntentFamily
  if (allowed.length > 0 && allowed.every((f) => f.startsWith('presentation-'))) {
    family = resolve(['presentation-clean-hero', 'presentation-structured-cover', 'presentation-clean-hero'])
  } else switch (format.family) {
    case 'square':
      family = resolve(['square-image-top-text-bottom', 'square-hero-overlay', 'portrait-hero-overlay'])
      break
    case 'portrait':
      family = resolve(['portrait-bottom-card', 'portrait-hero-overlay', 'portrait-hero-overlay'])
      break
    case 'landscape':
      family = resolve(['landscape-text-left-image-right', 'landscape-image-dominant', 'landscape-balanced-split'])
      break
    case 'wide':
      family = resolve(['billboard-wide-balanced', 'billboard-wide-hero', 'billboard-wide-balanced'])
      break
    case 'skyscraper':
      family = resolve(['skyscraper-image-top-text-stack', 'skyscraper-split-vertical', 'skyscraper-image-top-text-stack'])
      break
    case 'printPortrait':
      family = resolve(['portrait-bottom-card', 'presentation-structured-cover', 'portrait-bottom-card'])
      break
    default:
      throw new Error(`Unhandled LayoutFamily: ${format.family}`)
  }

  return { family, presetId: family }
}

function applyReferenceToProject(current: Project, analysis: ReferenceAnalysis) {
  const next = structuredClone(current)
  next.brandKit.background = analysis.background
  next.brandKit.accentColor = analysis.accent
  next.brandKit.primaryColor = analysis.foreground
  next.master.background = analysis.background
  next.master.accent = analysis.accent
  next.master.title.fill = analysis.foreground
  next.master.subtitle.fill = analysis.foreground
  next.master.subtitle.opacity = analysis.mood === 'dark' ? 0.84 : 0.72
  next.master.cta.bg = analysis.accent
  next.master.cta.fill = getContrastingText(analysis.accent)
  next.master.badge.bg = analysis.accent
  next.master.badge.bgOpacity = 1
  next.master.badge.fill = getContrastingText(analysis.accent)
  next.master.logo.bg = analysis.foreground
  next.master.logo.bgOpacity = analysis.mood === 'dark' ? 0.14 : 0.08
  next.master.logo.fill = analysis.foreground
  return regenerateFormats(next)
}

function StatusBanner({ tone, text }: { tone: StatusTone; text: string }) {
  return <div className={`status-banner ${tone}`}>{text}</div>
}

const prepareExportFrame = (): Promise<void> =>
  document.fonts.ready.then(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
  )

export default function App() {
  const [entryMode, setEntryMode] = useState<EntryMode>('compose')
  const [template, setTemplate] = useState<TemplateKey>('promo')
  const [project, setProject] = useState<Project>(() => createDefaultProject())
  const [imageUrl, setImageUrl] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [referenceAnalysis, setReferenceAnalysis] = useState<ReferenceAnalysis | null>(null)
  const [selectedElement, setSelectedElement] = useState<SelectedElement>('title')
  const [editMode, setEditMode] = useState<'master' | FormatKey>('master')
  const [activeFormatKey, setActiveFormatKey] = useState<FormatKey>('marketplace-card')
  const [projectName, setProjectName] = useState('campaign-master')
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([])
  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null)
  const [selectedBrandTemplate, setSelectedBrandTemplate] = useState<BrandTemplateKey>('startup-blue')
  const [v2Enabled, setV2Enabled] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportingFormatKey, setExportingFormatKey] = useState<FormatKey | null>(null)
  const [fixingFormatKey, setFixingFormatKey] = useState<FormatKey | null>(null)
  const tryDifferentLayoutIndex = useRef<Record<FormatKey, number>>({} as Record<FormatKey, number>)
  const [fixResults, setFixResults] = useState<Partial<Record<FormatKey, FixResult>>>({})
  const [fixSessions, setFixSessions] = useState<Partial<Record<FormatKey, FixSessionState>>>({})
  const [bannerAiReviewByFormat, setBannerAiReviewByFormat] = useState<Partial<Record<FormatKey, BannerQualityResult>>>({})
  const [selectedBlockId, setSelectedBlockId] = useState<LayoutElementKind | null>(null)
  const [sessionTelemetry, setSessionTelemetry] = useState<SessionTelemetry | null>(() => loadTelemetry())
  const [layoutDebug, setLayoutDebug] = useState<LayoutDebugOptions>({
    showBoxes: false,
    showBoxLabels: true,
    showCollisions: true,
    showSafeArea: false,
  })
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: 'neutral',
    text: 'Build a marketplace adaptive pack: card and highlight outputs from one master.',
  })
  const [view, setView] = useState<'onboarding' | 'editor'>('onboarding')
  const [brandOpen, setBrandOpen] = useState(true)
  const [elementOpen, setElementOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [directionOpen, setDirectionOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'setup' | 'assets'>('setup')
  const [enabledElements, setEnabledElements] = useState<Record<string, boolean>>({
    title: true,
    subtitle: true,
    cta: true,
    badge: false,
    logo: true,
    image: true,
  })
  const [expandedElement, setExpandedElement] = useState<string | null>('title')

  const refs = useRef<Partial<Record<FormatKey, HTMLDivElement | null>>>({})
  const projectImportRef = useRef<HTMLInputElement | null>(null)

  const clearFixArtifacts = () => {
    setFixResults({})
    setFixSessions({})
    setBannerAiReviewByFormat({})
  }

  useEffect(() => {
    setSavedProjects(localProjectRepository.loadAll())
  }, [])

  useEffect(() => {
    if (UI_GOAL_PRESETS.some((g) => g.key === project.goal)) return
    setFixResults({})
    setFixSessions({})
    setBannerAiReviewByFormat({})
    setProject((prev) => regenerateFormats({ ...prev, goal: 'promo-pack' }))
  }, [project.goal])

  const currentGoalPreset = useMemo(() => GOAL_PRESETS.find((item) => item.key === project.goal), [project.goal])
  const previewFormats = useMemo(
    () => getPrimaryPreviewFormats(CHANNEL_FORMATS, currentGoalPreset),
    [currentGoalPreset]
  )
  const resolvedFormats = useMemo(
    () =>
      Object.fromEntries(
        CHANNEL_FORMATS.map((format) => [
          format.key,
          applyVariantManualOverride(project.formats[format.key], format.key, project.manualOverrides?.[format.key]),
        ])
      ) as Record<FormatKey, Scene>,
    [project.formats, project.manualOverrides]
  )
  const currentFormatKey = editMode === 'master' ? activeFormatKey : editMode
  const currentScene = editMode === 'master' ? project.master : resolvedFormats[editMode]
  const currentSavedProject = savedProjects.find((item) => item.id === currentSavedId) || null
  const suggestedDirections = useMemo(() => getSuggestedDirections(project.assetHint?.imageProfile), [project.assetHint?.imageProfile])
  const structuralLogSignatureRef = useRef('')
  const goalLabel = currentGoalPreset?.label || project.goal
  const visualSystemLabel = VISUAL_SYSTEMS.find((item) => item.key === project.visualSystem)?.label || project.visualSystem
  const imageProfileLabel = project.assetHint?.imageProfile ? getImageProfileLabel(project.assetHint.imageProfile) : 'Image not analyzed'

  const handleRegenerateAll = () => {
    clearFixArtifacts()
    setProject((prev) =>
      regenerateFormats({
        ...prev,
        rotationIndex: (prev.rotationIndex ?? 0) + 1,
      })
    )
  }

  const toggleElement = (key: string) => {
    setEnabledElements((prev) => {
      const nextValue = !prev[key]
      if (!nextValue && expandedElement === key) {
        setExpandedElement(null)
        setElementOpen(false)
      }
      return { ...prev, [key]: nextValue }
    })
  }

  const toggleExpand = (key: string) => {
    setExpandedElement((prev) => {
      const next = prev === key ? null : key
      setElementOpen(next !== null)
      return next
    })
    setSelectedElement(key as SelectedElement)
  }

  const assessments = useMemo(
    () =>
      Object.fromEntries(
        CHANNEL_FORMATS.map((format) => [
          format.key,
          getFormatAssessment(format.key, resolvedFormats[format.key], project.variants?.[format.key]?.compositionModelId, project.assetHint?.enhancedImage),
        ])
      ) as Record<FormatKey, ReturnType<typeof getFormatAssessment>>,
    [project.assetHint?.enhancedImage, project.variants, resolvedFormats]
  )
  const currentAssessment = assessments[currentFormatKey]
  const currentVariantOverride = editMode === 'master' ? undefined : project.manualOverrides?.[editMode]

  useEffect(() => {
    if (!import.meta.env.DEV) return

    const snapshot = buildStructuralDiagnosticsSnapshot(
      previewFormats.map((format) => ({
        format,
        assessment: assessments[format.key],
      }))
    )
    const signature = createStructuralDiagnosticsSignature(snapshot)
    if (!snapshot.overallRow.total || structuralLogSignatureRef.current === signature) return
    structuralLogSignatureRef.current = signature

    logStructuralDiagnostics(snapshot)
  }, [assessments, previewFormats])

  useEffect(() => {
    let cancelled = false

    if (!imageUrl || imageUrl.startsWith('data:application/pdf')) {
      setProject((prev) => {
        if (!prev.assetHint?.imageProfile) return prev
        return regenerateFormats({
          ...prev,
          assetHint: { ...(prev.assetHint || {}), imageProfile: undefined, enhancedImage: undefined },
        })
      })
      return () => {
        cancelled = true
      }
    }

    Promise.all([analyzeAssetCharacteristics(imageUrl), aiAnalyzeImage({ url: imageUrl })])
      .then(([analysis, enhancedImage]) => {
        if (cancelled) return
        setProject((prev) => {
          if (
            prev.assetHint?.imageProfile === analysis.imageProfile &&
            prev.assetHint?.detectedContrast === analysis.detectedContrast &&
            prev.assetHint?.focalSuggestion === analysis.focalSuggestion &&
            prev.assetHint?.enhancedImage?.focalPoint.x === enhancedImage.focalPoint.x &&
            prev.assetHint?.enhancedImage?.focalPoint.y === enhancedImage.focalPoint.y
          ) {
            return prev
          }
          return regenerateFormats({
            ...prev,
            assetHint: {
              ...(prev.assetHint || {}),
              imageProfile: analysis.imageProfile,
              detectedContrast: analysis.detectedContrast,
              focalSuggestion: analysis.focalSuggestion,
              enhancedImage,
            },
          })
        })
      })
      .catch((error) => {
        if (cancelled) return
        setStatus({ tone: 'warning', text: `Image analysis unavailable${error instanceof Error ? ': ' + error.message : ''}. Layouts will use default settings.` })
      })

    return () => {
      cancelled = true
    }
  }, [imageUrl])

  useEffect(() => {
    if (editMode === 'master') {
      setSelectedBlockId(null)
    }
  }, [editMode])

  const patchVariantOverride = (formatKey: FormatKey, blockId: LayoutElementKind, patch: Partial<ManualBlockOverride>) => {
    clearFixArtifacts()
    setProject((prev) => {
      const currentOverride = prev.manualOverrides?.[formatKey]
      const nextOverride: VariantManualOverride = {
        blocks: {
          ...(currentOverride?.blocks || {}),
          [blockId]: {
            ...(currentOverride?.blocks?.[blockId] || {}),
            ...patch,
          },
        },
        imageRolePreset: currentOverride?.imageRolePreset,
        selectedLayoutFamily: currentOverride?.selectedLayoutFamily,
        updatedAt: new Date().toISOString(),
      }
      return refreshProjectModel({
        ...prev,
        manualOverrides: {
          ...(prev.manualOverrides || {}),
          [formatKey]: nextOverride,
        },
      })
    })
  }

  const resetVariantBlock = (formatKey: FormatKey, blockId: LayoutElementKind) => {
    clearFixArtifacts()
    setProject((prev) => {
      const currentOverride = prev.manualOverrides?.[formatKey]
      if (!currentOverride) return prev
      const nextBlocks = { ...(currentOverride.blocks || {}) }
      delete nextBlocks[blockId]
      const nextOverride =
        Object.keys(nextBlocks).length || currentOverride.imageRolePreset || currentOverride.selectedLayoutFamily
          ? {
              ...currentOverride,
              blocks: nextBlocks,
              updatedAt: new Date().toISOString(),
            }
          : undefined
      const manualOverrides = { ...(prev.manualOverrides || {}) }
      if (nextOverride) manualOverrides[formatKey] = nextOverride
      else delete manualOverrides[formatKey]
      return refreshProjectModel({
        ...prev,
        manualOverrides,
      })
    })
  }

  const resetVariantOverride = (formatKey: FormatKey) => {
    clearFixArtifacts()
    setProject((prev) => {
      const manualOverrides = { ...(prev.manualOverrides || {}) }
      delete manualOverrides[formatKey]
      return refreshProjectModel({
        ...prev,
        manualOverrides,
      })
    })
  }

  const setVariantImageRole = (formatKey: FormatKey, role: VariantManualOverride['imageRolePreset']) => {
    clearFixArtifacts()
    setProject((prev) => {
      const currentOverride = prev.manualOverrides?.[formatKey]
      const nextOverride: VariantManualOverride = {
        blocks: currentOverride?.blocks || {},
        selectedLayoutFamily: currentOverride?.selectedLayoutFamily,
        imageRolePreset: role,
        updatedAt: new Date().toISOString(),
      }
      return refreshProjectModel({
        ...prev,
        manualOverrides: {
          ...(prev.manualOverrides || {}),
          [formatKey]: nextOverride,
        },
      })
    })
  }

  const handleTryDifferentLayout = async (formatKey: FormatKey) => {
    const nextIdx = ((tryDifferentLayoutIndex.current[formatKey] ?? -1) + 1) % 3
    tryDifferentLayoutIndex.current[formatKey] = nextIdx
    const overrideIntent = tryDifferentLayoutOverride(formatKey, nextIdx)
    setFixingFormatKey(formatKey)
    setBannerAiReviewByFormat((prev) => {
      const next = { ...prev }
      delete next[formatKey]
      return next
    })
    setStatus({ tone: 'neutral', text: `Trying a different layout for ${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey}...` })
    try {
      const mo = project.manualOverrides?.[formatKey]
      const outcome = await generateVariant({
        master: resolvedFormats[formatKey],
        formatKey,
        visualSystem: project.visualSystem,
        brandKit: project.brandKit,
        goal: project.goal,
        imageUrl,
        assetHint: project.assetHint,
        overrideIntent,
        fixStage: 'structural',
        ctaManualOverride: mo?.blocks?.cta,
        textLogoManualOverrides: {
          title: mo?.blocks?.title ?? mo?.blocks?.headline,
          subtitle: mo?.blocks?.subtitle,
          logo: mo?.blocks?.logo,
        },
        badgeImageManualOverrides: {
          badge: mo?.blocks?.badge,
          image: mo?.blocks?.image,
        },
      })
      setProject((prev) => {
        const manualOverrides = { ...(prev.manualOverrides || {}) }
        delete manualOverrides[formatKey]
        const variants = { ...(prev.variants || {}) }
        if (variants[formatKey]) {
          variants[formatKey] = {
            ...variants[formatKey],
            scene: outcome.scene,
            layoutIntentFamily: outcome.intent.family,
            compositionModelId: outcome.assessment.compositionModelId,
            updatedAt: new Date().toISOString(),
          }
        }
        return refreshProjectModel({
          ...prev,
          formats: {
            ...prev.formats,
            [formatKey]: outcome.scene,
          },
          variants,
          manualOverrides,
        })
      })
      setSelectedBlockId(null)
      setStatus({
        tone: 'success',
        text: `Applied alternate layout (${overrideIntent.family}) to ${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey}.`,
      })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to try a different layout.' })
    } finally {
      setFixingFormatKey(null)
    }
  }

  const applyLayoutFamilyOverride = async (formatKey: FormatKey, family: LayoutIntentFamily) => {
    setFixingFormatKey(formatKey)
    setStatus({ tone: 'neutral', text: `Rebuilding ${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey} with ${family}.` })
    try {
      const mo = project.manualOverrides?.[formatKey]
      const outcome = await generateVariant({
        master: resolvedFormats[formatKey],
        formatKey,
        visualSystem: project.visualSystem,
        brandKit: project.brandKit,
        goal: project.goal,
        imageUrl,
        assetHint: project.assetHint,
        overrideIntent: { family, presetId: family },
        fixStage: 'structural',
        ctaManualOverride: mo?.blocks?.cta,
        textLogoManualOverrides: {
          title: mo?.blocks?.title ?? mo?.blocks?.headline,
          subtitle: mo?.blocks?.subtitle,
          logo: mo?.blocks?.logo,
        },
        badgeImageManualOverrides: {
          badge: mo?.blocks?.badge,
          image: mo?.blocks?.image,
        },
      })
      setProject((prev) => {
        const manualOverrides = { ...(prev.manualOverrides || {}) }
        delete manualOverrides[formatKey]
        const variants = { ...(prev.variants || {}) }
        if (variants[formatKey]) {
          variants[formatKey] = {
            ...variants[formatKey],
            scene: outcome.scene,
            layoutIntentFamily: outcome.intent.family,
            compositionModelId: outcome.assessment.compositionModelId,
            updatedAt: new Date().toISOString(),
          }
        }
        return refreshProjectModel({
          ...prev,
          formats: {
            ...prev.formats,
            [formatKey]: outcome.scene,
          },
          variants,
          manualOverrides,
        })
      })
      setSelectedBlockId(null)
      setStatus({ tone: 'success', text: `Applied ${family} to ${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey}.` })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Failed to switch layout family.' })
    } finally {
      setFixingFormatKey(null)
    }
  }

  const updateElement = (key: SelectedElement, patch: Record<string, unknown>) => {
    setProject((prev) => {
      if (editMode === 'master') {
        return refreshProjectModel({ ...prev, master: { ...prev.master, [key]: { ...prev.master[key], ...patch } } })
      }
      return refreshProjectModel({ ...prev, formats: { ...prev.formats, [editMode]: { ...prev.formats[editMode], [key]: { ...prev.formats[editMode][key], ...patch } } } })
    })
  }

  const updateRoot = (patch: Record<string, unknown>) => {
    setProject((prev) => {
      if (editMode === 'master') return refreshProjectModel({ ...prev, master: { ...prev.master, ...patch } })
      return refreshProjectModel({ ...prev, formats: { ...prev.formats, [editMode]: { ...prev.formats[editMode], ...patch } } })
    })
  }

  const updateBrandKit = (patch: Partial<Project['brandKit']>) => {
    clearFixArtifacts()
    setProject((prev) => {
      const brandKit = { ...prev.brandKit, ...patch }
      const master: Scene = {
        ...prev.master,
        background: patch.background ? [...patch.background] : prev.master.background,
        accent: patch.accentColor || prev.master.accent,
        cta: {
          ...prev.master.cta,
          bg: patch.accentColor || prev.master.cta.bg,
          fill: patch.primaryColor || prev.master.cta.fill,
        },
      }
      return regenerateFormats({ ...prev, brandKit, master })
    })
  }

  const applyLayoutPreset = (id: string, formatKey: FormatKey) => {
    setProject((prev) => {
      const targetFormat = CHANNEL_FORMATS.find((item) => item.key === formatKey) || CHANNEL_FORMATS[0]
      const preset = LAYOUT_PRESETS[targetFormat.family].find((item) => item.id === id)
      if (!preset) return prev

      const scene = structuredClone(editMode === 'master' ? prev.master : prev.formats[editMode])
      for (const [key, patch] of Object.entries(preset.elements)) {
        const typedKey = key as keyof Pick<Scene, 'title' | 'subtitle' | 'cta' | 'badge' | 'logo' | 'image'>
        scene[typedKey] = { ...scene[typedKey], ...(patch || {}) }
      }

      if (editMode === 'master') return refreshProjectModel({ ...prev, master: scene })
      return refreshProjectModel({ ...prev, formats: { ...prev.formats, [editMode]: scene } })
    })
  }

  const applyGoal = (goal: GoalKey) => {
    clearFixArtifacts()
    setProject((prev) => regenerateFormats({ ...prev, goal }))
    const goalPreset = GOAL_PRESETS.find((item) => item.key === goal)
    const nextActive = getPrimaryPreviewFormats(CHANNEL_FORMATS, goalPreset)[0]
    if (nextActive) setActiveFormatKey(nextActive.key)
    setStatus({ tone: 'success', text: 'Preview scope updated: marketplace card and product highlight.' })
  }

  const applyVisualSystem = (visualSystem: VisualSystemKey) => {
    clearFixArtifacts()
    setProject((prev) => regenerateFormats({ ...prev, visualSystem }))
    setStatus({ tone: 'success', text: `Direction changed to ${VISUAL_SYSTEMS.find((item) => item.key === visualSystem)?.label}. Marketplace previews were refreshed.` })
  }

  const applyTemplate = (nextTemplate: TemplateKey) => {
    clearFixArtifacts()
    setTemplate(nextTemplate)
    setProject((prev) =>
      buildProject(nextTemplate, {
        goal: prev.goal,
        visualSystem: prev.visualSystem,
        brandKit: prev.brandKit,
        imageProfile: prev.assetHint?.imageProfile,
      })
    )
    setEditMode('master')
    setSelectedElement('title')
    setStatus({ tone: 'neutral', text: `Template switched to ${nextTemplate}.` })
  }

  const handleAnalyzeReference = async () => {
    if (!referenceUrl) {
      setStatus({ tone: 'warning', text: 'Upload a PNG or JPG reference before running analysis.' })
      return
    }
    if (referenceUrl.startsWith('data:application/pdf')) {
      setStatus({ tone: 'warning', text: 'PDF reference attached. Export the first page as PNG or JPG if you want automatic style extraction.' })
      return
    }

    setIsAnalyzing(true)
    setStatus({ tone: 'neutral', text: 'Analyzing the reference for palette, contrast, and composition cues.' })
    try {
      const analysis = await analyzeReferenceImage(referenceUrl)
      setReferenceAnalysis(analysis)
      setProject((prev) => applyReferenceToProject(prev, analysis))
      if (!imageUrl) setImageUrl(referenceUrl)
      setEntryMode('reference')
      setStatus({ tone: 'success', text: 'Reference style imported and mapped onto the current project.' })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Reference analysis failed.' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const applyCurrentBrandTemplate = () => {
    clearFixArtifacts()
    setProject((prev) => applyBrandTemplate(prev, selectedBrandTemplate))
    setEntryMode('brand-template')
    setStatus({ tone: 'success', text: `Brand template applied: ${BRAND_TEMPLATES.find((item) => item.key === selectedBrandTemplate)?.label}.` })
  }

  const applyDemo = async (demo: (typeof DEMO_PROJECTS)[number]) => {
    clearFixArtifacts()
    setSelectedBrandTemplate(demo.brandTemplateKey)

    let dataUrl: string | null = null
    try {
      const response = await fetch(demo.imageUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('FileReader failed'))
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStatus({ tone: 'warning', text: `Demo image could not be inlined (${message}). Copy and layout still applied.` })
    }

    setProject((prev) => {
      const afterTemplate = applyBrandTemplate(prev, demo.brandTemplateKey)
      const nextMaster: Scene = {
        ...afterTemplate.master,
        title: { ...afterTemplate.master.title, text: demo.title },
        subtitle: { ...afterTemplate.master.subtitle, text: demo.subtitle },
        cta: { ...afterTemplate.master.cta, text: demo.cta },
      }
      return regenerateFormats({ ...afterTemplate, master: nextMaster })
    })
    // Defer image URL so this render commits with demo copy in `formats` before the image analysis effect runs `regenerateFormats` on stale state.
    setTimeout(() => {
      setImageUrl(dataUrl ?? '')
    }, 0)
    if (dataUrl) {
      setStatus({ tone: 'success', text: `Demo loaded: ${demo.label}.` })
    }
  }

  const reset = () => {
    clearFixArtifacts()
    setEntryMode('compose')
    setTemplate('promo')
    setProject(createDefaultProject())
    setImageUrl('')
    setLogoUrl('')
    setReferenceUrl('')
    setReferenceAnalysis(null)
    setSelectedElement('title')
    setEditMode('master')
    setActiveFormatKey('marketplace-card')
    setProjectName('campaign-master')
    setCurrentSavedId(null)
    setStatus({ tone: 'neutral', text: 'Workspace reset. Start with a fresh marketplace adaptive pack.' })
    setView('onboarding')
  }

  const handleProjectImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as unknown
      if (!isProjectShape(parsed)) throw new Error('This file does not match the exported project structure.')
      const imported = refreshProjectModel(parsed as Project)
      clearFixArtifacts()
      setProject(imported)
      setTemplate(imported.template)
      setEditMode('master')
      setCurrentSavedId(null)
      setProjectName('imported-project')
      setStatus({ tone: 'success', text: 'Project JSON imported. Continue editing or save it as a local workspace item.' })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Project import failed.' })
    }
  }

  const handleSaveProject = () => {
    const note = `Saved from ${project.goal} pack in ${VISUAL_SYSTEMS.find((item) => item.key === project.visualSystem)?.label || project.visualSystem}.`
    const next = localProjectRepository.save(currentSavedId, projectName || 'untitled-project', project, note)
    setSavedProjects(next)
    const matched = next.find((item) => item.id === currentSavedId) || next.find((item) => item.name === (projectName || 'untitled-project'))
    if (matched) setCurrentSavedId(matched.id)
    setStatus({ tone: 'success', text: 'Project saved locally with a new version snapshot.' })
  }

  const handleDeleteSaved = (id: string) => {
    setSavedProjects(localProjectRepository.remove(id))
    if (currentSavedId === id) setCurrentSavedId(null)
    setStatus({ tone: 'success', text: 'Saved project deleted from local storage.' })
  }

  const handleLoadSaved = (saved: SavedProject) => {
    setProject(refreshProjectModel(saved.project))
    clearFixArtifacts()
    setTemplate(saved.project.template)
    setCurrentSavedId(saved.id)
    setProjectName(saved.name)
    setEditMode('master')
    setStatus({ tone: 'success', text: 'Saved project restored.' })
  }

  const handleRestoreVersion = (saved: SavedProject, versionId: string) => {
    const version = saved.versions.find((item) => item.id === versionId)
    if (!version) return
    setProject(refreshProjectModel(version.project))
    clearFixArtifacts()
    setTemplate(version.project.template)
    setCurrentSavedId(saved.id)
    setProjectName(saved.name)
    setEditMode('master')
    setStatus({ tone: 'success', text: `Version restored: ${version.name}.` })
  }

  const exportJson = () => {
    downloadBlob(
      new Blob([JSON.stringify(buildCreativeExportJSON(project), null, 2)], { type: 'application/json' }),
      `${slugify(projectName || 'project')}.json`,
    )
    const updated = recordExport(project)
    setSessionTelemetry(updated)
    setStatus({ tone: 'success', text: 'Project JSON exported.' })
  }

  const exportPng = async (formatKey: FormatKey) => {
    const node = refs.current[formatKey]
    if (!node) return
    setExportingFormatKey(formatKey)
    try {
      const { toPng } = await import('html-to-image')
      await prepareExportFrame()
      const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' })
      const anchor = document.createElement('a')
      anchor.href = dataUrl
      anchor.download = `${slugify(projectName || 'project')}-${formatKey}.png`
      anchor.click()
    } finally {
      setExportingFormatKey(null)
    }
  }

  const exportJpg = async (formatKey: FormatKey) => {
    const node = refs.current[formatKey]
    if (!node) return
    setExportingFormatKey(formatKey)
    try {
      const { toJpeg } = await import('html-to-image')
      await prepareExportFrame()
      const dataUrl = await toJpeg(node, { cacheBust: true, pixelRatio: 2, quality: 0.96, backgroundColor: '#ffffff' })
      const anchor = document.createElement('a')
      anchor.href = dataUrl
      anchor.download = `${slugify(projectName || 'project')}-${formatKey}.jpg`
      anchor.click()
    } finally {
      setExportingFormatKey(null)
    }
  }

  const exportPdf = async (formatKey: FormatKey) => {
    const format = CHANNEL_FORMATS.find((item) => item.key === formatKey)
    const node = refs.current[formatKey]
    if (!node || !format) return
    setExportingFormatKey(formatKey)
    try {
      const [{ toJpeg }, { buildPdfFromJpegs }] = await Promise.all([
        import('html-to-image'),
        import('./lib/pdf'),
      ])
      await prepareExportFrame()
      const dataUrl = await toJpeg(node, { cacheBust: true, pixelRatio: 2, quality: 0.96, backgroundColor: '#ffffff' })
      downloadBlob(buildPdfFromJpegs([{ dataUrl, width: format.width, height: format.height }]), `${slugify(projectName || 'project')}-${formatKey}.pdf`)
    } finally {
      setExportingFormatKey(null)
    }
  }

  const exportPack = async (kind: 'png' | 'jpg' | 'pdf') => {
    setIsExporting(true)
    setStatus({ tone: 'neutral', text: `Exporting ${kind.toUpperCase()} pack...` })
    try {
      if (kind === 'pdf') {
        const [{ toJpeg }, { buildPdfFromJpegs }] = await Promise.all([
          import('html-to-image'),
          import('./lib/pdf'),
        ])
        const pages = []
        for (const format of previewFormats) {
          const node = refs.current[format.key]
          if (!node) continue
          await prepareExportFrame()
          const dataUrl = await toJpeg(node, { cacheBust: true, pixelRatio: 2, quality: 0.96, backgroundColor: '#ffffff' })
          pages.push({ dataUrl, width: format.width, height: format.height })
        }
        if (pages.length) downloadBlob(buildPdfFromJpegs(pages), `${slugify(projectName || 'project')}-${project.goal}.pdf`)
      } else {
        for (const format of previewFormats) {
          if (kind === 'png') await exportPng(format.key)
          if (kind === 'jpg') await exportJpg(format.key)
          await new Promise((resolve) => window.setTimeout(resolve, 120))
        }
      }
      setStatus({ tone: 'success', text: `Current goal pack exported as ${kind.toUpperCase()}.` })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Export failed.' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleFixLayout = async (formatKey: FormatKey, forceAlternativeLayout = false) => {
    setFixingFormatKey(formatKey)
    setBannerAiReviewByFormat((prev) => {
      const next = { ...prev }
      delete next[formatKey]
      return next
    })
    setStatus({ tone: 'neutral', text: `${forceAlternativeLayout ? 'Trying a different layout for' : 'Fixing'} ${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey}...` })
    try {
      const outcome = await fixLayout({
        scene: resolvedFormats[formatKey],
        regenerationMasterScene: project.master,
        formatKey,
        visualSystem: project.visualSystem,
        brandKit: project.brandKit,
        goal: project.goal,
        assetHint: project.assetHint,
        imageUrl,
        previousFixState: fixSessions[formatKey],
        forceAlternativeLayout,
      })

      setProject((prev) => {
        const manualOverrides = { ...(prev.manualOverrides || {}) }
        delete manualOverrides[formatKey]
        const fixHistory = {
          ...(prev.fixHistory || {}),
          [formatKey]: [...(prev.fixHistory?.[formatKey] || []), outcome.result].slice(-12),
        }
        const variants = { ...(prev.variants || {}) }
        if (variants[formatKey]) {
          variants[formatKey] = {
            ...variants[formatKey],
            scene: outcome.scene,
            compositionModelId: outcome.assessment.compositionModelId,
            updatedAt: new Date().toISOString(),
          }
        }
        return refreshProjectModel({
          ...prev,
          formats: {
            ...prev.formats,
            [formatKey]: outcome.scene,
          },
          variants,
          manualOverrides,
          fixHistory,
        })
      })
      setFixResults((prev) => ({ ...prev, [formatKey]: outcome.result }))
      setFixSessions((prev) => ({ ...prev, [formatKey]: outcome.result.session }))
      setSelectedBlockId(null)

      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            const svgEl = document.querySelector(`[data-format-key="${formatKey}"] svg.preview-svg`)
            if (!(svgEl instanceof SVGSVGElement)) {
              console.warn('[banner-analysis] svg not found for format:', formatKey)
              return
            }
            try {
              const quality = await analyzeBannerQuality(svgEl, outcome.scene)
              const { scene: patchedScene, changed } = applyBannerQualityAutofixes(outcome.scene, quality)
              if (changed) {
                setProject((prev) => {
                  const manualOverrides = { ...(prev.manualOverrides || {}) }
                  delete manualOverrides[formatKey]
                  const variants = { ...(prev.variants || {}) }
                  if (variants[formatKey]) {
                    variants[formatKey] = {
                      ...variants[formatKey],
                      scene: patchedScene,
                      compositionModelId: outcome.assessment.compositionModelId,
                      updatedAt: new Date().toISOString(),
                    }
                  }
                  return refreshProjectModel({
                    ...prev,
                    formats: {
                      ...prev.formats,
                      [formatKey]: patchedScene,
                    },
                    variants,
                    manualOverrides,
                  })
                })
              }
              setBannerAiReviewByFormat((prev) => ({ ...prev, [formatKey]: quality }))
            } catch (bannerErr) {
              console.error('[banner-analysis] error:', bannerErr)
            }
          } finally {
            resolve()
          }
        }, 500)
      })

      setStatus({
        tone:
          outcome.result.v2SlotLayoutPreserved || outcome.result.effectiveAfterScore > outcome.result.effectiveBeforeScore
            ? 'success'
            : 'warning',
        text: outcome.result.v2SlotLayoutPreserved
          ? `${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey}: layout unchanged (V2 slot structure preserved).`
          : `Fix complete for ${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey}. Effective score ${outcome.result.effectiveBeforeScore} -> ${outcome.result.effectiveAfterScore}.${outcome.result.canFixAgain ? ' You can fix again.' : ' Layout stabilized.'}`,
      })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Layout fix failed.' })
    } finally {
      setFixingFormatKey(null)
    }
  }

  if (view === 'onboarding') {
    return (
      <Onboarding
        onStart={(mode, imageUrl) => {
          setEntryMode(mode)
          if (mode === 'reference' && imageUrl) {
            setReferenceUrl(imageUrl)
            setImageUrl(imageUrl)
          }
          setSidebarTab('assets')
          setView('editor')
        }}
      />
    )
  }

  return (
    <div className="page">
      <header className="editor-header">
        <div className="editor-header-left">
          <button className="editor-back" onClick={() => setView('onboarding')}>
            ← Back
          </button>
          <span className="editor-project-name">{projectName}</span>
        </div>
        <div className="editor-header-right">
          <span className="editor-meta">{goalLabel} · {visualSystemLabel}</span>
          <button className="button" onClick={handleRegenerateAll}>
            <Wand2 size={16} />
            Regenerate all
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar stack">
          <div className="sidebar-tabs">
            <button className={sidebarTab === 'setup' ? 'sidebar-tab active' : 'sidebar-tab'} onClick={() => setSidebarTab('setup')}>
              Setup
            </button>
            <button className={sidebarTab === 'assets' ? 'sidebar-tab active' : 'sidebar-tab'} onClick={() => setSidebarTab('assets')}>
              Assets
            </button>
          </div>
          {sidebarTab === 'setup' && (
            <>
          <div className="card">
            <div className="card-header">
              <div className="space-between">
                <div>
                  <div className="section-kicker">Campaign setup</div>
                  <h2>How should this creative start?</h2>
                </div>
                <button className="button button-outline" onClick={reset}>
                  <RefreshCcw size={16} />
                  Reset
                </button>
              </div>
            </div>
            <div className="card-body stack">
              <div className="segmented segmented-3">
                <button className={`segmented-option ${entryMode === 'compose' ? 'active' : ''}`} onClick={() => setEntryMode('compose')}>
                  Build master
                </button>
                <button className={`segmented-option ${entryMode === 'reference' ? 'active' : ''}`} onClick={() => setEntryMode('reference')}>
                  Import reference
                </button>
                <button className={`segmented-option ${entryMode === 'brand-template' ? 'active' : ''}`} onClick={() => setEntryMode('brand-template')}>
                  Brand template
                </button>
              </div>

              <div className="field">
                <label className="label">Project name</label>
                <input className="input" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
              </div>

              <div className="field">
                <label className="label">Template</label>
                <select className="select" value={template} onChange={(event) => applyTemplate(event.target.value as TemplateKey)}>
                  {templates.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label">Campaign goal</label>
                <select className="select" value={project.goal} onChange={(event) => applyGoal(event.target.value as GoalKey)}>
                  {UI_GOAL_PRESETS.map((goal) => (
                    <option key={goal.key} value={goal.key}>
                      {goal.label}
                    </option>
                  ))}
                </select>
                <div className="hint">{currentGoalPreset?.description}</div>
              </div>

              {entryMode === 'reference' && (
                <div className="panel stack">
                  <div className="section-title">Reference import</div>
                  <div className="callout">PNG/JPG references are analyzed automatically. PDF references can be attached, but auto-style extraction works best with raster exports from Figma or other tools.</div>
                  <FilePicker label="Reference file" value={referenceUrl} onUrlChange={setReferenceUrl} accept="image/*,application/pdf,.pdf" />
                  <button className="button" onClick={handleAnalyzeReference} disabled={isAnalyzing}>
                    <Sparkles size={16} />
                    {isAnalyzing ? 'Analyzing reference...' : 'Analyze and apply style'}
                  </button>
                </div>
              )}

              {entryMode === 'brand-template' && (
                <div className="panel stack">
                  <div className="section-title">Brand templates</div>
                  <select className="select" value={selectedBrandTemplate} onChange={(event) => setSelectedBrandTemplate(event.target.value as BrandTemplateKey)}>
                    {BRAND_TEMPLATES.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <div className="hint">{BRAND_TEMPLATES.find((item) => item.key === selectedBrandTemplate)?.description}</div>
                  <button className="button" onClick={applyCurrentBrandTemplate}>
                    <Library size={16} />
                    Apply brand template
                  </button>
                </div>
              )}

              <StatusBanner tone={status.tone} text={status.text} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <button className="collapsible-trigger" onClick={() => setDirectionOpen((open) => !open)}>
                <div>
                  <div className="section-kicker">Design direction</div>
                  <h2>Suggested visual systems</h2>
                </div>
                <ChevronDown size={14} className={directionOpen ? 'rotated' : ''} />
              </button>
            </div>
            {directionOpen && (
              <div className="card-body stack collapsible-body">
                <div className="direction-grid">
                  {suggestedDirections.map((directionKey) => {
                    const system = VISUAL_SYSTEMS.find((item) => item.key === directionKey)!
                    return (
                      <button key={directionKey} className={`direction-card ${project.visualSystem === directionKey ? 'active' : ''}`} onClick={() => applyVisualSystem(directionKey)}>
                        <div className="direction-title">{system.label}</div>
                        <div className="direction-text">{system.description}</div>
                      </button>
                    )
                  })}
                </div>
                {import.meta.env.DEV && (
                  <div className="panel" style={{ marginTop: 8 }}>
                    <div className="section-title">Layout engine</div>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <button
                        className={`button button-outline${v2Enabled ? ' active' : ''}`}
                        onClick={() => {
                          const next = !v2Enabled
                          setV2Enabled(next)
                          setLayoutEngineV2(next)
                          setProject((prev) => regenerateFormats(prev))
                        }}
                      >
                        {v2Enabled ? 'V2 engine on' : 'V2 engine off'}
                      </button>
                      {v2Enabled && (
                        <span className="hint" style={{ fontSize: 11 }}>
                          archetype-driven layout active
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
            </>
          )}

          {sidebarTab === 'assets' && (
            <>
          <div className="card">
            <div className="card-header">
              <h2 className="sidebar-card-title">Master controls</h2>
            </div>
            <div className="card-body stack">
              <div className="sidebar-section">
                <div className="sidebar-section-label">Images</div>
                <ErrorBoundary>
                  <FilePicker label="Main image" value={imageUrl} onUrlChange={setImageUrl} />
                  <FilePicker label="Logo" value={logoUrl} onUrlChange={setLogoUrl} />
                </ErrorBoundary>
              </div>
              <div className="sidebar-section">
                <div className="sidebar-section-label">Elements</div>
                {(['title', 'subtitle', 'cta', 'badge', 'logo', 'image'] as const).map((key) => (
                  <div key={key} className={`element-row ${!enabledElements[key] ? 'element-row--disabled' : ''}`}>
                    <div className="element-row-header">
                      <label className="element-checkbox">
                        <input
                          type="checkbox"
                          checked={enabledElements[key]}
                          onChange={() => toggleElement(key)}
                        />
                      </label>
                      <span className="element-row-label">{key}</span>
                      {enabledElements[key] && (
                        <button
                          className={`element-expand-btn ${expandedElement === key ? 'active' : ''}`}
                          onClick={() => toggleExpand(key)}
                        >
                          {expandedElement === key ? '▴' : '▾'}
                        </button>
                      )}
                    </div>
                    {enabledElements[key] && expandedElement === key && elementOpen && (
                      <div className="element-panel">
                        <ElementEditor
                          selectedElement={key as SelectedElement}
                          scene={currentScene}
                          updateElement={updateElement}
                          updateRoot={updateRoot}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="collapsible">
                <button className="collapsible-trigger" onClick={() => setBrandOpen((open) => !open)}>
                  <span>Brand system</span>
                  <ChevronDown size={14} className={brandOpen ? 'rotated' : ''} />
                </button>
                {brandOpen && (
                  <div className="collapsible-body">
                    <BrandEditor brandKit={project.brandKit} updateBrandKit={updateBrandKit} />
                  </div>
                )}
              </div>
              <div className="collapsible">
                <button className="collapsible-trigger" onClick={() => setQualityOpen((open) => !open)}>
                  <span>Layout quality</span>
                  <ChevronDown size={14} className={qualityOpen ? 'rotated' : ''} />
                </button>
                {qualityOpen && (
                  <div className="collapsible-body">
                    <ErrorBoundary>
                      <ValidationSummary assessment={currentAssessment} />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <button className="collapsible-trigger" onClick={() => setWorkspaceOpen((open) => !open)}>
                <div>
                  <div className="section-kicker">Workspace</div>
                  <h2>Save, reopen, restore</h2>
                </div>
                <ChevronDown size={14} className={workspaceOpen ? 'rotated' : ''} />
              </button>
            </div>
            {workspaceOpen && (
              <div className="card-body stack collapsible-body">
                <div className="row wrap">
                  <button className="button" onClick={handleSaveProject}>
                    <Save size={16} />
                    Save project
                  </button>
                  <button className="button button-outline" onClick={() => projectImportRef.current?.click()}>
                    <FolderOpen size={16} />
                    Import JSON
                  </button>
                  <input ref={projectImportRef} type="file" hidden accept="application/json,.json" onChange={handleProjectImport} />
                </div>

                <div className="saved-list">
                  {savedProjects.length === 0 && <div className="callout">No saved projects yet. Saving creates a reusable local workspace plus a version trail.</div>}
                  {savedProjects.map((saved) => (
                    <div key={saved.id} className={`saved-card ${currentSavedId === saved.id ? 'active' : ''}`}>
                      <div className="space-between">
                        <div>
                          <div className="saved-title">{saved.name}</div>
                          <div className="muted">Updated {new Date(saved.updatedAt).toLocaleString()}</div>
                        </div>
                        <div className="row">
                          <button className="button button-outline" onClick={() => handleLoadSaved(saved)}>
                            Load
                          </button>
                          <button className="button button-outline" onClick={() => handleDeleteSaved(saved.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                      {currentSavedId === saved.id && (
                        <div className="version-list">
                          {saved.versions.slice(0, 5).map((version) => (
                            <button key={version.id} className="version-item" onClick={() => handleRestoreVersion(saved, version.id)}>
                              <ArchiveRestore size={14} />
                              <span>{version.name}</span>
                              <span className="muted">{new Date(version.createdAt).toLocaleString()}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {currentSavedProject && <div className="hint">Version history is stored locally for the active saved project.</div>}
              </div>
            )}
          </div>
            </>
          )}
        </aside>

        <main className="main stack">
          <ErrorBoundary>
          {(referenceAnalysis || referenceUrl) && (
            <div className="insight-grid">
              {referenceUrl && (
                <div className="reference-card">
                  <div className="section-kicker">Reference</div>
                  {referenceUrl.startsWith('data:application/pdf') ? (
                    <div className="callout">PDF attached. For best visual analysis, export the first page as PNG or JPG and import that as the reference.</div>
                  ) : (
                    <div className="reference-thumb-wrap">
                      <img className="reference-thumb" src={referenceUrl} alt="Reference creative" />
                    </div>
                  )}
                </div>
              )}
              {referenceAnalysis && (
                <div className="reference-card">
                  <div className="section-kicker">Extracted palette</div>
                  <div className="swatches">
                    {referenceAnalysis.palette.map((color) => (
                      <div key={color} className="swatch" style={{ background: color }}>
                        <span>{color}</span>
                      </div>
                    ))}
                  </div>
                  <div className="hint">
                    Mood: <strong>{referenceAnalysis.mood}</strong> · Suggested family: <strong>{referenceAnalysis.suggestedFamily}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <div className="output-title-row">
                <div>
                  <div className="section-kicker">OUTPUT PACK</div>
                  <h2>Marketplace formats</h2>
                </div>
                <div className="output-chips">
                  <span className="chip">{goalLabel}</span>
                  <span className="chip">{visualSystemLabel}</span>
                  <span className="chip chip--brand">{project.brandKit.name}</span>
                  <span className="chip">{imageProfileLabel}</span>
                </div>
              </div>
              <p className="muted small">Preview and export cover 2 marketplace sizes derived from your master.</p>
              <div className="card-actions row wrap">
                {import.meta.env.DEV && (
                  <>
                    <button className={`button button-outline ${layoutDebug.showBoxes ? 'active' : ''}`} onClick={() => setLayoutDebug((prev) => ({ ...prev, showBoxes: !prev.showBoxes }))}>
                      Debug boxes
                    </button>
                    <button className={`button button-outline ${layoutDebug.showSafeArea ? 'active' : ''}`} onClick={() => setLayoutDebug((prev) => ({ ...prev, showSafeArea: !prev.showSafeArea }))}>
                      Safe area
                    </button>
                  </>
                )}
                  <button className="button button-outline" onClick={() => exportPack('png')} disabled={isExporting}>
                    <Download size={16} />
                    {isExporting ? 'Exporting...' : 'PNG pack'}
                  </button>
                  <button className="button button-outline" onClick={() => exportPack('jpg')} disabled={isExporting}>
                    <Download size={16} />
                    {isExporting ? 'Exporting...' : 'JPG pack'}
                  </button>
                  <button className="button button-outline" onClick={() => exportPack('pdf')} disabled={isExporting}>
                    <Download size={16} />
                    {isExporting ? 'Exporting...' : 'PDF pack'}
                  </button>
                  <button className="button button-outline" onClick={exportJson}>
                    <FileJson size={16} />
                    JSON
                  </button>
              </div>
            </div>
            <div className="card-body stack">
              <div className="pack-grid">
                {UI_GOAL_PRESETS.map((goal) => (
                  <button key={goal.key} className={`pack-chip ${project.goal === goal.key ? 'active' : ''}`} onClick={() => applyGoal(goal.key)}>
                    <span>{goal.label}</span>
                    <small>{getPrimaryPreviewFormats(CHANNEL_FORMATS, goal).length} active preview</small>
                  </button>
                ))}
              </div>

              <div className="preview-grid preview-grid-rich">
                {previewFormats.map((format) => {
                  const archetypeResolution = project.variants?.[format.key]?.archetypeResolution
                  const previewArchetypeId = archetypeResolution?.effectiveArchetypeId ?? archetypeResolution?.archetypeId
                  return (
                  <ErrorBoundary key={format.key}>
                    <CanvasPreview
                      format={format}
                      previewArchetypeId={previewArchetypeId}
                      scene={resolvedFormats[format.key]}
                      brandKit={project.brandKit}
                      assessment={assessments[format.key]}
                      imageUrl={imageUrl}
                      logoUrl={logoUrl}
                      previewRef={(node) => {
                        refs.current[format.key] = node
                      }}
                      onFixLayout={() => handleFixLayout(format.key)}
                      onTryDifferentLayout={() => handleTryDifferentLayout(format.key)}
                      isFixing={fixingFormatKey === format.key}
                      isExporting={exportingFormatKey === format.key}
                      fixResult={fixResults[format.key] || null}
                      aiReviewed={Boolean(bannerAiReviewByFormat[format.key])}
                      onExportPng={() => exportPng(format.key)}
                      onExportJpg={() => exportJpg(format.key)}
                      onExportPdf={() => exportPdf(format.key)}
                      debugOptions={layoutDebug}
                      editable={editMode === format.key}
                      showSafeArea={layoutDebug.showSafeArea}
                      qualityOpen={qualityOpen}
                      selectedBlockId={editMode === format.key ? selectedBlockId : null}
                      onSelectBlock={(blockId) => {
                        setEditMode(format.key)
                        setActiveFormatKey(format.key)
                        setSelectedBlockId(blockId)
                      }}
                      onPatchBlock={(blockId, patch) => patchVariantOverride(format.key, blockId, patch)}
                    />
                  </ErrorBoundary>
                  )
                })}
              </div>
            </div>
          </div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
