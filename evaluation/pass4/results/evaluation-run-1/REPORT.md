# Pass 4 comparative evaluation results

Corpus: `5ac1d303c8d4757969eea40c4afd7f023b273718593d8b4083a496d89697f72d`. Split: **evaluation**. This is an internal synthetic available-evidence comparison, not a production bank benchmark.

## Counts and rates

| Configuration | TP | FN | FP | TN | Precision | Recall | False-positive rate | Legitimate episodes reviewed | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A Purpose rules | 36 | 6 | 0 | 24 | 100.0% | 85.7% | 0.0% | 0 | 0 |
| B Behaviour/identity | 6 | 36 | 0 | 24 | 100.0% | 14.3% | 0.0% | 0 | 0 |
| C Simple union | 42 | 0 | 0 | 24 | 100.0% | 100.0% | 0.0% | 0 | 0 |
| D Full SENTRY | 12 | 30 | 0 | 24 | 100.0% | 28.6% | 0.0% | 0 | 0 |

TP means a supported review-warranted episode received a review recommendation within the episode. FN means it did not. FP is a legitimate episode recommended for review. TN is a legitimate episode not recommended for review. Undefined ratios are N/A.

## Coverage accounting

- Total episodes: 72; supported binary cohort: 66; unsupported: 6; engine errors: 0.
- Hidden-label invariance: 66/66 supported episodes retained identical decisions, scores and finding codes after post-prediction `is_malicious`/scenario-tag changes.
- Source-unavailable evaluation is not supported and is not counted as benign, detected or abstained.

## Disagreements

| Episode | Family | Expected policy target | Decisions | Finding codes |
|---|---|---|---|---|
| EVAL-013 | wrong_destination_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-014 | wrong_destination_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-015 | wrong_destination_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-016 | wrong_destination_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-017 | wrong_destination_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-018 | wrong_destination_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-019 | amount_mismatch | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R3; B:none; C:PURPOSE_R3; D:AMOUNT_MISMATCH |
| EVAL-020 | amount_mismatch | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R3; B:none; C:PURPOSE_R3; D:AMOUNT_MISMATCH |
| EVAL-021 | amount_mismatch | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R3; B:none; C:PURPOSE_R3; D:AMOUNT_MISMATCH |
| EVAL-022 | amount_mismatch | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R3; B:none; C:PURPOSE_R3; D:AMOUNT_MISMATCH |
| EVAL-023 | amount_mismatch | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R3; B:none; C:PURPOSE_R3; D:AMOUNT_MISMATCH |
| EVAL-024 | amount_mismatch | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R3; B:none; C:PURPOSE_R3; D:AMOUNT_MISMATCH |
| EVAL-025 | missing_original | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; B:none; C:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; D:REVERSAL_NO_MATCH |
| EVAL-026 | missing_original | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; B:none; C:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; D:REVERSAL_NO_MATCH |
| EVAL-027 | missing_original | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; B:none; C:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; D:REVERSAL_NO_MATCH |
| EVAL-028 | missing_original | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; B:none; C:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; D:REVERSAL_NO_MATCH |
| EVAL-029 | missing_original | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; B:none; C:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; D:REVERSAL_NO_MATCH |
| EVAL-030 | missing_original | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; B:none; C:PURPOSE_R1,PURPOSE_R2,PURPOSE_R3,PURPOSE_R4; D:REVERSAL_NO_MATCH |
| EVAL-031 | distinct_duplicate | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R5; B:none; C:PURPOSE_R5; D:REVERSAL_DUPLICATE |
| EVAL-032 | distinct_duplicate | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R5; B:none; C:PURPOSE_R5; D:REVERSAL_DUPLICATE |
| EVAL-033 | distinct_duplicate | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R5; B:none; C:PURPOSE_R5; D:REVERSAL_DUPLICATE |
| EVAL-034 | distinct_duplicate | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R5; B:none; C:PURPOSE_R5; D:REVERSAL_DUPLICATE |
| EVAL-035 | distinct_duplicate | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R5; B:none; C:PURPOSE_R5; D:REVERSAL_DUPLICATE |
| EVAL-036 | distinct_duplicate | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R5; B:none; C:PURPOSE_R5; D:REVERSAL_DUPLICATE |
| EVAL-043 | unrelated_record_access | REVIEW_WARRANTED | A:review; B:no; C:review; D:review | A:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1; B:VOLUME_ANOMALY; C:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,VOLUME_ANOMALY; D:RECORD_VIEW_NO_CASE,VOLUME_ANOMALY |
| EVAL-044 | unrelated_record_access | REVIEW_WARRANTED | A:review; B:no; C:review; D:review | A:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1; B:VOLUME_ANOMALY; C:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,VOLUME_ANOMALY; D:RECORD_VIEW_NO_CASE,VOLUME_ANOMALY |
| EVAL-045 | unrelated_record_access | REVIEW_WARRANTED | A:review; B:no; C:review; D:review | A:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1; B:VOLUME_ANOMALY; C:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,VOLUME_ANOMALY; D:RECORD_VIEW_NO_CASE,VOLUME_ANOMALY |
| EVAL-046 | unrelated_record_access | REVIEW_WARRANTED | A:review; B:no; C:review; D:review | A:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1; B:VOLUME_ANOMALY; C:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,VOLUME_ANOMALY; D:RECORD_VIEW_NO_CASE,VOLUME_ANOMALY |
| EVAL-047 | unrelated_record_access | REVIEW_WARRANTED | A:review; B:no; C:review; D:review | A:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1; B:VOLUME_ANOMALY; C:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,VOLUME_ANOMALY; D:RECORD_VIEW_NO_CASE,VOLUME_ANOMALY |
| EVAL-048 | unrelated_record_access | REVIEW_WARRANTED | A:review; B:no; C:review; D:review | A:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1; B:VOLUME_ANOMALY; C:PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,PURPOSE_V1,VOLUME_ANOMALY; D:RECORD_VIEW_NO_CASE,VOLUME_ANOMALY |
| EVAL-049 | valid_purpose_identity_concern | REVIEW_WARRANTED | A:no; B:review; C:review; D:review | A:none; B:ON_LEAVE,NEW_TERMINAL; C:ON_LEAVE,NEW_TERMINAL; D:ON_LEAVE,NEW_TERMINAL |
| EVAL-050 | valid_purpose_identity_concern | REVIEW_WARRANTED | A:no; B:review; C:review; D:review | A:none; B:ON_LEAVE,NEW_TERMINAL; C:ON_LEAVE,NEW_TERMINAL; D:ON_LEAVE,NEW_TERMINAL |
| EVAL-051 | valid_purpose_identity_concern | REVIEW_WARRANTED | A:no; B:review; C:review; D:review | A:none; B:ON_LEAVE,NEW_TERMINAL; C:ON_LEAVE,NEW_TERMINAL; D:ON_LEAVE,NEW_TERMINAL |
| EVAL-052 | valid_purpose_identity_concern | REVIEW_WARRANTED | A:no; B:review; C:review; D:review | A:none; B:ON_LEAVE,NEW_TERMINAL; C:ON_LEAVE,NEW_TERMINAL; D:ON_LEAVE,NEW_TERMINAL |
| EVAL-053 | valid_purpose_identity_concern | REVIEW_WARRANTED | A:no; B:review; C:review; D:review | A:none; B:ON_LEAVE,NEW_TERMINAL; C:ON_LEAVE,NEW_TERMINAL; D:ON_LEAVE,NEW_TERMINAL |
| EVAL-054 | valid_purpose_identity_concern | REVIEW_WARRANTED | A:no; B:review; C:review; D:review | A:none; B:ON_LEAVE,NEW_TERMINAL; C:ON_LEAVE,NEW_TERMINAL; D:ON_LEAVE,NEW_TERMINAL |
| EVAL-061 | repeated_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-062 | repeated_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-063 | repeated_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-064 | repeated_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-065 | repeated_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |
| EVAL-066 | repeated_genuine_ticket | REVIEW_WARRANTED | A:review; B:no; C:review; D:no | A:PURPOSE_R4; B:none; C:PURPOSE_R4; D:REVERSAL_WRONG_BENEFICIARY |

## Unsupported/errors

| Episode | Family | Status | Reason |
|---|---|---|---|
| EVAL-067 | source_unavailable | UNSUPPORTED | No source-status injection boundary exists; absence must not be relabelled as an outage. |
| EVAL-068 | source_unavailable | UNSUPPORTED | No source-status injection boundary exists; absence must not be relabelled as an outage. |
| EVAL-069 | source_unavailable | UNSUPPORTED | No source-status injection boundary exists; absence must not be relabelled as an outage. |
| EVAL-070 | source_unavailable | UNSUPPORTED | No source-status injection boundary exists; absence must not be relabelled as an outage. |
| EVAL-071 | source_unavailable | UNSUPPORTED | No source-status injection boundary exists; absence must not be relabelled as an outage. |
| EVAL-072 | source_unavailable | UNSUPPORTED | No source-status injection boundary exists; absence must not be relabelled as an outage. |

## What improved, tied and regressed

- The simple union detected 42/42 supported review-warranted episodes. Full SENTRY detected 12/42. On this corpus, aggregation did **not** demonstrate incremental detection value over combining the two simpler decisions.
- Full SENTRY added the high-volume unrelated-record-access recommendations that behaviour/identity alone missed, and retained the independent identity-concern recommendations that purpose rules missed. The purpose baseline nevertheless caught the single-fact reversal contradictions that remained below Full SENTRY's score threshold.
- All configurations tied on the 24 legitimate episodes and produced 0 false positives in this deliberately constructed set. This is not an estimate of production false-positive prevalence.
- In EVAL-013, the first wrong-destination finding produced Full SENTRY score 20 and recommendation NO_REVIEW. After a genuine ticket was submitted, the score was 20, the recommendation was NO_REVIEW, and finding codes remained REVERSAL_WRONG_BENEFICIARY. The ticket did not authorize or clear the substituted destination, but the aggregate threshold did not recommend review in this otherwise routine fixture.

## Error-analysis examples

- **Simpler rule already sufficient:** wrong destination plus genuine ticket was independently labelled review-warranted from destination facts. Purpose rules and the union recommended review; Full SENTRY retained the evidence but stayed below its review threshold. Cause: aggregation/threshold, not missing evidence.
- **Combined context helps:** valid purpose plus an independent on-leave/new-terminal concern was missed by purpose rules and caught by behaviour/identity, the union and Full SENTRY. Cause: identity context outside purpose matching.
- **Tie:** routine reversals and approved overtime were not reviewed by any configuration. This only shows agreement on these synthetic fixtures.
- **Unsupported boundary:** six source-unavailable episodes remain outside the binary cohort because the product cannot represent unavailable versus a healthy source returning no row.

## Interpretation limits

The current full configuration is measured only through the production purpose engine and evaluator recommendation threshold. It does not open a case, execute an intervention, exercise authentication, or simulate a human decision. The constructed class mix cannot estimate production prevalence, investigation time, money saved, or bank fraud accuracy. Traceable evidence links show that a referenced local row can be resolved; they do not establish source truth or independence.
