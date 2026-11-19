"use client";

// The doors, and the one place that decides which door is open.
//
// WHY THIS IS A CLIENT COMPONENT. «The door whose rows contain the current path» needs the pathname, and a
// server layout receives none. So the layout resolves nothing; it hands these components every door the session
// holds, each with its already-gated rows, and they pick the open one.
//
// 2026-11-19, second pass (owner: «الادمين نتاع مازيت … تطبع عليه»): the console's rail. A flat list of doors,
// 13px, the open one in ink with a hairline bar on its starting edge — and the open door's pages are no longer
// unfolded under it: they are the tabs across the top of the page (DoorTabs), as on Mazed's console.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "./nav-icons";
import type { AdminIconKey, NavItem } from "./nav-model";
import { resolveWorkspace, type WorkspaceKey } from "./workspaces";

export type WorkspacePanel = {
  key: WorkspaceKey;
  label: string;
  icon: AdminIconKey;
  /** Where the door leads: its landing if the reader may open it, else its first row they may. */
  href: string;
  /** The hrefs of the rows that survived their gates, for the pathname rule. */
  hrefs: readonly string[];
  /** Those rows, for the tabs. */
  items: NavItem[];
};

function useOpenDoor(panels: readonly WorkspacePanel[], cookie: string | null) {
  const pathname = usePathname() ?? "/admin";
  const key = resolveWorkspace(
    panels.map((panel) => ({ key: panel.key, rows: panel.hrefs })),
    { cookie, pathname },
  );
  return { pathname, door: panels.find((panel) => panel.key === key) ?? null };
}

/** The rail's list of doors. */
export function WorkspaceNav({ panels, cookie, className = "" }: { panels: readonly WorkspacePanel[]; cookie: string | null; className?: string }) {
  const { door } = useOpenDoor(panels, cookie);

  return (
    <nav aria-label="أبواب الإدارة" className={className}>
      <ul>
        {panels.map((panel) => {
          const open = panel.key === door?.key;
          return (
            <li key={panel.key}>
              <Link
                href={panel.href}
                aria-current={open ? "page" : undefined}
                className={`relative flex items-center gap-2.5 py-[7px] pe-3 ps-4 text-[13px] font-medium transition-colors ${
                  open
                    ? "text-ink before:absolute before:inset-y-0 before:start-0 before:w-[2px] before:bg-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                <NavIcon name={panel.icon} className="size-4 shrink-0" />
                <span className="truncate">{panel.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Across the top of the page: the open door's name, small and spaced, and its pages as tabs — the current one in
 * ink, underlined. A door of one page («اليوم») draws nothing: the page says what it is.
 */
export function DoorTabs({ panels, cookie }: { panels: readonly WorkspacePanel[]; cookie: string | null }) {
  const { pathname, door } = useOpenDoor(panels, cookie);
  if (!door || door.items.length < 2) return null;

  const covers = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  const current = door.items.filter((item) => covers(item.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="border-b border-line bg-surface px-5 pt-5 lg:px-8">
      <p className="text-[11px] font-bold tracking-wide text-muted">{door.label}</p>
      <nav aria-label={door.label} className="-mb-px mt-2 flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {door.items.map((item) => {
          const active = item.href === current;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 py-2.5 text-[13px] transition-colors ${
                active ? "border-ink font-semibold text-ink" : "border-transparent font-medium text-muted hover:text-ink"
              }`}
            >
              {item.label}
              {item.badge ? <span className="ms-1.5 text-[11px] font-normal text-muted">{item.badge}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
