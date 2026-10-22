"use client";
import { useState } from "react";
import { post, usePoll } from "@/lib/client";
import { purposeCheckLabel, purposeStatusLabel } from "@/lib/presentation";
import { AccessBridgePanel } from "./access-bridge";

type OwnAction = { id: string; run_id: string; ts: string; action_type: string; amount: number | null; purpose_status: string; checks: { code: string; passed: boolean; detail: string }[] };

export default function MyActionsPage() {
  const { data, error, reload } = usePoll<OwnAction[]>("/api/actions", 3000);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [draftRuns, setDraftRuns] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const answer = async (id: string) => {
    const action = data?.find((item) => item.id === id);
    if (!action) return;
    const result = await post<{ detail?: string; message?: string }>(`/api/actions/${id}/answer`, { run_id: draftRuns[id] ?? action.run_id, ticket_ref: refs[id] ?? "" });
    setMessage(result.ok ? result.data.message ?? "Explanation recorded and canonical checks refreshed." : result.data.detail ?? "Unable to submit explanation.");
  };
  if (error && !data) return <div className="card" role="alert"><h1>Actions unavailable</h1><p className="muted">{error}</p><button className="btn" onClick={reload}>Try again</button></div>;
  return <div className="stack">
    <AccessBridgePanel />
    <div className="card"><h1>Actions needing context</h1><p className="muted">Only sample actions assigned to your verified role are shown here.</p></div>
    {!data && <div className="card loading-card" role="status">Loading your mapped actions…</div>}
    {error && <div className="card" role="alert">{error}</div>}{message && <div className="card" role="status">{message}</div>}
    {(data ?? []).map((action) => <div className="card" key={action.id}>
      <div className="between"><strong>{action.action_type}</strong><span className={`chip ${action.purpose_status === "MATCHED" ? "ok" : "bad"}`}>{purposeStatusLabel(action.purpose_status)}</span></div>
      <div className="muted small">Simulated event time · {action.ts} · {action.amount === null ? "No amount" : `₦${action.amount.toLocaleString("en-US")}`}</div>
      <div className="stack" style={{ marginTop: 12 }}>{action.checks.map((check) => <div key={check.code}>{check.passed ? "✓" : "✕"} {purposeCheckLabel(check.code)}: {check.detail}</div>)}</div>
      <details className="technical-details"><summary>Technical details</summary><div>Action {action.id} · status {action.purpose_status}</div><div>Checks: {action.checks.map((check) => check.code).join(", ")}</div></details>
      {action.purpose_status !== "MATCHED" && <div className="row" style={{ marginTop: 14 }}><input className="input" aria-label="Ticket or case reference" placeholder="Ticket or case reference" maxLength={128} value={refs[action.id] ?? ""} onChange={(e) => { setDraftRuns((old) => old[action.id] ? old : { ...old, [action.id]: action.run_id }); setRefs((old) => ({ ...old, [action.id]: e.target.value })); }} /><button className="btn dark" onClick={() => answer(action.id)}>Submit explanation</button></div>}
    </div>)}
  </div>;
}
