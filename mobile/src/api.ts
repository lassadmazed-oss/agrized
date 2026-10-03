import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

// The PRJ-03 guard, imported rather than restated — see `treePrice` below. src/format.ts imports nothing of
// ours, so this edge adds no cycle (config.ts → api.ts → format.ts → nothing).
import { treePriceMillimes } from "./format";

/**
 * Where the app's data comes from, and the one rule that decides which door it uses.
 *
 * READING GOES STRAIGHT TO POSTGRES. `public_projects`, `public_project_page`, `public_offer_stock` and
 * `public_project_quote` are granted to `anon` (migrations 0020/0023/0034/0054), which is exactly what the
 * anon key is for: they return only what the website already shows a stranger, and every row is filtered
 * inside the function. So the app reads the same offers the site reads, from the same place, with no server in
 * between to go down.
 *
 * WRITING CANNOT. `submit_interest_request` and `submit_offer_request` are granted to `service_role` ALONE —
 * deliberately, because they write a person and a demand and they carry the intake's own protections. The
 * service key must never be in an app: anything shipped to a phone is readable, and that key can read and
 * rewrite every table in the business. So a submission is POSTed to the website, which holds the key on its
 * own server (/api/mobile/interest). The app never sees it.
 *
 * That split is the whole architecture: reads are cheap, public and direct; writes go through one audited
 * endpoint. Verified against the live database on 2026-10-03: both submit RPCs answer `anon` with 42501
 * permission denied, and `projects`, `trees`, `persons` and `interest_requests` are unreadable row by row.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * WHY THIS IS NOT JUST `createClient(url, key)`.
 *
 * With either value empty, `createClient` THROWS `supabaseUrl is required.` — and it throws while this module
 * is being imported, which in a bundled app means the first frame is a red screen rather than a screen with
 * nothing in it. There was no `mobile/.env` and `eas.json` set only EXPO_PUBLIC_SITE_URL, so every build made
 * from this tree crashed on launch, and it typechecked and bundled cleanly because an empty string is a
 * perfectly good string.
 *
 * So the client is always constructed — against an address that cannot resolve, when there is nothing to
 * construct it from — and every read below refuses first with a sentence that names the fault. The app then
 * fails the way an app fails: one screen saying what is wrong, not a stack trace.
 */
export const configError: string | null =
  supabaseUrl && supabaseAnonKey
    ? null
    : "إعدادات الاتصال ناقصة: EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY. حطّهم في mobile/.env (شوف mobile/.env.example) ولا في eas.json.";

/** The website, for the one thing the anon key may not do. */
export const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.agrized.site";

export const supabase = createClient(supabaseUrl || "https://unconfigured.invalid", supabaseAnonKey || "unconfigured", {
  auth: {
    // Nobody signs in. Without this the client keeps a session it will never have and tries to refresh a
    // token that does not exist, on a timer, forever.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/** Every read goes through this first, so a missing key is one sentence and never a crash. */
function assertConfigured(): void {
  if (configError) throw new Error(configError);
}

// ---------------------------------------------------------------------------------------------------------
// One offer of the catalogue
// ---------------------------------------------------------------------------------------------------------

/**
 * A row of `public_projects()`, named exactly as the function returns it (migration 0118:660) so the two can
 * be read against each other.
 *
 * `on_tree_pricing` and `status` were missing and are the two the price gate needs — see `treePrice` below.
 */
export type Offer = {
  id: string;
  code: string;
  name: string;
  governorate_id: number;
  delegation_id: number | null;
  location_description: string | null;
  olive_variety: string | null;
  tree_count: number | null;
  tree_age_years: number | null;
  plantation_system: string | null;
  production_status: string | null;
  irrigation: string | null;
  total_area_m2: number | null;
  /** 'published' | 'internal' | 'sold_out' | 'operating' — what `app.project_visible` let through. */
  status: string;
  /** The database's own definition: `pj.status = 'published'`. */
  offered: boolean;
  /** `app.project_sells_by_tree` — the offer lists spacing classes, so a tree has a price at all. */
  on_tree_pricing: boolean;
  min_price_per_tree_millimes: number | null;
  min_cash_price_millimes: number | null;
  area_per_tree_min_m2: number | null;
  area_per_tree_max_m2: number | null;
  cover_url: string | null;
  cover_alt_ar: string | null;
};

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

function toOffer(row: Record<string, unknown>): Offer {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name ?? ""),
    governorate_id: Number(row.governorate_id ?? 0),
    delegation_id: numberOrNull(row.delegation_id),
    location_description: textOrNull(row.location_description),
    olive_variety: textOrNull(row.olive_variety),
    tree_count: numberOrNull(row.tree_count),
    tree_age_years: numberOrNull(row.tree_age_years),
    plantation_system: textOrNull(row.plantation_system),
    production_status: textOrNull(row.production_status),
    irrigation: textOrNull(row.irrigation),
    total_area_m2: numberOrNull(row.total_area_m2),
    status: String(row.status ?? ""),
    offered: row.offered === true,
    on_tree_pricing: row.on_tree_pricing === true,
    min_price_per_tree_millimes: numberOrNull(row.min_price_per_tree_millimes),
    min_cash_price_millimes: numberOrNull(row.min_cash_price_millimes),
    area_per_tree_min_m2: numberOrNull(row.area_per_tree_min_m2),
    area_per_tree_max_m2: numberOrNull(row.area_per_tree_max_m2),
    cover_url: textOrNull(row.cover_url),
    cover_alt_ar: textOrNull(row.cover_alt_ar),
  };
}

/**
 * Every offer this visitor may see, in the order the function returns them — published first, newest first.
 *
 * NOTHING IS FILTERED HERE, deliberately. The two surfaces want two different sets and both are the site's:
 * the catalogue lists the closed offers after the open ones (`[...open, ...closed]`), and the home lists only
 * what is actually for sale. Filtering inside the read would make one of them wrong, and it did: the app
 * dropped `sold_out` and `operating` outright, so «مكتمل البيع» — a state the owner publishes on purpose —
 * never reached the phone. See `liveOffers` and `catalogueOffers`.
 */
export async function fetchOffers(): Promise<Offer[]> {
  assertConfigured();
  const { data, error } = await supabase.rpc("public_projects");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toOffer);
}

/**
 * What is actually on sale — `liveOffers()` on the site (src/app/[lang]/(public)/page.tsx:44).
 *
 * The tree count matters: an offer that sold its last tree is off the website's home and used to stay on the
 * app's, because the app tested `offered` alone.
 */
export function liveOffers(offers: readonly Offer[]): Offer[] {
  return offers.filter((offer) => offer.offered && (offer.tree_count ?? 0) > 0);
}

/**
 * The catalogue's order: the offers still selling, then the ones that have stopped
 * (src/app/[lang]/(public)/projects/page.tsx:179). A closed offer keeps its place in the list and wears its
 * status word — it is a fact about the grove, not a row to hide.
 */
export function catalogueOffers(offers: readonly Offer[]): Offer[] {
  const open = offers.filter((offer) => offer.status === "published" || offer.status === "internal");
  const closed = offers.filter((offer) => offer.status === "sold_out" || offer.status === "operating");
  return [...open, ...closed];
}

/**
 * What one olive tree of this offer costs, in millimes, or null when NO price may be shown — and then the
 * screen prints the owner's own `projects.price_pending` instead.
 *
 * PRJ-03, STATED ON THIS SIDE OF THE WIRE TOO. `public_projects()` already answers
 * `case when pj.status = 'published' and app.module_open('pricing') then … end`, and `app.module_open`
 * resolves «internal» through `app.is_staff()`, which is false for the anon key — so the database genuinely
 * cannot hand this app a price the website is withholding, and I verified that against the live function.
 *
 * It is checked again anyway, exactly as `offerTreePrice()` checks it again on the site
 * (src/components/site/offers.tsx:234), because the app was one data state away from printing a figure the
 * website would not: it tested `min_price_per_tree_millimes !== null` alone and carried neither `offered` nor
 * `on_tree_pricing` in its type at all. A gate that only exists at the far end is a gate nobody can see.
 *
 * IT IS A FORWARD TO `treePriceMillimes` AND NOT A SECOND COPY. Both spellings existed for a while, this one
 * falsy and the other `=== false`, and they disagreed on a row that did not carry the columns at all; two
 * implementations of one rule is two rules the day somebody edits one of them. The name stays because the
 * offer screens call it, and the body is one line because the rule lives in src/format.ts.
 */
export function treePrice(offer: Offer, pricingOpen = true): number | null {
  return treePriceMillimes(offer, pricingOpen);
}

/**
 * The offer's own area per tree (57,600 م² over 100 زيتونة → 576 م²), read off the two facts it publishes.
 * An area is not a price: no cost, no margin and no formula is derived here (`areaPerTree`,
 * src/components/site/offers.tsx:220).
 */
export function areaPerTree(offer: Offer): number | null {
  if (offer.area_per_tree_min_m2) return offer.area_per_tree_min_m2;
  if (!offer.total_area_m2 || !offer.tree_count) return null;
  return offer.total_area_m2 / offer.tree_count;
}

// ---------------------------------------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------------------------------------

export type Governorate = { id: number; name_ar: string };

/**
 * The governorates, for turning an id into «صفاقس».
 *
 * SUPERSEDED BY `config.ts`, which reads them with the rest of the owner's configuration and names them
 * `{ id, name }`. It is kept because `InterestForm.tsx` still calls it, and because it was missing the
 * website's own `is_active` filter (src/lib/config.ts:92): without it the form offers a place that
 * `submit_interest_request` then refuses with `invalid_governorate`, so the visitor is told off for a choice
 * the app put in front of them.
 */
export async function fetchGovernorates(): Promise<Governorate[]> {
  assertConfigured();
  const { data, error } = await supabase
    .from("governorates")
    .select("id, name_ar")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Governorate[];
}

/**
 * One delegation's name, read only when it is actually going to be printed.
 *
 * The offer screen's place line is `location_description` when that text already names the governorate, and
 * «governorate · delegation» only when it does not (page.tsx:233). All three live offers name their
 * governorate in their own description, so the delegation is never printed today — and `public.delegations`
 * is 264 rows, which is not a payload to carry on every offer screen for a line that does not appear. So it
 * is asked for by id, at the moment the fallback is needed, and never otherwise.
 *
 * `is_active` matches `loadPublicConfig`, which only lists active ones.
 */
export async function fetchDelegationName(id: number): Promise<string | null> {
  if (configError) return null;
  const { data, error } = await supabase
    .from("delegations")
    .select("name_ar")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return null;
  return textOrNull((data as { name_ar?: unknown } | null)?.name_ar);
}

// ---------------------------------------------------------------------------------------------------------
// The stock of one offer, counted in trees
// ---------------------------------------------------------------------------------------------------------

/**
 * 'ok'            → the four counts are real and may be shown.
 * 'not_generated' → no tree row exists yet, so the stock is UNKNOWN, not empty. «0 متاحة» would be a lie
 *                   (migration 0054 says so itself), so a screen shows no count and names what the offer
 *                   declares instead.
 * 'partial'       → the rows disagree with the declared tree_count; the Back Office regenerates.
 */
export type StockStatus = "ok" | "not_generated" | "partial";

export type OfferStock = {
  projectId: string;
  declared: number | null;
  total: number;
  available: number;
  reserved: number;
  sold: number;
  /** Smallest basket this offer sells (projects.min_trees_per_order, else offers.min_trees_default). */
  minTrees: number;
  status: StockStatus;
};

/** True while the four counts are worth printing (`stockCounted`, src/components/site/offers.tsx:56). */
export function stockCounted(stock: OfferStock | null | undefined): stock is OfferStock {
  return Boolean(stock && stock.status !== "not_generated");
}

function toStock(data: unknown): OfferStock | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const status = row.status;
  const num = (value: unknown) => Number(value ?? 0);
  return {
    projectId: String(row.project_id ?? ""),
    declared: numberOrNull(row.trees_declared),
    total: num(row.trees_total),
    available: num(row.trees_available),
    reserved: num(row.trees_reserved),
    sold: num(row.trees_sold),
    minTrees: Math.max(1, num(row.min_trees)),
    status: status === "ok" || status === "partial" ? status : "not_generated",
  };
}

/**
 * The counts of one offer, or null when they cannot be read. A screen that gets null shows no count rather
 * than a zero. `public_offer_stock` carries no money key at all and is gated on the `projects` module alone —
 * stock is a fact, a price is a permission.
 */
export async function fetchStock(projectId: string): Promise<OfferStock | null> {
  assertConfigured();
  const { data, error } = await supabase.rpc("public_offer_stock", { p_project: projectId });
  if (error) return null;
  return toStock(data);
}

/**
 * The same for a list of offers, in one round of parallel calls: `public_offer_stock` takes one project and
 * there is no set-returning public twin, so the catalogue asks once per offer — which is what the website
 * does too (`getOfferStocks`).
 *
 * A single offer that fails is simply absent from the map, so one bad answer costs that row its figures and
 * nothing else its row.
 */
export async function fetchStocks(projectIds: readonly string[]): Promise<Map<string, OfferStock>> {
  const ids = [...new Set(projectIds)];
  const rows = await Promise.all(ids.map(async (id) => [id, await fetchStock(id).catch(() => null)] as const));
  const stocks = new Map<string, OfferStock>();
  for (const [id, stock] of rows) if (stock) stocks.set(id, stock);
  return stocks;
}

// ---------------------------------------------------------------------------------------------------------
// The rest of one offer's page
// ---------------------------------------------------------------------------------------------------------

/** One picture of an offer. `alt` and `caption` are the Arabic the team typed. */
export type OfferPicture = { id: string; url: string; alt: string; caption: string | null; isCover: boolean };

/** Report v3 §20: what `public_project_page()` adds to a listing row (migration 0023:207). */
export type OfferPage = {
  description: string | null;
  waterAvailable: boolean | null;
  waterNote: string | null;
  accessNote: string | null;
  videoUrl: string | null;
  /** Both null unless the team ticked «إظهار الموقع» — the function itself withholds them otherwise. */
  latitude: number | null;
  longitude: number | null;
  documentOptionIds: string[];
  serviceOptionIds: string[];
  media: OfferPicture[];
};

export async function fetchOfferPage(code: string): Promise<OfferPage | null> {
  assertConfigured();
  const { data, error } = await supabase.rpc("public_project_page", { p_code: code });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const ids = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  const media = Array.isArray(row.media) ? (row.media as Record<string, unknown>[]) : [];
  return {
    description: textOrNull(row.description_ar),
    waterAvailable: typeof row.water_available === "boolean" ? row.water_available : null,
    waterNote: textOrNull(row.water_note),
    accessNote: textOrNull(row.access_note),
    videoUrl: textOrNull(row.video_url),
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    documentOptionIds: ids(row.document_option_ids),
    serviceOptionIds: ids(row.service_option_ids),
    media: media.map((picture) => ({
      id: String(picture.id),
      url: String(picture.url),
      alt: String(picture.alt_ar ?? ""),
      caption: textOrNull(picture.caption_ar),
      isCover: picture.is_cover === true,
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------
// The offer's own quote
// ---------------------------------------------------------------------------------------------------------

/**
 * What `public_project_quote` answers about the price (migration 0034). Only «ok» carries figures; the other
 * four are the function's own reasons for carrying none, and the screen says `projects.price_pending`.
 */
export type QuotePricing = "closed" | "not_offered" | "legacy" | "unavailable" | "ok";

/**
 * One offer's quote for a basket, as far as this screen needs it: the price of a tree, and the biggest basket
 * the offer sells.
 *
 * THE APP NEVER MULTIPLIES. Every amount here is a figure Postgres answered with — the site's own rule and
 * the reason it exists: a markup, a down payment and a monthly instalment are not multiplications, and the
 * calculator screen is where the rest of this payload belongs.
 */
export type OfferQuote = {
  pricing: QuotePricing;
  pricePerTreeMillimes: number | null;
  totalPriceMillimes: number | null;
  treesMax: number | null;
};

const PRICINGS: readonly QuotePricing[] = ["closed", "not_offered", "legacy", "unavailable", "ok"];

export async function fetchOfferQuote(projectId: string, trees: number): Promise<OfferQuote | null> {
  assertConfigured();
  const { data, error } = await supabase.rpc("public_project_quote", { p_project: projectId, p_trees: trees });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const pricing = PRICINGS.includes(row.pricing as QuotePricing) ? (row.pricing as QuotePricing) : "closed";
  return {
    pricing,
    // The figures are read only out of an «ok» answer, which is how `toProjectQuote` reads them too: the
    // other states carry stale or absent money and must never reach a screen.
    pricePerTreeMillimes: pricing === "ok" ? numberOrNull(row.price_per_tree_millimes) : null,
    totalPriceMillimes: pricing === "ok" ? numberOrNull(row.total_price_millimes) : null,
    treesMax: numberOrNull(row.trees_max),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Photographs, at the size they are shown
// ---------------------------------------------------------------------------------------------------------

/**
 * A storage URL asked for at the size it will be drawn, instead of at the size it was uploaded.
 *
 * THIS IS THE HEAVIEST THING THE APP DOES AND IT WAS BEING DONE THE EXPENSIVE WAY. The website never serves
 * an original: `next/image` resizes on its own server and every `<RemotePhoto>` passes a `sizes` so a phone
 * gets a phone-sized file. The app asked Supabase Storage for the object itself, so a 68px thumbnail in a
 * catalogue row downloaded the full upload. Measured against the three live offers on 2026-10-03:
 *
 *   a row thumbnail  262,185 B → 3,610 B at 136×136 q70   (72× less, and a list of twenty is 5.2 MB → 72 KB)
 *   an offer's hero  262,185 B → 51,378 B at 750×375 q72  (5×)
 *   one offer's five hero slides, in all  1,216,735 B → 254,785 B  (4.8×)
 *
 * Storage answers these from `/storage/v1/render/image/public/…`, the same bucket and the same public object,
 * so no key and no signing is involved. If the transformation service is ever not there the request fails and
 * `<OfferImage>` falls back to the original URL, which is why the original is kept beside it rather than
 * thrown away.
 */
export function sizedImage(
  url: string | null,
  { width, height, quality = 72 }: { width: number; height: number; quality?: number },
): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  const base = url.replace(marker, "/storage/v1/render/image/public/");
  const query = `width=${Math.round(width)}&height=${Math.round(height)}&resize=cover&quality=${quality}`;
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}

// ---------------------------------------------------------------------------------------------------------
// The one write
// ---------------------------------------------------------------------------------------------------------

export type InterestInput = {
  fullName: string;
  phone: string;
  email?: string;
  /** public.governorates.id — the intake requires it, so the form asks for it. */
  governorateId: number;
  /** Why they want trees. A code; the server resolves which option row it is. */
  goal: "family" | "investment" | "both";
  /** The offer this came from, when it came from one. */
  offerCode?: string | null;
  trees?: number | null;
  note?: string | null;
};

export type InterestResult = { ok: true; reference: string | null } | { ok: false; message: string };

/**
 * Sends an interest to the website, which writes it with the service key.
 *
 * The app does not decide whether the data is good — the endpoint validates it again with the same rules the
 * web form uses, because a request from a phone is a request from the internet and nothing on this side of
 * the wire can be trusted by the other.
 *
 * `x-agrized-locale` is what the endpoint answers in. Without it every refusal came back Arabic whatever the
 * reader had chosen, which will matter the moment the app carries a second language and costs nothing now.
 *
 * `offline` IS A PARAMETER AND NOT A LITERAL, which is the only interesting thing about this function's shape.
 * Three Tunisian sentences used to be written here — «ما فماش كونيكسيون…» and two siblings — and the owner
 * already owns that sentence as `ui.offer.form_error_network`, so the app refused in its own Arabic while the
 * endpoint refused in his. This module cannot read it itself: ./config imports THIS file, so importing it back
 * would be a cycle. The caller holds the configuration, so the caller passes the word, and there is no Arabic
 * in this file at all. `InterestForm` passes `t(config, "ui.offer.form_error_network")`.
 *
 * It is one sentence rather than three because all three cases are one fact to the person holding the phone:
 * the request did not land and nothing was written. Distinguishing «the reply was not JSON» from «the socket
 * closed» is a distinction for a log, not for a reader in a grove.
 */
export async function submitInterest(
  input: InterestInput,
  locale = "ar",
  offline = "",
): Promise<InterestResult> {
  try {
    const response = await fetch(`${siteUrl}/api/mobile/interest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agrized-locale": locale },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok: true; reference?: string | null }
      | { ok: false; message?: string }
      | null;

    if (!payload) return { ok: false, message: offline };
    if (payload.ok) return { ok: true, reference: payload.reference ?? null };
    // The endpoint's own refusal is the owner's row already (`ui.errors.mobile_*`), so it is preferred over
    // anything this side could say — it is the only one that knows WHICH field was refused.
    return { ok: false, message: payload.message || offline };
  } catch {
    // A phone loses signal in a grove; that is not an error to dress up as a bug.
    return { ok: false, message: offline };
  }
}
