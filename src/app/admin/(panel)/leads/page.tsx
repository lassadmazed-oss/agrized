import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { CHANNEL_LABELS, PLANTATION_LABELS, PRODUCTION_LABELS, STAGE_TONES } from "@/lib/crm";
import { formatCount, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { filtersToQuery, filtersToRpc, hasActiveFilters, parseLeadFilters } from "./filters";

export const metadata: Metadata = { title: "مطالب الاستثمار" };

const PAGE_SIZE = 50;

export default async function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const params = await searchParams;
  const filters = parseLeadFilters(params);
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  const supabase = await createClient();
  const config = await getPublicConfig();

  const [search, statuses, commercials] = await Promise.all([
    supabase.rpc("crm_search_requests", {
      p: filtersToRpc(filters),
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.from("lead_statuses").select("id, stage, label_ar").eq("is_active", true).order("sort_order"),
    isAdmin
      ? supabase
          .from("user_roles")
          .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name, is_active)")
          .eq("role", "commercial")
      : Promise.resolve({ data: [] as { user_id: string; profile: { full_name: string; is_active: boolean } | null }[] }),
  ]);
  if (search.error) {
    throw new Error(`CRM search failed: ${search.error.message}`);
  }

  const rows = search.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const governorateName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const delegationName = new Map(config.delegations.map((d) => [d.id, d.name_ar]));
  const downPayments = optionsFor(config, "down_payment");
  const installments = optionsFor(config, "monthly_installment");
  const goals = optionsFor(config, "goal");
  const areas = optionsFor(config, "desired_area").filter((option) => option.min_number !== null);
  const priorities = optionsFor(config, "priority");
  const plantations = optionsFor(config, "plantation_system");

  const investLabel = (row: (typeof rows)[number]) =>
    row.invest_anywhere
      ? "المكان غير مهم"
      : row.invest_governorate_ids.map((id) => governorateName.get(id) ?? id).join("، ");
  const wantsLabel = (row: (typeof rows)[number]) =>
    row.scenario_labels.length > 0 ? row.scenario_labels.join("، ") : row.project_type_unsure ? "ما يهمّوش النوع" : "—";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold text-forest">مطالب الاستثمار</h1>
          <p className="mt-1 text-muted">
            {hasRole(session, ["commercial"]) && !hasRole(session, ["admin", "super_admin", "finance", "legal"])
              ? "المطالب المسندة إليك."
              : "كل المطالب المسجّلة، مع البحث حسب الطلب والمساحة والقدرة المالية."}
          </p>
        </div>
        {isAdmin ? (
          <a href={`/admin/leads/export?${filtersToQuery(filters)}`} className="btn btn-secondary">
            تصدير CSV
          </a>
        ) : null}
      </header>

      <details open={hasActiveFilters(filters)} className="group rounded-2xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
          البحث والفلاتر
          <span className="text-sm font-normal text-muted group-open:hidden">اضغط لعرض الفلاتر</span>
        </summary>
        <form method="get" action="/admin/leads" className="grid gap-4 border-t border-line px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="بحث" className="sm:col-span-2">
            <input name="q" defaultValue={filters.q} placeholder="الاسم، الهاتف أو رقم المطلب" className="field" />
          </FilterField>

          <FilterField label="ولاية الاستثمار">
            <select name="invest_governorate_id" defaultValue={filters.invest_governorate_id ?? ""} className="field">
              <option value="">الكل</option>
              {config.governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_ar}
                </option>
              ))}
            </select>
            <CheckboxLabel name="include_anywhere" checked={filters.include_anywhere} label="مع «المكان غير مهم»" />
          </FilterField>

          <FilterField label="نوع المشروع">
            <select name="project_type_id" defaultValue={filters.project_type_id ?? ""} className="field">
              <option value="">الكل</option>
              {config.projectTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label_ar}
                </option>
              ))}
            </select>
            <CheckboxLabel name="include_unsure" checked={filters.include_unsure} label="مع «ما يهمنيش النوع»" />
          </FilterField>

          <RangeField
            label="المساحة المطلوبة (م²)"
            nameMin="area_min"
            nameMax="area_max"
            min={filters.area_min}
            max={filters.area_max}
            options={areas.map((option) => ({ id: option.id, label_ar: option.label_ar, value: String(option.min_number) }))}
          >
            <CheckboxLabel name="include_area_any" checked={filters.include_area_any} label="مع «ما عنديش تفضيل»" />
          </RangeField>

          <FilterField label="نظام الغراسة">
            <select name="plantation_system" defaultValue={filters.plantation_system ?? ""} className="field">
              <option value="">الكل</option>
              {plantations.map((option) => (
                <option key={option.id} value={option.code ?? ""}>
                  {option.label_ar}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="حالة الإنتاج">
            <select name="production_status" defaultValue={filters.production_status ?? ""} className="field">
              <option value="">الكل</option>
              {Object.entries(PRODUCTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="الأهم بالنسبة للحريف">
            <select name="priority_code" defaultValue={filters.priority_code ?? ""} className="field">
              <option value="">الكل</option>
              {priorities.map((option) => (
                <option key={option.id} value={option.code ?? ""}>
                  {option.label_ar}
                </option>
              ))}
            </select>
          </FilterField>

          <RangeField
            label="التسبقة"
            nameMin="down_min"
            nameMax="down_max"
            min={filters.down_min}
            max={filters.down_max}
            options={downPayments
              .filter((option) => option.min_millimes !== null)
              .map((option) => ({ id: option.id, label_ar: option.label_ar, value: String(option.min_millimes) }))}
          />
          <RangeField
            label="القسط الشهري"
            nameMin="installment_min"
            nameMax="installment_max"
            min={filters.installment_min}
            max={filters.installment_max}
            options={installments
              .filter((option) => option.min_millimes !== null)
              .map((option) => ({ id: option.id, label_ar: option.label_ar, value: String(option.min_millimes) }))}
          />

          <FilterField label="الهدف">
            <select name="goal_code" defaultValue={filters.goal_code ?? ""} className="field">
              <option value="">الكل</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.code ?? ""}>
                  {goal.label_ar}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="ولاية الإقامة">
            <select name="residence_governorate_id" defaultValue={filters.residence_governorate_id ?? ""} className="field">
              <option value="">الكل</option>
              {config.governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_ar}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="حالة الملف">
            <select name="status_id" defaultValue={filters.status_id ?? ""} className="field">
              <option value="">الكل</option>
              {(statuses.data ?? []).map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label_ar}
                </option>
              ))}
            </select>
          </FilterField>

          {isAdmin ? (
            <FilterField label="المسؤول">
              <select name="assigned_to" defaultValue={filters.assigned_to ?? ""} className="field">
                <option value="">الكل</option>
                <option value="none">بدون مسؤول</option>
                {(commercials.data ?? []).map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.profile?.full_name || "—"}
                    {c.profile?.is_active === false ? " (موقوف)" : ""}
                  </option>
                ))}
              </select>
            </FilterField>
          ) : null}

          <FilterField label="من تاريخ">
            <input type="date" name="from" defaultValue={filters.from} className="field" dir="ltr" />
          </FilterField>
          <FilterField label="إلى تاريخ">
            <input type="date" name="to" defaultValue={filters.to} className="field" dir="ltr" />
          </FilterField>
          <FilterField label="المصدر (utm_source)">
            <input name="source" defaultValue={filters.source} placeholder="facebook، direct…" className="field" dir="ltr" />
          </FilterField>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
            <CheckboxLabel name="duplicates_only" checked={filters.duplicates_only} label="المطالب المكرّرة فقط" />
            <div className="ms-auto flex gap-2">
              <Link href="/admin/leads" className="btn btn-ghost">
                مسح الفلاتر
              </Link>
              <button type="submit" className="btn btn-primary">
                بحث
              </button>
            </div>
          </div>
        </form>
      </details>

      <p className="text-lg">
        <span className="text-3xl font-semibold text-ink">{formatCount(total)}</span> <span className="text-muted">مطلب مطابق</span>
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-muted">
          لا توجد مطالب مطابقة.{" "}
          {hasActiveFilters(filters) ? (
            <Link href="/admin/leads" className="font-semibold text-forest underline-offset-4 hover:underline">
              مسح الفلاتر
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
            <table className="w-full min-w-[76rem] text-sm">
              <thead className="bg-paper text-xs text-muted">
                <tr className="text-start">
                  <Th>رقم المطلب</Th>
                  <Th>الاسم</Th>
                  <Th>الهاتف</Th>
                  <Th>الإقامة</Th>
                  <Th>الاستثمار</Th>
                  <Th>يحب يملك</Th>
                  <Th>المساحة</Th>
                  <Th>التسبقة / القسط</Th>
                  <Th>الأهم</Th>
                  <Th>الحالة</Th>
                  <Th>المسؤول</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-paper/60">
                    <Td>
                      <Link href={`/admin/leads/${row.person_id}`} dir="ltr" className="font-semibold text-forest underline-offset-4 hover:underline">
                        {row.request_no}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted tabular-nums">{formatDateTime(row.created_at)}</div>
                      {row.is_duplicate ? <span className="mt-1 inline-block rounded bg-gold-soft px-1.5 py-0.5 text-[0.7rem] text-forest-700">مكرّر</span> : null}
                    </Td>
                    <Td className="font-medium">{row.full_name}</Td>
                    <Td>
                      <span dir="ltr" className="tabular-nums">
                        {formatPhone(row.phone_e164)}
                      </span>
                      <div className="text-xs text-muted">{CHANNEL_LABELS[row.contact_channel]}</div>
                    </Td>
                    <Td>
                      {governorateName.get(row.residence_governorate_id)}
                      {row.residence_delegation_id ? (
                        <div className="text-xs text-muted">{delegationName.get(row.residence_delegation_id)}</div>
                      ) : null}
                    </Td>
                    <Td className="max-w-44">{investLabel(row)}</Td>
                    <Td className="max-w-52">
                      {wantsLabel(row)}
                      {row.plantation_systems.length > 0 ? (
                        <div className="text-xs text-muted">
                          {row.plantation_systems.map((code) => PLANTATION_LABELS[code] ?? code).join("، ")}
                        </div>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{row.desired_area_label_ar ?? "—"}</Td>
                    <Td className="whitespace-nowrap tabular-nums">
                      {row.down_payment_label_ar}
                      <div className="text-xs text-muted">{row.installment_label_ar} شهرياً</div>
                    </Td>
                    <Td className="max-w-36">{row.priority_label_ar ?? "—"}</Td>
                    <Td>
                      <StatusChip stage={row.stage} label={row.status_label_ar} />
                    </Td>
                    <Td className="text-muted">{row.assigned_to_name ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/leads/${row.person_id}`} className="block rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{row.full_name}</p>
                      <p dir="ltr" className="text-end text-sm text-muted tabular-nums">
                        {formatPhone(row.phone_e164)}
                      </p>
                    </div>
                    <StatusChip stage={row.stage} label={row.status_label_ar} />
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {investLabel(row)} · {wantsLabel(row)}
                  </p>
                  <p className="mt-1 text-sm tabular-nums">
                    {row.desired_area_label_ar ? `${row.desired_area_label_ar} · ` : ""}
                    {row.down_payment_label_ar} تسبقة · {row.installment_label_ar} شهرياً
                  </p>
                  <p dir="ltr" className="mt-2 text-end text-xs text-muted tabular-nums">
                    {row.request_no} · {formatDateTime(row.created_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {pageCount > 1 ? (
            <nav aria-label="الصفحات" className="flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link href={`/admin/leads?${filtersToQuery(filters, { page: String(page - 1) })}`} className="btn btn-secondary">
                  السابق
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted tabular-nums">
                الصفحة {page} من {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={`/admin/leads?${filtersToQuery(filters, { page: String(page + 1) })}`} className="btn btn-secondary">
                  التالي
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function FilterField({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function CheckboxLabel({ name, checked, label }: { name: string; checked?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted">
      <input type="checkbox" name={name} value="1" defaultChecked={checked} className="size-4 accent-forest" />
      {label}
    </span>
  );
}

function RangeField({
  label,
  nameMin,
  nameMax,
  min,
  max,
  options,
  children,
}: {
  label: string;
  nameMin: string;
  nameMax: string;
  min?: string;
  max?: string;
  options: { id: string; label_ar: string; value: string }[];
  children?: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <select name={nameMin} defaultValue={min ?? ""} className="field" aria-label={`${label}: من`}>
          <option value="">من</option>
          {options.map((option) => (
            <option key={option.id} value={option.value}>
              {option.label_ar}
            </option>
          ))}
        </select>
        <select name={nameMax} defaultValue={max ?? ""} className="field" aria-label={`${label}: إلى`}>
          <option value="">إلى</option>
          {options.map((option) => (
            <option key={option.id} value={option.value}>
              {option.label_ar}
            </option>
          ))}
        </select>
      </div>
      {children}
    </fieldset>
  );
}

function StatusChip({ stage, label }: { stage: keyof typeof STAGE_TONES; label: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STAGE_TONES[stage]}`}>
      {label}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-start font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
