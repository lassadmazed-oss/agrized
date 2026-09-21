// One offer's services: what each one costs, how often it is owed, who performs it, and what is late.
//
// THIS IS THE TABLE THE WHOLE MODULE EXISTS FOR. projects.service_option_ids already tells the visitor which
// services an offer offers — «names only, no price», as its own column comment says. Report v3 §36 adds the
// Price, the Frequency and the Provider, and this is where they are set and read.
//
// THE ONE ANNUAL FIGURE. A service marked «داخل الباقة السنوية» shows no price of its own, because it has
// none: its price IS the annual fee printed at the head of the card — the same «معاليم الصيانة والتقليم في
// العام» the visitor reads on the offer page, and the same figure a subscription freezes. The database
// enforces it (a package row must carry zero), and this card states it in words so nobody goes looking for a
// second number.

import { ActionForm } from "@/components/admin/action-form";
import { DataList, DataRow, EmptyState, FormField, SectionHeader, StatusPill } from "@/components/ui";
import type { OptionItem } from "@/lib/config";
import { formatDate, formatMillimes } from "@/lib/format";

import { basisLabel, type OfferServices } from "./agri-model";
import { saveOfferService } from "./actions";

export type OfferServicesCardProps = {
  offer: OfferServices;
  /** The ten §36 names plus سماد and مداواة — the offer's own card decides which of them it advertises. */
  frequencies: OptionItem[];
  providers: OptionItem[];
  /** Finance and Admin. Everyone else reads the tariff and cannot change it (report v3 §53). */
  canPrice: boolean;
  /** From settings: what to say when the offer's card advertises nothing at all. */
  emptyNote: string;
  reasonHint: string;
};

export function OfferServicesCard({
  offer,
  frequencies,
  providers,
  canPrice,
  emptyNote,
  reasonHint,
}: OfferServicesCardProps) {
  const overdue = offer.services.filter((service) => service.isOverdue).length;

  return (
    <section className="card p-5 space-y-4">
      <SectionHeader
        level={3}
        title={offer.projectName}
        description={`${offer.projectCode} · ${offer.declaresServices} خدمة في بطاقة العرض`}
        badge={overdue > 0 ? <StatusPill tone="attention">{`${overdue} تأخّرت`}</StatusPill> : null}
      />

      <DataList variant="grid" columns={2}>
        <DataRow layout="stacked" label="معاليم الصيانة والتقليم في العام">
          {offer.annualFeePerTreeMillimes === null
            ? "غير محدّدة"
            : `${formatMillimes(offer.annualFeePerTreeMillimes)} للزيتونة`}
        </DataRow>
        <DataRow layout="stacked" label="الخدمات المسعّرة" numeric>
          {offer.services.filter((service) => service.terms.ok).length}
        </DataRow>
      </DataList>

      {offer.services.length === 0 ? (
        <EmptyState size="sm">{emptyNote}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {offer.services.map((service) => {
            const { terms } = service;
            return (
              <li key={service.serviceOptionId} className="panel p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{service.labelAr}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {terms.ok && terms.inAnnualPackage ? (
                      <StatusPill tone="brand">داخل الباقة السنوية</StatusPill>
                    ) : null}
                    {terms.ok && !terms.inAnnualPackage ? (
                      <StatusPill tone="info">
                        {`${formatMillimes(terms.amountMillimes)} ${basisLabel(terms.basis)}`}
                      </StatusPill>
                    ) : null}
                    {!terms.ok ? <StatusPill tone="warning">بلا ثمن</StatusPill> : null}
                    {service.isOverdue ? <StatusPill tone="attention">تأخّرت</StatusPill> : null}
                  </span>
                </div>

                <DataList variant="grid" columns={3} className="text-sm">
                  <DataRow layout="stacked" size="sm" label="الدورية" numeric={false}>
                    {terms.frequencyLabel ?? "عند الحاجة"}
                  </DataRow>
                  <DataRow layout="stacked" size="sm" label="المنفّذ" numeric={false}>
                    {terms.providerLabel ?? "ما تحدّدش"}
                  </DataRow>
                  <DataRow layout="stacked" size="sm" label="آخر مرة تعملت" numeric={false}>
                    {service.lastDoneOn ? formatDate(service.lastDoneOn) : "ما تعملتش بعد"}
                  </DataRow>
                  <DataRow layout="stacked" size="sm" label="الموعد الجاي" numeric={false}>
                    {service.nextDueOn ? formatDate(service.nextDueOn) : "ما فماش موعد"}
                  </DataRow>
                  <DataRow layout="stacked" size="sm" label="مرّات الإنجاز">
                    {service.operationsDone}
                  </DataRow>
                  <DataRow layout="stacked" size="sm" label="مبرمجة وفات وقتها">
                    {service.plannedLate}
                  </DataRow>
                </DataList>

                {terms.ok && terms.source === "global" ? (
                  <p className="text-xs text-muted">
                    هذا الثمن جاي من التسعير العام. حطّ ثمناً خاصاً بهذا العرض إذا الخدمة تختلف فيه.
                  </p>
                ) : null}

                {canPrice ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-forest">تعديل شروط الخدمة</summary>
                    <div className="mt-3">
                      <ActionForm
                        action={saveOfferService.bind(null, offer.projectId)}
                        submitLabel="حفظ الشروط"
                        className="space-y-3"
                      >
                        <input type="hidden" name="service_option_id" value={service.serviceOptionId} />
                        {terms.termsId && terms.source === "project" ? (
                          <input type="hidden" name="id" value={terms.termsId} />
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <FormField label="كيفاش يتحسب" size="sm">
                            <select name="basis" defaultValue={terms.basis ?? "per_tree"} className="field field-sm">
                              <option value="per_tree">للزيتونة</option>
                              <option value="per_season">للموسم</option>
                              <option value="per_operation">للمرة</option>
                            </select>
                          </FormField>

                          <FormField
                            label="الثمن (دينار)"
                            size="sm"
                            hint="خلّيه صفر كان الخدمة داخل الباقة: ثمنها هو المعاليم السنوية."
                          >
                            <input
                              name="amount_millimes"
                              inputMode="decimal"
                              dir="ltr"
                              defaultValue={terms.amountMillimes ? (terms.amountMillimes / 1000).toFixed(3) : ""}
                              placeholder="0.000"
                              className="field field-sm"
                            />
                          </FormField>

                          <FormField label="الدورية" size="sm">
                            <select
                              name="frequency_option_id"
                              defaultValue=""
                              className="field field-sm"
                            >
                              <option value="">عند الحاجة</option>
                              {frequencies.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label_ar}
                                </option>
                              ))}
                            </select>
                          </FormField>

                          <FormField label="المنفّذ" size="sm">
                            <select name="provider_option_id" defaultValue="" className="field field-sm">
                              <option value="">بلا تحديد</option>
                              {providers.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label_ar}
                                </option>
                              ))}
                            </select>
                          </FormField>
                        </div>

                        <label className="choice">
                          <input
                            type="checkbox"
                            name="in_annual_package"
                            defaultChecked={terms.inAnnualPackage}
                          />
                          <span>
                            داخل الباقة السنوية — الحريف يخلّصها مع المعاليم السنوية وما عندهاش ثمن مستقل.
                          </span>
                        </label>

                        <FormField label="سبب التغيير" size="sm" hint={reasonHint}>
                          <input name="reason" maxLength={1000} className="field field-sm" />
                        </FormField>
                      </ActionForm>
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
