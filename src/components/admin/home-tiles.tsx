import Link from "next/link";

import { formatCount } from "@/lib/format";

import { NavIcon } from "./nav-icons";
import type { AdminIconKey, NavItem } from "./nav-model";

/*
 * «وين تحب تمشي؟» — the doors on the home page (2026-11-19, owner: «أسمح وأحلى وأسهل وأوضح»). The same doors as
 * the sidebar, built from the same gated rows, so a door is here exactly when it is there: one card per door,
 * its glyph and its name opening the door, its pages listed inside as plain links, each with how many things
 * wait there when there is an honest answer. «اليوم» itself is not a card — it is the page you are on.
 */
export function HomeTiles({
  groups,
  waiting = {},
}: {
  groups: { key: string; label: string; icon?: AdminIconKey; items: NavItem[] }[];
  /** href → how many things are waiting there. A page with no answer is simply absent. */
  waiting?: Partial<Record<string, number>>;
}) {
  const doors = groups.filter((group) => group.key !== "today" && group.items.length > 0);
  if (doors.length === 0) return null;

  return (
    <nav aria-label="أبواب الإدارة" className="space-y-3">
      <h2 className="text-lg font-bold text-forest">وين تحب تمشي؟</h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {doors.map((door) => {
          const total = door.items.reduce((sum, item) => sum + (waiting[item.href] ?? 0), 0);
          return (
            <li key={door.key} className="rounded-2xl border border-line bg-surface p-4">
              <Link href={door.items[0].href} className="flex items-center gap-3 text-forest">
                <span className="grid size-10 flex-none place-items-center rounded-xl bg-leaf-soft">
                  <NavIcon name={door.icon ?? door.items[0].icon} className="size-5" />
                </span>
                <span className="text-lg font-bold">{door.label}</span>
                {total > 0 ? (
                  <span className="ms-auto rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-bold tabular-nums text-forest">
                    {formatCount(total)} يستنّاو
                  </span>
                ) : null}
              </Link>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {door.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm transition-colors hover:border-forest hover:text-forest ${
                        item.off ? "text-muted" : "text-ink"
                      }`}
                    >
                      {item.label}
                      {(waiting[item.href] ?? 0) > 0 ? (
                        <span className="rounded-full bg-gold px-1.5 text-[0.6875rem] font-bold leading-5 tabular-nums text-forest-700">
                          {formatCount(waiting[item.href] ?? 0)}
                        </span>
                      ) : null}
                      {item.badge ? <span className="text-[0.6875rem] text-muted">· {item.badge}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
