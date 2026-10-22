import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { evaluateEpisode } from "../evaluation/pass5/evaluator";
import type { CorpusEpisode } from "../evaluation/pass5/corpus";
import { CONFIGURATIONS, confusion, evidenceCoverage, type Configuration, type EpisodeResult } from "../evaluation/pass5/metrics";

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
for (const [name, value] of [["DB_PATH", businessPath], ["AUTH_DB_PATH", authPath], ["EVAL_DB_DIR", dbDir]]) if (!value.startsWith(resolve(workspace, ".codex-evaluation") + "\\")) throw new Error(`${name} must be inside .codex-evaluation`);
if (!outputDir.startsWith(resolve(workspace, "evaluation", "pass5", "results") + "\\")) throw new Error("EVAL_OUTPUT_DIR must be inside evaluation/pass5/results");
if (new Set([businessPath, authPath, dbDir]).size !== 3) throw new Error("business, auth and episode paths must be distinct");
if (existsSync(businessPath) || existsSync(authPath)) throw new Error("top-level disposable DB paths must not already exist");

const manifestText = readFileSync(resolve(freezeDir, "corpus-manifest.json"), "utf8");
const fingerprint = JSON.parse(readFileSync(resolve(freezeDir, "fingerprints.json"), "utf8")) as { corpus_sha256: string; source_sha256: Record<string, string> };
const digest = createHash("sha256").update(manifestText).digest("hex");
if (digest !== fingerprint.corpus_sha256) throw new Error("frozen corpus hash changed");
for (const [file, expected] of Object.entries(fingerprint.source_sha256)) {
  const actual = createHash("sha256").update(readFileSync(resolve(workspace, file))).digest("hex");
  if (actual !== expected) throw new Error(`frozen source fingerprint changed: ${file}`);
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
  try {
    const measured = evaluateEpisode(episode.input, resolve(dbDir, `${episode.id.toLowerCase()}.db`));
    results.push({ id: episode.id, family: episode.input.family, seed: episode.input.seed, target: episode.target, status: "OK", reason: null, outputs: measured.final, first_outputs: measured.first, hidden_label_invariant: measured.hiddenLabelInvariant });
  } catch (error) {
    results.push({ id: episode.id, family: episode.input.family, seed: episode.input.seed, target: episode.target, status: "ERROR", reason: error instanceof Error ? error.message : "unknown evaluation error", outputs: {} });
  }
}

const metrics = Object.fromEntries(CONFIGURATIONS.map((configuration) => [configuration, confusion(results, configuration)])) as Record<Configuration, ReturnType<typeof confusion>>;
const summary = {
  split, corpus_sha256: digest, episodes: results.length,
  supported: results.filter((row) => row.status === "OK").length,
  unsupported: results.filter((row) => row.status === "UNSUPPORTED").length,
  errors: results.filter((row) => row.status === "ERROR").length,
  hidden_label_invariance: { checked: results.filter((row) => row.hidden_label_invariant !== undefined).length, passed: results.filter((row) => row.hidden_label_invariant === true).length },
  configurations: Object.fromEntries(CONFIGURATIONS.map((configuration) => [configuration, { confusion: metrics[configuration], evidence_coverage: evidenceCoverage(results, configuration) }])),
};
const rate = (value: number | null) => value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
const names: Record<Configuration, string> = { A_PURPOSE: "A Purpose rules", B_BEHAVIOUR_IDENTITY: "B Behaviour/identity", C_SIMPLE_UNION: "C Simple union", D_FULL_SENTRY: "D Revised Full SENTRY" };
const rows = CONFIGURATIONS.map((configuration) => { const m = metrics[configuration]; return `| ${names[configuration]} | ${m.tp} | ${m.fn} | ${m.fp} | ${m.tn} | ${rate(m.precision)} | ${rate(m.recall)} | ${rate(m.false_positive_rate)} | ${m.legitimate_review_burden} | ${m.supported_errors} |`; }).join("\n");
const wrong = results.find((row) => row.family === "wrong_destination_genuine_ticket" && row.status === "OK");
const full = wrong?.outputs.D_FULL_SENTRY;
const unsupportedRows = results.filter((row) => row.status !== "OK").map((row) => `| ${row.id} | ${row.family} | ${row.status} | ${row.reason} |`).join("\n");
const report = `# Pass 5 comparative evaluation results

Corpus: \`${digest}\`; split: **${split}**. Internal synthetic evidence only.

| Configuration | TP | FN | FP | TN | Precision | Recall | FPR | Legitimate review burden | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}

Binary cohort contains supported LEGITIMATE and REVIEW_WARRANTED episodes only. TP means review-warranted and reviewed; FN means review-warranted but not reviewed; FP is a legitimate episode reviewed; TN is legitimate and not reviewed.

## Coverage

- Episodes ${results.length}; supported ${summary.supported}; unsupported ${summary.unsupported}; errors ${summary.errors}.
- Hidden-label invariance ${summary.hidden_label_invariance.passed}/${summary.hidden_label_invariance.checked}.
- Source-unavailable episodes remain unsupported and outside binary denominators.

## Critical example

${wrong ? `${wrong.id} retained ${full?.findings.map((finding) => finding.code).join(", ")} after genuine ticket submission. Revised Full SENTRY returned ${full?.recommendation} at score ${full?.score}; reason codes ${full?.reason_codes?.join(", ")}. The score was not raised to 30.` : "No wrong-destination result was produced."}

## Descriptive comparison with Pass 4

Pass 4's previously consulted cohort reported A 36/6/0/24, B 6/36/0/24, C 42/0/0/24 and D 12/30/0/24 (TP/FN/FP/TN). It was diagnostic input, not reused held-out evidence. This Pass 5 cohort has new seeds, families and legitimate exception combinations. Differences are descriptive, not a claim of independent production improvement.

## Unsupported/errors

| Episode | Family | Status | Reason |
|---|---|---|---|
${unsupportedRows || "| — | — | None | — |"}

## Limits

This run measures deterministic engine-level review recommendations. It does not measure human time, production prevalence, bank fraud accuracy, money saved, bank execution, or case disposition. R1/V1 hard findings assume a healthy complete local source; source availability itself is not implemented.
`;
const pitch = `# Pass 5 pitch claims ledger

## Supported with qualification

- Revised Full SENTRY was evaluated on ${summary.supported} supported frozen synthetic episodes with ${summary.errors} engine errors: TP=${metrics.D_FULL_SENTRY.tp}, FN=${metrics.D_FULL_SENTRY.fn}, FP=${metrics.D_FULL_SENTRY.fp}, TN=${metrics.D_FULL_SENTRY.tn}. This is internal synthetic policy evidence, not bank performance.
- A critical purpose contradiction can require review while its numeric score remains below 30. Review initiation is not a hold, approval or execution acknowledgement.
- Hidden labels did not change ${summary.hidden_label_invariance.passed}/${summary.hidden_label_invariance.checked} supported outputs in this harness.

## Not supported

- Real-world false-positive rate, fraud recall, reviewer-time savings, prevented loss or production throughput.
- Bank-side holds, payment prevention, distributed exactly-once effects, source-outage handling or complete refund entitlement.
- AI improvement: the evaluated decision path is deterministic.
`;
const mentor = `# Pass 5 bank-policy validation brief

No bank or mentor validation is claimed. Validate whether R1–R5 and V1 are independently reliable review triggers in the intended operating model; which source-health proof is required before treating no-row as missing; whether same-customer alternate-account refunds are permitted; how complaint-backed successful originals become eligible; and which review reasons should remain reason requests versus require higher controls. Holds and suspensions remain separately approved simulator effects.
`;
const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = ["id,family,seed,target,status,configuration,review,recommendation,score,reason_codes,finding_codes,error", ...results.flatMap((row) => CONFIGURATIONS.map((configuration) => { const output = row.outputs[configuration]; return [row.id, row.family, row.seed, row.target, row.status, configuration, output?.review ?? "", output?.recommendation ?? "", output?.score ?? "", output?.reason_codes?.join("|") ?? "", output?.findings.map((finding) => finding.code).join("|") ?? "", row.reason ?? ""].map(escape).join(","); }))].join("\n");
writeFileSync(resolve(outputDir, "episode-results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
writeFileSync(resolve(outputDir, "episode-results.csv"), `${csv}\n`, "utf8");
writeFileSync(resolve(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
writeFileSync(resolve(outputDir, "REPORT.md"), report, "utf8");
writeFileSync(resolve(outputDir, "PITCH_CLAIMS.md"), pitch, "utf8");
writeFileSync(resolve(outputDir, "BANK_POLICY_BRIEF.md"), mentor, "utf8");
console.log(`Evaluated ${results.length} ${split} episodes: ${summary.supported} supported, ${summary.unsupported} unsupported, ${summary.errors} errors.`);
for (const configuration of CONFIGURATIONS) { const m = metrics[configuration]; console.log(`${configuration}: TP=${m.tp} FN=${m.fn} FP=${m.fp} TN=${m.tn} precision=${rate(m.precision)} recall=${rate(m.recall)} FPR=${rate(m.false_positive_rate)}`); }
