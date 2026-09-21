"use client";

// §28 · Writing the contract. The one act that turns a hold into a sale, and the only place in the product
// that does: public.reservation_status carries 'converted' and nothing else in the database writes it —
// staff_close_reservation refuses it by name (0063:1090) above a comment saying stage 3 owns it, and the
// reservations screen already tells staff «تحويلو لعقد يصير من وحدة العقود كي تتبنى». This form is that
// promise being kept.
//
// IT SAYS WHAT IT IS ABOUT TO DO, BEFORE IT DOES IT. One press closes the reservation, marks its trees
// `sold` and freezes the agreed price — three irreversible things in one transaction, one of which moves a
// number on the public home page. A control that quietly does three things is how a commercial finds out
// afterwards; the panel below names all of them first.
//
// EVERY PLAN FIELD MAY BE LEFT EMPTY, and that is the point. staff_create_contract falls back to the client's
// own demand for the payment mode, the down payment and the duration, so the ordinary case is: pick the hold,
// press. The three boxes are for the deal that changed on the phone — and when neither the form nor the demand
// answers, the database refuses BY NAME («not answering is an answer», 0061's rule) instead of defaulting to
// cash and selling something nobody agreed to.
//
// IT COMPUTES NOTHING. The plan is worked out once, in Postgres, inside the signing transaction, by
// app.financed_quote — whose installments_count and last_installment_millimes have no column on
// public.interest_requests at all, which is exactly why the contract snapshots them instead of the demand.
//
// THE SIGNATURE IS NOT HERE. A contract is born a draft: v3 §45 gives the commercial «Generate Contract
// Request», a request and not an issuance. The date and the legal reference are recorded afterwards, on the
// contract's own page, and the schedule is generated then — because every due date counts from the signature.

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { formatCount } from "@/lib/format";

import { createContract } from "./actions";
import type { ConvertibleReservation } from "./contract-model";
import type { PaymentMethod } from "./payment-forms";
import { useAct } from "./use-act";

export type ContractKind = { id: string; label: string };

/** The database's own one-word reason, turned into a sentence that says what to do about it. */
const BLOCKED: Record<string, string> = {
  deposit: "العربون مازال ما كملش — سجّلو من «الحجز والعربون» قبل.",
};

export function SignForm({
  personName,
  choices,
  kinds,
  methods,
  reasonMin,
  moduleOpen,
  canSign,
  requireDepositPaid,
}: {
  personName: string;
  /** The holds on this file that have no contract yet. Which ones are BLOCKED is the database's decision. */
  choices: readonly ConvertibleReservation[];
  /** The option list `contract_kind` — «عقد وعد بالبيع» today, and whatever the owner adds beside it. */
  kinds: readonly ContractKind[];
  methods: readonly PaymentMethod[];
  reasonMin: number;
  /** The `contracts` flag is not «معطّل», so staff_create_contract will accept a call. */
  moduleOpen: boolean;
  /** app.can_contract_trees(): legal · finance · admin. The commercial who sold it cannot sign it (0054:85). */
  canSign: boolean;
  /** settings contracts.require_deposit_paid, so the screen can explain a block instead of just showing it. */
  requireDepositPaid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ready = choices.filter((row) => row.blockedBy === null);
  const [picked, setPicked] = useState<string | null>(ready[0]?.reservationId ?? null);
  const [mode, setMode] = useState<"" | "cash" | "installments">("");
  const { error, pending, run } = useAct(() => {
    setOpen(false);
    setPicked(null);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked) return;
    const form = new FormData(event.currentTarget);
    run(() =>
      createContract({
        reservationId: picked,
        kindOptionId: String(form.get("kind") ?? "") || null,
        methodOptionId: String(form.get("method") ?? "") || null,
        paymentMode: mode === "" ? null : mode,
        downPaymentDinars: String(form.get("down") ?? ""),
        durationMonths: String(form.get("months") ?? ""),
        note: String(form.get("note") ?? ""),
        reason: String(form.get("reason") ?? ""),
      }),
    );
  }

  if (choices.length === 0) {
    return (
      <p className="card p-cozy text-sm leading-6 text-muted">
        ما فماش حجز جاهز باش يولّي عقد. العقد يتكتب على حجز: احجز الزيتونات لـ{personName} من قسم «الحجز
        والعربون»{requireDepositPaid ? "، سجّل العربون" : ""}، ومن بعد ارجع لهنا.
      </p>
    );
  }

  if (!canSign) {
    // A control that always fails is a lie. The database refuses it anyway (app.can_contract_trees), so the
    // reader is told who may, not shown a button that will tell them no.
    return (
      <p className="card p-cozy text-sm leading-6 text-muted">
        فمّا {formatCount(ready.length)} حجز جاهز للتعاقد، أما كتابة العقد من صلاحية القانوني والمالية
        والإدارة. كلّمهم باش يكتبوه — التجاري يحجز في ملفّو ويسجّل العربون، والعقد يتعدّاه.
      </p>
    );
  }

  if (!moduleOpen) {
    return (
      <p className="card p-cozy text-sm leading-6">
        <span className="font-semibold">موديول «العقود ووعد البيع» معطّل</span>، فكتابة العقد موقّفة في قاعدة
        البيانات روحها. فمّا {formatCount(ready.length)} حجز جاهز مستنّي.{" "}
        <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
          شغّلو من الإعدادات ← الموديولات
        </Link>
        : «داخلي فقط» تكفي باش يخدم الفريق.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="card p-cozy space-y-2">
        <p className="text-sm leading-6">
          فمّا <span className="font-semibold tabular-nums">{formatCount(ready.length)}</span> حجز جاهز باش
          يولّي عقد
          {choices.length > ready.length ? (
            <span className="text-muted">
              {" "}
              (و{formatCount(choices.length - ready.length)} مازال ما ينجمش)
            </span>
          ) : null}
          .
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-primary btn-sm"
          disabled={ready.length === 0}
        >
          اكتب عقد
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-cozy space-y-4">
      <p className="section-title">اكتب عقد لـ{personName}</p>

      <fieldset className="space-y-2">
        <legend className="label-sm mb-1">على أنا حجز</legend>
        {choices.map((row) => (
          <label key={row.reservationId} className={`choice ${row.blockedBy ? "opacity-60" : ""}`}>
            <input
              type="radio"
              name="reservation"
              value={row.reservationId}
              checked={picked === row.reservationId}
              onChange={() => setPicked(row.reservationId)}
              disabled={pending || row.blockedBy !== null}
            />
            <span className="min-w-0">
              <span className="font-semibold">
                <span className="tabular-nums">{formatCount(row.treesHeld)}</span> زيتونة
                {row.offerCode ? (
                  <>
                    {" من "}
                    <span dir="ltr" className="inline-block tabular-nums">
                      {row.offerCode}
                    </span>
                  </>
                ) : null}
              </span>
              <span className="hint block">
                <span dir="ltr" className="inline-block tabular-nums">
                  {row.referenceNo}
                </span>
                {row.requestId ? " · على مطلب الحريف" : " · بلا مطلب"}
              </span>
              {row.blockedBy ? (
                <span className="hint block text-danger">
                  {BLOCKED[row.blockedBy] ?? "هذا الحجز ما ينجمش يولّي عقد توّا."}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-tight sm:grid-cols-2">
        <label className="block">
          <span className="label-sm">نوع العقد</span>
          <select name="kind" disabled={pending} className="field field-sm" defaultValue="">
            <option value="">— الأول في القائمة —</option>
            {kinds.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.label}
              </option>
            ))}
          </select>
          {/* «العقد» is at least two documents: v3 §28 names «عقد وعد بالبيع» and «Contract final» separately
              and never says how one becomes the other. So the kind is an option list the owner extends, not
              an enum this code would have to grow. */}
          <span className="hint mt-1 block">زيد الأنواع من الإعدادات ← القوائم ← «أنواع العقود».</span>
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
      </div>

      <fieldset className="space-y-2">
        <legend className="label-sm mb-1">طريقة الخلاص</legend>
        <p className="hint mb-1">
          خلّيها «كيما في المطلب» في الحالة العادية: الثمن والتسبقة والمدة يتاخذو من مطلب الحريف روحو. ما
          تكتبش حاجة هنا كان إذا تبدّل الاتفاق.
        </p>
        <div className="flex flex-wrap gap-tight">
          {(
            [
              ["", "كيما في المطلب"],
              ["cash", "بالحاضر"],
              ["installments", "بالتقسيط"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="chip" aria-pressed={mode === value}>
              <input
                type="radio"
                name="mode"
                className="sr-only"
                checked={mode === value}
                onChange={() => setMode(value)}
                disabled={pending}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode !== "cash" ? (
        <div className="grid gap-tight sm:grid-cols-2">
          <label className="block">
            <span className="label-sm">التسبقة (د.ت)</span>
            <input
              type="number"
              name="down"
              inputMode="decimal"
              step="0.001"
              min="0"
              disabled={pending}
              dir="ltr"
              className="field field-sm tabular-nums"
            />
            <span className="hint mt-1 block">فارغة = التسبقة اللي في المطلب.</span>
          </label>

          <label className="block">
            <span className="label-sm">المدة (بالشهر)</span>
            <input
              type="number"
              name="months"
              inputMode="numeric"
              min={1}
              step={1}
              disabled={pending}
              dir="ltr"
              className="field field-sm tabular-nums"
            />
            <span className="hint mt-1 block">فارغة = المدة اللي في المطلب.</span>
          </label>
        </div>
      ) : null}

      <label className="block">
        <span className="label-sm">ملاحظة</span>
        <input type="text" name="note" maxLength={200} disabled={pending} className="field field-sm" />
      </label>

      {/* The three irreversible things, before the press and not after it. */}
      <div className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
        <p className="font-semibold">كي تضغط، يصير هذا الكلّ في نفس الوقت:</p>
        <ul className="mt-1 list-disc space-y-0.5 ps-5">
          <li>الحجز يتسكّر ويتعلّم «ولّات عقد» — وما يرجعش.</li>
          <li>الزيتونات تتعلّم «مباعة»، ويتحسبو في عدّاد الصفحة الرئيسية «زيتونات تمّ التعاقد عليها».</li>
          <li>الثمن والتسبقة والقسط يتجمّدو كيما هوما اليوم، وتبديل التسعير من بعد ما يمسّهمش.</li>
        </ul>
        <p className="mt-1">العقد يتسجّل «مشروع عقد»؛ الإمضاء وجدول الأقساط يجيو من بعد، من صفحة العقد.</p>
      </div>

      <ReasonField
        minLength={reasonMin}
        label="سبب كتابة العقد"
        id="contract-create-reason"
        hint="يتسجّل في سجل العمليات مع الحجز والثمن، ومن بعد ما يتبدّلش."
      />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-tight">
        <button type="submit" disabled={pending || !picked} className="btn btn-primary btn-sm">
          {pending ? "جارٍ الكتابة…" : "اكتب العقد"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost btn-sm">
          رجوع
        </button>
      </div>
    </form>
  );
}
