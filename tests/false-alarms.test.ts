import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { falseAlarmRun } from "@/server/sim/falseAlarms";

describe("false-alarm test", () => {
  it("20 unusual but legitimate events on seed 1 raise no case", () => {
    const r = falseAlarmRun(1, join(tmpdir(), `sentry-fa-test-${process.pid}.db`));
    expect(r.events).toBe(20);
    expect(r.false_alerts).toBe(0);
  }, 180_000);
});
