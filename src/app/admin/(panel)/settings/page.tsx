// الإعدادات — the room where the owner changes what the site says and what it offers.
//
// FOUR TABLES, ONE ROOM. النصوص والأرقام (this page), الموديولات, القوائم, صور الموقع were four sidebar rows
// leading to four screens with no way between them. They are one job, so the sidebar now carries الإعدادات
// once and the strip at the head of this page opens the other three. Their routes did not move.
//
// WHY THE SECTIONS ARE BUILT FROM THE KEY AND NOT FROM group_key. The list used to be eight hardcoded
// group_key sections, and a row whose group was not among them was rendered nowhere at all: audit, matching,
// million and start — thirteen live settings, six of them public copy on the home page — existed in the
// database, were editable by their key, and could not be found on this screen. Worse, group_key does not
// describe what a setting affects any more: 195 rows sit in «site», and they are the home page, the counter,
// the calculator and the register screen mixed together.
//
// So a section is a list of key prefixes — the thing the setting acts on — and whatever a section does not
// claim falls into «إعدادات أخرى» at the end. Nothing in the table can be invisible here again.
//
// WHAT CANNOT BE EDITED FROM HERE says so. Nine settings are JSON values with no editor: ./actions.ts
// accepts only the four below, and refuses every other json key with «هذا الإعداد لا يُعدَّل من هذه الصفحة».
// They used to render as an empty textarea with a Save button that always failed — the screen said the value
// was empty when it was not. They are now printed as they are, read-only, beside that sentence.

import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { LegacyPricingNotice, treePricingReady } from "@/components/admin/legacy-pricing-notice";
import { NavIcon } from "@/components/admin/nav-icons";
import { ADMIN_LABELS } from "@/components/admin/nav-model";
import { PricingEditor } from "@/components/admin/pricing-editor";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { formatCount, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { updateSetting } from "./actions";
import { PairListEditor } from "./pair-list-editor";
import { INTEGER_RANGES } from "./ranges";

export const metadata: Metadata = { title: ADMIN_LABELS["/admin/settings"] };

/** The four tables of this one room. The first is this page. */
const ROOMS = [
  { href: "/admin/settings", label: "النصوص والأرقام", icon: "settings" },
  { href: "/admin/settings/modules", label: ADMIN_LABELS["/admin/settings/modules"], icon: "modules" },
  { href: "/admin/settings/lists", label: ADMIN_LABELS["/admin/settings/lists"], icon: "lists" },
  { href: "/admin/settings/media", label: ADMIN_LABELS["/admin/settings/media"], icon: "media" },
] as const;

/**
 * The sections, in the order a setting is looked for: the pages the visitor walks first, then the demand
 * they send, then the rules behind it. `prefixes` are matched against the part of the key before the first
 * dot — the thing the setting acts on.
 *
 * The words are the product's own: عرض for what we sell, زيتونة for the unit. This screen was still titled
 * «المشاريع والقطع» after both were retired everywhere else.
 *
 * A title is short because it is also the chip in the index at the top of the page — two names for one
 * section is the confusion this whole pass is removing. What a section covers goes in its note.
 */
const SECTIONS: { id: string; title: string; note?: string; prefixes: readonly string[] }[] = [
  {
    id: "site",
    title: "الصفحة الرئيسية",
    note: "العناوين والجمل اللي يقراها الزائر في الصفحة الأولى، وأرقام التواصل والشعار.",
    prefixes: ["site", "brand"],
  },
  {
    id: "million",
    title: "العدّاد",
    note: "بطاقات «وين وصلنا؟» وجملها. بطاقة بعنوان فارغ تتخبّى من الموقع.",
    prefixes: ["million"],
  },
  {
    id: "start",
    title: "الحاسبة",
    note: "نصوص صفحة الحساب وصفحة تسجيل المطلب. هذي محاكاة تقديرية، موش عرض عقاري — الصياغة لازم تقولها.",
    prefixes: ["start", "simulator", "register"],
  },
  {
    id: "offers",
    title: "مطلب العرض",
    note: "استمارة الاهتمام بعرض حقيقي، وأسماء أرقام المخزون (المتاحة، المحجوزة، المباعة) كيما تظهر للزائر وللفريق.",
    prefixes: ["offers"],
  },
  {
    id: "projects",
    title: "صفحات العروض",
    note: "نصوص وحدود صفحات العروض العمومية. ممنوع أي رقم أو كلمة توحي بمردود أو ربح.",
    prefixes: ["projects"],
  },
  {
    id: "leads",
    title: "المطالب والملفات",
    note: "إسناد الملفات للكوميرسيال، وبادئة أرقام المطالب.",
    prefixes: ["lead", "crm", "request_no"],
  },
  {
    id: "legal",
    title: "النصوص القانونية",
    note: "تظهر إلزامياً في الموقع. يمكن تعديل صياغتها بعد مصادقة المهني القانوني، ولا يمكن تركها فارغة.",
    prefixes: ["legal"],
  },
  {
    id: "pricing",
    title: "صيغة التسعير",
    note: "الصيغة اللي تتطبّق على كل عرض ما عندوش صيغة خاصة، وشرائح التحليلات. الأرقام تحتاج مصادقة Finance قبل النشر، والتفصيل في صفحة «التسعير».",
    prefixes: ["pricing", "analytics"],
  },
  {
    id: "sms",
    title: "الرسائل القصيرة",
    note: "اسم المرسل لازم يكون مقبولاً عند المزوّد قبل أول إرسال، وإلا الرسائل ما تخرجش.",
    prefixes: ["sms"],
  },
  {
    id: "guard",
    title: "الحماية",
    note: "حدود الإرسال على كل استمارة، وحجم الملفات في مطلب الأرض وبادئة رقمه.",
    prefixes: ["antispam", "land_offer", "land_offer_no"],
  },
  {
    id: "internal",
    title: "قواعد داخلية",
    note: "ما يشوفهاش الزائر: أوزان المطابقة، وأقل طول لسبب العملية الحساسة في سجل العمليات.",
    prefixes: ["matching", "audit"],
  },
];

/** Whatever no section claims. It is empty today and must stay reachable the day a new key arrives. */
const OTHER = { id: "other", title: "إعدادات أخرى", note: "مازالت ما تصنّفتش. كل صف في الجدول لازم يبان في هذه الصفحة.", prefixes: [] };

/**
 * The only json settings ./actions.ts can save: two through JSON_SCHEMAS, two special-cased. Any other json
 * key is printed read-only. Add an editor there and here in the same change, or the screen lies again.
 */
const EDITABLE_JSON = new Set(["site.how_it_works", "site.faq", "pricing.default", "simulator.durations_months"]);

const SHORT_TEXT_KEYS = new Set(["request_no.prefix", "land_offer_no.prefix", "site.contact_phone", "site.contact_whatsapp", "site.contact_email", "brand.tagline_fr"]);
const LTR_KEYS = new Set(["request_no.prefix", "land_offer_no.prefix", "site.contact_phone", "site.contact_whatsapp", "site.contact_email", "brand.tagline_fr"]);

export default async function SettingsPage() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const newPricing = treePricingReady(await getPublicConfig());
  const { data: settings, error } = await supabase
    .from("settings")
    .select("key, value, value_type, label_ar, description_ar, is_public, updated_at, editor:profiles!settings_updated_by_fkey(full_name)")
    // group_key no longer decides where a row is drawn, but it still decides the order inside a section:
    // it is what keeps a text and its French twin next to each other.
    .order("group_key")
    .order("sort_order");
  if (error) throw new Error(error.message);

  const rows = settings ?? [];
  const claimed = new Set(SECTIONS.flatMap((section) => section.prefixes));
  const sections = [...SECTIONS, OTHER]
    .map((section) => ({
      ...section,
      rows: rows.filter((setting) => {
        const prefix = setting.key.split(".")[0];
        return section.prefixes.length > 0 ? section.prefixes.includes(prefix) : !claimed.has(prefix);
      }),
    }))
    .filter((section) => section.rows.length > 0);

  return (
    <div className="max-w-4xl space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="section-title">{ADMIN_LABELS["/admin/settings"]}</h1>
          <p className="mt-2 max-w-2xl leading-7 text-muted">
            كل قيمة هنا تُقرأ من قاعدة البيانات، لا من الكود. الحفظ يسري فوراً ويُسجَّل في سجل العمليات.
          </p>
        </div>

        <nav aria-label="أقسام الإعدادات" className="flex flex-wrap gap-tight">
          {ROOMS.map((room) => {
            const current = room.href === "/admin/settings";
            return (
              <Link key={room.href} href={room.href} className="chip" aria-current={current ? "true" : undefined}>
                <NavIcon name={room.icon} className="size-4" />
                {room.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Where a setting is, without scrolling three hundred cards to find out. */}
      <nav aria-label="فهرس الإعدادات" className="panel flex flex-wrap gap-tight p-cozy">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="chip">
            {section.title}
            <span className="text-xs text-muted tabular-nums">{formatCount(section.rows.length)}</span>
          </a>
        ))}
      </nav>

      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.note ? <p className="mt-1 text-sm text-muted">{section.note}</p> : null}
          </div>
          <ul className="space-y-3">
            {section.rows.map((setting) => {
              const readOnlyJson = setting.value_type === "json" && !EDITABLE_JSON.has(setting.key);
              return (
                <li key={setting.key} className="card p-5">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-baseline gap-2 font-semibold">
                        {setting.label_ar}
                        {setting.is_public ? null : <span className="pill pill-line">داخلي</span>}
                      </h3>
                      {setting.description_ar ? <p className="mt-0.5 text-sm text-muted">{setting.description_ar}</p> : null}
                      <p dir="ltr" className="mt-1 text-start text-xs text-muted">
                        {setting.key}
                      </p>
                    </div>
                    <p className="text-xs text-muted tabular-nums">
                      {formatDateTime(setting.updated_at)}
                      {setting.editor?.full_name ? ` · ${setting.editor.full_name}` : ""}
                    </p>
                  </div>

                  {readOnlyJson ? (
                    <div className="space-y-2">
                      <pre dir="ltr" className="overflow-x-auto rounded-lg bg-paper p-3 text-start text-xs leading-5 text-ink">
                        {JSON.stringify(setting.value, null, 2)}
                      </pre>
                      <p className="hint">هذي القيمة ما تتبدّلش من هذه الصفحة. تتبدّل في قاعدة البيانات مع migration.</p>
                    </div>
                  ) : (
                    <ActionForm action={updateSetting.bind(null, setting.key)} submitLabel="حفظ" buttonClassName="btn btn-secondary min-h-10">
                      <SettingInput
                        settingKey={setting.key}
                        type={setting.value_type}
                        value={setting.value}
                        label={setting.label_ar}
                        newPricing={newPricing}
                      />
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SettingInput({
  settingKey,
  type,
  value,
  label,
  newPricing,
}: {
  settingKey: string;
  type: string;
  value: unknown;
  label: string;
  newPricing: boolean;
}) {
  if (type === "boolean") {
    return (
      <label className="flex items-center gap-3">
        <input type="checkbox" name="value" defaultChecked={value === true} className="size-5 accent-forest" />
        <span>مفعّل</span>
      </label>
    );
  }

  if (type === "integer") {
    const [min, max] = INTEGER_RANGES[settingKey] ?? [0, 1_000_000];
    const input = (
      <input
        type="number"
        name="value"
        defaultValue={Number(value)}
        min={min}
        max={max}
        step={1}
        dir="ltr"
        className="field max-w-40 text-left"
        aria-label={label}
      />
    );
    // Months, not a bare number: the cap of report v3 §8.
    return settingKey === "pricing.max_months" ? (
      <span className="flex items-center gap-2">
        {input}
        <span className="text-sm text-muted">شهراً</span>
      </span>
    ) : (
      input
    );
  }

  if (settingKey === "crm.auto_assign_mode") {
    return (
      <select name="value" defaultValue={String(value)} className="field max-w-sm" aria-label={label}>
        <option value="manual">يدوياً من Admin</option>
        <option value="round_robin">بالتناوب على الـCommercials النشطين</option>
      </select>
    );
  }

  if (settingKey === "simulator.durations_months") {
    return (
      <input
        name="value"
        defaultValue={Array.isArray(value) ? value.join("، ") : ""}
        className="field max-w-sm"
        aria-label={label}
        placeholder="36، 48، 60"
      />
    );
  }

  if (settingKey === "pricing.default") {
    return (
      <div className="space-y-3">
        {newPricing ? <LegacyPricingNotice /> : null}
        <PricingEditor initial={value} inherit={null} />
      </div>
    );
  }

  if (settingKey === "site.how_it_works") {
    return (
      <PairListEditor
        initial={Array.isArray(value) ? (value as Record<string, string>[]) : []}
        firstKey="title"
        secondKey="text"
        firstLabel="عنوان الخطوة"
        secondLabel="نص الخطوة"
        addLabel="إضافة خطوة"
        max={10}
      />
    );
  }

  if (settingKey === "site.faq") {
    return (
      <PairListEditor
        initial={Array.isArray(value) ? (value as Record<string, string>[]) : []}
        firstKey="q"
        secondKey="a"
        firstLabel="السؤال"
        secondLabel="الجواب"
        addLabel="إضافة سؤال"
        max={30}
      />
    );
  }

  const text = typeof value === "string" ? value : "";
  if (SHORT_TEXT_KEYS.has(settingKey)) {
    return (
      <input
        name="value"
        defaultValue={text}
        dir={LTR_KEYS.has(settingKey) ? "ltr" : undefined}
        className={`field max-w-md ${LTR_KEYS.has(settingKey) ? "text-left" : ""}`}
        aria-label={label}
      />
    );
  }
  return <textarea name="value" defaultValue={text} rows={text.length > 90 ? 3 : 2} className="field min-h-20" aria-label={label} />;
}
