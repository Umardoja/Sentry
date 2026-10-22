import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GET as viewRoute } from "@/app/api/access-bridge/route";
import { POST as requestRoute } from "@/app/api/access-bridge/request/route";
import { GET as restrictionRoute } from "@/app/api/access-bridge/grants/[id]/restriction/route";
import { POST as completeRoute } from "@/app/api/access-bridge/cases/[id]/complete/route";
import { authDb } from "@/server/auth/request";
import { AccessError } from "@/server/auth/policy";
import { login, provisionAccounts } from "@/server/auth/store";
import { ACCESS_OPERATION, readRestrictionDetails, requestTemporaryAccess } from "@/server/services/accessBridge";
import { db as demoDb, resetDemo } from "@/server/services/demo";
import { currentRunId, rotateRunId } from "@/server/services/run";

const origin = "http://127.0.0.1:3000";
let business: Database.Database;
let operator: NonNullable<ReturnType<typeof login>>;
let outsider: NonNullable<ReturnType<typeof login>>;
let reviewer: NonNullable<ReturnType<typeof login>>;

const headers = (session: NonNullable<ReturnType<typeof login>>) => ({
  "content-type": "application/json", origin, "x-sentry-request": "1", "x-csrf-token": session.csrf_token,
  cookie: `sentry_session=${session.token}`,
});
const requestAccess = async (body: Record<string, unknown>, session = operator) => requestRoute(new Request(`${origin}/api/access-bridge/request`, {
  method: "POST", headers: headers(session), body: JSON.stringify(body),
}));
const restriction = async (grantId: string, query: Record<string, string>, session = operator) => {
  const url = new URL(`${origin}/api/access-bridge/grants/${grantId}/restriction`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return restrictionRoute(new Request(url, { headers: { cookie: `sentry_session=${session.token}` } }), { params: Promise.resolve({ id: grantId }) });
};
const currentInput = () => ({ run_id: currentRunId(business), case_id: "ACCESS-0001", operation: ACCESS_OPERATION });

beforeAll(() => {
  provisionAccounts(authDb(), [
    { id: "bridge-operator", username: "bridge-operator", password: "synthetic bridge operator", roles: ["OPERATOR"], staff_id: "STF-0101" },
    { id: "bridge-outsider", username: "bridge-outsider", password: "synthetic bridge outsider", roles: ["OPERATOR"], staff_id: "STF-0388" },
    { id: "bridge-reviewer", username: "bridge-reviewer", password: "synthetic bridge reviewer", roles: ["REVIEWER"], staff_id: "STF-0007" },
  ]);
  operator = login(authDb(), "bridge-operator", "synthetic bridge operator")!;
  outsider = login(authDb(), "bridge-outsider", "synthetic bridge outsider")!;
  reviewer = login(authDb(), "bridge-reviewer", "synthetic bridge reviewer")!;
}, 120_000);

beforeEach(() => { resetDemo(); business = demoDb(); }, 180_000);

describe("case-bound temporary access", () => {
  it("grants one verified read scope through the authenticated route and enforces it on every read", async () => {
    const input = currentInput();
    const response = await requestAccess(input);
    expect(response.status).toBe(200);
    const body = await response.json() as { grant: { id: string; expires_at_ms: number }; scope: { customer_id: string } };
    expect(body).toMatchObject({ outcome: "GRANTED", scope: { case_id: "ACCESS-0001", customer_id: "CUS-ACCESS-001", operation: ACCESS_OPERATION } });
    const read = await restriction(body.grant.id, { ...input, customer_id: body.scope.customer_id });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ customer_ref: "Customer ••••8421", operation: ACCESS_OPERATION, source: "verified sample complaint record" });
    expect((business.prepare("SELECT COUNT(*) n FROM audit_log WHERE action IN ('TEMPORARY_ACCESS_GRANTED','TEMPORARY_ACCESS_USED')").get() as { n: number }).n).toBe(2);
  });

  it("does not treat owner absence or assignment alone as authority", () => {
    business.prepare("DELETE FROM case_coverage_delegations WHERE case_id = 'ACCESS-0001'").run();
    expect(() => requestTemporaryAccess(business, operator.principal, currentInput(), 1_000)).toThrowError(expect.objectContaining({ code: "ACCESS_COVERAGE_MISSING" }));
    expect((business.prepare("SELECT COUNT(*) n FROM temporary_access_grants").get() as { n: number }).n).toBe(0);

    resetDemo(); business = demoDb();
    business.prepare("DELETE FROM access_eligibility WHERE staff_id = 'STF-0101'").run();
    expect(() => requestTemporaryAccess(business, operator.principal, currentInput(), 1_000)).toThrowError(expect.objectContaining({ code: "ACCESS_NOT_ELIGIBLE" }));
    expect((business.prepare("SELECT COUNT(*) n FROM temporary_access_grants").get() as { n: number }).n).toBe(0);
  });

  it("rejects client-supplied identity, role and approval fields before mutation", async () => {
    const response = await requestAccess({ ...currentInput(), staff_id: "STF-0007", role: "REVIEWER", isApproved: true });
    expect(response.status).toBe(400);
    expect((business.prepare("SELECT COUNT(*) n FROM access_requests").get() as { n: number }).n).toBe(0);
    expect((business.prepare("SELECT COUNT(*) n FROM temporary_access_grants").get() as { n: number }).n).toBe(0);
  });

  it("denies forged grants, another customer, another operator and another operation", async () => {
    const input = currentInput();
    const granted = await requestAccess(input);
    const body = await granted.json() as { grant: { id: string } };
    const wrongCustomer = await restriction(body.grant.id, { ...input, customer_id: "CUS-ACCESS-OTHER" });
    expect(wrongCustomer.status).toBe(403);
    expect(await wrongCustomer.json()).toMatchObject({ code: "ACCESS_SCOPE_DENIED" });
    expect((await restriction("GRANT-00000000000000000000000000000000", { ...input, customer_id: "CUS-ACCESS-001" })).status).toBe(403);
    expect((await restriction(body.grant.id, { ...input, customer_id: "CUS-ACCESS-001" }, outsider)).status).toBe(403);
    const wrongOperation = await restriction(body.grant.id, { ...input, customer_id: "CUS-ACCESS-001", operation: "MODIFY_RESTRICTION" });
    expect(wrongOperation.status).toBe(400);
  });

  it("expires lazily and completion revokes access without a cleanup worker", async () => {
    const input = currentInput();
    const granted = requestTemporaryAccess(business, operator.principal, input, 1_000);
    expect(() => readRestrictionDetails(business, operator.principal, { ...input, customer_id: "CUS-ACCESS-001", grant_id: granted.grant.id }, granted.grant.expires_at_ms + 1))
      .toThrowError(expect.objectContaining({ code: "ACCESS_EXPIRED" }));
    expect(business.prepare("SELECT status FROM temporary_access_grants WHERE id = ?").get(granted.grant.id)).toEqual({ status: "EXPIRED" });

    resetDemo(); business = demoDb();
    const freshInput = currentInput();
    const response = await requestAccess(freshInput);
    const body = await response.json() as { grant: { id: string } };
    const completed = await completeRoute(new Request(`${origin}/api/access-bridge/cases/ACCESS-0001/complete`, {
      method: "POST", headers: headers(operator), body: JSON.stringify({ run_id: freshInput.run_id }),
    }), { params: Promise.resolve({ id: "ACCESS-0001" }) });
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({ status: "COMPLETED", access_status: "ENDED" });
    expect((await restriction(body.grant.id, { ...freshInput, customer_id: "CUS-ACCESS-001" })).status).toBe(403);
    expect(business.prepare("SELECT status,revoked_reason FROM temporary_access_grants WHERE id = ?").get(body.grant.id)).toEqual({ status: "REVOKED", revoked_reason: "CASE_COMPLETED" });
  });

  it("rechecks assignment, coverage, case status and evidence after granting", () => {
    const mutations = [
      "UPDATE access_cases SET assigned_staff_id = 'STF-0388' WHERE id = 'ACCESS-0001'",
      "UPDATE case_coverage_delegations SET status = 'REVOKED' WHERE case_id = 'ACCESS-0001'",
      "UPDATE access_cases SET status = 'CLOSED' WHERE id = 'ACCESS-0001'",
    ];
    for (const sql of mutations) {
      resetDemo(); business = demoDb();
      const input = currentInput();
      const granted = requestTemporaryAccess(business, operator.principal, input, 1_000);
      business.prepare(sql).run();
      expect(() => readRestrictionDetails(business, operator.principal, { ...input, grant_id: granted.grant.id, customer_id: "CUS-ACCESS-001" }, 2_000)).toThrow(AccessError);
      expect(business.prepare("SELECT status FROM temporary_access_grants WHERE id = ?").get(granted.grant.id)).toEqual({ status: "REVOKED" });
    }
    resetDemo(); business = demoDb();
    business.prepare("UPDATE access_cases SET evidence_status = 'UNAVAILABLE' WHERE id = 'ACCESS-0001'").run();
    expect(() => requestTemporaryAccess(business, operator.principal, currentInput(), 1_000)).toThrowError(expect.objectContaining({ code: "ACCESS_CANNOT_VERIFY" }));
    expect(JSON.stringify(business.prepare("SELECT outcome,reason_code FROM access_requests ORDER BY rowid DESC LIMIT 1").get())).not.toMatch(/fraud/i);
  });

  it("binds grants to the current session and run and never extends an identical request", () => {
    const input = currentInput();
    const first = requestTemporaryAccess(business, operator.principal, input, 10_000);
    const repeated = requestTemporaryAccess(business, operator.principal, input, 20_000);
    expect(repeated.grant.id).toBe(first.grant.id);
    expect(repeated.grant.expires_at_ms).toBe(first.grant.expires_at_ms);
    expect((business.prepare("SELECT COUNT(*) n FROM temporary_access_grants").get() as { n: number }).n).toBe(1);
    expect(() => readRestrictionDetails(business, outsider.principal, { ...input, grant_id: first.grant.id, customer_id: "CUS-ACCESS-001" }, 20_000))
      .toThrowError(expect.objectContaining({ code: "ACCESS_SCOPE_DENIED" }));
    rotateRunId(business);
    expect(() => readRestrictionDetails(business, operator.principal, { ...input, grant_id: first.grant.id, customer_id: "CUS-ACCESS-001" }, 20_000))
      .toThrowError(expect.objectContaining({ code: "RUN_STALE" }));
  });

  it("provides reviewer and auditor-style oversight without protected restriction details", async () => {
    requestTemporaryAccess(business, operator.principal, currentInput(), 1_000);
    const response = await viewRoute(new Request(`${origin}/api/access-bridge`, { headers: { cookie: `sentry_session=${reviewer.token}` } }));
    expect(response.status).toBe(200);
    const body = await response.json() as { mode: string; cases: Record<string, unknown>[] };
    expect(body.mode).toBe("MONITOR");
    expect(body.cases[0]).toMatchObject({ id: "ACCESS-0001", assigned_pseudonym: "Staff-7F3A", grant_status: "ACTIVE" });
    expect(JSON.stringify(body)).not.toContain("restriction_summary");
  });
});
