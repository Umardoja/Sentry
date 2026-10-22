import "server-only";
import type Database from "better-sqlite3";
import { buildFacts, recommendation, templateNote } from "../casenotes/template";
import { createEvaluator, runPurpose, saveScore, saveSignals, type Evaluation } from "../engines/pipeline";
import { purposeEngine, type ActionRow } from "../engines/purpose";
import { levelRank, SIGNALS, type Level } from "../engines/signals";
import { addMinutes } from "../time";
import { CHARACTERS, S2_ACCOUNTS, S2_FAILED_DEBITS, SCAM_CALLER } from "./generator";
import { FAN_OUT_BANKS, STEPS } from "./scenarios";
import { type VerifiedPrincipal, requireIndependentReviewer, requireOwnAction, scenarioOperator } from "../auth/policy";
import { currentRunId, requireCurrentRun } from "../services/run";
import { recordEvidenceEvaluation, requireReviewedContext, reviewContext } from "../services/review";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const getState = (db: Database.Database, key: string) => (db.prepare("SELECT value FROM sim_state WHERE key = ?").get(key) as { value: string } | undefined)?.value;
const setState = (db: Database.Database, key: string, value: string) => db.prepare("INSERT OR REPLACE INTO sim_state VALUES (?, ?)").run(key, value);
export const clockOf = (db: Database.Database) => getState(db, "clock") ?? "2026-10-16T20:25:00+01:00";

function audit(db: Database.Database, ts: string, actor: string, action: string, type: string, id: string, detail: Record<string, unknown> = {}) {
  db.prepare("INSERT INTO audit_log (ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)").run(ts, actor, action, type, id, JSON.stringify(detail));
}

type NewAction = Partial<ActionRow> & { id: string; staff_id: string; session_id: string; terminal_id: string; ts: string; action_type: string; is_malicious: boolean; scenario_tag: string };
function insertActions(db: Database.Database, rows: NewAction[]) {
  const s = db.prepare("INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const r of rows) s.run(r.id, r.staff_id, r.session_id, r.terminal_id, r.ts, r.action_type, r.original_txn_id ?? null, r.credit_account_id ?? null, r.customer_id ?? null, r.amount ?? null, r.ticket_ref ?? null, r.status ?? "POSTED", r.detail ?? null, r.scenario_tag, r.is_malicious ? 1 : 0);
  runPurpose(db, rows.map((r) => r.id));
}

function login(db: Database.Database, staffId: string, terminal: string, ts: string, session: string, tag: string) {
  db.prepare("INSERT INTO logins VALUES (?,?,?,?,?,?,?,?)").run(`LOG-${session}`, staffId, terminal, "Harbor", ts, session, "ACTIVE", tag);
}

const activeIntervention = (db: Database.Database, staffId: string, type: string) =>
  db.prepare("SELECT i.* FROM interventions i JOIN cases c ON c.id = i.case_id WHERE i.staff_id = ? AND i.type = ? AND c.status IN ('OPEN','CONTAINED') AND i.status IN ('ACTIVE','APPROVED')").get(staffId, type);

function nextId(db: Database.Database, table: string, prefix: string) {
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n + 1;
  return `${prefix}-${pad(n, 4)}`;
}

function createIntervention(db: Database.Database, caseId: string, staffId: string, type: string, status: string, automatic: boolean, ts: string, target: Record<string, unknown>) {
  const exists = db.prepare("SELECT id FROM interventions WHERE case_id = ? AND type = ?").get(caseId, type);
  if (exists && type !== "CONTACT_BVN_OWNER") return null;
  const id = nextId(db, "interventions", "INT");
  db.prepare("INSERT INTO interventions VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, caseId, staffId, type, status, automatic ? 1 : 0, ts, null, null, null, JSON.stringify(target));
  audit(db, ts, "SENTRY", `INTERVENTION_${status}`, "intervention", id, { type, case_id: caseId });
  return id;
}

/** Writes a new case-note version from the current facts. */
export function writeNote(db: Database.Database, caseId: string, ts: string) {
  const c = db.prepare("SELECT * FROM cases WHERE id = ?").get(caseId) as { staff_id: string; level: string };
  const facts = buildFacts(db, c.staff_id);
  const codes = facts.map((f) => SIGNALS[f.code].kind);
  const rec = recommendation(c.level, { money: codes.includes("money"), data: codes.includes("data"), leak: facts.some((f) => f.code === "LEAK_COMMON_VIEWER") });
  const note = templateNote(facts, rec);
  const version = (db.prepare("SELECT COUNT(*) AS n FROM case_notes WHERE case_id = ?").get(caseId) as { n: number }).n + 1;
  db.prepare("INSERT INTO case_notes VALUES (?,?,?,?,?,?,?)").run(`${caseId}-N${version}`, caseId, version, note.source, JSON.stringify(note.sentences), note.recommendation, ts);
}

/** Opens review cases from the review policy; higher-impact controls remain score-ladder decisions. */
export function applyLadder(db: Database.Database, e: Evaluation) {
  let c = db.prepare("SELECT * FROM cases WHERE staff_id = ? AND status IN ('OPEN','CONTAINED')").get(e.staff_id) as { id: string; level: string; peak_score: number } | undefined;
  if (!c && e.review.required) {
    const id = nextId(db, "cases", "CASE");
    db.prepare("INSERT INTO cases VALUES (?,?,?,?,?,?,?)").run(id, e.staff_id, e.ts, "OPEN", e.score, e.level, 0);
    audit(db, e.ts, "SENTRY", "CASE_OPENED", "case", id, {
      score: e.score,
      level: e.level,
      review_outcome: e.review.outcome,
      review_policy_version: e.review.policy_version,
      review_reason_codes: e.review.reason_codes,
      source_assumption: e.review.source_assumption,
    });
    const failed = [...new Set([
      ...e.review.action_ids,
      ...e.hits.filter((h) => SIGNALS[h.code].engine === "Purpose").flatMap((h) => h.action_ids),
    ])].sort();
    createIntervention(db, id, e.staff_id, "REQUEST_REASON", "ACTIVE", true, e.ts, { action_ids: failed });
    c = { id, level: e.level, peak_score: e.score };
  }
  if (!c) return;
  const level: Level = levelRank(e.level) > levelRank(c.level) ? e.level : (c.level as Level);
  db.prepare("UPDATE cases SET level = ?, peak_score = MAX(peak_score, ?) WHERE id = ?").run(level, e.score, c.id);
  const kinds = new Set(e.hits.filter((h) => h.effective > 0).map((h) => SIGNALS[h.code].kind));
  if (levelRank(level) >= levelRank("HOLD")) {
    if (kinds.has("money")) {
      createIntervention(db, c.id, e.staff_id, "SECOND_APPROVER", "ACTIVE", true, e.ts, {});
      const credits = db.prepare(`SELECT a.credit_account_id AS account, SUM(a.amount) AS amount FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id
        WHERE a.staff_id = ? AND a.ts > ? AND a.ts <= ? AND p.status <> 'MATCHED' AND a.credit_account_id IS NOT NULL GROUP BY a.credit_account_id ORDER BY a.credit_account_id`).all(e.staff_id, addMinutes(e.ts, -1440), e.ts) as { account: string; amount: number }[];
      const actionIds = (db.prepare(`SELECT a.id FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id
        WHERE a.staff_id = ? AND a.ts > ? AND a.ts <= ? AND p.status <> 'MATCHED' AND a.credit_account_id IS NOT NULL ORDER BY a.id`).all(e.staff_id, addMinutes(e.ts, -1440), e.ts) as { id: string }[]).map((row) => row.id);
      createIntervention(db, c.id, e.staff_id, "HOLD_FUNDS", "PENDING_APPROVAL", false, e.ts, { accounts: credits.map((x) => x.account), amount: credits.reduce((s, x) => s + x.amount, 0), action_ids: actionIds });
    }
    if (kinds.has("data")) createIntervention(db, c.id, e.staff_id, "RESTRICT_DATA_ACCESS", "ACTIVE", true, e.ts, {});
  }
  if (levelRank(level) >= levelRank("CONTAIN")) {
    const sessions = (db.prepare("SELECT session_id FROM logins WHERE staff_id = ? AND status = 'ACTIVE'").all(e.staff_id) as { session_id: string }[]).map((s) => s.session_id);
    createIntervention(db, c.id, e.staff_id, "SUSPEND_SESSION", "PENDING_APPROVAL", false, e.ts, { sessions });
  }
  writeNote(db, c.id, e.ts);
}

/** The scenario scoring path: evaluate, store signals, evidence and score, then apply the review ladder. */
export function score(db: Database.Database, staffId: string, ts: string, stepId: string, ladder = true): Evaluation {
  const e = createEvaluator(db).evaluate(staffId, ts);
  saveSignals(db, e);
  recordEvidenceEvaluation(db, staffId, ts, "SCENARIO_SCORE");
  saveScore(db, e, stepId);
  if (ladder) applyLadder(db, e);
  return e;
}

const isRestricted = (db: Database.Database, staffId: string) => !!activeIntervention(db, staffId, "RESTRICT_DATA_ACCESS");
const heldAccounts = (db: Database.Database) => {
  const rows = db.prepare("SELECT target FROM interventions WHERE type = 'HOLD_FUNDS' AND status = 'APPROVED'").all() as { target: string }[];
  return new Set(rows.flatMap((r) => (JSON.parse(r.target) as { accounts: string[] }).accounts));
};

/** Answers a Verify prompt. A ticket can satisfy only purpose rules that explicitly require an approved ticket. */
export function answerTicket(db: Database.Database, principal: VerifiedPrincipal, runId: string, actionId: string, ref: string, ts: string, serverAt?: string) {
  requireCurrentRun(db, runId);
  const action = db.prepare("SELECT * FROM sensitive_actions WHERE id = ?").get(actionId) as ActionRow | undefined;
  if (!action) return null;
  requireOwnAction(principal, action.staff_id);
  const engine = purposeEngine(db);
  const previous = db.prepare("SELECT status, checks FROM purpose_results WHERE action_id = ?").get(actionId) as { status: string; checks: string } | undefined;
  const result = engine.validateTicket(action, ref);
  const write = db.transaction(() => {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM ticket_answers").get() as { n: number }).n + 1;
    db.prepare("INSERT INTO ticket_answers VALUES (?,?,?,?,?,?,?)").run(`ANS-${pad(n, 4)}`, actionId, action.staff_id, ref, ts, result.valid ? 1 : 0, JSON.stringify(result.failed));
    if (result.valid && engine.ticketCanEstablishPurpose(action)) db.prepare("UPDATE sensitive_actions SET ticket_ref = ? WHERE id = ?").run(ref, actionId);
    // Re-run from canonical records even after an invalid or repeated answer, so a ticket never rewrites an independent reversal check.
    runPurpose(db, [actionId]);
    // Refresh evidence-derived signals, but do not create a new score, intervention, or execution outcome from an explanation alone.
    saveSignals(db, createEvaluator(db).evaluate(action.staff_id, ts));
    const evidenceEvaluationId = recordEvidenceEvaluation(db, action.staff_id, ts, "TICKET_ANSWER", serverAt);
    const current = db.prepare("SELECT status, checks FROM purpose_results WHERE action_id = ?").get(actionId) as { status: string; checks: string };
    const resolved = previous?.status !== "MATCHED" && current.status === "MATCHED";
    audit(db, ts, principal.account_id, "TICKET_ANSWER", "action", actionId, {
      actor_staff_id: principal.staff_id,
      server_at: serverAt,
      ticket_ref: ref,
      ticket_valid: result.valid,
      previous_purpose: previous ? { status: previous.status, checks: JSON.parse(previous.checks) } : null,
      rechecked_purpose: { status: current.status, checks: JSON.parse(current.checks) },
      purpose_resolved: resolved,
      run_id: runId,
      evidence_evaluation_id: evidenceEvaluationId,
      retained_concerns: JSON.parse(current.checks).filter((check: { passed: boolean }) => !check.passed).map((check: { code: string }) => check.code),
    });
    const message = !result.valid
      ? (result.failed.includes("T1") ? "Ticket not found" : "Ticket does not check out")
      : resolved ? "Ticket valid · ticket-backed purpose evidence matched"
        : current.status === "MATCHED" ? "Ticket valid · action remains matched"
          : current.status === "WRONG_BENEFICIARY" ? "Ticket verified. Destination mismatch remains. Review still required."
            : "Ticket valid · independent purpose concerns remain";
    return { action_id: actionId, ticket_ref: ref, valid: result.valid, failed_checks: result.failed, status: current.status, message };
  });
  return write();
}

/** Splits the S2.4 fan-out so per-bank counts and totals match the spec and each new account sends exactly what it received. */
function fanOutPlan() {
  const balances = S2_FAILED_DEBITS.map((d, i) => ({ account: S2_ACCOUNTS[i]!.id, left: d.amount }));
  const flows: { account: string; bank: string; amount: number }[] = [];
  let a = 0;
  for (const b of FAN_OUT_BANKS) {
    let need = b.total;
    while (need > 0) {
      const take = Math.min(need, balances[a]!.left);
      flows.push({ account: balances[a]!.account, bank: b.bank, amount: take });
      need -= take;
      balances[a]!.left -= take;
      if (balances[a]!.left === 0) a++;
    }
  }
  const transfers: { from: string; bank: string; to: string; amount: number }[] = [];
  let dest = 0;
  for (const b of FAN_OUT_BANKS) {
    const parts = flows.filter((f) => f.bank === b.bank);
    const counts = parts.map(() => 1);
    for (let extra = b.accounts - parts.length; extra > 0; extra--) {
      const i = parts.map((p, k) => p.amount / counts[k]!).reduce((best, v, k, arr) => (v > arr[best]! ? k : best), 0);
      counts[i]!++;
    }
    parts.forEach((p, k) => {
      const n = counts[k]!;
      const unit = Math.floor(p.amount / n / 1000) * 1000;
      for (let j = 0; j < n; j++) {
        dest++;
        transfers.push({ from: p.account, bank: b.bank, to: `77${pad(dest, 8)}`, amount: j === n - 1 ? p.amount - unit * (n - 1) : unit });
      }
    });
  }
  return transfers;
}

/** Runs a scenario step. Each step is deterministic. */
function runStep(db: Database.Database, stepId: string): Record<string, unknown> {
  const t = STEPS.find((s) => s.id === stepId)!.sim_time;
  switch (stepId) {
    case "S1.1": {
      login(db, CHARACTERS.ngozi, "TRM-0042", "2026-10-16T20:28:00+01:00", "SES-S1", "S1");
      const rows: NewAction[] = [];
      const txn = db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?)");
      for (let i = 0; i < 60; i++) {
        const ts = addMinutes("2026-10-16T20:30:00+01:00", Math.floor((i * 40) / 59));
        const account = `ACC-${pad(200 + i * 7, 6)}`;
        const amount = (8 + ((i * 37) % 180)) * 500;
        const id = `TXN-S1-${pad(i + 1, 3)}`;
        txn.run(id, `NIP-${id}`, account, amount, `20000${pad(i, 5)}`, "Atlas Credit", addMinutes(ts, -45), "APP", "FAILED", "91");
        rows.push({ id: `ACT-S1-${pad(i + 1, 3)}`, staff_id: CHARACTERS.ngozi, session_id: "SES-S1", terminal_id: "TRM-0042", ts, action_type: "REVERSAL", original_txn_id: id, credit_account_id: account, amount, scenario_tag: "S1", is_malicious: false });
      }
      insertActions(db, rows);
      const e = score(db, CHARACTERS.ngozi, t, stepId);
      return { staff_id: CHARACTERS.ngozi, score: e.score, raw: e.raw, toast: e.score < 15 ? "Cleared automatically: overtime approved, all 60 reversals matched." : null };
    }
    case "S2.0":
      return { staff_id: CHARACTERS.tunde };
    case "S2.1": {
      login(db, CHARACTERS.tunde, "TRM-0101", "2026-10-16T21:45:00+01:00", "SES-S2", "S2");
      const d = S2_FAILED_DEBITS[0]!;
      insertActions(db, [{ id: "ACT-S2-1", staff_id: CHARACTERS.tunde, session_id: "SES-S2", terminal_id: "TRM-0101", ts: t, action_type: "REVERSAL", original_txn_id: d.id, credit_account_id: "ACC-N1", amount: d.amount, scenario_tag: "S2", is_malicious: true }]);
      return { staff_id: CHARACTERS.tunde, score: score(db, CHARACTERS.tunde, t, stepId).score };
    }
    case "S2.2": {
      const answer = db.prepare("SELECT ticket_ref, valid FROM ticket_answers WHERE action_id = 'ACT-S2-1' ORDER BY id DESC LIMIT 1").get();
      return { staff_id: CHARACTERS.tunde, answer, score: score(db, CHARACTERS.tunde, t, stepId).score };
    }
    case "S2.3": {
      const rows = S2_FAILED_DEBITS.slice(1).map((d, i) => ({
        id: `ACT-S2-${i + 2}`, staff_id: CHARACTERS.tunde, session_id: "SES-S2", terminal_id: "TRM-0101", ts: t, action_type: "REVERSAL",
        original_txn_id: d.id, credit_account_id: S2_ACCOUNTS[i + 1]!.id, amount: d.amount, scenario_tag: "S2", is_malicious: true,
      }));
      insertActions(db, rows);
      return { staff_id: CHARACTERS.tunde, score: score(db, CHARACTERS.tunde, t, stepId).score };
    }
    case "S2.4": {
      const held = heldAccounts(db);
      const s = db.prepare("INSERT INTO outbound_transfers VALUES (?,?,?,?,?,?,?,?)");
      fanOutPlan().forEach((x, i) => s.run(`OUT-${pad(i + 1, 3)}`, x.from, x.to, x.bank, x.amount, t, held.has(x.from) ? "BLOCKED_BY_HOLD" : "SENT", "S2"));
      return { staff_id: CHARACTERS.tunde, score: score(db, CHARACTERS.tunde, t, stepId).score };
    }
    case "S3.1": {
      login(db, CHARACTERS.bisi, "TRM-0777", t, "SES-S3", "S3");
      return { staff_id: CHARACTERS.bisi, score: score(db, CHARACTERS.bisi, t, stepId).score };
    }
    case "S3.2":
    case "S3.3": {
      const [start, count] = stepId === "S3.2" ? [0, 12] : [12, 48];
      const status = isRestricted(db, CHARACTERS.bisi) ? "BLOCKED" : "POSTED";
      const rows = Array.from({ length: count }, (_, i) => ({
        id: `ACT-S3-V${pad(start + i + 1, 3)}`, staff_id: CHARACTERS.bisi, session_id: "SES-S3", terminal_id: "TRM-0777", ts: t,
        action_type: "RECORD_VIEW", customer_id: `CUS-${pad(4101 + (start + i) * 13, 5)}`, status, scenario_tag: "S3", is_malicious: true,
      }));
      insertActions(db, rows);
      return { staff_id: CHARACTERS.bisi, score: score(db, CHARACTERS.bisi, t, stepId).score };
    }
    case "S3.4": {
      const status = isRestricted(db, CHARACTERS.bisi) ? "BLOCKED" : "POSTED";
      insertActions(db, [{ id: "ACT-S3-EXPORT", staff_id: CHARACTERS.bisi, session_id: "SES-S3", terminal_id: "TRM-0777", ts: t, action_type: "BULK_EXPORT", status, detail: JSON.stringify({ rows: 5000, scope: "CUSTOMER_TABLE" }), scenario_tag: "S3", is_malicious: true }]);
      return { staff_id: CHARACTERS.bisi, score: score(db, CHARACTERS.bisi, t, stepId).score };
    }
    case "S4.1": {
      const result = runTracer(db, SCAM_CALLER, t, true);
      const scores = result.common_viewer_ids.map((id) => score(db, id, t, stepId).score);
      return { staff_id: CHARACTERS.kemi, score: scores[0] ?? 0 };
    }
    default:
      throw new Error(`unknown step ${stepId}`);
  }
}

export function pendingDecision(db: Database.Database): string | null {
  return (db.prepare("SELECT id FROM interventions WHERE status = 'PENDING_APPROVAL' ORDER BY created_at, id LIMIT 1").get() as { id: string } | undefined)?.id ?? null;
}

export function waitingForOperatorAction(db: Database.Database): string | null {
  const index = Number(getState(db, "step_index") ?? "0");
  if (STEPS[index]?.id !== "S2.2") return null;
  const answer = db.prepare("SELECT 1 FROM ticket_answers WHERE action_id = 'ACT-S2-1' AND ticket_ref = 'TKT-2291' AND valid = 1").get();
  return answer ? null : "ACT-S2-1";
}

export class GateError extends Error {}

/** Advances the demo by one step. Throws GateError while an analyst decision is pending. */
export function nextStep(db: Database.Database) {
  if (pendingDecision(db)) throw new GateError("Waiting for analyst decision");
  if (waitingForOperatorAction(db)) throw new GateError("Waiting for the operator to submit the genuine ticket");
  const index = Number(getState(db, "step_index") ?? "0");
  if (index >= STEPS.length) return { done: true, step: null, result: null };
  const step = STEPS[index]!;
  let result: Record<string, unknown> = {};
  db.transaction(() => {
    result = runStep(db, step.id);
    setState(db, "clock", step.sim_time);
    setState(db, "step_index", String(index + 1));
    setState(db, "focus", step.focus);
    setState(db, "toast", String(result.toast ?? ""));
    setState(db, "last_step", step.id);
  })();
  return { done: false, step, result };
}

/** Approves or rejects an intervention, with its side effects. */
export function decide(db: Database.Database, principal: VerifiedPrincipal, runId: string, reviewRef: string, id: string, decision: "APPROVED" | "REJECTED", note: string | null, serverAt?: string) {
  try {
    return decideVerified(db, principal, runId, reviewRef, id, decision, note, serverAt);
  } catch (error) {
    if (error instanceof Error && "code" in error && ["RUN_STALE", "REVIEW_REQUIRED", "REVIEW_STALE"].includes(String(error.code))) {
      audit(db, clockOf(db), principal.account_id, "DECISION_STALE", "intervention", id, { run_id: runId, current_run_id: currentRunId(db), reviewed_ref: reviewRef, reason_code: error.code, server_at: serverAt, simulation: true });
    }
    throw error;
  }
}

function decideVerified(db: Database.Database, principal: VerifiedPrincipal, runId: string, reviewRef: string, id: string, decision: "APPROVED" | "REJECTED", note: string | null, serverAt?: string) {
  const ts = clockOf(db);
  db.transaction(() => {
    requireIndependentReviewer(db, principal, id);
    requireReviewedContext(db, id, runId, reviewRef);
    const i = db.prepare("SELECT * FROM interventions WHERE id = ?").get(id) as { id: string; case_id: string; staff_id: string; type: string; status: string; created_at: string; target: string } | undefined;
    if (!i) throw new Error("intervention not found");
    if (i.status !== "PENDING_APPROVAL") throw new GateError("Intervention is not waiting for a decision");
    const changed = db.prepare("UPDATE interventions SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ? AND status = 'PENDING_APPROVAL'").run(decision, principal.account_id, ts, note, id);
    if (changed.changes !== 1) throw new GateError("Intervention is not waiting for a decision");
    audit(db, ts, principal.account_id, decision === "APPROVED" ? "APPROVE" : "REJECT", "intervention", id, { actor_staff_id: principal.staff_id, type: i.type, note, server_at: serverAt, run_id: runId, reviewed_ref: reviewRef, simulation: true });
    if (decision === "APPROVED" && i.type === "HOLD_FUNDS") {
      const target = JSON.parse(i.target) as { accounts: string[] };
      const seen = new Set<string>();
      for (const account of target.accounts) {
        const row = db.prepare("SELECT c.bvn_hash FROM accounts a JOIN customers c ON c.id = a.customer_id WHERE a.id = ?").get(account) as { bvn_hash: string } | undefined;
        if (!row) throw new Error("review target account is unavailable");
        if (seen.has(row.bvn_hash)) continue;
        seen.add(row.bvn_hash);
        const task = createIntervention(db, i.case_id, i.staff_id, "CONTACT_BVN_OWNER", "ACTIVE", true, ts, { bvn_hash: row.bvn_hash, account_id: account })!;
        const n = (db.prepare("SELECT COUNT(*) AS n FROM bvn_watchlist").get() as { n: number }).n + 1;
        db.prepare("INSERT INTO bvn_watchlist VALUES (?,?,?,?,?,?,?,?,?,?)").run(`BWL-${pad(n, 4)}`, row.bvn_hash, account, i.case_id, task, i.created_at, addMinutes(i.created_at, 1440), "ACTIVE", null, null);
      }
      audit(db, ts, "SENTRY", "BVN_WATCHLIST", "case", i.case_id, { bvns: seen.size, expires_at: addMinutes(i.created_at, 1440) });
    }
    if (decision === "APPROVED" && i.type === "SUSPEND_SESSION") {
      db.prepare("UPDATE logins SET status = 'SUSPENDED' WHERE staff_id = ? AND status = 'ACTIVE'").run(i.staff_id);
      db.prepare("UPDATE cases SET status = 'CONTAINED' WHERE id = ?").run(i.case_id);
    }
    writeNote(db, i.case_id, ts);
  })();
  return db.prepare("SELECT * FROM interventions WHERE id = ?").get(id);
}

export type TracerResult = {
  caller_number: string;
  reports: { report_id: string; customer_id: string; account_masked: string; city: string; reported_at: string }[];
  viewers: { staff_id: string; pseudo_id: string; role: string; employment_type: string; viewed_customer_ids: string[]; is_common: boolean }[];
  common_viewer_ids: string[];
  case_id: string | null;
};

/** Leak tracer (v1.1 section C): finds the staff member who viewed every customer in a scam cluster. */
export function runTracer(db: Database.Database, caller: string, t: string, save: boolean): TracerResult {
  const reports = db.prepare(`SELECT r.id, r.customer_id, r.reported_at, c.city, a.account_no FROM scam_reports r JOIN customers c ON c.id = r.customer_id
    JOIN accounts a ON a.customer_id = r.customer_id WHERE r.caller_number = ? AND r.reported_at <= ? ORDER BY r.reported_at`).all(caller, t) as { id: string; customer_id: string; reported_at: string; city: string; account_no: string }[];
  const viewsBy = new Map<string, Set<string>>();
  const actionIds = new Map<string, string[]>();
  for (const r of reports) {
    const views = db.prepare("SELECT id, staff_id FROM sensitive_actions WHERE action_type = 'RECORD_VIEW' AND customer_id = ? AND ts >= ? AND ts < ?").all(r.customer_id, addMinutes(r.reported_at, -72 * 60), r.reported_at) as { id: string; staff_id: string }[];
    for (const v of views) {
      if (!viewsBy.has(v.staff_id)) viewsBy.set(v.staff_id, new Set());
      viewsBy.get(v.staff_id)!.add(r.customer_id);
      actionIds.set(v.staff_id, [...(actionIds.get(v.staff_id) ?? []), v.id]);
    }
  }
  const cluster = reports.length >= 3;
  const common = cluster ? [...viewsBy].filter(([, set]) => set.size === reports.length).map(([id]) => id).sort() : [];
  if (save && common.length) {
    const hits = common.map((id) => ({ staff_id: id, ts: t, action_ids: actionIds.get(id)!, evidence: { caller, victims: reports.length, report_ids: reports.map((r) => r.id) } }));
    db.prepare("INSERT OR REPLACE INTO sim_state VALUES ('leak_hits', ?)").run(JSON.stringify(hits));
    audit(db, t, "SENTRY_SIMULATOR", "RUN_TRACER", "caller", caller, { common, simulation: true });
  }
  const staff = db.prepare("SELECT id, pseudo_id, role, employment_type FROM staff WHERE id = ?");
  const viewers = [...viewsBy].map(([id, set]) => {
    const s = staff.get(id) as { id: string; pseudo_id: string; role: string; employment_type: string };
    return { staff_id: id, pseudo_id: s.pseudo_id, role: s.role, employment_type: s.employment_type, viewed_customer_ids: [...set], is_common: common.includes(id) };
  }).sort((a, b) => Number(b.is_common) - Number(a.is_common) || a.staff_id.localeCompare(b.staff_id));
  const caseRow = common[0] ? (db.prepare("SELECT id FROM cases WHERE staff_id = ?").get(common[0]) as { id: string } | undefined) : undefined;
  return {
    caller_number: caller,
    reports: reports.map((r) => ({ report_id: r.id, customer_id: r.customer_id, account_masked: `••••${r.account_no.slice(-4)}`, city: r.city, reported_at: r.reported_at })),
    viewers,
    common_viewer_ids: common,
    case_id: caseRow?.id ?? null,
  };
}

/** Rehearsal: runs every step and approves every gate. For tests and rehearsal only. */
export function rehearse(db: Database.Database) {
  const log: { step: string; score: unknown }[] = [];
  for (;;) {
    const gate = pendingDecision(db);
    if (gate) {
      const context = reviewContext(db, gate);
      decideVerified(db, { kind: "simulation", account_id: "simulation:rehearsal", username: "synthetic rehearsal", staff_id: "STF-0007", roles: ["REVIEWER"], capabilities: ["READ_INVESTIGATIONS", "DECIDE_INTERVENTION", "REVEAL_IDENTITY"], session_id: null }, context.run_id, context.review_ref, gate, "APPROVED", "synthetic CLI/test rehearsal");
      continue;
    }
    if (waitingForOperatorAction(db)) answerTicket(db, scenarioOperator(CHARACTERS.tunde), currentRunId(db), "ACT-S2-1", "TKT-2291", clockOf(db));
    const r = nextStep(db);
    if (r.done) break;
    log.push({ step: r.step!.id, score: (r.result as { score?: number }).score });
  }
  return log;
}


