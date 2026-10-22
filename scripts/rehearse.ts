import { rehearse } from "../src/server/sim/player";
import { seedDatabase } from "../src/server/sim/seed";

const dbPath = process.env.DB_PATH;
if (!dbPath) {
  throw new Error("DB_PATH must name a disposable rehearsal database");
}

const { db } = seedDatabase(dbPath);
for (const s of rehearse(db)) console.log(`${s.step}  ${s.score ?? "-"}`);
db.close();
