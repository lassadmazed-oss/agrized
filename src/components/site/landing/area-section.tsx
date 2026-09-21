import Link from "next/link";

import { SectionHead } from "@/components/site/landing/tree-picks";
import { SitePhoto } from "@/components/site/site-photo";
import { flagState, settingText, type PublicConfig } from "@/lib/config";
import { formatArea, formatSpacing } from "@/lib/format";
import { getSpacingClasses } from "@/lib/tree-pricing";

type AreaSectionProps = {
  config: PublicConfig;
};

/**
 * «الزيتونة مع مساحتها» — the unit this product sells: one olive tree and the land it comes with.
 *
 * WHERE THE ARITHMETIC LIVES, and it does not move: `tree_spacing_classes.area_m2` is a Postgres column,
 * `GENERATED ALWAYS AS (row_spacing_m * tree_spacing_m)`, and trees × area belongs to `public_tree_quote`
 * (tree-pricing.ts). Nothing multiplies in TypeScript here and nothing may start — which is exactly why the
 * reference image's tiles cannot be copied: it pairs a tree count with an area («5 زيتونات / 49 م²»,
 * «1,000 زيتونة / 11,520 م²»), and its first four areas — 49, 100, 196, 576 — are literally four of our eight
 * spacing-class areas with the planting label swapped for an invented count. Reproducing that would mean
 * either multiplying here or firing eight quote RPCs on a prerendered page. The tile keeps its real meaning:
 * a planting class, the land one tree of it comes with, and the spacing that produced it.
 *
 * Areas go through `formatArea` and spacings through `formatSpacing` — never a hand-written division, never
 * `toLocaleString`. No amount appears in this section, so PRN-01 raises nothing here; the note under the grid
 * is nonetheless the hedge that the areas themselves are indicative, and it stays.
 */
export async function AreaSection({ config }: AreaSectionProps) {
  // docs/plan-zitouna.md P3-2: the section exists once its copy exists and the Back Office has spacing classes.
  const title = settingText(config, "site.unit_title");
  if (!title) return null;

  const spacingClasses = await getSpacingClasses();
  if (spacingClasses.length === 0) return null;

  const text = settingText(config, "site.unit_text");
  const note = settingText(config, "site.unit_note");
  // The reference writes a gold script line over the photograph. There is no key for it, so it stays empty
  // and the picture shows bare — deliberate, and one Back Office row away from the drawing.
  const caption = settingText(config, "site.unit_photo_caption");
  const ctaLabel = flagState(config, "interest_form") === "public" ? settingText(config, "site.unit_cta") : "";

  return (
    <section className="mx-auto max-w-6xl px-4 py-section sm:px-6">
      <SectionHead title={title} subtitle={text} />

      {/* The photograph is at the END (left) from lg up, as drawn, and FIRST on a phone: «576 م²» means
          nothing to a stranger until a grove has been seen, and on a screen that shows one thing at a time the
          picture has to lead. */}
      {/* The start (right) track is the wider one: it carries four columns of Arabic labels, the picture
          only carries itself. */}
      <div className="mt-roomy grid gap-roomy lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <figure className="relative overflow-hidden rounded-2xl lg:order-2">
          <SitePhoto
            config={config}
            slot="home.journey"
            aspect="16/11"
            sizes="(min-width: 1024px) 45vw, 100vw"
          />
          {caption ? (
            <>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-forest-700/75 to-transparent"
              />
              <figcaption className="absolute bottom-0 start-0 p-card font-display text-2xl font-bold leading-snug text-gold-bright text-balance sm:text-3xl">
                {caption}
              </figcaption>
            </>
          ) : null}
        </figure>

        <div className="lg:order-1">
          <ul className="grid grid-cols-2 gap-snug sm:grid-cols-4">
            {spacingClasses.map((spacing) => (
              <li
                key={spacing.id}
                className="stat items-center rounded-2xl border border-line bg-gold-soft/45 px-snug py-cozy text-center"
              >
                <span className="stat-figure text-xl sm:text-2xl">{formatArea(spacing.area_m2)}</span>
                <span className="stat-label leading-5">{spacing.label_ar}</span>
                <span dir="ltr" className="stat-label text-xs">
                  {formatSpacing(spacing.row_spacing_m, spacing.tree_spacing_m)}
                </span>
              </li>
            ))}
          </ul>

          {/* The reference prints only the note here. The button stays: it is this section's one door to the
              calculator, and deleting a working link to match a drawing is a loss, not a restyle. */}
          <div className="mt-cozy flex flex-wrap items-center gap-x-cozy gap-y-snug">
            {ctaLabel ? (
              <Link href="/start" className="btn btn-secondary w-full sm:w-auto">
                {ctaLabel}
              </Link>
            ) : null}
            {note ? (
              <p className="flex flex-1 items-start gap-tight text-caption leading-6 text-muted">
                <InfoMark />
                <span>{note}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The mark that introduces the note. Decorative: the sentence says it. */
function InfoMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 size-4 flex-none text-line-strong"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.4" />
    </svg>
  );
}
