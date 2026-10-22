import "server-only";
import type Database from "better-sqlite3";

export type PurposeStatus = "MATCHED" | "PARTIAL" | "NO_MATCH" | "WRONG_BENEFICIARY" | "DUPLICATE" | "NO_CASE";
export type Check = { code: string; passed: boolean; detail: string };
export type PurposeResult = { action_id: string; status: PurposeStatus; checks: Check[]; reason: string };

export type ActionRow = {
  id: string; staff_id: string; session_id: string; terminal_id: string; ts: string; action_type: string;
  original_txn_id: string | null; credit_account_id: string | null; customer_id: string | null; amount: number | null;
  ticket_ref: string | null; status: string; detail: string | null;
};

type Txn = { id: string; debit_account_id: string; amount: number; status: string; ts: string };
type Acc = { id: string; customer_id: string; account_no: string; opened_at: string };
type Ticket = { id: string; type: string; customer_id: string | null; transaction_id: string | null; assigned_team: string; created_by_staff_id: string; approved_by_staff_id: string | null; created_at: string; status: string; scope: string | null };

const last4 = (no: string) => `••••${no.slice(-4)}`;
const dayMonth = (iso: string) => {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1];
  return `${Number(iso.slice(8, 10))} ${m}`;
};

export function purposeEngine(db: Database.Database) {
  const q = {
    txn: db.prepare("SELECT id, debit_account_id, amount, status, ts FROM transactions WHERE id = ?"),
    acc: db.prepare("SELECT id, customer_id, account_no, opened_at FROM accounts WHERE id = ?"),
    complaint: db.prepare("SELECT id FROM tickets WHERE transaction_id = ? AND type = 'COMPLAINT' LIMIT 1"),
    earlierReversal: db.prepare("SELECT id FROM sensitive_actions WHERE original_txn_id = ? AND action_type = 'REVERSAL' AND status = 'POSTED' AND id <> ? AND ts <= ? LIMIT 1"),
    staffTeam: db.prepare("SELECT team FROM staff WHERE id = ?"),
    openCase: db.prepare("SELECT id FROM tickets WHERE customer_id = ? AND type IN ('COMPLAINT','SERVICE_REQUEST') AND status = 'OPEN' AND assigned_team = ? AND created_at <= ? LIMIT 1"),
    ticket: db.prepare("SELECT * FROM tickets WHERE id = ?"),
    approvedTicketOfType: db.prepare("SELECT * FROM tickets WHERE id = ? AND type = ?"),
  };
  const teamOf = new Map<string, string>();
  const team = (staffId: string) => {
    if (!teamOf.has(staffId)) teamOf.set(staffId, (q.staffTeam.get(staffId) as { team: string } | undefined)?.team ?? "");
    return teamOf.get(staffId)!;
  };

  function reversal(a: ActionRow): PurposeResult {
    const checks: Check[] = [];
    const t = a.original_txn_id ? (q.txn.get(a.original_txn_id) as Txn | undefined) : undefined;
    checks.push({ code: "R1", passed: !!t, detail: t ? `Failed debit ${t.id}, ${t.ts.slice(11, 16)}` : "No original transaction found" });
    const failed = !!t && (t.status === "FAILED" || !!q.complaint.get(t.id));
    checks.push({ code: "R2", passed: failed, detail: t ? (t.status === "FAILED" ? "Response code 91" : "Original transaction succeeded") : "Not checked" });
    const amountOk = !!t && t.amount === a.amount;
    checks.push({ code: "R3", passed: amountOk, detail: t ? `₦${(a.amount ?? 0).toLocaleString("en-US")}` : "Not checked" });
    let beneficiaryOk = false;
    let r4 = "Not checked";
    if (t && a.credit_account_id) {
      const credit = q.acc.get(a.credit_account_id) as Acc | undefined;
      const debit = q.acc.get(t.debit_account_id) as Acc | undefined;
      beneficiaryOk = !!credit && !!debit && (credit.id === debit.id || credit.customer_id === debit.customer_id);
      r4 = beneficiaryOk
        ? `Returned to ${last4(debit?.account_no ?? "")}`
        : `Went to ${last4(credit?.account_no ?? "")}, opened ${dayMonth(credit?.opened_at ?? "")}; debited account was ${last4(debit?.account_no ?? "")}`;
    }
    checks.push({ code: "R4", passed: beneficiaryOk, detail: r4 });
    const duplicate = !!t && !!q.earlierReversal.get(t.id, a.id, a.ts);
    checks.push({ code: "R5", passed: !duplicate, detail: duplicate ? "Already reversed" : "Not already reversed" });
    let status: PurposeStatus = "MATCHED";
    if (!checks[0]!.passed || !checks[1]!.passed) status = "NO_MATCH";
    else if (!beneficiaryOk) status = "WRONG_BENEFICIARY";
    else if (duplicate) status = "DUPLICATE";
    else if (!amountOk) status = "PARTIAL";
    return { action_id: a.id, status, checks, reason: status === "MATCHED" ? "Reversal matches a failed debit" : checks.find((c) => !c.passed)!.detail };
  }

  function recordView(a: ActionRow): PurposeResult {
    const hit = a.customer_id ? (q.openCase.get(a.customer_id, team(a.staff_id), a.ts) as { id: string } | undefined) : undefined;
    const checks = [{ code: "V1", passed: !!hit, detail: hit ? `Open case ${hit.id}` : "No open case for this customer" }];
    return { action_id: a.id, status: hit ? "MATCHED" : "NO_CASE", checks, reason: checks[0]!.detail };
  }

  function approvedTicket(a: ActionRow, type: string, code: string, scope?: string): PurposeResult {
    const t = a.ticket_ref ? (q.approvedTicketOfType.get(a.ticket_ref, type) as Ticket | undefined) : undefined;
    const ok = !!t && t.status === "APPROVED" && !!t.approved_by_staff_id && t.approved_by_staff_id !== a.staff_id && t.created_at <= a.ts && (!scope || t.scope === scope);
    const checks = [{ code, passed: ok, detail: ok ? `Approved ticket ${t!.id}` : "No approved ticket" }];
    return { action_id: a.id, status: ok ? "MATCHED" : "NO_MATCH", checks, reason: checks[0]!.detail };
  }

  function evaluate(a: ActionRow): PurposeResult {
    switch (a.action_type) {
      case "REVERSAL":
        return reversal(a);
      case "RECORD_VIEW":
        return recordView(a);
      case "BULK_EXPORT": {
        const scope = a.detail ? (JSON.parse(a.detail) as { scope?: string }).scope : undefined;
        return approvedTicket(a, "EXPORT", "E1", scope);
      }
      case "LIMIT_CHANGE":
        return approvedTicket(a, "SERVICE_REQUEST", "L1");
      case "MANUAL_POSTING":
        return approvedTicket(a, "CHANGE", "M1");
      default:
        return approvedTicket(a, "CHANGE", "P1");
    }
  }

  function ticketCanEstablishPurpose(a: ActionRow): boolean {
    return a.action_type === "BULK_EXPORT" || a.action_type === "LIMIT_CHANGE" || a.action_type === "MANUAL_POSTING" || a.action_type === "PRIV_ACCESS";
  }

  /** Ticket validation for a Verify answer (T1 to T5). */
  function validateTicket(a: ActionRow, ref: string): { valid: boolean; failed: string[] } {
    const t = q.ticket.get(ref) as Ticket | undefined;
    if (!t) return { valid: false, failed: ["T1"] };
    if (ticketCanEstablishPurpose(a)) {
      const result = evaluate({ ...a, ticket_ref: ref });
      return { valid: result.status === "MATCHED", failed: result.status === "MATCHED" ? [] : result.checks.filter((c) => !c.passed).map((c) => c.code) };
    }
    if (a.action_type !== "REVERSAL") return { valid: false, failed: ["T6"] };
    const failed: string[] = [];
    if (!(t.created_at <= a.ts)) failed.push("T2");
    if (t.assigned_team !== team(a.staff_id)) failed.push("T3");
    if (!(t.customer_id === a.customer_id || (a.original_txn_id && t.transaction_id === a.original_txn_id))) failed.push("T4");
    if (t.created_by_staff_id === a.staff_id) failed.push("T5");
    return { valid: failed.length === 0, failed };
  }

  return { evaluate, validateTicket, ticketCanEstablishPurpose };
}

export function savePurpose(db: Database.Database, results: PurposeResult[]): void {
  const s = db.prepare("INSERT OR REPLACE INTO purpose_results VALUES (?,?,?,?)");
  for (const r of results) s.run(r.action_id, r.status, JSON.stringify(r.checks), r.reason);
}
