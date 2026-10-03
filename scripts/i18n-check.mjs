// Proves that every text key the code reads exists in the database, and reports how far each language has come.
//
//   npm run i18n:check
//
// The site's words live in public.settings (0109, 0111): the code holds keys, never sentences. A key the code
// reads that has no row prints itself on the page («ui.login.title») — this script finds those before a
// visitor does. It also lists ui.* rows nothing reads any more, and the translation coverage per language.
// Exit code 1 when a key is missing, so it can gate a deploy.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const root = path.join(import.meta.dirname, "..", "src");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") && !full.includes("database.types")) out.push(full);
  }
  return out;
}

// REQUIRED: t(config, "key"), t("key") and any "ui.*" literal (keys kept in maps, e.g. CAPACITY_TEXT_KEYS) — a
// missing one prints the key itself on the page.
// OPTIONAL: settingText / settingJson — a missing one reads as empty and its block simply does not show (the
// owner's «empty hides it» contract), so it is listed for information, never a failure.
const PATTERNS = [
  { required: true, pattern: /\bt\(\s*[A-Za-z_$][\w$.]*\s*,\s*["'`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g },
  { required: true, pattern: /\bt\(\s*["'`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g },
  {
    required: false,
    pattern: /\bsetting(?:Text|Json)(?:<[^>]*>)?\(\s*[A-Za-z_$][\w$.]*\s*,\s*["'`]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g,
  },
  { required: true, pattern: /["'`](ui\.[a-z0-9_]+\.[a-z0-9_.]+)["'`]/g },
];

const used = new Map();
const requiredKeys = new Set();
const dynamicPrefixes = new Set();
for (const file of await walk(root)) {
  // The Back Office reads settings with its own Arabic fallbacks and through createClient; the rule is about
  // what a visitor reads, which is everything outside src/app/admin and src/components/admin.
  // Comments quote keys as examples («t("ui.login.title")»); only code counts.
  const text = (await readFile(file, "utf8"))
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
  // Keys built at run time — `ui.errors.${code}` — make their whole prefix «read».
  for (const match of text.matchAll(/`(ui\.[a-z0-9_.]+?)\$\{/g)) dynamicPrefixes.add(match[1]);
  for (const { required, pattern } of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const key = match[1];
      if (key.endsWith(".") || key.endsWith("_")) continue; // a prefix handed to <Texts prefixes>
      if (!used.has(key)) used.set(key, new Set());
      used.get(key).add(path.relative(path.join(root, ".."), file).replaceAll("\\", "/"));
      if (required) requiredKeys.add(key);
    }
  }
}

const client = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const settings = new Map(
  (await client.query("select key, is_public, value_type from public.settings")).rows.map((row) => [row.key, row]),
);
const locales = (await client.query("select code, name_native, is_enabled from public.locales where code <> 'ar' order by sort_order")).rows;
const translated = (
  await client.query(
    "select locale, count(*) filter (where not is_draft)::int as reviewed, count(*) filter (where is_draft)::int as drafts from public.translations t join public.settings s on s.key = t.entity_key where t.entity = 'setting' and s.is_public group by locale",
  )
).rows;
const publicTexts = (
  await client.query("select count(*)::int as n from public.settings where is_public and value_type in ('text', 'json')")
).rows[0].n;
await client.end();

const missing = [];
const optionalMissing = [];
const internal = [];
for (const [key, files] of used) {
  // Only keys that look like setting keys of the site: a dotted lower-case name whose first segment is a
  // settings prefix in use. Unknown first segments are reported only for ui.*.
  const row = settings.get(key);
  const firstSegment = key.split(".")[0];
  const knownPrefix = [...settings.keys()].some((existing) => existing.startsWith(`${firstSegment}.`));
  if (!row) {
    if (!(key.startsWith("ui.") || knownPrefix)) continue;
    (requiredKeys.has(key) ? missing : optionalMissing).push([key, files]);
  } else if (!row.is_public) {
    const publicReader = [...files].some((file) => !file.startsWith("src/app/admin") && !file.startsWith("src/components/admin"));
    if (publicReader && !key.startsWith("auth.") && !key.startsWith("sms.")) internal.push([key, files]);
  }
}
const unused = [...settings.keys()].filter(
  (key) => key.startsWith("ui.") && !used.has(key) && ![...dynamicPrefixes].some((prefix) => key.startsWith(prefix)),
);

console.log(`Keys read by the code: ${used.size}`);
if (missing.length) {
  console.log(`\nMISSING in public.settings (${missing.length}) — these print as their key on the page:`);
  for (const [key, files] of missing.sort()) console.log(`  ${key}   ← ${[...files].join(", ")}`);
}
if (optionalMissing.length) {
  console.log(`\nOptional, read only when the owner fills them in (${optionalMissing.length}) — empty hides their block:`);
  for (const [key] of optionalMissing.sort()) console.log(`  ${key}`);
}
if (internal.length) {
  console.log(`\nInternal (is_public = false) but read by a public page (${internal.length}) — the site's configuration never loads them:`);
  for (const [key, files] of internal.sort()) console.log(`  ${key}   ← ${[...files].join(", ")}`);
}
if (unused.length) {
  console.log(`\nui.* rows nothing reads (${unused.length}) — safe to delete once confirmed:`);
  for (const key of unused.sort()) console.log(`  ${key}`);
}
console.log(`\nTranslation coverage of the ${publicTexts} public texts:`);
for (const locale of locales) {
  const row = translated.find((item) => item.locale === locale.code) ?? { reviewed: 0, drafts: 0 };
  const total = row.reviewed + row.drafts;
  console.log(
    `  ${locale.code} ${locale.name_native.padEnd(9)} ${String(Math.round((total / Math.max(publicTexts, 1)) * 100)).padStart(3)}%  (${row.reviewed} reviewed, ${row.drafts} drafts)${locale.is_enabled ? "" : "  [switched off]"}`,
  );
}

process.exit(missing.length ? 1 : 0);
