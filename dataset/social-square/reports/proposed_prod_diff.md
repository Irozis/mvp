# Proposed Prod Diff - social-square overlay policy

## Scope
This is a proposed diff only. It is not applied to production logic yet.

Reason:
- `headline/subtitle maxOverlapRatio` is directly comparable to the current production metric in [overlayPolicies.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/overlayPolicies.ts) and [validation.ts](/C:/Users/Fedelesh_dm/mvp/src/lib/validation.ts).
- `safeTextScoreMin` and `safeCoverageMin` in this calibration pass are measured from scrubbed local background sampling inside annotated text boxes. Production currently computes overlay safety from `imageAnalysis.safeTextAreas`, so the semantics are related but not identical.
- `safeAreaCoverageMin` is directly comparable in spirit, but the calibrated number is far below the current production rule and would sharply loosen the guard if adopted blindly.

## Recommended staging

### Stage 1 - safe to test in production
Apply only:
- `headline maxOverlapRatio: 0.24 -> 0.05`
- `subtitle maxOverlapRatio: 0.22 -> 0.03`

Keep unchanged for now:
- `logo maxOverlapRatio: 0.06`
- `badge maxOverlapRatio: 0.08`
- `safeTextScoreMin: 0.58`
- `safeCoverageMin: 0.70`
- `safeAreaCoverageMin: 0.85`

Why:
- overlap ratios for headline/subtitle were measured directly from the dataset and align with the current prod overlap definition.
- logo/badge has insufficient data.
- safe-area related thresholds need one more alignment pass against prod `safeTextAreas` semantics.

### Stage 2 - after semantic alignment
Evaluate whether production `imageAnalysis.safeTextAreas` should be recalibrated or whether calibration should compute the exact same safe-area metric as production.

Only after that, revisit:
- `safeTextScoreMin`
- `safeCoverageMin`
- `safeAreaCoverageMin`

## Proposed code diff

```diff
--- a/src/lib/overlayPolicies.ts
+++ b/src/lib/overlayPolicies.ts
@@
   'social-square': {
     'square-hero-overlay': {
       safeTextScoreMin: 0.58,
       safeCoverageMin: 0.7,
       safeAreaCoverageMin: 0.85,
       maxOverlapByKind: {
-        headline: 0.24,
-        subtitle: 0.22,
+        headline: 0.05,
+        subtitle: 0.03,
         logo: 0.06,
         badge: 0.08,
       },
     },
   },
```

## Notes from calibration
- dataset inventory:
  - core: 7
  - stress: 18
  - reject: 1
- measured candidates:
  - headline maxOverlapRatio: `0.05`
  - subtitle maxOverlapRatio: `0.03`
  - logo maxOverlapRatio: insufficient data
  - badge maxOverlapRatio: insufficient data
  - safeTextScoreMin: `0.84` candidate, but calibration-specific semantics
  - safeCoverageMin: `0.67` candidate, but calibration-specific semantics
  - safeAreaCoverageMin: `0.29` candidate, but too risky to port directly

## Suggested next move
1. Apply Stage 1 diff only.
2. Re-run real hero cases in the UI.
3. Compare false rejects / false passes against:
   - [report.md](/C:/Users/Fedelesh_dm/mvp/dataset/social-square/reports/report.md)
   - [threshold_candidates.json](/C:/Users/Fedelesh_dm/mvp/dataset/social-square/reports/threshold_candidates.json)
4. Only then decide whether to align prod safe-area scoring to the calibration method, or re-run calibration using prod-safe-area semantics.
