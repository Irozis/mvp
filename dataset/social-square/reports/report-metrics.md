# Social Square Metrics Report

## Inventory
- core: 8
- stress: 17
- reject: 1
- valid cases used for metrics: 25
- new core-clean size: 8

## Group summaries
### core-clean

| Metric | count | valid_count | mean | median | p90 | p95 | max | min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| headlineOverlapRatio | 8 | 7 | 0.004 | 0.0032 | 0.0094 | 0.0104 | 0.0115 | 0 |
| subtitleOverlapRatio | 8 | 7 | 0.0058 | 0.0027 | 0.0129 | 0.015 | 0.017 | 0.0007 |
| logoOverlapRatio | 8 | 5 | 0.0006 | 0.0001 | 0.0017 | 0.0022 | 0.0027 | 0 |
| badgeOverlapRatio | 8 | 5 | 0.0011 | 0.0005 | 0.0027 | 0.0028 | 0.003 | 0 |
| safeTextScore | 8 | 7 | 0.9527 | 0.9602 | 0.9907 | 0.9915 | 0.9923 | 0.8798 |
| safeCoverage | 8 | 7 | 0.9218 | 1 | 1 | 1 | 1 | 0.4526 |
| safeAreaCoverage | 8 | 7 | 0.4069 | 0.4138 | 0.5178 | 0.5331 | 0.5484 | 0.2254 |

### core-ambiguous

| Metric | count | valid_count | mean | median | p90 | p95 | max | min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| headlineOverlapRatio | 0 | 0 | - | - | - | - | - | - |
| subtitleOverlapRatio | 0 | 0 | - | - | - | - | - | - |
| logoOverlapRatio | 0 | 0 | - | - | - | - | - | - |
| badgeOverlapRatio | 0 | 0 | - | - | - | - | - | - |
| safeTextScore | 0 | 0 | - | - | - | - | - | - |
| safeCoverage | 0 | 0 | - | - | - | - | - | - |
| safeAreaCoverage | 0 | 0 | - | - | - | - | - | - |

### stress-clean

| Metric | count | valid_count | mean | median | p90 | p95 | max | min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| headlineOverlapRatio | 15 | 15 | 0.0101 | 0.0043 | 0.0227 | 0.0314 | 0.0486 | 0 |
| subtitleOverlapRatio | 15 | 10 | 0.0252 | 0.0037 | 0.0538 | 0.1032 | 0.1527 | 0 |
| logoOverlapRatio | 15 | 6 | 0.0013 | 0 | 0.0041 | 0.0059 | 0.0077 | 0 |
| badgeOverlapRatio | 15 | 5 | 0.0043 | 0.0005 | 0.0119 | 0.0149 | 0.0179 | 0 |
| safeTextScore | 15 | 15 | 0.926 | 0.9345 | 0.9855 | 0.9882 | 0.9934 | 0.7579 |
| safeCoverage | 15 | 15 | 0.8053 | 1 | 1 | 1 | 1 | 0 |
| safeAreaCoverage | 15 | 15 | 0.6917 | 0.7353 | 0.9368 | 1 | 1 | 0 |

### stress-ambiguous

| Metric | count | valid_count | mean | median | p90 | p95 | max | min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| headlineOverlapRatio | 2 | 2 | 0.0244 | 0.0244 | 0.0438 | 0.0463 | 0.0487 | 0 |
| subtitleOverlapRatio | 2 | 0 | - | - | - | - | - | - |
| logoOverlapRatio | 2 | 2 | 0.0001 | 0.0001 | 0.0001 | 0.0001 | 0.0001 | 0 |
| badgeOverlapRatio | 2 | 0 | - | - | - | - | - | - |
| safeTextScore | 2 | 2 | 0.8018 | 0.8018 | 0.8188 | 0.8209 | 0.823 | 0.7807 |
| safeCoverage | 2 | 2 | 0.1971 | 0.1971 | 0.3548 | 0.3745 | 0.3942 | 0 |
| safeAreaCoverage | 2 | 2 | 0.2552 | 0.2552 | 0.4594 | 0.4849 | 0.5104 | 0 |


## Summary changes after reclassification
- core-clean / headlineOverlapRatio: valid 3 -> 7, mean 0.003 -> 0.004, median 0.0011 -> 0.0032
- core-clean / subtitleOverlapRatio: valid 3 -> 7, mean 0.002 -> 0.0058, median 0.0025 -> 0.0027
- core-clean / logoOverlapRatio: valid 1 -> 5, mean 0 -> 0.0006, median 0 -> 0.0001
- core-clean / badgeOverlapRatio: valid 3 -> 5, mean 0.0012 -> 0.0011, median 0.0005 -> 0.0005
- core-clean / safeTextScore: valid 3 -> 7, mean 0.9556 -> 0.9527, median 0.9428 -> 0.9602
- core-clean / safeCoverage: valid 3 -> 7, mean 1 -> 0.9218, median 1 -> 1
- core-clean / safeAreaCoverage: valid 3 -> 7, mean 0.4157 -> 0.4069, median 0.4733 -> 0.4138
- core-ambiguous / headlineOverlapRatio: valid 4 -> 0, mean 0.0048 -> -, median 0.0039 -> -
- core-ambiguous / subtitleOverlapRatio: valid 4 -> 0, mean 0.0087 -> -, median 0.0082 -> -
- core-ambiguous / logoOverlapRatio: valid 4 -> 0, mean 0.0007 -> -, median 0.0001 -> -
- core-ambiguous / badgeOverlapRatio: valid 2 -> 0, mean 0.0011 -> -, median 0.0011 -> -
- core-ambiguous / safeTextScore: valid 4 -> 0, mean 0.9506 -> -, median 0.9651 -> -
- core-ambiguous / safeCoverage: valid 4 -> 0, mean 0.8632 -> -, median 1 -> -
- core-ambiguous / safeAreaCoverage: valid 4 -> 0, mean 0.4003 -> -, median 0.4054 -> -
- stress-clean / headlineOverlapRatio: valid 10 -> 15, mean 0.0085 -> 0.0101, median 0.0019 -> 0.0043
- stress-clean / subtitleOverlapRatio: valid 6 -> 10, mean 0.0091 -> 0.0252, median 0.0024 -> 0.0037
- stress-clean / logoOverlapRatio: valid 2 -> 6, mean 0 -> 0.0013, median 0 -> 0
- stress-clean / badgeOverlapRatio: valid 2 -> 5, mean 0.0003 -> 0.0043, median 0.0003 -> 0.0005
- stress-clean / safeTextScore: valid 10 -> 15, mean 0.9348 -> 0.926, median 0.9629 -> 0.9345
- stress-clean / safeCoverage: valid 10 -> 15, mean 0.795 -> 0.8053, median 1 -> 1
- stress-clean / safeAreaCoverage: valid 10 -> 15, mean 0.681 -> 0.6917, median 0.7797 -> 0.7353
- stress-ambiguous / headlineOverlapRatio: valid 7 -> 2, mean 0.0165 -> 0.0244, median 0.0127 -> 0.0244
- stress-ambiguous / subtitleOverlapRatio: valid 4 -> 0, mean 0.0493 -> -, median 0.0222 -> -
- stress-ambiguous / logoOverlapRatio: valid 6 -> 2, mean 0.0014 -> 0.0001, median 0.0001 -> 0.0001
- stress-ambiguous / badgeOverlapRatio: valid 3 -> 0, mean 0.0069 -> -, median 0.0029 -> -
- stress-ambiguous / safeTextScore: valid 7 -> 2, mean 0.878 -> 0.8018, median 0.8789 -> 0.8018
- stress-ambiguous / safeCoverage: valid 7 -> 2, mean 0.6463 -> 0.1971, median 0.7774 -> 0.1971
- stress-ambiguous / safeAreaCoverage: valid 7 -> 2, mean 0.5823 -> 0.2552, median 0.6505 -> 0.2552

## Extreme values
- headlineOverlapRatio max = 0.0487: Group 18 (stress, ambiguous)
- headlineOverlapRatio min = 0: Group 4 (core, ambiguous), Group 8 (core), Group 3 (stress), Group 5 (stress, ambiguous), Group 13 (stress), Group 15 (stress)
- subtitleOverlapRatio max = 0.1527: Group 20 (stress, ambiguous)
- subtitleOverlapRatio min = 0: Group 17 (stress), Group 19 (stress, ambiguous)
- logoOverlapRatio max = 0.0077: Group 21 (stress, ambiguous)
- logoOverlapRatio min = 0: Group 23 (core, ambiguous), Group 25 (core), Group 17 (stress), Group 18 (stress, ambiguous), Group 19 (stress, ambiguous), Group 22 (stress), Group 24 (stress, ambiguous)
- badgeOverlapRatio max = 0.0179: Group 20 (stress, ambiguous)
- badgeOverlapRatio min = 0: Group 7 (core, ambiguous), Group 25 (core), Group 2 (stress), Group 21 (stress, ambiguous)
- safeTextScore max = 0.9934: Group 17 (stress)
- safeTextScore min = 0.7579: Group 22 (stress)
- safeCoverage max = 1: Group 1 (core), Group 4 (core, ambiguous), Group 7 (core, ambiguous), Group 8 (core), Group 9 (core), Group 23 (core, ambiguous), Group 2 (stress), Group 6 (stress, ambiguous), Group 11 (stress), Group 13 (stress), Group 14 (stress), Group 15 (stress), Group 16 (stress), Group 17 (stress), Group 19 (stress, ambiguous), Group 24 (stress, ambiguous)
- safeCoverage min = 0: Group 5 (stress, ambiguous), Group 12 (stress), Group 22 (stress)
- safeAreaCoverage max = 1: Group 12 (stress), Group 14 (stress)
- safeAreaCoverage min = 0: Group 5 (stress, ambiguous), Group 15 (stress)

## Ambiguous cases with strongest summary impact
- Group 5 (stress) score=1.8891: safeCoverage: delta=1; safeAreaCoverage: delta=0.7353; safeTextScore: delta=0.1538
- Group 18 (stress) score=0.9866: safeCoverage: delta=0.6058; safeAreaCoverage: delta=0.2249; safeTextScore: delta=0.1115; headlineOverlapRatio: delta=0.0444

## Candidate-threshold data readiness
- headline: sufficient (7 valid in core-clean) - enough clean core samples for a first candidate pass
- subtitle: sufficient (7 valid in core-clean) - enough clean core samples for a first candidate pass
- logo: insufficient (5 valid in core-clean) - insufficient clean core samples or signal too sparse
- badge: sufficient (5 valid in core-clean) - enough clean core samples for a first candidate pass
- safeTextScore: sufficient (7 valid in core-clean) - enough clean core samples for a first candidate pass
- safeCoverage: sufficient (7 valid in core-clean) - enough clean core samples for a first candidate pass
- safeAreaCoverage: sufficient (7 valid in core-clean) - enough clean core samples for a first candidate pass

## Provisional threshold fitting candidates
- headline maxOverlapRatio: candidate=0.02 (core upper-tail heuristic: max(p95, p90 + 0.01), rounded up to 0.01 and capped near observed max)
- subtitle maxOverlapRatio: candidate=0.03 (core upper-tail heuristic: max(p95, p90 + 0.01), rounded up to 0.01 and capped near observed max)
- safeTextScoreMin: candidate=0.9 (core lower-tail heuristic: p10 - 0.01, rounded down to 0.01)
- safeCoverageMin: candidate=0.76 (core lower-tail heuristic after recomputing coverage at candidate safeTextScoreMin: p10 - 0.02)
- safeAreaCoverageMin: candidate=0.24 (core lower-tail heuristic: p10 - 0.02, rounded down to 0.01)

## Notes
- This stage computes metrics only and does not fit thresholds.
- Summary groups intentionally separate clean and ambiguous cases.
- Comparison baseline uses raw extracted classification before manual triage overrides.
- Reject bucket is excluded from threshold readiness and grouped summaries.
