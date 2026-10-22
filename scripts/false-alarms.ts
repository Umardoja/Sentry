import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { falseAlarmRun } from "../src/server/sim/falseAlarms";

mkdirSync("data", { recursive: true });
const rows = [1, 2, 3, 4, 5].map((seed) => {
  const r = falseAlarmRun(seed, join(tmpdir(), `sentry-fa-${seed}.db`));
  console.log(`seed ${seed}: ${r.events} legitimate unusual events, ${r.cleared} cleared, ${r.false_alerts} false alerts (${r.staff_days} staff-days)`);
  return r;
});
writeFileSync("data/false-alarms.json", JSON.stringify({ rows, generated_at: new Date().toISOString() }, null, 2));
console.log(`Total false alerts: ${rows.reduce((s, r) => s + r.false_alerts, 0)}. Written to data/false-alarms.json`);
