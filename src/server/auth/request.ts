import "server-only";
import type Database from "better-sqlite3";
import { AUTH_ALLOW_INSECURE_LOOPBACK, AUTH_DB_PATH, APP_ORIGIN } from "../config";
import { AccessError, type Capability, type VerifiedPrincipal, requireCapability } from "./policy";
import { openAuthDatabase, sessionFromToken } from "./store";
import { runInWorkspace } from "../services/workspace";

export const SESSION_COOKIE = "sentry_session";
const holder = globalThis as unknown as { sentryAuthDb?: Database.Database; sentryAuthPath?: string };

function config() {
  if (!AUTH_DB_PATH || !APP_ORIGIN) throw new AccessError(403, "authentication is not configured");
  let origin: URL;
  try { origin = new URL(APP_ORIGIN); } catch { throw new AccessError(403, "authentication origin is invalid"); }
  const loopback = origin.hostname === "127.0.0.1" || origin.hostname === "localhost";
  if (origin.protocol !== "https:" && !(loopback && AUTH_ALLOW_INSECURE_LOOPBACK)) throw new AccessError(403, "insecure authentication origin is not allowed");
  return { authPath: AUTH_DB_PATH, origin: origin.origin, secure: origin.protocol === "https:" };
}

export function authDb(): Database.Database {
  const { authPath } = config();
  if (holder.sentryAuthDb && holder.sentryAuthPath === authPath) return holder.sentryAuthDb;
  holder.sentryAuthDb?.close();
  holder.sentryAuthDb = openAuthDatabase(authPath);
  holder.sentryAuthPath = authPath;
  return holder.sentryAuthDb;
}

export function closeAuthDb(): void {
  holder.sentryAuthDb?.close();
  holder.sentryAuthDb = undefined;
  holder.sentryAuthPath = undefined;
}

function cookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionForRequest(request: Request) {
  return sessionFromToken(authDb(), cookie(request, SESSION_COOKIE));
}

export function requirePrincipal(request: Request): VerifiedPrincipal {
  const session = sessionForRequest(request);
  if (!session) throw new AccessError(401, "authentication required");
  return session.principal;
}

export function requireRead(request: Request, capability: Capability): VerifiedPrincipal {
  const principal = requirePrincipal(request);
  requireCapability(principal, capability);
  return principal;
}

export function requireMutation(request: Request, capability: Capability): VerifiedPrincipal {
  const principal = requireAuthenticatedMutation(request);
  requireCapability(principal, capability);
  return principal;
}

export function requireAuthenticatedMutation(request: Request): VerifiedPrincipal {
  const session = sessionForRequest(request);
  if (!session) throw new AccessError(401, "authentication required");
  const { origin } = config();
  if (request.headers.get("origin") !== origin || request.headers.get("x-sentry-request") !== "1") throw new AccessError(403, "request origin rejected");
  if (request.headers.get("x-csrf-token") !== session.csrf_token) throw new AccessError(403, "CSRF validation failed");
  return session.principal;
}

export function requireLoginRequest(request: Request): void {
  const { origin } = config();
  if (request.headers.get("origin") !== origin || request.headers.get("x-sentry-request") !== "1") throw new AccessError(403, "request origin rejected");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new AccessError(403, "JSON request required");
}

export function withPrincipal<T>(request: Request, operation: (principal: VerifiedPrincipal) => T): T {
  const principal = requirePrincipal(request);
  return runInWorkspace(principal.workspace_id, () => operation(principal));
}

export function withRead<T>(request: Request, capability: Capability, operation: (principal: VerifiedPrincipal) => T): T {
  const principal = requireRead(request, capability);
  return runInWorkspace(principal.workspace_id, () => operation(principal));
}

export function withMutation<T>(request: Request, capability: Capability, operation: (principal: VerifiedPrincipal) => T): T {
  const principal = requireMutation(request, capability);
  return runInWorkspace(principal.workspace_id, () => operation(principal));
}

export function sessionCookie(token: string, expiresAtMs: number): string {
  const { secure } = config();
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(): string {
  const { secure } = config();
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
