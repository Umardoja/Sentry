import "server-only";
import type Database from "better-sqlite3";
import { FACT_ORDER, type SignalCode } from "../engines/signals";

export type Fact = { id: string; code: SignalCode; statement: string; evidence: string[] };
export type NoteSentence = { text: string; evidence: string[] };
export type Note = { sentences: NoteSentence[]; recommendation: string; source: "TEMPLATE" | "LLM" | "CACHE" };
type SignalRow = { code: SignalCode; effective_points: number; first_ts: string; action_ids: string; evidence: string };

const hm = (ts: unknown) => String(ts).slice(11, 16);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function statement(code: SignalCode, e: Record<string, unknown>): string {
  const n = Number(e.count ?? 0);
  switch (code) {
    case "REVERSAL_WRONG_BENEFICIARY":
      return n === 1 ? "1 reversal did not return money to the debited customer." : `${n} reversals did not return money to the debited customers.`;
    case "REVERSAL_NO_MATCH":
      return `${n} ${plural(n, "reversal had", "reversals had")} no failed transaction behind ${plural(n, "it", "them")}.`;
    case "REVERSAL_DUPLICATE":
      return `${n} ${plural(n, "reversal repeated", "reversals repeated")} an earlier reversal.`;
    case "AMOUNT_MISMATCH":
      return `${n} ${plural(n, "reversal did", "reversals did")} not match the failed amount.`;
    case "NEW_BENEFICIARY_ACCOUNT": {
      const all = Number(e.credited) === n;
      if (n === 1) return all ? "The credited account was opened in the last 7 days." : "1 credited account was opened in the last 7 days.";
      return all ? `All ${n} credited accounts were opened in the last 7 days.` : `${n} credited accounts were opened in the last 7 days.`;
    }
    case "OUTSIDE_ROSTER":
      return n <= 1 || hm(e.first) === hm(e.last)
        ? `Posted at ${hm(e.first)}, outside the user's rostered shift.`
        : `All posted ${hm(e.first)} to ${hm(e.last)}, outside the user's rostered shift.`;
    case "TICKET_INVALID": {
      const failed = (e.failed as string[] | undefined) ?? [];
      return failed.includes("T1") ? `Ticket number entered at ${hm(e.ts)} does not exist.` : `Ticket entered at ${hm(e.ts)} does not check out (${failed.join(", ")}).`;
    }
    case "FAN_OUT": {
      const sent = Number(e.sent ?? 0);
      return sent === 0
        ? `Beneficiaries tried to send to ${e.destinations} accounts at ${hm(e.ts)}; stopped by the hold.`
        : `Beneficiaries sent to ${e.destinations} accounts at ${hm(e.ts)}; ${sent} transfers left the bank.`;
    }
    case "ON_LEAVE":
      return `The user logged in at ${hm(e.ts)} while on approved leave.`;
    case "NEW_TERMINAL":
      return `The login came from terminal ${e.terminal}, which the user has never used.`;
    case "RECORD_VIEW_NO_CASE":
      return `${n} customer records were viewed with no open case.`;
    case "BULK_EXPORT_NO_TICKET": {
      const rows = ((e.rows as { rows?: number }[] | undefined) ?? []).reduce((s, r) => s + (r.rows ?? 0), 0);
      return `A bulk export of ${rows.toLocaleString("en-US")} customer rows had no approved ticket${e.blocked ? "; it was blocked" : ""}.`;
    }
    case "VOLUME_ANOMALY":
      return `${e.count} ${String(e.type).toLowerCase().replace("_", " ")}s today, well above peers in the same role.`;
    case "LEAK_COMMON_VIEWER":
      return `The user viewed the records of all ${e.victims} customers who reported scam calls from ${e.caller}.`;
    case "SHARED_IDENTIFIER":
      return "A credited account shares a phone number with the user.";
    case "AGENT_OUT_OF_SCOPE":
      return "The agent attempted an action outside its declared scope.";
    default:
      return `${code.replaceAll("_", " ").toLowerCase()}.`;
  }
}

export function buildFacts(db: Database.Database, staffId: string): Fact[] {
  const rows = db.prepare("SELECT code, effective_points, first_ts, action_ids, evidence FROM signals WHERE staff_id = ? AND effective_points > 0").all(staffId) as SignalRow[];
  rows.sort((a, b) => a.first_ts.localeCompare(b.first_ts) || FACT_ORDER.indexOf(a.code) - FACT_ORDER.indexOf(b.code));
  return rows.map((r, i) => {
    const evidence = JSON.parse(r.evidence) as Record<string, unknown>;
    const ids = JSON.parse(r.action_ids) as string[];
    const accounts = (evidence.accounts as string[] | undefined) ?? [];
    return { id: `F${i + 1}`, code: r.code, statement: statement(r.code, evidence), evidence: ids.length ? ids : accounts };
  });
}

export function recommendation(level: string, kinds: { money: boolean; data: boolean; leak: boolean }): string {
  if (level === "CONTAIN") return kinds.money ? "Recommended: suspend session, keep hold, escalate to Internal Control." : "Recommended: suspend session, keep data restriction, escalate to Information Security.";
  if (level === "HOLD") return kinds.money ? "Recommended: approve the funds hold and keep the second approver on." : "Recommended: keep data access restricted and review the session.";
  if (kinds.leak) return "Recommended: review the user's recent record views and restrict data access.";
  return "Recommended: wait for the user's reason; escalate if it does not check out.";
}

export function templateNote(facts: Fact[], rec: string): Note {
  return {
    source: "TEMPLATE",
    sentences: [...facts.map((f) => ({ text: f.statement, evidence: f.evidence })), { text: rec, evidence: [] }, { text: "Analyst decision required.", evidence: [] }],
    recommendation: rec,
  };
}
