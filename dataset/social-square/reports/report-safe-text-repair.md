# Social Square Safe-Text Repair

## Visual previews
![Repair before](C:\Users\Fedelesh_dm\mvp\dataset\social-square\reports\contact-sheet-safe-text-before.svg)

![Repair after](C:\Users\Fedelesh_dm\mvp\dataset\social-square\reports\contact-sheet-safe-text-after.svg)

## What changed in logic
- square overlay now runs a denser local safe-text search across multiple placements instead of trusting one safe area
- the square near-miss pass retries with narrower text width, tighter subtitle height, and micro-shifts inside the lower-left safe region
- thresholds remain unchanged; this pass only changes square repair/layout behavior

## Group 6 / 12 / 15 status
### Group 6
- after outcome: fail
- strategy: `soft-square-reflow`
- before: headline 0.0127 > 0.0125; subtitle 0.0162 > 0.015
- after: safeTextScore 0.8633 < 0.87

### Group 12
- after outcome: fail
- strategy: `none`
- before: safeTextScore 0.859 < 0.87
- after: safeTextScore 0.859 < 0.87

### Group 15
- after outcome: fail
- strategy: `square-near-miss-safe-text`
- before: safeAreaCoverage 0 < 0.22
- after: safeTextScore 0.8636 < 0.87

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
- after: safeTextScore 0.8636 < 0.87
- strategy: `square-near-miss-safe-text`
- failure taxonomy: scoring failure
- main reasons: safeAreaCoverage 0 < 0.22
- issue cause: thresholds

## Improved still-fail cases
- Group 10: subtitle 0.017 > 0.015 -> pass
- Group 20: subtitle 0.1527 > 0.015; badge 0.0179 > 0.005 -> pass
- Group 21: headline 0.019 > 0.0125; subtitle 0.0282 > 0.015 -> pass
- Group 22: headline 0.0486 > 0.0125; safeTextScore 0.7579 < 0.87 -> pass

## Remaining fail cases
- Group 6: safeTextScore 0.8633 < 0.87
- Group 12: safeTextScore 0.859 < 0.87
- Group 15: safeTextScore 0.8636 < 0.87
- Group 3: subtitle 0.0428 > 0.015
- Group 24: headline 0.0241 > 0.0125
- Group 5: safeTextScore 0.7807 < 0.87; safeAreaCoverage 0 < 0.22
- Group 18: headline 0.0487 > 0.0125; safeTextScore 0.823 < 0.87
- Group 2: headline 0.0206 > 0.0125

## Suspicious passes after repair
- Group 10: pass but near gate
- Group 20: pass but near gate
- Group 21: pass but near gate
- Group 22: pass but near gate
- Group 23: pass but near gate [inspected suspicious pass]
- Group 7: pass but near gate
- Group 13: pass but near gate
- Group 19: pass but near gate

## Effect on suspicious passes
- suspicious passes after repair: 8
- suspicious passes that were already present before repair: 4
- suspicious passes created by this repair pass: 4

## Regressions
- none

## Recommendation
- keep current square thresholds unchanged
- keep the social-square policy as-is
- use this near-miss pass only as a square repair improvement, not as a threshold rewrite
- Group 23 still needs manual review as a suspicious pass, but this pass should not block the square repair rollout
