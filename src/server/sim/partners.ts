import "server-only";
import type Database from "better-sqlite3";
import { SEED } from "../config";
import { Rng } from "../rng";
import { addDays, addMinutes, at, fromMinutes, toMinutes, weekday } from "../time";
import { DAYS } from "./generator";
// seed.ts imports this module too; START_CLOCK is only read inside functions, so the cycle is safe.
import { START_CLOCK } from "./seed";

/**
 * Third-party partners on the bank's open-banking APIs (S5). Names, licences and networks are
 * invented for the sandbox: networks use private-use AS numbers, so none can be a real provider.
 */
export const PARTNER_TYPE = "Open-banking fintech";
export const PARTNERS = [
  { id: "PTR-QMK", name: "Quillmark Pay", key: "KEY-QMK-01", label: "qmk-prod-01", owner: "STF-0120", daily: 260, networks: ["AS64512 · Cloudcrest Lagos", "AS64513 · Cloudcrest Abuja"] },
  { id: "PTR-LMR", name: "Lumenridge Wallet", key: "KEY-LMR-01", label: "lmr-prod-01", owner: "STF-0121", daily: 180, networks: ["AS64520 · Brightrack Lagos", "AS64521 · Brightrack Ibadan"] },
  { id: "PTR-HBL", name: "Harbourline Finance", key: "KEY-HBL-01", label: "hbl-prod-01", owner: "STF-0122", daily: 320, networks: ["AS64530 · Stonepine Cloud", "AS64531 · Stonepine Cloud West"] },
  { id: "PTR-CPL", name: "Copperleaf Payments", key: "KEY-CPL-01", label: "cpl-prod-01", owner: "STF-0123", daily: 140, networks: ["AS64540 · Tidewell Hosting", "AS64541 · Tidewell Hosting 2"] },
  { id: "PTR-BKF", name: "Brackenfield Savings", key: "KEY-BKF-01", label: "bkf-prod-01", owner: "STF-0124", daily: 120, networks: ["AS64550 · Orchardline DC", "AS64551 · Orchardline DC 2"] },
  { id: "PTR-BWL", name: "Brindlewood Ledger", key: "KEY-BWL-01", label: "bwl-prod-01", owner: "STF-0125", daily: 200, networks: ["AS64560 · Kestrelnet Lagos", "AS64561 · Kestrelnet Kano"] },
] as const;
export type PartnerDef = (typeof PARTNERS)[number];
export const S5_PARTNER = PARTNERS[0];

export const SCOPES = ["balance", "transactions", "payment_initiation"] as const;
export const ENDPOINTS = {
  balance: "GET /accounts/balance",
  transactions: "GET /accounts/transactions",
  nameEnquiry: "POST /payments/name-enquiry",
  payment: "POST /payments",
} as const;

/** S5 fixtures: a payer whose payment consent the subleased key abuses, and a customer who revoked consent on Thursday. */
export const S5_PAYER = { customer: "CUS-01842", account: "1000001842" };
export const S5_REVOKED = { customer: "CUS-02718", account: "1000002718", revoked_at: "2026-10-15T16:20:00+01:00" };
export const S5_NETWORKS = Array.from({ length: 9 }, (_, i) => `AS6460${i} · Homenet pool ${i + 1}`);
/** S5.2 harvests these account numbers in strict sequence. */
export const S5_SEQUENCE_START = 1000004100;
export const S5_SEQUENCE_LENGTH = 40;

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const customerNo = (n: number) => `CUS-${pad(n, 5)}`;
const accountNo = (n: number) => String(1000000000 + n);

type Consent = { id: string; customer: number; scopes: string[]; granted: string; expires: string; revoked: string | null };
export type NewPartnerCall = { id: string; key_id: string; endpoint: string; scope: string; customer_id: string; account_no: string; source_network: string; ts: string; scenario_tag: string | null };

/** Consents per partner, deterministic from the seed: ~240 customers each, mostly active, some expired or revoked earlier. */
function consentsFor(rng: Rng, partnerIndex: number): Consent[] {
  const used = new Set<number>();
  const consents: Consent[] = [];
  for (let k = 0; consents.length < 240; k++) {
    let n = rng.int(31, 5000);
    while (used.has(n) || n === 1842 || n === 2718) n = rng.int(31, 5000);
    used.add(n);
    const scopes = ["balance", ...(rng.uniform() < 0.8 ? ["transactions"] : []), ...(rng.uniform() < 0.55 ? ["payment_initiation"] : [])];
    const granted = at(addDays("2026-06-01", rng.int(0, 100)), `${pad(rng.int(8, 19), 2)}:${pad(rng.int(0, 59), 2)}`);
    const roll = rng.uniform();
    const expires = roll < 0.05 ? addMinutes(granted, 90 * 1440) : addMinutes(granted, 365 * 1440);
    const revoked = roll >= 0.05 && roll < 0.08 ? at(addDays("2026-09-20", rng.int(0, 20)), "12:00") : null;
    consents.push({ id: `CNS-${pad(partnerIndex + 1, 2)}-${pad(k + 1, 4)}`, customer: n, scopes, granted, expires, revoked });
  }
  return consents;
}

const activeAt = (c: Consent, ts: string) => c.granted <= ts && ts < c.expires && (!c.revoked || ts < c.revoked);

/**
 * Writes the partner register, keys, consents and 30 days of normal, consented API traffic (up to the
 * scenario start). Runs on its own seeded stream, so the staff baseline is byte-for-byte unchanged.
 */
export function generatePartners(db: Database.Database, seed = SEED): number {
  const rng = new Rng(seed + 13);
  const ins = {
    partner: db.prepare("INSERT INTO api_partners VALUES (?,?,?,?,?,?,?)"),
    key: db.prepare("INSERT INTO api_keys VALUES (?,?,?,?,?)"),
    consent: db.prepare("INSERT INTO customer_consents VALUES (?,?,?,?,?,?,?)"),
    call: db.prepare("INSERT INTO partner_api_calls VALUES (?,?,?,?,?,?,?,?,?,?)"),
  };
  let calls = 0;
  db.transaction(() => {
    PARTNERS.forEach((p, i) => {
      const onboarded = at(addDays("2025-03-03", i * 41), "10:00");
      ins.partner.run(p.id, p.name, PARTNER_TYPE, `SBX-OBL-${pad(i + 1, 4)}`, onboarded, "ACTIVE", p.owner);
      ins.key.run(p.key, p.id, p.label, "ACTIVE", onboarded);
      const consents = consentsFor(rng, i);
      if (p.id === S5_PARTNER.id) {
        consents.push({ id: "CNS-01-S5PAY", customer: 1842, scopes: [...SCOPES], granted: "2026-07-14T11:05:00+01:00", expires: "2027-07-14T11:05:00+01:00", revoked: null });
        consents.push({ id: "CNS-01-S5REV", customer: 2718, scopes: ["balance", "transactions"], granted: "2026-05-02T09:40:00+01:00", expires: "2027-05-02T09:40:00+01:00", revoked: S5_REVOKED.revoked_at });
      }
      for (const c of consents) ins.consent.run(c.id, customerNo(c.customer), p.id, JSON.stringify(c.scopes), c.granted, c.expires, c.revoked);
      let n = 0;
      const push = (call: Omit<NewPartnerCall, "id" | "key_id" | "scenario_tag">) => {
        ins.call.run(`PCALL-${pad(i + 1, 2)}-${pad(++n, 6)}`, p.key, call.endpoint, call.scope, call.customer_id, call.account_no, call.source_network, call.ts, "ALLOWED", null);
        calls++;
      };
      for (const date of DAYS) {
        const weekend = weekday(date) === 0 || weekday(date) === 6;
        const count = Math.max(10, Math.round(rng.normal(p.daily * (weekend ? 0.5 : 1), p.daily * 0.08)));
        const times = Array.from({ length: count }, () => toMinutes(at(date, "06:00")) + rng.int(0, 17 * 60 - 1)).sort((a, b) => a - b);
        for (const minute of times) {
          const ts = fromMinutes(minute);
          if (ts > START_CLOCK) break;
          const c = rng.pick(consents);
          const network = rng.pick(p.networks);
          if (!activeAt(c, ts)) continue;
          const scope = rng.pick(c.scopes);
          if (scope === "payment_initiation") {
            const payee = accountNo(rng.int(31, 5000));
            push({ endpoint: ENDPOINTS.nameEnquiry, scope, customer_id: customerNo(c.customer), account_no: payee, source_network: network, ts });
            // Most name enquiries lead to a real payment a few minutes later.
            const paid = addMinutes(ts, rng.int(1, 4));
            if (rng.uniform() < 0.85 && paid <= START_CLOCK) push({ endpoint: ENDPOINTS.payment, scope, customer_id: customerNo(c.customer), account_no: payee, source_network: network, ts: paid });
          } else {
            push({ endpoint: scope === "balance" ? ENDPOINTS.balance : ENDPOINTS.transactions, scope, customer_id: customerNo(c.customer), account_no: accountNo(c.customer), source_network: network, ts });
          }
        }
      }
    });
  })();
  return calls;
}

/** Live partner traffic for one simulated minute: always within an active consent, from the partner's own networks. */
export function livePartnerCalls(db: Database.Database, minute: number): NewPartnerCall[] {
  const ts0 = fromMinutes(minute);
  const out: NewPartnerCall[] = [];
  const consents = db.prepare("SELECT customer_id, scopes FROM customer_consents WHERE partner_id = ? AND granted_at <= ? AND expires_at > ? AND (revoked_at IS NULL OR revoked_at > ?) ORDER BY id");
  PARTNERS.forEach((p, i) => {
    // The S5 partner is scripted; live traffic never touches it.
    if (p.id === S5_PARTNER.id) return;
    const rng = new Rng((Math.imul(minute, 0x9e3779b1) ^ Math.imul(i + 101, 0x85ebca6b) ^ SEED) >>> 0);
    if (rng.uniform() >= p.daily / (17 * 60)) return;
    const active = consents.all(p.id, ts0, ts0, ts0) as { customer_id: string; scopes: string }[];
    if (!active.length) return;
    const c = rng.pick(active);
    const scope = rng.pick(JSON.parse(c.scopes) as string[]);
    const ts = `${ts0.slice(0, 17)}${pad(rng.int(0, 59), 2)}+01:00`;
    const network = rng.pick(p.networks);
    const stamp = ts0.slice(0, 16).replace(/[-T:]/g, "");
    const base = { key_id: p.key, scope, customer_id: c.customer_id, source_network: network, scenario_tag: "INGEST" };
    if (scope === "payment_initiation") {
      const payee = accountNo(rng.int(31, 5000));
      out.push({ ...base, id: `PCALL-LV-${stamp}-${i + 1}-1`, endpoint: ENDPOINTS.nameEnquiry, account_no: payee, ts });
      out.push({ ...base, id: `PCALL-LV-${stamp}-${i + 1}-2`, endpoint: ENDPOINTS.payment, account_no: payee, ts });
    } else {
      out.push({ ...base, id: `PCALL-LV-${stamp}-${i + 1}-1`, endpoint: scope === "balance" ? ENDPOINTS.balance : ENDPOINTS.transactions, account_no: accountNo(Number(c.customer_id.slice(4))), ts });
    }
  });
  return out;
}

/** S5 step traffic, at fixed times ending at each step's scenario time. */
export function s5Calls(step: "S5.1" | "S5.2" | "S5.3" | "S5.4", t: string): NewPartnerCall[] {
  const call = (n: number, endpoint: string, scope: string, customer: string, account: string, network: string, ts: string): NewPartnerCall =>
    ({ id: `PCALL-${step.replace(".", "")}-${pad(n, 3)}`, key_id: S5_PARTNER.key, endpoint, scope, customer_id: customer, account_no: account, source_network: network, ts, scenario_tag: "S5" });
  switch (step) {
    case "S5.1":
      // Two balance checks from each of nine home networks in the 45 minutes before the step.
      return S5_NETWORKS.flatMap((network, i) => [0, 1].map((k) =>
        call(i * 2 + k + 1, ENDPOINTS.balance, "balance", S5_PAYER.customer, S5_PAYER.account, network, addMinutes(t, -45 + i * 5 + k * 2))));
    case "S5.2":
      return Array.from({ length: S5_SEQUENCE_LENGTH }, (_, i) =>
        call(i + 1, ENDPOINTS.nameEnquiry, "payment_initiation", S5_PAYER.customer, String(S5_SEQUENCE_START + i), S5_NETWORKS[i % S5_NETWORKS.length]!, addMinutes(t, -5 + Math.floor(i / 8))));
    case "S5.3":
      return [call(1, ENDPOINTS.balance, "balance", S5_REVOKED.customer, S5_REVOKED.account, S5_NETWORKS[3]!, t)];
    case "S5.4":
      return Array.from({ length: 5 }, (_, i) =>
        call(i + 1, ENDPOINTS.nameEnquiry, "payment_initiation", S5_PAYER.customer, String(S5_SEQUENCE_START + S5_SEQUENCE_LENGTH + i), S5_NETWORKS[(i + 5) % 9]!, addMinutes(t, -4 + i)));
  }
}
