export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { consoleView } from "@/server/services/read";
import { withRead } from "@/server/auth/request";
import { projectForPrincipal } from "@/server/auth/policy";
import { liveTick } from "@/server/sim/live";

export function GET(request: Request) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", (principal) => {
    const flagged = new URL(request.url).searchParams.get("flagged") === "1";
    const d = db();
    // When the Presenter has live activity on, each refresh ingests the events due since the last one.
    liveTick(d, Date.now());
    return projectForPrincipal(principal, consoleView(d, flagged));
  }));
}
