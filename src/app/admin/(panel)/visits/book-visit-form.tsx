"use client";

// «برمج زيارة» — the four answers report v3 §25 asks the client for, plus the three the Back Office adds.
//
// ONE FORM, TWO SCREENS. It is used from the visits board (on a demand that has been waiting for a visit) and
// from the client's own file. Both are the same act, so both send the same fields to the same Server Action;
// what changes is whether the offer is already known.
//
// EVERY BOUND IT DRAWS COMES FROM THE DATABASE. `min` and `max` on the date, the ceiling on the number of
// people, and the list of times are `terms`, built by app.visit_terms from settings and an option list. Nothing
// is typed here — a `max={10}` in a form component is a business rule the owner can never change, and the
// database would refuse it anyway (app.assert_visit_booking) with a sentence this form then shows.

import { useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { FormField } from "@/components/ui";
import { CHANNEL_LABELS } from "@/lib/crm";

import { bookVisit } from "./actions";
import { slotHours, type VisitOffer, type VisitTerms } from "./visit-model";

export function BookVisitForm({
  personId,
  offers,
  terms,
  requestId = null,
  defaultProjectId = null,
  defaultChannel = "phone",
  reasonMin = 0,
}: {
  personId: string;
  /** The offers this visit may be booked on. One of them, or several to choose from. */
  offers: readonly VisitOffer[];
  terms: VisitTerms;
  /** The demand that asked for the visit, when there is one. */
  requestId?: string | null;
  defaultProjectId?: string | null;
  defaultChannel?: string;
  reasonMin?: number;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? offers[0]?.project_id ?? "");
  const offer = offers.find((row) => row.project_id === projectId) ?? offers[0];

  if (offers.length === 0) {
    return (
      <p className="hint">
        ما فماش عرض مربوط بهذا الحريف. افتح عرضاً من «العروض» وسجّل معاه مطلب، ولا احجز عليه زيتونات، ومن بعد
        تنجم تبرمج الزيارة من هنا.
      </p>
    );
  }

  return (
    <ActionForm action={bookVisit} submitLabel="برمج الزيارة" pendingLabel="جارٍ البرمجة…" className="space-y-cozy">
      <input type="hidden" name="person_id" value={personId} />
      {requestId ? <input type="hidden" name="request_id" value={requestId} /> : null}

      <div className="grid gap-snug sm:grid-cols-2">
        {offers.length > 1 ? (
          <FormField label="العرض" id="visit-project" size="sm" className="sm:col-span-2">
            <select
              id="visit-project"
              name="project_id"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="field field-sm"
            >
              {offers.map((row) => (
                <option key={row.project_id} value={row.project_id}>
                  {row.name}
                  {row.code ? ` — ${row.code}` : ""}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <input type="hidden" name="project_id" value={projectId} />
        )}

        <FormField
          label="التاريخ"
          id="visit-date"
          size="sm"
          hint={`من ${terms.min_date} إلى ${terms.max_date}`}
        >
          <input
            id="visit-date"
            name="visit_date"
            type="date"
            required
            min={terms.min_date}
            max={terms.max_date}
            defaultValue={terms.min_date}
            className="field field-sm"
          />
        </FormField>

        <FormField label="التوقيت المتوفر" id="visit-slot" size="sm">
          <select id="visit-slot" name="slot_option_id" required className="field field-sm">
            {terms.slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label_ar}
                {slot.label_ar.includes(":") ? "" : slotHours(slot.time_from, slot.time_to) ? ` (${slotHours(slot.time_from, slot.time_to)})` : ""}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="عدد الأشخاص" id="visit-people" size="sm" hint={`حتى ${terms.max_people}`}>
          <input
            id="visit-people"
            name="people_count"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={terms.max_people}
            defaultValue={1}
            className="field field-sm tabular-nums"
          />
        </FormField>

        <FormField label="وسيلة الاتصال" id="visit-channel" size="sm">
          <select id="visit-channel" name="contact_channel" defaultValue={defaultChannel} className="field field-sm">
            {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="نقطة اللقاء"
          id="visit-meeting"
          size="sm"
          className="sm:col-span-2"
          hint="تتنسخ من بطاقة العرض، وتنجم تبدّلها لهذه الزيارة وحدها."
        >
          <input
            id="visit-meeting"
            name="meeting_point"
            type="text"
            maxLength={300}
            defaultValue={offer?.meeting_point ?? terms.meeting_point ?? ""}
            className="field field-sm"
          />
        </FormField>
      </div>

      <fieldset className="space-y-tight">
        <legend className="label-sm">الحالة عند البرمجة</legend>
        <div className="flex flex-wrap gap-tight">
          <label className="choice">
            <input type="radio" name="status" value="requested" defaultChecked />
            مطلوبة — مازال ما تأكّدتش مع الحريف
          </label>
          <label className="choice">
            <input type="radio" name="status" value="confirmed" />
            مؤكّدة — تكلّمنا معاه والموعد ثابت
          </label>
        </div>
      </fieldset>

      <FormField label="ملاحظة للفريق" id="visit-note" size="sm">
        <textarea id="visit-note" name="staff_note" rows={2} maxLength={2000} className="field field-sm min-h-16" />
      </FormField>

      <ReasonField minLength={reasonMin} id={`visit-reason-${personId}`} label="سبب العملية" rows={2} />
    </ActionForm>
  );
}
