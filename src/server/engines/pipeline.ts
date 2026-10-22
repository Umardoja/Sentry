import "server-only";
import Database from "better-sqlite3";
import { addMinutes, dateOf, hhmmOf, minutesBetween, toMinutes, weekday } from "../time";
import { purposeEngine, savePurpose, type ActionRow, type Check, type PurposeStatus } from "./purpose";
import { decideReview, type ReviewDecision } from "./reviewPolicy";
import { levelFor, points, SIGNALS, type Level, type SignalCode } from "./signals";

export type Hit = {
  code: SignalCode; tier: number; points: number; effective: number; ts: string;
  action_ids: string[]; evidence: Record<string, unknown>; waived: boolean; waive_reason: string | null;
};
export type Evaluation = { staff_id: string; ts: string; score: number; raw: number; level: Level; hits: Hit[]; breakdown: Record<string, number>; review: ReviewDecision };
type PeerStats = Record<string, Record<string, { mean: number; sd: number }>>;
type ActionWithPurpose = ActionRow & { purpose: PurposeStatus | null; purpose_checks: string | null };
type LeakHit = { staff_id: string; ts: string; action_ids: string[]; evidence: Record<string, unknown> };

const inside = (hhmm: string, start: string, end: string) => hhmm >= start && hhmm <= end;

/** Rows written per transaction by the bulk backfills, so a 512 MB host never holds the whole baseline in memory. */
const CHUNK = 5_000;

/**
 * Streams a large read in order and hands it over in chunks of CHUNK rows. better-sqlite3 cannot
 * write on a connection while one of its iterators is open, so a file database is read through a
 * second, read-only connection (a WAL snapshot of committed rows); an in-memory database is paged.
 */
export function forEachChunk<T>(db: Database.Database, sql: string, params: unknown[], handle: (rows: T[]) => void): void {
  if (db.memory || db.inTransaction) {
    const rows = db.prepare(sql).all(...params) as T[];
    for (let i = 0; i < rows.length; i += CHUNK) handle(rows.slice(i, i + CHUNK));
    return;
  }
  const reader = new Database(db.name, { readonly: true, fileMustExist: true });
  // A forward-only scan gains nothing from a large page cache.
  reader.pragma("cache_size = -2000");
  try {
    let chunk: T[] = [];
    for (const row of reader.prepare(sql).iterate(...params) as IterableIterator<T>) {
      chunk.push(row);
      if (chunk.length === CHUNK) { handle(chunk); chunk = []; }
    }
    if (chunk.length) handle(chunk);
  } finally {
    reader.close();
  }
}

/** Peer statistics: per role and action type, mean and SD of weekday daily counts (SD floored at 1). */
export function computePeerStats(db: Database.Database): PeerStats {
  const rows = db.prepare(`
    SELECT s.role, r.staff_id, r.date, a.action_type, COUNT(a.id) AS n
    FROM roster r JOIN staff s ON s.id = r.staff_id
    LEFT JOIN sensitive_actions a ON a.staff_id = r.staff_id AND substr(a.ts,1,10) = r.date
    GROUP BY r.staff_id, r.date, a.action_type`).iterate() as IterableIterator<{ role: string; staff_id: string; date: string; action_type: string | null; n: number }>;
  const days = new Map<string, Set<string>>();
  const counts = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    const wd = weekday(r.date);
    if (wd === 0 || wd === 6) continue;
    const key = `${r.staff_id}|${r.date}`;
    if (!days.has(r.role)) days.set(r.role, new Set());
    days.get(r.role)!.add(key);
    if (!r.action_type) continue;
    if (!counts.has(r.role)) counts.set(r.role, new Map());
    const m = counts.get(r.role)!;
    if (!m.has(r.action_type)) m.set(r.action_type, []);
    m.get(r.action_type)!.push(r.n);
  }
  const stats: PeerStats = {};
  for (const [role, m] of counts) {
    stats[role] = {};
    const total = days.get(role)!.size;
    for (const [type, values] of m) {
      const all = [...values, ...Array(Math.max(0, total - values.length)).fill(0)];
      const mean = all.reduce((a, b) => a + b, 0) / all.length;
      const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, all.length - 1));
      stats[role][type] = { mean, sd: Math.max(1, sd) };
    }
  }
  db.prepare("INSERT OR REPLACE INTO sim_state VALUES ('peer_stats', ?)").run(JSON.stringify(stats));
  return stats;
}

export function createEvaluator(db: Database.Database) {
  const stats: PeerStats = JSON.parse((db.prepare("SELECT value FROM sim_state WHERE key='peer_stats'").get() as { value: string } | undefined)?.value ?? "{}");
  const q = {
    staff: db.prepare("SELECT id, role, phone, usual_terminal_ids FROM staff WHERE id = ?"),
    actions: db.prepare(`SELECT a.*, p.status AS purpose, p.checks AS purpose_checks FROM sensitive_actions a LEFT JOIN purpose_results p ON p.action_id = a.id
      WHERE a.staff_id = ? AND a.ts > ? AND a.ts <= ? ORDER BY a.ts, a.id`),
    logins: db.prepare("SELECT * FROM logins WHERE staff_id = ? AND ts > ? AND ts <= ? ORDER BY ts"),
    roster: db.prepare("SELECT shift_start, shift_end FROM roster WHERE staff_id = ? AND date = ?"),
    overtime: db.prepare("SELECT start, \"end\" FROM overtime WHERE staff_id = ? AND date = ?"),
    leave: db.prepare("SELECT id FROM leave WHERE staff_id = ? AND start_date <= ? AND end_date >= ? AND status = 'APPROVED' LIMIT 1"),
    usedTerminal: db.prepare("SELECT 1 FROM logins WHERE staff_id = ? AND terminal_id = ? AND ts < ? AND ts >= ? LIMIT 1"),
    account: db.prepare("SELECT a.id, a.account_no, a.opened_at, a.phone, c.bvn_hash FROM accounts a JOIN customers c ON c.id = a.customer_id WHERE a.id = ?"),
    transfers: db.prepare("SELECT * FROM outbound_transfers WHERE from_account_id = ? AND ts > ? AND ts <= ? ORDER BY ts"),
    answers: db.prepare("SELECT * FROM ticket_answers WHERE staff_id = ? AND ts > ? AND ts <= ? AND valid = 0 ORDER BY ts"),
    leaks: db.prepare("SELECT value FROM sim_state WHERE key = 'leak_hits'"),
  };
  const rosterCache = new Map<string, { shift_start: string; shift_end: string } | null>();
  const roster = (staff: string, date: string) => {
    const k = `${staff}|${date}`;
    if (!rosterCache.has(k)) rosterCache.set(k, (q.roster.get(staff, date) as { shift_start: string; shift_end: string } | undefined) ?? null);
    return rosterCache.get(k)!;
  };

  function evaluate(staffId: string, t: string): Evaluation {
    const staff = q.staff.get(staffId) as { id: string; role: string; phone: string; usual_terminal_ids: string };
    const from = addMinutes(t, -1440);
    const acts = q.actions.all(staffId, from, t) as ActionWithPurpose[];
    const logins = q.logins.all(staffId, from, t) as { id: string; terminal_id: string; ts: string }[];
    const hits: Hit[] = [];
    const add = (code: SignalCode, tier: number, ts: string, action_ids: string[], evidence: Record<string, unknown>, waived = false, reason: string | null = null, effectiveOverride?: number) => {
      const p = points(code, tier);
      hits.push({ code, tier, points: p, effective: waived ? 0 : effectiveOverride ?? p, ts, action_ids, evidence, waived, waive_reason: reason });
    };
    const lastTs = (rows: { ts: string }[]) => rows[rows.length - 1]!.ts;

    // Purpose signals.
    const reversals = acts.filter((a) => a.action_type === "REVERSAL");
    const byStatus = (s: string) => reversals.filter((a) => a.purpose === s);
    const tiered = (n: number) => (n >= 3 ? 2 : 1);
    const noMatch = byStatus("NO_MATCH");
    if (noMatch.length) add("REVERSAL_NO_MATCH", tiered(noMatch.length), lastTs(noMatch), noMatch.map((a) => a.id), { count: noMatch.length });
    const wrong = byStatus("WRONG_BENEFICIARY");
    if (wrong.length) add("REVERSAL_WRONG_BENEFICIARY", tiered(wrong.length), lastTs(wrong), wrong.map((a) => a.id), { count: wrong.length });
    const dup = byStatus("DUPLICATE");
    if (dup.length) add("REVERSAL_DUPLICATE", 1, lastTs(dup), dup.map((a) => a.id), { count: dup.length });
    const partial = byStatus("PARTIAL");
    if (partial.length) add("AMOUNT_MISMATCH", 1, lastTs(partial), partial.map((a) => a.id), { count: partial.length });
    const noCase = acts.filter((a) => a.action_type === "RECORD_VIEW" && a.purpose === "NO_CASE");
    if (noCase.length >= 10) add("RECORD_VIEW_NO_CASE", noCase.length >= 50 ? 2 : 1, lastTs(noCase), noCase.map((a) => a.id), { count: noCase.length });
    const typed = (type: string, code: SignalCode) => {
      const rows = acts.filter((a) => a.action_type === type && a.purpose === "NO_MATCH");
      if (rows.length) add(code, 1, lastTs(rows), rows.map((a) => a.id), { count: rows.length, rows: rows.map((r) => (r.detail ? JSON.parse(r.detail) : {})), blocked: rows.every((r) => r.status === "BLOCKED") });
    };
    typed("BULK_EXPORT", "BULK_EXPORT_NO_TICKET");
    typed("LIMIT_CHANGE", "LIMIT_CHANGE_NO_REQUEST");
    typed("MANUAL_POSTING", "POSTING_NO_APPROVAL");
    typed("PRIV_ACCESS", "PRIV_ACCESS_NO_TICKET");
    const answers = q.answers.all(staffId, from, t) as { id: string; action_id: string; ticket_ref: string; ts: string; failed_checks: string }[];
    if (answers.length) add("TICKET_INVALID", 1, lastTs(answers), answers.map((a) => a.action_id), { ts: answers[0]!.ts, ticket_ref: answers[0]!.ticket_ref, failed: JSON.parse(answers[0]!.failed_checks) });

    // Identity signals.
    const leaveRows = [...logins, ...acts].filter((r) => !!q.leave.get(staffId, dateOf(r.ts), dateOf(r.ts)));
    const onLeave = leaveRows.length > 0;
    if (onLeave) {
      const first = [...leaveRows].sort((a, b) => a.ts.localeCompare(b.ts))[0]!;
      add("ON_LEAVE", 1, first.ts, acts.filter((a) => leaveRows.includes(a)).map((a) => a.id), { ts: first.ts });
    }
    const usual: string[] = JSON.parse(staff.usual_terminal_ids);
    const fresh = logins.filter((l) => !usual.includes(l.terminal_id) && !q.usedTerminal.get(staffId, l.terminal_id, l.ts, addMinutes(l.ts, -30 * 1440)));
    if (fresh.length) add("NEW_TERMINAL", 1, fresh[0]!.ts, [], { terminal: fresh[0]!.terminal_id, ts: fresh[0]!.ts });

    // Behaviour signals (suppressed when the session is on approved leave: the baseline is not this person).
    if (!onLeave) {
      const outside = acts.filter((a) => {
        const r = roster(staffId, dateOf(a.ts));
        return !r || !inside(hhmmOf(a.ts), r.shift_start, r.shift_end);
      });
      const covered = (a: ActionWithPurpose) => {
        const o = q.overtime.get(staffId, dateOf(a.ts)) as { start: string; end: string } | undefined;
        return !!o && inside(hhmmOf(a.ts), o.start, o.end);
      };
      const uncovered = outside.filter((a) => !covered(a));
      if (outside.length) {
        const ev = { first: outside[0]!.ts, last: outside[outside.length - 1]!.ts, count: outside.length };
        if (uncovered.length) add("OUTSIDE_ROSTER", 1, lastTs(uncovered), uncovered.map((a) => a.id), { ...ev, first: uncovered[0]!.ts, last: lastTs(uncovered), count: uncovered.length });
        else add("OUTSIDE_ROSTER", 1, lastTs(outside), outside.map((a) => a.id), ev, true, "W1: approved overtime covers these actions");
      }
      const today = acts.filter((a) => dateOf(a.ts) === dateOf(t));
      let best: { tier: number; type: string; count: number; z: number } | null = null;
      const types = new Set(today.map((a) => a.action_type));
      for (const type of types) {
        const s = stats[staff.role]?.[type];
        if (!s) continue;
        const count = today.filter((a) => a.action_type === type).length;
        const z = (count - s.mean) / s.sd;
        const tier = z > 3 ? 2 : z > 2 ? 1 : 0;
        if (tier && (!best || tier > best.tier || (tier === best.tier && z > best.z))) best = { tier, type, count, z };
      }
      if (best) {
        const overtimeToday = !!q.overtime.get(staffId, dateOf(t));
        const halve = overtimeToday && uncovered.length === 0 && today.every((a) => a.purpose === "MATCHED");
        const ids = today.filter((a) => a.action_type === best!.type).map((a) => a.id);
        const p = points("VOLUME_ANOMALY", best.tier);
        add("VOLUME_ANOMALY", best.tier, lastTs(today), ids, { type: best.type, count: best.count, z: Math.round(best.z * 10) / 10 }, false, halve ? "W2: overtime approved and every action matched" : null, halve ? Math.floor(p / 2) : p);
      }
    }

    // Money signals.
    const unmatched = acts.filter((a) => a.credit_account_id && a.purpose && a.purpose !== "MATCHED");
    const credited = [...new Set(unmatched.map((a) => a.credit_account_id!))];
    const accounts = credited.map((id) => q.account.get(id) as { id: string; account_no: string; opened_at: string; phone: string; bvn_hash: string });
    const fresh7 = accounts.filter((acc) => {
      const act = unmatched.find((a) => a.credit_account_id === acc.id)!;
      return minutesBetween(acc.opened_at, act.ts) < 7 * 1440;
    });
    if (fresh7.length) {
      const ids = unmatched.filter((a) => fresh7.some((f) => f.id === a.credit_account_id)).map((a) => a.id);
      add("NEW_BENEFICIARY_ACCOUNT", fresh7.length >= 3 ? 2 : 1, lastTs(unmatched), ids, { count: fresh7.length, credited: credited.length, accounts: fresh7.map((a) => a.id) });
    }
    if (credited.length) {
      const transfers = credited.flatMap((id) => q.transfers.all(id, from, t) as { id: string; to_account_no: string; ts: string; status: string }[]);
      transfers.sort((a, b) => a.ts.localeCompare(b.ts));
      for (const first of transfers) {
        const windowRows = transfers.filter((x) => toMinutes(x.ts) - toMinutes(first.ts) <= 60 && x.ts >= first.ts);
        const distinct = new Set(windowRows.map((x) => x.to_account_no));
        if (distinct.size >= 10) {
          add("FAN_OUT", 1, lastTs(windowRows), unmatched.map((a) => a.id), { destinations: distinct.size, ts: first.ts, blocked: windowRows.filter((x) => x.status === "BLOCKED_BY_HOLD").length, sent: windowRows.filter((x) => x.status === "SENT").length, transfer_ids: windowRows.map((x) => x.id) });
          break;
        }
      }
      const shared = accounts.filter((acc) => acc.phone === staff.phone);
      if (shared.length) add("SHARED_IDENTIFIER", 1, t, [], { accounts: shared.map((a) => a.id) });
    }

    // Leak tracer signals (persisted when the tracer runs).
    const leakRow = q.leaks.get() as { value: string } | undefined;
    if (leakRow) {
      for (const l of JSON.parse(leakRow.value) as LeakHit[]) {
        if (l.staff_id === staffId && l.ts > from && l.ts <= t) add("LEAK_COMMON_VIEWER", 1, l.ts, l.action_ids, l.evidence);
      }
    }

    const breakdown: Record<string, number> = {};
    for (const h of hits) breakdown[h.code] = h.effective;
    const raw = Math.min(100, hits.reduce((s, h) => s + h.points, 0));
    const score = Math.min(100, hits.reduce((s, h) => s + h.effective, 0));
    const review = decideReview(score, acts.map((action) => ({
      action_id: action.id,
      action_type: action.action_type,
      status: action.purpose,
      checks: action.purpose_checks ? JSON.parse(action.purpose_checks) as Check[] : [],
    })));
    return { staff_id: staffId, ts: t, score, raw, level: levelFor(score), hits, breakdown, review };
  }

  return { evaluate };
}

/** Runs purpose checks on the given actions, or on every action without a result (streamed in chunks). */
export function runPurpose(db: Database.Database, actionIds?: string[]): void {
  const engine = purposeEngine(db);
  const save = (rows: ActionRow[]) => db.transaction(() => savePurpose(db, rows.map((r) => engine.evaluate(r))))();
  if (actionIds) {
    const one = db.prepare("SELECT * FROM sensitive_actions WHERE id = ?");
    save(actionIds.map((id) => one.get(id) as ActionRow));
    return;
  }
  // A purpose result never depends on another purpose result, so chunking cannot change any outcome.
  forEachChunk<ActionRow>(db, "SELECT a.* FROM sensitive_actions a LEFT JOIN purpose_results p ON p.action_id = a.id WHERE p.action_id IS NULL ORDER BY a.ts, a.id", [], save);
}

export function saveScore(db: Database.Database, e: Evaluation, stepId: string | null): void {
  db.prepare("INSERT INTO risk_scores (staff_id, ts, score, raw_score, level, breakdown, step_id) VALUES (?,?,?,?,?,?,?)")
    .run(e.staff_id, e.ts, e.score, e.raw, e.level, JSON.stringify(e.breakdown), stepId);
}

/** Stores the current signals for a staff member, keeping when each code was first seen. */
export function saveSignals(db: Database.Database, e: Evaluation): void {
  const previous = new Map((db.prepare("SELECT code, first_ts FROM signals WHERE staff_id = ?").all(e.staff_id) as { code: string; first_ts: string }[]).map((r) => [r.code, r.first_ts]));
  db.prepare("DELETE FROM signals WHERE staff_id = ?").run(e.staff_id);
  const s = db.prepare("INSERT INTO signals VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const h of e.hits) {
    s.run(`SIG-${e.staff_id}-${h.code}`, e.staff_id, h.code, h.tier, h.points, h.effective, h.ts, previous.get(h.code) ?? e.ts, JSON.stringify(h.action_ids), JSON.stringify(h.evidence), h.waived ? 1 : 0, h.waive_reason);
  }
}

/** Baseline history: one score per staff member per rostered day, then the current score at the sim clock. */
export function backfill(db: Database.Database, clock: string): void {
  const ev = createEvaluator(db);
  // Same order as one big transaction, so the risk_scores ids are unchanged.
  forEachChunk<{ staff_id: string; date: string }>(db, "SELECT staff_id, date FROM roster WHERE date < ? ORDER BY staff_id, date", [dateOf(clock)], (days) => db.transaction(() => {
    for (const d of days) saveScore(db, ev.evaluate(d.staff_id, `${d.date}T23:59:00+01:00`), null);
  })());
  db.transaction(() => {
    const staff = db.prepare("SELECT id FROM staff WHERE employment_type <> 'AGENT' ORDER BY id").all() as { id: string }[];
    for (const s of staff) saveScore(db, ev.evaluate(s.id, clock), "START");
  })();
}

export { SIGNALS };
