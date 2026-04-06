# Social Square Provisional Policy

## Recommendation
- chosen set: lenient
- reason: no set fully preserves core-clean, so the recommendation falls back to the fewest core-clean rejects

## Provisional gating thresholds
| Policy field | Threshold | Basis | Basis value |
| --- | ---: | --- | ---: |
| headline maxOverlapRatio | 0.0125 | p95 | 0.0104 |
| subtitle maxOverlapRatio | 0.015 | p95 | 0.015 |
| badge maxOverlapRatio | 0.005 | p95 | 0.0028 |
| safeTextScoreMin | 0.87 | min (min=0.8798, p10=0.9126, p15=0.929, robust=0.9088) | 0.8798 |
| safeAreaCoverageMin | 0.22 | min (min=0.2254, p10=0.2659, p15=0.2861, robust=0.2466) | 0.2254 |

## Diagnostic-only metric
- safeCoverageMinDiagnostic: 1
- reason:
  - saturated at 1 across core-clean
  - low discriminative power
  - little contribution to ranking and pass/fail separation in the fitting pass

## Logo
- status: insufficient_data
- note: keep logo unchanged in production policy until more clean signal is available

## Suggested patch snippet
```ts
// Suggested manual patch for src/lib/overlayPolicies.ts
'social-square': {
  'square-hero-overlay': {
    safeTextScoreMin: 0.87,
    // safeCoverageMin intentionally stays out of gating; keep as diagnostic only
    safeAreaCoverageMin: 0.22,
    maxOverlapByKind: {
      headline: 0.0125,
      subtitle: 0.015,
      logo: 0.06, // insufficient_data in current fitting pass
      badge: 0.005,
    },
  },
},
```

## Warnings
- safeCoverageMin: core-clean signal is saturated at 1, so this metric has low discriminative power for fitting
- logo remains insufficient and is intentionally excluded from fitting

## Notes
- This is a provisional packaging pass only.
- No production config was modified automatically.
- safeCoverageMin is explicitly excluded from gating in this proposal.
