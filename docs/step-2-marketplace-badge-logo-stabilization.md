# Step 2 Marketplace badge-logo Stabilization

This pass is a narrow follow-up to the successful marketplace spacing-threshold correction.

## What changed

- `badge ↔ logo` is now treated as an explicit marketplace spacing pair
- the marketplace stabilizer now resolves this pair locally before falling back to generic spacing movement

## Local resolution order

1. try moving the badge first
2. if needed, try alternate badge anchors inside the marketplace badge zone
3. only if badge movement does not help, try a minimal logo anchor fallback

## Why

Marketplace diagnostics showed that after the dominant `headline ↔ image` hotspot was fixed, `badge ↔ logo` remained one of the tighter residual marketplace spacing blockers.

The fix stays narrow:
- marketplace only
- no threshold changes
- no defaults/archetypes/packing changes
- no unrelated category behavior changes
