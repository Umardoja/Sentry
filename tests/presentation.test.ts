import { describe, expect, it } from "vitest";
import { purposeCheckLabel, purposeStatusLabel, purposeTextLabel, reviewReasonLabel, signalLabel } from "@/lib/presentation";

describe("plain-language presentation labels", () => {
  it("keeps raw domain values unchanged while presenting readable labels", () => {
    expect(purposeStatusLabel("WRONG_BENEFICIARY")).toBe("Refund destination doesn't match");
    expect(purposeTextLabel("Matched")).toBe("Reason verified");
    expect(purposeCheckLabel("R4")).toBe("Refund destination matches");
    expect(signalLabel("FAN_OUT", "fallback")).toBe("Transfers to multiple accounts");
    expect(reviewReasonLabel("R4_WRONG_BENEFICIARY")).toContain("doesn't match");
  });
});

