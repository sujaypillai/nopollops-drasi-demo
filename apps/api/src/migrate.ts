import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { runSqlDirectory } from "./sqlRunner.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "../../../database/migrations");

await runSqlDirectory(migrationsDir);
await pool.end();

