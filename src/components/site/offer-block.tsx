import type { ReactNode } from "react";

import { settingText, type PublicConfig } from "@/lib/config";
import { formatCount, formatMillimes } from "@/lib/format";
import type { OfferPlan, ParcelOffer, PlanOption } from "@/lib/projects";

/**
 * The only public place money is rendered. Every figure was computed in Postgres from the Back Office
 * lists; this component formats and frames it. PRN-01: every money block ends with the indicative
 * note, the parcel card note and the no-guarantee notice, in that order.
 */
export function OfferBlock({ offer, config }: { offer: ParcelOffer; config: PublicConfig }) {
  const notes = (
    <div className="mt-5 space-y-2 text-xs leading-6 text-muted">
      <p className="rounded-xl bg-paper px-4 py-3">{settingText(config, "legal.parcel_card_note")}</p>
      <p>{settingText(config, "legal.no_guarantee_notice")}</p>
    </div>
  );

  if (!offer.offered) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="leading-7 text-ink/80">
          {settingText(
            config,
            "projects.taken_text",
            "هذه القطعة ما عادش معروضة. تنجم تسجّل اهتمامك بقطعة مشابهة ونعلموك أول ما تتوفر.",
          )}
        </p>
        {notes}
      </section>
    );
  }

  if (!offer.priced || !offer.cash_price_millimes) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="font-semibold text-forest">{settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً.")}</p>
        {notes}
      </section>
    );
  }

  const cash = offer.cash_price_millimes;
  const entry = offer.entry;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <dl className="divide-y divide-line text-sm">
        <Row label="السعر حاضر">
          <span className="font-display text-3xl font-bold text-forest">{formatMillimes(cash)}</span>
        </Row>
        {offer.down_from_millimes ? <Row label="التسبقة">من {formatMillimes(offer.down_from_millimes)}</Row> : null}
        <Row label="القسط">
          {entry?.ok && entry.months
            ? `من ${formatMillimes(entry.installment_millimes)} في الشهر · ${formatCount(entry.months)} شهراً`
            : "غير متاح بالقيم الحالية"}
        </Row>
        {offer.annual_costs_millimes !== null ? (
          <Row label="المصاريف السنوية التقديرية">{formatMillimes(offer.annual_costs_millimes)}</Row>
        ) : null}
      </dl>

      {offer.examples.length > 0 ? (
        <div className="mt-6">
          <h3 className="font-semibold text-ink">
            {settingText(config, "projects.examples_title", "أمثلة على الدفع بالتقسيط")}
          </h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {offer.examples.map((plan) => (
              <Example key={`${plan.down_option_id}-${plan.installment_option_id}`} plan={plan} offer={offer} cash={cash} />
            ))}
          </ul>
          <p className="mt-3 text-xs leading-6 text-muted">
            {settingText(
              config,
              "projects.examples_note",
              "هذه أمثلة محسوبة بالتسبقة الأصغر من القائمة وبصيغة التسعير الحالية، وهي إرشادية وقابلة للتغيير. السعر الجملي يشمل كل شيء ولا توجد مصاريف خفية. المبلغ النهائي والمدة يُضبطان في وعد البيع.",
            )}
          </p>
        </div>
      ) : null}

      {notes}
    </section>
  );
}

function Example({ plan, offer, cash }: { plan: OfferPlan; offer: ParcelOffer; cash: number }) {
  const label = (list: PlanOption[], id: string, fallback: number) => list.find((option) => option.id === id)?.label_ar ?? formatMillimes(fallback);
  const total = plan.total_millimes ?? cash;

  return (
    <li className="rounded-xl border border-line bg-paper p-4">
      <p className="text-xs font-semibold text-gold">مثال</p>
      <p className="mt-1 text-sm text-ink">
        تسبقة {label(offer.down_options, plan.down_option_id, plan.down_millimes)} + قسط{" "}
        {label(offer.installment_options, plan.installment_option_id, plan.installment_millimes)} في الشهر
      </p>
      <dl className="mt-3 space-y-1.5 text-xs">
        <Fact label="عدد الأشهر">{formatCount(plan.months ?? 0)}</Fact>
        <Fact label="السعر الجملي">{formatMillimes(total)}</Fact>
        <Fact label="آخر قسط">{formatMillimes(plan.last_installment_millimes ?? 0)}</Fact>
        <Fact label="الفارق عن الحاضر">{formatMillimes(total - cash)}</Fact>
      </dl>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}
