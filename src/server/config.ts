import "server-only";
export const SEED = 2026;
export const LLM_MODE = (process.env.LLM_MODE ?? "cache") as "off" | "cache" | "live";
export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";
export const PSEUDONYM_SALT = process.env.PSEUDONYM_SALT ?? "sentry-demo-salt";
export const DB_PATH = process.env.DB_PATH ?? "data/sentry.db";
export const AUTH_DB_PATH = process.env.AUTH_DB_PATH ?? null;
export const APP_ORIGIN = process.env.APP_ORIGIN ?? null;
export const AUTH_ALLOW_INSECURE_LOOPBACK = process.env.AUTH_ALLOW_INSECURE_LOOPBACK === "1";
export const demoModeEnabled = () => process.env.SENTRY_DEMO_MODE === "1";
export const DEMO_WORKSPACE_ROOT = process.env.DEMO_WORKSPACE_ROOT ?? null;
/** Concurrent visitor workspaces; at the cap the least recently used one is retired first. */
export const DEMO_WORKSPACE_MAX = Number(process.env.DEMO_WORKSPACE_MAX ?? "40");
/** A visitor workspace unused for this long is deleted on the next demo entry. */
export const DEMO_WORKSPACE_TTL_HOURS = Number(process.env.DEMO_WORKSPACE_TTL_HOURS ?? "6");
/** Shared secret for POST /api/ingest/events. Read per request; ingest is refused while unset. */
export const ingestKey = () => process.env.INGEST_KEY || null;
export const ACCESS_BRIDGE_TTL_MINUTES = Number(process.env.ACCESS_BRIDGE_TTL_MINUTES ?? "10");
export const PSEUDONYM_OVERRIDES: Record<string, string> = {
  "STF-0101": "Staff-7F3A",
  "STF-0388": "Staff-2C91",
  "STF-0042": "Staff-91D2",
  "STF-0389": "Staff-B4E0",
  "STF-0390": "Staff-1C07",
  "STF-0391": "Staff-6D3F",
  "STF-0392": "Staff-A912",
  "STF-0393": "Staff-E58B",
};
