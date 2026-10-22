export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { handle } from "@/server/services/http";
import { STEPS } from "@/server/sim/scenarios";
import { withPrincipal } from "@/server/auth/request";

export function GET(request: Request) {
  return handle(() => withPrincipal(request, () => [{ id: "demo", label: "SENTRY demo (S1 to S4)", steps: STEPS.map((s) => ({ id: s.id, label: s.label, sim_time: s.sim_time, scenario: s.scenario })) }]));
}
