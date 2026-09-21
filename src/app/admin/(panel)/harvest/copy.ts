import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Every word on the harvest screens, read from public.settings.
 *
 * They are private settings (is_public = false), so they are NOT in PublicConfig — loadPublicConfig only
 * fetches the public rows — and settingText() cannot reach them. RLS lets any signed-in staff member read the
 * private rows (settings_select: `is_public or app.is_staff()`), so one query here is the whole story.
 *
 * The fallbacks are the same sentences bb_41 seeds. They exist so that a screen still reads in Arabic if a row
 * is missing or the owner empties one, and NOT as the source of truth: the owner edits the setting, not this
 * file. Nothing here is a business value — no price, no limit, no list.
 */

const FALLBACKS: Record<string, string> = {
  "harvest.page_title": "الصابة والجني",
  "harvest.page_intro": "كل موسم صابة في عرض واحد: وقتاش بدا، شنوّة خرج منه، وشنوّة صار في المحصول.",
  "harvest.status_planned": "مبرمج",
  "harvest.status_harvesting": "في الجني",
  "harvest.status_closed": "تكمّل الجني",
  "harvest.status_settled": "توزّعت الحصص",
  "harvest.status_cancelled": "ملغى",
  "harvest.unit_olives": "كغ",
  "harvest.unit_oil": "لتر",
  "harvest.empty_seasons": "مازال ما فما حتى موسم صابة مسجّل.",
  "harvest.empty_owners": "حتى زيتونة في هذا العرض ما تباعتش بعد، فما حتى حصّة تتحسب.",
  "harvest.no_choice_label": "ما اختارش بعد",
  "harvest.auto_choice_label": "تلقائي",
  "harvest.choice_closed_note": "باب الاختيار تسكّر. الاختيار الافتراضي متاع العرض هو اللي يمشي.",
};

export type HarvestText = (key: string) => string;

export type HarvestCopy = {
  text: HarvestText;
  /** settings audit.reason_min_length; app.require_reason checks it again (§51), and 0 hides the field. */
  reasonMin: number;
};

export async function loadHarvestCopy(): Promise<HarvestCopy> {
  const supabase = await createClient();
  const [harvest, audit] = await Promise.all([
    supabase.from("settings").select("key, value").like("key", "harvest.%"),
    supabase.from("settings").select("value").eq("key", "audit.reason_min_length").maybeSingle(),
  ]);

  const stored = new Map<string, string>();
  for (const row of harvest.data ?? []) {
    const value = row.value;
    if (typeof value === "string") stored.set(row.key, value);
    else if (typeof value === "number" || typeof value === "boolean") stored.set(row.key, String(value));
  }

  const raw = audit.data?.value;
  const reasonMin = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);

  return {
    // An emptied setting means «do not show this sentence», the way every other copy setting in this product
    // behaves — so an empty string is kept and is not replaced by the fallback.
    text: (key: string) => stored.get(key) ?? FALLBACKS[key] ?? "",
    reasonMin: Number.isFinite(reasonMin) ? reasonMin : 0,
  };
}
