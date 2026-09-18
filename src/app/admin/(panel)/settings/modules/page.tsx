import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { FLAG_STATE_LABELS, isImplementedModule, PHASE_LABELS } from "@/lib/modules-catalog";
import { createClient } from "@/lib/supabase/server";

import { setModuleState } from "./actions";

export const metadata: Metadata = { title: "الموديولات" };

const STATE_TONES = {
  disabled: "bg-stone-100 text-stone-700 ring-stone-200",
  internal: "bg-amber-50 text-amber-800 ring-amber-200",
  public: "bg-emerald-50 text-emerald-800 ring-emerald-200",
} as const;

export default async function ModulesPage() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const { data: flags, error } = await supabase
    .from("feature_flags")
    .select("key, state, phase, label_ar, description_ar, updated_at")
    .order("phase")
    .order("sort_order");
  if (error) throw new Error(error.message);

  const phases = [1, 2, 3, 4].map((phase) => ({ phase, flags: (flags ?? []).filter((flag) => flag.phase === phase) }));

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="section-title">الموديولات</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          تحكّم في ما يظهر للعموم دون تدخل تقني. التغيير يسري فوراً ويُسجَّل في سجل العمليات.
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <StateHelp state="disabled" text="مخفي عن الجميع. روابطه تعرض «قريباً»." />
          <StateHelp state="internal" text="يراه فريق AgriZed المسجّل فقط، للتجربة قبل النشر." />
          <StateHelp state="public" text="ظاهر لكل الزوار." />
        </dl>
      </header>

      {phases.map(({ phase, flags: phaseFlags }) => (
        <section key={phase} className="space-y-3">
          <h2 className="text-lg font-semibold">{PHASE_LABELS[phase]}</h2>
          <ul className="panel divide-y divide-line">
            {phaseFlags.map((flag) => {
              const implemented = isImplementedModule(flag.key);
              return (
                <li key={flag.key} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 max-w-md">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{flag.label_ar}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATE_TONES[flag.state]}`}>
                        {FLAG_STATE_LABELS[flag.state]}
                      </span>
                    </div>
                    {flag.description_ar ? <p className="mt-1 text-sm text-muted">{flag.description_ar}</p> : null}
                  </div>

                  {implemented ? (
                    <ActionForm
                      action={setModuleState.bind(null, flag.key)}
                      submitLabel="حفظ"
                      className="flex flex-wrap items-center gap-2"
                      buttonClassName="btn btn-secondary min-h-10"
                    >
                      <fieldset className="flex overflow-hidden rounded-xl border border-line-strong">
                        <legend className="sr-only">حالة {flag.label_ar}</legend>
                        {(Object.keys(FLAG_STATE_LABELS) as (keyof typeof FLAG_STATE_LABELS)[]).map((state) => (
                          <label
                            key={state}
                            className="cursor-pointer border-e border-line-strong px-3 py-2 text-sm last:border-e-0 has-checked:bg-forest has-checked:font-semibold has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-gold-bright"
                          >
                            <input type="radio" name="state" value={state} defaultChecked={flag.state === state} className="sr-only" />
                            {FLAG_STATE_LABELS[state]}
                          </label>
                        ))}
                      </fieldset>
                    </ActionForm>
                  ) : (
                    <p className="text-sm text-muted">يُبنى في دفعة قادمة</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StateHelp({ state, text }: { state: keyof typeof STATE_TONES; text: string }) {
  return (
    <div className="card rounded-xl px-3 py-2">
      <dt>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATE_TONES[state]}`}>{FLAG_STATE_LABELS[state]}</span>
      </dt>
      <dd className="mt-1 text-muted">{text}</dd>
    </div>
  );
}
