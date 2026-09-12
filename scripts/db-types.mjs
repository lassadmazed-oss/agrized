// Generates TypeScript types for the public schema through the Supabase Management API.
//
//   npm run db:types
//
// Needs SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN in .env.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required in .env");
  process.exit(1);
}

const response = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${token}` } },
);
if (!response.ok) {
  console.error(`Type generation failed: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const { types } = await response.json();
const outFile = path.join(import.meta.dirname, "..", "src", "lib", "supabase", "database.types.ts");
await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, types, "utf8");
console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
