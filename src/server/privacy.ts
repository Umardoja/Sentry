import "server-only";
import { createHash } from "node:crypto";
import { PSEUDONYM_OVERRIDES, PSEUDONYM_SALT } from "./config";
export function pseudonym(staffId: string) {
  return (
    PSEUDONYM_OVERRIDES[staffId] ??
    `Staff-${createHash("sha256")
      .update(staffId + PSEUDONYM_SALT)
      .digest("hex")
      .slice(0, 4)
      .toUpperCase()}`
  );
}
export function maskAccount(account: string) {
  return `••••${account.slice(-4)}`;
}
