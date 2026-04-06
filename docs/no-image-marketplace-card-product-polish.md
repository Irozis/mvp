# No-image Marketplace-card Product Polish

## What changed
- Added a `marketplace-card` no-image/default archetype preference so the first visible scene starts from a stronger split-style card composition instead of the weaker fallback ordering.
- Added a no-image/default `marketplace-card` intent override so the base heuristic enters a framed top-support / bottom-message layout regime earlier.
- Threaded `assetHint` and `imageAnalysis` through the main `packBlocks(...)` path so the no-image marketplace-card contract applies during initial packing, not only later repack passes.
- Added a no-image/default marketplace-card contract modifier for tighter text-image coupling, stronger top support region, and a clearer CTA reserve.

## Why it helps
- The top visual region now reads more like a support panel than a decorative ribbon.
- The text block sits closer to that support region, which reduces accidental mid-canvas dead space.
- CTA gets a stronger reserved zone and feels less detached from the reading flow.
- The policy stays scoped to the no-image/default marketplace-card regime and does not affect image-backed marketplace-card selection behavior.

## Safety
- Marketplace-card only
- No-image/default only
- No global ranking, validation, or repair-lifecycle changes
- Existing marketplace-card selection-gap behavior remains unchanged
