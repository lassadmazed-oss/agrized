"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The bottom bar on a phone (owner, 2026-09-21, from two AgriZed app mock-ups — the home screen and the offers
 * list). It replaces StickyCta: a fixed call to action and a tab bar cannot both own the bottom of a phone
 * screen, and of the two, the one that says where you are and where else you can go is worth more than the one
 * that repeats a button already on the page.
 *
 * WHICH TABS EXIST, AND WHY THIS IS NOT THE MOCK-UP'S LIST. The mock-ups disagree with each other — one draws
 * five tabs (حسابي · المشاريع · محاكاة · محتوانا · الرئيسية), another four — and «محتوانا» is not a route at
 * all. A tab that opens nothing is worse than a tab that is missing: the reader taps it, and learns the app is
 * a picture of an app. So the bar carries only what resolves.
 *
 * WHICH ONES THOSE ARE IS NOT DECIDED HERE. This component draws the tabs it is handed; the layout decides,
 * because it is the thing that already knows the flags. Read ../../app/(public)/layout.tsx for the rule: a tab
 * exists while its module does. «أرضك» appears with the landowner intake, «حسابي» with زيتونتي — that screen
 * was built on 2026-09-21 and is real, but no buyer can sign in yet, so today its tab reaches a staff member
 * previewing the module and nobody else.
 */

export type Tab = {
  href: string;
  label: string;
  icon: "home" | "offers" | "calculator" | "land" | "account";
};

const ICONS: Record<Tab["icon"], React.ReactNode> = {
  home: <path d="M12 3 3 10.2V21h6v-6h6v6h6V10.2L12 3Z" />,
  /* «حسابي». It is built but it is not automatically in the bar: the layout adds it only while the زيتونتي
     module is open, which is the same rule as every other tab here — a tab exists when its module does. */
  account: <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.7-9 6v2h18v-2c0-3.3-4-6-9-6Z" />,
  offers: <path d="M4 20V10h4v10H4Zm6 0V4h4v16h-4Zm6 0v-7h4v7h-4Z" />,
  calculator: (
    <path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm1 3v3h10V5H7Zm0 6v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2ZM7 15v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v4h2v-4h-2ZM7 19v-2h2v2H7Zm4 0v-2h2v2h-2Z" />
  ),
  land: <path d="M3 19 8 8l4.5 7L15 11l6 8H3Zm4-11.5A2.25 2.25 0 1 0 7 3a2.25 2.25 0 0 0 0 4.5Z" />,
};

/** A tab owns the page it points at and everything under it, so /projects/OFF-X keeps «عروضنا» lit. */
function isCurrent(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar({ tabs }: { tabs: readonly Tab[] }) {
  const pathname = usePathname();
  if (tabs.length === 0) return null;

  return (
    <>
      {/* Room for the bar, so it never covers the end of the footer. Sized with it, and it keeps the
          data-sticky-cta hook the confirmation screens already use to hide the bottom furniture. */}
      <div aria-hidden="true" data-sticky-cta="" className="h-20 md:hidden" />

      <nav
        aria-label="التنقّل"
        data-sticky-cta=""
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {tabs.map((tab) => {
            const current = isCurrent(pathname, tab.href);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                    current ? "text-forest" : "text-muted"
                  }`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className={`size-6 ${current ? "fill-forest" : "fill-muted"}`}>
                    {ICONS[tab.icon]}
                  </svg>
                  <span className={`text-[0.6875rem] leading-none ${current ? "font-bold" : "font-medium"}`}>{tab.label}</span>
                  {/* The lit tab carries a mark of its own, so the bar still reads for someone who cannot tell
                      the two greens apart. */}
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 h-0.5 w-6 rounded-full ${current ? "bg-gold-bright" : "bg-transparent"}`}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
