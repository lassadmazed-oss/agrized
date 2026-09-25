import type { Metadata } from "next";
import Link from "next/link";

import { formatPercent } from "@/components/admin/tree-pricing-inputs";
import { DataTable, EmptyState, StatTile, StatusPill, type Column } from "@/components/ui";
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
  REQUEST_KIND_FILTER_LABELS,
  REQUEST_KIND_LABELS,
  type RequestKind,
} from "@/lib/backoffice/leads/filters";
import { offerOf, offerSnapshots, requestKindOf } from "./offer-snapshot";

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
  type LeadRow = (typeof rows)[number];
  const firstRow = rows[0];
  const total = firstRow?.total_count ?? 0;
  const requestsTotal = firstRow?.requests_total ?? 0;
  const personsTotal = firstRow?.persons_total ?? 0;
  const treesTotal = firstRow?.trees_total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Which intake wrote each demand is the search function's own answer since 0052 — it returns request_kind and
  // filters on it in SQL, so the page shows the rows it was given and the counts above the table are exact. Only
  // the four offer PRICE columns are still missing from its RETURNS TABLE, and those are what this read brings
  // (see ./offer-snapshot).
  const snapshots = await offerSnapshots(supabase, rows.map((row) => row.id));
  const kindOf = (row: LeadRow) => requestKindOf(row);

  const pageOffers = rows.filter((row) => kindOf(row) === "offer").length;
  const pageCalculators = rows.filter((row) => kindOf(row) === "calculator").length;

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

  const investLabel = (row: LeadRow) =>
    row.invest_anywhere
      ? "المكان غير مهم"
      : row.invest_governorate_ids.map((id) => governorateName.get(id) ?? id).join("، ");
  const wantsLabel = (row: LeadRow) =>
    row.scenario_labels.length > 0 ? row.scenario_labels.join("، ") : row.project_type_unsure ? "ما يهمّوش النوع" : null;

  /** The badge that tells the two intakes apart. Nothing is shown when nothing says which one it was. */
  const kindBadge = (row: LeadRow) => {
    const kind = kindOf(row);
    if (!kind) return null;
    return (
      <StatusPill tone={kind === "offer" ? "brand" : "line"}>{REQUEST_KIND_LABELS[kind]}</StatusPill>
    );
  };

  const selectColumn: Column<LeadRow> = {
    key: "select",
    header: <SelectAllCheckbox formId={BULK_FORM_ID} label="تحديد كل الملفات في هذه الصفحة" />,
    headClassName: "w-10",
    mobile: "hidden",
    cell: (row) => (
      <input
        type="checkbox"
        name="person_ids"
        value={row.person_id}
        form={BULK_FORM_ID}
        aria-label={`تحديد ملف ${row.full_name}`}
        className="size-4 accent-forest"
      />
    ),
  };
  // One description, rendered as the wide table from md up and as cards below it.
  const columns: Column<LeadRow>[] = [
    ...(isAdmin ? [selectColumn] : []),
    {
      key: "request",
      header: "المطلب",
      // The phone card is itself one <a> (rowHref), so this cell's <Link> must stay off it.
      mobile: "hidden",
      headClassName: "w-44",
      cell: (row) => (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {kindBadge(row)}
            {/* The row leads to this demand, not merely to its file: two demands of one person open apart. */}
            <Link
              href={requestHref(row)}
              dir="ltr"
              className="font-semibold text-forest underline-offset-4 hover:underline"
            >
              {row.request_no}
            </Link>
          </div>
          <div className="mt-0.5 text-xs text-muted tabular-nums">{formatDateTime(row.created_at)}</div>
          {row.is_duplicate ? <span className="mt-1 inline-block rounded bg-gold-soft px-1.5 py-0.5 text-[0.7rem] text-forest-700">مكرّر</span> : null}
        </>
      ),
    },
    {
      // Phone card only: the same badge, beside the status.
      key: "kind",
      header: "النوع",
      desktop: false,
      mobile: "aside",
      cell: (row) => kindBadge(row),
    },
    { key: "full_name", header: "الاسم", className: "font-medium", mobile: "title", cell: (row) => row.full_name },
    {
      key: "phone",
      header: "الهاتف",
      cell: (row) => (
        <>
          <span dir="ltr" className="tabular-nums">
            {formatPhone(row.phone_e164)}
          </span>
          <div className="text-xs text-muted">{CHANNEL_LABELS[row.contact_channel]}</div>
        </>
      ),
    },
    {
      // Real stock, named. A simulation has nothing to put here, and that is the point.
      key: "offer",
      header: "العرض",
      className: "max-w-56",
      cell: (row) => {
        const offer = offerOf(row, snapshots);
        if (!offer) return kindOf(row) === "calculator" ? <span className="text-muted">محاكاة، بلا عرض</span> : "—";
        return (
          <>
            <span className="font-medium">{offer.project_name ?? "عرض بلا اسم"}</span>
            {offer.project_code ? (
              <div className="text-xs text-muted" dir="ltr">
                {offer.project_code}
              </div>
            ) : null}
            {typeof offer.offer_trees === "number" ? (
              <div className="text-xs text-muted tabular-nums">{formatCount(offer.offer_trees)} زيتونة من العرض</div>
            ) : null}
          </>
        );
      },
    },
    { key: "trees", header: "الزيتونات", numeric: true, className: "font-medium", cell: (row) => row.tree_count_label_ar ?? "—" },
    {
      key: "spacing",
      header: "الفئة والسعر",
      className: "whitespace-nowrap",
      cell: (row) => {
        const offer = offerOf(row, snapshots);
        const price = offer?.offer_total_price_millimes ?? row.total_price_millimes;
        return (
          <>
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
            {typeof price === "number" ? (
              // An offer carries its own price; a simulation carries an estimate. Never the same word.
              <div className={`text-xs tabular-nums ${offer ? "font-semibold text-forest" : ""}`.trim()}>
                {offer ? "سعر العرض" : "مقدّر"}: {formatMillimes(price)}
              </div>
            ) : null}
          </>
        );
      },
    },
    {
      key: "invest",
      header: "يدوّر على",
      className: "max-w-52",
      cell: (row) => {
        // An offer demand answers neither question: the place is the offer's own, and no type was asked.
        const wants = kindOf(row) === "offer" ? null : wantsLabel(row);
        return (
          <>
            {investLabel(row) || "—"}
            {wants ? <div className="text-xs text-muted">{wants}</div> : null}
            {row.plantation_systems.length > 0 ? (
              <div className="text-xs text-muted">{row.plantation_systems.map((code) => PLANTATION_LABELS[code] ?? code).join("، ")}</div>
            ) : null}
          </>
        );
      },
    },
    {
      // The plan the caller asked about: the percentage, the duration, and the figure they actually rang about —
      // the monthly. crm_search_requests returns all three; the monthly was read by nothing until now, so a
      // commercial scanning the queue had to open the file for the one number the call is about.
      key: "down_payment",
      header: "التسبقة والمدة",
      numeric: true,
      cell: (row) => (
        <>
          {downPaymentSummary(row.down_payment_percent, row.down_payment_amount_millimes) ?? "—"}
          {row.duration_label_ar ? <div className="text-xs text-muted">{row.duration_label_ar}</div> : null}
          {typeof row.monthly_millimes === "number" ? (
            // PRN-01: an estimate is named as one, here in the cell's own title.
            <div className="text-xs text-muted tabular-nums" title="قسط شهري مقدّر حسب أسعار وقت إرسال المطلب.">
              {formatMillimes(row.monthly_millimes)} شهرياً (مقدّر)
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: "residence",
      header: "الإقامة",
      cell: (row) => (
        <>
          {governorateName.get(row.residence_governorate_id)}
          {row.residence_delegation_id ? <div className="text-xs text-muted">{delegationName.get(row.residence_delegation_id)}</div> : null}
        </>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      mobile: "aside",
      cell: (row) => <StatusPill toneClass={STAGE_TONES[row.stage]}>{row.status_label_ar}</StatusPill>,
    },
    { key: "assigned_to", header: "المسؤول", className: "text-muted", cell: (row) => row.assigned_to_name ?? "—" },
    {
      // Phone card only: the reference line that the wide table already spells out in its first column.
      key: "ref",
      header: "رقم المطلب",
      desktop: false,
      mobile: "meta",
      cell: (row) => (
        <span dir="ltr">
          {row.request_no} · {formatDateTime(row.created_at)}
        </span>
      ),
    },
  ];

  // Real stock first: it is the side of the product that sells, and the one the list used to hide.
  const kindTabs: { key: string; label: string; kind?: RequestKind; active: boolean }[] = [
    { key: "all", label: "كل الطلبات", kind: undefined, active: !filters.request_kind },
    ...(["offer", "calculator"] as const).map((kind) => ({
      key: kind,
      label: REQUEST_KIND_FILTER_LABELS[kind],
      kind,
      active: filters.request_kind === kind,
    })),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title">مطالب الاستثمار</h1>
          <p className="mt-1 text-muted">
            {hasRole(session, ["commercial"]) && !hasRole(session, ["admin", "super_admin", "finance", "legal"])
              ? "المطالب المسندة إليك."
              : "كل المطالب المسجّلة: طلبات على عروض حقيقية، ومحاكاة تقديرية من الموقع."}
          </p>
        </div>
        {isAdmin ? (
          <a href={`/admin/leads/export?${filtersToQuery({ ...filters, people: false })}`} className="btn btn-secondary btn-sm">
            تصدير CSV (كل المطالب المطابقة)
          </a>
        ) : null}
      </header>

      {/* The separation the whole Back Office turns on: a demand on real stock, or a simulation. */}
      <nav aria-label="نوع الطلب" className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">يعرض:</span>
        {kindTabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/leads?${filtersToQuery({ ...filters, request_kind: tab.kind })}`}
            aria-current={tab.active ? "true" : undefined}
            className="chip"
          >
            {tab.label}
          </Link>
        ))}
        {/* «مطالب هذا العرض» on the offer page links here with project_id in the address (0052 filters on it in
            SQL). A filter nobody can see is a trap — the list would look empty for no visible reason — so it
            says which offer it is narrowed to and carries its own way out. The name comes from the rows
            themselves; an offer with no demand yet has no row to name it, and says so. */}
        {filters.project_id ? (
          <>
            <span className="chip" aria-current="true">
              العرض: {rows.find((row) => row.project_name)?.project_name ?? "بلا مطالب بعد"}
            </span>
            <Link href={`/admin/leads?${filtersToQuery({ ...filters, project_id: undefined })}`} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
              إلغاء تحديد العرض
            </Link>
          </>
        ) : null}
      </nav>

      {/* The house disclosure: the row, its 3rem tap target, the drawn marker at the start and the indent of
          the body come with `.disclosure` — see globals.css. The hint keeps its place at the end of the row
          with ms-auto, because the summary is a flex row whose first item is now the marker. */}
      <details open={hasActiveFilters(filters)} className="panel disclosure group">
        <summary className="font-semibold">
          البحث والفلاتر
          <span className="ms-auto text-sm font-normal text-muted group-open:hidden">اضغط لعرض الفلاتر</span>
        </summary>
        <form method="get" action="/admin/leads" className="grid gap-4 border-t border-line pt-cozy sm:grid-cols-2 lg:grid-cols-4">
          {people ? <input type="hidden" name="people" value="1" /> : null}
          {/* Chosen above the panel; kept across a search so the two intakes never merge again by accident. */}
          {filters.request_kind ? <input type="hidden" name="request_kind" value={filters.request_kind} /> : null}
          {/* Same reason, for the offer arrived at from «مطالب هذا العرض»: a GET form submits only its own
              fields, so without this line searching inside one offer would silently widen to all of them. */}
          {filters.project_id ? <input type="hidden" name="project_id" value={filters.project_id} /> : null}

          <FilterField label="بحث" className="sm:col-span-2">
            <input name="q" defaultValue={filters.q} placeholder="الاسم، الهاتف أو رقم المطلب" className="field field-sm" />
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
                className="field field-sm"
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
                className="field field-sm"
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
            <select name="invest_governorate_id" defaultValue={filters.invest_governorate_id ?? ""} className="field field-sm">
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
            <select name="project_type_id" defaultValue={filters.project_type_id ?? ""} className="field field-sm">
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
            <select name="spacing_class_id" defaultValue={filters.spacing_class_id ?? ""} className="field field-sm">
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
            <select name="plantation_system" defaultValue={filters.plantation_system ?? ""} className="field field-sm">
              <option value="">الكل</option>
              {plantations.map((option) => (
                <option key={option.id} value={option.code ?? ""}>
                  {option.label_ar}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="حالة الإنتاج">
            <select name="production_status" defaultValue={filters.production_status ?? ""} className="field field-sm">
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
            <select name="down_payment_percent" defaultValue={filters.down_payment_percent ?? ""} className="field field-sm">
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
            <select name="payment_mode" defaultValue={filters.payment_mode ?? ""} className="field field-sm">
              <option value="">الكل</option>
              {PAYMENT_MODES.map((paymentMode) => (
                <option key={paymentMode} value={paymentMode}>
                  {PAYMENT_MODE_LABELS[paymentMode]}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="يحب يزور الأرض">
            <select name="wants_visit" defaultValue={filters.wants_visit ?? ""} className="field field-sm">
              <option value="">الكل</option>
              <option value="true">نعم</option>
              <option value="false">لا، مازال</option>
            </select>
          </FilterField>

          <FilterField label="يحب حل تمويل بنكي">
            <select name="wants_bank_financing" defaultValue={filters.wants_bank_financing ?? ""} className="field field-sm">
              <option value="">الكل</option>
              <option value="true">نعم</option>
              <option value="false">لا</option>
            </select>
          </FilterField>

          <FilterField label="الهدف">
            <select name="goal_code" defaultValue={filters.goal_code ?? ""} className="field field-sm">
              <option value="">الكل</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.code ?? ""}>
                  {goal.label_ar}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="ولاية الإقامة">
            <select name="residence_governorate_id" defaultValue={filters.residence_governorate_id ?? ""} className="field field-sm">
              <option value="">الكل</option>
              {config.governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_ar}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="حالة الملف">
            <select name="status_id" defaultValue={filters.status_id ?? ""} className="field field-sm">
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
              <select name="assigned_to" defaultValue={filters.assigned_to ?? ""} className="field field-sm">
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
            <input type="date" name="from" defaultValue={filters.from} className="field field-sm" dir="ltr" />
          </FilterField>
          <FilterField label="إلى تاريخ">
            <input type="date" name="to" defaultValue={filters.to} className="field field-sm" dir="ltr" />
          </FilterField>
          <FilterField label="المصدر (utm_source)">
            <input name="source" defaultValue={filters.source} placeholder="facebook، direct…" className="field field-sm" dir="ltr" />
          </FilterField>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
            <CheckboxLabel name="duplicates_only" checked={filters.duplicates_only} label="المطالب المكرّرة فقط" />
            <div className="ms-auto flex gap-2">
              <Link href="/admin/leads" className="btn btn-ghost btn-sm">
                مسح الفلاتر
              </Link>
              <button type="submit" className="btn btn-primary btn-sm">
                بحث
              </button>
            </div>
          </div>
        </form>
      </details>

      <section aria-label="نتيجة البحث" className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={people ? "شخص مطابق" : "مطلب مطابق"}
          value={people ? personsTotal : requestsTotal}
          note={
            rows.length > 0 ? (
              <>
                في هذه الصفحة: <span className="tabular-nums">{formatCount(pageOffers)}</span> عرض ·{" "}
                <span className="tabular-nums">{formatCount(pageCalculators)}</span> محاكي
              </>
            ) : null
          }
        />
        <StatTile label={people ? "مطلب" : "شخص"} value={people ? requestsTotal : personsTotal} />
        <StatTile label="زيتونة مطلوبة" value={treesTotal} note="الحد الأدنى لكل اختيار، دون المطالب المكرّرة." />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="طريقة العرض" className="flex flex-wrap gap-2">
          {[
            { key: "requests", label: "مطلب في كل سطر", active: !people, href: `/admin/leads?${filtersToQuery({ ...filters, people: false })}` },
            { key: "people", label: "شخص في كل سطر", active: people, href: `/admin/leads?${filtersToQuery({ ...filters, people: true })}` },
          ].map((option) => (
            <Link key={option.key} href={option.href} aria-current={option.active ? "true" : undefined} className="chip">
              {option.label}
            </Link>
          ))}
        </nav>
        {rows.length > 0 ? (
          <p className="text-xs text-muted">
            <span className="tabular-nums">{formatCount(rows.length)}</span> سطر في هذه الصفحة
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          action={
            hasActiveFilters(filters) ? (
              <Link href="/admin/leads" className="font-semibold text-forest underline-offset-4 hover:underline">
                مسح الفلاتر
              </Link>
            ) : null
          }
        >
          لا توجد مطالب مطابقة.
        </EmptyState>
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

          <DataTable
            caption="مطالب الاستثمار"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => requestHref(row)}
            minWidth="88rem"
          />

          {pageCount > 1 ? (
            <nav aria-label="الصفحات" className="flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link href={`/admin/leads?${filtersToQuery(filters, { page: String(page - 1) })}`} className="btn btn-secondary btn-sm">
                  السابق
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted tabular-nums">
                الصفحة {page} من {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={`/admin/leads?${filtersToQuery(filters, { page: String(page + 1) })}`} className="btn btn-secondary btn-sm">
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

/** The file, opened on this very demand: the person page gives every demand an anchor of its own. */
function requestHref(row: { person_id: string; id: string }): string {
  return `/admin/leads/${row.person_id}#request-${row.id}`;
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
        <select name={nameMin} defaultValue={min ?? ""} className="field field-sm" aria-label={`${label}: من`}>
          <option value="">من</option>
          {options.map((option) => (
            <option key={option.id} value={option.value}>
              {option.label_ar}
            </option>
          ))}
        </select>
        <select name={nameMax} defaultValue={max ?? ""} className="field field-sm" aria-label={`${label}: إلى`}>
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
