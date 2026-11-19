"use client";

// The doors, and the one place that decides which door is open.
//
// WHY THIS IS A CLIENT COMPONENT. «The door whose rows contain the current path» needs the pathname, and a
// server layout receives none: it renders once for every page beneath it. usePathname() is the only honest
// source, and it is client-side. So the layout resolves nothing; it hands this component every door the
// session holds, each with its already-gated rows rendered (an <AdminNav>, passed as a node), and this
// component picks the open one. Who may see a row, and whether its module is on, were settled on the server.
//
// 2026-11-19 (owner: «أسمح وأحلى وأسهل وأوضح … فتح شوية الألوان»): every door is on screen at once, each a
// link with its glyph, and the open one unfolds its rows underneath. No switcher to learn, no hidden job.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { NavIcon } from "./nav-icons";
import type { AdminIconKey } from "./nav-model";
import { resolveWorkspace, type WorkspaceKey } from "./workspaces";

export type WorkspacePanel = {
  key: WorkspaceKey;
  label: string;
  icon: AdminIconKey;
  /** Where the door leads: its landing if the reader may open it, else its first row they may. */
  href: string;
  /** The hrefs of the rows that survived their gates, for the pathname rule. */
  hrefs: readonly string[];
  /** That door's rows, rendered by the layout. */
  nav: ReactNode;
};

export function WorkspaceNav({ panels, cookie, className = "" }: { panels: readonly WorkspacePanel[]; cookie: string | null; className?: string }) {
  const pathname = usePathname() ?? "/admin";
  const active = resolveWorkspace(
    panels.map((panel) => ({ key: panel.key, rows: panel.hrefs })),
    { cookie, pathname },
  );

  return (
    <nav aria-label="أبواب الإدارة" className={`flex flex-col gap-1 ${className}`.trim()}>
      {panels.map((panel) => {
        const open = panel.key === active;
        return (
          <div key={panel.key}>
            <Link
              href={panel.href}
              aria-current={open ? "true" : undefined}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-[0.9375rem] font-semibold transition-colors ${
                open ? "bg-leaf-soft text-forest" : "text-ink/75 hover:bg-paper hover:text-forest"
              }`}
            >
              <span className={`grid size-8 flex-none place-items-center rounded-lg ${open ? "bg-surface text-forest" : "bg-paper text-forest/80"}`}>
                <NavIcon name={panel.icon} className="size-[1.125rem]" />
              </span>
              <span className="min-w-0 truncate">{panel.label}</span>
            </Link>
            {open && panel.hrefs.length > 1 ? <div className="mb-2 ms-6 mt-1 border-s border-line ps-2">{panel.nav}</div> : null}
          </div>
        );
      })}
    </nav>
  );
}
