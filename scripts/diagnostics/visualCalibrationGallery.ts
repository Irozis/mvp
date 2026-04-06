import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { applyVariantManualOverride, buildProject } from '../../src/lib/autoAdapt'
import { BRAND_TEMPLATES, FORMAT_MAP } from '../../src/lib/presets'
import { getFormatAssessment } from '../../src/lib/validation'
import type { FormatKey, Project, Scene } from '../../src/lib/types'

process.env.PREVIEW_CANDIDATE_DEBUG = '0'
process.env.REPAIR_DEBUG = '0'

const FORMATS: FormatKey[] = [
  'marketplace-card',
  'marketplace-highlight',
  'marketplace-tile',
  'social-square',
  'display-mpu',
]

const SCENARIOS = [
  { label: 'no-image', imageProfile: undefined as undefined | 'square' },
  { label: 'square-image', imageProfile: 'square' as const },
]

function round(value?: number) {
  return Math.round((value || 0) * 10) / 10
}

function truncate(value: string, max = 40) {
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

function renderScene(project: Project, formatKey: FormatKey) {
  return applyVariantManualOverride(
    project.formats[formatKey],
    formatKey,
    project.manualOverrides?.[formatKey]
  )
}

function renderSceneSvg(formatKey: FormatKey, scene: Scene) {
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
  <rect x="${x(scene.image.x)}" y="${y(scene.image.y)}" width="${w(scene.image.w)}" height="${h(scene.image.h)}" rx="20" fill="#e2e8f0" fill-opacity="0.25" stroke="#ffffff" stroke-opacity="0.18"/>
  <rect x="${x(scene.logo.x)}" y="${y(scene.logo.y)}" width="${w(scene.logo.w)}" height="${h(scene.logo.h)}" rx="10" fill="#ffffff" fill-opacity="0.16"/>
  <rect x="${x(scene.badge.x)}" y="${y(scene.badge.y)}" width="${w(scene.badge.w)}" height="${h(scene.badge.h)}" rx="10" fill="#ffffff" fill-opacity="0.16"/>
  <text x="${x(scene.title.x)}" y="${y(scene.title.y) + 34}" fill="${scene.title.fill || '#ffffff'}" font-size="${Math.max(scene.title.fontSize || 26, 18)}" font-weight="${scene.title.weight || 700}" font-family="Arial, sans-serif">${escapeHtml(truncate(scene.title.text || 'Headline', 34))}</text>
  <text x="${x(scene.subtitle.x)}" y="${y(scene.subtitle.y) + 22}" fill="${scene.subtitle.fill || '#ffffff'}" opacity="${scene.subtitle.opacity || 0.9}" font-size="${Math.max(scene.subtitle.fontSize || 16, 12)}" font-family="Arial, sans-serif">${escapeHtml(truncate(scene.subtitle.text || 'Subtitle', 44))}</text>
  <rect x="${x(scene.cta.x)}" y="${y(scene.cta.y)}" width="${w(scene.cta.w)}" height="${h(scene.cta.h)}" rx="14" fill="${scene.cta.bg || '#ffffff'}" />
  <text x="${x(scene.cta.x) + 12}" y="${y(scene.cta.y) + Math.max(h(scene.cta.h) * 0.62, 16)}" fill="${scene.cta.fill || '#111827'}" font-size="${Math.max(scene.cta.fontSize || 16, 12)}" font-family="Arial, sans-serif">${escapeHtml(truncate(scene.cta.text || 'CTA', 18))}</text>
</svg>`
}

async function main() {
  const brandKit = BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit
  const outDir = path.join(process.cwd(), 'artifacts', 'visual-calibration', 'v1_2')
  await mkdir(outDir, { recursive: true })

  const entries: Array<Record<string, unknown>> = []

  for (const scenario of SCENARIOS) {
    const project = buildProject('promo', {
      goal: 'promo-pack',
      visualSystem: 'product-card',
      brandKit,
      imageProfile: scenario.imageProfile,
    })

    for (const formatKey of FORMATS) {
      const scene = renderScene(project, formatKey)
      const assessment = getFormatAssessment(
        formatKey,
        scene,
        project.variants?.[formatKey]?.compositionModelId,
        project.assetHint?.enhancedImage
      )
      const id = `${formatKey}-${scenario.label}`
      await writeFile(path.join(outDir, `${id}.svg`), renderSceneSvg(formatKey, scene), 'utf8')
      entries.push({
        id,
        formatKey,
        scenario: scenario.label,
        manualLabel: '',
        structuralTier: assessment.structuralState?.status || 'invalid',
        structuralScore: assessment.score,
        visualScore: assessment.visual?.overallScore || 0,
        visualBand: assessment.visual?.band || 'poor',
        visualBreakdown: assessment.visual?.breakdown || {},
        visualDebug: assessment.visual?.debug || {},
        warnings: assessment.visual?.warnings || [],
        strengths: assessment.visual?.strengths || [],
        issues: assessment.issues.map((issue) => issue.code),
        geometry: {
          title: [round(scene.title.x), round(scene.title.y), round(scene.title.w), round(scene.title.h)].join(':'),
          image: [round(scene.image.x), round(scene.image.y), round(scene.image.w), round(scene.image.h)].join(':'),
          cta: [round(scene.cta.x), round(scene.cta.y), round(scene.cta.w), round(scene.cta.h)].join(':'),
        },
      })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    entries,
    flaggedNoisyCases: entries.filter((entry) => {
      const structuralTier = entry.structuralTier as string
      const visualScore = Number(entry.visualScore || 0)
      return (structuralTier === 'invalid' && visualScore >= 68) || (structuralTier === 'valid' && visualScore <= 45)
    }),
    axisAverages: ['focusHierarchy', 'compositionBalance', 'textImageHarmony', 'ctaQuality', 'negativeSpaceQuality', 'coherence']
      .map((axis) => ({
        axis,
        average: Math.round(
          (entries.reduce((sum, entry) => sum + Number((entry.visualBreakdown as Record<string, number>)[axis] || 0), 0) /
            Math.max(1, entries.length)) *
            10
        ) / 10,
      })),
  }

  const reportPath = path.join(outDir, 'report.json')
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')

  const cards = entries
    .map((entry) => {
      const breakdown = entry.visualBreakdown as Record<string, number>
      return `
        <article class="card">
          <img src="./${escapeHtml(String(entry.id))}.svg" alt="${escapeHtml(String(entry.id))}" />
          <div class="meta">
            <h2>${escapeHtml(String(entry.id))}</h2>
            <p><strong>Manual label:</strong> good / acceptable / poor</p>
            <p><strong>Structural:</strong> ${escapeHtml(String(entry.structuralTier))} | ${entry.structuralScore}</p>
            <p><strong>Visual:</strong> ${entry.visualScore} | ${escapeHtml(String(entry.visualBand))}</p>
            <p><strong>Warnings:</strong> ${escapeHtml((entry.warnings as string[]).join(' | ') || 'none')}</p>
            <p><strong>Strengths:</strong> ${escapeHtml((entry.strengths as string[]).join(' | ') || 'none')}</p>
            <p><strong>Axes:</strong> focus ${breakdown.focusHierarchy ?? 0}, balance ${breakdown.compositionBalance ?? 0}, harmony ${breakdown.textImageHarmony ?? 0}, cta ${breakdown.ctaQuality ?? 0}, space ${breakdown.negativeSpaceQuality ?? 0}, coherence ${breakdown.coherence ?? 0}</p>
          </div>
        </article>
      `
    })
    .join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>V1.2 Visual Calibration Gallery</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
    a { color: #93c5fd; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 16px; overflow: hidden; }
    img { display: block; width: 100%; height: auto; background: #020617; }
    .meta { padding: 14px 16px 18px; }
    h1, h2 { margin: 0 0 10px; }
    p { margin: 6px 0; font-size: 14px; line-height: 1.35; }
  </style>
</head>
<body>
  <h1>V1.2 Visual Calibration Gallery</h1>
  <p>JSON report: <a href="./report.json">report.json</a></p>
  <div class="grid">${cards}</div>
</body>
</html>`
  await writeFile(path.join(outDir, 'index.html'), html, 'utf8')

  console.log('# V1.2 Visual calibration gallery')
  console.log(`outDir=${outDir}`)
  console.log(`entries=${entries.length}`)
  console.table(
    entries.map((entry) => ({
      id: entry.id as string,
      structural: entry.structuralTier as string,
      score: entry.structuralScore as number,
      visual: entry.visualScore as number,
      band: entry.visualBand as string,
      warning: ((entry.warnings as string[])[0] || 'none'),
    }))
  )
  console.log('Flagged noisy cases:')
  console.table(
    (report.flaggedNoisyCases as Array<Record<string, unknown>>).map((entry) => ({
      id: entry.id as string,
      structural: entry.structuralTier as string,
      visual: entry.visualScore as number,
      band: entry.visualBand as string,
    }))
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
