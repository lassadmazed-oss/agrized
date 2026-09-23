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
 *
 * THE BAR IS FLAT (owner, 2026-09-22). The simulator used to be drawn as a tile lifted above the bar. With
 * every module open that is a five-tab bar with a centred action; with the modules that are actually open it
 * is a three-tab bar whose middle tab floats for no reason anyone can see, overlapping the page above it. A
 * bar whose shape depends on how many flags happen to be on is a bar that looks broken half the time, so
 * every tab is drawn the same way and the current one is marked by ground, not by height.
 */

export type Tab = {
  href: string;
  label: string;
  icon: "home" | "offers" | "calculator" | "land" | "account";
};

/** Stroke icons, drawn on the 24px grid the rest of the app uses. */
const ICONS: Record<Tab["icon"], React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V21h14V9.8" />
    </>
  ),
  offers: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </>
  ),
  calculator: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="3" />
      <path d="M8 6h8" />
      <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3" />
    </>
  ),
  land: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="2.8" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
};

function Icon({ name, className }: { name: Tab["icon"]; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONS[name]}
    </svg>
  );
}

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
      <div aria-hidden="true" data-sticky-cta="" className="h-[var(--tabbar-h)] md:hidden" />

      <nav
        aria-label="التنقّل"
        data-sticky-cta=""
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-6px_18px_-12px_rgb(27_42_31_/_0.35)] md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {tabs.map((tab) => {
            const current = isCurrent(pathname, tab.href);

            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={`mx-1 flex min-h-15 flex-col items-center justify-center gap-1.5 rounded-2xl transition-colors ${
                    current ? "bg-leaf-soft text-forest" : "text-muted"
                  }`}
                >
                  <Icon name={tab.icon} className="size-6" />
                  <span className={`text-[0.75rem] leading-none ${current ? "font-bold" : "font-medium"}`}>
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
