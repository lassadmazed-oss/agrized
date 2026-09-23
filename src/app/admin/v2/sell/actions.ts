"use server";

import { z } from "zod";

import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type OpenFileResult =
  | { ok: true; personId: string; created: boolean }
  | { ok: false; message: string };

/**
 * Opening a client file from the sale screen (0083).
 *
 * WHY THE PHONE IS NORMALISED HERE. `staff_create_person` asserts the number and refuses anything that is
 * not a real line, but it does not reshape it — exactly like the public intake, where the browser sends
 * `phone_e164` already in E.164. Keeping one normaliser (src/lib/phone.ts, the same one both public forms
 * use) is what guarantees «98 123 456», «+216 98 123 456» and «0098…» all land on ONE file instead of three.
 *
 * THE ROLE IS CHECKED TWICE, here and inside the function. This one keeps a stranger out of the action; the
 * database one is what actually decides, and it is the only one that cannot be bypassed by a different
 * caller.
 */
const schema = z.object({
  fullName: z.string().trim().min(3, "الاسم قصير برشة."),
  phone: z.string().trim().min(1, "اكتب رقم التلفون."),
  email: z.string().trim().email("الإيميل موش صحيح.").or(z.literal("")).optional(),
});

export async function openClientFile(input: {
  fullName: string;
  phone: string;
  email?: string;
}): Promise<OpenFileResult> {
  await requireStaff(CRM_READ_ROLES);

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "تثبّت من المعطيات." };
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_create_person", {
    p_full_name: parsed.data.fullName,
    p_phone: phone.e164,
    p_email: parsed.data.email || undefined,
  });

  if (error) {
    if (error.message.includes("forbidden")) {
      return { ok: false, message: "ما عندكش صلاحية باش تفتح ملف حريف." };
    }
    if (error.message.includes("invalid_phone")) {
      return { ok: false, message: "رقم التلفون موش صحيح." };
    }
    if (error.message.includes("invalid_name")) {
      return { ok: false, message: "الاسم قصير برشة." };
    }
    return { ok: false, message: "ما تعملش. عاود جرّب." };
  }

  const payload = data as { person_id?: string; created?: boolean } | null;
  if (!payload?.person_id) return { ok: false, message: "ما تعملش. عاود جرّب." };

  return { ok: true, personId: payload.person_id, created: Boolean(payload.created) };
}
