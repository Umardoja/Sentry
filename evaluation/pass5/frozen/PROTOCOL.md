# Pass 5 frozen evaluation protocol

Frozen before the first held-out execution. Corpus SHA-256: `c265eebf1319aa73617635397d5017bb018dfbca310d9f035d6aad1cdaa80b75`.

## Task and unit

One ordered synthetic incident episode for one target actor within the production 24-hour evaluator window. The target is whether review is warranted under the declared synthetic policy, not criminality, intent, prevented loss or production fraud. Supported errors on review-warranted episodes count as misses. Unsupported episodes never enter binary denominators.

## Frozen corpus

- Development: 16 episodes with seeds 6101–6116, used for harness checks only.
- Held-out: 64 episodes: four variations of fifteen supported families (60 binary episodes) plus four source-unavailability episodes.
- Held-out seeds: 7201–7204 within each family.
- Legitimate exceptions include same-customer alternate accounts, a successful original with a prior complaint, approved overtime, assigned record access, unfamiliar terminal alone and outside-roster activity alone.
- Every supported episode gets a fresh SQLite database. Peer statistics are fixed background context, not learned from held-out events.

## Configurations

**A — banking-purpose rules.** Production purpose checks; review any non-MATCHED result. This intentionally treats known missing evidence as review-worthy under the complete synthetic-source assumption.

**B — behaviour/identity without purpose.** Production Behaviour/Identity hits only. Review for ON_LEAVE or at least two active component findings totalling 15 points. Purpose-derived proxies are excluded; VOLUME_ANOMALY uses unsuppressed component points.

**C — simple union.** Review if A or B recommends review.

**D — revised Full SENTRY.** Production purpose/evaluator plus `risk-review-v2`. Review when the score reaches 30 or canonical evidence has R1 missing original, R2 ineligible original, R3 amount mismatch, R4 wrong beneficiary, R5 duplicate reversal, or V1 unrelated record access. The score and level are not inflated. A low-score critical contradiction returns REVIEW_REQUIRED; Hold/Contain remain score-ladder states.

## Measurements and freeze rule

Report TP, FN, FP and TN before precision, recall and false-positive rate. Legitimate review burden is FP count. Undefined ratios are N/A. Errors and unsupported episodes remain visible. Evidence-link coverage measures local resolvability, not truth. First and post-ticket outputs are retained. Hidden label fields are changed only after prediction and must not alter outputs.

No thresholds, weights, reason list, labels or cohort membership may change after held-out inspection. A change informed by held-out results makes this run development evidence and requires another unused cohort.

## Limitations

Source unavailability remains unsupported. R1/V1 hard-missing conclusions apply only to the declared healthy and complete local simulator source. Partial-refund entitlement, human review time, production prevalence, bank execution and distributed concurrency are excluded.
