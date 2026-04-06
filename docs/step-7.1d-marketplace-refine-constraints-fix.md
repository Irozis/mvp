# Step 7.1D Marketplace refineLayout / applyRuleConstraints Fix

Scope:
- `marketplace-card`
- `marketplace-tile`
- `marketplace-highlight`

This pass is intentionally narrow and only changes late-stage marketplace behavior inside `refineLayout(...)` and `applyRuleConstraints(...)`.

## refineLayout guard

For constrained marketplace formats:
- late x/y realignment no longer forces CTA, subtitle, and title into a single tighter column
- late micro-adjustments are kept only if they do not worsen marketplace hotspot metrics
- if refinement increases role-pressure, spacing pressure, or text/image conflict, the packed scene is preserved

This is meant to stop `packed -> refined` from degrading the best post-pack arrangement.

## applyRuleConstraints guard

For constrained marketplace formats:
- minimum image coverage growth is now simulated before it is applied
- if image growth would worsen marketplace hotspot metrics, growth is skipped
- if the fully constrained result is worse than the clamped pre-growth version, the engine keeps the safer clamped layout

This keeps marketplace-safe constraint enforcement from reintroducing overlap or crowding after packing.

## Intended effect

The expected outcome is:
- fewer `major-overlap` regressions introduced by `applyRuleConstraints(...)`
- better preservation of post-pack spacing and role hierarchy
- a higher chance that constrained marketplace candidates survive into `degraded` instead of collapsing back to `invalid`
