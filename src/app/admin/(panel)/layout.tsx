import type { Metadata } from "next";
import Link from "next/link";

import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { MenuIcon } from "@/components/admin/nav-icons";
import { ADMIN_LABELS, NAV_STATE_LABELS, type AdminHref, type AdminIconKey, type NavGroup, type NavItem } from "@/components/admin/nav-model";
import { Wordmark } from "@/components/brand/wordmark";
import {
  ADMIN_ROLES,
  CRM_READ_ROLES,
  hasRole,
  LAND_OFFER_ROLES,
  PRICE_ROLES,
  requireStaff,
  ROLE_LABELS,
  type StaffRole,
  type StaffSession,
} from "@/lib/auth";
import { flagState, getPublicConfig, type PublicConfig } from "@/lib/config";

import { signOut } from "../login/actions";

import { AdminNav } from "./admin-nav";

export const metadata: Metadata = {
  title: { default: "Back Office", template: "%s · Back Office AgriZed" },
  robots: { index: false, follow: false },
};

type RowOptions = {
  /** The role gate, unchanged from the one this section always had. */
  roles?: readonly StaffRole[];
  /** The key in feature_flags. A section with no module of its own passes none. */
  flag?: string;
  children?: (NavItem | null)[];
};

/**
 * The sidebar, built for one session.
 *
 * Two things decide a row. The role gate is the one the section always had — CRM_READ_ROLES on the
 * demand side, LAND_OFFER_ROLES on the landowner intake, PRICE_ROLES on pricing, ADMIN_ROLES on
 * administration — and nothing here widens or narrows one.
 *
 * The module flag is new. The nav used to be role-gated and nothing else, so every row looked equally
 * live whatever state its module was in: «عروض الأراضي» read the same switched off as switched on. Now
 * each row carries its module's state — «معطّل», «داخلي» — and is drawn quiet when it is off.
 *
 * A row that is off still opens. The flag says what visitors see; it is not an access rule for the staff,
 * and the Back Office is precisely where a module is prepared before it is published — gating the link on
 * it would lock Finance out of the offers they are building. What a switched-off section must never do is
 * lead to an invented screen, and none of them do: the five with no tables behind them open onto a page
 * that says the domain is not open yet.
 */
function navFor(session: StaffSession, config: PublicConfig): NavGroup[] {
  const row = (href: AdminHref, icon: AdminIconKey, { roles, flag, children }: RowOptions = {}): NavItem | null => {
    if (roles && !hasRole(session, roles)) return null;

    const state = flag ? flagState(config, flag) : "public";
    const badge = state === "disabled" ? NAV_STATE_LABELS.off : state === "internal" ? NAV_STATE_LABELS.internal : undefined;
    const kept = (children ?? []).filter((child): child is NavItem => child !== null);

    return {
      href,
      label: ADMIN_LABELS[href],
      icon,
      badge,
      off: state === "disabled",
      children: kept.length > 0 ? kept : undefined,
    };
  };

  // FOUR sections, because the Back Office has four jobs: see the day, answer the demand, keep the stock,
  // and set the rules. Owner, 2026-09-18: «I don't like the separated things, it's too confusing».
  //
  // It briefly had eleven rows, five of which — الحجوزات، الزيارات، العقود، الدفوعات، الخدمات الفلاحية —
  // opened onto a page that said the domain was not built yet. A row that leads nowhere costs a reader more
  // than it tells them, so those five went out of the nav UNTIL THEY HAD TABLES BEHIND THEM, which was the
  // whole condition; docs/plan-rebuild.md (P6) is where they come back, and restoring a row is one line here.
  //
  // Two of them met the condition on 2026-09-19 and are back, one line each: الزيارات الميدانية reads
  // public.visits (report v3 §25) and الحجوزات والعربون reads public.reservations (§23, §24). Both nest under
  // مطالب الاستثمار, because both are what happens NEXT to a demand — the same people, the same files, the
  // same CRM_READ_ROLES — and hanging them off العروض would file them under the land instead of the client.
  // المطابقة gets no row at all: §43's «best matching offers» is a section on a client's file, not a
  // destination, and a row leading to a screen that does not exist is the dead end the five were removed for.
  //
  // ELEVEN destinations. الموديولات · القوائم · صور الموقع left the sidebar on 2026-09-19:
  // they are not four sections, they are one room — the place where the owner changes what the site says and
  // what it offers — and /admin/settings now opens onto all four with a strip across its head. The routes are
  // unchanged, the breadcrumb still names each one (ADMIN_LABELS), and the الإعدادات row stays lit while you
  // are inside any of them.
  //
  // التسعير stays under العروض rather than moving to الإعدادات with the other rules: it is Finance's screen
  // (PRICE_ROLES), and الإعدادات is gated on ADMIN_ROLES — nesting it there would take the rate card away
  // from the only people who set it.
  //
  // What is left nests by what it belongs to: the analysis under the demand it analyses, the land intake and
  // the rate card under the offers they feed and price, the accounts and the log under the rules.
  const sections = [
    row("/admin", "dashboard"),
    row("/admin/leads", "requests", {
      roles: CRM_READ_ROLES,
      children: [
        row("/admin/analytics", "analytics", { roles: CRM_READ_ROLES }),
        // Both carry their module's state the way every other flagged row does, and both still open while it
        // is «معطّل»: the flag says what a VISITOR may do — ask for a visit from the site, hold trees online —
        // and the Back Office is where a module is prepared before it is published. Neither page invents
        // anything while it is off; each says which state it is in and which switch changes it.
        row("/admin/visits", "visits", { roles: CRM_READ_ROLES, flag: "visits" }),
        row("/admin/reservations", "reservations", { roles: CRM_READ_ROLES, flag: "reservations" }),
      ],
    }),
    row("/admin/projects", "offers", {
      flag: "projects",
      children: [
        // القطع is out of the nav for good: the owner's decision on 2026-09-18 is that the tree is the unit
        // and the lot layer goes — «remove the pieces thing, its simply selling the trees». Its route is
        // deleted; an offer's trees are a tab on the offer itself, which is one destination, not two.
        row("/admin/land-offers", "land", { roles: LAND_OFFER_ROLES, flag: "land_offers" }),
        row("/admin/pricing", "pricing", { roles: PRICE_ROLES, flag: "pricing" }),
      ],
    }),
    row("/admin/settings", "settings", {
      roles: ADMIN_ROLES,
      children: [
        // Records, not settings: who may sign in, and what everyone did. They keep their own rows.
        row("/admin/users", "users", { roles: ADMIN_ROLES }),
        row("/admin/audit", "audit", { roles: ADMIN_ROLES }),
      ],
    }),
  ].filter((item): item is NavItem => item !== null);

  return [{ items: sections }];
}

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff();
  const config = await getPublicConfig();
  const groups = navFor(session, config);
  const roles = session.roles.map((role) => ROLE_LABELS[role]).join("، ");

  return (
    /* translate="no" — the Back Office is never to be machine-translated.
       The owner opened /admin/visits on 2026-09-21 and got French: «طبّق» had become "plat" (طبق, a dish),
       «من تاريخ» had become "De l'histoire", «الحرفاء» — customers, in Tunisian — had become "Des artisans",
       and the offers' own names had been rewritten («عرض طريق المطار» → "Tournée aéroportuaire"). Nothing in
       this codebase is French; `<html lang="ar" dir="rtl">` is set and correct, and the browser was doing it.
       A staff screen that silently renames a client's offer and turns a button into a noun is worse than one
       in a language the reader has to work at, so translation is refused here. It is NOT refused on the
       public site: a visitor who wants the marketing pages in another language is making a fair choice, and
       this attribute is scoped to the panel so that choice survives. */
    <div translate="no" className="min-h-dvh bg-paper lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* The sidebar, on the brand's own dark green rather than on a scale of transparent paper. */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto bg-forest-700 px-3 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span className="rounded-lg bg-paper px-2 py-0.5">
            <Wordmark className="text-xl" />
          </span>
          <span className="text-[0.6875rem] font-semibold tracking-wide text-gold-bright" dir="ltr">
            Back Office
          </span>
        </div>
        <AdminNav groups={groups} className="flex-1" />
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* The page header: where you are, and who you are signed in as. */}
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="relative flex items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            {/* A <details>, but not a disclosure: it is the mobile nav. The summary is an icon button, and
                what opens is an absolutely-positioned panel over the page — a menu. `.disclosure` would give
                it a 3rem row of words and a marker it must not have, and its padding would fight this
                positioning, so the pattern deliberately stops at the door of this one. */}
            <details className="flex-none lg:hidden">
              <summary
                aria-label="أقسام الـBack Office"
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border border-line-strong text-forest [&::-webkit-details-marker]:hidden"
              >
                <MenuIcon />
              </summary>
              <div className="absolute inset-x-0 top-full z-40 max-h-[70dvh] overflow-y-auto bg-forest-700 px-3 py-4 shadow-[var(--shadow-float)]">
                <AdminNav groups={groups} />
              </div>
            </details>

            <span className="hidden sm:block lg:hidden">
              <Wordmark className="text-xl" />
            </span>

            <AdminBreadcrumbs className="hidden lg:block" />

            {/* «كلمة السر» used to be a group of its own in the sidebar; it is who you are, so it lives on
                the name. Visible at every width — it is the only way to reach it. */}
            <div className="ms-auto flex min-w-0 items-center gap-2">
              <Link
                href="/admin/account"
                className="min-w-0 rounded-lg px-2 py-1 text-end transition-colors hover:bg-paper"
                title={ADMIN_LABELS["/admin/account"]}
              >
                <span className="block truncate text-sm font-semibold text-ink">{session.fullName || session.email}</span>
                <span className="hidden truncate text-xs text-muted sm:block">{roles}</span>
              </Link>
              <form action={signOut} className="flex-none">
                <button type="submit" className="btn btn-secondary btn-sm">
                  خروج
                </button>
              </form>
            </div>
          </div>

          <div className="border-t border-line px-4 py-2 sm:px-6 lg:hidden">
            <AdminBreadcrumbs />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
