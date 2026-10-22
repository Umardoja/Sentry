import { describe, expect, it } from "vitest";
import { addMinutes, compareIso, formatFull, formatTime } from "@/server/time";
describe("time", () =>
  it("uses Lagos ISO fields", () => {
    const value = "2026-10-16T21:47:00+01:00";
    expect(formatTime(value)).toBe("21:47");
    expect(formatFull(value)).toBe("Fri 16 Oct 2026 · 21:47");
    expect(addMinutes(value, 13)).toBe("2026-10-16T22:00:00+01:00");
    expect(compareIso(value, addMinutes(value, 1))).toBeLessThan(0);
  }));
