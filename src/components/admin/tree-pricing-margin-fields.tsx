"use client";

import { useState } from "react";

import { DinarInput, formatBp, formatMoney, PercentInput } from "./tree-pricing-inputs";

export type MarginValue = {
  mode: "percent" | "fixed" | null;
  percentBp: number | null;
  fixedMillimes: number | null;
};

function describe(margin: MarginValue): string {
  if (margin.mode === "percent" && typeof margin.percentBp === "number") return formatBp(margin.percentBp);
  if (margin.mode === "fixed" && typeof margin.fixedMillimes === "number") return `${formatMoney(margin.fixedMillimes)} للزيتونة`;
  return "غير مضبوط";
}

/** AgriZed margin: a percentage or a fixed amount per tree. `inherited` is the global margin when editing a project. */
export function MarginFields({ value, inherited }: { value: MarginValue; inherited: MarginValue | null }) {
  const [mode, setMode] = useState<string>(value.mode ?? "");

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">هامش AgriZed</legend>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
        <label className="block space-y-1">
          <span className="sr-only">طريقة حساب الهامش</span>
          <select name="margin_mode" value={mode} onChange={(event) => setMode(event.target.value)} className="field min-h-11">
            <option value="">{inherited ? `يتبع القاعدة العامة (${describe(inherited)})` : "غير مضبوط بعد"}</option>
            <option value="percent">نسبة % تُضاف على تكلفة الزيتونة</option>
            <option value="fixed">مبلغ ثابت للزيتونة</option>
          </select>
        </label>
        {mode === "percent" ? (
          <PercentInput
            name="margin_percent"
            label="نسبة الهامش"
            hideLabel
            bp={value.mode === "percent" ? value.percentBp : null}
            placeholder="مثال: 15"
            required
          />
        ) : null}
        {mode === "fixed" ? (
          <DinarInput
            name="margin_fixed"
            label="مبلغ الهامش للزيتونة"
            hideLabel
            unit="د/زيتونة"
            millimes={value.mode === "fixed" ? value.fixedMillimes : null}
            placeholder="مثال: 40"
            required
          />
        ) : null}
      </div>
    </fieldset>
  );
}
