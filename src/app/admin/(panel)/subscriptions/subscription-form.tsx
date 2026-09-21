// «اشتراك جديد» — the annual package of one client on one offer, for one season.
//
// Server component; <ActionForm> is the only client boundary.
//
// THE TWO EMPTY BOXES ARE THE POINT. «عدد الزيتونات» and «المعاليم السنوية» are both meant to be left empty:
// the database then counts the trees the client actually owns in that offer and reads the offer's own annual
// fee — the very figure the visitor was quoted on the offer page. Typing a fee here is allowed, because a
// client who was quoted a different number on a different day must be honoured at the number they were shown,
// but it is recorded as «مبلغ مكتوب باليد» so it can never be mistaken for the offer's price.
//
// THE SEASON IS NOT ASKED FOR. It is the agricultural season the writing day falls in, decided by
// app.agri_season from the setting agri.season_start_month. Asking twice would let two people file the same
// client under two different years.

import { ActionForm } from "@/components/admin/action-form";
import { FormField } from "@/components/ui";
import { formatMillimes } from "@/lib/format";

import { createSubscription } from "./actions";

type Offer = { id: string; code: string; name: string };
type Person = { id: string; full_name: string; phone_e164: string };

export type SubscriptionFormProps = {
  offers: Offer[];
  people: Person[];
  seasonLabel: string;
  /** What the offer page quotes today, so the writer sees the figure they are agreeing to freeze. */
  annualFeeHint: number | null;
  reasonHint: string;
};

export function SubscriptionForm({ offers, people, seasonLabel, annualFeeHint, reasonHint }: SubscriptionFormProps) {
  return (
    <ActionForm action={createSubscription} submitLabel="سجّل الاشتراك" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="الحريف" id="sub-person">
          <select id="sub-person" name="person_id" defaultValue="" required className="field">
            <option value="">اختر الحريف</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name} — {person.phone_e164}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="العرض" id="sub-project">
          <select id="sub-project" name="project_id" defaultValue="" required className="field">
            <option value="">اختر العرض</option>
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name} ({offer.code})
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="عدد الزيتونات"
          id="sub-trees"
          hint="خلّيها فارغة: النظام يعدّ الزيتونات المباعة لهذا الحريف في هذا العرض. اكتب عدداً كان العقد تعمل على الورق."
        >
          <input id="sub-trees" name="tree_count" inputMode="numeric" dir="ltr" className="field" />
        </FormField>

        <FormField
          label="المعاليم السنوية للزيتونة (دينار)"
          id="sub-fee"
          hint={
            annualFeeHint === null
              ? "خلّيها فارغة: النظام يقرا معاليم العرض روحو."
              : `خلّيها فارغة: النظام يقرا ${formatMillimes(annualFeeHint)} من التسعير. اكتب مبلغاً كان الحريف تعرضلو رقم آخر نهار المطلب.`
          }
        >
          <input id="sub-fee" name="fee_per_tree_millimes" inputMode="decimal" dir="ltr" placeholder="0.000" className="field" />
        </FormField>
      </div>

      <FormField label="ملاحظات" id="sub-note">
        <textarea id="sub-note" name="note" rows={3} maxLength={2000} className="field" />
      </FormField>

      <FormField label="سبب التغيير" id="sub-reason" hint={reasonHint}>
        <input id="sub-reason" name="reason" maxLength={1000} className="field" />
      </FormField>

      <p className="hint">
        الاشتراك يتسجّل على {seasonLabel} ويتقيّد بالمعاليم كيما هي اليوم. تبديل التسعير بعد اليوم ما يمسّوش.
      </p>
    </ActionForm>
  );
}
