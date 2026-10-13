import Image from "next/image";

/**
 * The olive branch that tucks into the corners of the board's panels. Decorative only: hidden from
 * assistive technology, never catches a click, and left out on small screens where it would cover text.
 */
export function OliveBranch({ className = "", flip = false }: { className?: string; flip?: boolean }) {
  return (
    <Image
      src="/brand/olive-branch.webp"
      alt=""
      aria-hidden="true"
      width={900}
      height={879}
      sizes="(min-width: 1024px) 18rem, 10rem"
      className={`pointer-events-none absolute select-none ${flip ? "-scale-x-100" : ""} ${className}`}
    />
  );
}
