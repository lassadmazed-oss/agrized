"use client";

import Link from "next/link";
import { useState } from "react";

import { formatMillimes } from "@/lib/format";

type MoneyOption = { id: string; label_ar: string; min_millimes: number | null };

type CapacitySimulatorProps = {
  downPayments: MoneyOption[];
  installments: MoneyOption[];
  durations: number[];
  legalNotice: string;
  interestFormOpen: boolean;
};

/**
 * Phase 1 simulator (SIM-01..03): no projects exist yet, so it shows the total amount a person
 * could pay over each duration. It is not a project price.
 */
export function CapacitySimulator({ downPayments, installments, durations, legalNotice, interestFormOpen }: CapacitySimulatorProps) {
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-4xl font-bold text-forest sm:text-5xl">احسب قدرتك</h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        اختر التسبقة والقسط الشهري اللي يناسبوك. نوريك المبلغ الجملي اللي تنجم تخلّصو على كل مدة.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-8">
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

        <section aria-live="polite" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-semibold text-ink">قدرتك التقديرية</h2>
          {results.length === 0 ? (
            <p className="mt-3 text-muted">اختر التسبقة والقسط لعرض النتيجة.</p>
          ) : (
            <ul className="mt-4 space-y-5">
              {results.map((result) => (
                <li key={result.months}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-muted">
                      على <span className="tabular-nums">{result.months}</span> شهراً
                    </span>
                    <span className="font-display text-2xl font-bold text-forest tabular-nums sm:text-3xl">
                      {formatMillimes(result.total)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-leaf-soft" aria-hidden="true">
                    <div className="h-full rounded-full bg-leaf" style={{ width: `${(result.total / maxTotal) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted tabular-nums">
                    {formatMillimes(down!.min_millimes ?? 0)} تسبقة + {formatMillimes(installment!.min_millimes ?? 0)} ×{" "}
                    {result.months} شهراً
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 space-y-2 rounded-xl bg-paper p-4 text-sm leading-6 text-muted">
            <p>
              هذا مجموع ما يمكنك دفعه، وليس سعر مشروع. أسعار المشاريع تختلف حسب العقار، والتقسيط يُحسب بصيغة خاصة بكل مشروع.
            </p>
            {legalNotice ? <p className="font-medium text-ink/80">{legalNotice}</p> : null}
          </div>

          {interestFormOpen && ready ? (
            <Link
              href={`/register?down=${encodeURIComponent(downId ?? "")}&installment=${encodeURIComponent(installmentId ?? "")}`}
              className="btn btn-primary mt-6 w-full"
            >
              سجّل اهتمامك بهذه القيم
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
      <legend className="label text-base">{title}</legend>
      <p className="hint mb-3">{hint}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.id} className="choice justify-center">
            <input type="radio" name={title} className="sr-only" checked={value === option.id} onChange={() => onChange(option.id)} />
            <span className="text-center">
              <span className="block font-semibold tabular-nums">{option.label_ar}</span>
              {suffix ? <span className="block text-xs text-muted">{suffix}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
