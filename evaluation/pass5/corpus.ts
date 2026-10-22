export type TargetLabel = "LEGITIMATE" | "REVIEW_WARRANTED" | "INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED";
export type Split = "development" | "evaluation";

export const SUPPORTED_FAMILIES = [
  "routine_reversal",
  "same_customer_alternate_destination",
  "successful_original_with_complaint",
  "approved_overtime",
  "assigned_record_access",
  "legitimate_new_terminal",
  "legitimate_outside_roster",
  "wrong_destination_genuine_ticket",
  "amount_mismatch",
  "missing_original_complete_source",
  "ineligible_original",
  "distinct_duplicate",
  "single_unrelated_record_access",
  "valid_purpose_identity_concern",
  "repeated_genuine_ticket",
] as const;

export type SupportedFamily = (typeof SUPPORTED_FAMILIES)[number];
export type Family = SupportedFamily | "source_unavailable";
export type EpisodeInput = { family: Family; seed: number; neutral_id: string };
export type CorpusEpisode = {
  id: string; split: Split; target: TargetLabel; rationale: string;
  supported: boolean; unsupported_reason: string | null; input: EpisodeInput;
};

const policies: Record<Family, { target: TargetLabel; rationale: string; supported: boolean; unsupported: string | null }> = {
  routine_reversal: { target: "LEGITIMATE", rationale: "A failed debit is reversed to its debited account for the same amount during rostered work.", supported: true, unsupported: null },
  same_customer_alternate_destination: { target: "LEGITIMATE", rationale: "The destination is a different account canonically owned by the same customer, which current R4 explicitly permits.", supported: true, unsupported: null },
  successful_original_with_complaint: { target: "LEGITIMATE", rationale: "A successful original transaction has a prior complaint, satisfying the current R2 exception, with matching amount and destination.", supported: true, unsupported: null },
  approved_overtime: { target: "LEGITIMATE", rationale: "Matched reversals occur outside roster inside independently approved overtime.", supported: true, unsupported: null },
  assigned_record_access: { target: "LEGITIMATE", rationale: "The viewed customer has an open service request assigned to the actor's team before access.", supported: true, unsupported: null },
  legitimate_new_terminal: { target: "LEGITIMATE", rationale: "One otherwise valid rostered action from an unfamiliar terminal is an indicator, not sufficient review evidence under this policy.", supported: true, unsupported: null },
  legitimate_outside_roster: { target: "LEGITIMATE", rationale: "One otherwise valid action outside roster is unusual but alone does not establish a critical contradiction.", supported: true, unsupported: null },
  wrong_destination_genuine_ticket: { target: "REVIEW_WARRANTED", rationale: "A genuine ticket supports the transaction but does not authorize another customer's destination.", supported: true, unsupported: null },
  amount_mismatch: { target: "REVIEW_WARRANTED", rationale: "The requested amount contradicts the canonical original debit.", supported: true, unsupported: null },
  missing_original_complete_source: { target: "REVIEW_WARRANTED", rationale: "No original exists under the explicitly healthy and complete local simulator-source assumption.", supported: true, unsupported: null },
  ineligible_original: { target: "REVIEW_WARRANTED", rationale: "The original succeeded and has no complaint, so it is not eligible under current R2.", supported: true, unsupported: null },
  distinct_duplicate: { target: "REVIEW_WARRANTED", rationale: "A distinct earlier posted reversal already references the same original debit.", supported: true, unsupported: null },
  single_unrelated_record_access: { target: "REVIEW_WARRANTED", rationale: "A customer record is accessed without an open case assigned to the actor's team under the complete-source assumption.", supported: true, unsupported: null },
  valid_purpose_identity_concern: { target: "REVIEW_WARRANTED", rationale: "Purpose is valid but activity occurs on approved leave from a never-used terminal.", supported: true, unsupported: null },
  repeated_genuine_ticket: { target: "REVIEW_WARRANTED", rationale: "Repeated genuine support must not erase the independent destination contradiction.", supported: true, unsupported: null },
  source_unavailable: { target: "INSUFFICIENT_EVIDENCE_OR_UNSUPPORTED", rationale: "The product cannot represent source unavailability separately from no row.", supported: false, unsupported: "No source-status boundary exists; unavailability cannot be evaluated without fabricating evidence." },
};

function episode(split: Split, ordinal: number, family: Family, seed: number): CorpusEpisode {
  const policy = policies[family];
  const id = `${split === "development" ? "P5DEV" : "P5EVAL"}-${String(ordinal).padStart(3, "0")}`;
  return { id, split, target: policy.target, rationale: policy.rationale, supported: policy.supported, unsupported_reason: policy.unsupported, input: { family, seed, neutral_id: id } };
}

export function corpus(): CorpusEpisode[] {
  const development = ([...SUPPORTED_FAMILIES, "source_unavailable"] as Family[]).map((family, index) => episode("development", index + 1, family, 6101 + index));
  const evaluation: CorpusEpisode[] = [];
  let ordinal = 1;
  for (const family of [...SUPPORTED_FAMILIES, "source_unavailable"] as Family[]) {
    for (let offset = 0; offset < 4; offset++) evaluation.push(episode("evaluation", ordinal++, family, 7201 + offset));
  }
  return [...development, ...evaluation];
}
