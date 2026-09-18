"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages that carry their own bottom action: /start (its continue button keeps the visitor's choices, which a
// plain /register link would drop), the two forms (/register, /land) and parcel pages («أنا مهتم بهذه القطعة»).
// On a phone the bar lands exactly where those pages put their own button, and inside a form it invites the
// visitor to begin what they are already doing (owner, 2026-09-18: «there is double buttons»).
const OWN_ACTION = [/^\/start\/?$/, /^\/register\/?$/, /^\/land\/?$/, /^\/projects\/[^/]+\/[^/]+\/?$/];

/**
 * The site's main button (primaryCta: label and target from settings, report v3 §17), always within reach
 * on a phone. Hidden from large screens, where the header button is already visible while scrolling,
 * and when the label setting is empty.
 */
export function StickyCta({ label, href, note }: { label: string; href: string; note: string }) {
  const pathname = usePathname();
  if (!label || OWN_ACTION.some((pattern) => pattern.test(pathname))) return null;

  return (
    <>
      {/* Room for the bar, so it never covers the end of the footer. Sized with the bar, removed with it. */}
      {/* data-sticky-cta lets a page that already asked (the confirmation screen) hide the bar. */}
      <div aria-hidden="true" data-sticky-cta="" className="h-28 md:hidden" />
      <div data-sticky-cta="" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="pointer-events-auto border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <Link href={href} className="btn btn-primary min-h-13 w-full text-lg">
            {label}
          </Link>
          {note ? <p className="mt-1.5 text-center text-xs text-muted">{note}</p> : null}
        </div>
      </div>
    </>
  );
}
