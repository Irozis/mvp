import { useEffect, useMemo, useRef, useState } from 'react'
import { toJpeg, toPng } from 'html-to-image'
import {
  ArchiveRestore,
  Download,
  FileJson,
  FolderOpen,
  LayoutTemplate,
  Library,
  RefreshCcw,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { FilePicker } from './components/FilePicker'
import { CanvasPreview } from './components/CanvasPreview'
import { VariantInspector } from './components/VariantInspector'
import { ValidationSummary } from './components/ValidationSummary'
import { BasicControls, BrandEditor, ElementEditor } from './components/Controls'
import { applyBrandTemplate, applyVariantManualOverride, buildProject, fixLayout, generateVariant, refreshProjectModel, regenerateFormats } from './lib/autoAdapt'
import { analyzeAssetCharacteristics, getImageProfileLabel } from './lib/assetProfile'
import { aiAnalyzeImage, analyzeReferenceImage, getContrastingText, type ReferenceAnalysis } from './lib/imageAnalysis'
import { BRAND_TEMPLATES, CHANNEL_FORMATS, GOAL_PRESETS, LAYOUT_PRESETS, UI_GOAL_PRESETS, VISUAL_SYSTEMS } from './lib/presets'
import { buildPdfFromJpegs } from './lib/pdf'
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
  LayoutIntentFamily,
  ManualBlockOverride,
  Project,
  SavedProject,
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

function StepCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="step-card">
      <div className="step-title">{title}</div>
      <div className="step-text">{text}</div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-card">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
    </div>
  )
}

function StatusBanner({ tone, text }: { tone: StatusTone; text: string }) {
  return <div className={`status-banner ${tone}`}>{text}</div>
}

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
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [fixingFormatKey, setFixingFormatKey] = useState<FormatKey | null>(null)
  const [fixResults, setFixResults] = useState<Partial<Record<FormatKey, FixResult>>>({})
  const [fixSessions, setFixSessions] = useState<Partial<Record<FormatKey, FixSessionState>>>({})
  const [selectedBlockId, setSelectedBlockId] = useState<LayoutElementKind | null>(null)
  const [layoutDebug, setLayoutDebug] = useState<LayoutDebugOptions>({
    showBoxes: false,
    showBoxLabels: true,
    showCollisions: true,
    showSafeArea: false,
  })
  const [status, setStatus] = useState<{ tone: StatusTone; text: string }>({
    tone: 'neutral',
    text: 'Build a marketplace adaptive pack: card, highlight, and tile outputs from one master.',
  })

  const refs = useRef<Partial<Record<FormatKey, HTMLDivElement | null>>>({})
  const projectImportRef = useRef<HTMLInputElement | null>(null)

  const clearFixArtifacts = () => {
    setFixResults({})
    setFixSessions({})
  }

  useEffect(() => {
    setSavedProjects(localProjectRepository.loadAll())
  }, [])

  useEffect(() => {
    if (UI_GOAL_PRESETS.some((g) => g.key === project.goal)) return
    setFixResults({})
    setFixSessions({})
    setProject((prev) => regenerateFormats({ ...prev, goal: 'promo-pack' }))
  }, [project.goal])

  const currentGoalPreset = useMemo(() => GOAL_PRESETS.find((item) => item.key === project.goal), [project.goal])
  const goalFormats = useMemo(() => currentGoalPreset?.includedFormats || ['marketplace-card'], [currentGoalPreset])
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
      .catch(() => {
        if (cancelled) return
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

  const applyLayoutFamilyOverride = async (formatKey: FormatKey, family: LayoutIntentFamily) => {
    setFixingFormatKey(formatKey)
    setStatus({ tone: 'neutral', text: `Rebuilding ${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey} with ${family}.` })
    try {
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
    setStatus({ tone: 'success', text: 'Preview scope updated: marketplace card, highlight, and tile.' })
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
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${slugify(projectName || 'project')}.json`)
    setStatus({ tone: 'success', text: 'Project JSON exported.' })
  }

  const exportPng = async (formatKey: FormatKey) => {
    const node = refs.current[formatKey]
    if (!node) return
    const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' })
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = `${slugify(projectName || 'project')}-${formatKey}.png`
    anchor.click()
  }

  const exportJpg = async (formatKey: FormatKey) => {
    const node = refs.current[formatKey]
    if (!node) return
    const dataUrl = await toJpeg(node, { cacheBust: true, pixelRatio: 2, quality: 0.96, backgroundColor: '#ffffff' })
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = `${slugify(projectName || 'project')}-${formatKey}.jpg`
    anchor.click()
  }

  const exportPdf = async (formatKey: FormatKey) => {
    const format = CHANNEL_FORMATS.find((item) => item.key === formatKey)
    const node = refs.current[formatKey]
    if (!node || !format) return
    const dataUrl = await toJpeg(node, { cacheBust: true, pixelRatio: 2, quality: 0.96, backgroundColor: '#ffffff' })
    downloadBlob(buildPdfFromJpegs([{ dataUrl, width: format.width, height: format.height }]), `${slugify(projectName || 'project')}-${formatKey}.pdf`)
  }

  const exportPack = async (kind: 'png' | 'jpg' | 'pdf') => {
    if (kind === 'pdf') {
      const pages = []
      for (const format of previewFormats) {
        const node = refs.current[format.key]
        if (!node) continue
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
  }

  const handleFixLayout = async (formatKey: FormatKey, forceAlternativeLayout = false) => {
    setFixingFormatKey(formatKey)
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
      setStatus({
        tone: outcome.result.effectiveAfterScore > outcome.result.effectiveBeforeScore ? 'success' : 'warning',
        text: `Fix complete for ${CHANNEL_FORMATS.find((item) => item.key === formatKey)?.label || formatKey}. Effective score ${outcome.result.effectiveBeforeScore} -> ${outcome.result.effectiveAfterScore}.${outcome.result.canFixAgain ? ' You can fix again.' : ' Layout stabilized.'}`,
      })
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'Layout fix failed.' })
    } finally {
      setFixingFormatKey(null)
    }
  }

  return (
    <div className="page">
      <div className="hero card">
        <div className="hero-copy">
          <div className="eyebrow">Adaptive Creative Studio</div>
          <div className="title-row hero-title">
            <LayoutTemplate size={24} />
            <h1>Build once. Ship marketplace-ready layouts.</h1>
          </div>
          <p className="hero-text">
            From one master creative, export marketplace card, product highlight, and promo tile formats with consistent branding and validation.
          </p>
        </div>
        <div className="step-grid">
          <StepCard title="1. Choose mode" text="Create from scratch, import a layout reference, or start from a brand template." />
          <StepCard title="2. Define the pack" text="This demo focuses on the marketplace adaptive pack: card, highlight, and tile outputs." />
          <StepCard title="3. Select direction" text="Pick a visual system suited to product-led marketplace layouts, then review all sizes in the preview feed." />
          <StepCard title="4. Save and export" text="Track versions, reopen projects later, and export PNG, JPG, PDF, or JSON." />
        </div>
      </div>

      <div className="layout">
        <aside className="sidebar stack">
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
              <div className="section-kicker">Design direction</div>
              <h2>Suggested visual systems</h2>
            </div>
            <div className="card-body stack">
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
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="section-kicker">Assets & brand</div>
              <h2>Master controls</h2>
            </div>
            <div className="card-body stack">
              <FilePicker label="Main image" value={imageUrl} onUrlChange={setImageUrl} />
              <FilePicker label="Logo" value={logoUrl} onUrlChange={setLogoUrl} />
              <div className="field">
                <label className="label">Edit mode</label>
                <select className="select" value={editMode} onChange={(event) => setEditMode(event.target.value as 'master' | FormatKey)}>
                  <option value="master">Master layout</option>
                  {previewFormats.map((format) => (
                    <option key={format.key} value={format.key}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Master preview family</label>
                <select className="select" value={activeFormatKey} onChange={(event) => setActiveFormatKey(event.target.value as FormatKey)}>
                  {previewFormats.map((format) => (
                    <option key={format.key} value={format.key}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </div>
              {editMode === 'master' ? (
                <>
                  <div className="field">
                    <label className="label">Editable element</label>
                    <select className="select" value={selectedElement} onChange={(event) => setSelectedElement(event.target.value as SelectedElement)}>
                      {selectedOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <BasicControls formatKey={currentFormatKey} applyLayoutPreset={applyLayoutPreset} />
                </>
              ) : (
                <div className="callout">
                  Manual polish mode is active for <strong>{CHANNEL_FORMATS.find((item) => item.key === editMode)?.label || editMode}</strong>. Select a block in the preview to inspect and adjust it.
                </div>
              )}
              <BrandEditor brandKit={project.brandKit} updateBrandKit={updateBrandKit} />
              {editMode === 'master' ? (
                <ElementEditor selectedElement={selectedElement} scene={currentScene} updateElement={updateElement} updateRoot={updateRoot} />
              ) : (
                <VariantInspector
                  format={CHANNEL_FORMATS.find((item) => item.key === editMode) || CHANNEL_FORMATS[0]}
                  scene={currentScene}
                  assessment={currentAssessment}
                  selectedBlockId={selectedBlockId}
                  manualOverride={currentVariantOverride}
                  onSelectBlock={setSelectedBlockId}
                  onPatchBlock={(blockId, patch) => patchVariantOverride(editMode, blockId, patch)}
                  onResetBlock={(blockId) => resetVariantBlock(editMode, blockId)}
                  onResetVariant={() => resetVariantOverride(editMode)}
                  onSelectImageRole={(role) => setVariantImageRole(editMode, role)}
                  onApplyLayoutFamily={(family) => applyLayoutFamilyOverride(editMode, family)}
                />
              )}
              <ValidationSummary assessment={currentAssessment} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="section-kicker">Workspace</div>
              <h2>Save, reopen, restore</h2>
            </div>
            <div className="card-body stack">
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
          </div>
        </aside>

        <main className="main stack">
          <div className="summary-grid">
            <SummaryCard label="Goal pack" value={currentGoalPreset?.label || project.goal} />
            <SummaryCard label="Direction" value={VISUAL_SYSTEMS.find((item) => item.key === project.visualSystem)?.label || project.visualSystem} />
            <SummaryCard label="Brand system" value={project.brandKit.name} />
            <SummaryCard label="Image profile" value={project.assetHint?.imageProfile ? getImageProfileLabel(project.assetHint.imageProfile) : 'Not analyzed'} />
          </div>

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
              <div className="space-between">
                <div>
                  <div className="section-kicker">Output pack</div>
                  <h2>Marketplace formats</h2>
                  <p className="muted">Preview and export cover {previewFormats.length} marketplace sizes (card, highlight, tile) derived from your master.</p>
                </div>
                <div className="row wrap">
                  <button className={`button button-outline ${layoutDebug.showBoxes ? 'active' : ''}`} onClick={() => setLayoutDebug((prev) => ({ ...prev, showBoxes: !prev.showBoxes }))}>
                    Debug boxes
                  </button>
                  <button className={`button button-outline ${layoutDebug.showSafeArea ? 'active' : ''}`} onClick={() => setLayoutDebug((prev) => ({ ...prev, showSafeArea: !prev.showSafeArea }))}>
                    Safe area
                  </button>
                  <button className="button" onClick={() => { clearFixArtifacts(); setProject((prev) => regenerateFormats(prev)) }}>
                    <Wand2 size={16} />
                    Regenerate all
                  </button>
                  <button className="button button-outline" onClick={() => exportPack('png')}>
                    <Download size={16} />
                    PNG pack
                  </button>
                  <button className="button button-outline" onClick={() => exportPack('jpg')}>
                    <Download size={16} />
                    JPG pack
                  </button>
                  <button className="button button-outline" onClick={() => exportPack('pdf')}>
                    <Download size={16} />
                    PDF pack
                  </button>
                  <button className="button button-outline" onClick={exportJson}>
                    <FileJson size={16} />
                    JSON
                  </button>
                </div>
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
                {previewFormats.map((format) => (
                  <CanvasPreview
                    key={format.key}
                    format={format}
                    scene={resolvedFormats[format.key]}
                    brandKit={project.brandKit}
                    assessment={assessments[format.key]}
                    imageUrl={imageUrl}
                    logoUrl={logoUrl}
                    previewRef={(node) => {
                      refs.current[format.key] = node
                    }}
                    onFixLayout={() => handleFixLayout(format.key)}
                    onTryDifferentLayout={() => handleFixLayout(format.key, true)}
                    isFixing={fixingFormatKey === format.key}
                    fixResult={fixResults[format.key] || null}
                    onExportPng={() => exportPng(format.key)}
                    onExportJpg={() => exportJpg(format.key)}
                    onExportPdf={() => exportPdf(format.key)}
                    debugOptions={layoutDebug}
                    editable={editMode === format.key}
                    showSafeArea={layoutDebug.showSafeArea}
                    selectedBlockId={editMode === format.key ? selectedBlockId : null}
                    onSelectBlock={(blockId) => {
                      setEditMode(format.key)
                      setActiveFormatKey(format.key)
                      setSelectedBlockId(blockId)
                    }}
                    onPatchBlock={(blockId, patch) => patchVariantOverride(format.key, blockId, patch)}
                  />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
