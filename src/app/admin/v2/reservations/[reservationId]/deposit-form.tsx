"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatCount, formatDate, formatMillimes } from "@/lib/format";

import { Popup } from "../../popup";

import {
  closeReservation,
  extendReservation,
  recordDeposit,
  voidPayment,
} from "@/lib/backoffice/reservations/actions";
import type { ReservationPayment, ReservationResult } from "@/lib/backoffice/reservations/model";

/**
 * Everything you can do to one hold, as one row of small buttons — and the receipts it produced.
 *
 * WHAT THIS REPLACED. v2 offered exactly one act, «سجّل العربون». Extending a deadline or cancelling a hold
 * meant leaving for the old Back Office and finding the same reservation again — a detour that existed for no
 * reason (owner, 2026-09-23: «the steps not useful»). §24's other two acts are RPCs that were already written
 * and already gated; they are now two buttons on the row next to the first, and voiding a wrong receipt (§59)
 * is a button on the receipt itself.
 *
 * EACH FORM OWNS ITS OWN STATE, and the row owns none. The popup mounts its content only while it is open, so
 * a half-typed amount abandoned yesterday is gone today, and a refusal from «مدّد» cannot appear under
 * «سكّر» — the old shape kept the deposit's fields in the parent, where they outlived the dialog.
 *
 * THE AMOUNT IS TYPED IN DINARS because that is what a person says on the phone and what is written on the
 * receipt they were handed. The multiplication by 1000 happens inside the Server Action, once, next to every
 * other price field in the Back Office — a unit conversion, not a business rule.
 *
 * IT IS PRE-FILLED WITH WHAT IS LEFT, not with the full عربون: a client who paid 400 of 1000 last week and
 * hands over the rest today should not have to work out 600 while standing at a counter. What is owed, what
 * arrived and whether the عربون is settled are all decided in SQL from the rows this writes.
 *
 * THE PREFILL IS EXACT TO THE MILLIME. It used to arrive as `Math.round(left / 1000)`, which is arithmetic on
 * money dressed as a unit conversion: a hold owing 599,500 prefilled «600», one click wrote a 600,000 payment
 * row for 500 millimes nobody handed over, and `deposit_left_millimes` being `greatest(due - paid, 0)` in SQL
 * clamped the overpayment out of sight forever. Rounding the other way left the hold «awaiting_deposit» owing
 * 400. The amount now comes in as millimes and `dinarsField()` writes the digits back with integer arithmetic —
 * 599500 → «599.5» — so «سجّل» submits the number the screen is about. Fractional dinars are ordinary here:
 * invalid_deposit_amount itself offers «مثال: 50 ولا 50.500».
 *
 * NO «سبب التغيير» BOX. audit.reason_min_length has been 0 since 0058, so app.require_reason accepts an empty
 * reason and the audit row still carries who, when, the old value and the new one. Closing and voiding are the
 * two exceptions and their box is optional: that sentence is not for the log, it is printed on the screen from
 * then on — as «سبب التسكير» on the hold, and under «موقّفة» on the receipt.
 *
 * ONLY AN OPEN HOLD CARRIES BUTTONS, and only for the roles the RPCs accept. A closed reservation is a record,
 * not a task, and a «سجّل العربون» under it is an invitation to collect money against nothing.
 */
export function ReservationActs({
  reservationId,
  canAct,
  isOpen,
  overdue,
  owes,
  leftMillimes,
  treesHeld,
  conditions,
  note,
}: {
  reservationId: string;
  /** PRICE_ROLES — the same list app.can_record_money() checks for all four acts. */
  canAct: boolean;
  isOpen: boolean;
  overdue: boolean;
  /** Open, a عربون was asked for, and part of it is still owed. */
  owes: boolean;
  /** What is still owed, in millimes exactly as SQL computed it. The dinars of the field are derived here. */
  leftMillimes: number;
  treesHeld: number;
  conditions: string | null;
  note: string | null;
}) {
  const acts = canAct && isOpen;
  const words = Boolean(conditions || note);
  if (!acts && !words) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {acts && owes ? (
        <Popup title="سجّل العربون" label="سجّل العربون" variant="primary">
          {(close) => <Deposit reservationId={reservationId} leftMillimes={leftMillimes} onDone={close} />}
        </Popup>
      ) : null}

      {acts ? (
        <Popup title="مدّد مدّة الحجز" label="مدّد" variant="secondary">
          {(close) => <Extend reservationId={reservationId} onDone={close} />}
        </Popup>
      ) : null}

      {acts ? (
        <Popup title="سكّر الحجز" label="سكّر" variant="ghost">
          {(close) => (
            <Close reservationId={reservationId} overdue={overdue} treesHeld={treesHeld} onDone={close} />
          )}
        </Popup>
      ) : null}

      {/* ONE BUTTON PER THING TO READ. These were a single button whose label was `conditions ? "الشروط" :
          "الملاحظة"`, so a hold that had both rendered «الشروط» alone: the ملاحظة was inside it, and nothing on
          the screen said a note existed. The note is the one field here a human typed for another human, and a
          reader who did not type it has to be able to see that it is there. Popup is cheap and the row wraps. */}
      {conditions ? (
        <Popup title="الشروط" label="الشروط" variant="ghost">
          {() => <Words label="الشروط كيما تقالت للحريف" text={conditions} />}
        </Popup>
      ) : null}

      {note ? (
        <Popup title="الملاحظة" label="ملاحظة" variant="ghost">
          {() => <Words label="ملاحظة الفريق على هذا الحجز" text={note} />}
        </Popup>
      ) : null}
    </div>
  );
}

/**
 * A written sentence, shown as it was typed — the only content in this module that nobody computed.
 *
 * It takes the nullable value and draws nothing on empty, rather than asking the caller to prove it is a string:
 * the caller is a render prop inside `{conditions ? … }`, and TypeScript drops the narrowing of a parameter
 * across a closure boundary.
 */
function Words({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-[0.6875rem] text-muted">{label}</p>
      <p className="whitespace-pre-line text-sm leading-6 text-ink">{text}</p>
    </div>
  );
}

/**
 * The receipts, one 40px row each: what arrived, when, and against what number.
 *
 * NO HEADING OVER THEM. Every row leads with «عربون» and a date, which says what the list is better than a
 * word floating above it would — and the heading was a whole line of page for no information. The card is not
 * drawn at all when nothing has been paid, because «ما فماش خلاصات» is a sentence the reader already knows.
 *
 * A VOIDED ROW STAYS, STRUCK THROUGH, with its reason. §59: money never disappears from the record, and the
 * sums beside it (خلّص · باقي) already exclude it — they are counted in SQL from the live rows only.
 */
export function Payments({ payments, canAct }: { payments: ReservationPayment[]; canAct: boolean }) {
  if (payments.length === 0) return null;

  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {payments.map((payment) => (
        <li key={payment.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span
              className={`block text-sm font-semibold tabular-nums ${
                payment.voided ? "text-muted line-through" : "text-ink"
              }`}
            >
              {money(payment.amountMillimes)}
            </span>
            <span className="block truncate text-[0.6875rem] leading-tight text-muted">
              {join(payment.kindLabel, formatDate(payment.receivedAt), payment.methodLabel)}
            </span>
          </span>

          <span className="hidden min-w-0 flex-1 text-[0.6875rem] leading-tight text-muted sm:block">
            <span dir="ltr" className="block truncate">
              {payment.referenceNo}
            </span>
            {join(payment.reference, payment.recordedBy) ? (
              <span className="block truncate">{join(payment.reference, payment.recordedBy)}</span>
            ) : null}
          </span>

          {payment.voided ? (
            <span className="min-w-0 shrink-0 text-end text-[0.6875rem] leading-tight text-danger">
              <span className="block font-semibold">موقّفة</span>
              {payment.voidReason ? <span className="block max-w-32 truncate">{payment.voidReason}</span> : null}
            </span>
          ) : canAct ? (
            <Popup title={`وقّف ${money(payment.amountMillimes)}`} label="وقّف" variant="ghost">
              {(close) => <Void paymentId={payment.id} onDone={close} />}
            </Popup>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The parts of a line that were answered, joined — an empty line rather than a row of dashes. */
function join(...parts: (string | null)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" · ");
}

/**
 * Money that shows its millimes only when it has any: «600 د.ت», but «599.500 د.ت» for 599,500.
 *
 * formatMillimes()'s default of 0 decimals is what keeps a receipt row 40px tall, and it is also what let a
 * 500-millime error hide on this screen. The twin of this function is in page.tsx, deliberately copied: that
 * file is a Server Component and cannot call a value imported from a "use client" module like this one.
 */
function money(millimes: number): string {
  return formatMillimes(millimes, { withMillimes: millimes % 1000 !== 0 });
}

/**
 * Millimes → the digits of the dinars field, exactly, with no arithmetic on the money.
 *
 * Integer division and remainder only: 599500 → «599.5», 599400 → «599.4», 599010 → «599.01», 600000 → «600».
 * recordDeposit() multiplies by 1000 and rounds once, on the server, and gets back the millime it started from.
 * Nothing is owed → an empty field, because a prefilled «0» is a number the operator has to delete before they
 * can type, and «سجّل» refuses 0 anyway.
 */
function dinarsField(millimes: number): string {
  if (!Number.isFinite(millimes) || millimes <= 0) return "";
  const whole = Math.floor(millimes / 1000);
  const rest = Math.round(millimes % 1000);
  if (rest === 0) return String(whole);
  return `${whole}.${String(rest).padStart(3, "0").replace(/0+$/, "")}`;
}

// ---------------------------------------------------------------------------
// The four acts
// ---------------------------------------------------------------------------

/**
 * Runs one act and reports what the database refused, in its own words.
 *
 * The popup closes only after `ok`, never on submit and never on a timer: a form that was refused has to stay
 * open carrying its sentence, because the sentence is the only place the fix is written.
 */
function useAct(onDone: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (call: () => Promise<ReservationResult>) => {
    setError(null);
    start(async () => {
      const result = await call();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onDone();
    });
  };

  return { pending, error, run };
}

function Failure({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm leading-6 text-danger">
      {error}
    </p>
  );
}

function Deposit({
  reservationId,
  leftMillimes,
  onDone,
}: {
  reservationId: string;
  leftMillimes: number;
  onDone: () => void;
}) {
  const { pending, error, run } = useAct(onDone);
  const [amount, setAmount] = useState(() => dinarsField(leftMillimes));
  const [reference, setReference] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          // A millime is a thousandth of a dinar, so the field's own step has to be one too: with the default
          // step of 1 the browser calls «599.5» an invalid number in a field whose error text offers «50.500».
          step="0.001"
          min="0"
          className="field w-32 tabular-nums"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="المبلغ"
          aria-label="المبلغ بالدينار"
        />
        <input
          className="field flex-1"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="رقم الوصل (اختياري)"
        />
      </div>

      <button
        type="button"
        onClick={() =>
          run(() =>
            recordDeposit({
              reservationId,
              amountDinars: Number(amount),
              reference: reference.trim() || null,
            }),
          )
        }
        disabled={pending || !(Number(amount) > 0)}
        className="btn btn-primary w-full"
      >
        {pending ? "…" : "سجّل"}
      </button>

      <Failure error={error} />
    </div>
  );
}

/** Days empty repeats the offer's own period; the new deadline is worked out in Postgres, from the old one or
 *  from today when that one is already behind us. The cap on a single extension is a setting, so a number over
 *  it comes back as a sentence from the server instead of being guessed at here. */
function Extend({ reservationId, onDone }: { reservationId: string; onDone: () => void }) {
  const { pending, error, run } = useAct(onDone);
  const [days, setDays] = useState("");

  const typed = days.trim();
  const ok = typed === "" || (Number.isInteger(Number(typed)) && Number(typed) >= 1);

  return (
    <div className="space-y-3">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        className="field w-full tabular-nums"
        value={days}
        onChange={(event) => setDays(event.target.value)}
        placeholder="عدد الأيام"
        aria-label="عدد الأيام"
      />
      <p className="text-[0.6875rem] leading-tight text-muted">
        خلّيها فارغة باش يزيد نفس مدّة العرض. إذا فاتت المدّة، الأجل الجديد يتحسب من اليوم.
      </p>

      <button
        type="button"
        onClick={() => run(() => extendReservation({ reservationId, days: typed === "" ? null : Number(typed) }))}
        disabled={pending || !ok}
        className="btn btn-primary w-full"
      >
        {pending ? "…" : "مدّد"}
      </button>

      <Failure error={error} />
    </div>
  );
}

/** «يلغي» and «انتهت مدّته» in one call, with the release of the trees inside the same transaction — the only
 *  way a closed hold can never leave its stock frozen. An overdue hold opens on «فاتت المدّة», because that is
 *  what it is. */
function Close({
  reservationId,
  overdue,
  treesHeld,
  onDone,
}: {
  reservationId: string;
  overdue: boolean;
  treesHeld: number;
  onDone: () => void;
}) {
  const { pending, error, run } = useAct(onDone);
  const [outcome, setOutcome] = useState<"cancelled" | "expired">(overdue ? "expired" : "cancelled");
  const [release, setRelease] = useState(true);
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3">
      <select
        className="field w-full"
        value={outcome}
        onChange={(event) => setOutcome(event.target.value === "expired" ? "expired" : "cancelled")}
        aria-label="شنوّة صار"
      >
        <option value="cancelled">الحريف تراجع — نلغي الحجز</option>
        <option value="expired">فاتت المدّة وما كمّلش</option>
      </select>

      <label className="choice">
        <input type="checkbox" checked={release} onChange={(event) => setRelease(event.target.checked)} />
        <span className="text-sm">
          {treesHeld > 0 ? `رجّع ${formatCount(treesHeld)} زيتونة متاحة` : "رجّع الزيتونات متاحة"}
          <span className="block text-[0.6875rem] leading-tight text-muted">
            كي تحيّد العلامة، الزيتونات يبقاو محجوزين على هذا الحريف.
          </span>
        </span>
      </label>

      <input
        className="field w-full"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="علاش (اختياري)"
        aria-label="سبب التسكير"
      />

      <button
        type="button"
        onClick={() => run(() => closeReservation({ reservationId, outcome, release, reason: reason.trim() || null }))}
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "…" : "سكّر الحجز"}
      </button>

      <Failure error={error} />
    </div>
  );
}

function Void({ paymentId, onDone }: { paymentId: string; onDone: () => void }) {
  const { pending, error, run } = useAct(onDone);
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-muted">
        المبلغ ما يتمسحش: يتعلّم موقّف ويبقى في السجل، وتنجم تسجّل المبلغ الصحيح من بعد.
      </p>

      <input
        className="field w-full"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="علاش وقّفتها (اختياري)"
        aria-label="سبب التوقيف"
      />

      <button
        type="button"
        onClick={() => run(() => voidPayment({ paymentId, reason: reason.trim() || null }))}
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "…" : "وقّف الدفعة"}
      </button>

      <Failure error={error} />
    </div>
  );
}
