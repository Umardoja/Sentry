import "server-only";
import type Database from "better-sqlite3";
import { SIGNALS, type SignalCode } from "../engines/signals";
import { clockOf, pendingDecision, runTracer, waitingForOperatorAction } from "../sim/player";
import { STEPS } from "../sim/scenarios";
import { SCAM_CALLER } from "../sim/generator";
import { liveState } from "../sim/live";
import { formatFull } from "../time";
import { formatSimulatedTime } from "../../shared/time";
import { currentRunId } from "./run";
import { freshness, reviewContext } from "./review";
import { currentReviewDecision } from "./riskReview";

type Row = Record<string, unknown>;
const naira = (n: number) => `₦${n.toLocaleString("en-US")}`;
const one = <T = Row>(db: Database.Database, sql: string, ...a: unknown[]) => db.prepare(sql).get(...a) as T | undefined;
const all = <T = Row>(db: Database.Database, sql: string, ...a: unknown[]) => db.prepare(sql).all(...a) as T[];
const get = (db: Database.Database, key: string) => one<{ value: string }>(db, "SELECT value FROM sim_state WHERE key = ?", key)?.value;

/** Scenario clock, or the live clock when live activity has run ahead of it. */
function viewClock(db: Database.Database) {
  const clock = clockOf(db);
  const live = liveState(db).clock;
  return live && live > clock ? live : clock;
}

/** Every purpose status except MATCHED, spelled out so SQLite can use the purpose_results(status) index. */
const NOT_MATCHED = "('PARTIAL','NO_MATCH','WRONG_BENEFICIARY','DUPLICATE','NO_CASE')";

const PURPOSE_LABEL: Record<string, string> = {
  MATCHED: "Matched", WRONG_BENEFICIARY: "Credited to someone else", NO_CASE: "No case", PARTIAL: "Partial", DUPLICATE: "Duplicate",
};
const purposeLabel = (status: string, type: string) => (status === "NO_MATCH" ? (type === "REVERSAL" ? "No failed transaction" : "No approved ticket") : PURPOSE_LABEL[status] ?? status);
const ACTION_LABEL: Record<string, string> = {
  REVERSAL: "Reversal", RECORD_VIEW: "Record view", BULK_EXPORT: "Bulk export", LIMIT_CHANGE: "Limit change", MANUAL_POSTING: "Manual posting", PRIV_ACCESS: "Privileged access",
};
export const ROLE_LABEL: Record<string, string> = {
  OPS_REVERSALS: "Operations, reversals", OPS_EPRODUCTS: "Operations, e-products", CUSTOMER_SERVICE: "Customer service",
  IT_ADMIN: "IT administration", BRANCH_OPS: "Branch operations", INTERNAL_CONTROL: "Internal Control", AI_AGENT: "AI agent",
};

export function latestScore(db: Database.Database, staffId: string) {
  return one<{ score: number; raw_score: number; level: string; ts: string; breakdown: string }>(db, "SELECT * FROM risk_scores WHERE staff_id = ? ORDER BY id DESC LIMIT 1", staffId) ?? { score: 0, raw_score: 0, level: "NORMAL", ts: "", breakdown: "{}" };
}

function staffCard(db: Database.Database, staffId: string) {
  const s = one<{ id: string; pseudo_id: string; role: string; employment_type: string; name: string }>(db, "SELECT * FROM staff WHERE id = ?", staffId)!;
  const sc = latestScore(db, staffId);
  return { staff_id: s.id, pseudo_id: s.pseudo_id, role: ROLE_LABEL[s.role] ?? s.role, employment_type: s.employment_type, score: sc.score, raw_score: sc.raw_score, level: sc.level, review: currentReviewDecision(db, staffId) };
}

/**
 * Everything the counters depend on, from tables that stay small. Cheap enough
 * (~4 ms) to run on every poll; `metrics` recomputes only when it changes.
 */
function metricsKey(db: Database.Database): string {
  const k = one<Record<string, unknown>>(db, `SELECT (SELECT value FROM sim_state WHERE key = 'clock') clock,
    (SELECT COALESCE(MAX(id), 0) FROM risk_scores) rs,
    (SELECT COUNT(*) FROM cases) cases,
    (SELECT COUNT(*) FROM interventions) ints,
    (SELECT COUNT(*) FROM interventions WHERE status = 'APPROVED') approved,
    (SELECT COUNT(*) FROM outbound_transfers WHERE status = 'BLOCKED_BY_HOLD') blocked,
    (SELECT COUNT(*) FROM bvn_watchlist WHERE status = 'ACTIVE') watchlisted,
    (SELECT value FROM sim_state WHERE key = 'live_state') live`);
  return JSON.stringify(k);
}

type Metrics = ReturnType<typeof computeMetrics>;
const metricsHolder = globalThis as unknown as {
  sentryMetrics?: WeakMap<Database.Database, { key: string; value: Metrics }>;
  sentryConsole?: WeakMap<Database.Database, Map<string, ReturnType<typeof buildConsoleView>>>;
};

/** Dropped on reset, so a fresh database never reads a previous run's counters. */
export function clearMetricsCache(): void {
  metricsHolder.sentryMetrics = new WeakMap();
  metricsHolder.sentryConsole = new WeakMap();
}

/** Counters for the console and the metrics page, cached until the demo moves on. */
export function metrics(db: Database.Database): Metrics {
  const key = metricsKey(db);
  const cache = (metricsHolder.sentryMetrics ??= new WeakMap());
  const hit = cache.get(db);
  if (hit && hit.key === key) return hit.value;
  const value = computeMetrics(db);
  cache.set(db, { key, value });
  return value;
}

function computeMetrics(db: Database.Database) {
  const clock = viewClock(db);
  const n = (sql: string, ...a: unknown[]) => (one<{ n: number }>(db, sql, ...a)?.n ?? 0);
  const cases = all<{ id: string; staff_id: string }>(db, "SELECT id, staff_id FROM cases");
  const trueCases = cases.filter((c) => n("SELECT COUNT(*) n FROM sensitive_actions WHERE staff_id = ? AND is_malicious = 1", c.staff_id) > 0).length;
  const held = all<{ target: string }>(db, "SELECT target FROM interventions WHERE type = 'HOLD_FUNDS' AND status = 'APPROVED'").reduce((s, r) => s + Number((JSON.parse(r.target) as { amount: number }).amount), 0);
  // Live activity changes these counts on every refresh, so neither may scan the
  // ~181k-row baseline: each is the table total (a b-tree count, or the status
  // index) minus the few rows dated after the clock (CROSS JOIN keeps the ts index driving).
  const later = (status: string) => `SELECT COUNT(*) FROM sensitive_actions a CROSS JOIN purpose_results p ON p.action_id = a.id WHERE a.ts > ? ${status}`;
  const checked = n(`SELECT (SELECT COUNT(*) FROM purpose_results) - (${later("")}) n`, clock);
  const notMatched = n(`SELECT (SELECT COUNT(*) FROM purpose_results WHERE status IN ${NOT_MATCHED}) - (${later(`AND p.status IN ${NOT_MATCHED}`)}) n`, clock);
  return {
    actions_checked: checked,
    actions_matched: checked - notMatched,
    unusual_cleared: n("SELECT COUNT(*) n FROM risk_scores WHERE raw_score >= 15 AND score < 15"),
    cases_opened: cases.length,
    true_cases: trueCases,
    false_alerts: cases.length - trueCases,
    funds_held_naira: held,
    transfers_blocked: n("SELECT COUNT(*) n FROM outbound_transfers WHERE status = 'BLOCKED_BY_HOLD'"),
    bvns_watchlisted: n("SELECT COUNT(*) n FROM bvn_watchlist WHERE status = 'ACTIVE'"),
  };
}

function decisionCard(db: Database.Database) {
  const id = pendingDecision(db);
  if (!id) return null;
  const i = one<{ id: string; type: string; case_id: string; staff_id: string; target: string; created_at: string }>(db, "SELECT * FROM interventions WHERE id = ?", id)!;
  const s = staffCard(db, i.staff_id);
  const target = JSON.parse(i.target) as { accounts?: string[]; amount?: number; sessions?: string[] };
  const review = reviewContext(db, id);
  const fresh = freshness(db, i.staff_id);
  if (i.type === "HOLD_FUNDS") {
    const bvns = new Set(all<{ bvn_hash: string }>(db, `SELECT c.bvn_hash FROM accounts a JOIN customers c ON c.id = a.customer_id WHERE a.id IN (${(target.accounts ?? []).map(() => "?").join(",")})`, ...(target.accounts ?? [])).map((r) => r.bvn_hash)).size;
    const until = formatFull(addDay(i.created_at)).replace(" 2026 ·", ",");
    return {
      id, type: i.type, case_id: i.case_id, kicker: "Waiting for your decision",
      title: `Hold ${naira(target.amount ?? 0)} and put ${bvns} BVNs on the CBN 24-hour watchlist`,
      subtitle: `Credits from ${(target.accounts ?? []).length} unmatched reversals by ${s.pseudo_id} · watchlist until ${until}`,
      approve_label: "Approve hold", ...review, freshness: fresh,
    };
  }
  return {
    id, type: i.type, case_id: i.case_id, kicker: "Waiting for your decision",
    title: `Suspend ${s.pseudo_id}'s session`,
    subtitle: `Score ${s.score} · Contain · suspends the active session until reviewed`,
    approve_label: "Approve suspension", ...review, freshness: fresh,
  };
}

function addDay(ts: string) {
  const d = new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(5, 7) - 1, +ts.slice(8, 10) + 1));
  return `${d.toISOString().slice(0, 10)}${ts.slice(10)}`;
}

function stepDelta(db: Database.Database, staffId: string, ts: string) {
  const row = one<{ id: number; score: number }>(db, "SELECT id, score FROM risk_scores WHERE staff_id = ? AND ts = ? AND step_id LIKE 'S_._' ORDER BY id DESC LIMIT 1", staffId, ts);
  if (!row) return 0;
  const prev = one<{ score: number }>(db, "SELECT score FROM risk_scores WHERE staff_id = ? AND id < ? ORDER BY id DESC LIMIT 1", staffId, row.id);
  return row.score - (prev?.score ?? 0);
}

export function feed(db: Database.Database, limit = 8, flaggedOnly = false) {
  const clock = viewClock(db);
  // Every group shares one timestamp (a.ts is in the GROUP BY), so the newest
  // `limit` timestamps always contain the newest `limit` groups. Narrowing to
  // that window first keeps the result identical but stops SQLite grouping the
  // whole 30-day baseline (~181k rows) to return 8 of them.
  const flagged = flaggedOnly ? "AND p.status <> 'MATCHED'" : "";
  const since = one<{ ts: string }>(db, `
    SELECT MIN(ts) ts FROM (
      SELECT DISTINCT a.ts FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id
      WHERE a.ts <= ? ${flagged} ORDER BY a.ts DESC LIMIT ?
    )`, clock, limit)?.ts;
  const actions = since === undefined || since === null ? [] : all<{ staff_id: string; pseudo_id: string; ts: string; action_type: string; status: string; n: number; amount: number | null; purpose: string; first_id: string }>(db, `
    SELECT a.staff_id, s.pseudo_id, a.ts, a.action_type, p.status, COUNT(*) n, SUM(a.amount) amount, MIN(a.id) first_id
    FROM sensitive_actions a JOIN staff s ON s.id = a.staff_id JOIN purpose_results p ON p.action_id = a.id
    WHERE a.ts <= ? AND a.ts >= ? ${flagged}
    GROUP BY a.staff_id, a.ts, a.action_type, p.status, CASE WHEN a.scenario_tag IS NULL THEN a.id ELSE a.scenario_tag END
    ORDER BY a.ts DESC, first_id DESC LIMIT ?`, clock, since, limit);
  const answers = all<{ staff_id: string; pseudo_id: string; ts: string; ticket_ref: string; valid: number; failed_checks: string }>(db, "SELECT t.*, s.pseudo_id FROM ticket_answers t JOIN staff s ON s.id = t.staff_id WHERE t.ts <= ?", clock);
  const rows = [
    ...actions.map((a) => ({
      key: `${a.first_id}`, ts: a.ts, time: a.ts.slice(11, 16), staff_id: a.staff_id, pseudo_id: a.pseudo_id,
      action: a.n > 1 ? `${ACTION_LABEL[a.action_type]} batch (${a.n})` : ACTION_LABEL[a.action_type] ?? a.action_type,
      amount: a.amount, purpose: a.status, purpose_label: purposeLabel(a.status, a.action_type), ok: a.status === "MATCHED",
      points: a.status === "MATCHED" ? 0 : stepDelta(db, a.staff_id, a.ts), highlight: a.status !== "MATCHED",
    })),
    ...answers.map((t) => ({
      key: `ans-${t.ts}`, ts: t.ts, time: t.ts.slice(11, 16), staff_id: t.staff_id, pseudo_id: t.pseudo_id, action: `Ticket answer ${t.ticket_ref}`, amount: null,
      purpose: t.valid ? "MATCHED" : "INVALID", purpose_label: t.valid ? "Ticket valid" : (JSON.parse(t.failed_checks) as string[]).includes("T1") ? "Ticket not found" : "Ticket does not check out",
      ok: !!t.valid, points: t.valid ? 0 : stepDelta(db, t.staff_id, t.ts), highlight: !t.valid,
    })),
  ].sort((a, b) => b.ts.localeCompare(a.ts) || b.key.localeCompare(a.key)).slice(0, limit);
  if (rows[0]) rows.forEach((r, i) => (r.highlight = i === 0 && r.highlight));
  return rows;
}

export function topRisk(db: Database.Database, limit = 3) {
  return all<{ staff_id: string }>(db, `SELECT r.staff_id FROM risk_scores r JOIN (SELECT staff_id, MAX(id) id FROM risk_scores GROUP BY staff_id) m ON m.id = r.id
    ORDER BY r.score DESC, r.staff_id LIMIT ?`, limit).map((r) => {
    const c = staffCard(db, r.staff_id);
    const caseRow = one<{ id: string }>(db, "SELECT id FROM cases WHERE staff_id = ?", r.staff_id);
    return { ...c, case_id: caseRow?.id ?? null, note: c.raw_score >= 15 && c.score < 15 ? `Raw ${c.raw_score} · cleared by approved overtime` : null };
  });
}

export function simState(db: Database.Database) {
  const clock = clockOf(db);
  const index = Number(get(db, "step_index") ?? "0");
  const current = STEPS[Math.max(0, index - 1)];
  const next = STEPS[index];
  return {
    run_id: currentRunId(db), clock, clock_label: formatFull(clock), step_index: index, total_steps: STEPS.length,
    scenario: index === 0 ? "Ready · normal Friday evening" : current!.scenario, next_step_label: next ? `${next.id} · ${next.label}` : null,
    waiting_for_intervention_id: pendingDecision(db), waiting_for_operator_action_id: waitingForOperatorAction(db), focus: get(db, "focus") ?? "/", toast: get(db, "toast") || null, last_step: get(db, "last_step") ?? null,
    note_mode: "Template",
  };
}

function liveView(db: Database.Database) {
  const s = liveState(db);
  return { enabled: s.enabled, clock: s.clock, clock_label: s.clock ? formatFull(s.clock) : null, totals: s.totals, last: s.last };
}

function buildConsoleView(db: Database.Database, flaggedOnly: boolean) {
  const m = metrics(db);
  return { state: simState(db), live: liveView(db), feed: feed(db, 8, flaggedOnly), flagged: one<{ n: number }>(db, `SELECT COUNT(*) n FROM purpose_results p CROSS JOIN sensitive_actions a ON a.id = p.action_id WHERE p.status IN ${NOT_MATCHED} AND a.ts <= ? AND a.scenario_tag IS NOT NULL`, viewClock(db))!.n, top_risk: topRisk(db), decision: decisionCard(db), metrics: m };
}

function consoleKey(db: Database.Database, flaggedOnly: boolean): string {
  const version = one<Record<string, unknown>>(db, `SELECT
    (SELECT value FROM sim_state WHERE key = 'clock') clock,
    (SELECT value FROM sim_state WHERE key = 'step_index') step_index,
    (SELECT value FROM sim_state WHERE key = 'last_step') last_step,
    (SELECT value FROM sim_state WHERE key = 'toast') toast,
    (SELECT COALESCE(MAX(id), 0) FROM risk_scores) score_id,
    (SELECT COALESCE(MAX(id), 0) FROM evidence_evaluations) evidence_id,
    (SELECT COUNT(*) FROM ticket_answers) answers,
    (SELECT COUNT(*) FROM cases) cases,
    (SELECT COUNT(*) FROM interventions) interventions,
    (SELECT COUNT(*) FROM interventions WHERE status <> 'PENDING_APPROVAL') decisions,
    (SELECT value FROM sim_state WHERE key = 'live_state') live`);
  return `${flaggedOnly ? 1 : 0}:${JSON.stringify(version)}`;
}

/** Per-workspace console projection, reused until material simulator state changes. */
export function consoleView(db: Database.Database, flaggedOnly = false) {
  const key = consoleKey(db, flaggedOnly);
  const byDb = (metricsHolder.sentryConsole ??= new WeakMap());
  let cache = byDb.get(db);
  if (!cache) { cache = new Map(); byDb.set(db, cache); }
  const hit = cache.get(key);
  if (hit) return hit;
  const value = buildConsoleView(db, flaggedOnly);
  cache.clear();
  cache.set(key, value);
  return value;
}

const LEVEL_FROM = (score: number) => (score >= 80 ? "CONTAIN" : score >= 60 ? "HOLD" : score >= 30 ? "VERIFY" : score >= 15 ? "WATCH" : "NORMAL");

export function caseList(db: Database.Database) {
  return all<{ id: string; staff_id: string; status: string; peak_score: number; level: string; opened_at: string }>(db, "SELECT * FROM cases ORDER BY id").map((c) => ({
    ...c, ...staffCard(db, c.staff_id), case_status: c.status,
  }));
}

export function caseView(db: Database.Database, id: string, revealName = false) {
  const c = one<{ id: string; staff_id: string; opened_at: string; status: string; peak_score: number; level: string; unmasked: number }>(db, "SELECT * FROM cases WHERE id = ?", id);
  if (!c) return null;
  const staff = one<{ id: string; name: string; pseudo_id: string; role: string; employment_type: string; usual_terminal_ids: string }>(db, "SELECT * FROM staff WHERE id = ?", c.staff_id)!;
  const score = latestScore(db, c.staff_id);
  const timeline = all<{ ts: string; score: number; level: string; step_id: string }>(db, "SELECT ts, score, level, step_id FROM risk_scores WHERE staff_id = ? AND step_id LIKE 'S_._' AND score > 0 ORDER BY id", c.staff_id)
    .filter((p, i, arr) => i === arr.length - 1 || p.ts !== arr[i + 1]!.ts);
  const signals = all<{ code: SignalCode; tier: number; points: number; effective_points: number; waived: number; first_ts: string; action_ids: string }>(db, "SELECT * FROM signals WHERE staff_id = ? ORDER BY first_ts", c.staff_id)
    .map((s) => ({ code: s.code, label: SIGNALS[s.code]?.label ?? s.code, tier: s.tier, points: s.points, effective_points: s.effective_points, waived: !!s.waived, first_ts: s.first_ts, action_ids: JSON.parse(s.action_ids) as string[] }));
  const failedAction = one<{ id: string; ts: string; amount: number | null; action_type: string; checks: string; status: string }>(db, `SELECT a.id, a.ts, a.amount, a.action_type, p.checks, p.status FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id
    WHERE a.staff_id = ? AND a.scenario_tag IS NOT NULL AND a.action_type = 'REVERSAL' AND p.status <> 'MATCHED' ORDER BY a.ts, a.id LIMIT 1`, c.staff_id);
  const interventions = all<{ id: string; type: string; status: string; automatic: number; created_at: string; decided_by: string | null; decided_at: string | null; target: string }>(db, "SELECT * FROM interventions WHERE case_id = ? ORDER BY id", id);
  const contactTasks = interventions.filter((i) => i.type === "CONTACT_BVN_OWNER").length;
  const note = one<{ version: number; source: string; sentences: string; created_at: string }>(db, "SELECT * FROM case_notes WHERE case_id = ? ORDER BY version DESC LIMIT 1", id);
  const activity = [
    ...all<{ ts: string; terminal_id: string }>(db, "SELECT ts, terminal_id FROM logins WHERE staff_id = ? AND scenario_tag IS NOT NULL", c.staff_id).map((l) => ({ ts: l.ts, text: `Login from terminal ${l.terminal_id}${JSON.parse(staff.usual_terminal_ids).includes(l.terminal_id) ? "" : " (never used by this user)"}`, chip: null as string | null })),
    ...all<{ ts: string; action_type: string; n: number; status: string; pstatus: string; detail: string | null; amount: number | null }>(db, `SELECT a.ts, a.action_type, COUNT(*) n, a.status, p.status pstatus, a.detail, SUM(a.amount) amount FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id
      WHERE a.staff_id = ? AND a.scenario_tag IS NOT NULL GROUP BY a.ts, a.action_type ORDER BY a.ts`, c.staff_id).map((a) => {
      let text = `${a.n} ${ACTION_LABEL[a.action_type]?.toLowerCase()}${a.n > 1 ? "s" : ""}`;
      if (a.action_type === "RECORD_VIEW") text = `${a.n} customer records viewed${a.pstatus === "NO_CASE" ? ", no open case" : ""}`;
      if (a.action_type === "BULK_EXPORT") text = `Bulk export of ${(JSON.parse(a.detail ?? "{}") as { rows?: number }).rows?.toLocaleString("en-US")} customer rows${a.pstatus === "NO_MATCH" ? ", no approved ticket" : ""}`;
      if (a.action_type === "REVERSAL") text = `${a.n} reversal${a.n > 1 ? "s" : ""} of real failed debits (${naira(a.amount ?? 0)}), ${a.pstatus === "MATCHED" ? "returned to the customer" : "credited to someone else"}`;
      return { ts: a.ts, text, chip: a.status === "BLOCKED" ? "Blocked" : null };
    }),
  ].sort((a, b) => a.ts.localeCompare(b.ts));
  const leave = one(db, "SELECT start_date, end_date FROM leave WHERE staff_id = ? AND start_date <= '2026-10-16' AND end_date >= '2026-10-16'", c.staff_id) as { start_date: string; end_date: string } | undefined;
  const newTerminal = activity.find((a) => a.text.includes("never used"));
  const pending = interventions.find((i) => i.status === "PENDING_APPROVAL");
  const answer = one<{ ticket_ref: string; valid: number; failed_checks: string; purpose_status: string }>(db, "SELECT t.*, p.status purpose_status FROM ticket_answers t JOIN purpose_results p ON p.action_id = t.action_id WHERE t.staff_id = ? ORDER BY t.ts DESC, t.id DESC LIMIT 1", c.staff_id);
  const asked = interventions.some((i) => i.type === "REQUEST_REASON");
  return {
    id: c.id, run_id: currentRunId(db), status: c.status, opened_at: c.opened_at, peak_score: c.peak_score, case_level: c.level,
    staff: { staff_id: staff.id, pseudo_id: staff.pseudo_id, role: ROLE_LABEL[staff.role], employment_type: staff.employment_type, name: revealName ? staff.name : null },
    badges: [staff.employment_type === "CONTRACTOR" ? "Contractor" : "Employee", ...(leave ? [`On approved leave · ${+leave.start_date.slice(8)} to ${+leave.end_date.slice(8)} Oct`] : []), ...(newTerminal ? [`Never-used terminal · ${newTerminal.text.split(" ")[3]}`] : [])],
    score: score.score, level: score.level || LEVEL_FROM(score.score), review: currentReviewDecision(db, c.staff_id), freshness: freshness(db, c.staff_id),
    banner: pending ? (pending.type === "HOLD_FUNDS" ? "Hold · funds hold waiting for your approval" : "Contain · session suspension waiting for your approval") : null,
    banner_level: pending?.type === "HOLD_FUNDS" ? "HOLD" : "CONTAIN",
    timeline: timeline.map((p) => ({ time: p.ts, score: p.score, level: p.level })),
    signals,
    purpose: failedAction ? { title: `${ACTION_LABEL[failedAction.action_type]} of ${naira(failedAction.amount ?? 0)} · ${formatSimulatedTime(failedAction.ts)}`, checks: JSON.parse(failedAction.checks) as { code: string; passed: boolean; detail: string }[] } : null,
    activity: activity.map((a) => ({ ...a, time: a.ts })),
    interventions: interventions.filter((i) => i.type !== "CONTACT_BVN_OWNER").map((i) => ({ ...i, automatic: !!i.automatic, target: JSON.parse(i.target), decided_time: i.decided_at, ...(i.status === "PENDING_APPROVAL" ? reviewContext(db, i.id) : {}) })),
    contact_tasks: contactTasks,
    watchlist: all(db, "SELECT * FROM bvn_watchlist WHERE case_id = ?", id).length,
    note: note ? { version: note.version, source: note.source, sentences: JSON.parse(note.sentences) as { text: string; evidence: string[] }[] } : null,
    prompt: asked ? { ticket_ref: answer?.ticket_ref ?? null, valid: answer ? !!answer.valid : null, message: answer ? (!answer.valid ? ((JSON.parse(answer.failed_checks) as string[]).includes("T1") ? "Ticket not found" : "Ticket does not check out") : answer.purpose_status === "MATCHED" ? "Ticket verified. Purpose evidence matched." : answer.purpose_status === "WRONG_BENEFICIARY" ? "Ticket verified. Destination mismatch remains. Review still required." : "Ticket verified. Independent purpose concerns remain. Review still required.") : "Waiting for the employee's answer" } : null,
    has_graph: !!one(db, "SELECT 1 FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id WHERE a.staff_id = ? AND a.credit_account_id IS NOT NULL AND p.status <> 'MATCHED'", c.staff_id),
  };
}

export function graphView(db: Database.Database, caseId: string) {
  const c = one<{ staff_id: string }>(db, "SELECT staff_id FROM cases WHERE id = ?", caseId);
  if (!c) return null;
  const staff = one<{ pseudo_id: string; usual_terminal_ids: string }>(db, "SELECT * FROM staff WHERE id = ?", c.staff_id)!;
  const clock = clockOf(db);
  const accounts = all<{ id: string; account_no: string; opened_at: string; amount: number; bvn_hash: string; ts: string }>(db, `SELECT ac.id, ac.account_no, ac.opened_at, SUM(a.amount) amount, cu.bvn_hash, MIN(a.ts) ts
    FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id JOIN accounts ac ON ac.id = a.credit_account_id JOIN customers cu ON cu.id = ac.customer_id
    WHERE a.staff_id = ? AND p.status <> 'MATCHED' GROUP BY ac.id ORDER BY ac.id`, c.staff_id);
  const watch = new Set(all<{ account_id: string }>(db, "SELECT account_id FROM bvn_watchlist WHERE case_id = ? AND status = 'ACTIVE'", caseId).map((r) => r.account_id));
  const transfers = all<{ from_account_id: string; to_bank: string; amount: number; status: string; to_account_no: string }>(db, `SELECT * FROM outbound_transfers WHERE from_account_id IN (${accounts.map(() => "?").join(",") || "''"}) ORDER BY id`, ...accounts.map((a) => a.id));
  const banks = [...new Set(transfers.map((t) => t.to_bank))].map((bank) => {
    const rows = transfers.filter((t) => t.to_bank === bank);
    return { bank, accounts: new Set(rows.map((r) => r.to_account_no)).size, total: rows.reduce((s, r) => s + r.amount, 0), blocked: rows.every((r) => r.status === "BLOCKED_BY_HOLD"), from: [...new Set(rows.map((r) => r.from_account_id))] };
  });
  const hold = one<{ status: string; created_at: string }>(db, "SELECT status, created_at FROM interventions WHERE case_id = ? AND type = 'HOLD_FUNDS'", caseId);
  const left = transfers.filter((t) => t.status === "SENT").reduce((s, t) => s + t.amount, 0);
  const held = hold?.status === "APPROVED" ? accounts.reduce((s, a) => s + a.amount, 0) : 0;
  const expiresIn = hold?.status === "APPROVED" ? Math.max(0, 24 * 60 - minutesSince(hold.created_at, clock)) : null;
  return {
    staff: { pseudo_id: staff.pseudo_id, terminal: (JSON.parse(staff.usual_terminal_ids) as string[])[0] ?? "", credits: accounts.length },
    accounts: accounts.map((a) => ({ id: a.id, masked: `••••${a.account_no.slice(-4)}`, opened: a.opened_at.slice(0, 10), age_days: Math.floor(minutesSince(a.opened_at, a.ts) / 1440), amount: a.amount, watchlisted: watch.has(a.id), banks: banks.filter((b) => b.from.includes(a.id)).map((b) => b.bank) })),
    banks,
    total_attempted: transfers.reduce((s, t) => s + t.amount, 0),
    transfers_blocked: transfers.filter((t) => t.status === "BLOCKED_BY_HOLD").length,
    held, left_bank: left, watchlisted: watch.size,
    watchlist_remaining: expiresIn === null ? null : `${Math.floor(expiresIn / 60)}h ${String(expiresIn % 60).padStart(2, "0")}m`,
  };
}

function minutesSince(from: string, to: string) {
  const m = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)) / 60000;
  return m(to) - m(from);
}

export function staffView(db: Database.Database, staffId: string) {
  const s = one<{ id: string; pseudo_id: string; role: string; employment_type: string; usual_terminal_ids: string }>(db, "SELECT * FROM staff WHERE id = ?", staffId);
  if (!s) return null;
  const sc = latestScore(db, staffId);
  const days = all<{ ts: string; score: number; level: string }>(db, "SELECT ts, score, level FROM risk_scores WHERE staff_id = ? AND ts >= '2026-10-12' ORDER BY id", staffId);
  const monday = one<{ n: number }>(db, "SELECT COUNT(*) n FROM sensitive_actions WHERE staff_id = ? AND substr(ts,1,10) = '2026-10-12' AND action_type = 'REVERSAL'", staffId)!.n;
  const mondayMatched = one<{ n: number }>(db, "SELECT COUNT(*) n FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id WHERE a.staff_id = ? AND substr(a.ts,1,10) = '2026-10-12' AND a.action_type = 'REVERSAL' AND p.status = 'MATCHED'", staffId)!.n;
  const stats = JSON.parse(get(db, "peer_stats") ?? "{}") as Record<string, Record<string, { mean: number }>>;
  const roster = one<{ shift_start: string; shift_end: string }>(db, "SELECT * FROM roster WHERE staff_id = ? ORDER BY date DESC LIMIT 1", staffId);
  const caseRow = one<{ id: string }>(db, "SELECT id FROM cases WHERE staff_id = ?", staffId);
  return {
    staff_id: s.id, pseudo_id: s.pseudo_id, role: ROLE_LABEL[s.role], employment_type: s.employment_type, score: sc.score, level: sc.level,
    usual_terminal: (JSON.parse(s.usual_terminal_ids) as string[])[0] ?? null, roster: roster ? `${roster.shift_start} to ${roster.shift_end} weekdays` : null,
    case_id: caseRow?.id ?? null,
    week: days.map((d) => ({ label: `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(+d.ts.slice(0, 4), +d.ts.slice(5, 7) - 1, +d.ts.slice(8, 10))).getUTCDay()]} ${+d.ts.slice(8, 10)} ${d.ts.slice(11, 16) === "23:59" ? "" : d.ts.slice(11, 16)}`.trim(), score: d.score, level: d.level })),
    monday: { reversals: monday, matched_pct: monday ? Math.round((mondayMatched / monday) * 100) : 0, peer_avg: Math.round(stats[s.role]?.REVERSAL?.mean ?? 0) },
  };
}

export function tracerView(db: Database.Database, caller = SCAM_CALLER) {
  const r = runTracer(db, caller, clockOf(db), false);
  const common = r.common_viewer_ids[0];
  const focus = common ? { ...staffCard(db, common), case_id: one<{ id: string }>(db, "SELECT id FROM cases WHERE staff_id = ?", common)?.id ?? null } : null;
  const others = r.viewers.filter((v) => !v.is_common).length;
  return { ...r, focus, summary: common ? `1 staff member viewed all ${r.reports.length} victims` : "No common viewer", others };
}

export function auditView(db: Database.Database, limit = 20) {
  return all<{ id: number; ts: string; actor: string; action: string; target_type: string; target_id: string; detail: string }>(db, "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", limit).map((row) => ({
    ...row,
    detail: redactAuditDetail(JSON.parse(row.detail) as Record<string, unknown>),
  }));
}

function redactAuditDetail(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditDetail);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    /name|phone|account_no|bvn_hash/i.test(key) ? "[REDACTED]" : redactAuditDetail(item),
  ]));
}

export function operatorActions(db: Database.Database, staffId: string) {
  const runId = currentRunId(db);
  return all<{ id: string; ts: string; action_type: string; amount: number | null; purpose_status: string; checks: string }>(db, `SELECT a.id, a.ts, a.action_type, a.amount, p.status purpose_status, p.checks
    FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id
    WHERE a.staff_id = ? AND a.scenario_tag IS NOT NULL ORDER BY a.ts DESC, a.id DESC LIMIT 50`, staffId)
    .map((row) => ({ ...row, run_id: runId, checks: JSON.parse(row.checks) }));
}
