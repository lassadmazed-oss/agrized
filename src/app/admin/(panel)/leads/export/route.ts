import { ADMIN_ROLES, getStaffSession, hasRole } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";

import { filtersToRpc, parseLeadFilters, PAYMENT_MODE_LABELS } from "../filters";

const BATCH = 500;
const MAX_ROWS = 100_000;

const HEADER = [
  "رقم المطلب", "التاريخ", "الاسم", "الهاتف", "ولاية الإقامة", "المعتمدية", "ولايات الاستثمار", "أنواع المشاريع",
  "يحب يملك", "عدد الزيتونات", "الزيتونات (الحد الأدنى)", "الزيتونات (الحد الأقصى)",
  "فئة المساحة", "المساحة لكل زيتونة (م²)", "المساحة الجملية (م²)",
  "نظام الغراسة", "حالة الإنتاج", "الهدف",
  "طريقة الدفع", "السعر الجملي المقدّر (د.ت)", "نسبة التسبقة (%)", "مبلغ التسبقة المقدّر (د.ت)",
  "مدة الدفع", "مدة الدفع (بالأشهر)", "السعر بالتقسيط (د.ت)", "القسط الشهري المقدّر (د.ت)",
  "يحب يزور الأرض", "يحب حل تمويل بنكي",
  "طريقة التواصل", "الوقت المفضل", "الحالة", "المسؤول", "مكرّر", "المصدر",
];

/** Plan Q-7: answers to retired questions (LEAD-02), added only when an exported demand carries one. */
const LEGACY_HEADER = ["المساحة المطلوبة", "الأهم بالنسبة إليه", "التسبقة (مبلغ)", "القسط الشهري", "الميزانية"].map(
  (label) => `إجابات قديمة: ${label}`,
);

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Optional yes/no answers (report v3 §14, §40): an empty cell means the question was not answered. */
function answer(value: boolean | null): string {
  return value === true ? "نعم" : value === false ? "لا" : "";
}

/** Millimes as a plain dinar amount a spreadsheet reads as a number; empty when the demand has none. */
function dinars(value: number | null): string {
  return typeof value === "number" ? (value / 1000).toFixed(3) : "";
}

/** A percentage as a plain number a spreadsheet reads («12.5»); empty when the demand has none. */
function percent(value: number | string | null | undefined): string {
  return value === null || value === undefined || value === "" ? "" : String(Number(value));
}

/** CRM-05: export is reserved to Admin and Super Admin, enforced here on the server, and logged. */
export async function GET(request: Request) {
  const session = await getStaffSession();
  if (!session || !hasRole(session, ADMIN_ROLES)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const filters = parseLeadFilters(Object.fromEntries(url.searchParams.entries()));
  const supabase = await createClient();
  const config = await getPublicConfig();
  const governorateName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const delegationName = new Map(config.delegations.map((d) => [d.id, d.name_ar]));
  const typeName = new Map(config.projectTypes.map((t) => [t.id, t.label_ar]));

  // Rows are kept until the end: the legacy columns depend on the whole export.
  const records: { cells: unknown[]; legacy: string[] }[] = [];
  let hasLegacy = false;

  let offset = 0;
  let total = 0;
  do {
    const { data, error } = await supabase.rpc("crm_search_requests", {
      p: filtersToRpc(filters),
      p_limit: BATCH,
      p_offset: offset,
    });
    if (error) {
      return new Response(`Export failed: ${error.message}`, { status: 500 });
    }
    const rows = data ?? [];
    total = rows[0]?.total_count ?? 0;
    for (const row of rows) {
      const downPercent = percent(row.down_payment_percent);
      const legacy = [
        row.desired_area_label_ar ?? "",
        row.priority_label_ar ?? "",
        // A demand with a percentage never answered the amount list.
        downPercent ? "" : (row.down_payment_label_ar ?? ""),
        row.installment_label_ar ?? "",
        row.budget_label_ar ?? "",
      ];
      hasLegacy ||= legacy.some((value) => value !== "");
      records.push({
        cells: [
          row.request_no,
          new Date(row.created_at).toISOString(),
          row.full_name,
          row.phone_e164,
          governorateName.get(row.residence_governorate_id) ?? "",
          row.residence_delegation_id ? (delegationName.get(row.residence_delegation_id) ?? "") : "",
          row.invest_anywhere ? "المكان غير مهم" : row.invest_governorate_ids.map((id) => governorateName.get(id) ?? id).join(" | "),
          row.project_type_unsure ? "لا يعرف" : row.project_type_ids.map((id) => typeName.get(id) ?? id).join(" | "),
          row.scenario_labels.join(" | "),
          row.tree_count_label_ar ?? "",
          row.tree_count_min ?? "",
          row.tree_count_max ?? "",
          row.spacing_label_ar ?? "",
          row.area_per_tree_m2 ?? "",
          row.total_area_m2 ?? "",
          row.plantation_systems.map((code) => PLANTATION_LABELS[code] ?? code).join(" | "),
          row.production_statuses.map((code) => PRODUCTION_LABELS[code] ?? code).join(" | "),
          row.goal_label_ar,
          row.payment_mode ? (PAYMENT_MODE_LABELS[row.payment_mode] ?? row.payment_mode) : "",
          dinars(row.total_price_millimes),
          downPercent,
          dinars(row.down_payment_amount_millimes),
          row.duration_label_ar ?? "",
          row.duration_months ?? "",
          dinars(row.total_financed_millimes),
          dinars(row.monthly_millimes),
          answer(row.wants_visit),
          answer(row.wants_bank_financing),
          row.contact_channel,
          row.contact_time_label_ar ?? "",
          row.status_label_ar,
          row.assigned_to_name ?? "",
          row.is_duplicate ? "نعم" : "",
          (row.source as { utm_source?: string } | null)?.utm_source ?? "",
        ],
        legacy,
      });
    }
    offset += BATCH;
    if (rows.length < BATCH) break;
  } while (offset < total && offset < MAX_ROWS);

  const header = hasLegacy ? [...HEADER, ...LEGACY_HEADER] : HEADER;
  const lines = [
    header.map(csvCell).join(","),
    ...records.map((record) => (hasLegacy ? [...record.cells, ...record.legacy] : record.cells).map(csvCell).join(",")),
  ];

  await supabase.rpc("log_action", {
    p_action: "crm.export",
    p_entity: "interest_requests",
    p_data: { filters: filtersToRpc(filters), rows: records.length },
  });

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // BOM so Excel opens Arabic text as UTF-8.
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agrized-leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
