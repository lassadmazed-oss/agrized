import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { ADMIN_LABELS } from "@/components/admin/nav-model";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { TARGET_LOCALES } from "@/lib/i18n/translatable";
import { createClient } from "@/lib/supabase/server";

import { SettingsRooms } from "../rooms";
import { loadTextSettings, loadTranslations, SMS_SETTINGS } from "../translations/load";

import { saveLocale } from "./actions";

export const metadata: Metadata = { title: ADMIN_LABELS["/admin/settings/languages"] };

/**
 * اللغات — the five languages of the site (0109, owner 2026-10-03).
 *
 * What the owner decides here, and nothing else: which languages a visitor may choose, what each is called,
 * their order in the selector, and the FALLBACK — the language a text appears in when it has not been
 * translated yet. The words themselves are in الترجمات, one field per language beside every text.
 *
 * Each row also says how far the language has come: how many of the site's texts have a word of their own in
 * it, and how many of those are still drafts nobody has reviewed. A language at 40 % shows its fallback in
 * the other 60 %, which is the honest thing to know before switching it on.
 */
export default async function LanguagesPage() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const [{ data: locales, error }, settings, translations] = await Promise.all([
    supabase.from("locales").select("code, name_native, name_ar, is_enabled, fallback_code, sort_order").order("sort_order"),
    loadTextSettings(supabase),
    loadTranslations(supabase, ["setting"]),
  ]);
  if (error) throw new Error(error.message);

  const texts = settings.filter((setting) => setting.is_public && !SMS_SETTINGS.has(setting.key));
  const index = translations.get("setting") ?? new Map();
  const coverage = Object.fromEntries(
    TARGET_LOCALES.map((code) => {
      let done = 0;
      let drafts = 0;
      for (const setting of texts) {
        const cell = index.get(setting.key)?.get("value")?.get(code);
        if (cell) {
          done += 1;
          if (cell.isDraft) drafts += 1;
        }
      }
      return [code, { done, drafts }];
    }),
  );
  const nameOf = new Map((locales ?? []).map((row) => [row.code, row.name_ar]));

  return (
    <div className="max-w-4xl space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="section-title">{ADMIN_LABELS["/admin/settings/languages"]}</h1>
          <p className="mt-2 max-w-2xl leading-7 text-muted">
            اللغات اللي يختار منها الزائر، اسم كل وحدة، ترتيبها، واللغة البديلة: كي نص ما يكونش مترجم للغة هاذي، يظهر
            باللغة البديلة متاعها، وهكا لين يوصل للعربية. الكلام نفسه يتبدّل من «الترجمات».
          </p>
        </div>
        <SettingsRooms current="/admin/settings/languages" />
      </header>

      <ul className="space-y-3">
        {(locales ?? []).map((locale) => {
          const isSource = locale.code === "ar";
          const stats = coverage[locale.code];
          const percent = stats && texts.length > 0 ? Math.round((stats.done / texts.length) * 100) : 100;
          return (
            <li key={locale.code} className="card p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex flex-wrap items-baseline gap-2 text-lg font-semibold">
                  <span lang={locale.code}>{locale.name_native}</span>
                  <span className="text-sm font-normal text-muted">{locale.name_ar}</span>
                  <span dir="ltr" className="pill pill-line uppercase">
                    {locale.code}
                  </span>
                  {isSource ? (
                    <span className="pill pill-line">اللغة الأصلية</span>
                  ) : locale.is_enabled ? (
                    <span className="pill bg-leaf-soft text-forest">ظاهرة للزوار</span>
                  ) : (
                    <span className="pill pill-line">مخفية</span>
                  )}
                </h2>
                {stats ? (
                  <p className="text-sm text-muted">
                    مترجم: <strong className="text-ink tabular-nums">{percent}%</strong> ({formatCount(stats.done)} من{" "}
                    {formatCount(texts.length)} نص)
                    {stats.drafts > 0 ? (
                      <>
                        {" · "}
                        <Link
                          href={`/admin/settings/translations?drafts=1&lang=${locale.code}`}
                          className="font-semibold text-forest underline-offset-4 hover:underline"
                        >
                          {formatCount(stats.drafts)} مسودة للمراجعة
                        </Link>
                      </>
                    ) : null}
                    {" · "}
                    <Link
                      href={`/admin/settings/translations?missing=${locale.code}`}
                      className="font-semibold text-forest underline-offset-4 hover:underline"
                    >
                      الناقص
                    </Link>
                  </p>
                ) : (
                  <p className="text-sm text-muted">كل النصوص مكتوبة بالعربية أصلاً.</p>
                )}
              </div>

              <ActionForm action={saveLocale.bind(null, locale.code)} submitLabel="حفظ" buttonClassName="btn btn-secondary min-h-10">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">الاسم بلغتو (يظهر في الموقع)</span>
                    <input name="name_native" defaultValue={locale.name_native} lang={locale.code} className="field" required />
                  </label>
                  <label className="block">
                    <span className="label">الاسم بالعربية (للفريق)</span>
                    <input name="name_ar" defaultValue={locale.name_ar} className="field" required />
                  </label>
                  {isSource ? null : (
                    <label className="block">
                      <span className="label">اللغة البديلة</span>
                      <select name="fallback_code" defaultValue={locale.fallback_code ?? "ar"} className="field">
                        {(locales ?? [])
                          .filter((other) => other.code !== locale.code)
                          .map((other) => (
                            <option key={other.code} value={other.code}>
                              {other.name_ar}
                            </option>
                          ))}
                      </select>
                      <span className="hint">
                        نص ناقص بـ{locale.name_ar} يظهر بـ{nameOf.get(locale.fallback_code ?? "ar") ?? "العربية"}.
                      </span>
                    </label>
                  )}
                  <label className="block">
                    <span className="label">الترتيب في القائمة</span>
                    <input
                      name="sort_order"
                      type="number"
                      min={0}
                      max={99}
                      step={1}
                      dir="ltr"
                      defaultValue={locale.sort_order}
                      className="field max-w-28 text-left"
                    />
                  </label>
                </div>
                {isSource ? (
                  <p className="hint">العربية هي اللغة الأصلية: ديما ظاهرة، وكل نص مكتوب بيها، وهي آخر لغة بديلة لكل اللغات.</p>
                ) : (
                  <label className="flex items-center gap-3">
                    <input type="checkbox" name="is_enabled" defaultChecked={locale.is_enabled} className="size-5 accent-forest" />
                    <span>ظاهرة للزوار في اختيار اللغة</span>
                  </label>
                )}
              </ActionForm>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
