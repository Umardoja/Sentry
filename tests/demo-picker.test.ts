import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as modeRoute } from "@/app/api/auth/mode/route";
import { POST as demoRoute } from "@/app/api/auth/demo/route";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { GET as casesRoute } from "@/app/api/cases/route";
import { GET as stateRoute } from "@/app/api/sim/state/route";
import { POST as resetRoute } from "@/app/api/sim/reset/route";
import { authDb } from "@/server/auth/request";
import { grantReveal, hasReveal, provisionAccounts } from "@/server/auth/store";
import { prepareDemoWorkspaceTemplate } from "@/server/services/demo";

const origin = "http://127.0.0.1:3000";
type DemoSession = { cookie: string; csrf: string; principal: { session_id: string; workspace_id: string; roles: string[] } };

async function enter(persona: string, current?: DemoSession): Promise<{ response: Response; session?: DemoSession }> {
  const headers: Record<string, string> = { origin, "content-type": "application/json", "x-sentry-request": "1" };
  if (current) { headers.cookie = current.cookie; headers["x-csrf-token"] = current.csrf; }
  const response = await demoRoute(new Request(`${origin}/api/auth/demo`, { method: "POST", headers, body: JSON.stringify({ persona }) }));
  if (!response.ok) return { response };
  const body = await response.json() as { csrf_token: string; principal: DemoSession["principal"] };
  return { response, session: { cookie: response.headers.get("set-cookie")!.split(";")[0]!, csrf: body.csrf_token, principal: body.principal } };
}

const mutationHeaders = (session: DemoSession) => ({ cookie: session.cookie, origin, "content-type": "application/json", "x-sentry-request": "1", "x-csrf-token": session.csrf });
const getState = async (session: DemoSession) => {
  const response = await stateRoute(new Request(`${origin}/api/sim/state`, { headers: { cookie: session.cookie } }));
  return { response, body: response.ok ? await response.json() as { run_id: string; step_index: number } : null };
};

describe("password-free demo account picker", () => {
  beforeAll(() => { process.env.SENTRY_DEMO_MODE = "1"; });
  afterAll(() => { delete process.env.SENTRY_DEMO_MODE; });

  it("prepares one immutable seed template before visitors enter", () => {
    const first = prepareDemoWorkspaceTemplate();
    const second = prepareDemoWorkspaceTemplate();
    expect(first.path).toBe(second.path);
    expect(second.created).toBe(false);
  }, 120_000);

  it("advertises only the fixed personas and enters each without a password", async () => {
    const mode = await modeRoute();
    expect(await mode.json()).toMatchObject({ demo_mode: true, personas: [
      { id: "presenter" }, { id: "operator" }, { id: "reviewer" }, { id: "auditor" },
    ] });
    for (const persona of ["presenter", "operator", "reviewer", "auditor"]) {
      const entered = await enter(persona);
      expect(entered.response.status).toBe(200);
      expect(entered.session?.principal.workspace_id).toMatch(/^WS-[a-f0-9]{32}$/);
    }
    const forged = await demoRoute(new Request(`${origin}/api/auth/demo`, { method: "POST", headers: { origin, "content-type": "application/json", "x-sentry-request": "1" }, body: JSON.stringify({ persona: "superuser", role: "REVIEWER" }) }));
    expect(forged.status).toBe(400);
  }, 120_000);

  it("opens a fresh visitor on a prepared, undecided investigation", async () => {
    const presenter = (await enter("presenter")).session!;
    const state = (await getState(presenter)).body!;
    expect(state.step_index).toBe(3);
    const response = await casesRoute(new Request(`${origin}/api/cases`, { headers: { cookie: presenter.cookie } }));
    expect(response.status).toBe(200);
    const cases = await response.json() as { id: string; case_status: string }[];
    expect(cases).toEqual(expect.arrayContaining([expect.objectContaining({ id: "CASE-0001", case_status: "OPEN" })]));
  }, 120_000);

  it("keeps same-persona visitors isolated and scopes reset to one workspace", async () => {
    const a = (await enter("presenter")).session!;
    const b = (await enter("presenter")).session!;
    expect(a.cookie).not.toBe(b.cookie);
    expect(a.principal.workspace_id).not.toBe(b.principal.workspace_id);
    const beforeA = (await getState(a)).body!;
    const beforeB = (await getState(b)).body!;
    expect(beforeA.run_id).not.toBe(beforeB.run_id);
    const reset = await resetRoute(new Request(`${origin}/api/sim/reset`, { method: "POST", headers: mutationHeaders(a), body: JSON.stringify({ run_id: beforeA.run_id }) }));
    expect(reset.status).toBe(200);
    const afterA = (await getState(a)).body!;
    expect(afterA.run_id).not.toBe(beforeA.run_id);
    expect(afterA.step_index).toBe(3);
    expect((await getState(b)).body).toEqual(beforeB);
  }, 120_000);

  it("rotates a switch session, preserves its workspace, and removes old reveal authority", async () => {
    const presenter = (await enter("presenter")).session!;
    const state = (await getState(presenter)).body!;
    grantReveal(authDb(), presenter.principal.session_id, state.run_id, "CASE-0001", "Synthetic switch test reason");
    expect(hasReveal(authDb(), presenter.principal.session_id, state.run_id, "CASE-0001")).toBe(true);
    const switched = (await enter("operator", presenter)).session!;
    expect(switched.principal.workspace_id).toBe(presenter.principal.workspace_id);
    expect(switched.principal.roles).toEqual(["OPERATOR"]);
    expect(hasReveal(authDb(), presenter.principal.session_id, state.run_id, "CASE-0001")).toBe(false);
    expect((await sessionRoute(new Request(`${origin}/api/auth/session`, { headers: { cookie: presenter.cookie } }))).status).toBe(401);
    expect((await sessionRoute(new Request(`${origin}/api/auth/session`, { headers: { cookie: switched.cookie } }))).status).toBe(200);
    expect((await resetRoute(new Request(`${origin}/api/sim/reset`, { method: "POST", headers: mutationHeaders(switched), body: JSON.stringify({ run_id: state.run_id }) }))).status).toBe(403);
  }, 120_000);

  it("retains exact-origin and CSRF protection for switches", async () => {
    const presenter = (await enter("presenter")).session!;
    const wrongOrigin = await demoRoute(new Request(`${origin}/api/auth/demo`, { method: "POST", headers: { ...mutationHeaders(presenter), origin: "http://evil.invalid" }, body: JSON.stringify({ persona: "auditor" }) }));
    expect(wrongOrigin.status).toBe(403);
    const wrongCsrf = await demoRoute(new Request(`${origin}/api/auth/demo`, { method: "POST", headers: { ...mutationHeaders(presenter), "x-csrf-token": "wrong" }, body: JSON.stringify({ persona: "auditor" }) }));
    expect(wrongCsrf.status).toBe(403);
  }, 120_000);

  it("keeps password authentication available only when demo mode is disabled", async () => {
    delete process.env.SENTRY_DEMO_MODE;
    provisionAccounts(authDb(), [{ id: "normal-auth", username: "normal-auth", password: "normal auth password", roles: ["AUDITOR"], staff_id: null }]);
    const response = await loginRoute(new Request(`${origin}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json", "x-sentry-request": "1" }, body: JSON.stringify({ username: "normal-auth", password: "normal auth password" }) }));
    expect(response.status).toBe(200);
    process.env.SENTRY_DEMO_MODE = "1";
  });
});
