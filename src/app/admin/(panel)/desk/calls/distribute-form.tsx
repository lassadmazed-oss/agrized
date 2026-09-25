"use client";

// «وزّع الملفات» — §3's «40 to Sara, 50 to Meriem, 30 to Ahmed», as one act.
//
// WHAT IT IS NOT. /admin/leads already has a transfer bar, and it is good: it moves the rows a manager ticked,
// or every person a search matched, to ONE commercial, in one audited call. What it cannot do is SPLIT — three
// shares are three passes over three hand-made selections — and it cannot say who is already full. Those two
// gaps are this panel, and the write underneath is the same public.admin_assign_persons either way.
//
// IT WORKS AT 375px, which the transfer bar does not: that one is `hidden … md:flex`, so on a phone there is
// no bulk assignment at all. A manager distributing the morning's leads is exactly the person most likely to
// be doing it from a phone.
//
// THE CAPACITY FIGURE IS THE POINT. «40 to Sara» is a decision nobody can take without knowing what Sara is
// already holding, and no screen in the product has ever shown it. It counts the files on each agent's desk
// that the call centre still chases — the same definition the queue on this page partitions by, read from the
// owner's own lead_statuses rows, so the two figures cannot drift apart.

import { useActionState, useState } from "react";

import type { ActionResult } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { formatCount } from "@/lib/format";

import { distributeLeads } from "./actions";
// From ./queue-model and not from ./read: that module is "server-only", and a client component must not pull
// it into its import graph even for a type that erases at compile time.
import type { DistributionTarget } from "./queue-model";

export function DistributeForm({ pool, targets }: { pool: number; targets: readonly DistributionTarget[] }) {
  const [shares, setShares] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const result = await distributeLeads(previous, formData);
    if (result?.ok) setShares({});
    return result;
  }, null);

  const total = targets.reduce((sum, target) => {
    const typed = Number.parseInt(shares[target.id] ?? "", 10);
    return sum + (Number.isFinite(typed) && typed > 0 ? typed : 0);
  }, 0);
  const over = total > pool;

  if (targets.length === 0) {
    return (
      <p className="hint">
        ما فماش Commercial نشط باش يتوزّعو عليه الملفات. زيد مستخدم وأعطيه دور Commercial من «المستخدمون»، ومن
        بعد ارجع لهنا.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-cozy">
      <ul className="grid gap-snug sm:grid-cols-2 xl:grid-cols-3">
        {targets.map((target) => (
          <li key={target.id} className="panel flex items-center justify-between gap-snug p-3">
            <div className="min-w-0">
              <span className="block truncate font-semibold text-ink">{target.name}</span>
              <span className="block text-xs text-muted">
                عندو توّا <span className="tabular-nums">{formatCount(target.open_files)}</span> ملف مفتوح
              </span>
            </div>
            <label className="flex-none">
              <span className="sr-only">عدد الملفات لـ{target.name}</span>
              <input
                name={`share_${target.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={shares[target.id] ?? ""}
                onChange={(event) => setShares((current) => ({ ...current, [target.id]: event.target.value }))}
                placeholder="0"
                className="field field-sm w-20 text-center tabular-nums"
              />
            </label>
          </li>
        ))}
      </ul>

      <label className="block space-y-tight">
        <span className="label-sm">السبب (اختياري)</span>
        <input name="reason" maxLength={500} placeholder="مثال: توزيع ملفات الصباح" className="field field-sm" />
      </label>

      <div className="flex flex-wrap items-center gap-snug">
        <ConfirmButton
          type="submit"
          ask
          disabled={pending || total === 0}
          label={pending ? "جارٍ التوزيع…" : `وزّع ${formatCount(total)} ملف`}
          question={`باش يتوزّعو ${formatCount(Math.min(total, pool))} ملف بلا مسؤول — الأقدم الأول — على ${formatCount(
            targets.filter((target) => Number.parseInt(shares[target.id] ?? "", 10) > 0).length,
          )} كوميرسيال. العملية تتسجّل في تاريخ كلّ ملف.`}
          confirmLabel={`وزّع ${formatCount(Math.min(total, pool))} ملف`}
          cancelLabel="رجوع"
          className="btn btn-primary btn-sm"
        />
        <p className="text-xs text-muted">
          موجود بلا مسؤول: <span className="tabular-nums">{formatCount(pool)}</span>
          {over ? (
            <span className="text-danger">
              {" "}
              — طلبت <span className="tabular-nums">{formatCount(total)}</span>، باش يتوزّعو اللي موجودين برك.
            </span>
          ) : null}
        </p>
      </div>

      {state ? (
        <p role={state.ok ? "status" : "alert"} className={`text-sm font-medium ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
