import Link from "next/link";

import { LandingIcon } from "@/components/site/landing/hero";
import { OliveMark } from "@/components/site/tree-card";
import { flagState, optionsFor, settingJson, settingText, type PublicConfig } from "@/lib/config";

type TreePicksProps = {
  config: PublicConfig;
};

/**
 * «قدّاش زيتونة تحب تبدا بيهم؟» — the tree-count strip of the landing page.
 *
 * THE LIST IS DATA. Every tile comes from `option_items` with list_key = "tree_count" (MIL-02): the owner
 * adds, removes, renames and re-sorts them in the Back Office, and the reference image's eight entries are
 * not ours — it draws a «9» we do not have and omits a «100» we do. Nothing here types a count, and nothing
 * here re-sorts the list: a page that reorders the list it exists to render is overriding its own source.
 *
 * The row is therefore built for HOWEVER MANY tiles the owner leaves active. On a wide screen it is a
 * wrapping flex row of equal shares (`flex-1 basis-0` behind a minimum width), so nine tiles make one strip,
 * fourteen make two clean rows and four make one wide row — instead of a fixed `lg:grid-cols-4`, which is the
 * mistake million-counter.tsx:66-78 already documents for the counter tiles.
 *
 * The band used to be the page's dark forest screen (million-start.tsx). In the reference it is cream and the
 * counter above it is the dark one, so the two swap grounds: this section is the page's breathing room
 * between the dark counter band and the dark «كيفاش تخدم» band.
 */
export function TreePicks({ config }: TreePicksProps) {
  // The same gate the home page has always put on this section: with intake closed a tile would open a door
  // that is not there.
  if (flagState(config, "interest_form") !== "public") return null;

  const treeCounts = optionsFor(config, "tree_count");
  const title = settingText(config, "site.trees_question", "قدّاش زيتونة تحب تبدا بيهم؟");
  const subtitle = settingText(
    config,
    "site.trees_subtitle",
    "اختيارك يمشي معك للخطوة الموالية. تنجم تبدّلو وقت اللي تحب.",
  );
  const taglines = settingJson<Record<string, { ar: string; fr?: string }>>(config, "start.tier_taglines", {});
  const otherCardLabel = settingText(config, "site.trees_other_card_label", "عدد آخر");
  const otherLink = settingText(config, "site.trees_other_link");

  if (treeCounts.length === 0 && !otherCardLabel) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-section sm:px-6">
      <SectionHead title={title} subtitle={subtitle} />

      {/* Two columns on a phone, three from sm, and one shared row from lg — whatever the count. */}
      <ul className="mt-roomy grid grid-cols-2 gap-snug sm:grid-cols-3 md:grid-cols-4 lg:flex lg:flex-wrap lg:justify-center">
        {treeCounts.map((option) => (
          <li key={option.id} className="lg:min-w-[6.75rem] lg:flex-1 lg:basis-0">
            <Link href={`/start?trees=${option.id}`} className={pickTileClass}>
              <PickMark trees={option.min_number} />
              <span className="font-display text-xl font-bold leading-tight text-forest text-balance sm:text-2xl">
                {option.label_ar}
              </span>
              {option.code && taglines[option.code]?.ar ? (
                <span className="text-caption leading-5 text-muted">{taglines[option.code]?.ar}</span>
              ) : null}
            </Link>
          </li>
        ))}

        {/* The free number closes the row (spec v2 §7). It carries the reference's dot-grid mark rather than an
            olive tree: it is not a tier, it is «write your own». */}
        {otherCardLabel ? (
          <li className="lg:min-w-[6.75rem] lg:flex-1 lg:basis-0">
            <Link href="/start#custom" className={pickTileClass}>
              <PickMark trees={null} />
              <span className="font-display text-xl font-bold leading-tight text-forest text-balance sm:text-2xl">
                {otherCardLabel}
              </span>
              {taglines.custom?.ar ? (
                <span className="text-caption leading-5 text-muted">{taglines.custom.ar}</span>
              ) : null}
            </Link>
          </li>
        ) : null}
      </ul>

      {/* Offered only when the card is not, so the same choice is never on the page twice. */}
      {!otherCardLabel && otherLink ? (
        <p className="mt-cozy text-center">
          <Link href="/start#custom" className="font-semibold text-gold underline-offset-4 hover:underline">
            {otherLink}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/**
 * The tile: a warm tint behind a hairline, not a white card.
 *
 * Measured on the reference, the tile is DARKER and warmer than the ground it sits on (#F3F0E7 on #FCFCF8),
 * which is the opposite of a white `.card` on our paper. `bg-gold-soft` at 45 % over paper is that tint, and
 * it costs the stylesheet no new colour. The hover lift is what says it is a link.
 */
const pickTileClass =
  "flex h-full min-h-[8.5rem] cursor-pointer flex-col items-center justify-center gap-tight rounded-2xl border border-line bg-gold-soft/45 px-snug py-cozy text-center shadow-[var(--shadow-raise)] transition duration-200 hover:-translate-y-0.5 hover:border-gold-bright hover:bg-gold-soft/70 hover:shadow-[var(--shadow-card)] motion-reduce:transition-none motion-reduce:hover:translate-y-0";

const DOT_GRID: [number, number][] = [8, 14, 20, 26].flatMap((y) =>
  [8, 14, 20, 26].map((x): [number, number] => [x, y]),
);

/** The mark of a tier: an olive tree that grows with the count, or a dot grid for a number the visitor writes. */
function PickMark({ trees }: { trees: number | null }) {
  if (trees) return <OliveMark trees={trees} className="text-gold" />;
  return (
    <svg viewBox="0 0 32 32" className="size-6 text-gold" aria-hidden="true" fill="currentColor">
      {DOT_GRID.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" />
      ))}
    </svg>
  );
}

/**
 * The head every explaining section of the landing page shares: a centred title with a small olive leaf
 * trailing it, and one quiet line under it.
 *
 * The leaf sits at the END of the title because that is where the reference draws it — after the words, which
 * on an Arabic page is the left. It is `aria-hidden` (every `LandingIcon` is): the title already says
 * everything.
 *
 * It lives here rather than in a file of its own only because this rebuild was given four files; it belongs
 * in `landing/section-head.tsx` the moment someone is allowed to make one — the same note `hero.tsx` leaves
 * about the icons.
 */
export function SectionHead({
  title,
  subtitle,
  tone = "light",
}: {
  title: string;
  subtitle?: string;
  /** "dark" is the same head on the forest band: paper words, a gold leaf. */
  tone?: "light" | "dark";
}) {
  const onDark = tone === "dark";
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-snug">
        <h2 className={`section-title ${onDark ? "text-paper" : ""}`}>{title}</h2>
        <LandingIcon name="leaf" className={`size-7 flex-none ${onDark ? "text-gold-bright" : "text-leaf"}`} />
      </div>
      {subtitle ? (
        <p className={`mx-auto mt-snug max-w-2xl leading-7 ${onDark ? "text-paper/75" : "text-muted"}`}>{subtitle}</p>
      ) : null}
    </div>
  );
}

