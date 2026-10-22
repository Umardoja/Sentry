export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { existsSync } from "node:fs";
import { db } from "@/server/services/demo";
import { handle, json } from "@/server/services/http";
import { requireIngestKey } from "@/server/services/ingest";
import { ingestPartnerCalls } from "@/server/services/partners";
import { runInWorkspace, workspaceDatabasePath } from "@/server/services/workspace";
import { demoModeEnabled } from "@/server/config";
import { partnerCallBatchSchema } from "@/shared/schemas";

/** Machine-to-machine ingest of partner API calls, authorised by the same X-Ingest-Key as staff events. */
export async function POST(request: Request) {
  return handle(async () => {
    requireIngestKey(request);
    const batch = partnerCallBatchSchema.parse(await request.json().catch(() => null));
    const workspace = batch.workspace_id ?? null;
    if (!workspace && demoModeEnabled()) return json({ detail: "workspace_id is required in demo mode" }, 400);
    if (workspace && (!demoModeEnabled() || !existsSync(workspaceDatabasePath(workspace)))) return json({ detail: "unknown workspace" }, 404);
    return runInWorkspace(workspace, () => ingestPartnerCalls(db(), batch.calls));
  });
}
