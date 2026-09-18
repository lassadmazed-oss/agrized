import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { treePricingReady } from "@/components/admin/legacy-pricing-notice";
import { DataRow, EmptyState, StatusPill } from "@/components/ui";
import { hasRole, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig, settingText } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatArea, formatCount, formatDateTime, formatMillimes } from "@/lib/format";
import { IRRIGATION_LABELS } from "@/lib/land";
import { formatPhone } from "@/lib/phone";
import { getStaffParcelPrices, PARCEL_PRICE_REASONS } from "@/lib/parcel-prices";
import { describePricing } from "@/lib/pricing-form";
import {
  PLAN_REASON_LABELS,
  PROPERTY_TYPE_LABELS,
  parcelStatusLabel,
  parcelStatusTone,
  type ParcelOffer,
  type PlanOption,
} from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

import { saveParcel } from "../../../actions";
import { ParcelFields } from "../../page";

export const metadata: Metadata = { title: "قطعة" };

const WRITE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MatchRow = {
  request_id: string;
  request_no: string;
  person_id: string;
  full_name: string;
  phone_e164: string;
  created_at: string;
  score: number;
  breakdown: Record<string, number>;
};

const BREAKDOWN_LABELS: Record<string, string> = {
  location: "الولاية",
  project_type: "نوع المشروع",
  plantation: "الغراسة",
  area: "المساحة",
  down_payment: "التسبقة",
  installment: "القسط",
  priority_bonus: "الأولوية",
};

export default async function ParcelPage({ params, searchParams }: PageProps<"/admin/projects/[id]/parcels/[parcelId]">) {
  const session = await requireStaff();
  const { id, parcelId } = await params;
  if (!UUID.test(id) || !UUID.test(parcelId)) notFound();

  const canWrite = hasRole(session, WRITE_ROLES);
  const supabase = await createClient();
  const config = await getPublicConfig();

  const [{ data: parcel }, { data: defaultSetting }] = await Promise.all([
    supabase.from("parcels").select("*, project:projects(id, code, name, pricing)").eq("id", parcelId).maybeSingle(),
    supabase.from("settings").select("value").eq("key", "pricing.default").maybeSingle(),
  ]);
  if (!parcel || parcel.project_id !== id) notFound();
  // What this parcel uses without a formula of its own: its project's, else the default (app.parcel_pricing).
  const projectLines = describePricing(parcel.project?.pricing);
  const pricingInherit = {
    label: "نفس صيغة المشروع",
    hint: projectLines.length > 0 ? "الصيغة المضبوطة في بيانات المشروع." : "المشروع يستعمل الصيغة الافتراضية من الإعدادات.",
    lines: projectLines.length > 0 ? projectLines : describePricing(defaultSetting?.value),
  };

  // Plan P5-3: a parcel of a tree-priced project is priced from its trees (app.parcel_price), not by the 0020 matrix.
  const treePrice = (await getStaffParcelPrices(supabase, id)).get(parcelId) ?? null;
  const onTree = treePrice?.on_tree_pricing === true;
  const { data: classRows } = await supabase
    .from("project_spacing_classes")
    .select("spacing:tree_spacing_classes(id, label_ar, area_m2)")
    .eq("project_id", id);
  const treeClasses = (classRows ?? []).flatMap((row) => (row.spacing ? [row.spacing] : []));

  // One call builds the card in Postgres with the formula the public page uses (0020), whatever the
  // parcel's status, so staff always see the numbers a visitor would. Choices are option ids only.
  const query = await searchParams;
  const pick = (value: string | string[] | undefined) => (typeof value === "string" && UUID.test(value) ? value : undefined);
  const chosenDown = pick(query.down);
  const chosenInstallment = pick(query.installment);
  const choice = chosenDown && chosenInstallment ? { p_down_option: chosenDown, p_installment_option: chosenInstallment } : {};

  let { data: offerData, error: offerError } = await supabase.rpc("staff_parcel_offer", { p_parcel: parcelId, ...choice });
  if (offerError && Object.keys(choice).length > 0) {
    // An option retired since the link was made: show the card without the choice.
    ({ data: offerData, error: offerError } = await supabase.rpc("staff_parcel_offer", { p_parcel: parcelId }));
  }
  const offer = (offerData ?? null) as unknown as ParcelOffer | null;
  const entry = offer?.entry ?? null;
  const chosen = offer?.chosen ?? null;
  const downOptions = offer?.down_options ?? [];
  const installmentOptions = offer?.installment_options ?? [];
  const labelOf = (list: PlanOption[], optionId: string | null | undefined) => list.find((option) => option.id === optionId)?.label_ar;

  const { data: matches, error: matchError } = await supabase.rpc("match_requests_for_parcel", { p_parcel: parcelId, p_limit: 25 });
  const matchRows = (matches ?? []) as unknown as MatchRow[];

  return (
    <div className="space-y-6">
      <Link href={`/admin/projects/${id}`} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
        → {parcel.project?.name ?? "المشروع"}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Offer card exactly as the client will read it (clause 25.6) */}
        <aside className="space-y-3">
          <h2 className="text-lg font-semibold">بطاقة العرض</h2>
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-2xl font-bold text-forest">القطعة {parcel.code}</p>
              <StatusPill toneClass={parcelStatusTone(parcel.status)}>{parcelStatusLabel(parcel.status)}</StatusPill>
            </div>
            <dl className="mt-4 divide-y divide-line text-sm">
              <DataRow label="المساحة">{formatCount(Number(parcel.area_m2))} م²</DataRow>
              <DataRow label="نوع العقار">{PROPERTY_TYPE_LABELS[parcel.property_type] ?? parcel.property_type}</DataRow>
              <DataRow label="نوع الغراسة">
                {parcel.plantation_system ? (PLANTATION_LABELS[parcel.plantation_system] ?? parcel.plantation_system) : "—"}
              </DataRow>
              <DataRow label="عدد الزيتونات">{parcel.olive_tree_count ?? "—"}</DataRow>
              <DataRow label="عمر الزيتونات">{parcel.tree_age_years ? `${parcel.tree_age_years} سنوات` : "—"}</DataRow>
              <DataRow label="حالة الإنتاج">
                {parcel.production_status ? (PRODUCTION_LABELS[parcel.production_status] ?? parcel.production_status) : "—"}
              </DataRow>
              <DataRow label="الري">{parcel.irrigation ? (IRRIGATION_LABELS as Record<string, string>)[parcel.irrigation] : "—"}</DataRow>
              {onTree && treePrice ? (
                <>
                  <DataRow label="مساحة كل زيتونة">{treePrice.area_per_tree_m2 ? formatArea(treePrice.area_per_tree_m2) : "—"}</DataRow>
                  <DataRow label="المساحة الجملية">{treePrice.total_area_m2 ? formatArea(treePrice.total_area_m2) : "—"}</DataRow>
                  <DataRow label="السعر للزيتونة">
                    {treePrice.price_per_tree_millimes ? formatMillimes(treePrice.price_per_tree_millimes) : "—"}
                  </DataRow>
                  <DataRow label="السعر الجملي">
                    {treePrice.cash_total_millimes
                      ? formatMillimes(treePrice.cash_total_millimes)
                      : ((treePrice.reason && PARCEL_PRICE_REASONS[treePrice.reason]) ?? "السعر ما تحسبش.")}
                  </DataRow>
                </>
              ) : (
                <>
                  <DataRow label="السعر حاضر">
                    {parcel.cash_price_millimes > 0 ? formatMillimes(parcel.cash_price_millimes) : settingText(config, "projects.price_pending", "السعر يُعلن لاحقاً.")}
                  </DataRow>
                  <DataRow label="التسبقة">{offer?.down_from_millimes ? `من ${formatMillimes(offer.down_from_millimes)}` : "—"}</DataRow>
                  <DataRow label="القسط">
                    {entry?.ok && entry.months
                      ? `من ${formatMillimes(entry.installment_millimes)} في الشهر · ${formatCount(entry.months)} شهراً`
                      : "غير متاح بالقيم الحالية"}
                  </DataRow>
                </>
              )}
              <DataRow label="المصاريف السنوية التقديرية">
                {parcel.annual_costs_millimes !== null ? formatMillimes(parcel.annual_costs_millimes) : "—"}
              </DataRow>
            </dl>
            <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-xs leading-6 text-muted">
              {settingText(config, "legal.parcel_card_note")}
            </p>
            <p className="mt-2 text-xs leading-6 text-muted">{settingText(config, "legal.no_guarantee_notice")}</p>
          </div>
          {offerError ? (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">تعذّر حساب العرض: {offerError.message}</p>
          ) : null}
        </aside>

        <div className="space-y-6">
          {onTree ? (
            <section className="card p-5">
              <h2 className="font-semibold">التسعير بالزيتونة</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                هذه القطعة من مشروع يتباع بالزيتونة: المساحة والسعر يتحسبو من عدد الزيتونات وفئة المساحة. التسبقة والمدة والقسط
                الشهري، والتفاصيل الداخلية (الأرض، الغراسة، المصاريف، الهامش)، تلقاهم في محاكي صفحة التسعير.
              </p>
              <Link href={`/admin/pricing?project=${id}`} className="btn btn-secondary mt-4">
                محاكي التسعير لهذا المشروع
              </Link>
            </section>
          ) : (
          /* Installment simulator of legacy parcels, using the same server function as contracts will (SIM-06) */
          <section className="card p-5">
            <h2 className="font-semibold">محاكي التقسيط</h2>
            <p className="mt-1 text-sm text-muted">نفس دالة الحساب المستعملة في الموقع والحجز والعقود وجدول الأقساط.</p>
            <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block space-y-1">
                <span className="block text-xs text-muted">التسبقة</span>
                <select name="down" defaultValue={chosen?.down_option_id ?? downOptions[0]?.id ?? ""} className="field field-sm">
                  {downOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label_ar}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="block text-xs text-muted">القسط الشهري</span>
                <select
                  name="installment"
                  defaultValue={chosen?.installment_option_id ?? entry?.installment_option_id ?? installmentOptions[0]?.id ?? ""}
                  className="field field-sm"
                >
                  {installmentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label_ar}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-secondary btn-sm">
                احسب
              </button>
            </form>

            {chosen ? (
              chosen.ok && chosen.months ? (
                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <DataRow layout="stacked" size="lg" label="عدد الأشهر">{formatCount(chosen.months)}</DataRow>
                  <DataRow layout="stacked" size="lg" label="السعر الجملي">{formatMillimes(chosen.total_millimes ?? 0)}</DataRow>
                  <DataRow layout="stacked" size="lg" label="آخر قسط">{formatMillimes(chosen.last_installment_millimes ?? 0)}</DataRow>
                  <DataRow layout="stacked" size="lg" label="الفارق عن الحاضر">{formatMillimes((chosen.total_millimes ?? 0) - parcel.cash_price_millimes)}</DataRow>
                </dl>
              ) : (
                <p className="mt-4 rounded-xl bg-gold-soft px-4 py-3 text-sm text-forest-700">
                  {(chosen.reason && PLAN_REASON_LABELS[chosen.reason]) ?? "لا يمكن حساب خطة بهذه القيم."}
                  {chosen.min_installment_millimes ? ` أقل قسط ممكن: ${formatMillimes(chosen.min_installment_millimes)}.` : ""}
                  {chosen.min_down_millimes ? ` أقل تسبقة ممكنة: ${formatMillimes(chosen.min_down_millimes)}.` : ""}
                  {labelOf(installmentOptions, chosen.nearest_installment_option_id)
                    ? ` أقرب قسط ممكن بهذه التسبقة: ${labelOf(installmentOptions, chosen.nearest_installment_option_id)}.`
                    : ""}
                  {labelOf(downOptions, chosen.nearest_down_option_id)
                    ? ` أقرب تسبقة ممكنة بهذا القسط: ${labelOf(downOptions, chosen.nearest_down_option_id)}.`
                    : ""}
                </p>
              )
            ) : null}
          </section>
          )}

          {/* Matching (8.3 / 25.5) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">الحرفاء الأقرب لهذه القطعة</h2>
              <p className="text-sm text-muted">النتيجة أداة ترتيب داخلية، لا تُعرض للحريف.</p>
            </div>
            {matchError ? (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">تعذّر حساب المطابقة: {matchError.message}</p>
            ) : matchRows.length === 0 ? (
              <EmptyState>لا يوجد حرفاء مطابقون بالحد الأدنى الحالي للنتيجة.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {matchRows.map((match) => (
                  <li key={match.request_id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/admin/leads/${match.person_id}`} className="font-semibold text-forest underline-offset-4 hover:underline">
                          {match.full_name}
                        </Link>
                        <p dir="ltr" className="text-end text-sm text-muted tabular-nums sm:text-start">
                          {formatPhone(match.phone_e164)} · {match.request_no}
                        </p>
                        <p className="text-xs text-muted tabular-nums">مسجّل منذ {formatDateTime(match.created_at)}</p>
                      </div>
                      <p className="text-3xl font-semibold text-forest tabular-nums">{Math.round(match.score)}%</p>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {Object.entries(match.breakdown)
                        .filter(([, value]) => Number(value) > 0)
                        .map(([key, value]) => (
                          <li
                            key={key}
                            className="rounded-full bg-leaf-soft px-2.5 py-1 text-xs font-medium text-forest tabular-nums"
                          >
                            {BREAKDOWN_LABELS[key] ?? key} +{Math.round(Number(value))}
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canWrite ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">تعديل القطعة</h2>
              <div className="card p-5">
                <ActionForm
                  action={saveParcel.bind(null, id, parcelId)}
                  submitLabel="حفظ القطعة"
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                  buttonClassName="btn btn-secondary sm:col-span-2 lg:col-span-4 lg:w-48"
                >
                  <ParcelFields
                    parcel={parcel}
                    pricingInherit={pricingInherit}
                    legacyNoticeHref={treePricingReady(config) ? `/admin/pricing?project=${id}` : null}
                    treeClasses={treeClasses}
                    computed={treePrice}
                  />
                </ActionForm>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
