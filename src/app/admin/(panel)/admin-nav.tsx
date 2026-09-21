"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "@/components/admin/nav-icons";
import type { NavGroup, NavItem } from "@/components/admin/nav-model";

/**
 * The sidebar. Everything it decides is decided here — which row is the current page, which row is the
 * branch that leads to it — because that is all a pathname can tell you. Who may see a row and whether
 * its module is switched on were settled on the server, in layout.tsx.
 *
 * Colour comes from the brand tokens (forest-700 ground, forest-600 raised, leaf-soft text, gold-bright
 * accent), not from an opacity scale invented on top of paper: `text-paper/60` was a colour nothing else
 * in the app could name.
 */

const ROW = "flex items-center gap-2.5 rounded-lg border-s-[3px] py-2 pe-2 ps-2 text-sm transition-colors";
const CHILD_ROW = "flex items-center gap-2 rounded-md py-1.5 pe-2 ps-2 text-[0.8125rem] transition-colors";
const BADGE = "pill ms-auto flex-none bg-forest text-gold-bright";
/* Not on the current row: it already sits on forest-600, and hovering it would push it back down. */
const HOVER = "hover:bg-forest hover:text-paper";

export function AdminNav({ groups, className = "" }: { groups: NavGroup[]; className?: string }) {
  const pathname = usePathname() ?? "/admin";

  /*
   * One row is current, never two. A row owns its subtree, so several rows can cover the same path —
   * /admin/settings/lists is inside /admin/settings, /admin/settings/modules too — and the longest of them
   * is the one you are actually on. /admin is the dashboard itself and matches nothing below it.
   */
  const covers = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  let best = "";
  for (const group of groups) {
    for (const item of group.items) {
      for (const candidate of [item, ...(item.children ?? [])]) {
        if (covers(candidate.href) && candidate.href.length > best.length) best = candidate.href;
      }
    }
  }
  const matches = (href: string) => href === best;

  return (
    <nav aria-label="أقسام الـBack Office" className={`space-y-5 ${className}`.trim()}>
      {groups.map((group, index) => (
        <div key={group.title ?? index}>
          {group.title ? <p className="mb-1.5 px-2 text-[0.6875rem] font-semibold tracking-wide text-gold-bright">{group.title}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const childCurrent = (item.children ?? []).some((child) => matches(child.href));
              const current = matches(item.href);
              const onBranch = current || childCurrent;

              return (
                <li key={item.href}>
                  <Row item={item} current={current} onBranch={onBranch} />

                  {item.children?.length ? (
                    <ul className="mt-0.5 ms-4 space-y-0.5 border-s border-forest-600 ps-2">
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <ChildRow item={child} current={matches(child.href)} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/*
 * A switched-off row is dimmed on its icon, not on its label: the label stays at full contrast against
 * the dark ground and the state is carried by a word — «معطّل» — rather than by a colour nobody can
 * read. That is also why there is no opacity scale here at all.
 */
function Row({ item, current, onBranch }: { item: NavItem; current: boolean; onBranch: boolean }) {
  const tone = current
    ? "border-gold-bright bg-forest-600 font-semibold text-paper"
    : onBranch
      ? "border-transparent font-semibold text-paper"
      : "border-transparent text-leaf-soft";

  return (
    <Link href={item.href} aria-current={current ? "page" : undefined} className={`${ROW} ${tone} ${current ? "" : HOVER}`.trim()}>
      <NavIcon name={item.icon} className={item.off ? "size-5 text-leaf" : "size-5"} />
      <span className="min-w-0 truncate">{item.label}</span>
      {item.badge ? <span className={BADGE}>{item.badge}</span> : null}
    </Link>
  );
}

function ChildRow({ item, current }: { item: NavItem; current: boolean }) {
  const tone = current ? "bg-forest-600 font-semibold text-paper" : "text-leaf-soft";

  return (
    <Link href={item.href} aria-current={current ? "page" : undefined} className={`${CHILD_ROW} ${tone} ${current ? "" : HOVER}`.trim()}>
      <NavIcon name={item.icon} className={item.off ? "size-4 text-leaf" : "size-4"} />
      <span className="min-w-0 truncate">{item.label}</span>
      {item.badge ? <span className={BADGE}>{item.badge}</span> : null}
    </Link>
  );
}
