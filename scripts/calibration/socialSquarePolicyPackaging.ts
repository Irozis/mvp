import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type CandidateMetric = {
  metric: string
  label: string
  direction: 'max' | 'min'
  threshold: number
  basis: string
  basisValue: number
  sufficient: boolean
}

type CandidateSet = {
  name: 'strict' | 'balanced' | 'lenient'
  metrics: CandidateMetric[]
}

type ThresholdFittingReport = {
  candidateSets: CandidateSet[]
  recommendation: {
    recommended: 'strict' | 'balanced' | 'lenient'
    reason: string
  }
  warnings?: string[]
}

const ROOT = process.cwd()
const REPORTS_ROOT = path.join(ROOT, 'dataset', 'social-square', 'reports')

function metricMap(set: CandidateSet) {
  return new Map(set.metrics.map((metric) => [metric.label, metric]))
}

function buildSuggestedPatch(proposal: {
  headline: CandidateMetric
  subtitle: CandidateMetric
  badge: CandidateMetric
  safeTextScore: CandidateMetric
  safeAreaCoverage: CandidateMetric
}) {
  return `// Suggested manual patch for src/lib/overlayPolicies.ts
'social-square': {
  'square-hero-overlay': {
    safeTextScoreMin: ${proposal.safeTextScore.threshold},
    // safeCoverageMin intentionally stays out of gating; keep as diagnostic only
    safeAreaCoverageMin: ${proposal.safeAreaCoverage.threshold},
    maxOverlapByKind: {
      headline: ${proposal.headline.threshold},
      subtitle: ${proposal.subtitle.threshold},
      logo: 0.06, // insufficient_data in current fitting pass
      badge: ${proposal.badge.threshold},
    },
  },
},`
}

function buildReportMarkdown(input: {
  recommendedSet: CandidateSet
  recommendationReason: string
  proposal: ReturnType<typeof metricMap>
  safeCoverageMetric: CandidateMetric | undefined
  warnings: string[]
  patchSnippet: string
}) {
  const required = [
    input.proposal.get('headline maxOverlapRatio'),
    input.proposal.get('subtitle maxOverlapRatio'),
    input.proposal.get('badge maxOverlapRatio'),
    input.proposal.get('safeTextScoreMin'),
    input.proposal.get('safeAreaCoverageMin'),
  ].filter(Boolean) as CandidateMetric[]

  const table = `| Policy field | Threshold | Basis | Basis value |
| --- | ---: | --- | ---: |
${required
  .map((metric) => `| ${metric.label} | ${metric.threshold} | ${metric.basis} | ${metric.basisValue} |`)
  .join('\n')}`

  return `# Social Square Provisional Policy

## Recommendation
- chosen set: ${input.recommendedSet.name}
- reason: ${input.recommendationReason}

## Provisional gating thresholds
${table}

## Diagnostic-only metric
- safeCoverageMinDiagnostic: ${input.safeCoverageMetric?.threshold ?? 'n/a'}
- reason:
  - saturated at 1 across core-clean
  - low discriminative power
  - little contribution to ranking and pass/fail separation in the fitting pass

## Logo
- status: insufficient_data
- note: keep logo unchanged in production policy until more clean signal is available

## Suggested patch snippet
\`\`\`ts
${input.patchSnippet}
\`\`\`

## Warnings
${input.warnings.length ? input.warnings.map((warning) => `- ${warning}`).join('\n') : '- none'}

## Notes
- This is a provisional packaging pass only.
- No production config was modified automatically.
- safeCoverageMin is explicitly excluded from gating in this proposal.
`
}

async function main() {
  await mkdir(REPORTS_ROOT, { recursive: true })

  const thresholdFitting = JSON.parse(
    await readFile(path.join(REPORTS_ROOT, 'threshold-fitting.json'), 'utf8')
  ) as ThresholdFittingReport

  const recommendedSetName = thresholdFitting.recommendation.recommended
  const recommendedSet = thresholdFitting.candidateSets.find((set) => set.name === recommendedSetName)
  if (!recommendedSet) {
    throw new Error(`Recommended candidate set "${recommendedSetName}" was not found in threshold-fitting.json.`)
  }

  const proposal = metricMap(recommendedSet)
  const headline = proposal.get('headline maxOverlapRatio')
  const subtitle = proposal.get('subtitle maxOverlapRatio')
  const badge = proposal.get('badge maxOverlapRatio')
  const safeTextScore = proposal.get('safeTextScoreMin')
  const safeCoverage = proposal.get('safeCoverageMin')
  const safeAreaCoverage = proposal.get('safeAreaCoverageMin')

  if (!headline || !subtitle || !badge || !safeTextScore || !safeCoverage || !safeAreaCoverage) {
    throw new Error('Recommended set is missing one or more required social-square policy metrics.')
  }

  const patchSnippet = buildSuggestedPatch({
    headline,
    subtitle,
    badge,
    safeTextScore,
    safeAreaCoverage,
  })

  const provisionalPolicy = {
    source: {
      thresholdFitting: path.join(REPORTS_ROOT, 'threshold-fitting.json'),
      selectedSet: recommendedSet.name,
      recommendationReason: thresholdFitting.recommendation.reason,
    },
    gating: {
      headline: {
        maxOverlapRatio: headline.threshold,
        basis: headline.basis,
        basisValue: headline.basisValue,
      },
      subtitle: {
        maxOverlapRatio: subtitle.threshold,
        basis: subtitle.basis,
        basisValue: subtitle.basisValue,
      },
      badge: {
        maxOverlapRatio: badge.threshold,
        basis: badge.basis,
        basisValue: badge.basisValue,
      },
      safeTextScoreMin: {
        value: safeTextScore.threshold,
        basis: safeTextScore.basis,
        basisValue: safeTextScore.basisValue,
      },
      safeAreaCoverageMin: {
        value: safeAreaCoverage.threshold,
        basis: safeAreaCoverage.basis,
        basisValue: safeAreaCoverage.basisValue,
      },
    },
    safeCoverageMinDiagnostic: {
      value: safeCoverage.threshold,
      basis: safeCoverage.basis,
      basisValue: safeCoverage.basisValue,
      gating: false,
      reason: [
        'saturated at 1',
        'low discriminative power',
        'little contribution to ranking/pass-fail separation',
      ],
    },
    logo: 'insufficient_data',
    suggestedPatchSnippet: patchSnippet,
    warnings: thresholdFitting.warnings ?? [],
  }

  await writeFile(
    path.join(REPORTS_ROOT, 'provisional-policy.json'),
    `${JSON.stringify(provisionalPolicy, null, 2)}\n`,
    'utf8'
  )
  await writeFile(
    path.join(REPORTS_ROOT, 'report-policy.md'),
    buildReportMarkdown({
      recommendedSet,
      recommendationReason: thresholdFitting.recommendation.reason,
      proposal,
      safeCoverageMetric: safeCoverage,
      warnings: thresholdFitting.warnings ?? [],
      patchSnippet,
    }),
    'utf8'
  )

  console.log(`Packaged provisional social-square policy from ${recommendedSet.name} candidate set`)
  console.log(`Artifacts:`)
  console.log(`- ${path.join(REPORTS_ROOT, 'provisional-policy.json')}`)
  console.log(`- ${path.join(REPORTS_ROOT, 'report-policy.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
