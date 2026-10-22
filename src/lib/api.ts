import { console2153, metrics } from "./fixtures";
import type { Metrics, SimState } from "@/shared/schemas";
const fixtures = process.env.NEXT_PUBLIC_USE_FIXTURES === "1";
async function get<T>(path: string): Promise<T> {
  if (fixtures && path === "/api/sim/state") return console2153 as T;
  if (fixtures && path === "/api/metrics") return metrics as T;
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}
export const api = {
  health: () => get<{ ok: boolean }>("/api/health"),
  simState: () => get<SimState>("/api/sim/state"),
  metrics: () => get<Metrics>("/api/metrics"),
  actions: () => get("/api/actions"),
  risk: () => get("/api/risk/top"),
  scenarios: () => get("/api/scenarios"),
  cases: () => get("/api/cases"),
  case: (id: string) => get(`/api/cases/${id}`),
  staff: (id: string) => get(`/api/staff/${id}`),
  timeline: (id: string) => get(`/api/staff/${id}/timeline`),
  graph: (id: string) => get(`/api/graph/${id}`),
  audit: () => get("/api/audit"),
};
