"use client";

// What can still be done to one visit, and nothing else.
//
// The five statuses of report v3 §25 are not five buttons: the database allows «مطلوبة → مؤكّدة · ملغاة» and
// «مؤكّدة → تمّت · ما حضرش · ملغاة», and a visit that ended stays ended. So a control the database would refuse
// is never drawn — «ما حضرش» appears only on an appointment that was actually agreed, and a completed visit
// offers nothing at all. Every button is checked again in the Server Action and a third time in SQL.
//
// «تمّت» is the only one that asks questions, and it asks the three of cahier v2 §30 that report v3 leaves out:
// عجبو ولا لا · أشمن عرض اختار · شنوّة الخطوة الجاية. Without them Completed is a tick, and the one thing the
// visit exists to find out — does this person now reserve — is lost the moment it is recorded.

import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { FormField } from "@/components/ui";

import { rescheduleVisit, setVisitStatus } from "./actions";
import type { Visit, VisitOffer, VisitTerms } from "./visit-model";

export function VisitActions({
  visit,
  terms,
  offers = [],
  reasonMin = 0,
}: {
  visit: Visit;
  terms: VisitTerms;
  /** The offers the client may have chosen during the visit. The visit's own offer is always among them. */
  offers?: readonly VisitOffer[];
  reasonMin?: number;
}) {
  const live = visit.status === "requested" || visit.status === "confirmed";
  if (!live) return null;

  const choices: readonly VisitOffer[] = offers.length
    ? offers
    : [{ project_id: visit.offer.id, code: visit.offer.code, name: visit.offer.name, meeting_point: visit.meeting_point, request_id: null, request_no: null }];

  return (
    <div className="mt-cozy space-y-snug border-t border-line pt-cozy">
      <div className="flex flex-wrap items-start gap-tight">
        {visit.status === "requested" ? (
          <ActionForm
            action={setVisitStatus.bind(null, visit.id)}
            submitLabel="أكّد الزيارة"
            pendingLabel="جارٍ التأكيد…"
            className="space-y-tight"
            buttonClassName="btn btn-primary btn-sm"
          >
            <input type="hidden" name="status" value="confirmed" />
            <ReasonField minLength={reasonMin} id={`vc-reason-${visit.id}`} label="سبب العملية" rows={2} />
          </ActionForm>
        ) : null}

        {visit.status === "confirmed" ? (
          <ActionForm
            action={setVisitStatus.bind(null, visit.id)}
            submitLabel="ما حضرش"
            pendingLabel="جارٍ الحفظ…"
            className="space-y-tight"
            buttonClassName="btn btn-secondary btn-sm"
          >
            <input type="hidden" name="status" value="no_show" />
            <ReasonField minLength={reasonMin} id={`vn-reason-${visit.id}`} label="سبب العملية" rows={2} />
          </ActionForm>
        ) : null}
      </div>

      {visit.status === "confirmed" ? (
        <details className="disclosure">
          <summary className="text-sm text-forest">سجّل أنها تمّت</summary>
          <div>
            <ActionForm
              action={setVisitStatus.bind(null, visit.id)}
              submitLabel="سجّل «تمّت»"
              pendingLabel="جارٍ الحفظ…"
              className="space-y-snug"
              buttonClassName="btn btn-primary btn-sm"
            >
              <input type="hidden" name="status" value="completed" />
              <fieldset className="space-y-tight">
                <legend className="label-sm">عجبو المشروع؟</legend>
                <div className="flex flex-wrap gap-tight">
                  <label className="choice">
                    <input type="radio" name="outcome_liked" value="yes" defaultChecked />
                    عجبو
                  </label>
                  <label className="choice">
                    <input type="radio" name="outcome_liked" value="no" />
                    ما عجبوش
                  </label>
                  <label className="choice">
                    <input type="radio" name="outcome_liked" value="" />
                    مازال ما قررش
                  </label>
                </div>
              </fieldset>

              <FormField label="العرض اللي اختارو" id={`vo-offer-${visit.id}`} size="sm">
                <select
                  id={`vo-offer-${visit.id}`}
                  name="outcome_project_id"
                  defaultValue={visit.offer.id}
                  className="field field-sm"
                >
                  <option value="">ما اختار حتّى عرض</option>
                  {choices.map((row) => (
                    <option key={row.project_id} value={row.project_id}>
                      {row.name}
                      {row.code ? ` — ${row.code}` : ""}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="الخطوة الجاية" id={`vo-next-${visit.id}`} size="sm" hint="مثال: يحجز 20 زيتونة، ولا نعاودو نكلّموه بعد جمعة.">
                <input id={`vo-next-${visit.id}`} name="outcome_next_step" type="text" maxLength={500} className="field field-sm" />
              </FormField>

              <FormField label="ملاحظة على الزيارة" id={`vo-note-${visit.id}`} size="sm">
                <textarea id={`vo-note-${visit.id}`} name="outcome_note" rows={2} maxLength={2000} className="field field-sm min-h-16" />
              </FormField>

              <ReasonField minLength={reasonMin} id={`vo-reason-${visit.id}`} label="سبب العملية" rows={2} />
            </ActionForm>
          </div>
        </details>
      ) : null}

      <details className="disclosure">
        <summary className="text-sm text-forest">بدّل الموعد</summary>
        <div>
          <ActionForm
            action={rescheduleVisit.bind(null, visit.id)}
            submitLabel="بدّل الموعد"
            pendingLabel="جارٍ الحفظ…"
            className="space-y-snug"
            buttonClassName="btn btn-secondary btn-sm"
          >
            <div className="grid gap-snug sm:grid-cols-2">
              <FormField label="التاريخ" id={`vr-date-${visit.id}`} size="sm" hint={`من ${terms.min_date} إلى ${terms.max_date}`}>
                <input
                  id={`vr-date-${visit.id}`}
                  name="visit_date"
                  type="date"
                  min={terms.min_date}
                  max={terms.max_date}
                  defaultValue={visit.visit_date}
                  className="field field-sm"
                />
              </FormField>
              <FormField label="التوقيت" id={`vr-slot-${visit.id}`} size="sm">
                <select id={`vr-slot-${visit.id}`} name="slot_option_id" defaultValue="" className="field field-sm">
                  <option value="">كيما هو</option>
                  {terms.slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label_ar}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="عدد الأشخاص" id={`vr-people-${visit.id}`} size="sm" hint={`حتى ${terms.max_people}`}>
                <input
                  id={`vr-people-${visit.id}`}
                  name="people_count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={terms.max_people}
                  defaultValue={visit.people_count}
                  className="field field-sm tabular-nums"
                />
              </FormField>
              <FormField label="نقطة اللقاء" id={`vr-meet-${visit.id}`} size="sm">
                <input
                  id={`vr-meet-${visit.id}`}
                  name="meeting_point"
                  type="text"
                  maxLength={300}
                  defaultValue={visit.meeting_point ?? ""}
                  className="field field-sm"
                />
              </FormField>
            </div>
            <ReasonField minLength={reasonMin} id={`vr-reason-${visit.id}`} label="سبب العملية" rows={2} />
          </ActionForm>
        </div>
      </details>

      <details className="disclosure">
        <summary className="text-sm text-danger">ألغِ الزيارة</summary>
        <div>
          <ActionForm
            action={setVisitStatus.bind(null, visit.id)}
            submitLabel="ألغِ الزيارة"
            pendingLabel="جارٍ الإلغاء…"
            className="space-y-snug"
            buttonClassName="btn btn-secondary btn-sm"
          >
            <input type="hidden" name="status" value="cancelled" />
            <FormField label="علاش تلغات" id={`vx-reason-${visit.id}`} size="sm" hint="يظهر في الملفّ وفي سجل العمليات.">
              <input id={`vx-reason-${visit.id}`} name="cancel_reason" type="text" maxLength={500} className="field field-sm" />
            </FormField>
            <ReasonField minLength={reasonMin} id={`vx-audit-${visit.id}`} label="سبب العملية" rows={2} />
          </ActionForm>
        </div>
      </details>
    </div>
  );
}
