// «قبل ما تمشي» — the half of §7 the visit row does not carry.
//
// The owner's sentence is the whole specification: «يعرف الحريف قبل ما يلقاه». The appointment itself — who,
// when, which land, the phone, the meeting point, the map link — is already drawn by ../../visits/visit-entry,
// which this desk reuses unchanged rather than growing a second visit card. What that row cannot show is what
// the client ASKED FOR, because app.visit_payload carries the demand as a number and nothing more. So this
// panel sits under it and answers the four questions a field commercial arrives with:
//
//   شنوّة طلب؟        the trees, the spacing, the planting and the production status they asked for
//   ميزانيتو؟          the band they chose, and the offer's own total when the demand was made on a real offer
//   كيفاش يحب يخلّص؟   bالحاضر ولا بالتقسيط, the down payment, the duration and the monthly figure
//   شنوّة قالوا في الهاتف؟  the last calls and notes, from the call team's own two stores
//
// NOTHING IS RETYPED AND NOTHING IS RECOMPUTED (§26). Every Arabic label below is the snapshot the intake froze
// on the day the client answered (budget_label_ar, duration_label_ar, spacing_label_ar…), and every amount is
// an integer number of millimes printed by the one formatter. There is no arithmetic in this file.
//
// A server component. It renders no state and imports no value from a "use client" module.

import Link from "next/link";

import { DataList, DataRow, StatusPill } from "@/components/ui";
import { ATTEMPT_CHANNEL_LABELS, OUTCOME_LABELS, PLANTATION_LABELS, PRODUCTION_LABELS, type ContactOutcome } from "@/lib/crm";
import { formatArea, formatCount, formatDateTime, formatMillimes } from "@/lib/format";

import { PAYMENT_MODE_LABELS } from "@/lib/backoffice/leads/filters";
import type { Visit } from "../../visits/visit-model";
import type { CallNote, RequestBrief } from "./read";

export function VisitBrief({
  visit,
  request,
  notes,
}: {
  visit: Visit;
  request: RequestBrief | undefined;
  notes: readonly CallNote[];
}) {
  // The plan opens on the land the visit is to, for this client, carrying the demand it came from — so §11's
  // pick needs no choosing of an offer, a person or a request. This is the §7 → §9 join, in one link.
  const planHref = `/admin/desk/field/plan?offer=${visit.offer.id}&person=${visit.person.id}${
    request ? `&request=${request.requestId}` : ""
  }`;

  return (
    <section className="panel space-y-snug p-cozy">
      <div className="flex flex-wrap items-baseline justify-between gap-tight">
        <h4 className="label-sm">قبل ما تمشي</h4>
        {request ? (
          <span dir="ltr" className="text-xs text-muted">
            {request.requestNo}
          </span>
        ) : null}
      </div>

      {request ? (
        <DataList variant="divided">
          <DataRow label="طلب">
            {request.trees !== null
              ? `${formatCount(request.trees)} زيتونة`
              : (request.treesLabel ?? "ما حدّدش العدد")}
          </DataRow>

          {request.spacingLabel || request.areaPerTreeM2 !== null ? (
            <DataRow label="المساحة للزيتونة" numeric={false}>
              {request.spacingLabel ?? ""}
              {request.spacingLabel && request.areaPerTreeM2 !== null ? " · " : ""}
              {request.areaPerTreeM2 !== null ? formatArea(request.areaPerTreeM2) : ""}
            </DataRow>
          ) : null}

          {request.plantationSystems.length > 0 || request.productionStatuses.length > 0 ? (
            <DataRow label="نوع الغراسة" numeric={false}>
              {[
                ...request.plantationSystems.map((code) => PLANTATION_LABELS[code] ?? code),
                ...request.productionStatuses.map((code) => PRODUCTION_LABELS[code] ?? code),
              ].join(" · ")}
            </DataRow>
          ) : null}

          {request.budgetLabel ? (
            <DataRow label="الميزانية" numeric={false}>
              {request.budgetLabel}
            </DataRow>
          ) : null}

          {request.paymentMode ? (
            <DataRow label="طريقة الدفع" numeric={false}>
              {PAYMENT_MODE_LABELS[request.paymentMode] ?? request.paymentMode}
            </DataRow>
          ) : null}

          {request.downPaymentLabel || request.downPaymentMillimes !== null || request.downPaymentPercent !== null ? (
            <DataRow label="التسبقة" numeric={false}>
              {request.downPaymentMillimes !== null ? (
                <span className="tabular-nums">{formatMillimes(request.downPaymentMillimes)}</span>
              ) : null}
              {request.downPaymentPercent !== null ? (
                <span className="text-muted">
                  {request.downPaymentMillimes !== null ? " · " : ""}
                  <span className="tabular-nums">{request.downPaymentPercent}%</span>
                </span>
              ) : null}
              {request.downPaymentLabel && request.downPaymentMillimes === null && request.downPaymentPercent === null
                ? request.downPaymentLabel
                : null}
            </DataRow>
          ) : null}

          {request.durationMonths !== null || request.durationLabel ? (
            <DataRow label="المدة" numeric={false}>
              {request.durationMonths !== null ? (
                <span className="tabular-nums">{formatCount(request.durationMonths)} شهر</span>
              ) : (
                request.durationLabel
              )}
            </DataRow>
          ) : null}

          {request.monthlyMillimes !== null ? (
            <DataRow label="القسط الشهري">{formatMillimes(request.monthlyMillimes)}</DataRow>
          ) : null}

          {request.pricePerTreeMillimes !== null ? (
            <DataRow label="سعر الزيتونة">{formatMillimes(request.pricePerTreeMillimes)}</DataRow>
          ) : null}

          {request.totalMillimes !== null ? <DataRow label="الجملة">{formatMillimes(request.totalMillimes)}</DataRow> : null}

          {request.contactTimeLabel ? (
            <DataRow label="وقت التواصل المفضّل" numeric={false}>
              {request.contactTimeLabel}
            </DataRow>
          ) : null}
        </DataList>
      ) : visit.request ? (
        // The visit names a demand and the reader cannot read it: public.interest_requests is narrowed by
        // app.can_see_person, so this is the §27 line doing its job — the file belongs to a colleague. The
        // appointment is still theirs to do; the client's budget and plan are not theirs to read.
        <p className="text-sm leading-6 text-muted">
          المطلب <span dir="ltr">{visit.request.request_no}</span> مربوط بهذي الزيارة أما ما تنجمش تقراه: ملفّ
          الحريف مسند لزميل آخر، والميزانية وطريقة الخلاص يقراهم صاحب الملف. إذا لازمك التفاصيل، اطلب من
          المسؤول يسندلك الملف.
        </p>
      ) : (
        <p className="text-sm leading-6 text-muted">
          ما فماش مطلب مربوط بهذي الزيارة، فما نجّموش نقولو شنوّة طلب ولا قدّاش ميزانيتو. اسأل الحريف في الأرض،
          وسجّل الجواب في ملفّو.
        </p>
      )}

      {notes.length > 0 ? (
        <div className="space-y-tight">
          <h5 className="label-sm">آخر ما صار مع فريق الهاتف</h5>
          <ul className="space-y-tight">
            {notes.map((note) => (
              <li key={`${note.kind}-${note.id}`} className="rounded-lg bg-paper p-snug text-sm leading-6">
                <p className="flex flex-wrap items-baseline gap-tight text-xs text-muted">
                  <span>{formatDateTime(note.at)}</span>
                  {note.kind === "attempt" ? (
                    <>
                      <StatusPill tone="line">{ATTEMPT_CHANNEL_LABELS[note.channel ?? ""] ?? note.channel}</StatusPill>
                      <span>{OUTCOME_LABELS[note.outcome as ContactOutcome] ?? note.outcome}</span>
                    </>
                  ) : (
                    <StatusPill tone="line">ملاحظة</StatusPill>
                  )}
                </p>
                {note.body ? <p className="mt-hair">{note.body}</p> : null}
                {note.nextFollowUpAt ? (
                  <p className="mt-hair text-xs text-muted">معاودة الاتصال: {formatDateTime(note.nextFollowUpAt)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted">ما فماش مكالمات ولا ملاحظات مسجّلة على هذا الحريف.</p>
      )}

      <div className="flex flex-wrap gap-tight">
        {/* §9 · §11 — the act this whole screen exists to lead to. */}
        <Link href={planHref} className="btn btn-primary btn-sm">
          اختار الزيتونات على المخطط
        </Link>
        <Link href={`/admin/leads/${visit.person.id}`} className="btn btn-secondary btn-sm">
          افتح ملفّ الحريف
        </Link>
      </div>
    </section>
  );
}
