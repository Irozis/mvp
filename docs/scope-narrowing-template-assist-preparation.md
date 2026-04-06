# Scope Narrowing and Template-Assist Preparation

## Active supported scope
- Primary diploma scope is now marketplace-first.
- Active supported formats are `marketplace-card` and `marketplace-highlight`.
- `marketplace-tile` is preserved as an optional active marketplace variant because it is already relatively cheap to keep stable.

## Legacy / fallback / experimental scope
- Social, display, print, story, and presentation families remain in the repository as legacy or experimental infrastructure.
- They are preserved for diagnostics, export compatibility, and fallback exploration, but they are no longer treated as equally production-ready in the main product path.
- The broad freeform generator remains useful, but it is now framed as a fallback/legacy engine rather than the main diploma promise.

## Preserved core infrastructure
- shared scene/types model
- preview rendering and export
- format registry and metadata
- structural validation
- visual-quality assessment
- candidate comparison and diagnostics
- marketplace-specific stabilization and repair improvements

## Template-assisted direction
- The intended primary flow is now:
  `input -> template selection -> template adaptation -> structural validation -> visual assessment -> preview/export`
- The next architectural step should add explicit marketplace template modules such as:
  - `templateDefinitions.ts`
  - `templateSelection.ts`
  - `templateAdapter.ts`
- Current scope metadata and marketplace-first UI filtering were added to make that next step fit naturally instead of fighting the existing codebase.
