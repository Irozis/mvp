# Marketplace-card Template Adapter

## Why template adaptation was needed
Template definitions and template selection are only useful if the chosen template changes runtime structure. This adapter is the first step that turns marketplace-card template choice into actual layout intent and template-shaped zone structure.

## How the adapter works
`src/lib/templateAdapter.ts` takes:
- selected marketplace-card template
- master scene / source content
- content profile
- image context
- current marketplace-card format context

It then:
1. resolves the chosen template
2. builds template-shaped role zones for image, text, CTA, logo, and badge
3. maps the template's runtime hints into `LayoutIntent`
4. returns a template-adapted runtime intent that the existing layout engine can still validate and pack safely

## How each template affects runtime structure
- `text-first-promo`
  Gives text the dominant hero zone, compresses image into secondary support, and keeps CTA close to the message flow.

- `header-panel-card`
  Creates a real upper support/header panel with a grounded lower content block and CTA footer lane.

- `product-support-card`
  Gives product/image support a meaningful footprint and keeps text/CTA in a balanced lower content zone.

- `minimal-promo-card`
  Uses quieter support, smaller text footprint, and a restrained CTA lane for short-copy cards.

## Primary vs fallback behavior
For marketplace-card, template adaptation is now the primary runtime path. The legacy freeform engine still exists underneath for packing, validation, and fallback safety, but marketplace-card intent construction now starts from explicit template adaptation rather than generic class guessing.

## What this prepares next
The next step can build template-aware variant ranking and alternatives from a stable foundation:
- template selected
- template adapted into runtime structure
- structural and visual evaluation still active
