export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle, json } from "@/server/services/http";
import { answerTicket, clockOf } from "@/server/sim/player";
import { actionIdSchema, ticketAnswerRequestSchema } from "@/shared/schemas";
import { withMutation } from "@/server/auth/request";
import { serverTimestamp } from "@/server/auth/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withMutation(request, "ANSWER_OWN_ACTION", (principal) => {
    return request.json().catch(() => null).then((payload) => {
      const body = ticketAnswerRequestSchema.safeParse(payload);
      return params.then(({ id }) => {
        const actionId = actionIdSchema.safeParse(id);
        if (!actionId.success || !body.success) return json({ detail: "invalid ticket answer" }, 400);
        const d = db();
        return answerTicket(d, principal, body.data.run_id, actionId.data, body.data.ticket_ref, clockOf(d), serverTimestamp());
      });
    });
  }));
}
