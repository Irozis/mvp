# Marketplace-card Repair Candidate Widening

## What changed

The old `marketplace-card` repair path widened at the strategy level but still collapsed too early:

1. `attemptGuidedRegenerationRepair(...)` built only a few guided regeneration strategies.
2. Each strategy called `generateVariant(...)`.
3. `generateVariant(...)` returned one selected candidate for that seed.

For the real UI case, those different repair seeds collapsed into the same weak `compact-minimal` result, so Fix/Fix again never entered the stronger candidate space already proven by exploration.

## New repair flow

For `marketplace-card` only, repair regeneration now reuses the widened preview candidate machinery directly:

1. build a preview-style candidate set for each guided repair strategy
2. retain only a small bounded top subset per strategy
3. evaluate those retained candidates through the existing repair acceptance path

This keeps the current before/after acceptance logic intact while giving repair access to more than one candidate per seed.

## Bounds

- per guided strategy preview budget: `6`
- retained repair candidates per strategy: `3`

That is intentionally small and deterministic. The goal is to stop early collapse, not to run exploration-scale search in production.

## What stayed unchanged

- no global ranking rewrite
- no validation/rules rewrite
- no packer/archetype redesign
- no widening for other formats
