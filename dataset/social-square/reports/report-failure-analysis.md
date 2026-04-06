# Social Square Failure Analysis

## Inputs
- visual preview: [report-visual-preview.md](C:\Users\Fedelesh_dm\mvp\dataset\social-square\reports\report-visual-preview.md)
- apply preview: [report-apply-preview.md](C:\Users\Fedelesh_dm\mvp\dataset\social-square\reports\report-apply-preview.md)
- current policy: [overlayPolicies.ts](C:\Users\Fedelesh_dm\mvp\src\lib\overlayPolicies.ts)

## Still fail taxonomy
- text sizing/reflow failure: 4
- ambiguous dataset issue: 2
- invalid/stress-like composition: 4
- scoring failure: 2

## Suspicious pass taxonomy
- duplicate/noisy signal: 2
- acceptable soft pass: 3
- likely false pass: 1
- stress case now intentionally allowed: 6

## Still fail case review
- Group 10: still-fail; taxonomy=text sizing/reflow failure; cause=thresholds; reasons=subtitle 0.017 > 0.015
- Group 5: still-fail; taxonomy=ambiguous dataset issue; cause=dataset classification; reasons=safeTextScore 0.7807 < 0.87; safeAreaCoverage 0 < 0.22
- Group 18: still-fail; taxonomy=ambiguous dataset issue; cause=dataset classification; reasons=headline 0.0487 > 0.0125; safeTextScore 0.823 < 0.87
- Group 2: still-fail; taxonomy=text sizing/reflow failure; cause=thresholds; reasons=headline 0.0206 > 0.0125
- Group 3: still-fail; taxonomy=invalid/stress-like composition; cause=layout engine; reasons=subtitle 0.0428 > 0.015
- Group 6: still-fail; taxonomy=text sizing/reflow failure; cause=thresholds; reasons=headline 0.0127 > 0.0125; subtitle 0.0162 > 0.015
- Group 12: still-fail; taxonomy=scoring failure; cause=thresholds; reasons=safeTextScore 0.859 < 0.87
- Group 15: still-fail; taxonomy=scoring failure; cause=thresholds; reasons=safeAreaCoverage 0 < 0.22
- Group 20: still-fail; taxonomy=invalid/stress-like composition; cause=layout engine; reasons=subtitle 0.1527 > 0.015; badge 0.0179 > 0.005
- Group 21: still-fail; taxonomy=invalid/stress-like composition; cause=layout engine; reasons=headline 0.019 > 0.0125; subtitle 0.0282 > 0.015
- Group 22: still-fail; taxonomy=invalid/stress-like composition; cause=layout engine; reasons=headline 0.0486 > 0.0125; safeTextScore 0.7579 < 0.87
- Group 24: still-fail; taxonomy=text sizing/reflow failure; cause=layout engine; reasons=headline 0.0241 > 0.0125

## Suspicious pass case review
- Group 4: suspicious-pass; taxonomy=duplicate/noisy signal; cause=thresholds; reasons=suspicious flag is mostly heuristic noise rather than a real policy edge
- Group 7: suspicious-pass; taxonomy=acceptable soft pass; cause=thresholds; reasons=policy relaxation looks acceptable on this case
- Group 8: suspicious-pass; taxonomy=acceptable soft pass; cause=thresholds; reasons=policy relaxation looks acceptable on this case
- Group 9: suspicious-pass; taxonomy=acceptable soft pass; cause=thresholds; reasons=policy relaxation looks acceptable on this case
- Group 23: suspicious-pass; taxonomy=likely false pass; cause=thresholds; reasons=metric sits very close to the provisional gate
- Group 25: suspicious-pass; taxonomy=duplicate/noisy signal; cause=thresholds; reasons=suspicious flag is mostly heuristic noise rather than a real policy edge
- Group 11: suspicious-pass; taxonomy=stress case now intentionally allowed; cause=thresholds; reasons=stress case now passes under provisional square overlay policy
- Group 13: suspicious-pass; taxonomy=stress case now intentionally allowed; cause=thresholds; reasons=stress case now passes under provisional square overlay policy
- Group 14: suspicious-pass; taxonomy=stress case now intentionally allowed; cause=thresholds; reasons=stress case now passes under provisional square overlay policy
- Group 16: suspicious-pass; taxonomy=stress case now intentionally allowed; cause=thresholds; reasons=canonical duplicate stress case intentionally reviewed as pass
- Group 17: suspicious-pass; taxonomy=stress case now intentionally allowed; cause=thresholds; reasons=stress case now passes under provisional square overlay policy
- Group 19: suspicious-pass; taxonomy=stress case now intentionally allowed; cause=thresholds; reasons=stress case now passes under provisional square overlay policy

## Recommendation
- leave thresholds unchanged and improve repair/layout logic next

## Rationale
- Most remaining failures are stress-like or composition/text-structure problems, not simple threshold misses.
- The suspicious-pass set contains a mix of acceptable soft passes and heuristic-noise cases, which points more strongly to review/repair improvements than to immediate threshold tightening.
- No regressions were observed in the current preview batch.
