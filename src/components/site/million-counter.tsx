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

const STAGE_COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

type MillionCounterProps = {
  progress: MillionProgress;
  copy: MillionCounterCopy;
};

/**
 * «وين وصلنا؟» — the visible progress toward one million olive trees.
 *
 * MIL-01: these are counts of real rows. Nothing here is a target, an estimate or a projection, and
 * the bar shows the true share even when that share is a sliver. Spec v2 §6: requested, reserved,
 * contracted and planted trees each keep their own tile and are never added together.
 */
export function MillionCounter({ progress, copy }: MillionCounterProps) {
  const { goal, treesRequested } = progress;
  const share = goal > 0 ? Math.min(treesRequested / goal, 1) : 0;
  // A real but tiny share still deserves a mark on the bar, never a rounded-up number next to it.
  const barWidth = treesRequested > 0 ? Math.max(share * 100, 0.8) : 0;
  const figures = { count: formatCount(treesRequested), goal: formatCount(goal), share: formatShare(share, copy.shareBelow) };
  const caption = treesRequested > 0 ? copy.barCaption : copy.barEmpty;

  // Owner, 2026-09-16: the section leads with the people who started, not with the number of trees. The count is
  // the real one (MIL-01); the word describing it lives in the Back Office, so «عشرات» becomes «مئات» on its own.
  const reached = copy.peopleBands.filter((band) => Number.isFinite(band.min) && progress.participants >= band.min);
  const band = reached.length > 0 ? reached.reduce((best, item) => (item.min > best.min ? item : best)) : null;
  const peopleLine = band && copy.peopleLead ? fillText(copy.peopleLead, { people: band.text }) : "";

  const stages = [
    { key: "requested", value: progress.treesRequested },
    { key: "reserved", value: progress.treesReserved },
    { key: "contracted", value: progress.treesContracted },
    { key: "planted", value: progress.treesPlanted },
  ].filter((tile) => copy.tiles[tile.key as TileKey].label) as { key: TileKey; value: number }[];
  const context = [
    { key: "participants", value: progress.participants },
    { key: "projects", value: progress.projectsUnderStudy },
  ].filter((tile) => copy.tiles[tile.key as TileKey].label) as { key: TileKey; value: number }[];

  return (
    <section id="million" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">{copy.title}</h2>
          {copy.goalLabel ? (
            <p className="text-sm text-muted">
              {fill(copy.goalLabel, { goal: <span className="font-semibold text-ink tabular-nums">{figures.goal}</span> })}
            </p>
          ) : null}
        </div>

        {peopleLine ? (
          <p className="mt-6 font-display text-2xl font-bold leading-snug text-forest sm:text-3xl">{peopleLine}</p>
        ) : null}
        {copy.peopleEncourage ? <p className="mt-3 max-w-2xl leading-7 text-ink/80">{copy.peopleEncourage}</p> : null}

        <div className="mt-6">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={treesRequested}
            aria-label={fillText(caption, figures) || copy.title}
            className="h-4 w-full overflow-hidden rounded-full bg-leaf-soft"
          >
            <div
              style={{ width: `${barWidth}%` }}
              className="h-full rounded-full bg-linear-to-l from-leaf to-forest transition-[width] duration-700"
            />
          </div>
          {caption ? (
            <p className="mt-3 text-sm text-muted">
              {fill(caption, {
                count: <span className="font-semibold text-forest tabular-nums">{figures.count}</span>,
                goal: figures.goal,
                share: figures.share,
              })}
            </p>
          ) : null}
        </div>

        {stages.length > 0 ? (
          <dl className={`mt-8 grid gap-4 sm:grid-cols-2 ${STAGE_COLUMNS[stages.length]}`}>
            {stages.map((tile) => (
              <div key={tile.key} className="rounded-2xl border border-line bg-paper p-5">
                <dt className="text-sm text-muted">{copy.tiles[tile.key].label}</dt>
                <dd className="mt-1 font-display text-4xl font-bold text-forest tabular-nums">{formatCount(tile.value)}</dd>
                {copy.tiles[tile.key].hint ? (
                  <dd className="mt-1 text-xs leading-5 text-muted">{copy.tiles[tile.key].hint}</dd>
                ) : null}
              </div>
            ))}
          </dl>
        ) : null}

        {context.length > 0 ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {context.map((tile) => (
              <div
                key={tile.key}
                className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-paper px-5 py-4"
              >
                <div>
                  <dt className="text-sm text-muted">{copy.tiles[tile.key].label}</dt>
                  {copy.tiles[tile.key].hint ? (
                    <dd className="mt-0.5 text-xs leading-5 text-muted">{copy.tiles[tile.key].hint}</dd>
                  ) : null}
                </div>
                <dd className="font-display text-3xl font-bold text-forest tabular-nums">{formatCount(tile.value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {copy.note ? <p className="mt-6 text-sm leading-6 text-muted">{copy.note}</p> : null}
      </div>
    </section>
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
