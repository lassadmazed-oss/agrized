// The heading of a page, a section or a panel: title, what it is for, whatever acts on it.
// Server component: no state, no client boundary.
//
// Meant to replace, one file at a time (the migration is a later, separate step):
//   the page headers written out as `<header><h1 className="font-display text-4xl font-bold text-forest">…`
//     src/app/admin/(panel)/page.tsx:63, analytics/page.tsx:139, leads/page.tsx:108, audit/page.tsx:121,
//     land-offers/page.tsx:52, projects/page.tsx:46, pricing/page.tsx:129, account/page.tsx:16,
//     settings/lists/page.tsx:99, settings/media/page.tsx:27
//   the same header with a status beside the title (badge) and links after it (actions)
//     src/app/admin/(panel)/leads/[personId]/page.tsx:130, projects/[id]/page.tsx:130, land-offers/[id]/page.tsx:73
//   the `flex flex-wrap items-center justify-between` rows of an <h2> and a nav
//     src/app/admin/(panel)/page.tsx:112, projects/[id]/page.tsx:173
//   the title/subtitle half of the private ChartCard and Panel copies
//     ChartCard — src/app/admin/(panel)/analytics/page.tsx:315, src/app/admin/(panel)/page.tsx:242
//     Panel     — src/app/admin/(panel)/leads/[personId]/page.tsx:433
//     (their box is now `.card p-5`, so ChartCard becomes a .card holding <SectionHeader level={3}>.)
//
// Level 1 uses .section-title from globals.css, which already carries the display face, the weight, the
// forest colour and the clamp from text-3xl to text-4xl.

import type { ReactNode } from "react";

export type SectionHeaderLevel = 1 | 2 | 3;

export type SectionHeaderProps = {
  /** The title, in Arabic, from the caller. */
  title: ReactNode;
  /** The sentence under it saying what this page or section is for. */
  description?: ReactNode;
  level?: SectionHeaderLevel;
  /** Sits beside the title — a <StatusPill>, a link to the public page. */
  badge?: ReactNode;
  /** Sits at the far end of the title line — buttons, a period switcher, a view switcher. */
  actions?: ReactNode;
  /** Put on the heading, so a section can point at it with aria-labelledby. */
  id?: string;
  className?: string;
};

const TITLE_CLASS: Record<SectionHeaderLevel, string> = {
  1: "section-title",
  2: "text-lg font-semibold",
  3: "font-semibold",
};

export function SectionHeader({ title, description, level = 2, badge, actions, id, className = "" }: SectionHeaderProps) {
  const Heading: "h1" | "h2" | "h3" = level === 1 ? "h1" : level === 2 ? "h2" : "h3";

  return (
    <header className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Heading id={id} className={TITLE_CLASS[level]}>
            {title}
          </Heading>
          {badge}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="mt-1 max-w-2xl leading-7 text-muted">{description}</p> : null}
    </header>
  );
}
