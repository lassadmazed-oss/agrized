import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { MenuIcon } from "@/components/admin/nav-icons";
import { ADMIN_LABELS } from "@/components/admin/nav-model";
import { WorkspaceNav, type WorkspacePanel } from "@/components/admin/workspace-switcher";
import { WORKSPACE_COOKIE } from "@/components/admin/workspaces";
import { Wordmark } from "@/components/brand/wordmark";
import { requireStaff, ROLE_LABELS, type StaffSession } from "@/lib/auth";
import { getPublicConfig, type PublicConfig } from "@/lib/config";

import { signOut } from "../login/actions";

import { AdminNav } from "./admin-nav";
import { workspaceRows } from "./panel-rows";
import { chooseWorkspace } from "./workspace-actions";

export const metadata: Metadata = {
  title: { default: "Back Office", template: "%s · Back Office AgriZed" },
  robots: { index: false, follow: false },
};

/**
 * The sidebars, one per workspace this session holds, each built for this session. The rules themselves live
 * in ./panel-rows.ts now that صفحة البداية draws the same sections as squares; this is only the wrapping.
 */
function panelsFor(session: StaffSession, config: PublicConfig): WorkspacePanel[] {
  return workspaceRows(session, config).map((group) => ({
    key: group.key as WorkspacePanel["key"],
    label: group.label,
    hrefs: group.items.map((item) => item.href),
    nav: <AdminNav groups={[{ items: group.items }]} />,
  }));
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
