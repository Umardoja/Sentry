"use client";
import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Ban, CheckCircle2, ClipboardCheck, Gavel, Lock, Power, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { LevelChip, levelOf, ScoreSteps } from "@/components";
import { post, usePoll, useSession } from "@/lib/client";
import { purposeCheckLabel, reviewReasonLabel, signalLabel } from "@/lib/presentation";
import { MoneyGraph } from "./graph";

type Intervention = { id: string; type: string; status: string; automatic: boolean; decided_by: string | null; decided_time: string | null; created_at: string; target: { amount?: number }; run_id?: string; review_ref?: string; evidence_codes?: string[] };
type CaseData = {
  id: string; run_id: string; status: string; score: number; level: string; banner: string | null; banner_level: string;
  review: { required: boolean; outcome: "NO_REVIEW" | "REVIEW_REQUIRED"; policy_version: string; reason_codes: string[]; score_threshold_met: boolean; source_assumption: string };
  freshness: { score: { snapshot_id: number; sim_time: string; step_id: string | null } | null; evidence: { evaluation_id: number; sim_time: string; server_at: string | null; trigger: string } | null; score_is_current: boolean };
  staff: { staff_id: string; pseudo_id: string; role: string; employment_type: string; name: string | null };
  badges: string[];
  timeline: { time: string; score: number; level: string }[];
  signals: { code: string; label: string; points: number; effective_points: number; waived: boolean; action_ids: string[] }[];
  purpose: { title: string; checks: { code: string; passed: boolean; detail: string }[] } | null;
  activity: { time: string; text: string; chip: string | null }[];
  interventions: Intervention[]; contact_tasks: number; watchlist: number;
  note: { source: string; sentences: { text: string; evidence: string[] }[] } | null;
  prompt: { ticket_ref: string | null; valid: boolean | null; message: string } | null;
  has_graph: boolean;
};

const naira = (n?: number) => (n === undefined ? "" : `₦${n.toLocaleString("en-US")}`);

function interventionText(i: Intervention, watch: number) {
  switch (i.type) {
    case "HOLD_FUNDS":
      return { title: `Hold ${naira(i.target.amount)}${watch ? ` · ${watch} BVNs on 24-hour watchlist` : ""}`, sub: "Credits from unmatched reversals" };
    case "SUSPEND_SESSION":
      return { title: "Suspend this session", sub: "Suspends the user's active session until reviewed." };
    case "SECOND_APPROVER":
      return { title: "Second approver on money actions", sub: "Further postings need a second approver" };
    case "RESTRICT_DATA_ACCESS":
      return { title: "Restrict data access", sub: "Further record views and exports are blocked" };
    case "REQUEST_REASON":
      return { title: "Reason requested from the user", sub: "SENTRY asked for a ticket or case number" };
    default:
      return { title: i.type, sub: "" };
  }
}

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const session = useSession();
  const canDecide = session?.principal.capabilities.includes("DECIDE_INTERVENTION") ?? false;
  const canReveal = session?.principal.capabilities.includes("REVEAL_IDENTITY") ?? false;
  const { id } = use(params);
  const requestedTab = useSearchParams()?.get("tab") ?? "overview";
  const [tab, setTab] = useState(requestedTab);
  const { data, error } = usePoll<CaseData>(`/api/cases/${id}`, 3000);
  const [busy, setBusy] = useState(false);
  const [unmask, setUnmask] = useState(false);
  const [revealRun, setRevealRun] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [hover, setHover] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState("");
  const [reviewedInterventions, setReviewedInterventions] = useState<Record<string, Intervention>>({});
  useEffect(() => {
    if (!data) return;
    setReviewedInterventions((shown) => {
      const next = { ...shown };
      for (const item of data.interventions) {
        if (item.status === "PENDING_APPROVAL" && !next[item.id]) next[item.id] = item;
        if (item.status !== "PENDING_APPROVAL") delete next[item.id];
      }
      return next;
    });
  }, [data]);
  if (error && !data) return <div className="card">Case {id} is not available in this synthetic workspace.</div>;
  if (!data) return <div className="muted">Loading case…</div>;
  const c = levelOf(data.level);
  const decide = async (iid: string, verb: "approve" | "reject") => {
    const intervention = reviewedInterventions[iid];
    if (!intervention?.run_id || !intervention.review_ref) return;
    setBusy(true);
    const result = await post<{ detail?: string; code?: string }>(`/api/interventions/${iid}/${verb}`, { run_id: intervention.run_id, review_ref: intervention.review_ref, note: verb === "reject" ? "Rejected from case view" : undefined });
    setActionMessage(result.ok ? "Decision recorded for the reviewed evidence." : result.data.code === "REVIEW_STALE" || result.data.code === "RUN_STALE" ? "Evidence changed. Refresh, inspect the current facts, and decide again." : result.data.detail ?? "Decision was not recorded.");
    setBusy(false);
  };
  const doUnmask = async () => {
    const result = await post<{ detail?: string }>(`/api/cases/${id}/unmask`, { run_id: revealRun, reason });
    if (!result.ok) setActionMessage(result.data.detail ?? "Identity was not revealed.");
    setUnmask(false);
    setReason("");
  };
  const total = data.signals.reduce((s, x) => s + x.effective_points, 0);
  const shownInterventions = data.interventions.map((item) => item.status === "PENDING_APPROVAL" ? reviewedInterventions[item.id] ?? item : item);
  const tabs = [
    { key: "overview", label: "Overview" },
    ...(data.has_graph ? [{ key: "graph", label: "Money graph" }] : []),
    { key: "evidence", label: "Evidence" },
  ];
  const selectTab = (nextTab: string) => {
    setTab(nextTab);
    const nextUrl = `/cases/${id}${nextTab === "overview" ? "" : `?tab=${nextTab}`}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  };
  return (
    <>
      {data.banner && (
        <div className={`banner ${data.banner_level}`}>
          <AlertTriangle size={18} /> Simulated control · {data.banner.replace("Contain · ", "").replace("Hold · ", "")}
        </div>
      )}
      <div className="card" style={{ paddingBottom: 0 }}>
        <div className="between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">Investigation</div>
            <div className="row" style={{ marginTop: 6 }}>
              <h1 style={{ fontSize: 30 }}>{data.staff.pseudo_id}</h1>
              {canReveal && data.staff.employment_type !== "AGENT" && !data.staff.name && (
                <button className="btn" style={{ height: 32 }} onClick={() => { setRevealRun(data.run_id); setUnmask(true); }}>
                  <Lock size={14} /> View identity
                </button>
              )}
              <span className="muted" style={{ fontSize: 17 }}>{data.staff.role}</span>
            </div>
            {data.staff.name && <div className="muted small" style={{ marginTop: 4 }}>{data.staff.name} · viewed in this session by {session?.principal.username ?? "verified reviewer"} and recorded in the audit log</div>}
            <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              {data.badges.map((b) => (
                <span key={b} className="chip grey">{b}</span>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="score-xl" style={{ color: c.fg }}>{data.score}</span>
            <div className="stack" style={{ gap: 8 }}>
              <LevelChip level={data.level} />
              <span className="chip grey">{data.status === "CONTAINED" ? "Control applied (simulated)" : "Open"}</span>
            </div>
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>Risk score last calculated at simulated event time {data.freshness.score?.sim_time.slice(11, 16) ?? "—"}. Evidence last checked at {data.freshness.evidence?.sim_time.slice(11, 16) ?? "—"}.{!data.freshness.score_is_current && " The evidence is newer than the displayed risk score."}</div>
        {data.review.required && (
          <div style={{ marginTop: 10, padding: "10px 12px", border: "1px solid var(--level-verify-border)", borderRadius: 8, background: "var(--level-verify-tint)" }}>
            <div className="row" style={{ color: "var(--level-verify)", fontWeight: 700 }}><ShieldAlert size={16} /> Review needed</div>
            <div className="muted small" style={{ marginTop: 4 }}>
              Score remains {data.score} ({levelOf(data.level).label}). Review is needed because {data.review.reason_codes.map(reviewReasonLabel).join("; ")}.
            </div>
          </div>
        )}
        <details className="technical-details">
          <summary>Technical details</summary>
          <div>Case {data.id} · run {data.run_id}</div>
          <div>Policy {data.review.policy_version} · outcome {data.review.outcome} · reason codes {data.review.reason_codes.join(", ") || "none"}</div>
          <div>Score snapshot {data.freshness.score?.snapshot_id ?? "—"} · evidence evaluation {data.freshness.evidence?.evaluation_id ?? "—"} · trigger {data.freshness.evidence?.trigger ?? "—"}</div>
        </details>
        {actionMessage && <div className="muted small" style={{ marginTop: 6 }}>{actionMessage}</div>}
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => selectTab(t.key)} className={tab === t.key ? "active" : ""} aria-pressed={tab === t.key}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {tab === "graph" && <MoneyGraph caseId={id} />}
        {tab === "evidence" && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Evidence</div>
            <div className="table-scroll" role="region" aria-label="Case evidence" tabIndex={0}>
            <table className="table">
              <thead>
                <tr><th>Signal</th><th className="right">Points</th><th>Evidence rows</th></tr>
              </thead>
              <tbody>
                {data.signals.map((s) => (
                  <tr key={s.code}>
                    <td>{signalLabel(s.code, s.label)}{s.waived ? " (waived)" : ""}<div className="technical-code">{s.code}</div></td>
                    <td className="right numeric">+{s.effective_points}</td>
                    <td className="muted small" style={{ whiteSpace: "normal" }}>{s.action_ids.slice(0, 8).join(", ")}{s.action_ids.length > 8 ? ` +${s.action_ids.length - 8} more` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
        {tab === "overview" && (
          <div className="grid-case">
            <div className="stack">
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>Score over time</div>
                <ScoreSteps points={data.timeline} />
              </div>
              <div className="card">
                <div className="between" style={{ marginBottom: 12 }}>
                  <div className="card-title">Signals</div>
                  <span className="muted small">{data.signals.filter((s) => s.effective_points > 0).length} active</span>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {data.signals.map((s) => (
                    <div key={s.code} className="list-row" style={{ outline: hover.some((h) => s.action_ids.includes(h)) ? "2px solid var(--border-strong)" : "none" }}>
                      <span className="row" style={{ gap: 10 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 9, background: s.effective_points ? "var(--text)" : "var(--text-faint)" }} />
                        {signalLabel(s.code, s.label)}
                        {s.waived && <span className="chip ok" style={{ height: 22, fontSize: 12 }}>waived</span>}
                      </span>
                      <span className="numeric" style={{ fontWeight: 700 }}>+{s.effective_points}</span>
                    </div>
                  ))}
                </div>
                <div className="between" style={{ marginTop: 16, padding: "0 8px" }}>
                  <span className="jakarta" style={{ fontSize: 20, fontWeight: 700 }}>Total</span>
                  <span className="row">
                    <span className="score-lg" style={{ color: c.fg }}>{total}</span>
                    <span style={{ color: c.fg, fontWeight: 600 }}>· {c.label}</span>
                  </span>
                </div>
              </div>
              {data.purpose && (
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 12 }}><ClipboardCheck size={20} /> Reason and transaction checks · {data.purpose.title}</div>
                  <div className="stack" style={{ gap: 8 }}>
                    {data.purpose.checks.map((ch) =>
                      ch.passed ? (
                        <div key={ch.code} className="list-row">
                          <span className="row"><CheckCircle2 size={18} color="var(--ok)" /> {purposeCheckLabel(ch.code)}</span>
                          <span className="muted small">{ch.detail}</span>
                        </div>
                      ) : (
                        <div key={ch.code} style={{ background: "var(--level-contain-tint)", borderRadius: 8, padding: "14px 16px", color: "var(--zenith-red)" }}>
                          <div className="row jakarta" style={{ fontWeight: 700, fontSize: 17 }}><XCircle size={18} /> {purposeCheckLabel(ch.code)}</div>
                          <div style={{ marginTop: 4, paddingLeft: 30 }}>{ch.detail}</div>
                        </div>
                      ),
                    )}
                  </div>
                  <details className="technical-details"><summary>Technical details</summary>Check codes: {data.purpose.checks.map((check) => check.code).join(", ")}</details>
                </div>
              )}
              {data.activity.length > 0 && (!data.purpose || data.activity.some((a) => !a.text.includes("reversal"))) && (
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 12 }}>Activity</div>
                  {data.activity.map((a, i) => (
                    <div key={i} className="between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                      <span className="row"><span className="numeric muted">{a.time}</span> {a.text}</span>
                      {a.chip && <span className="chip bad">{a.chip}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="stack">
              <div className="card">
                <div className="between" style={{ marginBottom: 14 }}>
                  <div className="card-title"><Gavel size={20} /> Decisions</div>
                  {data.interventions.some((i) => i.status === "PENDING_APPROVAL") && <span style={{ color: "var(--zenith-red)", fontWeight: 600 }}>1 pending approval</span>}
                </div>
                <div className="stack" style={{ gap: 12 }}>
                  {shownInterventions.map((i) => {
                    const t = interventionText(i, data.watchlist);
                    if (i.status === "PENDING_APPROVAL" && canDecide)
                      return (
                        <div key={i.id} style={{ border: "1px solid var(--level-contain-border)", borderRadius: 10, padding: 18 }}>
                          <div className="row jakarta" style={{ color: "var(--zenith-red)", fontWeight: 700, fontSize: 19 }}>
                            {i.type === "HOLD_FUNDS" ? <ShieldAlert size={20} /> : <Ban size={20} />} {t.title}
                          </div>
                          <div className="muted small" style={{ margin: "6px 0 14px" }}>{t.sub}</div>
                          <div className="simulation-outcome" style={{ marginBottom: 14 }}>Simulated control awaiting independent review</div>
                          <details className="technical-details" style={{ marginBottom: 14 }}><summary>Technical details</summary>Review reference: {i.review_ref?.slice(4, 12)} · Evidence codes: {i.evidence_codes?.join(", ")}</details>
                          <div className="row">
                            <button className="btn red lg" disabled={busy} onClick={() => decide(i.id, "approve")}>
                              <Power size={16} /> {i.type === "HOLD_FUNDS" ? "Approve hold" : "Approve suspension"}
                            </button>
                            <button className="btn lg" disabled={busy} onClick={() => decide(i.id, "reject")}>Reject</button>
                          </div>
                           {data.interventions.find((current) => current.id === i.id)?.review_ref !== i.review_ref && (
                             <button className="btn" style={{ marginTop: 10 }} onClick={() => {
                               const current = data.interventions.find((item) => item.id === i.id);
                               if (current) setReviewedInterventions((old) => ({ ...old, [i.id]: current }));
                               setActionMessage("");
                             }}>Evidence changed · review updated evidence</button>
                           )}
                        </div>
                      );
                    return (
                      <div key={i.id} className="list-row" style={{ alignItems: "flex-start" }}>
                        <div className="row" style={{ alignItems: "flex-start" }}>
                          {i.status === "REJECTED" ? <XCircle size={18} color="var(--text-muted)" /> : <CheckCircle2 size={18} color="var(--ok)" />}
                          <div>
                            <div style={{ fontWeight: 600 }}>{t.title}</div>
                            <div className="muted small">
                              {i.status === "APPROVED" ? `Approved by ${i.decided_by} at ${i.decided_time}` : i.status === "REJECTED" ? `Rejected by ${i.decided_by}` : t.sub}
                            </div>
                          </div>
                        </div>
                        {i.automatic && <span className="chip grey" style={{ height: 24, fontSize: 12 }}>Automatic</span>}
                      </div>
                    );
                  })}
                  {data.contact_tasks > 0 && <div className="muted small">{data.contact_tasks} simulated contact tasks created for sample watchlist entries.</div>}
                </div>
              </div>

              {data.prompt && (
                <div className="card">
                  <div className="eyebrow" style={{ marginBottom: 10 }}>What the employee sees</div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                    <div className="row jakarta" style={{ fontWeight: 600 }}><ShieldAlert size={18} color="var(--zenith-red)" /> A reason is needed for this action</div>
                    <div className="muted small" style={{ margin: "6px 0 12px" }}>Enter the ticket or case number for this action.</div>
                    <div className="row">
                      <div className="input numeric" style={{ display: "flex", alignItems: "center" }}>{data.prompt.ticket_ref ?? <span className="muted">e.g. TKT-1234</span>}</div>
                      <button className="btn dark" disabled>Submit</button>
                    </div>
                    <div style={{ marginTop: 10, fontWeight: 600, color: data.prompt.valid === null ? "var(--text-muted)" : data.prompt.valid ? "var(--ok)" : "var(--zenith-red)" }}>
                      {data.prompt.valid === false ? "✕ " : data.prompt.valid ? "✓ " : ""}{data.prompt.message}
                    </div>
                  </div>
                </div>
              )}

              {data.note && (
                <div className="card">
                  <div className="between" style={{ marginBottom: 12 }}>
                    <div className="card-title"><Sparkles size={20} /> Investigation summary</div>
                    <span className="chip grey">Linked to evidence</span>
                  </div>
                  {data.note.sentences.map((s, i) => (
                    <div key={i} className="note-sentence" onMouseEnter={() => setHover(s.evidence)} onMouseLeave={() => setHover([])} title={s.evidence.length ? `Evidence: ${s.evidence.slice(0, 6).join(", ")}` : ""}>
                      <span className="muted numeric">{i + 1}.</span>
                      <span style={{ fontWeight: i === data.note!.sentences.length - 1 ? 700 : 400 }}>{s.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {unmask && (
        <div className="overlay" onClick={() => setUnmask(false)} role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reveal-dialog-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") setUnmask(false); }}>
            <h2 id="reveal-dialog-title" style={{ fontSize: 22 }}>View the identity for this case?</h2>
            <div className="muted small" style={{ margin: "4px 0 18px" }}>{data.staff.pseudo_id} · {data.staff.role}</div>
            <label className="small" style={{ fontWeight: 600 }}>Reason <span style={{ color: "var(--zenith-red)" }}>*</span></label>
            <input className="input" style={{ marginTop: 6 }} placeholder="Why do you need the name?" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <div className="muted small" style={{ marginTop: 10 }}>This action is logged in the audit trail.</div>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn" onClick={() => setUnmask(false)}>Cancel</button>
              <button className="btn red" disabled={!reason.trim()} onClick={doUnmask}>View identity</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
