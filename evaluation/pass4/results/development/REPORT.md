# Pass 4 comparative evaluation results

Corpus: `5ac1d303c8d4757969eea40c4afd7f023b273718593d8b4083a496d89697f72d`. Split: **development**. This is an internal synthetic available-evidence comparison, not a production bank benchmark.

## Counts and rates

| Configuration | TP | FN | FP | TN | Precision | Recall | False-positive rate | Legitimate episodes reviewed | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A Purpose rules | 7 | 1 | 0 | 4 | 100.0% | 87.5% | 0.0% | 0 | 0 |
| B Behaviour/identity | 1 | 7 | 0 | 4 | 100.0% | 12.5% | 0.0% | 0 | 0 |
| C Simple union | 8 | 0 | 0 | 4 | 100.0% | 100.0% | 0.0% | 0 | 0 |
| D Full SENTRY | 2 | 6 | 0 | 4 | 100.0% | 25.0% | 0.0% | 0 | 0 |

TP means a supported review-warranted episode received a review recommendation within the episode. FN means it did not. FP is a legitimate episode recommended for review. TN is a legitimate episode not recommended for review. Undefined ratios are N/A.

## Coverage accounting

- Total episodes: 12; supported binary cohort: 12; unsupported: 0; engine errors: 0.
- Hidden-label invariance: 12/12 supported episodes retained identical decisions, scores and finding codes after post-prediction `is_malicious`/scenario-tag changes.
- Source-unavailable evaluation is not supported and is not counted as benign, detected or abstained.

## Disagreements

| Episode | Family | Expected policy target | Decisions | Finding codes |
|---|---|---|---|---|
| DEV-003 | wrong_destination_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| DEV-004 | amount_mismatch | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R3; B:none; C:PURPOSE_R3; D:AMOUNT_MISMATCH |
| DEV-005 | missing_original | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; B:none; C:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; D:REVERSAL_NO_MATCH |
| DEV-006 | distinct_duplicate | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R5; B:none; C:PURPOSE_R5; D:REVERSAL_DUPLICATE |
| DEV-008 | unrelated_record_access | REVIEW_WARRANTED | A:review; B:no; C:review; D:review | A:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1; B:VOLUME_ANOMALY; C:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,VOLUME_ANOMALY; D:RECORD_VIEW_NO_CASE,VOLUME_ANOMALY |
| DEV-009 | valid_purpose_identity_concern | REVIEW_WARRANTED | A:no; B:review; C:review; D:review | A:none; B:ON_LEAVE,NEW_TERMINAL; C:ON_LEAVE,NEW_TERMINAL; D:ON_LEAVE,NEW_TERMINAL |
| DEV-011 | repeated_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| DEV-012 | wrong_destination_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |

## Unsupported/errors

| Episode | Family | Status | Reason |
|---|---|---|---|
| — | — | None | — |

## Interpretation limits

The current full configuration is measured only through the production purpose engine and evaluator recommendation threshold. It does not open a case, execute an intervention, exercise authentication, or simulate a human decision. The constructed class mix cannot estimate production prevalence, investigation time, money saved, or bank fraud accuracy. Traceable evidence links show that a referenced local row can be resolved; they do not establish source truth or independence.
