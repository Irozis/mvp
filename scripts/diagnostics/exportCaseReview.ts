import path from 'node:path'

import { exportCaseReviewTable } from '../../src/lib/caseReviewExport'

type CliOptions = {
  root: string
  reviewQueueSize?: number
  markdownLimit?: number
}

function parseNumber(value: string | undefined, flag: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric value for ${flag}, received "${value}".`)
  }
  return parsed
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: path.resolve(process.cwd(), 'dataset'),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--root':
        options.root = path.resolve(process.cwd(), argv[++index] || '')
        break
      case '--review-queue-size':
        options.reviewQueueSize = parseNumber(argv[++index], '--review-queue-size')
        break
      case '--markdown-limit':
        options.markdownLimit = parseNumber(argv[++index], '--markdown-limit')
        break
      default:
        throw new Error(`Unknown argument "${arg}".`)
    }
  }

  return options
}

function printSummary(result: Awaited<ReturnType<typeof exportCaseReviewTable>>) {
  console.log('# Calibration review export')
  console.log(`root=${result.root}`)
  console.log(`cases-root=${result.casesRoot}`)
  console.log(`table-json=${result.outputPaths.tableJson}`)
  console.log(`table-csv=${result.outputPaths.tableCsv}`)
  console.log(`best-rejected=${result.outputPaths.bestRejectedJson}`)
  console.log(`tuning-summary=${result.outputPaths.tuningSummaryJson}`)
  console.log(`table-markdown=${result.outputPaths.tableMarkdown}`)
  console.log(`placement-soft-policy=${result.outputPaths.placementSoftPolicyJson}`)
  console.log(`placement-deep-diagnostics=${result.outputPaths.placementDeepDiagnosticsJson}`)
  console.log(`placement-role-hotspots=${result.outputPaths.placementRoleHotspotsJson}`)
  console.log(`placement-image-square-diagnostics=${result.outputPaths.placementImageSquareDiagnosticsJson}`)
  console.log(`placement-image-landscape-diagnostics=${result.outputPaths.placementImageLandscapeDiagnosticsJson}`)
  console.log(`landscape-image-near-miss-experiment=${result.outputPaths.landscapeImageNearMissExperimentJson}`)
  console.log(`placement-badge-landscape-diagnostics=${result.outputPaths.placementBadgeLandscapeDiagnosticsJson}`)
  console.log(`placement-text-square-diagnostics=${result.outputPaths.placementTextSquareDiagnosticsJson}`)
  console.log(`placement-text-landscape-diagnostics=${result.outputPaths.placementTextLandscapeDiagnosticsJson}`)
  console.log(`placement-cta-landscape-diagnostics=${result.outputPaths.placementCtaLandscapeDiagnosticsJson}`)
  console.log(
    `placement-cta-anchor-landscape-diagnostics=${result.outputPaths.placementCtaAnchorLandscapeDiagnosticsJson}`
  )
  console.log(`placement-message-landscape-diagnostics=${result.outputPaths.placementMessageLandscapeDiagnosticsJson}`)
  console.log(
    `placement-role-conflict-landscape-diagnostics=${result.outputPaths.placementRoleConflictLandscapeDiagnosticsJson}`
  )
  console.log(`square-role-conflict-diagnostics=${result.outputPaths.squareRoleConflictDiagnosticsJson}`)
  console.log(`square-cta-vs-text-diagnostics=${result.outputPaths.squareCtaVsTextDiagnosticsJson}`)
  console.log(`square-cta-vs-subtitle-diagnostics=${result.outputPaths.squareCtaVsSubtitleDiagnosticsJson}`)
  console.log(`master-residual-blockers=${result.outputPaths.masterResidualBlockersJson}`)
  console.log(
    `landscape-text-height-production-experiment=${result.outputPaths.landscapeTextHeightProductionExperimentJson}`
  )
  console.log(`validated-unlock-classes=${result.outputPaths.validatedUnlockClassesJson}`)
  console.log(`next-unlock-candidates=${result.outputPaths.nextUnlockCandidatesJson}`)
  console.log(
    `cases=${result.rows.length}, positive-rejected=${result.tuningSummary.totals.positiveRejectedCandidateCount}, single-gate=${result.tuningSummary.totals.singleGateBlockedCount}`
  )
  console.log(
    `role-placement rejects=${result.placementSoftPolicyDiagnostics.totals.totalRolePlacementRejections}, soft-unlocked cases=${result.placementSoftPolicyDiagnostics.totals.unlockedCaseCount}`
  )
  if (result.placementRoleHotspots.dominantRoleFrequency.length) {
    console.log('dominant violating roles:')
    console.table(result.placementRoleHotspots.dominantRoleFrequency.slice(0, 5))
  }
  console.log(
    `square-display image-dominant=${result.placementImageSquareDiagnostics.totals.dominantImageCount}, just-outside=${result.placementImageSquareDiagnostics.totals.justOutsideZoneCount}`
  )
  console.log(
    `landscape-display image-dominant=${result.placementImageLandscapeDiagnostics.totals.dominantImageCount}, policy-milder=${result.placementImageLandscapeDiagnostics.totals.wouldBecomeMilderCount}`
  )
  console.log(
    `landscape near-miss eligible=${result.landscapeImageNearMissExperiment.totals.eligibleCandidates}, flipped-cases=${result.landscapeImageNearMissExperiment.totals.flippedCases}`
  )
  console.log(
    `landscape text-height override eligible=${result.landscapeTextHeightProductionExperiment.totals.eligibleCandidates}, applied=${result.landscapeTextHeightProductionExperiment.totals.appliedOverrides}, flipped-cases=${result.landscapeTextHeightProductionExperiment.totals.flippedCases}`
  )
  const validatedClass = result.validatedUnlockClasses.classes[0]
  if (validatedClass) {
    console.log(
      `validated unlock class=${validatedClass.unlockClassKey}, validated=${validatedClass.validated}, flipped=${validatedClass.flippedCases.length}`
    )
  }
  if (result.nextUnlockCandidates.topRecommendedNextClass) {
    console.log(
      `next unlock class=${result.nextUnlockCandidates.topRecommendedNextClass.recommendedUnlockClass}, priority=${result.nextUnlockCandidates.topRecommendedNextClass.recommendedUnlockPriority}, cases=${result.nextUnlockCandidates.topRecommendedNextClass.caseCount}`
    )
  } else {
    console.log('next unlock class=none-ready')
  }
  console.log(
    `square-display text-dominant=${result.placementTextSquareDiagnostics.totals.dominantTextCount}, title-only-milder=${result.placementTextSquareDiagnostics.totals.titleOnlyMilderThanCombinedCount}, attachment-aware-milder=${result.placementTextSquareDiagnostics.totals.wouldBecomeMilderCount}`
  )
  console.log(
    `landscape-display badge-dominant=${result.placementBadgeLandscapeDiagnostics.totals.dominantBadgeCount}, acceptable-if-badge-ignored=${result.placementBadgeLandscapeDiagnostics.totals.acceptableIfBadgeIgnoredCount}`
  )
  console.log(
    `landscape-display text-blocked=${result.placementTextLandscapeDiagnostics.totals.dominantTextCount}, cta-detached=${result.placementTextLandscapeDiagnostics.totals.ctaDetachedMainCount}, attachment-aware-milder=${result.placementTextLandscapeDiagnostics.totals.wouldBecomeMilderCount}`
  )
  console.log(
    `landscape-display cta-dominant=${result.placementCtaLandscapeDiagnostics.totals.dominantCtaCount}, gap-driven=${result.placementCtaLandscapeDiagnostics.totals.gapDrivenCount}, cta-policy-milder=${result.placementCtaLandscapeDiagnostics.totals.wouldBecomeMilderCount}`
  )
  console.log(
    `landscape-display cta-anchor-conflict=${result.placementCtaAnchorLandscapeDiagnostics.totals.ctaAnchorConflictCount}, anchor-milder=${result.placementCtaAnchorLandscapeDiagnostics.totals.wouldBecomeMilderCount}, near-unlock=${result.placementCtaAnchorLandscapeDiagnostics.totals.nearUnlockCandidateCount}`
  )
  console.log(
    `landscape-display message-blocked=${result.placementMessageLandscapeDiagnostics.totals.dominantMessageBlockerCount}, title-only-milder=${result.placementMessageLandscapeDiagnostics.totals.titleOnlyMilderThanCombinedCount}, oversize=${result.placementMessageLandscapeDiagnostics.totals.messageClusterOversizeCount}`
  )
  console.log(
    `landscape-display role-conflict text-dominant=${result.placementRoleConflictLandscapeDiagnostics.totals.textDominantCount}, cta-dominant=${result.placementRoleConflictLandscapeDiagnostics.totals.ctaDominantCount}, close-to-acceptable=${result.placementRoleConflictLandscapeDiagnostics.totals.closeToAcceptableCount}`
  )
  console.log(
    `square-display role-conflict cases=${result.squareRoleConflictDiagnostics.totals.squareDisplayBlockedCases}, close-to-acceptable=${result.squareRoleConflictDiagnostics.totals.closeToAcceptableCount}, single-gate=${result.squareRoleConflictDiagnostics.totals.singleGateNearMissCount}`
  )
  console.log(
    `square-display cta-vs-text cases=${result.squareCtaVsTextDiagnostics.totals.squareDisplayBlockedCases}, close-to-acceptable=${result.squareCtaVsTextDiagnostics.totals.closeToAcceptableCount}, single-gate=${result.squareCtaVsTextDiagnostics.totals.singleGateNearMissCount}`
  )
  console.log(
    `square-display cta-vs-subtitle cases=${result.squareCtaVsSubtitleDiagnostics.totals.squareDisplayBlockedCases}, inflation-driven=${result.squareCtaVsSubtitleDiagnostics.totals.subtitleInflationDrivenCount}, action-band-mismatch=${result.squareCtaVsSubtitleDiagnostics.totals.actionBandMismatchCount}, overlap-risk=${result.squareCtaVsSubtitleDiagnostics.totals.realOverlapRiskCount}`
  )
  if (result.masterResidualBlockers.blockerFamilyFrequency.length) {
    console.log('master residual blocker families:')
    console.table(result.masterResidualBlockers.blockerFamilyFrequency.slice(0, 5))
  }

  if (result.tuningSummary.blockerFrequency.bestRejectedCandidates.length) {
    console.log('top blockers:')
    console.table(result.tuningSummary.blockerFrequency.bestRejectedCandidates.slice(0, 5))
  }

  if (result.tuningSummary.byCategory.length) {
    console.log('top categories needing tuning:')
    console.table(
      [...result.tuningSummary.byCategory]
        .sort((left, right) => {
          if (right.positiveRejectedCandidateCount !== left.positiveRejectedCandidateCount) {
            return right.positiveRejectedCandidateCount - left.positiveRejectedCandidateCount
          }
          if (right.singleGateBlockedCount !== left.singleGateBlockedCount) {
            return right.singleGateBlockedCount - left.singleGateBlockedCount
          }
          return left.key.localeCompare(right.key)
        })
        .slice(0, 5)
    )
  }

  if (result.tuningSummary.reviewFirst.length) {
    console.log('review first:')
    console.table(
      result.tuningSummary.reviewFirst.slice(0, 10).map((row) => ({
        caseId: row.caseId,
        category: row.category,
        format: row.format,
        priority: row.reviewPriority,
        delta: row.delta,
        whyReview: row.whyReview,
      }))
    )
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const result = await exportCaseReviewTable({
    root: options.root,
    reviewQueueSize: options.reviewQueueSize,
    markdownLimit: options.markdownLimit,
  })
  printSummary(result)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
