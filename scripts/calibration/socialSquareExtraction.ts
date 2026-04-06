import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildExtractionReportMarkdown,
  extractAnnotationFromOverlay,
  getAnnotationClassificationSource,
  getEffectiveBucket,
  getEffectiveAnnotationClassification,
  parsePng,
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
        sourceBucket: bucket,
        width: png.width,
        height: png.height,
      })
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
    annotations.push(extractAnnotationFromOverlay(png, entry))
  }

  const manifestWithClassification: CalibrationManifestEntry[] = manifest.map((entry) => {
    const annotation = annotations.find((candidate) => candidate.id === entry.id)
    if (!annotation) return entry
    return {
      ...entry,
      bucket: getEffectiveBucket(annotation),
      sourceBucket: annotation.sourceBucket ?? entry.sourceBucket ?? entry.bucket,
      classification: getEffectiveAnnotationClassification(annotation),
      classificationSource: getAnnotationClassificationSource(annotation),
    }
  })

  await writeFile(path.join(EXTRACTED_ROOT, 'manifest.json'), `${JSON.stringify(manifestWithClassification, null, 2)}\n`, 'utf8')
  await writeFile(path.join(EXTRACTED_ROOT, 'annotations.json'), `${JSON.stringify(annotations, null, 2)}\n`, 'utf8')
  await writeFile(path.join(REPORTS_ROOT, 'report.md'), buildExtractionReportMarkdown({ manifest: manifestWithClassification, annotations }), 'utf8')

  console.log(`Extracted social-square dataset: ${manifestWithClassification.length} cases`)
  console.log(`Artifacts:`)
  console.log(`- ${path.join(EXTRACTED_ROOT, 'manifest.json')}`)
  console.log(`- ${path.join(EXTRACTED_ROOT, 'annotations.json')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'report.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
