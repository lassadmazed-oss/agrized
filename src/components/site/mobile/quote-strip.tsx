/**
 * The strip that slides above the hero (owner, 2026-09-22: «another banner on top … nice quotes about
 * investment or Tunisian quotes, something clean, sliding infinitely»).
 *
 * WHY THESE ARE DRAWN AND NOT PICTURES. The ask was for images with the quotes written on them, sized so they
 * are not cropped. A quote card is type on a ground: made as a raster it has exactly one size, goes soft on a
 * dense screen, crops the moment the frame's ratio changes, cannot be translated, and has to be re-exported
 * to fix a comma. Drawn in the page it is sharp at every density, cannot crop because it has no fixed ratio,
 * and the words come from `site.quotes` in the Back Office — the owner rewrites a line without anyone opening
 * a design tool. The grounds below carry the site's own palette and an olive-branch mark, so the strip reads
 * as designed cards rather than as text on a rectangle.
 *
 * It loops with the same .marquee primitive as everything else here: the list is rendered twice and the track
 * travels exactly -50%, so the seam lands on an identical copy and nothing counts anything. The second copy
 * is aria-hidden — it is the same sentences, and a reader told them twice is being told wrong.
 */

export type Quote = {
  /** The line itself. An item without one is dropped by the caller. */
  ar: string;
  /** Who said it — «مثل عربي», «AgriZed». Optional: a proverb often wants to stand alone. */
  by?: string;
};

/** Four grounds, cycled. Enough that no two neighbours match, few enough that the strip stays one family. */
const GROUNDS = [
  { bg: "bg-forest-700", text: "text-paper", quiet: "text-paper/60", mark: "text-gold-bright/25" },
  { bg: "bg-gold-soft", text: "text-forest", quiet: "text-gold", mark: "text-gold/30" },
  { bg: "bg-leaf-soft", text: "text-forest", quiet: "text-forest/60", mark: "text-leaf/35" },
  { bg: "bg-forest", text: "text-paper", quiet: "text-paper/60", mark: "text-leaf/35" },
] as const;

function Card({ quote, index, echo }: { quote: Quote; index: number; echo?: boolean }) {
  const ground = GROUNDS[index % GROUNDS.length];
  return (
    <figure
      aria-hidden={echo || undefined}
      className={`relative flex h-24 w-64 flex-none flex-col justify-center overflow-hidden rounded-2xl px-4 py-3 ${ground.bg}`}
    >
      {/* An olive branch, low and large, so the card has a picture in it without a photograph to crop. */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`pointer-events-none absolute -bottom-3 -start-2 size-16 ${ground.mark}`}
        fill="currentColor"
      >
        <path d="M11 20C11 12 14 7 21 4c1 7-2 13-10 14z" />
        <path d="M11 20c-3-4-6-5-8-4 1 3 4 5 8 4z" />
      </svg>
      <blockquote className={`relative font-display text-[0.95rem] font-bold leading-snug ${ground.text}`}>
        {quote.ar}
      </blockquote>
      {quote.by ? (
        <figcaption className={`relative mt-1.5 text-[0.625rem] leading-none ${ground.quiet}`}>
          — {quote.by}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function QuoteStrip({ quotes }: { quotes: readonly Quote[] }) {
  const shown = quotes.filter((quote) => quote.ar?.trim());
  // One card cannot slide anywhere, and an empty setting means the owner turned the strip off.
  if (shown.length < 2) return null;

  return (
    <div className="marquee -mx-4 mb-3" style={{ ["--marquee-duration" as string]: "40s" }}>
      {/* Both copies are flat siblings of the track: a wrapper around the second one, or a gap on the
          track itself, makes half the track stop being exactly one copy — see the note on .marquee-track. */}
      <div className="marquee-track">
        {shown.map((quote, index) => (
          <Card key={`${quote.ar}-${index}`} quote={quote} index={index} />
        ))}
        {shown.map((quote, index) => (
          <Card key={`echo-${quote.ar}-${index}`} quote={quote} index={index} echo />
        ))}
      </div>
    </div>
  );
}
