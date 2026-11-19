"use client";

import { useActionState, useState } from "react";

import { formatCount } from "@/lib/format";

import { saveFarmTask } from "./actions";
import type { FarmPeople, TaskCard } from "./farm-model";

/**
 * «تاسك جديدة»: which grove, which work, what exactly and where, which day, who does it, who checks it. The
 * title defaults to the work's name; the workers are ticked, the supervisor picked.
 */
export function TaskForm({ people, task }: { people: FarmPeople; task?: TaskCard }) {
  const [state, action, pending] = useActionState(saveFarmTask, null);
  const [service, setService] = useState(task?.service_option_id ?? "");
  const [workers, setWorkers] = useState<string[]>(task?.workers.map((worker) => worker.id) ?? []);

  return (
    <form action={action} className="space-y-5">
      {task ? <input type="hidden" name="id" value={task.id} /> : null}

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-ink">الضيعة (العرض)</span>
        <select name="project_id" required defaultValue={task?.project.id ?? (people.offers.length === 1 ? people.offers[0].id : "")} className="field">
          <option value="" disabled>
            اختار…
          </option>
          {people.offers.map((offer) => (
            <option key={offer.id} value={offer.id}>
              {offer.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">شنوّا الخدمة؟</legend>
        <div className="flex flex-wrap gap-2">
          {people.services.map((item) => (
            <label key={item.id} className="chip min-h-11 text-base">
              <input type="radio" name="service_option_id" value={item.id} checked={service === item.id} onChange={() => setService(item.id)} className="sr-only" />
              {item.label_ar}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-ink">العنوان (اختياري)</span>
        <input name="title" maxLength={120} defaultValue={task?.title ?? ""} placeholder="مثلاً: تقليم الصفوف 1 حتى 12" className="field field-sm" />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-ink">شنوّا يعمل بالضبط؟</span>
        <textarea name="instructions" maxLength={2000} rows={3} defaultValue={task?.instructions ?? ""} placeholder="مثلاً: قلّم الفروع اليابسة والمتداخلة، وجمّع الحطب على جنب الصف." className="field min-h-20" />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1 sm:col-span-1">
          <span className="text-sm font-semibold text-ink">النهار</span>
          <input name="planned_on" type="date" required defaultValue={task?.planned_on ?? people.today} className="field field-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-ink">وين في الضيعة؟</span>
          <input name="scope_note" maxLength={300} defaultValue={task?.scope_note ?? ""} placeholder="الصفوف 1-12" className="field field-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-ink">قدّاش من زيتونة؟</span>
          <input name="target_trees" inputMode="numeric" defaultValue={task?.target_trees ?? ""} className="field field-sm" />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">شكون يخدم؟</legend>
        {people.workers.length === 0 ? (
          <p className="text-sm text-danger">ما فمّا حتى عامل. زيد كونت بدور «عامل فلاحي» من «المستعملين».</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {people.workers.map((worker) => (
              <label key={worker.id} className="chip min-h-11 text-base">
                <input
                  type="checkbox"
                  name="worker_ids"
                  value={worker.id}
                  checked={workers.includes(worker.id)}
                  onChange={() => setWorkers((list) => (list.includes(worker.id) ? list.filter((id) => id !== worker.id) : [...list, worker.id]))}
                  className="sr-only"
                />
                {worker.full_name}
                <span className="text-xs font-normal text-muted">عندو {formatCount(worker.open)}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-semibold text-ink">شكون يراقب؟</span>
        <select name="supervisor_id" defaultValue={task?.supervisor?.id ?? ""} className="field field-sm">
          <option value="">— بلا مراقب (المسؤول يقبل الخدمة) —</option>
          {people.supervisors.map((supervisor) => (
            <option key={supervisor.id} value={supervisor.id}>
              {supervisor.full_name}
            </option>
          ))}
        </select>
      </label>

      {state ? (
        <p role={state.ok ? "status" : "alert"} className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={pending || !service || workers.length === 0} className="btn btn-primary min-h-14 w-full text-lg">
        {pending ? "جارٍ التسجيل…" : task ? "سجّل التبديل" : "اعطي التاسك"}
      </button>
    </form>
  );
}
