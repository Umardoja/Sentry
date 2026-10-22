import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { DEMO_WORKSPACE_MAX, DEMO_WORKSPACE_ROOT, DEMO_WORKSPACE_TTL_HOURS } from "../config";
import { closeDb } from "../db/client";
import { demoWorkspaces, forgetDemoWorkspaces, revokeWorkspaceSessions, securityAudit } from "../auth/store";
import type Database from "better-sqlite3";

type WorkspaceContext = { workspaceId: string | null };
const context = new AsyncLocalStorage<WorkspaceContext>();
const WORKSPACE_RE = /^WS-[a-f0-9]{32}$/;

export function activateWorkspace(workspaceId: string | null | undefined): void {
  if (workspaceId && !WORKSPACE_RE.test(workspaceId)) throw new Error("invalid server workspace identity");
  context.enterWith({ workspaceId: workspaceId ?? null });
}

export function currentWorkspaceId(): string | null {
  return context.getStore()?.workspaceId ?? null;
}

export function runInWorkspace<T>(workspaceId: string | null | undefined, operation: () => T): T {
  if (workspaceId && !WORKSPACE_RE.test(workspaceId)) throw new Error("invalid server workspace identity");
  return context.run({ workspaceId: workspaceId ?? null }, operation);
}

export function newWorkspaceId(): string {
  return `WS-${randomBytes(16).toString("hex")}`;
}

export function workspaceRoot(): string {
  if (!DEMO_WORKSPACE_ROOT || !isAbsolute(DEMO_WORKSPACE_ROOT)) throw new Error("DEMO_WORKSPACE_ROOT must be an absolute path in demo mode");
  return resolve(DEMO_WORKSPACE_ROOT);
}

export function workspaceDirectory(workspaceId: string): string {
  if (!WORKSPACE_RE.test(workspaceId)) throw new Error("invalid server workspace identity");
  const root = workspaceRoot();
  const candidate = resolve(root, workspaceId);
  if (!candidate.startsWith(`${root}${sep}`)) throw new Error("workspace path escaped its configured root");
  return candidate;
}

export function workspaceDatabasePath(workspaceId: string): string {
  return join(workspaceDirectory(workspaceId), "business.db");
}

export function workspaceLimits() {
  if (!Number.isInteger(DEMO_WORKSPACE_MAX) || DEMO_WORKSPACE_MAX < 1 || DEMO_WORKSPACE_MAX > 1000) throw new Error("DEMO_WORKSPACE_MAX must be between 1 and 1000");
  if (!Number.isFinite(DEMO_WORKSPACE_TTL_HOURS) || DEMO_WORKSPACE_TTL_HOURS < 1 || DEMO_WORKSPACE_TTL_HOURS > 168) throw new Error("DEMO_WORKSPACE_TTL_HOURS must be between 1 and 168");
  return { max: DEMO_WORKSPACE_MAX, ttlMs: DEMO_WORKSPACE_TTL_HOURS * 60 * 60 * 1000 };
}

/** Removes only expired, server-named disposable workspace directories. */
export function cleanupWorkspaceDirectories(activeIds: Set<string>, now = Date.now()): string[] {
  const root = workspaceRoot();
  mkdirSync(root, { recursive: true });
  const { ttlMs } = workspaceLimits();
  const removed: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !WORKSPACE_RE.test(entry.name) || activeIds.has(entry.name)) continue;
    const directory = workspaceDirectory(entry.name);
    if (now - statSync(directory).mtimeMs < ttlMs) continue;
    closeDb(workspaceDatabasePath(entry.name));
    rmSync(directory, { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
}

export type RetiredWorkspace = { id: string; reason: "IDLE" | "CAPACITY" | "ORPHAN"; idle_minutes: number | null };

/**
 * Disk safety for hosting, run on each demo entry: deletes visitor workspaces unused for
 * DEMO_WORKSPACE_TTL_HOURS, then, if `reserve` more would pass DEMO_WORKSPACE_MAX, the least recently
 * used ones (never `keep`). Untracked WS-* directories older than the TTL go too. Only server-named
 * WS-* directories are removed; the prepared template and the auth store are never deleted.
 */
export function retireDemoWorkspaces(auth: Database.Database, options: { reserve: number; keep?: string | null }, now = Date.now()): RetiredWorkspace[] {
  const { max, ttlMs } = workspaceLimits();
  const rows = demoWorkspaces(auth).filter((row) => row.id !== options.keep);
  const idle = rows.filter((row) => now - row.last_seen_at_ms >= ttlMs);
  const fresh = rows.filter((row) => now - row.last_seen_at_ms < ttlMs);
  const tracked = fresh.length + (options.keep ? 1 : 0);
  const overflow = fresh.slice(0, Math.max(0, tracked + options.reserve - max));
  const idleMinutes = (row: { last_seen_at_ms: number }) => Math.floor((now - row.last_seen_at_ms) / 60000);
  const retired: RetiredWorkspace[] = [
    ...idle.map((row) => ({ id: row.id, reason: "IDLE" as const, idle_minutes: idleMinutes(row) })),
    ...overflow.map((row) => ({ id: row.id, reason: "CAPACITY" as const, idle_minutes: idleMinutes(row) })),
  ];
  for (const r of retired) removeWorkspaceDirectory(r.id);
  const ids = retired.map((r) => r.id);
  revokeWorkspaceSessions(auth, ids, now);
  forgetDemoWorkspaces(auth, ids);
  const known = new Set(demoWorkspaces(auth).map((row) => row.id));
  retired.push(...cleanupWorkspaceDirectories(known, now).map((id) => ({ id, reason: "ORPHAN" as const, idle_minutes: null })));
  for (const r of retired) {
    securityAudit(auth, now, null, "WORKSPACE_REMOVED", "workspace", r.id, { reason: r.reason, idle_minutes: r.idle_minutes });
    console.info(`[sentry] removed demo workspace ${r.id}: ${r.reason}${r.idle_minutes === null ? "" : `, unused ${r.idle_minutes} min`}`);
  }
  return retired;
}

export function removeWorkspaceDirectory(workspaceId: string): void {
  const directory = workspaceDirectory(workspaceId);
  closeDb(workspaceDatabasePath(workspaceId));
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
}
