"use client";

// One row of the Finance queue: a schedule line, who owes it, under which contract, and the one act Finance
// performs on it.
//
// THE LINE IS THE SAME OBJECT THE CONTRACT PAGE RENDERS. public.staff_installments builds each row as a
// contract identity plus one element of app.contract_money's `lines[]`, so the type comes from
// ../contracts/contract-model and the colours come from its tone maps. An instalment is one object, and
// reading it twice in two different shapes is how two screens start disagreeing about the same money.
//
// EVERY FIGURE HERE WAS DECIDED IN POSTGRES. `leftMillimes`, `paidMillimes`, `daysLate`, `status`, `isLate`
// and both Arabic labels arrive derived from the live, non-voided payments. This file formats them through
// src/lib/format.ts and works nothing out: there is no division, no rounding and no toLocaleString below.
//
// THE AMOUNT MAKES A ROUND TRIP AND COMES BACK UNCHANGED. «الباقي الكامل» posts the very `left_millimes`
// integer the payload carried — not a figure re-derived in a browser, and not nothing, because the draft
// refuses a null amount. The alternative is a number Finance types in dinars, which the Server Action scales
// as text. Those are the only two paths, and neither of them multiplies anything.
//
// WHY THE CONTROLS ARE NOT ALWAYS DRAWN. Three gates, each mirroring a rule the database holds:
//   the module   «معطّل» closes the ACT, not only the link — staff_record_installment calls
//                app.assert_installments_open() — so with the flag off the block shows the facts, says where
//                the switch is, and draws no button that would be refused.
//   the role     recording money is app.can_record_money() (Finance · Admin · Super Admin). A commercial
//                reads their own client's plan and cannot collect on it; `legal` may sign the contract and
//                still cannot, because taking the cash is a different desk (0063:98).
//   the state    a line that is fully paid takes no more money.
//
// VOIDING IS NOT HERE. The receipts below are the thin ones hanging off the line; the contract page shows a
// payment in full and owns the act. See the note at the foot of ./actions.ts.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { StatusPill } from "@/components/ui";
import { formatDate } from "@/lib/format";

import { recordInstallment } from "./actions";
import {
  daysLateLabel,
  lineTone,
  seqLabel,
  STAGE_TONES,
  stageWorthShowing,
  type Installment,
  type QueueRow,
  formatAmount,
} from "./installment-model";

export type PaymentMethod = { id: string; label: string };

export type InstallmentBlockProps = {
  row: QueueRow;
  /** public.option_items of the list `payment_method`, as the owner keeps it (§30 is deliberately not a list
   *  written in code: «Payment gateway لاحقاً» — online payment is a later phase and nothing here reaches for
   *  one. A recorded instalment is a human recording money that already arrived). */
  methods: readonly PaymentMethod[];
  /** settings audit.reason_min_length; app.require_reason checks it again (§58/v2 §51). */
  reasonMin: number;
  /** app.can_record_money(): Finance, Admin, Super Admin. */
  canRecordMoney: boolean;
  /** The `installments` flag is not «معطّل», so the write RPC will accept a call. */
  moduleOpen: boolean;
};

export function InstallmentBlock({ row, methods, reasonMin, canRecordMoney, moduleOpen }: InstallmentBlockProps) {
  const [open, setOpen] = useState(false);
  const [receiptNo, setReceiptNo] = useState<string | null>(null);
  const line = row.installment;
  const late = daysLateLabel(line.daysLate);
  const canCollect = moduleOpen && canRecordMoney && line.status !== "paid";

  return (
    <article className="card p-cozy space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-tight">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-tight">
            {/* A late line is red whatever it has been part-paid: lateness is what a reader is scanning for. */}
            <StatusPill tone={lineTone(line)}>{line.statusLabel}</StatusPill>
            {/* The CONTRACT's rung of §31 — drawn only when the file itself has something to say. */}
            {stageWorthShowing(row.stage) && row.stageLabel ? (
              <StatusPill tone={STAGE_TONES[row.stage]}>{row.stageLabel}</StatusPill>
            ) : null}
          </div>

          <p className="mt-1 text-sm font-semibold">
            {row.personName ? (
              <Link href={`/admin/leads/${row.personId}`} className="underline-offset-4 hover:underline">
                {row.personName}
              </Link>
            ) : (
              <span className="text-muted">حريف</span>
            )}
            {row.offerCode ? (
              <>
                <span className="mx-1 text-muted">·</span>
                <span dir="ltr" className="inline-block">
                  {row.offerCode}
                </span>
              </>
            ) : null}
          </p>

          <p className="hint mt-0.5">
            {seqLabel(line.seq)}
            {" · العقد "}
            <Link
              href={`/admin/contracts/${row.contractId}`}
              dir="ltr"
              className="inline-block tabular-nums underline-offset-4 hover:underline"
            >
              {row.contractNo}
            </Link>
          </p>
        </div>

        {row.personPhone ? (
          <a href={`tel:${row.personPhone}`} dir="ltr" className="btn btn-ghost btn-sm tabular-nums">
            {row.personPhone}
          </a>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-tight sm:grid-cols-3">
        <Figure label="المبلغ">
          <span className="tabular-nums">{formatAmount(line.amountMillimes)}</span>
        </Figure>

        <Figure label="الباقي">
          {line.leftMillimes > 0 ? (
            <>
              <span className="tabular-nums">{formatAmount(line.leftMillimes)}</span>
              {line.paidMillimes > 0 ? (
                <span className="ms-1 text-xs text-muted">وصل {formatAmount(line.paidMillimes)}</span>
              ) : null}
            </>
          ) : (
            <span className="text-base font-medium text-muted">خلاص</span>
          )}
        </Figure>

        <Figure label="موعد الاستحقاق">
          <span className="tabular-nums">{line.dueOn ? formatDate(line.dueOn) : "—"}</span>
          {late ? <span className="ms-1 text-xs text-danger">{late}</span> : null}
        </Figure>
      </dl>

      {line.note ? <p className="text-sm leading-6">{line.note}</p> : null}

      {line.receipts.length > 0 ? <Receipts line={line} /> : null}

      {receiptNo ? <ReceiptNote receiptNo={receiptNo} /> : null}

      {line.status !== "paid" && !moduleOpen ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          موديول «الأقساط» معطّل، فما تنجمش تسجّل خلاص من هنا.{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            شغّلو من الموديولات
          </Link>
          .
        </p>
      ) : null}

      {line.status !== "paid" && moduleOpen && !canRecordMoney ? (
        <p className="hint">
          تسجيل الخلاص من صلاحية المالية والإدارة. إذا وصلت فلوس، كلّمهم باش يسجّلوها — الوصل يتولّد كي تتسجّل.
        </p>
      ) : null}

      {canCollect ? (
        <div className="flex flex-wrap gap-tight">
          <button type="button" onClick={() => setOpen(!open)} className="btn btn-primary btn-sm">
            {open ? "رجوع" : "سجّل خلاص"}
          </button>
        </div>
      ) : null}

      {canCollect && open ? (
        <RecordForm
          row={row}
          methods={methods}
          reasonMin={reasonMin}
          onDone={(no) => {
            setReceiptNo(no);
            setOpen(false);
          }}
        />
      ) : null}
    </article>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label-sm">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}

/**
 * What already arrived against this line — v3 §29's «Payment date · Payment method · Receipt · Reference
 * bancaire», read from public.payments and never copied onto the line.
 *
 * Read-only. A voided row stays visible and struck back, because §59 wants the trace and because a receipt
 * that simply vanished would leave Finance wondering whether it was ever taken.
 */
function Receipts({ line }: { line: Installment }) {
  return (
    <ul className="space-y-1">
      {line.receipts.map((receipt) => (
        <li key={receipt.id} className={`hint ${receipt.voided ? "line-through opacity-60" : ""}`}>
          <span className="tabular-nums">{formatAmount(receipt.amountMillimes)}</span>
          {" · "}
          <span dir="ltr" className="inline-block tabular-nums">
            {receipt.referenceNo}
          </span>
          {receipt.methodLabel ? ` · ${receipt.methodLabel}` : ""}
          {receipt.receivedAt ? ` · ${formatDate(receipt.receivedAt)}` : ""}
          {receipt.reference ? ` · ${receipt.reference}` : ""}
          {receipt.voided ? " · موقّف" : ""}
        </li>
      ))}
    </ul>
  );
}

/**
 * Runs a Server Action, shows what it refused, and refreshes the screen it changed.
 *
 * The refusal is the SENTENCE the action returned — every one of them says what went wrong and what to do —
 * and never a guess made here from a status code.
 */
function useAct() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run<T extends { ok: true }>(
    call: () => Promise<T | { ok: false; message: string }>,
    onOk: (result: T) => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await call();
      if (result.ok === false) {
        setError(result.message);
        return;
      }
      onOk(result);
      router.refresh();
    });
  }

  return { error, pending, run };
}

/**
 * §30's two requirements, handed back after the fact: the Receipt (our own AGZ-PAY number) and the Reference
 * (the bank's). The client is told the first one on the phone, so the screen says it in one line instead of
 * leaving somebody to go looking for it.
 */
function ReceiptNote({ receiptNo }: { receiptNo: string }) {
  return (
    <p role="status" className="rounded-xl bg-leaf-soft px-4 py-3 text-sm leading-6 text-forest-700">
      تسجّل الخلاص. رقم الوصل اللي تعطيه للحريف:{" "}
      <span dir="ltr" className="inline-block font-semibold tabular-nums">
        {receiptNo}
      </span>
    </p>
  );
}

function RecordForm({
  row,
  methods,
  reasonMin,
  onDone,
}: {
  row: QueueRow;
  methods: readonly PaymentMethod[];
  reasonMin: number;
  onDone: (receiptNo: string | null) => void;
}) {
  const { error, pending, run } = useAct();
  const line = row.installment;
  // «الباقي الكامل» is the default and carries the payload's own integer back unchanged — no arithmetic here,
  // and no null, which the database refuses. The alternative is a figure a human types, and nothing between.
  const [whole, setWhole] = useState(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        recordInstallment({
          contractId: row.contractId,
          installmentId: line.id,
          amountMillimes: whole ? line.leftMillimes : null,
          amountDinars: whole ? null : String(form.get("amount") ?? ""),
          methodOptionId: String(form.get("method") ?? "") || null,
          receivedAt: String(form.get("received_at") ?? "") || null,
          reference: String(form.get("reference") ?? ""),
          note: String(form.get("note") ?? ""),
          reason: String(form.get("reason") ?? ""),
          personId: row.personId,
        }),
      (result) => onDone(result.receiptNo),
    );
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <p className="section-title">سجّل الخلاص اللي وصل</p>

      <fieldset className="space-y-2">
        <legend className="label-sm">قدّاش وصل</legend>
        <label className="choice">
          <input type="radio" name="amount_mode" checked={whole} onChange={() => setWhole(true)} disabled={pending} />
          <span>
            الباقي الكامل — <span className="font-semibold tabular-nums">{formatAmount(line.leftMillimes)}</span>
            <span className="hint block">المبلغ كيما حسبتو قاعدة البيانات بالمليم، ما يتبدّلش في الطريق.</span>
          </span>
        </label>
        <label className="choice">
          <input type="radio" name="amount_mode" checked={!whole} onChange={() => setWhole(false)} disabled={pending} />
          <span>
            مبلغ آخر
            <span className="hint block">
              كي الحريف يخلّص جزء برك، ولا كي يخلّص أكثر من قسط في مرة — الزايد يمشي للقسط اللي بعدو وحدو.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="grid gap-tight sm:grid-cols-2">
        {!whole ? (
          <label className="block">
            <span className="label-sm">المبلغ (د.ت)</span>
            <input
              type="text"
              name="amount"
              inputMode="decimal"
              required
              disabled={pending}
              dir="ltr"
              placeholder="245.500"
              className="field field-sm tabular-nums"
            />
            <span className="hint mt-1 block">
              الباقي على هذا القسط: <span className="tabular-nums">{formatAmount(line.leftMillimes)}</span>
            </span>
          </label>
        ) : null}

        <label className="block">
          <span className="label-sm">طريقة الدفع</span>
          <select name="method" disabled={pending} className="field field-sm" defaultValue="">
            <option value="">— اختر —</option>
            {methods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label-sm">تاريخ الخلاص</span>
          <input type="date" name="received_at" disabled={pending} dir="ltr" className="field field-sm" />
          <span className="hint mt-1 block">خلّيه فارغ إذا وصل اليوم.</span>
        </label>

        <label className="block">
          <span className="label-sm">المرجع البنكي</span>
          <input
            type="text"
            name="reference"
            maxLength={120}
            disabled={pending}
            placeholder="رقم التحويل، رقم الشيك، رقم الوصل…"
            className="field field-sm"
          />
          <span className="hint mt-1 block">رقم الوصل متاعنا يتولّد وحدو ويبان كي تسجّل.</span>
        </label>
      </div>

      <label className="block">
        <span className="label-sm">ملاحظة</span>
        <input type="text" name="note" maxLength={200} disabled={pending} className="field field-sm" />
      </label>

      <ReasonField
        minLength={reasonMin}
        id={`installment-reason-${line.id}`}
        label="سبب التسجيل"
        hint="يتسجّل في سجل العمليات مع المبلغ وطريقة الدفع، ومن بعد ما يتبدّلش."
      />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ التسجيل…" : "سجّل الخلاص"}
      </button>
    </form>
  );
}
