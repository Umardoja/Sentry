"use client";
import { KeyRound } from "lucide-react";
import { usePoll } from "@/lib/client";

type MonitorView = { mode: "MONITOR"; cases: { id: string; customer_ref: string; assigned_pseudonym: string; status: string; latest_request: string | null; grant_status: string | null }[] };

export function AccessBridgeMonitor() {
  const { data } = usePoll<MonitorView>("/api/access-bridge", 3000);
  if (!data || data.mode !== "MONITOR") return null;
  return <section className="card">
    <div className="card-title"><KeyRound size={19} /> Temporary access activity</div>
    <p className="muted small">Read-only oversight of the local sample permission gate. Protected customer details are not included.</p>
    <div className="table-scroll" role="region" aria-label="Temporary access activity" tabIndex={0}>
      <table className="table"><thead><tr><th>Assigned case</th><th>Assignee</th><th>Customer</th><th>Request</th><th>Grant</th><th>Status</th></tr></thead>
        <tbody>{data.cases.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.assigned_pseudonym}</td><td>{item.customer_ref}</td><td>{item.latest_request ?? "Not requested"}</td><td>{item.grant_status ?? "None"}</td><td>{item.status}</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}
