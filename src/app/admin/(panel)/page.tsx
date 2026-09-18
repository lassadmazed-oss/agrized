import type { Metadata } from "next";
import Link from "next/link";

import { BarList, ChartCard, DailyColumns } from "@/components/admin/charts";
import { StatTile } from "@/components/ui";
import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, LAND_OFFER_ROLES, requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { daysAgo, RANGES, resolveRange, type DemandStats } from "./analytics/demand-stats";

export const metadata: Metadata = { title: "لوحة القيادة" };

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const session = await requireStaff();
  const params = await searchParams;
  const canSeeCrm = hasRole(session, CRM_READ_ROLES);
  const canSeeLand = hasRole(session, LAND_OFFER_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const ownFilesOnly = hasRole(session, ["commercial"]) && !hasRole(session, ["admin", "super_admin", "finance", "legal"]);

  const { range, from: rangeFrom, today } = resolveRange(params.range);

  const supabase = await createClient();
  const endOfToday = new Date(`${today}T23:59:59+01:00`).toISOString();

  const [overall, ranged, unassigned, newFiles, followUps, landUnderStudy] = await Promise.all([
    canSeeCrm ? supabase.rpc("crm_demand_stats", {}) : null,
    canSeeCrm && rangeFrom ? supabase.rpc("crm_demand_stats", { p_from: rangeFrom }) : null,
    isAdmin ? supabase.from("persons").select("id", { count: "exact", head: true }).is("assigned_to", null) : null,
    canSeeCrm
      ? supabase.from("persons").select("id, lead_statuses!inner(stage)", { count: "exact", head: true }).eq("lead_statuses.stage", "new")
      : null,
    hasRole(session, ["commercial", "admin", "super_admin"])
      ? supabase
          .from("contact_attempts")
          .select("id", { count: "exact", head: true })
          .eq("created_by", session.id)
          .lte("next_follow_up_at", endOfToday)
          .gte("next_follow_up_at", `${daysAgo(today, 14)}T00:00:00+01:00`)
      : null,
    canSeeLand ? supabase.from("land_offers").select("id", { count: "exact", head: true }).eq("status", "under_study") : null,
  ]);

  const stats = (overall?.data ?? null) as DemandStats | null;
  const breakdown = ((ranged?.data ?? overall?.data) ?? null) as DemandStats | null;
  const analyticsHref = range.key === "all" ? "/admin/analytics" : `/admin/analytics?range=${range.key}`;

  const attention = [
    isAdmin ? { label: "ملفات بدون مسؤول", value: unassigned?.count ?? 0, href: "/admin/leads?assigned_to=none" } : null,
    canSeeCrm ? { label: "ملفات جديدة لم يُتصل بها", value: newFiles?.count ?? 0, href: "/admin/leads" } : null,
    followUps ? { label: "متابعاتي المستحقة", value: followUps.count ?? 0, href: "/admin/leads" } : null,
    canSeeLand ? { label: "عروض أراضي قيد الدراسة", value: landUnderStudy?.count ?? 0, href: "/admin/land-offers" } : null,
  ].filter((item): item is { label: string; value: number; href: string } => item !== null);

  return (
    <div className="space-y-8">
      {params.denied ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          لا تملك صلاحية الوصول إلى تلك الصفحة.
        </p>
      ) : null}

      <header>
        <h1 className="section-title">لوحة القيادة</h1>
        <p className="mt-1 text-muted">
          مرحباً {session.fullName || ""}.{ownFilesOnly ? " الأرقام تخص الملفات المسندة إليك." : ""}
        </p>
      </header>

      {attention.length > 0 ? (
        <section aria-labelledby="attention" className="space-y-3">
          <h2 id="attention" className="text-lg font-semibold">
            ما يحتاج تدخلاً
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {attention.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`card flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:border-forest ${
                    item.value > 0 ? "border-gold/40" : "border-line"
                  }`}
                >
                  <span className="text-sm text-ink">{item.label}</span>
                  <span className={`text-2xl font-semibold ${item.value > 0 ? "text-forest" : "text-muted"}`}>{formatCount(item.value)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats ? (
        <>
          {/* §46: Total Leads and Olive trees requested lead the dashboard. */}
          <section aria-label="الأرقام الأساسية" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatTile label="مطالب الاستثمار" value={stats.requests} note={`${formatCount(stats.duplicates)} منها مكرّرة`} />
            <StatTile label="زيتونات مطلوبة" value={stats.trees_total} note="الحد الأدنى لكل اختيار، دون المطالب المكرّرة" />
            <StatTile label="أشخاص" value={stats.persons} note="رقم هاتف واحد لكل شخص" />
            <StatTile label="اليوم" value={stats.today} />
            <StatTile label="آخر 7 أيام" value={stats.last_7_days} />
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold">المطالب اليومية</h2>
            <p className="mb-5 text-sm text-muted">آخر 30 يوماً</p>
            <DailyColumns days={stats.daily} />
          </section>

          {breakdown ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">تحليل الطلب</h2>
                <nav aria-label="الفترة" className="card flex flex-wrap gap-1 rounded-xl p-1">
                  {RANGES.map((option) => (
                    <Link
                      key={option.key}
                      href={option.key === "all" ? "/admin" : `/admin?range=${option.key}`}
                      aria-current={option.key === range.key ? "page" : undefined}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        option.key === range.key ? "bg-forest font-semibold text-paper" : "text-muted hover:bg-paper hover:text-ink"
                      }`}
                    >
                      {option.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <p className="text-sm text-muted">
                {formatCount(breakdown.requests)} مطلب و{formatCount(breakdown.trees_total)} زيتونة مطلوبة في هذه الفترة. الأرقام أدناه تخص
                الفترة المختارة.
              </p>

              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard title="عدد الزيتونات المطلوبة" subtitle="عدد المطالب حسب اختيار عدد الزيتونات.">
                  <BarList
                    items={breakdown.by_tree_count.map((bucket) => ({ key: bucket.code ?? "none", label: bucket.label, count: bucket.count }))}
                    total={breakdown.requests}
                  />
                </ChartCard>
                <ChartCard
                  title="الزيتونات المطلوبة حسب ولاية الاستثمار"
                  subtitle={`${formatCount(breakdown.anywhere_trees)} زيتونة في مطالب «المكان غير مهم» غير محسوبة في الولايات.`}
                >
                  <BarList
                    items={breakdown.by_governorate_trees
                      .filter((g) => g.trees > 0)
                      .slice(0, 8)
                      .map((g) => ({ key: String(g.id), label: g.name, count: g.trees }))}
                    emptyText="لا توجد زيتونات مطلوبة في ولاية محددة في هذه الفترة."
                  />
                  <Link href={analyticsHref} className="mt-4 inline-block text-sm font-semibold text-forest underline-offset-4 hover:underline">
                    خريطة الطلب وكل الولايات ←
                  </Link>
                </ChartCard>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard
                  title="الطلب حسب ولاية الاستثمار"
                  subtitle={`${formatCount(breakdown.anywhere)} مطلب اختار «المكان غير مهم» (غير محسوب في الولايات).`}
                >
                  <BarList
                    items={breakdown.by_invest_governorate.map((g) => ({ key: String(g.id), label: g.name, count: g.count }))}
                    emptyText="لا توجد مطالب في هذه الفترة."
                  />
                </ChartCard>

                <div className="space-y-4">
                  <ChartCard title="شنوّة يحبوا يملكوا" subtitle={`${formatCount(breakdown.unsure_type)} مطلب «ما يهمنيش النوع».`}>
                    <BarList
                      items={breakdown.by_scenario.map((s) => ({ key: s.id, label: s.name, count: s.count }))}
                      total={breakdown.requests}
                    />
                  </ChartCard>
                  <ChartCard title="المساحة المطلوبة" subtitle="المساحة لا تحدد عدد الزيتونات ولا السعر.">
                    <BarList
                      items={breakdown.by_desired_area.map((a) => ({ key: a.label, label: a.label, count: a.count }))}
                      total={breakdown.requests}
                    />
                  </ChartCard>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ChartCard title="الأهم بالنسبة للحرفاء">
                      <BarList
                        items={breakdown.by_priority.map((p) => ({ key: p.label, label: p.label, count: p.count }))}
                        total={breakdown.requests}
                      />
                    </ChartCard>
                    <ChartCard title="نظام الغراسة">
                      <BarList
                        items={breakdown.by_plantation_system.map((p) => ({ key: p.code, label: p.name, count: p.count }))}
                        total={breakdown.requests}
                      />
                    </ChartCard>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard title="نوع المشروع (مشتق من الاختيار)">
                  <BarList items={breakdown.by_project_type.map((t) => ({ key: t.id, label: t.name, count: t.count }))} />
                </ChartCard>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChartCard title="التسبقة">
                    <BarList
                      items={breakdown.by_down_payment.map((d) => ({ key: d.label, label: d.label, count: d.count }))}
                      total={breakdown.requests}
                    />
                  </ChartCard>
                  <ChartCard title="القسط الشهري">
                    <BarList
                      items={breakdown.by_installment.map((d) => ({ key: d.label, label: d.label, count: d.count }))}
                      total={breakdown.requests}
                    />
                  </ChartCard>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ChartCard title="الهدف">
                  <BarList items={breakdown.by_goal.map((g) => ({ key: g.label, label: g.label, count: g.count }))} total={breakdown.requests} />
                </ChartCard>
                <ChartCard title="المصدر">
                  <BarList
                    items={breakdown.by_source.slice(0, 8).map((s) => ({ key: s.source, label: s.source === "direct" ? "مباشر" : s.source, count: s.count }))}
                    total={breakdown.requests}
                  />
                </ChartCard>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="card p-6 text-muted">
          لوحة القيادة لدورك ستُكمَّل مع تفعيل موديولات المراحل القادمة.
        </p>
      )}
    </div>
  );
}
