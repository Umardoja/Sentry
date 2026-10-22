export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { auditView } from "@/server/services/read";
import { withRead } from "@/server/auth/request";

export function GET(request: Request) {
  return handle(() => withRead(request, "READ_AUDIT", () => {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "20");
    return auditView(db(), Math.min(200, limit));
  }));
}
