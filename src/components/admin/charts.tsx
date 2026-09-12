// Dashboard charts, rendered on the server with plain HTML and CSS.
// Single series each: one mark color, labels in text tokens, hairline grid, table view for columns.

import { formatCount, formatDate } from "@/lib/format";

const MARK = "#5f7f2f"; // olive, >= 3:1 on the white card
const MARK_EMPHASIS = "#1f4a2c"; // current period

export type BarItem = { key: string; label: string; count: number };

/** Horizontal bars with the value at the tip. Categories keep the order they are given. */
export function BarList({ items, total, emptyText = "لا توجد بيانات بعد." }: { items: BarItem[]; total?: number; emptyText?: string }) {
  const max = Math.max(0, ...items.map((item) => item.count));
  if (max === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>;
  }

  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const share = total ? Math.round((item.count / total) * 100) : null;
        return (
          <li
            key={item.key}
            title={`${item.label}: ${formatCount(item.count)}`}
            className="grid grid-cols-[minmax(5.5rem,8.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-md px-1 py-1 text-sm hover:bg-paper"
          >
            <span className="truncate text-ink">{item.label}</span>
            <span className="relative block h-3" aria-hidden="true">
              {item.count > 0 ? (
                <span
                  className="absolute inset-y-0 start-0 rounded-e-[4px]"
                  style={{ width: `max(2px, ${(item.count / max) * 100}%)`, background: MARK }}
                />
              ) : null}
            </span>
            <span className="text-end text-ink tabular-nums">
              {formatCount(item.count)}
              {share !== null ? <span className="text-xs text-muted"> · {share}%</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function niceCeiling(value: number): number {
  if (value <= 2) return 2;
  const base = 10 ** Math.floor(Math.log10(value));
  for (const multiple of [1, 2, 4, 10]) {
    if (multiple * base >= value) return multiple * base;
  }
  return 10 * base;
}

/** Requests per day. Oldest day at the start (right), today at the end, emphasized. */
export function DailyColumns({ days }: { days: { day: string; count: number }[] }) {
  const max = Math.max(0, ...days.map((d) => d.count));
  const top = niceCeiling(max);
  const ticks = [top, top / 2, 0];
  const plotHeight = 160;

  return (
    <div>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
        {/* Y axis */}
        <div className="relative text-xs text-muted tabular-nums" style={{ height: plotHeight }} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="absolute end-0 -translate-y-1/2" style={{ top: `${(1 - tick / top) * 100}%` }}>
              {formatCount(tick)}
            </span>
          ))}
        </div>

        <div>
          {/* Plot */}
          <div className="relative" style={{ height: plotHeight }}>
            {ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden="true"
                className="absolute inset-x-0 h-px bg-line"
                style={{ top: `${(1 - tick / top) * 100}%` }}
              />
            ))}
            <div className="relative flex h-full items-end gap-[2px]">
              {days.map((d, index) => {
                const isToday = index === days.length - 1;
                const label = `${formatDate(`${d.day}T12:00:00Z`)}${isToday ? " (اليوم)" : ""}: ${formatCount(d.count)} مطلب`;
                return (
                  <div
                    key={d.day}
                    tabIndex={0}
                    role="img"
                    aria-label={label}
                    className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
                  >
                    {d.count > 0 ? (
                      <span
                        className="block w-full max-w-5 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                        style={{ height: `${(d.count / top) * 100}%`, background: isToday ? MARK_EMPHASIS : MARK }}
                      />
                    ) : null}
                    <span className="pointer-events-none absolute bottom-full z-10 mb-2 hidden whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs text-paper shadow-lg group-hover:block group-focus-visible:block">
                      <span className="block font-semibold tabular-nums">{formatCount(d.count)} مطلب</span>
                      <span className="block text-paper/70 tabular-nums">{formatDate(`${d.day}T12:00:00Z`)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis: a few dates only */}
          <div className="mt-2 flex gap-[2px] text-[0.7rem] text-muted tabular-nums" aria-hidden="true">
            {days.map((d, index) => (
              <span key={d.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                {index % 7 === 0 || index === days.length - 1 ? formatDate(`${d.day}T12:00:00Z`).slice(0, 5) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-forest">عرض الجدول</summary>
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-paper text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">اليوم</th>
                <th className="px-3 py-2 text-end font-semibold">المطالب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="px-3 py-1.5 tabular-nums">{formatDate(`${d.day}T12:00:00Z`)}</td>
                  <td className="px-3 py-1.5 text-end tabular-nums">{formatCount(d.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function StatTile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-ink">{formatCount(value)}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}
