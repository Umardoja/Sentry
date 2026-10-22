import "server-only";

import type Database from "better-sqlite3";
import { decideReview, type ReviewDecision } from "../engines/reviewPolicy";
import type { Check, PurposeStatus } from "../engines/purpose";
import { addMinutes } from "../time";

export function currentReviewDecision(db: Database.Database, staffId: string): ReviewDecision {
  const score = db.prepare("SELECT score, ts FROM risk_scores WHERE staff_id = ? ORDER BY id DESC LIMIT 1").get(staffId) as { score: number; ts: string } | undefined;
  const evidence = db.prepare("SELECT sim_ts FROM evidence_evaluations WHERE staff_id = ? ORDER BY id DESC LIMIT 1").get(staffId) as { sim_ts: string } | undefined;
  const clock = (db.prepare("SELECT value FROM sim_state WHERE key = 'clock'").get() as { value: string } | undefined)?.value ?? "2026-10-16T20:25:00+01:00";
  const at = evidence?.sim_ts ?? score?.ts ?? clock;
  const facts = (db.prepare(`SELECT a.id action_id, a.action_type, p.status, p.checks
    FROM sensitive_actions a JOIN purpose_results p ON p.action_id = a.id
    WHERE a.staff_id = ? AND a.ts > ? AND a.ts <= ? ORDER BY a.ts, a.id`).all(staffId, addMinutes(at, -1440), at) as {
      action_id: string; action_type: string; status: PurposeStatus; checks: string;
    }[]).map((row) => ({ ...row, checks: JSON.parse(row.checks) as Check[] }));
  return decideReview(score?.score ?? 0, facts);
}
