import { Bi } from "@/components/site/bilingual";

export type TreeCardTone = "light" | "dark";

/**
 * An olive tree that grows with the number on the card, so the row reads as a scale at a glance.
 * Decorative: the number beside it already says everything.
 */
export function OliveMark({ trees, className = "text-paper/70" }: { trees: number; className?: string }) {
  const size = trees >= 500 ? 46 : trees >= 250 ? 40 : trees >= 100 ? 34 : trees >= 50 ? 28 : 24;
  return (
    <svg
      viewBox="0 0 32 32"
      style={{ width: size, height: size }}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M16 28v-9" />
      <path d="M16 22l-4-3M16 19l4-3" />
      <circle cx="16" cy="11" r="6" />
      <circle cx="9.5" cy="15" r="3.6" />
      <circle cx="22.5" cy="15" r="3.2" />
    </svg>
  );
}

/**
 * Wrapper classes of a tree-count card: a link on the dark home band, a radio label on /start.
 *
 * On the dark band the card is a LIGHT surface that lifts off it. It used to be a transparent box behind a
 * `border-paper/20` outline, which on that green ground read as a faint rectangle rather than as something to
 * press. A filled card with elevation is the same idea the rest of the site now uses (.card), and the hover
 * lift says it is a link.
 */
export function treeCardClass(selected: boolean, tone: TreeCardTone): string {
  // On /start the radio inside the card is visually hidden, so the card itself shows keyboard focus.
  const base =
    "flex h-full min-h-14 cursor-pointer flex-col items-center justify-center gap-0 rounded-xl border px-1.5 py-2 text-center sm:min-h-0 sm:gap-1 sm:rounded-2xl sm:border-2 sm:px-3 sm:py-5 transition duration-200 motion-reduce:transition-none has-[.sr-only:focus-visible]:outline-2 has-[.sr-only:focus-visible]:outline-offset-2 has-[.sr-only:focus-visible]:outline-gold-bright";
  const state =
    tone === "dark"
      ? selected
        ? "border-gold-bright bg-paper shadow-[var(--shadow-float)]"
        : "border-transparent bg-paper shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:border-gold-bright/50 hover:shadow-[var(--shadow-float)] motion-reduce:hover:translate-y-0"
      : selected
        ? "border-forest bg-leaf-soft shadow-[var(--shadow-raise)]"
        : "border-line-strong bg-surface hover:-translate-y-0.5 hover:border-leaf hover:shadow-[var(--shadow-card)] motion-reduce:hover:translate-y-0";
  return `${base} ${state}`;
}

type TreeCardBodyProps = {
  labelAr: string;
  labelFr?: string | null;
  /** Lower bound of the tier; sizes the olive mark. Absent for «اقترحولي». */
  trees?: number | null;
  taglineAr?: string | null;
  taglineFr?: string | null;
  tone: TreeCardTone;
};

/**
 * Inside of a tree-count card: mark, label (Back Office wording, MIL-02), optional tagline.
 *
 * Both tones now sit on a light card, so the text is read the same way in both; the tone only warms the olive
 * mark to gold on the home band, where the card is what carries the section's accent.
 */
export function TreeCardBody({ labelAr, labelFr, trees, taglineAr, taglineFr, tone }: TreeCardBodyProps) {
  const onBand = tone === "dark";
  return (
    <>
      {/* The olive mark grows with the tier, which is a lovely idea on a wide card and 20px of noise on a
          56px chip where the number is already the whole message. */}
      {trees ? (
        <OliveMark trees={trees} className={`hidden sm:block ${onBand ? "text-gold" : "text-leaf"}`} />
      ) : null}

      <span
        className={`font-display font-bold leading-none text-forest ${trees ? "text-[0.9375rem] sm:text-3xl" : "text-[0.8125rem] sm:text-2xl"}`}
      >
        {/* THE FRENCH TWIN IS DROPPED ON A PHONE, and only here. «50 زيتونة» / «50 oliviers» is the same
            digit printed twice: the number — the thing being chosen — is identical in both languages, so the
            second line doubles the chip's height to translate the unit alone. The QUESTION above still
            carries both, because a sentence genuinely differs between them. From sm the twin returns. */}
        <Bi ar={labelAr} fr={labelFr} frClassName="hidden text-[0.78em] text-muted sm:block" />
      </span>

      {taglineAr ? (
        <>
          <span aria-hidden="true" className="hidden h-px w-10 bg-line-strong sm:my-2 sm:block" />
          <span className="hidden text-muted sm:block sm:text-sm sm:leading-5">
            <Bi ar={taglineAr} fr={taglineFr} frClassName="text-[0.85em] opacity-80" />
          </span>
        </>
      ) : null}
    </>
  );
}
