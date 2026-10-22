import { AUTH_DB_PATH } from "../src/server/config";
import { openAuthDatabase, provisionAccounts } from "../src/server/auth/store";

if (!AUTH_DB_PATH) throw new Error("AUTH_DB_PATH must name a fresh local demo auth database");
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const auth = openAuthDatabase(AUTH_DB_PATH);
try {
  provisionAccounts(auth, [
    { id: "ACC-OP-TUNDE", username: "operator-tunde", password: required("SENTRY_PASSWORD_OPERATOR_TUNDE"), roles: ["OPERATOR"], staff_id: "STF-0101" },
    { id: "ACC-REV-ADA", username: "reviewer-ada", password: required("SENTRY_PASSWORD_REVIEWER_ADA"), roles: ["REVIEWER"], staff_id: "STF-0007" },
    { id: "ACC-REV-TUNDE", username: "reviewer-tunde", password: required("SENTRY_PASSWORD_REVIEWER_TUNDE"), roles: ["REVIEWER"], staff_id: "STF-0101" },
    { id: "ACC-AUDITOR", username: "auditor", password: required("SENTRY_PASSWORD_AUDITOR"), roles: ["AUDITOR"], staff_id: null },
    { id: "ACC-PRESENTER", username: "presenter", password: required("SENTRY_PASSWORD_PRESENTER"), roles: ["REVIEWER", "SIMULATION_CONTROLLER"], staff_id: "STF-0007" },
  ]);
  console.log("Provisioned five fixed synthetic local accounts. Passwords were not printed.");
} finally {
  auth.close();
}
