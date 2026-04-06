# Step 3 Implementation Summary

## 1. What changed
The normal preview path now generates a small set of bounded layout candidates per format, evaluates each candidate using structural validity plus the current assessment system, and selects the best candidate before returning the preview scene.

This upgrade is intentionally narrow:
- no layout-engine rewrite
- no fixLayout redesign
- no UI redesign
- no unbounded search

## 2. Candidate generation strategy
Candidate planning is implemented in [`src/lib/autoAdapt.ts`](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts).

Candidate budget:
- hard cap: `4` candidates per format

Candidate diversity comes from controlled variations of the existing intent/model system:
- base heuristic intent
- alternative family using the existing `getAlternativeIntent(...)`
- secondary family variation when distinct
- alternative composition model when available
- one regional-stability candidate for dense / display / print / portrait / wide-like formats

Guardrails:
- candidates are deduplicated by family, model, fixStage, mode, textMode, imageMode, and balanceMode
- manual family overrides do not trigger family exploration
- manual composition model overrides do not trigger model exploration
- structural / non-base fix stages stay narrow instead of opening a wide search

## 3. Candidate evaluation and selection
Each candidate is evaluated with:
- `assessment.structuralState`
- `assessment.issues`
- `computeScoreTrust(assessment)` for an effective quality score even without AI review

Selection policy:
1. prefer `valid` over `degraded`
2. prefer `degraded` over `invalid`
3. within the same structural tier, prefer higher effective score
4. break ties with:
   - fewer high structural findings
   - fewer critical issues
   - fewer high issues
   - fewer total structural findings
   - fewer total issues

If all candidates are invalid:
- the selector still chooses the least bad candidate
- its structural status remains explicit through the normal assessment path

## 4. Integration points
Normal generation now uses candidate selection in:
- [`buildDeterministicVariant`](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts)
- [`generateVariant`](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts)

That means the improvement automatically flows into:
- [`buildProject`](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts)
- [`regenerateFormats`](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts)

`fixLayout` was left unchanged in this step.

The existing lightweight `runAutoFix(...)` still runs only after candidate selection, so the engine now:
- picks a better base candidate first
- then applies the existing local polish pass once

## 5. Performance considerations
The search stays bounded and deterministic:
- max `4` candidates per format
- no combinatorial family × model × typography explosion
- no recursive search
- no candidate rendering loops in the UI

This keeps the preview path inspectable and responsive while still being meaningfully more robust than the old single-pass flow.

## 6. Optional dev diagnostics
There is now a concise dev-only preview candidate selection summary in [`src/lib/autoAdapt.ts`](/C:/Users/Fedelesh_dm/mvp/src/lib/autoAdapt.ts).

It logs per format:
- candidate count
- valid / degraded / invalid candidate counts
- selected strategy
- selected structural status
- selected effective score
- top rejection reasons among discarded candidates

Anti-spam:
- the log is suppressed unless the per-format summary snapshot changes

