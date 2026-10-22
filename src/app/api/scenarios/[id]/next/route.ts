export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { simState } from "@/server/services/read";
import { nextStep } from "@/server/sim/player";
import { withMutation } from "@/server/auth/request";
import { simMutationRequestSchema } from "@/shared/schemas";
import { requireCurrentRun } from "@/server/services/run";

export async function POST(request: Request) {
  return handle(() => withMutation(request, "CONTROL_SIMULATION", async () => {
    const body = simMutationRequestSchema.parse(await request.json().catch(() => null));
    const d = db();
    requireCurrentRun(d, body.run_id);
    const r = nextStep(d);
    return { step: r.step, result: r.result, done: r.done, state: simState(d) };
  }));
}
