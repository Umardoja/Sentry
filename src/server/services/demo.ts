import "server-only";
import type Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { DB_PATH, DEMO_WORKSPACE_ROOT, SEED, demoModeEnabled } from "../config";
import { closeDb, getDb, setDb } from "../db/client";
import { openDatabase } from "../db/migrate";
import { nextStep } from "../sim/player";
import { seedDatabase } from "../sim/seed";
import { clearMetricsCache } from "./read";
import { rotateRunId } from "./run";
import { currentWorkspaceId, workspaceDatabasePath, workspaceRoot } from "./workspace";

const activePath = () => currentWorkspaceId() ? workspaceDatabasePath(currentWorkspaceId()!) : DB_PATH;
const templatePath = (seed: number, path: string) => currentWorkspaceId()
  ? join(workspaceRoot(), "_templates", `showcase-access-v1-${seed}.db`)
  : join(dirname(path), `seed-${seed}.db`);

function ensureTemplate(template: string, seed: number, preparedShowcase = false): boolean {
  if (existsSync(template)) return false;
  mkdirSync(dirname(template), { recursive: true });
  const { db: seeded } = seedDatabase(template, seed);
  if (preparedShowcase) {
    // A fresh demo visitor lands on the first open investigation: legitimate
    // overtime has cleared and the wrong-destination reversal awaits evidence.
    // No operator answer, reviewer decision, or containment effect is automated.
    for (let step = 0; step < 3; step += 1) nextStep(seeded);
  }
  seeded.pragma("wal_checkpoint(TRUNCATE)");
  seeded.close();
  for (const suffix of ["-wal", "-shm"]) if (existsSync(template + suffix)) rmSync(template + suffix);
  return true;
}

/**
 * Performs the expensive deterministic seed build before a demo server accepts
 * visitors. Each visitor still receives a private copy and a fresh run ID.
 */
export function prepareDemoWorkspaceTemplate(seed = SEED): { path: string; created: boolean } {
  if (!demoModeEnabled() || !DEMO_WORKSPACE_ROOT) throw new Error("SENTRY_DEMO_MODE=1 and DEMO_WORKSPACE_ROOT are required");
  const template = join(workspaceRoot(), "_templates", `showcase-access-v1-${seed}.db`);
  return { path: template, created: ensureTemplate(template, seed, true) };
}

/** Database for the request; seeds on first use. */
export function db(): Database.Database {
  const path = activePath();
  if (!existsSync(path)) resetDemo();
  const d = getDb(path);
  const seeded = d.prepare("SELECT value FROM sim_state WHERE key = 'clock'").get();
  if (!seeded) {
    resetDemo();
    return getDb(path);
  }
  const run = d.prepare("SELECT value FROM sim_state WHERE key = 'run_id'").get();
  if (!run) rotateRunId(d);
  return d;
}

/** Restores the seeded starting state. Seeds a template once, then copies it (instant resets). */
export function resetDemo(seed = SEED): void {
  const path = activePath();
  clearMetricsCache();
  closeDb(path);
  mkdirSync(dirname(path), { recursive: true });
  const template = templatePath(seed, path);
  ensureTemplate(template, seed, !!currentWorkspaceId());
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) rmSync(path + suffix);
  copyFileSync(template, path);
  const fresh = openDatabase(path);
  rotateRunId(fresh);
  setDb(fresh, path);
}
