import "server-only";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { AccessError } from "../auth/policy";

export function currentRunId(db: Database.Database): string {
  const row = db.prepare("SELECT value FROM sim_state WHERE key = 'run_id'").get() as { value: string } | undefined;
  if (!row) throw new AccessError(409, "simulation run is unavailable", "RUN_UNAVAILABLE");
  return row.value;
}

/** Infrastructure namespace only; scenario values remain deterministic. */
export function rotateRunId(db: Database.Database): string {
  const id = randomUUID();
  db.prepare("INSERT OR REPLACE INTO sim_state (key, value) VALUES ('run_id', ?)").run(id);
  return id;
}

export function requireCurrentRun(db: Database.Database, supplied: string): string {
  const current = currentRunId(db);
  if (supplied !== current) throw new AccessError(409, "this request belongs to an earlier simulation run", "RUN_STALE");
  return current;
}
