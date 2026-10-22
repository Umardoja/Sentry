import "server-only";
import type Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { ACCESS_BRIDGE_TTL_MINUTES } from "../config";
import { AccessError, hasCapability, requireCapability, type VerifiedPrincipal } from "../auth/policy";
import { serverTimestamp } from "../auth/store";
import { clockOf } from "../sim/player";
import { currentRunId, requireCurrentRun } from "./run";

export const ACCESS_OPERATION = "VIEW_RESTRICTION_STATUS" as const;
const ALLOWLIST = new Set<string>([ACCESS_OPERATION]);

type AccessCase = {
  id: string; ticket_id: string; customer_id: string; owner_staff_id: string; assigned_staff_id: string;
  assigned_team: string; status: "OPEN" | "COMPLETED" | "CLOSED"; sensitivity: "LOW" | "SENSITIVE";
  evidence_status: "VERIFIED" | "UNAVAILABLE"; customer_ref: string; restriction_summary: string;
};
type Grant = {
  id: string; request_id: string; run_id: string; session_id: string; account_id: string; staff_id: string;
  case_id: string; customer_id: string; operation: string; issued_at_ms: number; expires_at_ms: number;
  status: "ACTIVE" | "REVOKED" | "EXPIRED"; revoked_reason: string | null; revoked_at_ms: number | null;
};
type PolicyFacts = { accessCase: AccessCase };
type RequestInput = { run_id: string; case_id: string; operation: typeof ACCESS_OPERATION };
type ReadInput = RequestInput & { grant_id: string; customer_id: string };

const one = <T>(db: Database.Database, sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as T | undefined;
const id = (prefix: string) => `${prefix}-${randomBytes(16).toString("hex")}`;
const ttlMs = () => {
  if (!Number.isInteger(ACCESS_BRIDGE_TTL_MINUTES) || ACCESS_BRIDGE_TTL_MINUTES < 1 || ACCESS_BRIDGE_TTL_MINUTES > 60) {
    throw new Error("ACCESS_BRIDGE_TTL_MINUTES must be an integer from 1 to 60");
  }
  return ACCESS_BRIDGE_TTL_MINUTES * 60 * 1000;
};
const audit = (db: Database.Database, principal: VerifiedPrincipal, action: string, targetId: string, detail: Record<string, unknown>) => {
  db.prepare("INSERT INTO audit_log (ts,actor,action,target_type,target_id,detail) VALUES (?,?,?,?,?,?)")
    .run(clockOf(db), principal.account_id, action, "access_case", targetId, JSON.stringify({ ...detail, actor_staff_id: principal.staff_id, server_at: serverTimestamp() }));
};
const deny = (status: 403 | 409, code: string, message: string): never => { throw new AccessError(status, message, code); };

function policyFacts(db: Database.Database, principal: VerifiedPrincipal, caseId: string, operation: string): PolicyFacts {
  requireCapability(principal, "REQUEST_CASE_ACCESS");
  if (!principal.staff_id || !principal.session_id) deny(403, "ACCESS_NOT_ELIGIBLE", "a verified staff session is required");
  if (!ALLOWLIST.has(operation)) deny(403, "ACCESS_OPERATION_DENIED", "this operation is not eligible for temporary access");
  const accessCase = one<AccessCase>(db, "SELECT * FROM access_cases WHERE id = ?", caseId);
  if (!accessCase) throw new AccessError(403, "the assigned case could not be verified", "ACCESS_NOT_ELIGIBLE");
  if (accessCase.status !== "OPEN") deny(403, "ACCESS_CASE_CLOSED", "temporary access requires an open assigned case");
  if (accessCase.assigned_staff_id !== principal.staff_id) deny(403, "ACCESS_WRONG_ASSIGNEE", "temporary access is limited to the assigned substitute");
  if (accessCase.sensitivity !== "LOW") deny(409, "ACCESS_REQUIRES_APPROVAL", "this case requires a separate human approval workflow");
  if (accessCase.evidence_status !== "VERIFIED") deny(409, "ACCESS_CANNOT_VERIFY", "required case evidence is unavailable or unverified");
  const ticket = one<{ customer_id: string | null; assigned_team: string; status: string; type: string; scope: string | null }>(db,
    "SELECT customer_id,assigned_team,status,type,scope FROM tickets WHERE id = ?", accessCase.ticket_id);
  if (!ticket || ticket.type !== "COMPLAINT" || ticket.status !== "OPEN" || ticket.customer_id !== accessCase.customer_id ||
      ticket.assigned_team !== accessCase.assigned_team || ticket.scope !== operation) {
    deny(409, "ACCESS_CANNOT_VERIFY", "the complaint evidence does not verify this case scope");
  }
  const simTime = clockOf(db);
  const simDate = simTime.slice(0, 10);
  const ownerAbsent = one<{ id: string }>(db, "SELECT id FROM leave WHERE staff_id = ? AND status = 'APPROVED' AND start_date <= ? AND end_date >= ?", accessCase.owner_staff_id, simDate, simDate);
  if (!ownerAbsent) deny(403, "ACCESS_NOT_ELIGIBLE", "the ordinary owner is available; temporary coverage is not active");
  const substituteOnLeave = one<{ id: string }>(db, "SELECT id FROM leave WHERE staff_id = ? AND status = 'APPROVED' AND start_date <= ? AND end_date >= ?", principal.staff_id, simDate, simDate);
  if (substituteOnLeave) deny(403, "ACCESS_NOT_ELIGIBLE", "the assigned substitute is not available for this case");
  const coverage = one<{ owner_staff_id: string; substitute_staff_id: string; approved_by_staff_id: string }>(db, `SELECT owner_staff_id,substitute_staff_id,approved_by_staff_id
    FROM case_coverage_delegations WHERE case_id = ? AND substitute_staff_id = ? AND status = 'ACTIVE' AND starts_at <= ? AND expires_at >= ?`,
    caseId, principal.staff_id, simTime, simTime);
  if (!coverage || coverage.owner_staff_id !== accessCase.owner_staff_id || coverage.approved_by_staff_id === coverage.owner_staff_id || coverage.approved_by_staff_id === coverage.substitute_staff_id) {
    deny(403, "ACCESS_COVERAGE_MISSING", "approved independent coverage could not be verified");
  }
  const eligible = one<{ id: string }>(db, `SELECT id FROM access_eligibility
    WHERE staff_id = ? AND operation = ? AND resource_scope = 'CASE_CUSTOMER' AND status = 'ACTIVE'`, principal.staff_id, operation);
  if (!eligible) deny(403, "ACCESS_NOT_ELIGIBLE", "this substitute is not eligible for the requested operation");
  return { accessCase };
}

function recordDenied(db: Database.Database, principal: VerifiedPrincipal, input: RequestInput, error: AccessError): void {
  const runId = (() => { try { return currentRunId(db); } catch { return input.run_id; } })();
  const accessCase = one<{ customer_id: string }>(db, "SELECT customer_id FROM access_cases WHERE id = ?", input.case_id);
  const outcome = error.code === "ACCESS_REQUIRES_APPROVAL" ? "REQUIRES_APPROVAL" : error.code === "ACCESS_CANNOT_VERIFY" ? "CANNOT_VERIFY" : "DENIED";
  db.prepare(`INSERT INTO access_requests
    (id,run_id,session_id,account_id,staff_id,case_id,customer_id,operation,requested_at,outcome,reason_code,grant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(
    id("REQ"), runId, principal.session_id ?? "NO_SESSION", principal.account_id, principal.staff_id, input.case_id,
    accessCase?.customer_id ?? null, input.operation, serverTimestamp(), outcome, error.code ?? "ACCESS_DENIED",
  );
  audit(db, principal, "ACCESS_REQUEST_DENIED", input.case_id, { run_id: input.run_id, operation: input.operation, reason_code: error.code ?? "ACCESS_DENIED" });
}

export function requestTemporaryAccess(db: Database.Database, principal: VerifiedPrincipal, input: RequestInput, nowMs = Date.now()) {
  try {
    requireCurrentRun(db, input.run_id);
    const { accessCase } = policyFacts(db, principal, input.case_id, input.operation);
    const result = db.transaction(() => {
      const existing = one<Grant>(db, `SELECT * FROM temporary_access_grants
        WHERE run_id = ? AND session_id = ? AND case_id = ? AND customer_id = ? AND operation = ?`,
        input.run_id, principal.session_id!, input.case_id, accessCase.customer_id, input.operation);
      if (existing?.status === "ACTIVE" && existing.expires_at_ms > nowMs) {
        audit(db, principal, "ACCESS_REQUEST_REUSED", input.case_id, { run_id: input.run_id, operation: input.operation, grant_id: existing.id });
        return existing;
      }
      if (existing) deny(403, "ACCESS_NOT_ELIGIBLE", "a previous grant for this case is no longer active");
      const requestId = id("REQ");
      const grantId = id("GRANT");
      const expiresAt = nowMs + ttlMs();
      db.prepare(`INSERT INTO access_requests
        (id,run_id,session_id,account_id,staff_id,case_id,customer_id,operation,requested_at,outcome,reason_code,grant_id)
        VALUES (?,?,?,?,?,?,?,?,?,'GRANTED','POLICY_VERIFIED',?)`).run(
        requestId, input.run_id, principal.session_id!, principal.account_id, principal.staff_id, input.case_id,
        accessCase.customer_id, input.operation, serverTimestamp(), grantId,
      );
      db.prepare(`INSERT INTO temporary_access_grants
        (id,request_id,run_id,session_id,account_id,staff_id,case_id,customer_id,operation,issued_at_ms,expires_at_ms,status,revoked_reason,revoked_at_ms)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',NULL,NULL)`).run(
        grantId, requestId, input.run_id, principal.session_id!, principal.account_id, principal.staff_id!, input.case_id,
        accessCase.customer_id, input.operation, nowMs, expiresAt,
      );
      audit(db, principal, "TEMPORARY_ACCESS_GRANTED", input.case_id, { run_id: input.run_id, operation: input.operation, grant_id: grantId, expires_at_ms: expiresAt });
      return one<Grant>(db, "SELECT * FROM temporary_access_grants WHERE id = ?", grantId)!;
    }).immediate();
    return { outcome: "GRANTED" as const, grant: result, scope: { case_id: accessCase.id, customer_id: accessCase.customer_id, customer_ref: accessCase.customer_ref, operation: input.operation } };
  } catch (error) {
    if (error instanceof AccessError) recordDenied(db, principal, input, error);
    throw error;
  }
}

function revoke(db: Database.Database, principal: VerifiedPrincipal, grant: Grant, reason: string, nowMs: number): void {
  if (grant.status === "ACTIVE") db.prepare("UPDATE temporary_access_grants SET status = ?, revoked_reason = ?, revoked_at_ms = ? WHERE id = ? AND status = 'ACTIVE'")
    .run(reason === "EXPIRED" ? "EXPIRED" : "REVOKED", reason, nowMs, grant.id);
  audit(db, principal, reason === "EXPIRED" ? "TEMPORARY_ACCESS_EXPIRED" : "TEMPORARY_ACCESS_REVOKED", grant.case_id,
    { run_id: grant.run_id, operation: grant.operation, grant_id: grant.id, reason_code: reason });
}

export function readRestrictionDetails(db: Database.Database, principal: VerifiedPrincipal, input: ReadInput, nowMs = Date.now()) {
  try {
    requireCurrentRun(db, input.run_id);
    requireCapability(principal, "REQUEST_CASE_ACCESS");
    if (!principal.staff_id || !principal.session_id) deny(403, "ACCESS_NOT_ELIGIBLE", "a verified staff session is required");
    const grant = one<Grant>(db, "SELECT * FROM temporary_access_grants WHERE id = ?", input.grant_id);
    if (!grant) throw new AccessError(403, "temporary access does not cover this request", "ACCESS_SCOPE_DENIED");
    if (grant.run_id !== input.run_id || grant.session_id !== principal.session_id || grant.account_id !== principal.account_id ||
        grant.staff_id !== principal.staff_id || grant.case_id !== input.case_id || grant.customer_id !== input.customer_id || grant.operation !== input.operation) {
      deny(403, "ACCESS_SCOPE_DENIED", "temporary access does not cover this request");
    }
    if (grant.status !== "ACTIVE") deny(403, grant.status === "EXPIRED" ? "ACCESS_EXPIRED" : "ACCESS_REVOKED", "temporary access is no longer active");
    if (grant.expires_at_ms <= nowMs) {
      revoke(db, principal, grant, "EXPIRED", nowMs);
      deny(403, "ACCESS_EXPIRED", "temporary access has expired");
    }
    let facts: PolicyFacts;
    try { facts = policyFacts(db, principal, input.case_id, input.operation); }
    catch (error) {
      if (error instanceof AccessError) revoke(db, principal, grant, error.code ?? "POLICY_NO_LONGER_VALID", nowMs);
      throw error;
    }
    if (facts.accessCase.customer_id !== input.customer_id) deny(403, "ACCESS_SCOPE_DENIED", "temporary access does not cover this customer");
    audit(db, principal, "TEMPORARY_ACCESS_USED", input.case_id, { run_id: input.run_id, operation: input.operation, grant_id: grant.id, customer_id: input.customer_id });
    return {
      case_id: input.case_id, customer_id: input.customer_id, customer_ref: facts.accessCase.customer_ref,
      operation: ACCESS_OPERATION, restriction_status: facts.accessCase.restriction_summary,
      expires_at_ms: grant.expires_at_ms, source: "verified sample complaint record",
    };
  } catch (error) {
    if (error instanceof AccessError) audit(db, principal, "TEMPORARY_ACCESS_DENIED", input.case_id,
      { run_id: input.run_id, operation: input.operation, grant_id: input.grant_id, reason_code: error.code ?? "ACCESS_DENIED" });
    throw error;
  }
}

export function completeAccessCase(db: Database.Database, principal: VerifiedPrincipal, runId: string, caseId: string, nowMs = Date.now()) {
  requireCurrentRun(db, runId);
  requireCapability(principal, "REQUEST_CASE_ACCESS");
  if (!principal.staff_id || !principal.session_id) deny(403, "ACCESS_NOT_ELIGIBLE", "a verified staff session is required");
  return db.transaction(() => {
    const accessCase = one<AccessCase>(db, "SELECT * FROM access_cases WHERE id = ?", caseId);
    if (!accessCase) throw new AccessError(403, "only the assigned substitute can complete this case", "ACCESS_WRONG_ASSIGNEE");
    if (accessCase.assigned_staff_id !== principal.staff_id) deny(403, "ACCESS_WRONG_ASSIGNEE", "only the assigned substitute can complete this case");
    if (accessCase.status !== "OPEN") return { case_id: caseId, status: accessCase.status, access_status: "ENDED" as const };
    const changed = db.prepare("UPDATE access_cases SET status = 'COMPLETED', completed_at = ? WHERE id = ? AND status = 'OPEN'").run(serverTimestamp(), caseId);
    if (changed.changes !== 1) throw new AccessError(409, "the case changed before completion", "ACCESS_CASE_CHANGED");
    db.prepare(`UPDATE temporary_access_grants SET status = 'REVOKED', revoked_reason = 'CASE_COMPLETED', revoked_at_ms = ?
      WHERE run_id = ? AND case_id = ? AND status = 'ACTIVE'`).run(nowMs, runId, caseId);
    audit(db, principal, "ACCESS_CASE_COMPLETED", caseId, { run_id: runId, revoked_active_grants: true });
    return { case_id: caseId, status: "COMPLETED" as const, access_status: "ENDED" as const };
  }).immediate();
}

function grantProjection(grant: Grant | undefined, nowMs: number) {
  if (!grant) return null;
  const status = grant.status === "ACTIVE" && grant.expires_at_ms <= nowMs ? "EXPIRED" : grant.status;
  return { id: grant.id, operation: grant.operation, status, issued_at_ms: grant.issued_at_ms, expires_at_ms: grant.expires_at_ms };
}

export function accessBridgeView(db: Database.Database, principal: VerifiedPrincipal, nowMs = Date.now()) {
  const runId = currentRunId(db);
  if (hasCapability(principal, "REQUEST_CASE_ACCESS")) {
    if (!principal.staff_id || !principal.session_id) deny(403, "ACCESS_NOT_ELIGIBLE", "a verified staff session is required");
    const cases = db.prepare("SELECT * FROM access_cases WHERE assigned_staff_id = ? ORDER BY id").all(principal.staff_id) as AccessCase[];
    return {
      mode: "OPERATOR" as const, run_id: runId,
      notice: "Sample-data local permission gate. No live bank IAM or PAM connection.",
      cases: cases.map((accessCase) => {
        const grant = one<Grant>(db, `SELECT * FROM temporary_access_grants WHERE run_id = ? AND session_id = ? AND case_id = ? ORDER BY issued_at_ms DESC LIMIT 1`, runId, principal.session_id!, accessCase.id);
        return {
          id: accessCase.id, customer_id: accessCase.customer_id, customer_ref: accessCase.customer_ref,
          operation: ACCESS_OPERATION, status: accessCase.status, sensitivity: accessCase.sensitivity,
          evidence_status: accessCase.evidence_status, ticket_id: accessCase.ticket_id,
          facts: ["Assigned open complaint", "Approved independent coverage", "Eligible read-only operation", "Ordinary owner on approved leave"],
          grant: grantProjection(grant, nowMs),
        };
      }),
    };
  }
  if (!hasCapability(principal, "READ_INVESTIGATIONS")) deny(403, "ACCESS_DENIED", "permission denied");
  const rows = db.prepare(`SELECT c.id,c.customer_ref,c.status,c.sensitivity,c.evidence_status,s.pseudo_id assigned_pseudonym,
    (SELECT outcome FROM access_requests r WHERE r.case_id = c.id ORDER BY rowid DESC LIMIT 1) latest_request,
    (SELECT status FROM temporary_access_grants g WHERE g.case_id = c.id ORDER BY issued_at_ms DESC LIMIT 1) grant_status
    FROM access_cases c JOIN staff s ON s.id = c.assigned_staff_id ORDER BY c.id`).all() as Record<string, unknown>[];
  return { mode: "MONITOR" as const, run_id: runId, cases: rows };
}

export function accessScopeFingerprint(caseId: string, customerId: string, operation: string): string {
  return createHash("sha256").update(JSON.stringify({ caseId, customerId, operation })).digest("hex");
}
