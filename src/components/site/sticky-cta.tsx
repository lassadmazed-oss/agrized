import Link from "next/link";

/**
 * The register button, always within reach on a phone.
 * Hidden from large screens, where the header button is already visible while scrolling.
 */
export function StickyCta({ note }: { note: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="pointer-events-auto border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <Link href="/register" className="btn btn-primary min-h-13 w-full text-lg">
          سجّل مطلبك
        </Link>
        {note ? <p className="mt-1.5 text-center text-xs text-muted">{note}</p> : null}
      </div>
    </div>
  );
}
