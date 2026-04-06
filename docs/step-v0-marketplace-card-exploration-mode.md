# Step V0 Marketplace-Card Exploration Mode

This is a dev-only exploration path for `marketplace-card`.

## Purpose

The normal preview flow collapses to a small selected set too early for visual investigation.
This mode expands the explored candidate space and keeps the full bounded set for inspection.

## How it works

- reuses the existing marketplace-card preview machinery
- runs multiple bounded exploration profiles over the same input context
- varies archetype planning context through balance / occupancy / fix-stage / failure-bias combinations
- adds explicit marketplace-card layout-intent seeds such as split-left, split-right, centered-overlay, dense-copy-card, and framed-overlay
- gives each exploration profile a slightly larger bounded plan budget so diagnostics can retain alternative model and regional candidates
- evaluates every retained candidate with the normal structural scoring path
- filters near-duplicates using structural signature + geometry signature

## Outputs

- `report.json` with full candidate metadata
- one `svg` preview per candidate
- `index.html` gallery for fast visual inspection

## Safety

- marketplace-card only
- diagnostics / script only
- no normal selection behavior changes
