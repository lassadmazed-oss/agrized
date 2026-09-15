"use client";

import { useActionState, useEffect, useState } from "react";

import type { ActionResult } from "@/components/admin/action-form";
import { formatCount } from "@/lib/format";

type Commercial = { id: string; name: string };

function rowBoxes(formId: string, onlyChecked = false): HTMLInputElement[] {
  const selector = `input[name="person_ids"][form="${formId}"]${onlyChecked ? ":checked" : ""}`;
  return Array.from(document.querySelectorAll<HTMLInputElement>(selector));
}

/** Header checkbox: ticks or clears every file listed on this page. */
export function SelectAllCheckbox({ formId, label }: { formId: string; label: string }) {
  return (
    <input
      type="checkbox"
      form={formId}
      aria-label={label}
      className="size-4 accent-forest"
      onChange={(event) => {
        const { checked } = event.currentTarget;
        for (const box of rowBoxes(formId)) box.checked = checked;
      }}
    />
  );
}

type BulkAssignBarProps = {
  formId: string;
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  commercials: Commercial[];
  filtersQuery: string;
  matchingPersons: number;
};

/** §21: transfer the ticked files, or every person matching the search, to one commercial. */
export function BulkAssignBar({ formId, action, commercials, filtersQuery, matchingPersons }: BulkAssignBarProps) {
  const [selected, setSelected] = useState(0);
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [state, formAction, pending] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const result = await action(previous, formData);
    // React resets the form after the action, which unticks the rows without firing change events.
    setSelected(0);
    setScope("selected");
    return result;
  }, null);

  useEffect(() => {
    const recount = () => setSelected(new Set(rowBoxes(formId, true).map((box) => box.value)).size);
    window.addEventListener("change", recount);
    return () => window.removeEventListener("change", recount);
  }, [formId]);

  const count = scope === "all" ? matchingPersons : selected;

  return (
    <form
      id={formId}
      action={formAction}
      onSubmit={(event) => {
        if (scope === "all" && !window.confirm(`سيتم تحويل ${formatCount(matchingPersons)} ملف مطابق للبحث. هل تريد المواصلة؟`)) {
          event.preventDefault();
        }
      }}
      className="hidden flex-wrap items-end gap-4 rounded-2xl border border-line bg-surface px-5 py-4 md:flex"
    >
      <input type="hidden" name="filters" value={filtersQuery} />
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-semibold">تحويل الملفات</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scope"
              value="selected"
              defaultChecked
              onChange={() => setScope("selected")}
              className="size-4 accent-forest"
            />
            المحدّدة في الجدول (<span className="tabular-nums" aria-live="polite">{formatCount(selected)}</span>)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" value="all" onChange={() => setScope("all")} className="size-4 accent-forest" />
            كل الملفات المطابقة للبحث (<span className="tabular-nums">{formatCount(matchingPersons)}</span> شخص)
          </label>
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="block text-sm font-semibold">إلى</span>
        <select name="to_user" required defaultValue="" className="field">
          <option value="" disabled>
            اختر المسؤول
          </option>
          <option value="none">بدون مسؤول</option>
          {commercials.map((commercial) => (
            <option key={commercial.id} value={commercial.id}>
              {commercial.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-48 flex-1 space-y-1">
        <span className="block text-sm font-semibold">السبب (اختياري)</span>
        <input name="reason" maxLength={500} placeholder="مثال: توزيع ملفات ولاية جديدة" className="field" />
      </label>

      <button type="submit" disabled={pending || count === 0} className="btn btn-primary">
        {pending ? "جارٍ التحويل…" : `تحويل ${formatCount(count)} ملف`}
      </button>

      {state ? (
        <p role={state.ok ? "status" : "alert"} className={`basis-full text-sm font-medium ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
