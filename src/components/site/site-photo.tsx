import Image from "next/image";

import { mediaFor, type PublicConfig } from "@/lib/config";

type SitePhotoProps = {
  config: PublicConfig;
  /** Slot key from `site_media`, e.g. "home.hero" (MED-01). */
  slot: string;
  /** Overrides the crop stored on the slot. */
  aspect?: string;
  /** Passed to next/image so a wide hero does not download a phone-sized file. */
  sizes?: string;
  priority?: boolean;
  className?: string;
};

/**
 * One picture slot of the public site.
 * While AgriZed has not uploaded a photo, a branded drawing keeps the layout intact instead of a
 * broken frame, so the page is presentable from the first day.
 */
export function SitePhoto({ config, slot, aspect, sizes = "100vw", priority, className = "" }: SitePhotoProps) {
  const media = mediaFor(config, slot);
  const ratio = (aspect ?? media?.aspect ?? "4/3").replace("/", " / ");

  return (
    <div
      style={{ aspectRatio: ratio }}
      className={`relative overflow-hidden rounded-2xl bg-leaf-soft ${className}`}
    >
      {media ? (
        <Image
          src={media.url as string}
          alt={media.alt_ar ?? ""}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <GrovePlaceholder seed={slot} />
      )}
    </div>
  );
}

/**
 * An olive grove drawn in the brand colours. Deterministic per slot, so two placeholders on the
 * same page do not look like the same missing image.
 */
function GrovePlaceholder({ seed }: { seed: string }) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 997;

  const trees = Array.from({ length: 5 }, (_, index) => {
    const spread = ((hash + index * 173) % 100) / 100;
    return {
      x: 60 + index * 70 + spread * 26,
      y: 172 + ((hash + index * 61) % 22),
      scale: 0.74 + (((hash + index * 37) % 55) / 100),
    };
  });

  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" role="presentation">
      <defs>
        <linearGradient id={`sky-${hash}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-gold-soft)" />
          <stop offset="100%" stopColor="var(--color-leaf-soft)" />
        </linearGradient>
      </defs>

      <rect width="400" height="300" fill={`url(#sky-${hash})`} />
      <circle cx={300 + (hash % 40)} cy={62} r="26" fill="var(--color-gold-bright)" opacity="0.5" />

      {/* Hills */}
      <path d={`M0 ${150 + (hash % 18)} Q 110 ${104 + (hash % 30)} 226 ${152 + (hash % 14)} T 400 ${138}  L400 300 L0 300 Z`} fill="var(--color-leaf)" opacity="0.35" />
      <path d={`M0 ${190 + (hash % 12)} Q 150 ${150 + (hash % 24)} 400 ${186} L400 300 L0 300 Z`} fill="var(--color-forest-600)" opacity="0.22" />
      <rect y="238" width="400" height="62" fill="var(--color-forest)" opacity="0.12" />

      {trees.map((tree) => (
        <g key={tree.x} transform={`translate(${tree.x} ${tree.y}) scale(${tree.scale})`}>
          <path d="M0 46 L0 14" stroke="var(--color-forest-700)" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
          <circle cx="0" cy="2" r="20" fill="var(--color-forest)" opacity="0.5" />
          <circle cx="-13" cy="12" r="13" fill="var(--color-forest-600)" opacity="0.5" />
          <circle cx="13" cy="11" r="12" fill="var(--color-leaf)" opacity="0.55" />
        </g>
      ))}
    </svg>
  );
}
