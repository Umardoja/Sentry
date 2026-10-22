"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export const REFRESH = "sentry:refresh";

export function refreshAll() {
  window.dispatchEvent(new Event(REFRESH));
}

export type ClientPrincipal = { account_id: string; username: string; staff_id: string | null; roles: string[]; capabilities: string[]; workspace_id?: string | null; auth_mode?: "password" | "demo" };
export type ClientSession = { principal: ClientPrincipal; csrf_token: string; expires_at_ms: number };
let sessionCache: ClientSession | null = null;
let sessionRequest: Promise<ClientSession | null> | null = null;
let clientGeneration = 0;
const sessionListeners = new Set<() => void>();
const pollRequests = new Map<string, Promise<{ ok: boolean; status: number; data: unknown }>>();
const viewCache = new Map<string, unknown>();

const publishSession = () => sessionListeners.forEach((listener) => listener());

export async function getSession(force = false): Promise<ClientSession | null> {
  if (sessionCache && !force) return sessionCache;
  if (sessionRequest) return sessionRequest;
  sessionRequest = (async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    sessionCache = response.ok ? await response.json() as ClientSession : null;
    publishSession();
    return sessionCache;
  })().finally(() => { sessionRequest = null; });
  return sessionRequest;
}

export function clearClientSession() {
  sessionCache = null;
  clientGeneration++;
  pollRequests.clear();
  viewCache.clear();
  publishSession();
}

/** Seeds the in-memory session cache only from a successful server-issued auth response. */
export function primeClientSession(session: ClientSession) {
  sessionCache = session;
  publishSession();
}

export function useSession() {
  const session = useSyncExternalStore(
    (listener) => { sessionListeners.add(listener); return () => sessionListeners.delete(listener); },
    () => sessionCache,
    () => null,
  );
  useEffect(() => {
    if (!sessionCache) void getSession(true);
  }, []);
  return session;
}

export async function post<T = unknown>(url: string, body: unknown = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const session = await getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-SENTRY-REQUEST": "1" };
  if (session) headers["X-CSRF-Token"] = session.csrf_token;
  const res = await fetch(url, { method: "POST", credentials: "same-origin", headers, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T;
  viewCache.clear();
  refreshAll();
  return { ok: res.ok, status: res.status, data };
}

/** Polls a JSON endpoint and refreshes immediately whenever any mutation happens. */
export function usePoll<T>(url: string | null, ms = 2000): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(() => url && viewCache.has(url) ? viewCache.get(url) as T : null);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const load = useCallback(async () => {
    if (!url || loading.current) return;
    loading.current = true;
    const generation = clientGeneration;
    try {
      let request = pollRequests.get(url);
      if (!request) {
        request = fetch(url, { cache: "no-store", credentials: "same-origin" }).then(async (response) => ({
          ok: response.ok,
          status: response.status,
          data: await response.json().catch(() => ({})),
        }));
        pollRequests.set(url, request);
        void request.then(
          () => { if (pollRequests.get(url) === request) pollRequests.delete(url); },
          () => { if (pollRequests.get(url) === request) pollRequests.delete(url); },
        );
      }
      const result = await request;
      if (generation !== clientGeneration) return;
      if (!result.ok) {
        if (result.status === 401 && window.location.pathname !== "/login") window.location.assign("/login");
        if (result.status === 403) {
          const session = await getSession();
          if (session?.principal.capabilities.includes("ANSWER_OWN_ACTION") && !session.principal.capabilities.includes("READ_INVESTIGATIONS") && window.location.pathname !== "/my-actions") window.location.assign("/my-actions");
        }
        setError((result.data as { detail?: string }).detail ?? `HTTP ${result.status}`);
        return;
      }
      viewCache.set(url, result.data);
      setData(result.data as T);
      setError(null);
    } catch (e) {
      if (generation !== clientGeneration) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loading.current = false;
    }
  }, [url]);
  useEffect(() => {
    setData(url && viewCache.has(url) ? viewCache.get(url) as T : null);
    void load();
    const id = setInterval(() => void load(), ms);
    const on = () => void load();
    window.addEventListener(REFRESH, on);
    return () => {
      clearInterval(id);
      window.removeEventListener(REFRESH, on);
    };
  }, [load, ms, url]);
  return { data, error, reload: () => void load() };
}

export const naira = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `₦${n.toLocaleString("en-US")}`);
export const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));
