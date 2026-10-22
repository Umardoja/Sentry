"use client";
import Link from "next/link";
import { Check, FolderOpen, Info, Lightbulb, PhoneCall, TrendingUp } from "lucide-react";
import { LevelChip } from "@/components";
import { usePoll } from "@/lib/client";
import { formatSimulatedTime } from "@/shared/time";

type Tracer = {
  caller_number: string;
  reports: { report_id: string; customer_id: string; account_masked: string; city: string; reported_at: string }[];
  viewers: { staff_id: string; pseudo_id: string; viewed_customer_ids: string[]; is_common: boolean }[];
  common_viewer_ids: string[];
  focus: { staff_id: string; pseudo_id: string; role: string; employment_type: string; score: number; level: string; case_id: string | null } | null;
  summary: string; others: number;
};
export default function TracerPage() {
  const { data } = usePoll<Tracer>(`/api/tracer/${encodeURIComponent("0700-000-0555")}`, 3000);
  if (!data) return <div className="muted">Loading data leak tracer…</div>;
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: "baseline" }}>
        <h1 style={{ fontSize: 30 }}>Data leak tracer</h1>
        <span className="muted">/ reporting customers</span>
      </div>
      <div className="card between" style={{ alignItems: "stretch" }}>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <span style={{ width: 40, height: 40, borderRadius: 99, background: "var(--level-contain-tint)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><PhoneCall size={20} color="var(--zenith-red)" /></span>
            <div>
              <div className="jakarta" style={{ fontSize: 22, fontWeight: 700 }}>{data.reports.length} customers got scam calls from the same number that knew their balances.</div>
              <div className="muted">Caller {data.caller_number} · reported {+data.reports[0]!.reported_at.slice(8, 10)} to {+data.reports[data.reports.length - 1]!.reported_at.slice(8, 10)} Oct</div>
            </div>
          </div>
          <div style={{ background: "var(--page)", borderRadius: 8, padding: "10px 16px", margin: "14px 0", fontStyle: "italic" }}>“The caller knew my balance and my last transaction.”</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="eyebrow">Victim accounts:</span>
            {data.reports.map((r) => <span key={r.report_id} className="chip grey">{r.account_masked} {r.city}</span>)}
          </div>
        </div>
        <div style={{ width: 300, background: "var(--page)", borderRadius: 10, padding: 18, marginLeft: 24 }}>
          <div className="row" style={{ color: "var(--zenith-red)", font: "600 13px Plus Jakarta Sans", letterSpacing: "0.05em" }}><TrendingUp size={16} /> PATTERN WORTH EXAMINING</div>
          <div className="jakarta" style={{ fontSize: 19, fontWeight: 700, marginTop: 8 }}>{data.summary}</div>
          <div className="muted small">{data.others} others viewed one each</div>
        </div>
      </div>
      <div className="grid-case">
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: 24 }}>
            <div className="card-title">Who viewed these customers&apos; records</div>
            <div className="muted small">Record views in the 72 hours before each scam report</div>
          </div>
          <div className="table-scroll" role="region" aria-label="Customer-record access links" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th className="tracer-customer-column">Customer / account</th>
                {data.viewers.map((v) => (
                  <th key={v.staff_id} style={{ textAlign: "center", background: v.is_common ? "var(--level-contain-tint)" : undefined, color: v.is_common ? "var(--zenith-red)" : undefined, textTransform: "none", fontSize: 15 }}>
                    {v.pseudo_id}
                    {v.is_common && <div><span className="chip" style={{ background: "var(--zenith-red)", color: "var(--on-ink)", height: 22, fontSize: 11, marginTop: 4 }}>COMMON TO ALL {data.reports.length}</span></div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.reports.map((r) => (
                <tr key={r.report_id}>
                  <td className="tracer-customer-column" style={{ whiteSpace: "normal", height: 72 }}>
                    <div style={{ fontWeight: 700 }}>{r.account_masked} {r.city}</div>
                    <div className="muted" style={{ fontSize: 13 }}>Reported: {formatSimulatedTime(r.reported_at)}</div>
                  </td>
                  {data.viewers.map((v) => (
                    <td key={v.staff_id} style={{ textAlign: "center", background: v.is_common ? "var(--level-contain-tint)" : undefined }}>
                      {v.viewed_customer_ids.includes(r.customer_id) ? (
                        <span className="chip" style={{ background: "var(--surface)", color: v.is_common ? "var(--zenith-red)" : "var(--text-subtle)", border: "1px solid var(--neutral-tint)", height: 26, fontSize: 13 }}><Check size={14} /> viewed</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="row muted small" style={{ background: "var(--page)", margin: 24, borderRadius: 8, padding: "12px 16px" }}><Info size={16} /> Each view had a valid ticket. The link only appears when you start from the victims.</div>
        </div>
        {data.focus && (
          <div className="card">
            <h2 style={{ fontSize: 28 }}>{data.focus.pseudo_id}</h2>
            <div className="muted">{data.focus.role}</div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="chip grey">{data.focus.employment_type === "CONTRACTOR" ? "Contractor" : "Employee"}</span>
              {data.focus.score > 0 ? <><span className="chip grey">Risk score: {data.focus.score}</span><LevelChip level={data.focus.level} /></> : <span className="chip grey">No risk score yet. Run step S4.1</span>}
            </div>
            <div style={{ background: "var(--page)", borderRadius: 8, padding: 16, margin: "18px 0" }}>
              <div className="row" style={{ fontWeight: 600 }}><Lightbulb size={16} color="var(--zenith-red)" /> Key finding</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>Every view had a real ticket. The pattern only shows when you start from the victims.</div>
            </div>
            {data.focus.case_id ? (
              <Link href={`/cases/${data.focus.case_id}`} className="btn dark lg" style={{ width: "100%" }}><FolderOpen size={18} /> Open case</Link>
            ) : (
              <div className="muted small">No linked activity is available in this workspace.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
