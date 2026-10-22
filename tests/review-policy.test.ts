import { afterEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, resetDatabase } from "@/server/db/migrate";
import { createEvaluator, runPurpose, saveScore, saveSignals } from "@/server/engines/pipeline";
import { RISK_REVIEW_POLICY_VERSION } from "@/server/engines/reviewPolicy";
import { applyLadder, answerTicket } from "@/server/sim/player";
import { scenarioOperator } from "@/server/auth/policy";
import { rotateRunId } from "@/server/services/run";
import { recordEvidenceEvaluation } from "@/server/services/review";
import { caseView } from "@/server/services/read";

const TARGET = "STF-POLICY";
const TS = "2026-10-16T14:00:00+01:00";
let sequence = 0;
let db: Database.Database | null = null;

function fixture(): Database.Database {
  const path = join(tmpdir(), `sentry-review-policy-${process.pid}-${sequence++}.db`);
  resetDatabase(path);
  const next = openDatabase(path);
  next.prepare("INSERT INTO sim_state VALUES ('clock', ?)").run(TS);
  next.prepare("INSERT INTO sim_state VALUES ('peer_stats', '{}')").run();
  next.prepare("INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)").run(TARGET, "Synthetic operator", "Staff-POLICY", "OPS_REVERSALS", "REVERSALS", "Harbor", "EMPLOYEE", "08000000001", JSON.stringify(["TRM-USUAL"]), null);
  next.prepare("INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?)").run("STF-REVIEW", "Synthetic reviewer", "Staff-REVIEW", "INTERNAL_CONTROL", "CONTROL", "Harbor", "EMPLOYEE", "08000000002", JSON.stringify(["TRM-REVIEW"]), null);
  for (const terminal of ["TRM-USUAL", "TRM-NEW", "TRM-REVIEW"]) next.prepare("INSERT INTO terminals VALUES (?,?,?,?)").run(terminal, terminal, "Harbor", "Harbor");
  next.prepare("INSERT INTO roster VALUES (?,?,?,?,?)").run("ROS-POLICY", TARGET, "2026-10-16", "08:00", "17:00");
  next.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?)").run("CUS-1", "Synthetic customer one", "08000000101", "BVN-HASH-1", 0, "Lagos");
  next.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?)").run("CUS-2", "Synthetic customer two", "08000000102", "BVN-HASH-2", 0, "Lagos");
  next.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-DEBIT", "CUS-1", "1000000001", "2020-01-01T00:00:00+01:00", "08000000101", "ACTIVE");
  next.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-SAME", "CUS-1", "1000000002", "2021-01-01T00:00:00+01:00", "08000000101", "ACTIVE");
  next.prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?)").run("ACC-OTHER", "CUS-2", "1000000003", "2026-09-01T00:00:00+01:00", "08000000102", "ACTIVE");
  rotateRunId(next);
  db = next;
  return next;
}

function transaction(database: Database.Database, status: "FAILED" | "SUCCESS" = "FAILED") {
  database.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?)").run("TXN-POLICY", "NIP-POLICY", "ACC-DEBIT", 850_000, "2000000001", "Atlas Credit", "2026-10-16T13:30:00+01:00", "APP", status, status === "FAILED" ? "91" : "00");
}

function reversal(database: Database.Database, options: { original?: string; credit?: string; amount?: number; id?: string; ts?: string } = {}) {
  database.prepare("INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    options.id ?? "ACT-POLICY", TARGET, "SES-POLICY", "TRM-USUAL", options.ts ?? TS, "REVERSAL", options.original ?? "TXN-POLICY",
    options.credit ?? "ACC-DEBIT", null, options.amount ?? 850_000, null, "POSTED", null, "POLICY_TEST", 0,
  );
}

function evaluate(database: Database.Database, step = "POLICY_TEST") {
  runPurpose(database);
  const result = createEvaluator(database).evaluate(TARGET, TS);
  saveSignals(database, result);
  recordEvidenceEvaluation(database, TARGET, TS, "SCENARIO_SCORE");
  saveScore(database, result, step);
  applyLadder(database, result);
  return result;
}

afterEach(() => {
  db?.close();
  db = null;
});

describe("reason-based review policy", () => {
  it("keeps R4 after a genuine ticket, opens a low-score review case, and creates no hold", () => {
    const database = fixture();
    transaction(database);
    database.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run("TKT-POLICY", "COMPLAINT", "CUS-1", "TXN-POLICY", "REVERSALS", "STF-REVIEW", null, "2026-10-16T13:45:00+01:00", "OPEN", null);
    reversal(database, { credit: "ACC-OTHER" });
    runPurpose(database);
    expect(answerTicket(database, scenarioOperator(TARGET), (database.prepare("SELECT value FROM sim_state WHERE key='run_id'").get() as { value: string }).value, "ACT-POLICY", "TKT-POLICY", TS)).toMatchObject({ valid: true, status: "WRONG_BENEFICIARY" });
    const result = evaluate(database);
    expect(result).toMatchObject({ score: 20, level: "WATCH", review: { required: true, outcome: "REVIEW_REQUIRED", policy_version: RISK_REVIEW_POLICY_VERSION, critical_reason_codes: ["R4_WRONG_BENEFICIARY"] } });
    expect(result.hits.map((hit) => hit.code)).toContain("REVERSAL_WRONG_BENEFICIARY");
    const view = caseView(database, "CASE-0001")!;
    expect(view).toMatchObject({ score: 20, level: "WATCH", review: { required: true, score_threshold_met: false, reason_codes: ["R4_WRONG_BENEFICIARY"] } });
    expect(database.prepare("SELECT type, status FROM interventions").all()).toEqual([{ type: "REQUEST_REASON", status: "ACTIVE" }]);
    expect((database.prepare("SELECT COUNT(*) n FROM bvn_watchlist").get() as { n: number }).n).toBe(0);
  });

  it.each([
    ["amount mismatch", { amount: 900_000 }, "R3_AMOUNT_MISMATCH", 10],
    ["ineligible original", {}, "R2_ORIGINAL_INELIGIBLE", 25],
    ["missing original", { original: "TXN-MISSING" }, "R1_ORIGINAL_MISSING", 25],
  ] as const)("requires review for a confirmed %s without inflating the score", (_name, options, reason, score) => {
    const database = fixture();
    if (reason !== "R1_ORIGINAL_MISSING") transaction(database, reason === "R2_ORIGINAL_INELIGIBLE" ? "SUCCESS" : "FAILED");
    reversal(database, options);
    const result = evaluate(database);
    expect(result.score).toBe(score);
    expect(result.review).toMatchObject({ required: true, critical_reason_codes: [reason], score_threshold_met: false });
    expect(database.prepare("SELECT COUNT(*) n FROM cases").get()).toEqual({ n: 1 });
    expect(database.prepare("SELECT COUNT(*) n FROM interventions WHERE type = 'HOLD_FUNDS'").get()).toEqual({ n: 0 });
  });

  it("requires review for a distinct prior reversal", () => {
    const database = fixture();
    transaction(database);
    reversal(database, { id: "ACT-PRIOR", ts: "2026-10-16T13:50:00+01:00" });
    reversal(database);
    const result = evaluate(database);
    expect(result).toMatchObject({ score: 15, review: { required: true, critical_reason_codes: ["R5_DUPLICATE_REVERSAL"] } });
  });

  it("requires review for a single unrelated record access under the complete-source assumption", () => {
    const database = fixture();
    database.prepare("INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("ACT-VIEW", TARGET, "SES-POLICY", "TRM-USUAL", TS, "RECORD_VIEW", null, null, "CUS-2", null, null, "POSTED", null, "POLICY_TEST", 0);
    const result = evaluate(database);
    expect(result).toMatchObject({ score: 0, level: "NORMAL", review: { required: true, critical_reason_codes: ["V1_UNRELATED_RECORD_ACCESS"], source_assumption: "SIMULATOR_HEALTHY_COMPLETE" } });
  });

  it("does not turn a legitimate reversal, new terminal, or unusual time alone into review", () => {
    const legitimate = fixture();
    transaction(legitimate);
    reversal(legitimate);
    expect(evaluate(legitimate).review.required).toBe(false);
    legitimate.close();
    db = null;

    const terminal = fixture();
    terminal.prepare("INSERT INTO logins VALUES (?,?,?,?,?,?,?,?)").run("LOG-NEW", TARGET, "TRM-NEW", "Harbor", TS, "SES-NEW", "ACTIVE", "POLICY_TEST");
    const terminalResult = evaluate(terminal);
    expect(terminalResult).toMatchObject({ score: 10, review: { required: false } });
    expect(terminal.prepare("SELECT COUNT(*) n FROM cases").get()).toEqual({ n: 0 });
    terminal.close();
    db = null;

    const late = fixture();
    transaction(late);
    reversal(late, { ts: "2026-10-16T21:00:00+01:00" });
    const lateResult = createEvaluator(late).evaluate(TARGET, "2026-10-16T21:00:00+01:00");
    expect(lateResult).toMatchObject({ score: 5, review: { required: false } });
  });
});
