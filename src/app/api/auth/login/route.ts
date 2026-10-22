export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authDb, requireLoginRequest, sessionCookie } from "@/server/auth/request";
import { login } from "@/server/auth/store";
import { handle, json } from "@/server/services/http";
import { loginRequestSchema } from "@/shared/schemas";
import { demoModeEnabled } from "@/server/config";

export async function POST(request: Request) {
  return handle(async () => {
    if (demoModeEnabled()) return json({ detail: "password login is disabled in demo mode" }, 404);
    requireLoginRequest(request);
    const parsed = loginRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ detail: "invalid credentials" }, 401);
    const issued = login(authDb(), parsed.data.username, parsed.data.password);
    if (!issued) return json({ detail: "invalid credentials" }, 401);
    return json({ principal: issued.principal, csrf_token: issued.csrf_token, expires_at_ms: issued.expires_at_ms }, 200, {
      "Set-Cookie": sessionCookie(issued.token, issued.expires_at_ms),
    });
  });
}
