export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { handle } from "@/server/services/http";
import { withMutation } from "@/server/auth/request";
import { revealIdentity } from "@/server/services/secureActions";
import { unmaskRequestSchema } from "@/shared/schemas";
import { db } from "@/server/services/demo";
import { authDb } from "@/server/auth/request";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(() => withMutation(request, "REVEAL_IDENTITY", async (principal) => {
    const { id } = await params;
    const body = unmaskRequestSchema.parse(await request.json().catch(() => null));
    return revealIdentity(db(), authDb(), id, principal, body.run_id, body.reason);
  }));
}
