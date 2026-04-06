# Marketplace-card First Accepted Repair Winner Uplift

## Weak first-winner diagnosis

For the fresh default / no-image `marketplace-card` case, the repair pipeline was already structurally correct:

- master-based regeneration worked
- widened repair candidates were present
- internal retained-candidate preselection was active

But the first visible repair result was still weak because the first fix attempt could end with multiple accepted repair attempts that tied under repair scoring.

## Root cause

In the no-image case, those accepted attempts often shared the same:

- structural tier
- preview-style score
- repair-style score
- issue profile

That meant the final accepted winner fell back to generic accepted-attempt ordering, which surfaced a blander early attempt before a stronger `split-vertical` / denser card-style candidate.

## Narrow fix

For `marketplace-card` only, and only in the no-image repair case:

1. keep the existing widened retained candidate set
2. keep internal winner preselection per repair strategy
3. when multiple accepted repair attempts still tie, apply a narrow no-image marketplace-card tie-break
4. prefer fuller marketplace-card structures such as `split-vertical` and `dense-information` ahead of `compact-minimal`

## Unchanged

- no global ranking rewrite
- no validation/rules change
- no new candidate-supply widening
- no change to other formats
