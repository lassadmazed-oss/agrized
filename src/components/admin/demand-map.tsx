// Demand map (spec v2 §55): a tile cartogram of the governorates, rendered on the server with plain HTML.
// One hue from light to dark, the value printed on every tile, and an equivalent table for screen readers.

import Link from "next/link";

import { formatCount } from "@/lib/format";

export type MapTile = {
  id: number;
  name: string;
  row: number;
  col: number;
  value: number;
  secondary?: number;
  href?: string;
};

// Olive ramp; the two darkest steps carry white text to stay above 4.5:1.
const STEPS = [
  { background: "#e8eed9", color: "#1b2a1f" },
  { background: "#c9d8a6", color: "#1b2a1f" },
  { background: "#9db86a", color: "#1b2a1f" },
  { background: "#5f7f2f", color: "#ffffff" },
  { background: "#1f4a2c", color: "#ffffff" },
];

type Bin = { lower: number; upper: number; step: number };

/** Equal-width integer bins up to the largest value; with few distinct bins the steps spread over the ramp. */
function binsFor(max: number): Bin[] {
  const ranges: { lower: number; upper: number }[] = [];
  let lower = 1;
  for (let index = 1; index <= STEPS.length; index += 1) {
    const upper = Math.ceil((max * index) / STEPS.length);
    if (upper >= lower) {
      ranges.push({ lower, upper });
      lower = upper + 1;
    }
  }
  const last = STEPS.length - 1;
  return ranges.map((range, index) => ({
    ...range,
    step: ranges.length === 1 ? last : Math.round((index * last) / (ranges.length - 1)),
  }));
}

type DemandMapProps = {
  tiles: MapTile[];
  /** Unit read after each value, e.g. «مطلب». */
  unit: string;
  valueLabel: string;
  secondaryLabel?: string;
  caption: string;
};

export function DemandMap({ tiles, unit, valueLabel, secondaryLabel, caption }: DemandMapProps) {
  const max = Math.max(0, ...tiles.map((tile) => tile.value));
  const bins = binsFor(max);
  const stepOf = (value: number) => (value > 0 ? (bins.find((bin) => value <= bin.upper) ?? bins[bins.length - 1]).step : null);
  const rows = Math.max(1, ...tiles.map((tile) => tile.row));
  const cols = Math.max(1, ...tiles.map((tile) => tile.col));
  const ranked = [...tiles].sort((a, b) => b.value - a.value || a.row - b.row || a.col - b.col);

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        {/* Columns run west to east whatever the page direction, so the coast stays on the right. */}
        <ul
          aria-label={caption}
          dir="ltr"
          className="mx-auto grid min-w-[20rem] max-w-md gap-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(3.75rem, auto))` }}
        >
          {tiles.map((tile) => {
            const step = stepOf(tile.value);
            const tone = step === null ? null : STEPS[step];
            const summary = `${tile.name}: ${formatCount(tile.value)} ${unit}${
              secondaryLabel && tile.secondary !== undefined ? ` · ${secondaryLabel}: ${formatCount(tile.secondary)}` : ""
            }`;
            const body = (
              <>
                <span className="block break-words text-[0.7rem] leading-tight">{tile.name}</span>
                <span className="mt-1 block text-sm font-semibold tabular-nums">
                  {formatCount(tile.value)}
                  <span className="sr-only"> {unit}</span>
                </span>
              </>
            );
            const tileClass = `flex h-full min-w-0 flex-col justify-between rounded-md p-1.5 text-center ${
              tone ? "" : "border border-dashed border-line-strong bg-surface text-muted"
            }`;
            const tileStyle = tone ? { background: tone.background, color: tone.color } : undefined;

            return (
              <li key={tile.id} dir="rtl" title={summary} style={{ gridRow: tile.row, gridColumn: tile.col }}>
                {tile.href ? (
                  <Link href={tile.href} className={`${tileClass} transition-opacity hover:opacity-85`} style={tileStyle}>
                    {body}
                  </Link>
                ) : (
                  <span className={tileClass} style={tileStyle}>
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3.5 rounded-sm border border-dashed border-line-strong bg-surface" />
          <span className="tabular-nums">0</span>
        </span>
        {bins.map((bin) => (
          <span key={bin.step} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-3.5 rounded-sm" style={{ background: STEPS[bin.step].background }} />
            <span dir="ltr" className="tabular-nums">
              {bin.lower === bin.upper ? formatCount(bin.lower) : `${formatCount(bin.lower)}–${formatCount(bin.upper)}`}
            </span>
          </span>
        ))}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-forest">عرض الجدول</summary>
        <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-paper text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  الولاية
                </th>
                <th scope="col" className="px-3 py-2 text-end font-semibold">
                  {valueLabel}
                </th>
                {secondaryLabel ? (
                  <th scope="col" className="px-3 py-2 text-end font-semibold">
                    {secondaryLabel}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranked.map((tile) => (
                <tr key={tile.id}>
                  <th scope="row" className="px-3 py-1.5 text-start font-normal">
                    {tile.href ? (
                      <Link href={tile.href} className="text-forest underline-offset-4 hover:underline">
                        {tile.name}
                      </Link>
                    ) : (
                      tile.name
                    )}
                  </th>
                  <td className="px-3 py-1.5 text-end tabular-nums">{formatCount(tile.value)}</td>
                  {secondaryLabel ? <td className="px-3 py-1.5 text-end tabular-nums">{formatCount(tile.secondary ?? 0)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
