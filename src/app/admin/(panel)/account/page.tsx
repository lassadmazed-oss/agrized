import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { requireStaff, ROLE_LABELS } from "@/lib/auth";

import { changePassword } from "./actions";

export const metadata: Metadata = { title: "كلمة السر" };

export default async function AccountPage() {
  const session = await requireStaff();

  return (
    <div className="max-w-lg space-y-6">
      <header>
        <h1 className="font-display text-4xl font-bold text-forest">كلمة السر</h1>
        <p className="mt-2 text-muted">
          {session.fullName} · <span dir="ltr">{session.email}</span> · {session.roles.map((role) => ROLE_LABELS[role]).join("، ")}
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <ActionForm action={changePassword} submitLabel="تغيير كلمة السر" className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">كلمة السر الحالية</span>
            <input name="current" type="password" required autoComplete="current-password" dir="ltr" className="field text-left" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">كلمة السر الجديدة</span>
            <input name="next" type="password" required minLength={10} autoComplete="new-password" dir="ltr" className="field text-left" />
            <span className="hint block">10 أحرف على الأقل.</span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">تأكيد كلمة السر الجديدة</span>
            <input name="confirm" type="password" required minLength={10} autoComplete="new-password" dir="ltr" className="field text-left" />
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
