# Step 4 Repair Pipeline

## What changed

`fixLayout` is now a scene-consistent repair pipeline:

1. assess the current scene
2. classify dominant structural failure types
3. try local structural repair on that same scene when it is close to recoverable
4. suppress repeated ineffective strategies and no-op outcomes
5. escalate to guided structural regeneration when local repair is insufficient
5. compare before/after explicitly
6. accept only real improvements

The lightweight `runAutoFix(...)` pass was also hardened so it no longer applies local fixes blindly.

## Failure classification

Source of truth:
- `assessment.structuralState`
- `assessment.structuralState.findings`

Classifier:
- `classifyStructuralFailure(...)` in [`src/lib/autoAdapt.ts`](../src/lib/autoAdapt.ts)

Supported dominant classes:
- `overlap-dominant`
- `spacing-dominant`
- `safe-area-dominant`
- `text-size-dominant`
- `image-dominance-dominant`
- `occupancy-dominant`
- `mixed`

Findings are severity-weighted (`high=3`, `medium=2`, `low=1`) before dominant type selection.

## Repair strategies

### Local structural repair

Applies targeted actions to the current scene:
- spacing / overlap rebalancing
- text compression / reflow
- CTA / logo / cluster adjustments
- image-presence reduction when dominance is the main problem

This path uses the same scene it diagnoses and re-evaluates the repaired scene with the same structural model.

### Structural regeneration

Reuses Step 3 candidate-based generation, but biases it using the failure classification:
- overlap / spacing / safe area -> text-favoring structural regeneration
- text size -> conservative text regeneration
- image dominance -> lower image dominance regeneration
- occupancy -> alternative-family occupancy regeneration
- mixed -> broader structural alternative

## Acceptance gate

Implemented in `buildRepairDecision(...)`.

Accepted only when:
- structural tier improves, or
- structural tier stays the same and effective score improves, or
- structural tier stays the same and structural findings meaningfully decrease without a significant score regression

Rejected when:
- structural tier worsens, or
- score regresses materially without structural gain
- repair is a no-op
- repair repeats a known weak pattern on the same scene

## No-op and loop suppression

The repair pipeline now records compact signatures for:
- the current scene geometry
- the attempted repair strategy
- recent repair outcomes

That allows it to reject:
- no visible / near-identical repair outcomes
- immediate retries of previously failed strategies on the same scene
- simple loops where different strategies keep producing the same weak layout

## runAutoFix handling

`runAutoFix(...)` now:
- evaluates the current scene before each pass
- evaluates the candidate after each pass
- uses the same acceptance gate
- stops once a pass fails to improve the scene

That makes the preview-path polish safer and keeps it from silently degrading quality.

## Dev diagnostics

Dev-only repair logging:
- one concise log per repair trigger
- initial structural state
- dominant failure type
- attempted strategies
- after state
- score delta
- accepted / rejected

No continuous per-render logging was added.
