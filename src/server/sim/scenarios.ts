import "server-only";

export type StepDef = { id: string; scenario: string; label: string; sim_time: string; focus: string };

/** The only home of scenario steps (SPEC.md › Synthetic data and scenarios, plus Upgrades v1.1). */
export const STEPS: StepDef[] = [
  { id: "S1.1", scenario: "S1 · Late overtime", label: "Ngozi posts 60 reversals on approved overtime", sim_time: "2026-10-16T21:10:00+01:00", focus: "/" },
  { id: "S2.0", scenario: "S2 · Reversal diversion", label: "Tunde on a normal Monday", sim_time: "2026-10-16T21:10:00+01:00", focus: "/staff/STF-0101" },
  { id: "S2.1", scenario: "S2 · Reversal diversion", label: "Reversal of a real failed debit, credited to someone else", sim_time: "2026-10-16T21:47:00+01:00", focus: "/cases/CASE-0001" },
  { id: "S2.2", scenario: "S2 · Reversal diversion", label: "Score verified ticket; destination mismatch remains", sim_time: "2026-10-16T21:48:00+01:00", focus: "/cases/CASE-0001" },
  { id: "S2.3", scenario: "S2 · Reversal diversion", label: "Five more reversals to brand-new accounts", sim_time: "2026-10-16T21:53:00+01:00", focus: "/" },
  { id: "S2.4", scenario: "S2 · Reversal diversion", label: "Beneficiaries try to fan out to 31 accounts", sim_time: "2026-10-16T21:58:00+01:00", focus: "/cases/CASE-0001?tab=graph" },
  { id: "S3.1", scenario: "S3 · Stolen login", label: "Bisi's login on a new terminal while on leave", sim_time: "2026-10-16T22:05:00+01:00", focus: "/cases/CASE-0002" },
  { id: "S3.2", scenario: "S3 · Stolen login", label: "12 record views with no case", sim_time: "2026-10-16T22:06:00+01:00", focus: "/cases/CASE-0002" },
  { id: "S3.3", scenario: "S3 · Stolen login", label: "48 more record views with no case", sim_time: "2026-10-16T22:08:00+01:00", focus: "/cases/CASE-0002" },
  { id: "S3.4", scenario: "S3 · Stolen login", label: "Bulk export of 5,000 customer rows", sim_time: "2026-10-16T22:10:00+01:00", focus: "/cases/CASE-0002" },
  { id: "S4.1", scenario: "S4 · Scam calls", label: "Trace the scam caller back to staff", sim_time: "2026-10-16T22:15:00+01:00", focus: "/tracer" },
];

/** S2.4 destination banks (fictional): count of outside accounts and attempted total per bank. */
export const FAN_OUT_BANKS = [
  { bank: "Bank A", accounts: 5, total: 1_150_000 },
  { bank: "Bank B", accounts: 8, total: 1_420_000 },
  { bank: "Bank C", accounts: 6, total: 980_000 },
  { bank: "Bank D", accounts: 4, total: 740_000 },
  { bank: "Bank E", accounts: 5, total: 895_000 },
  { bank: "Bank F", accounts: 3, total: 650_000 },
];
