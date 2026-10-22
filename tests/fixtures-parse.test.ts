import { expect, it } from "vitest";
import { case0001, case0002, console2153, consoleNgozi, leakTracer, metrics } from "@/lib/fixtures";
import {
  caseDetailSchema,
  graphSchema,
  metricsSchema,
  riskRowSchema,
  simStateSchema,
} from "@/shared/schemas";
it("parses fixtures", () => {
  simStateSchema.parse({ ...console2153, run_id: "00000000-0000-4000-8000-000000000001", waiting_for_operator_action_id: null });
  riskRowSchema.parse(consoleNgozi);
  caseDetailSchema.parse(case0001);
  caseDetailSchema.parse(case0002);
  graphSchema.parse(leakTracer);
  expect(metricsSchema.parse(metrics).transfers_blocked).toBe(31);
});
