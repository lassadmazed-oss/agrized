import type { Metadata } from "next";

import { Wordmark } from "@/components/brand/wordmark";
import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, LAND_OFFER_ROLES, PRICE_ROLES, requireStaff, ROLE_LABELS, type StaffSession } from "@/lib/auth";

import { signOut } from "../login/actions";

import { AdminNav, type NavGroup } from "./admin-nav";

export const metadata: Metadata = {
  title: { default: "Back Office", template: "%s · Back Office AgriZed" },
  robots: { index: false, follow: false },
};

function navFor(session: StaffSession): NavGroup[] {
  const groups: NavGroup[] = [{ items: [{ href: "/admin", label: "لوحة القيادة" }] }];

  const demand = [];
  if (hasRole(session, CRM_READ_ROLES)) demand.push({ href: "/admin/leads", label: "مطالب الاستثمار" });
  if (hasRole(session, CRM_READ_ROLES)) demand.push({ href: "/admin/analytics", label: "التحليلات وخريطة الطلب" });
  if (hasRole(session, LAND_OFFER_ROLES)) demand.push({ href: "/admin/land-offers", label: "عروض الأراضي" });
  demand.push({ href: "/admin/projects", label: "المشاريع والقطع" });
  if (hasRole(session, PRICE_ROLES)) demand.push({ href: "/admin/pricing", label: "التسعير" });
  if (demand.length) groups.push({ title: "الطلب والعرض", items: demand });

  if (hasRole(session, ADMIN_ROLES)) {
    groups.push({
      title: "الإدارة",
      items: [
        { href: "/admin/settings/modules", label: "الموديولات" },
        { href: "/admin/settings", label: "الإعدادات والنصوص" },
        { href: "/admin/settings/lists", label: "القوائم" },
        { href: "/admin/settings/media", label: "صور الموقع" },
        { href: "/admin/users", label: "المستخدمون" },
        { href: "/admin/audit", label: "سجل العمليات" },
      ],
    });
  }

  groups.push({ title: "حسابي", items: [{ href: "/admin/account", label: "كلمة السر" }] });
  return groups;
}

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff();
  const groups = navFor(session);
  const roles = session.roles.map((role) => ROLE_LABELS[role]).join("، ");

  const sidebarFooter = (
    <div className="space-y-3 border-t border-paper/15 pt-4">
      <div className="px-3">
        <p className="truncate text-sm font-semibold text-paper">{session.fullName || session.email}</p>
        <p className="truncate text-xs text-paper/60">{roles}</p>
      </div>
      <form action={signOut}>
        <button type="submit" className="w-full rounded-lg px-3 py-2 text-start text-sm text-paper/75 hover:bg-paper/8 hover:text-paper">
          تسجيل الخروج
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      {/* Mobile top bar */}
      <details className="group sticky top-0 z-30 border-b border-forest-700 bg-forest text-paper lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="font-display text-2xl font-bold" dir="ltr">
            Agri<span className="text-gold-bright">Zed</span>
          </span>
          <span className="rounded-md border border-paper/25 px-3 py-1 text-sm">القائمة</span>
        </summary>
        <div className="space-y-6 px-2 pb-4">
          <AdminNav groups={groups} />
          {sidebarFooter}
        </div>
      </details>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 overflow-y-auto bg-forest px-3 py-6 lg:flex">
        <div className="px-3">
          <span className="rounded-lg bg-paper px-2.5 py-1">
            <Wordmark className="text-2xl" />
          </span>
          <p className="mt-2 text-xs text-paper/60">Back Office</p>
        </div>
        <div className="flex-1">
          <AdminNav groups={groups} />
        </div>
        {sidebarFooter}
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
