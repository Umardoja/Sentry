export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { caseView } from "@/server/services/read";
import { authDb, withRead } from "@/server/auth/request";
import { hasReveal } from "@/server/auth/store";
import { projectForPrincipal } from "@/server/auth/policy";
import { currentRunId } from "@/server/services/run";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", async (principal) => {
    const { id } = await params;
    const business = db();
    const runId = currentRunId(business);
    return projectForPrincipal(principal, caseView(business, id, hasReveal(authDb(), principal.session_id, runId, id)));
  }));
}
