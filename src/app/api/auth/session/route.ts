export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { handle } from "@/server/services/http";
import { sessionForRequest } from "@/server/auth/request";
import { AccessError } from "@/server/auth/policy";

export function GET(request: Request) {
  return handle(() => {
    const session = sessionForRequest(request);
    if (!session) throw new AccessError(401, "authentication required");
    return { principal: session.principal, csrf_token: session.csrf_token, expires_at_ms: session.expires_at_ms };
  });
}
