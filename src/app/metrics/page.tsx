"use client";
import Link from "next/link";
import { Counter, LevelChip } from "@/components";
import { naira, num, usePoll, useSession } from "@/lib/client";

type FA = { seed: number; staff_days: number; events: number; cleared: number; false_alerts: number }[];
type Metrics = {
  actions_checked: number; unusual_cleared: number; cases_opened: number; transfers_blocked: number; funds_held_naira: number; bvns_watchlisted: number; true_cases: number; false_alerts: number;
  cases: { id: string; pseudo_id: string; level: string; peak_score: number; case_status: string }[];
  false_alarm_test: { rows: FA; generated_at: string } | null;
};
type Audit = { id: number; ts: string; actor: string; action: string; target_id: string; detail: string }[];

export default function MetricsPage() {
  const session = useSession();
  const canReadAudit = session?.principal.capabilities.includes("READ_AUDIT") ?? false;
  const { data } = usePoll<Metrics>("/api/metrics", 3000);
  const { data: audit } = usePoll<Audit>(canReadAudit ? "/api/audit?limit=12" : null, 3000);
  if (!data) return <div className="muted">Loading…</div>;
  const fa = data.false_alarm_test?.rows ?? [];
  const sum = (k: keyof FA[number]) => fa.reduce((s, r) => s + Number(r[k]), 0);
  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: 30 }}>Results</h1>
        <div className="muted">Sample portfolio · 500 staff · 30-day observation window</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
        <Counter label="Actions checked" value={num(data.actions_checked)} />
        <Counter label="Cleared automatically" value={num(data.unusual_cleared)} />
        <Counter label="Cases opened" value={num(data.cases_opened)} />
        <Counter label="Simulated transfers blocked" value={num(data.transfers_blocked)} />
        <Counter label="Simulated funds held" value={naira(data.funds_held_naira)} />
      </div>
      <div className="grid-2">
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: 24 }}>
            <div className="card-title">False-alarm test: unusual but legitimate activity</div>
            <div className="muted small">Overtime bursts, refunds to a customer&apos;s other account, new-terminal logins, injected into clean simulated days.</div>
          </div>
          {fa.length ? (
            <div className="table-scroll" role="region" aria-label="False alarm exercise results" tabIndex={0}>
            <table className="table">
              <thead><tr><th>Seed</th><th className="right">Staff-days</th><th className="right">Legitimate unusual events</th><th className="right">Cleared automatically</th><th className="right">False alerts</th></tr></thead>
              <tbody>
                {fa.map((r) => (
                  <tr key={r.seed}><td>{r.seed}</td><td className="right numeric">{num(r.staff_days)}</td><td className="right numeric">{r.events}</td><td className="right numeric">{r.cleared}</td><td className="right numeric" style={{ color: r.false_alerts ? "var(--zenith-red)" : "var(--ok)", fontWeight: 700 }}>{r.false_alerts}</td></tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td>Total</td><td className="right numeric">{num(sum("staff_days"))}</td><td className="right numeric">{sum("events")}</td><td className="right numeric">{sum("cleared")}</td><td className="right numeric" style={{ color: sum("false_alerts") ? "var(--zenith-red)" : "var(--ok)" }}>{sum("false_alerts")}</td></tr>
              </tbody>
            </table>
            </div>
          ) : (
            <div className="muted" style={{ padding: "0 24px 24px" }}>Not run yet. Run <code>npm run false-alarms</code>, then refresh.</div>
          )}
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Cases</div>
            {data.cases.map((c) => (
              <Link key={c.id} href={`/cases/${c.id}`} className="between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <span><strong>{c.pseudo_id}</strong> <span className="muted">· {c.id}</span></span>
                <span className="row"><span className="numeric" style={{ fontWeight: 700 }}>{c.peak_score}</span><LevelChip level={c.level} /><span className="muted small">{c.case_status === "CONTAINED" ? "Control applied (simulated)" : "Open"}</span></span>
              </Link>
            ))}
            {data.cases.length === 0 && <div className="muted">No cases yet.</div>}
            <div className="muted small" style={{ marginTop: 10 }}>Review-warranted cases {data.true_cases} · false alerts {data.false_alerts} · simulated watchlist entries {data.bvns_watchlisted}</div>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Audit log (latest)</div>
            {!canReadAudit && <div className="muted small">Available to the Auditor persona.</div>}
            {canReadAudit && (audit ?? []).map((a) => (
              <div key={a.id} className="row small" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="numeric muted">{a.ts.slice(11, 16)}</span>
                <span style={{ fontWeight: 600 }}>{a.actor}</span>
                <span>{a.action.replaceAll("_", " ").toLowerCase()}</span>
                <span className="muted">{a.target_id}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
