# Marketplace-card Template Selection

## Why template selection was needed
Marketplace-card now has explicit template definitions, but template classes are only useful if the system can deterministically choose one before generation/adaptation. This selector replaces vague class-guessing with an explicit decision layer.

## Inputs the selector considers
- image presence: real image-backed vs no-image/default
- copy density: short, balanced, or dense message load
- message mode: text-first, balanced, or image-first
- CTA flow: none, compact, standard, or strong
- role presence: subtitle, badge, CTA
- marketplace-card context: promo-pack + product-card system

## No-image vs image-backed handling
- No-image/default marketplace-card is treated as its own first-class regime.
  The selector prefers `header-panel-card`, with `text-first-promo` or `minimal-promo-card` used when copy structure clearly supports them.

- Image-backed marketplace-card is treated as a different regime.
  The selector prefers `product-support-card` when the image should matter structurally, while still allowing `minimal-promo-card` or `text-first-promo` for lighter or more message-led cases.

## What the selector returns
The selector returns a structured result with:
- `selectedTemplateId`
- `alternativeTemplateIds`
- `reasonCodes`
- `decisionSummary`
- `inputProfile`

This makes template choice inspectable in diagnostics and easy to explain in the diploma.

## How this prepares template adaptation next
The current runtime now carries the selected marketplace-card template id and selection metadata inside `LayoutIntent`. The next step can use that chosen template directly to adapt content into explicit template geometry instead of re-guessing the composition class again.
