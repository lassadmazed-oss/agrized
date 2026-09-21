import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { GROWTH_ICON_CODES, GrowthIcon, type GrowthIconCode } from "@/components/site/growth-icon";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PLANTATION_LABELS, PRODUCTION_LABELS, STAGE_LABELS, type LeadStage } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";

import { clearScenarioImage, saveLeadStatus, saveOptionItem, saveProjectType, saveScenario } from "./actions";

const ICON_LABELS: Record<GrowthIconCode, string> = {
  productive: "زيتونة منتجة",
  near_production: "قريبة للإنتاج",
  young_olive: "زيتونة صغيرة",
  bare_land: "أرض تتغرس",
  other: "رسم عام",
};

type ScenarioRow = {
  id: string;
  code: string;
  label_ar: string;
  label_fr: string | null;
  description_ar: string | null;
  description_fr: string | null;
  project_type_id: string | null;
  plantation_system: string | null;
  production_status: string | null;
  is_any: boolean;
  sort_order: number;
  is_active: boolean;
  icon_code: string | null;
  image_url: string | null;
  image_alt_ar: string | null;
  image_alt_fr: string | null;
};

export const metadata: Metadata = { title: "القوائم" };

type OptionRow = {
  id: string;
  list_key: string;
  code: string | null;
  label_ar: string;
  label_fr: string | null;
  min_millimes: number | null;
  max_millimes: number | null;
  min_number: number | null;
  max_number: number | null;
  time_from: string | null;
  time_to: string | null;
  sort_order: number;
  is_active: boolean;
};

export default async function ListsPage() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const [lists, items, projectTypes, scenarios, statuses] = await Promise.all([
    supabase.from("option_lists").select("key, label_ar, value_kind, description_ar").order("key"),
    supabase
      .from("option_items")
      .select(
        "id, list_key, code, label_ar, label_fr, min_millimes, max_millimes, min_number, max_number, time_from, time_to, sort_order, is_active",
      )
      .order("sort_order"),
    supabase.from("project_types").select("id, code, label_ar, label_fr, description_ar, sort_order, is_active").order("sort_order"),
    supabase
      .from("ownership_scenarios")
      .select(
        "id, code, label_ar, label_fr, description_ar, description_fr, project_type_id, plantation_system, production_status, is_any, sort_order, is_active, icon_code, image_url, image_alt_ar, image_alt_fr",
      )
      .order("sort_order"),
    supabase.from("lead_statuses").select("id, stage, label_ar, label_fr, sort_order, is_active").order("sort_order"),
  ]);
  for (const result of [lists, items, projectTypes, scenarios, statuses]) {
    if (result.error) throw new Error(result.error.message);
  }

  const listOrder = [
    "desired_area",
    "priority",
    "down_payment",
    "monthly_installment",
    "goal",
    "contact_time",
    "plantation_system",
    "property_type",
    "tree_age",
    "land_document",
  ];
  const orderedLists = [...(lists.data ?? [])].sort((a, b) => listOrder.indexOf(a.key) - listOrder.indexOf(b.key));
  const types = projectTypes.data ?? [];
  const scenarioRows = (scenarios.data ?? []) as ScenarioRow[];

  return (
    <div className="max-w-5xl space-y-10">
      <header>
        <h1 className="section-title">القوائم</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          القيم التي يختار منها الزوار والفريق. تعديل قيمة لا يغيّر المطالب المسجّلة سابقاً، لأن كل مطلب يحتفظ بالقيمة كما كانت.
          لإخفاء قيمة، ألغِ «نشط» بدل حذفها.
        </p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">كيفاش تحب مشروعك يكون؟ (بطاقات نوع المشروع)</h2>
          <p className="text-sm text-muted">
            كل بطاقة يراها المواطن مربوطة هنا بنوع مشروع ونظام غراسة وحالة إنتاج. ما دامت البطاقة بلا صورة يظهر رسمها، والشرح
            الفارغ لا يُعرض. المساحة وعدد الزيتونات والسعر تبقى حقولاً مستقلة في كل عرض.
          </p>
        </div>
        <ul className="space-y-3">
          {scenarioRows.map((scenario) => (
            <li key={scenario.id} className="card p-4">
              <div className="grid gap-4 md:grid-cols-[10rem_1fr]">
                <div>
                  <ScenarioPreview scenario={scenario} />
                  <p dir="ltr" className="mt-2 text-center font-mono text-[0.7rem] text-muted">
                    {scenario.code}
                  </p>
                  {scenario.image_url ? (
                    <form action={clearScenarioImage.bind(null, scenario.id)} className="mt-2 text-center">
                      <button type="submit" className="text-sm font-medium text-danger underline-offset-4 hover:underline">
                        إزالة الصورة
                      </button>
                    </form>
                  ) : null}
                </div>
                <ActionForm
                  action={saveScenario.bind(null, scenario.id)}
                  submitLabel="حفظ"
                  className="space-y-3"
                  buttonClassName="btn btn-secondary btn-sm"
                >
                  <ScenarioFields scenario={scenario} types={types} />
                </ActionForm>
              </div>
            </li>
          ))}
          <li className="rounded-2xl border border-dashed border-line-strong bg-paper/60 p-4">
            <p className="mb-2 text-sm font-semibold text-forest">إضافة بطاقة</p>
            <ActionForm
              action={saveScenario.bind(null, null)}
              submitLabel="إضافة"
              pendingLabel="جارٍ الإضافة…"
              className="space-y-3"
              buttonClassName="btn btn-primary btn-sm"
            >
              <ScenarioFields scenario={null} types={types} nextOrder={(scenarioRows.at(-1)?.sort_order ?? 0) + 10} />
            </ActionForm>
          </li>
        </ul>
      </section>

      {orderedLists.map((list) => {
        const rows = (items.data ?? []).filter((item) => item.list_key === list.key) as OptionRow[];
        return (
          <section key={list.key} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{list.label_ar}</h2>
              {list.description_ar ? <p className="text-sm text-muted">{list.description_ar}</p> : null}
            </div>
            <ul className="space-y-2">
              {rows.map((item) => (
                <li key={item.id} className="card p-4">
                  <ActionForm
                    action={saveOptionItem.bind(null, item.id, list.key)}
                    submitLabel="حفظ"
                    className="flex flex-wrap items-end gap-3"
                    buttonClassName="btn btn-secondary btn-sm"
                  >
                    <OptionFields kind={list.value_kind} item={item} />
                  </ActionForm>
                </li>
              ))}
              {list.value_kind !== "code" ? (
                <li className="rounded-2xl border border-dashed border-line-strong bg-paper/60 p-4">
                  <p className="mb-2 text-sm font-semibold text-forest">إضافة قيمة</p>
                  <ActionForm
                    action={saveOptionItem.bind(null, null, list.key)}
                    submitLabel="إضافة"
                    pendingLabel="جارٍ الإضافة…"
                    className="flex flex-wrap items-end gap-3"
                    buttonClassName="btn btn-primary btn-sm"
                  >
                    <OptionFields kind={list.value_kind} item={null} nextOrder={(rows.at(-1)?.sort_order ?? 0) + 10} />
                  </ActionForm>
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">أنواع المشاريع</h2>
          <p className="text-sm text-muted">تظهر في الصفحة الرئيسية، ويرتبط بها كل سيناريو.</p>
        </div>
        <ul className="space-y-2">
          {types.map((type) => (
            <li key={type.id} className="card p-4">
              <ActionForm
                action={saveProjectType.bind(null, type.id)}
                submitLabel="حفظ"
                className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_auto_auto] sm:items-end"
                buttonClassName="btn btn-secondary btn-sm"
              >
                <TextInput name="label_ar" label="الاسم" defaultValue={type.label_ar} required />
                <TextInput name="label_fr" label="بالفرنسية" defaultValue={type.label_fr ?? ""} ltr />
                <NumberInput name="sort_order" label="الترتيب" defaultValue={type.sort_order} />
                <ActiveToggle defaultChecked={type.is_active} />
                <div className="sm:col-span-5 sm:row-start-2">
                  <TextInput name="description_ar" label="الوصف" defaultValue={type.description_ar ?? ""} />
                </div>
              </ActionForm>
              <p dir="ltr" className="mt-2 text-end text-xs text-muted sm:text-start">
                {type.code}
              </p>
            </li>
          ))}
          <li className="rounded-2xl border border-dashed border-line-strong bg-paper/60 p-4">
            <p className="mb-2 text-sm font-semibold text-forest">إضافة نوع مشروع</p>
            <ActionForm
              action={saveProjectType.bind(null, null)}
              submitLabel="إضافة"
              className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_6rem_auto] sm:items-end"
              buttonClassName="btn btn-primary btn-sm"
            >
              <TextInput name="label_ar" label="الاسم" required />
              <TextInput name="label_fr" label="بالفرنسية" ltr />
              <TextInput name="code" label="الرمز التقني" ltr required placeholder="olive_orchard" />
              <NumberInput name="sort_order" label="الترتيب" defaultValue={(types.at(-1)?.sort_order ?? 0) + 10} />
              <ActiveToggle defaultChecked />
              <div className="sm:col-span-5 sm:row-start-2">
                <TextInput name="description_ar" label="الوصف" />
              </div>
            </ActionForm>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">حالات الملفات</h2>
          <p className="text-sm text-muted">
            كل حالة مرتبطة بمرحلة نظام ثابتة تعتمد عليها القواعد الآلية. يمكن تغيير الاسم وإضافة حالات داخل نفس المرحلة.
          </p>
        </div>
        <ul className="space-y-2">
          {(statuses.data ?? []).map((status) => (
            <li key={status.id} className="card p-4">
              <ActionForm
                action={saveLeadStatus.bind(null, status.id)}
                submitLabel="حفظ"
                className="grid gap-3 sm:grid-cols-[9rem_1fr_1fr_6rem_auto_auto] sm:items-end"
                buttonClassName="btn btn-secondary btn-sm"
              >
                <div>
                  <span className="block text-xs text-muted">المرحلة</span>
                  <span className="mt-2 block text-sm font-semibold">{STAGE_LABELS[status.stage as LeadStage]}</span>
                </div>
                <TextInput name="label_ar" label="الاسم" defaultValue={status.label_ar} required />
                <TextInput name="label_fr" label="بالفرنسية" defaultValue={status.label_fr ?? ""} ltr />
                <NumberInput name="sort_order" label="الترتيب" defaultValue={status.sort_order} />
                <ActiveToggle defaultChecked={status.is_active} />
              </ActionForm>
            </li>
          ))}
          <li className="rounded-2xl border border-dashed border-line-strong bg-paper/60 p-4">
            <p className="mb-2 text-sm font-semibold text-forest">إضافة حالة</p>
            <ActionForm
              action={saveLeadStatus.bind(null, null)}
              submitLabel="إضافة"
              className="grid gap-3 sm:grid-cols-[10rem_1fr_1fr_6rem_auto_auto] sm:items-end"
              buttonClassName="btn btn-primary btn-sm"
            >
              <label className="block space-y-1">
                <span className="block text-xs text-muted">المرحلة</span>
                <select name="stage" className="field" required defaultValue="">
                  <option value="" disabled>
                    اختر
                  </option>
                  {Object.entries(STAGE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <TextInput name="label_ar" label="الاسم" required />
              <TextInput name="label_fr" label="بالفرنسية" ltr />
              <NumberInput name="sort_order" label="الترتيب" defaultValue={((statuses.data ?? []).at(-1)?.sort_order ?? 0) + 10} />
              <ActiveToggle defaultChecked />
            </ActionForm>
          </li>
        </ul>
      </section>
    </div>
  );
}

/** One §8 card: its words, what it maps to, its drawing and its optional picture. */
function ScenarioFields({
  scenario,
  types,
  nextOrder = 0,
}: {
  scenario: ScenarioRow | null;
  types: { id: string; label_ar: string }[];
  nextOrder?: number;
}) {
  const fileId = `scenario-image-${scenario?.id ?? "new"}`;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput name="label_ar" label="النص للمواطن" defaultValue={scenario?.label_ar ?? ""} required />
        <TextInput name="label_fr" label="بالفرنسية" defaultValue={scenario?.label_fr ?? ""} ltr />
        <TextInput name="description_ar" label="شرح قصير (اختياري)" defaultValue={scenario?.description_ar ?? ""} />
        <TextInput name="description_fr" label="الشرح بالفرنسية (اختياري)" defaultValue={scenario?.description_fr ?? ""} ltr />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_6rem] lg:items-end">
        <SelectInput
          name="project_type_id"
          label="نوع المشروع"
          defaultValue={scenario?.project_type_id ?? ""}
          options={[{ value: "", label: "بدون" }, ...types.map((t) => ({ value: t.id, label: t.label_ar }))]}
        />
        <SelectInput
          name="plantation_system"
          label="نظام الغراسة"
          defaultValue={scenario?.plantation_system ?? ""}
          options={[{ value: "", label: "غير محدّد" }, ...Object.entries(PLANTATION_LABELS).map(([value, label]) => ({ value, label }))]}
        />
        <SelectInput
          name="production_status"
          label="حالة الإنتاج"
          defaultValue={scenario?.production_status ?? ""}
          options={[{ value: "", label: "غير محدّدة" }, ...Object.entries(PRODUCTION_LABELS).map(([value, label]) => ({ value, label }))]}
        />
        <NumberInput name="sort_order" label="الترتيب" defaultValue={scenario?.sort_order ?? nextOrder} />
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {scenario ? null : (
          <div className="w-60">
            <TextInput name="code" label="الرمز التقني" ltr required placeholder="near_production" />
          </div>
        )}
        <CheckboxInput name="is_any" label="ما يهمنيش النوع (اقترحولي)" defaultChecked={scenario?.is_any ?? false} />
        <ActiveToggle defaultChecked={scenario?.is_active ?? true} />
      </div>

      <fieldset>
        <legend className="block text-xs text-muted">الرسم، يظهر ما دامت البطاقة بلا صورة</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {GROWTH_ICON_CODES.map((code) => (
            <label key={code} className="choice min-h-11 gap-2 px-3 py-1.5 text-sm">
              <input type="radio" name="icon_code" value={code} defaultChecked={(scenario?.icon_code ?? "other") === code} />
              <GrowthIcon code={code} className="size-6 flex-none text-leaf" />
              {ICON_LABELS[code]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={fileId} className="block text-xs text-muted">
            صورة البطاقة (اختيارية)
          </label>
          <input
            id={fileId}
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="field field-sm py-2 file:me-3 file:rounded-lg file:border-0 file:bg-leaf-soft file:px-3 file:py-1 file:text-sm file:font-semibold file:text-forest"
          />
          <p className="hint">JPG أو PNG أو WEBP أو AVIF، 5 ميغا كحد أقصى. اتركه فارغاً للإبقاء على الصورة الحالية.</p>
        </div>
        <TextInput
          name="image_alt_ar"
          label="وصف الصورة (نص بديل، إلزامي مع الصورة)"
          defaultValue={scenario?.image_alt_ar ?? ""}
          placeholder="مثال: زيتونة كبيرة محمّلة بالزيتون"
        />
        <TextInput name="image_alt_fr" label="وصف الصورة بالفرنسية" defaultValue={scenario?.image_alt_fr ?? ""} ltr />
      </div>
    </>
  );
}

function ScenarioPreview({ scenario }: { scenario: ScenarioRow }) {
  return (
    <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-xl border border-line bg-leaf-soft">
      {scenario.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded file
        <img src={scenario.image_url} alt={scenario.image_alt_ar ?? ""} className="size-full object-cover" />
      ) : (
        <GrowthIcon code={scenario.icon_code} className="size-12 text-leaf" />
      )}
    </div>
  );
}

function OptionFields({ kind, item, nextOrder = 0 }: { kind: string; item: OptionRow | null; nextOrder?: number }) {
  return (
    <>
      <div className="min-w-40 flex-1">
        <TextInput name="label_ar" label="النص" defaultValue={item?.label_ar ?? ""} required />
      </div>
      <div className="min-w-32 flex-1">
        <TextInput name="label_fr" label="بالفرنسية" defaultValue={item?.label_fr ?? ""} ltr />
      </div>
      {kind === "money" ? (
        <>
          <div className="w-32">
            <TextInput
              name="min_dinars"
              label="المبلغ (د.ت)"
              defaultValue={item?.min_millimes !== null && item?.min_millimes !== undefined ? String(item.min_millimes / 1000) : ""}
              ltr
              required
            />
          </div>
          <div className="w-32">
            <TextInput
              name="max_dinars"
              label="حد أقصى (اختياري)"
              defaultValue={item?.max_millimes !== null && item?.max_millimes !== undefined ? String(item.max_millimes / 1000) : ""}
              ltr
            />
          </div>
        </>
      ) : null}
      {kind === "number_range" ? (
        <>
          <div className="w-32">
            <TextInput
              name="min_number"
              label="من (م²)"
              defaultValue={item?.min_number !== null && item?.min_number !== undefined ? String(item.min_number) : ""}
              ltr
            />
          </div>
          <div className="w-32">
            <TextInput
              name="max_number"
              label="إلى (م²)"
              defaultValue={item?.max_number !== null && item?.max_number !== undefined ? String(item.max_number) : ""}
              ltr
            />
          </div>
        </>
      ) : null}
      {kind === "time_range" ? (
        <>
          <div className="w-28">
            <TextInput name="time_from" label="من" defaultValue={item?.time_from?.slice(0, 5) ?? ""} ltr required placeholder="08:00" />
          </div>
          <div className="w-28">
            <TextInput name="time_to" label="إلى" defaultValue={item?.time_to?.slice(0, 5) ?? ""} ltr required placeholder="12:00" />
          </div>
        </>
      ) : null}
      <div className="w-24">
        <NumberInput name="sort_order" label="الترتيب" defaultValue={item?.sort_order ?? nextOrder} />
      </div>
      <ActiveToggle defaultChecked={item?.is_active ?? true} />
    </>
  );
}

function TextInput({
  name,
  label,
  defaultValue = "",
  required = false,
  ltr = false,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  ltr?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-muted">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        dir={ltr ? "ltr" : undefined}
        className={`field field-sm ${ltr ? "text-left" : ""}`}
      />
    </label>
  );
}

function SelectInput({
  name,
  label,
  defaultValue = "",
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-muted">{label}</span>
      <select name={name} defaultValue={defaultValue} className="field field-sm">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberInput({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-muted">{label}</span>
      <input type="number" name={name} defaultValue={defaultValue} min={0} dir="ltr" className="field field-sm text-left" />
    </label>
  );
}

function CheckboxInput({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-forest" />
      {label}
    </label>
  );
}

function ActiveToggle({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" name="is_active" defaultChecked={defaultChecked} className="size-4 accent-forest" />
      نشط
    </label>
  );
}
