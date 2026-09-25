"use client";

// §18's directory, written. One form for adding and for editing, because they are the same act with the same
// fields — two forms would be two chances for them to drift.
//
// EVERY LIST IN IT IS THE OWNER'S DATA, fetched with the rows themselves: the specialities are the option
// list `partner_speciality` (محامي · عدل إشهاد · خبير · مسّاح, and whatever he adds), and the regions are
// public.governorates. Nothing here names a speciality, and the day he adds «مهندس طوبوغرافي» this form
// offers it without a deployment.
//
// THE PHONE IS NOT VALIDATED HERE. app.assert_phone decides, in Postgres, and it already honours the owner's
// own lead.allow_international_phone setting — a second rule in TypeScript would be a second answer.

import { useState } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { FormField } from "@/components/ui";

import { archivePartner, savePartner } from "../actions";
import type { NamedGovernorate, NamedOption, Partner } from "../legal-model";

export function PartnerForm({
  partner,
  specialities,
  governorates,
  reasonMin,
  onDone,
}: {
  partner?: Partner;
  specialities: readonly NamedOption[];
  governorates: readonly NamedGovernorate[];
  reasonMin: number;
  onDone?: () => void;
}) {
  const id = partner?.id ?? "new";

  return (
    <ActionForm
      action={savePartner}
      submitLabel={partner ? "احفظ التغييرات" : "زيد الشريك"}
      pendingLabel="جارٍ الحفظ…"
    >
      {partner ? <input type="hidden" name="id" value={partner.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="الاسم واللقب" id={`p-name-${id}`}>
          <input
            id={`p-name-${id}`}
            name="full_name"
            type="text"
            required
            minLength={2}
            maxLength={160}
            defaultValue={partner?.fullName}
            className="field"
          />
        </FormField>
        <FormField label="الاختصاص" id={`p-spec-${id}`} hint="من الإعدادات ← القوائم ← «اختصاصات الشركاء».">
          <select
            id={`p-spec-${id}`}
            name="speciality_option_id"
            defaultValue={partner?.specialityOptionId ?? ""}
            className="field"
          >
            <option value="">— بلا اختصاص —</option>
            {specialities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="الهاتف" id={`p-phone-${id}`} hint="مثال: 98 123 456">
          <input
            id={`p-phone-${id}`}
            name="phone_e164"
            type="tel"
            dir="ltr"
            maxLength={20}
            defaultValue={partner?.phone ?? ""}
            className="field"
          />
        </FormField>
        <FormField label="البريد الإلكتروني" id={`p-email-${id}`}>
          <input
            id={`p-email-${id}`}
            name="email"
            type="email"
            dir="ltr"
            maxLength={200}
            defaultValue={partner?.email ?? ""}
            className="field"
          />
        </FormField>
        <FormField label="المكتب" id={`p-office-${id}`}>
          <input
            id={`p-office-${id}`}
            name="office_name"
            type="text"
            maxLength={200}
            defaultValue={partner?.officeName ?? ""}
            className="field"
          />
        </FormField>
        <FormField label="الولاية" id={`p-gov-${id}`}>
          <select
            id={`p-gov-${id}`}
            name="governorate_id"
            defaultValue={partner?.governorateId ? String(partner.governorateId) : ""}
            className="field"
          >
            <option value="">— كل الولايات —</option>
            {governorates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <label className="choice flex items-center gap-3">
        <input
          type="checkbox"
          name="is_available"
          defaultChecked={partner ? partner.isAvailable : true}
          className="size-5 accent-forest"
        />
        <span className="text-sm font-medium">متوفّر ياخذ مواعيد</span>
      </label>

      <FormField
        label="التوفر"
        id={`p-avail-${id}`}
        hint="مثال: «يقبل المواعيد الثلاثاء والخميس صباحاً»."
      >
        <input
          id={`p-avail-${id}`}
          name="availability_note"
          type="text"
          maxLength={300}
          defaultValue={partner?.availabilityNote ?? ""}
          className="field"
        />
      </FormField>

      <FormField label="ملاحظات" id={`p-note-${id}`}>
        <textarea id={`p-note-${id}`} name="note" rows={2} defaultValue={partner?.note ?? ""} className="field" />
      </FormField>

      <ReasonField minLength={reasonMin} id={`p-reason-${id}`} />

      {onDone ? (
        <button type="button" onClick={onDone} className="btn btn-ghost btn-sm">
          إلغاء
        </button>
      ) : null}
    </ActionForm>
  );
}

/** Editing and archiving, kept behind a disclosure so the directory reads as a directory. */
export function PartnerActs({
  partner,
  specialities,
  governorates,
  reasonMin,
}: {
  partner: Partner;
  specialities: readonly NamedOption[];
  governorates: readonly NamedGovernorate[];
  reasonMin: number;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <PartnerForm
          partner={partner}
          specialities={specialities}
          governorates={governorates}
          reasonMin={reasonMin}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm">
        بدّل
      </button>
      <ActionForm
        action={archivePartner.bind(null, partner.id, !partner.isActive)}
        submitLabel={partner.isActive ? "أرشِف" : "رجّعو للخدمة"}
        pendingLabel="…"
        className="inline"
        buttonClassName="btn btn-ghost btn-sm"
      >
        <input type="hidden" name="reason" value={partner.isActive ? "أرشفة شريك" : "إرجاع شريك للخدمة"} />
      </ActionForm>
      {partner.openAppointments > 0 ? (
        <span className="text-xs text-muted tabular-nums">
          مستنّي في {partner.openAppointments} موعد
        </span>
      ) : null}
    </div>
  );
}
