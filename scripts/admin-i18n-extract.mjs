// The Back Office in French (owner, 2026-11-20: «حتى الادمين خليه عربي وفرنسي»).
//
// The Back Office is written in Arabic, in ~200 files. Rather than thread a t() through every one of them, the
// French Back Office translates what the screen shows (src/components/admin/admin-translator.tsx) from one
// dictionary, src/app/admin/i18n/fr.json. This script lists every Arabic sentence the Back Office can show, so
// the dictionary can be checked against it:
//
//   node --env-file=.env scripts/admin-i18n-extract.mjs            → writes node_modules/.cache/admin-i18n-source.json
//   node --env-file=.env scripts/admin-i18n-extract.mjs --missing  → also prints what fr.json does not cover yet
//
// What it reads, with the TypeScript parser (so comments never count):
//   · every JSX text, normalised the way React renders it (one text node per run between tags or braces);
//   · every string literal with Arabic in it;
//   · every template literal with Arabic in it, as a pattern: `${n} زيتونة` → «{0} زيتونة»;
//   · with DIRECT_URL set, the Arabic labels the Back Office reads from the database (statuses, lists, settings).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = process.cwd();
// The list itself is a by-product, kept out of git: the dictionary is the file that matters.
const OUT = path.join(ROOT, "node_modules/.cache/admin-i18n-source.json");
const DICT = path.join(ROOT, "src/app/admin/i18n/fr.json");

const SOURCES = [
  "src/app/admin",
  "src/components/admin",
  "src/components/ui",
  "src/components/brand",
  "src/components/site/navigation-veil.tsx",
  "src/components/site/site-photo.tsx",
  "src/components/site/growth-icon.tsx",
  "src/lib",
];
const SKIP = new Set(["src/lib/supabase/database.types.ts"]);
const ARABIC = /[؀-ۿ]/;

const strings = new Set();
const patterns = new Set();
/** Where each sentence was first met, for whoever translates it (--dump). */
const firstFile = new Map();
let currentFile = "";

function files(entry) {
  const full = path.join(ROOT, entry);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [entry];
  return fs.readdirSync(full).flatMap((name) => files(path.posix.join(entry, name)));
}

/** React's JSX text rule: lines trimmed, blank lines dropped, joined by one space. */
function jsxText(raw) {
  if (!raw.includes("\n")) return raw;
  const lines = raw.split(/\r?\n/);
  const kept = [];
  lines.forEach((line, index) => {
    let text = line.replace(/\t/g, " ");
    if (index > 0) text = text.replace(/^\s+/, "");
    if (index < lines.length - 1) text = text.replace(/\s+$/, "");
    if (text) kept.push(text);
  });
  return kept.join(" ");
}

const clean = (text) => text.replace(/\s+/g, " ").trim();

function add(text) {
  const value = clean(text);
  if (value && ARABIC.test(value)) {
    strings.add(value);
    if (!firstFile.has(value)) firstFile.set(value, currentFile);
  }
}

function visit(node, source) {
  if (ts.isJsxText(node)) {
    add(jsxText(node.getFullText(source)));
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    add(node.text);
  } else if (ts.isTemplateExpression(node)) {
    let template = node.head.text;
    node.templateSpans.forEach((span, index) => {
      template += `{${index}}` + span.literal.text;
    });
    const value = clean(template);
    if (ARABIC.test(value)) {
      patterns.add(value);
      if (!firstFile.has(value)) firstFile.set(value, currentFile);
    }
  }
  ts.forEachChild(node, (child) => visit(child, source));
}

for (const entry of SOURCES) {
  for (const file of files(entry)) {
    if (!/\.(ts|tsx)$/.test(file) || SKIP.has(file)) continue;
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!ARABIC.test(text)) continue;
    currentFile = file;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    visit(source, source);
  }
}

// The database's own Arabic that Back Office screens print: statuses, option lists, flags, setting names and
// their label maps. Read-only. A list item that already has its French (option_items.label_fr) brings it along.
// The settings' long descriptions are left out for now: they are the settings room's help text, ~1 200 of them.
const fromDb = new Set();
const prefilled = {};
if (process.env.DIRECT_URL) {
  const { Client } = require(path.join(ROOT, "node_modules/pg"));
  const client = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const queries = [
    "select label_ar as t from public.lead_statuses",
    "select label_ar as t, label_fr as fr from public.option_items",
    "select label_ar as t from public.option_lists",
    "select label_ar as t from public.feature_flags",
    "select label_ar as t from public.settings",
    "select description_ar as t from public.feature_flags",
    "select label_ar as t, label_fr as fr from public.tree_spacing_classes",
    "select label_ar as t from public.project_types",
    "select v.value #>> '{}' as t from public.settings s, jsonb_each(s.value) v where s.key like '%\\_labels' and jsonb_typeof(s.value) = 'object'",
  ];
  for (const sql of queries) {
    try {
      const { rows } = await client.query(sql);
      for (const row of rows) {
        const value = clean(String(row.t ?? ""));
        if (!value || !ARABIC.test(value) || value.length > 400) continue;
        const fr = clean(String(row.fr ?? ""));
        if (fr && !ARABIC.test(fr)) prefilled[value] = fr;
        else fromDb.add(value);
      }
    } catch (error) {
      console.warn(`skipped (${error.message}): ${sql}`);
    }
  }
  await client.end();
}

const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b, "ar"));
for (const value of Object.keys(prefilled)) fromDb.delete(value);
const out = { strings: sorted(strings), patterns: sorted(patterns), database: sorted(fromDb), prefilled };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`code strings ${out.strings.length} · patterns ${out.patterns.length} · database ${out.database.length} · prefilled ${Object.keys(prefilled).length} → ${path.relative(ROOT, OUT)}`);

const dumpAt = process.argv.indexOf("--dump");
if (dumpAt > 0) {
  const byFile = {};
  for (const value of [...out.strings, ...out.patterns]) (byFile[firstFile.get(value)] ??= []).push(value);
  byFile["(database)"] = out.database;
  fs.writeFileSync(process.argv[dumpAt + 1], JSON.stringify(byFile, null, 1));
}

if (process.argv.includes("--missing") && fs.existsSync(DICT)) {
  const dict = JSON.parse(fs.readFileSync(DICT, "utf8"));
  const exact = new Set(Object.keys(dict.exact ?? {}));
  const known = new Set((dict.patterns ?? []).map(([ar]) => ar));
  const missing = [
    ...out.strings.filter((s) => !exact.has(s)),
    ...out.database.filter((s) => !exact.has(s) && !(s in prefilled)),
    ...out.patterns.filter((s) => !known.has(s)),
  ];
  console.log(`missing from fr.json: ${missing.length}`);
  for (const line of missing.slice(0, 200)) console.log("  " + line);
}
