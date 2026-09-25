"use client";

// The controls on one legal file: open it, tick a paper, record an exception, pull in new items, book the
// closing, say what happened to it, write the desk's note.
//
// WHY THEY ARE CLIENT COMPONENTS AND THE PAGE IS NOT. Each one carries a refusal, and a refusal on this desk
// has to land NEXT TO THE CONTROL THAT CAUSED IT: «الباقي: مخطط الأرض، المساحات» under the button is useful,
// and the same sentence in a toast that has gone by the time the reader looks up is not. The page around them
// stays a Server Component and every figure on it arrives decided from Postgres.
//
// They import the Server Actions directly and bind their ids, which is the idiom ../../visits/visit-actions.tsx
// and ../../harvest already use. The reverse — a Server Component importing a VALUE out of a "use client"
// module — is the thing that has caused a real runtime crash in this repository, and ./legal-model.ts exists
// precisely so both sides can share a vocabulary without it.
//
// NOTHING HERE DECIDES A RULE. Whether an item may be un-ticked, whether a waiver is allowed, whether a date
// is inside the booking window, and whether the checklist is complete are all decided in the database; these
// components draw what the payload says and repeat what the refusal says.

import { useState, useTransition } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { FormField, StatusPill } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";

import {
  bookClosing,
  closeAppointment,
  openLegalFile,
  saveLegalNote,
  setLegalCheck,
  syncLegalItems,
  waiveLegalCheck,
} from "./actions";
import { GATES, type Appointment, type Checklist, type ChecklistItem, type NamedOption } from "./legal-model";

/* ------------------------------------------------------------------- §16 open */

export function OpenFileForm({ reservationId, reasonMin }: { reservationId: string; reasonMin: number }) {
  return (
    <ActionForm
      action={openLegalFile.bind(null, reservationId)}
      submitLabel="افتح الملف القانوني"
      pendingLabel="جارٍ الفتح…"
    >
      <FormField
        label="ملاحظة أولى (اختياري)"
        id="open-note"
        hint="القائمة القانونية تتنسخ على الملف كيما هي اليوم. إذا تحب تبدّل البنود، بدّلهم في الإعدادات قبل ما تفتح."
      >
        <textarea id="open-note" name="note" rows={2} className="field" />
      </FormField>
      <ReasonField minLength={reasonMin} id="open-reason" />
    </ActionForm>
  );
}

/* -------------------------------------------------------------- §20 checklist */

/**
 * §20's list, grouped by the moment each item blocks.
 *
 * The grouping is not decoration: «نسخة العقد» cannot be ticked before the contract exists, so each item says
 * WHEN it blocks and the reader sees the three moments in order. Which item sits at which gate is a column on
 * a row the owner edits — nothing here names an item or assigns it a gate.
 */
export function ChecklistCard({
  reservationId,
  fileId,
  checklist,
  gateLabels,
  canWaive,
  reasonMin,
}: {
  reservationId: string;
  fileId: string;
  checklist: Checklist;
  gateLabels: Record<string, string>;
  /** Admin AND settings legal.allow_waiver. The database refuses both ways round; this only hides a control. */
  canWaive: boolean;
  reasonMin: number;
}) {
  return (
    <section className="card p-cozy">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">القائمة القانونية</h2>
        <span className="text-sm text-muted tabular-nums">
          {checklist.settled} / {checklist.total}
          {checklist.mandatoryOpen > 0 ? ` · باقي ${checklist.mandatoryOpen} إجباري` : " · كمّلت"}
        </span>
      </div>
      <p className="hint mt-1">
        البنود هاذوما تنسخوا على الملف نهار ما تفتح. كي يتزاد بند جديد في الإعدادات، ما يوصلش لملف تسكّر — يوصل
        للملفات المفتوحة برك، وكي تطلبو إنت.
      </p>

      <div className="mt-4 space-y-5">
        {GATES.map((gate) => {
          const items = checklist.items.filter((item) => item.requiredAt === gate);
          if (items.length === 0) return null;
          const open = checklist.blocking[gate] ?? 0;
          return (
            <div key={gate}>
              <h3 className="label label-sm">
                {gateLabels[gate] ?? gate}
                {open > 0 ? <span className="text-danger"> · باقي {open}</span> : null}
              </h3>
              <ul className="mt-2 space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <CheckRow
                      item={item}
                      reservationId={reservationId}
                      canWaive={canWaive}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <ActionForm
          action={syncLegalItems.bind(null, fileId, reservationId)}
          submitLabel="زيد البنود الجديدة"
          pendingLabel="جارٍ التحديث…"
          className="space-y-2"
          buttonClassName="btn btn-secondary btn-sm"
        >
          <p className="hint">
            كان المالك زاد بند في الإعدادات بعد ما تفتح هذا الملف، هذا هو اللي يجيبو. البنود اللي لحظتهم فاتت
            ما يتزادوش — ملف تسكّر يقعد مسكّر.
          </p>
          <ReasonField minLength={reasonMin} id="sync-reason" />
        </ActionForm>
      </div>
    </section>
  );
}

function CheckRow({
  item,
  reservationId,
  canWaive,
}: {
  item: ChecklistItem;
  reservationId: string;
  canWaive: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [waiving, setWaiving] = useState(false);
  const done = item.doneAt !== null;
  const waived = item.waivedAt !== null;

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await setLegalCheck(item.id, reservationId, !done, item.note);
      if (result && !result.ok) setError(result.message);
    });
  };

  return (
    <div className={`rounded-xl border border-line p-3 ${waived ? "bg-paper" : ""}`}>
      <div className="flex items-start gap-3">
        <input
          id={`check-${item.id}`}
          type="checkbox"
          checked={done}
          disabled={pending || waived}
          onChange={toggle}
          className="mt-1 size-5 shrink-0 accent-forest"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`check-${item.id}`} className="block text-sm font-medium leading-6">
            {item.label}
            {item.isMandatory ? <span className="text-danger"> *</span> : null}
          </label>
          {item.note ? <p className="mt-0.5 text-xs text-muted">{item.note}</p> : null}
          {done ? (
            <p className="mt-0.5 text-xs text-muted">
              تثبّت {item.doneBy ?? "—"}
              {item.doneAt ? ` · ${formatDateTime(item.doneAt)}` : ""}
            </p>
          ) : null}
          {waived ? (
            <p className="mt-1 text-xs leading-5 text-muted">
              <StatusPill tone="warning">ما ينطبقش</StatusPill> {item.waiveReason}
              {item.waivedBy ? ` — ${item.waivedBy}` : ""}
              {item.waivedAt ? ` · ${formatDate(item.waivedAt)}` : ""}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="error-text mt-1">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {canWaive && item.isMandatory && !done && !waived ? (
        <div className="mt-2">
          {waiving ? (
            <ActionForm
              action={waiveLegalCheck.bind(null, item.id, reservationId)}
              submitLabel="سجّل التجاوز"
              pendingLabel="جارٍ التسجيل…"
              className="space-y-2"
              buttonClassName="btn btn-secondary btn-sm"
            >
              <FormField
                label="علاش البند هذا ما ينطبقش؟"
                id={`waive-${item.id}`}
                hint="السبب يتسجّل في سجل العمليات باسمك وما يتبدّلش. 10 أحرف على الأقل."
              >
                <textarea
                  id={`waive-${item.id}`}
                  name="waive_reason"
                  rows={2}
                  required
                  minLength={10}
                  className="field"
                />
              </FormField>
            </ActionForm>
          ) : (
            <button type="button" onClick={() => setWaiving(true)} className="btn btn-ghost btn-sm">
              علّمو «ما ينطبقش»
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ §19 the closing */

export function AppointmentForm({
  reservationId,
  fileId,
  appointment,
  partners,
  minDate,
  maxDate,
  reasonMin,
}: {
  reservationId: string;
  fileId: string;
  appointment: Appointment | null;
  partners: readonly NamedOption[];
  minDate: string | null;
  maxDate: string | null;
  reasonMin: number;
}) {
  const editing = appointment !== null && appointment.status === "scheduled";

  return (
    <ActionForm
      action={bookClosing.bind(null, fileId, reservationId, editing ? appointment.id : null)}
      submitLabel={editing ? "بدّل الموعد" : "حدّد موعد العقد"}
      pendingLabel="جارٍ الحفظ…"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="النهار" id="meet-on">
          <input
            id="meet-on"
            name="meet_on"
            type="date"
            required
            defaultValue={editing ? appointment.meetOn : undefined}
            min={minDate ?? undefined}
            max={maxDate ?? undefined}
            className="field"
          />
        </FormField>
        <FormField label="الساعة" id="meet-at">
          <input
            id="meet-at"
            name="meet_at"
            type="time"
            defaultValue={editing && appointment.meetAt ? appointment.meetAt.slice(0, 5) : undefined}
            className="field"
          />
        </FormField>
      </div>

      <FormField label="المكان" id="meet-place" hint="مكتب الموثّق، ولا القباضة، ولا مقرّ الشركة.">
        <input
          id="meet-place"
          name="place"
          type="text"
          maxLength={300}
          defaultValue={editing ? (appointment.place ?? "") : undefined}
          className="field"
        />
      </FormField>

      <FormField
        label="الشريك (محامي ولا عدل إشهاد)"
        id="meet-partner"
        hint="من دليل الشركاء. إذا ما لقيتوش، زيدو في «دليل الشركاء»."
      >
        <select
          id="meet-partner"
          name="partner_id"
          defaultValue={editing ? (appointment.partnerId ?? "") : ""}
          className="field"
        >
          <option value="">— بلا شريك لتوّا —</option>
          {partners.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="الوثائق المطلوبة"
        id="meet-docs"
        hint="شنوّة يجيب معاه الحريف نهار الموعد."
      >
        <textarea
          id="meet-docs"
          name="documents_note"
          rows={2}
          defaultValue={editing ? (appointment.documentsNote ?? "") : undefined}
          className="field"
        />
      </FormField>

      <ReasonField minLength={reasonMin} id="meet-reason" />
    </ActionForm>
  );
}

export function AppointmentActs({
  appointmentId,
  reservationId,
  reasonMin,
}: {
  appointmentId: string;
  reservationId: string;
  reasonMin: number;
}) {
  const [mode, setMode] = useState<"none" | "completed" | "cancelled">("none");

  if (mode === "none") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode("completed")} className="btn btn-secondary btn-sm">
          الموعد تمّ
        </button>
        <button type="button" onClick={() => setMode("cancelled")} className="btn btn-ghost btn-sm">
          ألغي الموعد
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <ActionForm
        action={closeAppointment.bind(null, appointmentId, reservationId, mode)}
        submitLabel={mode === "completed" ? "سجّل أنّ الموعد تمّ" : "سجّل الإلغاء"}
        pendingLabel="جارٍ التسجيل…"
        buttonClassName="btn btn-primary btn-sm"
      >
        <FormField
          label={mode === "completed" ? "ملاحظة (اختياري)" : "علاش تلغى؟"}
          id="appt-reason"
          hint="يتسجّل في سجل العمليات. البرنامج ما يحرّك حتى موعد وحدو، حتى كان نهارو فات."
        >
          <textarea
            id="appt-reason"
            name="reason"
            rows={2}
            minLength={reasonMin > 0 ? reasonMin : undefined}
            className="field"
          />
        </FormField>
      </ActionForm>
      <button type="button" onClick={() => setMode("none")} className="btn btn-ghost btn-sm mt-2">
        رجوع
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------- the note */

export function LegalNoteForm({
  fileId,
  reservationId,
  note,
  reasonMin,
}: {
  fileId: string;
  reservationId: string;
  note: string | null;
  reasonMin: number;
}) {
  return (
    <ActionForm
      action={saveLegalNote.bind(null, fileId, reservationId)}
      submitLabel="احفظ الملاحظة"
      pendingLabel="جارٍ الحفظ…"
      buttonClassName="btn btn-secondary btn-sm"
    >
      <FormField label="ملاحظة المكتب القانوني" id="legal-note" hint="تتبان لكل من عندو حق يقرا الملف.">
        <textarea id="legal-note" name="note" rows={3} defaultValue={note ?? ""} className="field" />
      </FormField>
      <ReasonField minLength={reasonMin} id="note-reason" />
    </ActionForm>
  );
}
