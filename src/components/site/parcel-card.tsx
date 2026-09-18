import Link from "next/link";

import { RemotePhoto } from "@/components/site/site-photo";
import { DataRow } from "@/components/ui";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import { durationLabel, OFFER_TYPE_LABELS, offerTypeOf, parcelStatusLabel, parcelStatusTone, PROPERTY_TYPE_LABELS } from "@/lib/projects";
import type { PublicParcel } from "@/lib/public-projects";

type ParcelCardProps = {
  parcel: PublicParcel;
  href: string;
  /** Shown under the code on grids that mix projects. */
  place?: string;
  pricePending: string;
  /** Longest payment duration offered, in months (report v3 §19 «التقسيط حتى 7 سنوات»); hidden when unknown. */
  maxMonths?: number | null;
};

/**
 * PARC-11: a price never appears without the area, tree count, plantation system and production
 * status next to it. PARC-02: each of those is the parcel's own value, never computed from another.
 */
export function ParcelCard({ parcel, href, place, pricePending, maxMonths }: ParcelCardProps) {
  const trees = parcel.property_type === "bare_land" ? PROPERTY_TYPE_LABELS.bare_land : formatCount(parcel.olive_tree_count ?? 0);

  return (
    <li className="card overflow-hidden transition-shadow hover:shadow-[0_18px_40px_-28px_rgba(31,74,44,0.45)]">
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
              <p className="text-xs font-semibold text-leaf">{OFFER_TYPE_LABELS[offerTypeOf(parcel)]}</p>
              <h3 className="mt-0.5 font-semibold text-ink">القطعة {parcel.code}</h3>
              <p className="mt-0.5 truncate text-sm text-muted">{place ?? parcel.project_name}</p>
            </div>
            <span className={`pill shrink-0 ring-1 ring-inset ${parcelStatusTone(parcel.status)}`}>
              {parcelStatusLabel(parcel.status)}
            </span>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <DataRow padded={false} label="المساحة">{formatCount(parcel.area_m2)} م²</DataRow>
            <DataRow padded={false} label="عدد الزيتونات">{trees}</DataRow>
            {parcel.on_tree_pricing && parcel.area_per_tree_m2 ? (
              <DataRow padded={false} label="مساحة كل زيتونة">{formatArea(parcel.area_per_tree_m2)}</DataRow>
            ) : null}
            <DataRow padded={false} label="نوع الغراسة">
              {parcel.plantation_system ? (PLANTATION_LABELS[parcel.plantation_system] ?? parcel.plantation_system) : "—"}
            </DataRow>
            <DataRow padded={false} label="حالة الإنتاج">
              {parcel.production_status ? (PRODUCTION_LABELS[parcel.production_status] ?? parcel.production_status) : "—"}
            </DataRow>
          </dl>

          {parcel.offered ? (
            <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
              {parcel.on_tree_pricing ? (
                // Plan P5-3: one tree with its area is the unit, so its price leads and the total follows.
                parcel.price_per_tree_millimes && parcel.cash_price_millimes ? (
                  <>
                    <p>
                      <span className="text-muted">السعر للزيتونة </span>
                      <span className="font-display text-xl font-bold text-forest tabular-nums">
                        {formatMillimes(parcel.price_per_tree_millimes)}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted">السعر الجملي </span>
                      <span className="font-semibold text-ink tabular-nums">{formatMillimes(parcel.cash_price_millimes)}</span>
                    </p>
                    {parcel.down_from_millimes ? (
                      <p className="font-semibold text-ink">
                        ابتداءً من <span className="tabular-nums">{formatMillimes(parcel.down_from_millimes)}</span> تسبقة
                      </p>
                    ) : null}
                    {maxMonths ? <p className="text-muted">التقسيط حتى {durationLabel(maxMonths)}</p> : null}
                  </>
                ) : (
                  <p className="text-muted">{pricePending}</p>
                )
              ) : parcel.cash_price_millimes ? (
                <>
                  <p>
                    <span className="text-muted">السعر حاضر </span>
                    <span className="font-display text-xl font-bold text-forest tabular-nums">
                      {formatMillimes(parcel.cash_price_millimes)}
                    </span>
                  </p>
                  {parcel.down_from_millimes ? (
                    <p className="font-semibold text-ink">
                      ابتداءً من <span className="tabular-nums">{formatMillimes(parcel.down_from_millimes)}</span> تسبقة
                    </p>
                  ) : null}
                  {maxMonths ? <p className="text-muted">التقسيط حتى {durationLabel(maxMonths)}</p> : null}
                </>
              ) : (
                <p className="text-muted">{pricePending}</p>
              )}
            </div>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
