# Step 7: Format-Aware Default Viable Presets

## Scope
This step improves the default starting point for each format without replacing the archetype system, the invariant system, or the bounded candidate pipeline.

## What changed
- Added a shared format-defaults layer in `src/lib/formatDefaults.ts`.
- Base heuristic intent now starts from format-aware archetype, balance, and density defaults.
- Preview candidate ranking now uses format-aware archetype ordering and weak-archetype penalties.
- Archetype layout contracts now merge format/category overrides for text coverage, image coverage, spacing, CTA reserve, and fallback mode.
- Typography now respects format-aware density and balance presets before synthesis.
- Safe insets now include lightweight format-specific biasing.
- Preview diagnostics now include base candidate archetype/status alongside the selected candidate summary.

## Format-aware defaults
Each format now has a preferred:
- archetype ranking
- density preset
- balance regime
- occupancy mode
- safe fallback archetype

These defaults bias the first candidate toward a more viable structure while still keeping the broader Step 5 diversity pool intact.

## Contract tuning
`getArchetypeLayoutContract(...)` now merges:
1. archetype baseline
2. balance/density preset adjustments
3. format/category overrides

This keeps the contract system explicit and deterministic instead of scattering more ad hoc format branches through packing.

## Safe fallback behavior
Synthesis fallback remains bounded and deterministic, but now uses format-aware safe margins and fallback modes so constrained formats favor safer text/image separation during repack.

## Diagnostics
The existing dev-only preview selection summary now surfaces:
- base archetype
- base structural status
- base effective score
- selected archetype/status/score

That makes it easier to verify whether Step 7 is improving the starting candidate rather than only the later-selected one.
