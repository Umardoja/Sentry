import { expect, it } from "vitest";
import { healthSchema } from "@/shared/schemas";
it("has health contract", () => expect(healthSchema.parse({ ok: true })).toEqual({ ok: true }));
