import { z } from "zod";

export const levelSchema = z.enum(["NORMAL", "WATCH", "VERIFY", "HOLD", "CONTAIN"]);
export const purposeStatusSchema = z.enum([
  "MATCHED",
  "PARTIAL",
  "NO_MATCH",
  "WRONG_BENEFICIARY",
  "DUPLICATE",
  "NO_CASE",
]);
export const interventionStatusSchema = z.enum([
  "ACTIVE",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "RELEASED",
]);
export const employmentTypeSchema = z.enum(["EMPLOYEE", "CONTRACTOR", "AGENT"]);
export const staffRoleSchema = z.enum(["OPS_REVERSALS", "OPS_EPRODUCTS", "CUSTOMER_SERVICE", "IT_ADMIN", "BRANCH_OPS", "INTERNAL_CONTROL", "AI_AGENT"]);
export const ticketTypeSchema = z.enum(["COMPLAINT", "SERVICE_REQUEST", "OVERTIME", "EXPORT", "CHANGE", "SCAM_REPORT"]);
export const interventionTypeSchema = z.enum(["REQUEST_REASON", "SECOND_APPROVER", "HOLD_FUNDS", "RESTRICT_DATA_ACCESS", "SUSPEND_SESSION", "CONTACT_BVN_OWNER"]);

export const healthSchema = z.object({ ok: z.boolean() });
export const simResetRequestSchema = z.object({ seed: z.number().int().optional() });
export const simResetResultSchema = z.object({ ok: z.literal(true), seed: z.number().int() });
export const simStateSchema = z.object({
  run_id: z.string().uuid(),
  scenario: z.string().nullable(),
  step_index: z.number().int(),
  sim_time: z.string(),
  next_step_label: z.string().nullable(),
  waiting_for_intervention_id: z.string().nullable(),
  waiting_for_operator_action_id: z.string().nullable(),
});
export const scenarioStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  sim_time: z.string(),
});
export const scenarioSchema = z.object({
  id: z.string(),
  label: z.string(),
  steps: z.array(scenarioStepSchema),
});
export const scenarioNextStepResultSchema = z.object({
  step: z.string(),
  events: z.array(z.record(z.unknown())),
});
export const actionRowSchema = z.object({
  id: z.string(),
  ts: z.string(),
  staff_pseudo: z.string(),
  action_type: z.string(),
  amount: z.number().int().nullable(),
  purpose_status: purposeStatusSchema,
  points: z.number().int(),
});
export const riskRowSchema = z.object({
  staff_id: z.string(),
  pseudo_id: z.string(),
  role: z.string(),
  score: z.number().int(),
  level: levelSchema,
});
export const staffProfileSchema = riskRowSchema.extend({
  id: z.string(),
  employment_type: z.enum(["EMPLOYEE", "CONTRACTOR"]),
  breakdown: z.record(z.number().int()),
});
export const timelinePointSchema = z.object({
  ts: z.string(),
  score: z.number().int(),
  level: levelSchema,
  step_id: z.string().nullable(),
});
export const purposeCheckSchema = z.object({
  code: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});
export const purposeResultSchema = z.object({
  action_id: z.string(),
  status: purposeStatusSchema,
  checks: z.array(purposeCheckSchema),
  reason: z.string().nullable(),
});
export const signalSchema = z.object({
  id: z.string(),
  code: z.string(),
  tier: z.number().int(),
  points: z.number().int(),
  effective_points: z.number().int(),
  ts: z.string(),
  action_ids: z.array(z.string()),
  evidence: z.record(z.unknown()),
  waived: z.boolean(),
});
export const interventionSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: interventionStatusSchema,
  automatic: z.boolean(),
  created_at: z.string(),
  decided_by: z.string().nullable(),
  note: z.string().nullable(),
});
export const noteSentenceSchema = z.object({ text: z.string(), evidence: z.array(z.string()) });
export const caseNoteSchema = z.object({
  source: z.enum(["TEMPLATE", "LLM", "CACHE"]),
  sentences: z.array(noteSentenceSchema),
  recommendation: z.string(),
});
export const caseSummarySchema = z.object({
  id: z.string(),
  staff_id: z.string(),
  pseudo_id: z.string(),
  score: z.number().int(),
  level: levelSchema,
  status: z.string(),
});
export const caseDetailSchema = caseSummarySchema.extend({
  signals: z.array(signalSchema),
  purpose_results: z.array(purposeResultSchema),
  interventions: z.array(interventionSchema),
  latest_note: caseNoteSchema.nullable(),
});
const runIdSchema = z.string().uuid();
const reviewRefSchema = z.string().regex(/^REV-[a-f0-9]{64}$/);
export const unmaskRequestSchema = z.object({ run_id: runIdSchema, reason: z.string().trim().min(8).max(500) }).strict();
export const unmaskResultSchema = z.object({ staff_id: z.string(), name: z.string() });
export const interventionDecisionRequestSchema = z.object({ run_id: runIdSchema, review_ref: reviewRefSchema, note: z.string().trim().max(500).optional() }).strict();
export const interventionRejectRequestSchema = z.object({ run_id: runIdSchema, review_ref: reviewRefSchema, note: z.string().trim().min(1).max(500) }).strict();
export const actionIdSchema = z.string().trim().min(1).max(128);
export const ticketAnswerRequestSchema = z.object({ run_id: runIdSchema, ticket_ref: z.string().trim().min(1).max(128) }).strict();
export const accessOperationSchema = z.literal("VIEW_RESTRICTION_STATUS");
export const accessCaseIdSchema = z.string().regex(/^ACCESS-[A-Z0-9-]{1,64}$/);
export const accessGrantIdSchema = z.string().regex(/^GRANT-[a-f0-9]{32}$/);
export const accessRequestSchema = z.object({ run_id: runIdSchema, case_id: accessCaseIdSchema, operation: accessOperationSchema }).strict();
export const accessProtectedReadSchema = z.object({
  run_id: runIdSchema,
  case_id: accessCaseIdSchema,
  customer_id: z.string().trim().min(1).max(128),
  operation: accessOperationSchema,
}).strict();
export const accessCompleteSchema = z.object({ run_id: runIdSchema }).strict();
export const simMutationRequestSchema = z.object({ run_id: runIdSchema }).strict();
export const liveToggleRequestSchema = z.object({ run_id: runIdSchema, enabled: z.boolean() }).strict();

const ingestIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
const lagosTsSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+01:00$/, "expected a Lagos ISO timestamp (…+01:00)");
const ingestStaffEvent = { id: ingestIdSchema, ts: lagosTsSchema, staff_id: ingestIdSchema, session_id: ingestIdSchema, terminal_id: ingestIdSchema };
export const ingestEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("login"), ...ingestStaffEvent }).strict(),
  z.object({
    type: z.literal("reversal"), ...ingestStaffEvent,
    original_txn_id: ingestIdSchema, credit_account_id: ingestIdSchema, amount: z.number().int().positive().max(1_000_000_000),
  }).strict(),
  z.object({ type: z.literal("record_view"), ...ingestStaffEvent, customer_id: ingestIdSchema, ticket_ref: ingestIdSchema.nullable() }).strict(),
  z.object({
    type: z.literal("export"), ...ingestStaffEvent,
    ticket_ref: ingestIdSchema.nullable(), rows: z.number().int().positive().max(10_000_000), scope: z.string().regex(/^[A-Z_]{1,40}$/),
  }).strict(),
  // Core-banking context a reversal is checked against; not a staff action.
  z.object({ type: z.literal("failed_debit"), id: ingestIdSchema, ts: lagosTsSchema, debit_account_id: ingestIdSchema, amount: z.number().int().positive().max(1_000_000_000) }).strict(),
]);
export const ingestBatchSchema = z.object({
  workspace_id: z.string().regex(/^WS-[a-f0-9]{32}$/).nullable().optional(),
  events: z.array(ingestEventSchema).min(1).max(200),
}).strict();
export type IngestEvent = z.infer<typeof ingestEventSchema>;
export const partnerCallEventSchema = z.object({
  id: ingestIdSchema, key_id: ingestIdSchema, ts: lagosTsSchema,
  endpoint: z.enum(["GET /accounts/balance", "GET /accounts/transactions", "POST /payments/name-enquiry", "POST /payments"]),
  scope: z.enum(["balance", "transactions", "payment_initiation"]),
  customer_id: ingestIdSchema, account_no: z.string().regex(/^\d{10}$/), source_network: z.string().trim().min(1).max(80),
}).strict();
export const partnerCallBatchSchema = z.object({
  workspace_id: z.string().regex(/^WS-[a-f0-9]{32}$/).nullable().optional(),
  calls: z.array(partnerCallEventSchema).min(1).max(200),
}).strict();
export type PartnerCallEvent = z.infer<typeof partnerCallEventSchema>;
export const partnerJustifyRequestSchema = z.object({ run_id: runIdSchema, review_ref: reviewRefSchema, note: z.string().trim().min(1).max(500) }).strict();
export type IngestBatch = z.infer<typeof ingestBatchSchema>;
export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(128),
}).strict();
export const demoPersonaRequestSchema = z.object({ persona: z.enum(["presenter", "operator", "reviewer", "auditor"]) }).strict();
export const ticketAnswerResultSchema = z.object({
  action_id: z.string(),
  status: purposeStatusSchema,
  checks: z.array(purposeCheckSchema),
});
export const graphNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  flags: z.array(z.string()),
});
export const graphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.string(),
  amount: z.number().int().nullable(),
  status: z.string().nullable(),
});
export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});
export const metricsSchema = z.object({
  actions_checked: z.number().int(),
  actions_matched: z.number().int(),
  unusual_cleared: z.number().int(),
  cases_opened: z.number().int(),
  true_cases: z.number().int(),
  false_alerts: z.number().int(),
  funds_held_naira: z.number().int(),
  transfers_blocked: z.number().int(),
  bvns_watchlisted: z.number().int(),
});
export const auditRowSchema = z.object({
  id: z.string(),
  ts: z.string(),
  actor: z.string(),
  action: z.string(),
  target_type: z.string(),
  target_id: z.string(),
  detail: z.record(z.unknown()),
});
export const leakTracerPayloadSchema = z.object({
  caller_number: z.string(),
  reports: z.array(z.object({ id: z.string(), customer_id: z.string(), channel: z.enum(["BRANCH", "CONTACT_CENTRE", "APP"]), reported_at: z.string() })).length(5),
  common_viewers: z.array(z.object({ staff_id: z.string(), pseudo_id: z.string(), role: staffRoleSchema, views: z.number().int(), ticket_refs: z.array(z.string()) })),
});
export const streamEventSchema = z.object({
  type: z.enum([
    "sim.step",
    "action.created",
    "purpose.evaluated",
    "signal.fired",
    "score.updated",
    "case.opened",
    "intervention.created",
    "intervention.decided",
    "transfer.blocked",
    "casenote.ready",
    "metrics.updated",
  ]),
  id: z.number().int(),
  sim_ts: z.string(),
  data: z.record(z.unknown()),
});

export type Level = z.infer<typeof levelSchema>;
export type PurposeStatus = z.infer<typeof purposeStatusSchema>;
export type InterventionStatus = z.infer<typeof interventionStatusSchema>;
export type EmploymentType = z.infer<typeof employmentTypeSchema>;
export type StaffRole = z.infer<typeof staffRoleSchema>;
export type TicketType = z.infer<typeof ticketTypeSchema>;
export type InterventionType = z.infer<typeof interventionTypeSchema>;
export type Health = z.infer<typeof healthSchema>;
export type SimResetRequest = z.infer<typeof simResetRequestSchema>;
export type SimResetResult = z.infer<typeof simResetResultSchema>;
export type SimState = z.infer<typeof simStateSchema>;
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioNextStepResult = z.infer<typeof scenarioNextStepResultSchema>;
export type ActionRow = z.infer<typeof actionRowSchema>;
export type RiskRow = z.infer<typeof riskRowSchema>;
export type StaffProfile = z.infer<typeof staffProfileSchema>;
export type TimelinePoint = z.infer<typeof timelinePointSchema>;
export type PurposeCheck = z.infer<typeof purposeCheckSchema>;
export type PurposeResult = z.infer<typeof purposeResultSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type Intervention = z.infer<typeof interventionSchema>;
export type NoteSentence = z.infer<typeof noteSentenceSchema>;
export type CaseNote = z.infer<typeof caseNoteSchema>;
export type CaseSummary = z.infer<typeof caseSummarySchema>;
export type CaseDetail = z.infer<typeof caseDetailSchema>;
export type UnmaskRequest = z.infer<typeof unmaskRequestSchema>;
export type UnmaskResult = z.infer<typeof unmaskResultSchema>;
export type InterventionDecisionRequest = z.infer<typeof interventionDecisionRequestSchema>;
export type InterventionRejectRequest = z.infer<typeof interventionRejectRequestSchema>;
export type TicketAnswerRequest = z.infer<typeof ticketAnswerRequestSchema>;
export type TicketAnswerResult = z.infer<typeof ticketAnswerResultSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphResult = z.infer<typeof graphSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export type AuditRow = z.infer<typeof auditRowSchema>;
export type LeakTracerPayload = z.infer<typeof leakTracerPayloadSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
