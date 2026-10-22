import "server-only";
import Database from "better-sqlite3";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Role, VerifiedPrincipal } from "./policy";
import { capabilitiesFor } from "./policy";

const SESSION_MS = 8 * 60 * 60 * 1000;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const ddl = `
CREATE TABLE IF NOT EXISTS auth_accounts (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
  roles TEXT NOT NULL, staff_id TEXT, enabled INTEGER NOT NULL CHECK (enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES auth_accounts(id), token_digest TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL, issued_at_ms INTEGER NOT NULL, expires_at_ms INTEGER NOT NULL, revoked_at_ms INTEGER,
  workspace_id TEXT, auth_mode TEXT NOT NULL DEFAULT 'password' CHECK (auth_mode IN ('password','demo'))
);
CREATE INDEX IF NOT EXISTS auth_sessions_digest ON auth_sessions(token_digest);
CREATE TABLE IF NOT EXISTS auth_login_throttle (
  username_key TEXT PRIMARY KEY, failures INTEGER NOT NULL, window_started_ms INTEGER NOT NULL, blocked_until_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_reveal_grants (
  session_id TEXT NOT NULL REFERENCES auth_sessions(id), run_id TEXT NOT NULL, case_id TEXT NOT NULL, granted_at_ms INTEGER NOT NULL, reason TEXT NOT NULL,
  PRIMARY KEY (session_id, run_id, case_id)
);
CREATE TABLE IF NOT EXISTS auth_security_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL, principal_id TEXT, action TEXT NOT NULL,
  resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_demo_workspaces (
  id TEXT PRIMARY KEY, created_at_ms INTEGER NOT NULL, last_seen_at_ms INTEGER NOT NULL
);
`;

export type ProvisionedAccount = { id: string; username: string; password: string; roles: Role[]; staff_id: string | null; enabled?: boolean };
export type SessionIssue = { token: string; csrf_token: string; principal: VerifiedPrincipal; expires_at_ms: number };
type AccountRow = { id: string; username: string; password_salt: string; password_hash: string; roles: string; staff_id: string | null; enabled: number };
type SessionRow = AccountRow & { session_id: string; csrf_token: string; expires_at_ms: number; revoked_at_ms: number | null; workspace_id: string | null; auth_mode: "password" | "demo" };

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const passwordHash = (password: string, salt: Buffer) => scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const parseRoles = (value: string) => JSON.parse(value) as Role[];
const principalOf = (row: AccountRow, sessionId: string, workspaceId: string | null = null, authMode: "password" | "demo" = "password"): VerifiedPrincipal => {
  const roles = parseRoles(row.roles);
  return { kind: "session", account_id: row.id, username: row.username, staff_id: row.staff_id, roles, capabilities: capabilitiesFor(roles), session_id: sessionId, workspace_id: workspaceId, auth_mode: authMode };
};

export function openAuthDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const auth = new Database(path);
  auth.pragma("journal_mode = WAL");
  auth.pragma("foreign_keys = ON");
  auth.exec(ddl);
  const sessionColumns = auth.prepare("PRAGMA table_info(auth_sessions)").all() as { name: string }[];
  if (!sessionColumns.some((column) => column.name === "workspace_id")) auth.exec("ALTER TABLE auth_sessions ADD COLUMN workspace_id TEXT");
  if (!sessionColumns.some((column) => column.name === "auth_mode")) auth.exec("ALTER TABLE auth_sessions ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'password'");
  const revealColumns = auth.prepare("PRAGMA table_info(auth_reveal_grants)").all() as { name: string }[];
  if (!revealColumns.some((column) => column.name === "run_id")) {
    auth.transaction(() => {
      auth.exec(`ALTER TABLE auth_reveal_grants RENAME TO auth_reveal_grants_unscoped;
        CREATE TABLE auth_reveal_grants (
          session_id TEXT NOT NULL REFERENCES auth_sessions(id), run_id TEXT NOT NULL, case_id TEXT NOT NULL,
          granted_at_ms INTEGER NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (session_id, run_id, case_id)
        );
        DROP TABLE auth_reveal_grants_unscoped;`);
    })();
  }
  return auth;
}

export function provisionAccounts(auth: Database.Database, accounts: ProvisionedAccount[]): void {
  const insert = auth.prepare(`INSERT INTO auth_accounts (id, username, password_salt, password_hash, roles, staff_id, enabled)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, password_salt=excluded.password_salt,
    password_hash=excluded.password_hash, roles=excluded.roles, staff_id=excluded.staff_id, enabled=excluded.enabled`);
  const now = Date.now();
  auth.transaction(() => {
    for (const account of accounts) {
      if (account.password.length < 12 || account.password.length > 128) throw new Error(`password for ${account.id} must be 12 to 128 characters`);
      const salt = randomBytes(16);
      insert.run(account.id, account.username.toLowerCase(), salt.toString("hex"), passwordHash(account.password, salt).toString("hex"), JSON.stringify(account.roles), account.staff_id, account.enabled === false ? 0 : 1);
      auth.prepare("UPDATE auth_sessions SET revoked_at_ms = COALESCE(revoked_at_ms, ?) WHERE account_id = ?").run(now, account.id);
    }
  })();
}

export function ensureDemoAccounts(auth: Database.Database, accounts: Omit<ProvisionedAccount, "password">[]): void {
  const insert = auth.prepare(`INSERT INTO auth_accounts (id, username, password_salt, password_hash, roles, staff_id, enabled) VALUES (?,?,?,?,?,?,?)`);
  const update = auth.prepare("UPDATE auth_accounts SET username = ?, roles = ?, staff_id = ?, enabled = ? WHERE id = ?");
  auth.transaction(() => {
    for (const account of accounts) {
      const enabled = account.enabled === false ? 0 : 1;
      if (auth.prepare("SELECT 1 FROM auth_accounts WHERE id = ?").get(account.id)) {
        update.run(account.username, JSON.stringify(account.roles), account.staff_id, enabled, account.id);
      } else {
        const salt = randomBytes(16);
        const unreachablePassword = randomBytes(48).toString("base64url");
        insert.run(account.id, account.username, salt.toString("hex"), passwordHash(unreachablePassword, salt).toString("hex"), JSON.stringify(account.roles), account.staff_id, enabled);
      }
    }
  })();
}

function issueSession(auth: Database.Database, account: AccountRow, workspaceId: string | null, authMode: "password" | "demo", now: number): SessionIssue {
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  const sessionId = `SES-${randomBytes(16).toString("hex")}`;
  const expires = now + SESSION_MS;
  auth.prepare(`INSERT INTO auth_sessions
    (id, account_id, token_digest, csrf_token, issued_at_ms, expires_at_ms, revoked_at_ms, workspace_id, auth_mode)
    VALUES (?,?,?,?,?,?,NULL,?,?)`).run(sessionId, account.id, digest(token), csrf, now, expires, workspaceId, authMode);
  securityAudit(auth, now, account.id, authMode === "demo" ? "DEMO_ENTER" : "LOGIN", "session", sessionId, workspaceId ? { workspace_id: workspaceId } : {});
  return { token, csrf_token: csrf, principal: principalOf(account, sessionId, workspaceId, authMode), expires_at_ms: expires };
}

function failed(auth: Database.Database, usernameKey: string, now: number): void {
  const row = auth.prepare("SELECT * FROM auth_login_throttle WHERE username_key = ?").get(usernameKey) as { failures: number; window_started_ms: number; blocked_until_ms: number } | undefined;
  const inWindow = !!row && now - row.window_started_ms <= FAILURE_WINDOW_MS;
  const failures = inWindow ? row.failures + 1 : 1;
  const started = inWindow ? row.window_started_ms : now;
  const blocked = failures >= MAX_FAILURES ? now + BLOCK_MS : 0;
  auth.prepare("INSERT OR REPLACE INTO auth_login_throttle VALUES (?,?,?,?)").run(usernameKey, failures, started, blocked);
}

export function login(auth: Database.Database, username: string, password: string, now = Date.now()): SessionIssue | null {
  if (username.length > 128 || password.length > 128) return null;
  const normalized = username.trim().toLowerCase();
  const key = digest(normalized);
  const throttle = auth.prepare("SELECT blocked_until_ms FROM auth_login_throttle WHERE username_key = ?").get(key) as { blocked_until_ms: number } | undefined;
  if (throttle && throttle.blocked_until_ms > now) return null;
  const account = auth.prepare("SELECT * FROM auth_accounts WHERE username = ?").get(normalized) as AccountRow | undefined;
  const salt = account ? Buffer.from(account.password_salt, "hex") : Buffer.alloc(16);
  const expected = account ? Buffer.from(account.password_hash, "hex") : Buffer.alloc(64);
  const actual = passwordHash(password, salt);
  if (!account || !account.enabled || !timingSafeEqual(actual, expected)) {
    failed(auth, key, now);
    return null;
  }
  auth.prepare("DELETE FROM auth_login_throttle WHERE username_key = ?").run(key);
  auth.prepare("UPDATE auth_sessions SET revoked_at_ms = ? WHERE account_id = ? AND auth_mode = 'password' AND revoked_at_ms IS NULL").run(now, account.id);
  return issueSession(auth, account, null, "password", now);
}

export function issueDemoSession(auth: Database.Database, accountId: string, workspaceId: string, previousSessionId: string | null, now = Date.now()): SessionIssue {
  const account = auth.prepare("SELECT * FROM auth_accounts WHERE id = ?").get(accountId) as AccountRow | undefined;
  if (!account?.enabled) throw new Error("demo persona is unavailable");
  return auth.transaction(() => {
    if (previousSessionId) {
      auth.prepare("DELETE FROM auth_reveal_grants WHERE session_id = ?").run(previousSessionId);
      auth.prepare("UPDATE auth_sessions SET revoked_at_ms = COALESCE(revoked_at_ms, ?) WHERE id = ?").run(now, previousSessionId);
    }
    auth.prepare("INSERT OR IGNORE INTO auth_demo_workspaces VALUES (?,?,?)").run(workspaceId, now, now);
    auth.prepare("UPDATE auth_demo_workspaces SET last_seen_at_ms = ? WHERE id = ?").run(now, workspaceId);
    return issueSession(auth, account, workspaceId, "demo", now);
  })();
}

export function sessionFromToken(auth: Database.Database, token: string | null, now = Date.now()): { principal: VerifiedPrincipal; csrf_token: string; expires_at_ms: number } | null {
  if (!token || token.length > 256) return null;
  const row = auth.prepare(`SELECT a.*, s.id session_id, s.csrf_token, s.expires_at_ms, s.revoked_at_ms, s.workspace_id, s.auth_mode
    FROM auth_sessions s JOIN auth_accounts a ON a.id = s.account_id WHERE s.token_digest = ?`).get(digest(token)) as SessionRow | undefined;
  if (!row || !row.enabled || row.revoked_at_ms !== null || row.expires_at_ms <= now) return null;
  if (row.workspace_id) auth.prepare("UPDATE auth_demo_workspaces SET last_seen_at_ms = ? WHERE id = ?").run(now, row.workspace_id);
  return { principal: principalOf(row, row.session_id, row.workspace_id, row.auth_mode), csrf_token: row.csrf_token, expires_at_ms: row.expires_at_ms };
}

export function activeDemoWorkspaceIds(auth: Database.Database, now = Date.now()): Set<string> {
  const rows = auth.prepare("SELECT DISTINCT workspace_id FROM auth_sessions WHERE auth_mode = 'demo' AND workspace_id IS NOT NULL AND revoked_at_ms IS NULL AND expires_at_ms > ?").all(now) as { workspace_id: string }[];
  return new Set(rows.map((row) => row.workspace_id));
}

export function demoWorkspaceCount(auth: Database.Database): number {
  return (auth.prepare("SELECT COUNT(*) count FROM auth_demo_workspaces").get() as { count: number }).count;
}

/** Tracked visitor workspaces, least recently used first. */
export function demoWorkspaces(auth: Database.Database): { id: string; last_seen_at_ms: number }[] {
  return auth.prepare("SELECT id, last_seen_at_ms FROM auth_demo_workspaces ORDER BY last_seen_at_ms, id").all() as { id: string; last_seen_at_ms: number }[];
}

/** Ends every session bound to retired workspaces, so a stale cookie cannot recreate one outside the cap. */
export function revokeWorkspaceSessions(auth: Database.Database, workspaceIds: string[], now = Date.now()): void {
  const revoke = auth.prepare("UPDATE auth_sessions SET revoked_at_ms = COALESCE(revoked_at_ms, ?) WHERE workspace_id = ?");
  auth.transaction(() => workspaceIds.forEach((id) => revoke.run(now, id)))();
}

export function forgetDemoWorkspaces(auth: Database.Database, workspaceIds: string[]): void {
  const remove = auth.prepare("DELETE FROM auth_demo_workspaces WHERE id = ?");
  auth.transaction(() => workspaceIds.forEach((id) => remove.run(id)))();
}

export function revokeSession(auth: Database.Database, sessionId: string, principalId: string, now = Date.now()): void {
  auth.prepare("UPDATE auth_sessions SET revoked_at_ms = COALESCE(revoked_at_ms, ?) WHERE id = ?").run(now, sessionId);
  securityAudit(auth, now, principalId, "LOGOUT", "session", sessionId, {});
}

export function grantReveal(auth: Database.Database, sessionId: string, runId: string, caseId: string, reason: string, now = Date.now()): void {
  auth.prepare("INSERT OR REPLACE INTO auth_reveal_grants VALUES (?,?,?,?,?)").run(sessionId, runId, caseId, now, reason);
}

export function hasReveal(auth: Database.Database, sessionId: string | null, runId: string, caseId: string): boolean {
  return !!sessionId && !!auth.prepare("SELECT 1 FROM auth_reveal_grants WHERE session_id = ? AND run_id = ? AND case_id = ?").get(sessionId, runId, caseId);
}

export function securityAudit(auth: Database.Database, now: number, principalId: string | null, action: string, resourceType: string, resourceId: string, detail: Record<string, unknown>): void {
  auth.prepare("INSERT INTO auth_security_audit (occurred_at, principal_id, action, resource_type, resource_id, detail) VALUES (?,?,?,?,?,?)")
    .run(new Date(now).toISOString(), principalId, action, resourceType, resourceId, JSON.stringify(detail));
}

export function serverTimestamp(): string {
  return new Date().toISOString();
}
