export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { clearSessionCookie, authDb, requireAuthenticatedMutation } from "@/server/auth/request";
import { revokeSession } from "@/server/auth/store";
import { json, handle } from "@/server/services/http";

export function POST(request: Request) {
  return handle(() => {
    const principal = requireAuthenticatedMutation(request);
    if (!principal.session_id) return json({ detail: "authentication required" }, 401);
    revokeSession(authDb(), principal.session_id, principal.account_id);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  });
}
