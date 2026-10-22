export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { graphView } from "@/server/services/read";
import { withRead } from "@/server/auth/request";
import { projectForPrincipal } from "@/server/auth/policy";

export async function GET(request: Request, { params }: { params: Promise<{ case_id: string }> }) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", async (principal) => { const { case_id } = await params; return projectForPrincipal(principal, graphView(db(), case_id)); }));
}
