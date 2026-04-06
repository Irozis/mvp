# Step 1 Marketplace getPairGap Correction

This pass changes only marketplace-scoped spacing thresholds inside `getPairGap(...)`.

## What changed

- marketplace now uses a more compact fallback/base gap
- marketplace text-to-image pairs now use a compact constrained-format threshold instead of the generic large threshold

## Targeted pairs

- `headline ↔ image`
- `subtitle ↔ image`
- `body ↔ image`
- `cta ↔ image`
- fallback/base marketplace pairs such as `cta ↔ headline`

## Why

Marketplace diagnostics showed that constrained formats were still mathematically over-penalized by spacing thresholds, especially:
- `marketplace-tile`: `headline ↔ image`
- `marketplace-highlight`: compact CTA/headline spacing pressure

The change is intentionally narrow:
- marketplace only
- no archetype/default/packing changes
- no unrelated category behavior changes
