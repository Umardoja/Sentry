"use client";
import Link from "next/link";
import { ArrowRight, RotateCcw, Route, UserRoundCheck } from "lucide-react";
import { post, usePoll } from "@/lib/client";
import { useState } from "react";

type GuideState = {
  run_id: string;
  last_step: string | null;
  next_step_label: string | null;
  waiting_for_intervention_id: string | null;
  waiting_for_operator_action_id: string | null;
  focus: string;
};

type StepResponse = { detail?: string; state?: GuideState };

export function GuidedDemoPanel() {
  const { data, error, reload } = usePoll<GuideState>("/api/sim/state", 1500);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  if (!data) return <section className="card guide-card loading-card" role="status">Loading guided story…</section>;

  const gate = data.waiting_for_operator_action_id
    ? { role: "Operator", text: "Switch to Operator and submit genuine sample ticket TKT-2291.", href: "/login?switch=1" }
    : data.waiting_for_intervention_id
      ? { role: "Independent Reviewer", text: "Switch to Independent Reviewer to decide the proposed simulated control.", href: "/login?switch=1" }
      : null;
  const next = async () => {
    setBusy(true); setMessage("");
    const result = await post<StepResponse>("/api/scenarios/demo/next", { run_id: data.run_id });
    setBusy(false);
    if (!result.ok) { setMessage(result.data.detail ?? "The next step could not run."); reload(); return; }
    const focus = result.data.state?.focus;
    if (focus && focus !== "/") window.location.assign(focus);
    else reload();
  };
  const reset = async () => {
    setBusy(true); setMessage("");
    const result = await post<GuideState & { detail?: string }>("/api/sim/reset", { run_id: data.run_id });
    setBusy(false); setConfirmReset(false);
    setMessage(result.ok ? "Sample data reset to the prepared investigation." : result.data.detail ?? "Sample data could not be reset.");
    reload();
  };

  return <section className="card guide-card" aria-labelledby="guided-story-title">
    <div className="guide-heading">
      <div>
        <div className="eyebrow"><Route size={15} /> Guided story</div>
        <h2 id="guided-story-title">{data.last_step ? `Current step ${data.last_step}` : "Prepared investigation"}</h2>
      </div>
      <span className="chip grey">Presenter controls</span>
    </div>
    <div className="guide-next">
      <div><span>What happens next</span><strong>{data.next_step_label ?? "Story complete"}</strong></div>
      {gate && <div className="guide-role"><UserRoundCheck size={17} /><span><strong>{gate.role} needed</strong>{gate.text}</span></div>}
    </div>
    {error && <div className="small" role="alert">{error}</div>}
    {message && <div className="small" role="status">{message}</div>}
    <div className="guide-actions">
      <button className="btn dark" disabled={busy || !!gate || !data.next_step_label} title={gate?.text} onClick={next}>
        Next step <ArrowRight size={16} />
      </button>
      {gate && <Link className="btn" href={gate.href}>Switch to {gate.role}</Link>}
      <button className="btn reset-sample" disabled={busy} onClick={() => setConfirmReset(true)}><RotateCcw size={15} /> Reset sample data</button>
    </div>
    {gate && <div className="muted small">Next step is paused: {gate.text}</div>}
    {confirmReset && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmReset(false); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">Reset sample data?</h2>
        <p className="muted">This resets only this visitor workspace to the prepared investigation. It does not affect other visitors.</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button className="btn red" disabled={busy} onClick={reset}>Reset sample data</button>
        </div>
      </div>
    </div>}
  </section>;
}
