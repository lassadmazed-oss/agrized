import { Sprout, TreeDeciduous, Users } from "lucide-react";
import type { ReactNode } from "react";

import { formatCount } from "@/lib/format";
import type { MillionProgress } from "@/lib/million";

type MillionCounterProps = {
  progress: MillionProgress;
  title: string;
  note: string;
};

/**
 * «وين وصلنا؟» — the visible progress toward one million olive trees, laid out like the board's
 * impact panel: the bar on one side, one tile per figure on the other.
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
    <section id="million" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
        <div>
          <h2 className="section-title">{title}</h2>
          {note ? <p className="section-lead mt-3 max-w-lg">{note}</p> : null}

          <div className="card mt-8 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm text-muted">
                <span className="text-3xl font-bold text-forest tabular-nums">{formatCount(treesRequested)}</span> زيتونة
                مطلوبة
              </p>
              <p className="text-sm text-muted">
                الهدف: <span className="font-semibold text-ink tabular-nums">{formatCount(goal)}</span> زيتونة
              </p>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-valuenow={treesRequested}
              aria-label={`${formatCount(treesRequested)} من ${formatCount(goal)} زيتونة`}
              className="mt-4 h-3 w-full overflow-hidden rounded-full bg-leaf-soft"
            >
              <div
                style={{ width: `${barWidth}%` }}
                className="h-full rounded-full bg-linear-to-l from-leaf to-forest transition-[width] duration-700"
              />
            </div>
            <p className="mt-3 text-sm text-muted">
              {treesRequested > 0
                ? `${formatShare(share)} من الهدف`
                : "المشروع في بدايته: مازال ما وصلنا حتى مطلب بعدد زيتونات محدّد."}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            icon={<TreeDeciduous className="size-11" strokeWidth={1.4} />}
            label="زيتونات مطلوبة"
            value={treesRequested}
            hint="مجموع ما طلبه الناس فعلاً."
          />
          <Stat
            icon={<Users className="size-11" strokeWidth={1.4} />}
            label="عدد المشاركين"
            value={participants}
            hint="كل شخص يُحتسب مرة واحدة."
          />
          <Stat
            icon={<Sprout className="size-11" strokeWidth={1.4} />}
            label="مشاريع قيد الدراسة"
            value={projectsUnderStudy}
            hint="عقارات تحت الدراسة قبل أي عرض."
            className="col-span-2 sm:col-span-1"
          />
        </dl>
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
  className?: string;
}) {
  return (
    <div className={`card flex flex-col items-center px-4 py-7 text-center ${className}`}>
      <span aria-hidden="true" className="text-forest">
        {icon}
      </span>
      <dd className="mt-3 text-4xl font-bold text-ink tabular-nums">{formatCount(value)}</dd>
      <dt className="mt-1 font-medium text-ink/80">{label}</dt>
      <p className="mt-2 text-xs leading-5 text-muted">{hint}</p>
    </div>
  );
}

/** Says "أقل من 0.1%" rather than rounding a real 0.03% up to a friendlier number. */
function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 0.1) return "أقل من 0.1%";
  return `${formatCount(Number(percent.toFixed(percent < 10 ? 1 : 0)))}%`;
}
