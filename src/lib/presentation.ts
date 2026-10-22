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
  R1_ORIGINAL_MISSING: "Original transaction is missing from the complete available records",
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
  FAN_OUT: "Transfers to many accounts",
  SHARED_IDENTIFIER: "Beneficiary shares an identifier with the user",
  LEAK_COMMON_VIEWER: "Viewed every customer in the reported group",
  CALL_OUTSIDE_CONSENT: "Call outside the customer's consent",
  CONSENT_REVOKED_OR_EXPIRED: "Call after consent ended",
  LOOKUP_WITHOUT_BUSINESS: "Many lookups, almost no real transactions",
  KEY_MULTI_NETWORK: "One key used from many networks",
  SEQUENTIAL_ENUMERATION: "Accounts looked up in sequence",
  PARTNER_VOLUME_ANOMALY: "Unusual volume for this partner",
};

export const purposeStatusLabel = (status: string) => PURPOSE_STATUS[status] ?? status.replaceAll("_", " ").toLowerCase();
export const purposeTextLabel = (label: string) => PURPOSE_TEXT[label] ?? label;
export const purposeCheckLabel = (code: string) => CHECK_LABELS[code] ?? code;
export const purposeCheckDisplay = (code: string, passed: boolean) => passed ? purposeCheckLabel(code) : FAILED_CHECK_LABELS[code] ?? purposeCheckLabel(code);
export const reviewReasonLabel = (code: string) => REVIEW_REASONS[code] ?? code;
export const signalLabel = (code: string, fallback: string) => SIGNAL_LABELS[code] ?? fallback;

const RISK_LEVEL_LABELS: Record<string, string> = {
  NORMAL: "Normal",
  WATCH: "Watch",
  VERIFY: "Needs review",
  HOLD: "Hold",
  CONTAIN: "Contained",
};

const ROLE_LABELS: Record<string, string> = {
  presenter: "Investigation Lead",
  Presenter: "Investigation Lead",
  "operator-tunde": "Operations Officer",
  operator: "Operations Officer",
  "reviewer-ada": "Reviewer",
  reviewer: "Reviewer",
  auditor: "Auditor",
  "ACC-PRESENTER": "Investigation Lead",
  "ACC-OP-TUNDE": "Operations Officer",
  "ACC-REV-ADA": "Reviewer",
  "ACC-AUDITOR": "Auditor",
  SENTRY_SIMULATOR: "SENTRY",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  presenter: "Guide the investigation and run scenario steps.",
  operator: "Explain assigned actions and request scoped access.",
  reviewer: "Review evidence and decide responses independently.",
  auditor: "Inspect cases, decisions and audit records.",
};

/** Definition shown with the "Cleared automatically" counter on Console and Metrics. */
export const CLEARED_AUTOMATICALLY_HINT = "Unusual actions cleared with a valid reason: actions outside the rostered shift that approved overtime covered and whose reason check passed.";

export const riskLevelLabel = (level: string) => RISK_LEVEL_LABELS[level] ?? level.replaceAll("_", " ").toLowerCase();
export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;
export const roleDescription = (role: string, fallback: string) => ROLE_DESCRIPTIONS[role] ?? fallback;
export const riskLevelForScore = (score: number) => score >= 80 ? "CONTAIN" : score >= 60 ? "HOLD" : score >= 30 ? "VERIFY" : score >= 15 ? "WATCH" : "NORMAL";

const SCENARIO_STEP_LABELS: Record<string, string> = {
  "Score verified ticket; destination mismatch remains": "Recalculate risk after the verified ticket; destination mismatch remains",
  "Beneficiaries try to fan out to 31 accounts": "Beneficiaries try to transfer to 31 accounts",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  DEMO_ENTER: "Signed in",
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  UNMASK: "Name revealed",
  IDENTITY_REVEAL: "Name revealed",
  INTERVENTION_PENDING_APPROVAL: "Response sent for approval",
  INTERVENTION_APPROVED: "Response approved",
  INTERVENTION_REJECTED: "Response rejected",
  APPROVE: "Response approved",
  REJECT: "Response rejected",
  DECISION_STALE: "Outdated response rejected",
  RUN_TRACER: "Data leak trace run",
  BVN_WATCHLIST: "BVN watchlist updated",
  PARTNER_CASE_OPENED: "Partner case opened",
  PARTNER_RESPONSE_APPLIED: "Partner key rate-limited",
  PARTNER_RESPONSE_PROPOSED: "Key suspension sent for approval",
  PARTNER_CASE_JUSTIFIED: "Partner case closed as justified",
  LIVE_DESK_OPENED: "Evening operations desk opened",
  LIVE_ON: "Live activity switched on",
  LIVE_OFF: "Live activity switched off",
};

const KEY_STATUS_LABELS: Record<string, string> = { ACTIVE: "Active", RATE_LIMITED: "Rate-limited", SUSPENDED: "Suspended" };
const PARTNER_RESPONSE_LABELS: Record<string, string> = { RATE_LIMIT_KEY: "Rate-limit key", SUSPEND_KEY: "Suspend key" };
const PARTNER_CHECK_STATUS: Record<string, string> = { MATCHED: "Within consent", OUTSIDE_CONSENT: "Outside consent", CONSENT_ENDED: "Consent ended" };
const CALL_RESULT_LABELS: Record<string, string> = { ALLOWED: "Allowed", RATE_LIMITED: "Rate-limited (429)", BLOCKED: "Blocked (403)" };

export const keyStatusLabel = (status: string) => KEY_STATUS_LABELS[status] ?? status;
export const partnerResponseLabel = (type: string) => PARTNER_RESPONSE_LABELS[type] ?? type;
export const partnerCheckStatusLabel = (status: string) => PARTNER_CHECK_STATUS[status] ?? status;
export const callResultLabel = (status: string) => CALL_RESULT_LABELS[status] ?? status;

export const scenarioStepLabel = (label: string) => Object.entries(SCENARIO_STEP_LABELS)
  .reduce((shown, [internal, display]) => shown.replace(internal, display), label);
export const auditActionLabel = (action: string) => AUDIT_ACTION_LABELS[action] ?? action.replaceAll("_", " ").toLowerCase().replace("intervention", "response");
export const presentationMessage = (message: string | undefined, fallback: string) => (message ?? fallback)
  .replaceAll("simulation run", "scenario")
  .replaceAll("simulated control", "response")
  .replaceAll("synthetic workspace", "workspace");

export function reviewReasonSentence(codes: string[]): string {
  const labels = codes.map(reviewReasonLabel).map((label) => label.charAt(0).toLowerCase() + label.slice(1));
  if (labels.length < 2) return labels[0] ?? "the current evidence needs review";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

