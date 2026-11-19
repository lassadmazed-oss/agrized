// «شروط البيع» (0180, owner 2026-11-19: «فما فرق ما بين العربون وما بين التسبقة … كل عرض فيه كذا كذا»).
//
// Two sums, two moments. العربون is what the commercial takes on the land to hold the trees; it is counted toward
// the down payment. التسبقة is a percentage of the price, paid at the office with the contract — and once it is
// paid in full and the schedule exists, the client becomes the owner by himself (app.contract_auto_own).
// Every figure here is the offer's own or, when the box is empty, the general setting printed beside it.

import { ActionForm } from "@/components/admin/action-form";
import { formatCount, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { saveOfferSaleTerms } from "./sale-terms-actions";

export type Terms = {
  deposit_millimes: number | null;
  valid_days: number | null;
  down_payment_percent: number | null;
  default_deposit_millimes: number;
  default_valid_days: number;
  default_down_payment_percent: number;
  owner_on_down_payment: boolean;
};

const num = (value: unknown): number | null => {
  const figure = typeof value === "string" ? Number(value) : value;
  return typeof figure === "number" && Number.isFinite(figure) ? figure : null;
};

function readTerms(value: unknown): Terms | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    deposit_millimes: num(row.deposit_millimes),
    valid_days: num(row.valid_days),
    down_payment_percent: num(row.down_payment_percent),
    default_deposit_millimes: num(row.default_deposit_millimes) ?? 0,
    default_valid_days: num(row.default_valid_days) ?? 0,
    default_down_payment_percent: num(row.default_down_payment_percent) ?? 0,
    owner_on_down_payment: row.owner_on_down_payment === true,
  };
}

/** Millimes as the dinars a person types: 50000 → «50», 52500 → «52.5». */
const dinarsText = (millimes: number | null) => (millimes === null ? "" : String(millimes / 1000));

export async function SaleTerms({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_offer_sale_terms", { p_project: projectId });
  return <SaleTermsCard projectId={projectId} terms={error ? null : readTerms(data)} />;
}

export function SaleTermsCard({ projectId, terms }: { projectId: string; terms: Terms | null }) {
  return (
    <section id="sale-terms" aria-labelledby="sale-terms-title" className="card scroll-mt-6 space-y-4 p-5 sm:p-6">
      <div>
        <h2 id="sale-terms-title" className="section-title">
          شروط البيع: العربون والتسبقة
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          <b className="text-ink">العربون</b> يتخلّص في الميدان باش تتحجز الزيتونات، ويتحسب من التسبقة.{" "}
          <b className="text-ink">التسبقة</b> نسبة من السوم تتخلّص في الإدارة مع العقد.
          {terms?.owner_on_down_payment
            ? " كي التسبقة تتخلّص كاملة وجدول الأقساط يتعمل، الحريف يولّي مالك وحدو — من غير زرّ."
            : " قاعدة «يولّي مالك وحدو» موقوفة في الإعدادات العامة: التملّك يتسجّل باليد من صفحة العقد."}
        </p>
      </div>

      {terms === null ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          ما نجّمناش نقراو شروط البيع متاع هذا العرض. حدّث الصفحة؛ وكان تعاود الخطأ، اعلم التقني.
        </p>
      ) : (
        <ActionForm action={saveOfferSaleTerms.bind(null, projectId)} submitLabel="سجّل شروط البيع" buttonClassName="btn btn-primary btn-sm">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="block text-sm font-semibold">العربون (دينار)</span>
              <input
                name="deposit_dinars"
                inputMode="decimal"
                dir="ltr"
                defaultValue={dinarsText(terms.deposit_millimes)}
                placeholder={dinarsText(terms.default_deposit_millimes)}
                className="field"
              />
              <span className="hint block">فارغ = القيمة العامة: {formatMillimes(terms.default_deposit_millimes)}</span>
            </label>
            <label className="block space-y-1">
              <span className="block text-sm font-semibold">مدّة الحجز (أيام)</span>
              <input
                name="valid_days"
                inputMode="numeric"
                dir="ltr"
                defaultValue={terms.valid_days ?? ""}
                placeholder={String(terms.default_valid_days)}
                className="field"
              />
              <span className="hint block">فارغ = القيمة العامة: {formatCount(terms.default_valid_days)} أيام</span>
            </label>
            <label className="block space-y-1">
              <span className="block text-sm font-semibold">نسبة التسبقة في العقد (%)</span>
              <input
                name="down_payment_percent"
                inputMode="decimal"
                dir="ltr"
                defaultValue={terms.down_payment_percent ?? ""}
                placeholder={String(terms.default_down_payment_percent)}
                className="field"
              />
              <span className="hint block">
                كي الحريف ما اختارش نسبة في الاستمارة. فارغ = القيمة العامة: {formatCount(terms.default_down_payment_percent)}%
              </span>
            </label>
          </div>
          <p className="text-caption leading-6 text-muted">
            التبديل يمسّ الحجوزات والعقود الجديدة برك؛ اللي تكتب قبل يبقى بأرقامو.
          </p>
        </ActionForm>
      )}
    </section>
  );
}
