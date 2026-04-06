import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { BRAND_TEMPLATES, FORMAT_MAP, GOAL_PRESETS, VISUAL_SYSTEMS } from '../../src/lib/presets'
import { createMasterScene, getMarketplaceCardExplorationDiagnostics } from '../../src/lib/autoAdapt'
import type { AssetHint, TemplateKey, VisualSystemKey } from '../../src/lib/types'

type CliOptions = {
  template: TemplateKey
  goal: string
  visualSystem: VisualSystemKey
  brand: string
  imageProfile?: AssetHint['imageProfile']
  budget: number
  variationIndex: number
  outDir?: string
}

function parseArgs(argv: string[]): CliOptions {
  const params = new Map<string, string>()
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const [key, value] = arg.slice(2).split('=')
    params.set(key, value || 'true')
  }
  return {
    template: (params.get('template') as TemplateKey) || 'product',
    goal: params.get('goal') || 'promo-pack',
    visualSystem: (params.get('visualSystem') as VisualSystemKey) || 'product-card',
    brand: params.get('brand') || 'retail-impact',
    imageProfile: (params.get('imageProfile') as AssetHint['imageProfile']) || 'square',
    budget: Number(params.get('budget') || 24),
    variationIndex: Number(params.get('variationIndex') || 0),
    outDir: params.get('outDir') || undefined,
  }
}

function truncate(value: string, max = 42) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatPercent(value: number, total: number) {
  return Math.round((value / 100) * total)
}

function renderCandidateSvg(candidate: ReturnType<typeof getMarketplaceCardExplorationDiagnostics>['candidates'][number]) {
  const format = FORMAT_MAP['marketplace-card']
  const width = format.width
  const height = format.height
  const x = (value?: number) => formatPercent(value || 0, width)
  const y = (value?: number) => formatPercent(value || 0, height)
  const w = (value?: number) => formatPercent(value || 0, width)
  const h = (value?: number) => formatPercent(value || 0, height)
  const titleText = truncate(candidate.scene.title.text || 'Headline', 42)
  const subtitleText = truncate(candidate.scene.subtitle.text || 'Subtitle', 60)
  const ctaText = truncate(candidate.scene.cta.text || 'CTA', 22)
  const badgeText = truncate(candidate.scene.badge.text || 'Badge', 18)
  const bgA = candidate.scene.background?.[0] || '#0f172a'
  const bgB = candidate.scene.background?.[1] || '#1e293b'
  const bgC = candidate.scene.background?.[2] || '#334155'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="50%" stop-color="${bgB}" />
      <stop offset="100%" stop-color="${bgC}" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" rx="36" />
  <rect x="${x(candidate.scene.image.x)}" y="${y(candidate.scene.image.y)}" width="${w(candidate.scene.image.w)}" height="${h(candidate.scene.image.h)}" rx="28" fill="#d8dee9" fill-opacity="0.28" stroke="#ffffff" stroke-opacity="0.18"/>
  <rect x="${x(candidate.scene.logo.x)}" y="${y(candidate.scene.logo.y)}" width="${w(candidate.scene.logo.w)}" height="${h(candidate.scene.logo.h)}" rx="12" fill="#ffffff" fill-opacity="0.18"/>
  <text x="${x(candidate.scene.logo.x) + 12}" y="${y(candidate.scene.logo.y) + 24}" fill="#ffffff" font-size="22" font-family="Arial, sans-serif">LOGO</text>
  <rect x="${x(candidate.scene.badge.x)}" y="${y(candidate.scene.badge.y)}" width="${w(candidate.scene.badge.w)}" height="${h(candidate.scene.badge.h)}" rx="12" fill="#ffffff" fill-opacity="0.16"/>
  <text x="${x(candidate.scene.badge.x) + 12}" y="${y(candidate.scene.badge.y) + 24}" fill="#ffffff" font-size="22" font-family="Arial, sans-serif">${escapeHtml(badgeText)}</text>
  <text x="${x(candidate.scene.title.x)}" y="${y(candidate.scene.title.y) + 44}" fill="${candidate.scene.title.fill || '#ffffff'}" font-size="${Math.max(candidate.scene.title.fontSize || 36, 24)}" font-weight="${candidate.scene.title.weight || 700}" font-family="Arial, sans-serif">${escapeHtml(titleText)}</text>
  <text x="${x(candidate.scene.subtitle.x)}" y="${y(candidate.scene.subtitle.y) + 28}" fill="${candidate.scene.subtitle.fill || '#ffffff'}" opacity="${candidate.scene.subtitle.opacity || 0.9}" font-size="${Math.max(candidate.scene.subtitle.fontSize || 18, 14)}" font-family="Arial, sans-serif">${escapeHtml(subtitleText)}</text>
  <rect x="${x(candidate.scene.cta.x)}" y="${y(candidate.scene.cta.y)}" width="${w(candidate.scene.cta.w)}" height="${h(candidate.scene.cta.h)}" rx="18" fill="${candidate.scene.cta.bg || '#ffffff'}" />
  <text x="${x(candidate.scene.cta.x) + 16}" y="${y(candidate.scene.cta.y) + Math.max(h(candidate.scene.cta.h) * 0.62, 20)}" fill="${candidate.scene.cta.fill || '#111827'}" font-size="${Math.max(candidate.scene.cta.fontSize || 18, 14)}" font-family="Arial, sans-serif">${escapeHtml(ctaText)}</text>
  <text x="28" y="${height - 44}" fill="#ffffff" font-size="24" font-family="Arial, sans-serif">#${escapeHtml(candidate.candidateId)} | ${escapeHtml(candidate.structuralArchetype)} | ${escapeHtml(candidate.structuralStatus)}</text>
</svg>`
}

function renderGalleryHtml(reportPath: string, candidates: ReturnType<typeof getMarketplaceCardExplorationDiagnostics>['candidates']) {
  const cards = candidates
    .map((candidate, index) => {
      const findings = candidate.topStructuralFindings.map((finding) => `${finding.name}:${finding.severity}`).join(', ') || 'none'
      return `
        <article class="card">
          <img src="./candidate-${index + 1}.svg" alt="${escapeHtml(candidate.candidateId)}" />
          <div class="meta">
            <h2>${escapeHtml(candidate.candidateId)}</h2>
            <p><strong>Source:</strong> ${escapeHtml(candidate.source)}</p>
            <p><strong>Archetype:</strong> ${escapeHtml(candidate.structuralArchetype)}</p>
            <p><strong>Status:</strong> ${escapeHtml(candidate.structuralStatus)}</p>
            <p><strong>Score:</strong> ${candidate.effectiveScore.toFixed(2)}</p>
            <p><strong>Normal select:</strong> ${candidate.wouldNormallyBeSelected ? 'yes' : 'no'}</p>
            <p><strong>Findings:</strong> ${escapeHtml(findings)}</p>
            <p><strong>Signature:</strong> <code>${escapeHtml(candidate.structuralSignatureKey)}</code></p>
          </div>
        </article>
      `
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Marketplace Card Exploration</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
    a { color: #93c5fd; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 16px; overflow: hidden; }
    img { display: block; width: 100%; height: auto; background: #020617; }
    .meta { padding: 14px 16px 18px; }
    h1, h2 { margin: 0 0 10px; }
    p { margin: 6px 0; font-size: 14px; line-height: 1.35; }
    code { font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h1>Marketplace Card Exploration</h1>
  <p>JSON report: <a href="./${escapeHtml(path.basename(reportPath))}">${escapeHtml(path.basename(reportPath))}</a></p>
  <div class="grid">
    ${cards}
  </div>
</body>
</html>`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const brandTemplate = BRAND_TEMPLATES.find((item) => item.key === options.brand) || BRAND_TEMPLATES[0]
  const goal = GOAL_PRESETS.find((item) => item.key === options.goal)?.key || 'promo-pack'
  const master = createMasterScene(options.template, brandTemplate.brandKit)
  const assetHint = options.imageProfile ? ({ imageProfile: options.imageProfile } satisfies AssetHint) : undefined

  const diagnostics = getMarketplaceCardExplorationDiagnostics({
    master,
    visualSystem: options.visualSystem,
    brandKit: brandTemplate.brandKit,
    goal,
    assetHint,
    explorationBudget: options.budget,
    variationIndex: options.variationIndex,
  })

  const outDir =
    options.outDir ||
    path.join(
      process.cwd(),
      'artifacts',
      'marketplace-card-exploration',
      `${options.template}-${goal}-${options.visualSystem}-v${options.variationIndex}`
    )

  await mkdir(outDir, { recursive: true })
  const reportPath = path.join(outDir, 'report.json')

  await writeFile(reportPath, JSON.stringify(diagnostics, null, 2), 'utf8')
  for (let index = 0; index < diagnostics.candidates.length; index += 1) {
    const candidate = diagnostics.candidates[index]
    await writeFile(path.join(outDir, `candidate-${index + 1}.svg`), renderCandidateSvg(candidate), 'utf8')
  }
  await writeFile(path.join(outDir, 'index.html'), renderGalleryHtml(reportPath, diagnostics.candidates), 'utf8')

  console.log('# Step V0 marketplace-card exploration')
  console.log(`outDir=${outDir}`)
  console.log(`attemptedCandidates=${diagnostics.attemptedCandidates}`)
  console.log(`keptCandidates=${diagnostics.candidates.length}`)
  console.log(`duplicatePlansFiltered=${diagnostics.duplicatePlansFiltered}`)
  console.log(`duplicateCandidatesFiltered=${diagnostics.duplicateCandidatesFiltered}`)
  console.table(
    diagnostics.candidates.map((candidate) => ({
      id: candidate.candidateId,
      source: candidate.source,
      archetype: candidate.structuralArchetype,
      status: candidate.structuralStatus,
      score: candidate.effectiveScore.toFixed(2),
      selected: candidate.wouldNormallyBeSelected ? 'yes' : 'no',
      findings: candidate.topStructuralFindings.map((finding) => finding.name).join(', ') || 'none',
    }))
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
