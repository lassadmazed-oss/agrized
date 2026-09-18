import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { DataRow, EmptyState, StatusPill } from "@/components/ui";
import { ADMIN_ROLES, hasRole, LAND_OFFER_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { formatCount, formatDateTime, formatMillimes } from "@/lib/format";
import {
  CAPACITY_LABELS,
  FINAL_STATUSES,
  IRRIGATION_LABELS,
  LAND_STATUS_LABELS,
  LAND_STATUS_TONES,
  REVIEW_OUTCOME_LABELS,
  REVIEW_STAGES,
  type LandOfferStatus,
} from "@/lib/land";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { reviewLandOffer } from "./actions";

export const metadata: Metadata = { title: "عرض أرض" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Demand = { in_governorate: number; anywhere: number; by_project_type: { name: string; count: number }[] };

export default async function LandOfferDetailPage({ params }: PageProps<"/admin/land-offers/[id]">) {
  const session = await requireStaff(LAND_OFFER_ROLES);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const config = await getPublicConfig();

  const { data: offer } = await supabase.from("land_offers").select("*").eq("id", id).maybeSingle();
  if (!offer) notFound();

  const [files, reviews, demand] = await Promise.all([
    supabase.from("land_offer_files").select("id, file_name, mime_type, size_bytes, uploaded_at").eq("land_offer_id", id).order("uploaded_at"),
    supabase
      .from("land_offer_reviews")
      .select("id, stage, outcome, notes, created_at, reviewer:profiles!land_offer_reviews_reviewer_id_fkey(full_name)")
      .eq("land_offer_id", id)
      .order("created_at", { ascending: false }),
    supabase.rpc("demand_indicator", { p_governorate: offer.governorate_id }),
  ]);

  const isAdmin = hasRole(session, ADMIN_ROLES);
  const stageOptions: LandOfferStatus[] = isAdmin
    ? [...REVIEW_STAGES]
    : [
        ...(hasRole(session, ["legal"]) ? (["legal_review"] as const) : []),
        ...(hasRole(session, ["agri_manager"]) ? (["technical_review", "field_visit"] as const) : []),
      ];
  const nextOptions: LandOfferStatus[] = isAdmin ? [...REVIEW_STAGES, ...FINAL_STATUSES] : ["legal_review", "technical_review", "field_visit"];

  const governorate = config.governorates.find((g) => g.id === offer.governorate_id)?.name_ar;
  const delegation = config.delegations.find((d) => d.id === offer.delegation_id)?.name_ar;
  const documents = (offer.available_documents as { id: string; label_ar: string }[] | null) ?? [];
  const demandData = demand.data as Demand | null;

  return (
    <div className="space-y-6">
      <Link href="/admin/land-offers" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
        → عروض الأراضي
      </Link>

      <header className="card flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="section-title">{offer.property_type_label_ar}</h1>
            <StatusPill toneClass={LAND_STATUS_TONES[offer.status]}>{LAND_STATUS_LABELS[offer.status]}</StatusPill>
          </div>
          <p className="text-muted">
            {[delegation, governorate].filter(Boolean).join("، ")}
          </p>
          <p dir="ltr" className="text-end text-sm text-muted tabular-nums sm:text-start">
            {offer.reference_no} · {formatDateTime(offer.created_at)}
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold">
            {offer.contact_name} · {CAPACITY_LABELS[offer.contact_capacity]}
          </p>
          <a href={`tel:${offer.contact_phone_e164}`} dir="ltr" className="btn btn-primary">
            {formatPhone(offer.contact_phone_e164)}
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold">العقار</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <DataRow layout="stacked" numeric={false} label="المساحة">
                <span className="tabular-nums">{offer.area_value}</span> {offer.area_unit === "ha" ? "هكتار" : "م²"}
              </DataRow>
              <DataRow layout="stacked" numeric={false} label="عدد الزيتونات">{offer.olive_tree_count ?? "غير مذكور"}</DataRow>
              <DataRow layout="stacked" numeric={false} label="عمر الأشجار">{offer.tree_age_label_ar ?? "غير مذكور"}</DataRow>
              <DataRow layout="stacked" numeric={false} label="الري">
                {IRRIGATION_LABELS[offer.irrigation]}
                {offer.water_source ? ` · ${offer.water_source}` : ""}
              </DataRow>
              <DataRow layout="stacked" numeric={false} label="السعر المطلوب">
                {offer.asking_price_millimes !== null ? formatMillimes(offer.asking_price_millimes) : "غير محدد"}
                {offer.price_negotiable ? " · قابل للتفاوض" : ""}
              </DataRow>
              <DataRow layout="stacked" numeric={false} label="الموقع">
                {offer.latitude !== null && offer.longitude !== null ? (
                  <a
                    href={`https://www.google.com/maps?q=${offer.latitude},${offer.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-forest underline-offset-4 hover:underline"
                  >
                    فتح على الخريطة
                  </a>
                ) : (
                  "بدون إحداثيات"
                )}
              </DataRow>
              {offer.location_description ? (
                <div className="sm:col-span-2">
                  <DataRow layout="stacked" numeric={false} label="وصف المكان">{offer.location_description}</DataRow>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">الوثائق</h2>
            <p className="mt-2 text-sm">
              <span className="text-muted">مصرّح بها: </span>
              {documents.length ? documents.map((doc) => doc.label_ar).join("، ") : "لا شيء"}
            </p>
            {(files.data ?? []).length > 0 ? (
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {(files.data ?? []).map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span dir="auto" className="min-w-0 truncate">
                      {file.file_name}
                    </span>
                    <span className="flex flex-none items-center gap-3">
                      <span dir="ltr" className="text-xs text-muted tabular-nums">
                        {(file.size_bytes / (1024 * 1024)).toFixed(1)} MB
                      </span>
                      <a
                        href={`/admin/land-offers/${offer.id}/files/${file.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-forest underline-offset-4 hover:underline"
                      >
                        فتح
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">لم تُرفق ملفات.</p>
            )}
            <p className="mt-3 text-xs text-muted">فتح أي ملف يُسجَّل في سجل العمليات.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">سجل المراجعة</h2>
            {(reviews.data ?? []).length === 0 ? (
              <EmptyState>لم تبدأ المراجعة بعد.</EmptyState>
            ) : (
              <ol className="panel">
                {(reviews.data ?? []).map((review) => (
                  <li key={review.id} className="border-b border-line px-5 py-4 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">
                        {LAND_STATUS_LABELS[review.stage]} · {REVIEW_OUTCOME_LABELS[review.outcome as keyof typeof REVIEW_OUTCOME_LABELS]}
                      </p>
                      <p className="text-xs text-muted tabular-nums">
                        {formatDateTime(review.created_at)}
                        {review.reviewer?.full_name ? ` · ${review.reviewer.full_name}` : ""}
                      </p>
                    </div>
                    {review.notes ? <p className="mt-1 whitespace-pre-line text-sm text-muted">{review.notes}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {demandData ? (
            <section className="card p-4">
              <h2 className="font-semibold">الطلب في {governorate}</h2>
              <p className="mt-1 text-xs text-muted">عدد الأشخاص المسجّلين، دون بيانات شخصية.</p>
              <p className="mt-3 text-3xl font-semibold">{formatCount(demandData.in_governorate)}</p>
              <p className="text-sm text-muted">اختاروا هذه الولاية · و{formatCount(demandData.anywhere)} «المكان غير مهم»</p>
              <ul className="mt-3 space-y-1 text-sm">
                {demandData.by_project_type.map((type) => (
                  <li key={type.name} className="flex justify-between gap-3">
                    <span>{type.name}</span>
                    <span className="tabular-nums">{formatCount(type.count)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {stageOptions.length > 0 ? (
            <section className="card p-4">
              <h2 className="mb-3 font-semibold">تسجيل مراجعة</h2>
              <ActionForm action={reviewLandOffer.bind(null, offer.id)} submitLabel="تسجيل">
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">المرحلة</span>
                  <select name="stage" className="field" defaultValue={stageOptions.includes(offer.status) ? offer.status : stageOptions[0]}>
                    {stageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {LAND_STATUS_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">النتيجة</span>
                  <select name="outcome" className="field" defaultValue="note">
                    {Object.entries(REVIEW_OUTCOME_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea name="notes" rows={3} maxLength={5000} placeholder="الملاحظات" className="field min-h-24" />
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">تغيير الحالة (اختياري)</span>
                  <select name="next_status" className="field" defaultValue="">
                    <option value="">بدون تغيير</option>
                    {nextOptions
                      .filter((value) => value !== offer.status)
                      .map((value) => (
                        <option key={value} value={value}>
                          {LAND_STATUS_LABELS[value]}
                        </option>
                      ))}
                  </select>
                </label>
              </ActionForm>
            </section>
          ) : (
            <p className="card p-4 text-sm text-muted">اطلاع فقط: المراجعة من اختصاص Legal وAgricultural Manager وAdmin.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
