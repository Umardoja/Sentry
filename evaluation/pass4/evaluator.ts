import "server-only";
import type Database from "better-sqlite3";
import { openDatabase, resetDatabase } from "../../src/server/db/migrate";
import { createEvaluator, runPurpose, type Evaluation, type Hit } from "../../src/server/engines/pipeline";
import { levelRank, SIGNALS } from "../../src/server/engines/signals";
import { scenarioOperator } from "../../src/server/auth/policy";
import { currentRunId, rotateRunId } from "../../src/server/services/run";
import { answerTicket } from "../../src/server/sim/player";
import { addMinutes } from "../../src/server/time";
import { Rng } from "../../src/server/rng";
import type { EpisodeInput, SupportedFamily } from "./corpus";
import { dedupeFindings, type ConfigurationOutput, type Finding } from "./metrics";

const TARGET = "STF-EVAL";
const APPROVER = "STF-REVIEW";
const DAY = "2026-10-16";
const insideTime = `${DAY}T14:00:00+01:00`;

type Outputs = {
  final: Record<"A_PURPOSE" | "B_BEHAVIOUR_IDENTITY" | "C_SIMPLE_UNION" | "D_FULL_SENTRY", ConfigurationOutput>;
  first?: Record<"A_PURPOSE" | "B_BEHAVIOUR_IDENTITY" | "C_SIMPLE_UNION" | "D_FULL_SENTRY", ConfigurationOutput>;
  hiddenLabelInvariant: boolean;
};

const insertActionSql = "INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

function setState(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO sim_state VALUES (?, ?)").run(key, value);
}

function setupBase(db: Database.Database, family: SupportedFamily, seed: number): Rng {
  const rng = new Rng(seed);
  const recordFamily = family === "assigned_record_access" || family === "unrelated_record_access";
  const role = recordFamily ? "CUSTOMER_SERVICE" : "OPS_EPRODUCTS";
  const team = recordFamily ? "CUSTOMER_SERVICE" : "OPS_EPRODUCTS";
  const employment = family === "unrelated_record_access" && seed % 2 === 0 ? "CONTRACTOR" : "EMPLOYEE";
  db.prepare("INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)").run(TARGET, "Synthetic target", "Staff-EVAL", role, team, "Harbor", employment, "08000000001", JSON.stringify(["TRM-USUAL"]), null);
  db.prepare("INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)").run(APPROVER, "Synthetic reviewer", "Staff-REVIEW", "INTERNAL_CONTROL", "CONTROL", "Harbor", "EMPLOYEE", "08000000002", JSON.stringify(["TRM-REVIEW"]), null);
  for (const [id, label] of [["TRM-USUAL", "Usual"], ["TRM-NEW", "New"], ["TRM-REVIEW", "Review"]]) {
    db.prepare("INSERT INTO terminals VALUES (?,?,?,?)").run(id, label, "Harbor", "Harbor");
  }
  db.prepare("INSERT INTO roster VALUES (?,?,?,?,?)").run("ROS-EVAL", TARGET, DAY, "09:00", "17:00");
  db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?)").run("CUS-1", "Synthetic customer one", "08000000101", "BVN-HASH-1", 0, "Lagos");
  db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?)").run("CUS-2", "Synthetic customer two", "08000000102", "BVN-HASH-2", 0, "Lagos");
  db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-DEBIT", "CUS-1", "1000000001", "2020-01-01T00:00:00+01:00", "08000000101", "ACTIVE");
  db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-SAME", "CUS-1", "1000000002", "2021-01-01T00:00:00+01:00", "08000000101", "ACTIVE");
  db.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-OTHER", "CUS-2", "1000000003", "2026-09-01T00:00:00+01:00", "08000000102", "ACTIVE");
  const peerStats = {
    OPS_EPRODUCTS: { REVERSAL: { mean: 2, sd: 1 } },
    CUSTOMER_SERVICE: { RECORD_VIEW: { mean: 3, sd: 2 } },
  };
  setState(db, "peer_stats", JSON.stringify(peerStats));
  setState(db, "clock", insideTime);
  rotateRunId(db);
  return rng;
}

function insertLogin(db: Database.Database, terminal: "TRM-USUAL" | "TRM-NEW", ts: string): void {
  db.prepare("INSERT INTO logins VALUES (?,?,?,?,?,?,?,?)").run("LOG-EVAL", TARGET, terminal, "Harbor", ts, "SES-EVAL", "ACTIVE", "EVAL");
}

function insertTransaction(db: Database.Database, id: string, amount: number, ts: string): void {
  db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, `REF-${id}`, "ACC-DEBIT", amount, "2000000000", "Synthetic Bank", ts, "APP", "FAILED", "91");
}

function insertAction(db: Database.Database, id: string, ts: string, fields: {
  actionType?: "REVERSAL" | "RECORD_VIEW";
  originalTxnId?: string | null;
  creditAccountId?: string | null;
  customerId?: string | null;
  amount?: number | null;
}): void {
  db.prepare(insertActionSql).run(
    id, TARGET, "SES-EVAL", "TRM-USUAL", ts, fields.actionType ?? "REVERSAL",
    fields.originalTxnId ?? null, fields.creditAccountId ?? null, fields.customerId ?? null,
    fields.amount ?? null, null, "POSTED", null, "EVAL", 0,
  );
}

function addReversal(db: Database.Database, amount: number, options: {
  id?: string; ts?: string; original?: string | null; credit?: string; actionAmount?: number;
} = {}): string {
  const id = options.id ?? "ACT-EVAL";
  const ts = options.ts ?? insideTime;
  const original = options.original === undefined ? "TXN-EVAL" : options.original;
  if (original && !db.prepare("SELECT 1 FROM transactions WHERE id = ?").get(original)) insertTransaction(db, original, amount, addMinutes(ts, -30));
  insertAction(db, id, ts, { originalTxnId: original, creditAccountId: options.credit ?? "ACC-SAME", customerId: "CUS-1", amount: options.actionAmount ?? amount });
  return id;
}

function addGenuineTicket(db: Database.Database, transactionId: string): void {
  db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run("TKT-EVAL", "COMPLAINT", "CUS-1", transactionId, "OPS_EPRODUCTS", APPROVER, null, `${DAY}T12:00:00+01:00`, "OPEN", null);
}

function buildEpisode(db: Database.Database, input: EpisodeInput): { finalTs: string; ticketAction: string | null; repeated: boolean } {
  if (input.family === "source_unavailable") throw new Error("unsupported episode reached the evaluator");
  const family = input.family;
  const rng = setupBase(db, family, input.seed);
  const amount = rng.int(50, 500) * 1000;
  let finalTs = insideTime;
  let ticketAction: string | null = null;
  let repeated = false;

  if (family === "routine_reversal") {
    insertLogin(db, "TRM-USUAL", addMinutes(insideTime, -5));
    addReversal(db, amount);
  } else if (family === "approved_overtime") {
    finalTs = `${DAY}T20:30:00+01:00`;
    insertLogin(db, "TRM-USUAL", `${DAY}T19:55:00+01:00`);
    db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run("TKT-OT", "OVERTIME", null, null, "OPS_EPRODUCTS", TARGET, APPROVER, `${DAY}T12:00:00+01:00`, "APPROVED", "overtime");
    db.prepare("INSERT INTO overtime VALUES (?,?,?,?,?,?,?)").run("OT-EVAL", TARGET, DAY, "17:00", "22:00", APPROVER, "TKT-OT");
    const count = 8 + (input.seed % 3);
    for (let index = 0; index < count; index++) {
      const ts = addMinutes(`${DAY}T20:00:00+01:00`, index * 3);
      addReversal(db, amount + index * 1000, { id: `ACT-EVAL-${index + 1}`, ts, original: `TXN-EVAL-${index + 1}` });
    }
  } else if (family === "wrong_destination_genuine_ticket" || family === "repeated_genuine_ticket") {
    insertLogin(db, "TRM-USUAL", addMinutes(insideTime, -5));
    ticketAction = addReversal(db, amount, { credit: "ACC-OTHER" });
    addGenuineTicket(db, "TXN-EVAL");
    repeated = family === "repeated_genuine_ticket";
  } else if (family === "amount_mismatch") {
    insertLogin(db, "TRM-USUAL", addMinutes(insideTime, -5));
    addReversal(db, amount, { actionAmount: amount + rng.int(1, 20) * 1000 });
  } else if (family === "missing_original") {
    insertLogin(db, "TRM-USUAL", addMinutes(insideTime, -5));
    addReversal(db, amount, { original: null });
  } else if (family === "distinct_duplicate") {
    insertLogin(db, "TRM-USUAL", addMinutes(insideTime, -5));
    insertTransaction(db, "TXN-EVAL", amount, `${DAY}T12:00:00+01:00`);
    addReversal(db, amount, { id: "ACT-EVAL-PRIOR", ts: `${DAY}T13:00:00+01:00`, original: "TXN-EVAL" });
    addReversal(db, amount, { id: "ACT-EVAL", ts: insideTime, original: "TXN-EVAL" });
  } else if (family === "assigned_record_access") {
    insertLogin(db, "TRM-USUAL", addMinutes(insideTime, -5));
    db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run("TKT-CASE", "SERVICE_REQUEST", "CUS-1", null, "CUSTOMER_SERVICE", APPROVER, null, `${DAY}T10:00:00+01:00`, "OPEN", null);
    insertAction(db, "ACT-EVAL", insideTime, { actionType: "RECORD_VIEW", customerId: "CUS-1" });
  } else if (family === "unrelated_record_access") {
    insertLogin(db, "TRM-USUAL", addMinutes(insideTime, -5));
    const count = input.seed % 2 === 0 ? 55 : 12;
    for (let index = 0; index < count; index++) {
      const customer = `CUS-VIEW-${index + 1}`;
      db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?)").run(customer, `Synthetic view ${index + 1}`, `081${String(index).padStart(8, "0")}`, `BVN-VIEW-${index + 1}`, 0, "Lagos");
      insertAction(db, `ACT-EVAL-${index + 1}`, addMinutes(`${DAY}T13:00:00+01:00`, index), { actionType: "RECORD_VIEW", customerId: customer });
    }
    finalTs = addMinutes(`${DAY}T13:00:00+01:00`, count);
  } else if (family === "valid_purpose_identity_concern") {
    insertLogin(db, "TRM-NEW", addMinutes(insideTime, -5));
    db.prepare("INSERT INTO leave VALUES (?,?,?,?,?)").run("LEV-EVAL", TARGET, DAY, DAY, "APPROVED");
    addReversal(db, amount);
  } else if (family === "legitimate_new_terminal") {
    insertLogin(db, "TRM-NEW", addMinutes(insideTime, -5));
    addReversal(db, amount);
  }

  runPurpose(db);
  return { finalTs, ticketAction, repeated };
}

function purposeOutput(db: Database.Database): ConfigurationOutput {
  const rows = db.prepare(`SELECT p.action_id, p.status, p.checks, a.original_txn_id, a.ticket_ref
    FROM purpose_results p JOIN sensitive_actions a ON a.id = p.action_id ORDER BY p.action_id`).all() as {
      action_id: string; status: string; checks: string; original_txn_id: string | null; ticket_ref: string | null;
    }[];
  const failed = rows.filter((row) => row.status !== "MATCHED");
  const findings: Finding[] = failed.flatMap((row) => {
    const checks = JSON.parse(row.checks) as { code: string; passed: boolean }[];
    return checks.filter((check) => !check.passed).map((check) => ({
      code: `PURPOSE_${check.code}`,
      source_refs: [row.action_id, row.original_txn_id, row.ticket_ref].filter((value): value is string => !!value),
      traceable: true,
    }));
  });
  return { review: failed.length > 0, recommendation: failed.length ? "VERIFY" : "NO_REVIEW", score: null, findings };
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
  const findings = dedupeFindings([...a.findings, ...b.findings]);
  return { review: a.review || b.review, recommendation: a.review || b.review ? "VERIFY" : "NO_REVIEW", score: null, findings };
}

function fullOutput(evaluation: Evaluation): ConfigurationOutput {
  const review = levelRank(evaluation.level) >= levelRank("VERIFY");
  const recommendation = review ? evaluation.level as "VERIFY" | "HOLD" | "CONTAIN" : "NO_REVIEW";
  return { review, recommendation, score: evaluation.score, findings: evaluation.hits.map(hitFinding) };
}

function outputs(db: Database.Database, finalTs: string) {
  const evaluation = createEvaluator(db).evaluate(TARGET, finalTs);
  const a = purposeOutput(db);
  const b = behaviourIdentityOutput(evaluation);
  return { A_PURPOSE: a, B_BEHAVIOUR_IDENTITY: b, C_SIMPLE_UNION: unionOutput(a, b), D_FULL_SENTRY: fullOutput(evaluation) };
}

function decisionSignature(value: ReturnType<typeof outputs>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).map(([key, output]) => [key, {
    review: output.review, recommendation: output.recommendation, score: output.score,
    findings: output.findings.map((finding) => finding.code).sort(),
  }])));
}

export function evaluateEpisode(input: EpisodeInput, databasePath: string): Outputs {
  if (input.family === "source_unavailable") throw new Error("source_unavailable is explicitly unsupported");
  resetDatabase(databasePath);
  const db = openDatabase(databasePath);
  try {
    const built = buildEpisode(db, input);
    const first = outputs(db, built.finalTs);
    if (built.ticketAction) {
      const principal = scenarioOperator(TARGET);
      answerTicket(db, principal, currentRunId(db), built.ticketAction, "TKT-EVAL", built.finalTs);
      if (built.repeated) answerTicket(db, principal, currentRunId(db), built.ticketAction, "TKT-EVAL", built.finalTs);
    }
    const final = outputs(db, built.finalTs);
    const beforeHidden = decisionSignature(final);
    db.prepare("UPDATE sensitive_actions SET is_malicious = 1, scenario_tag = 'HIDDEN-LABEL-FLIPPED'").run();
    const afterHidden = decisionSignature(outputs(db, built.finalTs));
    return { final, first: built.ticketAction ? first : undefined, hiddenLabelInvariant: beforeHidden === afterHidden };
  } finally {
    db.close();
  }
}

