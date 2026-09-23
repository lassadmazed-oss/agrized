"use client";

// §30 · Recording money that has arrived. Two moments, one form, because they are one act and one table row:
// an amount, a method, a date and a reference, written into public.payments by public.staff_record_installment.
//
//   kind='down_payment'  §59's «Down Payment Receipt», the money paid at signature. It is ALSO how a CASH
//                        contract gets paid: a cash contract has a down payment equal to the whole price and
//                        zero schedule rows, so without this path a cash buyer's contract could never be
//                        settled. v3 §51 makes «Prix cash» a real case, not an edge one.
//   kind='installment'   §59's «Monthly Payment Receipt», against one schedule line.
//
// BOTH ARE GATED BY `installments`, including the cash one: staff_record_installment asserts that module
// before it reads the kind. The screen mirrors that rather than drawing a control the database would refuse.
//
// The third receipt §59 names, «Arabon Receipt», is kind='deposit' and belongs to the reservations module.
// Three receipt kinds, one payments table, one void path — and «زيتونتي» (app.zitounti_payments, 0068) reads
// all of them without knowing this module exists.
//
// WHAT IT PRE-FILLS AND WHY. The amount opens at what Postgres says is LEFT, in dinars, so the usual case is
// one press. That figure was derived in SQL from the live payment rows, and dinarsFieldValue() turns it into
// the string the box wants by SPLITTING ITS DIGITS — no float division — while the Server Action scales what
// comes back the same way. No arithmetic happens on this side of the wire at all.
//
// THERE IS NO «MARK AS PAID» BUTTON, on purpose. A tick would write a fact onto a schedule line, and the line
// stores what is OWED, never what arrived — public.subscriptions (0066) is the counter-example already in
// this codebase, with its own hand-set payment_status and no dinar in public.payments. Money is recorded as
// money, which is also exactly what v3 §30's «لازم كل دفع يكون عنده Reference و Receipt» asks for.
//
// AND THERE IS NO ONLINE PAYMENT. v3 §30 defers «Payment gateway لاحقاً» and v3 §63 puts online payments in
// Phase 3. Every form here records money a human already received.

import { useState, type FormEvent, type ReactNode } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { formatDate } from "@/lib/format";

import { recordPayment } from "./actions";
import { dinarsFieldValue, formatAmount, isOpen, type Contract, type Installment } from "@/lib/backoffice/contracts/model";
import { useAct } from "./use-act";

export type PaymentMethod = { id: string; label: string };

const REASON_HINT = "يتسجّل في سجل العمليات مع المبلغ وطريقة الدفع، ومن بعد ما يتبدّلش.";

// ---------------------------------------------------------------------------
// The one form
// ---------------------------------------------------------------------------

function MoneyForm({
  title,
  idPrefix,
  leftMillimes,
  ofMillimes,
  leftLabel,
  submitLabel,
  methods,
  reasonMin,
  pending,
  error,
  onSubmit,
  children,
}: {
  title: ReactNode;
  idPrefix: string;
  leftMillimes: number;
  ofMillimes: number;
  leftLabel: string;
  submitLabel: string;
  methods: readonly PaymentMethod[];
  reasonMin: number;
  pending: boolean;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children?: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="panel p-cozy space-y-3">
      <p className="section-title">{title}</p>
      {children}

      <div className="grid gap-tight sm:grid-cols-2">
        <label className="block">
          <span className="label-sm">المبلغ (د.ت)</span>
          <input
            type="number"
            name="amount"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            defaultValue={dinarsFieldValue(leftMillimes)}
            required
            disabled={pending}
            dir="ltr"
            className="field field-sm tabular-nums"
          />
          <span className="hint mt-1 block">
            {leftLabel} <span className="tabular-nums">{formatAmount(leftMillimes)}</span> من{" "}
            <span className="tabular-nums">{formatAmount(ofMillimes)}</span>
          </span>
        </label>

        <label className="block">
          <span className="label-sm">طريقة الدفع</span>
          <select name="method" disabled={pending} className="field field-sm" defaultValue="">
            <option value="">— اختار —</option>
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
          {/* v3 §30 asks for a Reference on every payment. The generated AGZ-PAY number is written by the
              database; this box is the bank's own number, which is what the client reads off their statement. */}
          <span className="hint mt-1 block">رقم البنك ولا رقم الوصل، كيما يقراه الحريف.</span>
        </label>
      </div>

      <label className="block">
        <span className="label-sm">ملاحظة</span>
        <input type="text" name="note" maxLength={200} disabled={pending} className="field field-sm" />
      </label>

      <ReasonField minLength={reasonMin} id={`${idPrefix}-reason`} label="سبب التسجيل" hint={REASON_HINT} />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ التسجيل…" : submitLabel}
      </button>
    </form>
  );
}

/** Reads the four money fields off a submitted form. One copy, so the two acts cannot drift apart. */
function moneyFields(form: FormData) {
  return {
    amountDinars: String(form.get("amount") ?? ""),
    methodOptionId: String(form.get("method") ?? "") || null,
    receivedAt: String(form.get("received_at") ?? "") || null,
    reference: String(form.get("reference") ?? ""),
    note: String(form.get("note") ?? ""),
    reason: String(form.get("reason") ?? ""),
  };
}

// ---------------------------------------------------------------------------
// One instalment
// ---------------------------------------------------------------------------

export function RecordPaymentForm({
  contract,
  installment,
  methods,
  reasonMin,
  onDone,
}: {
  contract: Contract;
  installment: Installment;
  /** public.option_items of the list `payment_method`, as the owner keeps it in الإعدادات ← القوائم. */
  methods: readonly PaymentMethod[];
  /** settings audit.reason_min_length; app.require_reason checks it again (§51). */
  reasonMin: number;
  onDone: () => void;
}) {
  const { error, pending, run } = useAct(onDone);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      recordPayment({
        contractId: contract.id,
        installmentId: installment.id,
        kind: "installment",
        personId: contract.personId,
        ...moneyFields(form),
      }),
    );
  }

  return (
    <MoneyForm
      title={`سجّل القسط ${installment.seq} — مستحقّ يوم ${formatDate(installment.dueOn)}`}
      idPrefix={`installment-${installment.id}`}
      leftMillimes={installment.leftMillimes}
      ofMillimes={installment.amountMillimes}
      leftLabel="الباقي في هذا القسط:"
      submitLabel="سجّل القسط"
      methods={methods}
      reasonMin={reasonMin}
      pending={pending}
      error={error}
      onSubmit={submit}
    />
  );
}

// ---------------------------------------------------------------------------
// The down payment — and the whole of a cash contract
// ---------------------------------------------------------------------------

/**
 * The card on the document page that shows where the signature payment stands and records what arrives.
 *
 * IT PRINTS THE عربون BESIDE THE TSABQA AND NEVER SUMS THEM ITSELF. Neither document says whether the deposit
 * already paid is deducted from the down payment still owed or is a separate fee on top, and that one question
 * decides the amount a client is asked for at signature. app.contract_money answers it once, from the frozen
 * `deposit_credited_millimes` the contract was written under, and this card prints BOTH figures and says which
 * rule was in force — so a wrong answer is visible instead of silent.
 */
export function DownPaymentCard({
  contract,
  methods,
  reasonMin,
  canRecordMoney,
  installmentsOpen,
}: {
  contract: Contract;
  methods: readonly PaymentMethod[];
  reasonMin: number;
  /** app.can_record_money(): Finance, Admin, Super Admin. */
  canRecordMoney: boolean;
  /**
   * The `installments` flag. It gates the DOWN PAYMENT too, which is worth knowing: public
   * .staff_record_installment calls app.assert_installments_open() before it looks at the kind, so a CASH
   * contract — which has no instalments at all — still cannot be paid until that module is switched on. The
   * screen mirrors the database rather than arguing with it, and the handover names it to the owner as the
   * one thing to check before the first cash sale.
   */
  installmentsOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useAct(() => setOpen(false));
  const money = contract.money;
  const owed = money.downPaymentLeftMillimes > 0;
  const canRecord = installmentsOpen && canRecordMoney && isOpen(contract) && owed;
  const cash = contract.paymentMode === "cash";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      recordPayment({
        contractId: contract.id,
        installmentId: null,
        kind: "down_payment",
        personId: contract.personId,
        ...moneyFields(form),
      }),
    );
  }

  return (
    <div className="card p-cozy space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-tight">
        <p className="text-sm">
          <span className="text-muted">{cash ? "الثمن بالحاضر: " : `${money.downPaymentKindLabel}: `}</span>
          <span className="font-semibold tabular-nums">{formatAmount(money.downPaymentPaidMillimes)}</span>
          <span className="text-muted">
            {" من "}
            <span className="tabular-nums">{formatAmount(money.downPaymentDueMillimes)}</span>
          </span>
        </p>
        {owed ? (
          <p className="text-sm">
            <span className="text-muted">الباقي: </span>
            <span className="font-semibold tabular-nums text-danger">
              {formatAmount(money.downPaymentLeftMillimes)}
            </span>
          </p>
        ) : (
          <p className="text-sm font-semibold text-forest">تخلّصت كاملة.</p>
        )}
      </div>

      {contract.reservationDepositMillimes > 0 ? (
        <p className="hint">
          عربون الحجز: <span className="tabular-nums">{formatAmount(contract.reservationDepositMillimes)}</span>{" "}
          —{" "}
          {money.depositCreditedMillimes > 0 ? (
            <>
              محسوب من {money.downPaymentKindLabel} بـ
              <span className="tabular-nums">{formatAmount(money.depositCreditedMillimes)}</span>، كيما تجمّد
              نهار العقد.
            </>
          ) : (
            <>
              زايد على {money.downPaymentKindLabel} وما يتجمّعوش. القاعدة تتبدّل من الإعدادات
              (contracts.deposit_counts_toward_down_payment)، وهي تتجمّد كي يتكتب العقد.
            </>
          )}
        </p>
      ) : null}

      {canRecord ? (
        <button type="button" onClick={() => setOpen((value) => !value)} className="btn btn-primary btn-sm">
          {open ? "رجوع" : cash ? "سجّل الخلاص" : `سجّل ${money.downPaymentKindLabel}`}
        </button>
      ) : null}

      {canRecord && open ? (
        <MoneyForm
          title={cash ? "سجّل خلاص العقد بالحاضر" : `سجّل ${money.downPaymentKindLabel} اللي وصلت`}
          idPrefix={`down-${contract.id}`}
          leftMillimes={money.downPaymentLeftMillimes}
          ofMillimes={money.downPaymentDueMillimes}
          leftLabel="الباقي:"
          submitLabel={cash ? "سجّل الخلاص" : `سجّل ${money.downPaymentKindLabel}`}
          methods={methods}
          reasonMin={reasonMin}
          pending={pending}
          error={error}
          onSubmit={submit}
        />
      ) : null}

      {!open && error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
