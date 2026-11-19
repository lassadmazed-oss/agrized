import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES, hasRole, requireStaff } from "@/lib/auth";

import { signOut } from "../login/actions";
import { FIELD_ROLES } from "./terrain/field-model";

export const metadata: Metadata = { title: { default: "الميدان", template: "%s · الميدان" } };

/**
 * «الميدان» (0175) — the tablet the field commercial carries. No sidebar and no Back Office around it: his
 * list, one person at a time, big buttons. The owner: «انترفاس تبدا سهلة وواضحة وكروات، وهذه تعدي لهذه».
 * An administrator sees the same screens, plus the door to hand people out and the way back to the office.
 */
export default async function TerrainLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff(FIELD_ROLES);
  const admin = hasRole(session, ADMIN_ROLES);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
          <Link href="/admin/terrain" className="flex items-center gap-2 font-display text-lg font-bold text-forest">
            <span aria-hidden="true">🫒</span>
            الميدان
          </Link>
          <span className="truncate text-sm text-muted">{session.fullName}</span>
          <nav className="ms-auto flex items-center gap-1.5" aria-label="الميدان">
            {admin ? (
              <>
                <Link href="/admin/terrain/assign" className="btn btn-secondary btn-sm">
                  وزّع الزيارات
                </Link>
                <Link href="/admin" className="btn btn-ghost btn-sm">
                  الإدارة
                </Link>
              </>
            ) : null}
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
