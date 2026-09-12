import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { hasRole, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount, formatMillimes } from "@/lib/format";
import {
  PARCEL_STATUS_LABELS,
  PARCEL_STATUS_TONES,
  PRICING_MODEL_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  PROPERTY_TYPE_LABELS,
  type ParcelStatus,
  type ProjectStatus,
} from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

import { addProjectCost, saveParcel, saveProject } from "../actions";

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

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();

  const [parcels, costs] = await Promise.all([
    supabase.from("parcels").select("*").eq("project_id", id).order("sort_order").order("code"),
    canSeeCosts ? supabase.from("project_costs").select("*").eq("project_id", id).order("created_at") : Promise.resolve({ data: [] }),
  ]);

  const rows = parcels.data ?? [];
  const parcelArea = rows.reduce((sum, parcel) => sum + Number(parcel.area_m2 ?? 0), 0);
  const parcelTrees = rows.reduce((sum, parcel) => sum + (parcel.olive_tree_count ?? 0), 0);
  const parcelValue = rows.reduce((sum, parcel) => sum + (parcel.cash_price_millimes ?? 0), 0);
  const costTotal = (costs.data ?? []).reduce((sum, cost) => sum + (cost.amount_millimes ?? 0), 0);
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
                <ParcelFields parcel={null} nextOrder={(rows.at(-1)?.sort_order ?? 0) + 10} nextCode={`P${String(rows.length + 1).padStart(2, "0")}`} />
              </ActionForm>
            </div>
          </details>
        ) : null}
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
              <div className="sm:col-span-2 lg:col-span-3">
                <Labeled label="صيغة التسعير (JSON)">
                  <textarea
                    name="pricing"
                    rows={4}
                    dir="ltr"
                    className="field min-h-28 text-left font-mono text-xs"
                    defaultValue={project.pricing && Object.keys(project.pricing).length > 0 ? JSON.stringify(project.pricing, null, 2) : ""}
                  />
                </Labeled>
                <p className="hint mt-1">
                  اتركها فارغة لاستعمال الصيغة الافتراضية من الإعدادات. النماذج:{" "}
                  {Object.entries(PRICING_MODEL_LABELS)
                    .map(([code, label]) => `${label} (${code})`)
                    .join(" · ")}
                  . كل المبالغ بالمليم.
                </p>
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
                    <span>{cost.label}</span>
                    <span className="tabular-nums">{formatMillimes(cost.amount_millimes)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-4 py-2 text-sm font-semibold">
                  <span>المجموع</span>
                  <span className="tabular-nums">{formatMillimes(costTotal)}</span>
                </li>
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted">لا توجد تكاليف مسجّلة.</p>
            )}
            <ActionForm
              action={addProjectCost.bind(null, id)}
              submitLabel="إضافة"
              className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end"
              buttonClassName="btn btn-secondary min-h-11"
            >
              <Labeled label="البيان">
                <input name="label" required className="field min-h-11" />
              </Labeled>
              <Labeled label="النوع">
                <select name="kind" defaultValue="purchase" className="field min-h-11">
                  <option value="purchase">شراء العقار</option>
                  <option value="development">تهيئة وغراسة</option>
                  <option value="fees">معاليم وأتعاب</option>
                  <option value="other">أخرى</option>
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
  nextOrder = 0,
  nextCode = "",
}: {
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
        <Labeled label="صيغة تسعير خاصة بالقطعة (JSON، اختيارية)">
          <textarea
            name="pricing"
            rows={3}
            dir="ltr"
            className="field min-h-20 text-left font-mono text-xs"
            defaultValue={parcel?.pricing ? JSON.stringify(parcel.pricing, null, 2) : ""}
          />
        </Labeled>
      </div>
    </>
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
