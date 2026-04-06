import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runCalibrationPass } from './calibrationPass'
import { exportCaseReviewTable } from './caseReviewExport'

const TEMP_ROOTS: string[] = []
const EXPECTED_FLIPPED_CASES = [
  'disconnected-cta-dark-split-01-png',
  'disconnected-cta-skewed-layout-02-png',
  'ls-balance-left-heavy-png',
  'ls-cta-detached-png',
]
const THIS_DIR = path.dirname(
  decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:\/)/, '$1')
)
const DATASET_CASES_ROOT = path.resolve(
  THIS_DIR,
  '../../dataset/_cases'
)

async function copyDirectoryRecursive(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true })
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath)
    } else {
      await copyFile(sourcePath, targetPath)
    }
  }
}

async function createTempDatasetRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'validated-unlock-regression-'))
  TEMP_ROOTS.push(root)
  await copyDirectoryRecursive(DATASET_CASES_ROOT, path.join(root, '_cases'))
  return root
}

async function runScenario(enableOverride: boolean) {
  const root = await createTempDatasetRoot()
  const pass = await runCalibrationPass({
    root,
    repairConfig: {
      enableLandscapeTextHeightNearMissOverride: enableOverride,
    },
  })
  const review = await exportCaseReviewTable({ root })

  return {
    pass,
    review,
  }
}

afterEach(async () => {
  await Promise.all(
    TEMP_ROOTS.splice(0, TEMP_ROOTS.length).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  )
})

describe('validated landscape text-height unlock milestone', () => {
  it(
    'keeps the baseline stable with the flag off',
    async () => {
      const { pass, review } = await runScenario(false)

      expect(pass.report.summary.baselineWinCount).toBe(42)
      expect(pass.report.summary.candidateWinCount).toBe(0)
      expect(review.landscapeTextHeightProductionExperiment.totals.eligibleCandidates).toBe(0)
      expect(review.landscapeTextHeightProductionExperiment.totals.flippedCases).toBe(0)
      expect(review.validatedUnlockClasses.classes[0]?.validated).toBe(false)
    },
    240000
  )

  it(
    'flips exactly the audited four cases with the flag on and no others',
    async () => {
      const { pass, review } = await runScenario(true)

      expect(pass.report.summary.baselineWinCount).toBe(38)
      expect(pass.report.summary.candidateWinCount).toBe(4)
      expect(review.landscapeTextHeightProductionExperiment.totals.eligibleCandidates).toBe(4)
      expect(review.landscapeTextHeightProductionExperiment.totals.appliedOverrides).toBe(4)
      expect(review.landscapeTextHeightProductionExperiment.totals.flippedCases).toBe(4)

      const flippedCases = review.landscapeTextHeightProductionExperiment.flippedCases
        .map((item) => item.caseId)
        .slice()
        .sort((left, right) => left.localeCompare(right))

      expect(flippedCases).toEqual(
        EXPECTED_FLIPPED_CASES.slice().sort((left, right) => left.localeCompare(right))
      )
      expect(review.validatedUnlockClasses.classes[0]?.validated).toBe(true)
      expect(review.validatedUnlockClasses.classes[0]?.flippedCases).toEqual(flippedCases)
    },
    240000
  )
})
