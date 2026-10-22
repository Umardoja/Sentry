import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { scenarioOperator } from "../src/server/auth/policy";
import { currentRunId } from "../src/server/services/run";
import { answerTicket, clockOf, nextStep } from "../src/server/sim/player";
import { CHARACTERS } from "../src/server/sim/generator";
import { seedDatabase } from "../src/server/sim/seed";

const workspace = resolve(process.cwd());
const required = (name: string) => {
  const value = process.env[name];
  if (!value || !isAbsolute(value)) throw new Error(`${name} must be an explicit absolute path`);
  return resolve(value);
};
const dbPath = required("EVAL_PARITY_DB_PATH");
const outputPath = required("EVAL_PARITY_OUTPUT");
if (!dbPath.startsWith(resolve(workspace, ".codex-evaluation") + "\\")) throw new Error("EVAL_PARITY_DB_PATH must be inside .codex-evaluation");
if (!outputPath.startsWith(resolve(workspace, "evaluation", "pass4", "results") + "\\")) throw new Error("EVAL_PARITY_OUTPUT must be inside evaluation/pass4/results");

const { db } = seedDatabase(dbPath, 2026);
try {
  const s1 = nextStep(db);
  const s20 = nextStep(db);
  const s21 = nextStep(db);
  const answer = answerTicket(db, scenarioOperator(CHARACTERS.tunde), currentRunId(db), "ACT-S2-1", "TKT-2291", clockOf(db));
  const s22 = nextStep(db);
  const purpose = db.prepare("SELECT status FROM purpose_results WHERE action_id = 'ACT-S2-1'").get() as { status: string };
  const signal = db.prepare("SELECT effective_points FROM signals WHERE staff_id = ? AND code = 'REVERSAL_WRONG_BENEFICIARY'").get(CHARACTERS.tunde) as { effective_points: number } | undefined;
  const scoreOf = (step: typeof s21) => step.result && typeof step.result.score === "number" ? step.result.score : null;
  const parity = {
    harness_check_only: true,
    steps: [s1.step, s20.step, s21.step, s22.step],
    s21_score: scoreOf(s21),
    ticket_valid: answer?.valid ?? false,
    purpose_status_after_ticket: purpose.status,
    wrong_beneficiary_signal_points: signal?.effective_points ?? null,
    s22_score: scoreOf(s22),
    passed: scoreOf(s21) === 38 && answer?.valid === true && purpose.status === "WRONG_BENEFICIARY" && signal?.effective_points === 20 && scoreOf(s22) === 38,
  };
  if (!parity.passed) throw new Error(`scenario parity failed: ${JSON.stringify(parity)}`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(parity, null, 2)}\n`, "utf8");
  console.log("Pass 4 parity check passed: S2.1=38, genuine ticket retained WRONG_BENEFICIARY/R4 signal, S2.2=38.");
} finally {
  db.close();
}

