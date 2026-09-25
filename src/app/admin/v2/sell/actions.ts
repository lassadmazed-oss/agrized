"use server";

import { z } from "zod";

import { createReservation, recordDeposit } from "@/lib/backoffice/reservations/actions";
import { CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { parseTreeNumbers } from "./trees";

export type SaleResult =
  | { ok: true; reservationId: string; personId: string; depositRecorded: boolean; depositNote: string | null }
  | { ok: false; message: string };

const person = z.object({
  fullName: z.string().trim().min(3, "الاسم قصير برشة."),
  phone: z.string().trim().min(1, "اكتب رقم التلفون."),
  cin: z.string().trim().regex(/^\d{8}$/, "بطاقة التعريف لازم تكون 8 أرقام.").or(z.literal("")).optional(),
  email: z.string().trim().email("الإيميل موش صحيح.").or(z.literal("")).optional(),
});

/**
 * صفحة البيع, in one press (owner, 2026-09-23: «first I need a form for the client information that I am
 * going to sell for — who? — in the same sell form there is how many trees … then to register a sale in the
 * same form, under there is a field for العربون»).
 *
 * WHY ONE ACTION AND NOT THREE. Opening a client file, holding the trees and taking the عربون used to be three
 * screens and three presses, and the seller was the transaction manager: if they closed the tab after the
 * second one, a client existed with trees held and no money recorded, and nothing on any screen said so. Here
 * it is one press, and the failures are ordered so a half-done sale is always the LEAST damaging half:
 *
 *   1 · the person   — reused if the phone is already on file (0083), never duplicated.
 *   2 · the trees    — all of them or none, in one transaction (0089). If this fails, nothing was sold.
 *   3 · the عربون    — money last, because a hold with no payment is a normal state that the confirmation
 *                      page shows and can settle, while a payment against nothing is a mess with no screen.
 *
 * A DEPOSIT THE CALLER MAY NOT RECORD IS NOT AN ERROR. Only finance and admin may take money (PRICE_ROLES,
 * = app.can_record_money), so a commercial selling to a walk-in gets the sale AND a line saying the عربون is
 * still to be recorded by someone who may — rather than a refusal that throws away the sale they just made.
 */
export async function registerSale(input: {
  mode: "known" | "new";
  personId?: string;
  fullName?: string;
  phone?: string;
  cin?: string;
  email?: string;
  projectId: string;
  /** «5-11» · «5، 10، 15» — the trees, as typed. Empty means the count below decides instead. */
  treesText?: string;
  count?: number;
  depositDinars?: string;
  note?: string;
}): Promise<SaleResult> {
  const staff = await requireStaff(CRM_READ_ROLES);
  const supabase = await createClient();

  // ——— 1 · who
  let personId = String(input.personId ?? "");
  if (input.mode === "new") {
    const parsed = person.safeParse({
      fullName: input.fullName ?? "",
      phone: input.phone ?? "",
      cin: input.cin ?? "",
      email: input.email ?? "",
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "تثبّت من معطيات الحريف." };
    }

    const phone = normalizePhone(parsed.data.phone, false);
    if (!phone.ok) {
      return {
        ok: false,
        message:
          phone.reason === "not_tunisian"
            ? "الرقم لازم يكون تونسي."
            : "رقم التلفون موش صحيح. مثال: 98 123 456.",
      };
    }

    const { data, error } = await supabase.rpc("staff_create_person", {
      p_full_name: parsed.data.fullName,
      p_phone: phone.e164,
      p_email: parsed.data.email || undefined,
    });
    if (error) {
      if (error.message.includes("forbidden")) return { ok: false, message: "ما عندكش صلاحية باش تفتح ملف حريف." };
      if (error.message.includes("invalid_phone")) return { ok: false, message: "رقم التلفون موش صحيح." };
      if (error.message.includes("invalid_name")) return { ok: false, message: "الاسم قصير برشة." };
      return { ok: false, message: "ما تعملش فتح الملف. عاود جرّب." };
    }
    personId = (data as { person_id?: string } | null)?.person_id ?? "";
    if (!personId) return { ok: false, message: "ما تعملش فتح الملف. عاود جرّب." };

    // The identity card, when it was given. It is not required to HOLD trees — it is required to sign a
    // contract — so a missing one never blocks the sale here; the confirmation page asks for it.
    if (parsed.data.cin) {
      await supabase.from("persons").update({ cin: parsed.data.cin }).eq("id", personId);
    }
  }
  if (!personId) return { ok: false, message: "اختار الحريف ولا عمّر معطياتو." };

  // ——— 2 · the trees
  const typed = String(input.treesText ?? "").trim();
  let seqs: number[] = [];
  if (typed !== "") {
    const parsed = parseTreeNumbers(typed);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    seqs = parsed.seqs;
  }

  const count = Number(input.count ?? 0);
  if (seqs.length === 0 && (!Number.isInteger(count) || count < 1)) {
    return { ok: false, message: "اكتب أرقام الزيتونات ولا عدد الزيتونات." };
  }

  const reserved = await createReservation({
    projectId: input.projectId,
    personId,
    trees: seqs.length > 0 ? seqs.length : count,
    seqs: seqs.length > 0 ? seqs : null,
    note: String(input.note ?? "").trim() || null,
    reason: "بيع من صفحة البيع",
  });
  if (!reserved.ok) return { ok: false, message: reserved.message };

  const reservationId = (reserved as { reservation?: { id?: string } }).reservation?.id ?? "";
  if (!reservationId) return { ok: false, message: "تعمل الحجز أما ما رجعش رقمو. شوف الحجوزات." };

  // ——— 3 · the عربون
  const dinars = Number(String(input.depositDinars ?? "").trim());
  if (!Number.isFinite(dinars) || dinars <= 0) {
    return { ok: true, reservationId, personId, depositRecorded: false, depositNote: null };
  }
  if (!hasRole(staff, PRICE_ROLES)) {
    return {
      ok: true,
      reservationId,
      personId,
      depositRecorded: false,
      depositNote: "الزيتونات تحجزت. العربون ما تسجّلش: تسجيل الفلوس يلزمو دور Finance ولا Admin.",
    };
  }

  const paid = await recordDeposit({
    reservationId,
    amountDinars: dinars,
    reason: "عربون مع البيعة",
  });
  if (!paid.ok) {
    return {
      ok: true,
      reservationId,
      personId,
      depositRecorded: false,
      depositNote: `الزيتونات تحجزت. أما العربون ما تسجّلش: ${paid.message}`,
    };
  }

  return { ok: true, reservationId, personId, depositRecorded: true, depositNote: null };
}
