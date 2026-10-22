export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { demoModeEnabled } from "@/server/config";
import { demoPersona, DEMO_PERSONAS } from "@/server/auth/demoPersonas";
import { AccessError } from "@/server/auth/policy";
import { authDb, requireAuthenticatedMutation, requireLoginRequest, sessionCookie, sessionForRequest } from "@/server/auth/request";
import { demoWorkspaceCount, ensureDemoAccounts, issueDemoSession } from "@/server/auth/store";
import { resetDemo } from "@/server/services/demo";
import { handle, json } from "@/server/services/http";
import { newWorkspaceId, removeWorkspaceDirectory, retireDemoWorkspaces, runInWorkspace, workspaceLimits } from "@/server/services/workspace";
import { demoPersonaRequestSchema } from "@/shared/schemas";

const provision = () => Object.values(DEMO_PERSONAS).map((persona) => ({
  id: persona.account_id, username: persona.username, roles: [...persona.roles], staff_id: persona.staff_id,
}));

export async function POST(request: Request) {
  return handle(async () => {
    if (!demoModeEnabled()) return json({ detail: "demo account picker is disabled" }, 404);
    requireLoginRequest(request);
    const current = sessionForRequest(request);
    if (current) requireAuthenticatedMutation(request);
    const body = demoPersonaRequestSchema.parse(await request.json().catch(() => null));
    const persona = demoPersona(body.persona);
    if (!persona) throw new AccessError(403, "demo persona is not allowed");

    const auth = authDb();
    ensureDemoAccounts(auth, provision());
    let workspaceId = current?.principal.auth_mode === "demo" ? current.principal.workspace_id ?? null : null;
    retireDemoWorkspaces(auth, { reserve: workspaceId ? 0 : 1, keep: workspaceId });

    let created = false;
    if (!workspaceId) {
      if (demoWorkspaceCount(auth) >= workspaceLimits().max) throw new AccessError(409, "demo workspace capacity reached", "DEMO_CAPACITY");
      workspaceId = newWorkspaceId();
      created = true;
      try { runInWorkspace(workspaceId, () => resetDemo()); }
      catch (error) { removeWorkspaceDirectory(workspaceId); throw error; }
    }
    const issued = issueDemoSession(auth, persona.account_id, workspaceId, current?.principal.session_id ?? null);
    return json({ principal: issued.principal, csrf_token: issued.csrf_token, expires_at_ms: issued.expires_at_ms, workspace_created: created }, 200, {
      "Set-Cookie": sessionCookie(issued.token, issued.expires_at_ms),
    });
  });
}
