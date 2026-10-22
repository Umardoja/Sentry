export type TargetLabel = "LEGITIMATE" | "REVIEW_WARRANTED" | "INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED";
export type Split = "development" | "evaluation";

export const SUPPORTED_FAMILIES = [
  "routine_reversal",
  "approved_overtime",
  "wrong_destination_genuine_ticket",
  "amount_mismatch",
  "missing_original",
  "distinct_duplicate",
  "assigned_record_access",
  "unrelated_record_access",
  "valid_purpose_identity_concern",
  "legitimate_new_terminal",
  "repeated_genuine_ticket",
] as const;

export type SupportedFamily = (typeof SUPPORTED_FAMILIES)[number];
export type Family = SupportedFamily | "source_unavailable";

export type EpisodeInput = {
  family: Family;
  seed: number;
  neutral_id: string;
};

export type CorpusEpisode = {
  id: string;
  split: Split;
  target: TargetLabel;
  rationale: string;
  supported: boolean;
  unsupported_reason: string | null;
  input: EpisodeInput;
};

const policies: Record<Family, { target: TargetLabel; rationale: string; supported: boolean; unsupported: string | null }> = {
  routine_reversal: { target: "LEGITIMATE", rationale: "A failed debit is reversed for the same customer, for the same amount, during the rostered shift.", supported: true, unsupported: null },
  approved_overtime: { target: "LEGITIMATE", rationale: "A high but matched reversal workload occurs inside independently approved overtime.", supported: true, unsupported: null },
  wrong_destination_genuine_ticket: { target: "REVIEW_WARRANTED", rationale: "A genuine failed debit and genuine ticket do not authorize crediting another customer's account.", supported: true, unsupported: null },
  amount_mismatch: { target: "REVIEW_WARRANTED", rationale: "The reversal amount contradicts the canonical original debit.", supported: true, unsupported: null },
  missing_original: { target: "REVIEW_WARRANTED", rationale: "Under the declared healthy and complete synthetic source assumption, no eligible original debit exists.", supported: true, unsupported: null },
  distinct_duplicate: { target: "REVIEW_WARRANTED", rationale: "A distinct earlier posted reversal already references the same original debit.", supported: true, unsupported: null },
  assigned_record_access: { target: "LEGITIMATE", rationale: "The customer's open service request is assigned to the actor's team before access.", supported: true, unsupported: null },
  unrelated_record_access: { target: "REVIEW_WARRANTED", rationale: "The actor views multiple customer records without an assigned open case.", supported: true, unsupported: null },
  valid_purpose_identity_concern: { target: "REVIEW_WARRANTED", rationale: "The reversal is valid, but an active session appears during approved leave from a never-used terminal.", supported: true, unsupported: null },
  legitimate_new_terminal: { target: "LEGITIMATE", rationale: "One rostered, otherwise valid action from a new terminal is an indicator, not sufficient evidence for review under this protocol.", supported: true, unsupported: null },
  repeated_genuine_ticket: { target: "REVIEW_WARRANTED", rationale: "Repeating genuine ticket evidence must not erase an independent wrong-destination contradiction.", supported: true, unsupported: null },
  source_unavailable: { target: "INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED", rationale: "The current application cannot represent source unavailability separately from a healthy query returning no row.", supported: false, unsupported: "No source-status injection boundary exists; absence must not be relabelled as an outage." },
};

function episode(split: Split, ordinal: number, family: Family, seed: number): CorpusEpisode {
  const policy = policies[family];
  const prefix = split === "development" ? "DEV" : "EVAL";
  const id = `${prefix}-${String(ordinal).padStart(3, "0")}`;
  return {
    id,
    split,
    target: policy.target,
    rationale: policy.rationale,
    supported: policy.supported,
    unsupported_reason: policy.unsupported,
    input: { family, seed, neutral_id: id },
  };
}

export function corpus(): CorpusEpisode[] {
  const developmentFamilies: Family[] = [...SUPPORTED_FAMILIES, "wrong_destination_genuine_ticket"];
  const development = developmentFamilies.map((family, index) => episode("development", index + 1, family, 3101 + index));
  const evaluation: CorpusEpisode[] = [];
  let ordinal = 1;
  for (const family of [...SUPPORTED_FAMILIES, "source_unavailable"] as Family[]) {
    for (let offset = 0; offset < 6; offset++) {
      evaluation.push(episode("evaluation", ordinal++, family, 4101 + offset));
    }
  }
  return [...development, ...evaluation];
}

