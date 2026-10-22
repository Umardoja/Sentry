export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { withRead } from "@/server/auth/request";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", async () => { const { id } = await params; return db().prepare("SELECT ts, score, level, step_id FROM risk_scores WHERE staff_id = ? ORDER BY id").all(id); }));
}
