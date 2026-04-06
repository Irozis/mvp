# Social Square Apply Preview

## Target location
- file: [overlayPolicies.ts](C:\Users\Fedelesh_dm\mvp\src\lib\overlayPolicies.ts)
- social-square block line: 18
- square-hero-overlay line: 19

## Before snippet
```ts
  'social-square': {
    'square-hero-overlay': {
      safeTextScoreMin: 0.58,
      safeCoverageMin: 0.7,
      safeAreaCoverageMin: 0.85,
      maxOverlapByKind: {
        headline: 0.24,
        subtitle: 0.22,
        logo: 0.06,
        badge: 0.08,
      },
    },
  },
```

## After snippet
```ts
  'social-square': {
    'square-hero-overlay': {
      safeTextScoreMin: 0.87,
      // safeCoverageMin stays diagnostic-only for now; keep current gating behavior unchanged until a richer policy shape exists
      safeCoverageMin: 0.7,
      safeAreaCoverageMin: 0.22,
      maxOverlapByKind: {
        headline: 0.0125,
        subtitle: 0.015,
        logo: 0.06, // unchanged: insufficient_data
        badge: 0.005,
      },
    },
  },
```

## Expected behavior delta on current dataset
- current core-clean pass rate: 0.1429 (1/7)
- provisional core-clean pass rate: 0.8571 (6/7)
- current stress total pass rate: 0.0588 (1/17)
- provisional stress total pass rate: 0.3529 (6/17)
- duplicate handling: Group 1 excluded from comparison; Group 16 kept as canonical stress case

## Changed pass/fail cases
- Group 4 (core, clean): fail -> pass | before: safeAreaCoverage 0.2929 < 0.85
- Group 7 (core, clean): fail -> pass | before: safeAreaCoverage 0.3971 < 0.85
- Group 8 (core, clean): fail -> pass | before: safeAreaCoverage 0.2254 < 0.85
- Group 9 (core, clean): fail -> pass | before: safeAreaCoverage 0.5484 < 0.85
- Group 23 (core, clean): fail -> pass | before: safeAreaCoverage 0.4138 < 0.85
- Group 11 (stress, clean): fail -> pass | before: safeAreaCoverage 0.8301 < 0.85
- Group 13 (stress, clean): fail -> pass | before: safeAreaCoverage 0.4615 < 0.85
- Group 16 (stress, clean): fail -> pass | before: safeAreaCoverage 0.4733 < 0.85
- Group 17 (stress, clean): fail -> pass | before: safeAreaCoverage 0.8242 < 0.85
- Group 19 (stress, clean): fail -> pass | before: safeAreaCoverage 0.6305 < 0.85

## Duplicate handling
- Group 1 excluded as duplicate of Group 16. manual review marked Group 1 and Group 16 as duplicates; keep Group 16 as the canonical stress case. Canonical case status: current=fail, provisional=pass.

## safeCoverageMin handling
- current gating value in production snippet: 0.7
- provisional diagnostic value: 1
- proposed handling: keep `safeCoverageMin` out of gating for now and treat it as diagnostic-only
- why:
  - saturated at 1
  - low discriminative power
  - little contribution to ranking/pass-fail separation

## Rollback snippet
```ts
  'social-square': {
    'square-hero-overlay': {
      safeTextScoreMin: 0.58,
      safeCoverageMin: 0.7,
      safeAreaCoverageMin: 0.85,
      maxOverlapByKind: {
        headline: 0.24,
        subtitle: 0.22,
        logo: 0.06,
        badge: 0.08,
      },
    },
  },
```

## Final recommendation
- status: acceptable for controlled apply
- known caveats:
  - logo insufficient_data and remains unchanged
  - safeCoverageMin stays diagnostic-only
  - duplicate case Group 1 removed from evaluation; Group 16 remains as the canonical stress case

## Notes
- This is preview-only and was not applied.
- Logo remains unchanged because current fitting still marks it as insufficient_data.
