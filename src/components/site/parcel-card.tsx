import { LandPlot, TreeDeciduous } from "lucide-react";
import Link from "next/link";

import { FactTile } from "@/components/site/fact-tile";
import { ParcelRow } from "@/components/site/parcel-row";
import { RemotePhoto } from "@/components/site/site-photo";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount, formatMillimes } from "@/lib/format";
import { parcelStatusLabel, parcelStatusTone, PROPERTY_TYPE_LABELS } from "@/lib/projects";
import type { PublicParcel } from "@/lib/public-projects";

type ParcelCardProps = {
  parcel: PublicParcel;
  href: string;
  /** Shown under the code on grids that mix projects. */
  place?: string;
  pricePending: string;
};

/**
 * PARC-11: a price never appears without the area, tree count, plantation system and production
 * status next to it. PARC-02: each of those is the parcel's own value, never computed from another.
 */
export function ParcelCard({ parcel, href, place, pricePending }: ParcelCardProps) {
  const trees = parcel.property_type === "bare_land" ? PROPERTY_TYPE_LABELS.bare_land : formatCount(parcel.olive_tree_count ?? 0);

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-float">
      <Link href={href} className="block h-full focus-visible:outline-offset-[-2px]">
        <RemotePhoto
          url={parcel.photo_url}
          alt={parcel.photo_alt_ar}
          seed={parcel.id}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
          className="aspect-4/3"
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-ink">القطعة {parcel.code}</h3>
              <p className="mt-0.5 truncate text-sm text-muted">{place ?? parcel.project_name}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${parcelStatusTone(parcel.status)}`}>
              {parcelStatusLabel(parcel.status)}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <FactTile icon={<LandPlot aria-hidden="true" className="size-4" />} label="المساحة">
              {formatCount(parcel.area_m2)} م²
            </FactTile>
            <FactTile icon={<TreeDeciduous aria-hidden="true" className="size-4" />} label="عدد الزيتونات">
              {trees}
            </FactTile>
          </dl>
          <dl className="mt-3 space-y-2 text-sm">
            <ParcelRow label="نوع الغراسة">
              {parcel.plantation_system ? (PLANTATION_LABELS[parcel.plantation_system] ?? parcel.plantation_system) : "—"}
            </ParcelRow>
            <ParcelRow label="حالة الإنتاج">
              {parcel.production_status ? (PRODUCTION_LABELS[parcel.production_status] ?? parcel.production_status) : "—"}
            </ParcelRow>
          </dl>

          {parcel.offered ? (
            <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-sm">
              {parcel.cash_price_millimes ? (
                <>
                  <span className="text-muted">السعر حاضر</span>
                  <span className="text-xl font-bold text-forest tabular-nums">{formatMillimes(parcel.cash_price_millimes)}</span>
                </>
              ) : (
                <span className="text-muted">{pricePending}</span>
              )}
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
