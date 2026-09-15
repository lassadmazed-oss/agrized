type WordmarkProps = {
  className?: string;
  /** Use over a photo or the forest-green band. */
  onDark?: boolean;
  /** The leaf before the name; drop it where the name sits inside a sentence. */
  withMark?: boolean;
};

/** The AgriZed logo of the design board: an olive leaf split by its midrib, then the name in a serif. */
export function Wordmark({ className = "text-3xl", onDark = false, withMark = true }: WordmarkProps) {
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center gap-[0.3em] font-brand font-bold leading-none tracking-tight ${
        onDark ? "text-white" : "text-forest-800"
      } ${className}`}
    >
      {withMark ? <LeafMark onDark={onDark} className="h-[1.08em] w-[1.08em] shrink-0 -translate-y-[0.04em]" /> : null}
      <span>AgriZed</span>
    </span>
  );
}

/**
 * The leaf on its own. The ids are fixed so every copy on a page shares one definition; copies only
 * differ by the fill set on the path itself.
 */
export function LeafMark({ className = "size-10", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="agz-leaf-fill" x1="6" y1="44" x2="44" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1d4a16" />
          <stop offset="0.55" stopColor="#3f7424" />
          <stop offset="1" stopColor="#7eac3e" />
        </linearGradient>
        <mask id="agz-leaf-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          <path d="M11.5 36.5C20 27.5 30 18 41 7.5" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" />
        </mask>
      </defs>
      <path
        d="M44 4C25.5 6.5 10.5 19 8.5 39.5C29 38.5 42.5 24 44 4Z"
        fill={onDark ? "#fff" : "url(#agz-leaf-fill)"}
        mask="url(#agz-leaf-cut)"
      />
      <path
        d="M8.8 39.2C7.2 41.5 5.6 43.4 3.8 45"
        fill="none"
        stroke={onDark ? "#fff" : "#1d4a16"}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
