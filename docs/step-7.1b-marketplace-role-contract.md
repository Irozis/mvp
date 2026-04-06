# Step 7.1B Marketplace Role Contract Simplification

This pass narrows marketplace generation pressure for:

- `marketplace-card`
- `marketplace-tile`
- `marketplace-highlight`

## What changed

The marketplace path now uses an explicit role-pressure policy instead of assuming all roles should survive equally on constrained canvases.

## Role priority

Marketplace role pressure is now ordered as:

1. headline
2. image
3. CTA
4. logo
5. subtitle
6. badge

This influences block priority and packing attempts.

## Shedding ladder

Marketplace packing now tries a bounded shedding ladder:

1. compact CTA + minimal logo
2. drop subtitle
3. drop badge
4. force text-safe fallback

This happens inside marketplace packing attempts, so removed roles stop reserving space immediately.

## Compact CTA

Marketplace CTA sizing is reduced through a format-specific compact CTA scale and a smaller CTA reserve scale.

## Diagnostics

Marketplace pack attempt IDs now include shedding markers such as:

- `nosub`
- `nobadge`
- `compactcta`

That makes it easier to inspect whether marketplace packing is actually trying lower-pressure role combinations.
