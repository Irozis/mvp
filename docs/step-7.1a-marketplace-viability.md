# Step 7.1A Marketplace Viability Tuning

## Scope

Only these constrained marketplace formats were tuned:

- `marketplace-card`
- `marketplace-tile`
- `marketplace-highlight`

## What changed

- format-specific archetype ranking now biases these formats toward more text-safe starting structures instead of generic marketplace ordering
- marketplace `minimal-copy` no longer blindly collapses into the global `minimal-copy -> spacious` behavior
- contract overrides now reserve more reliable text room, cap image pressure harder, and use safer fallback archetypes
- marketplace CTA sizing, safe fallback geometry, and zone adaptation now favor text-safe execution over image-heavy compression

## Expected marketplace effect

This pass is intended to improve viability in three places:

1. base candidate quality
   - more text-safe default archetypes
   - less aggressive image coverage
   - smaller CTA footprint in constrained marketplace canvases

2. selected candidate quality
   - candidate pools should still remain diverse
   - but compact-minimal and dense-information should start from less image-heavy, less spacing-fragile geometry

3. repair burden
   - safer dense-information fallback should reduce how often repair must first undo an overly aggressive starting layout

## Known limit

This is still a narrow input-side tuning pass, not a marketplace-specific solver. If marketplace formats remain structurally invalid after this pass, the next step should focus on the exact marketplace spacing and role-placement failure pairs that still dominate verification.
