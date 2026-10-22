# Pass 5 comparative evaluation results

Corpus: `c265eebf1319aa73617635397d5017bb018dfbca310d9f035d6aad1cdaa80b75`; split: **development**. Internal synthetic evidence only.

| Configuration | TP | FN | FP | TN | Precision | Recall | FPR | Legitimate review burden | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A Purpose rules | 7 | 1 | 0 | 7 | 100.0% | 87.5% | 0.0% | 0 | 0 |
| B Behaviour/identity | 1 | 7 | 0 | 7 | 100.0% | 12.5% | 0.0% | 0 | 0 |
| C Simple union | 8 | 0 | 0 | 7 | 100.0% | 100.0% | 0.0% | 0 | 0 |
| D Revised Full SENTRY | 8 | 0 | 0 | 7 | 100.0% | 100.0% | 0.0% | 0 | 0 |

Binary cohort contains supported LEGITIMATE and REVIEW_WARRANTED episodes only. TP means review-warranted and reviewed; FN means review-warranted but not reviewed; FP is a legitimate episode reviewed; TN is legitimate and not reviewed.

## Coverage

- Episodes 16; supported 15; unsupported 1; errors 0.
- Hidden-label invariance 15/15.
- Source-unavailable episodes remain unsupported and outside binary denominators.

## Critical example

P5DEV-008 retained REVERSAL_WRONG_BENEFICIARY, POLICY_R4_WRONG_BENEFICIARY after genuine ticket submission. Revised Full SENTRY returned REVIEW_REQUIRED at score 20; reason codes R4_WRONG_BENEFICIARY. The score was not raised to 30.

## Descriptive comparison with Pass 4

Pass 4's previously consulted cohort reported A 36/6/0/24, B 6/36/0/24, C 42/0/0/24 and D 12/30/0/24 (TP/FN/FP/TN). It was diagnostic input, not reused held-out evidence. This Pass 5 cohort has new seeds, families and legitimate exception combinations. Differences are descriptive, not a claim of independent production improvement.

## Unsupported/errors

| Episode | Family | Status | Reason |
|---|---|---|---|
| P5DEV-016 | source_unavailable | UNSUPPORTED | No source-status boundary exists; unavailability cannot be evaluated without fabricating evidence. |

## Limits

This run measures deterministic engine-level review recommendations. It does not measure human time, production prevalence, bank fraud accuracy, money saved, bank execution, or case disposition. R1/V1 hard findings assume a healthy complete local source; source availability itself is not implemented.
