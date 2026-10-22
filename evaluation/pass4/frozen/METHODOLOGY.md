# Pass 4 frozen evaluation protocol

Frozen before the first held-out execution. Corpus SHA-256: `5ac1d303c8d4757969eea40c4afd7f023b273718593d8b4083a496d89697f72d`.

## Task and unit

The unit is one short ordered synthetic incident episode for one target actor within a 24-hour evaluator window and a predefined background context. The target is whether review is warranted under the stated synthetic policy—not criminality, employee intent, prevented loss, or production fraud.

Binary metrics use only supported `LEGITIMATE` and `REVIEW_WARRANTED` episodes. `INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED` episodes are reported separately and never counted as negatives or successful abstentions. A supported engine error is a failed output and counts as an end-to-end miss for a review-warranted episode.

## Frozen corpus

- Development: 12 episodes with seeds 3101–3112, used only for harness debugging and policy sanity.
- Held-out evaluation: 72 episodes: six variations of each of eleven supported families (66 binary episodes) plus six explicitly unsupported source-unavailability episodes. Evaluation seeds are 4101–4106 within every family.
- Time horizon: the production evaluator's current trailing 24-hour window.
- Variation: amounts, workload count, record-view count, employment type, and the presence of ticket, overtime, leave and terminal context. Names and labels are not evaluator inputs.
- Every supported episode receives a fresh SQLite database. Peer statistics are frozen synthetic background inputs (reversal mean 2/sd 1; record-view mean 3/sd 2), not learned from the held-out episodes.

## Configuration policies

**A — banking-purpose rules.** Run the production `runPurpose()/purposeEngine()`. Recommend Verify if any episode action has a non-`MATCHED` purpose result. This includes original-debit, eligibility, amount, destination, duplicate, record-case and applicable ticket checks. A wrong destination is therefore detectable even when it is the only contradiction.

**B — behaviour/identity without purpose matching.** Use only production hits whose signal definition is Behaviour or Identity. Purpose and Money hits are excluded. Recommend Verify for `ON_LEAVE`, or for at least two active independent Behaviour/Identity findings totalling at least 15 points. `NEW_TERMINAL` alone is not sufficient. Approved-overtime W1 remains because it is non-purpose context. For `VOLUME_ANOMALY`, use its unsuppressed component points so production W2's purpose-match dependency does not contaminate this ablation. This is an experimental standalone policy, not the full production ladder.

**C — simple union.** Derived from A and B: review if either recommends review. No second detector or additional threshold.

**D — current full SENTRY.** Run production purpose checks and `createEvaluator()` with existing signals, waivers, weights and thresholds. Recommend review when the production level is Verify, Hold or Contain (score >=30). No ladder, case, approval, or containment is executed; this is an engine-level recommendation.

## Measurements

Counts precede rates. TP, FN, FP and TN are episode-level. Precision is TP/(TP+FP), recall TP/(TP+FN), false-positive rate FP/(FP+TN), and legitimate review burden is the FP count. Undefined ratios are `null`/N/A. Findings with an action, transaction, login/terminal or event-time reference count as traceable; this measures resolvability, not truth or source independence. First and final outputs are retained for genuine-ticket families.

No threshold or label changes are allowed after inspecting held-out outputs. If those outputs later influence policy, this run becomes development evidence and a new corpus is required.

## Inclusion, exclusions and unsupported coverage

Included: deterministic available-evidence purpose, behaviour, identity and implemented money context. Source unavailability is unsupported because no source-status injection boundary exists. A healthy query returning no row is evaluated only in the separate missing-original family under an explicitly complete synthetic-source assumption. Partial-refund entitlement, concurrent retries, external bank execution, enterprise identity, human review time and hidden off-system misuse are excluded.

## Label isolation

Targets and rationales remain in the corpus envelope; only `episode.input` reaches fixture construction and the production evaluator. Database `is_malicious` is always initialized to zero. The runner flips it only after prediction and verifies that decisions, scores and finding codes do not change. Neutral IDs reveal neither family nor target.

## Frozen source fingerprints

- `src/server/engines/purpose.ts`: `8010fbe030859bedb52e8a027c6b7754f78972b30f2fc303ddc264959d7cef2d`
- `src/server/engines/pipeline.ts`: `7f53ffb50dae42870a563f0000b58f824f8bb9aec34aadb57e492fbaff315795`
- `src/server/engines/signals.ts`: `7e536504c40016b36fd03ba4b6485d2b60dcd5ef162432d508841eed3539b25a`
- `src/server/sim/player.ts`: `7d6e6e8aef82a87400276d0c0022fb03f1a31d11610368dd4e067acabfbb03de`
- `src/server/services/review.ts`: `0ddd2fc5c8b82a3c2f5c0b3326d08bd99d17fde5f04540746cc7c03cec4ab894`
- `src/server/services/run.ts`: `11b04ed8ff3a3de993c39dc1fa589acf59b988c8f649611c730e06c23fb9a8bd`
- `src/server/db/migrate.ts`: `ef5a62768caf022fde12f48dd72585cd30e8ef9978a1c880f033d3f93b9a8692`
- `evaluation/pass4/corpus.ts`: `2afa4c0dcd234e81f42bf2e80a3c7412f0626f8da75d7ce395ec1c276a3e646e`
- `evaluation/pass4/metrics.ts`: `87750c629526121e6f19e0dec5dda0a4c4148b1fe2b83df80513b2e3e2ee60ae`
- `evaluation/pass4/evaluator.ts`: `7e6c0de72d7dfc427be2f6187fb8a08c24588d7046d48b9d97756b6fa79f1a46`


## Interpretation boundary

This is a deliberately constructed internal synthetic comparison, not an external benchmark or a representation of any bank's controls. Repeated seeds within a family are not independent real-world incidents.
