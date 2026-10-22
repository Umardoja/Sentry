import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { authDb, closeAuthDb } from "@/server/auth/request";
import { hasReveal, login, provisionAccounts, sessionFromToken } from "@/server/auth/store";
import { db as demoDb, resetDemo } from "@/server/services/demo";
import { caseView } from "@/server/services/read";
import { evidenceRevision, reviewContext } from "@/server/services/review";
import { currentRunId, rotateRunId } from "@/server/services/run";
import { revealIdentity } from "@/server/services/secureActions";
import { answerTicket, clockOf, decide, nextStep, pendingDecision } from "@/server/sim/player";
import { POST as answerRoute } from "@/app/api/actions/[id]/answer/route";
import { POST as approveRoute } from "@/app/api/interventions/[id]/approve/route";
import { POST as unmaskRoute } from "@/app/api/cases/[id]/unmask/route";
import { POST as nextRoute } from "@/app/api/scenarios/[id]/next/route";
import { POST as resetRoute } from "@/app/api/sim/reset/route";
import { openDatabase, resetDatabase } from "@/server/db/migrate";

const origin = "http://127.0.0.1:3000";
let business: Database.Database;
let operatorSession: ReturnType<typeof login>;
let reviewerSession: ReturnType<typeof login>;
let secondReviewerSession: ReturnType<typeof login>;
let controllerSession: ReturnType<typeof login>;
let runADecision: { run_id: string; review_ref: string; intervention_id: string };

const requestHeaders = (issued: NonNullable<ReturnType<typeof login>>) => ({
  "content-type": "application/json", origin, "x-sentry-request": "1", "x-csrf-token": issued.csrf_token,
  cookie: `sentry_session=${issued.token}`,
});

const advanceToWrongDestination = () => {
  nextStep(business); // S1.1
  nextStep(business); // S2.0
  nextStep(business); // S2.1
};

beforeAll(() => {
  resetDemo();
  business = demoDb();
  const auth = authDb();
  provisionAccounts(auth, [
    { id: "evidence-operator", username: "evidence-operator", password: "synthetic operator password", roles: ["OPERATOR"], staff_id: "STF-0101" },
    { id: "evidence-reviewer", username: "evidence-reviewer", password: "synthetic reviewer password", roles: ["REVIEWER"], staff_id: "STF-0007" },
    { id: "evidence-reviewer-2", username: "evidence-reviewer-2", password: "synthetic reviewer two password", roles: ["REVIEWER"], staff_id: "STF-0007" },
    { id: "evidence-controller", username: "evidence-controller", password: "synthetic controller password", roles: ["SIMULATION_CONTROLLER"], staff_id: null },
  ]);
  operatorSession = login(auth, "evidence-operator", "synthetic operator password")!;
  reviewerSession = login(auth, "evidence-reviewer", "synthetic reviewer password")!;
  secondReviewerSession = login(auth, "evidence-reviewer-2", "synthetic reviewer two password")!;
  controllerSession = login(auth, "evidence-controller", "synthetic controller password")!;
  advanceToWrongDestination();
}, 120_000);

describe("run-bound evidence review", () => {
  it("submits the genuine ticket through the authenticated route and reports newer evidence than score", async () => {
    const runId = currentRunId(business);
    const response = await answerRoute(new Request(`${origin}/api/actions/ACT-S2-1/answer`, {
      method: "POST", headers: requestHeaders(operatorSession!), body: JSON.stringify({ run_id: runId, ticket_ref: "TKT-2291" }),
    }), { params: Promise.resolve({ id: "ACT-S2-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ valid: true, status: "WRONG_BENEFICIARY", message: "Ticket verified. Destination mismatch remains. Review still required." });
    expect(business.prepare("SELECT 1 FROM signals WHERE code = 'REVERSAL_WRONG_BENEFICIARY' AND staff_id = 'STF-0101'").get()).toBeTruthy();
    const view = caseView(business, "CASE-0001")!;
    expect(view.prompt).toMatchObject({ ticket_ref: "TKT-2291", valid: true, message: "Ticket verified. Destination mismatch remains. Review still required." });
    expect(view.freshness.score_is_current).toBe(false);
    expect(view.freshness.evidence?.trigger).toBe("TICKET_ANSWER");
  });

  it("invalidates changed material facts but ignores audit traffic and identical supporting evidence", async () => {
    nextStep(business); // S2.2, score after verified ticket
    nextStep(business); // S2.3, hold proposal
    const id = pendingDecision(business)!;
    const reviewed = reviewContext(business, id);
    runADecision = { ...reviewed, intervention_id: id };
    const missingContext = await approveRoute(new Request(`${origin}/api/interventions/${id}/approve`, { method: "POST", headers: requestHeaders(reviewerSession!), body: "{}" }), { params: Promise.resolve({ id }) });
    expect(missingContext.status).toBe(400);
    expect(business.prepare("SELECT status FROM interventions WHERE id = ?").get(id)).toEqual({ status: "PENDING_APPROVAL" });
    business.prepare("INSERT INTO audit_log (ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)")
      .run(clockOf(business), "test", "POLL_NOISE", "sim", "demo", "{}");
    expect(reviewContext(business, id).review_ref).toBe(reviewed.review_ref);

    const purpose = business.prepare("SELECT reason FROM purpose_results WHERE action_id = 'ACT-S2-1'").get() as { reason: string };
    business.prepare("UPDATE purpose_results SET reason = ? WHERE action_id = 'ACT-S2-1'").run(`${purpose.reason} (changed)`);
    const stalePurpose = await approveRoute(new Request(`${origin}/api/interventions/${id}/approve`, { method: "POST", headers: requestHeaders(reviewerSession!), body: JSON.stringify({ run_id: reviewed.run_id, review_ref: reviewed.review_ref }) }), { params: Promise.resolve({ id }) });
    expect(stalePurpose.status).toBe(409);
    expect(await stalePurpose.json()).toMatchObject({ code: "REVIEW_STALE" });
    business.prepare("UPDATE purpose_results SET reason = ? WHERE action_id = 'ACT-S2-1'").run(purpose.reason);

    business.prepare("UPDATE cases SET status = 'CLOSED_TRUE' WHERE id = 'CASE-0001'").run();
    const staleCase = await approveRoute(new Request(`${origin}/api/interventions/${id}/approve`, { method: "POST", headers: requestHeaders(reviewerSession!), body: JSON.stringify({ run_id: reviewed.run_id, review_ref: reviewed.review_ref }) }), { params: Promise.resolve({ id }) });
    expect(staleCase.status).toBe(409);
    expect(await staleCase.json()).toMatchObject({ code: "REVIEW_STALE" });
    business.prepare("UPDATE cases SET status = 'OPEN' WHERE id = 'CASE-0001'").run();

    const beforeRevision = evidenceRevision(business, "STF-0101");
    answerTicket(business, operatorSession!.principal, reviewed.run_id, "ACT-S2-1", "TKT-2291", clockOf(business));
    expect(evidenceRevision(business, "STF-0101")).toBe(beforeRevision);
    expect(reviewContext(business, id).review_ref).toBe(reviewed.review_ref);

    const original = (business.prepare("SELECT target FROM interventions WHERE id = ?").get(id) as { target: string }).target;
    const changed = { ...(JSON.parse(original) as Record<string, unknown>), scope_revision: "test-only-change" };
    business.prepare("UPDATE interventions SET target = ? WHERE id = ?").run(JSON.stringify(changed), id);
    const staleTarget = await approveRoute(new Request(`${origin}/api/interventions/${id}/approve`, { method: "POST", headers: requestHeaders(reviewerSession!), body: JSON.stringify({ run_id: reviewed.run_id, review_ref: reviewed.review_ref }) }), { params: Promise.resolve({ id }) });
    expect(staleTarget.status).toBe(409);
    expect(await staleTarget.json()).toMatchObject({ code: "REVIEW_STALE" });
    expect(business.prepare("SELECT status FROM interventions WHERE id = ?").get(id)).toEqual({ status: "PENDING_APPROVAL" });
    expect((business.prepare("SELECT COUNT(*) n FROM bvn_watchlist").get() as { n: number }).n).toBe(0);

    const refreshed = reviewContext(business, id);
    expect(refreshed.review_ref).not.toBe(reviewed.review_ref);
    const accepted = await approveRoute(new Request(`${origin}/api/interventions/${id}/approve`, { method: "POST", headers: requestHeaders(reviewerSession!), body: JSON.stringify({ run_id: refreshed.run_id, review_ref: refreshed.review_ref }) }), { params: Promise.resolve({ id }) });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ status: "APPROVED", decided_by: "evidence-reviewer" });
    const watch = (business.prepare("SELECT COUNT(*) n FROM bvn_watchlist").get() as { n: number }).n;
    expect(watch).toBe(6);
    expect(() => decide(business, secondReviewerSession!.principal, refreshed.run_id, refreshed.review_ref, id, "REJECTED", "conflict")).toThrow();
    expect((business.prepare("SELECT COUNT(*) n FROM bvn_watchlist").get() as { n: number }).n).toBe(watch);
  });

  it("rolls back a guarded decision when a local effect fails", () => {
    business.prepare("INSERT INTO interventions VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("INT-FAIL", "CASE-0001", "STF-0101", "HOLD_FUNDS", "PENDING_APPROVAL", 0, clockOf(business), null, null, null, JSON.stringify({ accounts: ["ACC-N1"], amount: 850_000, action_ids: ["ACT-S2-1"] }));
    const reviewed = reviewContext(business, "INT-FAIL");
    business.exec("CREATE TRIGGER test_fail_watchlist BEFORE INSERT ON bvn_watchlist BEGIN SELECT RAISE(ABORT, 'test local effect failure'); END;");
    expect(() => decide(business, reviewerSession!.principal, reviewed.run_id, reviewed.review_ref, "INT-FAIL", "APPROVED", null)).toThrow("test local effect failure");
    business.exec("DROP TRIGGER test_fail_watchlist");
    expect(business.prepare("SELECT status, decided_by FROM interventions WHERE id = 'INT-FAIL'").get()).toEqual({ status: "PENDING_APPROVAL", decided_by: null });
  });

  it("keeps login but isolates reveal and stale mutations across a reset with reused IDs", async () => {
    const runA = currentRunId(business);
    expect(revealIdentity(business, authDb(), "CASE-0001", reviewerSession!.principal, runA, "Reviewing destination evidence")).toMatchObject({ case_id: "CASE-0001" });
    expect(hasReveal(authDb(), reviewerSession!.principal.session_id, runA, "CASE-0001")).toBe(true);

    resetDemo();
    business = demoDb();
    const runB = currentRunId(business);
    expect(runB).not.toBe(runA);
    expect(sessionFromToken(authDb(), reviewerSession!.token)?.principal.account_id).toBe("evidence-reviewer");
    advanceToWrongDestination();
    expect((business.prepare("SELECT id FROM cases WHERE id = 'CASE-0001'").get())).toEqual({ id: "CASE-0001" });
    expect(hasReveal(authDb(), reviewerSession!.principal.session_id, runB, "CASE-0001")).toBe(false);
    expect(caseView(business, "CASE-0001", hasReveal(authDb(), reviewerSession!.principal.session_id, runB, "CASE-0001"))!.staff.name).toBeNull();
    const staleAnswer = await answerRoute(new Request(`${origin}/api/actions/ACT-S2-1/answer`, { method: "POST", headers: requestHeaders(operatorSession!), body: JSON.stringify({ run_id: runA, ticket_ref: "TKT-2291" }) }), { params: Promise.resolve({ id: "ACT-S2-1" }) });
    expect(staleAnswer.status).toBe(409);
    expect(await staleAnswer.json()).toMatchObject({ code: "RUN_STALE" });
    const staleReveal = await unmaskRoute(new Request(`${origin}/api/cases/CASE-0001/unmask`, { method: "POST", headers: requestHeaders(reviewerSession!), body: JSON.stringify({ run_id: runA, reason: "Old browser reveal request" }) }), { params: Promise.resolve({ id: "CASE-0001" }) });
    expect(staleReveal.status).toBe(409);
    expect(await staleReveal.json()).toMatchObject({ code: "RUN_STALE" });
    const stepIndex = (business.prepare("SELECT value FROM sim_state WHERE key = 'step_index'").get() as { value: string }).value;
    const staleNext = await nextRoute(new Request(`${origin}/api/scenarios/demo/next`, { method: "POST", headers: requestHeaders(controllerSession!), body: JSON.stringify({ run_id: runA }) }));
    expect(staleNext.status).toBe(409);
    expect(await staleNext.json()).toMatchObject({ code: "RUN_STALE" });
    expect((business.prepare("SELECT value FROM sim_state WHERE key = 'step_index'").get() as { value: string }).value).toBe(stepIndex);
    const staleReset = await resetRoute(new Request(`${origin}/api/sim/reset`, { method: "POST", headers: requestHeaders(controllerSession!), body: JSON.stringify({ run_id: runA }) }));
    expect(staleReset.status).toBe(409);
    expect(await staleReset.json()).toMatchObject({ code: "RUN_STALE" });
    expect(currentRunId(business)).toBe(runB);

    answerTicket(business, operatorSession!.principal, runB, "ACT-S2-1", "TKT-2291", clockOf(business));
    nextStep(business);
    nextStep(business);
    expect(pendingDecision(business)).toBe(runADecision.intervention_id);
    const staleDecision = await approveRoute(new Request(`${origin}/api/interventions/${runADecision.intervention_id}/approve`, { method: "POST", headers: requestHeaders(reviewerSession!), body: JSON.stringify({ run_id: runADecision.run_id, review_ref: runADecision.review_ref }) }), { params: Promise.resolve({ id: runADecision.intervention_id }) });
    expect(staleDecision.status).toBe(409);
    expect(await staleDecision.json()).toMatchObject({ code: "RUN_STALE" });
    expect(business.prepare("SELECT status FROM interventions WHERE id = ?").get(runADecision.intervention_id)).toEqual({ status: "PENDING_APPROVAL" });
    const currentReview = reviewContext(business, runADecision.intervention_id);
    expect(decide(business, reviewerSession!.principal, currentReview.run_id, currentReview.review_ref, runADecision.intervention_id, "APPROVED", null)).toMatchObject({ status: "APPROVED" });

    expect(revealIdentity(business, authDb(), "CASE-0001", reviewerSession!.principal, runB, "Fresh review in the new run")).toMatchObject({ case_id: "CASE-0001" });
    expect(hasReveal(authDb(), reviewerSession!.principal.session_id, runB, "CASE-0001")).toBe(true);
    expect(hasReveal(authDb(), secondReviewerSession!.principal.session_id, runB, "CASE-0001")).toBe(false);
  });

  it("persists a run ID across reopen and changes it for a distinct fresh database", () => {
    const path = join(tmpdir(), `sentry-run-id-${process.pid}.db`);
    resetDatabase(path);
    const first = openDatabase(path);
    const persisted = rotateRunId(first);
    first.close();
    const reopened = openDatabase(path);
    expect(currentRunId(reopened)).toBe(persisted);
    reopened.close();
    expect(currentRunId(business)).not.toBe(persisted);
  });
});

afterAll(() => closeAuthDb());
