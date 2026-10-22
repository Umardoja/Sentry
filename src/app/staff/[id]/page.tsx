"use client";
import Link from "next/link";
import { use } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LevelChip, LEVEL, levelOf } from "@/components";
import { usePoll } from "@/lib/client";

type Staff = {
  staff_id: string; pseudo_id: string; role: string; employment_type: string; score: number; level: string; usual_terminal: string | null; roster: string | null; case_id: string | null;
  week: { label: string; score: number; level: string }[];
  monday: { reversals: number; matched_pct: number; peer_avg: number };
};

export default function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = usePoll<Staff>(`/api/staff/${id}`, 3000);
  if (!data) return <div className="muted">Loading…</div>;
  const c = levelOf(data.level);
  return (
    <div className="stack">
      <div className="card between">
        <div>
          <h1 style={{ fontSize: 30 }}>{data.pseudo_id}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <span className="muted" style={{ fontSize: 17 }}>{data.role}</span>
            <span className="chip grey">{data.employment_type === "CONTRACTOR" ? "Contractor" : "Employee"}</span>
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>Usual terminal {data.usual_terminal} · Roster {data.roster}</div>
          {data.case_id && <Link href={`/cases/${data.case_id}`} className="btn" style={{ marginTop: 12 }}>Open {data.case_id}</Link>}
        </div>
        <div className="row">
          <span className="score-xl" style={{ color: c.fg }}>{data.score}</span>
          <LevelChip level={data.level} size="lg" />
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 6 }}>Risk this week</div>
        <div className="muted small" style={{ marginBottom: 14 }}>Mon 12 Oct · {data.monday.reversals} reversals, {data.monday.matched_pct}% matched · score 6</div>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.week} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <ReferenceArea y1={0} y2={14} fill={LEVEL.NORMAL.bg} />
              <ReferenceArea y1={15} y2={29} fill={LEVEL.WATCH.bg} />
              <ReferenceArea y1={30} y2={59} fill={LEVEL.VERIFY.bg} />
              <ReferenceArea y1={60} y2={79} fill={LEVEL.HOLD.bg} />
              <ReferenceArea y1={80} y2={100} fill={LEVEL.CONTAIN.bg} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 13 }} />
              <YAxis domain={[0, 100]} ticks={[0, 15, 30, 60, 80, 100]} tick={{ fontSize: 13 }} />
              <Tooltip />
              <Line type="stepAfter" dataKey="score" stroke="var(--ink)" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <div className="counter"><div className="muted small">Reversals on Monday</div><div className="v">{data.monday.reversals}</div></div>
        <div className="counter"><div className="muted small">Matched to a failed transaction</div><div className="v">{data.monday.matched_pct}%</div></div>
        <div className="counter"><div className="muted small">Peer average</div><div className="v">{data.monday.peer_avg} a day</div></div>
      </div>
      <div className="card muted">Volume above peers on Monday, but every reversal had a reason. SENTRY added 6 points and moved on.</div>
    </div>
  );
}
