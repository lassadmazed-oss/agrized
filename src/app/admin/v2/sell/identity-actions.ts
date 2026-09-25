"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Filling in who the buyer is (0082).
 *
 * THE ROLE IS CHECKED HERE AND ENFORCED IN THE DATABASE. requireStaff keeps a stranger out of the action;
 * what decides whether THIS person's file may be written is the persons_update policy — an admin, or the
 * commercial the file is assigned to — plus the column grant 0082 added. So a commercial who tries to edit
 * someone else's client gets zero rows back rather than a silent success, and the message below says so.
 *
 * EVERY FIELD IS OPTIONAL HERE even though the sale will refuse without a CIN. A commercial on the phone
 * gets the card number first and the address later, and a form that refuses to save half an answer means the
 * half gets written on paper instead — which is where this data has been living until now.
 */
const schema = z.object({
  cin: z
    .string()
    .trim()
    .regex(/^[0-9]{8}$/, "رقم بطاقة التعريف لازم يكون 8 أرقام.")
    .or(z.literal(""))
    .optional(),
  cin_issued_on: z.string().trim().optional(),
  birth_date: z.string().trim().optional(),
  birth_place: z.string().trim().max(120).optional(),
  address_line: z.string().trim().max(300).optional(),
});

export async function saveIdentity(
  personId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(CRM_READ_ROLES);

  const parsed = schema.safeParse({
    cin: String(formData.get("cin") ?? ""),
    cin_issued_on: String(formData.get("cin_issued_on") ?? ""),
    birth_date: String(formData.get("birth_date") ?? ""),
    birth_place: String(formData.get("birth_place") ?? ""),
    address_line: String(formData.get("address_line") ?? ""),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "تثبّت من المعطيات." };
  }

  // An empty box means «ما عندناش» — null — not «ما بدّلتش». The form always sends every field, so a value
  // cleared on screen is cleared in the database, which is the only behaviour that lets a typo be undone.
  const blank = (value: string | undefined) => (value && value.length > 0 ? value : null);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("persons")
    .update({
      cin: blank(parsed.data.cin),
      cin_issued_on: blank(parsed.data.cin_issued_on),
      birth_date: blank(parsed.data.birth_date),
      birth_place: blank(parsed.data.birth_place),
      address_line: blank(parsed.data.address_line),
    })
    .eq("id", personId)
    .select("id");

  if (error) {
    // 23505 is the partial unique index on cin: another file already carries this card number.
    if (error.code === "23505") {
      return { ok: false, message: "رقم بطاقة التعريف هذا موجود في ملف آخر. تثبّت، ولا اجمع الملفّين." };
    }
    return { ok: false, message: "ما تسجّلتش. عاود جرّب." };
  }

  if (!data || data.length === 0) {
    return { ok: false, message: "لا تملك صلاحية تعديل هذا الملف." };
  }

  revalidatePath("/admin/v2/requests");
  revalidatePath("/admin/v2/confirm");
  return { ok: true, message: "تسجّلت." };
}
