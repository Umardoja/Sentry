import "server-only";
import type Database from "better-sqlite3";
import { openDatabase, resetDatabase } from "../../src/server/db/migrate";
import { createEvaluator, runPurpose, type Evaluation, type Hit } from "../../src/server/engines/pipeline";
import { SIGNALS } from "../../src/server/engines/signals";
import { scenarioOperator } from "../../src/server/auth/policy";
import { currentRunId, rotateRunId } from "../../src/server/services/run";
import { answerTicket } from "../../src/server/sim/player";
import { addMinutes } from "../../src/server/time";
import { Rng } from "../../src/server/rng";
import type { EpisodeInput, SupportedFamily } from "./corpus";
import { dedupeFindings, type ConfigurationOutput, type Finding } from "./metrics";

const TARGET = "STF-P5";
const APPROVER = "STF-P5-REVIEW";
const DAY = "2026-10-16";
const INSIDE = `${DAY}T14:00:00+01:00`;
const insertActionSql = "INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
type Configuration = "A_PURPOSE" | "B_BEHAVIOUR_IDENTITY" | "C_SIMPLE_UNION" | "D_FULL_SENTRY";
type OutputSet = Record<Configuration, ConfigurationOutput>;
export type EvaluationOutputs = { final: OutputSet; first?: OutputSet; hiddenLabelInvariant: boolean };

function setState(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO sim_state VALUES (?, ?)").run(key, value);
}

function setupBase(db: Database.Database, family: SupportedFamily, seed: number): Rng {
  const rng = new Rng(seed);
  const recordFamily = family === "assigned_record_access" || family === "single_unrelated_record_access";
  const role = recordFamily ? "CUSTOMER_SERVICE" : "OPS_EPRODUCTS";
  const team = recordFamily ? "CUSTOMER_SERVICE" : "OPS_EPRODUCTS";
  const employment = family === "single_unrelated_record_access" && seed % 2 === 0 ? "CONTRACTOR" : "EMPLOYEE";
  db.prepare("INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)").run(TARGET, "Synthetic target", "Staff-P5", role, team, "Harbor", employment, "08000000001", JSON.stringify(["TRM-USUAL"]), null);
  db.prepare("INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)").run(APPROVER, "Synthetic reviewer", "Staff-P5-REVIEW", "INTERNAL_CONTROL", "CONTROL", "Harbor", "EMPLOYEE", "08000000002", JSON.stringify(["TRM-REVIEW"]), null);
  for (const terminal of ["TRM-USUAL", "TRM-NEW", "TRM-REVIEW"]) db.prepare("INSERT INTO terminals VALUES (?,?,?,?)").run(terminal, terminal, "Harbor", "Harbor");
  db.prepare("INSERT INTO roster VALUES (?,?,?,?,?)").run("ROS-P5", TARGET, DAY, "09:00", "17:00");
  db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?)").run("CUS-1", "Synthetic customer one", "08000000101", "BVN-P5-1", 0, "Lagos");
  db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?)").run("CUS-2", "Synthetic customer two", "08000000102", "BVN-P5-2", 0, "Lagos");
  db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-DEBIT", "CUS-1", "3000000001", "2020-01-01T00:00:00+01:00", "08000000101", "ACTIVE");
  db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-SAME", "CUS-1", "3000000002", "2021-01-01T00:00:00+01:00", "08000000101", "ACTIVE");
  db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-OTHER", "CUS-2", "3000000003", "2025-01-01T00:00:00+01:00", "08000000102", "ACTIVE");
  setState(db, "peer_stats", JSON.stringify({ OPS_EPRODUCTS: { REVERSAL: { mean: 2, sd: 1 } }, CUSTOMER_SERVICE: { RECORD_VIEW: { mean: 3, sd: 2 } } }));
  setState(db, "clock", INSIDE);
  rotateRunId(db);
  return rng;
}

function insertLogin(db: Database.Database, terminal: "TRM-USUAL" | "TRM-NEW", ts: string): void {
  db.prepare("INSERT INTO logins VALUES (?,?,?,?,?,?,?,?)").run("LOG-P5", TARGET, terminal, "Harbor", ts, "SES-P5", "ACTIVE", "P5");
}

function insertTransaction(db: Database.Database, id: string, amount: number, ts: string, status: "FAILED" | "SUCCESS" = "FAILED"): void {
  db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, `REF-${id}`, "ACC-DEBIT", amount, "2000000000", "Synthetic Bank", ts, "APP", status, status === "FAILED" ? "91" : "00");
}

function insertAction(db: Database.Database, id: string, ts: string, fields: { actionType?: "REVERSAL" | "RECORD_VIEW"; originalTxnId?: string | null; creditAccountId?: string | null; customerId?: string | null; amount?: number | null }): void {
  db.prepare(insertActionSql).run(id, TARGET, "SES-P5", "TRM-USUAL", ts, fields.actionType ?? "REVERSAL", fields.originalTxnId ?? null, fields.creditAccountId ?? null, fields.customerId ?? null, fields.amount ?? null, null, "POSTED", null, "P5", 0);
}

function addReversal(db: Database.Database, amount: number, options: { id?: string; ts?: string; original?: string | null; credit?: string; actionAmount?: number; transactionStatus?: "FAILED" | "SUCCESS" } = {}): string {
  const id = options.id ?? "ACT-P5";
  const ts = options.ts ?? INSIDE;
  const original = options.original === undefined ? "TXN-P5" : options.original;
  if (original && !db.prepare("SELECT 1 FROM transactions WHERE id = ?").get(original)) insertTransaction(db, original, amount, addMinutes(ts, -30), options.transactionStatus);
  insertAction(db, id, ts, { originalTxnId: original, creditAccountId: options.credit ?? "ACC-DEBIT", customerId: "CUS-1", amount: options.actionAmount ?? amount });
  return id;
}

function addGenuineTicket(db: Database.Database, transactionId: string): void {
  db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run("TKT-P5", "COMPLAINT", "CUS-1", transactionId, "OPS_EPRODUCTS", APPROVER, null, `${DAY}T12:00:00+01:00`, "OPEN", null);
}

function buildEpisode(db: Database.Database, input: EpisodeInput): { finalTs: string; ticketAction: string | null; repeated: boolean } {
  if (input.family === "source_unavailable") throw new Error("unsupported episode reached evaluator");
  const family = input.family;
  const rng = setupBase(db, family, input.seed);
  const amount = rng.int(80, 600) * 1000;
  let finalTs = INSIDE;
  let ticketAction: string | null = null;
  let repeated = false;
  insertLogin(db, family === "legitimate_new_terminal" || family === "valid_purpose_identity_concern" ? "TRM-NEW" : "TRM-USUAL", addMinutes(INSIDE, -5));

  if (family === "routine_reversal") addReversal(db, amount);
  else if (family === "same_customer_alternate_destination") addReversal(db, amount, { credit: "ACC-SAME" });
  else if (family === "successful_original_with_complaint") {
    addReversal(db, amount, { transactionStatus: "SUCCESS" });
    addGenuineTicket(db, "TXN-P5");
  } else if (family === "approved_overtime") {
    finalTs = `${DAY}T20:45:00+01:00`;
    db.prepare("UPDATE logins SET ts = ?").run(`${DAY}T19:55:00+01:00`);
    db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run("TKT-P5-OT", "OVERTIME", null, null, "OPS_EPRODUCTS", TARGET, APPROVER, `${DAY}T12:00:00+01:00`, "APPROVED", "overtime");
    db.prepare("INSERT INTO overtime VALUES (?,?,?,?,?,?,?)").run("OT-P5", TARGET, DAY, "17:00", "22:00", APPROVER, "TKT-P5-OT");
    const count = 6 + input.seed % 4;
    for (let index = 0; index < count; index++) addReversal(db, amount + index * 1000, { id: `ACT-P5-${index + 1}`, ts: addMinutes(`${DAY}T20:00:00+01:00`, index * 4), original: `TXN-P5-${index + 1}` });
  } else if (family === "assigned_record_access") {
    db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run("TKT-P5-CASE", "SERVICE_REQUEST", "CUS-1", null, "CUSTOMER_SERVICE", APPROVER, null, `${DAY}T10:00:00+01:00`, "OPEN", null);
    insertAction(db, "ACT-P5", INSIDE, { actionType: "RECORD_VIEW", customerId: "CUS-1" });
  } else if (family === "legitimate_new_terminal") addReversal(db, amount);
  else if (family === "legitimate_outside_roster") {
    finalTs = `${DAY}T20:00:00+01:00`;
    db.prepare("UPDATE logins SET ts = ?").run(addMinutes(finalTs, -5));
    addReversal(db, amount, { ts: finalTs });
  } else if (family === "wrong_destination_genuine_ticket" || family === "repeated_genuine_ticket") {
    ticketAction = addReversal(db, amount, { credit: "ACC-OTHER" });
    addGenuineTicket(db, "TXN-P5");
    repeated = family === "repeated_genuine_ticket";
  } else if (family === "amount_mismatch") addReversal(db, amount, { actionAmount: amount + rng.int(2, 25) * 1000 });
  else if (family === "missing_original_complete_source") addReversal(db, amount, { original: null });
  else if (family === "ineligible_original") addReversal(db, amount, { transactionStatus: "SUCCESS" });
  else if (family === "distinct_duplicate") {
    insertTransaction(db, "TXN-P5", amount, `${DAY}T12:00:00+01:00`);
    addReversal(db, amount, { id: "ACT-P5-PRIOR", ts: `${DAY}T13:00:00+01:00`, original: "TXN-P5" });
    addReversal(db, amount, { original: "TXN-P5" });
  } else if (family === "single_unrelated_record_access") insertAction(db, "ACT-P5", INSIDE, { actionType: "RECORD_VIEW", customerId: "CUS-2" });
  else if (family === "valid_purpose_identity_concern") {
    db.prepare("INSERT INTO leave VALUES (?,?,?,?,?)").run("LEV-P5", TARGET, DAY, DAY, "APPROVED");
    addReversal(db, amount);
  }
  runPurpose(db);
  return { finalTs, ticketAction, repeated };
}

function purposeOutput(db: Database.Database): ConfigurationOutput {
  const rows = db.prepare(`SELECT p.action_id, p.status, p.checks, a.original_txn_id, a.ticket_ref FROM purpose_results p JOIN sensitive_actions a ON a.id = p.action_id ORDER BY p.action_id`).all() as { action_id: string; status: string; checks: string; original_txn_id: string | null; ticket_ref: string | null }[];
  const failedRows = rows.filter((row) => row.status !== "MATCHED");
  const findings = failedRows.flatMap((row) => (JSON.parse(row.checks) as { code: string; passed: boolean }[]).filter((check) => !check.passed).map((check) => ({ code: `PURPOSE_${check.code}`, source_refs: [row.action_id, row.original_txn_id, row.ticket_ref].filter((value): value is string => !!value), traceable: true })));
  return { review: failedRows.length > 0, recommendation: failedRows.length ? "VERIFY" : "NO_REVIEW", score: null, findings };
}

function hitFinding(hit: Hit): Finding {
  const refs = [...hit.action_ids];
  if (!refs.length && typeof hit.evidence.terminal === "string") refs.push(String(hit.evidence.terminal));
  if (!refs.length && typeof hit.evidence.ts === "string") refs.push(String(hit.evidence.ts));
  return { code: hit.code, source_refs: refs, traceable: refs.length > 0 };
}

function behaviourIdentityOutput(evaluation: Evaluation): ConfigurationOutput {
  const hits = evaluation.hits.filter((hit) => ["Behaviour", "Identity"].includes(SIGNALS[hit.code].engine));
  const active = hits.filter((hit) => hit.code === "VOLUME_ANOMALY" ? hit.points > 0 : hit.effective > 0);
  const componentPoints = active.reduce((total, hit) => total + (hit.code === "VOLUME_ANOMALY" ? hit.points : hit.effective), 0);
  const review = active.some((hit) => hit.code === "ON_LEAVE") || (active.length >= 2 && componentPoints >= 15);
  return { review, recommendation: review ? "VERIFY" : "NO_REVIEW", score: componentPoints, findings: hits.map(hitFinding) };
}

function unionOutput(a: ConfigurationOutput, b: ConfigurationOutput): ConfigurationOutput {
  return { review: a.review || b.review, recommendation: a.review || b.review ? "VERIFY" : "NO_REVIEW", score: null, findings: dedupeFindings([...a.findings, ...b.findings]) };
}

function fullOutput(evaluation: Evaluation): ConfigurationOutput {
  const policyFindings = evaluation.review.critical_reason_codes.map((code) => ({ code: `POLICY_${code}`, source_refs: evaluation.review.action_ids, traceable: evaluation.review.action_ids.length > 0 }));
  const recommendation = !evaluation.review.required ? "NO_REVIEW" : ["VERIFY", "HOLD", "CONTAIN"].includes(evaluation.level) ? evaluation.level as "VERIFY" | "HOLD" | "CONTAIN" : "REVIEW_REQUIRED";
  return { review: evaluation.review.required, recommendation, score: evaluation.score, findings: dedupeFindings([...evaluation.hits.map(hitFinding), ...policyFindings]), reason_codes: evaluation.review.reason_codes, policy_version: evaluation.review.policy_version };
}

function outputs(db: Database.Database, finalTs: string): OutputSet {
  const evaluation = createEvaluator(db).evaluate(TARGET, finalTs);
  const a = purposeOutput(db);
  const b = behaviourIdentityOutput(evaluation);
  return { A_PURPOSE: a, B_BEHAVIOUR_IDENTITY: b, C_SIMPLE_UNION: unionOutput(a, b), D_FULL_SENTRY: fullOutput(evaluation) };
}

function signature(value: OutputSet): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).map(([key, output]) => [key, { review: output.review, recommendation: output.recommendation, score: output.score, reason_codes: output.reason_codes, findings: output.findings.map((finding) => finding.code).sort() }])));
}

export function evaluateEpisode(input: EpisodeInput, databasePath: string): EvaluationOutputs {
  if (input.family === "source_unavailable") throw new Error("source_unavailable is explicitly unsupported");
  resetDatabase(databasePath);
  const db = openDatabase(databasePath);
  try {
    const built = buildEpisode(db, input);
    const first = outputs(db, built.finalTs);
    if (built.ticketAction) {
      answerTicket(db, scenarioOperator(TARGET), currentRunId(db), built.ticketAction, "TKT-P5", built.finalTs);
      if (built.repeated) answerTicket(db, scenarioOperator(TARGET), currentRunId(db), built.ticketAction, "TKT-P5", built.finalTs);
    }
    const final = outputs(db, built.finalTs);
    const before = signature(final);
    db.prepare("UPDATE sensitive_actions SET is_malicious = 1, scenario_tag = 'HIDDEN-LABEL-FLIPPED'").run();
    const after = signature(outputs(db, built.finalTs));
    return { final, first: built.ticketAction ? first : undefined, hiddenLabelInvariant: before === after };
  } finally {
    db.close();
  }
}
