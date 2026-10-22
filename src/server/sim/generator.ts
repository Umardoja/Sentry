import "server-only";
import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { SEED } from "../config";
import { pseudonym } from "../privacy";
import { Rng } from "../rng";
import { addDays, addMinutes, at, weekday } from "../time";

export const FIRST_DAY = "2026-09-17";
export const LAST_DAY = "2026-10-16";
export const DAYS: string[] = Array.from({ length: 30 }, (_, i) => addDays(FIRST_DAY, i));

const BRANCHES = ["Aster", "Baobab", "Cedar", "Dune", "Ember", "Falcon", "Grove", "Harbor", "Indigo", "Juniper"];
const CITIES = ["Lagos", "Abuja", "Ibadan", "Kano", "Enugu", "Port Harcourt", "Benin City", "Aba", "Jos", "Kaduna"];
export const BASELINE_BANK = "Atlas Credit";

export const CHARACTERS = {
  approver: "STF-0007",
  ngozi: "STF-0042",
  tunde: "STF-0101",
  bisi: "STF-0388",
  kemi: "STF-0389",
  otherViewers: ["STF-0390", "STF-0391", "STF-0392", "STF-0393"],
  agent: "STF-0901",
} as const;
const FIXED = new Set<string>([
  CHARACTERS.approver, CHARACTERS.ngozi, CHARACTERS.tunde, CHARACTERS.bisi, CHARACTERS.kemi, ...CHARACTERS.otherViewers,
]);

export const S2_ACCOUNTS = [
  { id: "ACC-N1", no: "9900003301", opened: "2026-10-13" },
  { id: "ACC-N2", no: "9900003302", opened: "2026-10-11" },
  { id: "ACC-N3", no: "9900003303", opened: "2026-10-14" },
  { id: "ACC-N4", no: "9900003304", opened: "2026-10-10" },
  { id: "ACC-N5", no: "9900003305", opened: "2026-10-15" },
  { id: "ACC-N6", no: "9900003306", opened: "2026-10-12" },
];
export const S2_FAILED_DEBITS = [
  { id: "TXN-58213", account: "ACC-004512", amount: 850_000, ts: "2026-10-16T21:31:00+01:00" },
  { id: "TXN-58219", account: "ACC-001207", amount: 1_200_000, ts: "2026-10-16T21:33:00+01:00" },
  { id: "TXN-58224", account: "ACC-002388", amount: 640_000, ts: "2026-10-16T21:35:00+01:00" },
  { id: "TXN-58230", account: "ACC-003019", amount: 975_000, ts: "2026-10-16T21:38:00+01:00" },
  { id: "TXN-58236", account: "ACC-003870", amount: 1_450_000, ts: "2026-10-16T21:40:00+01:00" },
  { id: "TXN-58241", account: "ACC-004166", amount: 720_000, ts: "2026-10-16T21:42:00+01:00" },
];
export const VICTIMS = [
  { n: 1, no: "3000002210", city: "Aba", reported: "2026-10-14T09:12:00+01:00", kemi: "2026-10-12T10:05:00+01:00", other: "STF-0390", otherTs: "2026-10-12T14:20:00+01:00" },
  { n: 2, no: "3000007781", city: "Kano", reported: "2026-10-14T13:40:00+01:00", kemi: "2026-10-12T11:30:00+01:00", other: "STF-0391", otherTs: "2026-10-13T09:45:00+01:00" },
  { n: 3, no: "3000000954", city: "Ibadan", reported: "2026-10-15T11:05:00+01:00", kemi: "2026-10-13T15:10:00+01:00", other: "STF-0392", otherTs: "2026-10-14T10:30:00+01:00" },
  { n: 4, no: "3000004419", city: "Lagos", reported: "2026-10-15T18:22:00+01:00", kemi: "2026-10-14T09:40:00+01:00", other: "STF-0393", otherTs: "2026-10-14T16:05:00+01:00" },
  { n: 5, no: "3000006632", city: "Enugu", reported: "2026-10-16T08:45:00+01:00", kemi: "2026-10-14T13:15:00+01:00", other: null, otherTs: null },
] as const;
const NAMES: Record<string, string> = { "STF-0042": "Ngozi E.", "STF-0101": "Tunde O.", "STF-0388": "Bisi A.", "STF-0389": "Kemi L.", "STF-0007": "Femi K." };
export const SCAM_CALLER = "0700-000-0555";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const bvn = (s: string) => `BVN-${createHash("sha256").update(s).digest("hex").slice(0, 12)}`;
const hm = (minutes: number) => `${pad(Math.floor(minutes / 60), 2)}:${pad(minutes % 60, 2)}`;

type Role = "CUSTOMER_SERVICE" | "BRANCH_OPS" | "OPS_REVERSALS" | "OPS_EPRODUCTS" | "IT_ADMIN" | "INTERNAL_CONTROL";
type Member = { id: string; role: Role; terminals: string[] };

export type GeneratorCounts = Record<string, number>;

/** Writes 30 days of raw synthetic activity. It never writes purpose results, signals or scores. */
export function generateBaseline(db: Database.Database, seed = SEED): GeneratorCounts {
  const rng = new Rng(seed);
  const counts: GeneratorCounts = {};
  const stmt = (table: string, cols: number) => {
    const s = db.prepare(`INSERT INTO ${table} VALUES (${Array(cols).fill("?").join(",")})`);
    return (...values: unknown[]) => {
      s.run(...values);
      counts[table] = (counts[table] ?? 0) + 1;
    };
  };
  const ins = {
    staff: stmt("staff", 10), roster: stmt("roster", 5), leave: stmt("leave", 5), overtime: stmt("overtime", 7),
    terminals: stmt("terminals", 4), logins: stmt("logins", 8), customers: stmt("customers", 6), accounts: stmt("accounts", 6),
    transactions: stmt("transactions", 10), tickets: stmt("tickets", 10), actions: stmt("sensitive_actions", 15),
    scam: stmt("scam_reports", 7), sim: stmt("sim_state", 2),
  };

  db.transaction(() => {
    // Terminals: 600 branch terminals plus TRM-0777, a back-office terminal nobody uses as their own.
    for (let n = 1; n <= 600; n++) ins.terminals(`TRM-${pad(n, 4)}`, `Terminal ${n}`, BRANCHES[(n - 1) % 10]!, `${BRANCHES[(n - 1) % 10]} branch, desk ${Math.ceil(n / 10)}`);
    ins.terminals("TRM-0777", "Back-office terminal 777", "Harbor", "Harbor branch, back office");

    // Staff.
    const plan: Role[] = [
      ...Array<Role>(220).fill("CUSTOMER_SERVICE"), ...Array<Role>(160).fill("BRANCH_OPS"), ...Array<Role>(40).fill("OPS_REVERSALS"),
      ...Array<Role>(30).fill("OPS_EPRODUCTS"), ...Array<Role>(30).fill("IT_ADMIN"), ...Array<Role>(20).fill("INTERNAL_CONTROL"),
    ];
    const roles = rng.shuffle(plan);
    const force = (id: string, role: Role) => {
      const i = Number(id.slice(4)) - 1;
      if (roles[i] === role) return;
      const j = roles.findIndex((r, k) => r === role && !FIXED.has(`STF-${pad(k + 1, 4)}`));
      [roles[i], roles[j]] = [roles[j]!, roles[i]!];
    };
    force(CHARACTERS.approver, "OPS_REVERSALS");
    force(CHARACTERS.ngozi, "OPS_REVERSALS");
    force(CHARACTERS.tunde, "OPS_EPRODUCTS");
    for (const id of [CHARACTERS.bisi, CHARACTERS.kemi, ...CHARACTERS.otherViewers]) force(id, "CUSTOMER_SERVICE");

    const members: Member[] = [];
    let csContractors = 0;
    let itContractors = 0;
    for (let n = 1; n <= 500; n++) {
      const id = `STF-${pad(n, 4)}`;
      const role = roles[n - 1]!;
      let contractor = false;
      if (id === CHARACTERS.bisi || id === CHARACTERS.kemi) contractor = true;
      else if (role === "CUSTOMER_SERVICE" && csContractors < 38 && !FIXED.has(id) && n % 5 === 0) contractor = true;
      else if (role === "IT_ADMIN" && itContractors < 10 && n % 2 === 0) contractor = true;
      if (contractor && role === "CUSTOMER_SERVICE") csContractors++;
      if (contractor && role === "IT_ADMIN") itContractors++;
      const terminals = [`TRM-${pad(n, 4)}`];
      if (!FIXED.has(id) && rng.uniform() < 0.5) terminals.push(`TRM-${pad(500 + rng.int(1, 100), 4)}`);
      members.push({ id, role, terminals });
      ins.staff(id, NAMES[id] ?? `Synthetic Staff ${n}`, pseudonym(id), role, role, BRANCHES[n % 10]!, contractor ? "CONTRACTOR" : "EMPLOYEE", `0803${pad(n, 7)}`, JSON.stringify(terminals), null);
    }
    // Top up contractors to exactly 40 customer service if the modulo rule fell short.
    for (const m of members) {
      if (csContractors >= 40) break;
      if (m.role === "CUSTOMER_SERVICE" && !FIXED.has(m.id)) {
        const row = db.prepare("SELECT employment_type FROM staff WHERE id = ?").get(m.id) as { employment_type: string };
        if (row.employment_type === "EMPLOYEE") {
          db.prepare("UPDATE staff SET employment_type = 'CONTRACTOR' WHERE id = ?").run(m.id);
          csContractors++;
        }
      }
    }
    ins.staff(CHARACTERS.agent, "Customer assistant agent", pseudonym(CHARACTERS.agent), "AI_AGENT", "DIGITAL_CHANNELS", "Digital", "AGENT", "0000000000", "[]", JSON.stringify({ allowed_action_types: [], owner_team: "Digital Channels" }));

    // Customers and accounts.
    for (let n = 1; n <= 5000; n++) ins.customers(`CUS-${pad(n, 5)}`, `Customer ${n}`, `0701${pad(n, 7)}`, bvn(`c${n}`), rng.uniform() < 0.08 ? 1 : 0, CITIES[n % 10]!);
    for (let n = 1; n <= 5000; n++) {
      const year = 2016 + rng.int(0, 9);
      const opened = n <= 30 ? addDays("2026-10-02", rng.int(0, 13)) : `${year}-${pad(rng.int(1, 12), 2)}-${pad(rng.int(1, 28), 2)}`;
      ins.accounts(`ACC-${pad(n, 6)}`, `CUS-${pad(n, 5)}`, String(1000000000 + n), `${opened}T09:00:00+01:00`, `0701${pad(n, 7)}`, "ACTIVE");
    }
    const secondAccountCustomers: number[] = [];
    for (let n = 5001; n <= 5500; n++) {
      const owner = rng.int(31, 5000);
      secondAccountCustomers.push(owner);
      ins.accounts(`ACC-${pad(n, 6)}`, `CUS-${pad(owner, 5)}`, String(1000000000 + n), `2021-0${rng.int(1, 9)}-1${rng.int(0, 9)}T09:00:00+01:00`, `0701${pad(owner, 7)}`, "ACTIVE");
    }
    const otherAccountOf = new Map<number, number>();
    secondAccountCustomers.forEach((owner, i) => otherAccountOf.set(owner, 5001 + i));
    S2_ACCOUNTS.forEach((a, i) => {
      ins.customers(`CUS-N${i + 1}`, `New-account holder ${i + 1}`, `0812000330${i + 1}`, bvn(`n${i + 1}`), 0, CITIES[(i + 3) % 10]!);
      ins.accounts(a.id, `CUS-N${i + 1}`, a.no, `${a.opened}T09:00:00+01:00`, `0812000330${i + 1}`, "ACTIVE");
    });
    for (const v of VICTIMS) {
      ins.customers(`CUS-V${v.n}`, `Scam victim ${v.n}`, `0705000000${v.n}`, bvn(`v${v.n}`), 0, v.city);
      ins.accounts(`ACC-V${v.n}`, `CUS-V${v.n}`, v.no, "2019-03-01T09:00:00+01:00", `0705000000${v.n}`, "ACTIVE");
    }

    // Open customer-service tickets for 3,000 customers (customers 1001-4000), created before the window.
    const csStaff = members.filter((m) => m.role === "CUSTOMER_SERVICE");
    for (let n = 1001; n <= 4000; n++) {
      ins.tickets(`TKT-${pad(n, 5)}`, n % 3 === 0 ? "SERVICE_REQUEST" : "COMPLAINT", `CUS-${pad(n, 5)}`, null, "CUSTOMER_SERVICE", rng.pick(csStaff).id, null, `2026-09-${pad(rng.int(1, 16), 2)}T10:00:00+01:00`, "OPEN", null);
    }
    for (const v of VICTIMS) {
      ins.tickets(`TKT-V${v.n}`, "COMPLAINT", `CUS-V${v.n}`, null, "CUSTOMER_SERVICE", "STF-0005", null, "2026-10-05T10:00:00+01:00", "OPEN", null);
    }

    // Daily activity.
    let loginNo = 0;
    let txnNo = 0;
    let actNo = 0;
    let rosNo = 0;
    let levNo = 0;
    let otNo = 0;
    let tktNo = 0;
    const ops = members.filter((m) => m.role === "OPS_REVERSALS" || m.role === "OPS_EPRODUCTS");
    const exporters = members.filter((m) => m.role === "INTERNAL_CONTROL" || m.role === "IT_ADMIN");
    const nextTxn = () => `TXN-${pad(++txnNo, 7)}`;
    const nextAct = () => `ACT-${pad(++actNo, 7)}`;
    ins.leave("LEV-BISI", CHARACTERS.bisi, "2026-10-12", "2026-10-23", "APPROVED");

    for (const date of DAYS) {
      const wd = weekday(date);
      const weekend = wd === 0 || wd === 6;
      const shift = new Map<string, { start: number; end: number; session: string; terminal: string }>();
      for (const m of members) {
        const fixed = FIXED.has(m.id);
        if (m.id === CHARACTERS.bisi && date >= "2026-10-12") continue;
        if (weekend && (fixed || rng.uniform() >= 0.05)) continue;
        if (!fixed && rng.uniform() < 0.03) {
          ins.leave(`LEV-${pad(++levNo, 5)}`, m.id, date, date, "APPROVED");
          continue;
        }
        const late = !fixed && !weekend && rng.uniform() < 0.1;
        const start = late ? 12 * 60 : 8 * 60;
        const end = late ? 21 * 60 : 17 * 60;
        ins.roster(`ROS-${pad(++rosNo, 6)}`, m.id, date, hm(start), hm(end));
        let terminal = m.terminals[0]!;
        if (!fixed && rng.uniform() < 0.005) {
          let t = rng.int(1, 600);
          while (m.terminals.includes(`TRM-${pad(t, 4)}`)) t = rng.int(1, 600);
          terminal = `TRM-${pad(t, 4)}`;
        }
        const session = `SES-${pad(++loginNo, 6)}`;
        ins.logins(`LOG-${pad(loginNo, 6)}`, m.id, terminal, BRANCHES[Number(terminal.slice(4)) % 10]!, at(date, hm(start + 1)), session, "ENDED", null);
        shift.set(m.id, { start, end, session, terminal });
        if (!fixed && !weekend && rng.uniform() < 0.02) {
          const approver = rng.pick(members.filter((o) => o.role === m.role && o.id !== m.id));
          const ref = `TKT-OT-${pad(++otNo, 4)}`;
          ins.tickets(ref, "OVERTIME", null, null, m.role, m.id, approver.id, at(date, "09:00"), "APPROVED", "overtime");
          ins.overtime(`OT-${pad(otNo, 4)}`, m.id, date, hm(end), hm(end + 120), approver.id, ref);
        }
      }
      // Ngozi's approved overtime on Friday 16 Oct (S1).
      if (date === LAST_DAY) {
        ins.tickets("TKT-OT-1016", "OVERTIME", null, null, "OPS_REVERSALS", CHARACTERS.ngozi, CHARACTERS.approver, at(date, "12:00"), "APPROVED", "overtime");
        ins.overtime("OT-1016", CHARACTERS.ngozi, date, "17:00", "21:30", CHARACTERS.approver, "TKT-OT-1016");
      }
      // Times inside a shift; 1% noise lands up to 30 minutes after the shift with no overtime.
      const actionTime = (id: string, s: { start: number; end: number }, slot?: number) => {
        if (!FIXED.has(id) && rng.uniform() < 0.01) return at(date, hm(s.end + rng.int(1, 30)));
        const span = s.end - s.start - 60;
        const offset = slot === undefined ? rng.int(0, span) : Math.floor(slot * span);
        return at(date, hm(s.start + 30 + offset));
      };

      // Customer debits.
      for (let i = 0; i < 2000; i++) {
        const acc = rng.int(1, 5500);
        ins.transactions(nextTxn(), `NIP-${date}-${i}`, `ACC-${pad(acc, 6)}`, rng.int(2, 500) * 500, String(2000000000 + rng.int(1, 999999)), BASELINE_BANK, at(date, hm(rng.int(7 * 60, 21 * 60))), rng.pick(["APP", "USSD", "WEB"]), "SUCCESS", "00");
      }

      // Reversals of genuine failed debits.
      for (const m of ops) {
        const s = shift.get(m.id);
        if (!s) continue;
        let n = Math.max(5, Math.round(rng.normal(25, 6)));
        if (m.id === CHARACTERS.tunde && date === "2026-10-12") n = 40;
        if (m.id === CHARACTERS.tunde && date === LAST_DAY) n = 22;
        if (m.id === CHARACTERS.ngozi) n = date === LAST_DAY ? 24 : Math.min(n, 30);
        if (m.id === CHARACTERS.tunde && date !== "2026-10-12" && date !== LAST_DAY) n = Math.min(n, 30);
        for (let k = 0; k < n; k++) {
          const ts = actionTime(m.id, s, FIXED.has(m.id) ? k / n : undefined);
          const owner = rng.int(31, 5000);
          const debit = owner;
          const amount = rng.int(4, 600) * 500;
          const failedTs = addMinutes(ts, -rng.int(10, 120));
          const failed = nextTxn();
          ins.transactions(failed, `NIP-F-${failed}`, `ACC-${pad(debit, 6)}`, amount, String(2000000000 + rng.int(1, 999999)), BASELINE_BANK, failedTs < at(date, "00:00") ? at(date, "00:01") : failedTs, "APP", "FAILED", "91");
          let credit = debit;
          if (!FIXED.has(m.id) && otherAccountOf.has(owner) && rng.uniform() < 0.005) credit = otherAccountOf.get(owner)!;
          ins.actions(nextAct(), m.id, s.session, s.terminal, ts, "REVERSAL", failed, `ACC-${pad(credit, 6)}`, `CUS-${pad(owner, 5)}`, amount, null, "POSTED", null, null, 0);
        }
      }

      // Customer record views (97% on an open ticket assigned to customer service).
      for (const m of csStaff) {
        const s = shift.get(m.id);
        if (!s) continue;
        const n = Math.max(10, Math.round(rng.normal(30, 5)));
        for (let k = 0; k < n; k++) {
          const matched = rng.uniform() < 0.97;
          const c = matched ? rng.int(1001, 4000) : rng.int(4001, 5000);
          ins.actions(nextAct(), m.id, s.session, s.terminal, actionTime(m.id, s), "RECORD_VIEW", null, null, `CUS-${pad(c, 5)}`, null, matched ? `TKT-${pad(c, 5)}` : null, "POSTED", null, null, 0);
        }
      }

      // Weekly approved bulk exports (Mondays).
      if (wd === 1) {
        for (let k = 0; k < 5; k++) {
          const m = rng.pick(exporters);
          const s = shift.get(m.id);
          if (!s) continue;
          const approver = rng.pick(exporters.filter((o) => o.id !== m.id));
          const ref = `TKT-EX-${pad(++tktNo, 4)}`;
          ins.tickets(ref, "EXPORT", null, null, m.role, m.id, approver.id, at(date, "08:15"), "APPROVED", "CUSTOMER_TABLE");
          ins.actions(nextAct(), m.id, s.session, s.terminal, at(date, hm(s.start + 60 + k * 10)), "BULK_EXPORT", null, null, null, null, ref, "POSTED", JSON.stringify({ rows: 1200, scope: "CUSTOMER_TABLE" }), null, 0);
        }
      }

      // v1.1 leak-tracer views on the victims (all on real tickets).
      for (const v of VICTIMS) {
        if (v.kemi.startsWith(date)) {
          const s = shift.get(CHARACTERS.kemi)!;
          ins.actions(nextAct(), CHARACTERS.kemi, s.session, s.terminal, v.kemi, "RECORD_VIEW", null, null, `CUS-V${v.n}`, null, `TKT-V${v.n}`, "POSTED", null, "S4", 1);
        }
        if (v.other && v.otherTs.startsWith(date)) {
          const s = shift.get(v.other)!;
          ins.actions(nextAct(), v.other, s.session, s.terminal, v.otherTs, "RECORD_VIEW", null, null, `CUS-V${v.n}`, null, `TKT-V${v.n}`, "POSTED", null, null, 0);
        }
      }
    }

    // S2 setup: the six real failed debits Tunde will divert.
    for (const d of S2_FAILED_DEBITS) ins.transactions(d.id, `NIP-${d.id}`, d.account, d.amount, String(2000000000 + Number(d.id.slice(4))), BASELINE_BANK, d.ts, "APP", "FAILED", "91");
    // Genuine complaint evidence for the failed debit; it does not authorise redirecting the reversal.
    ins.tickets("TKT-2291", "COMPLAINT", null, "TXN-58213", "OPS_EPRODUCTS", CHARACTERS.ngozi, null, "2026-10-16T21:40:00+01:00", "OPEN", null);

    // v1.1 scam reports.
    for (const v of VICTIMS) {
      ins.tickets(`TKT-SR-${v.n}`, "SCAM_REPORT", `CUS-V${v.n}`, null, "FRAUD", "STF-0005", null, v.reported, "OPEN", null);
      ins.scam(`SCR-${pad(v.n, 4)}`, `CUS-V${v.n}`, SCAM_CALLER, v.reported, v.n % 2 ? "CONTACT_CENTRE" : "BRANCH", "The caller knew my balance and my last transaction.", `TKT-SR-${v.n}`);
    }
    ins.sim("clock", "2026-10-16T20:25:00+01:00");
  })();
  return counts;
}
