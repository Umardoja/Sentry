"use client";
import Link from "next/link";
import { LevelChip } from "@/components";
import { usePoll } from "@/lib/client";
import { AccessBridgeMonitor } from "./access-bridge-monitor";

type CaseRow = { id: string; pseudo_id: string; role: string; employment_type: string; peak_score: number; score: number; level: string; case_status: string; opened_at: string; review: { required: boolean } };

export default function CasesPage() {
  const { data, error, reload } = usePoll<CaseRow[]>("/api/cases", 2500);
  if (error && !data) return <div className="card" role="alert"><h1>Cases unavailable</h1><p className="muted">{error}</p><button className="btn" onClick={reload}>Try again</button></div>;
  if (!data) return <div className="card loading-card" role="status">Loading cases…</div>;
  return <div className="stack">
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 28 }}>Cases</h1>
        <div className="muted">Investigations open when the risk score needs attention or verified evidence conflicts with the action. Review does not automatically approve a hold. Names remain hidden until an authorized reviewer records a reason to view the identity.</div>
      </div>
      <div className="table-scroll" role="region" aria-label="Cases" tabIndex={0}>
      <table className="table">
        <thead>
          <tr><th>Case</th><th>Pseudonym</th><th>Role</th><th>Simulated time</th><th className="right">Score</th><th>Level</th><th>Status</th></tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/cases/${c.id}`} style={{ fontWeight: 700, textDecoration: "underline" }}>{c.id}</Link></td>
              <td style={{ fontWeight: 600 }}>{c.pseudo_id}</td>
              <td>{c.role}{c.employment_type === "CONTRACTOR" ? " · Contractor" : ""}</td>
              <td className="numeric">{c.opened_at.slice(11, 16)}</td>
              <td className="right numeric" style={{ fontWeight: 700 }}>{c.score}</td>
              <td><LevelChip level={c.level} /></td>
              <td>{c.case_status === "CONTAINED" ? "Control applied (simulated)" : c.review.required ? "Review needed" : "Open"}</td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td colSpan={7} className="muted">No investigations are available in this workspace.</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
    <AccessBridgeMonitor />
  </div>;
}
