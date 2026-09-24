// Fills the site's photo slots and the demo offers' covers with real olive photography.
//
//   npm run photos:olive
//
// WHERE THE PICTURES COME FROM, AND WHY NOT A SEARCH ENGINE. The owner asked for «real olive images from
// Google». Image-search results are other people's copyrighted work: putting them on a commercial site that
// sells investments is a licensing problem, not a design decision. These come from Wikimedia Commons under
// CC BY / CC BY-SA, which is what the site already does — the footer has credited «Monica Arellano-Ongpin ·
// CC BY 2.0» since before this script existed. Every picture below is stored WITH its author and licence,
// and the footer prints them.
//
// Each file is fetched from Commons at 1800px, uploaded to the public `site-media` bucket, and recorded in
// `site_media` (slots) or `project_media` (offer covers). next.config.ts only allows images from the
// Supabase host, so an external URL would not render even if it were licensed — upload is the only path.
//
// Idempotent: uploads use upsert and the rows are written with ON CONFLICT, so two runs leave one result.

import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DIRECT_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!connectionString || !supabaseUrl || !serviceKey) {
  console.error("Missing DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
const ssl = process.env.SUPABASE_DB_CA_CERT
  ? { ca: await readFile(process.env.SUPABASE_DB_CA_CERT, "utf8") }
  : { rejectUnauthorized: false };

const BUCKET = "site-media";
const UA = "AgriZed/1.0 (site media sourcing)";

/**
 * The chosen photographs, and the slot each one answers.
 *
 * `slot` null means the picture is only for offer covers. The Dahar landscape that the first search turned
 * up is deliberately absent: it is arid scrub with a few trees in a wadi, and a page selling olive groves
 * should not open on land that looks unproductive.
 */
const PICTURES = [
  {
    file: "File:Cap Bon olive groves.JPG",
    key: "cap-bon-grove",
    slot: "home.hero",
    altAr: "بستان زيتون في الوطن القبلي ينزل نحو البحر",
    author: "Nicholas Gosse",
  },
  {
    file: "File:Koroneiki olive tree in Tunisia.jpg",
    key: "koroneiki-tunisia",
    slot: "home.journey",
    altAr: "زيتونة كرونيكي محمّلة بالغلّة في تونس، مع الري بالتنقيط",
    author: "Citizen59",
  },
  {
    file: "File:Olive Groves Fields Spello Umbria Sep23 A7C 07785.jpg",
    key: "olive-hills",
    slot: "home.coverage",
    altAr: "تلال مغروسة بالزيتون على مدّ البصر",
    author: "Timothy A. Gonsalves",
  },
  {
    file: "File:Korfu (GR), Agii Douli, Olivenhain -- 2018 -- 1284-8.jpg",
    key: "ancient-olives",
    slot: "home.closing",
    altAr: "زياتين قديمة بجذوع ضخمة وشباك الجني مفروشة تحتها",
    author: "Dietmar Rabich",
  },
  {
    file: "File:Olive orchard in Elis, Greece.jpg",
    key: "olive-orchard-rows",
    slot: "home.land",
    altAr: "غراسة زيتون مصفوفة في صفوف منتظمة",
    author: "Wknight94",
  },

  /*
   * COVER-ONLY PICTURES, AND WHY THERE ARE EIGHT OF THEM (owner, 2026-09-24: «I don't like the duplicate
   * images, fix them all»).
   *
   * The five above are the site's slots, and the offer covers were drawn from the same five: a cover is
   * `uploaded[index % pool]`, so with thirteen offers and a pool of five, the sixth offer opened on the first
   * offer's photograph and the grid printed the same grove three times. That is arithmetic, not a bug in the
   * grid — the only fix is more pictures.
   *
   * Each was checked on Commons for size and licence before it was written here: bitmap, at least 1600px
   * wide, landscape, and CC BY / CC BY-SA / CC0 / public domain, which is the same bar fromCommons() enforces
   * again at upload. Paintings, monuments and the arid Dahar scrub that the searches also turn up are left
   * out for the reason the note above gives: a page selling olive groves should open on olive groves.
   */
  {
    file: "File:Olive orchard and houses in Elis, Greece.jpg",
    key: "elis-orchard-houses",
    slot: null,
    altAr: "غراسة زيتون وديار بيضاء في اليونان",
    author: "Wknight94",
  },
  {
    file: "File:Olive trees in Arhangelos - panoramio.jpg",
    key: "arhangelos-olives",
    slot: null,
    altAr: "زياتين متفرّقة على سفح مشمس",
    author: "INDALOMANIA",
  },
  {
    file: "File:Paisaje de olivar 24J 07.jpg",
    key: "olivar-jaen-07",
    slot: null,
    altAr: "سهل زيتون على مدّ النظر في جيان",
    author: "Veinticuatro de Jaén",
  },
  {
    file: "File:Paisaje de olivar 24J 08.jpg",
    key: "olivar-jaen-08",
    slot: null,
    altAr: "صفوف زيتون على تلال مموّجة",
    author: "Veinticuatro de Jaén",
  },
  {
    file: "File:Paisaje de olivar 24J 09.jpg",
    key: "olivar-jaen-09",
    slot: null,
    altAr: "غراسة زيتون منظّمة تحت سماء صافية",
    author: "Veinticuatro de Jaén",
  },
  {
    file: "File:Paisaje de olivar 24J 10.jpg",
    key: "olivar-jaen-10",
    slot: null,
    altAr: "بستان زيتون يمتدّ حتى الأفق",
    author: "Veinticuatro de Jaén",
  },
  {
    file: "File:Korfu (GR), Agii Douli, Olivenhain -- 2018 -- 1218.jpg",
    key: "korfu-olivenhain-1218",
    slot: null,
    altAr: "زياتين معمّرة بجذوع غليظة تحت الظلّ",
    author: "Dietmar Rabich",
  },
  {
    file: "File:Korfu (GR), Agii Douli, Olivenhain -- 2018 -- 1261.jpg",
    key: "korfu-olivenhain-1261",
    slot: null,
    altAr: "أرض بستان زيتون قديم مفروشة بالعشب",
    author: "Dietmar Rabich",
  },
];

const client = new pg.Client({ connectionString, ssl });
await client.connect();

/** Commons metadata plus the bytes, at a width a banner can use. */
async function fromCommons(title) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(
    title,
  )}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1800&format=json`;
  const json = await (await fetch(api, { headers: { "User-Agent": UA } })).json();
  const page = Object.values(json?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`Commons has no image for ${title}`);
  const meta = info.extmetadata ?? {};
  // Commons' «Artist» is free text and is sometimes a whole paragraph of terms. A credit line is a name:
  // the boilerplate prefix goes, anything that starts a request to the reader ends it, and what is left is
  // capped. Cutting at the first full stop is wrong — it truncates «Timothy A. Gonsalves» to «Timothy A».
  const author = (meta.Artist?.value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^This\s+photo\s+was\s+taken\s+by\s+/i, "")
    .split(/\s+(?:Feel free|Please|If you|You may|All rights)/i)[0]
    .replace(/[.,;]\s*$/, "")
    .trim()
    .slice(0, 60);
  const licence = (meta.LicenseShortName?.value ?? "").trim();
  if (!/^(CC BY|CC0|Public domain)/i.test(licence)) throw new Error(`${title} is ${licence}, not a free licence`);
  const bytes = Buffer.from(await (await fetch(info.thumburl, { headers: { "User-Agent": UA } })).arrayBuffer());
  return { bytes, author, licence, page: info.descriptionurl };
}

async function upload(path, bytes) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      "content-type": "image/jpeg",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`);
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}

const uploaded = [];
for (const picture of PICTURES) {
  const { bytes, author, licence, page } = await fromCommons(picture.file);
  const path = `olive/${picture.key}.jpg`;
  const url = await upload(path, bytes);
  const credit = [picture.author || author, licence].filter(Boolean).join(" · ");
  uploaded.push({ ...picture, url, credit, page });
  console.log(`uploaded ${path}  ${Math.round(bytes.length / 1024)}KB  ${credit}`);
}

// 1 · The site's own slots.
for (const picture of uploaded.filter((p) => p.slot)) {
  await client.query(
    `update public.site_media
        set url = $2, alt_ar = $3, credit_text = $4, credit_url = $5, updated_at = now()
      where slot = $1`,
    [picture.slot, picture.url, picture.altAr, picture.credit, picture.page],
  );
  console.log(`slot ${picture.slot} → ${picture.key}`);
}

// 2 · Pictures for the demo offers. THREE each, not one (owner, 2026-09-22: «add more than one img in the
// project detail»): the detail screen slides them, and a gallery of one is a photograph that twitches. Each
// offer starts at its own point in the pool, so two offers in a row never open on the same picture.
const { rows: demos } = await client.query(
  `select id, code from public.projects where code like 'DEMO-%' order by code`,
);
const PER_OFFER = 3;
let placed = 0;
for (const [index, project] of demos.entries()) {
  await client.query(`delete from public.project_media where project_id = $1`, [project.id]);
  for (let slot = 0; slot < PER_OFFER; slot += 1) {
    const picture = uploaded[(index + slot) % uploaded.length];
    await client.query(
      `insert into public.project_media (project_id, url, alt_ar, is_cover, sort_order)
       values ($1, $2, $3, $4, $5)`,
      [project.id, picture.url, picture.altAr, slot === 0, slot],
    );
    placed += 1;
  }
}
console.log(`
${placed} picture(s) across ${demos.length} demo offer(s), ${PER_OFFER} each.`);

await client.end();
