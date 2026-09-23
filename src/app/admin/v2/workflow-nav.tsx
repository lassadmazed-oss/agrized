"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { signOut } from "../login/actions";

import { Popup } from "./popup";

/**
 * The two pieces of the bar that need the browser: which link is current, and who is signed in.
 *
 * WHAT CHANGED AND WHY (owner, 2026-09-23: «everything takes too much space, the steps are not useful»). The
 * bar carried the signed-in person as a two-line name-and-role block next to a 44px «خروج» button. Those two
 * things — a name that never changes and an action pressed once a day — were what set the height of a bar that
 * is drawn on all five screens. They are now behind one initial, and the bar is exactly one tap target tall.
 *
 * THE POPUP IS THE RIGHT HOME FOR THEM, not a compromise: it is the only place where the full name, every role
 * and the email fit without being cut to size, and it takes خروج out from a thumb-width of «الأقساط», which is
 * where it did not belong for an irreversible action.
 *
 * THE STRIP SCROLLS, SO IT HAS TO POINT AT ITSELF. Five Arabic words are wider than a phone, and wrapping them
 * to a second row would double the height of the bar on every screen — so the strip scrolls sideways instead,
 * and the current pill is pulled to the middle on arrival. Without that, a reader on الأقساط sees four links
 * and no sign of where they are, which is worse than a taller bar. `no-scrollbar` was a class name with no
 * rule behind it anywhere in the stylesheet, so the strip still showed a scrollbar on every desktop that draws
 * one; `rail-none` (globals.css) is the rule that exists, already used by the phone rows for exactly this, and
 * it also sets `-ms-overflow-style`. `Filters` in ui.tsx still carries the dead `no-scrollbar` — same defect,
 * a file this change is not allowed to touch.
 */

/** The spine, in the order the sale happens in. Nothing on it leaves v2. */
const LINKS = [
  { href: "/admin/v2", label: "اليوم" },
  { href: "/admin/v2/files", label: "الملفات" },
  { href: "/admin/v2/reservations", label: "الحجوزات" },
  { href: "/admin/v2/contracts", label: "العقود" },
  { href: "/admin/v2/installments", label: "الأقساط" },
] as const;

export function WorkflowNav() {
  const pathname = usePathname();
  const strip = useRef<HTMLElement>(null);

  // Only when it actually overflows, and only sideways: `block: "nearest"` keeps a page that is scrolled down
  // exactly where it is, since the pill is already visible in a bar that sticks.
  useEffect(() => {
    const nav = strip.current;
    if (!nav || nav.scrollWidth - nav.clientWidth < 2) return;
    nav.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <nav ref={strip} className="rail-none -mx-1 flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-1">
      {LINKS.map((link) => {
        const active = link.href === "/admin/v2" ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[0.8125rem] font-semibold transition-colors sm:text-sm ${
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

/**
 * The signed-in person, as one initial.
 *
 * The first name rides along above `sm`, where the bar has width to spare and «who am I logged in as» is a
 * real question in a back office several roles share a machine in. On a phone it is the circle alone: 28px,
 * inside the 44px tap target the popup's own button already is.
 *
 * THE CIRCLE IS DECORATION, SO IT IS NOT THE NAME OF THE BUTTON. Two letters read aloud are not a control:
 * on a phone, where the first name is `hidden`, «مس» would be everything a screen reader had to go on for
 * the one button that holds خروج. The `sr-only` word is the button's name at every width, and the initials
 * are `aria-hidden` because they only spell the name that follows them.
 *
 * `roles` arrives already translated — ROLE_LABELS lives in a server-only module.
 */
export function UserMenu({
  name,
  roles,
  email,
}: {
  name: string;
  roles: string[];
  email: string | null;
}) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.slice(0, 1)).join("") || "؟";

  // The wrapper is flex, not a bare block: the trigger is inline-flex, and a line box around it would hang a
  // descender's worth of empty space under a bar that is exactly as tall as the trigger.
  return (
    <div className="flex shrink-0 items-center">
      <Popup
        variant="ghost"
        title="الحساب"
        label={
          <>
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-leaf-soft text-[0.6875rem] font-bold text-forest"
            >
              {initials}
            </span>
            <span className="sr-only">الحساب</span>
            <span className="hidden max-w-[5.5rem] truncate text-xs font-semibold text-muted sm:block">
              {words[0] ?? name}
            </span>
          </>
        }
      >
        {() => (
          <div className="space-y-3">
            {/*
              One column on a phone, two only where two fit. The panel is 100vw up to 30rem, minus the 32px
              the popup pads with, so a half-column is ~132px on a 320px screen — narrower than most full
              names, and this popup exists to show the full name. The name wraps instead of being cut: it is
              the one fact the reader opened this for.
            */}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-[0.6875rem] leading-tight text-muted">الاسم</dt>
                <dd className="text-sm font-semibold leading-snug text-ink">{name}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[0.6875rem] leading-tight text-muted">
                  {roles.length > 1 ? "الصلاحيات" : "الصلاحية"}
                </dt>
                <dd className="text-sm font-semibold leading-snug text-ink">{roles.join(" · ")}</dd>
              </div>
              {email ? (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-[0.6875rem] leading-tight text-muted">الإيميل</dt>
                  <dd dir="ltr" className="break-all text-sm font-semibold leading-snug text-ink">
                    {email}
                  </dd>
                </div>
              ) : null}
            </dl>

            {/* No close(): the action redirects to the login screen, which takes the whole bar with it. */}
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary btn-sm w-full">
                خروج من الحساب
              </button>
            </form>
          </div>
        )}
      </Popup>
    </div>
  );
}
