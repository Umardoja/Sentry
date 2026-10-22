import { describe, expect, it } from "vitest";
import { purposeCheckDisplay, purposeCheckLabel, purposeStatusLabel, purposeTextLabel, reviewReasonLabel, reviewReasonSentence, signalLabel } from "@/lib/presentation";
import { formatSimulatedTime } from "@/shared/time";

describe("plain-language presentation labels", () => {
  it("keeps raw domain values unchanged while presenting readable labels", () => {
    expect(purposeStatusLabel("WRONG_BENEFICIARY")).toBe("Refund destination doesn't match");
    expect(purposeTextLabel("Matched")).toBe("Reason verified");
    expect(purposeCheckLabel("R4")).toBe("Refund destination matches");
    expect(purposeCheckDisplay("R4", false)).toBe("Refund went to a different account");
    expect(signalLabel("FAN_OUT", "fallback")).toBe("Transfers to multiple accounts");
    expect(reviewReasonLabel("R4_WRONG_BENEFICIARY")).toContain("doesn't match");
  });

  it("formats judge-facing simulated times and review reasons consistently", () => {
    expect(formatSimulatedTime("2026-10-16T21:47:00+01:00")).toBe("Fri 16 Oct · 21:47 (simulated)");
    expect(reviewReasonSentence(["R4_WRONG_BENEFICIARY", "SCORE_THRESHOLD"])).toBe("refund destination doesn't match the debited customer and risk score reached the review threshold");
  });
});

