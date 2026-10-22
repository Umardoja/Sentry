import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { corpus } from "../evaluation/pass4/corpus";
import { evaluateEpisode } from "../evaluation/pass4/evaluator";
import { confusion, dedupeFindings, groupByFamily, ratio, type EpisodeResult } from "../evaluation/pass4/metrics";

const row = (overrides: Partial<EpisodeResult>): EpisodeResult => ({
  id: "EVAL-X", family: "family", seed: 1, target: "LEGITIMATE", status: "OK", reason: null,
  outputs: { A_PURPOSE: { review: false, recommendation: "NO_REVIEW", score: null, findings: [] } },
  ...overrides,
});

describe("pass 4 evaluation accounting", () => {
  it("uses N/A for undefined ratios and preserves exact denominators", () => {
    expect(ratio(0, 0)).toBeNull();
    const results = [
      row({ id: "tp", target: "REVIEW_WARRANTED", outputs: { A_PURPOSE: { review: true, recommendation: "VERIFY", score: null, findings: [] } } }),
      row({ id: "fn", target: "REVIEW_WARRANTED" }),
      row({ id: "fp", target: "LEGITIMATE", outputs: { A_PURPOSE: { review: true, recommendation: "VERIFY", score: null, findings: [] } } }),
      row({ id: "tn", target: "LEGITIMATE" }),
    ];
    expect(confusion(results, "A_PURPOSE")).toMatchObject({ tp: 1, fn: 1, fp: 1, tn: 1, precision: 0.5, recall: 0.5, false_positive_rate: 0.5 });
  });

  it("accounts for unsupported episodes separately and supported errors as misses", () => {
    const results = [
      row({ id: "unsupported", target: "INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED", status: "UNSUPPORTED", outputs: {} }),
      row({ id: "error", target: "REVIEW_WARRANTED", status: "ERROR", outputs: {} }),
    ];
    expect(confusion(results, "A_PURPOSE")).toMatchObject({ tp: 0, fn: 1, fp: 0, tn: 0, supported_errors: 1, precision: null, recall: 0 });
  });

  it("groups episodes without multiplying them and deduplicates identical findings", () => {
    const results = [row({ id: "one", family: "a" }), row({ id: "two", family: "a" }), row({ id: "three", family: "b" })];
    expect(groupByFamily(results, "A_PURPOSE").map((group) => [group.family, group.count])).toEqual([["a", 2], ["b", 1]]);
    expect(dedupeFindings([
      { code: "X", source_refs: ["A"], traceable: true },
      { code: "X", source_refs: ["A"], traceable: true },
      { code: "X", source_refs: ["B"], traceable: true },
    ])).toHaveLength(2);
  });

  it("freezes 12 development and 72 evaluation episodes with six unsupported", () => {
    const rows = corpus();
    expect(rows.filter((episode) => episode.split === "development")).toHaveLength(12);
    expect(rows.filter((episode) => episode.split === "evaluation")).toHaveLength(72);
    expect(rows.filter((episode) => episode.split === "evaluation" && !episode.supported)).toHaveLength(6);
  });

  it("is reproducible and does not read is_malicious as a detector input", () => {
    const input = corpus().find((episode) => episode.input.family === "wrong_destination_genuine_ticket")!.input;
    const first = evaluateEpisode(input, join(tmpdir(), `sentry-eval-repro-a-${process.pid}.db`));
    const second = evaluateEpisode(input, join(tmpdir(), `sentry-eval-repro-b-${process.pid}.db`));
    expect(first.final).toEqual(second.final);
    expect(first.hiddenLabelInvariant).toBe(true);
    expect(first.final.A_PURPOSE.review).toBe(true);
    expect(first.final.D_FULL_SENTRY.review).toBe(false);
    expect(first.first?.D_FULL_SENTRY).toEqual(first.final.D_FULL_SENTRY);
  });
});

