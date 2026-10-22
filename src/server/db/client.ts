import "server-only";
import type Database from "better-sqlite3";
import { DB_PATH } from "../config";
import { openDatabase } from "./migrate";

const holder = globalThis as unknown as { sentryDb?: Database.Database; sentryWorkspaceDbs?: Map<string, Database.Database> };

export function getDb(path = DB_PATH): Database.Database {
  if (path === DB_PATH) {
    if (!holder.sentryDb) holder.sentryDb = openDatabase(path);
    return holder.sentryDb;
  }
  const databases = (holder.sentryWorkspaceDbs ??= new Map());
  let database = databases.get(path);
  if (!database) { database = openDatabase(path); databases.set(path, database); }
  return database;
}

export function setDb(database: Database.Database, path = DB_PATH): void {
  if (path === DB_PATH) holder.sentryDb = database;
  else (holder.sentryWorkspaceDbs ??= new Map()).set(path, database);
}

export function closeDb(path = DB_PATH): void {
  if (path === DB_PATH) { holder.sentryDb?.close(); holder.sentryDb = undefined; return; }
  const database = holder.sentryWorkspaceDbs?.get(path);
  database?.close();
  holder.sentryWorkspaceDbs?.delete(path);
}
