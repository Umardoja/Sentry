import { describe, expect, it } from "vitest";
import { maskAccount, pseudonym } from "@/server/privacy";
describe("privacy", () => {
  it("uses overrides", () => expect(pseudonym("STF-0101")).toBe("Staff-7F3A"));
  it("uses v1.1 leak tracer overrides", () => {
    expect(pseudonym("STF-0389")).toBe("Staff-B4E0");
    expect(pseudonym("STF-0390")).toBe("Staff-1C07");
    expect(pseudonym("STF-0391")).toBe("Staff-6D3F");
    expect(pseudonym("STF-0392")).toBe("Staff-A912");
    expect(pseudonym("STF-0393")).toBe("Staff-E58B");
  });
  it("hashes other identifiers", () =>
    expect(pseudonym("STF-9999")).toMatch(/^Staff-[0-9A-F]{4}$/));
  it("masks accounts", () => expect(maskAccount("1234567890")).toBe("••••7890"));
});
