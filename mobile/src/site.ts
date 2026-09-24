import { supabase } from "./api";

/**
 * The website's own words and pictures, read by the app from the same rows.
 *
 * WHY NOT JUST WRITE THE ARABIC IN THE APP. Because then there would be two of it. Every sentence on the
 * phone home — the badge, the promise, the two doors, the section headings — is a row in `public.settings`
 * that the owner can edit without a deploy, and the website reads it on every request. An app that hard-coded
 * those strings would say something different the day the owner changed one, and nobody would know which was
 * right until a customer quoted the wrong one back.
 *
 * `settings_select` (0001) allows `anon` to read the rows marked `is_public`, and `site_media_read` (0015)
 * allows it to read the photographs. So the app reads exactly what the browser reads.
 *
 * THE FALLBACKS ARE THE WEBSITE'S FALLBACKS, VERBATIM. Most of these keys have no row at all: the site calls
 * `settingText(config, key, "…")` and the default in that call IS the copy. Those defaults are repeated here
 * character for character, so with an untouched database the app and the site say the same thing — and the
 * moment a row is created, both pick it up.
 */

export type Copy = Map<string, string>;

const KEYS = [
  "site.app_greeting_note",
  "site.app_hero_line",
  "site.app_hero_cta",
  "site.app_guide_cta",
  "site.app_guide_title",
  "site.app_guide_note",
  "site.app_pick_title",
  "site.app_pick_note",
  "offers.title",
  "offers.filter_all",
  "start.from_prefix",
  "million.title",
  "site.tab_trees",
  "site.stat_people",
  "site.services_title",
  "site.services_text",
  "site.services_note",
] as const;

/** The same defaults src/app/(public)/page.tsx passes to settingText, word for word. */
const FALLBACK: Record<string, string> = {
  "site.app_greeting_note": "نحو مستقبل أكثر خضرة",
  "site.app_hero_line": "زيتونتك اليوم… أصل لعمر كامل.",
  "site.app_hero_cta": "شوف العروض",
  "site.app_guide_cta": "عاونّي نختار",
  "site.app_guide_title": "إلقى العرض المناسب",
  "site.app_guide_note": "جاوب على بعض الأسئلة باش نعاونك تختار.",
  "site.app_pick_title": "إكتشف العروض",
  "site.app_pick_note": "تصفّح العروض المتوفّرة واختار بسهولة.",
  "offers.title": "عروضنا",
  "offers.filter_all": "الكل",
  "start.from_prefix": "ابتداءً من",
  "million.title": "وين وصلنا؟",
  "site.tab_trees": "زيتونة",
  "site.stat_people": "مستثمر",
  "site.services_title": "إنت تستثمر، وإحنا نتلهاو",
  "site.services_text":
    "AgriZed ما تبيعش وتخلّي. بعد التملّك نتابعو زيتونتك ونقدّمو الخدمات الفلاحية بمقابل معلوم ومتّفق عليه قبل.",
  "site.services_note": "الخدمات اختيارية، وشروطها وأسعارها تتوضّح قبل الإمضاء.",
};

/** One string, from the database if the owner wrote one, else the website's own default. */
export function text(copy: Copy, key: string): string {
  const value = copy.get(key);
  return value && value.trim() ? value : (FALLBACK[key] ?? "");
}

export async function fetchCopy(): Promise<Copy> {
  const { data } = await supabase.from("settings").select("key, value").in("key", [...KEYS]);
  const map: Copy = new Map();
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    // `value` is jsonb: a plain string arrives as a string, and anything else is not copy.
    if (typeof row.value === "string") map.set(row.key, row.value);
  }
  return map;
}

/** The photograph behind the hero, from the slot the website spends on it. */
export async function fetchHeroPhoto(): Promise<string | null> {
  const { data } = await supabase.from("site_media").select("url").eq("slot", "home.hero").maybeSingle();
  return ((data as { url?: string } | null)?.url ?? null) || null;
}

export type Progress = {
  treesRequested: number | null;
  treesReserved: number | null;
  treesContracted: number | null;
  treesPlanted: number | null;
  participants: number | null;
  projectsUnderStudy: number | null;
};

/**
 * «وين وصلنا؟» — the counted figures.
 *
 * A missing figure is null, never 0: the statistics module can be closed, and «0 زيتونة محجوزة» is a
 * statement about the business where no answer at all is just an absent tile. Same rule as src/lib/million.ts.
 */
export async function fetchProgress(): Promise<Progress | null> {
  const { data, error } = await supabase.rpc("million_progress");
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const n = (key: string): number | null => {
    const raw = row[key];
    if (raw === null || raw === undefined) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    treesRequested: n("trees_requested"),
    treesReserved: n("trees_reserved"),
    treesContracted: n("trees_contracted"),
    treesPlanted: n("trees_planted"),
    participants: n("participants"),
    projectsUnderStudy: n("projects_under_study"),
  };
}

/** The agricultural services, as the owner keeps them in الإعدادات ← القوائم. */
export async function fetchServices(): Promise<string[]> {
  const { data } = await supabase
    .from("option_items")
    .select("label_ar")
    .eq("list_key", "agrized_service")
    .eq("is_active", true)
    .order("sort_order");
  return ((data ?? []) as { label_ar: string }[]).map((row) => row.label_ar);
}
