# Marketplace Constraint Alignment Fix

## Confirmed contradictions
- Marketplace formats were still resolving `getFormatRuleSet(...)` through social aliases, so validation demanded social-style image coverage and CTA minimums that contradicted marketplace generation and defaults.
- Marketplace zone validation was effectively `first-zone-only` in both `validation.ts` and marketplace role-placement checks, while the generation path legitimately uses multiple allowed anchors/zones.
- Marketplace image analysis still used generic non-display image-role heuristics that assume large image footprint, which penalized intentionally compact marketplace image usage.
- Marketplace CTA prominence still used generic family-width expectations that were stricter than marketplace compact CTA behavior.

## Alignment approach
- Added dedicated `marketplace-card`, `marketplace-tile`, and `marketplace-highlight` rule sets in `formatRules.ts`.
- Removed the marketplace-to-social alias path so marketplace no longer inherits incompatible social constraints.
- Switched allowed-zone validation to respect all allowed zones from the resolved element rules, instead of only the first zone for a role.
- Aligned CTA prominence and image-role heuristics in `validation.ts` with marketplace-specific rule ranges, while keeping the checks active.

## Expected effect
- Marketplace image coverage is now validated against marketplace-sized image roles instead of social minimums.
- Compact marketplace CTA is now valid when it meets marketplace rule minimums.
- Marketplace role placement no longer fails simply because a block landed in a second legitimate zone.
- Validation remains meaningful, but it now measures marketplace layouts against marketplace rules rather than a conflicting social proxy.
