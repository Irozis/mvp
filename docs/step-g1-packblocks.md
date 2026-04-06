# Step G1 Constraint-Aware packBlocks

## What changed

`packBlocks(...)` is now an attempt-based packing stage instead of a mostly sequential role placement pass.

The new model:

1. resolves the archetype contract and working zones
2. reserves logo and badge space against already occupied rectangles
3. tries bounded image placements inside the image zone
4. fits the text cluster and CTA against the current occupied geometry
5. evaluates each packing attempt with local reservation checks plus structural state
6. selects the least-bad / structurally strongest packing attempt

## Occupancy model

The packing stage now carries explicit reservations for:

- `logo`
- `badge`
- `image`
- `headline`
- `subtitle`
- `cta`

Reservations are checked for:

- overlap
- minimum pair gap
- containment within allowed role zones
- safe-area compatibility

## Text cluster fit

Text fitting now returns a structured result instead of only mutating a scene.

That result includes:

- success/failure
- failure reasons
- fitted headline/subtitle/CTA rectangles
- the final working text region

This allows `packBlocks(...)` to reject a local placement attempt before it becomes the scene’s final geometry.

## Bounded alternatives

The rewrite stays bounded.

`packBlocks(...)` now tries a small deterministic set of packing variants:

- base
- CTA-flipped / compact variant
- text-safe variant
- one wide-split-safe variant for wide/landscape structures

Within each variant it also tries a small set of image placements and CTA anchors.

## Diagnostics

Two diagnostics hooks were added:

- dev-only `__LAYOUT_PACK_DEBUG` logging inside `layoutEngine.ts`
- `scripts/diagnostics/stepG1MarketplacePackEvaluation.ts` for targeted marketplace preview checks

These are meant to inspect whether packing alternatives are materially changing structural outcomes without spamming normal runtime.
