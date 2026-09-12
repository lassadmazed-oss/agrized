import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { hasRole, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig, optionsFor, settingText } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount, formatDateTime, formatMillimes } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import {
  PARCEL_STATUS_LABELS,
  PARCEL_STATUS_TONES,
  PLAN_REASON_LABELS,
  PROPERTY_TYPE_LABELS,
  type InstallmentPlan,
  type ParcelStatus,
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

  const { data: parcel } = await supabase.from("parcels").select("*, project:projects(id, code, name, pricing)").eq("id", parcelId).maybeSingle();
  if (!parcel || parcel.project_id !== id) notFound();

  const downOptions = optionsFor(config, "down_payment").filter((option) => option.min_millimes !== null);
  const installmentOptions = optionsFor(config, "monthly_installment").filter((option) => option.min_millimes !== null);

  // The entry point of the offer: the smallest down payment and installment that produce a valid plan.
  const query = await searchParams;
  const chosenDown = typeof query.down === "string" ? Number(query.down) : null;
  const chosenInstallment = typeof query.installment === "string" ? Number(query.installment) : null;

  const plans = await Promise.all(
    installmentOptions.map(async (option) => {
      const { data } = await supabase.rpc("compute_installment_plan", {
        p_cash_millimes: parcel.cash_price_millimes,
        p_down_millimes: downOptions[0]?.min_millimes ?? 0,
        p_installment_millimes: option.min_millimes ?? 0,
        p_pricing: (parcel.pricing ?? parcel.project?.pricing ?? {}) as never,
      });
      return { option, plan: data as unknown as InstallmentPlan };
    }),
  );
  const entry = plans.find((item) => item.plan?.ok);

  const selectedPlanResult =
    chosenDown && chosenInstallment
      ? ((
          await supabase.rpc("compute_installment_plan", {
            p_cash_millimes: parcel.cash_price_millimes,
            p_down_millimes: chosenDown,
            p_installment_millimes: chosenInstallment,
            p_pricing: (parcel.pricing ?? parcel.project?.pricing ?? {}) as never,
          })
        ).data as unknown as InstallmentPlan)
      : null;

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
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-2xl font-bold text-forest">القطعة {parcel.code}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${PARCEL_STATUS_TONES[parcel.status as ParcelStatus]}`}>
                {PARCEL_STATUS_LABELS[parcel.status as ParcelStatus]}
              </span>
            </div>
            <dl className="mt-4 divide-y divide-line text-sm">
              <Row label="المساحة">{formatCount(Number(parcel.area_m2))} م²</Row>
              <Row label="نوع العقار">{PROPERTY_TYPE_LABELS[parcel.property_type] ?? parcel.property_type}</Row>
              <Row label="نوع الغراسة">
                {parcel.plantation_system ? (PLANTATION_LABELS[parcel.plantation_system] ?? parcel.plantation_system) : "—"}
              </Row>
              <Row label="عدد الزيتونات">{parcel.olive_tree_count ?? "—"}</Row>
              <Row label="عمر الزيتونات">{parcel.tree_age_years ? `${parcel.tree_age_years} سنوات` : "—"}</Row>
              <Row label="الحالة">
                {parcel.production_status ? (PRODUCTION_LABELS[parcel.production_status] ?? parcel.production_status) : "—"}
              </Row>
              <Row label="الري">{parcel.irrigation === "irrigated" ? "مروي" : parcel.irrigation === "rainfed" ? "بعلي" : "—"}</Row>
              <Row label="السعر حاضر">{formatMillimes(parcel.cash_price_millimes)}</Row>
              <Row label="التسبقة">{downOptions[0]?.min_millimes ? `من ${formatMillimes(downOptions[0].min_millimes)}` : "—"}</Row>
              <Row label="القسط">
                {entry?.option.min_millimes
                  ? `من ${formatMillimes(entry.option.min_millimes)} في الشهر · ${formatCount((entry.plan as { months: number }).months)} شهراً`
                  : "غير متاح بالقيم الحالية"}
              </Row>
              <Row label="المصاريف السنوية التقديرية">
                {parcel.annual_costs_millimes !== null ? formatMillimes(parcel.annual_costs_millimes) : "—"}
              </Row>
            </dl>
            <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-xs leading-6 text-muted">
              {settingText(config, "legal.parcel_card_note")}
            </p>
            <p className="mt-2 text-xs leading-6 text-muted">{settingText(config, "legal.no_guarantee_notice")}</p>
          </div>
        </aside>

        <div className="space-y-6">
          {/* Installment simulator, using the same server function as contracts will (SIM-06) */}
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">محاكي التقسيط</h2>
            <p className="mt-1 text-sm text-muted">نفس دالة الحساب المستعملة في الحجز والعقود وجدول الأقساط.</p>
            <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block space-y-1">
                <span className="block text-xs text-muted">التسبقة</span>
                <select name="down" defaultValue={chosenDown ?? downOptions[0]?.min_millimes ?? ""} className="field min-h-11">
                  {downOptions.map((option) => (
                    <option key={option.id} value={option.min_millimes ?? ""}>
                      {option.label_ar}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="block text-xs text-muted">القسط الشهري</span>
                <select name="installment" defaultValue={chosenInstallment ?? entry?.option.min_millimes ?? ""} className="field min-h-11">
                  {installmentOptions.map((option) => (
                    <option key={option.id} value={option.min_millimes ?? ""}>
                      {option.label_ar}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-secondary min-h-11">
                احسب
              </button>
            </form>

            {selectedPlanResult ? (
              selectedPlanResult.ok ? (
                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="عدد الأشهر">{formatCount(selectedPlanResult.months)}</Fact>
                  <Fact label="السعر الجملي">{formatMillimes(selectedPlanResult.total_millimes)}</Fact>
                  <Fact label="آخر قسط">{formatMillimes(selectedPlanResult.last_installment_millimes)}</Fact>
                  <Fact label="الفارق عن الحاضر">{formatMillimes(selectedPlanResult.total_millimes - parcel.cash_price_millimes)}</Fact>
                </dl>
              ) : (
                <p className="mt-4 rounded-xl bg-gold-soft px-4 py-3 text-sm text-forest-700">
                  {PLAN_REASON_LABELS[selectedPlanResult.reason] ?? "لا يمكن حساب خطة بهذه القيم."}
                  {selectedPlanResult.min_installment_millimes
                    ? ` أقل قسط ممكن: ${formatMillimes(selectedPlanResult.min_installment_millimes)}.`
                    : ""}
                  {selectedPlanResult.min_down_millimes ? ` أقل تسبقة ممكنة: ${formatMillimes(selectedPlanResult.min_down_millimes)}.` : ""}
                </p>
              )
            ) : null}
          </section>

          {/* Matching (8.3 / 25.5) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">الحرفاء الأقرب لهذه القطعة</h2>
              <p className="text-sm text-muted">النتيجة أداة ترتيب داخلية، لا تُعرض للحريف.</p>
            </div>
            {matchError ? (
              <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">تعذّر حساب المطابقة: {matchError.message}</p>
            ) : matchRows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-muted">
                لا يوجد حرفاء مطابقون بالحد الأدنى الحالي للنتيجة.
              </p>
            ) : (
              <ul className="space-y-2">
                {matchRows.map((match) => (
                  <li key={match.request_id} className="rounded-2xl border border-line bg-surface p-4">
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
              <div className="rounded-2xl border border-line bg-surface p-5">
                <ActionForm
                  action={saveParcel.bind(null, id, parcelId)}
                  submitLabel="حفظ القطعة"
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                  buttonClassName="btn btn-secondary sm:col-span-2 lg:col-span-4 lg:w-48"
                >
                  <ParcelFields parcel={parcel} />
                </ActionForm>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
