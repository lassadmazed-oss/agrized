import Link from "next/link";

import { parcelStatusLabel, parcelStatusTone } from "@/lib/projects";

export type PlanTile = {
  id: string;
  code: string;
  status: string;
  href: string;
  /** Short facts under the code, e.g. «500 م²». */
  detail: string;
};

/**
 * Report v3 §21: every parcel of a project as a tile coloured by its status, opening the parcel.
 * A schematic plan in the project's own order until parcels carry real geometry. The status is also
 * written in text, so the colour is never the only signal.
 */
export function ParcelPlan({ tiles, title }: { tiles: PlanTile[]; title: string }) {
  if (tiles.length === 0) return null;
  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tile.status, (counts.get(tile.status) ?? 0) + 1);

  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-semibold text-ink">{title}</h3>
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {[...counts].map(([status, count]) => (
            <li key={status} className={`rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${parcelStatusTone(status)}`}>
              {parcelStatusLabel(status)} · <span className="tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      </div>

      <ol className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Link
              href={tile.href}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl px-1 text-center ring-1 ring-inset transition-transform hover:scale-[1.03] ${parcelStatusTone(tile.status)}`}
            >
              <span dir="ltr" className="text-sm font-bold">
                {tile.code}
              </span>
              <span className="sr-only">{parcelStatusLabel(tile.status)}</span>
              <span className="mt-0.5 hidden text-[0.65rem] leading-tight tabular-nums sm:block">{tile.detail}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
