export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { topRisk } from "@/server/services/read";
import { withRead } from "@/server/auth/request";
import { projectForPrincipal } from "@/server/auth/policy";

export function GET(request: Request) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", (principal) => { const limit = Number(new URL(request.url).searchParams.get("limit") ?? "10"); return projectForPrincipal(principal, topRisk(db(), Math.min(50, limit))); }));
}
