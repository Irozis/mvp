import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildMetricsCsv,
  buildReportMarkdown,
  buildThresholdCandidates,
  computeCaseMetrics,
  evaluateThresholdsOnCases,
  extractAnnotationFromOverlay,
  getBucketSummary,
  parsePng,
  registerCoverageInputs,
  registerImagePixels,
  type CalibrationManifestEntry,
} from './socialSquareCalibration.shared'

const ROOT = process.cwd()
const DATASET_ROOT = path.join(ROOT, 'dataset', 'social-square')
const EXTRACTED_ROOT = path.join(DATASET_ROOT, 'extracted')
const REPORTS_ROOT = path.join(DATASET_ROOT, 'reports')
const BUCKETS = ['core', 'stress', 'reject'] as const

function parseGroupId(filename: string) {
  const match = filename.match(/Group\s+(\d+)/i)
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY
}

async function listPngFiles(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name)
    .sort((left, right) => parseGroupId(left) - parseGroupId(right) || left.localeCompare(right))
}

async function buildManifest() {
  const manifest: CalibrationManifestEntry[] = []

  for (const bucket of BUCKETS) {
    const bucketDir = path.join(DATASET_ROOT, bucket)
    const files = await listPngFiles(bucketDir)
    for (const filename of files) {
      const filePath = path.join(bucketDir, filename)
      const png = parsePng(await readFile(filePath))
      manifest.push({
        id: filename.replace(/\.png$/i, ''),
        filename,
        bucket,
        width: png.width,
        height: png.height,
      })
      registerImagePixels(filename.replace(/\.png$/i, ''), png.pixels)
    }
  }

  return manifest
}

async function main() {
  await mkdir(EXTRACTED_ROOT, { recursive: true })
  await mkdir(REPORTS_ROOT, { recursive: true })

  const manifest = await buildManifest()
  const annotations = []

  for (const entry of manifest) {
    const filePath = path.join(DATASET_ROOT, entry.bucket, entry.filename)
    const png = parsePng(await readFile(filePath))
    const annotation = extractAnnotationFromOverlay(png, entry)
    annotations.push(annotation)
    registerCoverageInputs(annotation, png.pixels)
  }

  const metrics = annotations.map((annotation) => computeCaseMetrics(annotation))
  const coreMetrics = metrics.filter((metric) => metric.bucket === 'core')
  const stressMetrics = metrics.filter((metric) => metric.bucket === 'stress')
  const rejectMetrics = metrics.filter((metric) => metric.bucket === 'reject')
  const thresholdCandidates = buildThresholdCandidates(coreMetrics)
  const stressEvaluation = evaluateThresholdsOnCases(stressMetrics, thresholdCandidates)

  const summary = {
    inventory: Object.fromEntries(BUCKETS.map((bucket) => [bucket, manifest.filter((entry) => entry.bucket === bucket).length])),
    validForHeroCalibration: annotations.filter((annotation) => annotation.bucket !== 'reject' && annotation.heroSubjectRect).length,
    incompleteCases: annotations.filter((annotation) => annotation.flags.includes('incomplete')).map((annotation) => annotation.id),
    ambiguousCases: annotations.filter((annotation) => annotation.flags.includes('ambiguous')).map((annotation) => annotation.id),
    buckets: {
      core: getBucketSummary(coreMetrics),
      stress: getBucketSummary(stressMetrics),
      reject: getBucketSummary(rejectMetrics),
    },
    stressEvaluation,
  }

  const thresholdReport = {
    currentPolicyBaseline: 'src/lib/overlayPolicies.ts -> social-square / square-hero-overlay',
    thresholds: thresholdCandidates,
  }

  await writeFile(path.join(EXTRACTED_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(path.join(EXTRACTED_ROOT, 'annotations.json'), `${JSON.stringify(annotations, null, 2)}\n`, 'utf8')
  await writeFile(path.join(REPORTS_ROOT, 'metrics.csv'), `${buildMetricsCsv(metrics)}\n`, 'utf8')
  await writeFile(path.join(REPORTS_ROOT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  await writeFile(path.join(REPORTS_ROOT, 'threshold_candidates.json'), `${JSON.stringify(thresholdReport, null, 2)}\n`, 'utf8')
  await writeFile(
    path.join(REPORTS_ROOT, 'report.md'),
    buildReportMarkdown({
      manifest,
      annotations,
      coreMetrics,
      stressMetrics,
      rejectMetrics,
      thresholds: thresholdCandidates,
      stressEvaluation,
    }),
    'utf8'
  )

  console.log(`Calibrated social-square dataset: ${manifest.length} cases`)
  console.log(`Artifacts:`)
  console.log(`- ${path.join(EXTRACTED_ROOT, 'manifest.json')}`)
  console.log(`- ${path.join(EXTRACTED_ROOT, 'annotations.json')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'metrics.csv')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'summary.json')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'threshold_candidates.json')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'report.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
