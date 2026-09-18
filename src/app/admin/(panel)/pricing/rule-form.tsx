import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { DinarInput, millimesToInput } from "@/components/admin/tree-pricing-inputs";
import { MarginFields, type MarginValue } from "@/components/admin/tree-pricing-margin-fields";

import { savePricingRule } from "./actions";
import { NoteCallout } from "./note-callout";
import { NOTE_MAX_LENGTH, type PricingRule } from "./types";

function marginOf(rule: PricingRule | null): MarginValue {
  return {
    mode: rule?.margin_mode ?? null,
    percentBp: rule?.margin_percent_bp ?? null,
    fixedMillimes: rule?.margin_fixed_millimes ?? null,
  };
}

/** The global rule (projectId null) or a project override, where an empty field inherits the global value. */
export function RuleForm({
  projectId,
  rule,
  globalRule,
  reasonMin,
  idPrefix,
}: {
  projectId: string | null;
  rule: PricingRule | null;
  globalRule: PricingRule | null;
  reasonMin: number;
  idPrefix: string;
}) {
  const isProject = projectId !== null;
  const inherit = (millimes: number | null | undefined, unit: string) =>
    isProject ? (typeof millimes === "number" ? `يتبع العامة: ${millimesToInput(millimes)} ${unit}` : "يتبع العامة") : undefined;
  // A project that sets its own margin no longer uses the figures the global note explains.
  const marginNoteInherited = isProject && !rule?.note_ar && !rule?.margin_mode;
  const marginNote = rule?.note_ar || (marginNoteInherited ? globalRule?.note_ar : null);
  const globalPlaceholder = (note: string | null | undefined) => (isProject && note ? `العامة: ${note}` : undefined);

  return (
    <ActionForm
      action={savePricingRule.bind(null, projectId)}
      submitLabel={isProject ? "حفظ قواعد المشروع" : "حفظ القواعد العامة"}
      className="card space-y-5 p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <DinarInput
          name="land_price"
          label="ثمن المتر المربع من الأرض"
          unit="د/م²"
          millimes={rule?.land_price_per_m2_millimes}
          placeholder={inherit(globalRule?.land_price_per_m2_millimes, "د")}
          required={!isProject}
          hint="قيمة الأرض للزيتونة = مساحة الزيتونة × هذا الثمن."
        />
        <DinarInput
          name="planting_cost"
          label="تكلفة غراسة الزيتونة"
          unit="د/زيتونة"
          millimes={rule?.planting_cost_per_tree_millimes}
          placeholder={inherit(globalRule?.planting_cost_per_tree_millimes, "د")}
          required={!isProject}
        />
        <DinarInput
          name="annual_fee"
          label="معاليم الصيانة والتقليم في العام"
          unit="د/زيتونة في العام"
          millimes={rule?.annual_fee_per_tree_millimes}
          placeholder={inherit(globalRule?.annual_fee_per_tree_millimes, "د")}
          hint="تتخلّص كل عام وما تدخلش في ثمن شراء الزيتونة. فارغة في عرض = ياخو القيمة العامّة."
        />
      </div>

      <div className="space-y-2">
        <NoteCallout note={marginNote} inherited={marginNoteInherited && Boolean(marginNote)} />
        <MarginFields key={`${idPrefix}-${rule?.updated_at ?? "none"}`} value={marginOf(rule)} inherited={isProject ? marginOf(globalRule) : null} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DinarInput
          name="price_rounding"
          label="خطوة تدوير سعر الزيتونة"
          millimes={rule?.price_rounding_millimes}
          placeholder={inherit(globalRule?.price_rounding_millimes, "د")}
          required={!isProject}
          hint="مثال: 1 = سعر الزيتونة بدينار كامل."
        />
        <DinarInput
          name="monthly_rounding"
          label="خطوة تدوير القسط الشهري"
          millimes={rule?.monthly_rounding_millimes}
          placeholder={inherit(globalRule?.monthly_rounding_millimes, "د")}
          required={!isProject}
          hint="القسط الشهري يُدوَّر للأعلى. مثال: 1 = إلى الدينار."
        />
      </div>

      {isProject ? (
        <label className="flex items-start gap-3">
          <input type="checkbox" name="use_global_cost_items" defaultChecked={rule?.use_global_cost_items ?? true} className="mt-1 size-4 accent-forest" />
          <span>
            <span className="block text-sm font-semibold">استعمال المصاريف العامة</span>
            <span className="hint block">مفعّل: المصاريف الإضافية العامة تُحسب مع مصاريف المشروع. غير مفعّل: مصاريف المشروع وحدها.</span>
          </span>
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <NoteField
          id={`${idPrefix}-note`}
          name="note_ar"
          label="ملاحظة على الهامش"
          value={rule?.note_ar}
          placeholder={globalPlaceholder(globalRule?.note_ar)}
          hint={
            isProject
              ? "فارغة = تظهر ملاحظة القاعدة العامة ما دام هامش المشروع يتبعها."
              : "تظهر فوق خانة الهامش، مثلاً من وين جات النسبة. امسحها كي تتثبّت الأرقام مع Finance."
          }
        />
        <NoteField
          id={`${idPrefix}-markups-note`}
          name="markups_note_ar"
          label="ملاحظة على الزيادة حسب مدة التقسيط"
          value={rule?.markups_note_ar}
          placeholder={globalPlaceholder(globalRule?.markups_note_ar)}
          hint={
            isProject
              ? "فارغة = تظهر ملاحظة القاعدة العامة فوق نسب المشروع."
              : "تظهر فوق «الزيادة حسب مدة التقسيط». امسحها كي تتثبّت النسب مع Finance."
          }
        />
      </div>

      <ReasonField minLength={reasonMin} id={`${idPrefix}-reason`} />
    </ActionForm>
  );
}

function NoteField({
  id,
  name,
  label,
  value,
  placeholder,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  hint: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        aria-describedby={`${id}-hint`}
        className="field min-h-20"
      />
      <p id={`${id}-hint`} className="hint">
        {hint}
      </p>
    </div>
  );
}
