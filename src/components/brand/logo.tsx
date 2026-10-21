import Image from "next/image";

/**
 * The AgriZed logo, from the owner's artwork (2026-10-21).
 *
 * The drawing he sent is one wide lockup: a stylised olive tree on the left — brown trunk, green leaves — and
 * to its right the name over two French tagline lines. It is cut into two assets rather than used whole,
 * because the header gives a logo about 40px of height: at that size the name beside the tree would be nine
 * pixels tall and the taglines would be a smudge. So the tree carries the small placements, and the name
 * beside it stays live text (Wordmark), which is sharp at every size and already the same two brand colours.
 *
 * THE DRAWING'S OWN GROUND IS KEYED OUT in both files. The artwork arrived opaque on #FDFDFE — a cool white
 * that would have read as a pale rectangle behind the mark on the site's cream paper (#F7F5EE), which is the
 * one thing a header logo must never do. Keying is safe here where it was not for the 2026-10-03 drawing:
 * this one is a flat render, so the alpha ramp lands inside the anti-aliased edge and leaves no fringe.
 * Anything that needs an opaque square — every app icon, the share card — states its own background;
 * scripts/brand-icons.mjs draws all of them from the emblem.
 */

/** The tree alone. Decorative: the name sits beside it as text, so this carries no alt text. */
export function LogoMark({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/agrized-emblem.webp"
      alt=""
      width={512}
      height={500}
      priority
      className={className}
    />
  );
}

/** Tree and name together, without the French tagline lines. For a screen with room to print it. */
export function LogoLockup({ className = "h-auto w-64" }: { className?: string }) {
  return <Image src="/brand/agrized-logo.webp" alt="AgriZed" width={1000} height={274} priority className={className} />;
}
