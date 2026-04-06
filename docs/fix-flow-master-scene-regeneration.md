# Fix Flow Master-Scene Regeneration

## Problem

The real UI fix lifecycle was mixing two different responsibilities:

- comparison and local repair were operating on the currently rendered format scene
- regeneration was also using that same rendered format scene as `master`

That trapped Fix layout / Fix again / Try different layout inside a weak local neighborhood. The repair flow could compare against the current scene correctly, but its regeneration step was not re-entering the stronger master-based candidate space used by normal format generation and diagnostics.

## Change

The repair pipeline now carries two explicit scene inputs:

- `scene`: the current rendered format scene, still used as the baseline for assessment, local repair, and before/after acceptance
- `regenerationMasterScene`: the original `project.master` scene, used only when regeneration-based strategies call `generateVariant(...)`

`App.tsx` now passes `project.master` into `fixLayout(...)`, and the guided regeneration path in `autoAdapt.ts` uses that master scene instead of the current weak format scene.

## Result

The lifecycle is now:

1. compare against the current rendered format scene
2. apply local repair against that current scene when appropriate
3. regenerate alternative candidates from the original master scene
4. evaluate regenerated candidates against the current rendered baseline
5. keep the existing acceptance and repeat-suppression logic

This keeps the repair pipeline bounded while allowing the UI fix flow to access the same stronger candidate space already proven by marketplace-card exploration.
