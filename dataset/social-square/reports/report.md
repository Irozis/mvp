# Social Square Extraction Report

## Inventory
- core: 8
- stress: 17
- reject: 1
- valid for hero calibration: 25

## Problem Cases
### Incomplete
- Group 26 (reject)

### Ambiguous
- Group 5 (stress)
- Group 18 (stress)

## Notes
- This stage only builds dataset manifest and extracts annotated bounding boxes from overlay PNG files.
- No threshold tuning or production policy changes were applied.
- Flags are conservative:
  - `incomplete` means the red hero subject box was not found.
  - `ambiguous` means singleton elements split into multiple strong components or text colors fragmented unusually heavily.
- Effective classification may include manual triage overrides on top of raw extracted flags.
