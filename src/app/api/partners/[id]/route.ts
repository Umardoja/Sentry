export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { partnerView } from "@/server/services/partners";
import { withRead } from "@/server/auth/request";
import { projectForPrincipal } from "@/server/auth/policy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(() => withRead(request, "READ_INVESTIGATIONS", (principal) => {
    const view = partnerView(db(), id);
    return view && projectForPrincipal(principal, view);
  }));
}
