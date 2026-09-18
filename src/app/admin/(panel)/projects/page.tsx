import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { DataRow, EmptyState, FormField, StatusPill } from "@/components/ui";
import { hasRole, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { formatCount, formatMillimes } from "@/lib/format";
import { PARCEL_STATUS_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_TONES, type ParcelStatus, type ProjectStatus } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

import { saveProject } from "./actions";

export const metadata: Metadata = { title: "المشاريع والقطع" };

const WRITE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

export default async function ProjectsPage() {
  const session = await requireStaff();
  const canWrite = hasRole(session, WRITE_ROLES);
  const supabase = await createClient();
  const config = await getPublicConfig();

  const [projects, parcels] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, name, governorate_id, status, total_area_m2, tree_count, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("parcels").select("project_id, status, area_m2, olive_tree_count, cash_price_millimes"),
  ]);
  if (projects.error) throw new Error(projects.error.message);

  const governorateName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const byProject = new Map<string, { count: number; available: number; area: number; trees: number; value: number }>();
  for (const parcel of parcels.data ?? []) {
    const entry = byProject.get(parcel.project_id) ?? { count: 0, available: 0, area: 0, trees: 0, value: 0 };
    entry.count += 1;
    if (parcel.status === "available") entry.available += 1;
    entry.area += Number(parcel.area_m2 ?? 0);
    entry.trees += parcel.olive_tree_count ?? 0;
    entry.value += parcel.cash_price_millimes ?? 0;
    byProject.set(parcel.project_id, entry);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="section-title">المشاريع والقطع</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          كل قطعة لها مساحتها وعدد زيتوناتها ونظام غراستها وسعرها، وكلها مستقلة عن بعضها. لا شيء يُحسب آلياً من المساحة.
        </p>
      </header>

      {canWrite ? (
        <details className="panel">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">+ مشروع جديد</summary>
          <div className="border-t border-line px-5 py-5">
            <ActionForm
              action={saveProject.bind(null, null)}
              submitLabel="إنشاء المشروع"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              buttonClassName="btn btn-primary sm:col-span-2 lg:col-span-3 lg:w-48"
            >
              <FormField size="sm" label="رمز المشروع">
                <input name="code" required placeholder="SFX-01" dir="ltr" className="field text-left" />
              </FormField>
              <FormField size="sm" label="الاسم">
                <input name="name" required className="field" />
              </FormField>
              <FormField size="sm" label="الولاية">
                <select name="governorate_id" required defaultValue="" className="field">
                  <option value="" disabled>
                    اختر
                  </option>
                  {config.governorates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField size="sm" label="نوع المشروع">
                <select name="project_type_id" defaultValue="" className="field">
                  <option value="">بدون</option>
                  {config.projectTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label_ar}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField size="sm" label="المساحة الجملية (م²)">
                <input name="total_area_m2" inputMode="decimal" dir="ltr" className="field text-left" />
              </FormField>
              <FormField size="sm" label="الحالة">
                <select name="status" defaultValue="draft" className="field">
                  {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>
            </ActionForm>
          </div>
        </details>
      ) : null}

      {(projects.data ?? []).length === 0 ? (
        <EmptyState>لا توجد مشاريع بعد.</EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {(projects.data ?? []).map((project) => {
            const stats = byProject.get(project.id) ?? { count: 0, available: 0, area: 0, trees: 0, value: 0 };
            return (
              <li key={project.id}>
                <Link
                  href={`/admin/projects/${project.id}`}
                  className="card block h-full p-5 transition-colors hover:border-forest"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{project.name}</h2>
                      <p dir="ltr" className="text-end text-xs text-muted sm:text-start">
                        {project.code} · {governorateName.get(project.governorate_id)}
                      </p>
                    </div>
                    <StatusPill toneClass={PROJECT_STATUS_TONES[project.status as ProjectStatus]}>
                      {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
                    </StatusPill>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <DataRow layout="stacked" label="القطع">
                      {formatCount(stats.count)}
                      {stats.count > 0 ? (
                        <span className="text-xs text-muted"> · {formatCount(stats.available)} {PARCEL_STATUS_LABELS.available as string}</span>
                      ) : null}
                    </DataRow>
                    <DataRow layout="stacked" label="مساحة القطع">{formatCount(Math.round(stats.area))} م²</DataRow>
                    <DataRow layout="stacked" label="زيتونات القطع">{formatCount(stats.trees)}</DataRow>
                    <DataRow layout="stacked" label="قيمة القطع">{formatMillimes(stats.value)}</DataRow>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
export type { ParcelStatus };
