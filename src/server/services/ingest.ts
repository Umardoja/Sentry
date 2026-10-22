import "server-only";
import type Database from "better-sqlite3";
import { createHash, timingSafeEqual } from "node:crypto";
import type { IngestEvent } from "@/shared/schemas";
import { AccessError } from "../auth/policy";
import { ingestKey } from "../config";
import { runPurpose } from "../engines/pipeline";
import { BASELINE_BANK, CHARACTERS, S2_ACCOUNTS, S2_FAILED_DEBITS } from "../sim/generator";
import { score } from "../sim/player";

export const INGEST_TAG = "INGEST";
const INGEST_STEP = "INGEST";

export type IngestSummary = {
  received: number;
  inserted: number;
  duplicates: string[];
  rejected: { id: string; reason: string }[];
  /** Purpose status per inserted staff action. */
  actions: { id: string; type: string; status: string }[];
  scored: { staff_id: string; ts: string; score: number; level: string; review_required: boolean }[];
  cases_opened: string[];
};

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Rejects the request unless X-Ingest-Key matches INGEST_KEY. Ingest is closed while INGEST_KEY is unset. */
export function requireIngestKey(request: Request): void {
  const expected = ingestKey();
  const supplied = request.headers.get("x-ingest-key");
  if (!expected || !supplied || !timingSafeEqual(digest(supplied), digest(expected))) throw new AccessError(401, "valid X-Ingest-Key required");
}

// Scripted S1–S4 characters and records stay untouchable, so the rehearsal is identical with or without ingest.
const SCRIPTED_STAFF = new Set<string>([CHARACTERS.approver, CHARACTERS.ngozi, CHARACTERS.tunde, CHARACTERS.bisi, CHARACTERS.kemi, ...CHARACTERS.otherViewers, CHARACTERS.agent]);
const SCRIPTED_TXNS = new Set<string>(S2_FAILED_DEBITS.map((d) => d.id));
const SCRIPTED_ACCOUNTS = new Set<string>(S2_ACCOUNTS.map((a) => a.id));
const scriptedId = (id: string) => /^(ACT-S\d|TXN-S\d|LOG-SES-S\d|OUT-)/.test(id) || SCRIPTED_TXNS.has(id);
const scriptedRecord = (id: string) => SCRIPTED_TXNS.has(id) || SCRIPTED_ACCOUNTS.has(id) || /^(TXN-S\d|ACC-V\d|CUS-[NV]\d)/.test(id);

const ACTION_TYPE = { reversal: "REVERSAL", record_view: "RECORD_VIEW", export: "BULK_EXPORT" } as const;

/**
 * Inserts a batch of staff events, then runs purpose checks and the scenario
 * scoring path (signals, evidence, score, review ladder) for each affected staff member.
 * Idempotent on event id: an id already present is reported and skipped.
 */
export function ingestEvents(db: Database.Database, events: IngestEvent[]): IngestSummary {
  const q = {
    seen: db.prepare("SELECT 1 FROM sensitive_actions WHERE id = @id UNION ALL SELECT 1 FROM logins WHERE id = @id UNION ALL SELECT 1 FROM transactions WHERE id = @id LIMIT 1"),
    staff: db.prepare("SELECT employment_type FROM staff WHERE id = ?"),
    terminal: db.prepare("SELECT branch FROM terminals WHERE id = ?"),
    account: db.prepare("SELECT customer_id FROM accounts WHERE id = ?"),
    customer: db.prepare("SELECT 1 FROM customers WHERE id = ?"),
    restricted: db.prepare("SELECT 1 FROM interventions i JOIN cases c ON c.id = i.case_id WHERE i.staff_id = ? AND i.type = 'RESTRICT_DATA_ACCESS' AND c.status IN ('OPEN','CONTAINED') AND i.status IN ('ACTIVE','APPROVED')"),
    login: db.prepare("INSERT INTO logins VALUES (?,?,?,?,?,?,?,?)"),
    txn: db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?)"),
    action: db.prepare("INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"),
    cases: db.prepare("SELECT id FROM cases ORDER BY id"),
    purpose: db.prepare("SELECT status FROM purpose_results WHERE action_id = ?"),
  };

  const problem = (e: IngestEvent): string | null => {
    if (scriptedId(e.id)) return "event id is reserved for a scripted scenario";
    if (e.type === "failed_debit") {
      const account = q.account.get(e.debit_account_id);
      if (!account) return "unknown debit account";
      return scriptedRecord(e.debit_account_id) ? "debit account belongs to a scripted scenario" : null;
    }
    const staff = q.staff.get(e.staff_id) as { employment_type: string } | undefined;
    if (!staff) return "unknown staff";
    if (staff.employment_type === "AGENT") return "agent accounts are not ingested";
    if (SCRIPTED_STAFF.has(e.staff_id)) return "staff member is a scripted scenario character";
    if (!q.terminal.get(e.terminal_id)) return "unknown terminal";
    if (e.type === "reversal") {
      if (!q.account.get(e.credit_account_id)) return "unknown credit account";
      if (scriptedRecord(e.credit_account_id) || scriptedRecord(e.original_txn_id)) return "reversal references a scripted scenario record";
    }
    if (e.type === "record_view") {
      if (!q.customer.get(e.customer_id)) return "unknown customer";
      if (scriptedRecord(e.customer_id)) return "customer belongs to a scripted scenario";
    }
    return null;
  };

  const run = db.transaction((): IngestSummary => {
    const casesBefore = new Set((q.cases.all() as { id: string }[]).map((c) => c.id));
    const summary: IngestSummary = { received: events.length, inserted: 0, duplicates: [], rejected: [], actions: [], scored: [], cases_opened: [] };
    const actionIds: { id: string; type: string }[] = [];
    const latest = new Map<string, string>();
    for (const e of events) {
      if (q.seen.get({ id: e.id })) { summary.duplicates.push(e.id); continue; }
      const reason = problem(e);
      if (reason) { summary.rejected.push({ id: e.id, reason }); continue; }
      if (e.type === "failed_debit") {
        q.txn.run(e.id, `NIP-${e.id}`, e.debit_account_id, e.amount, "2000000000", BASELINE_BANK, e.ts, "APP", "FAILED", "91");
      } else if (e.type === "login") {
        const terminal = q.terminal.get(e.terminal_id) as { branch: string };
        q.login.run(e.id, e.staff_id, e.terminal_id, terminal.branch, e.ts, e.session_id, "ACTIVE", INGEST_TAG);
      } else {
        const blocked = e.type !== "reversal" && !!q.restricted.get(e.staff_id);
        const customer = e.type === "record_view" ? e.customer_id
          : e.type === "reversal" ? (q.account.get(e.credit_account_id) as { customer_id: string }).customer_id : null;
        q.action.run(
          e.id, e.staff_id, e.session_id, e.terminal_id, e.ts, ACTION_TYPE[e.type],
          e.type === "reversal" ? e.original_txn_id : null, e.type === "reversal" ? e.credit_account_id : null, customer,
          e.type === "reversal" ? e.amount : null, e.type === "reversal" ? null : e.ticket_ref,
          blocked ? "BLOCKED" : "POSTED", e.type === "export" ? JSON.stringify({ rows: e.rows, scope: e.scope }) : null, INGEST_TAG, 0,
        );
        actionIds.push({ id: e.id, type: ACTION_TYPE[e.type] });
      }
      summary.inserted++;
      if (e.type !== "failed_debit" && (latest.get(e.staff_id) ?? "") < e.ts) latest.set(e.staff_id, e.ts);
    }
    runPurpose(db, actionIds.map((a) => a.id));
    summary.actions = actionIds.map((a) => ({ ...a, status: (q.purpose.get(a.id) as { status: string }).status }));
    for (const [staffId, ts] of [...latest].sort(([a], [b]) => a.localeCompare(b))) {
      const e = score(db, staffId, ts, INGEST_STEP);
      summary.scored.push({ staff_id: staffId, ts, score: e.score, level: e.level, review_required: e.review.required });
    }
    summary.cases_opened = (q.cases.all() as { id: string }[]).map((c) => c.id).filter((id) => !casesBefore.has(id));
    return summary;
  });
  return run();
}
