# Step V3 Marketplace-card Same-Signature Geometry Fix

This is a narrow `marketplace-card`-only production-path change.

## What changed

- the normal `marketplace-card` planner now adds a very small set of same-signature geometry probes
- those probes target the remaining split-vertical / centered card geometries that exploration already showed as stronger
- evaluated candidates are still ranked with the existing comparator

## Why

After Step V2, the remaining gap was no longer about budget.
It was about stronger geometry variants still being hidden inside the same structural-signature class.

This fix surfaces those variants without changing global ranking or other formats.

## Safety

- `marketplace-card` only
- bounded probe count
- no global comparator changes
- no budget expansion beyond the Step V2 envelope
