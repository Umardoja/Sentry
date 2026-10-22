"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { BarChart3, ChevronDown, ClipboardList, FolderOpen, LogOut, Monitor, Network, Repeat2, Shield, UserCircle } from "lucide-react";
import { clearClientSession, post, useSession } from "@/lib/client";
import { purposeTextLabel } from "@/lib/presentation";
import { formatSimulatedTime } from "@/shared/time";

export type Level = "NORMAL" | "WATCH" | "VERIFY" | "HOLD" | "CONTAIN";
export const LEVEL: Record<Level, { fg: string; bg: string; border: string; label: string }> = {
  NORMAL: { fg: "var(--level-normal)", bg: "var(--level-normal-tint)", border: "var(--level-normal-border)", label: "Normal" },
  WATCH: { fg: "var(--level-watch)", bg: "var(--level-watch-tint)", border: "var(--level-watch-border)", label: "Watch" },
  VERIFY: { fg: "var(--level-verify)", bg: "var(--level-verify-tint)", border: "var(--level-verify-border)", label: "Verify" },
  HOLD: { fg: "var(--level-hold)", bg: "var(--level-hold-tint)", border: "var(--level-hold-border)", label: "Hold" },
  CONTAIN: { fg: "var(--level-contain)", bg: "var(--level-contain-tint)", border: "var(--level-contain-border)", label: "Contain" },
};
export const levelOf = (l: string) => LEVEL[(l as Level) in LEVEL ? (l as Level) : "NORMAL"];

export function LevelChip({ level, size = "md" }: { level: string; size?: "md" | "lg" }) {
  const c = levelOf(level);
  return (
    <span className="chip" style={{ background: c.bg, color: c.fg, borderColor: c.border, height: size === "lg" ? 34 : 28, fontSize: size === "lg" ? 15 : 14 }}>
      {c.label}
    </span>
  );
}

export function PurposeChip({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`chip ${ok ? "ok" : "bad"}`}>{purposeTextLabel(label)}</span>;
}

export function Counter({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="counter">
      <div className="between muted small">
        <span>{label}</span>
        {icon}
      </div>
      <div className="v">{value}</div>
    </div>
  );
}

export function ShieldMark({ size = 28 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <Shield size={size * 0.6} color="currentColor" fill="currentColor" strokeWidth={1.5} />
    </span>
  );
}

const PERSONA_LABELS: Record<string, string> = {
  presenter: "Presenter",
  "operator-tunde": "Operator",
  "reviewer-ada": "Independent Reviewer",
  auditor: "Auditor",
};

export function TopBar() {
  const session = useSession();
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => { if (menuRef.current) menuRef.current.open = false; };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); menuRef.current?.querySelector("summary")?.focus(); } };
    const outside = (event: PointerEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) close(); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, []);
  const logout = async () => {
    await post("/api/auth/logout");
    clearClientSession();
    window.location.assign("/login");
  };
  const username = session?.principal.username ?? "";
  const persona = PERSONA_LABELS[username] ?? username;
  return (
    <header className="topbar">
      <Link href="/" className="wordmark">
        <ShieldMark />
        <span className="wordmark-copy"><strong>SENTRY</strong><span>Investigation workspace</span></span>
      </Link>
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        <details className="account-menu" ref={menuRef}>
          <summary aria-label={`Account menu for ${persona || "current account"}`}>
            <UserCircle size={18} /> <span>{persona || "Loading account…"}</span> <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <div className="account-menu-panel">
            <div className="account-menu-context"><span>Current role</span><strong>{persona || "Loading account…"}</strong></div>
            {session?.principal.auth_mode === "demo" && <Link href="/login?switch=1" onClick={() => { if (menuRef.current) menuRef.current.open = false; }}><Repeat2 size={16} /> Switch role</Link>}
            <button type="button" onClick={logout}><LogOut size={16} /> Sign out</button>
          </div>
        </details>
      </div>
    </header>
  );
}

const NAV = [
  { href: "/", label: "Console", icon: Monitor, match: (p: string) => p === "/" },
  { href: "/cases", label: "Cases", icon: FolderOpen, match: (p: string) => p.startsWith("/cases") || p.startsWith("/staff") },
  { href: "/tracer", label: "Tracer", icon: Network, match: (p: string) => p.startsWith("/tracer") },
  { href: "/metrics", label: "Metrics", icon: BarChart3, match: (p: string) => p.startsWith("/metrics") },
];

export function NavRail() {
  const path = usePathname() ?? "/";
  const session = useSession();
  if (session?.principal.capabilities.includes("ANSWER_OWN_ACTION") && !session.principal.capabilities.includes("READ_INVESTIGATIONS")) return (
    <nav className="rail">
      <Link href="/my-actions" className={path.startsWith("/my-actions") ? "active" : ""}>
        <ClipboardList size={22} strokeWidth={1.75} />
        My actions
      </Link>
    </nav>
  );
  if (!session?.principal.capabilities.includes("READ_INVESTIGATIONS")) return null;
  return (
    <nav className="rail">
      {NAV.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={href} className={match(path) ? "active" : ""}>
          <Icon size={22} strokeWidth={1.75} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Score steps over level bands, as in the case-view design. */
export function ScoreSteps({ points }: { points: { time: string; score: number; level: string }[] }) {
  const bands: Level[] = ["NORMAL", "WATCH", "VERIFY", "HOLD", "CONTAIN"];
  const ranges = ["0–14", "15–29", "30–59", "60–79", "80–100"];
  return (
    <div className="score-steps">
      <div className="score-bands">
        {bands.map((b, i) => (
          <div key={b} style={{ background: LEVEL[b].bg, color: LEVEL[b].fg, textAlign: "center", font: "600 12px Plus Jakarta Sans", padding: "6px 0", letterSpacing: "0.04em" }}>
            {ranges[i]} {LEVEL[b].label.toUpperCase()}
          </div>
        ))}
      </div>
      <div className="score-points" style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(78px, 1fr))` }}>
        <div style={{ position: "absolute", left: "8%", right: "8%", top: 34, height: 3, background: "var(--track)", borderRadius: 3 }} />
        {points.length === 0 && <div className="muted small">No scores yet</div>}
        {points.map((p, i) => {
          const c = levelOf(p.level);
          const last = i === points.length - 1;
          return (
            <div key={`${p.time}-${i}`} style={{ textAlign: "center", position: "relative" }}>
              <div className="jakarta" style={{ fontWeight: 800, fontSize: last ? 20 : 17, color: c.fg }}>{p.score}</div>
              <div style={{ width: last ? 20 : 14, height: last ? 20 : 14, borderRadius: 99, background: c.fg, margin: "4px auto 6px", boxShadow: last ? `0 0 0 6px ${c.bg}` : "none" }} />
              <div className="small">{formatSimulatedTime(p.time)}</div>
              <div style={{ font: "600 11px Plus Jakarta Sans", color: c.fg, letterSpacing: "0.05em" }}>{c.label.toUpperCase()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
