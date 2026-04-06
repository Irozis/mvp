# Marketplace-card Repair Winner Preselection

## Old decision order

`marketplace-card` repair already had a widened retained candidate set, but each retained candidate was still compared against the current weak baseline immediately under repair scoring.

That meant stronger candidates could be rejected as:

- no structural gain
- no score gain
- same-scene / no-op

before the retained set had surfaced its true internal winner.

## New decision order

For `marketplace-card` only:

1. build the widened retained repair set
2. compare retained candidates against each other with preview-style winner ordering
3. pick the strongest retained candidate first
4. apply repair safety gating only to that chosen winner against the current baseline

## What stayed unchanged

- no global ranking rewrite
- no global `computeScoreTrust` rewrite
- no validation/rules changes
- no widening for other formats

The change is narrowly scoped to marketplace-card repair decision ordering.
