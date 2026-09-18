"use client";

import { useState } from "react";
import { FormField } from "@/components/ui";

import {
  describePricing,
  draftFromPricing,
  draftSource,
  EMPTY_BRACKET,
  EMPTY_SCENARIO,
  MAX_BRACKETS,
  MAX_SCENARIOS,
  PRICING_FIELDS as F,
  PRICING_MODELS,
  readPricingForm,
  type BracketRow,
  type PricingDraft,
  type PricingMode,
  type ScenarioRow,
} from "@/lib/pricing-form";

type PricingEditorProps = {
  initial: unknown;
  /** The formula used when this one is left on «inherit». Null for the default formula itself. */
  inherit: { label: string; hint: string; lines: string[] } | null;
};

/**
 * Edits a pricing formula with plain fields (months, percentages, dinars) instead of JSON.
 * The fields are submitted as they are; the Server Action rebuilds the formula with readPricingForm().
 */
export function PricingEditor({ initial, inherit }: PricingEditorProps) {
  const [draft, setDraft] = useState<PricingDraft>(() => draftFromPricing(initial, inherit ? "inherit" : "markup_brackets"));
  const result = readPricingForm(draftSource(draft), { allowInherit: inherit !== null });

  const update = (patch: Partial<PricingDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const setBracket = (index: number, patch: Partial<BracketRow>) =>
    setDraft((current) => ({ ...current, brackets: current.brackets.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));
  const setScenario = (index: number, patch: Partial<ScenarioRow>) =>
    setDraft((current) => ({ ...current, scenarios: current.scenarios.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));

  const modes: { value: PricingMode; label: string; hint: string }[] = inherit
    ? [{ value: "inherit", label: inherit.label, hint: inherit.hint }, ...PRICING_MODELS]
    : PRICING_MODELS;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold">طريقة التسعير</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {modes.map((option) => {
            const chosen = draft.mode === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  chosen ? "border-forest bg-leaf-soft/60" : "border-line bg-paper/50 hover:border-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name={F.mode}
                  value={option.value}
                  checked={chosen}
                  onChange={() => update({ mode: option.value })}
                  className="mt-1 size-4 accent-forest"
                />
                <span>
                  <span className="block font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-muted">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {draft.mode === "inherit" && inherit ? (
        <div className="card space-y-3 rounded-xl bg-paper/40 p-4">
          {inherit.lines.length > 0 ? (
            <Lines title="الصيغة اللي باش تتطبّق:" lines={inherit.lines} />
          ) : (
            <p className="text-sm text-muted">ما فماش صيغة مضبوطة بعد. القطع باش تظهر بلا أمثلة تقسيط حتى تختار طريقة.</p>
          )}
        </div>
      ) : null}

      {draft.mode === "markup_brackets" ? (
        <div className="card space-y-3 rounded-xl bg-paper/40 p-4">
          <p className="text-sm leading-6 text-muted">
            كل سطر: إذا كمل الحريف الخلاص في هالمدة أو أقل، يتزاد الهامش هذا على سعر الحاضر. أقصر مدة تناسب الحريف هي اللي تتطبّق.
          </p>
          <ul className="space-y-2">
            {draft.brackets.map((row, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
                <span>حتى</span>
                <NumberField
                  name={F.bracketMonths}
                  value={row.months}
                  onChange={(value) => setBracket(index, { months: value })}
                  label={`المدة ${index + 1} بالأشهر`}
                  placeholder="36"
                  className="w-20"
                />
                <span>شهراً ← هامش</span>
                <NumberField
                  name={F.bracketPct}
                  value={row.pct}
                  onChange={(value) => setBracket(index, { pct: value })}
                  label={`الهامش ${index + 1} بالنسبة المئوية`}
                  placeholder="10"
                  className="w-20"
                />
                <span>%</span>
                {draft.brackets.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => update({ brackets: draft.brackets.filter((_, i) => i !== index) })}
                    className="ms-2 font-semibold text-danger underline-offset-4 hover:underline"
                  >
                    حذف
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {draft.brackets.length < MAX_BRACKETS ? (
            <button type="button" onClick={() => update({ brackets: [...draft.brackets, EMPTY_BRACKET] })} className="btn btn-ghost min-h-10">
              + زيد مدة
            </button>
          ) : null}
          <Limits draft={draft} update={update} />
        </div>
      ) : null}

      {draft.mode === "monthly_rate" ? (
        <div className="card space-y-3 rounded-xl bg-paper/40 p-4">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">الهامش الشهري</span>
            <NumberField
              name={F.monthlyRate}
              value={draft.monthlyRate}
              onChange={(value) => update({ monthlyRate: value })}
              label="الهامش الشهري بالنسبة المئوية"
              placeholder="1.5"
              className="w-24"
            />
            <span>% في الشهر، من (سعر الحاضر − التسبقة)</span>
          </label>
          <Limits draft={draft} update={update} />
        </div>
      ) : null}

      {draft.mode === "scenarios" ? (
        <div className="card space-y-3 rounded-xl bg-paper/40 p-4">
          <p className="text-sm leading-6 text-muted">
            التسبقة والقسط في كل تركيبة لازم يكونو نفس القيم الموجودة في قوائم «التسبقة» و«القسط الشهري»، خاطر الحريف يختار منهم.
          </p>
          <ul className="space-y-3">
            {draft.scenarios.map((row, index) => (
              <li key={index} className="card rounded-xl p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted">التركيبة {index + 1}</span>
                  {draft.scenarios.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => update({ scenarios: draft.scenarios.filter((_, i) => i !== index) })}
                      className="font-semibold text-danger underline-offset-4 hover:underline"
                    >
                      حذف
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <FormField size="xs" label="التسبقة (د.ت)">
                    <NumberField name={F.scenarioDown} value={row.down} onChange={(value) => setScenario(index, { down: value })} placeholder="1000" />
                  </FormField>
                  <FormField size="xs" label="القسط الشهري (د.ت)">
                    <NumberField
                      name={F.scenarioInstallment}
                      value={row.installment}
                      onChange={(value) => setScenario(index, { installment: value })}
                      placeholder="100"
                    />
                  </FormField>
                  <FormField size="xs" label="عدد الأشهر">
                    <NumberField name={F.scenarioMonths} value={row.months} onChange={(value) => setScenario(index, { months: value })} placeholder="60" />
                  </FormField>
                  <FormField size="xs" label="السعر الجملي (د.ت)">
                    <NumberField name={F.scenarioTotal} value={row.total} onChange={(value) => setScenario(index, { total: value })} placeholder="7000" />
                  </FormField>
                </div>
              </li>
            ))}
          </ul>
          {draft.scenarios.length < MAX_SCENARIOS ? (
            <button type="button" onClick={() => update({ scenarios: [...draft.scenarios, EMPTY_SCENARIO] })} className="btn btn-ghost min-h-10">
              + زيد تركيبة
            </button>
          ) : null}
        </div>
      ) : null}

      {draft.mode !== "inherit" ? (
        result.ok ? (
          <div className="rounded-xl bg-paper px-4 py-3">
            <Lines title="كيفاش باش تتحسب:" lines={describePricing(result.value)} />
          </div>
        ) : (
          <p role="status" className="rounded-xl bg-gold-soft px-4 py-3 text-sm text-forest-700">
            {result.message}
          </p>
        )
      ) : null}

      <p className="hint">الأمثلة بالأرقام الحقيقية تظهر في بطاقة كل قطعة، محسوبة من قاعدة البيانات بهذه الصيغة.</p>
    </div>
  );
}

function Limits({ draft, update }: { draft: PricingDraft; update: (patch: Partial<PricingDraft>) => void }) {
  return (
    <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
      <FormField size="xs" label="أقصى مدة (شهر)">
        <NumberField name={F.maxMonths} value={draft.maxMonths} onChange={(value) => update({ maxMonths: value })} placeholder="اختياري، مثال: 84" />
      </FormField>
      <FormField size="xs" label="أدنى تسبقة (% من سعر الحاضر)">
        <NumberField name={F.minDownPct} value={draft.minDownPct} onChange={(value) => update({ minDownPct: value })} placeholder="اختياري، مثال: 10" />
      </FormField>
      <FormField size="xs" label="أدنى قسط شهري (د.ت)">
        <NumberField
          name={F.minInstallment}
          value={draft.minInstallment}
          onChange={(value) => update({ minInstallment: value })}
          placeholder="اختياري، مثال: 50"
        />
      </FormField>
    </div>
  );
}

function NumberField({
  name,
  value,
  onChange,
  label,
  placeholder,
  className = "",
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="decimal"
      dir="ltr"
      aria-label={label}
      placeholder={placeholder}
      className={`field min-h-10 text-left tabular-nums ${className}`}
    />
  );
}
function Lines({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="text-sm">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 ps-5 leading-6">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
