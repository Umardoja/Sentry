"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, Presentation, ScrollText, UserRound } from "lucide-react";
import { ShieldMark } from "@/components";
import { clearClientSession, getSession, post, primeClientSession, type ClientSession } from "@/lib/client";
import { roleDescription, roleLabel } from "@/lib/presentation";

type Persona = { id: "presenter" | "operator" | "reviewer" | "auditor"; label: string; roles: string[]; capabilities: string[]; description: string };
type Mode = { demo_mode: boolean; personas: Persona[] };
const PERSONA_META = {
  presenter: { icon: Presentation, kicker: "Lead the investigation" },
  operator: { icon: UserRound, kicker: "Explain your action" },
  reviewer: { icon: ClipboardCheck, kicker: "Review independently" },
  auditor: { icon: ScrollText, kicker: "Inspect the record" },
};
let modeCache: Mode | null = null;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(modeCache);
  const [selected, setSelected] = useState<Persona["id"] | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // "Switch to <role>" links pre-select that role, so entering takes one click.
  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get("role");
    if (role && role in PERSONA_META) setSelected(role as Persona["id"]);
  }, []);
  useEffect(() => {
    if (modeCache) return;
    void fetch("/api/auth/mode", { cache: "no-store" }).then((response) => response.json()).then((value: Mode) => {
      modeCache = value;
      setMode(value);
    });
  }, []);

  const enterDemo = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    // A switch already has a cached session; a fresh visitor performs one
    // session probe so the server can enforce CSRF when a cookie is present.
    // A persona switch rotates the server session. Always refresh the current
    // cookie-bound CSRF token instead of trusting a cached pre-navigation copy.
    await getSession(true);
    const response = await post<Partial<ClientSession> & { detail?: string }>("/api/auth/demo", { persona: selected });
    if (!response.ok || !response.data.principal) { setError("Unable to open the workspace. Please try again."); setBusy(false); return; }
    clearClientSession();
    if (response.data.csrf_token && response.data.expires_at_ms) {
      primeClientSession({ principal: response.data.principal, csrf_token: response.data.csrf_token, expires_at_ms: response.data.expires_at_ms });
    }
    router.replace(response.data.principal.capabilities.includes("READ_INVESTIGATIONS") ? "/" : "/my-actions");
  };

  const passwordLogin = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-SENTRY-REQUEST": "1" }, body: JSON.stringify({ username, password }) });
    if (!response.ok) { setError("Sign-in failed"); setBusy(false); return; }
    const result = await response.json() as { principal: { capabilities: string[] } };
    clearClientSession(); router.replace(result.principal.capabilities.includes("READ_INVESTIGATIONS") ? "/" : "/my-actions");
  };

  if (!mode) return <div className="card loading-card" style={{ maxWidth: 520, margin: "10vh auto", padding: 32 }} role="status">Loading accounts…</div>;
  if (!mode.demo_mode) return <div className="card" style={{ maxWidth: 440, margin: "10vh auto", padding: 32 }}>
    <div className="row"><ShieldMark size={36} /><h1>SENTRY investigation workspace</h1></div>
    <p className="muted">Sign in with your provisioned account.</p>
    <form className="stack" onSubmit={passwordLogin}>
      <label>Username<input className="input" autoComplete="username" value={username} maxLength={128} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Password<input className="input" type="password" autoComplete="current-password" value={password} maxLength={128} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <div style={{ color: "var(--zenith-red)" }}>{error}</div>}
      <button className="btn red lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  </div>;

  const selectedPersona = mode.personas.find((persona) => persona.id === selected);
  return <div className="login-shell">
    <header className="login-hero">
      <div className="login-brand"><ShieldMark size={44} /><span><strong>SENTRY</strong><small>Investigation workspace</small></span></div>
      <span className="login-eyebrow">Purpose-bound investigation</span>
      <h1>Sign in to SENTRY</h1>
      <p>Choose your role</p>
    </header>
    <section className="card login-card" aria-labelledby="role-accounts-heading">
      <div className="between login-card-heading">
        <div><h2 id="role-accounts-heading">Available roles</h2><p className="muted">No password or registration required.</p></div>
      </div>
      <div className="persona-grid">
        {mode.personas.map((persona) => {
          const MetaIcon = PERSONA_META[persona.id].icon;
          const active = selected === persona.id;
          return <button key={persona.id} type="button" className={`persona-card ${active ? "selected" : ""}`} onClick={() => setSelected(persona.id)} aria-pressed={active}>
            <span className="persona-card-top"><span className="persona-icon"><MetaIcon size={20} /></span>{active && <span className="persona-check" aria-label="Selected"><Check size={15} /></span>}</span>
            <span className="persona-title">{roleLabel(persona.id)}</span>
            <span className="persona-kicker">{PERSONA_META[persona.id].kicker}</span>
            <span className="muted small">{roleDescription(persona.id, persona.description)}</span>
          </button>;
        })}
      </div>
      {error && <div className="login-error" role="alert">{error}</div>}
      <div className="login-submit-row">
        <div className="selected-account" aria-live="polite">{selectedPersona ? <><strong>{roleLabel(selectedPersona.id)}</strong><span>{roleDescription(selectedPersona.id, selectedPersona.description)}</span></> : <span>Select a role to continue</span>}</div>
        <button className="btn red lg login-submit" disabled={!selected || busy} onClick={enterDemo} aria-live="polite">{busy ? "Preparing workspace…" : "Open workspace"}</button>
      </div>
    </section>
    <aside className="login-disclaimer">Sandbox environment · sample bank data</aside>
  </div>;
}
