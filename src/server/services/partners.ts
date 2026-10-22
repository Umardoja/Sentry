import "server-only";
import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { AccessError, type VerifiedPrincipal, requireCapability } from "../auth/policy";
import {
  createPartnerEvaluator, PARTNER_REVIEW_POLICY_VERSION, savePartnerChecks, savePartnerScore, savePartnerSignals,
  type PartnerCallRow, type PartnerEvaluation,
} from "../engines/partners";
import { levelRank, SIGNALS, type Level } from "../engines/signals";
import { PARTNER_TYPE, S5_PARTNER, type NewPartnerCall } from "../sim/partners";
import { addMinutes, addSeconds, dateOf } from "../time";
import { currentRunId } from "./run";

/** Calls a rate-limited key may make per minute before further calls are refused (429). */
export const RATE_LIMIT_PER_MINUTE = 5;
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const mask = (accountNo: string) => `••••${accountNo.slice(-4)}`;
const HTTP: Record<string, number> = { ALLOWED: 200, RATE_LIMITED: 429, BLOCKED: 403 };

function audit(db: Database.Database, ts: string, actor: string, action: string, type: string, id: string, detail: Record<string, unknown>) {
  db.prepare("INSERT INTO audit_log (ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)").run(ts, actor, action, type, id, JSON.stringify(detail));
}
const nextId = (db: Database.Database, table: string, prefix: string) => `${prefix}-${pad((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n + 1, 4)}`;
const clockOf = (db: Database.Database) => (db.prepare("SELECT value FROM sim_state WHERE key = 'clock'").get() as { value: string }).value;
/** Scenario clock, or the live clock when live activity has run ahead of it (as the console feed does). */
function viewClock(db: Database.Database) {
  const live = (db.prepare("SELECT value FROM sim_state WHERE key = 'live_state'").get() as { value: string } | undefined)?.value;
  const liveClock = live ? (JSON.parse(live) as { clock: string | null }).clock : null;
  const clock = clockOf(db);
  return liveClock && liveClock > clock ? liveClock : clock;
}

type KeyRow = { id: string; partner_id: string; label: string; status: "ACTIVE" | "RATE_LIMITED" | "SUSPENDED"; created_at: string };
type CaseRow = { id: string; partner_id: string; key_id: string; opened_at: string; status: string; peak_score: number; level: string; closed_at: string | null };
type ResponseRow = { id: string; case_id: string; partner_id: string; key_id: string; type: string; status: string; automatic: number; created_at: string; decided_by: string | null; decided_at: string | null; note: string | null; target: string };
const keyOf = (db: Database.Database, partnerId: string) => db.prepare("SELECT * FROM api_keys WHERE partner_id = ? ORDER BY id LIMIT 1").get(partnerId) as KeyRow;
const openCase = (db: Database.Database, partnerId: string) => db.prepare("SELECT * FROM partner_cases WHERE partner_id = ? AND status IN ('OPEN','CONTAINED')").get(partnerId) as CaseRow | undefined;

/** Partner response ladder: a case opens when review is required; at Hold the key is rate-limited and suspension is proposed. */
export function applyPartnerLadder(db: Database.Database, e: PartnerEvaluation): void {
  let c = openCase(db, e.partner_id);
  if (!c && e.review.required) {
    const id = nextId(db, "partner_cases", "PCASE");
    const key = keyOf(db, e.partner_id);
    db.prepare("INSERT INTO partner_cases VALUES (?,?,?,?,?,?,?,?)").run(id, e.partner_id, key.id, e.ts, "OPEN", e.score, e.level, null);
    audit(db, e.ts, "SENTRY", "PARTNER_CASE_OPENED", "partner_case", id, { partner_id: e.partner_id, score: e.score, level: e.level, review_reason_codes: e.review.reason_codes, review_policy_version: e.review.policy_version });
    c = openCase(db, e.partner_id)!;
  }
  if (!c) return;
  const level: Level = levelRank(e.level) > levelRank(c.level) ? e.level : (c.level as Level);
  db.prepare("UPDATE partner_cases SET level = ?, peak_score = MAX(peak_score, ?) WHERE id = ?").run(level, e.score, c.id);
  if (levelRank(level) < levelRank("HOLD")) return;
  const key = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(c.key_id) as KeyRow;
  const has = (type: string) => !!db.prepare("SELECT 1 FROM partner_responses WHERE case_id = ? AND type = ?").get(c.id, type);
  const respond = (type: string, status: string, automatic: boolean) => {
    const id = nextId(db, "partner_responses", "PRSP");
    db.prepare("INSERT INTO partner_responses VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, c.id, c.partner_id, key.id, type, status, automatic ? 1 : 0, e.ts, null, null, null, JSON.stringify({ key_id: key.id, key_label: key.label }));
    audit(db, e.ts, "SENTRY", status === "ACTIVE" ? "PARTNER_RESPONSE_APPLIED" : "PARTNER_RESPONSE_PROPOSED", "partner_response", id, { type, partner_id: c.partner_id, key_label: key.label, case_id: c.id });
  };
  if (key.status === "ACTIVE" && !has("RATE_LIMIT_KEY")) {
    db.prepare("UPDATE api_keys SET status = 'RATE_LIMITED' WHERE id = ?").run(key.id);
    respond("RATE_LIMIT_KEY", "ACTIVE", true);
  }
  if (!has("SUSPEND_KEY")) respond("SUSPEND_KEY", "PENDING_APPROVAL", false);
}

/** The scoring path S5 steps, ingest and live traffic share: evaluate, store factors and score, apply the ladder. */
export function scorePartner(db: Database.Database, partnerId: string, ts: string, stepId: string): PartnerEvaluation {
  const e = createPartnerEvaluator(db).evaluate(partnerId, ts);
  savePartnerSignals(db, e);
  savePartnerScore(db, e, stepId);
  applyPartnerLadder(db, e);
  return e;
}

export type PartnerCallResult = { id: string; status: string; http: number; check: string };

/**
 * Records partner API calls as the gateway saw them (a suspended key is refused with 403, a rate-limited
 * key beyond its per-minute allowance with 429), checks each against consent, then scores each partner.
 */
export function recordPartnerCalls(db: Database.Database, calls: NewPartnerCall[], stepId: string) {
  const q = {
    key: db.prepare("SELECT * FROM api_keys WHERE id = ?"),
    recent: db.prepare("SELECT COUNT(*) AS n FROM partner_api_calls WHERE key_id = ? AND ts > ? AND ts <= ? AND status <> 'BLOCKED'"),
    insert: db.prepare("INSERT INTO partner_api_calls VALUES (?,?,?,?,?,?,?,?,?,?)"),
    check: db.prepare("SELECT status FROM partner_call_checks WHERE call_id = ?"),
  };
  return db.transaction(() => {
    const rows: PartnerCallRow[] = [];
    const latest = new Map<string, string>();
    for (const c of [...calls].sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id))) {
      const key = q.key.get(c.key_id) as KeyRow;
      const status = key.status === "SUSPENDED" ? "BLOCKED"
        : key.status === "RATE_LIMITED" && (q.recent.get(key.id, addSeconds(c.ts, -60), c.ts) as { n: number }).n >= RATE_LIMIT_PER_MINUTE ? "RATE_LIMITED" : "ALLOWED";
      q.insert.run(c.id, c.key_id, c.endpoint, c.scope, c.customer_id, c.account_no, c.source_network, c.ts, status, c.scenario_tag);
      rows.push({ ...c, status });
      if ((latest.get(key.partner_id) ?? "") < c.ts) latest.set(key.partner_id, c.ts);
    }
    savePartnerChecks(db, rows);
    const results: PartnerCallResult[] = rows.map((r) => ({ id: r.id, status: r.status, http: HTTP[r.status]!, check: (q.check.get(r.id) as { status: string }).status }));
    const scored = [...latest].sort(([a], [b]) => a.localeCompare(b)).map(([partnerId, ts]) => scorePartner(db, partnerId, ts, stepId));
    return { results, scored };
  })();
}

/** Ingest of partner API calls (POST /api/ingest/partner-calls). Idempotent on call id; never touches the scripted S5 partner. */
export function ingestPartnerCalls(db: Database.Database, events: Omit<NewPartnerCall, "scenario_tag">[]) {
  const q = {
    seen: db.prepare("SELECT 1 FROM partner_api_calls WHERE id = ?"),
    key: db.prepare("SELECT partner_id FROM api_keys WHERE id = ?"),
    customer: db.prepare("SELECT 1 FROM customers WHERE id = ?"),
  };
  const casesBefore = new Set((db.prepare("SELECT id FROM partner_cases").all() as { id: string }[]).map((r) => r.id));
  const duplicates: string[] = [];
  const rejected: { id: string; reason: string }[] = [];
  const accepted: NewPartnerCall[] = [];
  const ids = new Set<string>();
  for (const e of events) {
    if (q.seen.get(e.id) || ids.has(e.id)) { duplicates.push(e.id); continue; }
    const key = q.key.get(e.key_id) as { partner_id: string } | undefined;
    if (!key) { rejected.push({ id: e.id, reason: "unknown API key" }); continue; }
    if (key.partner_id === S5_PARTNER.id || /^PCALL-S5/.test(e.id)) { rejected.push({ id: e.id, reason: "partner is part of scripted scenario S5" }); continue; }
    if (!q.customer.get(e.customer_id)) { rejected.push({ id: e.id, reason: "unknown customer" }); continue; }
    ids.add(e.id);
    accepted.push({ ...e, scenario_tag: "INGEST" });
  }
  const { results, scored } = accepted.length ? recordPartnerCalls(db, accepted, "INGEST") : { results: [], scored: [] };
  return {
    received: events.length, inserted: results.length, duplicates, rejected, calls: results,
    scored: scored.map((s) => ({ partner_id: s.partner_id, ts: s.ts, score: s.score, level: s.level, review_required: s.review.required })),
    cases_opened: (db.prepare("SELECT id FROM partner_cases ORDER BY id").all() as { id: string }[]).map((r) => r.id).filter((id) => !casesBefore.has(id)),
  };
}

// ── Evidence-bound review ────────────────────────────────────────────────────────────────────

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key]!)]));
  return value;
}
const stable = (value: JsonValue) => JSON.stringify(canonical(value));

/** The material a Reviewer sees: the case, key, proposed response and every current risk factor with its calls' consent checks. */
function material(db: Database.Database, subjectId: string): JsonValue {
  const response = db.prepare("SELECT * FROM partner_responses WHERE id = ?").get(subjectId) as ResponseRow | undefined;
  const c = db.prepare("SELECT * FROM partner_cases WHERE id = ?").get(response?.case_id ?? subjectId) as CaseRow | undefined;
  if (!c) throw new AccessError(409, "review material is unavailable", "REVIEW_UNAVAILABLE");
  const key = db.prepare("SELECT id, label, status FROM api_keys WHERE id = ?").get(c.key_id) as JsonValue;
  const signals = (db.prepare("SELECT code, tier, effective_points, call_ids, evidence FROM partner_signals WHERE partner_id = ? AND effective_points > 0 ORDER BY code").all(c.partner_id) as
    { code: string; tier: number; effective_points: number; call_ids: string; evidence: string }[]).map((s) => ({ ...s, call_ids: JSON.parse(s.call_ids) as string[], evidence: JSON.parse(s.evidence) as JsonValue }));
  const callIds = [...new Set(signals.flatMap((s) => s.call_ids))].sort();
  const checks = callIds.length ? db.prepare(`SELECT call_id, status, checks FROM partner_call_checks WHERE call_id IN (${callIds.map(() => "?").join(",")}) ORDER BY call_id`).all(...callIds) as JsonValue[] : [];
  return canonical({
    policy_version: PARTNER_REVIEW_POLICY_VERSION, run_id: currentRunId(db),
    case: { id: c.id, partner_id: c.partner_id, status: c.status, level: c.level, peak_score: c.peak_score },
    key, response: response ? { id: response.id, type: response.type, status: response.status, target: JSON.parse(response.target) as JsonValue } : null,
    signals: signals as unknown as JsonValue, checks,
  } as unknown as JsonValue);
}

export function partnerReviewContext(db: Database.Database, subjectId: string, persist = true) {
  const facts = material(db, subjectId);
  const hash = createHash("sha256").update(stable(facts)).digest("hex");
  const reviewRef = `REV-${hash}`;
  const runId = currentRunId(db);
  if (persist) db.prepare("INSERT OR IGNORE INTO partner_reviews VALUES (?,?,?,?,?)").run(reviewRef, runId, subjectId, stable(facts), clockOf(db));
  const partner = (facts as { case: { partner_id: string } }).case.partner_id;
  const codes = (db.prepare("SELECT code FROM partner_signals WHERE partner_id = ? AND effective_points > 0 ORDER BY code").all(partner) as { code: string }[]).map((r) => r.code);
  return { run_id: runId, review_ref: reviewRef, evidence_codes: codes, policy_version: PARTNER_REVIEW_POLICY_VERSION };
}

function requireReviewedPartner(db: Database.Database, subjectId: string, runId: string, reviewRef: string) {
  if (currentRunId(db) !== runId) throw new AccessError(409, "the reviewed scenario has changed", "RUN_STALE");
  if (!db.prepare("SELECT 1 FROM partner_reviews WHERE review_ref = ? AND run_id = ? AND subject_id = ?").get(reviewRef, runId, subjectId)) throw new AccessError(409, "review the current evidence before deciding", "REVIEW_REQUIRED");
  const current = partnerReviewContext(db, subjectId, false);
  if (current.review_ref !== reviewRef) throw new AccessError(409, "the partner evidence changed; refresh and review it again", "REVIEW_STALE");
  if (!current.evidence_codes.length) throw new AccessError(409, "the response is not currently actionable or its evidence is unavailable", "REVIEW_UNAVAILABLE");
}

/** Independent review: a Reviewer with a staff mapping who is not the partner's relationship owner. */
function requireIndependentPartnerReviewer(db: Database.Database, principal: VerifiedPrincipal, partnerId: string) {
  requireCapability(principal, "DECIDE_INTERVENTION");
  if (!principal.staff_id) throw new AccessError(403, "reviewer staff mapping is required");
  const owner = (db.prepare("SELECT owner_staff_id FROM api_partners WHERE id = ?").get(partnerId) as { owner_staff_id: string } | undefined)?.owner_staff_id;
  if (!owner) throw new AccessError(403, "partner relationship could not be resolved");
  if (owner === principal.staff_id) throw new AccessError(403, "reviewer manages this partner relationship");
}

function staleAudit<T>(db: Database.Database, principal: VerifiedPrincipal, subjectId: string, runId: string, reviewRef: string, serverAt: string | undefined, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof AccessError && ["RUN_STALE", "REVIEW_REQUIRED", "REVIEW_STALE"].includes(String(error.code))) {
      audit(db, clockOf(db), principal.account_id, "DECISION_STALE", "partner_response", subjectId, { run_id: runId, reviewed_ref: reviewRef, reason_code: error.code, server_at: serverAt, simulation: true });
    }
    throw error;
  }
}

/** Approve or reject a proposed "Suspend key". Approval suspends the key; rejection keeps it rate-limited. */
export function decidePartnerResponse(db: Database.Database, principal: VerifiedPrincipal, runId: string, reviewRef: string, responseId: string, decision: "APPROVED" | "REJECTED", note: string | null, serverAt?: string) {
  const r = db.prepare("SELECT * FROM partner_responses WHERE id = ?").get(responseId) as ResponseRow | undefined;
  if (!r) throw new AccessError(403, "partner response could not be resolved");
  return staleAudit(db, principal, responseId, runId, reviewRef, serverAt, () => {
    const ts = clockOf(db);
    db.transaction(() => {
      requireIndependentPartnerReviewer(db, principal, r.partner_id);
      requireReviewedPartner(db, responseId, runId, reviewRef);
      const changed = db.prepare("UPDATE partner_responses SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ? AND status = 'PENDING_APPROVAL'").run(decision, principal.account_id, ts, note, responseId);
      if (changed.changes !== 1) throw new AccessError(409, "this response is not waiting for a decision", "REVIEW_UNAVAILABLE");
      const key = db.prepare("SELECT label FROM api_keys WHERE id = ?").get(r.key_id) as { label: string };
      if (decision === "APPROVED" && r.type === "SUSPEND_KEY") {
        db.prepare("UPDATE api_keys SET status = 'SUSPENDED' WHERE id = ?").run(r.key_id);
        db.prepare("UPDATE partner_cases SET status = 'CONTAINED' WHERE id = ?").run(r.case_id);
      }
      audit(db, ts, principal.account_id, decision === "APPROVED" ? "APPROVE" : "REJECT", "partner_response", responseId, {
        actor_staff_id: principal.staff_id, type: r.type, partner_id: r.partner_id, key_label: key.label, case_id: r.case_id, note, server_at: serverAt, run_id: runId, reviewed_ref: reviewRef, simulation: true,
      });
    })();
    return db.prepare("SELECT id, case_id, type, status, decided_at FROM partner_responses WHERE id = ?").get(responseId);
  });
}

/** "Justified": the Reviewer closes the partner case after review; the key is restored and every response released. */
export function closePartnerCaseJustified(db: Database.Database, principal: VerifiedPrincipal, runId: string, reviewRef: string, caseId: string, note: string, serverAt?: string) {
  const c = db.prepare("SELECT * FROM partner_cases WHERE id = ?").get(caseId) as CaseRow | undefined;
  if (!c) throw new AccessError(403, "partner case could not be resolved");
  return staleAudit(db, principal, caseId, runId, reviewRef, serverAt, () => {
    const ts = clockOf(db);
    db.transaction(() => {
      requireIndependentPartnerReviewer(db, principal, c.partner_id);
      if (!["OPEN", "CONTAINED"].includes(c.status)) throw new AccessError(409, "the partner case is already closed", "REVIEW_UNAVAILABLE");
      requireReviewedPartner(db, caseId, runId, reviewRef);
      db.prepare("UPDATE partner_cases SET status = 'CLOSED_JUSTIFIED', closed_at = ? WHERE id = ?").run(ts, caseId);
      db.prepare("UPDATE api_keys SET status = 'ACTIVE' WHERE id = ?").run(c.key_id);
      db.prepare("UPDATE partner_responses SET status = 'RELEASED', decided_by = COALESCE(decided_by, ?), decided_at = COALESCE(decided_at, ?) WHERE case_id = ? AND status IN ('ACTIVE','PENDING_APPROVAL','APPROVED')").run(principal.account_id, ts, caseId);
      audit(db, ts, principal.account_id, "PARTNER_CASE_JUSTIFIED", "partner_case", caseId, { actor_staff_id: principal.staff_id, partner_id: c.partner_id, note, server_at: serverAt, run_id: runId, reviewed_ref: reviewRef, simulation: true });
    })();
    return db.prepare("SELECT id, status, closed_at FROM partner_cases WHERE id = ?").get(caseId);
  });
}

export function pendingPartnerResponse(db: Database.Database): string | null {
  return (db.prepare("SELECT id FROM partner_responses WHERE status = 'PENDING_APPROVAL' ORDER BY created_at, id LIMIT 1").get() as { id: string } | undefined)?.id ?? null;
}

// ── Read models ──────────────────────────────────────────────────────────────────────────────

const latestScore = (db: Database.Database, partnerId: string) =>
  (db.prepare("SELECT score, level, ts, review_required FROM partner_risk_scores WHERE partner_id = ? ORDER BY id DESC LIMIT 1").get(partnerId) as { score: number; level: string; ts: string; review_required: number } | undefined)
  ?? { score: 0, level: "NORMAL", ts: "", review_required: 0 };

export function partnerList(db: Database.Database, clock: string) {
  const partners = db.prepare("SELECT * FROM api_partners ORDER BY name").all() as { id: string; name: string; partner_type: string; licence_ref: string }[];
  const coverage = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN k.status = 'MATCHED' THEN 1 ELSE 0 END) AS matched FROM partner_api_calls c
    JOIN api_keys a ON a.id = c.key_id JOIN partner_call_checks k ON k.call_id = c.id WHERE a.partner_id = ? AND c.ts > ? AND c.ts <= ?`);
  const today = db.prepare("SELECT COUNT(*) AS n FROM partner_api_calls c JOIN api_keys a ON a.id = c.key_id WHERE a.partner_id = ? AND c.ts >= ? AND c.ts <= ?");
  return partners.map((p) => {
    const key = keyOf(db, p.id);
    const s = latestScore(db, p.id);
    const cov = coverage.get(p.id, addMinutes(clock, -1440), clock) as { total: number; matched: number | null };
    const c = db.prepare("SELECT id, status FROM partner_cases WHERE partner_id = ? ORDER BY id DESC LIMIT 1").get(p.id) as { id: string; status: string } | undefined;
    return {
      partner_id: p.id, partner_name: p.name, partner_type: p.partner_type, licence_ref: p.licence_ref,
      score: s.score, level: s.level, consent_coverage_pct: cov.total ? Math.round((1000 * (cov.matched ?? 0)) / cov.total) / 10 : 100,
      calls_today: (today.get(p.id, `${dateOf(clock)}T00:00:00+01:00`, clock) as { n: number }).n,
      key_label: key.label, key_status: key.status, case_id: c?.id ?? null, case_status: c?.status ?? null,
    };
  });
}

/** Partner cases for the cases list and the console, labelled "Partner". */
export function partnerCaseRows(db: Database.Database) {
  return (db.prepare("SELECT c.*, p.name FROM partner_cases c JOIN api_partners p ON p.id = c.partner_id ORDER BY c.id").all() as (CaseRow & { name: string })[]).map((c) => {
    const s = latestScore(db, c.partner_id);
    return {
      kind: "PARTNER" as const, id: c.id, partner_id: c.partner_id, pseudo_id: c.name, role: `Partner · ${PARTNER_TYPE}`, employment_type: "PARTNER",
      peak_score: c.peak_score, score: s.score, level: s.level, case_status: c.status, opened_at: c.opened_at, href: `/partners/${c.partner_id}`,
      review: { required: !!s.review_required, score_threshold_met: s.score >= 30 }, case_id: c.id, note: null,
    };
  });
}

/** Console decision card for a pending "Suspend key", in the same shape as the staff decision card. */
export function partnerDecisionCard(db: Database.Database) {
  const id = pendingPartnerResponse(db);
  if (!id) return null;
  const r = db.prepare("SELECT r.*, p.name, k.label FROM partner_responses r JOIN api_partners p ON p.id = r.partner_id JOIN api_keys k ON k.id = r.key_id WHERE r.id = ?").get(id) as ResponseRow & { name: string; label: string };
  const s = latestScore(db, r.partner_id);
  const review = partnerReviewContext(db, id);
  return {
    id, kind: "PARTNER" as const, type: r.type, case_id: r.case_id, partner_id: r.partner_id, kicker: "Waiting for your decision",
    title: `Suspend ${r.name}'s API key ${r.label}`,
    subtitle: `Partner · risk score ${s.score} · key rate-limited now; suspension refuses every further call`,
    approve_label: "Approve suspension", approve_path: `/api/partner-responses/${id}/approve`, reject_path: `/api/partner-responses/${id}/reject`,
    ...review, freshness: { score: { snapshot_id: 0, sim_time: s.ts, step_id: null }, evidence: null, score_is_current: true },
  };
}

const CHECK_LABELS: Record<string, [string, string]> = {
  C1: ["Customer consented to this partner", "No consent from this customer for this partner"],
  C2: ["Consent active at the time of the call", "Consent had ended before the call"],
  C3: ["Scope covered by the consent", "Scope not covered by the consent"],
};

export function partnerView(db: Database.Database, partnerId: string) {
  const p = db.prepare("SELECT * FROM api_partners WHERE id = ?").get(partnerId) as { id: string; name: string; partner_type: string; licence_ref: string; onboarded_at: string; status: string } | undefined;
  if (!p) return null;
  const clock = viewClock(db);
  const key = keyOf(db, partnerId);
  const s = latestScore(db, partnerId);
  const c = db.prepare("SELECT * FROM partner_cases WHERE partner_id = ? ORDER BY id DESC LIMIT 1").get(partnerId) as CaseRow | undefined;
  const signals = (db.prepare("SELECT * FROM partner_signals WHERE partner_id = ? ORDER BY first_ts, code").all(partnerId) as { code: keyof typeof SIGNALS; tier: number; points: number; first_ts: string; call_ids: string; evidence: string }[])
    .map((f) => ({ code: f.code, label: SIGNALS[f.code]?.label ?? f.code, tier: f.tier, points: f.points, first_ts: f.first_ts, calls: (JSON.parse(f.call_ids) as string[]).length, evidence: JSON.parse(f.evidence) as Record<string, unknown> }));
  const calls = (db.prepare(`SELECT c.id, c.ts, c.endpoint, c.scope, c.account_no, c.source_network, c.status, k.status AS check_status, k.checks, k.reason
    FROM partner_api_calls c JOIN partner_call_checks k ON k.call_id = c.id WHERE c.key_id = ? AND c.ts <= ? ORDER BY c.ts DESC, c.id DESC LIMIT 60`).all(key.id, clock) as
    { id: string; ts: string; endpoint: string; scope: string; account_no: string; source_network: string; status: string; check_status: string; checks: string; reason: string }[])
    .map((r) => ({
      id: r.id, ts: r.ts, endpoint: r.endpoint, scope: r.scope, customer: mask(r.account_no), network: r.source_network, result: r.status, http: HTTP[r.status]!, check: r.check_status,
      checks: (JSON.parse(r.checks) as { code: string; passed: boolean }[]).map((k) => ({ code: k.code, passed: k.passed, label: CHECK_LABELS[k.code]![k.passed ? 0 : 1] })),
    }));
  const month = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN k.status = 'MATCHED' THEN 1 ELSE 0 END) AS matched FROM partner_api_calls c
    JOIN partner_call_checks k ON k.call_id = c.id WHERE c.key_id = ? AND c.ts <= ?`).get(key.id, clock) as { total: number; matched: number | null };
  const usual = (db.prepare(`SELECT source_network, COUNT(*) AS n FROM partner_api_calls WHERE key_id = ? AND (scenario_tag IS NULL OR scenario_tag <> 'S5') GROUP BY source_network ORDER BY n DESC LIMIT 2`).all(key.id) as { source_network: string }[]).map((r) => r.source_network);
  const responses = c ? (db.prepare("SELECT * FROM partner_responses WHERE case_id = ? ORDER BY id").all(c.id) as ResponseRow[]).map((r) => ({ id: r.id, type: r.type, status: r.status, automatic: !!r.automatic, created_at: r.created_at, decided_at: r.decided_at })) : [];
  const pending = responses.find((r) => r.status === "PENDING_APPROVAL");
  const ids = [partnerId, ...(c ? [c.id] : []), ...responses.map((r) => r.id)];
  const activity = (db.prepare(`SELECT id, ts, actor, action, target_type, target_id FROM audit_log WHERE target_id IN (${ids.map(() => "?").join(",")}) ORDER BY id DESC LIMIT 30`).all(...ids) as { id: number; ts: string; actor: string; action: string; target_type: string; target_id: string }[]);
  const history = (db.prepare("SELECT ts, score, level FROM partner_risk_scores WHERE partner_id = ? AND step_id IS NOT NULL ORDER BY id").all(partnerId) as { ts: string; score: number; level: string }[]);
  const steps = history.filter((h, i) => i === 0 || h.score !== history[i - 1]!.score).slice(-6);
  return {
    partner_id: p.id, partner_name: p.name, partner_type: p.partner_type, licence_ref: p.licence_ref, onboarded_at: p.onboarded_at,
    key: { label: key.label, status: key.status }, score: s.score, level: s.level, review_required: !!s.review_required,
    case: c ? { id: c.id, status: c.status, opened_at: c.opened_at, peak_score: c.peak_score, level: c.level, closed_at: c.closed_at } : null,
    signals, calls,
    flagged_calls: calls.filter((r) => r.check !== "MATCHED"),
    evidence_for: signals.map((f) => ({ code: f.code, label: f.label, points: f.points })),
    evidence_against: [
      `Licensed partner (${p.licence_ref}), onboarded ${p.onboarded_at.slice(0, 10)}`,
      `${month.total ? Math.round((1000 * (month.matched ?? 0)) / month.total) / 10 : 100}% of ${month.total.toLocaleString("en-US")} calls in the last 30 days matched an active consent`,
      `Usual networks: ${usual.join(", ")}`,
      ...(signals.some((f) => f.code === "CALL_OUTSIDE_CONSENT") ? [] : ["No call outside a customer's consent scope"]),
    ],
    responses,
    decision: pending ? { response_id: pending.id, ...partnerReviewContext(db, pending.id) } : null,
    justify: c && ["OPEN", "CONTAINED"].includes(c.status) ? { case_id: c.id, ...partnerReviewContext(db, c.id) } : null,
    activity, score_steps: steps,
  };
}
