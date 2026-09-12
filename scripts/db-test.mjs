// Runs every supabase/tests/*.sql file inside a transaction that is always rolled back,
// so tests never leave data behind. A test fails when its SQL raises (e.g. a failed ASSERT).
//
//   npm run db:test

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  console.error("DIRECT_URL is missing from .env");
  process.exit(1);
}

const ssl = process.env.SUPABASE_DB_CA_CERT
  ? { ca: await readFile(process.env.SUPABASE_DB_CA_CERT, "utf8") }
  : { rejectUnauthorized: false };

const testsDir = path.join(import.meta.dirname, "..", "supabase", "tests");
const only = process.argv[2];
const files = (await readdir(testsDir))
  .filter((file) => file.endsWith(".sql") && (!only || file.includes(only)))
  .sort();

const client = new pg.Client({ connectionString, ssl });
await client.connect();

let failed = 0;
for (const file of files) {
  const sql = await readFile(path.join(testsDir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    console.log(`PASS  ${file}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${file}`);
    console.log(`      ${error.message}`);
    if (error.where) console.log(`      ${error.where.split("\n")[0]}`);
  } finally {
    await client.query("rollback");
  }
}

await client.end();
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exitCode = failed ? 1 : 0;
