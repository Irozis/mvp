# Marketplace-card Template Variant Ranking

## Why a single template path was not enough
Template selection chooses the most appropriate composition class, but marketplace-card still benefits from a small bounded set of alternatives. A single path is harder to trust for product-facing output, especially in no-image and mixed-content scenarios.

## How variants are generated
`src/lib/templateVariantGeneration.ts` now builds a small deterministic marketplace-card variant set:
- selected primary template
- 1-2 selector-approved alternative templates

Each variant is adapted through the real template adapter before evaluation.

## How variants are ranked
Marketplace-card variants are evaluated with:
1. structural validation
2. trust-aware effective structural score
3. structural issue severity
4. visual assessment

Visual quality is now a meaningful selector among already-safe, already-near-equal marketplace-card template variants, but it does not override structurally invalid candidates.

## Primary winner and alternatives
The user-visible marketplace-card winner now comes from the ranked template-variant set. The remaining ranked candidates stay available as inspectable alternatives for diagnostics and future “Try alternatives” UX.

## Why structural validation remains primary
The ranking order still protects correctness first. Template variants only compete visually after structural safety and structural score are already in a comparable range. This keeps the template-assisted system defensible and stable for the diploma.
