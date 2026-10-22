import "server-only";

export type Engine = "Purpose" | "Behaviour" | "Identity" | "Money" | "Leaks";
export type SignalDefinition = { engine: Engine; tiers: readonly number[]; label: string; kind: "money" | "data" | "other" };

/** The only home of signal codes, tiers and points (SPEC.md › Scoring, plus Upgrades v1.1). */
export const SIGNALS = {
  REVERSAL_NO_MATCH: { engine: "Purpose", tiers: [25, 45], label: "Reversal with no failed transaction", kind: "money" },
  REVERSAL_WRONG_BENEFICIARY: { engine: "Purpose", tiers: [20, 40], label: "Reversal credited to someone else", kind: "money" },
  REVERSAL_DUPLICATE: { engine: "Purpose", tiers: [15], label: "Duplicate reversal", kind: "money" },
  AMOUNT_MISMATCH: { engine: "Purpose", tiers: [10], label: "Reversal amount does not match", kind: "money" },
  RECORD_VIEW_NO_CASE: { engine: "Purpose", tiers: [20, 35], label: "Customer records viewed with no case", kind: "data" },
  BULK_EXPORT_NO_TICKET: { engine: "Purpose", tiers: [15], label: "Bulk export with no approved ticket", kind: "data" },
  LIMIT_CHANGE_NO_REQUEST: { engine: "Purpose", tiers: [15], label: "Limit change with no approved request", kind: "money" },
  POSTING_NO_APPROVAL: { engine: "Purpose", tiers: [20], label: "Manual posting with no approval", kind: "money" },
  PRIV_ACCESS_NO_TICKET: { engine: "Purpose", tiers: [20], label: "Privileged access with no change ticket", kind: "other" },
  TICKET_INVALID: { engine: "Purpose", tiers: [10], label: "Ticket given does not check out", kind: "other" },
  VOLUME_ANOMALY: { engine: "Behaviour", tiers: [6, 12], label: "Unusual volume for role", kind: "other" },
  OUTSIDE_ROSTER: { engine: "Behaviour", tiers: [5], label: "Outside rostered shift", kind: "other" },
  ON_LEAVE: { engine: "Identity", tiers: [25], label: "Activity while on approved leave", kind: "other" },
  NEW_TERMINAL: { engine: "Identity", tiers: [10], label: "Never-used terminal", kind: "other" },
  IMPOSSIBLE_LOCATION: { engine: "Identity", tiers: [15], label: "Logins from two branches at once", kind: "other" },
  AGENT_OUT_OF_SCOPE: { engine: "Identity", tiers: [15], label: "Outside the agent's declared scope", kind: "other" },
  NEW_BENEFICIARY_ACCOUNT: { engine: "Money", tiers: [13, 19], label: "Money sent to a brand-new account", kind: "money" },
  FAN_OUT: { engine: "Money", tiers: [17], label: "Money spreading to many accounts", kind: "money" },
  SHARED_IDENTIFIER: { engine: "Money", tiers: [15], label: "Beneficiary shares a phone or BVN with the user", kind: "money" },
  LEAK_COMMON_VIEWER: { engine: "Leaks", tiers: [35], label: "Viewed every customer in a scam cluster", kind: "data" },
} as const satisfies Record<string, SignalDefinition>;

export type SignalCode = keyof typeof SIGNALS;

/** Tie-break order for case-note facts that first appear at the same minute. */
export const FACT_ORDER: SignalCode[] = [
  "REVERSAL_NO_MATCH", "REVERSAL_WRONG_BENEFICIARY", "REVERSAL_DUPLICATE", "AMOUNT_MISMATCH",
  "RECORD_VIEW_NO_CASE", "BULK_EXPORT_NO_TICKET", "LIMIT_CHANGE_NO_REQUEST", "POSTING_NO_APPROVAL",
  "PRIV_ACCESS_NO_TICKET", "NEW_BENEFICIARY_ACCOUNT", "ON_LEAVE", "NEW_TERMINAL", "IMPOSSIBLE_LOCATION",
  "AGENT_OUT_OF_SCOPE", "OUTSIDE_ROSTER", "VOLUME_ANOMALY", "TICKET_INVALID", "FAN_OUT", "SHARED_IDENTIFIER",
  "LEAK_COMMON_VIEWER",
];

export function points(code: SignalCode, tier: number): number {
  const tiers = SIGNALS[code].tiers;
  return tiers[Math.min(tier, tiers.length) - 1]!;
}

export const LEVELS = ["NORMAL", "WATCH", "VERIFY", "HOLD", "CONTAIN"] as const;
export type Level = (typeof LEVELS)[number];

export function levelFor(score: number): Level {
  if (score >= 80) return "CONTAIN";
  if (score >= 60) return "HOLD";
  if (score >= 30) return "VERIFY";
  if (score >= 15) return "WATCH";
  return "NORMAL";
}

export function levelRank(level: string): number {
  return LEVELS.indexOf(level as Level);
}
