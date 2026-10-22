import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@/server/db/migrate";
import { seedDatabase, START_CLOCK } from "@/server/sim/seed";
import { clockOf, rehearse } from "@/server/sim/player";
import { prepareDemoWorkspaceTemplate } from "@/server/services/demo";
import { CHARACTERS } from "@/server/sim/generator";
import { ingestEvents } from "@/server/services/ingest";
import { DESK_SIZE, liveContext, liveSource, liveState, liveTick, liveWindow, setLive } from "@/server/sim/live";
import { addMinutes } from "@/server/time";
import { POST as ingestRoute } from "@/app/api/ingest/events/route";
import type { IngestEvent } from "@/shared/schemas";

const template = join(tmpdir(), `sentry-live-template-${process.pid}.db`);
const opened: { db: Database.Database; path: string }[] = [];
const scripted = new Set<string>([CHARACTERS.approver, CHARACTERS.ngozi, CHARACTERS.tunde, CHARACTERS.bisi, CHARACTERS.kemi, ...CHARACTERS.otherViewers, CHARACTERS.agent]);
const count = (db: Database.Database, sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { n: number }).n;

function fresh(name: string, from = template): Database.Database {
  const path = join(tmpdir(), `sentry-live-${name}-${process.pid}.db`);
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) rmSync(path + suffix);
  copyFileSync(from, path);
  const db = openDatabase(path);
  opened.push({ db, path });
  return db;
}

/** Ten real minutes of console refreshes, one every three seconds. */
function tenMinutesOfTicks(db: Database.Database) {
  const t0 = 1_800_000_000_000;
  setLive(db, true, "test-presenter", t0);
  for (let i = 1; i <= 200; i++) liveTick(db, t0 + i * 3000);
}

beforeAll(() => {
  const { db } = seedDatabase(template);
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
}, 180_000);

afterAll(() => {
  for (const { db, path } of opened) {
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) rmSync(path + suffix);
  }
});

describe("POST /api/ingest/events", () => {
  const request = (headers: Record<string, string>, body: unknown = { events: [] }) =>
    new Request("http://127.0.0.1:3000/api/ingest/events", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("rejects a missing or wrong key, and an invalid batch", async () => {
    const configured = process.env.INGEST_KEY;
    process.env.INGEST_KEY = "test-ingest-key";
    expect((await ingestRoute(request({}))).status).toBe(401);
    expect((await ingestRoute(request({ "X-Ingest-Key": "wrong-key" }))).status).toBe(401);
    expect((await ingestRoute(request({ "X-Ingest-Key": "test-ingest-key" }, { events: [] }))).status).toBe(400);
    expect((await ingestRoute(request({ "X-Ingest-Key": "test-ingest-key" }, { events: [{ type: "reversal", id: "X1" }] }))).status).toBe(400);
    delete process.env.INGEST_KEY;
    expect((await ingestRoute(request({ "X-Ingest-Key": "test-ingest-key" }))).status).toBe(401);
    process.env.INGEST_KEY = configured;
  });
});

describe("ingest service", () => {
  it("ignores duplicate event ids, within and across batches", () => {
    const db = fresh("dup");
    const worker = liveContext(db, "2026-10-16", START_CLOCK).workers.find((w) => w.kind === "REVERSAL")!;
    const base = { staff_id: worker.staff_id, session_id: "SES-T-1", terminal_id: worker.terminal, ts: "2026-10-16T20:30:10+01:00" };
    const events: IngestEvent[] = [
      { type: "failed_debit", id: "TXN-T-1", ts: "2026-10-16T20:01:00+01:00", debit_account_id: "ACC-000100", amount: 25_000 },
      { type: "login", id: "LOG-T-1", ...base, ts: "2026-10-16T20:29:00+01:00" },
      { type: "reversal", id: "ACT-T-1", ...base, original_txn_id: "TXN-T-1", credit_account_id: "ACC-000100", amount: 25_000 },
      { type: "reversal", id: "ACT-T-1", ...base, original_txn_id: "TXN-T-1", credit_account_id: "ACC-000200", amount: 25_000 },
    ];
    const first = ingestEvents(db, events);
    expect(first).toMatchObject({ inserted: 3, duplicates: ["ACT-T-1"], rejected: [], actions: [{ id: "ACT-T-1", status: "MATCHED" }], cases_opened: [] });
    const scores = count(db, "SELECT COUNT(*) n FROM risk_scores");
    const second = ingestEvents(db, events);
    expect(second).toMatchObject({ inserted: 0, duplicates: ["TXN-T-1", "LOG-T-1", "ACT-T-1", "ACT-T-1"], actions: [], scored: [] });
    expect(count(db, "SELECT COUNT(*) n FROM sensitive_actions WHERE id = 'ACT-T-1'")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM risk_scores")).toBe(scores);
  });

  it("refuses scripted characters and scenario records, so S1–S4 cannot be disturbed", () => {
    const db = fresh("reserved");
    const r = ingestEvents(db, [
      { type: "record_view", id: "ACT-T-2", staff_id: CHARACTERS.tunde, session_id: "SES-T-2", terminal_id: "TRM-0101", ts: "2026-10-16T20:30:00+01:00", customer_id: "CUS-01001", ticket_ref: "TKT-01001" },
      { type: "failed_debit", id: "TXN-58213", ts: "2026-10-16T20:30:00+01:00", debit_account_id: "ACC-000100", amount: 1000 },
      { type: "failed_debit", id: "ACT-S2-2", ts: "2026-10-16T20:30:00+01:00", debit_account_id: "ACC-000100", amount: 1000 },
    ]);
    expect(r.inserted).toBe(0);
    expect(r.duplicates).toEqual(["TXN-58213"]);
    expect(r.rejected.map((x) => x.id)).toEqual(["ACT-T-2", "ACT-S2-2"]);
  });

  it("still opens a case for a genuinely contradicted reversal", () => {
    const db = fresh("bad");
    const worker = liveContext(db, "2026-10-16", START_CLOCK).workers.find((w) => w.kind === "REVERSAL")!;
    const r = ingestEvents(db, [
      { type: "reversal", id: "ACT-T-3", staff_id: worker.staff_id, session_id: "SES-T-3", terminal_id: worker.terminal, ts: "2026-10-16T20:31:00+01:00", original_txn_id: "TXN-DOES-NOT-EXIST", credit_account_id: "ACC-000300", amount: 50_000 },
    ]);
    expect(r.actions).toEqual([{ id: "ACT-T-3", type: "REVERSAL", status: "NO_MATCH" }]);
    expect(r.scored[0]).toMatchObject({ staff_id: worker.staff_id, review_required: true });
    expect(r.cases_opened).toEqual(["CASE-0001"]);
  });
});

describe("live generator", () => {
  it("legitimate generated events produce MATCHED purpose results", () => {
    const db = fresh("matched");
    const window = liveWindow(liveSource(db, START_CLOCK), { clock: START_CLOCK, cursor: "" }, addMinutes(START_CLOCK, 40), new Set(), 10_000);
    const actions = window.events.filter((e) => e.type === "reversal" || e.type === "record_view");
    expect(actions.length).toBeGreaterThan(100);
    expect(window.events.some((e) => "staff_id" in e && scripted.has(e.staff_id))).toBe(false);
    const legit = window.bundles.filter((b) => !b.noise);
    expect(legit.length / window.bundles.length).toBeGreaterThan(0.9);
    const result = ingestEvents(db, window.events.slice(0, 200));
    expect(result.rejected).toEqual([]);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.every((a) => a.status === "MATCHED")).toBe(true);
    expect(result.cases_opened).toEqual([]);
  });

  it("is deterministic and never exceeds 20 events per window", () => {
    const db = fresh("determinism");
    const a = liveWindow(liveSource(db, START_CLOCK), { clock: START_CLOCK, cursor: "" }, addMinutes(START_CLOCK, 5), new Set());
    const b = liveWindow(liveSource(db, START_CLOCK), { clock: START_CLOCK, cursor: "" }, addMinutes(START_CLOCK, 5), new Set());
    expect(a.events).toEqual(b.events);
    expect(a.events.length).toBeLessThanOrEqual(20);
    expect(a.capped).toBe(true);
  });

  it("10 minutes of live ticks open zero cases", () => {
    const db = fresh("ticks");
    tenMinutesOfTicks(db);
    const s = liveState(db);
    expect(s.totals.ticks).toBe(200);
    expect(s.totals.actions).toBeGreaterThan(100);
    expect(s.totals.matched).toBe(s.totals.actions);
    expect(s.totals.cases_opened).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM cases")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM risk_scores WHERE step_id = 'INGEST' AND score >= 30")).toBe(0);
    const live = db.prepare("SELECT DISTINCT staff_id FROM sensitive_actions WHERE scenario_tag = 'INGEST'").all() as { staff_id: string }[];
    expect(live.some((r) => scripted.has(r.staff_id))).toBe(false);
  }, 120_000);

  it("leaves the scripted S1–S4 rehearsal unchanged", () => {
    const clean = fresh("rehearse-clean");
    const withLive = fresh("rehearse-live");
    tenMinutesOfTicks(withLive);
    const outcome = (db: Database.Database) => ({
      log: rehearse(db),
      cases: db.prepare("SELECT id, staff_id, status, peak_score, level FROM cases ORDER BY id").all(),
      interventions: db.prepare("SELECT id, case_id, staff_id, type, status, target FROM interventions ORDER BY id").all(),
      scripted: db.prepare("SELECT staff_id, ts, score, raw_score, level, breakdown, step_id FROM risk_scores WHERE step_id LIKE 'S_._' ORDER BY id").all(),
    });
    const expected = outcome(clean);
    expect(expected.log.map((s) => s.step)).toEqual(["S1.1", "S2.0", "S2.1", "S2.2", "S2.3", "S2.4", "S3.1", "S3.2", "S3.3", "S3.4", "S4.1"]);
    expect(outcome(withLive)).toEqual(expected);
  }, 180_000);

  describe("evening operations desk", () => {
    let prepared = "";
    beforeAll(() => {
      process.env.SENTRY_DEMO_MODE = "1";
      prepared = prepareDemoWorkspaceTemplate().path;
      delete process.env.SENTRY_DEMO_MODE;
    });

    it("gives a freshly prepared visitor workspace at 21:47 live events within 10 seconds, and 10 minutes open no case", () => {
      const db = fresh("desk", prepared);
      expect(clockOf(db)).toBe("2026-10-16T21:47:00+01:00");
      const casesBefore = count(db, "SELECT COUNT(*) n FROM cases");
      const t0 = 1_800_000_000_000;
      setLive(db, true, "test-presenter", t0);
      const desk = liveState(db).desk!;
      expect(desk).toHaveLength(DESK_SIZE);
      expect(desk.some((id) => scripted.has(id))).toBe(false);
      const overtime = db.prepare(`SELECT o.staff_id, o.start, o."end", o.approved_by_staff_id, t.status, t.type, t.created_by_staff_id, t.approved_by_staff_id AS ticket_approver
        FROM overtime o JOIN tickets t ON t.id = o.ticket_ref WHERE o.id GLOB 'OT-LIVE-*' ORDER BY o.staff_id`).all() as Record<string, string>[];
      expect(overtime.map((o) => o.staff_id)).toEqual(desk);
      for (const o of overtime) {
        expect(o).toMatchObject({ start: "17:00", end: "23:59", status: "APPROVED", type: "OVERTIME", created_by_staff_id: o.staff_id, ticket_approver: o.approved_by_staff_id });
        expect(o.approved_by_staff_id).not.toBe(o.staff_id);
      }
      for (const ms of [3000, 6000, 9000]) liveTick(db, t0 + ms);
      expect(liveState(db).totals.actions).toBeGreaterThan(0);
      for (let i = 4; i <= 200; i++) liveTick(db, t0 + i * 3000);
      const s = liveState(db);
      expect(s.totals.actions).toBeGreaterThan(50);
      expect(s.totals.matched).toBe(s.totals.actions);
      expect(s.totals.cases_opened).toBe(0);
      expect(count(db, "SELECT COUNT(*) n FROM cases")).toBe(casesBefore);
      // Desk work is inside approved overtime: no un-waived outside-roster points for any desk member.
      expect(count(db, `SELECT COUNT(*) n FROM signals WHERE code = 'OUTSIDE_ROSTER' AND effective_points > 0 AND staff_id IN (${desk.map(() => "?").join(",")})`, ...desk)).toBe(0);
      expect(count(db, "SELECT COUNT(*) n FROM risk_scores WHERE step_id = 'INGEST' AND score >= 30")).toBe(0);
      // Switching off and on again keeps the same desk.
      setLive(db, false, "test-presenter", t0 + 700_000);
      expect(setLive(db, true, "test-presenter", t0 + 800_000).desk).toEqual(desk);
      expect(count(db, "SELECT COUNT(*) n FROM overtime WHERE id GLOB 'OT-LIVE-*'")).toBe(DESK_SIZE);
    }, 180_000);

    it("leaves the rest of the scripted rehearsal unchanged from a prepared workspace", () => {
      const clean = fresh("desk-clean", prepared);
      const withLive = fresh("desk-live", prepared);
      const t0 = 1_800_000_000_000;
      setLive(withLive, true, "test-presenter", t0);
      for (let i = 1; i <= 100; i++) liveTick(withLive, t0 + i * 3000);
      const outcome = (db: Database.Database) => ({
        log: rehearse(db),
        cases: db.prepare("SELECT id, staff_id, status, peak_score, level FROM cases ORDER BY id").all(),
        interventions: db.prepare("SELECT id, case_id, staff_id, type, status, target FROM interventions ORDER BY id").all(),
        scripted: db.prepare("SELECT staff_id, ts, score, raw_score, level, breakdown, step_id FROM risk_scores WHERE step_id LIKE 'S_._' ORDER BY id").all(),
      });
      expect(outcome(withLive)).toEqual(outcome(clean));
    }, 180_000);
  });
});
