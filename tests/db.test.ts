import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createSchema, TABLES } from "@/server/db/migrate";

describe("database schema", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  createSchema(db);
  it("creates every table, idempotently", () => {
    createSchema(db);
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of TABLES) expect(names).toContain(t);
  });
  it("rejects bad enum values and self-approved overtime", () => {
    expect(() => db.prepare("INSERT INTO cases VALUES ('C','S','t','NOPE',1,'NORMAL',0)").run()).toThrow();
    db.prepare("INSERT INTO staff VALUES ('S1','n','p','OPS_REVERSALS','t','b','EMPLOYEE','0','[]',NULL)").run();
    expect(() => db.prepare("INSERT INTO overtime VALUES ('O','S1','d','17:00','19:00','S1','T')").run()).toThrow();
  });
});
