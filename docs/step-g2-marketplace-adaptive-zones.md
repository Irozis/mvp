# Step G2 Marketplace Adaptive Zone Rebalancing

This pass narrows geometry correction to:

- `marketplace-card`
- `marketplace-tile`
- `marketplace-highlight`

## Intent

The marketplace path now tries to solve text pressure at the zone level instead of only through defaults, role shedding, or local packing tweaks.

## What changed

Marketplace packing now receives bounded zone profiles:

1. `base-marketplace`
2. `text-first-marketplace`
3. `safe-marketplace-fallback`

These profiles are internal geometry modes, not user-visible archetypes.

## Geometry changes

The new profiles enforce a minimum viable marketplace text region before packing:

- guaranteed minimum text width
- guaranteed minimum text height
- stronger CTA containment inside the text zone
- smaller image footprint under text pressure

Wide / landscape marketplace formats now prefer stronger side-by-side text-first rebalancing.
Square / portrait marketplace formats now prefer stronger shelf-style text-first rebalancing.

## Integration

The profiles are consumed directly inside `packBlocks(...)`, so:

- reservations are recomputed against each profile
- text cluster fitting uses the updated text region
- image packing uses the updated image region
- marketplace role shedding from Step 7.1B applies on top of the new zone geometry

## Diagnostics

The existing marketplace spot-check script remains the quickest KPI check:

- `scripts/diagnostics/stepG1MarketplacePackEvaluation.ts`

Pack attempt IDs now include both role-shedding state and zone-profile identity, which helps inspect whether marketplace candidates are actually trying rebalanced geometry.
