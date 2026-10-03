import "server-only";

import type { Locale } from "@/lib/i18n/locales";
import { isTranslatableSetting } from "@/lib/i18n/translatable";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** PostgREST answers 1000 rows at most; the settings and their translations are read a page at a time. */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export type TranslationCell = { value: Json; isDraft: boolean; updatedAt: string };
/** entity_key → field → locale → the row. */
export type TranslationIndex = Map<string, Map<string, Map<Locale, TranslationCell>>>;

export async function loadTranslations(supabase: Supabase, entities: string[]): Promise<Map<string, TranslationIndex>> {
  const rows = await readAll<{ entity: string; entity_key: string; field: string; locale: string; value: Json; is_draft: boolean; updated_at: string }>(
    (from, to) =>
      supabase
        .from("translations")
        .select("entity, entity_key, field, locale, value, is_draft, updated_at")
        .in("entity", entities)
        .order("entity")
        .order("entity_key")
        .order("field")
        .order("locale")
        .range(from, to),
  );
  const byEntity = new Map<string, TranslationIndex>();
  for (const row of rows) {
    const index = byEntity.get(row.entity) ?? new Map();
    byEntity.set(row.entity, index);
    const fields = index.get(row.entity_key) ?? new Map();
    index.set(row.entity_key, fields);
    const locales = fields.get(row.field) ?? new Map();
    fields.set(row.field, locales);
    locales.set(row.locale as Locale, { value: row.value, isDraft: row.is_draft, updatedAt: row.updated_at });
  }
  return byEntity;
}

export type TextSetting = {
  key: string;
  value: Json;
  value_type: string;
  label_ar: string;
  description_ar: string | null;
  is_public: boolean;
};

/** The settings the translation room offers: words a visitor reads (or an SMS carries), not codes. */
export async function loadTextSettings(supabase: Supabase): Promise<TextSetting[]> {
  const rows = await readAll<TextSetting>((from, to) =>
    supabase
      .from("settings")
      .select("key, value, value_type, label_ar, description_ar, is_public")
      .in("value_type", ["text", "json"])
      .order("group_key")
      .order("sort_order")
      .order("key")
      .range(from, to),
  );
  return rows.filter((row) => (row.is_public || SMS_SETTINGS.has(row.key)) && isTranslatableSetting(row.key, row.value_type, row.value));
}

/** The settings that are SMS bodies (or part of one): internal, but they speak to the client. */
export const SMS_SETTINGS = new Set([
  "auth.client_login_sms",
  "auth.client_reset_sms",
  "auth.client_phone_change_sms",
  "sms.currency_unit",
]);
