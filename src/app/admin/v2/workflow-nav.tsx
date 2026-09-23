"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The spine, in the order the sale happens.
 *
 * All five are v2 now. The spine is the order the sale happens in, and nothing on it leaves v2.
 */
const LINKS = [
  { href: "/admin/v2", label: "اليوم" },
  { href: "/admin/v2/files", label: "الملفات" },
  { href: "/admin/v2/reservations", label: "الحجوزات" },
  { href: "/admin/v2/contracts", label: "العقود" },
  { href: "/admin/v2/installments", label: "الأقساط" },
] as const;

export function WorkflowNav() {
  const pathname = usePathname();

  return (
    <nav className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
      {LINKS.map((link) => {
        const active = link.href === "/admin/v2" ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              active ? "bg-leaf-soft text-forest" : "text-muted hover:bg-paper hover:text-forest"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
