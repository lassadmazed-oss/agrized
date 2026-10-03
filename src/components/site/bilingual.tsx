"use client";

import { useLocale } from "@/lib/i18n/client";

/**
 * Whether this page prints the French twin under its words — THE one place that decides it.
 *
 * The owner decided on 2026-09-12 that /start is bilingual, Arabic with its French twin beneath. When the site
 * learnt five languages (2026-10-03) that decision was kept for the Arabic site only, exactly as it was: there
 * the main line is the Arabic text and the twin is the owner's French (`…_fr` settings, `label_fr` columns,
 * the `fr` field of an {ar, fr} pair). In French, German, Italian or English a page speaks ITS language, once:
 * the main line is already that language — the translation of the Arabic key (`t(config, key)`), or for an
 * {ar, fr} pair the field of the page's language when the pair has one, else the translated value — and a
 * twin would either repeat it (French) or add a second foreign language (German, Italian, English).
 */
export function useShowsTwin(): boolean {
  return useLocale() === "ar";
}

type BiProps = {
  /** The main line, in the page's language (Arabic on the Arabic site, whence the name). */
  ar: string;
  /** Its French twin; printed on the Arabic site only (useShowsTwin). */
  fr?: string | null;
  /** Replaces the default size and colour of the French line, e.g. on a dark card. */
  frClassName?: string;
};

/**
 * The main line first, its French twin on a line beneath — on the Arabic site; elsewhere the main line alone
 * (see useShowsTwin above). Every other page stays one language, so leave `fr` empty there.
 *
 * The French line is marked `data-bi-fr` so a surface can decide, in ONE rule, that it has no room for the
 * second language. /start uses that to keep its ANSWERS Arabic-only on a phone while its QUESTIONS stay
 * bilingual — see `[data-answers]` in globals.css. Marking it here rather than passing a class at thirty
 * call sites is what makes that decision one line instead of thirty.
 */
export function Bi({ ar, fr, frClassName }: BiProps) {
  const showsTwin = useShowsTwin();
  return (
    <>
      <span>{ar}</span>
      {fr && showsTwin ? (
        <span data-bi-fr="" lang="fr" dir="ltr" className={`block font-normal ${frClassName ?? "text-[0.78em] text-muted"}`}>
          {fr}
        </span>
      ) : null}
    </>
  );
}
