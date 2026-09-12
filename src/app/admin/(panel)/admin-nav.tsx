"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };
export type NavGroup = { title?: string; items: NavItem[] };

export function AdminNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label="قائمة الـBack Office" className="space-y-6">
      {groups.map((group, index) => (
        <div key={group.title ?? index}>
          {group.title ? <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-paper/50">{group.title}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-[0.95rem] transition-colors ${
                      active ? "bg-paper/12 font-semibold text-paper" : "text-paper/75 hover:bg-paper/8 hover:text-paper"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
