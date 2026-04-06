# Step V2 Marketplace-card Normal Pool Widening

This is a narrow production-path change for `marketplace-card` only.

## What changed

- the normal `marketplace-card` preview path now uses a wider bounded candidate envelope
- `marketplace-card` normal planning now includes the same useful extended preview branches that previously only surfaced in diagnostics-style expanded runs
- within one structural signature, `marketplace-card` may now retain one additional geometry-distinct candidate

## Why

Step V1 showed two concrete bottlenecks:

1. the normal budget-5 envelope was too narrow
2. useful `marketplace-card` variants were being collapsed too early at the structural-signature level

The ranking logic was not the bottleneck, so it was intentionally left unchanged.

## Safety

- `marketplace-card` only
- bounded to a modest normal budget increase
- still capped to two retained candidates per structural-signature class
- no changes to global ranking or other formats
