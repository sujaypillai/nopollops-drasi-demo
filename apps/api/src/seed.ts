import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { runSqlDirectory } from "./sqlRunner.js";

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(here, "../../../database/seed");

await runSqlDirectory(seedDir);
await pool.end();

