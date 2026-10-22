import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { DB_PATH } from "../src/server/config";
import { seedTemplateName } from "../src/server/services/demo";
import { livePartnerCalls } from "../src/server/sim/partners";
import { LIVE_SPEED, liveSource, liveWindow, type LiveCursor } from "../src/server/sim/live";
import { START_CLOCK } from "../src/server/sim/seed";
import { addSeconds, formatTime, toSeconds } from "../src/server/time";

// Posts seeded live activity to a SENTRY server's ingest endpoints every few seconds: staff events, and normal partner API calls.
// npm run live-feed -- --url http://127.0.0.1:3000 [--workspace WS-…] [--start <Lagos ISO>] [--duration 60] [--interval 3] [--context data/seed-2026.db]
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1] ?? "");
const base = args.get("url");
const key = process.env.INGEST_KEY;
if (!base || !key) throw new Error("usage: INGEST_KEY=… npm run live-feed -- --url http://127.0.0.1:3000 [--workspace WS-…] [--duration seconds]");
const origin = base.replace(/\/+$/, "").replace(/\/api\/ingest\/events$/, "");
const url = `${origin}/api/ingest/events`;
const partnerUrl = `${origin}/api/ingest/partner-calls`;
const workspace = args.get("workspace") || null;
const interval = Number(args.get("interval") ?? "3");
const duration = Number(args.get("duration") ?? "0");
// The generator reads rosters, open cases and accounts from the deterministic seed the server was built from.
const contextPath = args.get("context") ?? join(dirname(DB_PATH), seedTemplateName());
if (!existsSync(contextPath)) throw new Error(`seed database not found at ${contextPath}; run npm run seed or start the server once, or pass --context`);
const context = new Database(contextPath, { readonly: true, fileMustExist: true });

type Response = { inserted: number; duplicates: string[]; rejected: { id: string; reason: string }[]; actions: { status: string }[]; cases_opened: string[] };
let cursor: LiveCursor = { clock: args.get("start") ?? START_CLOCK, cursor: "" };
const loggedIn = new Set<string>();
const totals = { batches: 0, sent: 0, inserted: 0, duplicates: 0, rejected: 0, actions: 0, matched: 0, noise: 0, cases: [] as string[], partnerCalls: 0, partnerMatched: 0, partnerCases: [] as string[] };
let partnerMinute: number | null = null;

/** Normal partner API traffic for each whole simulated minute passed, always within consent. */
async function postPartnerCalls(clock: string) {
  const last = Math.floor(toSeconds(clock) / 60);
  const first = partnerMinute === null ? last : partnerMinute + 1;
  partnerMinute = last;
  const calls = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => livePartnerCalls(context, first + i)).flat()
    .map((c) => ({ id: c.id, key_id: c.key_id, endpoint: c.endpoint, scope: c.scope, customer_id: c.customer_id, account_no: c.account_no, source_network: c.source_network, ts: c.ts }));
  if (!calls.length) return;
  const res = await fetch(partnerUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Key": key! }, body: JSON.stringify({ workspace_id: workspace, calls }) });
  const body = await res.json().catch(() => ({})) as { inserted?: number; calls?: { check: string; http: number }[]; cases_opened?: string[]; detail?: string };
  if (!res.ok) { console.log(`    partner calls ${calls.length} → HTTP ${res.status} ${body.detail ?? ""}`); return; }
  const matched = (body.calls ?? []).filter((c) => c.check === "MATCHED").length;
  totals.partnerCalls += body.inserted ?? 0; totals.partnerMatched += matched; totals.partnerCases.push(...(body.cases_opened ?? []));
  console.log(`    partner calls ${calls.length} → ${res.status} inserted ${body.inserted}, ${matched}/${body.calls?.length ?? 0} within consent · partner cases opened ${body.cases_opened?.length ? body.cases_opened.join(", ") : 0}`);
}
const started = Date.now();

async function tick() {
  const to = addSeconds(cursor.clock, Math.round(interval * LIVE_SPEED));
  const window = liveWindow(liveSource(context, cursor.clock), cursor, to, loggedIn);
  cursor = window.next;
  const kinds = window.events.reduce<Record<string, number>>((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {});
  const label = `[${formatTime(cursor.clock)} sim]`;
  await postPartnerCalls(cursor.clock);
  if (!window.events.length) { console.log(`${label} nothing due`); return; }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Ingest-Key": key! }, body: JSON.stringify({ workspace_id: workspace, events: window.events }) });
  const body = await res.json().catch(() => ({})) as Response & { detail?: string };
  totals.batches++;
  totals.sent += window.events.length;
  totals.noise += window.bundles.filter((b) => b.noise).length;
  const sent = Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ");
  if (!res.ok) { console.log(`${label} sent ${window.events.length} (${sent}) → HTTP ${res.status} ${body.detail ?? ""}`); return; }
  const matched = body.actions.filter((a) => a.status === "MATCHED").length;
  totals.inserted += body.inserted; totals.duplicates += body.duplicates.length; totals.rejected += body.rejected.length;
  totals.actions += body.actions.length; totals.matched += matched; totals.cases.push(...body.cases_opened);
  const noise = window.bundles.filter((b) => b.noise).map((b) => `${b.noise} ${b.staff_id}`).join(", ");
  console.log(`${label} sent ${window.events.length} (${sent})${noise ? ` [noise: ${noise}]` : ""} → ${res.status} inserted ${body.inserted}, duplicate ${body.duplicates.length}, rejected ${body.rejected.length} · ${matched}/${body.actions.length} matched · cases opened ${body.cases_opened.length ? body.cases_opened.join(", ") : 0}`);
  for (const r of body.rejected) console.log(`    rejected ${r.id}: ${r.reason}`);
}

function summary() {
  const share = totals.actions ? ((100 * totals.matched) / totals.actions).toFixed(1) : "—";
  console.log(`\n${totals.batches} batches · ${totals.sent} events sent · ${totals.inserted} inserted, ${totals.duplicates} duplicate, ${totals.rejected} rejected`);
  console.log(`${totals.actions} staff actions · ${totals.matched} matched (${share}%) · ${totals.noise} honest-noise actions · cases opened: ${totals.cases.length ? totals.cases.join(", ") : 0}`);
  console.log(`${totals.partnerCalls} partner API calls · ${totals.partnerMatched} within consent · partner cases opened: ${totals.partnerCases.length ? totals.partnerCases.join(", ") : 0}`);
  context.close();
}

console.log(`live-feed → ${url}${workspace ? ` (workspace ${workspace})` : ""} · every ${interval}s · ${LIVE_SPEED}x simulated time from ${cursor.clock}`);
process.on("SIGINT", () => { summary(); process.exit(0); });
async function main() {
  for (;;) {
    await tick().catch((error: unknown) => console.log(`request failed: ${error instanceof Error ? error.message : String(error)}`));
    if (duration && Date.now() - started >= duration * 1000) break;
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
  }
  summary();
}
void main();
