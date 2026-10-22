export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db, resetDemo } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { simState } from "@/server/services/read";
import { withMutation } from "@/server/auth/request";
import { simMutationRequestSchema } from "@/shared/schemas";
import { requireCurrentRun } from "@/server/services/run";

export async function POST(request: Request) {
  return handle(() => withMutation(request, "CONTROL_SIMULATION", async () => {
    const body = simMutationRequestSchema.parse(await request.json().catch(() => null));
    requireCurrentRun(db(), body.run_id);
    resetDemo();
    return simState(db());
  }));
}
