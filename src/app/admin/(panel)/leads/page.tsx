import type { Metadata } from "next";
import Link from "next/link";

import { formatPercent } from "@/components/admin/tree-pricing-inputs";
import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { CHANNEL_LABELS, PLANTATION_LABELS, PRODUCTION_LABELS, STAGE_TONES } from "@/lib/crm";
import { formatArea, formatCount, formatDateTime, formatMillimes } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { assignPersons } from "./actions";
import { BulkAssignBar, SelectAllCheckbox } from "./bulk-assign";
import {
  downPaymentSummary,
  filtersToQuery,
  filtersToRpc,
  hasActiveFilters,
  parseLeadFilters,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
} from "./filters";

export const metadata: Metadata = { title: "مطالب الاستثمار" };

const PAGE_SIZE = 50;
const BULK_FORM_ID = "bulk-assign";

export default async function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const params = await searchParams;
  const filters = parseLeadFilters(params);
  const people = filters.people === true;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  const supabase = await createClient();
  const config = await getPublicConfig();

  const [search, statuses, commercials, spacingClasses] = await Promise.all([
    supabase.rpc("crm_search_requests", {
      p: filtersToRpc(filters, { withPeople: true }),
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
    // Retired classes stay listed: older demands still carry them.
    supabase.from("tree_spacing_classes").select("id, label_ar, area_m2, is_active").order("sort_order"),
  ]);
  if (search.error) {
    throw new Error(`CRM search failed: ${search.error.message}`);
  }

  const rows = search.data ?? [];
  const firstRow = rows[0];
  const total = firstRow?.total_count ?? 0;
  const requestsTotal = firstRow?.requests_total ?? 0;
  const personsTotal = firstRow?.persons_total ?? 0;
  const treesTotal = firstRow?.trees_total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const governorateName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const delegationName = new Map(config.delegations.map((d) => [d.id, d.name_ar]));
  const durations = optionsFor(config, "duration").filter((option) => option.min_number !== null);
  const goals = optionsFor(config, "goal");
  const plantations = optionsFor(config, "plantation_system");
  // Option values are the percentages themselves, matched exactly by crm_search_requests.
  const percentOptions: { value: string; label: string }[] = [];
  for (const option of optionsFor(config, "down_payment_percent")) {
    if (option.min_number === null) continue;
    const value = String(Number(option.min_number));
    const percentText = formatPercent(value);
    if (percentOptions.some((known) => known.value === value)) continue;
    percentOptions.push({ value, label: option.label_ar.replace(/\s/g, "") === percentText ? option.label_ar : `${option.label_ar} · ${percentText}` });
  }
  if (filters.down_payment_percent && !percentOptions.some((option) => option.value === filters.down_payment_percent)) {
    // A percentage retired from the list still finds the demands that chose it.
    percentOptions.push({ value: filters.down_payment_percent, label: `${formatPercent(filters.down_payment_percent)} (معطّلة)` });
  }
  const treeOptions = optionsFor(config, "tree_count");
  const openTreeLabel = treeOptions.find((option) => option.min_number === null)?.label_ar;
  const treeValues = new Map<number, string>();
  for (const option of treeOptions) {
    for (const bound of [option.min_number, option.max_number]) {
      if (bound !== null && !treeValues.has(bound)) treeValues.set(bound, option.label_ar);
    }
  }
  const activeCommercials = (commercials.data ?? [])
    .filter((c) => c.profile?.is_active)
    .map((c) => ({ id: c.user_id, name: c.profile?.full_name || "—" }));

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
              : "كل المطالب المسجّلة، مع البحث حسب عدد الزيتونات والطلب والقدرة المالية."}
          </p>
        </div>
        {isAdmin ? (
          <a href={`/admin/leads/export?${filtersToQuery({ ...filters, people: false })}`} className="btn btn-secondary">
            تصدير CSV (كل المطالب المطابقة)
          </a>
        ) : null}
      </header>

      <details open={hasActiveFilters(filters)} className="group rounded-2xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
          البحث والفلاتر
          <span className="text-sm font-normal text-muted group-open:hidden">اضغط لعرض الفلاتر</span>
        </summary>
        <form method="get" action="/admin/leads" className="grid gap-4 border-t border-line px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
          {people ? <input type="hidden" name="people" value="1" /> : null}

          <FilterField label="بحث" className="sm:col-span-2">
            <input name="q" defaultValue={filters.q} placeholder="الاسم، الهاتف أو رقم المطلب" className="field" />
          </FilterField>

          {/* §47: the olive tree is the unit the demand is expressed in, so it leads the filters. */}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold">عدد الزيتونات</legend>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                name="trees_min"
                min={0}
                step={1}
                inputMode="numeric"
                list="tree-count-values"
                defaultValue={filters.trees_min}
                placeholder="من"
                aria-label="عدد الزيتونات: من"
                className="field"
                dir="ltr"
              />
              <input
                type="number"
                name="trees_max"
                min={0}
                step={1}
                inputMode="numeric"
                list="tree-count-values"
                defaultValue={filters.trees_max}
                placeholder="إلى"
                aria-label="عدد الزيتونات: إلى"
                className="field"
                dir="ltr"
              />
            </div>
            <datalist id="tree-count-values">
              {[...treeValues.entries()]
                .sort(([a], [b]) => a - b)
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </datalist>
            <CheckboxLabel
              name="include_trees_any"
              checked={filters.include_trees_any}
              label={openTreeLabel ? `مع «${openTreeLabel}» والمطالب بدون عدد` : "مع المطالب بدون عدد"}
            />
          </fieldset>

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

          <FilterField label="فئة المساحة">
            <select name="spacing_class_id" defaultValue={filters.spacing_class_id ?? ""} className="field">
              <option value="">الكل</option>
              {(spacingClasses.data ?? []).map((spacing) => (
                <option key={spacing.id} value={spacing.id}>
                  {spacing.label_ar} · {formatArea(Number(spacing.area_m2))}
                  {spacing.is_active ? "" : " (معطّلة)"}
                </option>
              ))}
            </select>
          </FilterField>

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

          {/* Plan Q-1: the down payment is a percentage of the cash total; the amount lists are retired (Q-7). */}
          <FilterField label="نسبة التسبقة">
            <select name="down_payment_percent" defaultValue={filters.down_payment_percent ?? ""} className="field">
              <option value="">الكل</option>
              {percentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <RangeField
            label="مدة الدفع"
            nameMin="duration_min"
            nameMax="duration_max"
            min={filters.duration_min}
            max={filters.duration_max}
            options={durations.map((option) => ({ id: option.id, label_ar: option.label_ar, value: String(option.min_number) }))}
          />
          <FilterField label="طريقة الدفع">
            <select name="payment_mode" defaultValue={filters.payment_mode ?? ""} className="field">
              <option value="">الكل</option>
              {PAYMENT_MODES.map((paymentMode) => (
                <option key={paymentMode} value={paymentMode}>
                  {PAYMENT_MODE_LABELS[paymentMode]}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="يحب يزور الأرض">
            <select name="wants_visit" defaultValue={filters.wants_visit ?? ""} className="field">
              <option value="">الكل</option>
              <option value="true">نعم</option>
              <option value="false">لا، مازال</option>
            </select>
          </FilterField>

          <FilterField label="يحب حل تمويل بنكي">
            <select name="wants_bank_financing" defaultValue={filters.wants_bank_financing ?? ""} className="field">
              <option value="">الكل</option>
              <option value="true">نعم</option>
              <option value="false">لا</option>
            </select>
          </FilterField>

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

      <section aria-label="نتيجة البحث" className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-lg">
            <span className="text-3xl font-semibold text-ink tabular-nums">{formatCount(people ? personsTotal : requestsTotal)}</span>{" "}
            <span className="text-muted">{people ? "شخص مطابق" : "مطلب مطابق"}</span>
            <span className="text-muted"> · </span>
            <span className="font-semibold tabular-nums">{formatCount(people ? requestsTotal : personsTotal)}</span>{" "}
            <span className="text-muted">{people ? "مطلب" : "شخص"}</span>
            <span className="text-muted"> · </span>
            <span className="font-semibold tabular-nums">{formatCount(treesTotal)}</span> <span className="text-muted">زيتونة مطلوبة</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">الزيتونات: الحد الأدنى لكل اختيار، دون المطالب المكرّرة.</p>
        </div>
        <nav aria-label="طريقة العرض" className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {[
            { key: "requests", label: "مطلب في كل سطر", active: !people, href: `/admin/leads?${filtersToQuery({ ...filters, people: false })}` },
            { key: "people", label: "شخص في كل سطر", active: people, href: `/admin/leads?${filtersToQuery({ ...filters, people: true })}` },
          ].map((option) => (
            <Link
              key={option.key}
              href={option.href}
              aria-current={option.active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                option.active ? "bg-forest font-semibold text-paper" : "text-muted hover:bg-paper hover:text-ink"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </section>

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
          {isAdmin ? (
            <BulkAssignBar
              formId={BULK_FORM_ID}
              action={assignPersons}
              commercials={activeCommercials}
              filtersQuery={filtersToQuery({ ...filters, people: false })}
              matchingPersons={personsTotal}
            />
          ) : null}

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
            <table className="w-full min-w-[84rem] text-sm">
              <thead className="bg-paper text-xs text-muted">
                <tr className="text-start">
                  {isAdmin ? (
                    <th className="w-10 px-4 py-3">
                      <SelectAllCheckbox formId={BULK_FORM_ID} label="تحديد كل الملفات في هذه الصفحة" />
                    </th>
                  ) : null}
                  <Th>رقم المطلب</Th>
                  <Th>الاسم</Th>
                  <Th>الهاتف</Th>
                  <Th>الزيتونات</Th>
                  <Th>الفئة والسعر</Th>
                  <Th>الإقامة</Th>
                  <Th>الاستثمار</Th>
                  <Th>يحب يملك</Th>
                  <Th>التسبقة والمدة</Th>
                  <Th>الحالة</Th>
                  <Th>المسؤول</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-paper/60">
                    {isAdmin ? (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          name="person_ids"
                          value={row.person_id}
                          form={BULK_FORM_ID}
                          aria-label={`تحديد ملف ${row.full_name}`}
                          className="size-4 accent-forest"
                        />
                      </td>
                    ) : null}
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
                    <Td className="whitespace-nowrap font-medium tabular-nums">{row.tree_count_label_ar ?? "—"}</Td>
                    <Td className="whitespace-nowrap">
                      {row.spacing_label_ar ? (
                        <>
                          <span className="font-medium">{row.spacing_label_ar}</span>
                          {typeof row.area_per_tree_m2 === "number" ? (
                            <div className="text-xs text-muted tabular-nums">{formatArea(row.area_per_tree_m2)} للزيتونة</div>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                      {row.payment_mode ? <div className="text-xs text-muted">{PAYMENT_MODE_LABELS[row.payment_mode] ?? row.payment_mode}</div> : null}
                      {typeof row.total_price_millimes === "number" ? (
                        <div className="text-xs tabular-nums">مقدّر: {formatMillimes(row.total_price_millimes)}</div>
                      ) : null}
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
                    <Td className="whitespace-nowrap tabular-nums">
                      {downPaymentSummary(row.down_payment_percent, row.down_payment_amount_millimes) ?? "—"}
                      {row.duration_label_ar ? <div className="text-xs text-muted">{row.duration_label_ar}</div> : null}
                    </Td>
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
                  <p className="mt-2 text-sm font-medium tabular-nums">{row.tree_count_label_ar ?? "عدد الزيتونات: بدون إجابة"}</p>
                  {row.spacing_label_ar || row.payment_mode || typeof row.total_price_millimes === "number" ? (
                    <p className="mt-1 text-sm tabular-nums">
                      {[
                        row.spacing_label_ar
                          ? `${row.spacing_label_ar}${typeof row.area_per_tree_m2 === "number" ? ` (${formatArea(row.area_per_tree_m2)} للزيتونة)` : ""}`
                          : null,
                        row.payment_mode ? (PAYMENT_MODE_LABELS[row.payment_mode] ?? row.payment_mode) : null,
                        typeof row.total_price_millimes === "number" ? `مقدّر: ${formatMillimes(row.total_price_millimes)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-muted">
                    {investLabel(row)} · {wantsLabel(row)}
                  </p>
                  <p className="mt-1 text-sm tabular-nums empty:hidden">
                    {[downPaymentSummary(row.down_payment_percent, row.down_payment_amount_millimes), row.duration_label_ar].filter(Boolean).join(" · ")}
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
