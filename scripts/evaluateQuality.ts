import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getPreviewCandidateDiagnostics } from '../src/lib/autoAdapt'
import { BRAND_TEMPLATES } from '../src/lib/presets'
import type { Scene } from '../src/lib/types'

const ROOT = process.cwd()
const CASES_ROOT = path.join(ROOT, 'dataset', '_cases')
const OUTPUT_CSV = path.join(ROOT, 'dataset', '_evaluate-quality.csv')
const SAMPLE_SIZE = 10

type CaseSample = { caseId: string; baselinePath: string; scene: Scene }

async function findBaselineFiles(root: string): Promise<string[]> {
  const results: string[] = []
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await findBaselineFiles(full)))
    } else if (entry.isFile() && entry.name === 'baseline.json') {
      results.push(full)
    }
  }
  return results
}

async function loadSamples(limit: number): Promise<CaseSample[]> {
  const files = (await findBaselineFiles(CASES_ROOT)).sort().slice(0, limit)
  const samples: CaseSample[] = []
  for (const baselinePath of files) {
    const raw = await readFile(baselinePath, 'utf8')
    const parsed = JSON.parse(raw) as { scene?: Scene }
    if (!parsed.scene) continue
    const caseId = path.basename(path.dirname(baselinePath))
    samples.push({ caseId, baselinePath, scene: parsed.scene })
  }
  return samples
}

function csvEscape(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

async function main() {
  const brandKit = BRAND_TEMPLATES.find((item) => item.key === 'retail-impact')?.brandKit || BRAND_TEMPLATES[0].brandKit
  const samples = await loadSamples(SAMPLE_SIZE)

  const header = [
    'case_id',
    'template_selected',
    'visual_score',
    'visual_band',
    'focus_hierarchy',
    'composition_balance',
    'structural_status',
    'issue_count',
  ]
  const rows: string[] = [header.join(',')]

  console.log(`Evaluating ${samples.length} cases as marketplace-card...\n`)

  for (const sample of samples) {
    try {
      const diagnostics = getPreviewCandidateDiagnostics({
        master: sample.scene,
        formatKey: 'marketplace-card',
        visualSystem: 'product-card',
        brandKit,
        goal: 'promo-pack',
      })
      const selected = diagnostics.selectedCandidate
      const templateId = selected.intent.marketplaceTemplateId || ''
      const decisionSummary = selected.intent.marketplaceTemplateSelection?.decisionSummary || '(none)'
      const visual = selected.assessment.visual
      const visualScore = visual?.overallScore ?? ''
      const visualBand = visual?.band ?? ''
      const focusHierarchy = visual?.breakdown?.focusHierarchy ?? ''
      const compositionBalance = visual?.breakdown?.compositionBalance ?? ''

      console.log(
        `[${sample.caseId}] template=${templateId || '(none)'} status=${selected.structuralStatus} visual=${visualScore} band=${visualBand}`,
      )
      console.log(`  reason: ${decisionSummary}`)

      rows.push(
        [
          sample.caseId,
          templateId,
          visualScore,
          visualBand,
          focusHierarchy,
          compositionBalance,
          selected.structuralStatus,
          selected.issueCount,
        ]
          .map(csvEscape)
          .join(','),
      )
    } catch (error) {
      console.error(`[${sample.caseId}] FAILED:`, error instanceof Error ? error.message : error)
      rows.push([sample.caseId, 'ERROR', '', '', '', '', '', ''].map(csvEscape).join(','))
    }
  }

  await writeFile(OUTPUT_CSV, rows.join('\n') + '\n', 'utf8')
  console.log(`\nWrote ${rows.length - 1} rows to ${path.relative(ROOT, OUTPUT_CSV)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
