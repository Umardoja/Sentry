"use client";
import { CheckCircle2, Clock3, KeyRound, LockKeyhole, ShieldCheck, XCircle } from "lucide-react";
import { post, usePoll } from "@/lib/client";
import { useState } from "react";

type Grant = { id: string; operation: string; status: "ACTIVE" | "REVOKED" | "EXPIRED"; issued_at_ms: number; expires_at_ms: number };
type AccessCase = {
  id: string; customer_id: string; customer_ref: string; operation: "VIEW_RESTRICTION_STATUS";
  status: "OPEN" | "COMPLETED" | "CLOSED"; sensitivity: string; evidence_status: string;
  ticket_id: string; facts: string[]; grant: Grant | null;
};
type AccessView = { mode: "OPERATOR"; run_id: string; notice: string; cases: AccessCase[] };

const scopeLabel = (operation: string) => operation === "VIEW_RESTRICTION_STATUS" ? "View restriction status" : operation;

export function AccessBridgePanel() {
  const { data, error, reload } = usePoll<AccessView>("/api/access-bridge", 3000);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const requestAccess = async (accessCase: AccessCase) => {
    if (!data) return;
    setBusy(true); setMessage(""); setDetails("");
    const result = await post<{ detail?: string; outcome?: string }>("/api/access-bridge/request", {
      run_id: data.run_id, case_id: accessCase.id, operation: accessCase.operation,
    });
    setMessage(result.ok ? "Access granted to this case." : result.data.detail ?? "Temporary access was not granted.");
    setBusy(false); reload();
  };

  const viewRestriction = async (accessCase: AccessCase, otherCustomer = false) => {
    if (!data || !accessCase.grant) return;
    setBusy(true); setDetails("");
    const query = new URLSearchParams({
      run_id: data.run_id, case_id: accessCase.id,
      customer_id: otherCustomer ? "CUS-ACCESS-OTHER" : accessCase.customer_id,
      operation: accessCase.operation,
    });
    const response = await fetch(`/api/access-bridge/grants/${accessCase.grant.id}/restriction?${query}`, { credentials: "same-origin", cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { detail?: string; restriction_status?: string; customer_ref?: string };
    setDetails(response.ok
      ? `${body.customer_ref}: ${body.restriction_status}`
      : `${otherCustomer ? "Scope boundary enforced" : "Access denied"}: ${body.detail ?? `HTTP ${response.status}`}`);
    setBusy(false); reload();
  };

  const complete = async (accessCase: AccessCase) => {
    if (!data) return;
    setBusy(true); setMessage(""); setDetails("");
    const result = await post<{ detail?: string }>(`/api/access-bridge/cases/${accessCase.id}/complete`, { run_id: data.run_id });
    setMessage(result.ok ? "Case completed. Temporary access has ended." : result.data.detail ?? "The case could not be completed.");
    setBusy(false); reload();
  };

  if (error && !data) return <section className="card" role="alert"><h2>Temporary access unavailable</h2><p className="muted">{error}</p><button className="btn" onClick={reload}>Try again</button></section>;
  if (!data) return <section className="card loading-card" role="status">Loading assigned access work…</section>;
  const heading = data.cases.some((item) => item.grant?.status === "ACTIVE") ? "Access granted" : data.cases.some((item) => item.status === "OPEN") ? "Access needed" : "Access ended";
  return <section className="card access-bridge" aria-labelledby="access-bridge-title">
    <div className="between">
      <div><div className="eyebrow">Access Bridge</div><h2 id="access-bridge-title">{heading}</h2></div>
      <span className="chip grey"><LockKeyhole size={15} /> Read-only</span>
    </div>
    <p className="muted">Continue an assigned complaint while its ordinary owner is unavailable. Access is limited to one case, one customer and one approved operation.</p>
    <div className="simulation-outcome">{data.notice}</div>
    {message && <div className="access-message" role="status">{message}</div>}
    {data.cases.map((accessCase) => {
      const active = accessCase.grant?.status === "ACTIVE";
      const minutes = active ? Math.max(0, Math.ceil((accessCase.grant!.expires_at_ms - Date.now()) / 60000)) : 0;
      return <div key={accessCase.id} className="access-work-card">
        <div className="between">
          <div><strong>{accessCase.customer_ref}</strong><div className="muted small">Complaint {accessCase.ticket_id} · assigned case {accessCase.id}</div></div>
          <span className={`chip ${active ? "ok" : accessCase.status === "OPEN" ? "warn" : "grey"}`}>{active ? "Access granted" : accessCase.status === "OPEN" ? "Access needed" : "Access ended"}</span>
        </div>
        <div className="access-evidence" aria-label="Verified access evidence">
          {accessCase.facts.map((fact) => <span key={fact}><CheckCircle2 size={16} /> {fact}</span>)}
        </div>
        <div className="access-scope"><ShieldCheck size={18} /><div><strong>Permitted operation</strong><div>{scopeLabel(accessCase.operation)} for {accessCase.customer_ref} only</div></div></div>
        {active && <div className="muted small row"><Clock3 size={15} /> Expires in about {minutes} minute{minutes === 1 ? "" : "s"}; every read is checked again by the server.</div>}
        <div className="access-actions">
          {!accessCase.grant && accessCase.status === "OPEN" && <button className="btn dark" disabled={busy} onClick={() => requestAccess(accessCase)}><KeyRound size={16} /> Request temporary access</button>}
          {active && <>
            <button className="btn dark" disabled={busy} onClick={() => viewRestriction(accessCase)}>View restriction details</button>
            <button className="btn" disabled={busy} onClick={() => viewRestriction(accessCase, true)}>Check another customer</button>
            <button className="btn" disabled={busy} onClick={() => complete(accessCase)}>Complete case</button>
          </>}
          {!active && accessCase.status !== "OPEN" && accessCase.grant && <button className="btn" disabled={busy} onClick={() => viewRestriction(accessCase)}>Try viewing again</button>}
        </div>
        {details && <div className={`access-result ${details.startsWith("Scope boundary") || details.startsWith("Access denied") ? "denied" : ""}`} role="status">
          {details.startsWith("Scope boundary") || details.startsWith("Access denied") ? <XCircle size={17} /> : <CheckCircle2 size={17} />}{details}
        </div>}
        <details className="technical-details"><summary>Technical details</summary>Operation: {accessCase.operation} · Case: {accessCase.id}{accessCase.grant ? ` · Grant: ${accessCase.grant.id}` : ""}</details>
      </div>;
    })}
  </section>;
}
