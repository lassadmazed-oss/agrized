import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { ADMIN_ROLES, hasRole, requireStaff, ROLE_LABELS, type StaffRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { createStaffUser, resetUserPassword, setUserActive, updateUserRoles } from "./actions";

export const metadata: Metadata = { title: "المستخدمون" };

const STAFF_ROLES: StaffRole[] = ["commercial", "agri_manager", "finance", "legal", "admin", "super_admin"];

export default async function UsersPage() {
  const session = await requireStaff(ADMIN_ROLES);
  const isSuper = hasRole(session, ["super_admin"]);
  const supabase = await createClient();

  const [{ data: profiles, error }, authUsers] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, is_active, created_at, roles:user_roles!user_roles_user_id_fkey(role)")
      .order("created_at", { ascending: true }),
    createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (error) throw new Error(error.message);

  const authById = new Map((authUsers.data?.users ?? []).map((user) => [user.id, user]));
  const staff = (profiles ?? []).filter((profile) => {
    const roles = profile.roles.map((r) => r.role);
    return roles.length === 0 || roles.some((role) => role !== "client");
  });

  return (
    <div className="max-w-5xl space-y-8">
      <header>
        <h1 className="section-title">المستخدمون</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          حسابات فريق AgriZed وأدوارهم. إيقاف حساب يقطع الوصول فوراً ولا يحذف أي ملف أو عملية.
        </p>
      </header>

      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">إضافة موظف</h2>
        <ActionForm action={createStaffUser} submitLabel="إنشاء الحساب" pendingLabel="جارٍ الإنشاء…" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">الاسم الكامل</span>
              <input name="full_name" required minLength={3} maxLength={120} className="field" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">البريد الإلكتروني</span>
              <input name="email" type="email" required dir="ltr" className="field text-left" />
            </label>
          </div>
          <RoleCheckboxes selected={[]} canGrantSuper={isSuper} />
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الحسابات ({staff.length})</h2>
        <ul className="space-y-3">
          {staff.map((profile) => {
            const auth = authById.get(profile.id);
            const roles = profile.roles.map((r) => r.role).filter((role): role is StaffRole => role !== "client");
            const isSelf = profile.id === session.id;
            const targetIsSuper = roles.includes("super_admin");
            const canManage = isSuper || !targetIsSuper;
            return (
              <li key={profile.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{profile.full_name || "—"}</h3>
                      {isSelf ? <span className="rounded bg-leaf-soft px-1.5 py-0.5 text-xs text-forest">أنت</span> : null}
                      {!profile.is_active ? <span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-danger">موقوف</span> : null}
                    </div>
                    <p dir="ltr" className="text-end text-sm text-muted sm:text-start">
                      {auth?.email ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      آخر دخول: {auth?.last_sign_in_at ? formatDateTime(auth.last_sign_in_at) : "لم يدخل بعد"}
                    </p>
                  </div>
                  <p className="flex flex-wrap gap-1">
                    {roles.length ? (
                      roles.map((role) => (
                        <span key={role} className="pill bg-paper text-forest ring-1 ring-line">
                          {ROLE_LABELS[role]}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted">بدون دور</span>
                    )}
                  </p>
                </div>

                {canManage ? (
                  <details className="disclosure mt-4 border-t border-line">
                    <summary className="text-sm font-semibold text-forest">إدارة الحساب</summary>
                    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                      <ActionForm action={updateUserRoles.bind(null, profile.id)} submitLabel="حفظ الأدوار" buttonClassName="btn btn-secondary min-h-10">
                        <RoleCheckboxes selected={roles} canGrantSuper={isSuper} />
                      </ActionForm>
                      <div className="space-y-3">
                        {!isSelf ? (
                          <ActionForm
                            action={setUserActive.bind(null, profile.id, !profile.is_active)}
                            submitLabel={profile.is_active ? "إيقاف الحساب" : "تفعيل الحساب"}
                            buttonClassName={`btn min-h-10 ${profile.is_active ? "border border-danger/40 bg-surface text-danger hover:bg-danger-soft" : "btn-secondary"}`}
                          >
                            {null}
                          </ActionForm>
                        ) : null}
                        <ActionForm
                          action={resetUserPassword.bind(null, profile.id)}
                          submitLabel="كلمة سر مؤقتة جديدة"
                          buttonClassName="btn btn-ghost min-h-10"
                        >
                          {null}
                        </ActionForm>
                      </div>
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function RoleCheckboxes({ selected, canGrantSuper }: { selected: StaffRole[]; canGrantSuper: boolean }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">الأدوار</legend>
      <div className="flex flex-wrap gap-2">
        {STAFF_ROLES.map((role) => {
          const disabled = role === "super_admin" && !canGrantSuper;
          return (
            <label
              key={role}
              className={`flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm has-checked:border-forest has-checked:bg-leaf-soft ${
                disabled ? "opacity-50" : "cursor-pointer"
              }`}
            >
              <input type="checkbox" name="roles" value={role} defaultChecked={selected.includes(role)} disabled={disabled} className="size-4 accent-forest" />
              {ROLE_LABELS[role]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
