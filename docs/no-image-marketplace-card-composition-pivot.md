# No-image Marketplace-card Composition Pivot

## Old class rejection
- The old no-image `marketplace-card` kept collapsing into a weak strip-first fallback.
- Even after earlier polish, it still behaved like a thin pseudo-image ribbon with a detached text block and underweighted CTA.
- The composition stayed structurally safe but visually bland, which meant the class itself was the bottleneck.

## Alternatives considered
- `Current Support-Overlay Card` (`overlay-balanced / square-hero-overlay`): rejected because it remained structurally unstable and overlapped badly in the real no-image case.
- `Text-first Promo Card` (`dense-information / square-image-top-text-bottom`): stronger intent, but still invalid when packed as the old no-image strip regime.
- `Split Support Card` (`split-vertical / square-image-top-text-bottom`): clearer rhythm, but still too tight and invalid in the first pass.
- `Header Panel Card` (`split-horizontal / square-image-top-text-bottom`): best result. It gives the no-image case a real upper support panel, a fuller text block, and a lower CTA zone that reads as one card.

## Pivot implementation
- The no-image heuristic intent now starts in `square-image-top-text-bottom` instead of the unstable no-image overlay path.
- No-image marketplace-card ranking now fronts denser card classes before compact fallback classes.
- The no-image square-card packing path now uses a header-panel contract instead of the old ribbon-first text-safe collapse.
- The pack/adapt/refine stages preserve a larger support panel and wider text block for this scenario so the first visible result stays in the new class.

## Safety
- Scope is limited to no-image/default `marketplace-card`.
- Image-backed marketplace-card stays on its existing path.
- Marketplace-tile, marketplace-highlight, and the broader marketplace-card selection-gap improvements remain unchanged.
