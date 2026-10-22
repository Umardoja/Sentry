export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { staffView } from "@/server/services/read";
import { withRead } from "@/server/auth/request";
import { projectForPrincipal } from "@/server/auth/policy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", async (principal) => { const { id } = await params; return projectForPrincipal(principal, staffView(db(), id)); }));
}
