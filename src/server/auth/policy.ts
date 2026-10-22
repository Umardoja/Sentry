import "server-only";
import type Database from "better-sqlite3";

export const ROLES = ["OPERATOR", "REVIEWER", "AUDITOR", "SIMULATION_CONTROLLER"] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = ["ANSWER_OWN_ACTION", "REQUEST_CASE_ACCESS", "READ_INVESTIGATIONS", "READ_AUDIT", "DECIDE_INTERVENTION", "REVEAL_IDENTITY", "CONTROL_SIMULATION"] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  OPERATOR: ["ANSWER_OWN_ACTION", "REQUEST_CASE_ACCESS"],
  REVIEWER: ["READ_INVESTIGATIONS", "DECIDE_INTERVENTION", "REVEAL_IDENTITY"],
  AUDITOR: ["READ_INVESTIGATIONS", "READ_AUDIT"],
  SIMULATION_CONTROLLER: ["CONTROL_SIMULATION"],
};

export type VerifiedPrincipal = {
  kind: "session" | "simulation";
  account_id: string;
  username: string;
  staff_id: string | null;
  roles: Role[];
  capabilities: Capability[];
  session_id: string | null;
  /** Server-issued namespace for an isolated synthetic demo. Never sourced from request input. */
  workspace_id?: string | null;
  auth_mode?: "password" | "demo" | "simulation";
};

export class AccessError extends Error {
  constructor(public readonly status: 401 | 403 | 409, message: string, public readonly code?: string) {
    super(message);
  }
}

export function capabilitiesFor(roles: Role[]): Capability[] {
  return [...new Set(roles.flatMap((role) => ROLE_CAPABILITIES[role]))];
}

export function hasCapability(principal: VerifiedPrincipal, capability: Capability): boolean {
  return principal.capabilities.includes(capability);
}

export function requireCapability(principal: VerifiedPrincipal, capability: Capability): void {
  if (!hasCapability(principal, capability)) throw new AccessError(403, "permission denied");
}

export function requireOwnAction(principal: VerifiedPrincipal, actionStaffId: string): void {
  requireCapability(principal, "ANSWER_OWN_ACTION");
  if (!principal.staff_id || principal.staff_id !== actionStaffId) throw new AccessError(403, "operators may answer only their own actions");
}

type InterventionRelationship = { case_id: string; intervention_staff_id: string; case_staff_id: string; target: string };

export function requireIndependentReviewer(db: Database.Database, principal: VerifiedPrincipal, interventionId: string): InterventionRelationship {
  requireCapability(principal, "DECIDE_INTERVENTION");
  if (!principal.staff_id) throw new AccessError(403, "reviewer staff mapping is required");
  const row = db.prepare(`SELECT i.case_id, i.staff_id intervention_staff_id, c.staff_id case_staff_id, i.target
    FROM interventions i JOIN cases c ON c.id = i.case_id WHERE i.id = ?`).get(interventionId) as InterventionRelationship | undefined;
  if (!row) throw new AccessError(403, "intervention relationship could not be resolved");
  const involved = new Set([row.intervention_staff_id, row.case_staff_id]);
  const target = JSON.parse(row.target) as { action_ids?: string[] };
  for (const actionId of target.action_ids ?? []) {
    const action = db.prepare("SELECT staff_id FROM sensitive_actions WHERE id = ?").get(actionId) as { staff_id: string } | undefined;
    if (!action) throw new AccessError(403, "originating action relationship could not be resolved");
    involved.add(action.staff_id);
  }
  if (involved.has(principal.staff_id)) throw new AccessError(403, "reviewer is involved in this case");
  return row;
}

export function requireIndependentCaseReviewer(db: Database.Database, principal: VerifiedPrincipal, caseId: string): { staff_id: string; status: string } {
  requireCapability(principal, "REVEAL_IDENTITY");
  if (!principal.staff_id) throw new AccessError(403, "reviewer staff mapping is required");
  const row = db.prepare("SELECT staff_id, status FROM cases WHERE id = ?").get(caseId) as { staff_id: string; status: string } | undefined;
  if (!row) throw new AccessError(403, "case relationship could not be resolved");
  if (!["OPEN", "CONTAINED"].includes(row.status)) throw new AccessError(403, "identity reveal requires an eligible open case");
  if (row.staff_id === principal.staff_id) throw new AccessError(403, "reviewer is involved in this case");
  return row;
}

export function scenarioOperator(staffId: string): VerifiedPrincipal {
  return {
    kind: "simulation",
    account_id: `scenario:${staffId}`,
    username: "synthetic scenario",
    staff_id: staffId,
    roles: ["OPERATOR"],
    capabilities: capabilitiesFor(["OPERATOR"]),
    session_id: null,
    workspace_id: null,
    auth_mode: "simulation",
  };
}

/** Removes canonical identity keys from read-only auditor projections, including nested audit details. */
export function projectForPrincipal<T>(principal: VerifiedPrincipal, value: T): T {
  if (!principal.roles.includes("AUDITOR") || principal.roles.includes("REVIEWER")) return value;
  const project = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(project);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([key]) => !/^(staff_id|customer_id|caller_number|name|phone|account_no|bvn_hash)$/i.test(key))
      .map(([key, nested]) => [key, project(nested)]));
  };
  return project(value) as T;
}
