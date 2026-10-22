import { DB_PATH } from "../src/server/config";
import { resetDatabase } from "../src/server/db/migrate";

resetDatabase(DB_PATH);
console.log(`Created empty database at ${DB_PATH}`);
