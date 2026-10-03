import Image from "next/image";

/**
 * The AgriZed logo, from the owner's artwork (2026-10-03).
 *
 * The drawing he sent is one square lockup: a circular emblem — olive branch, the A, a grove under a sun —
 * above the name, above two French tagline lines. It is cut into two assets rather than used whole, because
 * the header gives a logo about 40px of height: at that size the name inside the square would be eight pixels
 * tall and the taglines would be unreadable. So the emblem carries the small placements, and the name beside
 * it stays live text (Wordmark), which is sharp at every size and already the same two brand colours.
 *
 * Both files keep the artwork's own cream ground (#FCF9F2) — the original has no alpha channel, and keying it
 * out would leave a pale fringe along the leaves. That ground is within a few values of --color-paper, so it
 * disappears on the site's own background and is only used there. On the forest band and the Back Office
 * sidebar the existing drawn marks stay, because a cream square would read as a box on dark green.
 */

/** The circular emblem alone. Decorative: the name sits beside it as text, so this carries no alt text. */
export function LogoMark({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/agrized-emblem.webp"
      alt=""
      width={256}
      height={241}
      priority
      className={className}
    />
  );
}

/** Emblem and name together, without the French tagline lines. For a screen with room to print it. */
export function LogoLockup({ className = "h-auto w-56" }: { className?: string }) {
  return <Image src="/brand/agrized-logo.webp" alt="AgriZed" width={560} height={508} priority className={className} />;
}
