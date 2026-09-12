import type { Metadata } from "next";
import Link from "next/link";

import { LAND_OFFER_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { formatCount, formatDateTime, formatMillimes } from "@/lib/format";
import { IRRIGATION_LABELS, LAND_STATUS_LABELS, LAND_STATUS_TONES, type LandOfferStatus } from "@/lib/land";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "عروض الأراضي" };

const PAGE_SIZE = 50;

export default async function LandOffersPage({ searchParams }: PageProps<"/admin/land-offers">) {
  await requireStaff(LAND_OFFER_ROLES);
  const params = await searchParams;
  const status = typeof params.status === "string" && params.status in LAND_STATUS_LABELS ? (params.status as LandOfferStatus) : undefined;
  const governorate = typeof params.governorate === "string" && /^\d{1,3}$/.test(params.governorate) ? Number(params.governorate) : undefined;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  const supabase = await createClient();
  const config = await getPublicConfig();

  let query = supabase
    .from("land_offers")
    .select(
      "id, reference_no, created_at, governorate_id, delegation_id, area_value, area_unit, property_type_label_ar, olive_tree_count, irrigation, asking_price_millimes, price_negotiable, contact_name, status, files:land_offer_files(count)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (governorate) query = query.eq("governorate_id", governorate);

  const { data: offers, count, error } = await query;
  if (error) throw new Error(error.message);

  const governorateName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const delegationName = new Map(config.delegations.map((d) => [d.id, d.name_ar]));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (governorate) query.set("governorate", String(governorate));
    query.set("page", String(target));
    return `/admin/land-offers?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-bold text-forest">عروض الأراضي</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          عروض أصحاب الأراضي والضيعات. لا يُنشر أي عرض، وكل عرض يمر بالمراجعة القانونية والفنية والميدانية.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">الحالة</span>
          <select name="status" defaultValue={status ?? ""} className="field min-w-44">
            <option value="">كل الحالات</option>
            {Object.entries(LAND_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">الولاية</span>
          <select name="governorate" defaultValue={governorate ?? ""} className="field min-w-44">
            <option value="">كل الولايات</option>
            {config.governorates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name_ar}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary">
          بحث
        </button>
        <Link href="/admin/land-offers" className="btn btn-ghost">
          مسح
        </Link>
      </form>

      <p className="text-sm text-muted">
        <span className="font-semibold text-ink">{formatCount(total)}</span> عرض
      </p>

      {(offers ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-muted">لا توجد عروض مطابقة.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {(offers ?? []).map((offer) => (
            <li key={offer.id}>
              <Link href={`/admin/land-offers/${offer.id}`} className="block h-full rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-forest">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {offer.property_type_label_ar} · {delegationName.get(offer.delegation_id)}، {governorateName.get(offer.governorate_id)}
                    </p>
                    <p dir="ltr" className="text-end text-xs text-muted tabular-nums sm:text-start">
                      {offer.reference_no} · {formatDateTime(offer.created_at)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${LAND_STATUS_TONES[offer.status]}`}>
                    {LAND_STATUS_LABELS[offer.status]}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  <Fact label="المساحة">
                    {offer.area_value} {offer.area_unit === "ha" ? "هكتار" : "م²"}
                  </Fact>
                  <Fact label="الزيتون">{offer.olive_tree_count ?? "—"}</Fact>
                  <Fact label="الري">{IRRIGATION_LABELS[offer.irrigation]}</Fact>
                  <Fact label="السعر">
                    {offer.asking_price_millimes !== null ? formatMillimes(offer.asking_price_millimes) : "غير محدد"}
                    {offer.price_negotiable ? " · قابل للتفاوض" : ""}
                  </Fact>
                </dl>
                <p className="mt-3 text-xs text-muted">
                  {offer.contact_name} · {offer.files[0]?.count ?? 0} ملفات
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav aria-label="الصفحات" className="flex items-center justify-between">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn btn-secondary">
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted tabular-nums">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="btn btn-secondary">
              التالي
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}
