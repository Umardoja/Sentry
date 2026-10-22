"use client";
import Link from "next/link";
import { LevelChip } from "@/components";
import { num, usePoll } from "@/lib/client";
import { keyStatusLabel } from "@/lib/presentation";

type PartnerRow = {
  partner_id: string; partner_name: string; partner_type: string; score: number; level: string; consent_coverage_pct: number;
  calls_today: number; key_label: string; key_status: string; case_id: string | null; case_status: string | null;
};

export default function PartnersPage() {
  const { data, error, reload } = usePoll<PartnerRow[]>("/api/partners", 3000);
  if (error && !data) return <div className="card" role="alert"><h1>Partners unavailable</h1><p className="muted">{error}</p><button className="btn" onClick={reload}>Try again</button></div>;
  if (!data) return <div className="card loading-card" role="status">Loading partners…</div>;
  return <div className="stack">
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 28 }}>Partners</h1>
        <div className="muted">Third parties on the bank&apos;s open-banking APIs. Every call is checked against the customer&apos;s consent for that partner and scope. Keys are shown by label only.</div>
      </div>
      <div className="table-scroll" role="region" aria-label="Partners" tabIndex={0}>
        <table className="table partners-table">
          <thead>
            <tr><th>Partner</th><th>Type</th><th className="right">Risk score</th><th>Risk level</th><th className="right">Consent coverage</th><th className="right">Calls today</th><th>Key</th></tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.partner_id}>
                <td><Link href={`/partners/${p.partner_id}`} style={{ fontWeight: 700, textDecoration: "underline" }}>{p.partner_name}</Link>{p.case_id && <div className="muted small">{p.case_id} · {p.case_status === "CLOSED_JUSTIFIED" ? "Closed as justified" : p.case_status === "CONTAINED" ? "Response applied" : "Open"}</div>}</td>
                <td>{p.partner_type}</td>
                <td className="right numeric" style={{ fontWeight: 700 }}>{p.score}</td>
                <td><LevelChip level={p.level} /></td>
                <td className="right numeric" style={{ color: p.consent_coverage_pct < 100 ? "var(--zenith-red)" : undefined, fontWeight: p.consent_coverage_pct < 100 ? 700 : 400 }}>{p.consent_coverage_pct}%</td>
                <td className="right numeric">{num(p.calls_today)}</td>
                <td><span className="numeric">{p.key_label}</span> <span className={`chip ${p.key_status === "ACTIVE" ? "ok" : p.key_status === "SUSPENDED" ? "bad" : "warn"}`}>{keyStatusLabel(p.key_status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted small" style={{ padding: "12px 24px 20px" }}>Consent coverage: share of the partner&apos;s calls in the last 24 hours that matched an active consent for that customer and scope.</div>
    </div>
  </div>;
}
