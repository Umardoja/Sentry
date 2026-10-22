export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { json } from "@/server/services/http";

export function POST() {
  return json({ detail: "HTTP rehearsal is disabled; use the isolated local CLI rehearsal" }, 410);
}
