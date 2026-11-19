"use client";

import { useActionState, useState, useTransition } from "react";

import type { ActionResult } from "@/components/admin/action-form";
import { formatCount, formatDate } from "@/lib/format";

import { assignFieldPeople, removeFieldPerson } from "../actions";
import type { Candidate, Commercial } from "../field-model";

/** «اعطيهم لـ…»: tick the people, pick the commercial, one press. */
export function AssignForm({ candidates, commercials }: { candidates: Candidate[]; commercials: Commercial[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [state, action, pending] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const result = await assignFieldPeople(previous, formData);
    if (result?.ok) setPicked([]);
    return result;
  }, null);
  const [commercial, setCommercial] = useState(commercials.length === 1 ? commercials[0].id : "");
  const who = commercials.find((item) => item.id === commercial);
  const all = picked.length === candidates.length && candidates.length > 0;

  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">شكون يمشي؟</legend>
        {commercials.length === 0 ? (
          <p className="text-sm text-danger">ما فمّا حتى كوميرسيال خدّام. زيدو من «المستعملين» في الإدارة.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {commercials.map((item) => (
              <label key={item.id} className="chip min-h-12 px-4 text-base">
                <input
                  type="radio"
                  name="commercial_id"
                  value={item.id}
                  checked={commercial === item.id}
                  onChange={() => setCommercial(item.id)}
                  className="sr-only"
                />
                {item.full_name}
                <span className="text-xs font-normal text-muted">عندو {formatCount(item.open)}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          يحبّو يزورو ومازالو في حتى ليستا <span className="tabular-nums text-muted">{formatCount(candidates.length)}</span>
        </p>
        {candidates.length > 0 ? (
          <button type="button" onClick={() => setPicked(all ? [] : candidates.map((item) => item.person.id))} className="btn btn-ghost btn-sm">
            {all ? "نحّي العلامات" : "علّم الكل"}
          </button>
        ) : null}
      </div>

      {candidates.length === 0 ? (
        <p className="card p-5 text-center text-muted">ما فمّا حتى حدّ يستنّى زيارة توّا.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {candidates.map((item) => {
            const checked = picked.includes(item.person.id);
            return (
              <li key={item.person.id}>
                <label
                  className={`card flex cursor-pointer items-start gap-3 p-3 transition-colors ${checked ? "border-forest bg-leaf-soft" : ""}`}
                >
                  <input
                    type="checkbox"
                    name="person_id"
                    value={item.person.id}
                    checked={checked}
                    onChange={() => toggle(item.person.id)}
                    className="mt-1 size-5 accent-[var(--color-forest)]"
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-bold text-ink">{item.person.full_name}</span>
                    <span className="block text-sm text-muted">
                      {[
                        item.request?.offer_name,
                        item.request?.trees ? `${formatCount(item.request.trees)} زيتونة` : null,
                        item.person.governorate,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="block text-xs text-muted">
                      {item.request ? `طلب ${formatDate(item.request.created_at)}` : ""}
                      {item.owner ? ` · الملف عند ${item.owner}` : ""}
                      {item.client_asked ? " · طلب زيارة بروحو" : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {state ? (
        <p role={state.ok ? "status" : "alert"} className={`text-sm font-medium ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}

      <div className="sticky bottom-3 z-10">
        <button type="submit" disabled={pending || picked.length === 0 || !commercial} className="btn btn-primary min-h-14 w-full text-lg shadow-[var(--shadow-raise)]">
          {pending
            ? "جارٍ التوزيع…"
            : picked.length === 0
              ? "علّم على الناس"
              : !who
                ? "اختار الكوميرسيال"
                : `اعطي ${formatCount(picked.length)} لـ ${who.full_name}`}
        </button>
      </div>
    </form>
  );
}

export function RemoveButton({ personId }: { personId: string }) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await removeFieldPerson(personId);
            setFailed(result?.ok ? null : (result?.message ?? null));
          })
        }
        className="text-xs font-semibold text-muted underline-offset-4 hover:text-danger hover:underline"
      >
        نحّيه
      </button>
      {failed ? <span className="text-xs text-danger">{failed}</span> : null}
    </span>
  );
}
