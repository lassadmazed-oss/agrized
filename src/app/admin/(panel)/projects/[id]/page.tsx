import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { PricingEditor } from "@/components/admin/pricing-editor";
import { ParcelPlan } from "@/components/site/parcel-plan";
import { hasRole, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount, formatMillimes } from "@/lib/format";
import { describePricing } from "@/lib/pricing-form";
import {
  COST_KIND_LABELS,
  COST_KINDS_OFFERED,
  PARCEL_STATUS_LABELS,
  PARCEL_STATUS_TONES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  PROPERTY_TYPE_LABELS,
  type ParcelStatus,
  type ProjectStatus,
} from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

import {
  addProjectCost,
  addProjectPicture,
  moveProjectPicture,
  removeProjectPicture,
  saveParcel,
  saveProject,
  setProjectCover,
} from "../actions";

export const metadata: Metadata = { title: "مشروع" };

const WRITE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
const FINANCE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectDetailPage({ params }: PageProps<"/admin/projects/[id]">) {
  const session = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const canWrite = hasRole(session, WRITE_ROLES);
  const canSeeCosts = hasRole(session, FINANCE_ROLES);
  const supabase = await createClient();
  const config = await getPublicConfig();

  const [{ data: project }, { data: defaultSetting }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("settings").select("value").eq("key", "pricing.default").maybeSingle(),
  ]);
  if (!project) notFound();
  const defaultPricing = defaultSetting?.value ?? null;
  const projectHasPricing = describePricing(project.pricing).length > 0;
  // What a parcel without its own formula uses: the project's, else the default.
  const parcelInherit = {
    label: "نفس صيغة المشروع",
    hint: projectHasPricing ? "الصيغة المضبوطة في بيانات المشروع." : "المشروع يستعمل الصيغة الافتراضية من الإعدادات.",
    lines: describePricing(projectHasPricing ? project.pricing : defaultPricing),
  };

  const [parcels, costs, media] = await Promise.all([
    supabase.from("parcels").select("*").eq("project_id", id).order("sort_order").order("code"),
    canSeeCosts ? supabase.from("project_costs").select("*").eq("project_id", id).order("created_at") : Promise.resolve({ data: [] }),
    supabase
      .from("project_media")
      .select("id, url, alt_ar, caption_ar, is_cover, sort_order")
      .eq("project_id", id)
      .order("sort_order")
      .order("created_at"),
  ]);

  const rows = parcels.data ?? [];
  const pictures = media.data ?? [];
  // Without a chosen cover the site uses the first picture in order.
  const hasChosenCover = pictures.some((picture) => picture.is_cover);
  const parcelArea = rows.reduce((sum, parcel) => sum + Number(parcel.area_m2 ?? 0), 0);
  const parcelTrees = rows.reduce((sum, parcel) => sum + (parcel.olive_tree_count ?? 0), 0);
  const parcelValue = rows.reduce((sum, parcel) => sum + (parcel.cash_price_millimes ?? 0), 0);
  const costTotal = (costs.data ?? []).reduce((sum, cost) => sum + (cost.amount_millimes ?? 0), 0);
  // Report v3 §35: what the parcels not withdrawn would bring at their cash price, against the recorded costs.
  const expectedRevenue = rows
    .filter((parcel) => parcel.status !== "withdrawn")
    .reduce((sum, parcel) => sum + (parcel.cash_price_millimes ?? 0), 0);
  const expectedMargin = expectedRevenue - costTotal;
  const governorate = config.governorates.find((g) => g.id === project.governorate_id)?.name_ar;

  // PRJ-04: warn when the parcels do not add up to the project
  const warnings: string[] = [];
  if (project.total_area_m2 && parcelArea > Number(project.total_area_m2) + 0.5) {
    warnings.push(`مجموع مساحات القطع (${formatCount(Math.round(parcelArea))} م²) أكبر من مساحة المشروع.`);
  }
  if (project.tree_count !== null && parcelTrees > project.tree_count) {
    warnings.push(`مجموع زيتونات القطع (${formatCount(parcelTrees)}) أكبر من عدد أشجار المشروع.`);
  }
  // An available parcel priced at 0 is shown on the site as «السعر يُعلن لاحقاً», never as «0 د.ت».
  const unpriced = rows.filter((parcel) => parcel.status === "available" && !parcel.cash_price_millimes).length;
  if (unpriced > 0) {
    warnings.push(`فيه قطع متاحة بلا سعر (${formatCount(unpriced)}). لن تُعرض بسعر على الموقع.`);
  }
  // Pages under /projects show internal, published, sold-out and operating projects only.
  const visibleOnSite = ["internal", "published", "sold_out", "operating"].includes(project.status);

  return (
    <div className="space-y-6">
      <Link href="/admin/projects" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
        → المشاريع والقطع
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-forest sm:text-4xl">{project.name}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${PROJECT_STATUS_TONES[project.status as ProjectStatus]}`}>
              {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
            </span>
            {visibleOnSite ? (
              <Link
                href={`/projects/${encodeURIComponent(project.code)}`}
                target="_blank"
                className="text-sm font-semibold text-forest underline-offset-4 hover:underline"
              >
                معاينة في الموقع ↗
              </Link>
            ) : null}
          </div>
          <p dir="ltr" className="text-end text-sm text-muted sm:text-start">
            {project.code} · {governorate}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Fact label="القطع">{formatCount(rows.length)}</Fact>
          <Fact label="مساحة القطع">{formatCount(Math.round(parcelArea))} م²</Fact>
          <Fact label="زيتونات القطع">{formatCount(parcelTrees)}</Fact>
          <Fact label="قيمة القطع">{formatMillimes(parcelValue)}</Fact>
        </dl>
      </header>

      {warnings.length > 0 ? (
        <ul className="space-y-2">
          {warnings.map((warning) => (
            <li key={warning} className="rounded-xl bg-gold-soft px-4 py-3 text-sm text-forest-700">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">القطع</h2>
          <p className="text-sm text-muted">المساحة وعدد الزيتونات والسعر حقول مستقلة لكل قطعة.</p>
        </div>

        {/* Report v3 §21: the plan staff read at a glance, each tile opening the parcel card */}
        <ParcelPlan
          title="مخطط القطع"
          tiles={rows.map((parcel) => ({
            id: parcel.id,
            code: parcel.code,
            status: parcel.status,
            href: `/admin/projects/${id}/parcels/${parcel.id}`,
            detail: `${formatCount(Number(parcel.area_m2))} م²`,
          }))}
        />

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-muted">
            لا توجد قطع بعد. أضف أول قطعة من الأسفل.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[62rem] text-sm">
              <thead className="bg-paper text-xs text-muted">
                <tr>
                  <Th>القطعة</Th>
                  <Th>المساحة</Th>
                  <Th>نوع العقار</Th>
                  <Th>الغراسة</Th>
                  <Th>الزيتونات</Th>
                  <Th>العمر</Th>
                  <Th>الإنتاج</Th>
                  <Th>الري</Th>
                  <Th>سعر الحاضر</Th>
                  <Th>الحالة</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((parcel) => (
                  <tr key={parcel.id} className="hover:bg-paper/60">
                    <Td className="font-semibold">{parcel.code}</Td>
                    <Td className="tabular-nums">{formatCount(Number(parcel.area_m2))} م²</Td>
                    <Td>{PROPERTY_TYPE_LABELS[parcel.property_type] ?? parcel.property_type}</Td>
                    <Td>{parcel.plantation_system ? (PLANTATION_LABELS[parcel.plantation_system] ?? parcel.plantation_system) : "—"}</Td>
                    <Td className="tabular-nums">{parcel.olive_tree_count ?? "—"}</Td>
                    <Td className="tabular-nums">{parcel.tree_age_years ?? "—"}</Td>
                    <Td>{parcel.production_status ? (PRODUCTION_LABELS[parcel.production_status] ?? parcel.production_status) : "—"}</Td>
                    <Td>{parcel.irrigation === "irrigated" ? "مروية" : parcel.irrigation === "rainfed" ? "بعلية" : "—"}</Td>
                    <Td className="tabular-nums">{formatMillimes(parcel.cash_price_millimes)}</Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${PARCEL_STATUS_TONES[parcel.status as ParcelStatus]}`}>
                        {PARCEL_STATUS_LABELS[parcel.status as ParcelStatus]}
                      </span>
                    </Td>
                    <Td>
                      <Link href={`/admin/projects/${id}/parcels/${parcel.id}`} className="font-semibold text-forest underline-offset-4 hover:underline">
                        البطاقة والـMatching
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canWrite ? (
          <details className="rounded-2xl border border-dashed border-line-strong bg-paper/60">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-forest [&::-webkit-details-marker]:hidden">
              + إضافة قطعة
            </summary>
            <div className="border-t border-line px-5 py-5">
              <ActionForm
                action={saveParcel.bind(null, id, null)}
                submitLabel="إضافة القطعة"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                buttonClassName="btn btn-primary sm:col-span-2 lg:col-span-4 lg:w-48"
              >
                <ParcelFields parcel={null} pricingInherit={parcelInherit} nextOrder={(rows.at(-1)?.sort_order ?? 0) + 10} nextCode={`P${String(rows.length + 1).padStart(2, "0")}`} />
              </ActionForm>
            </div>
          </details>
        ) : null}
      </section>

      {/* Report v3 §20: the gallery of the public project page */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">صور المشروع</h2>
          <p className="text-sm text-muted">تظهر في صفحة المشروع. الغلاف يظهر أولاً وفي بطاقة المشروع.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          {pictures.length > 0 ? (
            <ul className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {pictures.map((picture, index) => {
                const isCover = picture.is_cover || (!hasChosenCover && index === 0);
                return (
                  <li key={picture.id} className="rounded-xl border border-line bg-paper p-2">
                    <div className="relative aspect-4/3 overflow-hidden rounded-lg bg-leaf-soft">
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded file */}
                      <img src={picture.url} alt={picture.alt_ar} className="size-full object-cover" />
                      {isCover ? (
                        <span className="absolute start-2 top-2 rounded-full bg-forest px-2 py-0.5 text-xs font-semibold text-paper">الغلاف</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm">{picture.alt_ar}</p>
                    {picture.caption_ar ? <p className="text-xs text-muted">{picture.caption_ar}</p> : null}
                    {canWrite ? (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        {!picture.is_cover ? (
                          <form action={setProjectCover.bind(null, id, picture.id)}>
                            <button type="submit" className="font-semibold text-forest underline-offset-4 hover:underline">
                              اجعلها الغلاف
                            </button>
                          </form>
                        ) : null}
                        {index > 0 ? (
                          <form action={moveProjectPicture.bind(null, id, picture.id, -1)}>
                            <button type="submit" className="font-medium text-ink/80 underline-offset-4 hover:underline">
                              تقديم
                            </button>
                          </form>
                        ) : null}
                        {index < pictures.length - 1 ? (
                          <form action={moveProjectPicture.bind(null, id, picture.id, 1)}>
                            <button type="submit" className="font-medium text-ink/80 underline-offset-4 hover:underline">
                              تأخير
                            </button>
                          </form>
                        ) : null}
                        <form action={removeProjectPicture.bind(null, id, picture.id)}>
                          <button type="submit" className="font-medium text-danger underline-offset-4 hover:underline">
                            حذف
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-5 text-sm text-muted">لا توجد صور بعد. ما دام المشروع بلا صورة يظهر رسم بألوان العلامة.</p>
          )}

          {canWrite ? (
            <ActionForm
              action={addProjectPicture.bind(null, id)}
              submitLabel="رفع الصورة"
              pendingLabel="جارٍ الرفع…"
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end"
              buttonClassName="btn btn-secondary min-h-11"
            >
              <Labeled label="ملف الصورة">
                <input
                  name="file"
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="field py-2.5 file:me-3 file:rounded-lg file:border-0 file:bg-leaf-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-forest"
                />
              </Labeled>
              <Labeled label="النص البديل">
                <input name="alt" required maxLength={160} placeholder="مثال: صفوف زيتون شملالي عند مدخل الضيعة" className="field min-h-11" />
              </Labeled>
              <Labeled label="تعليق (اختياري)">
                <input name="caption" maxLength={200} className="field min-h-11" />
              </Labeled>
            </ActionForm>
          ) : null}
        </div>
      </section>

      {canWrite ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">بيانات المشروع</h2>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <ActionForm
              action={saveProject.bind(null, id)}
              submitLabel="حفظ المشروع"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              buttonClassName="btn btn-secondary sm:col-span-2 lg:col-span-3 lg:w-48"
            >
              <Labeled label="الاسم">
                <input name="name" defaultValue={project.name} required className="field" />
              </Labeled>
              <Labeled label="الولاية">
                <select name="governorate_id" defaultValue={project.governorate_id} className="field">
                  {config.governorates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="نوع المشروع">
                <select name="project_type_id" defaultValue={project.project_type_id ?? ""} className="field">
                  <option value="">بدون</option>
                  {config.projectTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label_ar}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="المساحة الجملية (م²)">
                <input name="total_area_m2" defaultValue={project.total_area_m2 ?? ""} inputMode="decimal" dir="ltr" className="field text-left" />
              </Labeled>
              <Labeled label="عدد الأشجار">
                <input name="tree_count" defaultValue={project.tree_count ?? ""} inputMode="numeric" dir="ltr" className="field text-left" />
              </Labeled>
              <Labeled label="عمر الأشجار (سنوات)">
                <input name="tree_age_years" defaultValue={project.tree_age_years ?? ""} inputMode="decimal" dir="ltr" className="field text-left" />
              </Labeled>
              <Labeled label="الصنف">
                <input name="olive_variety" defaultValue={project.olive_variety ?? ""} className="field" />
              </Labeled>
              <Labeled label="نظام الغراسة">
                <select name="plantation_system" defaultValue={project.plantation_system ?? ""} className="field">
                  <option value="">غير محدّد</option>
                  {Object.entries(PLANTATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="حالة الإنتاج">
                <select name="production_status" defaultValue={project.production_status ?? ""} className="field">
                  <option value="">غير محدّدة</option>
                  {Object.entries(PRODUCTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="الري">
                <select name="irrigation" defaultValue={project.irrigation ?? ""} className="field">
                  <option value="">غير محدّد</option>
                  <option value="rainfed">بعلية</option>
                  <option value="irrigated">مروية</option>
                </select>
              </Labeled>
              <Labeled label="المصاريف السنوية التقديرية للقطعة (د.ت)">
                <input
                  name="annual_costs_dinars"
                  defaultValue={project.annual_costs_millimes !== null ? project.annual_costs_millimes / 1000 : ""}
                  inputMode="decimal"
                  dir="ltr"
                  className="field text-left"
                />
              </Labeled>
              <Labeled label="الحالة">
                <select name="status" defaultValue={project.status} className="field">
                  {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Labeled>
              <div className="sm:col-span-2 lg:col-span-3">
                <Labeled label="وصف الموقع">
                  <input name="location_description" defaultValue={project.location_description ?? ""} className="field" />
                </Labeled>
              </div>

              {/* Report v3 §20: what the public project page shows beyond the facts */}
              <input type="hidden" name="page_fields" value="1" />
              <div className="sm:col-span-2 lg:col-span-3">
                <Labeled label="وصف المشروع (يظهر في صفحة المشروع)">
                  <textarea
                    name="description_ar"
                    rows={5}
                    maxLength={4000}
                    defaultValue={project.description_ar ?? ""}
                    className="field min-h-32"
                  />
                </Labeled>
                <p className="hint mt-1">بلا وعود ولا أرقام مردود أو ربح (PRN-01).</p>
              </div>
              <Labeled label="الماء">
                <select
                  name="water_available"
                  defaultValue={project.water_available === true ? "yes" : project.water_available === false ? "no" : ""}
                  className="field"
                >
                  <option value="">غير محدّد</option>
                  <option value="yes">متوفّر</option>
                  <option value="no">غير متوفّر</option>
                </select>
              </Labeled>
              <Labeled label="مصدر الماء">
                <input name="water_note" maxLength={300} defaultValue={project.water_note ?? ""} placeholder="مثال: بئر عميقة داخل الضيعة" className="field" />
              </Labeled>
              <Labeled label="النفاذ والطريق">
                <input
                  name="access_note"
                  maxLength={300}
                  defaultValue={project.access_note ?? ""}
                  placeholder="مثال: طريق معبّدة حتى مدخل الضيعة"
                  className="field"
                />
              </Labeled>
              <div className="sm:col-span-2 lg:col-span-3">
                <Labeled label="رابط الفيديو (YouTube أو Vimeo يظهر داخل الصفحة، غيرهما يظهر كرابط)">
                  <input
                    name="video_url"
                    type="url"
                    maxLength={500}
                    defaultValue={project.video_url ?? ""}
                    placeholder="https://www.youtube.com/watch?v=…"
                    dir="ltr"
                    className="field text-left"
                  />
                </Labeled>
              </div>
              <Labeled label="خط العرض">
                <input name="latitude" defaultValue={project.latitude ?? ""} inputMode="decimal" placeholder="34.55" dir="ltr" className="field text-left" />
              </Labeled>
              <Labeled label="خط الطول">
                <input name="longitude" defaultValue={project.longitude ?? ""} inputMode="decimal" placeholder="10.30" dir="ltr" className="field text-left" />
              </Labeled>
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

              <div className="sm:col-span-2 lg:col-span-3">
                <PricingEditor
                  initial={project.pricing}
                  inherit={{
                    label: "الصيغة الافتراضية",
                    hint: "نفس الصيغة المضبوطة في الإعدادات ← التسعير.",
                    lines: describePricing(defaultPricing),
                  }}
                />
              </div>
            </ActionForm>
          </div>
        </section>
      ) : null}

      {canSeeCosts ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">التكاليف الداخلية</h2>
            <p className="text-sm text-muted">لا تظهر للحرفاء ولا للـCommercials (PRJ-03).</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            {(costs.data ?? []).length > 0 ? (
              <ul className="mb-4 divide-y divide-line">
                {(costs.data ?? []).map((cost) => (
                  <li key={cost.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <span>
                      {cost.label} <span className="text-xs text-muted">· {COST_KIND_LABELS[cost.kind] ?? cost.kind}</span>
                    </span>
                    <span className="tabular-nums">{formatMillimes(cost.amount_millimes)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-4 py-2 text-sm font-semibold">
                  <span>المجموع</span>
                  <span className="tabular-nums">{formatMillimes(costTotal)}</span>
                </li>
                <li className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span>المداخيل المتوقّعة (سعر الحاضر للقطع غير الموقوفة)</span>
                  <span className="tabular-nums">{formatMillimes(expectedRevenue)}</span>
                </li>
                <li
                  className={`flex items-center justify-between gap-4 py-2 text-sm font-semibold ${expectedMargin < 0 ? "text-danger" : "text-forest"}`}
                >
                  <span>الهامش المتوقّع</span>
                  <span className="tabular-nums">{formatMillimes(expectedMargin)}</span>
                </li>
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted">لا توجد تكاليف مسجّلة.</p>
            )}
            <ActionForm
              action={addProjectCost.bind(null, id)}
              submitLabel="إضافة"
              className="grid gap-3 sm:grid-cols-[1fr_13rem_10rem_auto] sm:items-end"
              buttonClassName="btn btn-secondary min-h-11"
            >
              <Labeled label="البيان">
                <input name="label" required className="field min-h-11" />
              </Labeled>
              <Labeled label="النوع">
                <select name="kind" defaultValue="purchase" className="field min-h-11">
                  {COST_KINDS_OFFERED.map((kind) => (
                    <option key={kind} value={kind}>
                      {COST_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="المبلغ (د.ت)">
                <input name="amount_dinars" required inputMode="decimal" dir="ltr" className="field min-h-11 text-left" />
              </Labeled>
            </ActionForm>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function ParcelFields({
  parcel,
  pricingInherit,
  nextOrder = 0,
  nextCode = "",
}: {
  /** The formula this parcel uses when it has none of its own. */
  pricingInherit: { label: string; hint: string; lines: string[] };
  parcel: {
    code: string;
    area_m2: number | string;
    property_type: string;
    plantation_system: string | null;
    olive_tree_count: number | null;
    tree_age_years: number | string | null;
    production_status: string | null;
    irrigation: string | null;
    cash_price_millimes: number;
    annual_costs_millimes: number | null;
    status: string;
    sort_order: number;
    notes: string | null;
    pricing: unknown;
  } | null;
  nextOrder?: number;
  nextCode?: string;
}) {
  return (
    <>
      <Labeled label="رمز القطعة">
        <input name="code" defaultValue={parcel?.code ?? nextCode} required dir="ltr" className="field text-left" />
      </Labeled>
      <Labeled label="المساحة (م²)">
        <input name="area_m2" defaultValue={parcel?.area_m2 ?? ""} required inputMode="decimal" dir="ltr" className="field text-left" />
      </Labeled>
      <Labeled label="نوع العقار">
        <select name="property_type" defaultValue={parcel?.property_type ?? "planted"} className="field">
          {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="نظام الغراسة">
        <select name="plantation_system" defaultValue={parcel?.plantation_system ?? ""} className="field">
          <option value="">غير محدّد</option>
          {Object.entries(PLANTATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="عدد الزيتونات">
        <input name="olive_tree_count" defaultValue={parcel?.olive_tree_count ?? ""} inputMode="numeric" dir="ltr" className="field text-left" />
      </Labeled>
      <Labeled label="عمر الزيتونات (سنوات)">
        <input name="tree_age_years" defaultValue={parcel?.tree_age_years ?? ""} inputMode="decimal" dir="ltr" className="field text-left" />
      </Labeled>
      <Labeled label="حالة الإنتاج">
        <select name="production_status" defaultValue={parcel?.production_status ?? ""} className="field">
          <option value="">غير محدّدة</option>
          {Object.entries(PRODUCTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="الري">
        <select name="irrigation" defaultValue={parcel?.irrigation ?? ""} className="field">
          <option value="">غير محدّد</option>
          <option value="rainfed">بعلية</option>
          <option value="irrigated">مروية</option>
        </select>
      </Labeled>
      <Labeled label="سعر الحاضر (د.ت)">
        <input
          name="cash_price_dinars"
          defaultValue={parcel ? parcel.cash_price_millimes / 1000 : ""}
          required
          inputMode="decimal"
          dir="ltr"
          className="field text-left"
        />
      </Labeled>
      <Labeled label="المصاريف السنوية (د.ت)">
        <input
          name="annual_costs_dinars"
          defaultValue={parcel?.annual_costs_millimes !== null && parcel?.annual_costs_millimes !== undefined ? parcel.annual_costs_millimes / 1000 : ""}
          inputMode="decimal"
          dir="ltr"
          className="field text-left"
        />
      </Labeled>
      <Labeled label="الحالة">
        <select name="status" defaultValue={parcel?.status ?? "available"} className="field">
          {Object.entries(PARCEL_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="الترتيب">
        <input type="number" name="sort_order" defaultValue={parcel?.sort_order ?? nextOrder} min={0} dir="ltr" className="field text-left" />
      </Labeled>
      <div className="sm:col-span-2 lg:col-span-4">
        <Labeled label="ملاحظات">
          <input name="notes" defaultValue={parcel?.notes ?? ""} className="field" />
        </Labeled>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        <PricingEditor initial={parcel?.pricing ?? null} inherit={pricingInherit} />
      </div>
    </>
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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-start font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
