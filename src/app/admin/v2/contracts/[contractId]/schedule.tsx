"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { daysLateLabel, formatAmount } from "@/lib/backoffice/contracts/model";
import { formatCount, formatDate } from "@/lib/format";
import { intakeErrorMessage } from "@/lib/errors";

import { Popup } from "../../popup";

import { recordInstallment } from "@/lib/backoffice/installments/actions";

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

/** public.option_items of the list `payment_method`, as the owner keeps it in الإعدادات ← القوائم. */
export type PaymentMethod = { id: string; label: string };

/**
 * جدول الأقساط — the lines that need a human today, and the rest folded away.
 *
 * WHAT CHANGED. This printed every line of the plan. A 24-month contract was 24 rows of ~46px — some 1100px
 * of page, of which twenty rows said «تخلّص» and asked for nothing; an 84-month plan was four screens of
 * settled history under the one line somebody opened the contract to collect on (owner, 2026-09-23: «stuff
 * shouldn't take that much space»). Now the card is at most four rows: every late line, every part-paid line,
 * and the next two due. Twenty-four rows became four, and the full plan is one press away instead of always
 * underfoot.
 *
 * THE EARLIEST UNPAID LINE IS ALWAYS THE FIRST ROW, because the look-ahead set is taken off the head of the
 * open lines in schedule order. That is why nothing here repeats «الجاي» — the next due date is the first row,
 * with its own «سجّل» button.
 *
 * AND NOTHING HERE COUNTS. There is no «خلّص 5 قسط من 24» and no «متأخرة 2» strip any more: both figures are
 * already produced by app.contract_money — installments_paid_count and missed_count — and already printed one
 * card higher, by the «الأقساط الباقية» Tile («5 / 24», red when missed_count > 0). Counting the same lines a
 * second time in the browser is two derivations of one fact, printed twice within 200px, and the day the two
 * disagree the page is lying with a straight face. The filtering below is a CHOICE OF ROWS, not a figure: no
 * count it makes is ever shown.
 *
 * NO MONEY IS ADDED UP EITHER, and every dinar goes through formatAmount() — the instalment, the remainder,
 * the button's own label. NOT formatMillimes(): that rounds to whole dinars, so a remainder of 245,500
 * millimes reads «246 د.ت» while the button beside it collects 245.500, and Finance reads the wrong one of the
 * two to a client down the phone. Amounts with a millimes part are the normal case here, not the edge —
 * app.financed_quote rounds the monthly UP and «the last one absorbs the difference», and any partial payment
 * leaves an arbitrary remainder. The rule and the helper both belong to the contracts module (model.ts).
 *
 * «خلّص الباقي» SENDS BACK THE INTEGER POSTGRES PRODUCED. app.contract_money reported `left_millimes` for this
 * line; the button hands that number back unchanged. It is a pass-through, never a computation — nothing here
 * divides by a thousand, rounds, or decides what «the rest» means, so the browser never has to know that a
 * dinar is a thousand millimes. The balances are a waterfall in SQL: a surplus lands on the next line, and
 * only a total beyond the whole schedule is refused.
 *
 * A PARTIAL PAYMENT IS TYPED IN DINARS, because that is what the client handed over and what the receipt
 * says. That path sends dinars as TEXT and the Server Action converts once, next to every other price field
 * in the Back Office.
 *
 * ONLY UNPAID LINES CARRY A BUTTON — here and inside the full schedule alike. A settled line is a record, not
 * a task, and a «سجّل» under it is an invitation to take the same money twice.
 *
 * THE FULL SCHEDULE RECORDS IN PLACE rather than opening a second popup over the first: a line far down the
 * plan expands into the same form the rows use, one press, no nested dialog. Each form owns its own amount and
 * its own error, so a refusal on قسط 6 cannot follow the reader to قسط 7.
 */

/** How many of the coming lines are worth showing before they are late, and the ceiling on the inline list. */
const LOOKAHEAD = 2;
const INLINE_MAX = 4;

export function Schedule({
  contractId,
  lines,
  methods = [],
}: {
  contractId: string;
  lines: Line[];
  /**
   * «طريقة الدفع» — public.option_items of the list `payment_method`, which only the server can read
   * (optionsFor(config, "payment_method"), as in every other screen that records money). The select is drawn
   * when the list arrives and folded away when it does not, so the screen never shows an empty menu.
   */
  methods?: readonly PaymentMethod[];
}) {
  if (lines.length === 0) return null;

  const open = lines.filter((line) => line.leftMillimes > 0);
  const soon = new Set(open.slice(0, LOOKAHEAD).map((line) => line.id));
  const attention = open
    .filter((line) => line.isLate || line.paidMillimes > 0 || soon.has(line.id))
    .slice(0, INLINE_MAX);

  return (
    <div className="card divide-y divide-line overflow-hidden">
      {attention.map((line) => (
        <div key={line.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tabular-nums text-ink">
              {formatAmount(line.amountMillimes)}
            </span>
            <span className="block text-[0.6875rem] leading-tight text-muted">
              قسط {formatCount(line.seq)} · {formatDate(line.dueOn)}
            </span>
          </span>

          <span className="shrink-0 text-end">
            <span
              className={`block text-[0.6875rem] font-semibold leading-tight ${
                line.isLate ? "text-danger" : "text-muted"
              }`}
            >
              {(line.isLate ? daysLateLabel(line.daysLate) : null) ?? line.statusLabel}
            </span>
            {line.paidMillimes > 0 ? (
              <span className="block text-[0.6875rem] leading-tight tabular-nums text-muted">
                باقي {formatAmount(line.leftMillimes)}
              </span>
            ) : null}
          </span>

          <Popup
            title={`قسط ${formatCount(line.seq)} · ${formatDate(line.dueOn)}`}
            label="سجّل"
            variant="primary"
          >
            {(close) => <Record contractId={contractId} line={line} methods={methods} onDone={close} />}
          </Popup>
        </div>
      ))}

      {attention.length < lines.length ? (
        <div className="p-2">
          <Popup title="جدول الأقساط" label="الجدول الكامل" variant="ghost" block>
            {() => <Full contractId={contractId} lines={lines} methods={methods} />}
          </Popup>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The whole plan, one line per instalment: number, date, amount, and only the state worth a word.
 *
 * A line that is simply not due yet says nothing in the last column — its «سجّل» is the state. Late and
 * part-paid lines are the two that get printed, which is what keeps 84 rows to one line each at 375px.
 */
function Full({
  contractId,
  lines,
  methods,
}: {
  contractId: string;
  lines: Line[];
  methods: readonly PaymentMethod[];
}) {
  const [recording, setRecording] = useState<string | null>(null);

  return (
    <ol className="-m-4 divide-y divide-line">
      {lines.map((line) => {
        const owing = line.leftMillimes > 0;
        const editing = recording === line.id;

        return (
          <li key={line.id}>
            {owing ? (
              <button
                type="button"
                onClick={() => setRecording((current) => (current === line.id ? null : line.id))}
                aria-expanded={editing}
                className="flex w-full items-center gap-2 px-4 py-2 text-start transition-colors hover:bg-paper"
              >
                <Cells line={line} />
                <span className="shrink-0 text-[0.6875rem] font-semibold text-forest">
                  {editing ? "سكّر" : "سجّل"}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2">
                <Cells line={line} />
                <span className="shrink-0 text-[0.6875rem] text-muted">{line.statusLabel}</span>
              </div>
            )}

            {editing ? (
              <div className="border-t border-line bg-paper px-4 py-3">
                <Record
                  contractId={contractId}
                  line={line}
                  methods={methods}
                  onDone={() => setRecording(null)}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Cells({ line }: { line: Line }) {
  return (
    <>
      <span className="w-6 shrink-0 text-[0.6875rem] font-bold tabular-nums text-muted">
        {formatCount(line.seq)}
      </span>
      <span className="flex-1 truncate text-[0.6875rem] tabular-nums text-muted">{formatDate(line.dueOn)}</span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
        {formatAmount(line.amountMillimes)}
      </span>
      {line.isLate ? (
        <span className="shrink-0 text-[0.6875rem] font-semibold text-danger">
          {daysLateLabel(line.daysLate) ?? line.statusLabel}
        </span>
      ) : line.paidMillimes > 0 && line.leftMillimes > 0 ? (
        <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted">
          باقي {formatAmount(line.leftMillimes)}
        </span>
      ) : null}
    </>
  );
}

/**
 * «سبب التغيير» IS ASKED FOR ONLY WHEN THE DATABASE ASKS FOR IT, and this is how the screen knows.
 *
 * app.require_reason (0058) accepts an empty reason while audit.reason_min_length is zero — which it has been
 * since the owner removed the box from all ten v1 screens — and raises `reason_required` the moment that
 * setting goes above zero. The minimum itself is not public (settings.is_public = false), so a Client
 * Component cannot read it and cannot decide in advance whether to draw the field; src/components/admin/
 * reason-field.tsx is handed the number by its page.
 *
 * So the field appears on the refusal that names it: the Server Action hands back only a sentence, and this is
 * that sentence regenerated from the very map it came through (installmentErrorMessage falls through to
 * @/lib/errors for this code). An identity check on one code, not a message copied into a screen — and the
 * refusal «اكتب في خانة «سبب التغيير» …» now lands next to the box it tells the reader to fill, instead of
 * pointing at one that was never drawn. The typed reason is sent on every attempt either way.
 */
const REASON_REQUIRED = intakeErrorMessage("reason_required");

/**
 * The one act Finance performs on a line: the whole remainder, or a figure typed in dinars — with the
 * properties of the money it arrived with.
 *
 * WHAT THE FORM COLLECTS, AND WHY NONE OF IT IS OPTIONAL TO OFFER. §29/§30 make طريقة الدفع, تاريخ الخلاص and
 * المرجع البنكي properties of the payment, not of the screen: public.staff_record_installment writes the
 * method's id AND its Arabic label onto the receipt, `received_at` defaults to now() only when nothing is
 * sent, and app.contract_money reads all three back out per line. A redesign may fold an act into one popup;
 * it may not drop the inputs the act needs and leave every v2-recorded receipt with a null method.
 *
 * THE AMOUNT BOX IS TEXT, dir="ltr", with a worked example in it. Not type="number": in Chrome a comma
 * keystroke empties `event.target.value` while the box still looks filled, so the reader sees «245,5» and the
 * screen sees "". As text it is the same digits-as-text path every other price field in the Back Office uses —
 * dinarsToMillimes normalises the comma and the Arabic digits server-side, and refuses what is not a number
 * with the sentence that carries the example. dir="ltr" keeps «245.500» from being laid out against the RTL
 * paragraph direction.
 *
 * `onDone` is called ONLY after the reader has been shown the receipt number. A refusal keeps the form open
 * with its message, because only this component knows whether the money landed.
 */
function Record({
  contractId,
  line,
  methods,
  onDone,
}: {
  contractId: string;
  line: Line;
  methods: readonly PaymentMethod[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ receiptNo: string | null } | null>(null);

  /**
   * The page behind the form is re-read ONCE, when the form goes away — not the instant the money lands.
   *
   * A refresh while the receipt is on screen is a refresh that takes it away: the recorded line is no longer
   * owing, so it drops out of the rows above, the popup holding it unmounts, and the AGZ-PAY number the
   * collector is reading to a client down the phone disappears mid-sentence. So it is deferred to the
   * cleanup, which covers every way out of the dialog — «سكّر», Esc, and the backdrop alike.
   */
  const landed = useRef(false);
  useEffect(
    () => () => {
      if (landed.current) router.refresh();
    },
    [router],
  );

  const record = (whole: boolean) => {
    setError(null);
    start(async () => {
      const result = await recordInstallment({
        contractId,
        installmentId: line.id,
        // Either Postgres's own integer comes back untouched, or Finance typed dinars. Never both.
        amountMillimes: whole ? line.leftMillimes : null,
        amountDinars: whole ? null : amount,
        methodOptionId: method || null,
        receivedAt: receivedAt || null,
        reference: reference.trim() || null,
        note: note.trim() || null,
        reason: reason.trim() || null,
      });
      if (!result.ok) {
        if (result.message === REASON_REQUIRED) setAskReason(true);
        setError(result.message);
        return;
      }
      landed.current = true;
      setDone({ receiptNo: result.receiptNo });
    });
  };

  if (done) return <Receipt receiptNo={done.receiptNo} onClose={onDone} />;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {methods.length > 0 ? (
          <label className="col-span-2 block">
            <span className="label-sm block">طريقة الدفع</span>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              disabled={pending}
              className="field field-sm"
            >
              <option value="">— اختر —</option>
              {methods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="label-sm block">تاريخ الخلاص</span>
          <input
            type="date"
            dir="ltr"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
            disabled={pending}
            aria-describedby={`received-${line.id}`}
            className="field field-sm"
          />
        </label>

        <label className="block">
          <span className="label-sm block">المرجع البنكي</span>
          <input
            type="text"
            maxLength={120}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            disabled={pending}
            placeholder="تحويل، شيك…"
            className="field field-sm"
          />
        </label>

        <label className="col-span-2 block">
          <span className="label-sm block">ملاحظة</span>
          <input
            type="text"
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
            className="field field-sm"
          />
        </label>
      </div>

      <p id={`received-${line.id}`} className="text-[0.6875rem] leading-tight text-muted">
        خلّي التاريخ فارغ إذا الفلوس وصلت اليوم. رقم الوصل متاعنا يتولّد وحدو ويبان كي تسجّل.
      </p>

      {askReason ? (
        <label className="block">
          <span className="label-sm block">سبب التغيير</span>
          <input
            type="text"
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={pending}
            aria-invalid={error === REASON_REQUIRED ? true : undefined}
            className="field field-sm"
          />
          <span className="mt-1 block text-[0.6875rem] leading-tight text-muted">
            يتسجّل في سجل العمليات مع المبلغ وطريقة الدفع، ومن بعد ما يتبدّلش.
          </span>
        </label>
      ) : null}

      <button
        type="button"
        onClick={() => record(true)}
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "…" : `خلّص الباقي ${formatAmount(line.leftMillimes)}`}
      </button>

      <div className="space-y-1">
        <p className="label-sm">ولا مبلغ آخر بالدينار</p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="245.500"
            aria-label="مبلغ آخر بالدينار"
            disabled={pending}
            className="field field-sm flex-1 tabular-nums"
          />
          <button
            type="button"
            onClick={() => record(false)}
            // Empty is the only refusal this side makes: what IS a number, and how many decimals it may
            // carry, is dinarsToMillimes's judgement, and its sentence names «245.500» when it says no.
            disabled={pending || amount.trim() === ""}
            className="btn btn-secondary btn-sm"
          >
            {pending ? "…" : "سجّل"}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm leading-6 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * §30's own requirement, handed back after the fact: the AGZ-PAY number the receipt was written under.
 *
 * That number is what the client is told on the phone, and the Server Action answers with it for exactly this
 * reason — a collection screen that throws it away makes somebody go looking for it. Nothing else about the
 * payment is echoed here: every other figure is derived, and the page re-reads them from the server the moment
 * this closes.
 */
function Receipt({ receiptNo, onClose }: { receiptNo: string | null; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <p role="status" className="rounded-xl bg-leaf-soft px-3 py-2.5 text-sm leading-6 text-forest">
        {receiptNo ? (
          <>
            تسجّل الخلاص. رقم الوصل اللي تعطيه للحريف:{" "}
            <span dir="ltr" className="inline-block font-bold tabular-nums">
              {receiptNo}
            </span>
          </>
        ) : (
          "تسجّل الخلاص. رقم الوصل تلقاه في خلاصات العقد."
        )}
      </p>

      <button type="button" onClick={onClose} className="btn btn-secondary w-full">
        سكّر
      </button>
    </div>
  );
}
