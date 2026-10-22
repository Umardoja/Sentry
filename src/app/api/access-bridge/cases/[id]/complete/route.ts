import { withMutation } from "@/server/auth/request";
import { completeAccessCase } from "@/server/services/accessBridge";
import { db } from "@/server/services/demo";
import { handle, json } from "@/server/services/http";
import { accessCaseIdSchema, accessCompleteSchema } from "@/shared/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withMutation(request, "REQUEST_CASE_ACCESS", async (principal) => {
    const caseId = accessCaseIdSchema.safeParse((await params).id);
    const body = accessCompleteSchema.safeParse(await request.json().catch(() => null));
    if (!caseId.success || !body.success) return json({ detail: "invalid case completion" }, 400);
    return completeAccessCase(db(), principal, body.data.run_id, caseId.data);
  }));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
