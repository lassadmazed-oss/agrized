import { Fragment, type ReactNode } from "react";

import { settingJson, settingText, type PublicConfig } from "@/lib/config";
import { formatCount } from "@/lib/format";
import type { MillionProgress } from "@/lib/million";

type TileKey = "requested" | "reserved" | "contracted" | "planted" | "participants" | "projects";
type TileCopy = { label: string; hint: string };

/** `million.people_bands`: the word «وين وصلنا؟» uses once this many people have taken part. */
export type PeopleBand = { min: number; text: string };

export type MillionCounterCopy = {
  title: string;
  note: string;
  /** `{people}` is replaced by the band word for the live participant count. */
  peopleLead: string;
  peopleBands: PeopleBand[];
  peopleEncourage: string;
  /** `{goal}` is replaced by the goal. */
  goalLabel: string;
  /** `{count}`, `{goal}` and `{share}` are replaced by the figures. */
  barCaption: string;
  barEmpty: string;
  /** `{share}` is replaced by the smallest share the bar prints. */
  shareBelow: string;
  tiles: Record<TileKey, TileCopy>;
};

/** Every text of the section from settings (MIL-02). An empty label hides its tile. */
export function millionCounterCopy(config: PublicConfig): MillionCounterCopy {
  const tile = (key: TileKey, label: string, hint: string): TileCopy => ({
    label: settingText(config, `million.tile_${key}_label`, label),
    hint: settingText(config, `million.tile_${key}_hint`, hint),
  });

  return {
    title: settingText(config, "site.progress_title", "وين وصلنا؟"),
    note: settingText(config, "site.progress_note"),
    peopleLead: settingText(config, "million.people_lead", "{people} بدات تبني أصل زيتوني مع AgriZed"),
    peopleBands: settingJson<PeopleBand[]>(config, "million.people_bands", []),
    peopleEncourage: settingText(
      config,
      "million.people_encourage",
      "إنت زادة تنجم تبدأ بزيتونة وتكبر على قد إمكانياتك.",
    ),
    goalLabel: settingText(config, "million.goal_label", "الهدف: {goal} زيتونة"),
    barCaption: settingText(config, "million.bar_caption", "{count} زيتونة مطلوبة من {goal} · {share}"),
    barEmpty: settingText(
      config,
      "million.bar_empty",
      "المشروع في بدايته: مازال ما وصلنا حتى مطلب بعدد زيتونات محدّد.",
    ),
    shareBelow: settingText(config, "million.share_below", "أقل من {share}"),
    tiles: {
      requested: tile("requested", "زيتونات مطلوبة", "مجموع الزيتونات الموجودة في مطالب المستخدمين."),
      reserved: tile("reserved", "زيتونات محجوزة", "مرتبطة بحجوزات فعلية."),
      contracted: tile("contracted", "زيتونات تم التعاقد عليها", "عقود فعلية أو في طور الإمضاء."),
      planted: tile("planted", "زيتونات مغروسة / موجودة فعلياً", "مشاريع منجزة."),
      participants: tile("participants", "عدد المشاركين", "كل شخص يُحتسب مرة واحدة."),
      projects: tile("projects", "مشاريع قيد الدراسة", "عقارات تحت الدراسة قبل أي عرض."),
    },
  };
}

/**
 * The track count for however many stages the counter answered with, at both steps.
 *
 * The number of stages is data, not a constant: `million_progress()` answers with four today and the set is
 * still being rewritten over `public.trees`. Writing one track count for every case is how three stages left
 * half of a row empty with a hairline drawn across nothing — which is also why the phone step is named here
 * and not only the desktop one. Two columns at 375px is a deliberate decision, not a squash: four across
 * gives each cell about 70px, and «زيتونات تم التعاقد عليها» with its hint is unreadable at that width.
 *
 * The per-cell hairline below depends on this map keeping TWO columns below `lg` for every count above one.
 */
const STAGE_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-2 lg:grid-cols-3",
};

/**
 * What this section is able to print. Every figure is optional on purpose: `public.million_progress()` is
 * being rewritten over `public.trees` (the stock figures used to be summed off `public.parcels`, a table
 * that has never held a row), and the set of keys it answers with may lose one on the way. A figure the
 * counter did not return is ABSENT, and an absent figure is hidden — never printed as a zero, which on a
 * section whose whole job is to report movement would be a statement about the project rather than a gap
 * in its data. `MillionProgress` satisfies this shape today, with every key present.
 */
export type MillionFigures = {
  goal?: number | null;
  treesRequested?: number | null;
  treesReserved?: number | null;
  treesContracted?: number | null;
  treesPlanted?: number | null;
  participants?: number | null;
  projectsUnderStudy?: number | null;
};

/**
 * Compile-time check: whatever `getMillionProgress()` answers with stays printable by this section. It
 * resolves to `never` — and every use of it fails to compile — the day the reader returns a figure in a
 * shape this component cannot render.
 */
export type MillionProgressFits = MillionProgress extends MillionFigures ? true : never;

type MillionCounterProps = {
  progress: MillionFigures;
  copy: MillionCounterCopy;
  /**
   * The band's photograph, rendered behind a forest scrim. Pass `<SitePhoto … fill sizes="100vw" />` —
   * `CounterBand` (src/components/site/landing/counter-band.tsx) does exactly that from `home.coverage`.
   *
   * It is a node rather than a slot key on purpose: this component is a plain, config-free renderer, and
   * a page that has no photograph to give it gets a flat forest band, which is a deliberate surface rather
   * than a grey box.
   */
  photo?: ReactNode;
};

/** A figure the counter actually answered with, or null: `0` is a count, `undefined` and `null` are not. */
function figure(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The tiles that can be printed: one whose label was emptied in the Back Office is hidden, and so is one
 *  whose figure the counter did not return. */
function tiles(
  copy: MillionCounterCopy,
  entries: [TileKey, number | null | undefined][],
): { key: TileKey; value: number }[] {
  return entries.flatMap(([key, raw]) => {
    const value = figure(raw);
    return copy.tiles[key].label && value !== null ? [{ key, value }] : [];
  });
}

/**
 * «وين وصلنا؟» — the visible progress toward one million olive trees.
 *
 * MIL-01: these are counts of real rows. Nothing here is a target, an estimate or a projection, and the bar
 * shows the true share even when that share is a sliver. Spec v2 §6: requested, reserved, contracted and
 * planted trees each keep their own tile and are never added together.
 *
 * The order was rebuilt on 2026-09-19 around the one sentence the owner keeps repeating: «الهدف مش الوصول
 * لرقم مليون زيتونة، بل كم شخص نقدر نعاونوه». A section that opened with its title, the goal beside it and a
 * progress bar toward that goal read as an advertisement for a number, and the counts — the only honest
 * thing in it — came third. It reads: the title, the people who have started, the counts on one surface,
 * and only then the bar and its goal, small, below a hairline.
 *
 * Restyled 2026-09-21 to the owner's reference drawing. The band became a DARK photographic one and the
 * counts moved onto a white card floating on it, beside the words instead of under them. Two reasons it is
 * worth the change and not only a repaint: it is the first dark surface below the hero, which is what makes
 * the cream offers above it and the cream tree tiles below it read as separate chapters; and a white card on
 * a photograph reads as a readout taken from a real place, which is precisely what these figures are.
 *
 * Nothing about WHICH figures are printed changed. A figure the reader did not answer with is still absent
 * rather than shown as 0; the goal still disappears with the bar when there is no count to measure against
 * it; and the participant count is still printed only once it has something to say — that line is the honest
 * counterpart of the «+1,200 مستثمر» the reference invents in its hero, and it prints 20, because 20 is how
 * many people there are.
 */
export function MillionCounter({ progress, copy, photo }: MillionCounterProps) {
  const goal = figure(progress.goal) ?? 0;
  const requested = figure(progress.treesRequested);
  const treesRequested = requested ?? 0;
  const share = goal > 0 && requested !== null ? Math.min(treesRequested / goal, 1) : 0;
  // A real but tiny share still deserves a mark on the bar, never a rounded-up number next to it.
  const barWidth = treesRequested > 0 ? Math.max(share * 100, 0.8) : 0;
  const figures = { count: formatCount(treesRequested), goal: formatCount(goal), share: formatShare(share, copy.shareBelow) };
  const caption = treesRequested > 0 ? copy.barCaption : copy.barEmpty;

  // Owner, 2026-09-16: the section leads with the people who started, not with the number of trees. The count is
  // the real one (MIL-01); the word describing it lives in the Back Office, so «عشرات» becomes «مئات» on its own.
  // With no participant count answered, no band is reached and the line does not appear — it would otherwise
  // read as «nobody has started yet», which is a statement, not a missing figure.
  const participants = figure(progress.participants);
  const reached =
    participants === null
      ? []
      : copy.peopleBands.filter((band) => Number.isFinite(band.min) && participants >= band.min);
  const band = reached.length > 0 ? reached.reduce((best, item) => (item.min > best.min ? item : best)) : null;
  const peopleLine = band && copy.peopleLead ? fillText(copy.peopleLead, { people: band.text }) : "";

  // A stage keeps its tile at 0: beside a stage that has moved, a zero is information — it says how far the
  // offer has come. A stage the counter did not answer with is another matter and does not appear at all.
  const stages = tiles(copy, [
    ["requested", progress.treesRequested],
    ["reserved", progress.treesReserved],
    ["contracted", progress.treesContracted],
    ["planted", progress.treesPlanted],
  ]);
  // The context line is not a stage, and a context figure at 0 reports nothing («0 مشاريع قيد الدراسة» has
  // sat under this section since it shipped). It appears once it has something to say.
  const context = tiles(copy, [
    ["participants", progress.participants],
    ["projects", progress.projectsUnderStudy],
  ]).filter((tile) => tile.value > 0);

  return (
    <section id="million" className="relative isolate scroll-mt-20 overflow-hidden bg-forest-700">
      {photo}
      {/* A flat scrim, not a gradient: the words sit at the start and the card at the end, and both need
          the same darkness behind them — unlike the hero, where the wash is directional. */}
      {photo ? <div aria-hidden="true" className="absolute inset-0 bg-forest-700/78" /> : null}

      <div className="relative mx-auto max-w-6xl px-4 py-section sm:px-6 lg:py-band">
        <div className="grid gap-roomy lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-band">
          <div>
            {/* The goal is not printed here, at the far end of the title line: the second thing read in a
                section whose whole subject is what has already happened. It rides at the foot as the
                caption of its own bar. */}
            <h2 className="section-title text-paper">
              {copy.title} <SectionLeaf className="text-leaf-soft/80" />
            </h2>

            {peopleLine ? (
              <p className="mt-cozy text-xl font-bold leading-relaxed text-paper sm:text-2xl">{peopleLine}</p>
            ) : null}
            {copy.peopleEncourage ? (
              <p className="mt-snug max-w-xl leading-7 text-paper/80">{copy.peopleEncourage}</p>
            ) : null}
          </div>

          <div>
            {/* One white surface holding every stage, split by hairlines that are inset rather than drawn
                edge to edge: the figures read as one readout instead of four boxes. The hairline is
                positioned with `start-0`, so it follows `direction` and never names a physical side. */}
            {stages.length > 0 ? (
              <dl className={`panel grid gap-y-cozy p-cozy sm:p-roomy ${STAGE_COLUMNS[stages.length]}`}>
                {stages.map((tile, index) => (
                  <div key={tile.key} className="stat relative items-center px-tight text-center">
                    {/* Two columns below lg, N above it: an odd cell therefore opens a row on a phone and
                        must not carry a rule, while it does carry one once the row is N wide. */}
                    {index > 0 ? (
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-2 start-0 w-px bg-line ${
                          index % 2 === 1 ? "" : "hidden lg:block"
                        }`}
                      />
                    ) : null}
                    <dt className="order-3 text-caption font-semibold leading-5 text-ink">
                      {copy.tiles[tile.key].label}
                    </dt>
                    <dd aria-hidden="true" className="order-1 mb-tight text-gold">
                      <TileGlyph name={tile.key} />
                    </dd>
                    <dd className="stat-figure order-2 tabular-nums">{formatCount(tile.value)}</dd>
                    {copy.tiles[tile.key].hint ? (
                      <dd className="order-4 text-xs leading-5 text-muted">{copy.tiles[tile.key].hint}</dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            ) : null}

            {/* The two context counts are not stages, so they read as one quiet line rather than two more
                boxes. This is where the real participant count is printed — 20 people, from
                `million_progress()`, and nothing else. */}
            {context.length > 0 ? (
              <dl className="mt-cozy flex flex-wrap items-baseline gap-x-roomy gap-y-tight text-caption text-paper/75">
                {context.map((tile) => (
                  <div key={tile.key} className="flex items-baseline gap-tight">
                    <dt className="order-2">{copy.tiles[tile.key].label}</dt>
                    <dd className="order-1 font-display text-xl font-bold text-gold-bright tabular-nums">
                      {formatCount(tile.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {/* The bar, last and quiet. It measures the count against a goal, and a goal is the one thing in
                this section that is not a report — so it sits under the counts, on its own hairline, at
                caption size, instead of leading them. It still needs both figures to exist: with no goal the
                ARIA range would be invalid and the bar a permanent sliver, and a bar drawn from a count the
                reader never answered with would be an empty bar, which says «nothing has been requested»
                rather than «this is not reported». `million.goal` is 0 today, so none of this renders. */}
            {goal > 0 && requested !== null ? (
              <div className="mt-cozy border-t border-paper/20 pt-cozy">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-valuenow={treesRequested}
                  aria-label={fillText(caption, figures) || copy.title}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-paper/20"
                >
                  <div
                    style={{ width: `${barWidth}%` }}
                    className="h-full rounded-full bg-linear-to-l from-gold-bright to-leaf-soft transition-[width] duration-700"
                  />
                </div>
                <div className="mt-snug flex flex-wrap items-baseline justify-between gap-x-cozy gap-y-hair text-caption text-paper/75">
                  {copy.goalLabel ? (
                    <p>
                      {fill(copy.goalLabel, {
                        goal: <span className="font-semibold text-paper tabular-nums">{figures.goal}</span>,
                      })}
                    </p>
                  ) : null}
                  {caption ? (
                    <p>
                      {fill(caption, {
                        count: <span className="font-semibold text-gold-bright tabular-nums">{figures.count}</span>,
                        goal: figures.goal,
                        share: figures.share,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {copy.note ? <p className="mt-cozy max-w-3xl text-caption leading-6 text-paper/70">{copy.note}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The stage marks: a hand raised (asked for), a bookmark (held), a signed page (contracted), a seedling in
 * the ground (planted), and a leaf for any stage the counter grows later. Inline SVG in currentColor,
 * aria-hidden, chosen by stage key — the icon never decides whether its tile renders, because the Back
 * Office can add a stage this file has never heard of.
 */
function TileGlyph({ name }: { name: TileKey }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "requested" ? (
        <>
          <circle cx="9.2" cy="7.6" r="3.2" />
          <path d="M3 20.4c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6" />
          <path d="M16.2 4.9a3.2 3.2 0 0 1 0 5.6M17.8 15.1c2.1.8 3.2 2.6 3.2 5.3" />
        </>
      ) : null}
      {name === "reserved" ? (
        <>
          <path d="M6.4 3.4h11.2a1 1 0 0 1 1 1v16.2L12 17.2l-6.6 3.4V4.4a1 1 0 0 1 1-1Z" />
          <path d="M9.4 8.6h5.2" />
        </>
      ) : null}
      {name === "contracted" ? (
        <>
          <path d="M6.6 2.6h6.6l4.8 4.8v13.5a.5.5 0 0 1-.5.5H6.6a.5.5 0 0 1-.5-.5V3.1a.5.5 0 0 1 .5-.5Z" />
          <path d="M13.2 2.6v4.8H18" />
          <path d="M9.2 15.2l2.2 2.2 3.6-3.8" />
        </>
      ) : null}
      {name === "planted" ? (
        <>
          <path d="M12 21v-7.4" />
          <path d="M12 13.6c0-3 2.3-5.2 5.4-5.2 0 3-2.3 5.2-5.4 5.2Z" />
          <path d="M12 16.2c0-2.6-1.9-4.5-4.6-4.5 0 2.6 1.9 4.5 4.6 4.5Z" />
          <path d="M4.6 21h14.8" />
        </>
      ) : null}
      {name === "participants" || name === "projects" ? (
        <>
          <path d="M20.6 3.8c-7.6 0-12.4 2.8-14.3 7-1 2.2-.8 4.4.3 6.1" />
          <path d="M20.6 3.8c0 7.6-2.8 12.4-7 14.3-2.2 1-4.4.8-6.1-.3" />
          <path d="M3.6 20.8 7.5 17" />
        </>
      ) : null}
    </svg>
  );
}

/**
 * The small olive leaf beside a section heading, as the reference draws it: after the words, which in RTL
 * puts it on the left. Decorative and inline, so `text-wrap: balance` on the heading still balances the
 * sentence rather than a flex row.
 */
function SectionLeaf({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block size-6 shrink-0 align-[-0.12em] sm:size-7 ${className}`.trim()}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21 3c-7.7 0-12.8 2.9-14.7 7.3-1 2.3-.8 4.6.3 6.3l-2.9 2.9a1 1 0 1 0 1.4 1.4l2.9-2.9c1.7 1.1 4 1.3 6.3.3C18.7 16.4 21.6 11.3 21.6 3.6A.6.6 0 0 0 21 3Z" />
    </svg>
  );
}

/** Replaces `{name}` tokens with nodes; an unknown token stays visible so a typo in settings shows up. */
function fill(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{[a-z]+\})/).map((part, index) => {
    const name = /^\{([a-z]+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{name && name in values ? values[name] : part}</Fragment>;
  });
}

function fillText(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z]+)\}/g, (token, name: string) => values[name] ?? token);
}

/** Says «أقل من 0.1%» rather than rounding a real 0.03% up to a friendlier number. */
function formatShare(share: number, below: string): string {
  const percent = share * 100;
  if (percent > 0 && percent < 0.1) return fillText(below, { share: "0.1%" });
  return `${formatCount(Number(percent.toFixed(percent < 10 ? 1 : 0)))}%`;
}
