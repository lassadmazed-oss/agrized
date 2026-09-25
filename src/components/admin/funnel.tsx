// §28's dashboard, drawn as a funnel rather than printed as a list of numbers.
// Server component: no state, no client boundary, no "use client".
//
// WHY A FUNNEL AND NOT NINE TILES. The owner asked for nine counts side by side, and nine counts side by
// side answer «how many are at each stage» while hiding the only question worth asking of a pipeline:
// WHERE DOES IT STOP. Numbers in a row do not show a cliff. Bars on one scale do, and they do it before the
// reader has finished the first word. On the live book today the first bar is 100% and the second is 5%,
// and no arrangement of thirteen numbers would say that as fast.
//
// HOW THE SHAPE WORKS, AND WHY IT IS HONEST. Every bar is drawn to `share` — the people who got to that
// stage OR BEYOND, as a percent of the top of the funnel. Each bar is then two pieces:
//
//     ████████████████████▓▓▓▓▓▓        ← الملفات اللي وصلوا لهنا
//     └── passShare ──────┘└ atShare ┘
//     ████████████████████              ← the next stage: near enough the first piece of the one above it
//
// The gold tail of a bar is the people standing at that stage and going no further; the forest part is the
// people who moved on, and that is what the next bar shows. So the narrowing you see IS the loss, not an
// illustration of it, and a stage that loses everybody is a bar that is almost all tail. Neither piece is
// worked out here: SQL returns `share`, `atShare` and `passShare` already rounded from the counts, with the
// two pieces guaranteed to fill the bar exactly, so this file multiplies and subtracts nothing.
//
// ABSENT IS NOT ZERO. Two of the thirteen stages have no fact behind them — bb_70_journey.sql marks them
// `has_fact: false` — and they draw «—» and no bar at all, with the spine's own Arabic sentence underneath
// saying what is missing. «0 مؤهَّل» would read as a statement about the business rather than about a
// missing column. The chain of bars survives the gap: the forest part of the bar above an absent stage is
// still the bar of the stage below it, because the suffix sums are computed over all thirteen and only the
// DISPLAY of the two is withheld. Same rule one level up: when the read itself fails, the page draws no
// funnel, not a funnel made of zeros.
//
// NO ROW IS A LINK, AND THAT IS DELIBERATE. The dashboard's rule is that nothing dumps you into a list that
// does not hold exactly the rows you counted. A derived stage has no list yet: /admin/leads filters on
// public.persons.status_id, the hand-typed dropdown this whole screen exists to stop trusting, so a link
// from «العربون مدفوع» would open a page showing a different set and a different number. The queues below
// the funnel are the links. The day the leads list can filter on the derived stage, every row here gets an
// href and this paragraph goes.
//
// NOTHING HERE NAMES A STAGE IN ARABIC. Every stage label comes from settings journey.stage_<key>, every
// tree label from the owner's own offers.stock_* settings — the same ones the offer page and the public
// stock card read — and the explanation under an empty stage is bb_70's `fact_ar`. The only Arabic written
// in this file is the copy that explains the screen itself.

import type { ReactNode } from "react";

import { SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { formatCount } from "@/lib/format";

import type { Funnel, FunnelStage } from "./funnel-read";

/** How tall a bar is. Small enough that thirteen of them fit a phone, big enough to read the tail. */
const BAR = "h-2";

export function FunnelBoard({ funnel }: { funnel: Funnel }) {
  const block = funnel.stages.find((stage) => stage.isBlock) ?? null;

  return (
    <section aria-labelledby="funnel" className="space-y-3">
      <SectionHeader
        id="funnel"
        title={
          <span className="flex flex-wrap items-center gap-2">
            وين وصلوا الحرفاء
            <span className="pill pill-line tabular-nums">{formatCount(funnel.inFunnel)}</span>
          </span>
        }
        // The headline is the blockage, not the total: a stage holding most of the book is the one thing
        // this screen can tell the owner that he cannot get from any list.
        description={
          block
            ? `أكبر توقّف في «${block.label}»: ${formatCount(block.at ?? 0)} ملف واقفين هناك، ${
                block.stuck ?? 0
              }٪ من اللي وصلوا للمرحلة هاذي.`
            : "كل مرحلة محسوبة من الوقائع — مطلب، مكالمة، زيارة، زيتونات محجوزة، عربون، عقد — موش من الحالة اللي يكتبها الموظف."
        }
      />

      <div className="card p-cozy sm:p-card">
        {/* The two column captions, said once instead of thirteen times beside thirteen numbers. */}
        <div className="flex items-baseline justify-between gap-3 pb-2 text-xs text-muted">
          <span>المرحلة</span>
          <span className="flex flex-none items-baseline gap-3">
            <span className="w-12 text-end">وصلوا</span>
            <span className="w-12 text-end">واقفين</span>
          </span>
        </div>

        <ol className="divide-y divide-line">
          {funnel.stages.map((stage) => (
            <StageRow key={stage.key} stage={stage} />
          ))}
        </ol>
      </div>

      {/* What the funnel leaves out on purpose, and the one place it refuses to take sides. */}
      <dl className="grid gap-tight sm:grid-cols-3">
        <Note
          label="خرجوا من المسار"
          value={funnel.left.total}
          tone={funnel.left.conflicts > 0 ? "danger" : "muted"}
          note={
            <>
              {funnel.left.byStatus.length > 0 ? (
                <>
                  {funnel.left.byStatus.map((row, index) => (
                    <span key={row.label}>
                      {index > 0 ? " · " : ""}
                      <span className="tabular-nums">{formatCount(row.count)}</span> {row.label}
                    </span>
                  ))}{" "}
                </>
              ) : null}
              ملفات وقّفها موظف بيدو، وهذا قرار ما تنجم حتى واقعة تاخذ بلاصتو — علاش ما يتعدّاوش في المسار.
              {funnel.left.conflicts > 0 ? (
                <>
                  {" "}
                  أما <span className="tabular-nums">{formatCount(funnel.left.conflicts)}</span> منهم عندهم
                  زيتونات محجوزة ولا حجز ولا عقد مازال حيّ: هذا تناقض يلزمو يتشاف.
                </>
              ) : null}
            </>
          }
        />
        <Note
          label="الحالة اليدوية ما تمشيش مع الوقائع"
          value={funnel.mismatch}
          tone={funnel.mismatch > 0 ? "warning" : "muted"}
          note="ملفات الحالة المكتوبة فيهم تقول حاجة والوقائع تقول أخرى. المسار يتبع الواقعة، والحالة المكتوبة تتبدّل باليد — الاثنين يتعرضوا، حتى واحد ما يمحي لاخر."
        />
        <Note
          label="كل الأشخاص"
          value={funnel.peopleTotal}
          tone="muted"
          note="كل من عندو ملف عندنا، سواء دخل في المسار ولا خرج منّو. «الأرقام» في الأسفل تعدّ المطالب وأصحابها — مطلبين لنفس الشخص يتعدّوا مطلبين هناك وشخص واحد هنا."
        />
      </dl>
    </section>
  );
}

/** One stage: its name, the two figures, and the bar whose tail is the loss. */
function StageRow({ stage }: { stage: FunnelStage }) {
  return (
    // The blockage is marked with a rule along the inline start, not a tinted box: a tint would have to sit
    // outside the row's padding to look right, and a negative margin inside a divided list makes that one
    // hairline wider than the twelve others. Every row carries the same rule so the labels stay aligned.
    <li className={`border-s-2 ps-3 py-2.5 ${stage.isBlock ? "border-gold" : "border-transparent"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`truncate ${stage.hasFact ? "font-semibold text-ink" : "text-muted"}`}>{stage.label}</span>
          {stage.isBlock ? <StatusPill tone="attention">أكبر توقّف</StatusPill> : null}
          {stage.hasFact ? null : <StatusPill tone="line">ما تتحسبش</StatusPill>}
        </span>
        <span className="flex flex-none items-baseline gap-3 text-sm tabular-nums">
          <Figure caption="وصلوا لهنا" value={stage.reached} />
          <Figure caption="واقفين هنا" value={stage.at} muted={stage.at === 0} />
        </span>
      </div>

      {stage.hasFact ? (
        <>
          <Bar stage={stage} />
          {/* One caption in the whole list, on the row holding the pipeline up. The other twelve say the
              same thing with their «واقفين» figure and the tail of their bar; twelve sentences of it would
              bury the one that matters. */}
          {stage.isBlock && stage.stuck !== null ? (
            <p className="mt-1 text-xs leading-5 text-muted">
              <span className="tabular-nums">{stage.stuck}</span>٪ من اللي وصلوا لهنا وقفوا. هنا يتحبس
              المسار، وهنا تربح أكثر ما تربح كي تحلّها.
            </p>
          ) : null}
        </>
      ) : (
        // Why this row is empty, in the owner's own words from the spine — never a sentence invented here,
        // and never a zero. The day the fact exists, one edit in SQL fills the row and this text with it.
        <p className="mt-1.5 text-xs leading-5 text-muted">{stage.factAr}</p>
      )}
    </li>
  );
}

/**
 * The bar. Two pieces for a stage people are supposed to leave, one piece for the two ends of the journey
 * where standing still is the right answer and a gold «stuck» tail would be a lie.
 *
 * aria-hidden: every figure it draws is already written next to it, so a screen reader reads the numbers
 * once instead of hearing a decoration described.
 */
function Bar({ stage }: { stage: FunnelStage }) {
  if (stage.share === null) return null;

  return (
    // bg-line and not bg-paper: the track sits on a white card, and an empty track is the message on nine
    // of the thirteen rows today — «nobody got this far» has to be visible, not almost the same white.
    <div aria-hidden className={`mt-1.5 flex ${BAR} w-full overflow-hidden rounded-full bg-line`}>
      {stage.isWin ? (
        <span className={`${BAR} bg-forest`} style={{ width: `${stage.share}%` }} />
      ) : (
        <>
          <span className={`${BAR} bg-forest`} style={{ width: `${stage.passShare ?? 0}%` }} />
          <span className={`${BAR} bg-gold-bright`} style={{ width: `${stage.atShare ?? 0}%` }} />
        </>
      )}
    </div>
  );
}

/** One figure under a column caption said once at the top; the caption repeats for a screen reader only. */
function Figure({ caption, value, muted = false }: { caption: string; value: number | null; muted?: boolean }) {
  return (
    <span className={`w-12 text-end ${value === null || muted ? "text-muted" : "font-semibold text-ink"}`.trim()}>
      <span className="sr-only">{caption} </span>
      {value === null ? "—" : formatCount(value)}
    </span>
  );
}

function Note({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: ReactNode;
  tone: "muted" | "warning" | "danger";
}) {
  // text-gold on a 24px semibold figure clears the large-text contrast bar; it is never used for the body.
  const figure = tone === "danger" ? "text-danger" : tone === "warning" ? "text-gold" : "text-ink";
  return (
    <div className="card p-cozy">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${figure}`}>{formatCount(value)}</dd>
      <dd className="mt-1 text-xs leading-5 text-muted">{note}</dd>
    </div>
  );
}

/**
 * §24 — الزيتونات, counted from the trees' own status and from nothing else.
 *
 * «Stock updates per TREE, not by subtracting from a counter»: each figure is a count of rows in
 * public.trees with that state, taken in the same call as the funnel so no two numbers on this screen come
 * from two different moments. Nothing is entered by hand and nothing is added up here.
 *
 * THE TWO STATES THE OWNER ALSO NAMED. «محجوزة مؤقتاً» is not a fourth state and does not need to be: a
 * tree held by a reservation whose عربون has not arrived is already that, and the note below says so. There
 * is no way at all to take a tree off sale — «موقوفة» — which is the one state this product genuinely
 * lacks; adding it is a migration, not a screen, so this component does not pretend to show it.
 */
export function TreeStock({ trees }: { trees: Funnel["trees"] }) {
  return (
    <section aria-labelledby="tree-stock" className="space-y-3">
      <SectionHeader
        id="tree-stock"
        title="الزيتونات في كل العروض"
        description="كل رقم هنا عدد سطور في جدول الزيتونات بالحالة متاعها — موش رقم مكتوب باليد ولا طرح من عدّاد. التفصيل عرض بعرض في «العروض»."
      />
      <dl className="grid grid-cols-2 gap-tight xl:grid-cols-4">
        <StatTile size="sm" label={trees.totalLabel} value={trees.total} note="الزيتونات المرقّمة الكل، في كل العروض." />
        <StatTile size="sm" label={trees.availableLabel} value={trees.available} note="تنجم تتحجز توّا." />
        <StatTile
          size="sm"
          label={trees.reservedLabel}
          value={trees.reserved}
          note="فيهم اللي مازال عربونهم ما وصلش: الزيتونة تتحجز وقت ما يتعمل الحجز، موش وقت ما يخلّص العربون."
        />
        <StatTile size="sm" label={trees.soldLabel} value={trees.sold} note="مربوطة بصاحبها وبعقدها." />
      </dl>
    </section>
  );
}
