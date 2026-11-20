import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { AdminLanguageSwitch } from "@/components/admin/admin-language-switch";
import { ADMIN_LANG_COOKIE, parseAdminLang } from "@/lib/admin-lang";
import { ADMIN_ROLES, hasRole, requireStaff, type StaffRole } from "@/lib/auth";

import { signOut } from "../login/actions";
import { FIELD_ROLES } from "./terrain/field-model";
import { FARM_ROLES } from "./terrain/tasks/farm-model";

export const metadata: Metadata = { title: { default: "الميدان", template: "%s · الميدان" } };

const TERRAIN_ROLES = [...new Set<StaffRole>([...FIELD_ROLES, ...FARM_ROLES])];

/**
 * «الميدان» — the screens the team carries on a tablet or a phone, with no Back Office around them:
 *   · the field commercial (0175): his people, one at a time, from the call to the receipt;
 *   · the grove (0178): the worker's tasks and daily photo reports, the supervisor's checks, the manager's plan.
 * Each reader sees the doors of his own roles; every page checks its own roles again, and the database once more.
 */
export default async function TerrainLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff(TERRAIN_ROLES);
  const admin = hasRole(session, ADMIN_ROLES);
  const field = hasRole(session, FIELD_ROLES);
  const farm = hasRole(session, FARM_ROLES);
  const office = !session.roles.every((role) => role === "worker" || role === "supervisor");
  const lang = parseAdminLang((await cookies()).get(ADMIN_LANG_COOKIE)?.value);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
          <Link href={field ? "/admin/terrain" : "/admin/terrain/tasks"} className="flex items-center gap-2 font-display text-lg font-bold text-forest">
            <span aria-hidden="true">🫒</span>
            الميدان
          </Link>
          <span className="truncate text-sm text-muted">{session.fullName}</span>
          <nav className="ms-auto flex flex-wrap items-center gap-1.5" aria-label="الميدان">
            {field && farm ? (
              <>
                <Link href="/admin/terrain" className="btn btn-ghost btn-sm">
                  ليستتي
                </Link>
                <Link href="/admin/terrain/tasks" className="btn btn-ghost btn-sm">
                  الخدمة
                </Link>
              </>
            ) : null}
            {admin ? (
              <Link href="/admin/terrain/assign" className="btn btn-secondary btn-sm">
                وزّع الزيارات
              </Link>
            ) : null}
            {office ? (
              <Link href="/admin" className="btn btn-ghost btn-sm">
                الإدارة
              </Link>
            ) : null}
            <AdminLanguageSwitch current={lang} className="btn btn-ghost btn-sm" />
            <form action={signOut}>
              <button type="submit" className="btn btn-ghost btn-sm">
                خروج
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-5 sm:py-7">{children}</main>
    </div>
  );
}
