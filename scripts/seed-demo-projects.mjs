// Seeds fifteen DEMO projects with parcels so the projects module can be previewed before the first
// real property exists. Everything stays `internal` (staff-only, never public), every code starts
// with DEMO- and every name says «تجريبي», and one command removes it all.
//
//   npm run demo:projects            # create (idempotent: existing DEMO codes are left alone)
//   npm run demo:projects -- --purge # delete every DEMO- project, its parcels and its costs
//
// Reads DIRECT_URL from .env. Data is deterministic, so two runs on two databases match.
// PARC-01/02: area, tree count, plantation system, production status and price are set
// independently below; nothing is computed from anything else.

import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  console.error("DIRECT_URL is missing from .env");
  process.exit(1);
}
const ssl = process.env.SUPABASE_DB_CA_CERT
  ? { ca: await readFile(process.env.SUPABASE_DB_CA_CERT, "utf8") }
  : { rejectUnauthorized: false };

const purge = process.argv.includes("--purge");

// Small deterministic generator so the demo looks varied but never changes between runs.
let seed = 20260912;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const roundTo = (value, step) => Math.round(value / step) * step;

// Fifteen olive regions, with the delegation to look up and an approximate position.
const PLACES = [
  { gov: 34, delegation: "الشعال", name: "ضيعة الشعال", lat: 34.55, lng: 10.30 },
  { gov: 43, delegation: "الرقاب", name: "زيتون الرقاب", lat: 34.86, lng: 9.78 },
  { gov: 41, delegation: "حفوز", name: "غابة حفوز", lat: 35.63, lng: 9.68 },
  { gov: 33, delegation: "الشابة", name: "ضيعة الشابة", lat: 35.23, lng: 11.11 },
  { gov: 32, delegation: "جمال", name: "زيتون جمّال", lat: 35.62, lng: 10.76 },
  { gov: 31, delegation: "النفيضة", name: "ضيعة النفيضة", lat: 36.13, lng: 10.38 },
  { gov: 52, delegation: "جرجيس", name: "زيتون جرجيس", lat: 33.50, lng: 11.11 },
  { gov: 16, delegation: "الفحص", name: "أرض الفحص", lat: 36.37, lng: 9.91 },
  { gov: 21, delegation: "تستور", name: "ضيعة تستور", lat: 36.55, lng: 9.44 },
  { gov: 15, delegation: "قربة", name: "زيتون قربة", lat: 36.63, lng: 10.86 },
  { gov: 42, delegation: "سبيطلة", name: "أرض سبيطلة", lat: 35.24, lng: 9.12 },
  { gov: 51, delegation: "مارث", name: "ضيعة مارث", lat: 33.63, lng: 10.28 },
  { gov: 24, delegation: "بوعرادة", name: "زيتون بوعرادة", lat: 36.18, lng: 9.62 },
  { gov: 23, delegation: "الدهماني", name: "ضيعة الدهماني", lat: 35.95, lng: 8.83 },
  { gov: 22, delegation: "بوسالم", name: "أرض بوسالم", lat: 36.61, lng: 8.97 },
];

// The four starting points, rotated so every type appears.
const KINDS = [
  { type: "productive", system: "traditional", status: "producing", ageYears: [25, 80], property: "planted" },
  { type: "near_production", system: "intensive", status: "starting", ageYears: [4, 7], property: "planted" },
  { type: "young_olive", system: "traditional", status: "none", ageYears: [1, 3], property: "planted" },
  { type: "bare_land", system: null, status: "none", ageYears: null, property: "bare_land" },
];
const VARIETIES = ["شملالي", "شتوي", "أوسلاتي", "زلماطي", "زرازي", "جربوعي"];

const client = new pg.Client({ connectionString, ssl });
await client.connect();

try {
  if (purge) {
    await client.query("begin");
    const { rows } = await client.query("select id from public.projects where code like 'DEMO-%'");
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await client.query("delete from public.project_costs where project_id = any($1)", [ids]);
      await client.query("delete from public.parcels where project_id = any($1)", [ids]);
      await client.query("delete from public.projects where id = any($1)", [ids]);
    }
    await client.query("commit");
    console.log(`Removed ${ids.length} demo project(s).`);
    process.exit(0);
  }

  const { rows: types } = await client.query("select id, code from public.project_types");
  const typeId = Object.fromEntries(types.map((row) => [row.code, row.id]));
  const { rows: existing } = await client.query("select code from public.projects where code like 'DEMO-%'");
  const have = new Set(existing.map((row) => row.code));

  let created = 0;
  for (const [index, place] of PLACES.entries()) {
    const code = `DEMO-${String(index + 1).padStart(2, "0")}`;
    if (have.has(code)) continue;

    const kind = KINDS[index % KINDS.length];
    const { rows: delegations } = await client.query(
      "select id from public.delegations where governorate_id = $1 order by (name_ar = $2) desc, sort_order limit 1",
      [place.gov, place.delegation],
    );

    // Project-level facts. Tree count is chosen on its own, never from the area (PARC-02).
    const totalArea = roundTo(between(8000, 60000), 500);
    const treeCount = kind.type === "bare_land" ? 0 : kind.system === "intensive" ? between(300, 2400) : between(60, 500);
    const treeAge = kind.ageYears ? between(kind.ageYears[0], kind.ageYears[1]) : null;
    const irrigation = kind.system === "intensive" ? "irrigated" : pick(["rainfed", "rainfed", "irrigated"]);

    await client.query("begin");
    const {
      rows: [project],
    } = await client.query(
      `insert into public.projects
         (code, name, project_type_id, governorate_id, delegation_id, location_description, latitude, longitude,
          total_area_m2, olive_variety, tree_count, tree_age_years, plantation_system, production_status, irrigation,
          annual_costs_millimes, legal_notes, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'internal')
       returning id`,
      [
        code,
        `${place.name} (تجريبي)`,
        typeId[kind.type],
        place.gov,
        delegations[0]?.id ?? null,
        `مشروع تجريبي للمعاينة الداخلية فقط. ${kind.type === "bare_land" ? "أرض بيضاء قابلة للغراسة" : "ضيعة زيتون"} قرب ${place.delegation}، على طريق معبّدة.`,
        (place.lat + (rand() - 0.5) * 0.08).toFixed(6),
        (place.lng + (rand() - 0.5) * 0.08).toFixed(6),
        totalArea,
        kind.type === "bare_land" ? null : pick(VARIETIES),
        treeCount,
        treeAge,
        kind.system,
        kind.status,
        irrigation,
        roundTo(between(120, 900), 10) * 1000,
        "بيانات تجريبية — لا تعكس أي عقار حقيقي. (ملاحظة داخلية، يجب ألا تظهر للعموم أبداً.)",
      ],
    );

    // Costs are finance-only data; the demo carries some so a leak would be visible in tests.
    await client.query(
      `insert into public.project_costs (project_id, kind, label, amount_millimes, note) values
         ($1, 'purchase', 'ثمن الشراء (تجريبي)', $2, 'داخلي'),
         ($1, 'development', 'تهيئة وغراسة (تجريبي)', $3, 'داخلي')`,
      [project.id, roundTo(between(150, 900), 10) * 1000000, roundTo(between(20, 200), 10) * 1000000],
    );

    // Parcels: sizes, tree counts, systems and prices are all set independently (PARC-01/02).
    const parcelCount = between(3, 8);
    for (let n = 1; n <= parcelCount; n += 1) {
      const area = pick([400, 500, 500, 750, 1000, 1000, 1500, 2000, 2500]);
      const parcelSystem = kind.type === "bare_land" ? null : kind.system === "intensive" ? "intensive" : pick(["traditional", "traditional", "intensive"]);
      const parcelTrees =
        kind.type === "bare_land" ? 0 : parcelSystem === "intensive" ? between(15, 90) : between(3, 30);
      const parcelStatus = pick(["available", "available", "available", "available", "interested", "reserved", "sold"]);
      // Price per m² by starting point, then a spread, then rounded — never a function of the tree count.
      const perM2 = { productive: [14000, 22000], near_production: [11000, 17000], young_olive: [8000, 13000], bare_land: [4500, 8000] }[kind.type];
      const cash = roundTo(area * between(perM2[0], perM2[1]), 100000);

      await client.query(
        `insert into public.parcels
           (project_id, code, area_m2, property_type, plantation_system, olive_tree_count, tree_age_years,
            production_status, irrigation, cash_price_millimes, annual_costs_millimes, status, notes, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          project.id,
          `P${String(n).padStart(2, "0")}`,
          area,
          kind.property,
          parcelSystem,
          parcelTrees,
          treeAge,
          kind.status,
          irrigation,
          cash,
          roundTo(between(30, 140), 5) * 1000,
          parcelStatus,
          "قطعة تجريبية.",
          n * 10,
        ],
      );
    }
    await client.query("commit");
    created += 1;
    console.log(`${code}  ${place.name}  ${kind.type.padEnd(15)} ${totalArea} m²  ${treeCount} trees  ${parcelCount} parcels`);
  }
  console.log(`Created ${created} demo project(s); ${have.size} already existed. All are 'internal' — never public.`);

  // Report v3 §20: the project page fields, filled once for demo projects that have none yet.
  // Skipped on a database that does not have those columns yet.
  const { rows: pageColumns } = await client.query(
    "select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'description_ar'",
  );
  if (pageColumns.length > 0) {
    const { rows: items } = await client.query(
      "select id, list_key, code from public.option_items where list_key in ('land_document', 'agrized_service') and is_active order by sort_order",
    );
    const documents = items.filter((item) => item.list_key === "land_document" && item.code !== "other").map((item) => item.id);
    const services = items.filter((item) => item.list_key === "agrized_service").map((item) => item.id);
    const { rows: bare } = await client.query(
      "select id, irrigation from public.projects where code like 'DEMO-%' and description_ar is null order by code",
    );

    await client.query("begin");
    for (const project of bare) {
      const [waterAvailable, waterNote] =
        project.irrigation === "irrigated"
          ? [true, pick(["بئر عميقة داخل الضيعة", "شبكة ري جماعية قرب الضيعة"])]
          : pick([[true, "ماجل لتجميع مياه الأمطار"], [false, null], [null, null]]);
      await client.query(
        `update public.projects
            set description_ar = $2, water_available = $3, water_note = $4, access_note = $5, show_location = true,
                document_option_ids = $6, service_option_ids = $7
          where id = $1`,
        [
          project.id,
          "مشروع تجريبي للمعاينة الداخلية فقط، لا يمثّل أي عقار حقيقي.\nهذا النص يبيّن كيفاش يظهر وصف المشروع: الضيعة، الطريق، ووين القطع.",
          waterAvailable,
          waterNote,
          `طريق ${pick(["معبّدة", "فلاحية"])} على بعد ${between(1, 6)} كم من الطريق الرئيسية.`,
          documents.filter(() => rand() < 0.6),
          services.filter(() => rand() < 0.5),
        ],
      );
    }
    await client.query("commit");
    console.log(`Filled the project page fields of ${bare.length} demo project(s).`);
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
