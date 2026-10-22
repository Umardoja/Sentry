import "server-only";
import type Database from "better-sqlite3";
import type { IngestEvent } from "@/shared/schemas";
import { SEED } from "../config";
import { Rng } from "../rng";
import { addMinutes, addSeconds, dateOf, fromMinutes, hhmmOf, toSeconds } from "../time";
import { ingestEvents, type IngestSummary } from "../services/ingest";
import { CHARACTERS } from "./generator";
import { clockOf } from "./player";

/** Simulated seconds per real second while live activity is on. */
export const LIVE_SPEED = 4;
export const LIVE_MAX_EVENTS = 20;
/** After an idle gap the live clock resumes rather than replaying the whole gap. */
const MAX_ADVANCE_SECONDS = 60;
/** Chance that an on-shift worker acts in a given simulated minute. */
const ACTION_RATE = 0.25;
const NOISE_RATE = 0.03;
const LATE_MINUTES = 30;
/** Evening operations desk: OPS staff on approved overtime, so live mode has work at any demo time. */
export const DESK_SIZE = 12;
const DESK_RATE = 0.5;
const DESK_START = "17:00";
const DESK_END = "23:59";

const SCRIPTED = new Set<string>([CHARACTERS.approver, CHARACTERS.ngozi, CHARACTERS.tunde, CHARACTERS.bisi, CHARACTERS.kemi, ...CHARACTERS.otherViewers, CHARACTERS.agent]);
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const minuteOfDay = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

type Worker = { staff_id: string; kind: "REVERSAL" | "RECORD_VIEW"; start: number; end: number; terminal: string; rate: number };
export type LiveContext = { date: string; workers: Worker[]; openCases: { ticket: string; customer: string }[]; secondAccounts: { main: string; other: string }[] };
export type Noise = "LATE" | "OTHER_ACCOUNT";
export type LiveBundle = { key: string; ts: string; staff_id: string; session_id: string; terminal_id: string; noise: Noise | null; events: IngestEvent[] };
export type LiveCursor = { clock: string; cursor: string };

/**
 * Who can act on `date`: rostered reversal and customer-service staff, never a scripted
 * character, never someone with an open case or an unresolved purpose result in the last 24 hours
 * (their next evaluation would already require review, whatever the live event).
 */
export function liveContext(db: Database.Database, date: string, from: string): LiveContext {
  const desk = new Set(liveState(db).desk ?? []);
  const rows = db.prepare(`SELECT r.staff_id, s.role, s.usual_terminal_ids, r.shift_start, r.shift_end, MAX(o."end") AS ot_end
    FROM roster r JOIN staff s ON s.id = r.staff_id LEFT JOIN overtime o ON o.staff_id = r.staff_id AND o.date = r.date
    WHERE r.date = ? AND s.role IN ('OPS_REVERSALS','OPS_EPRODUCTS','CUSTOMER_SERVICE') AND s.employment_type <> 'AGENT'
    GROUP BY r.staff_id ORDER BY r.staff_id`).all(date) as { staff_id: string; role: string; usual_terminal_ids: string; shift_start: string; shift_end: string; ot_end: string | null }[];
  // No DISTINCT: it would steer SQLite onto the staff index and scan every action; the Set dedupes instead.
  const flagged = new Set((db.prepare(`SELECT a.staff_id FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id
    WHERE a.ts > ? AND p.status <> 'MATCHED'`).all(addMinutes(from, -1440)) as { staff_id: string }[]).map((r) => r.staff_id));
  for (const r of db.prepare("SELECT staff_id FROM cases WHERE status IN ('OPEN','CONTAINED')").all() as { staff_id: string }[]) flagged.add(r.staff_id);
  for (const r of db.prepare("SELECT staff_id FROM leave WHERE start_date <= ? AND end_date >= ?").all(date, date) as { staff_id: string }[]) flagged.add(r.staff_id);
  const workers = rows.filter((r) => !SCRIPTED.has(r.staff_id) && !flagged.has(r.staff_id)).map((r) => ({
    staff_id: r.staff_id,
    kind: r.role === "CUSTOMER_SERVICE" ? "RECORD_VIEW" as const : "REVERSAL" as const,
    start: minuteOfDay(r.shift_start),
    end: Math.max(minuteOfDay(r.shift_end), r.ot_end ? minuteOfDay(r.ot_end) : 0),
    terminal: (JSON.parse(r.usual_terminal_ids) as string[])[0]!,
    rate: desk.has(r.staff_id) ? DESK_RATE : ACTION_RATE,
  }));
  const { openCases, secondAccounts } = reference(db, date);
  return { date, workers, openCases, secondAccounts };
}

// Customer tickets and accounts are never written by live activity, so each database reads them once per date.
const references = new WeakMap<Database.Database, Map<string, Pick<LiveContext, "openCases" | "secondAccounts">>>();
function reference(db: Database.Database, date: string) {
  let byDate = references.get(db);
  if (!byDate) { byDate = new Map(); references.set(db, byDate); }
  let ref = byDate.get(date);
  if (!ref) {
    ref = {
      openCases: db.prepare(`SELECT id AS ticket, customer_id AS customer FROM tickets
        WHERE type IN ('COMPLAINT','SERVICE_REQUEST') AND status = 'OPEN' AND assigned_team = 'CUSTOMER_SERVICE' AND customer_id GLOB 'CUS-[0-9]*' AND created_at < ?
        ORDER BY id`).all(`${date}T00:00:00+01:00`) as { ticket: string; customer: string }[],
      secondAccounts: db.prepare(`SELECT a1.id AS main, a2.id AS other FROM accounts a1 JOIN accounts a2 ON a2.customer_id = a1.customer_id AND a2.id > a1.id
        WHERE a1.id BETWEEN 'ACC-000031' AND 'ACC-005000' ORDER BY a1.id, a2.id`).all() as { main: string; other: string }[],
    };
    byDate.set(date, ref);
  }
  return ref;
}

/**
 * Activity for one simulated minute. Each worker-minute has its own seeded stream, so an
 * event id always describes the same event however the minutes are batched.
 */
export function minuteBundles(ctx: LiveContext, minute: number): LiveBundle[] {
  const start = fromMinutes(minute);
  const now = minuteOfDay(hhmmOf(start));
  const stamp = start.slice(0, 16).replace(/[-T:]/g, "");
  const bundles: LiveBundle[] = [];
  for (const w of ctx.workers) {
    const num = w.staff_id.slice(4);
    const rng = new Rng((Math.imul(minute, 0x9e3779b1) ^ Math.imul(Number(num) + 1, 0x85ebca6b) ^ SEED) >>> 0);
    const roll = rng.uniform();
    const onShift = now >= w.start && now <= w.end;
    const late = now > w.end && now <= w.end + LATE_MINUTES;
    // ~97% legitimate: on-shift work. ~3% honest noise: a little work after the shift, or a refund to the customer's other account.
    if (onShift ? roll >= w.rate : !(late && roll < w.rate * NOISE_RATE)) continue;
    const ts = addSeconds(start, rng.int(0, 59));
    const session = `SES-LV-${num}-${ctx.date.replace(/-/g, "")}`;
    const base = { staff_id: w.staff_id, ts, session_id: session, terminal_id: w.terminal };
    const key = `${stamp}-${num}`;
    let noise: Noise | null = late ? "LATE" : null;
    const events: IngestEvent[] = [];
    if (w.kind === "REVERSAL") {
      const other = rng.uniform() < NOISE_RATE && !late && ctx.secondAccounts.length ? rng.pick(ctx.secondAccounts) : null;
      if (other) noise = "OTHER_ACCOUNT";
      const debit = other ? other.main : `ACC-${pad(rng.int(31, 5000), 6)}`;
      const amount = rng.int(4, 600) * 500;
      events.push({ type: "failed_debit", id: `TXN-LV-${key}`, ts: addMinutes(start, -rng.int(10, 120)), debit_account_id: debit, amount });
      events.push({ type: "reversal", id: `ACT-LV-${key}`, ...base, original_txn_id: `TXN-LV-${key}`, credit_account_id: other ? other.other : debit, amount });
    } else {
      const c = rng.pick(ctx.openCases);
      events.push({ type: "record_view", id: `ACT-LV-${key}`, ...base, customer_id: c.customer, ticket_ref: c.ticket });
    }
    bundles.push({ key, ts, staff_id: w.staff_id, session_id: session, terminal_id: w.terminal, noise, events });
  }
  return bundles.sort((a, b) => a.ts.localeCompare(b.ts) || a.key.localeCompare(b.key));
}

export type LiveWindow = { bundles: LiveBundle[]; events: IngestEvent[]; next: LiveCursor; capped: boolean };

/**
 * Events due after `from` up to and including `to`, at most `max` per window. A staff member's first
 * action of the day in this feed is preceded by a login on their usual terminal.
 */
export function liveWindow(contextFor: (date: string) => LiveContext, from: LiveCursor, to: string, loggedIn: Set<string>, max = LIVE_MAX_EVENTS): LiveWindow {
  const out: LiveWindow = { bundles: [], events: [], next: { ...from }, capped: false };
  for (let m = Math.floor(toSeconds(from.clock) / 60); m * 60 <= toSeconds(to); m++) {
    for (const b of minuteBundles(contextFor(dateOf(fromMinutes(m))), m)) {
      if (b.ts < from.clock || (b.ts === from.clock && b.key <= from.cursor) || b.ts > to) continue;
      const login: IngestEvent[] = loggedIn.has(b.staff_id) ? [] : [{
        type: "login", id: `LOG-${b.session_id.slice(4)}`, staff_id: b.staff_id, ts: addMinutes(fromMinutes(m), -1), session_id: b.session_id, terminal_id: b.terminal_id,
      }];
      if (out.events.length + login.length + b.events.length > max) {
        out.capped = true;
        return out;
      }
      if (login.length) loggedIn.add(b.staff_id);
      out.bundles.push(b);
      out.events.push(...login, ...b.events);
      out.next = { clock: b.ts, cursor: b.key };
    }
  }
  if (out.next.clock !== to) out.next = { clock: to, cursor: to === from.clock ? from.cursor : "" };
  return out;
}

/** Context per simulated date, built once per window. */
export function liveSource(db: Database.Database, from: string): (date: string) => LiveContext {
  const cache = new Map<string, LiveContext>();
  return (date) => {
    if (!cache.has(date)) cache.set(date, liveContext(db, date, from));
    return cache.get(date)!;
  };
}

type Totals = { ticks: number; events: number; actions: number; matched: number; noise: number; cases_opened: number };
export type LiveState = { enabled: boolean; clock: string | null; cursor: string; wall_ms: number | null; totals: Totals; last: LiveTick | null; desk: string[] | null };
export type LiveTick = { from: string; to: string; events: number; actions: number; matched: number; noise: number; cases_opened: string[]; capped: boolean };

const KEY = "live_state";
const EMPTY: LiveState = { enabled: false, clock: null, cursor: "", wall_ms: null, totals: { ticks: 0, events: 0, actions: 0, matched: 0, noise: 0, cases_opened: 0 }, last: null, desk: null };

export function liveState(db: Database.Database): LiveState {
  const row = db.prepare("SELECT value FROM sim_state WHERE key = ?").get(KEY) as { value: string } | undefined;
  return row ? { ...EMPTY, ...(JSON.parse(row.value) as Partial<LiveState>) } : EMPTY;
}

function saveState(db: Database.Database, s: LiveState) {
  db.prepare("INSERT OR REPLACE INTO sim_state VALUES (?, ?)").run(KEY, JSON.stringify(s));
}

/**
 * Opens the evening operations desk on the scenario day: eligible, non-scripted reversal staff
 * without overtime that day get an approved overtime ticket and 17:00–23:59 overtime, each approved
 * by a different staff member of the same team. Their live work is then matched and inside overtime.
 */
function openEveningDesk(db: Database.Database, date: string, from: string): string[] {
  const busy = new Set((db.prepare("SELECT staff_id FROM overtime WHERE date = ?").all(date) as { staff_id: string }[]).map((r) => r.staff_id));
  const roles = new Map((db.prepare("SELECT id, role FROM staff WHERE role IN ('OPS_REVERSALS','OPS_EPRODUCTS')").all() as { id: string; role: string }[]).map((r) => [r.id, r.role]));
  const eligible = liveContext(db, date, from).workers.filter((w) => w.kind === "REVERSAL" && !busy.has(w.staff_id)).map((w) => w.staff_id);
  const desk = new Rng(SEED).shuffle(eligible).slice(0, DESK_SIZE).sort();
  const approverFor = (id: string) => [...roles].find(([other, role]) => role === roles.get(id) && other !== id && !desk.includes(other) && !SCRIPTED.has(other))![0];
  const ticket = db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)");
  const overtime = db.prepare("INSERT INTO overtime VALUES (?,?,?,?,?,?,?)");
  desk.forEach((id, i) => {
    const ref = `TKT-OT-LIVE-${pad(i + 1, 2)}`;
    const approver = approverFor(id);
    ticket.run(ref, "OVERTIME", null, null, roles.get(id)!, id, approver, `${date}T12:00:00+01:00`, "APPROVED", "overtime");
    overtime.run(`OT-LIVE-${pad(i + 1, 2)}`, id, date, DESK_START, DESK_END, approver, ref);
  });
  return desk;
}

/** Switches live activity. The live clock starts at, and never falls behind, the scenario clock. */
export function setLive(db: Database.Database, enabled: boolean, actor: string, nowMs: number): LiveState {
  const s = liveState(db);
  const scenario = clockOf(db);
  const clock = !s.clock || s.clock < scenario ? scenario : s.clock;
  db.transaction(() => {
    const desk = s.desk ?? (enabled ? openEveningDesk(db, dateOf(scenario), clock) : null);
    if (desk && !s.desk) db.prepare("INSERT INTO audit_log (ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)")
      .run(clock, "SENTRY_SIMULATOR", "LIVE_DESK_OPENED", "sim", "live", JSON.stringify({ staff: desk, overtime: `${DESK_START}-${DESK_END}`, simulation: true }));
    saveState(db, { ...s, enabled, clock, cursor: clock === s.clock ? s.cursor : "", wall_ms: enabled ? nowMs : null, desk });
    db.prepare("INSERT INTO audit_log (ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)")
      .run(clock, actor, enabled ? "LIVE_ON" : "LIVE_OFF", "sim", "live", JSON.stringify({ live_clock: clock, simulation: true }));
  })();
  return liveState(db);
}

/** Generates and ingests the events due since the last tick. `nowMs` is the caller's wall clock. */
export function liveTick(db: Database.Database, nowMs: number): LiveTick | null {
  const s = liveState(db);
  if (!s.enabled) return null;
  const scenario = clockOf(db);
  const from: LiveCursor = !s.clock || s.clock < scenario ? { clock: scenario, cursor: "" } : { clock: s.clock, cursor: s.cursor };
  const wall = s.wall_ms ?? nowMs;
  const wanted = Math.floor((Math.max(0, nowMs - wall) * LIVE_SPEED) / 1000);
  const advance = Math.min(MAX_ADVANCE_SECONDS, wanted);
  const to = addSeconds(from.clock, advance);
  const loggedIn = new Set((db.prepare("SELECT staff_id FROM logins WHERE id GLOB ?").all(`LOG-LV-*-${dateOf(from.clock).replace(/-/g, "")}`) as { staff_id: string }[]).map((r) => r.staff_id));
  const window = liveWindow(liveSource(db, from.clock), from, to, loggedIn);
  const result: IngestSummary | null = window.events.length ? ingestEvents(db, window.events) : null;
  const actions = result?.actions ?? [];
  const tick: LiveTick = {
    from: from.clock, to: window.next.clock, events: result?.inserted ?? 0, actions: actions.length,
    matched: actions.filter((a) => a.status === "MATCHED").length, noise: window.bundles.filter((b) => b.noise).length,
    cases_opened: result?.cases_opened ?? [], capped: window.capped,
  };
  // Carry unspent wall time forward; after a cap or a long gap, resume from now instead.
  const resume = window.capped || wanted > MAX_ADVANCE_SECONDS;
  saveState(db, {
    ...s, clock: window.next.clock, cursor: window.next.cursor, wall_ms: resume ? nowMs : wall + (advance * 1000) / LIVE_SPEED, last: tick,
    totals: {
      ticks: s.totals.ticks + 1, events: s.totals.events + tick.events, actions: s.totals.actions + tick.actions,
      matched: s.totals.matched + tick.matched, noise: s.totals.noise + tick.noise, cases_opened: s.totals.cases_opened + tick.cases_opened.length,
    },
  });
  return tick;
}
