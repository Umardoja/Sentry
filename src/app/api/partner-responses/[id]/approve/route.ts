export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { decidePartnerResponse } from "@/server/services/partners";
import { withMutation } from "@/server/auth/request";
import { interventionDecisionRequestSchema } from "@/shared/schemas";
import { serverTimestamp } from "@/server/auth/store";

/** Reviewer approves the proposed "Suspend key" against the evidence they reviewed. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withMutation(request, "DECIDE_INTERVENTION", async (principal) => {
    const { id } = await params;
    const body = interventionDecisionRequestSchema.parse(await request.json().catch(() => ({})));
    return decidePartnerResponse(db(), principal, body.run_id, body.review_ref, id, "APPROVED", body.note ?? null, serverTimestamp());
  }));
}
