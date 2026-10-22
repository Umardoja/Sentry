import { DB_PATH } from "../src/server/config";
import { seedDatabase } from "../src/server/sim/seed";

const { db, counts, ms } = seedDatabase(DB_PATH);
for (const [table, n] of Object.entries(counts)) console.log(`${table.padEnd(18)} ${n}`);
console.log(`purpose_results    ${(db.prepare("SELECT COUNT(*) n FROM purpose_results").get() as { n: number }).n}`);
console.log(`risk_scores        ${(db.prepare("SELECT COUNT(*) n FROM risk_scores").get() as { n: number }).n}`);
console.log(`Seeded in ${(ms / 1000).toFixed(1)} s`);
db.close();
