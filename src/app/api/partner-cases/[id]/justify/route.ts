export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { closePartnerCaseJustified } from "@/server/services/partners";
import { withMutation } from "@/server/auth/request";
import { partnerJustifyRequestSchema } from "@/shared/schemas";
import { serverTimestamp } from "@/server/auth/store";

/** Reviewer closes the partner case as justified: the key is restored and responses are released. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withMutation(request, "DECIDE_INTERVENTION", async (principal) => {
    const { id } = await params;
    const body = partnerJustifyRequestSchema.parse(await request.json().catch(() => ({})));
    return closePartnerCaseJustified(db(), principal, body.run_id, body.review_ref, id, body.note, serverTimestamp());
  }));
}
