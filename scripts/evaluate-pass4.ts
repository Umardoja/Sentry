import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { evaluateEpisode } from "../evaluation/pass4/evaluator";
import type { CorpusEpisode } from "../evaluation/pass4/corpus";
import { CONFIGURATIONS, confusion, evidenceCoverage, groupByFamily, type Configuration, type EpisodeResult } from "../evaluation/pass4/metrics";

const requiredPath = (name: string) => {
  const value = process.env[name];
  if (!value || !isAbsolute(value)) throw new Error(`${name} must be an explicit absolute path`);
  return resolve(value);
};
const workspace = resolve(process.cwd());
const businessPath = requiredPath("DB_PATH");
const authPath = requiredPath("AUTH_DB_PATH");
const dbDir = requiredPath("EVAL_DB_DIR");
const outputDir = requiredPath("EVAL_OUTPUT_DIR");
const freezeDir = requiredPath("EVAL_FREEZE_DIR");
for (const [name, value] of [["DB_PATH", businessPath], ["AUTH_DB_PATH", authPath], ["EVAL_DB_DIR", dbDir]]) {
  if (!value.startsWith(resolve(workspace, ".codex-evaluation") + "\\")) throw new Error(`${name} must be inside .codex-evaluation`);
}
if (!outputDir.startsWith(resolve(workspace, "evaluation", "pass4", "results") + "\\")) throw new Error("EVAL_OUTPUT_DIR must be inside evaluation/pass4/results");
if (businessPath === authPath || dbDir === businessPath || dbDir === authPath) throw new Error("evaluation business, auth and episode paths must be distinct");
if (existsSync(businessPath) || existsSync(authPath)) throw new Error("top-level disposable DB_PATH and AUTH_DB_PATH must not already exist");

const manifestPath = resolve(freezeDir, "corpus-manifest.json");
const fingerprintPath = resolve(freezeDir, "fingerprints.json");
const manifestText = readFileSync(manifestPath, "utf8");
const fingerprint = JSON.parse(readFileSync(fingerprintPath, "utf8")) as {
  corpus_sha256: string;
  source_sha256: Record<string, string>;
};
const digest = createHash("sha256").update(manifestText).digest("hex");
if (digest !== fingerprint.corpus_sha256) throw new Error("frozen corpus hash does not match fingerprints.json");
for (const [relativePath, expected] of Object.entries(fingerprint.source_sha256)) {
  const actual = createHash("sha256").update(readFileSync(resolve(workspace, relativePath))).digest("hex");
  if (actual !== expected) throw new Error(`frozen source fingerprint changed: ${relativePath}`);
}
const manifest = JSON.parse(manifestText) as { episodes: CorpusEpisode[] };
const split = process.env.EVAL_SPLIT === "development" ? "development" : "evaluation";
const episodes = manifest.episodes.filter((episode) => episode.split === split);
mkdirSync(dbDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

const results: EpisodeResult[] = [];
for (const episode of episodes) {
  if (!episode.supported) {
    results.push({ id: episode.id, family: episode.input.family, seed: episode.input.seed, target: episode.target, status: "UNSUPPORTED", reason: episode.unsupported_reason, outputs: {} });
    continue;
  }
  const episodePath = resolve(dbDir, `${episode.id.toLowerCase()}.db`);
  try {
    const measured = evaluateEpisode(episode.input, episodePath);
    results.push({
      id: episode.id, family: episode.input.family, seed: episode.input.seed, target: episode.target,
      status: "OK", reason: null, outputs: measured.final, first_outputs: measured.first,
      hidden_label_invariant: measured.hiddenLabelInvariant,
    });
  } catch (error) {
    results.push({ id: episode.id, family: episode.input.family, seed: episode.input.seed, target: episode.target, status: "ERROR", reason: error instanceof Error ? error.message : "unknown evaluation error", outputs: {} });
  }
}

const summary = {
  split,
  corpus_sha256: digest,
  episodes: results.length,
  supported: results.filter((row) => row.status !== "UNSUPPORTED").length,
  unsupported: results.filter((row) => row.status === "UNSUPPORTED").length,
  errors: results.filter((row) => row.status === "ERROR").length,
  hidden_label_invariance: {
    checked: results.filter((row) => row.hidden_label_invariant !== undefined).length,
    passed: results.filter((row) => row.hidden_label_invariant === true).length,
  },
  configurations: Object.fromEntries(CONFIGURATIONS.map((configuration) => [configuration, {
    confusion: confusion(results, configuration),
    evidence_coverage: evidenceCoverage(results, configuration),
    families: groupByFamily(results, configuration),
  }])),
};

const formatRate = (value: number | null) => value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
const names: Record<Configuration, string> = {
  A_PURPOSE: "A Purpose rules", B_BEHAVIOUR_IDENTITY: "B Behaviour/identity", C_SIMPLE_UNION: "C Simple union", D_FULL_SENTRY: "D Full SENTRY",
};
const metrics = Object.fromEntries(CONFIGURATIONS.map((configuration) => [configuration, confusion(results, configuration)])) as Record<Configuration, ReturnType<typeof confusion>>;
const wrongDestination = results.find((row) => row.status === "OK" && row.family === "wrong_destination_genuine_ticket");
const wrongFirst = wrongDestination?.first_outputs?.D_FULL_SENTRY;
const wrongFinal = wrongDestination?.outputs.D_FULL_SENTRY;
const tableRows = CONFIGURATIONS.map((configuration) => {
  const metric = confusion(results, configuration);
  return `| ${names[configuration]} | ${metric.tp} | ${metric.fn} | ${metric.fp} | ${metric.tn} | ${formatRate(metric.precision)} | ${formatRate(metric.recall)} | ${formatRate(metric.false_positive_rate)} | ${metric.legitimate_review_burden} | ${metric.supported_errors} |`;
}).join("\n");
const disagreementRows = results.filter((row) => row.status === "OK" && new Set(CONFIGURATIONS.map((configuration) => row.outputs[configuration]?.review)).size > 1)
  .map((row) => `| ${row.id} | ${row.family} | ${row.target} | ${CONFIGURATIONS.map((configuration) => `${configuration.slice(0, 1)}:${row.outputs[configuration]?.review ? "review" : "no"}`).join("; ")} | ${CONFIGURATIONS.map((configuration) => `${configuration.slice(0, 1)}:${row.outputs[configuration]?.findings.map((finding) => finding.code).join(",") || "none"}`).join("; ")} |`)
  .join("\n");
const unsupportedRows = results.filter((row) => row.status !== "OK").map((row) => `| ${row.id} | ${row.family} | ${row.status} | ${row.reason} |`).join("\n");
const report = `# Pass 4 comparative evaluation results

Corpus: \`${digest}\`. Split: **${split}**. This is an internal synthetic available-evidence comparison, not a production bank benchmark.

## Counts and rates

| Configuration | TP | FN | FP | TN | Precision | Recall | False-positive rate | Legitimate episodes reviewed | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${tableRows}

TP means a supported review-warranted episode received a review recommendation within the episode. FN means it did not. FP is a legitimate episode recommended for review. TN is a legitimate episode not recommended for review. Undefined ratios are N/A.

## Coverage accounting

- Total episodes: ${results.length}; supported binary cohort: ${summary.supported}; unsupported: ${summary.unsupported}; engine errors: ${summary.errors}.
- Hidden-label invariance: ${summary.hidden_label_invariance.passed}/${summary.hidden_label_invariance.checked} supported episodes retained identical decisions, scores and finding codes after post-prediction \`is_malicious\`/scenario-tag changes.
- Source-unavailable evaluation is not supported and is not counted as benign, detected or abstained.

## Disagreements

| Episode | Family | Expected policy target | Decisions | Finding codes |
|---|---|---|---|---|
${disagreementRows || "| — | — | — | All configurations tied | — |"}

## Unsupported/errors

| Episode | Family | Status | Reason |
|---|---|---|---|
${unsupportedRows || "| — | — | None | — |"}

## What improved, tied and regressed

- The simple union detected ${metrics.C_SIMPLE_UNION.tp}/${metrics.C_SIMPLE_UNION.tp + metrics.C_SIMPLE_UNION.fn} supported review-warranted episodes. Full SENTRY detected ${metrics.D_FULL_SENTRY.tp}/${metrics.D_FULL_SENTRY.tp + metrics.D_FULL_SENTRY.fn}. On this corpus, aggregation did **not** demonstrate incremental detection value over combining the two simpler decisions.
- Full SENTRY added the high-volume unrelated-record-access recommendations that behaviour/identity alone missed, and retained the independent identity-concern recommendations that purpose rules missed. The purpose baseline nevertheless caught the single-fact reversal contradictions that remained below Full SENTRY's score threshold.
- All configurations tied on the ${metrics.D_FULL_SENTRY.tn} legitimate episodes and produced ${metrics.D_FULL_SENTRY.fp} false positives in this deliberately constructed set. This is not an estimate of production false-positive prevalence.
- In ${wrongDestination?.id ?? "the wrong-destination example"}, the first wrong-destination finding produced Full SENTRY score ${wrongFirst?.score ?? "N/A"} and recommendation ${wrongFirst?.recommendation ?? "N/A"}. After a genuine ticket was submitted, the score was ${wrongFinal?.score ?? "N/A"}, the recommendation was ${wrongFinal?.recommendation ?? "N/A"}, and finding codes remained ${wrongFinal?.findings.map((finding) => finding.code).join(",") ?? "N/A"}. The ticket did not authorize or clear the substituted destination, but the aggregate threshold did not recommend review in this otherwise routine fixture.

## Error-analysis examples

- **Simpler rule already sufficient:** wrong destination plus genuine ticket was independently labelled review-warranted from destination facts. Purpose rules and the union recommended review; Full SENTRY retained the evidence but stayed below its review threshold. Cause: aggregation/threshold, not missing evidence.
- **Combined context helps:** valid purpose plus an independent on-leave/new-terminal concern was missed by purpose rules and caught by behaviour/identity, the union and Full SENTRY. Cause: identity context outside purpose matching.
- **Tie:** routine reversals and approved overtime were not reviewed by any configuration. This only shows agreement on these synthetic fixtures.
- **Unsupported boundary:** six source-unavailable episodes remain outside the binary cohort because the product cannot represent unavailable versus a healthy source returning no row.

## Interpretation limits

The current full configuration is measured only through the production purpose engine and evaluator recommendation threshold. It does not open a case, execute an intervention, exercise authentication, or simulate a human decision. The constructed class mix cannot estimate production prevalence, investigation time, money saved, or bank fraud accuracy. Traceable evidence links show that a referenced local row can be resolved; they do not establish source truth or independence.
`;

const pitch = `# Pass 4 pitch claims ledger

## Supported with required qualification

- **Measured:** the comparison ran ${summary.supported} supported synthetic available-evidence episodes with ${summary.errors} engine errors. **Qualification:** deliberately constructed internal fixtures, not bank data or external validation.
- **Measured:** purpose rules, behaviour/identity, their logical union and the current full score were evaluated on the same per-episode SQLite facts. **Qualification:** A–C are declared experimental comparators; D is an engine-level recommendation, not the complete reviewer workflow.
- **Measured:** ${summary.hidden_label_invariance.passed}/${summary.hidden_label_invariance.checked} supported outputs were unchanged when only post-prediction hidden labels changed. **Qualification:** this is a narrow code-path check, not proof against every leakage channel.
- **Measured:** genuine ticket episodes retain first and post-ticket outputs. **Qualification:** ticket evidence supports its valid scope and does not authorize another customer's destination.
- **Measured:** the simple union produced TP=${metrics.C_SIMPLE_UNION.tp}, FN=${metrics.C_SIMPLE_UNION.fn}, FP=${metrics.C_SIMPLE_UNION.fp}, TN=${metrics.C_SIMPLE_UNION.tn}; Full SENTRY produced TP=${metrics.D_FULL_SENTRY.tp}, FN=${metrics.D_FULL_SENTRY.fn}, FP=${metrics.D_FULL_SENTRY.fp}, TN=${metrics.D_FULL_SENTRY.tn}. **Qualification:** this is a frozen synthetic policy cohort, and the Full SENTRY result is its engine-level score/recommendation rather than case or reviewer completion.
- **Measured:** Full SENTRY did not outperform the simple union on this corpus. **Qualification:** this is useful negative evidence about the current aggregation threshold, not proof that a union is generally optimal.

## Not supported by this evaluation

- Human investigation-time savings or reviewer productivity.
- Real fraud precision/recall, prevented loss, money saved, production throughput or statistical generalization.
- Zenith Bank's current controls, any vendor comparison, or production class prevalence.
- Source-outage handling, partial-refund entitlement, concurrent/distributed execution safety, bank acknowledgement or immutable audit.
- AI/ML benefit: the evaluated detection path is deterministic; template notes and model tooling do not set decisions.
`;
const mentor = `# Bank-mentor validation brief

No mentor review is claimed. Please validate these assumptions before treating the synthetic policy as bank-relevant:

1. Which original-debit statuses, response codes, time limits, amount tolerances, destinations and cumulative-refund rules make a reversal eligible?
2. When should one wrong destination, amount mismatch, missing original or duplicate trigger review regardless of aggregate score?
3. What constitutes an independently trustworthy ticket, complaint, overtime approval, assigned case and reviewer relationship?
4. Which customer-record access patterns are review-worthy for employees, contractors and agents, and what minimum volume is operationally tolerable?
5. How should source unavailable, stale, incomplete and contradictory states appear without treating missing data as employee misconduct?
6. What local control recommendations are legally and operationally available, and what separate evidence confirms bank-side execution?
`;

const csvHeader = "id,family,seed,target,status,configuration,review,recommendation,score,finding_codes,reason";
const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csvRows = results.flatMap((row) => CONFIGURATIONS.map((configuration) => {
  const output = row.outputs[configuration];
  return [row.id, row.family, row.seed, row.target, row.status, configuration, output?.review ?? "", output?.recommendation ?? "", output?.score ?? "", output?.findings.map((finding) => finding.code).join("|") ?? "", row.reason ?? ""].map(escape).join(",");
}));

writeFileSync(resolve(outputDir, "episode-results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
writeFileSync(resolve(outputDir, "episode-results.csv"), `${csvHeader}\n${csvRows.join("\n")}\n`, "utf8");
writeFileSync(resolve(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
writeFileSync(resolve(outputDir, "REPORT.md"), report, "utf8");
writeFileSync(resolve(outputDir, "PITCH_CLAIMS.md"), pitch, "utf8");
writeFileSync(resolve(outputDir, "BANK_MENTOR_BRIEF.md"), mentor, "utf8");
console.log(`Evaluated ${results.length} ${split} episodes: ${summary.supported} supported, ${summary.unsupported} unsupported, ${summary.errors} errors.`);
for (const configuration of CONFIGURATIONS) {
  const metric = confusion(results, configuration);
  console.log(`${configuration}: TP=${metric.tp} FN=${metric.fn} FP=${metric.fp} TN=${metric.tn} precision=${formatRate(metric.precision)} recall=${formatRate(metric.recall)} FPR=${formatRate(metric.false_positive_rate)}`);
}

