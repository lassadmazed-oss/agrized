"use client";

// «احجز هذا العرض للحريف» — §23's opening act, performed from the client file where the person is.
//
// IT INVENTS NOTHING. The offer, the demand and the number of trees are the demand the client already sent
// (interest_requests.project_id / .id / .offer_trees); the live availability and the smallest basket come from
// staff_offer_stock; the deposit, the validity period and the conditions come from app.offer_reservation_terms
// — the offer's own three values, each falling back to its global setting — and are SHOWN BEFORE the button is
// pressed, because «50 د عربون، صالح 10 أيام» is a sentence said on the phone, not a surprise afterwards.
// Which trees are handed out is the database's decision: the lowest available numbers, all of them or none.
//
// The four refusals below are said before the round trip, in the same words the database uses, so a commercial
// reads one rule and not two wordings of it.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { SectionHeader } from "@/components/ui";
import { intakeErrorMessage } from "@/lib/errors";
import { formatCount, formatMillimes } from "@/lib/format";

import { createReservation } from "./actions";

/** One demand this person sent on a real offer, with that offer's stock and reservation terms right now. */
export type ReserveChoice = {
  requestId: string;
  requestNo: string;
  projectId: string;
  offerName: string;
  offerCode: string | null;
  /** interest_requests.offer_trees: how many the client asked for. */
  askedTrees: number | null;
  /** staff_offer_stock.trees_available, read on this page load. */
  available: number;
  /** staff_offer_stock.min_trees: the offer's own minimum, or the setting's. */
  minTrees: number;
  /** False while nobody has numbered this offer's trees: there is nothing to hand out yet. */
  numbered: boolean;
  /** §23, resolved in SQL: this offer's deposit, or the global default. 0 = this offer asks for none. */
  depositMillimes: number;
  depositInherited: boolean;
  /** §24, resolved in SQL. 0 = no deadline. */
  validDays: number;
  validDaysInherited: boolean;
  conditionsAr: string | null;
};

export function ReserveForm({
  personId,
  personName,
  choices,
  reasonMin,
  moduleOpen,
  defaultRequestId = null,
}: {
  personId: string;
  /** Written into the reason, so the audit row says who the trees went to without opening another screen. */
  personName: string;
  choices: readonly ReserveChoice[];
  reasonMin: number;
  /** The `reservations` flag is not «معطّل». With it off the database refuses, so no button is drawn. */
  moduleOpen: boolean;
  /**
   * The demand the reader ARRIVED FROM (?reserve=<id> on the client file), so following «احجز زيتونات وسجّل
   * العربون →» from a demand sent last year opens this form on THAT demand and not on the newest one. The card
   * this form replaced pre-selected it, and the replacement dropped it; a commercial re-picking the right
   * demand from a select of near-identical request numbers is exactly how the wrong trees get held.
   * Unknown or absent id falls back to the newest demand, which is the old behaviour.
   */
  defaultRequestId?: string | null;
}) {
  const first =
    (defaultRequestId ? choices.find((item) => item.requestId === defaultRequestId) : null) ?? choices[0] ?? null;
  const [requestId, setRequestId] = useState(first?.requestId ?? "");
  const [trees, setTrees] = useState(String(first?.askedTrees ?? first?.minTrees ?? 1));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const choice = choices.find((item) => item.requestId === requestId) ?? first;

  if (!choice) {
    return (
      <p className="text-sm leading-6 text-muted">
        الحجز يمشي على عرض حقيقي، وهذا الملفّ ما فيه كان محاكاة من الحاسبة. كلّم الحريف، وكي يختار عرض عبّي معاه
        استمارة «سجّل اهتمامك بهذا العرض» من صفحة العرض في الموقع، ومن بعد ترجع تحجز من هنا.
      </p>
    );
  }

  const shut = !choice.numbered || choice.available < 1 || !moduleOpen;

  function pick(nextRequestId: string) {
    const next = choices.find((item) => item.requestId === nextRequestId);
    if (!next) return;
    setRequestId(nextRequestId);
    setTrees(String(next.askedTrees ?? next.minTrees));
    setError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice || shut) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const count = Number(trees);
    setError(null);

    if (!Number.isInteger(count) || count < 1) {
      setError(intakeErrorMessage("invalid_offer_trees"));
      return;
    }
    if (count < choice.minTrees) {
      setError(intakeErrorMessage("below_min_trees"));
      return;
    }
    if (count > choice.available) {
      setError(intakeErrorMessage("not_enough_trees"));
      return;
    }

    startTransition(async () => {
      const result = await createReservation({
        projectId: choice.projectId,
        personId,
        requestId: choice.requestId,
        trees: count,
        note: String(data.get("note") ?? ""),
        reason: `${String(data.get("reason") ?? "").trim()} — حجز لـ${personName} على المطلب ${choice.requestNo}.`.trim(),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      form.reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <SectionHeader
        level={3}
        title="احجز هذا العرض للحريف"
        description="الحجز ياخذ أصغر أرقام متاحة في العرض، ياخذهم الكل ولا حتّى واحد."
      />

      {choices.length > 1 ? (
        <label className="block">
          <span className="label-sm">المطلب اللي نحجزو عليه</span>
          <select value={requestId} onChange={(event) => pick(event.target.value)} className="field field-sm" disabled={pending}>
            {choices.map((item) => (
              <option key={item.requestId} value={item.requestId}>
                {item.offerName} · {item.requestNo}
                {typeof item.askedTrees === "number" ? ` · طلب ${formatCount(item.askedTrees)} زيتونة` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm">
          <span className="font-semibold">{choice.offerName}</span>
          {choice.offerCode ? (
            <span dir="ltr" className="ms-2 inline-block text-xs text-muted">
              {choice.offerCode}
            </span>
          ) : null}
          <span className="block text-xs text-muted">
            على المطلب <span dir="ltr" className="inline-block tabular-nums">{choice.requestNo}</span>
            {typeof choice.askedTrees === "number" ? ` · طلب ${formatCount(choice.askedTrees)} زيتونة` : ""}
          </span>
        </p>
      )}

      {/* §23 and §24, said out loud before the act. Both figures come from the database, resolved offer-first. */}
      <dl className="grid grid-cols-2 gap-tight">
        <div>
          <dt className="label-sm">العربون</dt>
          <dd className="text-base font-semibold">
            {choice.depositMillimes > 0 ? (
              <span className="tabular-nums">{formatMillimes(choice.depositMillimes)}</span>
            ) : (
              <span className="text-muted">ما يطلبش عربون</span>
            )}
            {choice.depositInherited ? <span className="ms-1 text-xs font-normal text-muted">(الإعداد العام)</span> : null}
          </dd>
        </div>
        <div>
          <dt className="label-sm">صالح</dt>
          <dd className="text-base font-semibold">
            {choice.validDays > 0 ? (
              <span className="tabular-nums">{formatCount(choice.validDays)} يوم</span>
            ) : (
              <span className="text-muted">بلا أجل</span>
            )}
            {choice.validDaysInherited ? <span className="ms-1 text-xs font-normal text-muted">(الإعداد العام)</span> : null}
          </dd>
        </div>
      </dl>

      {choice.conditionsAr ? (
        <p className="text-sm leading-6 text-muted">
          <span className="font-semibold text-ink">الشروط اللي باش تتنسخ في الحجز: </span>
          {choice.conditionsAr}
        </p>
      ) : null}

      {choice.depositMillimes === 0 || choice.validDays === 0 ? (
        <p className="hint">
          مبلغ العربون ومدة الصلاحية يتحدّدوا لكل عرض في بطاقتو، وإلا يورثوا{" "}
          <Link href="/admin/settings" className="underline underline-offset-4">
            الإعدادات العامة
          </Link>
          . صفر معناها «ما يطلبش عربون» ولا «بلا أجل».
        </p>
      ) : null}

      {!moduleOpen ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          موديول «العربون والحجز» معطّل، فالحجز موقّف في قاعدة البيانات روحها.{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            شغّلو من الموديولات
          </Link>
          .
        </p>
      ) : shut ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          {choice.numbered
            ? "ما فماش زيتونات متاحة في هذا العرض توّا. فكّ حجزاً قديماً، ولا اختار عرضاً آخر للحريف."
            : "زيتونات هذا العرض مازالت ما ترقّمتش، فما فماش شنوّة يتحجز."}{" "}
          <Link href={`/admin/projects/${choice.projectId}?tab=trees`} className="font-semibold underline underline-offset-4">
            افتح زيتونات العرض
          </Link>
        </p>
      ) : null}

      <label className="block">
        <span className="label-sm">عدد الزيتونات</span>
        <input
          type="number"
          inputMode="numeric"
          value={trees}
          onChange={(event) => setTrees(event.target.value)}
          min={choice.minTrees}
          max={choice.available || undefined}
          step={1}
          required
          disabled={pending || shut}
          className="field field-sm tabular-nums"
          dir="ltr"
        />
        <span className="hint mt-1 block">
          متاح توّا: <span className="tabular-nums">{formatCount(choice.available)}</span> زيتونة · أقلّ عدد في هذا
          العرض: <span className="tabular-nums">{formatCount(choice.minTrees)}</span>
        </span>
      </label>

      <label className="block">
        <span className="label-sm">ملاحظة على الحجز</span>
        <input type="text" name="note" maxLength={200} disabled={pending || shut} className="field field-sm" />
      </label>

      <ReasonField
        minLength={reasonMin}
        id={`reserve-reason-${personId}`}
        label="سبب الحجز"
        hint="يتسجّل في سجل العمليات مع أرقام الزيتونات، ومن بعد ما يتبدّلش."
      />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending || shut} className="btn btn-primary btn-sm">
        {pending ? "جارٍ الحجز…" : "احجز"}
      </button>
    </form>
  );
}
