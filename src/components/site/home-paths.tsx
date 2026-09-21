import Link from "next/link";
import type { ReactNode } from "react";

import { OliveMark } from "@/components/site/tree-card";

/**
 * The two ways into AgriZed, side by side at the top of the home page (owner, 2026-09-18):
 *
 *   estimate → the calculator on /start. It answers with a worked example of a project that fits the
 *              visitor's choices. It is not a property on sale.
 *   stock    → «عروضنا». Real land, a real code, a real number of olive trees.
 *
 * The product used to show them as one thing, so the two doors must not look alike: the estimate door
 * sits on .card-estimate (warm ground, dashed edge, no elevation — explicitly not an object on the
 * page) and the stock door on .panel, which carries the full card shadow.
 *
 * Every word is passed in by the page, which reads it from settings (MIL-02). Nothing here writes copy.
 */
export type HomePathVariant = "estimate" | "stock";

export type HomePathProps = {
  variant: HomePathVariant;
  /** The name of the door, e.g. the «احسب مشروعك» / «عروضنا» settings. */
  title: string;
  /** One line saying what is behind it; hidden when the setting is empty. */
  text?: string;
  /** The button. An empty label hides it, as everywhere else on the site. */
  ctaLabel?: string;
  ctaHref: string;
  /** The line under the button: the estimate warning, or the note every offer card must carry. */
  note?: string;
  /** Between the text and the button — the live offer names, a second link. */
  children?: ReactNode;
};

export function HomePath({ variant, title, text, ctaLabel, ctaHref, note, children }: HomePathProps) {
  const estimate = variant === "estimate";

  return (
    <article className={`flex flex-col ${estimate ? "card card-estimate" : "panel"} p-card sm:p-roomy`}>
      <div className="flex items-center gap-snug">
        <span
          className={`grid size-12 shrink-0 place-items-center rounded-2xl ${
            estimate ? "bg-gold-soft" : "bg-leaf-soft"
          }`}
        >
          {estimate ? <OliveMark trees={100} className="text-gold" /> : <LandMark />}
        </span>
        <h2 className="font-display text-2xl font-bold leading-tight text-forest sm:text-3xl">{title}</h2>
      </div>

      {text ? <p className="mt-snug leading-7 text-muted">{text}</p> : null}

      {children}

      <div className="mt-auto pt-cozy">
        {ctaLabel ? (
          <Link
            href={ctaHref}
            className={`btn w-full sm:w-auto sm:px-8 ${
              estimate ? "btn-primary" : "bg-gold-bright text-forest-700 hover:bg-gold-soft"
            }`}
          >
            {ctaLabel}
          </Link>
        ) : null}
        {note ? <p className="mt-snug text-caption leading-6 text-muted">{note}</p> : null}
      </div>
    </article>
  );
}

/** Land on a map: the mark of a real offer, opposite the olive tree of the calculator. Decorative. */
function LandMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 text-forest"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 7.5 9.75 4.5l4.5 2.25L20.5 4v12.5l-6.25 2.75-4.5-2.25L3.5 20z" />
      <path d="M9.75 4.5v12.5M14.25 6.75v12.5" />
    </svg>
  );
}
