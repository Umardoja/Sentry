import { beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type Database from "better-sqlite3";
import { capabilitiesFor, type VerifiedPrincipal, AccessError } from "@/server/auth/policy";
import { openAuthDatabase, provisionAccounts, login, sessionFromToken, revokeSession, hasReveal } from "@/server/auth/store";
import { seedDatabase } from "@/server/sim/seed";
import { answerTicket, clockOf, decide, nextStep, pendingDecision } from "@/server/sim/player";
import { caseView } from "@/server/services/read";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as approveRoute } from "@/app/api/interventions/[id]/approve/route";
import { GET as auditRoute } from "@/app/api/audit/route";
import { POST as resetRoute } from "@/app/api/sim/reset/route";
import { POST as rehearseRoute } from "@/app/api/scenarios/rehearse/route";
import { POST as nextRoute } from "@/app/api/scenarios/[id]/next/route";
import { revealIdentity } from "@/server/services/secureActions";
import { currentRunId } from "@/server/services/run";
import { reviewContext } from "@/server/services/review";
import { db as demoDb } from "@/server/services/demo";
import { interventionDecisionRequestSchema, ticketAnswerRequestSchema, unmaskRequestSchema } from "@/shared/schemas";

const origin = "http://127.0.0.1:3000";
const principal = (account: string, staff: string | null, roles: ("OPERATOR" | "REVIEWER" | "AUDITOR" | "SIMULATION_CONTROLLER")[], session = account): VerifiedPrincipal => ({
  kind: "session", account_id: account, username: account, staff_id: staff, roles, capabilities: capabilitiesFor(roles), session_id: session,
});

let business: Database.Database;
beforeAll(() => {
  business = seedDatabase(join(tmpdir(), `sentry-auth-business-${process.pid}.db`)).db;
  nextStep(business); nextStep(business); nextStep(business);
  answerTicket(business, principal("op-tunde-setup", "STF-0101", ["OPERATOR"]), currentRunId(business), "ACT-S2-1", "TKT-2291", clockOf(business));
  nextStep(business); nextStep(business);
}, 120_000);

describe("local authentication and authorization", () => {
  it("verifies credentials, digested opaque sessions, expiry, tampering and revocation", () => {
    const auth = openAuthDatabase(join(tmpdir(), `sentry-auth-store-${process.pid}.db`));
    provisionAccounts(auth, [{ id: "account-a", username: "account-a", password: "correct horse demo", roles: ["REVIEWER"], staff_id: "STF-0007" }]);
    expect(login(auth, "account-a", "wrong password", 1_000)).toBeNull();
    const issued = login(auth, "account-a", "correct horse demo", 2_000)!;
    expect(sessionFromToken(auth, issued.token, 3_000)?.principal.account_id).toBe("account-a");
    expect(sessionFromToken(auth, `${issued.token}x`, 3_000)).toBeNull();
    expect(sessionFromToken(auth, issued.token, issued.expires_at_ms + 1)).toBeNull();
    revokeSession(auth, issued.principal.session_id!, issued.principal.account_id, 4_000);
    expect(sessionFromToken(auth, issued.token, 4_001)).toBeNull();
    const row = auth.prepare("SELECT token_digest FROM auth_sessions WHERE id = ?").get(issued.principal.session_id) as { token_digest: string };
    expect(row.token_digest).not.toContain(issued.token);
    auth.close();
  });

  it("exercises real login, session and logout routes", async () => {
    const auth = openAuthDatabase(process.env.AUTH_DB_PATH!);
    provisionAccounts(auth, [{ id: "route-user", username: "route-user", password: "route user password", roles: ["AUDITOR"], staff_id: null }]);
    auth.close();
    const loginResponse = await loginRoute(new Request(`${origin}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json", "x-sentry-request": "1" }, body: JSON.stringify({ username: "route-user", password: "route user password" }) }));
    expect(loginResponse.status).toBe(200);
    const cookie = loginResponse.headers.get("set-cookie")!.split(";")[0]!;
    const loginBody = await loginResponse.json() as { csrf_token: string };
    expect((await sessionRoute(new Request(`${origin}/api/auth/session`, { headers: { cookie } }))).status).toBe(200);
    const logoutResponse = await logoutRoute(new Request(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie, origin, "x-sentry-request": "1", "x-csrf-token": loginBody.csrf_token } }));
    expect(logoutResponse.status).toBe(200);
    expect((await sessionRoute(new Request(`${origin}/api/auth/session`, { headers: { cookie } }))).status).toBe(401);
  });

  it("denies unauthenticated reads, decisions and simulator control; HTTP rehearsal stays disabled", async () => {
    expect((await auditRoute(new Request(`${origin}/api/audit`))).status).toBe(401);
    expect((await approveRoute(new Request(`${origin}/api/interventions/INT-X/approve`, { method: "POST" }), { params: Promise.resolve({ id: "INT-X" }) })).status).toBe(401);
    expect((await resetRoute(new Request(`${origin}/api/sim/reset`, { method: "POST" }))).status).toBe(401);
    expect((await nextRoute(new Request(`${origin}/api/scenarios/demo/next`, { method: "POST" }))).status).toBe(401);
    expect((await rehearseRoute()).status).toBe(410);
  });

  it("requires origin, custom header and the session-bound CSRF token", async () => {
    const auth = openAuthDatabase(process.env.AUTH_DB_PATH!);
    provisionAccounts(auth, [{ id: "csrf-user", username: "csrf-user", password: "csrf route password", roles: ["SIMULATION_CONTROLLER"], staff_id: null }]);
    const issued = login(auth, "csrf-user", "csrf route password")!; auth.close();
    const cookie = `sentry_session=${issued.token}`;
    const body = JSON.stringify({ run_id: currentRunId(demoDb()) });
    expect((await resetRoute(new Request(`${origin}/api/sim/reset`, { method: "POST", headers: { cookie, origin: "http://evil.invalid", "content-type": "application/json", "x-sentry-request": "1", "x-csrf-token": issued.csrf_token }, body }))).status).toBe(403);
    expect((await resetRoute(new Request(`${origin}/api/sim/reset`, { method: "POST", headers: { cookie, "content-type": "application/json", "x-sentry-request": "1", "x-csrf-token": issued.csrf_token }, body }))).status).toBe(403);
    expect((await resetRoute(new Request(`${origin}/api/sim/reset`, { method: "POST", headers: { cookie, origin, "content-type": "application/json", "x-sentry-request": "1", "x-csrf-token": "wrong" }, body }))).status).toBe(403);
    expect((await resetRoute(new Request(`${origin}/api/sim/reset`, { method: "POST", headers: { cookie, origin, "content-type": "application/json", "x-sentry-request": "1", "x-csrf-token": issued.csrf_token }, body }))).status).toBe(200);
  }, 120_000);

  it("binds an operator answer to the canonical action staff identity", () => {
    const own = principal("op-tunde", "STF-0101", ["OPERATOR"]);
    const other = principal("op-ngozi", "STF-0042", ["OPERATOR"]);
    expect(answerTicket(business, own, currentRunId(business), "ACT-S2-1", "TKT-2291", clockOf(business))).not.toBeNull();
    expect(() => answerTicket(business, other, currentRunId(business), "ACT-S2-1", "TKT-2291", clockOf(business))).toThrow(AccessError);
  });

  it("denies a reviewer who shares the subject staff identity and permits an independent reviewer once", () => {
    const id = pendingDecision(business)!;
    const review = reviewContext(business, id);
    expect(() => decide(business, principal("reviewer-self", "STF-0101", ["REVIEWER"]), review.run_id, review.review_ref, id, "APPROVED", null)).toThrow(AccessError);
    expect(() => decide(business, principal("reviewer-self-2", "STF-0101", ["REVIEWER"]), review.run_id, review.review_ref, id, "REJECTED", "same underlying staff")).toThrow(AccessError);
    const independent = principal("reviewer-ada", "STF-0007", ["REVIEWER"]);
    expect(decide(business, independent, review.run_id, review.review_ref, id, "APPROVED", null)).toMatchObject({ status: "APPROVED", decided_by: "reviewer-ada" });
    const watch = (business.prepare("SELECT COUNT(*) n FROM bvn_watchlist").get() as { n: number }).n;
    expect(() => decide(business, independent, review.run_id, review.review_ref, id, "REJECTED", "conflict")).toThrow();
    expect((business.prepare("SELECT COUNT(*) n FROM bvn_watchlist").get() as { n: number }).n).toBe(watch);
  });

  it("keeps reveal grants session-scoped and read-only users cannot grant them", () => {
    const auth = openAuthDatabase(join(tmpdir(), `sentry-reveal-${process.pid}.db`));
    provisionAccounts(auth, [
      { id: "rev-a", username: "rev-a", password: "reviewer a password", roles: ["REVIEWER"], staff_id: "STF-0007" },
      { id: "rev-b", username: "rev-b", password: "reviewer b password", roles: ["REVIEWER"], staff_id: "STF-0007" },
    ]);
    const a = login(auth, "rev-a", "reviewer a password")!;
    const b = login(auth, "rev-b", "reviewer b password")!;
    const runId = currentRunId(business);
    expect(revealIdentity(business, auth, "CASE-0001", a.principal, runId, "Investigating destination contradiction")).toMatchObject({ case_id: "CASE-0001", revealed_by: "rev-a" });
    expect(hasReveal(auth, a.principal.session_id, runId, "CASE-0001")).toBe(true);
    expect(hasReveal(auth, b.principal.session_id, runId, "CASE-0001")).toBe(false);
    expect(caseView(business, "CASE-0001", hasReveal(auth, b.principal.session_id, runId, "CASE-0001"))!.staff.name).toBeNull();
    expect(() => revealIdentity(business, auth, "CASE-0001", principal("auditor", null, ["AUDITOR"]), runId, "Read-only users cannot reveal identities")).toThrow(AccessError);
    auth.close();
  });

  it("rejects browser-supplied actor and role fields at mutation schemas", () => {
    expect(interventionDecisionRequestSchema.safeParse({ analyst_id: "spoof", role: "REVIEWER" }).success).toBe(false);
    expect(ticketAnswerRequestSchema.safeParse({ ticket_ref: "TKT-1", staff_id: "STF-OTHER" }).success).toBe(false);
    expect(unmaskRequestSchema.safeParse({ reason: "valid investigation reason", analyst_id: "spoof" }).success).toBe(false);
  });
});
