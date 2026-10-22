import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { copyFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openDatabase } from "@/server/db/migrate";
import { seedDatabase, TEMPLATE_VERSION } from "@/server/sim/seed";
import { answerTicket, clockOf, GateError, nextStep, pendingDecision, rehearse } from "@/server/sim/player";
import { STEPS } from "@/server/sim/scenarios";
import { PARTNERS, S5_PARTNER } from "@/server/sim/partners";
import { closePartnerCaseJustified, decidePartnerResponse, ingestPartnerCalls, partnerReviewContext, partnerView, pendingPartnerResponse } from "@/server/services/partners";
import { caseList, consoleView, partners } from "@/server/services/read";
import { liveState, liveTick, setLive } from "@/server/sim/live";
import { capabilitiesFor, type VerifiedPrincipal } from "@/server/auth/policy";
import { reviewContext } from "@/server/services/review";
import { decide } from "@/server/sim/player";
import { currentRunId } from "@/server/services/run";
import { POST as partnerIngestRoute } from "@/app/api/ingest/partner-calls/route";
import { db as demoDb, seedTemplateName } from "@/server/services/demo";

const template = join(tmpdir(), `sentry-partners-template-${process.pid}.db`);
const opened: { db: Database.Database; path: string }[] = [];
const count = (db: Database.Database, sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { n: number }).n;
const reviewer: VerifiedPrincipal = { kind: "session", account_id: "test-reviewer", username: "reviewer", staff_id: "STF-0007", roles: ["REVIEWER"], capabilities: capabilitiesFor(["REVIEWER"]), session_id: "s-1" };
const owner: VerifiedPrincipal = { ...reviewer, account_id: "test-owner", staff_id: S5_PARTNER.owner };
const auditor: VerifiedPrincipal = { ...reviewer, account_id: "test-auditor", staff_id: null, roles: ["AUDITOR"], capabilities: capabilitiesFor(["AUDITOR"]) };

function fresh(name: string): Database.Database {
  const path = join(tmpdir(), `sentry-partners-${name}-${process.pid}.db`);
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) rmSync(path + suffix);
  copyFileSync(template, path);
  const db = openDatabase(path);
  opened.push({ db, path });
  return db;
}

/** Runs scripted steps, approving staff gates and answering the operator ticket, until `stop` is next. */
function runUntil(db: Database.Database, stop: string) {
  for (;;) {
    const gate = pendingDecision(db);
    if (gate) { const c = reviewContext(db, gate); decide(db, reviewer, c.run_id, c.review_ref, gate, "APPROVED", null); continue; }
    const step = (db.prepare("SELECT value FROM sim_state WHERE key = 'step_index'").get() as { value: string }).value;
    if (STEPS[Number(step)]?.id === stop) return;
    try { nextStep(db); } catch (error) {
      if (!(error instanceof GateError)) throw error;
      // S2.2 waits for the operator's genuine ticket.
      answerTicket(db, { ...reviewer, account_id: "op", staff_id: "STF-0101", roles: ["OPERATOR"], capabilities: capabilitiesFor(["OPERATOR"]) }, currentRunId(db), "ACT-S2-1", "TKT-2291", clockOf(db));
    }
  }
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

describe("partner baseline", () => {
  it("seeds six fictional partners with 30 days of consented traffic and no partner case", () => {
    const db = fresh("baseline");
    expect(count(db, "SELECT COUNT(*) n FROM api_partners")).toBe(6);
    expect(count(db, "SELECT COUNT(*) n FROM api_partners WHERE partner_type = 'Open-banking fintech'")).toBe(6);
    expect(count(db, "SELECT COUNT(DISTINCT substr(ts, 1, 10)) n FROM partner_api_calls")).toBe(30);
    expect(count(db, "SELECT COUNT(*) n FROM partner_call_checks WHERE status <> 'MATCHED'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM partner_cases")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM partner_risk_scores WHERE score >= 30")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM api_keys WHERE status = 'ACTIVE'")).toBe(6);
    expect(PARTNERS.map((p) => p.name)).not.toContain("Kora Pay");
  });
});

describe("S5 · partner API key subleased", () => {
  it("rehearses S1–S4 unchanged, then S5 along its expected path", () => {
    const db = fresh("rehearse");
    const log = rehearse(db);
    expect(log.map((s) => `${s.step} ${s.score ?? "-"}`)).toEqual([
      "S1.1 6", "S2.0 -", "S2.1 38", "S2.2 38", "S2.3 64", "S2.4 81", "S3.1 35", "S3.2 55", "S3.3 70", "S3.4 85", "S4.1 35",
      "S5.1 20", "S5.2 50", "S5.3 75", "S5.4 75",
    ]);
    const scores = db.prepare("SELECT step_id, score, level FROM partner_risk_scores WHERE step_id LIKE 'S5%' ORDER BY id").all();
    expect(scores).toEqual([
      { step_id: "S5.1", score: 20, level: "WATCH" }, { step_id: "S5.2", score: 50, level: "VERIFY" },
      { step_id: "S5.3", score: 75, level: "HOLD" }, { step_id: "S5.4", score: 75, level: "HOLD" },
    ]);
    expect(db.prepare("SELECT id, status, level, peak_score FROM partner_cases").all()).toEqual([{ id: "PCASE-0001", status: "CONTAINED", level: "HOLD", peak_score: 75 }]);
    expect(db.prepare("SELECT type, status, automatic FROM partner_responses ORDER BY id").all()).toEqual([
      { type: "RATE_LIMIT_KEY", status: "ACTIVE", automatic: 1 }, { type: "SUSPEND_KEY", status: "APPROVED", automatic: 0 },
    ]);
    expect(db.prepare("SELECT status FROM api_keys WHERE id = ?").get(S5_PARTNER.key)).toEqual({ status: "SUSPENDED" });
    expect(count(db, "SELECT COUNT(*) n FROM partner_api_calls WHERE id GLOB 'PCALL-S54-*' AND status = 'BLOCKED'")).toBe(5);
    // Staff cases are unchanged by S5.
    expect(db.prepare("SELECT id, staff_id FROM cases ORDER BY id").all()).toEqual([{ id: "CASE-0001", staff_id: "STF-0101" }, { id: "CASE-0002", staff_id: "STF-0388" }, { id: "CASE-0003", staff_id: "STF-0389" }]);
    // The console and cases list show the partner case, labelled "Partner".
    expect(caseList(db).filter((c) => c.kind === "PARTNER").map((c) => c.id)).toEqual(["PCASE-0001"]);
    expect((consoleView(db).top_risk as { kind: string; pseudo_id: string }[]).some((r) => r.kind === "PARTNER" && r.pseudo_id === "Quillmark Pay")).toBe(true);
  }, 180_000);

  it("gates on the Reviewer at S5.3; factors appear step by step; a rejection keeps the key rate-limited", () => {
    const db = fresh("gate");
    runUntil(db, "S5.1");
    expect(nextStep(db).result).toMatchObject({ score: 20, level: "WATCH" });
    expect(count(db, "SELECT COUNT(*) n FROM partner_cases")).toBe(0);
    expect(nextStep(db).result).toMatchObject({ score: 50, level: "VERIFY" });
    expect(db.prepare("SELECT code FROM partner_signals WHERE partner_id = ? ORDER BY code").all(S5_PARTNER.id)).toEqual([{ code: "KEY_MULTI_NETWORK" }, { code: "LOOKUP_WITHOUT_BUSINESS" }, { code: "SEQUENTIAL_ENUMERATION" }]);
    expect(count(db, "SELECT COUNT(*) n FROM partner_cases WHERE status = 'OPEN'")).toBe(1);
    expect(nextStep(db).result).toMatchObject({ score: 75, level: "HOLD" });
    expect(db.prepare("SELECT status FROM api_keys WHERE id = ?").get(S5_PARTNER.key)).toEqual({ status: "RATE_LIMITED" });
    const pending = pendingPartnerResponse(db)!;
    expect(pending).toBe("PRSP-0002");
    expect(() => nextStep(db)).toThrow(GateError);

    const ctx = partnerReviewContext(db, pending);
    expect(() => decidePartnerResponse(db, auditor, ctx.run_id, ctx.review_ref, pending, "APPROVED", null)).toThrow(/permission denied/);
    expect(() => decidePartnerResponse(db, owner, ctx.run_id, ctx.review_ref, pending, "APPROVED", null)).toThrow(/manages this partner/);
    expect(() => decidePartnerResponse(db, reviewer, ctx.run_id, `REV-${"0".repeat(64)}`, pending, "APPROVED", null)).toThrow(/review the current evidence/);
    expect(count(db, "SELECT COUNT(*) n FROM audit_log WHERE action = 'DECISION_STALE' AND target_id = ?", pending)).toBe(1);
    decidePartnerResponse(db, reviewer, ctx.run_id, ctx.review_ref, pending, "REJECTED", "not enough to suspend");
    expect(db.prepare("SELECT status FROM api_keys WHERE id = ?").get(S5_PARTNER.key)).toEqual({ status: "RATE_LIMITED" });
    expect(db.prepare("SELECT action, actor FROM audit_log WHERE target_id = ? ORDER BY id DESC LIMIT 1").get(pending)).toEqual({ action: "REJECT", actor: "test-reviewer" });

    // Not suspended, so S5.4's calls are not blocked.
    nextStep(db);
    expect(count(db, "SELECT COUNT(*) n FROM partner_api_calls WHERE id GLOB 'PCALL-S54-*' AND status = 'BLOCKED'")).toBe(0);

    // "Justified" closes the case and restores the key.
    const justify = partnerReviewContext(db, "PCASE-0001");
    closePartnerCaseJustified(db, reviewer, justify.run_id, justify.review_ref, "PCASE-0001", "partner rotated its key");
    expect(db.prepare("SELECT status FROM partner_cases").get()).toEqual({ status: "CLOSED_JUSTIFIED" });
    expect(db.prepare("SELECT status FROM api_keys WHERE id = ?").get(S5_PARTNER.key)).toEqual({ status: "ACTIVE" });
    expect(count(db, "SELECT COUNT(*) n FROM partner_responses WHERE status <> 'RELEASED' AND status <> 'REJECTED'")).toBe(0);
  }, 180_000);

  it("shows customers only as ••••last4 and keys only by label", () => {
    const db = fresh("privacy");
    rehearse(db);
    const view = JSON.stringify(partnerView(db, S5_PARTNER.id));
    expect(view).not.toMatch(/\b\d{10}\b/);
    expect(view).not.toMatch(/CUS-\d/);
    expect(view).toContain("••••");
    expect(view).toContain(S5_PARTNER.label);
    expect(JSON.stringify(partners(db))).not.toMatch(/\b\d{10}\b/);
  }, 180_000);
});

describe("partner calls ingest", () => {
  it("treats a call after revoked consent as a hard contradiction that always opens review", () => {
    const db = fresh("revoked");
    const partner = PARTNERS[1];
    const consent = db.prepare("SELECT customer_id FROM customer_consents WHERE partner_id = ? AND revoked_at IS NOT NULL ORDER BY id LIMIT 1").get(partner.id) as { customer_id: string };
    const r = ingestPartnerCalls(db, [{ id: "PC-T-1", key_id: partner.key, endpoint: "GET /accounts/balance", scope: "balance", customer_id: consent.customer_id, account_no: String(1000000000 + Number(consent.customer_id.slice(4))), source_network: partner.networks[0], ts: "2026-10-16T20:20:00+01:00" }]);
    expect(r.calls).toEqual([{ id: "PC-T-1", status: "ALLOWED", http: 200, check: "CONSENT_ENDED" }]);
    expect(r.scored[0]).toMatchObject({ score: 25, review_required: true });
    expect(r.cases_opened).toEqual(["PCASE-0001"]);
    expect(ingestPartnerCalls(db, [{ id: "PC-T-1", key_id: partner.key, endpoint: "GET /accounts/balance", scope: "balance", customer_id: consent.customer_id, account_no: "1000000001", source_network: "x", ts: "2026-10-16T20:21:00+01:00" }]))
      .toMatchObject({ inserted: 0, duplicates: ["PC-T-1"] });
    expect(ingestPartnerCalls(db, [{ id: "PC-T-2", key_id: S5_PARTNER.key, endpoint: "GET /accounts/balance", scope: "balance", customer_id: "CUS-01842", account_no: "1000001842", source_network: "x", ts: "2026-10-16T20:21:00+01:00" }]).rejected)
      .toEqual([{ id: "PC-T-2", reason: "partner is part of scripted scenario S5" }]);
  });

  it("rejects a missing or wrong ingest key", async () => {
    const request = (key?: string) => new Request("http://127.0.0.1:3000/api/ingest/partner-calls", { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "X-Ingest-Key": key } : {}) }, body: JSON.stringify({ calls: [] }) });
    expect((await partnerIngestRoute(request())).status).toBe(401);
    expect((await partnerIngestRoute(request("wrong"))).status).toBe(401);
    expect((await partnerIngestRoute(request(process.env.INGEST_KEY))).status).toBe(400);
  });

  it("10 minutes of live ticks add partner calls within consent and open no partner case", () => {
    const db = fresh("live");
    const t0 = 1_800_000_000_000;
    setLive(db, true, "test", t0);
    for (let i = 1; i <= 200; i++) liveTick(db, t0 + i * 3000);
    const s = liveState(db);
    expect(s.totals.partner_calls).toBeGreaterThan(20);
    expect(s.totals.partner_cases_opened).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM partner_cases")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM partner_api_calls c JOIN partner_call_checks k ON k.call_id = c.id WHERE c.scenario_tag = 'INGEST' AND k.status <> 'MATCHED'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM partner_api_calls c JOIN api_keys k ON k.id = c.key_id WHERE c.scenario_tag = 'INGEST' AND k.partner_id = ?", S5_PARTNER.id)).toBe(0);
  }, 180_000);
});

describe("template version", () => {
  it("rebuilds a database seeded from an older template, and removes the older template file", () => {
    const path = process.env.DB_PATH!;
    const current = join(dirname(path), seedTemplateName());
    const stale = join(dirname(path), "seed-2026.db");
    const first = demoDb();
    expect((first.prepare("SELECT value FROM sim_state WHERE key = 'template_version'").get() as { value: string }).value).toBe(TEMPLATE_VERSION);
    // Simulate a volume from the previous release: an older template file and a database seeded from it.
    first.prepare("UPDATE sim_state SET value = 'v1' WHERE key = 'template_version'").run();
    first.prepare("INSERT INTO cases VALUES ('CASE-OLD','STF-0101','2026-10-16T20:00:00+01:00','OPEN',0,'NORMAL',0)").run();
    rmSync(current, { force: true });
    writeFileSync(stale, "older template");
    const rebuilt = demoDb();
    expect((rebuilt.prepare("SELECT value FROM sim_state WHERE key = 'template_version'").get() as { value: string }).value).toBe(TEMPLATE_VERSION);
    expect(count(rebuilt, "SELECT COUNT(*) n FROM cases")).toBe(0);
    expect(count(rebuilt, "SELECT COUNT(*) n FROM api_partners")).toBe(6);
    expect(existsSync(current)).toBe(true);
    expect(existsSync(stale)).toBe(false);
  }, 180_000);
});
