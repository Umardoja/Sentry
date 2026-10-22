import { withPrincipal } from "@/server/auth/request";
import { readRestrictionDetails } from "@/server/services/accessBridge";
import { db } from "@/server/services/demo";
import { handle, json } from "@/server/services/http";
import { accessGrantIdSchema, accessProtectedReadSchema } from "@/shared/schemas";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withPrincipal(request, async (principal) => {
    const grantId = accessGrantIdSchema.safeParse((await params).id);
    const url = new URL(request.url);
    const query = accessProtectedReadSchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!grantId.success || !query.success) return json({ detail: "invalid access scope" }, 400);
    return readRestrictionDetails(db(), principal, { ...query.data, grant_id: grantId.data });
  }));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
