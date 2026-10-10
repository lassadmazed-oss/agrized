import { getStaffSession, hasRole, PRICE_ROLES } from "@/lib/auth";
import {
  COMMISSION_STATUS_LABELS,
  isCommissionStatus,
  type CommissionRow,
  type PayoutRow,
} from "@/lib/backoffice/referrals";
import { createClient } from "@/lib/supabase/server";

// §6 «Export Excel وRapport financier»: the commissions or the payouts as a CSV that Excel opens as it is
// (UTF-8 with its BOM, every cell quoted, formulas neutralised), the same recipe as the leads export. Finance
// and Admin only — the functions it reads check app.can_record_money() again — and every export is logged.

const BATCH = 1000;
const MAX_ROWS = 50_000;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function dinars(value: number | null | undefined): string {
  return typeof value === "number" ? (value / 1000).toFixed(3) : "";
}

function day(value: string | null | undefined): string {
  return value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date(value)) : "";
}

export async function GET(request: Request) {
  const session = await getStaffSession();
  if (!session || !hasRole(session, PRICE_ROLES)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "payouts" ? "payouts" : "commissions";
  const statusParam = url.searchParams.get("status");
  const status = isCommissionStatus(statusParam) ? statusParam : null;
  const supabase = await createClient();
  const lines: string[] = [];

  if (kind === "commissions") {
    lines.push(
      [
        "التاريخ", "الحالة", "الجيل", "يربح", "هاتف اللي يربح", "كود التوصية", "الشاري", "رقم العقد", "العرض",
        "الحساب", "العدد", "المبلغ للوحدة (د.ت)", "مبلغ القاعدة للوحدة (د.ت)", "المبلغ (د.ت)",
        "سعر الزيتونة (د.ت)", "كلفة الزيتونة (د.ت)", "تأكّدت", "تخلّصت", "رقم الخلاص", "تلغات", "السبب",
      ].map(csvCell).join(","),
    );
    for (let offset = 0; offset < MAX_ROWS; offset += BATCH) {
      const { data, error } = await supabase.rpc("staff_referral_commissions", {
        p_status: status ?? undefined,
        p_limit: BATCH,
        p_offset: offset,
      });
      if (error) return new Response("The export could not be read", { status: 500 });
      const rows = ((data as unknown as { rows: CommissionRow[] } | null)?.rows ?? []);
      for (const row of rows) {
        lines.push(
          [
            day(row.created_at), COMMISSION_STATUS_LABELS[row.status], row.generation, row.beneficiary.full_name,
            row.beneficiary.phone_e164, row.beneficiary.referral_code, row.buyer.full_name, row.contract.reference_no,
            row.project.name, row.basis === "tree" ? "زيتونة" : "طلبية", row.units, dinars(row.unit_millimes),
            dinars(row.rule_unit_millimes), dinars(row.amount_millimes), dinars(row.price_per_tree_millimes),
            dinars(row.cost_per_tree_millimes), day(row.validated_at), day(row.paid_at), row.payout?.reference_no,
            day(row.cancelled_at ?? row.reversed_at), row.cancel_reason,
          ].map(csvCell).join(","),
        );
      }
      if (rows.length < BATCH) break;
    }
  } else {
    lines.push(
      ["رقم الخلاص", "التاريخ", "الحريف", "الهاتف", "عدد الكوميسيونات", "المبلغ (د.ت)", "الطريقة", "المرجع", "سجّلو", "ملاحظة"]
        .map(csvCell)
        .join(","),
    );
    for (let offset = 0; offset < MAX_ROWS; offset += BATCH) {
      const { data, error } = await supabase.rpc("staff_referral_payouts", { p_limit: BATCH, p_offset: offset });
      if (error) return new Response("The export could not be read", { status: 500 });
      const rows = ((data as unknown as { rows: PayoutRow[] } | null)?.rows ?? []);
      for (const row of rows) {
        lines.push(
          [
            row.reference_no, row.paid_on, row.person.full_name, row.person.phone_e164, row.count,
            dinars(row.total_millimes), row.method_label, row.reference, row.created_by, row.note,
          ].map(csvCell).join(","),
        );
      }
      if (rows.length < BATCH) break;
    }
  }

  await supabase.rpc("log_action", {
    p_action: "referral.export",
    p_entity: kind === "commissions" ? "commission_transactions" : "commission_payouts",
    p_data: { rows: lines.length - 1, status },
  });

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agrized-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
