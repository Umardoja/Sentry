"use client";
import { Ban, CheckCircle2, CreditCard, Landmark, ShieldCheck, UserSquare2 } from "lucide-react";
import { naira, usePoll } from "@/lib/client";

type Graph = {
  staff: { pseudo_id: string; terminal: string; credits: number };
  accounts: { id: string; masked: string; opened: string; age_days: number; amount: number; watchlisted: boolean; banks: string[] }[];
  banks: { bank: string; accounts: number; total: number; blocked: boolean }[];
  total_attempted: number; transfers_blocked: number; held: number; left_bank: number; watchlisted: number; watchlist_remaining: string | null;
};

const ROW = 68;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: string) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}`;

export function MoneyGraph({ caseId }: { caseId: string }) {
  const { data, error, reload } = usePoll<Graph>(`/api/graph/${caseId}`, 3000);
  if (error && !data) return <div className="card" role="alert">Graph unavailable: {error} <button className="btn" onClick={reload}>Try again</button></div>;
  if (!data) return <div className="card loading-card" role="status">Loading the money graph…</div>;
  const n = Math.max(data.accounts.length, data.banks.length, 1);
  const H = n * ROW + 24;
  const rowY = (i: number) => 12 + i * ROW + ROW / 2;
  const bankIndex = new Map(data.banks.map((b, i) => [b.bank, i]));
  const blockedAll = data.transfers_blocked > 0 && data.left_bank === 0;
  return (
    <div className="stack">
      {data.banks.length > 0 && (
        <div className={`banner ${blockedAll ? "CONTAIN" : "HOLD"}`} style={{ marginBottom: 0, justifyContent: "space-between" }}>
          <span className="row"><ShieldCheck size={20} /> {data.transfers_blocked} transfers blocked · {data.watchlisted} BVN watchlist entries</span>
          {blockedAll && <span className="chip" style={{ background: "var(--surface)", color: "var(--zenith-red)" }}><CheckCircle2 size={16} /> Funds remained in originating accounts</span>}
        </div>
      )}
      <div className="card">
        <div className="between graph-heading" style={{ marginBottom: 18 }}>
          <div>
            <div className="card-title">Where the money went</div>
            <div className="muted small">From the staff member&apos;s reversals, to new accounts, to the outside accounts they tried to pay.</div>
          </div>
          <div className="row small muted" style={{ gap: 18 }}>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 99, background: "var(--ink)" }} /> Staff</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, border: "2px solid var(--zenith-red)", background: "var(--level-contain-tint)" }} /> New account (&lt;7d)</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 99, background: "var(--node-outside)" }} /> Outside accounts</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 22, borderTop: "2px dashed var(--zenith-red)" }} /> Blocked</span>
          </div>
        </div>
        <div className="scroll-affordance muted small">Pan horizontally to inspect every account and destination.</div>
        <div className="graph-scroll" role="region" aria-label="Money movement graph" tabIndex={0}>
          <div style={{ position: "relative", width: 1100, height: H, margin: "0 auto" }}>
            <svg width={1100} height={H} style={{ position: "absolute", inset: 0 }}>
              {data.accounts.map((a, i) => (
                <path key={a.id} d={`M 250 ${H / 2} C 290 ${H / 2}, 290 ${rowY(i)}, 330 ${rowY(i)}`} stroke="var(--ink)" strokeWidth={1.6} fill="none" markerEnd="url(#arrow)" />
              ))}
              {data.accounts.flatMap((a, i) =>
                a.banks.map((b) => (
                  <path key={`${a.id}-${b}`} d={`M 640 ${rowY(i)} C 760 ${rowY(i)}, 760 ${rowY(bankIndex.get(b) ?? 0)}, 820 ${rowY(bankIndex.get(b) ?? 0)}`} stroke="var(--zenith-red)" strokeWidth={1.6} strokeDasharray="6 5" fill="none" />
                )),
              )}
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink)" />
                </marker>
              </defs>
            </svg>
            <div style={{ position: "absolute", left: 0, top: H / 2 - 70, width: 250, background: "var(--ink-deep)", color: "var(--on-ink)", borderRadius: 10, padding: 18 }}>
              <div style={{ font: "600 12px Plus Jakarta Sans", letterSpacing: "0.06em", color: "var(--on-ink-dim)" }}>SOURCE NODE</div>
              <div className="row jakarta" style={{ fontSize: 21, fontWeight: 700, margin: "8px 0 4px" }}><UserSquare2 size={20} /> {data.staff.pseudo_id}</div>
              <div style={{ fontSize: 14, color: "var(--on-ink-soft)" }}>Terminal {data.staff.terminal}</div>
              <div style={{ fontSize: 13, color: "var(--on-ink-soft)", borderTop: "1px solid var(--ink-line)", marginTop: 10, paddingTop: 8 }}>{data.staff.credits} reversal credits without a verified reason</div>
            </div>
            {data.accounts.map((a, i) => (
              <div key={a.id} style={{ position: "absolute", left: 330, top: 12 + i * ROW + 4, width: 310, height: ROW - 8, background: "var(--level-contain-tint)", borderLeft: "3px solid var(--zenith-red)", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="row" style={{ gap: 10 }}>
                  <CreditCard size={18} color="var(--zenith-red)" />
                  <div>
                    <div className="numeric" style={{ fontWeight: 700 }}>{a.masked}</div>
                    <div className="muted" style={{ fontSize: 13 }}>Opened {day(a.opened)} ({a.age_days}d old)</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="numeric" style={{ fontWeight: 700, color: "var(--zenith-red)" }}>{naira(a.amount)}</div>
                  {a.watchlisted && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--zenith-red)", letterSpacing: "0.03em" }}>BVN WATCHLIST</div>}
                </div>
              </div>
            ))}
            {data.accounts.map((a, i) =>
              a.banks.length ? (
                <span key={`p-${a.id}`} className="chip" style={{ position: "absolute", left: 690, top: rowY(i) - 13, height: 26, background: data.left_bank === 0 ? "var(--zenith-red)" : "var(--ink)", color: "var(--on-ink)", fontSize: 12 }}>
                  <Ban size={13} /> {data.left_bank === 0 ? "BLOCKED" : "SENT"}
                </span>
              ) : null,
            )}
            {data.banks.map((b, i) => (
              <div key={b.bank} style={{ position: "absolute", left: 820, top: 12 + i * ROW + 6, width: 280, height: ROW - 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 99, background: "var(--neutral-tint)", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{b.bank.slice(-1)}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>{b.bank} · {b.accounts} accts</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: b.blocked ? "var(--zenith-red)" : "var(--text-muted)" }}>{b.blocked ? "BLOCKED" : "SENT"}</div>
                  </div>
                </div>
                <span className="numeric" style={{ fontWeight: 700, color: b.blocked ? "var(--zenith-red)" : "var(--text)" }}>{naira(b.total)}</span>
              </div>
            ))}
            {data.banks.length === 0 && (
              <div className="muted" style={{ position: "absolute", left: 820, top: H / 2 - 12 }}>No outbound transfers yet</div>
            )}
          </div>
        </div>
        <div className="between graph-summary" style={{ marginTop: 22, background: "var(--page)", borderRadius: 10, padding: "16px 20px" }}>
          <div className="row"><Landmark size={20} /> <div><div className="muted small">Total attempted diversion</div><div className="numeric" style={{ fontSize: 22, fontWeight: 700 }}>{naira(data.total_attempted)}</div></div></div>
          <div className="jakarta" style={{ background: "var(--surface)", borderRadius: 8, padding: "10px 22px", fontSize: 24, fontWeight: 700 }}>
            Hold {naira(data.held)} · <span style={{ color: data.left_bank === 0 ? "var(--ok)" : "var(--zenith-red)" }}>{naira(data.left_bank)} left the bank</span>
          </div>
          <div style={{ textAlign: "right" }}><div className="eyebrow">Watchlist expiry</div><div style={{ fontWeight: 600 }}>{data.watchlist_remaining ? `${data.watchlist_remaining} remaining` : "—"}</div></div>
        </div>
      </div>
    </div>
  );
}
