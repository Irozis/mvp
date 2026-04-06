# Step 6 Archetype-Aware Validity & Fit

## Goal

Step 6 turns structural archetypes from "different layouts" into "layouts that can survive structural invariants".

The main failure before this step was not lack of diversity anymore. Step 5 already created diverse candidate pools, but almost every candidate still stayed structurally invalid.

This step hardens synthesis so archetypes:
- size text and image regions more realistically,
- reserve room for CTA / logo / badge,
- fit text clusters into the assigned region with a bounded loop,
- reduce image pressure when text demand is high,
- repack once or twice before the scene leaves synthesis.

## Archetype layout contracts

`layoutEngine.ts` now defines an archetype contract per structural archetype.

Each contract controls:
- target text coverage range,
- target image coverage range,
- headline/subtitle max lines,
- cluster spacing,
- text-to-image separation,
- CTA reserve,
- top reserve,
- occupancy mode,
- safer fallback mode (`safe-shelf` / `safe-side`).

This is used during generation, not only scoring.

## Zone sizing

`adaptZonesToContract(...)` rebalances the initial family/model zones before packing:
- text-safe and dense archetypes get more usable text room,
- image-heavy archetypes are capped when they crowd text,
- wide formats shift text/image balance horizontally,
- portrait/square formats shift the balance vertically.

`applySafeArchetypeFallback(...)` gives overlay-like archetypes a bounded safe fallback:
- `safe-side` for wider layouts,
- `safe-shelf` for taller layouts.

This lets the archetype stay recognizable while avoiding impossible text-over-image geometry under current invariants.

## Text fit loop

`fitTextClusterToZones(...)` is the new bounded cluster fit loop inside synthesis.

It:
- reserves text region space from logo/badge blockers,
- fits headline and subtitle with authoritative text geometry,
- reserves CTA space before final placement,
- checks image separation when overlap is not allowed,
- iteratively reduces type size / increases wrapping room / loosens line budget within contract limits,
- stops after a small bounded number of passes.

This is the main Step 6 change that turns text sizing into an actual synthesis-time fit decision.

## Constraint-aware packing

`packBlocks(...)` now:
- uses archetype contracts,
- adapts zones before placing text,
- applies safe fallback layouts for overlay-heavy intents,
- places image/logo/badge first,
- fits the text cluster against remaining constrained space instead of only stacking naively.

The old packer mostly trusted the initial region and only used local heights.
The new packer checks real fitted text geometry against the region it is about to use.

## Constraint enforcement and repack

`finalizeSceneGeometry(...)` now resolves spacing conflicts after collision resolution, not only overlaps.

`synthesizeLayout(...)` now does a bounded validity repack:
- build scene,
- finalize geometry,
- evaluate structural state,
- if not valid, rebuild zones with contract-aware safer allocation,
- repack and keep the structurally better result.

The repack is intentionally bounded and deterministic.

## Image / text coordination

`applyRuleConstraints(...)` no longer blindly restores image area to minimum coverage when the text cluster is already using the canvas responsibly.

This avoids a common failure where post-pack image expansion re-broke text spacing and image dominance after the text fit work had already succeeded.

## Repair integration

No separate repair redesign was added in this step.
Step 4 regeneration improves automatically because it reuses `generateVariant(...)`, which now calls the stronger synthesis path.

That means guided regeneration can now escape into archetypes that are not only different, but more likely to survive structural invariants.
