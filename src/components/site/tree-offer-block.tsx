import Link from "next/link";
import type { ReactNode } from "react";

import { settingText, type PublicConfig } from "@/lib/config";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import type { ProjectQuote } from "@/lib/public-projects";
import type { PaymentMode } from "@/lib/tree-pricing";

export type TreeOfferChoice = { payment: PaymentMode | null; downPercent: string | null; duration: string | null };

/**
 * Plan P5-4: the money of a parcel sold as trees with their area. Every figure was computed in Postgres by
 * public_project_quote on the project's own rules; this component only formats it. The visitor picks the payment,
 * then a down-payment percentage and a duration (report v3 §12); choices are links, so the page stays server-rendered.
 * PRN-01: the block always ends with the parcel card note and the no-guarantee notice.
 */
export function TreeOfferBlock({
  quote,
  config,
  baseHref,
  choice,
}: {
  quote: ProjectQuote;
  config: PublicConfig;
  baseHref: string;
  choice: TreeOfferChoice;
}) {
  const notes = (
    <div className="mt-5 space-y-2 text-xs leading-6 text-muted">
      <p className="rounded-xl bg-paper px-4 py-3">{settingText(config, "legal.parcel_card_note")}</p>
      <p>{settingText(config, "legal.no_guarantee_notice")}</p>
    </div>
  );

  if (quote.pricing === "not_offered") {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <p className="leading-7 text-ink/80">
          {settingText(config, "projects.taken_text", "هذه القطعة ما عادش معروضة. تنجم تسجّل اهتمامك بقطعة مشابهة ونعلموك أول ما تتوفر.")}
        </p>
        {notes}
      </section>
    );
  }

  const facts = (
    <>
      {quote.trees ? <Row label="عدد الزيتونات">{formatCount(quote.trees)}</Row> : null}
      {quote.area_per_tree_m2 ? <Row label="مساحة كل زيتونة">{formatArea(quote.area_per_tree_m2)}</Row> : null}
      {quote.total_area_m2 ? <Row label="المساحة الجملية">{formatArea(quote.total_area_m2)}</Row> : null}
    </>
  );

  if (quote.pricing !== "ok" || !quote.price_per_tree_millimes || !quote.total_price_millimes) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <dl className="divide-y divide-line text-sm">{facts}</dl>
        <p className="mt-4 font-semibold text-forest">
          {settingText(config, "projects.price_pending", settingText(config, "start.price_unavailable", "السعر يُعلن لاحقاً."))}
        </p>
        {notes}
      </section>
    );
  }

  const href = (next: Partial<TreeOfferChoice>) => {
    const merged = { ...choice, ...next };
    const params = new URLSearchParams();
    if (merged.payment) params.set("payment", merged.payment);
    if (merged.payment === "installments") {
      if (merged.downPercent) params.set("down_pct", merged.downPercent);
      if (merged.duration) params.set("duration", merged.duration);
    }
    const query = params.toString();
    return `${baseHref}${query ? `?${query}` : ""}#offer`;
  };
  const installments = choice.payment === "installments" ? quote.installments : null;

  return (
    <section id="offer" className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <dl className="divide-y divide-line text-sm">
        <Row label={settingText(config, "start.row_price_per_tree", "سعر الزيتونة")}>
          <span className="font-display text-3xl font-bold text-forest">{formatMillimes(quote.price_per_tree_millimes)}</span>
        </Row>
        {facts}
        <Row label={settingText(config, "start.row_total_price", "السعر الجملي")}>{formatMillimes(quote.total_price_millimes)}</Row>
      </dl>

      <Chips title="طريقة الدفع">
        <Chip href={href({ payment: "cash" })} active={choice.payment === "cash"}>
          حاضر
        </Chip>
        <Chip href={href({ payment: "installments" })} active={choice.payment === "installments"}>
          بالتقسيط
        </Chip>
      </Chips>

      {choice.payment === "installments" ? (
        <>
          <Chips title={settingText(config, "start.down_percent_title", "نسبة التسبقة")}>
            {quote.choices.down_percents.map((option) => (
              <Chip key={option.id} href={href({ downPercent: option.id })} active={choice.downPercent === option.id}>
                {option.label_ar}
              </Chip>
            ))}
          </Chips>
          <Chips title={settingText(config, "start.row_duration", "مدة الدفع")}>
            {quote.choices.durations.map((option) => (
              <Chip key={option.id} href={href({ duration: option.id })} active={choice.duration === option.id}>
                {option.label_ar}
              </Chip>
            ))}
          </Chips>

          {installments?.status === "ok" ? (
            <dl className="mt-5 divide-y divide-line rounded-xl bg-paper px-4 text-sm">
              {installments.down_payment_millimes !== null ? (
                <Row label={settingText(config, "start.row_down", "التسبقة")}>
                  {formatMillimes(installments.down_payment_millimes)}
                  {installments.down_payment_percent !== null ? ` (${formatCount(installments.down_payment_percent)}%)` : ""}
                </Row>
              ) : null}
              {installments.total_financed_millimes !== null ? (
                <Row label={settingText(config, "start.row_total_financed", "السعر الجملي بالتقسيط")}>
                  {formatMillimes(installments.total_financed_millimes)}
                </Row>
              ) : null}
              {installments.remaining_millimes !== null ? (
                <Row label={settingText(config, "start.row_remaining", "المبلغ المتبقي")}>{formatMillimes(installments.remaining_millimes)}</Row>
              ) : null}
              {installments.monthly_millimes !== null ? (
                <Row label={settingText(config, "start.row_monthly", "القسط الشهري")}>
                  <span className="font-display text-2xl font-bold text-forest">{formatMillimes(installments.monthly_millimes)}</span>
                  {installments.installments_count ? (
                    <span className="block text-xs font-medium text-muted">{formatCount(installments.installments_count)} قسطاً</span>
                  ) : null}
                </Row>
              ) : null}
              {installments.last_installment_millimes !== null &&
              installments.last_installment_millimes !== installments.monthly_millimes ? (
                <p className="py-2.5 text-xs text-muted">
                  {settingText(config, "start.last_installment", "آخر قسط: {amount}").replace(
                    "{amount}",
                    formatMillimes(installments.last_installment_millimes),
                  )}
                </p>
              ) : null}
            </dl>
          ) : (
            <p role="status" className="mt-5 rounded-xl bg-gold-soft px-4 py-3 text-sm text-forest-700">
              {installmentMessage(config, installments?.status)}
            </p>
          )}
        </>
      ) : null}

      {notes}
    </section>
  );
}

function installmentMessage(config: PublicConfig, status: string | undefined): string {
  switch (status) {
    case "duration_not_priced":
      return settingText(config, "start.duration_not_priced", "التقسيط على هذه المدة مازال ما تحدّدش. اختر مدة أخرى.");
    case "down_covers_total":
      return settingText(config, "start.down_covers_total", "التسبقة أكبر من السعر الجملي. اختر تسبقة أصغر أو ادفع بالحاضر.");
    case "invalid_choice":
      return "الاختيار هذا ما عادش متوفّر لهذا المشروع. اختر التسبقة والمدة من جديد.";
    case "too_many_months":
      return "المدة أطول من المسموح. اختر مدة أقصر.";
    default:
      return "اختر نسبة التسبقة ومدة الدفع باش نحسبولك القسط الشهري.";
  }
}

function Chips({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
        active ? "border-forest bg-leaf-soft text-forest" : "border-line text-ink hover:border-line-strong"
      }`}
    >
      {children}
    </Link>
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
