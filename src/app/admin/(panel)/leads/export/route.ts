import { ADMIN_ROLES, getStaffSession, hasRole } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";

import { filtersToRpc, parseLeadFilters } from "../filters";

const BATCH = 500;
const MAX_ROWS = 100_000;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
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

  const header = [
    "رقم المطلب", "التاريخ", "الاسم", "الهاتف", "ولاية الإقامة", "المعتمدية", "ولايات الاستثمار", "أنواع المشاريع",
    "يحب يملك", "عدد الزيتونات", "الزيتونات (الحد الأدنى)", "الزيتونات (الحد الأقصى)",
    "نظام الغراسة", "حالة الإنتاج", "المساحة المطلوبة", "الأهم بالنسبة إليه",
    "الهدف", "التسبقة", "القسط الشهري", "طريقة التواصل", "الوقت المفضل", "الحالة", "المسؤول", "مكرّر", "المصدر",
  ];
  const lines = [header.map(csvCell).join(",")];

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
      lines.push(
        [
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
          row.plantation_systems.map((code) => PLANTATION_LABELS[code] ?? code).join(" | "),
          row.production_statuses.map((code) => PRODUCTION_LABELS[code] ?? code).join(" | "),
          row.desired_area_label_ar ?? "",
          row.priority_label_ar ?? "",
          row.goal_label_ar,
          row.down_payment_label_ar,
          row.installment_label_ar,
          row.contact_channel,
          row.contact_time_label_ar ?? "",
          row.status_label_ar,
          row.assigned_to_name ?? "",
          row.is_duplicate ? "نعم" : "",
          (row.source as { utm_source?: string } | null)?.utm_source ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    offset += BATCH;
    if (rows.length < BATCH) break;
  } while (offset < total && offset < MAX_ROWS);

  await supabase.rpc("log_action", {
    p_action: "crm.export",
    p_entity: "interest_requests",
    p_data: { filters: filtersToRpc(filters), rows: lines.length - 1 },
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
