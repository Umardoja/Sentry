import { expect, it } from "vitest";
import { healthSchema, streamEventSchema } from "@/shared/schemas";
it("parses shared contracts", () => {
  expect(healthSchema.parse({ ok: true }).ok).toBe(true);
  expect(
    streamEventSchema.parse({
      type: "sim.step",
      id: 1,
      sim_ts: "2026-10-16T21:47:00+01:00",
      data: {},
    }).id,
  ).toBe(1);
});
