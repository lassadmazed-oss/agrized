"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages that carry their own bottom action: /start (its continue button keeps the visitor's choices,
// which a plain /register link would drop) and parcel pages («أنا مهتم بهذه القطعة»).
const OWN_ACTION = [/^\/start\/?$/, /^\/projects\/[^/]+\/[^/]+\/?$/];

/**
 * The register button, always within reach on a phone.
 * Hidden from large screens, where the header button is already visible while scrolling.
 */
export function StickyCta({ note }: { note: string }) {
  const pathname = usePathname();
  if (OWN_ACTION.some((pattern) => pattern.test(pathname))) return null;

  return (
    <>
      {/* Room for the bar, so it never covers the end of the footer. Sized with the bar, removed with it. */}
      <div aria-hidden="true" className="h-28 md:hidden" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="pointer-events-auto border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <Link href="/register" className="btn btn-primary min-h-13 w-full text-lg">
            سجّل مطلبك
          </Link>
          {note ? <p className="mt-1.5 text-center text-xs text-muted">{note}</p> : null}
        </div>
      </div>
    </>
  );
}
