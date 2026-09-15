// Runs SQL files (a migration, then its tests) inside ONE transaction that is always rolled back,
// so a pending migration can be checked against the real schema without changing anything.
//
//   node --env-file=.env scripts/db-dry-run.mjs supabase/pending/x.sql supabase/pending/tests/x.sql
//
// It still takes locks on live objects while it runs, hence the short lock and statement timeouts.

import { readFile } from "node:fs/promises";
import pg from "pg";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node --env-file=.env scripts/db-dry-run.mjs <file.sql> [more.sql ...]");
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  console.error("DIRECT_URL is missing from .env");
  process.exit(1);
}

const ssl = process.env.SUPABASE_DB_CA_CERT
  ? { ca: await readFile(process.env.SUPABASE_DB_CA_CERT, "utf8") }
  : { rejectUnauthorized: false };

const client = new pg.Client({ connectionString, ssl });
await client.connect();

let failed = false;
try {
  await client.query("begin");
  await client.query("set local lock_timeout = '3s'");
  await client.query("set local statement_timeout = '60s'");
  for (const file of files) {
    const sql = await readFile(file, "utf8");
    try {
      await client.query(sql);
      console.log(`OK    ${file}`);
    } catch (error) {
      failed = true;
      const location = error.position ? ` (character ${error.position})` : "";
      console.log(`FAIL  ${file}`);
      console.log(`      ${error.message}${location}`);
      if (error.where) console.log(`      ${error.where.split("\n")[0]}`);
      break;
    }
  }
} finally {
  await client.query("rollback");
  await client.end();
}

console.log(failed ? "\nDry run failed; everything was rolled back." : "\nDry run passed; everything was rolled back.");
process.exitCode = failed ? 1 : 0;
