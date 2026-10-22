import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { corpus } from "../evaluation/pass4/corpus";

const root = process.cwd();
const output = process.env.EVAL_FREEZE_DIR;
if (!output || !isAbsolute(output)) throw new Error("EVAL_FREEZE_DIR must be an explicit absolute path");
const resolved = resolve(output);
if (!resolved.startsWith(resolve(root, "evaluation", "pass4") + "\\")) throw new Error("EVAL_FREEZE_DIR must be inside evaluation/pass4");

const sourceFiles = [
  "src/server/engines/purpose.ts",
  "src/server/engines/pipeline.ts",
  "src/server/engines/signals.ts",
  "src/server/sim/player.ts",
  "src/server/services/review.ts",
  "src/server/services/run.ts",
  "src/server/db/migrate.ts",
  "evaluation/pass4/corpus.ts",
  "evaluation/pass4/metrics.ts",
  "evaluation/pass4/evaluator.ts",
];
const hash = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");
const manifest = `${JSON.stringify({ schema_version: 1, generated_from: "evaluation/pass4/corpus.ts", episodes: corpus() }, null, 2)}\n`;
const corpusHash = hash(manifest);
const sourceHashes = Object.fromEntries(sourceFiles.map((file) => [file, hash(readFileSync(resolve(root, file)))]));
const fingerprints = `${JSON.stringify({ corpus_sha256: corpusHash, source_sha256: sourceHashes }, null, 2)}\n`;

mkdirSync(resolved, { recursive: true });
writeFileSync(resolve(resolved, "corpus-manifest.json"), manifest, "utf8");
writeFileSync(resolve(resolved, "fingerprints.json"), fingerprints, "utf8");

const protocol = `# Pass 4 frozen evaluation protocol

Frozen before the first held-out execution. Corpus SHA-256: \`${corpusHash}\`.

## Task and unit

The unit is one short ordered synthetic incident episode for one target actor within a 24-hour evaluator window and a predefined background context. The target is whether review is warranted under the stated synthetic policy—not criminality, employee intent, prevented loss, or production fraud.

Binary metrics use only supported \`LEGITIMATE\` and \`REVIEW_WARRANTED\` episodes. \`INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED\` episodes are reported separately and never counted as negatives or successful abstentions. A supported engine error is a failed output and counts as an end-to-end miss for a review-warranted episode.

## Frozen corpus

- Development: 12 episodes with seeds 3101–3112, used only for harness debugging and policy sanity.
- Held-out evaluation: 72 episodes: six variations of each of eleven supported families (66 binary episodes) plus six explicitly unsupported source-unavailability episodes. Evaluation seeds are 4101–4106 within every family.
- Time horizon: the production evaluator's current trailing 24-hour window.
- Variation: amounts, workload count, record-view count, employment type, and the presence of ticket, overtime, leave and terminal context. Names and labels are not evaluator inputs.
- Every supported episode receives a fresh SQLite database. Peer statistics are frozen synthetic background inputs (reversal mean 2/sd 1; record-view mean 3/sd 2), not learned from the held-out episodes.

## Configuration policies

**A — banking-purpose rules.** Run the production \`runPurpose()/purposeEngine()\`. Recommend Verify if any episode action has a non-\`MATCHED\` purpose result. This includes original-debit, eligibility, amount, destination, duplicate, record-case and applicable ticket checks. A wrong destination is therefore detectable even when it is the only contradiction.

**B — behaviour/identity without purpose matching.** Use only production hits whose signal definition is Behaviour or Identity. Purpose and Money hits are excluded. Recommend Verify for \`ON_LEAVE\`, or for at least two active independent Behaviour/Identity findings totalling at least 15 points. \`NEW_TERMINAL\` alone is not sufficient. Approved-overtime W1 remains because it is non-purpose context. For \`VOLUME_ANOMALY\`, use its unsuppressed component points so production W2's purpose-match dependency does not contaminate this ablation. This is an experimental standalone policy, not the full production ladder.

**C — simple union.** Derived from A and B: review if either recommends review. No second detector or additional threshold.

**D — current full SENTRY.** Run production purpose checks and \`createEvaluator()\` with existing signals, waivers, weights and thresholds. Recommend review when the production level is Verify, Hold or Contain (score >=30). No ladder, case, approval, or containment is executed; this is an engine-level recommendation.

## Measurements

Counts precede rates. TP, FN, FP and TN are episode-level. Precision is TP/(TP+FP), recall TP/(TP+FN), false-positive rate FP/(FP+TN), and legitimate review burden is the FP count. Undefined ratios are \`null\`/N/A. Findings with an action, transaction, login/terminal or event-time reference count as traceable; this measures resolvability, not truth or source independence. First and final outputs are retained for genuine-ticket families.

No threshold or label changes are allowed after inspecting held-out outputs. If those outputs later influence policy, this run becomes development evidence and a new corpus is required.

## Inclusion, exclusions and unsupported coverage

Included: deterministic available-evidence purpose, behaviour, identity and implemented money context. Source unavailability is unsupported because no source-status injection boundary exists. A healthy query returning no row is evaluated only in the separate missing-original family under an explicitly complete synthetic-source assumption. Partial-refund entitlement, concurrent retries, external bank execution, enterprise identity, human review time and hidden off-system misuse are excluded.

## Label isolation

Targets and rationales remain in the corpus envelope; only \`episode.input\` reaches fixture construction and the production evaluator. Database \`is_malicious\` is always initialized to zero. The runner flips it only after prediction and verifies that decisions, scores and finding codes do not change. Neutral IDs reveal neither family nor target.

## Frozen source fingerprints

${Object.entries(sourceHashes).map(([file, digest]) => `- \`${file}\`: \`${digest}\``).join("\n")}
`;
writeFileSync(resolve(resolved, "PROTOCOL.md"), protocol, "utf8");
writeFileSync(resolve(resolved, "METHODOLOGY.md"), `${protocol}\n\n## Interpretation boundary\n\nThis is a deliberately constructed internal synthetic comparison, not an external benchmark or a representation of any bank's controls. Repeated seeds within a family are not independent real-world incidents.\n`, "utf8");
console.log(`Frozen ${corpus().length} episodes at ${relative(root, resolved)}; corpus SHA-256 ${corpusHash}.`);

