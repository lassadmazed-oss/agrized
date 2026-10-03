import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { ADMIN_LABELS } from "@/components/admin/nav-model";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { isLocale, LOCALE_DIR, type Locale } from "@/lib/i18n/locales";
import { isFlatStringMap, jsonLeaves, leafAt, leafId, TARGET_LOCALES } from "@/lib/i18n/translatable";
import { renderWorstCase, smsMeter } from "@/lib/sms-length";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { SettingsRooms } from "../rooms";

import { saveTranslation, type TranslationTarget } from "./actions";
import { loadTextSettings, loadTranslations, SMS_SETTINGS, type TranslationIndex } from "./load";

export const metadata: Metadata = { title: ADMIN_LABELS["/admin/settings/translations"] };

/**
 * الترجمات — every text of the site, in its five languages, side by side (0109, owner 2026-10-03: «في الـAdmin،
 * نحب لكل محتوى خانات مستقلة: AR / FR / DE / IT / EN»).
 *
 * FOUR TABS for four kinds of content, because each keeps its Arabic somewhere else:
 *   نصوص الموقع  every setting a visitor reads — the site's own words (ui.*, 0110) and the owner's copy
 *                (site.*, legal.*…). Arabic is editable here, with the same checks as on الإعدادات.
 *   القوائم      list items, project kinds, ownership scenarios. Arabic is edited in القوائم (linked).
 *   العروض       each offer's name, description, conditions… and its pictures' captions. Arabic on the offer.
 *   الرسائل      SMS and WhatsApp templates, and the sign-in SMS. Arabic editable; every language is
 *                measured at its worst case and refused past one message.
 *
 * A blank field is not an empty translation: saving it deletes the row, and the site shows the language's
 * fallback (اللغات). A draft — a first translation written for the owner to review — is marked, listed by the
 * «مسودات» filter, and stops being one the moment somebody saves it.
 */

const TABS = [
  { key: "texts", label: "نصوص الموقع" },
  { key: "lists", label: "القوائم" },
  { key: "offers", label: "العروض" },
  { key: "messages", label: "الرسائل" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const PAGE_SIZE = 25;

/** Where a text appears, by its key's prefix — the chips at the top of «نصوص الموقع». */
const AREA_LABELS: Record<string, string> = {
  "ui.common": "مشترك",
  "ui.format": "الوحدات",
  "ui.shell": "رأس الموقع وأسفله",
  "ui.home": "الصفحة الرئيسية",
  "ui.catalogue": "قائمة العروض",
  "ui.cards": "بطاقات العروض",
  "ui.offer": "صفحة العرض",
  "ui.start": "الحاسبة",
  "ui.register": "تسجيل المطلب",
  "ui.land": "أرضك",
  "ui.track": "وين وصل مطلبي",
  "ui.login": "الدخول",
  "ui.security": "الأمان",
  "ui.zitounti": "زيتونتي",
  "ui.errors": "رسائل الخطأ",
  "ui.pages": "صفحات الخطأ",
  "ui.assistant": "المساعد",
  site: "نصوص الصفحة الرئيسية",
  brand: "الشعار",
  million: "العدّاد",
  start: "الحاسبة (نصوص)",
  register: "التسجيل (نصوص)",
  simulator: "المحاكاة",
  offers: "العروض (نصوص)",
  projects: "صفحات العروض (نصوص)",
  legal: "النصوص القانونية",
  zitounti: "زيتونتي (نصوص)",
  journey: "مراحل المطلب",
  track: "المتابعة (نصوص)",
  assistant: "المساعد (نصوص)",
  project_type: "أنواع المشاريع",
  ownership_scenario: "سيناريوهات الملكية",
  tree_spacing_class: "أصناف الغراسة",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

function areaOf(key: string): string {
  const parts = key.split(".");
  return parts[0] === "ui" ? parts.slice(0, 2).join(".") : parts[0];
}

type Field = {
  field: string;
  label?: string;
  base: Json;
  kind: TranslationTarget["kind"];
  arabic: TranslationTarget["arabic"];
  /** The old French column (label_fr, name_fr…): the site shows it in French until a translation exists. */
  legacyFr?: string | null;
  multiline: boolean;
};

type Item = {
  id: string;
  entity: string;
  key: string;
  title: string;
  subtitle?: string;
  note?: string | null;
  editHref?: string;
  area: string;
  fields: Field[];
};

function textOf(value: Json): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export default async function TranslationsPage({ searchParams }: PageProps<"/admin/settings/translations">) {
  await requireStaff(ADMIN_ROLES);
  const params = await searchParams;
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string) : "");
  const tab: TabKey = (TABS.find((item) => item.key === one("tab"))?.key ?? "texts") as TabKey;
  const query = one("q").trim().toLowerCase();
  const area = one("area");
  const missing = isLocale(one("missing")) && one("missing") !== "ar" ? (one("missing") as Locale) : null;
  const draftsOnly = one("drafts") === "1";
  const draftLang = isLocale(one("lang")) ? (one("lang") as Locale) : null;
  const page = Math.max(1, Number(one("page")) || 1);

  const supabase = await createClient();
  const { data: locales } = await supabase.from("locales").select("code, name_native, name_ar, is_enabled").order("sort_order");
  const targetLocales = TARGET_LOCALES;
  const localeName = new Map((locales ?? []).map((row) => [row.code, row.name_ar]));

  // ---- the items of the current tab ----
  let items: Item[] = [];
  let index = new Map<string, TranslationIndex>();

  if (tab === "texts" || tab === "messages") {
    const [settings, translations] = await Promise.all([
      loadTextSettings(supabase),
      loadTranslations(supabase, tab === "texts" ? ["setting"] : ["setting", "message_template"]),
    ]);
    index = translations;
    if (tab === "texts") {
      items = settings
        .filter((setting) => setting.is_public && !SMS_SETTINGS.has(setting.key))
        .map((setting) => ({
          id: `setting|${setting.key}`,
          entity: "setting",
          key: setting.key,
          title: setting.label_ar,
          subtitle: setting.key,
          note: setting.description_ar,
          area: areaOf(setting.key),
          editHref: setting.value_type === "json" ? `/admin/settings#${areaOf(setting.key).split(".")[0]}` : undefined,
          fields: [
            {
              field: "value",
              base: setting.value,
              kind: setting.value_type === "json" ? "json" : "text",
              arabic: setting.value_type === "json" ? null : "setting",
              multiline: typeof setting.value === "string" && setting.value.length > 60,
            },
          ],
        }));
    } else {
      const { data: templates } = await supabase
        .from("message_templates")
        .select("key, channel, body_ar, description_ar, is_active")
        .order("key");
      items = [
        ...(templates ?? []).map((template) => ({
          id: `message_template|${template.key}`,
          entity: "message_template",
          key: template.key,
          title: template.description_ar || template.key,
          subtitle: `${template.key} · ${template.channel === "sms" ? "SMS" : "WhatsApp"}${template.is_active ? "" : " · موقوف"}`,
          area: template.channel,
          fields: [
            {
              field: "body",
              base: template.body_ar,
              kind: template.channel === "sms" ? ("sms" as const) : ("text" as const),
              arabic: "template" as const,
              multiline: true,
            },
          ],
        })),
        ...settings
          .filter((setting) => SMS_SETTINGS.has(setting.key))
          .map((setting) => ({
            id: `setting|${setting.key}`,
            entity: "setting",
            key: setting.key,
            title: setting.label_ar,
            subtitle: setting.key,
            note: setting.description_ar,
            area: "sms",
            fields: [
              {
                field: "value",
                base: setting.value,
                kind: setting.key === "sms.currency_unit" ? ("text" as const) : ("sms" as const),
                arabic: "setting" as const,
                multiline: setting.key !== "sms.currency_unit",
              },
            ],
          })),
      ];
    }
  } else if (tab === "lists") {
    const [lists, options, types, scenarios, translations, spacing] = await Promise.all([
      supabase.from("option_lists").select("key, label_ar").order("key"),
      supabase.from("option_items").select("id, list_key, label_ar, label_fr").eq("is_active", true).order("list_key").order("sort_order"),
      supabase.from("project_types").select("id, label_ar, label_fr, description_ar, image_alt_ar").eq("is_active", true).order("sort_order"),
      supabase
        .from("ownership_scenarios")
        .select("id, label_ar, label_fr, description_ar, description_fr, image_alt_ar, image_alt_fr")
        .eq("is_active", true)
        .order("sort_order"),
      loadTranslations(supabase, ["option_item", "project_type", "ownership_scenario", "tree_spacing_class"]),
      supabase.from("tree_spacing_classes").select("id, code, label_ar").eq("is_active", true).order("sort_order"),
    ]);
    index = translations;
    const listName = new Map((lists.data ?? []).map((row) => [row.key, row.label_ar]));
    const plain = (field: string, base: string, legacyFr?: string | null, label?: string): Field => ({
      field,
      label,
      base,
      kind: "text",
      arabic: null,
      legacyFr,
      multiline: base.length > 60,
    });
    items = [
      ...(types.data ?? []).map((row) => ({
        id: `project_type|${row.id}`,
        entity: "project_type",
        key: row.id,
        title: row.label_ar,
        subtitle: "نوع مشروع",
        area: "project_type",
        editHref: "/admin/settings/lists",
        fields: [
          plain("label", row.label_ar, row.label_fr, "الاسم"),
          ...(row.description_ar ? [plain("description", row.description_ar, null, "الشرح")] : []),
          ...(row.image_alt_ar ? [plain("image_alt", row.image_alt_ar, null, "وصف الصورة")] : []),
        ],
      })),
      ...(scenarios.data ?? []).map((row) => ({
        id: `ownership_scenario|${row.id}`,
        entity: "ownership_scenario",
        key: row.id,
        title: row.label_ar,
        subtitle: "سيناريو ملكية",
        area: "ownership_scenario",
        editHref: "/admin/settings/lists",
        fields: [
          plain("label", row.label_ar, row.label_fr, "الاسم"),
          ...(row.description_ar ? [plain("description", row.description_ar, row.description_fr, "الشرح")] : []),
          ...(row.image_alt_ar ? [plain("image_alt", row.image_alt_ar, row.image_alt_fr, "وصف الصورة")] : []),
        ],
      })),
      // Planting classes (0113): their French lived in label_fr until 0113 copied it into the translations.
      ...(spacing.data ?? []).map((row) => ({
        id: `tree_spacing_class|${row.id}`,
        entity: "tree_spacing_class",
        key: row.id,
        title: row.label_ar,
        subtitle: `صنف غراسة · ${row.code}`,
        area: "tree_spacing_class",
        editHref: "/admin/pricing",
        fields: [plain("label", row.label_ar)],
      })),
      ...(options.data ?? []).map((row) => ({
        id: `option_item|${row.id}`,
        entity: "option_item",
        key: row.id,
        title: row.label_ar,
        subtitle: listName.get(row.list_key) ?? row.list_key,
        area: row.list_key,
        editHref: "/admin/settings/lists",
        fields: [plain("label", row.label_ar, row.label_fr)],
      })),
    ];
  } else {
    const [projects, media, translations] = await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, code, name, status, description_ar, location_description, olive_variety, water_note, access_note, reservation_conditions_ar, visit_meeting_point",
        )
        .neq("status", "archived")
        .order("code"),
      supabase.from("project_media").select("id, project_id, alt_ar, caption_ar"),
      loadTranslations(supabase, ["project", "project_media"]),
    ]);
    index = translations;
    const projectFields: [string, string, keyof NonNullable<typeof projects.data>[number]][] = [
      ["name", "الاسم", "name"],
      ["description", "الشرح", "description_ar"],
      ["location_description", "المكان", "location_description"],
      ["olive_variety", "الصنف", "olive_variety"],
      ["water_note", "الماء", "water_note"],
      ["access_note", "الطريق", "access_note"],
      ["reservation_conditions", "شروط الحجز", "reservation_conditions_ar"],
      ["visit_meeting_point", "مكان اللقاء في الزيارة", "visit_meeting_point"],
    ];
    for (const project of projects.data ?? []) {
      const fields: Field[] = projectFields
        .filter(([, , column]) => typeof project[column] === "string" && (project[column] as string).trim())
        .map(([field, label, column]) => ({
          field,
          label,
          base: project[column] as string,
          kind: "text",
          arabic: null,
          multiline: (project[column] as string).length > 60,
        }));
      if (fields.length > 0) {
        items.push({
          id: `project|${project.id}`,
          entity: "project",
          key: project.id,
          title: project.name,
          subtitle: project.code,
          area: project.status,
          editHref: `/admin/projects/${project.id}`,
          fields,
        });
      }
      for (const picture of (media.data ?? []).filter((row) => row.project_id === project.id)) {
        const pictureFields: Field[] = [
          ...(picture.alt_ar ? [{ field: "alt", label: "وصف الصورة", base: picture.alt_ar, kind: "text" as const, arabic: null, multiline: false }] : []),
          ...(picture.caption_ar
            ? [{ field: "caption", label: "التعليق", base: picture.caption_ar, kind: "text" as const, arabic: null, multiline: false }]
            : []),
        ];
        if (pictureFields.length > 0) {
          items.push({
            id: `project_media|${picture.id}`,
            entity: "project_media",
            key: picture.id,
            title: `صورة · ${project.name}`,
            subtitle: project.code,
            area: project.status,
            editHref: `/admin/projects/${project.id}`,
            fields: pictureFields,
          });
        }
      }
    }
  }

  // ---- filters ----
  const cell = (item: Item, field: string, locale: Locale) => index.get(item.entity)?.get(item.key)?.get(field)?.get(locale);
  const isMissing = (item: Item, locale: Locale) =>
    item.fields.some((field) => !cell(item, field.field, locale) && !(locale === "fr" && field.legacyFr));
  const hasDraft = (item: Item) =>
    item.fields.some((field) => (draftLang ? [draftLang] : targetLocales).some((locale) => cell(item, field.field, locale as Locale)?.isDraft));

  const areas = new Map<string, number>();
  for (const item of items) areas.set(item.area, (areas.get(item.area) ?? 0) + 1);

  const filtered = items.filter((item) => {
    if (area && item.area !== area) return false;
    if (missing && !isMissing(item, missing)) return false;
    if (draftsOnly && !hasDraft(item)) return false;
    if (query) {
      const haystack = [
        item.key,
        item.title,
        item.subtitle ?? "",
        ...item.fields.flatMap((field) => [
          textOf(field.base),
          ...targetLocales.map((locale) => {
            const value = cell(item, field.field, locale)?.value;
            return value === undefined ? "" : textOf(value);
          }),
        ]),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { tab, q: query, area, missing: missing ?? "", drafts: draftsOnly ? "1" : "", lang: draftLang ?? "", page: "", ...changes };
    for (const [name, value] of Object.entries(merged)) if (value) next.set(name, value);
    return `/admin/settings/translations?${next.toString()}`;
  };

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="section-title">{ADMIN_LABELS["/admin/settings/translations"]}</h1>
          <p className="mt-2 max-w-3xl leading-7 text-muted">
            كل نص في الموقع بلغاتو الخمسة. خانة فارغة = الموقع يورّي النص باللغة البديلة (تتحدّد من «اللغات»). الترجمات
            المكتوبة «مسودة» كتبناها كبداية باش تراجعها؛ الحفظ يعتبرها مراجَعة. الخانات بين {"{ }"} تتبدّل بقيم (اسم، رقم…)
            وتتكتب كيما هي في كل لغة.
          </p>
        </div>
        <SettingsRooms current="/admin/settings/translations" />
      </header>

      <nav aria-label="أنواع المحتوى" className="flex flex-wrap gap-tight border-b border-line pb-3">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={href({ tab: item.key, area: null, page: null })}
            aria-current={item.key === tab ? "page" : undefined}
            className="chip aria-[current=page]:bg-forest aria-[current=page]:text-paper"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="panel flex flex-wrap items-end gap-cozy p-cozy">
        <input type="hidden" name="tab" value={tab} />
        {area ? <input type="hidden" name="area" value={area} /> : null}
        <label className="block min-w-56 flex-1">
          <span className="label">بحث</span>
          <input name="q" defaultValue={query} className="field" placeholder="كلمة، مفتاح، أو جملة بأي لغة" />
        </label>
        <label className="block">
          <span className="label">ناقص في</span>
          <select name="missing" defaultValue={missing ?? ""} className="field">
            <option value="">كل اللغات</option>
            {targetLocales.map((code) => (
              <option key={code} value={code}>
                {localeName.get(code) ?? code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="drafts" value="1" defaultChecked={draftsOnly} className="size-5 accent-forest" />
          <span>المسودات برك</span>
        </label>
        <button type="submit" className="btn btn-secondary min-h-11">
          اعرض
        </button>
      </form>

      {areas.size > 1 ? (
        <nav aria-label="المكان في الموقع" className="flex flex-wrap gap-tight">
          <Link href={href({ area: null, page: null })} className="chip" aria-current={!area ? "true" : undefined}>
            الكل <span className="text-xs text-muted tabular-nums">{formatCount(items.length)}</span>
          </Link>
          {[...areas.entries()].map(([key, count]) => (
            <Link key={key} href={href({ area: key, page: null })} className="chip" aria-current={area === key ? "true" : undefined}>
              {AREA_LABELS[key] ?? key}
              <span className="text-xs text-muted tabular-nums">{formatCount(count)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <p className="text-sm text-muted">
        {formatCount(filtered.length)} عنصر{pages > 1 ? ` · صفحة ${formatCount(current)} من ${formatCount(pages)}` : ""}
      </p>

      <ul className="space-y-4">
        {shown.map((item) => (
          <li key={item.id} className="card p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold">{item.title}</h2>
                {item.note ? <p className="mt-0.5 text-sm text-muted">{item.note}</p> : null}
                {item.subtitle ? (
                  <p dir="ltr" className="mt-1 text-start text-xs text-muted">
                    {item.subtitle}
                  </p>
                ) : null}
              </div>
              {item.editHref ? (
                <Link href={item.editHref} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
                  تعديل العربية
                </Link>
              ) : null}
            </div>

            <div className="space-y-5">
              {item.fields.map((field) => (
                <FieldForm
                  key={field.field}
                  target={{ entity: item.entity, key: item.key, field: field.field, kind: field.kind, arabic: field.arabic }}
                  field={field}
                  cells={Object.fromEntries(targetLocales.map((code) => [code, cell(item, field.field, code)]))}
                  localeNames={localeName}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <nav aria-label="الصفحات" className="flex flex-wrap gap-tight">
          {Array.from({ length: pages }, (_, i) => i + 1).map((number) => (
            <Link
              key={number}
              href={href({ page: String(number) })}
              aria-current={number === current ? "page" : undefined}
              className="chip tabular-nums aria-[current=page]:bg-forest aria-[current=page]:text-paper"
            >
              {formatCount(number)}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function FieldForm({
  target,
  field,
  cells,
  localeNames,
}: {
  target: TranslationTarget;
  field: Field;
  cells: Record<string, { value: Json; isDraft: boolean } | undefined>;
  localeNames: Map<string, string>;
}) {
  const nameOf = (code: string) => localeNames.get(code) ?? code;

  if (field.kind === "json") {
    const leaves = jsonLeaves(field.base);
    return (
      <ActionForm action={saveTranslation.bind(null, target)} submitLabel="حفظ" buttonClassName="btn btn-secondary min-h-10">
        {field.label ? <h3 className="text-sm font-semibold">{field.label}</h3> : null}
        <p className="hint">
          {isFlatStringMap(field.base)
            ? "كل كلمة تترجم وحدها؛ كلمة فارغة تظهر باللغة البديلة."
            : "هذا النص يتبدّل كامل: في كل لغة، يا تكمّل كل الخانات يا تخليهم الكل فارغين. العربية تتبدّل من الإعدادات."}
        </p>
        <div className="space-y-4">
          {leaves.map((leaf) => (
            <fieldset key={leafId(leaf.path)} className="rounded-xl border border-line p-3">
              <legend className="px-1 text-xs text-muted" dir="ltr">
                {leafId(leaf.path)}
              </legend>
              <p className="mb-2 text-sm leading-6 text-ink">{leaf.text}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TARGET_LOCALES.map((code) => {
                  const existing = cells[code]?.value;
                  const value = existing === undefined ? "" : (leafAt(existing, leaf.path) ?? "");
                  return (
                    <label key={code} className="block">
                      <span className="text-xs font-semibold text-muted">
                        {nameOf(code)}
                        {cells[code]?.isDraft ? <span className="ms-1 text-gold-700">· مسودة</span> : null}
                      </span>
                      <input
                        name={`${code}::${leafId(leaf.path)}`}
                        defaultValue={value}
                        lang={code}
                        dir={LOCALE_DIR[code]}
                        className="field"
                      />
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </ActionForm>
    );
  }

  const base = typeof field.base === "string" ? field.base : "";

  const meter = (text: string, arabicUnit = false) => {
    if (field.kind !== "sms" || !text) return null;
    const rendered = renderWorstCase(text, arabicUnit);
    const { used, limit, segments } = smsMeter(rendered);
    return (
      <span className={`ms-1 tabular-nums ${segments > 1 ? "text-danger" : "text-muted"}`}>
        · {used}/{limit} {segments > 1 ? `(${segments} رسائل!)` : ""}
      </span>
    );
  };

  return (
    <ActionForm action={saveTranslation.bind(null, target)} submitLabel="حفظ" buttonClassName="btn btn-secondary min-h-10">
      {field.label ? <h3 className="text-sm font-semibold">{field.label}</h3> : null}
      {field.arabic ? null : <input type="hidden" name="source" value={base} />}
      {field.kind === "sms" ? (
        <p className="hint">
          الرقم بعد كل لغة: قدّاش تاخو الرسالة في أسوأ حالة (اسم عرض عربي، أطول رقم…) من 160 (حروف لاتينية عادية) ولا 70
          (عربي، ولا حرف كيما ê ç «). أكثر من رسالة وحدة ما يتقبلش.
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="text-xs font-semibold text-muted">
            العربية (الأصل){field.arabic ? null : " · تتبدّل من مكانها"}
            {meter(base, true)}
          </span>
          <TextField code="ar" value={base} readOnly={!field.arabic} multiline={field.multiline} />
        </label>
        {TARGET_LOCALES.map((code) => {
          const existing = cells[code]?.value;
          const value = typeof existing === "string" ? existing : "";
          const legacy = code === "fr" && !value && field.legacyFr ? field.legacyFr : "";
          return (
            <label key={code} className="block">
              <span className="text-xs font-semibold text-muted">
                {nameOf(code)}
                {cells[code]?.isDraft ? <span className="ms-1 text-gold-700">· مسودة</span> : null}
                {legacy ? <span className="ms-1">· من خانة الفرنسية القديمة</span> : null}
                {meter(value || legacy)}
              </span>
              <TextField code={code} value={value || legacy} multiline={field.multiline} />
            </label>
          );
        })}
      </div>
    </ActionForm>
  );
}

/** One language's field: a textarea for a sentence, an input for a word. */
function TextField({ code, value, readOnly = false, multiline }: { code: Locale; value: string; readOnly?: boolean; multiline: boolean }) {
  return multiline ? (
    <textarea
      name={code}
      defaultValue={value}
      readOnly={readOnly}
      lang={code}
      dir={LOCALE_DIR[code]}
      rows={Math.min(8, Math.max(2, Math.ceil(value.length / 70)))}
      className={`field min-h-20 ${readOnly ? "bg-paper text-muted" : ""}`}
    />
  ) : (
    <input
      name={code}
      defaultValue={value}
      readOnly={readOnly}
      lang={code}
      dir={LOCALE_DIR[code]}
      className={`field ${readOnly ? "bg-paper text-muted" : ""}`}
    />
  );
}
