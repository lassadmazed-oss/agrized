"use client";

// §20's template, edited. Adding a row, renaming one, moving it to another gate, making it optional, or
// putting it out of service.
//
// THE FORM SAYS WHAT A ROW DOES, because a row here is not a label. «إجباري» plus a gate is the sentence «the
// database will refuse the contract / the signature / the ownership until somebody ticks this», and an owner
// who does not know that will eventually make every item mandatory and then wonder why nothing can close. So
// the hint under each control says it out loud.
//
// The three gate codes are NOT written here: they arrive as the owner's own Arabic from settings
// legal.gate_labels, with the payload.

import { useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { FormField } from "@/components/ui";

import { saveChecklistItem } from "../actions";
import { GATES, type ChecklistTemplateItem } from "../legal-model";

export function ChecklistItemForm({
  item,
  gateLabels,
  reasonMin,
  onDone,
}: {
  item?: ChecklistTemplateItem;
  gateLabels: Record<string, string>;
  reasonMin: number;
  onDone?: () => void;
}) {
  const id = item?.id ?? "new";

  return (
    <ActionForm
      action={saveChecklistItem}
      submitLabel={item ? "احفظ البند" : "زيد البند"}
      pendingLabel="جارٍ الحفظ…"
    >
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      <FormField label="البند" id={`i-label-${id}`} hint="كيما يقراه الفريق في الملف.">
        <input
          id={`i-label-${id}`}
          name="label_ar"
          type="text"
          required
          minLength={2}
          maxLength={200}
          defaultValue={item?.label}
          className="field"
        />
      </FormField>

      <FormField
        label="شرح (اختياري)"
        id={`i-help-${id}`}
        hint="شنوّة بالضبط يلزم يتثبّت فيه الموظّف قبل ما يعلّمو."
      >
        <textarea
          id={`i-help-${id}`}
          name="help_ar"
          rows={2}
          maxLength={1000}
          defaultValue={item?.help ?? ""}
          className="field"
        />
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="وقتاش يوقّف؟"
          id={`i-gate-${id}`}
          hint="«قبل ما يتكتب العقد» هي نفس اللحظة اللي فيها الزيتونات يولّيوا «مباعة»، فهي اللي تحمي المخزون."
        >
          <select
            id={`i-gate-${id}`}
            name="required_at"
            defaultValue={item?.requiredAt ?? "contract"}
            className="field"
          >
            {GATES.map((gate) => (
              <option key={gate} value={gate}>
                {gateLabels[gate] ?? gate}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="الترتيب" id={`i-sort-${id}`} hint="الأصغر يتبان الأول.">
          <input
            id={`i-sort-${id}`}
            name="sort_order"
            type="number"
            inputMode="numeric"
            defaultValue={item?.sortOrder ?? 0}
            className="field"
          />
        </FormField>
      </div>

      <label className="choice flex items-start gap-3">
        <input
          type="checkbox"
          name="is_mandatory"
          defaultChecked={item ? item.isMandatory : true}
          className="mt-0.5 size-5 shrink-0 accent-forest"
        />
        <span className="text-sm leading-6">
          <span className="font-medium">إجباري</span>
          <span className="block text-muted">
            كي يكون إجباري، قاعدة البيانات روحها ترفض اللحظة اللي فوق حتى يتعلّم. موش زرّ مطفي — رفض حقيقي.
          </span>
        </span>
      </label>

      <label className="choice flex items-center gap-3">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={item ? item.isActive : true}
          className="size-5 shrink-0 accent-forest"
        />
        <span className="text-sm font-medium">في الخدمة</span>
      </label>

      <p className="hint">
        التبديل هنا يمشي للملفات اللي باش تتفتح من بعد برك. الملفات المفتوحة والمسكّرة عندهم نسخة خاصة بيهم
        وما تتبدّلش.
      </p>

      <ReasonField minLength={reasonMin} id={`i-reason-${id}`} />

      {onDone ? (
        <button type="button" onClick={onDone} className="btn btn-ghost btn-sm">
          إلغاء
        </button>
      ) : null}
    </ActionForm>
  );
}

export function ChecklistItemActs({
  item,
  gateLabels,
  reasonMin,
}: {
  item: ChecklistTemplateItem;
  gateLabels: Record<string, string>;
  reasonMin: number;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm mt-2">
        بدّل
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <ChecklistItemForm
        item={item}
        gateLabels={gateLabels}
        reasonMin={reasonMin}
        onDone={() => setEditing(false)}
      />
    </div>
  );
}
