import { withMutation } from "@/server/auth/request";
import { requestTemporaryAccess } from "@/server/services/accessBridge";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { accessRequestSchema } from "@/shared/schemas";

export async function POST(request: Request) {
  return handle(() => withMutation(request, "REQUEST_CASE_ACCESS", async (principal) => {
    const body = accessRequestSchema.parse(await request.json().catch(() => null));
    return requestTemporaryAccess(db(), principal, body);
  }));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
