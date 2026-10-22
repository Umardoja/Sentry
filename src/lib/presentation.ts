const PURPOSE_STATUS: Record<string, string> = {
  MATCHED: "Reason verified",
  WRONG_BENEFICIARY: "Refund destination doesn't match",
  DUPLICATE: "Already reversed",
  NO_MATCH: "Original transaction not verified",
  NO_CASE: "No assigned customer case",
  PARTIAL: "More evidence needed",
  INVALID: "Ticket couldn't be verified",
};

const PURPOSE_TEXT: Record<string, string> = {
  Matched: "Reason verified",
  "Credited to someone else": "Refund destination doesn't match",
  Duplicate: "Already reversed",
  "No case": "No assigned customer case",
  Partial: "More evidence needed",
  "Ticket valid": "Ticket verified",
  "Ticket does not check out": "Ticket couldn't be verified",
};

const CHECK_LABELS: Record<string, string> = {
  R1: "Original transaction found",
  R2: "Original transaction is eligible",
  R3: "Refund amount matches",
  R4: "Refund destination matches",
  R5: "No earlier reversal found",
  V1: "Customer has an assigned open case",
  E1: "Approved export ticket found",
};

const FAILED_CHECK_LABELS: Record<string, string> = {
  R1: "Original transaction wasn't found",
  R2: "Original transaction isn't eligible for reversal",
  R3: "Refund amount doesn't match",
  R4: "Refund went to a different account",
  R5: "An earlier reversal already exists",
  V1: "Customer has no assigned open case",
  E1: "Approved export ticket wasn't found",
};

const REVIEW_REASONS: Record<string, string> = {
  R1_ORIGINAL_MISSING: "Original transaction is missing from the complete sample records",
  R2_ORIGINAL_INELIGIBLE: "Original transaction is not eligible for reversal",
  R3_AMOUNT_MISMATCH: "Refund amount doesn't match the original debit",
  R4_WRONG_BENEFICIARY: "Refund destination doesn't match the debited customer",
  R5_DUPLICATE_REVERSAL: "A different posted reversal already exists",
  V1_UNRELATED_RECORD_ACCESS: "Customer record has no assigned open case",
  SCORE_THRESHOLD: "Risk score reached the review threshold",
};

const SIGNAL_LABELS: Record<string, string> = {
  REVERSAL_NO_MATCH: "Original failed transaction not found",
  REVERSAL_WRONG_BENEFICIARY: "Refund destination doesn't match",
  REVERSAL_DUPLICATE: "Possible duplicate reversal",
  AMOUNT_MISMATCH: "Refund amount doesn't match",
  RECORD_VIEW_NO_CASE: "Customer record viewed without an assigned case",
  BULK_EXPORT_NO_TICKET: "Bulk export has no approved ticket",
  LIMIT_CHANGE_NO_REQUEST: "Limit change has no approved request",
  POSTING_NO_APPROVAL: "Manual posting has no approval",
  PRIV_ACCESS_NO_TICKET: "Privileged access has no change ticket",
  TICKET_INVALID: "Ticket couldn't be verified",
  VOLUME_ANOMALY: "Unusual activity volume for this role",
  OUTSIDE_ROSTER: "Activity outside the rostered shift",
  ON_LEAVE: "Activity while on approved leave",
  NEW_TERMINAL: "First use of this terminal",
  IMPOSSIBLE_LOCATION: "Concurrent logins from different branches",
  AGENT_OUT_OF_SCOPE: "Activity outside the assigned scope",
  NEW_BENEFICIARY_ACCOUNT: "Money sent to a newly opened account",
  FAN_OUT: "Transfers to multiple accounts",
  SHARED_IDENTIFIER: "Beneficiary shares an identifier with the user",
  LEAK_COMMON_VIEWER: "Viewed every customer in the reported group",
};

export const purposeStatusLabel = (status: string) => PURPOSE_STATUS[status] ?? status.replaceAll("_", " ").toLowerCase();
export const purposeTextLabel = (label: string) => PURPOSE_TEXT[label] ?? label;
export const purposeCheckLabel = (code: string) => CHECK_LABELS[code] ?? code;
export const purposeCheckDisplay = (code: string, passed: boolean) => passed ? purposeCheckLabel(code) : FAILED_CHECK_LABELS[code] ?? purposeCheckLabel(code);
export const reviewReasonLabel = (code: string) => REVIEW_REASONS[code] ?? code;
export const signalLabel = (code: string, fallback: string) => SIGNAL_LABELS[code] ?? fallback;

export function reviewReasonSentence(codes: string[]): string {
  const labels = codes.map(reviewReasonLabel).map((label) => label.charAt(0).toLowerCase() + label.slice(1));
  if (labels.length < 2) return labels[0] ?? "the current evidence needs review";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

