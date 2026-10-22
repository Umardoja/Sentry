import "server-only";
import { NextResponse } from "next/server";
import { GateError } from "../sim/player";
import { AccessError } from "../auth/policy";
import { ZodError } from "zod";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, private", ...headers } });
}

export async function handle(fn: () => unknown | Promise<unknown>) {
  try {
    const data = await fn();
    if (data instanceof Response) return data;
    if (data === null || data === undefined) return json({ detail: "not found" }, 404);
    return json(data);
  } catch (error) {
    if (error instanceof AccessError) return json({ detail: error.message, code: error.code }, error.status);
    if (error instanceof ZodError) return json({ detail: "invalid request", issues: error.issues }, 400);
    if (error instanceof GateError) return json({ detail: error.message }, 409);
    const message = error instanceof Error ? error.message : String(error);
    return json({ detail: message }, 500);
  }
}
