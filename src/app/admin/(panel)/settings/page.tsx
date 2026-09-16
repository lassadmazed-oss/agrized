import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { LegacyPricingNotice, treePricingReady } from "@/components/admin/legacy-pricing-notice";
import { PricingEditor } from "@/components/admin/pricing-editor";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { updateSetting } from "./actions";
import { PairListEditor } from "./pair-list-editor";
import { INTEGER_RANGES } from "./ranges";

export const metadata: Metadata = { title: "الإعدادات والنصوص" };

const GROUPS: { key: string; title: string; note?: string }[] = [
  { key: "site", title: "نصوص الموقع" },
  {
    key: "legal",
    title: "النصوص القانونية",
    note: "تظهر إلزامياً في الموقع. يمكن تعديل صياغتها بعد مصادقة المهني القانوني، ولا يمكن تركها فارغة.",
  },
  { key: "lead", title: "التسجيل والملفات" },
  {
    key: "sms",
    title: "الرسائل القصيرة",
    note: "اسم المرسل لازم يكون مقبولاً عند المزوّد قبل أول إرسال، وإلا الرسائل ما تخرجش.",
  },
  { key: "simulator", title: "المحاكي" },
  {
    key: "projects",
    title: "المشاريع والقطع",
    note: "نصوص وحدود صفحات المشاريع العمومية. ممنوع أي رقم أو كلمة توحي بمردود أو ربح.",
  },
  {
    key: "pricing",
    title: "التسعير",
    note: "الصيغة اللي تتطبّق على كل مشروع وقطعة ما عندهمش صيغة خاصة. الأرقام تحتاج مصادقة Finance قبل النشر.",
  },
  { key: "antispam", title: "الحماية والملفات المرفقة" },
];

const SHORT_TEXT_KEYS = new Set(["request_no.prefix", "land_offer_no.prefix", "site.contact_phone", "site.contact_whatsapp", "site.contact_email", "brand.tagline_fr"]);
const LTR_KEYS = new Set(["request_no.prefix", "land_offer_no.prefix", "site.contact_phone", "site.contact_whatsapp", "site.contact_email", "brand.tagline_fr"]);

export default async function SettingsPage() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const newPricing = treePricingReady(await getPublicConfig());
  const { data: settings, error } = await supabase
    .from("settings")
    .select("key, value, value_type, group_key, label_ar, description_ar, is_public, updated_at, editor:profiles!settings_updated_by_fkey(full_name)")
    .order("group_key")
    .order("sort_order");
  if (error) throw new Error(error.message);

  return (
    <div className="max-w-4xl space-y-10">
      <header>
        <h1 className="font-display text-4xl font-bold text-forest">الإعدادات والنصوص</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          كل قيمة هنا تُقرأ من قاعدة البيانات، لا من الكود. الحفظ يسري فوراً ويُسجَّل في سجل العمليات.
        </p>
      </header>

      {GROUPS.map((group) => {
        const rows = (settings ?? []).filter((setting) => setting.group_key === group.key);
        if (rows.length === 0) return null;
        return (
          <section key={group.key} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{group.title}</h2>
              {group.note ? <p className="mt-1 text-sm text-muted">{group.note}</p> : null}
            </div>
            <ul className="space-y-3">
              {rows.map((setting) => (
                <li key={setting.key} className="rounded-2xl border border-line bg-surface p-5">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{setting.label_ar}</h3>
                      {setting.description_ar ? <p className="mt-0.5 text-sm text-muted">{setting.description_ar}</p> : null}
                    </div>
                    <p className="text-xs text-muted tabular-nums">
                      {formatDateTime(setting.updated_at)}
                      {setting.editor?.full_name ? ` · ${setting.editor.full_name}` : ""}
                    </p>
                  </div>
                  <ActionForm action={updateSetting.bind(null, setting.key)} submitLabel="حفظ" buttonClassName="btn btn-secondary min-h-10">
                    <SettingInput
                      settingKey={setting.key}
                      type={setting.value_type}
                      value={setting.value}
                      label={setting.label_ar}
                      newPricing={newPricing}
                    />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
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
