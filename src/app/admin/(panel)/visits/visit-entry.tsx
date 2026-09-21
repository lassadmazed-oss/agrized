// One visit, as the person who has to drive there reads it.
//
// The task named what has to be on the row before anybody gets in a car: the client, the phone, the offer, where
// the land is and how many people are coming. They are all here and none of them is a second click — the phone
// is a tel: link because the reader is holding a phone, and the coordinates the offer already carries become a
// map link for the same reason.
//
// A server component that renders a client one (VisitActions). It imports no value from a "use client" module.

import Link from "next/link";

import { DataList, DataRow, StatusPill } from "@/components/ui";
import { CHANNEL_LABELS } from "@/lib/crm";
import { formatCount, formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

import { VisitActions } from "./visit-actions";
import { mapsHref, slotHours, visitTone, type Visit, type VisitOffer, type VisitTerms } from "./visit-model";

export function VisitEntry({
  visit,
  terms,
  offers = [],
  reasonMin = 0,
  showDate = false,
}: {
  visit: Visit;
  terms: VisitTerms;
  offers?: readonly VisitOffer[];
  reasonMin?: number;
  /** The board groups by day and states the date once; a client's file lists visits across days. */
  showDate?: boolean;
}) {
  const hours = slotHours(visit.slot_from, visit.slot_to);
  const maps = mapsHref(visit.offer.latitude, visit.offer.longitude);
  const place = [visit.offer.delegation, visit.offer.governorate].filter(Boolean).join("، ");

  return (
    <article className="card p-cozy">
      <div className="flex flex-wrap items-baseline justify-between gap-tight">
        <p className="flex flex-wrap items-baseline gap-tight">
          <span className="font-semibold text-ink">
            {showDate ? `${formatDate(visit.visit_date)} · ` : ""}
            {visit.slot_label}
          </span>
          {hours && !visit.slot_label.includes(":") ? (
            <span dir="ltr" className="text-xs text-muted tabular-nums">
              {hours}
            </span>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-tight">
          <StatusPill tone={visitTone(visit.status)}>{visit.status_label}</StatusPill>
          <span dir="ltr" className="text-xs text-muted">
            {visit.visit_no}
          </span>
        </p>
      </div>

      <DataList variant="divided" className="mt-snug">
        <DataRow label="الحريف" numeric={false}>
          <span className="flex flex-wrap items-baseline gap-tight">
            <Link href={`/admin/leads/${visit.person.id}`} className="font-semibold text-forest underline-offset-4 hover:underline">
              {visit.person.full_name}
            </Link>
            {visit.person.phone_e164 ? (
              <a href={`tel:${visit.person.phone_e164}`} dir="ltr" className="text-sm text-muted tabular-nums underline-offset-4 hover:underline">
                {formatPhone(visit.person.phone_e164)}
              </a>
            ) : null}
          </span>
        </DataRow>

        <DataRow label="العرض" numeric={false}>
          <span className="flex flex-wrap items-baseline gap-tight">
            <Link href={`/admin/projects/${visit.offer.id}`} className="text-forest underline-offset-4 hover:underline">
              {visit.offer.name}
            </Link>
            {visit.offer.code ? (
              <span dir="ltr" className="text-xs text-muted">
                {visit.offer.code}
              </span>
            ) : null}
            {place ? <span className="text-xs text-muted">{place}</span> : null}
            {maps ? (
              <a href={maps} target="_blank" rel="noreferrer" className="text-xs text-forest underline-offset-4 hover:underline">
                الخريطة
              </a>
            ) : null}
          </span>
        </DataRow>

        <DataRow label="عدد الأشخاص">{formatCount(visit.people_count)}</DataRow>

        {visit.meeting_point ? (
          <DataRow label="نقطة اللقاء" numeric={false}>
            {visit.meeting_point}
          </DataRow>
        ) : null}

        <DataRow label="وسيلة الاتصال" numeric={false}>
          {CHANNEL_LABELS[visit.contact_channel as keyof typeof CHANNEL_LABELS] ?? visit.contact_channel}
        </DataRow>

        {visit.assigned ? (
          <DataRow label="المسؤول على الزيارة" numeric={false}>
            {visit.assigned.full_name}
          </DataRow>
        ) : null}

        {visit.request ? (
          <DataRow label="المطلب" numeric={false}>
            <span dir="ltr" className="text-sm">
              {visit.request.request_no}
            </span>
          </DataRow>
        ) : null}

        {visit.source === "client" ? (
          <DataRow label="مصدر الطلب" numeric={false}>
            الحريف طلبها من الموقع
          </DataRow>
        ) : null}
      </DataList>

      {visit.client_note ? <p className="mt-snug text-sm leading-6 text-muted">ملاحظة الحريف: {visit.client_note}</p> : null}
      {visit.staff_note ? <p className="mt-tight text-sm leading-6 text-muted">ملاحظة الفريق: {visit.staff_note}</p> : null}
      {visit.cancel_reason ? <p className="mt-tight text-sm leading-6 text-muted">علاش تلغات: {visit.cancel_reason}</p> : null}

      {visit.outcome ? (
        <div className="mt-snug rounded-lg bg-paper p-snug">
          <p className="label-sm">نتيجة الزيارة</p>
          <p className="mt-tight text-sm leading-6">
            {visit.outcome.liked === true ? "عجبو المشروع." : visit.outcome.liked === false ? "ما عجبوش." : "مازال ما قررش."}
            {visit.outcome.project_name ? ` العرض اللي اختارو: ${visit.outcome.project_name}.` : ""}
            {visit.outcome.next_step ? ` الخطوة الجاية: ${visit.outcome.next_step}.` : ""}
          </p>
          {visit.outcome.note ? <p className="mt-tight text-sm leading-6 text-muted">{visit.outcome.note}</p> : null}
        </div>
      ) : null}

      <VisitActions visit={visit} terms={terms} offers={offers} reasonMin={reasonMin} />
    </article>
  );
}
