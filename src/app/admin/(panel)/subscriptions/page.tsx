// الاشتراكات — «who pays for what this year, and who has not paid».
//
// Cahier v2 §40 (الاشتراك السنوي) and report v3 §36 (Status · Payment) · §33 (الخدمات المطلوبة).
//
// THE ONE ANNUAL FIGURE, said on the screen because it is the rule the module rests on. The subscription
// amount is NOT a new price: it is the number of trees × «معاليم الصيانة والتقليم في العام», the same figure
// the offer page quotes the visitor and public.interest_requests already snapshots when they ask. It is
// frozen at signature and never re-read, because three different annual fees have already been quoted to
// three different people in three days — a subscription that recomputed from today's rule would bill one of
// them a number they were never shown, and the site's promise «بمقابل معلوم ومتّفق عليه قبل» would be false
// in writing. Every row therefore says where its figure came from.
//
// TWO COLUMNS, NOT ONE. «نشيط» and «مخلّص» are two independent facts and each carries its own pill. Folding
// them into one status would make either answerable only by reading a label.
//
// WHY IT OPENS WHILE THE MODULE IS OFF, and why the empty state is the normal state today: the same reasons
// as ../agri/page.tsx. Nothing here is computed — every amount, count and Arabic label arrives from Postgres.
//
// WHAT IS DELIBERATELY ABSENT: a receipt. public.payments (migration 0063, applied by the reservations team)
// is «the only receipt» by its own comment, so this screen records WHETHER anything is owed and never how
// much has been received. The day public.payments carries a subscription_id, «مخلّص» stops being a control
// here and becomes the sum of the receipts.

import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { DataList, DataRow, EmptyState, FormField, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { flagState, getPublicConfig, optionsFor, settingInt, settingText } from "@/lib/config";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import {
  basisLabel,
  FEE_SOURCE_LABELS,
  parseSubscriptionFilter,
  paymentTone,
  SUBSCRIPTION_FILTERS,
  SUBSCRIPTION_FILTER_LABELS,
  subscriptionTone,
} from "../agri/agri-model";
import { readSubscriptions } from "../agri/read";
import { requestSubscriptionService, setSubscriptionStatus } from "./actions";
import { SubscriptionForm } from "./subscription-form";

export const metadata: Metadata = { title: "الاشتراكات" };

const REASON_HINT = "اكتب علاش عملت هذا التغيير. يتسجّل في سجل العمليات معاك ومع الوقت.";

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SubscriptionsPage({ searchParams }: Search) {
  const session = await requireStaff(CRM_READ_ROLES);
  const params = await searchParams;
  const filter = parseSubscriptionFilter(params.filter);

  const supabase = await createClient();
  const [config, list] = await Promise.all([getPublicConfig(), readSubscriptions(supabase, filter)]);

  const state = flagState(config, "subscriptions");
  const canPrice = hasRole(session, PRICE_ROLES);
  // The same limit the reader uses, so the picker never offers more names than the list can hold.
  const limit = Math.min(Math.max(settingInt(config, "agri.list_limit", 100), 10), 500);

  const [offers, people, rules] = await Promise.all([
    supabase.from("projects").select("id, code, name, status, service_option_ids").order("code"),
    supabase
      .from("persons")
      .select("id, full_name, phone_e164")
      .is("archived_at", null)
      .order("full_name")
      .limit(limit),
    // The figure the offer page quotes today, shown beside the empty fee box so the writer knows what will be
    // frozen. The database resolves it again on write; this is a hint, never the value that is stored.
    supabase.from("tree_pricing_rules").select("project_id, annual_fee_per_tree_millimes").is("project_id", null),
  ]);

  const offerRows = (offers.data ?? []).filter((offer) => offer.status !== "archived");
  const globalFee = rules.data?.[0]?.annual_fee_per_tree_millimes ?? null;

  // «الخدمات المطلوبة» may only name a service the client's own offer advertises — the same rule the tariff
  // obeys (service_not_in_offer). The list is option_items(agrized_service); the offer's card picks from it.
  const allServices = optionsFor(config, "agrized_service");
  const offerServiceIds = new Map(offerRows.map((offer) => [offer.id, new Set(offer.service_option_ids ?? [])]));

  const emptyNote = settingText(
    config,
    "subscriptions.empty_note",
    "مازال ما فماش اشتراكات. الاشتراك يتعمل بعد ما الحريف يولّي صاحب زيتونات: يغطّي باقة الخدمات السنوية لموسم واحد.",
  );
  const packageNote = settingText(
    config,
    "subscriptions.package_note",
    "الاشتراك السنوي هو نفسو معاليم الصيانة والتقليم اللي تتعرض على الزائر في صفحة العرض. ما فماش مبلغ سنوي ثاني.",
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        as="h1"
        level={1}
        title="الاشتراكات"
        description="شكون يخلّص في شنوّة هذا الموسم، وشكون مازال ما خلّصش. المبلغ هو عدد الزيتونات × المعاليم السنوية كيما تفاهمنا عليها نهار الإمضاء."
        badge={list ? <StatusPill tone="line">{list.season.label}</StatusPill> : null}
      />

      {state === "disabled" ? (
        <p className="card p-cozy text-sm leading-6">
          <span className="font-semibold">الموديول معطّل.</span> الشاشة هاذي مفتوحة للفريق باش تحضّرها، أما تسجيل
          الاشتراكات وتحديث الخلاص موقّفين في قاعدة البيانات روحها. كي تكون جاهز، شغّلو من{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            الإعدادات ← الموديولات
          </Link>
          : «داخلي فقط» يخلّي الفريق يخدم بيه، و«منشور للعموم» يبان للزوّار.
        </p>
      ) : null}

      <p className="panel p-cozy text-sm leading-6 text-muted">{packageNote}</p>

      {list === null ? (
        <EmptyState title="الوحدة مازالت ما تركّبتش في قاعدة البيانات">
          جدول الاشتراكات مازال مسودّة. كي يتطبّق ملف الترحيل الخاص بيه، الشاشة هاذي تعمّر روحها بلا أي تبديل آخر.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={SUBSCRIPTION_FILTER_LABELS.unpaid}
              value={list.counts.unpaid}
              note="اشتراكات نشيطة مازالت ما تخلّصتش"
              href="/admin/subscriptions?filter=unpaid"
              emphasis={list.counts.unpaid > 0}
              quiet={list.counts.unpaid === 0}
            />
            <StatTile
              label={SUBSCRIPTION_FILTER_LABELS.active}
              value={list.counts.active}
              note={list.season.label}
              href="/admin/subscriptions?filter=active"
            />
            <StatTile
              label={SUBSCRIPTION_FILTER_LABELS.requested}
              value={list.counts.requested}
              note="خدمات طلبها الحرفاء ومازالت ما تسعّرتش"
              href="/admin/subscriptions?filter=requested"
            />
            <StatTile label="المبلغ المتبقّي" value={formatMillimes(list.dueMillimes)} note="من الاشتراكات النشيطة" />
          </div>

          <nav className="flex flex-wrap gap-2" aria-label="ترشيح الاشتراكات">
            {SUBSCRIPTION_FILTERS.map((key) => (
              <Link
                key={key}
                href={key === "all" ? "/admin/subscriptions" : `/admin/subscriptions?filter=${key}`}
                className={`pill ring-1 ring-inset ${
                  filter === key ? "bg-leaf-soft text-forest ring-leaf/30" : "pill-line ring-0"
                }`}
              >
                {SUBSCRIPTION_FILTER_LABELS[key]}
              </Link>
            ))}
          </nav>

          {list.rows.length === 0 ? (
            <EmptyState>{emptyNote}</EmptyState>
          ) : (
            <ul className="space-y-3">
              {list.rows.map((subscription) => (
                <li key={subscription.id} className="card p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">
                        <Link href={`/admin/leads/${subscription.personId}`} className="underline underline-offset-4">
                          {subscription.personName}
                        </Link>
                      </p>
                      <p className="text-sm text-muted">
                        {subscription.projectName} <span dir="ltr">({subscription.projectCode})</span> ·{" "}
                        {subscription.seasonLabel}
                      </p>
                    </div>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={subscriptionTone(subscription.status)}>
                        {subscription.statusLabel || subscription.status}
                      </StatusPill>
                      <StatusPill tone={paymentTone(subscription.paymentStatus)}>
                        {subscription.paymentLabel || subscription.paymentStatus}
                      </StatusPill>
                    </span>
                  </div>

                  <DataList variant="grid" columns={4} className="text-sm">
                    <DataRow layout="stacked" size="sm" label="الزيتونات">
                      {formatCount(subscription.treeCount)}
                    </DataRow>
                    <DataRow layout="stacked" size="sm" label="المعاليم للزيتونة">
                      {formatMillimes(subscription.feePerTreeMillimes)}
                    </DataRow>
                    <DataRow layout="stacked" size="sm" label="المجموع في العام">
                      {formatMillimes(subscription.totalMillimes)}
                    </DataRow>
                    <DataRow layout="stacked" size="sm" label="مصدر المبلغ" numeric={false}>
                      {FEE_SOURCE_LABELS[subscription.feeSource] ?? subscription.feeSource}
                    </DataRow>
                  </DataList>

                  {subscription.seasonStartsOn && subscription.seasonEndsOn ? (
                    <p className="text-xs text-muted">
                      من {formatDate(subscription.seasonStartsOn)} حتى {formatDate(subscription.seasonEndsOn)}
                    </p>
                  ) : null}

                  {subscription.lines.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {subscription.lines.map((line) => (
                        <li key={line.id}>
                          <StatusPill
                            tone={line.status === "requested" ? "warning" : line.inPackage ? "brand" : "info"}
                          >
                            {line.inPackage
                              ? line.labelAr
                              : `${line.labelAr} · ${formatMillimes(line.amountMillimes)} ${basisLabel(line.basis)}`}
                            {line.status === "requested" ? " · مطلوبة" : ""}
                          </StatusPill>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">ما فماش خدمات مسجّلة في هذه الباقة.</p>
                  )}

                  {subscription.note ? <p className="text-sm leading-6">{subscription.note}</p> : null}

                  {(() => {
                    // What this client could still ask for: what their offer advertises, minus what their
                    // package already carries. An empty list means there is nothing left to ask for.
                    const taken = new Set(subscription.lines.map((line) => line.serviceOptionId));
                    const offered = offerServiceIds.get(subscription.projectId);
                    const available = allServices.filter(
                      (service) => offered?.has(service.id) && !taken.has(service.id),
                    );
                    if (available.length === 0) return null;
                    return (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium text-forest">الحريف طلب خدمة زائدة</summary>
                        <div className="mt-3">
                          <ActionForm
                            action={requestSubscriptionService.bind(null, subscription.id)}
                            submitLabel="سجّل المطلب"
                            className="space-y-3"
                          >
                            <FormField
                              label="الخدمة المطلوبة"
                              size="sm"
                              hint="تتسجّل «مطلوبة» برك: التسعير والبرمجة يجيو بعد."
                            >
                              <select name="service_option_id" defaultValue="" required className="field field-sm">
                                <option value="">اختر الخدمة</option>
                                {available.map((service) => (
                                  <option key={service.id} value={service.id}>
                                    {service.label_ar}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            <FormField label="سبب التغيير" size="sm" hint={REASON_HINT}>
                              <input name="reason" maxLength={1000} className="field field-sm" />
                            </FormField>
                          </ActionForm>
                        </div>
                      </details>
                    );
                  })()}

                  {canPrice ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium text-forest">تحديث الحالة والخلاص</summary>
                      <div className="mt-3">
                        <ActionForm
                          action={setSubscriptionStatus.bind(null, subscription.id)}
                          submitLabel="حفظ"
                          className="space-y-3"
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <FormField label="حالة الاشتراك" size="sm">
                              <select name="status" defaultValue={subscription.status} className="field field-sm">
                                <option value="draft">مسوّدة</option>
                                <option value="active">نشيط</option>
                                <option value="declined">مرفوض</option>
                                <option value="ended">منتهي</option>
                                <option value="cancelled">ملغى</option>
                              </select>
                            </FormField>
                            <FormField
                              label="الخلاص"
                              size="sm"
                              hint="حقيقة مستقلة على الحالة. الوصولات الحقيقية تجي مع موديول الدفوعات."
                            >
                              <select
                                name="payment_status"
                                defaultValue={subscription.paymentStatus}
                                className="field field-sm"
                              >
                                <option value="unpaid">ما تخلّصش</option>
                                <option value="partial">خلاص جزئي</option>
                                <option value="paid">مخلّص</option>
                              </select>
                            </FormField>
                          </div>
                          <FormField label="سبب التغيير" size="sm" hint={REASON_HINT}>
                            <input name="reason" maxLength={1000} className="field field-sm" />
                          </FormField>
                        </ActionForm>
                      </div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canPrice ? (
            <section className="card p-5 space-y-4">
              <SectionHeader
                level={2}
                title="اشتراك جديد"
                description="الباقة تتقيّد بالخدمات اللي داخلها في هذا العرض، والمبلغ يتجمّد كيما هو اليوم."
              />
              <SubscriptionForm
                offers={offerRows.map((offer) => ({ id: offer.id, code: offer.code, name: offer.name }))}
                people={people.data ?? []}
                seasonLabel={list.season.label}
                annualFeeHint={globalFee}
                reasonHint={REASON_HINT}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
