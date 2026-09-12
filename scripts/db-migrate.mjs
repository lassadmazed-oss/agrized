// Applies supabase/migrations/*.sql in filename order, each one once, inside a transaction.
// Applied files are tracked in app.schema_migrations.
//
//   npm run db:migrate
//
// Reads DIRECT_URL (session pooler) from .env. Set SUPABASE_DB_CA_CERT to the path of the
// Supabase CA certificate (Dashboard › Database › SSL) to verify the server certificate.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  console.error("DIRECT_URL is missing from .env");
  process.exit(1);
}

let ssl = { rejectUnauthorized: false };
if (process.env.SUPABASE_DB_CA_CERT) {
  ssl = { ca: await readFile(process.env.SUPABASE_DB_CA_CERT, "utf8") };
} else {
  console.warn("SUPABASE_DB_CA_CERT not set: connecting over TLS without certificate verification.");
}

const migrationsDir = path.join(import.meta.dirname, "..", "supabase", "migrations");
const client = new pg.Client({ connectionString, ssl });

await client.connect();
await client.query(`
  create schema if not exists app;
  create table if not exists app.schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  );
`);

const { rows } = await client.query("select version from app.schema_migrations");
const applied = new Set(rows.map((row) => row.version));
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
const pending = files.filter((file) => !applied.has(file));

if (pending.length === 0) {
  console.log("Database is up to date.");
}

for (const file of pending) {
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  process.stdout.write(`Applying ${file} … `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into app.schema_migrations (version) values ($1)", [file]);
    await client.query("commit");
    console.log("done");
  } catch (error) {
    await client.query("rollback");
    console.log("failed");
    const location = error.position ? ` (character ${error.position})` : "";
    console.error(`${error.message}${location}`);
    if (error.where) console.error(error.where);
    process.exitCode = 1;
    break;
  }
}

await client.end();
