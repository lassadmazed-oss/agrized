"use client";

// The schedule, all of it — v3 §29's «بعد العقد، يتولد Schedule كامل» and v2 §35's fields per line.
//
// WHAT A LINE OWNS AND WHAT IT DOES NOT. A line owns its number, its due date and its amount. «Paid/unpaid»,
// «Payment date», «Payment method», «Receipt» and «Reference bancaire» — four of §29's seven fields — are
// properties of a PAYMENT, not of an expectation, and app.contract_money reads them from public.payments and
// hangs them off the line as `receipts`. Nothing about money is stored on the line, so voiding a receipt takes
// the schedule back with it. public.subscriptions (0066) is the counter-example already in this codebase: it
// keeps a hand-set payment_status and records no dinar in public.payments, and 0066's own comment admits the
// intended fix.
//
// THE LAST LINE IS DIFFERENT AND THAT IS NOT A BUG. app.financed_quote rounds the monthly UP to the rounding
// step, then recomputes the count from the rounded figure, so the final instalment absorbs the difference and
// the count can be shorter than the duration in months. The screen prints what the schedule holds; it never
// recomputes «monthly × months», which on this database's own rows would overcharge four plans out of five.
//
// AT 375px eighty-four rows have to stay readable, so a row is two lines of text and a pill, not a table: a
// seven-column table on a phone is a horizontal scroll with the amount off screen.

import { useState } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { StatusPill } from "@/components/ui";
import { formatCount, formatDate } from "@/lib/format";

import { voidContractPayment } from "./actions";
import {
  daysLateLabel,
  isOpen,
  lineTone,
  type Contract,
  type ContractPayment,
  type Installment,
  type Receipt,
  formatAmount,
} from "./contract-model";
import { RecordPaymentForm, type PaymentMethod } from "./payment-forms";
import { useAct } from "./use-act";

export function ScheduleList({
  contract,
  methods,
  reasonMin,
  canRecordMoney,
  installmentsOpen,
}: {
  contract: Contract;
  methods: readonly PaymentMethod[];
  reasonMin: number;
  canRecordMoney: boolean;
  installmentsOpen: boolean;
}) {
  const [recording, setRecording] = useState<string | null>(null);
  const acts = installmentsOpen && canRecordMoney && isOpen(contract);

  if (contract.money.lines.length === 0) {
    return (
      <p className="card p-cozy text-sm leading-6 text-muted">
        {contract.schedulePending
          ? "العقد ممضي والجدول مازال ما تولّدش، خاطر موديول «الأقساط» كان مطفي وقت الإمضاء. شغّلو ثم ولّد الجدول من فوق — الإمضاء ما يتمسّش."
          : "ما فماش جدول أقساط لهذا العقد."}
      </p>
    );
  }

  return (
    <ol className="card divide-y divide-line">
      {contract.money.lines.map((line) => (
        <li key={line.id} className="p-cozy">
          <ScheduleRow
            line={line}
            contract={contract}
            methods={methods}
            reasonMin={reasonMin}
            acts={acts}
            canVoid={installmentsOpen && canRecordMoney}
            open={recording === line.id}
            onToggle={() => setRecording((current) => (current === line.id ? null : line.id))}
            onDone={() => setRecording(null)}
          />
        </li>
      ))}
    </ol>
  );
}

function ScheduleRow({
  line,
  contract,
  methods,
  reasonMin,
  acts,
  canVoid,
  open,
  onToggle,
  onDone,
}: {
  line: Installment;
  contract: Contract;
  methods: readonly PaymentMethod[];
  reasonMin: number;
  acts: boolean;
  canVoid: boolean;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const late = daysLateLabel(line.daysLate);
  const last = line.seq === contract.money.installmentsCount;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-tight">
        <p className="text-sm font-semibold">
          <span className="tabular-nums">
            القسط {line.seq} من {contract.money.installmentsCount}
          </span>
          <span className="mx-1 text-muted">·</span>
          <span className="tabular-nums">{formatDate(line.dueOn)}</span>
        </p>
        <div className="flex items-baseline gap-tight">
          <span className="font-semibold tabular-nums">{formatAmount(line.amountMillimes)}</span>
          <StatusPill tone={lineTone(line)}>{line.statusLabel}</StatusPill>
        </div>
      </div>

      <p className="hint">
        {line.paidMillimes > 0 ? (
          <>
            خلّص <span className="tabular-nums">{formatAmount(line.paidMillimes)}</span>
            {line.leftMillimes > 0 ? (
              <>
                {" · باقي "}
                <span className="tabular-nums">{formatAmount(line.leftMillimes)}</span>
              </>
            ) : null}
          </>
        ) : (
          "ما وصل شيء على هذا القسط."
        )}
        {late ? <span className="text-danger"> · {late}</span> : null}
        {/* The rounding the quote does is said out loud on the one line it shows up on, so nobody reads it as
            a mistake and «corrects» it back to the monthly. */}
        {last && contract.monthlyMillimes !== null && line.amountMillimes !== contract.monthlyMillimes
          ? " · آخر قسط: يشدّ الباقي من التقريب"
          : null}
        {line.note ? ` · ${line.note}` : null}
      </p>

      {line.receipts.length > 0 ? <ReceiptLines receipts={line.receipts} /> : null}

      {acts && line.status !== "paid" ? (
        <button type="button" onClick={onToggle} className="btn btn-ghost btn-sm">
          {open ? "رجوع" : "سجّل خلاص"}
        </button>
      ) : null}

      {open ? (
        <RecordPaymentForm
          contract={contract}
          installment={line}
          methods={methods}
          reasonMin={reasonMin}
          onDone={onDone}
        />
      ) : null}

      {/* Voiding is offered where the receipt is READ in full — the payments section at the bottom of the
          document — and not here: a line shows the thin receipt shape, which carries no reason and no
          recorder, and offering to undo money from a view that cannot show who took it is how the wrong one
          gets voided. `canVoid` is threaded so the row can say where that control lives. */}
      {canVoid && line.receipts.some((receipt) => !receipt.voided) ? (
        <p className="hint">وقّف وصل غالط من «كل الوصولات» في أسفل الصفحة.</p>
      ) : null}
    </div>
  );
}

/** The thin receipt shape a schedule line carries: what arrived, when, and by what means. */
function ReceiptLines({ receipts }: { receipts: readonly Receipt[] }) {
  return (
    <ul className="space-y-1">
      {receipts.map((receipt) => (
        <li key={receipt.id} className={`text-xs ${receipt.voided ? "text-muted line-through" : "text-muted"}`}>
          <span className="font-semibold tabular-nums text-ink">{formatAmount(receipt.amountMillimes)}</span>
          {receipt.receivedAt ? ` · ${formatDate(receipt.receivedAt)}` : ""}
          {receipt.methodLabel ? ` · ${receipt.methodLabel}` : ""}
          {receipt.reference ? ` · ${receipt.reference}` : ""}
          {" · "}
          <span dir="ltr" className="inline-block tabular-nums">
            {receipt.referenceNo}
          </span>
          {receipt.voided ? " · موقّفة" : ""}
        </li>
      ))}
    </ul>
  );
}

/**
 * Every receipt on the contract, in full, and the one act that corrects a wrong one.
 *
 * §59 asks for three receipt kinds — Arabon, Down Payment, Monthly Payment — and they are the three values of
 * public.payment_kind, whose Arabic is seeded in settings payments.kind_labels. So a receipt is a payments row
 * plus its generated AGZ-PAY number, printable from this screen; there is no receipts table and no PDF engine,
 * because neither document asks for a rendered document, only for a traceable record.
 */
export function PaymentLines({
  payments,
  personId,
  reasonMin,
  canVoid,
  lineBySeq,
}: {
  payments: readonly ContractPayment[];
  personId: string;
  reasonMin: number;
  canVoid: boolean;
  /** Which schedule line each payment settled, so a receipt can name «القسط 7» instead of a uuid. */
  lineBySeq: ReadonlyMap<string, number>;
}) {
  const { error, pending, run } = useAct();
  const [voiding, setVoiding] = useState<string | null>(null);

  return (
    <ul className="space-y-2">
      {payments.map((payment) => {
        const seq = payment.installmentId ? lineBySeq.get(payment.installmentId) : undefined;
        return (
          <li key={payment.id} className={`panel p-cozy text-sm ${payment.voided ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-tight">
              <span className="font-semibold tabular-nums">{formatAmount(payment.amountMillimes)}</span>
              <span dir="ltr" className="text-xs tabular-nums text-muted">
                {payment.referenceNo}
              </span>
            </div>
            <p className="hint mt-0.5">
              {payment.kindLabel}
              {seq !== undefined ? ` · القسط ${formatCount(seq)}` : ""}
              {payment.methodLabel ? ` · ${payment.methodLabel}` : ""}
              {payment.receivedAt ? ` · ${formatDate(payment.receivedAt)}` : ""}
              {payment.reference ? ` · ${payment.reference}` : ""}
              {payment.recordedBy ? ` · سجّلها ${payment.recordedBy}` : ""}
            </p>
            {payment.note ? <p className="mt-1 text-sm leading-6">{payment.note}</p> : null}
            {payment.voided ? (
              <p className="mt-1 text-xs font-semibold text-danger">
                موقّفة{payment.voidReason ? ` — ${payment.voidReason}` : ""}
              </p>
            ) : null}

            {!payment.voided && canVoid ? (
              voiding === payment.id ? (
                <form
                  className="mt-2 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    run(() =>
                      voidContractPayment({ paymentId: payment.id, personId, reason: String(form.get("reason") ?? "") }),
                    );
                    setVoiding(null);
                  }}
                >
                  <ReasonField
                    minLength={reasonMin}
                    id={`void-reason-${payment.id}`}
                    label="سبب التوقيف"
                    hint="المبلغ ما يتمسحش: يتعلّم موقّف ويبقى في السجل، والجدول يرجع لوراه وحدو، وتنجم تسجّل المبلغ الصحيح من بعد."
                  />
                  <div className="flex flex-wrap gap-tight">
                    <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
                      {pending ? "جارٍ…" : "أكّد التوقيف"}
                    </button>
                    <button type="button" onClick={() => setVoiding(null)} className="btn btn-ghost btn-sm">
                      رجوع
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setVoiding(payment.id)} className="btn btn-ghost btn-sm mt-2">
                  وقّف هذه الدفعة
                </button>
              )
            ) : null}
          </li>
        );
      })}

      {error ? (
        <li role="alert" className="error-text">
          {error}
        </li>
      ) : null}
    </ul>
  );
}
