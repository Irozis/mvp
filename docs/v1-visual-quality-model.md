# V1 Visual-quality Model

## What was added

- a real `VisualAssessment` type on `LayoutAssessment`
- a dedicated `visualEvaluation.ts` module
- automatic visual assessment inside `getSceneAssessment(...)`

## Visual axes

V1 measures six explainable visual axes:

1. focusHierarchy
2. compositionBalance
3. textImageHarmony
4. ctaQuality
5. negativeSpaceQuality
6. coherence

Each axis produces a score, warnings, and optional strengths.

## Integration

Structural validation remains primary.

The visual layer is attached after the normal structural assessment is built, so it does not replace overlap/spacing/zone/safe-area validation.

## Ranking use

V1 ranking use is intentionally conservative:

- visual score is only a soft tie-break
- it applies only after structural tier and effective score are already tied
- it does not override obvious structural failures
