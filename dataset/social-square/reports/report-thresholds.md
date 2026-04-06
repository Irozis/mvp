# Social Square Threshold Fitting Report

## Candidate sets
| Set | Metric | Threshold | Basis | Basis value |
| --- | --- | ---: | --- | ---: |
| strict | headline maxOverlapRatio | 0.01 | p85 | 0.0084 |
| strict | subtitle maxOverlapRatio | 0.0125 | p85 | 0.0109 |
| strict | badge maxOverlapRatio | 0.005 | p85 | 0.0025 |
| strict | safeTextScoreMin | 0.92 | max(p15, robustLowerBound) (min=0.8798, p10=0.9126, p15=0.929, robust=0.9088) | 0.929 |
| strict | safeCoverageMin | 1 | max(p15, robustLowerBound) (min=1, p10=1, p15=1, robust=1) | 1 |
| strict | safeAreaCoverageMin | 0.28 | max(p15, robustLowerBound) (min=0.2254, p10=0.2659, p15=0.2861, robust=0.2466) | 0.2861 |
| balanced | headline maxOverlapRatio | 0.01 | p90 | 0.0094 |
| balanced | subtitle maxOverlapRatio | 0.015 | p90 | 0.0129 |
| balanced | badge maxOverlapRatio | 0.005 | p90 | 0.0027 |
| balanced | safeTextScoreMin | 0.91 | max(p10, robustLowerBound) (min=0.8798, p10=0.9126, p15=0.929, robust=0.9088) | 0.9126 |
| balanced | safeCoverageMin | 1 | max(p10, robustLowerBound) (min=1, p10=1, p15=1, robust=1) | 1 |
| balanced | safeAreaCoverageMin | 0.26 | max(p10, robustLowerBound) (min=0.2254, p10=0.2659, p15=0.2861, robust=0.2466) | 0.2659 |
| lenient | headline maxOverlapRatio | 0.0125 | p95 | 0.0104 |
| lenient | subtitle maxOverlapRatio | 0.015 | p95 | 0.015 |
| lenient | badge maxOverlapRatio | 0.005 | p95 | 0.0028 |
| lenient | safeTextScoreMin | 0.87 | min (min=0.8798, p10=0.9126, p15=0.929, robust=0.9088) | 0.8798 |
| lenient | safeCoverageMin | 1 | min (min=1, p10=1, p15=1, robust=1) | 1 |
| lenient | safeAreaCoverageMin | 0.22 | min (min=0.2254, p10=0.2659, p15=0.2861, robust=0.2466) | 0.2254 |

## Comparison across groups
| Set | Group | Pass rate | Pass count | Reject count | Rejected cases |
| --- | --- | ---: | ---: | ---: | --- |
| strict | core-clean | 0.625 | 5/8 | 3 | Group 8, Group 10, Group 23 |
| strict | core-ambiguous | 0 | 0/0 | 0 | - |
| strict | stress-clean | 0.3333 | 5/15 | 10 | Group 2, Group 3, Group 6, Group 12, Group 15, Group 19, Group 20, Group 21, Group 22, Group 24 |
| strict | stress-ambiguous | 0 | 0/2 | 2 | Group 5, Group 18 |
| balanced | core-clean | 0.625 | 5/8 | 3 | Group 8, Group 10, Group 23 |
| balanced | core-ambiguous | 0 | 0/0 | 0 | - |
| balanced | stress-clean | 0.3333 | 5/15 | 10 | Group 2, Group 3, Group 6, Group 12, Group 15, Group 19, Group 20, Group 21, Group 22, Group 24 |
| balanced | stress-ambiguous | 0 | 0/2 | 2 | Group 5, Group 18 |
| lenient | core-clean | 0.875 | 7/8 | 1 | Group 10 |
| lenient | core-ambiguous | 0 | 0/0 | 0 | - |
| lenient | stress-clean | 0.4 | 6/15 | 9 | Group 2, Group 3, Group 6, Group 12, Group 15, Group 20, Group 21, Group 22, Group 24 |
| lenient | stress-ambiguous | 0 | 0/2 | 2 | Group 5, Group 18 |

## Boundary cases
- strict / core-clean / Group 1: safeTextScoreMin (0.9345 vs 0.92) [passes]
- strict / core-clean / Group 4: safeAreaCoverageMin (0.2929 vs 0.28) [passes]
- strict / core-clean / Group 8: badge maxOverlapRatio (0.003 vs 0.005) [fails]
- strict / core-clean / Group 9: headline maxOverlapRatio (0.008 vs 0.01); safeTextScoreMin (0.9428 vs 0.92) [passes]
- strict / core-clean / Group 23: headline maxOverlapRatio (0.0115 vs 0.01); subtitle maxOverlapRatio (0.0102 vs 0.0125) [fails]
- strict / stress-clean / Group 6: safeTextScoreMin (0.8934 vs 0.92) [fails]
- strict / stress-clean / Group 15: safeTextScoreMin (0.9324 vs 0.92) [fails]
- strict / stress-clean / Group 16: safeTextScoreMin (0.9345 vs 0.92) [passes]
- strict / stress-clean / Group 20: safeTextScoreMin (0.9225 vs 0.92) [fails]
- strict / stress-clean / Group 24: badge maxOverlapRatio (0.0029 vs 0.005) [fails]
- balanced / core-clean / Group 1: safeTextScoreMin (0.9345 vs 0.91) [passes]
- balanced / core-clean / Group 8: badge maxOverlapRatio (0.003 vs 0.005) [fails]
- balanced / core-clean / Group 9: headline maxOverlapRatio (0.008 vs 0.01) [passes]
- balanced / core-clean / Group 10: subtitle maxOverlapRatio (0.017 vs 0.015) [fails]
- balanced / core-clean / Group 23: headline maxOverlapRatio (0.0115 vs 0.01) [fails]
- balanced / stress-clean / Group 6: subtitle maxOverlapRatio (0.0162 vs 0.015); safeTextScoreMin (0.8934 vs 0.91) [fails]
- balanced / stress-clean / Group 15: safeTextScoreMin (0.9324 vs 0.91) [fails]
- balanced / stress-clean / Group 16: safeTextScoreMin (0.9345 vs 0.91) [passes]
- balanced / stress-clean / Group 20: safeTextScoreMin (0.9225 vs 0.91) [fails]
- balanced / stress-clean / Group 24: badge maxOverlapRatio (0.0029 vs 0.005) [fails]
- lenient / core-clean / Group 8: badge maxOverlapRatio (0.003 vs 0.005); safeAreaCoverageMin (0.2254 vs 0.22) [passes]
- lenient / core-clean / Group 10: subtitle maxOverlapRatio (0.017 vs 0.015); safeTextScoreMin (0.8798 vs 0.87) [fails]
- lenient / core-clean / Group 23: headline maxOverlapRatio (0.0115 vs 0.0125) [passes]
- lenient / stress-clean / Group 6: headline maxOverlapRatio (0.0127 vs 0.0125); subtitle maxOverlapRatio (0.0162 vs 0.015); safeTextScoreMin (0.8934 vs 0.87) [fails]
- lenient / stress-clean / Group 12: safeTextScoreMin (0.859 vs 0.87) [fails]
- lenient / stress-clean / Group 19: safeTextScoreMin (0.8789 vs 0.87) [passes]
- lenient / stress-clean / Group 21: safeTextScoreMin (0.8724 vs 0.87) [fails]
- lenient / stress-clean / Group 24: badge maxOverlapRatio (0.0029 vs 0.005) [fails]

## Why previous provisional candidates looked strict or not
- headline maxOverlapRatio: previous provisional=0.02, balanced=0.01 -> new balanced candidate is stricter
- subtitle maxOverlapRatio: previous provisional=0.03, balanced=0.015 -> new balanced candidate is stricter
- badge maxOverlapRatio: no previous provisional candidate to compare
- safeTextScoreMin: previous provisional=0.9, balanced=0.91 -> new balanced candidate is stricter
- safeCoverageMin: previous provisional=0.76, balanced=1 -> new balanced candidate is stricter
- safeAreaCoverageMin: previous provisional=0.24, balanced=0.26 -> new balanced candidate is stricter

## Recommendation
- provisional default: lenient
- reason: no set fully preserves core-clean, so the recommendation falls back to the fewest core-clean rejects

## Warnings
- safeCoverageMin: core-clean signal is saturated at 1, so this metric has low discriminative power for fitting
- logo remains insufficient and is intentionally excluded from fitting
