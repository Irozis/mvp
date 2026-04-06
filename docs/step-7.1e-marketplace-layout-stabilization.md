# Step 7.1E Marketplace Layout Stabilization

Scope:
- `marketplace-card`
- `marketplace-tile`
- `marketplace-highlight`

This pass adds a marketplace-only stabilization stage after `finalizeSceneGeometry(...)`.

## What it does

- runs only for constrained marketplace formats
- uses at most 2 local passes
- works on final geometry only
- accepts the stabilized result only if spacing or role-placement improves, or the structural tier improves

## What it fixes locally

- CTA / subtitle / headline spacing pressure
- text / logo and text / badge crowding
- CTA / logo / badge role-placement drift outside marketplace-safe zones
- constrained CTA fallback through smaller CTA footprints and bottom-safe anchor candidates

## What it does not do

- it does not rerun packing
- it does not change archetypes or defaults
- it does not weaken invariants
- it does not replace marketplace repair/regeneration
