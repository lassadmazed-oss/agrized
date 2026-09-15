import type { Metadata } from "next";
import Link from "next/link";

import { BarList, StatTile } from "@/components/admin/charts";
import { DemandMap, type MapTile } from "@/components/admin/demand-map";
import { CRM_READ_ROLES, hasRole, requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { RANGES, resolveRange, type DemandStats } from "./demand-stats";

export const metadata: Metadata = { title: "التحليلات وخريطة الطلب" };

const METRICS = [
  { key: "demands", label: "حسب الطلب" },
  { key: "trees", label: "حسب الزيتونات" },
] as const;

const MODES = [
  { key: "requests", label: "نعدّ المطالب" },
  { key: "people", label: "نعدّ الأشخاص" },
] as const;

type Metric = (typeof METRICS)[number]["key"];
type Mode = (typeof MODES)[number]["key"];

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Spec v2 §55 (Analytics, Demand map) and §47: «شنو أكثر ولاية مطلوبة؟». */
export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const params = await searchParams;
  const { range, from } = resolveRange(params.range);
  const metric: Metric = firstValue(params.color) === "trees" ? "trees" : "demands";
  const mode: Mode = firstValue(params.mode) === "people" ? "people" : "requests";
  const ownFilesOnly = hasRole(session, ["commercial"]) && !hasRole(session, ["admin", "super_admin", "finance", "legal"]);

  const supabase = await createClient();
  const [report, governorates] = await Promise.all([
    supabase.rpc("crm_demand_stats", { p_from: from ?? undefined, p_people: mode === "people" }),
    supabase.from("governorates").select("id, name_ar, map_row, map_col").eq("is_active", true).order("sort_order"),
  ]);
  if (report.error) throw new Error(`Demand report failed: ${report.error.message}`);
  if (governorates.error) throw new Error(`Governorates failed: ${governorates.error.message}`);
  const stats = report.data as DemandStats;

  const hrefFor = (next: { range?: string; color?: Metric; mode?: Mode }) => {
    const merged = { range: range.key as string, color: metric, mode, ...next };
    const query = new URLSearchParams();
    if (merged.range !== "all") query.set("range", merged.range);
    if (merged.color !== "demands") query.set("color", merged.color);
    if (merged.mode !== "requests") query.set("mode", merged.mode);
    const text = query.toString();
    return text ? `/admin/analytics?${text}` : "/admin/analytics";
  };
  const leadsHref = (governorateId: number) => {
    const query = new URLSearchParams({ invest_governorate_id: String(governorateId) });
    if (from) query.set("from", from);
    if (mode === "people") query.set("people", "1");
    return `/admin/leads?${query.toString()}`;
  };

  const countUnit = mode === "people" ? "شخص" : "مطلب";
  const figures = new Map(stats.by_invest_governorate.map((g) => [g.id, g]));
  const tiles: MapTile[] = (governorates.data ?? []).flatMap((g) => {
    if (g.map_row === null || g.map_col === null) return [];
    const demand = figures.get(g.id);
    const count = demand?.count ?? 0;
    const trees = demand?.trees ?? 0;
    return [
      {
        id: g.id,
        name: g.name_ar,
        row: g.map_row,
        col: g.map_col,
        value: metric === "trees" ? trees : count,
        secondary: metric === "trees" ? count : trees,
        href: leadsHref(g.id),
      },
    ];
  });
  const ranked = [...tiles].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ar"));
  const topValue = ranked[0]?.value ?? 0;
  const leaders = topValue > 0 ? ranked.filter((tile) => tile.value === topValue) : [];
  const unit = metric === "trees" ? "زيتونة" : countUnit;
  const valueLabel = metric === "trees" ? "الزيتونات المطلوبة" : mode === "people" ? "الأشخاص" : "المطالب";
  const secondaryLabel = metric === "trees" ? (mode === "people" ? "الأشخاص" : "المطالب") : "الزيتونات المطلوبة";
  const anywhere = metric === "trees" ? stats.anywhere_trees : stats.anywhere;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold text-forest">التحليلات وخريطة الطلب</h1>
        <p className="mt-1 text-muted">
          وين الطلب، قدّاش من زيتونة، وقدّاش من شخص.{ownFilesOnly ? " الأرقام تخص الملفات المسندة إليك." : ""}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="الفترة" options={RANGES.map((r) => ({ key: r.key, label: r.label, href: hrefFor({ range: r.key }) }))} current={range.key} />
        <Segmented label="لون الخريطة" options={METRICS.map((m) => ({ key: m.key, label: m.label, href: hrefFor({ color: m.key }) }))} current={metric} />
        <Segmented label="طريقة العدّ" options={MODES.map((m) => ({ key: m.key, label: m.label, href: hrefFor({ mode: m.key }) }))} current={mode} />
      </div>

      <section aria-label="الأرقام الأساسية" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="مطالب" value={stats.requests} note={`${formatCount(stats.duplicates)} منها مكرّرة`} />
        <StatTile label="أشخاص" value={stats.persons} note="رقم هاتف واحد لكل شخص" />
        <StatTile label="زيتونات مطلوبة" value={stats.trees_total} note="الحد الأدنى لكل اختيار، دون المطالب المكرّرة" />
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">أكثر ولاية مطلوبة ({metric === "trees" ? "بالزيتونات" : mode === "people" ? "بالأشخاص" : "بالمطالب"})</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{leaders.length > 0 ? leaders.map((tile) => tile.name).join("، ") : "—"}</p>
          {leaders.length > 0 ? (
            <p className="mt-1 text-xs text-muted tabular-nums">
              {formatCount(topValue)} {unit}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">لا يوجد طلب مرتبط بولاية في هذه الفترة.</p>
          )}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ChartCard
          title="خريطة الطلب"
          subtitle={`${formatCount(anywhere)} ${unit} في مطالب «المكان غير مهم» لا تظهر في الخريطة. المطلب اللي يذكر أكثر من ولاية يُحسب في كل ولاية. اضغط على ولاية لعرض مطالبها.`}
        >
          <DemandMap
            tiles={tiles}
            unit={unit}
            valueLabel={valueLabel}
            secondaryLabel={secondaryLabel}
            caption={`${valueLabel} حسب ولاية الاستثمار، ${range.label}`}
          />
        </ChartCard>

        <ChartCard title={`${valueLabel} حسب الولاية`} subtitle={range.label}>
          <BarList
            items={ranked.map((tile) => ({ key: String(tile.id), label: tile.name, count: tile.value }))}
            emptyText="لا يوجد طلب مرتبط بولاية في هذه الفترة."
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="عدد الزيتونات في المطالب" subtitle={`عدد ${mode === "people" ? "الأشخاص" : "المطالب"} حسب الاختيار.`}>
          <BarList
            items={stats.by_tree_count.map((bucket) => ({ key: bucket.code ?? "none", label: bucket.label, count: bucket.count }))}
            total={mode === "people" ? stats.persons : stats.requests}
          />
        </ChartCard>
        <ChartCard title="الزيتونات المطلوبة حسب الاختيار" subtitle="«اقترحولي» والمطالب بدون عدد لا تضيف زيتونات.">
          <BarList
            items={stats.by_tree_count.map((bucket) => ({ key: bucket.code ?? "none", label: bucket.label, count: bucket.trees }))}
            total={stats.trees_total}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="شنوّة يحبوا يملكوا" subtitle={`${formatCount(stats.unsure_type)} ${countUnit} «ما يهمنيش النوع».`}>
          <BarList
            items={stats.by_scenario.map((s) => ({ key: s.id, label: s.name, count: s.count }))}
            total={mode === "people" ? stats.persons : stats.requests}
          />
        </ChartCard>
        <ChartCard title="القسط الشهري">
          <BarList
            items={stats.by_installment.map((d) => ({ key: d.label, label: d.label, count: d.count }))}
            total={mode === "people" ? stats.persons : stats.requests}
          />
        </ChartCard>
      </div>

      <p className="text-sm text-muted">
        لسؤال أدق، مثلاً عدد الزيتونات مع الولاية ونظام الغراسة والقسط معاً، استعمل{" "}
        <Link href="/admin/leads" className="font-semibold text-forest underline-offset-4 hover:underline">
          فلاتر مطالب الاستثمار
        </Link>
        .
      </p>
    </div>
  );
}

function Segmented({ label, options, current }: { label: string; options: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          aria-current={option.key === current ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            option.key === current ? "bg-forest font-semibold text-paper" : "text-muted hover:bg-paper hover:text-ink"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-semibold">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
