import "server-only";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export const TABLES = [
  "staff", "roster", "leave", "overtime", "terminals", "logins", "customers", "accounts",
  "transactions", "tickets", "sensitive_actions", "outbound_transfers", "purpose_results",
  "signals", "risk_scores", "cases", "interventions", "case_notes", "audit_log", "sim_state",
  "bvn_watchlist", "scam_reports", "ticket_answers", "evidence_evaluations", "intervention_reviews",
  "access_cases", "case_coverage_delegations", "access_eligibility", "access_requests", "temporary_access_grants",
] as const;

const ddl = `
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, pseudo_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OPS_REVERSALS','OPS_EPRODUCTS','CUSTOMER_SERVICE','IT_ADMIN','BRANCH_OPS','INTERNAL_CONTROL','AI_AGENT')),
  team TEXT NOT NULL, branch TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('EMPLOYEE','CONTRACTOR','AGENT')),
  phone TEXT NOT NULL, usual_terminal_ids TEXT NOT NULL, declared_scope TEXT
);
CREATE TABLE IF NOT EXISTS roster (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), date TEXT NOT NULL, shift_start TEXT NOT NULL, shift_end TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS roster_staff_date ON roster(staff_id, date);
CREATE TABLE IF NOT EXISTS leave (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status = 'APPROVED'));
CREATE INDEX IF NOT EXISTS leave_staff ON leave(staff_id);
CREATE TABLE IF NOT EXISTS overtime (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), date TEXT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL,
  approved_by_staff_id TEXT NOT NULL REFERENCES staff(id), ticket_ref TEXT NOT NULL, CHECK (approved_by_staff_id <> staff_id)
);
CREATE INDEX IF NOT EXISTS overtime_staff_date ON overtime(staff_id, date);
CREATE TABLE IF NOT EXISTS terminals (id TEXT PRIMARY KEY, label TEXT NOT NULL, branch TEXT NOT NULL, location TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logins (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), terminal_id TEXT NOT NULL REFERENCES terminals(id),
  location TEXT NOT NULL, ts TEXT NOT NULL, session_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','ENDED')), scenario_tag TEXT
);
CREATE INDEX IF NOT EXISTS logins_staff_ts ON logins(staff_id, ts);
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, bvn_hash TEXT NOT NULL, is_dormant INTEGER NOT NULL, city TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), account_no TEXT NOT NULL UNIQUE, opened_at TEXT NOT NULL, phone TEXT NOT NULL, status TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS accounts_customer ON accounts(customer_id);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, session_ref TEXT NOT NULL, debit_account_id TEXT NOT NULL REFERENCES accounts(id), amount INTEGER NOT NULL,
  beneficiary_account_no TEXT NOT NULL, beneficiary_bank TEXT NOT NULL, ts TEXT NOT NULL, channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS','FAILED')), response_code TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_debit_ts ON transactions(debit_account_id, ts);
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('COMPLAINT','SERVICE_REQUEST','OVERTIME','EXPORT','CHANGE','SCAM_REPORT')),
  customer_id TEXT REFERENCES customers(id), transaction_id TEXT REFERENCES transactions(id), assigned_team TEXT NOT NULL,
  created_by_staff_id TEXT NOT NULL REFERENCES staff(id), approved_by_staff_id TEXT REFERENCES staff(id), created_at TEXT NOT NULL,
  status TEXT NOT NULL, scope TEXT
);
CREATE INDEX IF NOT EXISTS tickets_customer ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS tickets_txn ON tickets(transaction_id);
CREATE TABLE IF NOT EXISTS sensitive_actions (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), session_id TEXT NOT NULL, terminal_id TEXT NOT NULL REFERENCES terminals(id),
  ts TEXT NOT NULL, action_type TEXT NOT NULL CHECK (action_type IN ('REVERSAL','MANUAL_POSTING','RECORD_VIEW','LIMIT_CHANGE','BULK_EXPORT','PRIV_ACCESS')),
  original_txn_id TEXT, credit_account_id TEXT REFERENCES accounts(id), customer_id TEXT REFERENCES customers(id), amount INTEGER,
  ticket_ref TEXT, status TEXT NOT NULL CHECK (status IN ('POSTED','BLOCKED','PENDING_SECOND_APPROVAL')),
  detail TEXT, scenario_tag TEXT, is_malicious INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS actions_staff_ts ON sensitive_actions(staff_id, ts);
CREATE INDEX IF NOT EXISTS actions_ts ON sensitive_actions(ts);
CREATE INDEX IF NOT EXISTS actions_original ON sensitive_actions(original_txn_id);
CREATE INDEX IF NOT EXISTS actions_customer_ts ON sensitive_actions(customer_id, ts);
CREATE TABLE IF NOT EXISTS outbound_transfers (
  id TEXT PRIMARY KEY, from_account_id TEXT NOT NULL REFERENCES accounts(id), to_account_no TEXT NOT NULL, to_bank TEXT NOT NULL,
  amount INTEGER NOT NULL, ts TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('SENT','BLOCKED_BY_HOLD')), scenario_tag TEXT
);
CREATE INDEX IF NOT EXISTS transfers_from_ts ON outbound_transfers(from_account_id, ts);
CREATE TABLE IF NOT EXISTS purpose_results (
  action_id TEXT PRIMARY KEY REFERENCES sensitive_actions(id),
  status TEXT NOT NULL CHECK (status IN ('MATCHED','PARTIAL','NO_MATCH','WRONG_BENEFICIARY','DUPLICATE','NO_CASE')),
  checks TEXT NOT NULL, reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS purpose_status ON purpose_results(status);
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), code TEXT NOT NULL, tier INTEGER NOT NULL, points INTEGER NOT NULL,
  effective_points INTEGER NOT NULL, ts TEXT NOT NULL, first_ts TEXT NOT NULL, action_ids TEXT NOT NULL, evidence TEXT NOT NULL,
  waived INTEGER NOT NULL, waive_reason TEXT
);
CREATE INDEX IF NOT EXISTS signals_staff ON signals(staff_id);
CREATE TABLE IF NOT EXISTS risk_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL REFERENCES staff(id), ts TEXT NOT NULL, score INTEGER NOT NULL,
  raw_score INTEGER NOT NULL, level TEXT NOT NULL, breakdown TEXT NOT NULL, step_id TEXT
);
CREATE INDEX IF NOT EXISTS risk_staff_ts ON risk_scores(staff_id, ts);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), opened_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','CONTAINED','CLOSED_TRUE','CLOSED_FALSE')),
  peak_score INTEGER NOT NULL, level TEXT NOT NULL, unmasked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS interventions (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), staff_id TEXT NOT NULL REFERENCES staff(id),
  type TEXT NOT NULL CHECK (type IN ('REQUEST_REASON','SECOND_APPROVER','HOLD_FUNDS','RESTRICT_DATA_ACCESS','SUSPEND_SESSION','CONTACT_BVN_OWNER')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','PENDING_APPROVAL','APPROVED','REJECTED','RELEASED')),
  automatic INTEGER NOT NULL, created_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT, note TEXT, target TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS case_notes (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('TEMPLATE','LLM','CACHE')), sentences TEXT NOT NULL, recommendation TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sim_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bvn_watchlist (
  id TEXT PRIMARY KEY, bvn_hash TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id), case_id TEXT NOT NULL REFERENCES cases(id),
  intervention_id TEXT NOT NULL REFERENCES interventions(id), added_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','RELEASED','EXPIRED')), released_by TEXT, released_at TEXT
);
CREATE TABLE IF NOT EXISTS scam_reports (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), caller_number TEXT NOT NULL, reported_at TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('BRANCH','CONTACT_CENTRE','APP')), summary TEXT NOT NULL, ticket_id TEXT REFERENCES tickets(id)
);
CREATE INDEX IF NOT EXISTS scam_caller ON scam_reports(caller_number, reported_at);
CREATE TABLE IF NOT EXISTS ticket_answers (
  id TEXT PRIMARY KEY, action_id TEXT NOT NULL REFERENCES sensitive_actions(id), staff_id TEXT NOT NULL REFERENCES staff(id),
  ticket_ref TEXT NOT NULL, ts TEXT NOT NULL, valid INTEGER NOT NULL, failed_checks TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL REFERENCES staff(id), sim_ts TEXT NOT NULL,
  server_at TEXT, trigger TEXT NOT NULL, evidence_revision TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_evaluations_staff ON evidence_evaluations(staff_id, id);
CREATE TABLE IF NOT EXISTS intervention_reviews (
  review_ref TEXT PRIMARY KEY, run_id TEXT NOT NULL, intervention_id TEXT NOT NULL REFERENCES interventions(id),
  material_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS intervention_reviews_intervention ON intervention_reviews(intervention_id, run_id);
CREATE TABLE IF NOT EXISTS access_cases (
  id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id), customer_id TEXT NOT NULL REFERENCES customers(id),
  owner_staff_id TEXT NOT NULL REFERENCES staff(id), assigned_staff_id TEXT NOT NULL REFERENCES staff(id), assigned_team TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','COMPLETED','CLOSED')),
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('LOW','SENSITIVE')),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('VERIFIED','UNAVAILABLE')),
  customer_ref TEXT NOT NULL, restriction_summary TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS access_cases_assignee ON access_cases(assigned_staff_id, status);
CREATE TABLE IF NOT EXISTS case_coverage_delegations (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES access_cases(id), owner_staff_id TEXT NOT NULL REFERENCES staff(id),
  substitute_staff_id TEXT NOT NULL REFERENCES staff(id), approved_by_staff_id TEXT NOT NULL REFERENCES staff(id),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED')), starts_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  CHECK (owner_staff_id <> substitute_staff_id), CHECK (approved_by_staff_id <> owner_staff_id), CHECK (approved_by_staff_id <> substitute_staff_id)
);
CREATE INDEX IF NOT EXISTS coverage_case_substitute ON case_coverage_delegations(case_id, substitute_staff_id, status);
CREATE TABLE IF NOT EXISTS access_eligibility (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), operation TEXT NOT NULL,
  resource_scope TEXT NOT NULL CHECK (resource_scope = 'CASE_CUSTOMER'), status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
  approved_by_staff_id TEXT NOT NULL REFERENCES staff(id), approved_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eligibility_staff_operation ON access_eligibility(staff_id, operation, resource_scope);
CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, session_id TEXT NOT NULL, account_id TEXT NOT NULL, staff_id TEXT,
  case_id TEXT NOT NULL, customer_id TEXT, operation TEXT NOT NULL, requested_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('GRANTED','DENIED','REQUIRES_APPROVAL','CANNOT_VERIFY')),
  reason_code TEXT NOT NULL, grant_id TEXT
);
CREATE INDEX IF NOT EXISTS access_requests_case ON access_requests(case_id, requested_at);
CREATE TABLE IF NOT EXISTS temporary_access_grants (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES access_requests(id), run_id TEXT NOT NULL,
  session_id TEXT NOT NULL, account_id TEXT NOT NULL, staff_id TEXT NOT NULL REFERENCES staff(id),
  case_id TEXT NOT NULL REFERENCES access_cases(id), customer_id TEXT NOT NULL REFERENCES customers(id), operation TEXT NOT NULL,
  issued_at_ms INTEGER NOT NULL, expires_at_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  revoked_reason TEXT, revoked_at_ms INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS temporary_grant_scope ON temporary_access_grants(run_id, session_id, case_id, customer_id, operation);
`;

export function createSchema(database: Database.Database): void {
  database.exec(ddl);
}

export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  createSchema(database);
  return database;
}

export function resetDatabase(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) rmSync(path + suffix);
  openDatabase(path).close();
}
