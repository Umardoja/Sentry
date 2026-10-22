export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import falseAlarmResult from "../../../../evaluation/results/false-alarms.json";
import { db } from "@/server/services/demo";
import { handle } from "@/server/services/http";
import { caseList, metrics } from "@/server/services/read";
import { withRead } from "@/server/auth/request";
import { projectForPrincipal } from "@/server/auth/policy";

export function GET(request: Request) {
  return handle(() => withRead(request, "READ_INVESTIGATIONS", (principal) => {
    const d = db();
    return projectForPrincipal(principal, { ...metrics(d), cases: caseList(d), false_alarm_test: falseAlarmResult });
  }));
}
