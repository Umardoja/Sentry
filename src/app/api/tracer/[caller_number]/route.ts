export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { tracerView } from "@/server/services/read";
import { withRead } from "@/server/auth/request";
import { projectForPrincipal } from "@/server/auth/policy";

export async function GET(request: Request, { params }: { params: Promise<{ caller_number: string }> }) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", async (principal) => { const { caller_number } = await params; return projectForPrincipal(principal, tracerView(db(), decodeURIComponent(caller_number))); }));
}
