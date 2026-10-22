"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Ban, CheckCircle2, Eye, FolderOpen, Hourglass, Lock, User } from "lucide-react";
import { Counter, LevelChip, levelOf, PurposeChip } from "@/components";
import { naira, num, post, usePoll, useSession } from "@/lib/client";
import { riskLevelForScore, signalLabel } from "@/lib/presentation";
import { formatSimulatedTime } from "@/shared/time";
import { GuidedDemoPanel } from "./guided-demo-panel";

type FeedRow = { key: string; ts: string; time: string; pseudo_id: string; staff_id?: string; action: string; amount: number | null; ok: boolean; purpose_label: string; points: number; highlight: boolean };
type Risk = { staff_id?: string; pseudo_id: string; role: string; employment_type: string; score: number; level: string; case_id: string | null; note: string | null; review: { required: boolean; score_threshold_met: boolean } };
type Freshness = { score: { snapshot_id: number; sim_time: string; step_id: string | null } | null; evidence: { evaluation_id: number; sim_time: string; trigger: string } | null; score_is_current: boolean };
type Decision = { id: string; run_id: string; review_ref: string; evidence_codes: string[]; kicker: string; title: string; subtitle: string; approve_label: string; case_id: string; freshness: Freshness };
type Live = { enabled: boolean; clock: string | null; clock_label: string | null; totals: { actions: number; matched: number; cases_opened: number } };
type ConsoleData = {
  state: { run_id: string; toast: string | null; last_step: string | null };
  live: Live;
  feed: FeedRow[]; flagged: number; top_risk: Risk[]; decision: Decision | null;
  metrics: { actions_checked: number; unusual_cleared: number; cases_opened: number; transfers_blocked: number };
};

export default function ConsolePage() {
  const session = useSession();
  const canDecide = session?.principal.capabilities.includes("DECIDE_INTERVENTION") ?? false;
  const canControl = session?.principal.capabilities.includes("CONTROL_SIMULATION") ?? false;
  const [liveBusy, setLiveBusy] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const { data, error, reload } = usePoll<ConsoleData>(`/api/console${flaggedOnly ? "?flagged=1" : ""}`, 3000);
  const [busy, setBusy] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState("");
  const [reviewedDecision, setReviewedDecision] = useState<Decision | null>(null);
  useEffect(() => {
    if (!data?.decision) { setReviewedDecision(null); return; }
    setReviewedDecision((shown) => !shown || shown.id !== data.decision!.id ? data.decision : shown);
  }, [data?.decision]);
  if (error && !data) return <div className="card" role="alert"><h1>Console unavailable</h1><p className="muted">{error}</p><button className="btn" onClick={reload}>Try again</button></div>;
  if (!data) return <div className="card loading-card" role="status">Loading the action feed…</div>;
  const decide = async (id: string, verb: "approve" | "reject") => {
    const shown = reviewedDecision;
    if (!shown) return;
    setBusy(true);
    const result = await post<{ detail?: string; code?: string }>(`/api/interventions/${id}/${verb}`, { run_id: shown.run_id, review_ref: shown.review_ref, note: verb === "reject" ? "Rejected from console" : undefined });
    setDecisionMessage(result.ok ? "Decision recorded for the reviewed evidence." : result.data.code === "REVIEW_STALE" || result.data.code === "RUN_STALE" ? "Evidence changed. Refresh, inspect the current facts, and decide again." : result.data.detail ?? "Decision was not recorded.");
    setBusy(false);
  };
  const toggleLive = async () => {
    setLiveBusy(true);
    await post("/api/sim/live", { run_id: data.state.run_id, enabled: !data.live.enabled });
    setLiveBusy(false);
  };
  const ngozi = data.feed.filter((r) => r.staff_id === "STF-0042").length > 3 && data.state.last_step === "S1.1";
  const currentRisk = new Map(data.top_risk.filter((item) => item.staff_id).map((item) => [item.staff_id!, item.score]));
  const feedWithRisk = data.feed.map((row) => {
    const after = row.staff_id ? currentRisk.get(row.staff_id) : undefined;
    const riskScore = after ?? Math.max(0, row.points);
    if (row.staff_id && after !== undefined) currentRisk.set(row.staff_id, Math.max(0, after - row.points));
    return { ...row, riskScore, riskLevel: riskLevelForScore(riskScore) };
  });
  return (
    <>
      {canControl && <GuidedDemoPanel />}
      {(canControl || data.live.enabled) && (
        <div className="live-bar">
          {data.live.enabled && (
            <div className="banner live" role="status">
              <Activity size={18} aria-hidden="true" /> Live activity
              <span className="live-detail">
                {data.live.clock ? `${formatSimulatedTime(data.live.clock)} · ` : ""}{num(data.live.totals.actions)} actions, {num(data.live.totals.matched)} reasons verified · {num(data.live.totals.cases_opened)} cases opened
              </span>
            </div>
          )}
          {canControl && (
            <button className={`btn live-switch ${data.live.enabled ? "dark" : ""}`} aria-pressed={data.live.enabled} disabled={liveBusy} onClick={toggleLive}>
              <span className={`live-dot ${data.live.enabled ? "on" : ""}`} aria-hidden="true" /> Live activity: {data.live.enabled ? "On" : "Off"}
            </button>
          )}
        </div>
      )}
      <div className="grid-2 console-grid">
        <div className="card" style={{ padding: 0 }}>
          <div className="between" style={{ padding: "24px 24px 16px" }}>
            <div>
              <div className="card-title">Live actions</div>
              {ngozi && <div className="muted small">Staff-91D2 · 60 reversals · 20:30 to 21:10 · approved overtime</div>}
            </div>
            <div className="row" style={{ background: "var(--surface-sunken)", borderRadius: 999, padding: 4, gap: 4 }}>
              <button className={`btn ${flaggedOnly ? "" : "dark"}`} style={{ height: 32, border: "none", background: flaggedOnly ? "transparent" : undefined }} onClick={() => setFlaggedOnly(false)}>
                All ({num(data.metrics.actions_checked)})
              </button>
              <button className={`btn ${flaggedOnly ? "dark" : ""}`} style={{ height: 32, border: "none", background: flaggedOnly ? undefined : "transparent" }} onClick={() => setFlaggedOnly(true)}>
                Flagged <span className="chip bad" style={{ height: 22, padding: "0 8px", fontSize: 12 }}>{data.flagged}</span>
              </button>
            </div>
          </div>
          <div className="table-scroll" role="region" aria-label="Live sensitive actions" tabIndex={0}>
          <table className="table console-feed-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Staff ID</th>
                <th>Action</th>
                <th className="right">Amount</th>
                <th>Reason check</th>
                <th className="right">Risk level</th>
              </tr>
            </thead>
            <tbody>
              {feedWithRisk.map((r) => (
                <tr key={r.key} className={r.highlight ? "hl" : ""}>
                  <td className="numeric simulated-time">{formatSimulatedTime(r.ts)}</td>
                  <td style={{ fontWeight: 600 }}>{r.pseudo_id}</td>
                  <td>{r.action}</td>
                  <td className="right numeric">{r.amount ? naira(r.amount) : "—"}</td>
                  <td>
                    <PurposeChip ok={r.ok} label={r.purpose_label} />
                  </td>
                  <td className="right"><span className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <LevelChip level={r.riskLevel} /><span className="numeric" style={{ fontWeight: 700 }}>{r.riskScore}</span>
                  </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="stack">
          {reviewedDecision ? (
            <div className="card" style={{ borderLeft: "4px solid var(--level-hold)" }}>
              <div className="simulation-outcome">Response</div>
              <div className="row" style={{ color: "var(--level-hold)", font: "600 13px Plus Jakarta Sans", letterSpacing: "0.06em" }}>
                <Hourglass size={16} /> {reviewedDecision.kicker.toUpperCase()}
              </div>
              <h2 style={{ fontSize: 22, lineHeight: "30px", margin: "8px 0 6px" }}>{reviewedDecision.title}</h2>
              <div className="muted small" style={{ fontSize: 15 }}>{reviewedDecision.subtitle.replace(/^Score /, "Risk score ").replace(" · Contain ·", " · Contained ·")}</div>
              <details className="technical-details">
                <summary>Technical details</summary>
                <div>Review reference {reviewedDecision.review_ref.slice(4, 12)} · risk-score snapshot {reviewedDecision.freshness.score?.snapshot_id ?? "—"} · evidence evaluation {reviewedDecision.freshness.evidence?.evaluation_id ?? "—"}</div>
                <div>Evidence codes: {reviewedDecision.evidence_codes.map((code) => `${signalLabel(code, code)} (${code})`).join(", ") || "Unavailable — refresh required"}</div>
              </details>
              {data.decision && data.decision.review_ref !== reviewedDecision.review_ref && <button className="btn" style={{ marginTop: 10 }} onClick={() => { setReviewedDecision(data.decision); setDecisionMessage(""); }}>Evidence changed · review updated evidence</button>}
              {decisionMessage && <div className="muted small" style={{ marginTop: 8 }}>{decisionMessage}</div>}
              {canDecide && <div className="row" style={{ marginTop: 18 }}>
                <button className="btn red lg" disabled={busy} onClick={() => decide(reviewedDecision.id, "approve")}>
                  <Lock size={16} /> {reviewedDecision.approve_label}
                </button>
                <button className="btn lg" disabled={busy} onClick={() => decide(reviewedDecision.id, "reject")}>
                  Reject
                </button>
              </div>}
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center" }}>
              <div className="eyebrow" style={{ textAlign: "left" }}>Waiting for your decision</div>
              <div style={{ width: 40, height: 40, borderRadius: 99, background: "var(--surface-sunken)", display: "flex", alignItems: "center", justifyContent: "center", margin: "18px auto 10px" }}>
                <CheckCircle2 size={20} color="var(--text-muted)" />
              </div>
              <div className="jakarta" style={{ fontSize: 18, fontWeight: 600 }}>Nothing needs a decision</div>
            </div>
          )}

          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Highest risk</div>
            <div className="stack" style={{ gap: 10 }}>
              {data.top_risk.map((r, i) => {
                const c = levelOf(r.level);
                const href = r.case_id ? `/cases/${r.case_id}` : r.staff_id ? `/staff/${r.staff_id}` : "#";
                return (
                  <Link key={r.staff_id ?? r.pseudo_id} href={href} aria-disabled={href === "#"} className="between" style={{ padding: "12px 14px", borderRadius: 10, background: i === 0 && r.score >= 15 ? c.bg : "var(--page)", border: `1px solid ${i === 0 && r.score >= 15 ? c.border : "transparent"}` }}>
                    <div className="row">
                      <span style={{ width: 36, height: 36, borderRadius: 99, background: c.bg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <User size={18} color={c.fg} />
                      </span>
                      <div>
                        <div style={{ fontWeight: 700 }}>{r.pseudo_id}</div>
                        <div className="muted small">
                          {r.role}
                          {r.employment_type === "CONTRACTOR" ? " · Contractor" : ""}
                        </div>
                        {r.note && <div className="muted" style={{ fontSize: 13 }}>{r.note.replace(/^Raw /, "Risk before verified context ")}</div>}
                        {r.review.required && !r.review.score_threshold_met && <div style={{ color: "var(--level-verify)", fontSize: 13, fontWeight: 700 }}>Review needed · confirmed evidence</div>}
                      </div>
                    </div>
                    <div className="row">
                      <span className="score-lg" style={{ fontSize: 28, color: r.score >= 15 ? c.fg : "var(--text)" }}>{r.score}</span>
                      <LevelChip level={r.level} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Counter label="Actions checked" value={num(data.metrics.actions_checked)} icon={<Eye size={18} />} />
            <Counter label="Cleared automatically" value={num(data.metrics.unusual_cleared)} icon={<CheckCircle2 size={18} />} />
            <Counter label="Cases opened" value={num(data.metrics.cases_opened)} icon={<FolderOpen size={18} />} />
            <Counter label="Transfers blocked" value={num(data.metrics.transfers_blocked)} icon={<Ban size={18} />} />
          </div>
        </div>
      </div>
      {data.state.toast && data.state.last_step === "S1.1" && (
        <div className="toast">
          <CheckCircle2 size={20} /> {data.state.toast}
        </div>
      )}
    </>
  );
}
