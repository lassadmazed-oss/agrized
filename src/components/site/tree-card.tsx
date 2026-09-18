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
    "flex h-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-5 text-center transition duration-200 motion-reduce:transition-none has-[.sr-only:focus-visible]:outline-2 has-[.sr-only:focus-visible]:outline-offset-2 has-[.sr-only:focus-visible]:outline-gold-bright";
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
      {trees ? <OliveMark trees={trees} className={onBand ? "text-gold" : "text-leaf"} /> : null}
      <span className={`font-display font-bold leading-tight text-forest ${trees ? "text-3xl" : "text-2xl"}`}>
        <Bi ar={labelAr} fr={labelFr} frClassName="text-[0.78em] text-muted" />
      </span>
      {taglineAr ? (
        <>
          <span aria-hidden="true" className="my-2 h-px w-10 bg-line-strong" />
          <span className="text-sm leading-5 text-muted">
            <Bi ar={taglineAr} fr={taglineFr} frClassName="text-[0.85em] opacity-80" />
          </span>
        </>
      ) : null}
    </>
  );
}
