import Link from "next/link";

import { LandingIcon, type LandingIconName } from "@/components/site/landing/hero";
import type { MillionFigures } from "@/components/site/million-counter";
import { settingJson, settingText, type PublicConfig } from "@/lib/config";
import { formatCount } from "@/lib/format";

/*
 * The four-figure slab that floats low in the hero photograph.
 *
 * EVERY FIGURE IS LIVE. It is a second face of `public.million_progress()` — the same counts the
 * «وين وصلنا؟» section prints further down the page — shown early, on glass, so a stranger meets the
 * real numbers before he meets any argument. It does NOT replace `MillionCounter`: that section keeps
 * its stages, its hints, its bar and its note. This is a preview of it, and it links to it.
 *
 * Two rules travel from `million-counter.tsx` and neither may weaken here:
 *   · a figure the RPC did not answer with is ABSENT, never printed as a zero. A zero is a count and
 *     says how far a stage has come; a missing key is a gap in the data and saying «0» about it is a
 *     statement about the project.
 *   · the participant count appears only while it is greater than zero. «0 مشارك» in the hero reads as
 *     «nobody has started», which is not what an unreported figure means.
 *
 * The drawing prints «+0» twice. `formatCount` never writes a plus, and a plus on a count claims there
 * is more than has been counted — so the plus does not survive.
 */

export type HeroStatColumn = {
  key: string;
  /** null for the closing column, which is a sentence rather than a statistic. */
  figure: string | null;
  label: string;
  hint?: string;
  icon: LandingIconName;
};

type Fact = { value?: unknown; label?: unknown };

/** A figure the counter actually answered with, or null — `0` is a count, `undefined` and `null` are not. */
function figure(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The label the owner already wrote for «24 ولاية», matched to the live count rather than to a position.
 *
 * `site.facts` holds `{"value": "24", "label": "ولاية مفتوحة للتسجيل"}` today, and the 24 is real — there
 * are twenty-four governorates and `config.governorates` proves it at runtime. The figure printed is the
 * COUNT OF ROWS; the fact only lends its wording, and only while the owner's number still agrees with the
 * database. The day a governorate is added and the fact is not updated, this column disappears instead of
 * printing a stale 24 — which is the right way for it to fail. `site.hero_stat_coverage_label` would make
 * the pairing explicit; see the report.
 */
function coverageLabel(config: PublicConfig, count: number): string {
  const facts = settingJson<Fact[]>(config, "site.facts", []);
  if (!Array.isArray(facts)) return "";
  const match = facts.find((fact) => {
    const value = typeof fact?.value === "string" ? fact.value.trim() : "";
    return /^\d+$/.test(value) && Number(value) === count;
  });
  return typeof match?.label === "string" ? match.label : "";
}

/**
 * The columns, in the order the product wants them: trees, participants, governorates, the closing line.
 *
 * (In the drawing that order runs left to right — the tree count is drawn leftmost and so would be read
 * LAST on an Arabic page. Mirroring the page-level sides puts it first, which is the order that was
 * meant.)
 */
export function heroStatColumns(config: PublicConfig, progress: MillionFigures | null): HeroStatColumn[] {
  if (!progress) return [];
  const columns: HeroStatColumn[] = [];

  const requested = figure(progress.treesRequested);
  const requestedLabel = settingText(config, "million.tile_requested_label", "زيتونات مطلوبة");
  if (requested !== null && requestedLabel) {
    const goal = figure(progress.goal) ?? 0;
    // `million.goal_label` was emptied by the owner (0044) and the goal is 0, so no third line today.
    const goalLabel = settingText(config, "million.goal_label");
    columns.push({
      key: "requested",
      figure: formatCount(requested),
      label: requestedLabel,
      hint: goal > 0 && goalLabel ? goalLabel.replace("{goal}", formatCount(goal)) : undefined,
      icon: "tree",
    });
  }

  const participants = figure(progress.participants);
  const participantsLabel = settingText(config, "million.tile_participants_label", "عدد المشاركين");
  if (participants !== null && participants > 0 && participantsLabel) {
    columns.push({
      key: "participants",
      figure: formatCount(participants),
      label: participantsLabel,
      icon: "people",
    });
  }

  const governorates = config.governorates.length;
  const coverage = coverageLabel(config, governorates);
  if (governorates > 0 && coverage) {
    columns.push({ key: "coverage", figure: formatCount(governorates), label: coverage, icon: "pin" });
  }

  // The closing column carries no figure, which is why it reads as the slab's last word rather than as a
  // fourth statistic. It has no key yet and NO fallback on purpose: `site.vision_title` would work but it
  // holds «زيتونتك هي مشروعك», which is the headline two inches above it.
  const slogan = settingText(config, "site.hero_stat_slogan");
  if (slogan) columns.push({ key: "slogan", figure: null, label: slogan, icon: "globe" });

  return columns;
}

export type HeroStatsProps = {
  columns: HeroStatColumn[];
  /** Where the full counter is, e.g. "/#million". Omitted leaves the slab a plain block. */
  href?: string;
  /** The accessible name of that link — the counter's own title from settings. */
  linkLabel?: string;
};

export function HeroStats({ columns, href, linkLabel }: HeroStatsProps) {
  if (columns.length === 0) return null;

  const body = (
    /* AT 375 THE SLAB LEAVES THE PHOTOGRAPH. Four columns of 80px break every label, and dark glass over a
       picture is unreadable on a phone held outdoors — so it becomes an OPAQUE forest card under the text,
       in two columns, with the hairlines drawn as a real `gap-px` grid over a paper ground (the device
       MillionCounter already uses, which is honest at any cell count).
       THE COLUMN COUNT FOLLOWS THE CELL COUNT (owner, 2026-09-21: the band «looks super ugly»). It used to be
       two columns always, with an odd last cell spanning the row — which, with the three figures the counter
       honestly has today, drew one tile at 343px beside two at 171px. A cell twice its neighbours reads as the
       important one, and it is not; it is just the one that was left over. Three cells now make three columns.
       From lg it is the drawing's slab: one translucent pane of forest with a blur behind it, the columns
       side by side, each separated by a short centred hairline rather than a full-height divider. */
    <div className="overflow-hidden rounded-[1.25rem] bg-forest-700 shadow-[var(--shadow-card)] lg:rounded-[1.5rem] lg:bg-forest-700/72 lg:shadow-none lg:backdrop-blur-sm">
      <dl
        className={`grid gap-px bg-paper/15 lg:flex lg:gap-0 lg:bg-transparent ${
          columns.length === 3 ? "grid-cols-3" : "grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2"
        }`}
      >
        {columns.map((column, index) => (
          <div
            key={column.key}
            className="stat relative items-center bg-forest-700 px-3 py-5 text-center lg:flex-1 lg:bg-transparent lg:px-4"
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="absolute start-0 top-1/2 hidden h-16 w-px -translate-y-1/2 bg-paper/25 lg:block"
              />
            ) : null}

            <LandingIcon name={column.icon} className="size-6 text-paper/85" />

            {column.figure ? (
              <dd className="order-1 font-display text-3xl font-bold leading-none text-paper tabular-nums sm:text-4xl lg:text-3xl xl:text-4xl">
                {column.figure}
              </dd>
            ) : null}

            <dt
              className={
                column.figure
                  ? "order-2 text-caption leading-6 text-paper/80"
                  : "order-2 text-balance font-semibold leading-snug text-paper"
              }
            >
              {column.label}
            </dt>

            {column.hint ? <dd className="order-3 text-xs leading-5 text-paper/65">{column.hint}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} aria-label={linkLabel || undefined} className="block rounded-[1.5rem]">
      {body}
    </Link>
  );
}
