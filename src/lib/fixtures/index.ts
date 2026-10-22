import {
  caseDetailSchema,
  graphSchema,
  metricsSchema,
  riskRowSchema,
  simStateSchema,
  type CaseDetail,
  type GraphResult,
  type Metrics,
  type RiskRow,
  type SimState,
} from "@/shared/schemas";
export const console2153: SimState = simStateSchema.parse({
  run_id: "00000000-0000-4000-8000-000000000001",
  scenario: "S2",
  step_index: 3,
  sim_time: "2026-10-16T21:53:00+01:00",
  next_step_label: "Next step",
  waiting_for_intervention_id: "INT-0001",
  waiting_for_operator_action_id: null,
});
export const consoleNgozi: RiskRow = riskRowSchema.parse({
  staff_id: "STF-0042",
  pseudo_id: "Staff-91D2",
  role: "OPS_REVERSALS",
  score: 6,
  level: "NORMAL",
});
export const case0001: CaseDetail = caseDetailSchema.parse({
  id: "CASE-0001",
  staff_id: "STF-0101",
  pseudo_id: "Staff-7F3A",
  score: 91,
  level: "CONTAIN",
  status: "OPEN",
  signals: [],
  purpose_results: [],
  interventions: [],
  latest_note: null,
});
export const case0002: CaseDetail = caseDetailSchema.parse({
  id: "CASE-0002",
  staff_id: "STF-0388",
  pseudo_id: "Staff-2C91",
  score: 85,
  level: "CONTAIN",
  status: "OPEN",
  signals: [],
  purpose_results: [],
  interventions: [],
  latest_note: null,
});
export const leakTracer: GraphResult = graphSchema.parse({ nodes: [], edges: [] });
export const metrics: Metrics = metricsSchema.parse({
  actions_checked: 0,
  actions_matched: 0,
  unusual_cleared: 0,
  cases_opened: 2,
  true_cases: 2,
  false_alerts: 0,
  funds_held_naira: 5835000,
  transfers_blocked: 31,
  bvns_watchlisted: 6,
});
