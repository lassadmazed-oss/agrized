// Readable breakdown of public.staff_tree_quote, so Finance and Admin can check every number before publishing.

import { DataRow } from "@/components/ui";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { formatArea, formatCount } from "@/lib/format";

import { formatBp, formatMoney, formatPercent } from "./tree-pricing-inputs";

type Source = string | null | undefined;

export type QuoteExtra = { label_ar: string; basis: "per_tree" | "per_m2"; amount_millimes: number; cost_millimes: number };

export type QuotePriceDetail = {
  ok: true;
  area_m2: number;
  land_price_per_m2_millimes: number;
  land_cost_millimes: number;
  planting_cost_millimes: number;
  extras: QuoteExtra[];
  extras_total_millimes: number;
  cost_per_tree_millimes: number;
  margin_mode: "percent" | "fixed";
  margin_percent_bp: number | null;
  margin_fixed_millimes: number | null;
  margin_millimes: number;
  price_per_tree_millimes: number;
  sources: { land: Source; planting: Source; margin: Source; rounding: Source };
};

export type QuotePrice = { ok: false; reason?: string } | QuotePriceDetail;

export type QuoteInstallmentsDetail = {
  ok: true;
  markup_bp: number;
  total_financed_millimes: number;
  /** Plan Q-2: the down payment is this percentage of the cash total. */
  down_payment_percent?: number | string | null;
  down_payment_millimes: number;
  months: number;
  remaining_millimes: number;
  monthly_millimes: number;
  last_installment_millimes: number;
  installments_count: number;
  shortened: boolean;
};

export type QuoteInstallments = { ok: false; reason?: string } | QuoteInstallmentsDetail;

export type TreeQuote = {
  area_per_tree_m2: number | null;
  trees: number | null;
  total_area_m2: number | null;
  price: QuotePrice;
  total_price_millimes: number | null;
  installments: QuoteInstallments | null;
};

const PRICE_REASONS: Record<string, string> = {
  margin_not_set: "الأسعار ما تنحسبش وما تبانش في الموقع حتى يتضبط هامش AgriZed. اضبطه في «قواعد التسعير العامة».",
  spacing_not_found: "فئة المساحة هذه غير موجودة أو معطّلة. اختر فئة أخرى، أو فعّلها في «فئات المساحة».",
  spacing_not_allowed:
    "فئة المساحة هذه موش مسموحة في المشروع المختار. اختر فئة أخرى، أو زيدها في «فئات المساحة المسموحة لهذا المشروع» (قواعد خاصة بمشروع).",
};

const INSTALLMENT_REASONS: Record<string, string> = {
  duration_not_priced: "هذه المدة ما عندهاش نسبة زيادة، لذلك ما تتعرضش بالتقسيط. اكتب نسبتها في «الزيادة حسب مدة التقسيط» أو اختر مدة أخرى.",
  down_covers_total: "التسبقة تغطّي السعر بالتقسيط كاملاً، فما فماش أقساط. اختر نسبة تسبقة أصغر أو زيد عدد الزيتونات.",
  too_many_months: "المدة أطول من الحدّ الأقصى المسموح (الإعداد pricing.max_months). اختر مدة أقصر أو غيّر الحدّ.",
  // The shared messages for these codes address a visitor on the calculator.
  invalid_down_payment_percent: "نسبة التسبقة هذه موش مسموحة في المشروع المختار أو ما عادتش نشطة. اختر نسبة أخرى، أو راجع نِسَب المشروع.",
  down_payment_percent_required: "اختر نسبة التسبقة باش تتحسب الأقساط.",
  duration_required: "اختر مدة التقسيط باش تتحسب الأقساط.",
};

/** This breakdown's own wording first, then the shared Arabic error messages, then the fallback. */
function reasonText(reasons: Record<string, string>, reason: string | undefined, fallback: string): string {
  if (reason && reasons[reason]) return reasons[reason];
  return reason && isKnownIntakeError(reason) ? intakeErrorMessage(reason) : fallback;
}

function sourceLabel(source: Source): string {
  return source === "project" ? "خاصة بالمشروع" : "عامة";
}

function hasPercent(percent: number | string | null | undefined): percent is number | string {
  return percent !== null && percent !== undefined && percent !== "";
}

export function QuoteBreakdown({ quote }: { quote: TreeQuote }) {
  const price = quote.price;
  const installments = quote.installments;
  const hasTrees = typeof quote.trees === "number";

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        <DataRow layout="stacked" size="lg" label="المساحة لكل زيتونة" className="card px-4 py-3">{typeof quote.area_per_tree_m2 === "number" ? formatArea(quote.area_per_tree_m2) : "—"}</DataRow>
        <DataRow layout="stacked" size="lg" label="عدد الزيتونات" className="card px-4 py-3">{hasTrees ? formatCount(quote.trees as number) : "—"}</DataRow>
        <DataRow layout="stacked" size="lg" label="المساحة الجملية" className="card px-4 py-3">{typeof quote.total_area_m2 === "number" ? formatArea(quote.total_area_m2) : "—"}</DataRow>
      </dl>

      {!price.ok ? (
        <p role="alert" className="rounded-2xl border border-gold bg-gold-soft px-4 py-3 font-semibold text-forest-700">
          {reasonText(PRICE_REASONS, price.reason, "تعذّر حساب السعر بهذه المعطيات. راجع الفئة والقواعد ثم أعد المحاولة.")}
        </p>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="px-4 pt-4 text-start font-semibold">التفصيل الداخلي لسعر الزيتونة (ما يظهرش للزائر)</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">البند</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">الحساب</th>
                  <th scope="col" className="px-4 py-2 text-end font-semibold">المبلغ</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">القاعدة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <Row label="ثمن المتر المربع من الأرض" amount={`${formatMoney(price.land_price_per_m2_millimes)} / م²`} source={sourceLabel(price.sources.land)} />
                <Row
                  label="قيمة الأرض للزيتونة"
                  detail={`${formatArea(price.area_m2)} × ${formatMoney(price.land_price_per_m2_millimes)}`}
                  amount={formatMoney(price.land_cost_millimes)}
                  source={sourceLabel(price.sources.land)}
                />
                <Row label="تكلفة الغراسة" amount={formatMoney(price.planting_cost_millimes)} source={sourceLabel(price.sources.planting)} />
                {price.extras.map((extra, index) => (
                  <Row
                    key={`${extra.label_ar}-${index}`}
                    label={extra.label_ar}
                    detail={
                      extra.basis === "per_m2"
                        ? `${formatArea(price.area_m2)} × ${formatMoney(extra.amount_millimes)}`
                        : `${formatMoney(extra.amount_millimes)} للزيتونة`
                    }
                    amount={formatMoney(extra.cost_millimes)}
                  />
                ))}
                <Row
                  label="مجموع المصاريف الإضافية"
                  detail={price.extras.length === 0 ? "ما فماش مصاريف إضافية" : undefined}
                  amount={formatMoney(price.extras_total_millimes)}
                />
                <Row label="تكلفة الزيتونة" detail="الأرض + الغراسة + المصاريف" amount={formatMoney(price.cost_per_tree_millimes)} strong />
                <Row
                  label="هامش AgriZed"
                  detail={
                    price.margin_mode === "percent" && typeof price.margin_percent_bp === "number"
                      ? `${formatBp(price.margin_percent_bp)} × ${formatMoney(price.cost_per_tree_millimes)}`
                      : "مبلغ ثابت للزيتونة"
                  }
                  amount={formatMoney(price.margin_millimes)}
                  source={sourceLabel(price.sources.margin)}
                />
                <Row
                  label="سعر الزيتونة"
                  detail="التكلفة + الهامش، بعد التدوير"
                  amount={formatMoney(price.price_per_tree_millimes)}
                  source={`التدوير: ${sourceLabel(price.sources.rounding)}`}
                  strong
                />
                {hasTrees && typeof quote.total_price_millimes === "number" ? (
                  <Row
                    label="السعر الجملي"
                    detail={`${formatCount(quote.trees as number)} × ${formatMoney(price.price_per_tree_millimes)}`}
                    amount={formatMoney(quote.total_price_millimes)}
                    strong
                  />
                ) : null}
              </tbody>
            </table>
          </div>

          {installments ? <InstallmentsTable installments={installments} totalPrice={quote.total_price_millimes} roundingSource={price.sources.rounding} /> : null}

          <section className="card bg-paper p-4">
            <h3 className="font-semibold">ما يظهر للزائر بعد نشر موديول التسعير</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <DataRow layout="stacked" size="lg" label="عدد الزيتونات">{hasTrees ? formatCount(quote.trees as number) : "—"}</DataRow>
              <DataRow layout="stacked" size="lg" label="المساحة لكل زيتونة">{formatArea(price.area_m2)}</DataRow>
              <DataRow layout="stacked" size="lg" label="المساحة الجملية">{typeof quote.total_area_m2 === "number" ? formatArea(quote.total_area_m2) : "—"}</DataRow>
              <DataRow layout="stacked" size="lg" label="سعر الزيتونة">{formatMoney(price.price_per_tree_millimes)}</DataRow>
              <DataRow layout="stacked" size="lg" label="السعر الجملي للطلب">{typeof quote.total_price_millimes === "number" ? formatMoney(quote.total_price_millimes) : "—"}</DataRow>
            </dl>
            {installments?.ok ? (
              // Report v3 §12: the installment figures the visitor sees once they pick a percentage and a duration.
              <dl className="mt-3 grid gap-3 border-t border-line pt-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <DataRow layout="stacked" size="lg" label="التسبقة">{
                    hasPercent(installments.down_payment_percent)
                      ? `${formatPercent(installments.down_payment_percent)} · ${formatMoney(installments.down_payment_millimes)}`
                      : formatMoney(installments.down_payment_millimes)
                  }</DataRow>
                <DataRow layout="stacked" size="lg" label="السعر الجملي بالتقسيط">{formatMoney(installments.total_financed_millimes)}</DataRow>
                <DataRow layout="stacked" size="lg" label="المبلغ المتبقي">{formatMoney(installments.remaining_millimes)}</DataRow>
                <DataRow layout="stacked" size="lg" label="القسط الشهري">{formatMoney(installments.monthly_millimes)}</DataRow>
                <DataRow layout="stacked" size="lg" label="الأقساط">{`${formatCount(installments.installments_count)} · آخر قسط ${formatMoney(installments.last_installment_millimes)}`}</DataRow>
              </dl>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function InstallmentsTable({ installments, totalPrice, roundingSource }: { installments: QuoteInstallments; totalPrice: number | null; roundingSource: Source }) {
  if (!installments.ok) {
    return (
      <p role="alert" className="rounded-2xl border border-gold bg-gold-soft px-4 py-3 font-semibold text-forest-700">
        {reasonText(INSTALLMENT_REASONS, installments.reason, "تعذّر حساب التقسيط بهذه المعطيات. راجع نسبة التسبقة والمدة ثم أعد المحاولة.")}
      </p>
    );
  }

  const percent = installments.down_payment_percent;
  const downDetail = hasPercent(percent)
    ? typeof totalPrice === "number"
      ? `${formatPercent(percent)} × ${formatMoney(totalPrice)} (السعر الجملي بالحاضر)`
      : formatPercent(percent)
    : undefined;

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="px-4 pt-4 text-start font-semibold">التقسيط</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 text-start font-semibold">البند</th>
            <th scope="col" className="px-4 py-2 text-start font-semibold">الحساب</th>
            <th scope="col" className="px-4 py-2 text-end font-semibold">المبلغ</th>
            <th scope="col" className="px-4 py-2 text-start font-semibold">القاعدة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <Row label="التسبقة" detail={downDetail} amount={formatMoney(installments.down_payment_millimes)} strong />
          <Row label="نسبة الزيادة للمدة" amount={formatBp(installments.markup_bp)} />
          <Row
            label="السعر الجملي بالتقسيط"
            detail={typeof totalPrice === "number" ? `${formatMoney(totalPrice)} + ${formatBp(installments.markup_bp)}` : undefined}
            amount={formatMoney(installments.total_financed_millimes)}
            strong
          />
          <Row
            label="المبلغ المتبقي"
            detail={`${formatMoney(installments.total_financed_millimes)} − ${formatMoney(installments.down_payment_millimes)}`}
            amount={formatMoney(installments.remaining_millimes)}
          />
          <Row label="المدة" amount={`${formatCount(installments.months)} شهراً`} />
          <Row
            label="القسط الشهري"
            detail={`${formatMoney(installments.remaining_millimes)} ÷ ${formatCount(installments.months)}، مدوّر للأعلى`}
            amount={formatMoney(installments.monthly_millimes)}
            source={`التدوير: ${sourceLabel(roundingSource)}`}
            strong
          />
          <Row label="آخر قسط" detail="الباقي بعد الأقساط الأخرى" amount={formatMoney(installments.last_installment_millimes)} />
          <Row
            label="عدد الأقساط"
            detail={installments.shortened ? "أقل من المدة المختارة، لأن القسط الشهري مدوّر للأعلى" : undefined}
            amount={formatCount(installments.installments_count)}
          />
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, detail, amount, source, strong = false }: { label: string; detail?: string; amount: string; source?: string; strong?: boolean }) {
  return (
    <tr className={strong ? "bg-paper/70 font-semibold" : undefined}>
      <th scope="row" className="px-4 py-2.5 text-start font-medium">
        {label}
      </th>
      <td className="px-4 py-2.5 text-muted tabular-nums">{detail ?? ""}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-end tabular-nums">{amount}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{source ?? ""}</td>
    </tr>
  );
}
