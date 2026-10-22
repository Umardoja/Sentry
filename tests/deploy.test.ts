import { afterAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { openAuthDatabase } from "@/server/auth/store";
import { retireDemoWorkspaces, workspaceDirectory, workspaceRoot } from "@/server/services/workspace";

const HOUR = 60 * 60 * 1000;
const id = () => `WS-${randomBytes(16).toString("hex")}`;

describe("visitor workspace retirement", () => {
  it("deletes workspaces unused for 6 hours, then the least recently used above 40, and untracked old directories", () => {
    // Real time: other test files' fresh workspaces share this root and must stay untouched.
    const now = Date.now();
    const auth = openAuthDatabase(join(workspaceRoot(), "..", `retire-auth-${process.pid}.db`));
    const make = (ws: string, lastSeen: number | null) => {
      mkdirSync(workspaceDirectory(ws), { recursive: true });
      writeFileSync(join(workspaceDirectory(ws), "business.db"), "synthetic");
      if (lastSeen !== null) auth.prepare("INSERT INTO auth_demo_workspaces VALUES (?,?,?)").run(ws, lastSeen, lastSeen);
      return ws;
    };
    auth.prepare("INSERT OR IGNORE INTO auth_accounts VALUES ('ACC-T','t','s','h','[]',NULL,1)").run();
    const idle = [make(id(), now - 7 * HOUR), make(id(), now - 6 * HOUR)];
    const fresh = Array.from({ length: 40 }, (_, i) => make(id(), now - (40 - i) * 60_000));
    const keep = make(id(), now - 5 * HOUR);
    auth.prepare("INSERT INTO auth_sessions (id, account_id, token_digest, csrf_token, issued_at_ms, expires_at_ms, workspace_id, auth_mode) VALUES ('S-1','ACC-T','d1','c',?,?,?,'demo')").run(now - HOUR, now + HOUR, fresh[0]);
    const oldOrphan = make(id(), null);
    utimesSync(workspaceDirectory(oldOrphan), new Date(now - 7 * HOUR), new Date(now - 7 * HOUR));
    const newOrphan = make(id(), null);
    utimesSync(workspaceDirectory(newOrphan), new Date(now - HOUR), new Date(now - HOUR));
    mkdirSync(join(workspaceRoot(), "_templates"), { recursive: true });
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    // A new visitor arrives (reserve one slot); `keep` is an existing visitor switching persona.
    const retired = retireDemoWorkspaces(auth, { reserve: 1, keep }, now);

    expect(retired.filter((r) => r.reason === "IDLE").map((r) => r.id).sort()).toEqual([...idle].sort());
    // 40 fresh + keep + the new one would be 42: the two least recently used fresh ones go.
    expect(retired.filter((r) => r.reason === "CAPACITY").map((r) => r.id)).toEqual([fresh[0], fresh[1]]);
    expect(retired.filter((r) => r.reason === "ORPHAN").map((r) => r.id)).toEqual([oldOrphan]);
    for (const r of retired) expect(existsSync(workspaceDirectory(r.id))).toBe(false);
    for (const ws of [keep, newOrphan, ...fresh.slice(2)]) expect(existsSync(workspaceDirectory(ws))).toBe(true);
    expect(existsSync(join(workspaceRoot(), "_templates"))).toBe(true);
    expect((auth.prepare("SELECT revoked_at_ms FROM auth_sessions WHERE id = 'S-1'").get() as { revoked_at_ms: number }).revoked_at_ms).toBe(now);
    expect((auth.prepare("SELECT COUNT(*) n FROM auth_demo_workspaces").get() as { n: number }).n).toBe(39);
    expect((auth.prepare("SELECT COUNT(*) n FROM auth_security_audit WHERE action = 'WORKSPACE_REMOVED'").get() as { n: number }).n).toBe(5);
    expect(log.mock.calls.map((c) => String(c[0])).filter((line) => line.includes("removed demo workspace"))).toHaveLength(5);
    log.mockRestore();
    auth.close();
  });
});

describe("behind an HTTPS proxy", () => {
  const saved = { ...process.env };
  afterAll(() => {
    process.env = saved;
    vi.resetModules();
  });

  it("issues Secure cookies and checks the exact public origin while the app itself sees plain http", async () => {
    const publicOrigin = "https://sentry-demo.example.test";
    vi.resetModules();
    process.env.APP_ORIGIN = publicOrigin;
    delete process.env.AUTH_ALLOW_INSECURE_LOOPBACK;
    process.env.SENTRY_DEMO_MODE = "1";
    process.env.AUTH_DB_PATH = join(workspaceRoot(), "..", `https-auth-${process.pid}.db`);
    const { POST: demoRoute } = await import("@/app/api/auth/demo/route");
    const { POST: liveRoute } = await import("@/app/api/sim/live/route");
    const { GET: stateRoute } = await import("@/app/api/sim/state/route");
    // The proxy terminates TLS and forwards to the container over http on an internal address.
    const internal = "http://0.0.0.0:8080";
    const headers = (extra: Record<string, string> = {}) => ({ origin: publicOrigin, "content-type": "application/json", "x-sentry-request": "1", ...extra });

    const entered = await demoRoute(new Request(`${internal}/api/auth/demo`, { method: "POST", headers: headers(), body: JSON.stringify({ persona: "presenter" }) }));
    expect(entered.status).toBe(200);
    const cookie = entered.headers.get("set-cookie")!;
    expect(cookie).toMatch(/; Secure$/);
    expect(cookie).toContain("HttpOnly; SameSite=Strict");
    const { csrf_token: csrf } = await entered.json() as { csrf_token: string };
    const session = cookie.split(";")[0]!;

    const state = await stateRoute(new Request(`${internal}/api/sim/state`, { headers: { cookie: session } }));
    const { run_id } = await state.json() as { run_id: string };
    const mutate = (origin: string) => liveRoute(new Request(`${internal}/api/sim/live`, {
      method: "POST", headers: headers({ origin, cookie: session, "x-csrf-token": csrf }), body: JSON.stringify({ run_id, enabled: true }),
    }));
    expect((await mutate(publicOrigin)).status).toBe(200);
    expect((await mutate("http://sentry-demo.example.test")).status).toBe(403);
    expect((await mutate(internal)).status).toBe(403);
    const spoofed = await demoRoute(new Request(`${internal}/api/auth/demo`, { method: "POST", headers: headers({ origin: "https://evil.example.test" }), body: JSON.stringify({ persona: "presenter" }) }));
    expect(spoofed.status).toBe(403);
  }, 180_000);
});
