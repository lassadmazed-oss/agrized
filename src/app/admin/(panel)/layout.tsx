import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminLanguageSwitch } from "@/components/admin/admin-language-switch";
import { MenuIcon } from "@/components/admin/nav-icons";
import { ADMIN_LABELS } from "@/components/admin/nav-model";
import { DoorTabs, WorkspaceNav, type WorkspacePanel } from "@/components/admin/workspace-switcher";
import { WORKSPACE_COOKIE, WORKSPACES } from "@/components/admin/workspaces";
import { Wordmark } from "@/components/brand/wordmark";
import { ADMIN_LANG_COOKIE, parseAdminLang, type AdminLang } from "@/lib/admin-lang";
import { requireStaff, ROLE_LABELS, type StaffSession } from "@/lib/auth";
import { getPublicConfig, type PublicConfig } from "@/lib/config";

import { signOut } from "../login/actions";

import { workspaceRows } from "./panel-rows";

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
    icon: group.icon,
    // The door's own landing when this reader may open it, else the first of its rows they may.
    href: group.items.find((item) => item.href === WORKSPACES.find((door) => door.key === group.key)?.landing)?.href ?? group.items[0]?.href ?? "/admin",
    hrefs: group.items.map((item) => item.href),
    items: group.items,
  })).filter((panel) => panel.hrefs.length > 0);
}

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireStaff();
  // 0177: a worker or a supervisor has his own phone screen and nothing in the Back Office.
  if (session.roles.every((role) => role === "worker" || role === "supervisor")) redirect("/admin/terrain/tasks");
  const config = await getPublicConfig();
  const panels = panelsFor(session, config);
  // The old workspace switcher's cookie: since 2026-11-19 the page you stand on decides the open door, and the
  // cookie only breaks a tie for a path no door claims. Nothing writes it any more; it fades with the browser.
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get(WORKSPACE_COOKIE)?.value ?? null;
  const lang = parseAdminLang(cookieStore.get(ADMIN_LANG_COOKIE)?.value);
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
    <div translate="no" className="console min-h-dvh bg-surface lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
      {/* The rail, as on Mazed's console (owner 2026-11-19): the mark, the doors, and who you are at the foot. */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-line bg-surface lg:flex">
        <header className="flex h-16 shrink-0 items-center border-b border-line px-4">
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
            <Wordmark className="text-xl" />
            <span className="truncate text-[11px] font-bold tracking-wide text-ink">الإدارة</span>
          </Link>
        </header>
        <WorkspaceNav panels={panels} cookie={workspaceCookie} className="min-h-0 flex-1 overflow-y-auto py-3" />
        <RailFoot name={session.fullName || session.email || ""} roles={roles} lang={lang} />
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Below lg: a bar with the mark and a menu that opens the same rail over the page. */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <details className="relative flex-none">
            <summary
              aria-label="أبواب الإدارة"
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-line text-ink [&::-webkit-details-marker]:hidden"
            >
              <MenuIcon />
            </summary>
            <div className="fixed inset-x-0 top-14 z-40 max-h-[80dvh] overflow-y-auto border-b border-line bg-surface py-2 shadow-[var(--shadow-float)]">
              <WorkspaceNav panels={panels} cookie={workspaceCookie} />
              <RailFoot name={session.fullName || session.email || ""} roles={roles} lang={lang} />
            </div>
          </details>
          <Link href="/admin" className="flex items-center gap-2">
            <Wordmark className="text-lg" />
            <span className="text-[11px] font-bold tracking-wide text-ink">الإدارة</span>
          </Link>
        </header>

        {/* The open door's name and its pages as tabs, across the top of every page behind it. */}
        <DoorTabs panels={panels} cookie={workspaceCookie} />

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}

/** The foot of the rail: who is signed in (their password page), the language, the public site, and leaving. */
function RailFoot({ name, roles, lang }: { name: string; roles: string; lang: AdminLang }) {
  return (
    <footer className="shrink-0 border-t border-line py-2">
      <Link href="/admin/account" title={ADMIN_LABELS["/admin/account"]} className="block px-4 py-[7px] transition-colors hover:bg-paper">
        <span className="block truncate text-[13px] font-semibold text-ink">{name}</span>
        <span className="block truncate text-[11px] text-muted">{roles}</span>
      </Link>
      <AdminLanguageSwitch
        current={lang}
        className="flex w-full items-center gap-2 px-4 py-[7px] text-start text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
      />
      <Link href="/" className="flex items-center gap-2 px-4 py-[7px] text-[12.5px] font-medium text-muted transition-colors hover:text-ink">
        <span aria-hidden="true">↗</span>
        <span data-fr="Site">الموقع</span>
      </Link>
      <form action={signOut}>
        <button type="submit" className="flex w-full items-center gap-2 px-4 py-[7px] text-start text-[12.5px] font-medium text-muted transition-colors hover:text-ink">
          <span aria-hidden="true">⎋</span>
          خروج
        </button>
      </form>
    </footer>
  );
}
