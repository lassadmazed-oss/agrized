"use server";

import { timingSafeEqual } from "node:crypto";

import { headers } from "next/headers";

import type { ActionResult } from "@/components/admin/action-form";
import { createAdminClient } from "@/lib/supabase/admin";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** The setup page only exists on a local machine, while a token is present in .env. */
export async function setupAllowed(token: string | undefined): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  const expected = process.env.ADMIN_SETUP_TOKEN;
  if (!expected || !token) return false;
  const host = (await headers()).get("host") ?? "";
  if (!LOCAL_HOST.test(host)) return false;

  const given = Buffer.from(token);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Emails of the accounts that already hold the super_admin role. */
export async function listSuperAdminEmails(): Promise<string[]> {
  const admin = createAdminClient();
  const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
  const ids = new Set((roles ?? []).map((row) => row.user_id));
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return (users?.users ?? [])
    .filter((user) => user.email && ids.has(user.id))
    .map((user) => user.email as string);
}

/**
 * Sets the password the owner types here for an existing Super Admin account.
 * The password never leaves this request: it is read from the form and sent straight to Supabase.
 */
export async function setSuperAdminPassword(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  if (!(await setupAllowed(token))) {
    return { ok: false, message: "هذه الصفحة غير متاحة. تأكد من الرابط، أو أن ADMIN_SETUP_TOKEN مازال في ملف .env." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { ok: false, message: "كلمة السر يجب أن تتكوّن من 8 أحرف على الأقل." };
  }
  if (password !== confirm) {
    return { ok: false, message: "التأكيد لا يطابق كلمة السر." };
  }

  const allowed = await listSuperAdminEmails();
  if (!allowed.includes(email)) {
    return { ok: false, message: "هذا البريد ليس حساب Super Admin." };
  }

  const admin = createAdminClient();
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = (users?.users ?? []).find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) {
    return { ok: false, message: "تعذّر العثور على الحساب." };
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, { password, ban_duration: "none" });
  if (error) {
    return { ok: false, message: `تعذّر ضبط كلمة السر: ${error.message}` };
  }

  // AUD-03: the change is recorded like any other password reset.
  await admin.from("audit_logs").insert({
    action: "auth.password_reset",
    entity: "auth",
    entity_id: user.id,
    new_data: { email, via: "setup_page" },
  });

  return {
    ok: true,
    message: "تم ضبط كلمة السر. ادخل الآن من صفحة دخول الفريق، ثم امسح سطر ADMIN_SETUP_TOKEN من ملف .env.",
  };
}
