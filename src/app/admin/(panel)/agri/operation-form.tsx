// «سجّل عملية» — the form of cahier v2 §41, field for field.
//
// Server component. It draws the controls and hands the Server Action to <ActionForm>, which is the only
// client boundary on this screen.
//
// WHAT IT ASKS AND WHAT IT DOES NOT. §41 names ten fields; nine are here. «Photos» is not, and its absence is
// deliberate rather than forgotten: a grove photo belongs in a PRIVATE storage bucket (the project-media
// bucket is public, and a client's trees must not land in it), which is its own migration with its own upload
// route. Saying so here is cheaper than a half-built uploader.
//
// THE TREE BOX IS NORMALLY EMPTY. An operation covers the whole offer — that is what ploughing, irrigation and
// guarding are — and only an act that touched some trees and not others names them. Leaving it empty is the
// normal case and the hint says so, because a form that looks incomplete invites somebody to fill 8,000 ids.

import { ActionForm } from "@/components/admin/action-form";
import { FormField } from "@/components/ui";
import type { OptionItem } from "@/lib/config";

import { saveOperation } from "./actions";

type Offer = { id: string; code: string; name: string };

export type OperationFormProps = {
  offers: Offer[];
  services: OptionItem[];
  providers: OptionItem[];
  /** Preselected when the form sits under one offer's card. */
  projectId?: string;
  reasonHint: string;
};

export function OperationForm({ offers, services, providers, projectId, reasonHint }: OperationFormProps) {
  return (
    <ActionForm action={saveOperation} submitLabel="سجّل العملية" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="العرض" id="op-project">
          <select id="op-project" name="project_id" defaultValue={projectId ?? ""} required className="field">
            <option value="">اختر العرض</option>
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name} ({offer.code})
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="نوع العملية" id="op-service" hint="نفس قائمة خدمات AgriZed اللي تظهر في بطاقة العرض.">
          <select id="op-service" name="service_option_id" required className="field">
            <option value="">اختر الخدمة</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.label_ar}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="الحالة" id="op-status">
          <select id="op-status" name="status" defaultValue="done" className="field">
            <option value="planned">مخطّطة</option>
            <option value="done">منجزة</option>
            <option value="cancelled">ملغاة</option>
          </select>
        </FormField>

        <FormField label="المنفّذ" id="op-provider" hint="فريق AgriZed ولا شركة متعاقدة. ما فماش حساب للشركات في هذه النسخة.">
          <select id="op-provider" name="provider_option_id" defaultValue="" className="field">
            <option value="">بلا تحديد</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label_ar}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="التاريخ المبرمج" id="op-planned" hint="نهار شنوّة كان مبرمج يتعمل. فارغ = ما فماش برمجة.">
          <input id="op-planned" type="date" name="planned_on" className="field" />
        </FormField>

        <FormField label="تاريخ الإنجاز" id="op-executed" hint="إجباري كي الحالة «منجزة».">
          <input id="op-executed" type="date" name="executed_on" className="field" />
        </FormField>

        <FormField label="الكلفة (دينار)" id="op-cost" hint="اللي خلّصناه على هذه العملية. فارغة = مازالت ما تعرفتش.">
          <input id="op-cost" name="cost_millimes" inputMode="decimal" dir="ltr" placeholder="0.000" className="field" />
        </FormField>

        <FormField label="ملاحظة على المنفّذ" id="op-provider-note" hint="اسم الشركة، رقم الهاتف، رقم الفاتورة.">
          <input id="op-provider-note" name="provider_note" maxLength={300} className="field" />
        </FormField>
      </div>

      <FormField
        label="زيتونات بعينها"
        id="op-trees"
        hint="خلّيها فارغة: العملية تكون على الضيعة الكل، وهذي هي الحالة العادية. اكتب أرقام الزيتونات (id) مفصولين بفاصلة كان العملية مسّت بعضهم برك."
      >
        <textarea id="op-trees" name="tree_ids" rows={2} dir="ltr" className="field" />
      </FormField>

      <FormField label="ملاحظات" id="op-note">
        <textarea id="op-note" name="note" rows={3} maxLength={2000} className="field" />
      </FormField>

      <FormField label="سبب التغيير" id="op-reason" hint={reasonHint}>
        <input id="op-reason" name="reason" maxLength={1000} className="field" />
      </FormField>
    </ActionForm>
  );
}
