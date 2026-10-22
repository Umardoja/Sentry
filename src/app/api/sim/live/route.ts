export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { withMutation } from "@/server/auth/request";
import { requireCurrentRun } from "@/server/services/run";
import { setLive } from "@/server/sim/live";
import { liveToggleRequestSchema } from "@/shared/schemas";

export async function POST(request: Request) {
  return handle(() => withMutation(request, "CONTROL_SIMULATION", async (principal) => {
    const body = liveToggleRequestSchema.parse(await request.json().catch(() => null));
    const d = db();
    requireCurrentRun(d, body.run_id);
    const s = setLive(d, body.enabled, principal.account_id, Date.now());
    return { enabled: s.enabled, clock: s.clock };
  }));
}
