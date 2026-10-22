import "server-only";
import type Database from "better-sqlite3";
import { addMinutes, dateOf, toMinutes, weekday } from "../time";
import { forEachChunk } from "./pipeline";
import { levelFor, points, type Level, type PartnerSignalCode } from "./signals";

/** Partner reason check: every call must match an active consent for that customer, partner and scope. */
export type PartnerCheckStatus = "MATCHED" | "OUTSIDE_CONSENT" | "CONSENT_ENDED";
export type PartnerCheck = { code: "C1" | "C2" | "C3"; passed: boolean; detail: string };
export type PartnerCallRow = { id: string; key_id: string; endpoint: string; scope: string; customer_id: string; account_no: string; source_network: string; ts: string; status: string };
type ConsentRow = { id: string; scopes: string; granted_at: string; expires_at: string; revoked_at: string | null };

export const PARTNER_REVIEW_POLICY_VERSION = "partner-review-v1";
const LOOKUP = "POST /payments/name-enquiry";
const PAYMENT = "POST /payments";
const WINDOW = 60;

export function partnerConsentEngine(db: Database.Database) {
  const q = {
    partner: db.prepare("SELECT partner_id FROM api_keys WHERE id = ?"),
    consents: db.prepare("SELECT id, scopes, granted_at, expires_at, revoked_at FROM customer_consents WHERE partner_id = ? AND customer_id = ? ORDER BY granted_at DESC, id"),
  };
  const partnerOf = new Map<string, string>();
  function check(call: PartnerCallRow): { call_id: string; status: PartnerCheckStatus; checks: PartnerCheck[]; reason: string } {
    if (!partnerOf.has(call.key_id)) partnerOf.set(call.key_id, (q.partner.get(call.key_id) as { partner_id: string }).partner_id);
    const consents = q.consents.all(partnerOf.get(call.key_id)!, call.customer_id) as ConsentRow[];
    const ended = (c: ConsentRow) => !!c.revoked_at && c.revoked_at <= call.ts ? `revoked ${c.revoked_at.slice(0, 10)}` : c.expires_at <= call.ts ? `expired ${c.expires_at.slice(0, 10)}` : null;
    const active = consents.filter((c) => c.granted_at <= call.ts && !ended(c));
    const scoped = active.find((c) => (JSON.parse(c.scopes) as string[]).includes(call.scope));
    const checks: PartnerCheck[] = [
      { code: "C1", passed: consents.length > 0, detail: consents.length ? `Consent ${consents[0]!.id} on record` : "No consent from this customer for this partner" },
      { code: "C2", passed: active.length > 0, detail: active.length ? "Consent active at the time of the call" : consents.length ? `Consent ${ended(consents[0]!) ?? "not yet granted"}` : "Not checked" },
      { code: "C3", passed: !!scoped, detail: scoped ? `Scope "${call.scope}" granted` : active.length ? `Scope "${call.scope}" not granted` : "Not checked" },
    ];
    const status: PartnerCheckStatus = scoped ? "MATCHED" : consents.length && !active.length ? "CONSENT_ENDED" : "OUTSIDE_CONSENT";
    return { call_id: call.id, status, checks, reason: status === "MATCHED" ? "Call matches an active consent" : checks.find((c) => !c.passed)!.detail };
  }
  return { check };
}

export function savePartnerChecks(db: Database.Database, calls: PartnerCallRow[]): void {
  const engine = partnerConsentEngine(db);
  const s = db.prepare("INSERT OR REPLACE INTO partner_call_checks VALUES (?,?,?,?)");
  db.transaction(() => {
    for (const call of calls) {
      const r = engine.check(call);
      s.run(r.call_id, r.status, JSON.stringify(r.checks), r.reason);
    }
  })();
}

/** Checks every call without a result, streamed in chunks. */
export function runPartnerChecks(db: Database.Database): void {
  forEachChunk<PartnerCallRow>(db, "SELECT c.* FROM partner_api_calls c LEFT JOIN partner_call_checks k ON k.call_id = c.id WHERE k.call_id IS NULL ORDER BY c.ts, c.id", [], (rows) => savePartnerChecks(db, rows));
}

type PartnerStats = Record<string, { mean: number; sd: number }>;

/** Each partner's own baseline: mean and SD of weekday daily call counts over full baseline days (SD floored at 1). */
export function computePartnerStats(db: Database.Database, before: string): PartnerStats {
  const rows = db.prepare(`SELECT k.partner_id, substr(c.ts, 1, 10) AS date, COUNT(*) AS n FROM partner_api_calls c JOIN api_keys k ON k.id = c.key_id
    WHERE c.ts < ? GROUP BY k.partner_id, date ORDER BY k.partner_id, date`).iterate(`${dateOf(before)}T00:00:00+01:00`) as IterableIterator<{ partner_id: string; date: string; n: number }>;
  const counts = new Map<string, number[]>();
  for (const r of rows) {
    if (weekday(r.date) === 0 || weekday(r.date) === 6) continue;
    counts.set(r.partner_id, [...(counts.get(r.partner_id) ?? []), r.n]);
  }
  const stats: PartnerStats = {};
  for (const [partner, values] of counts) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1));
    stats[partner] = { mean, sd: Math.max(1, sd) };
  }
  db.prepare("INSERT OR REPLACE INTO sim_state VALUES ('partner_stats', ?)").run(JSON.stringify(stats));
  return stats;
}

export type PartnerHit = { code: PartnerSignalCode; tier: number; points: number; ts: string; call_ids: string[]; evidence: Record<string, unknown> };
export type PartnerEvaluation = {
  partner_id: string; ts: string; score: number; level: Level; hits: PartnerHit[]; breakdown: Record<string, number>;
  review: { required: boolean; reason_codes: string[]; hard: boolean; policy_version: typeof PARTNER_REVIEW_POLICY_VERSION };
};
type CallWithCheck = PartnerCallRow & { check: PartnerCheckStatus };

/** Largest set of calls inside any 60-minute window, by a measure over that window. */
function bestWindow(calls: CallWithCheck[], measure: (rows: CallWithCheck[]) => number): { value: number; rows: CallWithCheck[] } {
  let best = { value: 0, rows: [] as CallWithCheck[] };
  let start = 0;
  for (let end = 0; end < calls.length; end++) {
    while (toMinutes(calls[end]!.ts) - toMinutes(calls[start]!.ts) > WINDOW) start++;
    const rows = calls.slice(start, end + 1);
    const value = measure(rows);
    if (value > best.value) best = { value, rows };
  }
  return best;
}

export function createPartnerEvaluator(db: Database.Database) {
  const stats: PartnerStats = JSON.parse((db.prepare("SELECT value FROM sim_state WHERE key = 'partner_stats'").get() as { value: string } | undefined)?.value ?? "{}");
  const q = {
    calls: db.prepare(`SELECT c.*, k.status AS check_status FROM partner_api_calls c JOIN api_keys a ON a.id = c.key_id JOIN partner_call_checks k ON k.call_id = c.id
      WHERE a.partner_id = ? AND c.ts > ? AND c.ts <= ? AND c.status <> 'BLOCKED' ORDER BY c.ts, c.id`),
    today: db.prepare(`SELECT COUNT(*) AS n FROM partner_api_calls c JOIN api_keys a ON a.id = c.key_id
      WHERE a.partner_id = ? AND c.ts >= ? AND c.ts <= ? AND c.status <> 'BLOCKED'`),
  };

  function evaluate(partnerId: string, t: string): PartnerEvaluation {
    // Blocked calls never reached customer data, so they are evidence of attempts, not of exposure.
    const calls = (q.calls.all(partnerId, addMinutes(t, -1440), t) as (PartnerCallRow & { check_status: PartnerCheckStatus })[]).map((c) => ({ ...c, check: c.check_status }));
    const hits: PartnerHit[] = [];
    const add = (code: PartnerSignalCode, tier: number, rows: CallWithCheck[], evidence: Record<string, unknown>) =>
      hits.push({ code, tier, points: points(code, tier), ts: rows[rows.length - 1]!.ts, call_ids: rows.map((r) => r.id), evidence });

    const outside = calls.filter((c) => c.check === "OUTSIDE_CONSENT");
    if (outside.length) add("CALL_OUTSIDE_CONSENT", outside.length >= 3 ? 2 : 1, outside, { count: outside.length });
    const ended = calls.filter((c) => c.check === "CONSENT_ENDED");
    if (ended.length) add("CONSENT_REVOKED_OR_EXPIRED", 1, ended, { count: ended.length, customers: [...new Set(ended.map((c) => `••••${c.account_no.slice(-4)}`))] });

    const lookups = bestWindow(calls, (rows) => {
      const n = rows.filter((r) => r.endpoint === LOOKUP).length;
      const paid = rows.filter((r) => r.endpoint === PAYMENT).length;
      return n >= 20 && paid / n < 0.1 ? n : 0;
    });
    if (lookups.value) {
      const rows = lookups.rows.filter((r) => r.endpoint === LOOKUP);
      add("LOOKUP_WITHOUT_BUSINESS", lookups.value >= 100 ? 2 : 1, rows, { lookups: rows.length, payments: lookups.rows.filter((r) => r.endpoint === PAYMENT).length });
    }

    const networks = bestWindow(calls, (rows) => new Set(rows.map((r) => r.source_network)).size);
    if (networks.value >= 5) add("KEY_MULTI_NETWORK", networks.value >= 10 ? 2 : 1, networks.rows, { networks: networks.value, minutes: WINDOW });

    // Longest run of looked-up account numbers that each follow the previous one, within 60 minutes.
    const enquiries = calls.filter((c) => c.endpoint === LOOKUP);
    let run: CallWithCheck[] = [];
    let longest: CallWithCheck[] = [];
    for (const c of enquiries) {
      const prev = run[run.length - 1];
      run = prev && Number(c.account_no) === Number(prev.account_no) + 1 && toMinutes(c.ts) - toMinutes(run[0]!.ts) <= WINDOW ? [...run, c] : [c];
      if (run.length > longest.length) longest = run;
    }
    if (longest.length >= 10) add("SEQUENTIAL_ENUMERATION", 1, longest, { accounts: longest.length, first: `••••${longest[0]!.account_no.slice(-4)}`, last: `••••${longest[longest.length - 1]!.account_no.slice(-4)}` });

    const s = stats[partnerId];
    if (s) {
      const today = (q.today.get(partnerId, `${dateOf(t)}T00:00:00+01:00`, t) as { n: number }).n;
      const z = (today - s.mean) / s.sd;
      const tier = z > 3 ? 2 : z > 2 ? 1 : 0;
      if (tier) add("PARTNER_VOLUME_ANOMALY", tier, calls.filter((c) => dateOf(c.ts) === dateOf(t)), { count: today, usual: Math.round(s.mean), z: Math.round(z * 10) / 10 });
    }

    const score = Math.min(100, hits.reduce((sum, h) => sum + h.points, 0));
    const breakdown = Object.fromEntries(hits.map((h) => [h.code, h.points]));
    // A call after consent ended is a hard contradiction: it always needs review, whatever the score.
    const hard = ended.length > 0;
    const reasonCodes = [...(hard ? ["CONSENT_REVOKED_OR_EXPIRED"] : []), ...(score >= 30 ? ["SCORE_THRESHOLD"] : [])];
    return { partner_id: partnerId, ts: t, score, level: levelFor(score), hits, breakdown, review: { required: reasonCodes.length > 0, reason_codes: reasonCodes, hard, policy_version: PARTNER_REVIEW_POLICY_VERSION } };
  }
  return { evaluate };
}

export function savePartnerScore(db: Database.Database, e: PartnerEvaluation, stepId: string | null): void {
  db.prepare("INSERT INTO partner_risk_scores (partner_id, ts, score, level, breakdown, review_required, step_id) VALUES (?,?,?,?,?,?,?)")
    .run(e.partner_id, e.ts, e.score, e.level, JSON.stringify(e.breakdown), e.review.required ? 1 : 0, stepId);
}

/** Current risk factors for a partner, keeping when each was first seen. */
export function savePartnerSignals(db: Database.Database, e: PartnerEvaluation): void {
  const previous = new Map((db.prepare("SELECT code, first_ts FROM partner_signals WHERE partner_id = ?").all(e.partner_id) as { code: string; first_ts: string }[]).map((r) => [r.code, r.first_ts]));
  db.prepare("DELETE FROM partner_signals WHERE partner_id = ?").run(e.partner_id);
  const s = db.prepare("INSERT INTO partner_signals VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const h of e.hits) s.run(`PSIG-${e.partner_id}-${h.code}`, e.partner_id, h.code, h.tier, h.points, h.points, h.ts, previous.get(h.code) ?? e.ts, JSON.stringify(h.call_ids), JSON.stringify(h.evidence));
}

/** Baseline history: one score per partner per day, then the current score at the scenario clock. */
export function backfillPartners(db: Database.Database, days: readonly string[], clock: string): void {
  const ev = createPartnerEvaluator(db);
  const partners = (db.prepare("SELECT id FROM api_partners ORDER BY id").all() as { id: string }[]).map((p) => p.id);
  db.transaction(() => {
    for (const p of partners) for (const d of days) if (d < dateOf(clock)) savePartnerScore(db, ev.evaluate(p, `${d}T23:59:00+01:00`), null);
    for (const p of partners) {
      const e = ev.evaluate(p, clock);
      savePartnerSignals(db, e);
      savePartnerScore(db, e, "START");
    }
  })();
}
