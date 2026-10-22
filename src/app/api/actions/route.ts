export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { feed, operatorActions } from "@/server/services/read";
import { withPrincipal } from "@/server/auth/request";
import { hasCapability, AccessError, projectForPrincipal } from "@/server/auth/policy";

export function GET(request: Request) {
  return handle(() => withPrincipal(request, (principal) => {
    const d = db();
    if (hasCapability(principal, "READ_INVESTIGATIONS")) {
      const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
      return projectForPrincipal(principal, feed(d, Math.min(200, limit)));
    }
    if (hasCapability(principal, "ANSWER_OWN_ACTION") && principal.staff_id) return operatorActions(d, principal.staff_id);
    throw new AccessError(403, "permission denied");
  }));
}
