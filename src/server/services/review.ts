import "server-only";
import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { AccessError } from "../auth/policy";
import { currentRunId } from "./run";
import { currentReviewDecision } from "./riskReview";

export const REVIEW_POLICY_VERSION = "containment-review-v1";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const parse = (value: string | null): JsonValue => value ? JSON.parse(value) as JsonValue : null;

function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key]!)]));
  return value;
}

const stable = (value: JsonValue) => JSON.stringify(canonical(value));
const revision = (value: JsonValue) => createHash("sha256").update(stable(value)).digest("hex");

function evidenceRows(db: Database.Database, staffId: string) {
  return (db.prepare("SELECT code, tier, effective_points, action_ids, evidence FROM signals WHERE staff_id = ? AND effective_points > 0 ORDER BY code").all(staffId) as {
    code: string; tier: number; effective_points: number; action_ids: string; evidence: string;
  }[]).map((row) => ({ ...row, action_ids: parse(row.action_ids), evidence: parse(row.evidence) }));
}

export function evidenceRevision(db: Database.Database, staffId: string): string {
  const signals = evidenceRows(db, staffId);
  const actionIds = [...new Set(signals.flatMap((row) => row.action_ids as string[]))].sort();
  const purpose = actionIds.length ? (db.prepare(`SELECT action_id, status, checks, reason FROM purpose_results WHERE action_id IN (${actionIds.map(() => "?").join(",")}) ORDER BY action_id`).all(...actionIds) as {
    action_id: string; status: string; checks: string; reason: string;
  }[]).map((row) => ({ ...row, checks: parse(row.checks) })) : [];
  return revision({ signals, purpose } as unknown as JsonValue);
}

export function recordEvidenceEvaluation(db: Database.Database, staffId: string, simTs: string, trigger: "SCENARIO_SCORE" | "TICKET_ANSWER", serverAt?: string): number {
  const result = db.prepare("INSERT INTO evidence_evaluations (staff_id, sim_ts, server_at, trigger, evidence_revision) VALUES (?,?,?,?,?)")
    .run(staffId, simTs, serverAt ?? null, trigger, evidenceRevision(db, staffId));
  return Number(result.lastInsertRowid);
}

export function freshness(db: Database.Database, staffId: string) {
  const score = db.prepare("SELECT id, ts, step_id FROM risk_scores WHERE staff_id = ? ORDER BY id DESC LIMIT 1").get(staffId) as { id: number; ts: string; step_id: string | null } | undefined;
  const evidence = db.prepare("SELECT id, sim_ts, server_at, trigger, evidence_revision FROM evidence_evaluations WHERE staff_id = ? ORDER BY id DESC LIMIT 1").get(staffId) as {
    id: number; sim_ts: string; server_at: string | null; trigger: string; evidence_revision: string;
  } | undefined;
  return {
    score: score ? { snapshot_id: score.id, sim_time: score.ts, step_id: score.step_id } : null,
    evidence: evidence ? { evaluation_id: evidence.id, sim_time: evidence.sim_ts, server_at: evidence.server_at, trigger: evidence.trigger, revision: evidence.evidence_revision } : null,
    score_is_current: !!score && !!evidence && score.ts === evidence.sim_ts && evidence.trigger === "SCENARIO_SCORE",
  };
}

function material(db: Database.Database, interventionId: string): JsonValue {
  const intervention = db.prepare(`SELECT i.id, i.case_id, i.staff_id, i.type, i.status, i.created_at, i.target,
    c.status case_status FROM interventions i JOIN cases c ON c.id = i.case_id WHERE i.id = ?`).get(interventionId) as {
      id: string; case_id: string; staff_id: string; type: string; status: string; created_at: string; target: string; case_status: string;
    } | undefined;
  if (!intervention) throw new AccessError(409, "review material is unavailable", "REVIEW_UNAVAILABLE");
  const signals = evidenceRows(db, intervention.staff_id);
  const target = parse(intervention.target) as { action_ids?: JsonValue } | null;
  const targetObject = target as { accounts?: JsonValue; sessions?: JsonValue } | null;
  const accounts = Array.isArray(targetObject?.accounts) ? targetObject.accounts.filter((id): id is string => typeof id === "string").sort() : [];
  const sessions = Array.isArray(targetObject?.sessions) ? targetObject.sessions.filter((id): id is string => typeof id === "string").sort() : [];
  const accountScope = accounts.length ? db.prepare(`SELECT a.id, a.customer_id, c.bvn_hash FROM accounts a JOIN customers c ON c.id = a.customer_id WHERE a.id IN (${accounts.map(() => "?").join(",")}) ORDER BY a.id`).all(...accounts) as Record<string, JsonValue>[] : [];
  const sessionScope = sessions.length ? db.prepare(`SELECT session_id, staff_id, status FROM logins WHERE session_id IN (${sessions.map(() => "?").join(",")}) ORDER BY session_id`).all(...sessions) as Record<string, JsonValue>[] : [];
  if (intervention.type === "HOLD_FUNDS" && (!accounts.length || accountScope.length !== accounts.length)) throw new AccessError(409, "the proposed account scope cannot be resolved", "REVIEW_UNAVAILABLE");
  if (intervention.type === "SUSPEND_SESSION" && (!sessions.length || sessionScope.length !== sessions.length)) throw new AccessError(409, "the proposed session scope cannot be resolved", "REVIEW_UNAVAILABLE");
  const signalActionIds = signals.flatMap((row) => row.action_ids as string[]);
  const targetActionIds = Array.isArray(target?.action_ids) ? target.action_ids.filter((id): id is string => typeof id === "string") : [];
  const actionIds = [...new Set([...signalActionIds, ...targetActionIds])].sort();
  const actions = actionIds.length ? (db.prepare(`SELECT id, staff_id, action_type, original_txn_id, credit_account_id, customer_id, amount, ticket_ref, status
    FROM sensitive_actions WHERE id IN (${actionIds.map(() => "?").join(",")}) ORDER BY id`).all(...actionIds) as Record<string, JsonValue>[]) : [];
  const purpose = actionIds.length ? (db.prepare(`SELECT action_id, status, checks, reason FROM purpose_results WHERE action_id IN (${actionIds.map(() => "?").join(",")}) ORDER BY action_id`).all(...actionIds) as {
    action_id: string; status: string; checks: string; reason: string;
  }[]).map((row) => ({ ...row, checks: parse(row.checks) })) : [];
  const transactionIds = [...new Set(actions.map((row) => row.original_txn_id).filter((id): id is string => typeof id === "string"))].sort();
  const transactions = transactionIds.length ? db.prepare(`SELECT id, debit_account_id, amount, status, response_code FROM transactions WHERE id IN (${transactionIds.map(() => "?").join(",")}) ORDER BY id`).all(...transactionIds) as Record<string, JsonValue>[] : [];
  return canonical({
    policy_version: REVIEW_POLICY_VERSION,
    risk_review: currentReviewDecision(db, intervention.staff_id),
    run_id: currentRunId(db),
    intervention: { id: intervention.id, case_id: intervention.case_id, staff_id: intervention.staff_id, type: intervention.type, status: intervention.status, created_at: intervention.created_at, target: parse(intervention.target), case_status: intervention.case_status },
    signals, actions, purpose, transactions, resolved_scope: { accounts: accountScope, sessions: sessionScope },
  } as unknown as JsonValue);
}

export function reviewContext(db: Database.Database, interventionId: string, persist = true) {
  const facts = material(db, interventionId);
  const hash = revision(facts);
  const reviewRef = `REV-${hash}`;
  const runId = currentRunId(db);
  const staff = db.prepare("SELECT staff_id FROM interventions WHERE id = ?").get(interventionId) as { staff_id: string };
  const evidenceCodes = (db.prepare("SELECT code FROM signals WHERE staff_id = ? AND effective_points > 0 ORDER BY code").all(staff.staff_id) as { code: string }[]).map((row) => row.code);
  if (persist) db.prepare("INSERT OR IGNORE INTO intervention_reviews (review_ref, run_id, intervention_id, material_json, created_at) VALUES (?,?,?,?,?)")
    .run(reviewRef, runId, interventionId, stable(facts), (db.prepare("SELECT value FROM sim_state WHERE key = 'clock'").get() as { value: string }).value);
  return { run_id: runId, review_ref: reviewRef, evidence_revision: hash, policy_version: REVIEW_POLICY_VERSION, evidence_codes: evidenceCodes };
}

export function requireReviewedContext(db: Database.Database, interventionId: string, runId: string, reviewRef: string) {
  if (currentRunId(db) !== runId) throw new AccessError(409, "the reviewed simulation run has changed", "RUN_STALE");
  const stored = db.prepare("SELECT 1 FROM intervention_reviews WHERE review_ref = ? AND run_id = ? AND intervention_id = ?").get(reviewRef, runId, interventionId);
  if (!stored) throw new AccessError(409, "review the current evidence before deciding", "REVIEW_REQUIRED");
  const current = reviewContext(db, interventionId, false);
  if (current.review_ref !== reviewRef) throw new AccessError(409, "the intervention evidence or target changed; refresh and review it again", "REVIEW_STALE");
  const state = db.prepare("SELECT i.status intervention_status, c.status case_status FROM interventions i JOIN cases c ON c.id = i.case_id WHERE i.id = ?").get(interventionId) as { intervention_status: string; case_status: string };
  if (state.intervention_status !== "PENDING_APPROVAL" || !["OPEN", "CONTAINED"].includes(state.case_status) || current.evidence_codes.length === 0) {
    throw new AccessError(409, "the control is not currently actionable or its material evidence is unavailable", "REVIEW_UNAVAILABLE");
  }
  return current;
}
