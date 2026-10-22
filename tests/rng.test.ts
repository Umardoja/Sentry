import { describe, expect, it } from "vitest";
import { Rng } from "@/server/rng";
describe("rng", () =>
  it("repeats a seed", () => {
    const a = new Rng(2026),
      b = new Rng(2026);
    expect([a.uniform(), a.int(1, 9), a.normal()]).toEqual([b.uniform(), b.int(1, 9), b.normal()]);
  }));
