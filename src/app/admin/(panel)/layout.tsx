import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { MenuIcon } from "@/components/admin/nav-icons";
import { ADMIN_LABELS, NAV_STATE_LABELS, type AdminIconKey, type NavItem } from "@/components/admin/nav-model";
import { WorkspaceNav, type WorkspacePanel } from "@/components/admin/workspace-switcher";
import { heldWorkspaces, WORKSPACE_COOKIE, type WorkspaceRow } from "@/components/admin/workspaces";
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
import { AGRI_ROLES } from "./agri/agri-model";
import { CALL_DESK_ROLES } from "./desk/desks";
import { LEGAL_DESK_ROLES } from "./desk/legal/roles";
import { chooseWorkspace } from "./workspace-actions";

export const metadata: Metadata = {
  title: { default: "Back Office", template: "%s · Back Office AgriZed" },
  robots: { index: false, follow: false },
};

type RowRule = {
  icon: AdminIconKey;
  /** The role gate, unchanged from the one this section always had. */
  roles?: readonly StaffRole[];
  /** The key in feature_flags. A section with no module of its own passes none. */
  flag?: string;
};

/**
 * What decides a row, one rule per destination. WHICH workspace a row belongs to, and in what order, is
 * structure and lives in src/components/admin/workspaces.ts; WHETHER this session sees it is decided here,
 * where the session and the flags are. The table is keyed on every workspace row, so a row added over there
 * without a rule here fails the build instead of silently drawing ungated.
 *
 * Two things decide a row. The role gate is the one the section always had — CRM_READ_ROLES on the demand
 * side, LAND_OFFER_ROLES on the landowner intake, PRICE_ROLES on pricing, ADMIN_ROLES on administration,
 * CALL_DESK_ROLES · LEGAL_DESK_ROLES · AGRI_ROLES on the desks and the grove — and nothing here widens or
 * narrows one. Each row carries the gate ITS OWN routes apply, so the sidebar and the page can never disagree
 * about who may enter. A workspace only says whose JOB a row is; a row a reader may not open is not drawn even
 * inside a workspace they hold (a commercial holds المبيعات and does not see /admin/pricing there — it is
 * not there to see).
 *
 * The module flag: each row carries its module's state — «معطّل», «داخلي» — and is drawn quiet when it is
 * off, so a row never looks more live than its module is. A row that is off STILL OPENS. The flag says what
 * visitors see; it is not an access rule for the staff, and the Back Office is precisely where a module is
 * prepared before it is published — gating the link on it would lock Finance out of the instalments and
 * contracts modules while they are still «معطّل» and being set up. What a switched-off row must never do is lead to an invented screen, and none of them do: every
 * flagged page here says which state its module is in and which switch changes it, and the two whose tables
 * were once a draft (العقود · الأقساط) answer a missing function as its own case, naming the file. That is the
 * one condition under which a row is honest — it leads somewhere that tells the truth — and it is the
 * condition the five rows removed on 2026-09-18 had failed («a row that leads nowhere costs a reader more
 * than it tells them»). The four rows the workspaces add — زيتونتي · العمليات الفلاحية · الصابة والجني ·
 * الاشتراكات — meet it: each has its tables (0067, 0068 and their neighbours) and a screen that reads them,
 * and each carries the flag its own page reads. The desks carry no flag: they are how the team works, not a
 * module the owner publishes, and there is no visitor-facing door to open or close.
 *
 * Nothing nests any more. The old sidebar nested rows by what they belonged to (the analysis under the demand,
 * the rate card under the offers it prices) because it had to hold four jobs at once; a workspace holds one,
 * and inside one job a flat list in reading order is the whole hierarchy. Two of the old decisions survive
 * that flattening in a new shape. التسعير is in المالية and not in الإدارة with the other rules, because it
 * is Finance's screen (PRICE_ROLES) and الإدارة is Admin's — nesting it there would take the rate card away
 * from the only people who set it. الموديولات · القوائم · صور الموقع, folded into the strip on /admin/settings
 * on 2026-09-19 because three of eleven rows for one room was too many, are rows again inside الإدارة, where
 * they are three of seven and are the admin's actual work; the strip stays, and both roads lead to the same
 * screens. القطع is out for good — the tree is the unit (owner, 2026-09-18), an offer's trees are a tab on the
 * offer — and المطابقة has no row, because it is a section on a client's file and not a destination.
 */
const ROW_RULES: Record<WorkspaceRow, RowRule> = {
  "/admin": { icon: "dashboard" },
  "/admin/desk/calls": { icon: "requests", roles: CALL_DESK_ROLES },
  "/admin/desk/field": { icon: "visits", roles: CRM_READ_ROLES },
  "/admin/leads": { icon: "requests", roles: CRM_READ_ROLES },
  "/admin/persons": { icon: "users", roles: CRM_READ_ROLES, flag: "zitounti" },
  "/admin/visits": { icon: "visits", roles: CRM_READ_ROLES, flag: "visits" },
  "/admin/reservations": { icon: "reservations", roles: CRM_READ_ROLES, flag: "reservations" },
  "/admin/analytics": { icon: "analytics", roles: CRM_READ_ROLES },
  // The other session's sale flow: its own layout gates it on requireStaff() alone, so the row does too.
  "/admin/v2": { icon: "offers" },
  "/admin/projects": { icon: "offers", flag: "projects" },
  "/admin/agri": { icon: "services", roles: AGRI_ROLES, flag: "agri_backoffice" },
  // The bars are the season's kilos. nav-icons.tsx has no glyph for a harvest, and that file is not this
  // change's to grow.
  "/admin/harvest": { icon: "analytics", flag: "harvest" },
  "/admin/land-offers": { icon: "land", roles: LAND_OFFER_ROLES, flag: "land_offers" },
  "/admin/installments": { icon: "payments", roles: PRICE_ROLES, flag: "installments" },
  "/admin/contracts": { icon: "contracts", roles: CRM_READ_ROLES, flag: "contracts" },
  "/admin/pricing": { icon: "pricing", roles: PRICE_ROLES, flag: "pricing" },
  "/admin/subscriptions": { icon: "services", roles: CRM_READ_ROLES, flag: "subscriptions" },
  "/admin/desk/legal": { icon: "contracts", roles: LEGAL_DESK_ROLES },
  "/admin/desk/legal/partners": { icon: "users", roles: LEGAL_DESK_ROLES },
  "/admin/desk/legal/checklist": { icon: "lists", roles: LEGAL_DESK_ROLES },
  "/admin/settings": { icon: "settings", roles: ADMIN_ROLES },
  "/admin/settings/modules": { icon: "modules", roles: ADMIN_ROLES },
  "/admin/settings/lists": { icon: "lists", roles: ADMIN_ROLES },
  "/admin/settings/media": { icon: "media", roles: ADMIN_ROLES },
  "/admin/settings/translations": { icon: "translations", roles: ADMIN_ROLES },
  "/admin/settings/languages": { icon: "languages", roles: ADMIN_ROLES },
  // Records, not settings: who may sign in, and what everyone did. They keep their own rows.
  "/admin/users": { icon: "users", roles: ADMIN_ROLES },
  "/admin/audit": { icon: "audit", roles: ADMIN_ROLES },
};

/**
 * The sidebars, one per workspace this session holds, each built for this session: a row the reader may not
 * open is not drawn, and a row whose module is off is drawn quiet. Which of them is on screen is decided by
 * the switcher (src/components/admin/workspace-switcher.tsx), because that decision needs the pathname and
 * a layout is never told one.
 */
function panelsFor(session: StaffSession, config: PublicConfig): WorkspacePanel[] {
  const row = (href: WorkspaceRow): NavItem | null => {
    const { icon, roles, flag } = ROW_RULES[href];
    if (roles && !hasRole(session, roles)) return null;

    const state = flag ? flagState(config, flag) : "public";
    const badge = state === "disabled" ? NAV_STATE_LABELS.off : state === "internal" ? NAV_STATE_LABELS.internal : undefined;

    return { href, label: ADMIN_LABELS[href], icon, badge, off: state === "disabled" };
  };

  return heldWorkspaces(session.roles).map((workspace) => {
    const hrefs: readonly WorkspaceRow[] = workspace.rows;
    const items = hrefs.map(row).filter((item): item is NavItem => item !== null);
    return {
      key: workspace.key,
      label: workspace.label,
      hrefs: items.map((item) => item.href),
      nav: <AdminNav groups={[{ items }]} />,
    };
  });
}

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff();
  const config = await getPublicConfig();
  const panels = panelsFor(session, config);
  // Read here, written only by chooseWorkspace: a rendering component cannot set a cookie, and this one must
  // not want to — the layout draws the choice, it does not make it.
  const workspaceCookie = (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null;
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
        {/* The switcher sits under the wordmark, then the active workspace's rows. One job on screen at a time. */}
        <WorkspaceNav panels={panels} cookie={workspaceCookie} action={chooseWorkspace} className="flex-1" />
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
                {/* The same switcher, at the top of the phone menu. */}
                <WorkspaceNav panels={panels} cookie={workspaceCookie} action={chooseWorkspace} />
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
