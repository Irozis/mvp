# Social Square Visual Policy Preview

## Contact sheets
![Before policy change](C:\Users\Fedelesh_dm\mvp\dataset\social-square\reports\contact-sheet-before.svg)

![After policy change](C:\Users\Fedelesh_dm\mvp\dataset\social-square\reports\contact-sheet-after.svg)

## Review basis
- Real square overlay cases from `dataset/social-square`
- Duplicate handling: `Group 1` excluded from comparison; `Group 16` kept as canonical stress case
- Policy scope: only `social-square / square-hero-overlay`

## Improved cases
- Group 4 (core, clean) fail -> pass
- Group 7 (core, clean) fail -> pass
- Group 8 (core, clean) fail -> pass
- Group 9 (core, clean) fail -> pass
- Group 23 (core, clean) fail -> pass
- Group 11 (stress, clean) fail -> pass
- Group 13 (stress, clean) fail -> pass
- Group 16 (stress, clean) fail -> pass
- Group 17 (stress, clean) fail -> pass
- Group 19 (stress, clean) fail -> pass

## Unchanged passes
- Group 25 (core, clean)
- Group 14 (stress, clean)

## Still fail
- Group 10 (core, clean): subtitle 0.017 > 0.015
- Group 5 (stress, ambiguous): safeTextScore 0.7807 < 0.87; safeAreaCoverage 0 < 0.22
- Group 18 (stress, ambiguous): headline 0.0487 > 0.0125; safeTextScore 0.823 < 0.87
- Group 2 (stress, clean): headline 0.0206 > 0.0125
- Group 3 (stress, clean): subtitle 0.0428 > 0.015
- Group 6 (stress, clean): headline 0.0127 > 0.0125; subtitle 0.0162 > 0.015
- Group 12 (stress, clean): safeTextScore 0.859 < 0.87
- Group 15 (stress, clean): safeAreaCoverage 0 < 0.22
- Group 20 (stress, clean): subtitle 0.1527 > 0.015; badge 0.0179 > 0.005
- Group 21 (stress, clean): headline 0.019 > 0.0125; subtitle 0.0282 > 0.015
- Group 22 (stress, clean): headline 0.0486 > 0.0125; safeTextScore 0.7579 < 0.87
- Group 24 (stress, clean): headline 0.0241 > 0.0125

## Suspicious passes
- Group 4 (core, clean)
- Group 7 (core, clean)
- Group 8 (core, clean)
- Group 9 (core, clean)
- Group 23 (core, clean)
- Group 25 (core, clean)
- Group 11 (stress, clean)
- Group 13 (stress, clean)
- Group 14 (stress, clean)
- Group 16 (stress, clean)
- Group 17 (stress, clean)
- Group 19 (stress, clean)

## Regressions
- none

## Notes
- `safeCoverageMin` stays diagnostic-only and is not used as a gating threshold.
- `logo` stays unchanged because fitting still marks it as insufficient data.
- This report is preview-oriented: it visualizes pass/fail and review impact on real square cases after the approved social-square policy apply.
