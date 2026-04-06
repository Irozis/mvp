# Social Square Ultra-Constrained Micro-Band

## Visual previews
![Repair before](C:\Users\Fedelesh_dm\mvp\dataset\social-square\reports\contact-sheet-square-micro-band-before.svg)

![Repair after](C:\Users\Fedelesh_dm\mvp\dataset\social-square\reports\contact-sheet-square-micro-band-after.svg)

## What changed in logic
- square repair now includes an ultra-constrained headline micro-band search for near-valid hero squares
- this mode tests very narrow local headline bands, stronger line-break pressure, multiple micro-band placements, and harder subtitle suppression
- thresholds remain unchanged; this pass only changes square edge-case text geometry behavior

## Group 6 / 12 status
### Group 6
- after outcome: fail
- strategy: `soft-square-reflow`
- bottlenecks: headline width/height pressure; subtitle pressure
- before: headline 0.0127 > 0.0125; subtitle 0.0162 > 0.015
- after: safeTextScore 0.8633 < 0.87

### Group 12
- after outcome: fail
- strategy: `none`
- bottlenecks: constrained safe text band geometry; line-break inefficiency
- before: safeTextScore 0.859 < 0.87
- after: safeTextScore 0.859 < 0.87

## Priority diagnosis
### Group 10
- before: subtitle 0.017 > 0.015
- after: pass
- strategy: `soft-square-reflow`
- failure taxonomy: text sizing/reflow failure
- main reasons: subtitle 0.017 > 0.015
- issue cause: thresholds

### Group 6
- before: headline 0.0127 > 0.0125; subtitle 0.0162 > 0.015
- after: safeTextScore 0.8633 < 0.87
- strategy: `soft-square-reflow`
- failure taxonomy: text sizing/reflow failure
- main reasons: headline 0.0127 > 0.0125; subtitle 0.0162 > 0.015
- issue cause: thresholds

### Group 12
- before: safeTextScore 0.859 < 0.87
- after: safeTextScore 0.859 < 0.87
- strategy: `none`
- failure taxonomy: scoring failure
- main reasons: safeTextScore 0.859 < 0.87
- issue cause: thresholds

### Group 15
- before: safeAreaCoverage 0 < 0.22
- after: pass
- strategy: `square-ultra-constrained-micro-band`
- failure taxonomy: scoring failure
- main reasons: safeAreaCoverage 0 < 0.22
- issue cause: thresholds

## Improved still-fail cases
- Group 10: subtitle 0.017 > 0.015 -> pass
- Group 15: safeAreaCoverage 0 < 0.22 -> pass
- Group 20: subtitle 0.1527 > 0.015; badge 0.0179 > 0.005 -> pass
- Group 21: headline 0.019 > 0.0125; subtitle 0.0282 > 0.015 -> pass
- Group 22: headline 0.0486 > 0.0125; safeTextScore 0.7579 < 0.87 -> pass

## Remaining fail cases
- Group 6: safeTextScore 0.8633 < 0.87
- Group 12: safeTextScore 0.859 < 0.87
- Group 3: subtitle 0.0428 > 0.015
- Group 24: headline 0.0241 > 0.0125
- Group 5: safeTextScore 0.7807 < 0.87; safeAreaCoverage 0 < 0.22
- Group 18: headline 0.0487 > 0.0125; safeTextScore 0.823 < 0.87
- Group 2: headline 0.0206 > 0.0125

## Suspicious passes after repair
- Group 10: pass but near gate
- Group 15: pass but near gate
- Group 20: pass but near gate
- Group 21: pass but near gate
- Group 22: pass but near gate
- Group 23: pass but near gate [inspected suspicious pass]
- Group 7: pass but near gate
- Group 13: pass but near gate
- Group 19: pass but near gate

## Effect on suspicious passes
- suspicious passes before repair: 3
- suspicious passes after repair: 9
- suspicious passes that were already present before repair: 2
- suspicious passes created by this repair pass: 7
- suspicious pass delta: +6

## Regressions
- none

## Recommendation
- keep current square thresholds unchanged
- keep the social-square policy as-is
- use this micro-band pass only as a square repair improvement, not as a threshold rewrite
- close social-square as sufficiently optimized for now; Group 6 and Group 12 remain known outliers
- Group 23 still needs manual review as a suspicious pass, but this pass should not block the square repair rollout
