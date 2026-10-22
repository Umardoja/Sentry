import "server-only";

import type { Check, PurposeStatus } from "./purpose";

export const RISK_REVIEW_POLICY_VERSION = "risk-review-v2";

export const CRITICAL_REVIEW_REASONS = {
  R1_ORIGINAL_MISSING: "Original transaction is absent from the simulator's declared complete source",
  R2_ORIGINAL_INELIGIBLE: "Original transaction is not an eligible failed debit or supported complaint",
  R3_AMOUNT_MISMATCH: "Requested reversal amount contradicts the original debit",
  R4_WRONG_BENEFICIARY: "Requested destination is not the debited account or the same customer",
  R5_DUPLICATE_REVERSAL: "A distinct posted reversal already references the original debit",
  V1_UNRELATED_RECORD_ACCESS: "Customer record access has no open case assigned to the staff team",
} as const;

export type CriticalReviewReason = keyof typeof CRITICAL_REVIEW_REASONS;
export type ReviewReasonCode = CriticalReviewReason | "SCORE_THRESHOLD";

export type PurposeReviewFact = {
  action_id: string;
  action_type: string;
  status: PurposeStatus | null;
  checks: Check[];
};

export type ReviewDecision = {
  policy_version: typeof RISK_REVIEW_POLICY_VERSION;
  required: boolean;
  outcome: "NO_REVIEW" | "REVIEW_REQUIRED";
  reason_codes: ReviewReasonCode[];
  critical_reason_codes: CriticalReviewReason[];
  action_ids: string[];
  score_threshold_met: boolean;
  source_assumption: "SIMULATOR_HEALTHY_COMPLETE";
};

const failed = (fact: PurposeReviewFact, code: string) => fact.checks.find((check) => check.code === code)?.passed === false;

/**
 * Review policy is deliberately separate from arithmetic scoring. Only canonical,
 * independently checked contradictions bypass the score threshold. Missing ticket
 * evidence and soft behavioural/identity indicators remain governed by the score.
 * R1/V1 are hard findings only under the local simulator's declared complete source.
 */
export function decideReview(score: number, facts: PurposeReviewFact[]): ReviewDecision {
  const critical = new Set<CriticalReviewReason>();
  const actionIds = new Set<string>();

  for (const fact of facts) {
    const before = critical.size;
    if (fact.action_type === "REVERSAL") {
      if (failed(fact, "R1")) {
        critical.add("R1_ORIGINAL_MISSING");
      } else {
        if (failed(fact, "R2")) critical.add("R2_ORIGINAL_INELIGIBLE");
        if (failed(fact, "R3")) critical.add("R3_AMOUNT_MISMATCH");
        if (failed(fact, "R4")) critical.add("R4_WRONG_BENEFICIARY");
        if (failed(fact, "R5")) critical.add("R5_DUPLICATE_REVERSAL");
      }
    } else if (fact.action_type === "RECORD_VIEW" && failed(fact, "V1")) {
      critical.add("V1_UNRELATED_RECORD_ACCESS");
    }
    if (critical.size > before) actionIds.add(fact.action_id);
  }

  const scoreThresholdMet = score >= 30;
  const criticalReasons = [...critical].sort();
  const reasonCodes: ReviewReasonCode[] = [...criticalReasons, ...(scoreThresholdMet ? ["SCORE_THRESHOLD" as const] : [])];
  return {
    policy_version: RISK_REVIEW_POLICY_VERSION,
    required: reasonCodes.length > 0,
    outcome: reasonCodes.length > 0 ? "REVIEW_REQUIRED" : "NO_REVIEW",
    reason_codes: reasonCodes,
    critical_reason_codes: criticalReasons,
    action_ids: [...actionIds].sort(),
    score_threshold_met: scoreThresholdMet,
    source_assumption: "SIMULATOR_HEALTHY_COMPLETE",
  };
}
