"use client";

import { useState } from "react";

import { ActionForm, type ActionResult } from "@/components/admin/action-form";

type RuleFormProps = {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** The rule in force, in dinars and percent, to start from. */
  amounts: number[];
  basis: "tree" | "order";
  cap: number;
  minMargin: number;
};

const MAX_GENERATIONS = 10;

/** The rule editor: as many amount fields as generations chosen, nearest generation first. */
export function RuleForm({ action, amounts, basis, cap, minMargin }: RuleFormProps) {
  const [count, setCount] = useState(Math.max(1, Math.min(MAX_GENERATIONS, amounts.length || 6)));
  const [values, setValues] = useState<string[]>(() =>
    Array.from({ length: MAX_GENERATIONS }, (_, index) => (amounts[index] === undefined ? "" : String(amounts[index]))),
  );
  const total = values.slice(0, count).reduce((sum, value) => sum + (Number(value.replace(",", ".")) || 0), 0);

  return (
    <ActionForm action={action} submitLabel="سجّل القاعدة الجديدة" className="space-y-4">
      <label className="block max-w-xs space-y-1">
        <span className="text-sm font-semibold">عدد الأجيال</span>
        <select
          name="generations"
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="field field-sm w-full"
        >
          {Array.from({ length: MAX_GENERATIONS }, (_, index) => index + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">مبلغ كل جيل (بالدينار)</legend>
        {Array.from({ length: count }, (_, index) => (
          <label key={index} className="block space-y-1">
            <span className="text-xs text-muted">
              الجيل {index + 1}
              {index === 0 ? " — اللي جاب الحريف مباشرة" : ""}
            </span>
            <input
              name={`amount_${index + 1}`}
              inputMode="decimal"
              dir="ltr"
              required
              value={values[index]}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                setValues(next);
              }}
              className="field field-sm w-full text-end tabular-nums"
            />
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-muted">
        المجموع: <span className="font-semibold text-ink tabular-nums">{total.toLocaleString("en-US")}</span> دينار
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">تتحسب على</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="basis" value="tree" defaultChecked={basis === "tree"} /> كل زيتونة (المبلغ × عدد
          الزيتونات)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="basis" value="order" defaultChecked={basis === "order"} /> كل طلبية (المبلغ مرّة وحدة
          على العقد)
        </label>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-semibold">السقف لكل وحدة (بالدينار)</span>
          <input name="cap" inputMode="decimal" dir="ltr" required defaultValue={String(cap)} className="field field-sm w-full text-end" />
          <span className="block text-xs text-muted">مجموع الأجيال ما يفوتوش، والبيع الواحد ما يخلّصش أكثر منو.</span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">أدنى هامش يبقى لـAgriZed (٪ من الكلفة الكاملة)</span>
          <input
            name="min_margin"
            inputMode="decimal"
            dir="ltr"
            required
            defaultValue={String(minMargin)}
            className="field field-sm w-full text-end"
          />
          <span className="block text-xs text-muted">
            كي البيع ما يخلّيش الهامش هذا بعد الكوميسيونات، الأجيال البعيدة تنقص قبل القريبة.
          </span>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-semibold">ملاحظة</span>
        <input name="note" maxLength={1000} className="field field-sm w-full" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-semibold">سبب التغيير</span>
        <input name="reason" maxLength={1000} className="field field-sm w-full" />
      </label>
    </ActionForm>
  );
}
