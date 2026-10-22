import "server-only";
import type Database from "better-sqlite3";
import { createEvaluator, runPurpose } from "../engines/pipeline";
import { levelRank } from "../engines/signals";
import { Rng } from "../rng";
import { addMinutes, at, weekday } from "../time";
import { seedDatabase } from "./seed";

export type FalseAlarmRow = { seed: number; staff_days: number; events: number; cleared: number; false_alerts: number };

const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** Injects 20 unusual-but-legitimate events into a clean seeded bank and counts staff-days that reach Verify. */
export function falseAlarmRun(seed: number, path: string): FalseAlarmRow {
  const { db } = seedDatabase(path, seed);
  const rng = new Rng(seed + 1000);
  const days = (db.prepare("SELECT DISTINCT date FROM roster WHERE date < '2026-10-16' ORDER BY date").all() as { date: string }[]).map((d) => d.date).filter((d) => weekday(d) > 0 && weekday(d) < 6);
  const working = db.prepare("SELECT r.staff_id, r.shift_start, r.shift_end FROM roster r JOIN staff s ON s.id = r.staff_id WHERE r.date = ? AND s.role IN ('OPS_REVERSALS','OPS_EPRODUCTS') AND r.shift_end = '17:00' AND r.staff_id NOT IN (SELECT staff_id FROM overtime WHERE date = ?)");
  const session = db.prepare("SELECT session_id, terminal_id FROM logins WHERE staff_id = ? AND substr(ts,1,10) = ? LIMIT 1");
  const pairs = db.prepare("SELECT a1.id AS a, a2.id AS b, a1.customer_id AS c FROM accounts a1 JOIN accounts a2 ON a1.customer_id = a2.customer_id AND a1.id < a2.id LIMIT 200").all() as { a: string; b: string; c: string }[];
  const insTxn = db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?)");
  const insAct = db.prepare("INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const checks: { staff: string; ts: string[] }[] = [];
  const used = new Set<string>();
  let k = 0;
  const pickWorker = () => {
    for (;;) {
      const date = rng.pick(days);
      const rows = working.all(date, date) as { staff_id: string }[];
      const row = rows.length ? rng.pick(rows) : null;
      if (row && !used.has(`${row.staff_id}|${date}`)) {
        used.add(`${row.staff_id}|${date}`);
        return { staff: row.staff_id, date, s: session.get(row.staff_id, date) as { session_id: string; terminal_id: string } };
      }
    }
  };
  db.transaction(() => {
    for (let e = 0; e < 7; e++) {
      const w = pickWorker();
      const approver = (db.prepare("SELECT id FROM staff WHERE role = (SELECT role FROM staff WHERE id = ?) AND id <> ? LIMIT 1").get(w.staff, w.staff) as { id: string }).id;
      db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run(`TKT-FA-${seed}-${e}`, "OVERTIME", null, null, "OPS_REVERSALS", w.staff, approver, at(w.date, "12:00"), "APPROVED", "overtime");
      db.prepare("INSERT INTO overtime VALUES (?,?,?,?,?,?,?)").run(`OT-FA-${seed}-${e}`, w.staff, w.date, "17:00", "19:30", approver, `TKT-FA-${seed}-${e}`);
      for (let i = 0; i < 40; i++) {
        const ts = addMinutes(at(w.date, "17:10"), i * 3);
        const acc = `ACC-${pad(rng.int(31, 5000), 6)}`;
        const amount = rng.int(4, 400) * 500;
        const txn = `TXN-FA-${seed}-${++k}`;
        insTxn.run(txn, txn, acc, amount, "2000000000", "Atlas Credit", addMinutes(ts, -30), "APP", "FAILED", "91");
        insAct.run(`ACT-FA-${seed}-${k}`, w.staff, w.s.session_id, w.s.terminal_id, ts, "REVERSAL", txn, acc, null, amount, null, "POSTED", null, "FA", 0);
      }
      checks.push({ staff: w.staff, ts: [at(w.date, "19:30"), at(w.date, "23:59")] });
    }
    for (let e = 0; e < 7; e++) {
      const w = pickWorker();
      const p = rng.pick(pairs);
      const amount = rng.int(4, 400) * 500;
      const txn = `TXN-FA-${seed}-${++k}`;
      insTxn.run(txn, txn, p.a, amount, "2000000000", "Atlas Credit", at(w.date, "13:30"), "APP", "FAILED", "91");
      insAct.run(`ACT-FA-${seed}-${k}`, w.staff, w.s.session_id, w.s.terminal_id, at(w.date, "14:00"), "REVERSAL", txn, p.b, p.c, amount, null, "POSTED", null, "FA", 0);
      checks.push({ staff: w.staff, ts: [at(w.date, "23:59")] });
    }
    for (let e = 0; e < 6; e++) {
      const w = pickWorker();
      const usual = JSON.parse((db.prepare("SELECT usual_terminal_ids FROM staff WHERE id = ?").get(w.staff) as { usual_terminal_ids: string }).usual_terminal_ids) as string[];
      let t = rng.int(1, 600);
      while (usual.includes(`TRM-${pad(t, 4)}`)) t = rng.int(1, 600);
      db.prepare("INSERT INTO logins VALUES (?,?,?,?,?,?,?,?)").run(`LOG-FA-${seed}-${e}`, w.staff, `TRM-${pad(t, 4)}`, "Aster", at(w.date, "12:00"), `SES-FA-${seed}-${e}`, "ENDED", "FA");
      checks.push({ staff: w.staff, ts: [at(w.date, "12:00"), at(w.date, "23:59")] });
    }
  })();
  runPurpose(db);
  const ev = createEvaluator(db);
  let falseAlerts = 0;
  for (const c of checks) {
    const worst = Math.max(...c.ts.map((t) => levelRank(ev.evaluate(c.staff, t).level)));
    if (worst >= levelRank("VERIFY")) falseAlerts++;
  }
  const staffDays = (db.prepare("SELECT COUNT(*) n FROM roster").get() as { n: number }).n;
  closeDb(db);
  return { seed, staff_days: staffDays, events: checks.length, cleared: checks.length - falseAlerts, false_alerts: falseAlerts };
}

function closeDb(db: Database.Database) {
  db.close();
}
