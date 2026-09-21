import { settingText, type PublicConfig } from "@/lib/config";

/**
 * One question and its answer, already filtered by the page: an answer that points at a closed module is not
 * printed, because it would name a section that is not on the page.
 */
export type FaqItem = { q: string; a: string };

type FaqProps = {
  config: PublicConfig;
  items: FaqItem[];
};

/**
 * «أسئلة شائعة» — the objections, answered, beside the last ask.
 *
 * Reference image 2 draws a white card, a heading with a circled question mark at the inline start, and a
 * hairlined box of 48px rows on a faintly warm ground. Everything in that description is the call site's;
 * the rows themselves stay `.disclosure` / `.disclosure-list` (globals.css), which is what the measured
 * pattern already gives this FAQ: the whole row is the tap target, the marker is drawn rather than typed so
 * it cannot go missing from a font, it becomes an × by rotating 45°, the answer is indented to line up
 * under its question, and nothing about the body animates, so opening one never shoves the page under a
 * reader who is looking further down.
 *
 * ONE DIFFERENCE FROM THE DRAWING, kept on purpose: the reference puts the «+» at the END of the row (the
 * left). Ours sits at the START, where the reading eye arrives before the words — saying «this opens» after
 * the question has been read is saying it too late, which is the argument the stylesheet itself makes. Moving
 * it would mean abandoning the pattern and hand-rolling a second marker, a row height, a hairline and an
 * indent per question. The drawing's other idea, the warm row ground, costs nothing and is taken: it is the
 * tint on the list box below, set at this call site rather than in `.disclosure-list`, which only the
 * integrator may edit.
 */
export function Faq({ config, items }: FaqProps) {
  if (items.length === 0) return null;
  const title = settingText(config, "site.faq_title", "أسئلة شائعة");

  return (
    <div className="panel p-card sm:p-roomy">
      {title ? (
        <h2 className="flex items-center gap-snug font-display text-2xl font-bold text-forest sm:text-3xl">
          <QuestionGlyph />
          {title}
        </h2>
      ) : null}

      {/* The set is a box of rows inside the card, not a run of rows on it: the hairline between two
          questions then means «these are one list» instead of «the card stops here». */}
      <div className={`disclosure-list overflow-hidden rounded-2xl border border-line bg-paper/70 ${title ? "mt-cozy" : ""}`}>
        {items.map((item) => (
          <details key={item.q} className="disclosure">
            <summary className="text-ink">{item.q}</summary>
            <p className="leading-7 text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

/** The drawing's circled question mark. Decorative: the heading already says what the list is. */
function QuestionGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 flex-none text-forest sm:size-8">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.4 9.3a2.7 2.7 0 1 1 3.4 2.6c-.8.3-1.2.9-1.2 1.7v.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="11.6" cy="16.6" r="1" fill="currentColor" />
    </svg>
  );
}
