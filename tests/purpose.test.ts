import { beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { purposeEngine, type ActionRow } from "@/server/engines/purpose";
import { createEvaluator, runPurpose } from "@/server/engines/pipeline";
import { answerTicket } from "@/server/sim/player";
import { seedDatabase } from "@/server/sim/seed";
import { caseView } from "@/server/services/read";
import { POST as answerRoute } from "@/app/api/actions/[id]/answer/route";
import { scenarioOperator } from "@/server/auth/policy";
import { currentRunId } from "@/server/services/run";
import { openAuthDatabase, provisionAccounts, login } from "@/server/auth/store";

let db: Database.Database;
const operator = scenarioOperator("STF-0101");
const run = () => currentRunId(db);
beforeAll(() => {
  db = seedDatabase(join(tmpdir(), `sentry-purpose-${process.pid}.db`)).db;
}, 120_000);

const base: ActionRow = { id: "ACT-T", staff_id: "STF-0101", session_id: "S", terminal_id: "TRM-0101", ts: "2026-10-16T21:47:00+01:00", action_type: "REVERSAL", original_txn_id: "TXN-58213", credit_account_id: "ACC-004512", customer_id: null, amount: 850_000, ticket_ref: null, status: "POSTED", detail: null };
const team = () => (db.prepare("SELECT team FROM staff WHERE id = ?").get("STF-0101") as { team: string }).team;
const insertTxn = (id: string, amount = 850_000) => db.prepare("INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, `SES-${id}`, "ACC-004512", amount, "9900004512", "Test Bank", "2026-10-16T21:30:00+01:00", "APP", "FAILED", "91");
const insertTicket = (id: string, txn: string | null, customer: string | null = null) => db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, "COMPLAINT", customer, txn, team(), "STF-0042", null, "2026-10-16T21:30:00+01:00", "OPEN", null);
const insertReversal = (id: string, txn: string | null, amount = 850_000, credit = "ACC-004512", customer: string | null = null, ts = "2026-10-16T21:48:00+01:00") => {
  db.prepare("INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, "STF-0101", `SES-${id}`, "TRM-0101", ts, "REVERSAL", txn, credit, customer, amount, null, "POSTED", null, "REG", 0);
  runPurpose(db, [id]);
};

describe("purpose checks", () => {
  it("matched reversal back to the debited account", () => expect(purposeEngine(db).evaluate(base).status).toBe("MATCHED"));
  it("R1 no original", () => expect(purposeEngine(db).evaluate({ ...base, original_txn_id: "TXN-NOPE" }).status).toBe("NO_MATCH"));
  it("R3 amount mismatch", () => expect(purposeEngine(db).evaluate({ ...base, amount: 1 }).status).toBe("PARTIAL"));
  it("R4 credited to someone else", () => {
    const r = purposeEngine(db).evaluate({ ...base, credit_account_id: "ACC-N1" });
    expect(r.status).toBe("WRONG_BENEFICIARY");
    expect(r.checks.find((c) => c.code === "R4")!.detail).toBe("Went to ••••3301, opened 13 Oct; debited account was ••••4512");
  });
  it("record view with and without a case", () => {
    const view = { ...base, action_type: "RECORD_VIEW", staff_id: "STF-0388", original_txn_id: null, credit_account_id: null, amount: null };
    expect(purposeEngine(db).evaluate({ ...view, customer_id: "CUS-01500" }).status).toBe("MATCHED");
    expect(purposeEngine(db).evaluate({ ...view, customer_id: "CUS-04500" }).status).toBe("NO_CASE");
  });
  it("T1 ticket not found", () => expect(purposeEngine(db).validateTicket(base, "TKT-NOT-FOUND")).toEqual({ valid: false, failed: ["T1"] }));
  it("a valid ticket does not clear a wrong-destination reversal", () => {
    const ts = "2026-10-16T21:48:00+01:00";
    insertTicket("TKT-REG-WRONG", "TXN-58213");
    insertReversal("ACT-REG-WRONG", "TXN-58213", 850_000, "ACC-N1", null, ts);

    expect(answerTicket(db, operator, run(), "ACT-REG-WRONG", "TKT-REG-WRONG", ts)).toMatchObject({ valid: true });
    expect(db.prepare("SELECT status FROM purpose_results WHERE action_id = ?").get("ACT-REG-WRONG")).toEqual({ status: "WRONG_BENEFICIARY" });
    expect(db.prepare("SELECT action_ids FROM signals WHERE staff_id = ? AND code = ?").get("STF-0101", "REVERSAL_WRONG_BENEFICIARY")).toEqual(expect.objectContaining({ action_ids: expect.stringContaining("ACT-REG-WRONG") }));
    expect(createEvaluator(db).evaluate("STF-0101", ts).hits).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REVERSAL_WRONG_BENEFICIARY", action_ids: expect.arrayContaining(["ACT-REG-WRONG"]) }),
    ]));
  });
  it("a valid ticket does not clear an amount mismatch", () => {
    insertTxn("TXN-REG-AMOUNT");
    insertTicket("TKT-REG-AMOUNT", "TXN-REG-AMOUNT");
    insertReversal("ACT-REG-AMOUNT", "TXN-REG-AMOUNT", 1);
    expect(answerTicket(db, operator, run(), "ACT-REG-AMOUNT", "TKT-REG-AMOUNT", "2026-10-16T21:48:00+01:00")).toMatchObject({ valid: true, status: "PARTIAL" });
    expect(createEvaluator(db).evaluate("STF-0101", "2026-10-16T21:48:00+01:00").hits).toEqual(expect.arrayContaining([expect.objectContaining({ code: "AMOUNT_MISMATCH", action_ids: expect.arrayContaining(["ACT-REG-AMOUNT"]) })]));
  });
  it("a valid ticket does not clear a distinct prior reversal", () => {
    insertTxn("TXN-REG-DUP");
    insertReversal("ACT-REG-DUP-PRIOR", "TXN-REG-DUP", 850_000, "ACC-004512", null, "2026-10-16T21:40:00+01:00");
    insertTicket("TKT-REG-DUP", "TXN-REG-DUP");
    insertReversal("ACT-REG-DUP", "TXN-REG-DUP");
    expect(answerTicket(db, operator, run(), "ACT-REG-DUP", "TKT-REG-DUP", "2026-10-16T21:48:00+01:00")).toMatchObject({ valid: true, status: "DUPLICATE" });
  });
  it("a ticket cannot fabricate a missing original transaction", () => {
    insertTicket("TKT-REG-MISSING", null, "CUS-01500");
    insertReversal("ACT-REG-MISSING", "TXN-REG-MISSING", 850_000, "ACC-004512", "CUS-01500");
    expect(answerTicket(db, operator, run(), "ACT-REG-MISSING", "TKT-REG-MISSING", "2026-10-16T21:48:00+01:00")).toMatchObject({ valid: true, status: "NO_MATCH" });
  });
  it("a valid approved ticket resolves a ticket-backed export only", () => {
    db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)").run("TKT-REG-EXPORT", "EXPORT", null, null, team(), "STF-0042", "STF-0007", "2026-10-16T21:30:00+01:00", "APPROVED", "CUSTOMER_EXPORT");
    db.prepare("INSERT INTO sensitive_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("ACT-REG-EXPORT", "STF-0101", "SES-REG-EXPORT", "TRM-0101", "2026-10-16T21:48:00+01:00", "BULK_EXPORT", null, null, null, null, null, "POSTED", JSON.stringify({ scope: "CUSTOMER_EXPORT" }), "REG", 0);
    runPurpose(db, ["ACT-REG-EXPORT"]);
    expect(answerTicket(db, operator, run(), "ACT-REG-EXPORT", "TKT-REG-EXPORT", "2026-10-16T21:48:00+01:00")).toMatchObject({ valid: true, status: "MATCHED" });
    expect(db.prepare("SELECT ticket_ref FROM sensitive_actions WHERE id = ?").get("ACT-REG-EXPORT")).toEqual({ ticket_ref: "TKT-REG-EXPORT" });
  });
  it("a valid purpose ticket does not clear an independent identity signal", () => {
    insertTxn("TXN-REG-IDENTITY");
    insertTicket("TKT-REG-IDENTITY", "TXN-REG-IDENTITY");
    insertReversal("ACT-REG-IDENTITY", "TXN-REG-IDENTITY", 850_000, "ACC-N2");
    const terminal = (db.prepare("SELECT id FROM terminals WHERE id <> ? LIMIT 1").get("TRM-0101") as { id: string }).id;
    db.prepare("INSERT INTO logins VALUES (?,?,?,?,?,?,?,?)").run("LOG-REG-IDENTITY", "STF-0101", terminal, "Harbor", "2026-10-16T21:47:00+01:00", "SES-REG-IDENTITY", "ACTIVE", "REG");
    answerTicket(db, operator, run(), "ACT-REG-IDENTITY", "TKT-REG-IDENTITY", "2026-10-16T21:48:00+01:00");
    expect(createEvaluator(db).evaluate("STF-0101", "2026-10-16T21:48:00+01:00").hits).toEqual(expect.arrayContaining([expect.objectContaining({ code: "NEW_TERMINAL" })]));
  });
  it("an invalid ticket does not clear an unrelated concern", () => {
    insertTxn("TXN-REG-INVALID");
    insertReversal("ACT-REG-INVALID", "TXN-REG-INVALID", 850_000, "ACC-N3");
    expect(answerTicket(db, operator, run(), "ACT-REG-INVALID", "TKT-NOT-FOUND", "2026-10-16T21:48:00+01:00")).toMatchObject({ valid: false, status: "WRONG_BENEFICIARY" });
  });
  it("repeating a ticket answer preserves contradictions without creating containment", () => {
    insertTxn("TXN-REG-REPEAT");
    insertTicket("TKT-REG-REPEAT", "TXN-REG-REPEAT");
    insertReversal("ACT-REG-REPEAT", "TXN-REG-REPEAT", 850_000, "ACC-N4");
    answerTicket(db, operator, run(), "ACT-REG-REPEAT", "TKT-REG-REPEAT", "2026-10-16T21:48:00+01:00");
    answerTicket(db, operator, run(), "ACT-REG-REPEAT", "TKT-REG-REPEAT", "2026-10-16T21:49:00+01:00");
    expect(db.prepare("SELECT status FROM purpose_results WHERE action_id = ?").get("ACT-REG-REPEAT")).toEqual({ status: "WRONG_BENEFICIARY" });
    expect(db.prepare("SELECT COUNT(*) n FROM ticket_answers WHERE action_id = ?").get("ACT-REG-REPEAT")).toEqual({ n: 2 });
    expect(db.prepare("SELECT COUNT(*) n FROM interventions WHERE staff_id = ?").get("STF-0101")).toEqual({ n: 0 });
  });
  it("a reversal is not its own prior reversal when re-evaluated", () => {
    insertTxn("TXN-REG-SELF");
    insertTicket("TKT-REG-SELF", "TXN-REG-SELF");
    insertReversal("ACT-REG-SELF", "TXN-REG-SELF");
    expect(answerTicket(db, operator, run(), "ACT-REG-SELF", "TKT-REG-SELF", "2026-10-16T21:48:00+01:00")).toMatchObject({ valid: true, status: "MATCHED" });
  });
  it("the case read model continues to show a contradicted action after a valid ticket", () => {
    db.prepare("INSERT INTO cases VALUES (?,?,?,?,?,?,?)").run("CASE-REG", "STF-0101", "2026-10-16T21:47:00+01:00", "OPEN", 38, "VERIFY", 0);
    db.prepare("INSERT INTO interventions VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("INT-REG", "CASE-REG", "STF-0101", "REQUEST_REASON", "ACTIVE", 1, "2026-10-16T21:47:00+01:00", null, null, null, "{}");
    const view = caseView(db, "CASE-REG")!;
    expect(view.purpose?.checks.some((check) => !check.passed)).toBe(true);
    expect(view.prompt).toMatchObject({ ticket_ref: "TKT-REG-REPEAT", valid: true, message: "Ticket verified. Destination mismatch remains. Review still required." });
  });
  it("a malformed ticket-answer API request returns a client error before any database mutation", async () => {
    const auth = openAuthDatabase(process.env.AUTH_DB_PATH!);
    provisionAccounts(auth, [{ id: "test-op", username: "test-op", password: "purpose-test-password", roles: ["OPERATOR"], staff_id: "STF-0101" }]);
    const issued = login(auth, "test-op", "purpose-test-password")!;
    auth.close();
    const before = (db.prepare("SELECT COUNT(*) n FROM ticket_answers").get() as { n: number }).n;
    const response = await answerRoute(new Request("http://127.0.0.1:3000/api/actions/ACT-REG-SELF/answer", { method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000", "x-sentry-request": "1", "x-csrf-token": issued.csrf_token, cookie: `sentry_session=${issued.token}` }, body: JSON.stringify({ ticket_ref: "" }) }), { params: Promise.resolve({ id: "ACT-REG-SELF" }) });
    expect(response.status).toBe(400);
    expect((db.prepare("SELECT COUNT(*) n FROM ticket_answers").get() as { n: number }).n).toBe(before);
  });
  it("generator has the S2 setup rows", () => {
    expect(db.prepare("SELECT account_no FROM accounts WHERE id = 'ACC-N4'").get()).toEqual({ account_no: "9900003304" });
    expect(db.prepare("SELECT ts, amount FROM transactions WHERE id = 'TXN-58213'").get()).toEqual({ ts: "2026-10-16T21:31:00+01:00", amount: 850_000 });
    expect((db.prepare("SELECT COUNT(*) n FROM sensitive_actions WHERE staff_id = 'STF-0101' AND substr(ts,1,10) = '2026-10-12'").get() as { n: number }).n).toBe(40);
    const banks = db.prepare("SELECT DISTINCT beneficiary_bank b FROM transactions").all() as { b: string }[];
    for (const real of ["Zenith", "GTBank", "Access", "First Bank", "UBA", "OPay", "Kuda", "PalmPay", "Moniepoint"]) expect(banks.some((x) => x.b.includes(real))).toBe(false);
  });
});
