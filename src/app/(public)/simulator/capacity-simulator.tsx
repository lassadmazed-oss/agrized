"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { OliveBranch } from "@/components/site/olive-decor";
import { formatMillimes } from "@/lib/format";

type MoneyOption = { id: string; label_ar: string; min_millimes: number | null };

type CapacitySimulatorProps = {
  downPayments: MoneyOption[];
  installments: MoneyOption[];
  durations: number[];
  legalNotice: string;
  interestFormOpen: boolean;
  /** Handwritten line under the choices, as on the board's simulator panel; hidden when empty. */
  scriptLine?: string;
};

/**
 * Phase 1 simulator (SIM-01..03): no projects exist yet, so it shows the total amount a person
 * could pay over each duration. It is not a project price.
 */
export function CapacitySimulator({
  downPayments,
  installments,
  durations,
  legalNotice,
  interestFormOpen,
  scriptLine = "",
}: CapacitySimulatorProps) {
  // Opens with a realistic selection so the result is visible immediately.
  const [downId, setDownId] = useState(downPayments[Math.min(1, downPayments.length - 1)]?.id ?? null);
  const [installmentId, setInstallmentId] = useState(installments[Math.min(3, installments.length - 1)]?.id ?? null);

  const down = downPayments.find((o) => o.id === downId);
  const installment = installments.find((o) => o.id === installmentId);
  const ready = Boolean(down?.min_millimes !== null && installment?.min_millimes !== null && down && installment);

  const results = ready
    ? durations.map((months) => ({
        months,
        installmentsTotal: (installment!.min_millimes ?? 0) * months,
        total: (down!.min_millimes ?? 0) + (installment!.min_millimes ?? 0) * months,
      }))
    : [];
  const maxTotal = Math.max(1, ...results.map((r) => r.total));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="section-title text-4xl sm:text-5xl">احسب قدرتك</h1>
        <p className="section-lead mt-3">
          اختر التسبقة والقسط الشهري اللي يناسبوك. نوريك المبلغ الجملي اللي تنجم تخلّصو على كل مدة.
        </p>
      </div>

      <div className="mt-10 grid overflow-hidden rounded-3xl border border-line bg-surface shadow-card lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative overflow-hidden p-6 pb-48 sm:p-10 sm:pb-56">
          <div className="relative z-10 space-y-9">
            <ChipGroup title="التسبقة" hint="المبلغ الذي يمكنك دفعه في البداية." options={downPayments} value={downId} onChange={setDownId} />
            <ChipGroup
              title="القسط الشهري"
              hint="المبلغ الذي يناسبك كل شهر."
              options={installments}
              value={installmentId}
              onChange={setInstallmentId}
              suffix="شهرياً"
            />
          </div>
          <OliveBranch className="-bottom-14 -start-10 w-72 rotate-[6deg] sm:w-80" />
          {scriptLine ? (
            <p
              aria-hidden="true"
              className="script absolute bottom-10 end-6 max-w-64 -rotate-3 text-3xl leading-snug text-forest sm:end-12 sm:text-4xl"
            >
              {scriptLine}
            </p>
          ) : null}
        </div>

        <section aria-live="polite" className="border-t border-line bg-cream p-6 sm:p-10 lg:border-s lg:border-t-0">
          <h2 className="text-xl font-bold text-ink">قدرتك التقديرية</h2>
          {results.length === 0 ? (
            <p className="mt-3 text-muted">اختر التسبقة والقسط لعرض النتيجة.</p>
          ) : (
            <dl className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface px-5 shadow-card">
              {results.map((result) => (
                <div key={result.months} className="py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm text-muted">
                      على <span className="tabular-nums">{result.months}</span> شهراً
                    </dt>
                    <dd className="text-2xl font-bold text-forest tabular-nums sm:text-[1.7rem]">{formatMillimes(result.total)}</dd>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-leaf-soft" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-linear-to-l from-leaf to-forest"
                      style={{ width: `${(result.total / maxTotal) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted tabular-nums">
                    {formatMillimes(down!.min_millimes ?? 0)} تسبقة + {formatMillimes(installment!.min_millimes ?? 0)} ×{" "}
                    {result.months} شهراً
                  </p>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-6 space-y-2 rounded-xl border border-gold/15 bg-gold-soft/60 p-4 text-sm leading-6 text-ink/75">
            <p>
              هذا مجموع ما يمكنك دفعه، وليس سعر مشروع. أسعار المشاريع تختلف حسب العقار، والتقسيط يُحسب بصيغة خاصة بكل مشروع.
            </p>
            {legalNotice ? <p className="font-medium text-ink/85">{legalNotice}</p> : null}
          </div>

          {interestFormOpen && ready ? (
            <Link
              href={`/register?down=${encodeURIComponent(downId ?? "")}&installment=${encodeURIComponent(installmentId ?? "")}`}
              className="btn btn-primary mt-6 min-h-14 w-full text-lg"
            >
              سجّل اهتمامك بهذه القيم
              <ArrowLeft aria-hidden="true" className="size-5" />
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ChipGroup({
  title,
  hint,
  options,
  value,
  onChange,
  suffix,
}: {
  title: string;
  hint: string;
  options: MoneyOption[];
  value: string | null;
  onChange: (id: string) => void;
  suffix?: string;
}) {
  return (
    <fieldset>
      <legend className="text-lg font-bold text-ink">{title}</legend>
      <p className="hint mb-3 mt-1">{hint}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.id} className="chip flex-col">
            <input type="radio" name={title} className="sr-only" checked={value === option.id} onChange={() => onChange(option.id)} />
            <span className="block tabular-nums">{option.label_ar}</span>
            {suffix ? <span className="block text-xs font-normal text-muted">{suffix}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
