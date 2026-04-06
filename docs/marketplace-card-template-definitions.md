# Marketplace-card Template Definitions

## Why template classes were introduced
The diploma scope is now marketplace-first, and broad freeform generation is no longer the primary product promise. Marketplace-card is the first active format to receive explicit composition templates so the system can move toward:

`content -> template selection -> template adaptation -> structural validation -> visual assessment -> preview/export`

These template classes do not replace the current engine yet. They provide the new compositional source of truth that future template selection and adaptation will build on.

## Templates now defined
- `text-first-promo`
- `header-panel-card`
- `product-support-card`
- `minimal-promo-card`

## What each template is for
- `text-first-promo`
  Best for no-image or weak-image promo cards where the message must become the real hero and the visual region stays secondary support.

- `header-panel-card`
  Best for default/no-image marketplace-card generation where a real upper support panel and grounded lower content block create stronger card rhythm than a thin strip-first fallback.

- `product-support-card`
  Best for image-backed marketplace cards where the product asset should matter structurally without turning the layout into a full hero-image composition.

- `minimal-promo-card`
  Best for short-copy, cleaner marketplace cards with fewer emphasized roles and more disciplined whitespace.

## How this prepares the next step
The new template registry in `src/lib/templateDefinitions.ts` now holds:
- explicit template ids
- suitability metadata
- zone intent
- CTA and image policy
- runtime hints mapped to the current layout engine vocabulary

The next architectural step can use this data to implement deterministic `templateSelection.ts` logic without inventing template semantics inside heuristics.
