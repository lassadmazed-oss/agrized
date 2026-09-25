type BiProps = {
  ar: string;
  fr?: string | null;
  /** Replaces the default size and colour of the French line, e.g. on a dark card. */
  frClassName?: string;
};

/**
 * Arabic first, French on a line beneath. The owner decided on 2026-09-12 that /start is bilingual;
 * every other page stays Arabic, so leave `fr` empty elsewhere and only the Arabic renders.
 *
 * The French line is marked `data-bi-fr` so a surface can decide, in ONE rule, that it has no room for the
 * second language. /start uses that to keep its ANSWERS Arabic-only on a phone while its QUESTIONS stay
 * bilingual — see `[data-answers]` in globals.css. Marking it here rather than passing a class at thirty
 * call sites is what makes that decision one line instead of thirty.
 */
export function Bi({ ar, fr, frClassName }: BiProps) {
  return (
    <>
      <span>{ar}</span>
      {fr ? (
        <span data-bi-fr="" lang="fr" dir="ltr" className={`block font-normal ${frClassName ?? "text-[0.78em] text-muted"}`}>
          {fr}
        </span>
      ) : null}
    </>
  );
}
