export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { json } from "@/server/services/http";

export function GET() {
  return json({ ok: true });
}
