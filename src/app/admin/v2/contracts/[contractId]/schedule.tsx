"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatCount, formatDate, formatMillimes } from "@/lib/format";

import { Popup } from "../../popup";

import { recordInstallment } from "../../../(panel)/installments/actions";

export type Line = {
  id: string;
  seq: number;
  dueOn: string;
  amountMillimes: number;
  paidMillimes: number;
  leftMillimes: number;
  statusLabel: string;
  isLate: boolean;
  daysLate: number | null;
};

/**
 * جدول الأقساط — the schedule, and the one act Finance performs on it.
 *
 * «سجّل» SENDS BACK THE INTEGER POSTGRES PRODUCED. app.contract_money reported `left_millimes` for this line;
 * the button hands that number back unchanged. It is a pass-through, never a computation — nothing here
 * divides by a thousand, rounds, or decides what «the rest» means, so the browser never has to know that a
 * dinar is a thousand millimes. The balances are a waterfall in SQL: a surplus lands on the next line, and
 * only a total beyond the whole schedule is refused.
 *
 * A PARTIAL PAYMENT IS TYPED IN DINARS, because that is what the client handed over and what the receipt
 * says. That path sends dinars as TEXT and the Server Action converts once, next to every other price field
 * in the Back Office.
 *
 * ONLY UNPAID LINES CARRY A BUTTON. A settled line is a record, not a task, and a «سجّل» under it is an
 * invitation to take the same money twice.
 */
export function Schedule({ contractId, lines }: { contractId: string; lines: Line[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const record = (line: Line, partial: boolean, close: () => void) => {
    setError(null);
    start(async () => {
      const result = await recordInstallment({
        contractId,
        installmentId: line.id,
        ...(partial ? { amountDinars: amount } : { amountMillimes: line.leftMillimes }),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAmount("");
      close();
      router.refresh();
    });
  };

  if (lines.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">جدول الأقساط</h2>

      <ul className="card divide-y divide-line overflow-hidden">
        {lines.map((line) => {
          const settled = line.leftMillimes <= 0;
          return (
            <li key={line.id} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-xs font-bold tabular-nums text-muted">{formatCount(line.seq)}</span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{formatMillimes(line.amountMillimes)}</span>
                  <span className="block text-[0.6875rem] leading-tight text-muted">{formatDate(line.dueOn)}</span>
                </span>

                <span className="shrink-0 text-end">
                  <span className={`block text-xs font-semibold ${line.isLate ? "text-danger" : "text-muted"}`}>
                    {line.isLate && line.daysLate ? `متأخر ${formatCount(line.daysLate)} يوم` : line.statusLabel}
                  </span>
                  {!settled && line.paidMillimes > 0 ? (
                    <span className="block text-[0.6875rem] text-muted">
                      باقي {formatMillimes(line.leftMillimes)}
                    </span>
                  ) : null}
                </span>

                {settled ? null : (
                  <Popup title={`قسط ${formatCount(line.seq)}`} label="سجّل" variant="primary">
                    {(close) => (
                      <div className="space-y-3">
                        <p className="text-sm text-muted">
                          الباقي على هذا القسط <span className="font-bold text-ink">{formatMillimes(line.leftMillimes)}</span>
                        </p>

                        <button
                          type="button"
                          onClick={() => record(line, false, close)}
                          disabled={pending}
                          className="btn btn-primary w-full"
                        >
                          {pending ? "…" : "خلّص الباقي كامل"}
                        </button>

                        <div className="flex gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder="مبلغ آخر بالدينار"
                            aria-label="مبلغ بالدينار"
                            className="field flex-1 tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() => record(line, true, close)}
                            disabled={pending || !(Number(amount) > 0)}
                            className="btn btn-secondary"
                          >
                            سجّل
                          </button>
                        </div>

                        {error ? <p className="text-sm text-danger">{error}</p> : null}
                      </div>
                    )}
                  </Popup>
                )}
              </div>

            </li>
          );
        })}
      </ul>
    </section>
  );
}
