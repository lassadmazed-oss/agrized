import { formatCount } from "@/lib/format";
import type { MillionProgress } from "@/lib/million";

type MillionCounterProps = {
  progress: MillionProgress;
  title: string;
  note: string;
};

/**
 * «وين وصلنا؟» — the visible progress toward one million olive trees.
 *
 * MIL-01: these are counts of real rows. Nothing here is a target, an estimate or a projection, and
 * the bar shows the true share even when that share is a sliver.
 */
export function MillionCounter({ progress, title, note }: MillionCounterProps) {
  const { goal, treesRequested, participants, projectsUnderStudy } = progress;
  const share = goal > 0 ? Math.min(treesRequested / goal, 1) : 0;
  // A real but tiny share still deserves a mark on the bar, never a rounded-up number next to it.
  const barWidth = treesRequested > 0 ? Math.max(share * 100, 0.8) : 0;

  return (
    <section id="million" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">{title}</h2>
          <p className="text-sm text-muted">
            الهدف: <span className="font-semibold text-ink tabular-nums">{formatCount(goal)}</span> زيتونة
          </p>
        </div>

        <div className="mt-6">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={treesRequested}
            aria-label={`${formatCount(treesRequested)} من ${formatCount(goal)} زيتونة`}
            className="h-4 w-full overflow-hidden rounded-full bg-leaf-soft"
          >
            <div
              style={{ width: `${barWidth}%` }}
              className="h-full rounded-full bg-linear-to-l from-leaf to-forest transition-[width] duration-700"
            />
          </div>
          <p className="mt-3 text-sm text-muted">
            {treesRequested > 0 ? (
              <>
                <span className="font-semibold text-forest tabular-nums">{formatCount(treesRequested)}</span> زيتونة
                مطلوبة من {formatCount(goal)} · {formatShare(share)}
              </>
            ) : (
              "المشروع في بدايته: مازال ما وصلنا حتى مطلب بعدد زيتونات محدّد."
            )}
          </p>
        </div>

        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="زيتونات مطلوبة" value={treesRequested} hint="مجموع ما طلبه الناس فعلاً." />
          <Stat label="عدد المشاركين" value={participants} hint="كل شخص يُحتسب مرة واحدة." />
          <Stat label="مشاريع قيد الدراسة" value={projectsUnderStudy} hint="عقارات تحت الدراسة قبل أي عرض." />
        </dl>

        {note ? <p className="mt-6 text-sm leading-6 text-muted">{note}</p> : null}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-4xl font-bold text-forest tabular-nums">{formatCount(value)}</dd>
      <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>
    </div>
  );
}

/** Says "أقل من 0.1%" rather than rounding a real 0.03% up to a friendlier number. */
function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 0.1) return "أقل من 0.1%";
  return `${formatCount(Number(percent.toFixed(percent < 10 ? 1 : 0)))}%`;
}
