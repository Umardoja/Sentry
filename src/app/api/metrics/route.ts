export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { existsSync, readFileSync } from "node:fs";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { caseList, metrics } from "@/server/services/read";
import { withRead } from "@/server/auth/request";
import { projectForPrincipal } from "@/server/auth/policy";

export function GET(request: Request) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", (principal) => {
    const d = db();
    const fa = existsSync("data/false-alarms.json") ? JSON.parse(readFileSync("data/false-alarms.json", "utf8")) : null;
    return projectForPrincipal(principal, { ...metrics(d), cases: caseList(d), false_alarm_test: fa });
  }));
}
