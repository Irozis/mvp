# Adaptive Graphics MVP — Architecture Context

## What this project does
Generates marketplace card creatives (banners for e-commerce).
React + Vite + TypeScript frontend. Export via html-to-image.

## Current architecture (April 2026)
The pipeline for marketplace-card format:
1. Content analysis (contentProfile.ts)
2. Template selection (templateSelection.ts) — scores 4 archetypes
3. Zone generation (templateAdapter.ts) — % coordinates per element
4. Candidate generation (templateVariantGeneration.ts) — multi-template + variants
5. Layout synthesis (layoutEngine.ts) — template zones are used via early return at line ~228
6. Candidate ranking (layoutPipelineCore.ts) — structural tier → score → visual → commercial
7. Perceptual micro-repair (perceptualRefinement.ts) — 4 rules
8. Export (App.tsx) — html-to-image with pixelRatio:2

## Key decisions
- Template-driven path is the primary path for marketplace-card
- V2-slot path (marketplaceLayoutV2.ts) is OFF by default (env flag)
- Visual scorer (visualEvaluation.ts) has 6 axes: focus hierarchy, composition balance,
  text-image harmony, CTA quality, negative space, coherence
- Heavy repair (repairOrchestrator.ts) should NOT run for marketplace-card — 
  perceptualRefinement handles micro-adjustments

## Known issues being fixed
1. document.fonts.ready not called before html-to-image export
2. Visual scorer is a tiebreaker, not primary ranker for marketplace-card candidates
3. Heavy repair still runs for marketplace-card, should be bypassed
4. Integration test needed: template zones must reach final scene geometry

## Files to be careful with
- layoutEngine.ts (8K lines) — legacy, template zones pass through via early return
- autoAdapt.ts (5.5K lines) — legacy orchestrator
- layoutPipelineCore.ts (2.9K lines) — candidate generation + ranking