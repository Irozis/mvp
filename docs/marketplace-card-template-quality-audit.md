# Marketplace-card Template Quality Audit

## Why the audit was needed
Marketplace-card now has a real template-assisted variant system, but that architecture milestone does not automatically guarantee strong product patterns. This audit was added to judge the current templates as visible product cards, not just as structurally valid layouts.

## How templates were evaluated
`scripts/diagnostics/marketplaceCardTemplateQualityAudit.ts` now evaluates the current marketplace-card template set across representative no-image and image-backed cases. For each case it records:
- selector output
- bounded runtime variants
- forced per-template evaluations
- structural status and effective score
- visual score, band, breakdown, warnings, and strengths
- compact geometry summary
- SVG preview artifacts

Artifacts are written to `artifacts/marketplace-card-template-quality-audit/v1`.

## Current strongest and weakest patterns
- `header-panel-card` is the strongest current no-image regime. It is the only template that stayed valid across the full audit set, so it should remain the primary no-image template. It still needs CTA integration work.
- `text-first-promo` is the strongest current image-backed regime in the audited set. It can produce the best image-backed winner, but it breaks down in dense no-image cases and is not stable enough to treat as universally strong.
- `minimal-promo-card` is structurally safe only in part of the sample and often reads too bland or under-composed. It should be demoted until it earns a clearer product role.
- `product-support-card` is not yet winning the cases it is supposed to own. It behaves more like a weak alternate than a strong image-backed product card, so it should also be demoted until tuned.

## Dominant remaining visual weaknesses
The recurring failure modes across the current template set are:
- weak CTA integration
- detached text/image relationship
- weak or overly decorative support region
- accidental dead space in weaker cases

In practical product terms, the system now produces safe marketplace-card variants, but most templates still stop at “usable” rather than “convincing”.

## Recommended next tuning step
The next focused tuning pass should not try to polish every template equally. It should:
1. keep `header-panel-card` as the primary no-image base and strengthen CTA/message coupling there
2. decide whether `text-first-promo` should remain the main image-backed alternate or be narrowed to dense-copy cases only
3. demote `minimal-promo-card` and `product-support-card` from active rotation until they are rebuilt into clearly stronger product patterns
