type BiProps = {
  ar: string;
  fr?: string | null;
  /** Replaces the default size and colour of the French line, e.g. on a dark card. */
  frClassName?: string;
};

/**
 * Arabic first, French on a line beneath. The owner decided on 2026-09-12 that /start is bilingual;
 * every other page stays Arabic, so leave `fr` empty elsewhere and only the Arabic renders.
 */
export function Bi({ ar, fr, frClassName }: BiProps) {
  return (
    <>
      <span>{ar}</span>
      {fr ? (
        <span lang="fr" dir="ltr" className={`block font-normal ${frClassName ?? "text-[0.78em] text-muted"}`}>
          {fr}
        </span>
      ) : null}
    </>
  );
}
