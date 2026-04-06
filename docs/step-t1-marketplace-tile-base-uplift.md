# Marketplace-tile Base Generation Uplift

## Weak base path
- The normal `marketplace-tile` base path was always `base-heuristic -> dense-information`.
- That base path produced weaker geometry than the already-successful selected candidate:
  - smaller image footprint
  - wider text block
  - weaker split structure
- The selected tile winner was consistently `compact-minimal`.

## Successful selected traits
- `compact-minimal`
- landscape split family instead of text-heavy lane
- slightly stronger image presence
- narrower, cleaner headline width
- stable CTA lane without needing selection rescue

## Production-path fix
- Reordered `marketplace-tile` format ranking so `compact-minimal` is the default first archetype.
- Stopped the generic marketplace minimal-copy logic from promoting `dense-information` to the front for `marketplace-tile`.
- Added a `marketplace-tile` base-intent override in `scenarioClassifier.ts` so the base heuristic uses the same compact split-family traits that were already winning in selected mode.

## Result
- `marketplace-tile` base now starts from the same viable composition class that previously only surfaced after candidate selection.
- The selected path stays viable, but no longer has to rescue the base path first.
