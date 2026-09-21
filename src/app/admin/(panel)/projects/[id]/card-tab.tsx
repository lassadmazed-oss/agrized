// Section «بطاقة العرض»: everything the offer says about itself, in one form.
//
// It stays ONE form on purpose. saveProject() writes the public page fields only when the form carries the
// hidden `page_fields` marker, so a half form could silently erase the description, the water and access notes,
// the video, the map point and the document and service lists. The marker and every field it guards are here.
//
// WHAT LEFT, 2026-09-18. The legacy jsonb pricing editor — «طريقة التسعير» with its four modes and the bulleted
// formula list — used to sit at the bottom of this same form. It wrote public.projects.pricing, which is read by
// exactly one SQL object, app.parcel_pricing(p_parcel), which joins public.parcels: with no parcel row nothing
// reads it, and no part of the tree chain (app.tree_price, app.project_quote_payload, app.financed_quote,
// public.financing_markups) ever did. So the owner was choosing between four pricing modes that price nothing,
// on the same screen as the real price. Removing it takes `pricing_mode` out of this FormData, so saveProject
// must read the pricing only when the field is present — exactly as it already guards `page_fields` and
// `delegation_id` — or the whole card save fails with «اختر طريقة التسعير». The column itself is untouched.

import { ActionForm } from "@/components/admin/action-form";
import { FormField, SectionHeader } from "@/components/ui";
import { optionsFor, settingInt, settingText, type PublicConfig } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { PROJECT_STATUS_LABELS } from "@/lib/projects";
import type { Database } from "@/lib/supabase/database.types";

import { saveProject } from "../actions";

import { MapPoint } from "./map-point";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

/**
 * The first and last code an offer's trees would carry under one pattern — the same rendering app.tree_code()
 * does in SQL (0054), shown here so the owner reads a real example of his own offer instead of a template
 * language. It never numbers anything; the database does that, and a tree keeps the code it was given.
 */
function treeCodeSample(pattern: string, code: string, digits: number, lastSeq: number): string {
  const render = (seq: number) => pattern.replaceAll("{offer}", code).replaceAll("{seq}", String(seq).padStart(digits, "0"));
  return lastSeq > 1 ? `${render(1)} … ${render(lastSeq)}` : render(1);
}

export function CardTab({
  project,
  config,
  canWrite,
}: {
  project: ProjectRow;
  config: PublicConfig;
  canWrite: boolean;
}) {
  if (!canWrite) {
    return (
      <div className="card p-5 text-sm leading-6 text-muted">
        بطاقة العرض تتبدّل من طرف المالية أو الإدارة فقط. تنجّم تقرا الأرقام كاملة فوق وفي بقية التبويبات.
      </div>
    );
  }

  // What the numbering examples are built from: the same two settings app.tree_code() reads, and this offer's
  // own declared count, so «رمز العرض + رقم» shows TX-002-0001 … TX-002-4000 rather than an abstract shape.
  const digits = Math.min(Math.max(settingInt(config, "offers.tree_code_digits", 4), 1), 9);
  const defaultPattern = settingText(config, "offers.tree_code_pattern", "{offer}-{seq}") || "{offer}-{seq}";
  const lastSeq = project.tree_count ?? 0;

  return (
    <div className="space-y-4">
      <SectionHeader title="بطاقة العرض" description="الحقائق اللي يتعرّف بيها العرض، وشنوّة يقرا فيه الزائر في صفحة المشروع." />
      <div className="card p-5 sm:p-6">
        <ActionForm
          action={saveProject.bind(null, project.id)}
          submitLabel="حفظ العرض"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          buttonClassName="btn btn-primary btn-sm sm:col-span-2 lg:col-span-3 lg:w-48"
        >
          <FormField size="sm" label="الاسم">
            <input name="name" defaultValue={project.name} required className="field field-sm" />
          </FormField>
          <FormField size="sm" label="الولاية">
            <select name="governorate_id" defaultValue={project.governorate_id} className="field field-sm">
              {config.governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_ar}
                </option>
              ))}
            </select>
          </FormField>
          <FormField size="sm" label="نوع المشروع">
            <select name="project_type_id" defaultValue={project.project_type_id ?? ""} className="field field-sm">
              <option value="">بدون</option>
              {config.projectTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label_ar}
                </option>
              ))}
            </select>
          </FormField>
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField size="sm" label="وصف الموقع (يظهر مع الولاية في رأس العرض، مثال: طريق تنيور كم 27)">
              <input name="location_description" defaultValue={project.location_description ?? ""} className="field field-sm" />
            </FormField>
          </div>
          <FormField size="sm" label="المساحة الجملية (م²)">
            <input name="total_area_m2" defaultValue={project.total_area_m2 ?? ""} inputMode="decimal" dir="ltr" className="field field-sm text-left" />
          </FormField>
          <FormField size="sm" label="عدد الأشجار">
            <input name="tree_count" defaultValue={project.tree_count ?? ""} inputMode="numeric" dir="ltr" className="field field-sm text-left" />
          </FormField>
          {/* How this offer sells its trees (owner: «there is a minimum of trees to buy, it depends on the
              offer»). Both are per-offer overrides: empty means «take the default from الإعدادات», so the
              hint under each one names the setting rather than repeating a number that could drift. */}
          <FormField
            size="sm"
            label="أقلّ عدد زيتونات في الطلب"
            hint="خلّيه فارغ باش ياخذ العدد الافتراضي من الإعدادات (offers.min_trees_default)."
          >
            <input
              name="min_trees_per_order"
              defaultValue={project.min_trees_per_order ?? ""}
              inputMode="numeric"
              dir="ltr"
              className="field field-sm text-left"
            />
          </FormField>
          {/* Owner, 2026-09-19: «I don't like this, it should be simpler». It was a text box asking for a
              template — «لازم فيها {seq}، مثال: {offer}-{seq}» — which is a small programming language to learn
              before you can name a tree. The shapes anyone actually wants are two, so they are offered as two
              choices showing THIS offer's real first and last code. The column still stores the pattern. */}
          <FormField size="sm" label="ترقيم الزيتونات" hint="كيفاش تتسمّى زيتونات هذا العرض. تبديلها ما يعاودش تسمية زيتونة مرقّمة من قبل.">
            <select
              name="tree_code_pattern"
              defaultValue={project.tree_code_pattern ?? ""}
              className="field field-sm"
            >
              <option value="">الافتراضي من الإعدادات ({treeCodeSample(defaultPattern, project.code, digits, lastSeq)})</option>
              <option value="{offer}-{seq}">
                رمز العرض + رقم ({treeCodeSample("{offer}-{seq}", project.code, digits, lastSeq)})
              </option>
              <option value="{seq}">رقم برك ({treeCodeSample("{seq}", project.code, digits, lastSeq)})</option>
            </select>
          </FormField>
          <FormField size="sm" label="عمر الأشجار (سنوات)">
            <input name="tree_age_years" defaultValue={project.tree_age_years ?? ""} inputMode="decimal" dir="ltr" className="field field-sm text-left" />
          </FormField>
          {/* Owner, 2026-09-19: «list all the existing types, this should be one thing I copy». It was a bare
              text box, so the same cultivar could be spelled three ways across three offers. The list is
              olive_variety in الإعدادات ← القوائم (0057), and a datalist rather than a select on purpose: a
              grove planted with something nobody listed can still be written down. */}
          <FormField size="sm" label="الصنف" hint="اختار من القائمة، ولّا اكتب صنف آخر.">
            <input
              name="olive_variety"
              list="olive-varieties"
              defaultValue={project.olive_variety ?? ""}
              placeholder="شملالي، شتوي، أربيكينا…"
              className="field field-sm"
            />
            <datalist id="olive-varieties">
              {optionsFor(config, "olive_variety").map((variety) => (
                <option key={variety.id} value={variety.label_ar} />
              ))}
            </datalist>
          </FormField>
          <FormField size="sm" label="نظام الغراسة">
            <select name="plantation_system" defaultValue={project.plantation_system ?? ""} className="field field-sm">
              <option value="">غير محدّد</option>
              {Object.entries(PLANTATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField size="sm" label="حالة الإنتاج">
            <select name="production_status" defaultValue={project.production_status ?? ""} className="field field-sm">
              <option value="">غير محدّدة</option>
              {Object.entries(PRODUCTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField size="sm" label="الري">
            <select name="irrigation" defaultValue={project.irrigation ?? ""} className="field field-sm">
              <option value="">غير محدّد</option>
              <option value="rainfed">بعلية</option>
              <option value="irrigated">مروية</option>
            </select>
          </FormField>
          <FormField size="sm" label="المصاريف السنوية التقديرية للعرض (د.ت)">
            <input
              name="annual_costs_dinars"
              defaultValue={project.annual_costs_millimes !== null ? project.annual_costs_millimes / 1000 : ""}
              inputMode="decimal"
              dir="ltr"
              className="field field-sm text-left"
            />
          </FormField>
          <FormField size="sm" label="الحالة">
            <select name="status" defaultValue={project.status} className="field field-sm">
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          {/* Report v3 §20: what the public project page shows beyond the facts */}
          <input type="hidden" name="page_fields" value="1" />
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField size="sm" label="وصف المشروع (يظهر في صفحة المشروع)">
              <textarea name="description_ar" rows={5} maxLength={4000} defaultValue={project.description_ar ?? ""} className="field min-h-32" />
            </FormField>
            <p className="hint mt-1">بلا وعود ولا أرقام مردود أو ربح (PRN-01).</p>
          </div>
          <FormField size="sm" label="الماء">
            <select
              name="water_available"
              defaultValue={project.water_available === true ? "yes" : project.water_available === false ? "no" : ""}
              className="field field-sm"
            >
              <option value="">غير محدّد</option>
              <option value="yes">متوفّر</option>
              <option value="no">غير متوفّر</option>
            </select>
          </FormField>
          <FormField size="sm" label="مصدر الماء">
            <input name="water_note" maxLength={300} defaultValue={project.water_note ?? ""} placeholder="مثال: بئر عميقة داخل الضيعة" className="field field-sm" />
          </FormField>
          <FormField size="sm" label="النفاذ والطريق">
            <input
              name="access_note"
              maxLength={300}
              defaultValue={project.access_note ?? ""}
              placeholder="مثال: طريق معبّدة حتى مدخل الضيعة"
              className="field field-sm"
            />
          </FormField>
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField size="sm" label="رابط الفيديو (YouTube أو Vimeo يظهر داخل الصفحة، غيرهما يظهر كرابط)">
              <input
                name="video_url"
                type="url"
                maxLength={500}
                defaultValue={project.video_url ?? ""}
                placeholder="https://www.youtube.com/watch?v=…"
                dir="ltr"
                className="field field-sm text-left"
              />
            </FormField>
          </div>
          <MapPoint latitude={project.latitude} longitude={project.longitude} canWrite={canWrite} />
          <label className="choice self-end">
            <input type="checkbox" name="show_location" defaultChecked={project.show_location} />
            <span className="font-medium">إظهار الموقع على الخريطة في صفحة المشروع</span>
          </label>
          <OptionChecks
            legend="الوثائق المتوفّرة (تظهر أسماؤها فقط، الملفات لا تُنشر)"
            name="document_option_ids"
            options={optionsFor(config, "land_document")}
            chosen={project.document_option_ids}
          />
          <OptionChecks
            legend="خدمات AgriZed في هذا المشروع (أسماء بلا أسعار)"
            name="service_option_ids"
            options={optionsFor(config, "agrized_service")}
            chosen={project.service_option_ids}
          />
        </ActionForm>
      </div>
    </div>
  );
}

/** Checkboxes over an option list (PRN-02): the values live in «الإعدادات ← القوائم», not in the code. */
function OptionChecks({
  legend,
  name,
  options,
  chosen,
}: {
  legend: string;
  name: string;
  options: { id: string; label_ar: string }[];
  chosen: string[];
}) {
  return (
    <fieldset className="sm:col-span-2 lg:col-span-3">
      <legend className="text-sm font-semibold">{legend}</legend>
      {options.length === 0 ? (
        <p className="hint mt-1">القائمة فارغة. أضف قيماً من الإعدادات ← القوائم.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => (
            <label key={option.id} className="choice">
              <input type="checkbox" name={name} value={option.id} defaultChecked={chosen.includes(option.id)} />
              <span>{option.label_ar}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
