export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { existsSync } from "node:fs";
import { db } from "@/server/services/demo";
import { handle, json } from "@/server/services/http";
import { ingestEvents, requireIngestKey } from "@/server/services/ingest";
import { runInWorkspace, workspaceDatabasePath } from "@/server/services/workspace";
import { demoModeEnabled } from "@/server/config";
import { ingestBatchSchema } from "@/shared/schemas";

/** Machine-to-machine ingest of synthetic staff events, authorised by X-Ingest-Key. */
export async function POST(request: Request) {
  return handle(async () => {
    requireIngestKey(request);
    const batch = ingestBatchSchema.parse(await request.json().catch(() => null));
    const workspace = batch.workspace_id ?? null;
    // A batch may target an existing visitor workspace, never create one.
    if (workspace && (!demoModeEnabled() || !existsSync(workspaceDatabasePath(workspace)))) return json({ detail: "unknown workspace" }, 404);
    return runInWorkspace(workspace, () => ingestEvents(db(), batch.events));
  });
}
