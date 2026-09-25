"use client";

// «سجّل المكالمة» — the call desk's main act, and the only form on this screen that asks the agent to type
// anything at all.
//
// FOUR ANSWERS, ONE PRESS. How we called, how it went, where the file now stands, and when we call again.
// The first two are public.contact_attempts, the third is public.persons.status_id, and today they are two
// separate acts in two separate places that an agent has to remember to perform twice — which is why the
// dropdown and the facts already disagree at twenty files. Here they are one press; the Server Action writes
// both and says exactly which half landed if the second one is refused.
//
// NOTHING HERE ASKS FOR SOMETHING THE CLIENT ALREADY TYPED (§4, §26). There is no name field, no phone field,
// no «how many trees» field. The client's own answers are printed above this form, from the demand they sent
// from the site, and the agent's job is to add what is missing — not to copy what is already there.
//
// EVERY WORD IN THE STATUS LIST COMES FROM public.lead_statuses, which is the owner's table: he renames
// «مؤهَّل» or adds a status and this form follows without an edit. The five outcomes are different and are
// drawn from src/lib/crm — they are the public.contact_outcome ENUM, which the owner cannot change from the
// Back Office, and the one copy of their Arabic in the product is the one imported here.

import { useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { FormField } from "@/components/ui";
import { ATTEMPT_CHANNEL_LABELS, OUTCOME_LABELS } from "@/lib/crm";

import { logCall } from "./actions";
import { needsCallback } from "./queue-model";

export type CallStatusOption = { id: string; label_ar: string };

export function CallForm({
  personId,
  statuses,
  currentStatusId,
  currentStatusLabel,
  minCallback,
  defaultChannel = "phone",
}: {
  personId: string;
  /** public.lead_statuses, active rows in the owner's own order. */
  statuses: readonly CallStatusOption[];
  currentStatusId: string;
  /** Where the file stands now, as lead_statuses spells it — shown so «كيما هي» says what it keeps. */
  currentStatusLabel: string;
  /** «now» in Africa/Tunis, as the floor under the callback field: a call cannot be promised for the past. */
  minCallback: string;
  /** What the client asked to be contacted on, so the usual answer is already chosen. */
  defaultChannel?: string;
}) {
  const [outcome, setOutcome] = useState("");
  const callbackRequired = needsCallback(outcome);

  return (
    <ActionForm action={logCall} submitLabel="سجّل المكالمة" pendingLabel="جارٍ التسجيل…" className="space-y-cozy">
      <input type="hidden" name="person_id" value={personId} />

      <div className="grid gap-snug sm:grid-cols-2">
        <FormField label="كيفاش كلّمناه" id={`call-channel-${personId}`} size="sm">
          <select
            id={`call-channel-${personId}`}
            name="channel"
            defaultValue={defaultChannel in ATTEMPT_CHANNEL_LABELS ? defaultChannel : "phone"}
            className="field field-sm"
          >
            {Object.entries(ATTEMPT_CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="نتيجة المكالمة" id={`call-outcome-${personId}`} size="sm">
          <select
            id={`call-outcome-${personId}`}
            name="outcome"
            required
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            className="field field-sm"
          >
            <option value="" disabled>
              اختر النتيجة
            </option>
            {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="موعد المكالمة الجاية"
          id={`call-next-${personId}`}
          size="sm"
          hint={callbackRequired ? "ضروري: الملف يرجعلك في الوقت هذا." : "اختياري — حدّدو كان وعدت الحريف بمكالمة."}
        >
          <input
            id={`call-next-${personId}`}
            name="next_follow_up_at"
            type="datetime-local"
            dir="ltr"
            min={minCallback}
            required={callbackRequired}
            className="field field-sm"
          />
        </FormField>

        {/* «كيما هي» is the default and it sends nothing: a status only moves because somebody decided to
            move it. Re-sending the current value would write an UPDATE that changes nothing (the history
            trigger fires on `is distinct from`, so no row would be recorded) and then announce «الحالة
            ولّات …» over a status that never moved. */}
        <FormField label="حالة الملف بعد المكالمة" id={`call-status-${personId}`} size="sm">
          <select id={`call-status-${personId}`} name="status_id" defaultValue="" className="field field-sm">
            <option value="">كيما هي — {currentStatusLabel}</option>
            {statuses
              .filter((status) => status.id !== currentStatusId)
              .map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label_ar}
                </option>
              ))}
          </select>
        </FormField>
      </div>

      <FormField label="ملاحظة" id={`call-note-${personId}`} size="sm" hint="شنوّا قالّك بالضبط. الفريق الجاي يقراها.">
        <textarea id={`call-note-${personId}`} name="note" rows={2} maxLength={5000} className="field field-sm min-h-16" />
      </FormField>
    </ActionForm>
  );
}
