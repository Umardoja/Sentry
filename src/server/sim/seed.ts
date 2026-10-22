import "server-only";
import type Database from "better-sqlite3";
import { SEED } from "../config";
import { openDatabase, resetDatabase } from "../db/migrate";
import { backfill, computePeerStats, runPurpose } from "../engines/pipeline";
import { DAYS, generateBaseline } from "./generator";
import { generatePartners } from "./partners";
import { backfillPartners, computePartnerStats, runPartnerChecks } from "../engines/partners";
import { rotateRunId } from "../services/run";
import { seedAccessBridgeFixture } from "./accessBridgeFixture";

export const START_CLOCK = "2026-10-16T20:25:00+01:00";
/**
 * Bumped whenever seeded content changes (v2: S5 partner tables and traffic). Template file names carry it,
 * and a workspace or database seeded from an older template is rebuilt on its next use.
 */
export const TEMPLATE_VERSION = "v2";

/** Builds a fresh database: raw activity, purpose checks, peer statistics, score history. */
export function seedDatabase(path: string, seed = SEED): { db: Database.Database; counts: Record<string, number>; ms: number } {
  const started = performance.now();
  resetDatabase(path);
  const db = openDatabase(path);
  const counts = generateBaseline(db, seed);
  seedAccessBridgeFixture(db);
  runPurpose(db);
  computePeerStats(db);
  backfill(db, START_CLOCK);
  // S5 partners: own seeded stream, after the staff baseline, so staff rows and ids are unchanged.
  counts.partner_api_calls = generatePartners(db, seed);
  runPartnerChecks(db);
  computePartnerStats(db, START_CLOCK);
  backfillPartners(db, DAYS, START_CLOCK);
  db.prepare("INSERT OR REPLACE INTO sim_state VALUES ('clock', ?)").run(START_CLOCK);
  db.prepare("INSERT OR REPLACE INTO sim_state VALUES ('template_version', ?)").run(TEMPLATE_VERSION);
  db.prepare("INSERT OR REPLACE INTO sim_state VALUES ('step_index', '0')").run();
  rotateRunId(db);
  db.prepare("INSERT INTO audit_log (ts, actor, action, target_type, target_id, detail) VALUES (?,?,?,?,?,?)").run(START_CLOCK, "Presenter", "RESET", "sim", "demo", JSON.stringify({ seed }));
  return { db, counts, ms: Math.round(performance.now() - started) };
}
