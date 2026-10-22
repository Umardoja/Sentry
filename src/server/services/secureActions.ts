import "server-only";
import type Database from "better-sqlite3";
import { requireIndependentCaseReviewer, type VerifiedPrincipal } from "../auth/policy";
import { grantReveal, securityAudit, serverTimestamp } from "../auth/store";
import { clockOf } from "../sim/player";
import { requireCurrentRun } from "./run";

export function revealIdentity(business: Database.Database, auth: Database.Database, caseId: string, principal: VerifiedPrincipal, runId: string, reason: string) {
  if (!principal.session_id) throw new Error("session-bound reveal required");
  requireCurrentRun(business, runId);
  const relationship = requireIndependentCaseReviewer(business, principal, caseId);
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("A reason is required");
  const now = Date.now();
  grantReveal(auth, principal.session_id, runId, caseId, cleanReason, now);
  securityAudit(auth, now, principal.account_id, "IDENTITY_REVEAL", "case", caseId, { simulation_time: clockOf(business), run_id: runId });
  business.prepare("INSERT INTO audit_log (ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)")
    .run(clockOf(business), principal.account_id, "UNMASK", "case", caseId, JSON.stringify({ reason: cleanReason, actor_staff_id: principal.staff_id, server_at: serverTimestamp(), scope: "session_run_case", run_id: runId }));
  const staff = business.prepare("SELECT name FROM staff WHERE id = ?").get(relationship.staff_id) as { name: string };
  return { case_id: caseId, name: staff.name, revealed_by: principal.account_id, at: clockOf(business).slice(11, 16) };
}
