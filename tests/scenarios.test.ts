import { beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDatabase } from "@/server/sim/seed";
import { answerTicket, clockOf, decide, GateError, nextStep, pendingDecision } from "@/server/sim/player";
import { capabilitiesFor, type VerifiedPrincipal } from "@/server/auth/policy";
import { currentRunId } from "@/server/services/run";
import { reviewContext } from "@/server/services/review";

let db: Database.Database;
const latest = (staff: string) => db.prepare("SELECT score, raw_score, level FROM risk_scores WHERE staff_id = ? ORDER BY id DESC LIMIT 1").get(staff) as { score: number; raw_score: number; level: string };
const step = () => nextStep(db);
const reviewer: VerifiedPrincipal = { kind: "session", account_id: "test-reviewer", username: "reviewer", staff_id: "STF-0007", roles: ["REVIEWER"], capabilities: capabilitiesFor(["REVIEWER"]), session_id: "test-session" };
const approvePending = () => { const id = pendingDecision(db)!; const review = reviewContext(db, id); return decide(db, reviewer, review.run_id, review.review_ref, id, "APPROVED", null); };
const note = (caseId: string) => {
  const row = db.prepare("SELECT sentences FROM case_notes WHERE case_id = ? ORDER BY version DESC LIMIT 1").get(caseId) as { sentences: string };
  return (JSON.parse(row.sentences) as { text: string }[]).map((s) => s.text).join("\n");
};

beforeAll(() => {
  db = seedDatabase(join(tmpdir(), `sentry-scenarios-${process.pid}.db`)).db;
}, 120_000);

describe("demo path (seed 2026)", () => {
  it("baseline: Tunde's Monday scores 6 and nobody starts at Verify", () => {
    const monday = db.prepare("SELECT score FROM risk_scores WHERE staff_id = 'STF-0101' AND ts = '2026-10-12T23:59:00+01:00'").get() as { score: number };
    expect(monday.score).toBe(6);
    const max = db.prepare("SELECT MAX(score) m FROM risk_scores").get() as { m: number };
    expect(max.m).toBeLessThan(30);
    expect((db.prepare("SELECT COUNT(*) n FROM cases").get() as { n: number }).n).toBe(0);
  });

  it("S1.1 Ngozi: raw 17, effective 6, Normal, no case", () => {
    const r = step();
    expect(r.result).toMatchObject({ toast: "Cleared automatically: overtime approved, all 60 reversals matched." });
    expect(latest("STF-0042")).toEqual({ score: 6, raw_score: 17, level: "NORMAL" });
    expect((db.prepare("SELECT COUNT(*) n FROM cases").get() as { n: number }).n).toBe(0);
  });

  it("S2 Tunde: genuine ticket retains destination contradiction, then hold, watchlist and blocked fan-out", () => {
    step();
    expect(latest("STF-0101").score).toBe(0);
    step();
    expect(latest("STF-0101")).toMatchObject({ score: 38, level: "VERIFY" });
    expect(db.prepare("SELECT id FROM cases WHERE staff_id = 'STF-0101'").get()).toEqual({ id: "CASE-0001" });
    expect(() => step()).toThrow(GateError);
    expect(answerTicket(db, { ...reviewer, account_id: "test-operator", staff_id: "STF-0101", roles: ["OPERATOR"], capabilities: capabilitiesFor(["OPERATOR"]) }, currentRunId(db), "ACT-S2-1", "TKT-2291", clockOf(db))).toMatchObject({ valid: true, status: "WRONG_BENEFICIARY" });
    step();
    expect(latest("STF-0101")).toMatchObject({ score: 38, level: "VERIFY" });
    step();
    expect(latest("STF-0101")).toMatchObject({ score: 64, level: "HOLD" });
    const hold = db.prepare("SELECT status, target FROM interventions WHERE type = 'HOLD_FUNDS'").get() as { status: string; target: string };
    expect(hold.status).toBe("PENDING_APPROVAL");
    expect(JSON.parse(hold.target).amount).toBe(5_835_000);
    expect(() => step()).toThrow(GateError);
    approvePending();
    const watch = db.prepare("SELECT COUNT(*) n, MIN(expires_at) e FROM bvn_watchlist WHERE status = 'ACTIVE'").get() as { n: number; e: string };
    expect(watch).toEqual({ n: 6, e: "2026-10-17T21:53:00+01:00" });
    expect((db.prepare("SELECT COUNT(*) n FROM interventions WHERE type = 'CONTACT_BVN_OWNER'").get() as { n: number }).n).toBe(6);
    step();
    expect(latest("STF-0101")).toMatchObject({ score: 81, level: "CONTAIN" });
    const blocked = db.prepare("SELECT to_bank, COUNT(*) n, SUM(amount) s FROM outbound_transfers WHERE status = 'BLOCKED_BY_HOLD' GROUP BY to_bank ORDER BY to_bank").all();
    expect(blocked).toEqual([
      { to_bank: "Bank A", n: 5, s: 1_150_000 }, { to_bank: "Bank B", n: 8, s: 1_420_000 }, { to_bank: "Bank C", n: 6, s: 980_000 },
      { to_bank: "Bank D", n: 4, s: 740_000 }, { to_bank: "Bank E", n: 5, s: 895_000 }, { to_bank: "Bank F", n: 3, s: 650_000 },
    ]);
    expect(() => step()).toThrow(GateError);
    approvePending();
    expect(db.prepare("SELECT status FROM cases WHERE id = 'CASE-0001'").get()).toEqual({ status: "CONTAINED" });
    expect(note("CASE-0001")).toBe(
      [
        "6 reversals did not return money to the debited customers.",
        "All 6 credited accounts were opened in the last 7 days.",
        "All posted 21:47 to 21:53, outside the user's rostered shift.",
        "Beneficiaries tried to send to 31 accounts at 21:58; stopped by the hold.",
        "Recommended: suspend session, keep hold, escalate to Internal Control.",
        "Analyst decision required.",
      ].join("\n"),
    );
  });

  it("S3 Bisi: 35 → 55 → 70 → 85, data restricted, export blocked", () => {
    const expected: [number, string][] = [[35, "VERIFY"], [55, "VERIFY"], [70, "HOLD"], [85, "CONTAIN"]];
    for (const [score, level] of expected) {
      step();
      expect(latest("STF-0388")).toMatchObject({ score, level });
    }
    expect(db.prepare("SELECT status FROM sensitive_actions WHERE id = 'ACT-S3-EXPORT'").get()).toEqual({ status: "BLOCKED" });
    expect(db.prepare("SELECT status FROM interventions WHERE case_id = 'CASE-0002' AND type = 'RESTRICT_DATA_ACCESS'").get()).toEqual({ status: "ACTIVE" });
    approvePending();
    expect(note("CASE-0002")).toContain("The user logged in at 22:05 while on approved leave.");
    expect(note("CASE-0002")).toContain("A bulk export of 5,000 customer rows had no approved ticket; it was blocked.");
  });

  it("S4 leak tracer: Kemi 35, Verify, CASE-0003; other viewers clean", () => {
    step();
    expect(latest("STF-0389")).toMatchObject({ score: 35, level: "VERIFY" });
    expect(db.prepare("SELECT id FROM cases WHERE staff_id = 'STF-0389'").get()).toEqual({ id: "CASE-0003" });
    for (const id of ["STF-0390", "STF-0391", "STF-0392", "STF-0393"]) expect(latest(id).score).toBeLessThan(30);
    expect(step().done).toBe(true);
  });

  it("engines never read ground truth", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    for (const f of readdirSync("src/server/engines")) expect(readFileSync(`src/server/engines/${f}`, "utf8")).not.toContain("is_malicious");
  });
});
