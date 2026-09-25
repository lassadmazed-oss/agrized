"use client";

// THE PLAN (§11) — «ما نحجزوش 10 زيتونات، نحجزو عشر زيتونات بأرقامها».
//
// A commercial is standing in a row of olive trees with a client. The client puts a hand on a tree. The tag on
// it reads TX-00215-0128. This screen is for that moment and for nothing else:
//
//   1. «ابدأ من الرقم» — type 128, and the plan opens on the run of numbers that tree belongs to.
//   2. Tap the trees the client walked to, or type «من 125 إلى 134» and take the run in one press.
//   3. «احجز وادفع العربون» — and the DATABASE, not this screen, decides whether those ten are still free.
//
// READ ./tree-plan-model.tsx BEFORE CHANGING THE LAYOUT. It states what this grid is: the offer's number line,
// not a map of the land, because public.trees carries no position and inventing one would lie about where a
// client's tree stands.
//
// WHAT THIS FILE NEVER DOES. It does not decide whether a tree is free — it draws the state Postgres handed it,
// and that state is a photograph, already out of date by the time it is read. It does not count stock (the four
// figures come from staff_offer_stock). It does not compute a price, a deposit or a total: money is settled on
// the reservation screen this one hands off to, in millimes, in Postgres. And it never says WHO holds a taken
// tree — the read does not even select the column (§27).
//
// AT 375px, WHICH IS THE ONLY WIDTH THAT MATTERS HERE. The grid is auto-fill from 3.25rem, so a phone gets six
// columns of real tap targets and a desk gets sixteen; the chosen set and the button live in a bar stuck to the
// bottom of the screen, because a thumb that has scrolled to tree #240 must not have to scroll back to press.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { EmptyState, StatTile } from "@/components/ui";
import { formatCount } from "@/lib/format";

import {
  blocksOf,
  describeRuns,
  PLAN_MAX_SELECTION,
  parseSeq,
  seqRange,
  type PickAction,
  type PlanTree,
  type TreePlanWindow,
} from "./tree-plan-model";

/** Who the trees are being picked FOR. Every field is already known; the plan asks for none of it again (§26). */
export type PlanTarget = {
  personId: string;
  personName: string;
  requestId: string | null;
  requestNo: string | null;
};

const CELL_CLASS = {
  free: "border-line-strong bg-surface text-ink hover:border-forest",
  picked: "border-forest bg-forest text-white",
  reserved: "border-amber-200 bg-amber-50 text-amber-800",
  sold: "border-emerald-200 bg-emerald-50 text-emerald-800",
} as const;

export function TreePlan({
  plan,
  target,
  action,
  actionLabel,
  reasonMin,
  initialPicked = [],
  note,
}: {
  plan: TreePlanWindow;
  target: PlanTarget;
  /** What pressing the button does. Passed in, so this file knows nothing about reservations. */
  action: PickAction;
  actionLabel: string;
  reasonMin: number;
  /** The set carried in the address, so changing block does not lose what was already chosen. */
  initialPicked?: readonly number[];
  /** A line under the button: what the act will do, in the caller's words. */
  note?: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>(() => [...new Set(initialPicked)].sort((a, b) => a - b));
  const [jump, setJump] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();

  // A soft navigation to another block re-renders this component with a new window and a new address. When
  // React keeps the instance, `picked` is already right — we put that set in the address ourselves — and when
  // it remounts, useState seeds it. The one case left is the address changing under a kept instance (the back
  // button, a shared link), and it is adjusted DURING RENDER rather than in an effect: an effect here would
  // paint the old selection first and then correct it, which on a phone is a visible flicker of the wrong ten
  // trees. This is React's own «adjusting state when a prop changes», and it is why the set travels in the URL
  // rather than in memory.
  const pickedKey = initialPicked.join(",");
  const [seenKey, setSeenKey] = useState(pickedKey);
  if (pickedKey !== seenKey) {
    setSeenKey(pickedKey);
    setPicked([...new Set(initialPicked)].sort((a, b) => a - b));
  }

  const blocks = useMemo(() => blocksOf(plan.maxSeq, plan.blockSize), [plan.maxSeq, plan.blockSize]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const runs = useMemo(() => describeRuns(picked), [picked]);
  const free = useMemo(() => plan.trees.filter((tree) => tree.state === "available"), [plan.trees]);

  const enough = picked.length >= plan.stock.minTrees;

  function goToBlock(from: number, keep: readonly number[]) {
    const query = new URLSearchParams(window.location.search);
    query.set("from", String(from));
    if (keep.length > 0) query.set("picked", keep.join(",")); else query.delete("picked");
    router.push(`${window.location.pathname}?${query.toString()}`, { scroll: false });
  }

  function toggle(tree: PlanTree) {
    if (tree.state !== "available") return;
    setError(null);
    setTaken([]);
    setPicked((current) => {
      if (current.includes(tree.seq)) return current.filter((seq) => seq !== tree.seq);
      if (current.length >= PLAN_MAX_SELECTION) return current;
      return [...current, tree.seq].sort((a, b) => a - b);
    });
  }

  function takeRange() {
    setError(null);
    setTaken([]);
    const from = parseSeq(rangeFrom);
    const to = parseSeq(rangeTo);
    if (from === null || to === null) {
      setError("اكتب رقمين: من رقم زيتونة إلى رقم زيتونة. مثال: من 125 إلى 134.");
      return;
    }
    const wanted = seqRange(from, to);
    if (wanted.length === 0) {
      setError(
        `المدى موش صحيح: «إلى» لازم يكون أكبر ولا يساوي «من»، والمدى الواحد ما يفوتش ${formatCount(PLAN_MAX_SELECTION)} زيتونة. بدّل الرقمين وأعد المحاولة.`,
      );
      return;
    }
    // Only numbers this block can vouch for: a range typed across a block boundary would add numbers whose
    // state nobody has read, and the plan would show ten chosen trees while colouring eight of them.
    const drawable = new Map(plan.trees.map((tree) => [tree.seq, tree]));
    const outside = wanted.filter((seq) => !drawable.has(seq));
    if (outside.length > 0) {
      setError(
        `المدى يخرج من البلوك المعروض (${formatCount(plan.block.from)} – ${formatCount(plan.block.to)}). اختار مدى داخل البلوك، ولا بدّل البلوك من فوق وكمّل الاختيار.`,
      );
      return;
    }
    const busy = wanted.filter((seq) => drawable.get(seq)?.state !== "available");
    if (busy.length === wanted.length) {
      setError("كل الزيتونات في المدى هذا محجوزة ولا مباعة. اختار مدى آخر.");
      return;
    }
    const usable = wanted.filter((seq) => drawable.get(seq)?.state === "available");
    setPicked((current) => [...new Set([...current, ...usable])].sort((a, b) => a - b).slice(0, PLAN_MAX_SELECTION));
    if (busy.length > 0) {
      setError(
        `زدنا ${formatCount(usable.length)} زيتونة. ${formatCount(busy.length)} في المدى هذا ما هماش متاحين (${describeRuns(busy).join(" · ")}) وما تزادوش.`,
      );
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || picked.length === 0 || !enough) return;
    const data = new FormData(event.currentTarget);
    setError(null);
    setTaken([]);

    startTransition(async () => {
      const result = await action({
        projectId: plan.projectId,
        personId: target.personId,
        requestId: target.requestId,
        seqs: picked,
        note: String(data.get("note") ?? "").trim() || null,
        reason:
          `${String(data.get("reason") ?? "").trim()} — اختيار زيتونات بأرقامها لـ${target.personName}${target.requestNo ? ` على المطلب ${target.requestNo}` : ""}.`.trim(),
      });

      if (result.ok) {
        router.push(result.href);
        return;
      }
      setError(result.message);
      setTaken(result.taken ?? []);
      // The refusal says which numbers went; the plan says what is still free. Re-reading is how the second
      // half of §11's promise is kept, and it costs one round trip the reader is already waiting through.
      router.refresh();
    });
  }

  if (!plan.stock.numbered) {
    return (
      <EmptyState title="زيتونات هذا العرض مازالت ما ترقّمتش">
        ما فماش مخطط باش يتعرض: العرض مازال ما عندوش زيتونات مرقّمة في قاعدة البيانات. رقّمها من تبويب
        «الزيتونات» في بطاقة العرض، وكل زيتونة تولّي عندها رقم وحالة.{" "}
        <Link href={`/admin/projects/${plan.projectId}?tab=trees`} className="font-semibold underline underline-offset-4">
          افتح زيتونات العرض
        </Link>
      </EmptyState>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-snug">
      <div className="grid grid-cols-2 gap-tight lg:grid-cols-4">
        <StatTile size="sm" label={plan.labels.total} value={plan.stock.total} note="زيتونة مرقّمة" />
        <StatTile size="sm" label={plan.labels.available} value={plan.stock.available} quiet={plan.stock.available === 0} note="تنجم تتحجز توّا" />
        <StatTile size="sm" label={plan.labels.reserved} value={plan.stock.reserved} quiet={plan.stock.reserved === 0} />
        <StatTile size="sm" label={plan.labels.sold} value={plan.stock.sold} quiet={plan.stock.sold === 0} />
      </div>

      {/* WHERE TO LOOK. The client points at a tree, the commercial reads its number off the tag and types it
          here. This is the field gesture the whole screen is built around, so it comes before the grid. */}
      <div className="card space-y-snug p-cozy">
        <div className="flex flex-wrap items-end gap-tight">
          <label className="block min-w-36 flex-1 space-y-hair">
            <span className="label-sm">ابدأ من رقم الزيتونة</span>
            <input
              type="number"
              inputMode="numeric"
              dir="ltr"
              min={1}
              max={plan.maxSeq}
              value={jump}
              onChange={(event) => setJump(event.target.value)}
              placeholder={String(plan.block.from)}
              className="field field-sm tabular-nums"
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const seq = parseSeq(jump);
              if (seq === null || seq > plan.maxSeq) {
                setError(`اكتب رقماً بين 1 و${formatCount(plan.maxSeq)} — هذا هو مدى أرقام هذا العرض.`);
                return;
              }
              setError(null);
              goToBlock(seq, picked);
            }}
          >
            اقفز للرقم
          </button>
        </div>

        <label className="block space-y-hair">
          <span className="label-sm">ولا اختار البلوك</span>
          <select
            value={plan.block.from}
            onChange={(event) => goToBlock(Number(event.target.value), picked)}
            className="field field-sm tabular-nums"
            dir="ltr"
          >
            {blocks.map((block) => (
              <option key={block.from} value={block.from}>
                {block.from} – {block.to}
              </option>
            ))}
          </select>
        </label>

        <p className="hint">
          المخطط يعرض أرقام الزيتونات في هذا العرض، موش موقعها على الأرض: قاعدة البيانات مازالت ما تسجّلش موقع كل
          زيتونة. الرقم اللي في المربّع هو نفسو الرقم المكتوب على الزيتونة.
        </p>
      </div>

      {/* §11's own example, «#125 إلى #134», as two fields instead of ten taps. */}
      <div className="card flex flex-wrap items-end gap-tight p-cozy">
        <label className="block w-28 space-y-hair">
          <span className="label-sm">من رقم</span>
          <input
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={plan.block.from}
            max={plan.block.to}
            value={rangeFrom}
            onChange={(event) => setRangeFrom(event.target.value)}
            className="field field-sm tabular-nums"
          />
        </label>
        <label className="block w-28 space-y-hair">
          <span className="label-sm">إلى رقم</span>
          <input
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={plan.block.from}
            max={plan.block.to}
            value={rangeTo}
            onChange={(event) => setRangeTo(event.target.value)}
            className="field field-sm tabular-nums"
          />
        </label>
        <button type="button" onClick={takeRange} className="btn btn-secondary btn-sm">
          اختار المدى
        </button>
        <button
          type="button"
          onClick={() => {
            const next = free.slice(0, Math.max(plan.stock.minTrees, 1)).map((tree) => tree.seq);
            setError(null);
            setTaken([]);
            setPicked(next);
          }}
          className="btn btn-ghost btn-sm"
          disabled={free.length === 0}
        >
          أقلّ عدد من الفاضي
        </button>
      </div>

      <Legend labels={plan.labels} />

      {/* THE GRID. dir="ltr" so the numbers run in ascending order the way they are printed on the tags and on
          every plan sheet; each cell is a bare number, so nothing inside it needs RTL. */}
      {plan.trees.length === 0 ? (
        <EmptyState title="ما فماش زيتونات في هذا المدى" size="sm">
          بدّل البلوك من فوق، ولا اكتب رقماً موجوداً في العرض (1 – {formatCount(plan.maxSeq)}).
        </EmptyState>
      ) : (
        <div
          dir="ltr"
          role="group"
          aria-label={`زيتونات ${plan.block.from} إلى ${plan.block.to}`}
          className="grid gap-tight"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(3.25rem, 1fr))" }}
        >
          {plan.trees.map((tree) => {
            const isPicked = pickedSet.has(tree.seq);
            const wasTaken = taken.includes(tree.seq);
            const tone =
              tree.state === "sold"
                ? CELL_CLASS.sold
                : tree.state === "reserved"
                  ? CELL_CLASS.reserved
                  : isPicked
                    ? CELL_CLASS.picked
                    : CELL_CLASS.free;
            return (
              <button
                key={tree.id}
                type="button"
                onClick={() => toggle(tree)}
                disabled={tree.state !== "available"}
                aria-pressed={tree.state === "available" ? isPicked : undefined}
                title={tree.code}
                className={`flex min-h-12 items-center justify-center rounded-lg border-2 text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed ${tone} ${
                  wasTaken ? "ring-2 ring-danger ring-offset-1" : ""
                }`.replace(/\s+/g, " ")}
              >
                {tree.seq}
              </button>
            );
          })}
        </div>
      )}

      {/* THE TRAY. Stuck to the bottom because the reader has scrolled to tree #240 and the act is down here. */}
      <div className="sticky bottom-0 z-10 space-y-snug border-t border-line-strong bg-surface p-cozy">
        <div className="flex flex-wrap items-baseline justify-between gap-tight">
          <p className="text-sm">
            <span className="font-semibold text-ink">{formatCount(picked.length)} زيتونة مختارة</span>
            {plan.stock.minTrees > 1 ? (
              <span className={enough ? "text-muted" : "text-danger"}>
                {" · "}أقلّ عدد في هذا العرض: <span className="tabular-nums">{formatCount(plan.stock.minTrees)}</span>
              </span>
            ) : null}
          </p>
          {picked.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPicked([]);
                setError(null);
                setTaken([]);
              }}
            >
              امسح الاختيار
            </button>
          ) : null}
        </div>

        {runs.length > 0 ? (
          <p dir="ltr" className="text-sm tabular-nums text-muted">
            {runs.join(" · ")}
          </p>
        ) : null}

        <label className="block">
          <span className="label-sm">ملاحظة</span>
          <input type="text" name="note" maxLength={200} className="field field-sm" disabled={pending} />
        </label>

        <ReasonField
          minLength={reasonMin}
          id={`plan-reason-${plan.projectId}`}
          label="سبب الاختيار"
          hint="يتسجّل في سجل العمليات مع أرقام الزيتونات المختارة."
        />

        {error ? (
          <p role="alert" className="error-text">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={pending || picked.length === 0 || !enough} className="btn btn-primary w-full">
          {pending ? "جارٍ التثبيت…" : actionLabel}
        </button>
        {note ? <p className="hint">{note}</p> : null}
      </div>
    </form>
  );
}

function Legend({ labels }: { labels: TreePlanWindow["labels"] }) {
  const items = [
    { label: labels.available, className: CELL_CLASS.free },
    { label: "مختارة توّا", className: CELL_CLASS.picked },
    { label: labels.reserved, className: CELL_CLASS.reserved },
    { label: labels.sold, className: CELL_CLASS.sold },
  ];
  return (
    <ul className="flex flex-wrap gap-tight">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden="true" className={`inline-block size-4 rounded border-2 ${item.className}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
