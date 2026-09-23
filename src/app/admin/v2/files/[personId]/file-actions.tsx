"use client";

import { useActionState, useEffect } from "react";

import type { ActionResult } from "@/components/admin/action-form";

import { Popup } from "../../popup";

import { saveIdentity } from "./identity-actions";
import { addNote, updateStatus } from "../../../(panel)/leads/[personId]/actions";

type Status = { id: string; label_ar: string };

export type Identity = {
  cin: string | null;
  cin_issued_on: string | null;
  birth_date: string | null;
  birth_place: string | null;
  address_line: string | null;
};

/**
 * Everything you can do to a file, as one row of buttons.
 *
 * WHAT THIS REPLACED. Three always-open forms stacked down the page — stage, note, identity — roughly 420px
 * of boxes that every reader scrolled past on every visit to reach the history, and that were used perhaps
 * once per visit each (owner, 2026-09-23: «use popups, smaller stuff that uses less place»). The forms are
 * unchanged; they are simply not on screen until they are asked for.
 *
 * THE BUTTON SAYS WHAT IS MISSING. «الهوية» wears a dot while the CIN is empty, because that is the field
 * standing between this file and a sale, and a row of identical buttons tells a reader nothing about which
 * one needs them today.
 */
export function FileActions({
  personId,
  statuses,
  currentStatusId,
  identity,
}: {
  personId: string;
  statuses: Status[];
  currentStatusId: string | null;
  identity: Identity;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Popup title="بدّل المرحلة" label="المرحلة">
        {(close) => (
          <StatusForm personId={personId} statuses={statuses} currentStatusId={currentStatusId} onDone={close} />
        )}
      </Popup>

      <Popup title="زيد ملاحظة" label="ملاحظة">
        {(close) => <NoteForm personId={personId} onDone={close} />}
      </Popup>

      <Popup
        title="هوية المشتري"
        label={
          <>
            الهوية
            {identity.cin ? null : <span className="ms-1.5 inline-block size-1.5 rounded-full bg-gold" />}
          </>
        }
      >
        {(close) => <IdentityForm personId={personId} identity={identity} onDone={close} />}
      </Popup>
    </div>
  );
}

/** Close the popup once the action has actually succeeded — never on submit, never on a timer. */
function useCloseOnSuccess(state: ActionResult, onDone: () => void) {
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
}

function StatusForm({
  personId,
  statuses,
  currentStatusId,
  onDone,
}: {
  personId: string;
  statuses: Status[];
  currentStatusId: string | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    updateStatus.bind(null, personId),
    null,
  );
  useCloseOnSuccess(state, onDone);

  return (
    <form action={action} className="space-y-3">
      <select name="status_id" defaultValue={currentStatusId ?? ""} className="field w-full" aria-label="المرحلة">
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.label_ar}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "…" : "بدّل"}
      </button>
      {state && !state.ok ? <p className="text-xs text-danger">{state.message}</p> : null}
    </form>
  );
}

function NoteForm({ personId, onDone }: { personId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addNote.bind(null, personId), null);
  useCloseOnSuccess(state, onDone);

  return (
    <form action={action} className="space-y-3">
      <textarea
        name="body"
        rows={3}
        className="field w-full"
        placeholder="شنوّة صار في المكالمة"
        aria-label="ملاحظة"
      />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "…" : "زيد"}
      </button>
      {state && !state.ok ? <p className="text-xs text-danger">{state.message}</p> : null}
    </form>
  );
}

function IdentityForm({
  personId,
  identity,
  onDone,
}: {
  personId: string;
  identity: Identity;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    saveIdentity.bind(null, personId),
    null,
  );
  useCloseOnSuccess(state, onDone);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">رقم بطاقة التعريف</span>
          <input
            name="cin"
            dir="ltr"
            inputMode="numeric"
            maxLength={8}
            defaultValue={identity.cin ?? ""}
            placeholder="8 أرقام"
            className="field w-full tabular-nums"
          />
        </label>
        <label className="block">
          <span className="label">تاريخ إصدارها</span>
          <input type="date" name="cin_issued_on" defaultValue={identity.cin_issued_on ?? ""} className="field w-full" />
        </label>
        <label className="block">
          <span className="label">تاريخ الميلاد</span>
          <input type="date" name="birth_date" defaultValue={identity.birth_date ?? ""} className="field w-full" />
        </label>
        <label className="block">
          <span className="label">مكان الميلاد</span>
          <input name="birth_place" defaultValue={identity.birth_place ?? ""} className="field w-full" />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">العنوان</span>
          <input
            name="address_line"
            defaultValue={identity.address_line ?? ""}
            placeholder="كيما يتكتب في العقد"
            className="field w-full"
          />
        </label>
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "…" : "سجّل"}
      </button>
      {state && !state.ok ? <p className="text-xs text-danger">{state.message}</p> : null}
    </form>
  );
}
