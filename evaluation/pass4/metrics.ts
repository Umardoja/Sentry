import type { TargetLabel } from "./corpus";

export type Configuration = "A_PURPOSE" | "B_BEHAVIOUR_IDENTITY" | "C_SIMPLE_UNION" | "D_FULL_SENTRY";
export const CONFIGURATIONS: Configuration[] = ["A_PURPOSE", "B_BEHAVIOUR_IDENTITY", "C_SIMPLE_UNION", "D_FULL_SENTRY"];

export type Finding = { code: string; source_refs: string[]; traceable: boolean };
export type ConfigurationOutput = {
  review: boolean;
  recommendation: "NO_REVIEW" | "VERIFY" | "HOLD" | "CONTAIN";
  score: number | null;
  findings: Finding[];
};

export type EpisodeResult = {
  id: string;
  family: string;
  seed: number;
  target: TargetLabel;
  status: "OK" | "ERROR" | "UNSUPPORTED";
  reason: string | null;
  outputs: Partial<Record<Configuration, ConfigurationOutput>>;
  first_outputs?: Partial<Record<Configuration, ConfigurationOutput>>;
  hidden_label_invariant?: boolean;
};

export type Confusion = {
  tp: number; fn: number; fp: number; tn: number;
  legitimate_review_burden: number;
  supported_errors: number;
  precision: number | null;
  recall: number | null;
  false_positive_rate: number | null;
};

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function confusion(results: EpisodeResult[], configuration: Configuration): Confusion {
  let tp = 0, fn = 0, fp = 0, tn = 0, supportedErrors = 0;
  for (const row of results) {
    if (row.target === "INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED") continue;
    const output = row.outputs[configuration];
    if (row.status !== "OK" || !output) {
      supportedErrors++;
      if (row.target === "REVIEW_WARRANTED") fn++;
      continue;
    }
    if (row.target === "REVIEW_WARRANTED") output.review ? tp++ : fn++;
    else output.review ? fp++ : tn++;
  }
  return {
    tp, fn, fp, tn,
    legitimate_review_burden: fp,
    supported_errors: supportedErrors,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    false_positive_rate: ratio(fp, fp + tn),
  };
}

export function groupByFamily(results: EpisodeResult[], configuration: Configuration) {
  const groups = new Map<string, EpisodeResult[]>();
  for (const row of results) groups.set(row.family, [...(groups.get(row.family) ?? []), row]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([family, rows]) => ({ family, count: rows.length, confusion: confusion(rows, configuration) }));
}

export function evidenceCoverage(results: EpisodeResult[], configuration: Configuration) {
  const findings = results.flatMap((row) => row.outputs[configuration]?.findings ?? []);
  const traceable = findings.filter((finding) => finding.traceable).length;
  return { findings: findings.length, traceable, rate: ratio(traceable, findings.length) };
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  return findings.filter((finding, index, all) =>
    all.findIndex((other) => other.code === finding.code && other.source_refs.join("|") === finding.source_refs.join("|")) === index,
  );
}

