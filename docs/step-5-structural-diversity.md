# Step 5 Structural Diversity Engine

## Goal

Step 5 adds genuinely different composition structures to the bounded candidate space used by preview selection and repair regeneration.

The main problem before this step was structural homogeneity:
- candidate pools rarely differed beyond family/model labels,
- mixed-tier candidate pools were effectively absent,
- repair regeneration stayed in the same structural class,
- repeated fixes stagnated because regeneration could not escape the current layout shape.

## Structural archetypes

The engine now uses explicit structural archetypes on `LayoutIntent`:

- `text-stack`
  - text-first composition
  - stacked headline/subtitle/cta region
  - supporting image region
- `image-hero`
  - visual-first composition
  - large hero/background image
  - smaller reserved text region
- `split-vertical`
  - top/bottom partition
  - separate image and text bands
- `split-horizontal`
  - left/right partition
  - especially suited for landscape/wide outputs
- `overlay-balanced`
  - full image with a deliberately reserved safe text zone
  - safer overlay than a cosmetic overlay flag
- `compact-minimal`
  - minimal-copy regime
  - small text footprint and preserved negative space
- `dense-information`
  - text-safe regime
  - larger text region and more conservative copy handling

Each archetype drives:
- layout family choice,
- balance regime,
- occupancy mode,
- text/image mode,
- zone geometry bias inside `buildFamilyZones(...)`.

## Geometric effect

Structural diversity is not label-only.

`applyStructuralArchetypeZoneBias(...)` in `src/lib/layoutEngine.ts` changes:
- major region allocation,
- flow direction,
- text/image split,
- CTA and badge anchoring,
- occupancy behavior.

Occupancy modes further modulate the geometry:
- `spacious`
- `balanced`
- `compact`
- `text-safe`
- `visual-first`

This creates materially different scene structures even when the same content and format are used.

## Candidate generation

Preview candidate generation now ranks and selects archetypes instead of relying mainly on weak family/model alternates.

Archetype ranking considers:
- format family/category,
- content density,
- preferred message mode,
- campaign goal,
- image profile,
- repair failure type when regeneration is requested.

Candidates are deduplicated by a compact structural signature, not by label alone.
That signature captures:
- archetype,
- flow direction,
- text zone,
- image zone,
- text/image weight regime,
- overlay vs separated structure,
- balance regime,
- occupancy mode.

This means the bounded candidate budget prefers fewer but more structurally different candidates.

## Repair regeneration

Step 4 regeneration now reuses the same archetype ranking and intentionally excludes the current archetype before choosing regeneration strategies.

Failure-driven regeneration bias:
- overlap / spacing / safe area -> denser or safer text-reserved archetypes,
- text-size -> text-safe / dense-information archetypes,
- image-dominance -> text-first and reduced-image archetypes,
- occupancy -> different split and compact/spacious archetypes,
- mixed -> broader cross-archetype escape attempts.

This gives repair a real chance to leave the current structural class instead of repeating near-identical layouts.

## Performance guardrails

This remains bounded:
- preview budget stays small (`5` by default),
- archetypes are ranked and filtered heuristically,
- structurally duplicate plans are removed before evaluation,
- no unbounded combinatorics or recursive search were added.

## Diagnostics

The existing dev-only preview candidate logger now surfaces structural diversity through:
- selected archetype,
- candidate archetype set,
- unique structural signature count.

`getPreviewCandidateDiagnostics(...)` also exposes all evaluated candidates with their structural archetypes and structural signatures, which is intended for later verification passes.
