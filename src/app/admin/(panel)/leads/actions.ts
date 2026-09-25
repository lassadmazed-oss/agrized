"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { filtersToRpc, parseLeadFilters } from "@/lib/backoffice/leads/filters";

const BATCH = 500;
const MAX_ROWS = 100_000;

/**
 * §21 / COM-09: the admin transfers many files at once, either the rows ticked in the list or every
 * person matching the current search. Same RPC and rules as the transfer on a single file.
 */
export async function assignPersons(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);

  const target = String(formData.get("to_user") ?? "");
  if (!target) return { ok: false, message: "اختر المسؤول الذي ستُحوَّل إليه الملفات." };
  const toUser = target === "none" ? null : z.uuid().safeParse(target).data;
  if (target !== "none" && !toUser) return { ok: false, message: "اختر الـCommercial من القائمة." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;

  const supabase = await createClient();
  const personIds = new Set<string>();

  if (formData.get("scope") === "all") {
    const filters = parseLeadFilters(Object.fromEntries(new URLSearchParams(String(formData.get("filters") ?? ""))));
    // The search filters on request_kind and project_id inside the database since 0052 (verified against the
    // live function on 2026-09-19), so «كل الملفات المطابقة للبحث» is exactly what the RPC returns. It used
    // to page the DEMANDS instead of the persons whenever a kind filter was on, and re-test each row here
    // against a snapshot read of interest_requests — one extra read per batch of 500, and a set of persons
    // built from a different query than the count the admin was shown before pressing the button. Both are
    // gone: `people: true` pages one row per person, the same shape the list counted.
    for (let offset = 0; offset < MAX_ROWS; offset += BATCH) {
      const { data, error } = await supabase.rpc("crm_search_requests", {
        p: { ...filtersToRpc(filters), people: true },
        p_limit: BATCH,
        p_offset: offset,
      });
      if (error) return { ok: false, message: "تعذّر جلب الملفات المطابقة للبحث. حدّث الصفحة وحاول مرة أخرى." };
      const rows = data ?? [];
      for (const row of rows) personIds.add(row.person_id);
      if (rows.length < BATCH) break;
    }
  } else {
    for (const value of formData.getAll("person_ids")) {
      const id = z.uuid().safeParse(value);
      if (id.success) personIds.add(id.data);
    }
  }

  if (personIds.size === 0) {
    return { ok: false, message: "لم يُحدَّد أي ملف. علّم الملفات في الجدول أو اختر «كل الملفات المطابقة للبحث»." };
  }

  const { data: moved, error } = await supabase.rpc("admin_assign_persons", {
    p_person_ids: [...personIds],
    p_to_user: toUser as string,
    p_reason: reason as string,
  });
  if (error) {
    if (error.message === "target_not_active_commercial") {
      return { ok: false, message: "هذا المستخدم ليس Commercial نشطاً. اختر Commercial نشطاً من القائمة." };
    }
    if (error.code === "42501") return { ok: false, message: "لا تملك صلاحية تحويل الملفات." };
    return { ok: false, message: "تعذّر تحويل الملفات. لم يتغيّر أي ملف، حاول مرة أخرى." };
  }

  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  const count = moved ?? 0;
  if (count === 0) return { ok: true, message: "كل الملفات المحدّدة مسندة من قبل لهذا الاختيار، لم يتغيّر شيء." };
  return {
    ok: true,
    message: toUser ? `تم تحويل ${formatCount(count)} ملف.` : `تم إلغاء إسناد ${formatCount(count)} ملف.`,
  };
}
