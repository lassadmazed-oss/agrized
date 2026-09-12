"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, hasRole, requireStaff, type StaffRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STAFF_ROLES: StaffRole[] = ["commercial", "agri_manager", "finance", "legal", "admin", "super_admin"];

function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as string[]).includes(value);
}

function temporaryPassword(): string {
  return randomBytes(12).toString("base64url");
}

function roleError(message: string): string {
  if (message.includes("last super admin")) return "لا يمكن سحب الدور من آخر Super Admin.";
  if (message.includes("super_admin")) return "دور Super Admin يمنحه أو يسحبه Super Admin فقط.";
  return "لا تملك صلاحية تعديل هذا الدور.";
}

const newUserSchema = z.object({
  full_name: z.string().trim().min(3).max(120),
  email: z.email().max(200),
});

export async function createStaffUser(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireStaff(ADMIN_ROLES);
  const parsed = newUserSchema.safeParse({
    full_name: formData.get("full_name"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
  });
  if (!parsed.success) return { ok: false, message: "اكتب الاسم الكامل وبريداً إلكترونياً صحيحاً." };

  const roles = formData.getAll("roles").map(String).filter(isStaffRole);
  if (roles.length === 0) return { ok: false, message: "اختر دوراً واحداً على الأقل." };
  if (roles.includes("super_admin") && !hasRole(session, ["super_admin"])) {
    return { ok: false, message: "دور Super Admin يمنحه Super Admin فقط." };
  }

  const password = temporaryPassword();
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });
  if (error || !data.user) {
    const exists = error?.message.toLowerCase().includes("already");
    return { ok: false, message: exists ? "يوجد حساب بهذا البريد الإلكتروني." : "تعذّر إنشاء الحساب. حاول مرة أخرى." };
  }

  // Roles are granted as the signed-in admin so the audit log records who did it.
  const supabase = await createClient();
  for (const role of roles) {
    const { error: grantError } = await supabase.rpc("admin_set_role", { p_user: data.user.id, p_role: role, p_grant: true });
    if (grantError) return { ok: false, message: `أُنشئ الحساب لكن تعذّر منح دور: ${roleError(grantError.message)}` };
  }

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `تم إنشاء حساب ${parsed.data.email}. كلمة السر المؤقتة: ${password} — سلّمها للموظف بطريقة آمنة، وسيغيّرها من صفحة «كلمة السر».`,
  };
}

export async function updateUserRoles(userId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireStaff(ADMIN_ROLES);
  const wanted = new Set(formData.getAll("roles").map(String).filter(isStaffRole));

  const supabase = await createClient();
  const { data: current, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return { ok: false, message: "تعذّر قراءة الأدوار الحالية." };
  const currentRoles = new Set((current ?? []).map((row) => row.role));

  if (userId === session.id && !wanted.has("admin") && !wanted.has("super_admin")) {
    return { ok: false, message: "لا يمكنك سحب صلاحية الإدارة من حسابك." };
  }

  for (const role of STAFF_ROLES) {
    const shouldHave = wanted.has(role);
    if (shouldHave === currentRoles.has(role)) continue;
    const { error: rpcError } = await supabase.rpc("admin_set_role", { p_user: userId, p_role: role, p_grant: shouldHave });
    if (rpcError) return { ok: false, message: roleError(rpcError.message) };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "تم تحديث الأدوار." };
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_active", { p_user: userId, p_active: active });
  if (error) {
    if (error.message.includes("own account")) return { ok: false, message: "لا يمكنك إيقاف حسابك." };
    return { ok: false, message: roleError(error.message) };
  }

  // COM-10: also block sign-in at the authentication level.
  const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) console.error("Could not update auth ban state", banError);

  revalidatePath("/admin/users");
  return { ok: true, message: active ? "تم تفعيل الحساب." : "تم إيقاف الحساب. لم يعد بإمكانه الدخول، وكل ملفاته محفوظة." };
}

export async function resetUserPassword(userId: string): Promise<ActionResult> {
  const session = await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const { data: targetRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if ((targetRoles ?? []).some((row) => row.role === "super_admin") && !hasRole(session, ["super_admin"])) {
    return { ok: false, message: "كلمة سر Super Admin يعيد تعيينها Super Admin فقط." };
  }

  const password = temporaryPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, message: "تعذّر إعادة تعيين كلمة السر." };

  await supabase.rpc("log_action", { p_action: "auth.password_reset", p_entity: "profiles", p_entity_id: userId });
  return { ok: true, message: `كلمة السر المؤقتة الجديدة: ${password} — سلّمها للموظف بطريقة آمنة.` };
}
