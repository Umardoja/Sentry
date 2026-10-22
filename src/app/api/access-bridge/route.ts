import { withPrincipal } from "@/server/auth/request";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { accessBridgeView } from "@/server/services/accessBridge";

export function GET(request: Request) {
  return handle(() => withPrincipal(request, (principal) => accessBridgeView(db(), principal)));
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
