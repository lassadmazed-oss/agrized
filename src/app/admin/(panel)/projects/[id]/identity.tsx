// What an offer *is*, as the owner describes one out loud:
// «OFF-TNAYEUR, طريق تنيور كم 27، 57,600 م²، 100 زيتونة شملالي، 40 سنة، منتج، ~576 م² للزيتونة، رسم عقاري، 4,491 د للزيتونة».
//
// These are the first-class facts of real stock, so they sit at the top of the page, above the tabs, and never
// behind one. Server component: no state, no client boundary.
//
// Nothing here computes a price: the figure per tree is passed in, already computed by the database
// (app.tree_price through app.project_quote_payload / staff_project_quote) and formatted through src/lib/format.

import Link from "next/link";

import { DataList, DataRow, StatusPill } from "@/components/ui";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";

/**
 * Where «المساحة لكل زيتونة» comes from, so an estimate is never read as a surveyed figure. Two sources, not
 * three: the offer's spacing class measures one tree exactly, and its own two declared numbers only estimate it.
 * The third, «محسوبة في القطع», died with the lot layer — an offer holds trees, not lots.
 */
export type AreaPerTree = { m2: number; source: "class" | "declared" };

const AREA_SOURCE_NOTE: Record<AreaPerTree["source"], string> = {
  class: "من فئة المساحة",
  declared: "تقديرية: المساحة ÷ الزيتونات",
};

/**
 * The price per tree, or what stops it from existing — and, when something does, what to do about it: `blocked`
 * names the missing input, `href` and `action` open the screen that supplies it. «يتحدّد بعد اعتماد فئة المساحة»
 * named no actor, no field and no screen, and was false on both live offers, whose class is attached.
 *
 * A third field, `varies`, stood on the first branch: «the lots of this offer are not all priced alike». An
 * offer carries one spacing class and no lots, so nothing has set it since; it left with the التسعير tab that
 * was its last reader.
 */
export type TreePrice =
  | { millimes: number; annualMillimes?: number | null }
  | { blocked: string; href?: string; action?: string }
  | null;

export function OfferIdentity({
  locationText,
  totalAreaM2,
  declaredTrees,
  variety,
  ageYears,
  productionText,
  plantationText,
  irrigationText,
  areaPerTree,
  documents,
  pricePerTree,
}: {
  /** «طريق تنيور كم 27 · صفاقس» — the offer's own words plus its governorate. */
  locationText: string;
  totalAreaM2: number | null;
  declaredTrees: number | null;
  variety: string | null;
  ageYears: number | null;
  productionText: string | null;
  plantationText: string | null;
  irrigationText: string | null;
  areaPerTree: AreaPerTree | null;
  /** Names of the documents this offer holds (رسم عقاري…), from the land_document list (PRN-02). */
  documents: string[];
  pricePerTree: TreePrice;
}) {
  return (
    <section aria-label="بطاقة العرض" className="card p-5 sm:p-6">
      <DataList variant="grid" columns={4} className="text-sm">
        <DataRow layout="stacked" label="الموقع" numeric={false} className="col-span-2">
          {locationText || "—"}
        </DataRow>
        <DataRow layout="stacked" label="المساحة الجملية">{totalAreaM2 ? formatArea(totalAreaM2) : "—"}</DataRow>
        <DataRow layout="stacked" label="عدد الزيتونات">{declaredTrees ? formatCount(declaredTrees) : "—"}</DataRow>
        <DataRow layout="stacked" label="الصنف" numeric={false}>{variety || "—"}</DataRow>
        <DataRow layout="stacked" label="عمر الزيتونات">{ageYears ? `${formatCount(ageYears)} سنة` : "—"}</DataRow>
        <DataRow layout="stacked" label="حالة الإنتاج" numeric={false}>{productionText || "—"}</DataRow>
        <DataRow layout="stacked" label="الغراسة والري" numeric={false}>
          {[plantationText, irrigationText].filter(Boolean).join(" · ") || "—"}
        </DataRow>
        <DataRow layout="stacked" label="المساحة لكل زيتونة">
          {areaPerTree ? (
            <>
              {formatArea(areaPerTree.m2)}
              <span className="block text-xs font-normal text-muted">{AREA_SOURCE_NOTE[areaPerTree.source]}</span>
            </>
          ) : (
            "—"
          )}
        </DataRow>
        <DataRow layout="stacked" label="السعر للزيتونة">
          <TreePriceValue price={pricePerTree} />
        </DataRow>
        <DataRow layout="stacked" label="الوثائق" numeric={false} className="col-span-2">
          {documents.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {documents.map((document) => (
                <StatusPill key={document} tone="line">
                  {document}
                </StatusPill>
              ))}
            </span>
          ) : (
            <span className="text-muted">ما تحدّدتش — علّمها في تبويب «بيانات العرض»</span>
          )}
        </DataRow>
      </DataList>
    </section>
  );
}

function TreePriceValue({ price }: { price: TreePrice }) {
  if (price === null) {
    return <span className="text-xs font-normal text-danger">تعذّرت قراءة السعر من قاعدة البيانات. حدّث الصفحة وحاول مرة أخرى.</span>;
  }

  if ("blocked" in price) {
    return (
      <span className="block text-xs font-normal leading-5 text-danger">
        {price.blocked}
        {price.href ? (
          <Link href={price.href} className="ms-1 font-semibold text-forest underline underline-offset-4">
            {price.action ?? "افتح الصفحة"}
          </Link>
        ) : null}
      </span>
    );
  }

  return (
    <>
      {formatMillimes(price.millimes)}
      {price.annualMillimes ? (
        <span className="block text-xs font-normal text-muted">{formatMillimes(price.annualMillimes)} في السنة</span>
      ) : null}
    </>
  );
}
