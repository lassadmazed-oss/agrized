"use client";

// One reservation, whole: what is held, what is owed, until when, and the three or four things a human may do
// about it. The same block is used by /admin/reservations and by the client file, because a reservation is one
// object and reading it twice in two different shapes is how two screens start disagreeing.
//
// EVERY FIGURE HERE WAS DECIDED IN POSTGRES. `daysLeft`, `isOverdue`, `depositLeftMillimes` and the status
// label arrive from app.reservation_payload; this file formats them (formatMillimes, formatDate) and works
// nothing out. The one arithmetic it does is dinars → millimes on the amount the user types, which is a unit
// conversion and is done in the Server Action, not here.
//
// WHY THE CONTROLS ARE NOT ALWAYS DRAWN. Three gates, each mirroring a rule the database holds:
//   the module   «معطّل» closes the ACT, not only the link — every write RPC raises module_closed — so with
//                the flag off the block shows the facts and says where to switch it on, and draws no button
//                that would be refused.
//   the role     recording money is app.can_record_money (Finance · Admin), and so is ending a hold, because
//                releasing its trees needs app.can_manage_trees ∩ app.can_see_person and the two lists meet on
//                exactly those. A commercial reads their own reservation and cannot unwind it.
//   the state    a closed reservation takes no more decisions; an offer that asked for no deposit has no
//                deposit to record.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { StatusPill } from "@/components/ui";
import { formatCount, formatDate, formatDateTime, formatMillimes } from "@/lib/format";

import { closeReservation, extendReservation, recordDeposit, voidPayment } from "@/lib/backoffice/reservations/actions";
import { daysLeftLabel, RESERVATION_TONES, type Reservation, type ReservationResult } from "@/lib/backoffice/reservations/model";

export type PaymentMethod = { id: string; label: string };

export type ReservationBlockProps = {
  reservation: Reservation;
  /** public.option_items of the list `payment_method`, as the owner keeps it. */
  methods: readonly PaymentMethod[];
  /** settings audit.reason_min_length; app.require_reason checks it again (§51). */
  reasonMin: number;
  /** app.can_record_money(): Finance, Admin, Super Admin. */
  canRecordMoney: boolean;
  /** The `reservations` flag is not «معطّل», so the write RPCs will accept a call. */
  moduleOpen: boolean;
  /** The list screen names the client; their own file already does. */
  showPerson?: boolean;
};

export function ReservationBlock({
  reservation,
  methods,
  reasonMin,
  canRecordMoney,
  moduleOpen,
  showPerson = false,
}: ReservationBlockProps) {
  const [open, setOpen] = useState<null | "deposit" | "extend" | "close">(null);
  const deadline = daysLeftLabel(reservation.daysLeft, reservation.expiresAt);
  const owesDeposit = reservation.depositDueMillimes > 0;
  const acts = moduleOpen && canRecordMoney && reservation.isOpen;

  return (
    <article className="card p-cozy space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-tight">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-tight">
            <StatusPill tone={RESERVATION_TONES[reservation.status]}>{reservation.statusLabel}</StatusPill>
            <span dir="ltr" className="text-xs tabular-nums text-muted">
              {reservation.referenceNo}
            </span>
            {reservation.isOverdue ? <StatusPill tone="danger">فاتت المدة</StatusPill> : null}
          </div>

          <p className="mt-1 text-sm font-semibold">
            {showPerson && reservation.personName ? (
              <Link href={`/admin/leads/${reservation.personId}`} className="underline-offset-4 hover:underline">
                {reservation.personName}
              </Link>
            ) : null}
            {showPerson && reservation.personName ? <span className="mx-1 text-muted">·</span> : null}
            <Link href={`/admin/projects/${reservation.projectId}`} className="underline-offset-4 hover:underline">
              {reservation.offerName ?? "عرض"}
            </Link>
          </p>

          <p className="hint mt-0.5">
            حجز يوم {formatDate(reservation.reservedAt)}
            {reservation.requestNo ? (
              <>
                {" · على المطلب "}
                <span dir="ltr" className="inline-block tabular-nums">
                  {reservation.requestNo}
                </span>
              </>
            ) : null}
            {reservation.createdBy ? ` · ${reservation.createdBy}` : null}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-tight sm:grid-cols-3">
        <Figure label="الزيتونات">
          <span className="tabular-nums">{formatCount(reservation.treesHeld)}</span>
          {reservation.treesHeld !== reservation.treesCount ? (
            <span className="ms-1 text-xs text-muted">من {formatCount(reservation.treesCount)}</span>
          ) : null}
        </Figure>

        <Figure label="العربون">
          {owesDeposit ? (
            <>
              <span className="tabular-nums">{formatMillimes(reservation.depositPaidMillimes)}</span>
              <span className="ms-1 text-xs text-muted">من {formatMillimes(reservation.depositDueMillimes)}</span>
            </>
          ) : (
            <span className="text-base font-medium text-muted">بلا عربون</span>
          )}
        </Figure>

        <Figure label="مدة الحجز">
          {reservation.expiresAt ? (
            <>
              <span className="tabular-nums">{formatDate(reservation.expiresAt)}</span>
              {deadline ? (
                <span className={`ms-1 text-xs ${reservation.isOverdue ? "text-danger" : "text-muted"}`}>{deadline}</span>
              ) : null}
            </>
          ) : (
            <span className="text-base font-medium text-muted">بلا أجل</span>
          )}
        </Figure>
      </dl>

      {reservation.firstCode ? (
        <p className="text-sm">
          أرقام الزيتونات:{" "}
          <span dir="ltr" className="inline-block font-semibold tabular-nums">
            {reservation.firstCode === reservation.lastCode
              ? reservation.firstCode
              : `${reservation.firstCode} … ${reservation.lastCode}`}
          </span>
        </p>
      ) : null}

      {reservation.treesHeld < reservation.treesCount && reservation.isOpen ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          هذا الحجز خذا {formatCount(reservation.treesCount)} زيتونة، وتوّا ما باقي عندو كان{" "}
          {formatCount(reservation.treesHeld)}: فما زيتونات تفكّ حجزها من تبويب «الزيتونات» متاع العرض. شوف العرض قبل
          ما تكلّم الحريف.
        </p>
      ) : null}

      {reservation.conditionsAr ? (
        <p className="text-sm leading-6 text-muted">
          <span className="font-semibold text-ink">الشروط كيما تقالت للحريف: </span>
          {reservation.conditionsAr}
        </p>
      ) : null}

      {reservation.note ? <p className="text-sm leading-6">{reservation.note}</p> : null}

      {reservation.payments.length > 0 ? (
        <PaymentsList
          reservation={reservation}
          canRecordMoney={canRecordMoney}
          moduleOpen={moduleOpen}
          reasonMin={reasonMin}
        />
      ) : null}

      {!reservation.isOpen ? (
        <p className="hint">
          تسكّر يوم {reservation.closedAt ? formatDateTime(reservation.closedAt) : "—"}
          {reservation.treesReleased ? " · والزيتونات رجعت متاحة." : " · والزيتونات باقية محجوزة."}
          {reservation.closeReason ? ` · ${reservation.closeReason}` : null}
        </p>
      ) : null}

      {reservation.extendedCount > 0 ? (
        <p className="hint">
          تمدّد {formatCount(reservation.extendedCount)} مرة
          {reservation.extendedAt ? ` · آخر مرة ${formatDate(reservation.extendedAt)}` : null}
        </p>
      ) : null}

      {reservation.isOpen && !moduleOpen ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          موديول «العربون والحجز» معطّل، فما تنجمش تسجّل عربون ولا تمدّد ولا تسكّر من هنا.{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            شغّلو من الموديولات
          </Link>
          .
        </p>
      ) : null}

      {acts ? (
        <div className="flex flex-wrap gap-tight">
          {owesDeposit && reservation.depositLeftMillimes > 0 ? (
            <button
              type="button"
              onClick={() => setOpen(open === "deposit" ? null : "deposit")}
              className="btn btn-primary btn-sm"
            >
              سجّل عربون
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(open === "extend" ? null : "extend")}
            className="btn btn-secondary btn-sm"
          >
            مدّد المدة
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === "close" ? null : "close")}
            className="btn btn-ghost btn-sm"
          >
            سكّر الحجز
          </button>
        </div>
      ) : null}

      {acts && open === "deposit" ? (
        <DepositForm reservation={reservation} methods={methods} reasonMin={reasonMin} onDone={() => setOpen(null)} />
      ) : null}
      {acts && open === "extend" ? (
        <ExtendForm reservation={reservation} reasonMin={reasonMin} onDone={() => setOpen(null)} />
      ) : null}
      {acts && open === "close" ? (
        <CloseForm reservation={reservation} reasonMin={reasonMin} onDone={() => setOpen(null)} />
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

// ---------------------------------------------------------------------------
// The four acts
// ---------------------------------------------------------------------------

/** Runs a Server Action, shows what it refused, and refreshes the screen it changed. */
function useAct(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (call: () => Promise<ReservationResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return { error, pending, run };
}

function DepositForm({
  reservation,
  methods,
  reasonMin,
  onDone,
}: {
  reservation: Reservation;
  methods: readonly PaymentMethod[];
  reasonMin: number;
  onDone: () => void;
}) {
  const { error, pending, run } = useAct(onDone);
  // What is still owed, as Postgres computed it, pre-filled in dinars so the usual case is one press.
  const [amount, setAmount] = useState(String(reservation.depositLeftMillimes / 1000));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      recordDeposit({
        reservationId: reservation.id,
        amountDinars: Number(amount),
        methodOptionId: String(form.get("method") ?? "") || null,
        receivedAt: String(form.get("received_at") ?? "") || null,
        reference: String(form.get("reference") ?? ""),
        note: String(form.get("note") ?? ""),
        reason: String(form.get("reason") ?? ""),
      }),
    );
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <p className="section-title">سجّل العربون اللي وصل</p>

      <div className="grid gap-tight sm:grid-cols-2">
        <label className="block">
          <span className="label-sm">المبلغ (د.ت)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            disabled={pending}
            dir="ltr"
            className="field field-sm tabular-nums"
          />
          <span className="hint mt-1 block">
            الباقي: <span className="tabular-nums">{formatMillimes(reservation.depositLeftMillimes)}</span> من{" "}
            <span className="tabular-nums">{formatMillimes(reservation.depositDueMillimes)}</span>
          </span>
        </label>

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
          <span className="label-sm">المرجع</span>
          <input
            type="text"
            name="reference"
            maxLength={120}
            disabled={pending}
            placeholder="رقم الشيك، رقم التحويل، رقم الوصل…"
            className="field field-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="label-sm">ملاحظة</span>
        <input type="text" name="note" maxLength={200} disabled={pending} className="field field-sm" />
      </label>

      <ReasonField
        minLength={reasonMin}
        id={`deposit-reason-${reservation.id}`}
        label="سبب التسجيل"
        hint="يتسجّل في سجل العمليات مع المبلغ وطريقة الدفع، ومن بعد ما يتبدّلش."
      />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ التسجيل…" : "سجّل العربون"}
      </button>
    </form>
  );
}

function ExtendForm({
  reservation,
  reasonMin,
  onDone,
}: {
  reservation: Reservation;
  reasonMin: number;
  onDone: () => void;
}) {
  const { error, pending, run } = useAct(onDone);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("days") ?? "").trim();
    run(() =>
      extendReservation({
        reservationId: reservation.id,
        days: raw === "" ? null : Number(raw),
        reason: String(form.get("reason") ?? ""),
      }),
    );
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <p className="section-title">مدّد مدة الحجز</p>

      <label className="block">
        <span className="label-sm">قدّاش من يوم نزيدو</span>
        <input type="number" name="days" inputMode="numeric" min={1} step={1} disabled={pending} dir="ltr" className="field field-sm tabular-nums" />
        <span className="hint mt-1 block">
          خلّيها فارغة باش ياخذ نفس مدة العرض
          {reservation.validDays > 0 ? ` (${reservation.validDays} يوم)` : ""}. المدة الجديدة تتحسب من تاريخ
          الانتهاء، وإذا فات، من اليوم.
        </span>
      </label>

      <ReasonField minLength={reasonMin} id={`extend-reason-${reservation.id}`} label="سبب التمديد" />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ التمديد…" : "مدّد"}
      </button>
    </form>
  );
}

function CloseForm({
  reservation,
  reasonMin,
  onDone,
}: {
  reservation: Reservation;
  reasonMin: number;
  onDone: () => void;
}) {
  const { error, pending, run } = useAct(onDone);
  const [release, setRelease] = useState(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const outcome = String(form.get("outcome") ?? "cancelled");
    run(() =>
      closeReservation({
        reservationId: reservation.id,
        outcome: outcome === "expired" ? "expired" : "cancelled",
        release,
        reason: String(form.get("reason") ?? ""),
      }),
    );
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <p className="section-title">سكّر الحجز</p>

      <label className="block">
        <span className="label-sm">شنوّة صار</span>
        <select name="outcome" disabled={pending} className="field field-sm" defaultValue={reservation.isOverdue ? "expired" : "cancelled"}>
          <option value="cancelled">الحريف تراجع — نلغي الحجز</option>
          <option value="expired">فاتت المدة وما كمّلش</option>
        </select>
      </label>

      <label className="choice">
        <input
          type="checkbox"
          checked={release}
          onChange={(event) => setRelease(event.target.checked)}
          disabled={pending}
        />
        <span>
          رجّع الزيتونات متاحة
          <span className="hint block">
            كي تحيّد العلامة، الزيتونات يبقاو محجوزين على هذا الحريف وأنت تقرّر فيهم من بعد.
          </span>
        </span>
      </label>

      <ReasonField minLength={reasonMin} id={`close-reason-${reservation.id}`} label="سبب الإغلاق" />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ الإغلاق…" : "سكّر الحجز"}
      </button>
    </form>
  );
}

function PaymentsList({
  reservation,
  canRecordMoney,
  moduleOpen,
  reasonMin,
}: {
  reservation: Reservation;
  canRecordMoney: boolean;
  moduleOpen: boolean;
  reasonMin: number;
}) {
  const { error, pending, run } = useAct(() => undefined);
  const [voiding, setVoiding] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p className="section-title">الدفوعات</p>
      <ul className="space-y-2">
        {reservation.payments.map((payment) => (
          <li key={payment.id} className={`panel p-cozy text-sm ${payment.voided ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-tight">
              <span className="font-semibold tabular-nums">{formatMillimes(payment.amountMillimes)}</span>
              <span dir="ltr" className="text-xs tabular-nums text-muted">
                {payment.referenceNo}
              </span>
            </div>
            <p className="hint mt-0.5">
              {payment.kindLabel}
              {payment.methodLabel ? ` · ${payment.methodLabel}` : ""}
              {payment.receivedAt ? ` · ${formatDate(payment.receivedAt)}` : ""}
              {payment.reference ? ` · ${payment.reference}` : ""}
              {payment.recordedBy ? ` · سجّلها ${payment.recordedBy}` : ""}
            </p>
            {payment.voided ? (
              <p className="mt-1 text-xs font-semibold text-danger">
                موقّفة{payment.voidReason ? ` — ${payment.voidReason}` : ""}
              </p>
            ) : null}

            {!payment.voided && moduleOpen && canRecordMoney ? (
              voiding === payment.id ? (
                <form
                  className="mt-2 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    run(() => voidPayment({ paymentId: payment.id, reason: String(form.get("reason") ?? "") }));
                    setVoiding(null);
                  }}
                >
                  <ReasonField
                    minLength={reasonMin}
                    id={`void-reason-${payment.id}`}
                    label="سبب التوقيف"
                    hint="المبلغ ما يتمسحش: يتعلّم موقّف ويبقى في السجل، وتنجم تسجّل المبلغ الصحيح من بعد."
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
        ))}
      </ul>

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
