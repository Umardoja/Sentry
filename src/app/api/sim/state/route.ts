export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { simState } from "@/server/services/read";
import { withPrincipal } from "@/server/auth/request";

export function GET(request: Request) {
  return handle(() => withPrincipal(request, () => simState(db())));
}
