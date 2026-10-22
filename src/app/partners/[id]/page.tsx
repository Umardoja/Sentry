"use client";
import Link from "next/link";
import { use, useState } from "react";
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, KeyRound, Lock, ShieldCheck, XCircle } from "lucide-react";
import { LevelChip, ScoreSteps } from "@/components";
import { post, usePoll, useSession } from "@/lib/client";
import { auditActionLabel, callResultLabel, keyStatusLabel, partnerCheckStatusLabel, partnerResponseLabel, roleLabel, signalLabel } from "@/lib/presentation";
import { formatSimulatedTime } from "@/shared/time";

type Check = { code: string; passed: boolean; label: string };
type Call = { id: string; ts: string; endpoint: string; scope: string; customer: string; network: string; result: string; http: number; check: string; checks: Check[] };
type Review = { run_id: string; review_ref: string; evidence_codes: string[] };
type PartnerView = {
  partner_id: string; partner_name: string; partner_type: string; licence_ref: string; onboarded_at: string;
  key: { label: string; status: string }; score: number; level: string; review_required: boolean;
  case: { id: string; status: string; opened_at: string; peak_score: number; level: string; closed_at: string | null } | null;
  signals: { code: string; label: string; tier: number; points: number; first_ts: string; calls: number; evidence: Record<string, unknown> }[];
  calls: Call[]; flagged_calls: Call[];
  evidence_for: { code: string; label: string; points: number }[]; evidence_against: string[];
  responses: { id: string; type: string; status: string; automatic: boolean; created_at: string; decided_at: string | null }[];
  decision: (Review & { response_id: string }) | null; justify: (Review & { case_id: string }) | null;
  activity: { id: number; ts: string; actor: string; action: string; target_id: string }[];
  score_steps: { ts: string; score: number; level: string }[];
};

const RESPONSE_STATUS: Record<string, string> = { ACTIVE: "Applied", PENDING_APPROVAL: "Waiting for Reviewer approval", APPROVED: "Approved", REJECTED: "Rejected", RELEASED: "Released" };
const evidenceLine = (e: Record<string, unknown>) => Object.entries(e).map(([k, v]) => `${k.replaceAll("_", " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ");

export default function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const canDecide = session?.principal.capabilities.includes("DECIDE_INTERVENTION") ?? false;
  const { data, error, reload } = usePoll<PartnerView>(`/api/partners/${id}`, 3000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("Partner confirmed the traffic and rotated its key");
  if (error && !data) return <div className="card" role="alert"><h1>Partner unavailable</h1><p className="muted">{error}</p><button className="btn" onClick={reload}>Try again</button></div>;
  if (!data) return <div className="card loading-card" role="status">Loading partner…</div>;

  const act = async (path: string, body: Record<string, unknown>, done: string) => {
    setBusy(true); setMessage("");
    const result = await post<{ detail?: string; code?: string }>(path, body);
    setMessage(result.ok ? done : result.data.code === "REVIEW_STALE" || result.data.code === "RUN_STALE" ? "Evidence changed. Refresh, inspect the current facts, and decide again." : result.data.detail ?? "Decision was not recorded.");
    setBusy(false); reload();
  };
  const pending = data.decision;
  const caseOpen = data.case && (data.case.status === "OPEN" || data.case.status === "CONTAINED");
  return <div className="stack">
    {pending && <div className="banner HOLD"><AlertTriangle size={18} /> Response · suspend key {data.key.label} {canDecide ? "waiting for your approval" : "waiting for Reviewer approval"}</div>}
    <div className="card">
      <Link href="/partners" className="muted small row" style={{ gap: 6 }}><ArrowLeft size={14} /> Partners</Link>
      <div className="between partner-header" style={{ alignItems: "flex-start", marginTop: 10 }}>
        <div>
          <div className="row" style={{ flexWrap: "wrap" }}><h1 style={{ fontSize: 28 }}>{data.partner_name}</h1><span className="chip grey">Partner</span></div>
          <div className="muted">{data.partner_type} · licence {data.licence_ref} · onboarded {data.onboarded_at.slice(0, 10)}</div>
          <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
            <span className="chip grey"><KeyRound size={14} /> {data.key.label}</span>
            <span className={`chip ${data.key.status === "ACTIVE" ? "ok" : data.key.status === "SUSPENDED" ? "bad" : "warn"}`}>Key {keyStatusLabel(data.key.status).toLowerCase()}</span>
            {data.case && <span className="chip grey">{data.case.id} · {data.case.status === "CLOSED_JUSTIFIED" ? "Closed as justified" : data.case.status === "CONTAINED" ? "Response applied" : "Open"}</span>}
          </div>
        </div>
        <div className="row nowrap"><span className="score-lg" style={{ fontSize: 40 }}>{data.score}</span><LevelChip level={data.level} size="lg" /></div>
      </div>
      {data.score_steps.length > 1 && <div style={{ marginTop: 18 }}><ScoreSteps points={data.score_steps.map((s) => ({ time: formatSimulatedTime(s.ts).slice(-5), score: s.score, level: s.level }))} /></div>}
    </div>

    <div className="grid-2 partner-grid">
      <div className="stack">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Risk factors</div>
          {data.signals.length === 0 && <div className="muted">No risk factors in the last 24 hours.</div>}
          {data.signals.map((s) => (
            <div key={s.code} className="between factor-row">
              <div><div style={{ fontWeight: 700 }}>{signalLabel(s.code, s.label)}</div><div className="muted small">{evidenceLine(s.evidence)} · first seen {formatSimulatedTime(s.first_ts)}</div></div>
              <span className="numeric" style={{ fontWeight: 700 }}>+{s.points}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Evidence for and against</div>
          <div className="evidence-columns">
            <div><div className="eyebrow" style={{ color: "var(--zenith-red)" }}>For concern</div>
              <ul className="evidence-list">{data.evidence_for.length ? data.evidence_for.map((e) => <li key={e.code}>{signalLabel(e.code, e.label)} (+{e.points})</li>) : <li className="muted">Nothing unusual found</li>}</ul></div>
            <div><div className="eyebrow" style={{ color: "var(--ok)" }}>Against</div>
              <ul className="evidence-list">{data.evidence_against.map((e) => <li key={e}>{e}</li>)}</ul></div>
          </div>
        </div>
      </div>

      <div className="stack">
        {pending ? (
          <div className="card decision-card" style={{ borderLeft: "4px solid var(--level-hold)", marginBottom: 0 }}>
            <div className="simulation-outcome">Response</div>
            <h2 style={{ fontSize: 22, margin: "8px 0 6px" }}>Suspend {data.partner_name}&apos;s key {data.key.label}</h2>
            <div className="muted small" style={{ fontSize: 15 }}>The key is rate-limited now. Suspension refuses every further call (403) until the case is closed.</div>
            <details className="technical-details"><summary>Technical details</summary><div>Review reference {pending.review_ref.slice(4, 12)} · evidence codes {pending.evidence_codes.join(", ")}</div></details>
            {canDecide ? <div className="row" style={{ marginTop: 16, flexWrap: "wrap" }}>
              <button className="btn red lg" disabled={busy} onClick={() => act(`/api/partner-responses/${pending.response_id}/approve`, { run_id: pending.run_id, review_ref: pending.review_ref }, "Suspension approved for the reviewed evidence.")}><Lock size={16} /> Approve suspension</button>
              <button className="btn lg" disabled={busy} onClick={() => act(`/api/partner-responses/${pending.response_id}/reject`, { run_id: pending.run_id, review_ref: pending.review_ref, note: "Rejected after review; key stays rate-limited" }, "Suspension rejected. The key stays rate-limited.")}>Reject</button>
            </div> : <div className="muted small" style={{ marginTop: 12 }}>Waiting for Reviewer approval.</div>}
          </div>
        ) : (
          <div className="card">
            <div className="eyebrow">Response</div>
            {data.responses.length === 0 ? <div className="muted" style={{ marginTop: 8 }}>No response proposed.</div> : data.responses.map((r) => (
              <div key={r.id} className="between factor-row"><span>{partnerResponseLabel(r.type)}{r.automatic ? " · automatic" : ""}</span><span className="muted small">{RESPONSE_STATUS[r.status] ?? r.status}</span></div>
            ))}
          </div>
        )}
        {canDecide && caseOpen && data.justify && <div className="card">
          <div className="eyebrow">Close as justified</div>
          <div className="muted small" style={{ margin: "6px 0 10px" }}>Closes the partner case after review, restores the key and releases its responses.</div>
          <label className="small">Reason<input className="input" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
          <button className="btn" style={{ marginTop: 10 }} disabled={busy || !note.trim()} onClick={() => act(`/api/partner-cases/${data.justify!.case_id}/justify`, { run_id: data.justify!.run_id, review_ref: data.justify!.review_ref, note: note.trim() }, "Partner case closed as justified. The key is active again.")}><ShieldCheck size={16} /> Justified</button>
        </div>}
        {message && <div className="muted small" role="status">{message}</div>}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Reason checks</div>
          {data.flagged_calls.length === 0 && <div className="muted small">Every recent call matched an active consent for that customer and scope.</div>}
          {data.flagged_calls.slice(0, 4).map((c) => (
            <div key={c.id} className="reason-call">
              <div style={{ fontWeight: 700 }}>{formatSimulatedTime(c.ts)} · {c.endpoint} · customer {c.customer}</div>
              {c.checks.map((k) => <div key={k.code} className="row small" style={{ gap: 6 }}>{k.passed ? <CheckCircle2 size={14} color="var(--ok)" /> : <XCircle size={14} color="var(--zenith-red)" />} {k.label}</div>)}
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "24px 24px 12px" }}><div className="card-title">Calls</div><div className="muted small">Latest calls on key {data.key.label}. Customers are shown by the last four digits of the account only.</div></div>
      <div className="table-scroll" role="region" aria-label="Partner API calls" tabIndex={0}>
        <table className="table partner-calls-table">
          <thead><tr><th>Time</th><th>Endpoint</th><th>Customer</th><th>Network</th><th>Reason check</th><th>Result</th></tr></thead>
          <tbody>
            {data.calls.slice(0, 30).map((c) => (
              <tr key={c.id} className={c.check !== "MATCHED" || c.result !== "ALLOWED" ? "hl" : ""}>
                <td className="numeric simulated-time">{formatSimulatedTime(c.ts)}</td>
                <td>{c.endpoint}</td>
                <td className="numeric">{c.customer}</td>
                <td>{c.network}</td>
                <td><span className={`chip ${c.check === "MATCHED" ? "ok" : "bad"}`}>{partnerCheckStatusLabel(c.check)}</span></td>
                <td>{c.result === "BLOCKED" ? <span className="chip bad"><Ban size={13} /> {callResultLabel(c.result)}</span> : c.result === "RATE_LIMITED" ? <span className="chip warn">{callResultLabel(c.result)}</span> : callResultLabel(c.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="card">
      <div className="card-title" style={{ marginBottom: 10 }}>Activity</div>
      {data.activity.length === 0 && <div className="muted small">No case activity yet.</div>}
      {data.activity.map((a) => (
        <div key={a.id} className="row small activity-row">
          <span className="numeric muted">{formatSimulatedTime(a.ts)}</span><span style={{ fontWeight: 600 }}>{roleLabel(a.actor)}</span><span>{auditActionLabel(a.action)}</span><span className="muted">{a.target_id}</span>
        </div>
      ))}
    </div>
  </div>;
}
