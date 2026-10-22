import { describe, expect, it } from "vitest";
import falseAlarmResult from "../evaluation/results/false-alarms.json";
import { formatSimulatedTime } from "@/shared/time";

describe("judge-facing deployment artifacts", () => {
  it("ships the measured false-alarm result with internally consistent totals", () => {
    expect(falseAlarmResult.rows).toHaveLength(5);
    expect(falseAlarmResult.rows.reduce((sum, row) => sum + row.events, 0)).toBe(100);
    expect(falseAlarmResult.rows.reduce((sum, row) => sum + row.cleared, 0)).toBe(100);
    expect(falseAlarmResult.rows.reduce((sum, row) => sum + row.false_alerts, 0)).toBe(0);
  });

  it("uses the declared judge-facing simulated timestamp format", () => {
    expect(formatSimulatedTime("2026-10-16T22:15:00+01:00")).toBe("Fri 16 Oct · 22:15 (simulated)");
  });
});
