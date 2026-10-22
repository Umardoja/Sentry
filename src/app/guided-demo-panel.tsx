"use client";
import Link from "next/link";
import { ArrowRight, RotateCcw, Route, UserRoundCheck } from "lucide-react";
import { post, usePoll } from "@/lib/client";
import { presentationMessage, scenarioStepLabel } from "@/lib/presentation";
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
  if (!data) return <section className="card guide-card loading-card" role="status">Loading scenario runner…</section>;

  const gate = data.waiting_for_operator_action_id
    ? { role: "Operations Officer", text: "Waiting for Operations Officer to submit ticket TKT-2291.", href: "/login?switch=1" }
    : data.waiting_for_intervention_id
      ? { role: "Reviewer", text: "Waiting for Reviewer to decide the proposed response.", href: "/login?switch=1" }
      : null;
  const next = async () => {
    setBusy(true); setMessage("");
    const result = await post<StepResponse>("/api/scenarios/demo/next", { run_id: data.run_id });
    setBusy(false);
    if (!result.ok) { setMessage(presentationMessage(result.data.detail, "The next step could not run.")); reload(); return; }
    const focus = result.data.state?.focus;
    if (focus && focus !== "/") window.location.assign(focus);
    else reload();
  };
  const reset = async () => {
    setBusy(true); setMessage("");
    const result = await post<GuideState & { detail?: string }>("/api/sim/reset", { run_id: data.run_id });
    setBusy(false); setConfirmReset(false);
    setMessage(result.ok ? "Investigation reset to its starting point." : presentationMessage(result.data.detail, "The investigation could not be reset."));
    reload();
  };

  return <section className="card guide-card" aria-labelledby="guided-story-title">
    <div className="guide-heading">
      <div>
        <div className="eyebrow"><Route size={15} /> Sandbox tools</div>
        <h2 id="guided-story-title">Scenario runner</h2>
        <div className="muted small">{data.last_step ? `Current step ${data.last_step}` : "Ready to begin"}</div>
      </div>
      <span className="chip grey">Investigation Lead only</span>
    </div>
    <div className="guide-next">
      <div><span>What happens next</span><strong>{data.next_step_label ? scenarioStepLabel(data.next_step_label) : "Scenario complete"}</strong></div>
      {gate && <div className="guide-role"><UserRoundCheck size={17} /><span><strong>{gate.role} needed</strong>{gate.text}</span></div>}
    </div>
    {error && <div className="small" role="alert">{error}</div>}
    {message && <div className="small" role="status">{message}</div>}
    <div className="guide-actions">
      <button className="btn dark" disabled={busy || !!gate || !data.next_step_label} title={gate?.text} onClick={next}>
        Run next step <ArrowRight size={16} />
      </button>
      {gate && <Link className="btn" href={gate.href}>Switch to {gate.role}</Link>}
      <button className="btn reset-sample" disabled={busy} onClick={() => setConfirmReset(true)}><RotateCcw size={15} /> Reset sandbox</button>
    </div>
    {gate && <div className="muted small">{gate.text}</div>}
    {confirmReset && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmReset(false); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">Reset sandbox?</h2>
        <p className="muted">This resets only this visitor workspace to the prepared investigation. It does not affect other visitors.</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button className="btn red" disabled={busy} onClick={reset}>Reset sandbox</button>
        </div>
      </div>
    </div>}
  </section>;
}
