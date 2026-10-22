export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { decide } from "@/server/sim/player";
import { withMutation } from "@/server/auth/request";
import { interventionRejectRequestSchema } from "@/shared/schemas";
import { serverTimestamp } from "@/server/auth/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withMutation(request, "DECIDE_INTERVENTION", async (principal) => {
    const { id } = await params;
    const body = interventionRejectRequestSchema.parse(await request.json().catch(() => ({})));
    return decide(db(), principal, body.run_id, body.review_ref, id, "REJECTED", body.note, serverTimestamp());
  }));
}
