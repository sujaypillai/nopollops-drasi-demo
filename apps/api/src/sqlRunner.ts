import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "./db.js";

export async function runSqlDirectory(directory: string) {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(directory, file), "utf8");
    await pool.query(sql);
    console.log(`applied ${file}`);
  }
}

