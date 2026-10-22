import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { corpus } from "../evaluation/pass5/corpus";
import { evaluateEpisode } from "../evaluation/pass5/evaluator";
import { confusion, ratio, type EpisodeResult } from "../evaluation/pass5/metrics";

describe("Pass 5 evaluation harness", () => {
  it("uses explicit denominator and undefined-ratio rules", () => {
    expect(ratio(0, 0)).toBeNull();
    const rows: EpisodeResult[] = [
      { id: "1", family: "x", seed: 1, target: "REVIEW_WARRANTED", status: "OK", reason: null, outputs: { D_FULL_SENTRY: { review: true, recommendation: "REVIEW_REQUIRED", score: 20, findings: [] } } },
      { id: "2", family: "x", seed: 2, target: "LEGITIMATE", status: "OK", reason: null, outputs: { D_FULL_SENTRY: { review: false, recommendation: "NO_REVIEW", score: 10, findings: [] } } },
      { id: "3", family: "x", seed: 3, target: "INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED", status: "UNSUPPORTED", reason: "unsupported", outputs: {} },
    ];
    expect(confusion(rows, "D_FULL_SENTRY")).toMatchObject({ tp: 1, fn: 0, fp: 0, tn: 1, supported_errors: 0 });
  });

  it("predeclares distinct development and held-out cohorts", () => {
    const rows = corpus();
    expect(rows.filter((row) => row.split === "development")).toHaveLength(16);
    expect(rows.filter((row) => row.split === "evaluation")).toHaveLength(64);
    expect(rows.filter((row) => row.split === "evaluation" && row.supported)).toHaveLength(60);
    expect(rows.filter((row) => row.split === "evaluation" && !row.supported)).toHaveLength(4);
    expect(new Set(rows.filter((row) => row.split === "evaluation").map((row) => row.input.seed))).toEqual(new Set([7201, 7202, 7203, 7204]));
  });

  it("keeps hidden labels out and reports reason-based review without score inflation", () => {
    const input = { family: "wrong_destination_genuine_ticket" as const, seed: 6108, neutral_id: "P5DEV-CHECK" };
    const first = evaluateEpisode(input, join(tmpdir(), `sentry-pass5-eval-a-${process.pid}.db`));
    const second = evaluateEpisode(input, join(tmpdir(), `sentry-pass5-eval-b-${process.pid}.db`));
    expect(first).toEqual(second);
    expect(first.hiddenLabelInvariant).toBe(true);
    expect(first.final.D_FULL_SENTRY).toMatchObject({ review: true, recommendation: "REVIEW_REQUIRED", score: 20, reason_codes: ["R4_WRONG_BENEFICIARY"] });
    expect(first.final.D_FULL_SENTRY.findings.map((finding) => finding.code)).toContain("REVERSAL_WRONG_BENEFICIARY");
  });
});
