// «فئة المساحة والسعر»: what one tree of this offer costs, and the one thing that decides it.
//
// It was a tab of its own («التسعير») whose whole content was a verdict line, two counters and one checkbox
// form — and one of the counters counted lots, so it read «0 من 0 قطعة» beside a price it declared impossible.
// The verdict and the switch are the same subject as the rest of the offer's facts, so they sit inside
// «بيانات العرض» as a section, in view.
//
// Nothing is computed here (PRJ-03): the price per tree is what app.tree_price returned for this offer, through
// staff_project_quote. The rules behind it (land, planting, extra costs, margin, markups) stay on the pricing
// page, which this section links to.

import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { DataList, DataRow, EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { formatArea, formatMillimes, formatSpacing } from "@/lib/format";

import { saveOfferSpacingClasses } from "../actions";
import type { TreePrice } from "./identity";

export type SpacingChoice = {
  id: string;
  label_ar: string;
  /** Generated column, so the types allow null. */
  area_m2: number | null;
  row_spacing_m: number;
  tree_spacing_m: number;
  is_active: boolean;
};

export function SpacingAndPrice({
  projectId,
  attached,
  choices,
  pricePerTree,
  reasonMin,
  canWrite,
  treePricingReady,
}: {
  projectId: string;
  /** Classes stored for this offer, active or not. */
  attached: SpacingChoice[];
  /** Every spacing class; only the active ones can be attached. */
  choices: SpacingChoice[];
  pricePerTree: TreePrice;
  reasonMin: number;
  canWrite: boolean;
  /** False before the tree pricing exists at all: then there is nothing to attach and nothing to promise. */
  treePricingReady: boolean;
}) {
  const onTree = attached.length > 0;
  const active = choices.filter((choice) => choice.is_active);
  const attachedIds = new Set(attached.map((choice) => choice.id));

  return (
    <div id="spacing" className="scroll-mt-24 space-y-4">
      <SectionHeader
        level={2}
        title="فئة المساحة والسعر"
        description="مع كل زيتونة تجي مساحتها، ومنها يتحسب سعر الزيتونة في هذا العرض."
        // The rules used to be a page away. They are the next block on this same tab now, so the link scrolls
        // rather than navigates; /admin/pricing holds only the general rule the calculator estimates with.
        actions={
          <a href="#offer-pricing-rules" className="btn btn-ghost btn-sm">
            قواعد التسعير متاع هذا العرض ↓
          </a>
        }
      />

      {/* The verdict, in one sentence, before anything else. */}
      <div className={`card p-5 ${onTree ? "" : "border-gold/50 bg-gold-soft/40"}`.trim()}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={onTree ? "success" : "warning"}>{onTree ? "يتسعّر بالزيتونة" : "بلا فئة مساحة"}</StatusPill>
          <p className="font-semibold">
            {onTree
              ? "سعر الزيتونة يتحسب من فئة المساحة ومن قواعد التسعير."
              : "ما فماش فئة مساحة لهذا العرض، فما يتحسب حتى سعر للزيتونة."}
          </p>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          {onTree
            ? "القاعدة المستعملة (ثمن الأرض، الغراسة، المصاريف، الهامش، الزيادة حسب المدة) تتبدّل تحت في نفس الصفحة، ومن ثمّة يتبدّل سعر الزيتونة في هذا العرض."
            : "الموقع ما يعرض سعر وما يفتحش استمارة الاهتمام قبل ما تعلّم التباعد. علّمه من تحت."}
        </p>

        <DataList variant="grid" columns={2} className="mt-4 text-sm">
          <DataRow layout="stacked" label="السعر للزيتونة">
            {pricePerTree === null ? (
              <span className="text-xs font-normal text-danger">تعذّرت قراءة السعر. حدّث الصفحة وحاول مرة أخرى.</span>
            ) : "blocked" in pricePerTree ? (
              <span className="block text-xs font-normal leading-5 text-danger">
                {pricePerTree.blocked}
                {pricePerTree.href ? (
                  <Link href={pricePerTree.href} className="ms-1 font-semibold text-forest underline underline-offset-4">
                    {pricePerTree.action ?? "افتح الصفحة"}
                  </Link>
                ) : null}
              </span>
            ) : (
              <>
                {formatMillimes(pricePerTree.millimes)}
                {pricePerTree.annualMillimes ? (
                  <span className="block text-xs font-normal text-muted">{formatMillimes(pricePerTree.annualMillimes)} في السنة</span>
                ) : null}
              </>
            )}
          </DataRow>
          <DataRow layout="stacked" label="فئة المساحة المعتمدة" numeric={false}>
            {attached.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {attached.map((choice) => (
                  <StatusPill key={choice.id} tone={choice.is_active ? "brand" : "danger"}>
                    {choice.label_ar} · {formatSpacing(Number(choice.row_spacing_m), Number(choice.tree_spacing_m))} ·{" "}
                    {formatArea(Number(choice.area_m2))} للزيتونة
                    {choice.is_active ? "" : " · معطّلة"}
                  </StatusPill>
                ))}
              </span>
            ) : (
              <span className="text-muted">ما تعلّمت حتى وحدة</span>
            )}
          </DataRow>
        </DataList>
      </div>

      {!treePricingReady ? (
        <EmptyState size="sm">التسعير بالزيتونة مازال ما تفعّلش في هذه النسخة. العروض كاملها على المسار القديم.</EmptyState>
      ) : !canWrite ? (
        <EmptyState size="sm">فئة المساحة تتعتمد من طرف المالية أو الإدارة فقط.</EmptyState>
      ) : active.length === 0 ? (
        <EmptyState size="sm" action={<Link href="/admin/pricing" className="btn btn-secondary btn-sm">فتح فئات المساحة</Link>}>
          ما فماش فئات مساحة نشطة. زيدها أو فعّلها في «التسعير ← فئات المساحة» ثم ارجع لهنا.
        </EmptyState>
      ) : (
        <div className="card p-5">
          <h3 className="font-semibold">التباعد اللي مغروس بيه هذا العرض</h3>
          <p className="mt-0.5 text-sm text-muted">
            علامة وحدة تكفي: العرض كامل يتسعّر بالفئة المعلّمة. ما تعلّمش حتى وحدة = العرض يرجع للمسار القديم وما
            يتحسبلو حتى سعر.
          </p>
          <ActionForm
            action={saveOfferSpacingClasses.bind(null, projectId)}
            submitLabel={onTree ? "حفظ فئة المساحة" : "اعتماد فئة المساحة"}
            className="mt-4 space-y-4"
            buttonClassName="btn btn-primary btn-sm"
          >
            <fieldset>
              <legend className="sr-only">فئات المساحة المعتمدة في هذا العرض</legend>
              <div className="flex flex-wrap gap-2">
                {active.map((choice) => (
                  <label key={choice.id} className="choice min-h-11 gap-2 px-3 py-1.5 text-sm">
                    <input type="checkbox" name="ids" value={choice.id} defaultChecked={attachedIds.has(choice.id)} className="size-4 accent-forest" />
                    <span>
                      {choice.label_ar}
                      <span className="text-muted tabular-nums">
                        {" "}
                        · {formatSpacing(Number(choice.row_spacing_m), Number(choice.tree_spacing_m))} · {formatArea(Number(choice.area_m2))}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <ReasonField minLength={reasonMin} id={`offer-${projectId}-spacing-reason`} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
