import type { Metadata } from "next";
import Link from "next/link";

import { BarList, ChartCard, type BarItem } from "@/components/admin/charts";
import { DemandMap, type MapTile } from "@/components/admin/demand-map";
import { formatPercent } from "@/components/admin/tree-pricing-inputs";
import { StatTile } from "@/components/ui";
import { CRM_READ_ROLES, hasRole, requireStaff } from "@/lib/auth";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { PAYMENT_MODE_LABELS } from "../leads/filters";
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

// Label crm_demand_stats gives the bucket of demands that did not answer a question.
const NO_ANSWER_LABEL = "بدون إجابة";

type Metric = (typeof METRICS)[number]["key"];
type Mode = (typeof MODES)[number]["key"];

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Plan Q-7: breakdowns of retired questions, only those with at least one recorded answer in the period. */
function legacyBreakdowns(stats: DemandStats): { key: string; title: string; items: BarItem[] }[] {
  const sources: { key: string; title: string; rows: { label: string; count: number }[] | undefined }[] = [
    { key: "installment", title: "القسط الشهري", rows: stats.by_installment },
    { key: "down-payment", title: "التسبقة بالمبلغ", rows: stats.by_down_payment },
    { key: "desired-area", title: "المساحة المطلوبة", rows: stats.by_desired_area },
    { key: "priority", title: "الأهم بالنسبة للحريف", rows: stats.by_priority },
  ];
  return sources.flatMap((source) => {
    const items = (source.rows ?? [])
      .filter((row) => row.count > 0 && row.label !== NO_ANSWER_LABEL)
      .map((row, index) => ({ key: `${source.key}-${index}`, label: row.label, count: row.count }));
    return items.length > 0 ? [{ key: source.key, title: source.title, items }] : [];
  });
}

/** Price bands in the order crm_demand_stats gives them; a band without min starts where the previous one ended. */
function priceBandItems(bands: NonNullable<DemandStats["by_total_price_band"]>): BarItem[] {
  let previousMax: number | null = null;
  return bands.map((band, index) => {
    const max = band.max ?? band.upper_millimes ?? null;
    const min = band.min ?? previousMax;
    if (max !== null) previousMax = max;
    let label: string;
    if (band.label) label = band.label;
    else if (min === null) label = max === null ? "كل الأسعار" : `حتى ${formatMillimes(max)}`;
    else label = max === null ? `أكثر من ${formatMillimes(min)}` : `أكثر من ${formatMillimes(min)} وحتى ${formatMillimes(max)}`;
    return { key: `band-${index}`, label, count: band.count };
  });
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
  const countTotal = mode === "people" ? stats.persons : stats.requests;
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

  const percentItems: BarItem[] = (stats.by_down_payment_percent ?? []).map((entry, index) => ({
    key: entry.percent === null ? "none" : `${entry.percent}-${index}`,
    label: entry.percent === null ? entry.label || "بدون نسبة" : entry.label || formatPercent(entry.percent),
    count: entry.count,
  }));
  const priceBands = stats.by_total_price_band ?? [];
  const legacy = legacyBreakdowns(stats);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="section-title">التحليلات وخريطة الطلب</h1>
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
        <StatTile
          size="sm"
          label={`أكثر ولاية مطلوبة (${metric === "trees" ? "بالزيتونات" : mode === "people" ? "بالأشخاص" : "بالمطالب"})`}
          value={leaders.length > 0 ? leaders.map((tile) => tile.name).join("، ") : "—"}
          note={
            leaders.length > 0 ? (
              <span className="tabular-nums">
                {formatCount(topValue)} {unit}
              </span>
            ) : (
              "لا يوجد طلب مرتبط بولاية في هذه الفترة."
            )
          }
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ChartCard as="h2"
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

        <ChartCard as="h2" title={`${valueLabel} حسب الولاية`} subtitle={range.label}>
          <BarList
            items={ranked.map((tile) => ({ key: String(tile.id), label: tile.name, count: tile.value }))}
            emptyText="لا يوجد طلب مرتبط بولاية في هذه الفترة."
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard as="h2" title="عدد الزيتونات في المطالب" subtitle={`عدد ${mode === "people" ? "الأشخاص" : "المطالب"} حسب الاختيار.`}>
          <BarList
            items={stats.by_tree_count.map((bucket) => ({ key: bucket.code ?? "none", label: bucket.label, count: bucket.count }))}
            total={countTotal}
          />
        </ChartCard>
        <ChartCard as="h2" title="الزيتونات المطلوبة حسب الاختيار" subtitle="«اقترحولي» والمطالب بدون عدد لا تضيف زيتونات.">
          <BarList
            items={stats.by_tree_count.map((bucket) => ({ key: bucket.code ?? "none", label: bucket.label, count: bucket.trees }))}
            total={stats.trees_total}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard as="h2" title="شنوّة يحبوا يملكوا" subtitle={`${formatCount(stats.unsure_type)} ${countUnit} «ما يهمنيش النوع».`}>
          <BarList items={stats.by_scenario.map((s) => ({ key: s.id, label: s.name, count: s.count }))} total={countTotal} />
        </ChartCard>
        <ChartCard as="h2" title="فئات المساحة" subtitle={`عدد ${mode === "people" ? "الأشخاص" : "المطالب"} حسب المساحة لكل زيتونة المختارة.`}>
          <BarList
            items={(stats.by_spacing_class ?? []).map((spacing) => ({
              key: spacing.id ?? "none",
              label: typeof spacing.area_m2 === "number" ? `${spacing.label} · ${formatArea(spacing.area_m2)}` : spacing.label || "بدون فئة",
              count: spacing.count,
            }))}
            total={countTotal}
            emptyText="حتى مطلب ما فيه فئة مساحة في هذه الفترة."
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard as="h2" title="طريقة الدفع" subtitle="بالحاضر أو بالتقسيط، كما اختارها الحريف مع السعر.">
          <BarList
            items={(stats.by_payment_mode ?? []).map((entry) => ({
              key: entry.code ?? "none",
              label: entry.code ? (PAYMENT_MODE_LABELS[entry.code] ?? entry.code) : "بدون اختيار",
              count: entry.count,
            }))}
            total={countTotal}
            emptyText="حتى مطلب ما فيه طريقة دفع في هذه الفترة."
          />
        </ChartCard>
        {/* Plan Q-1: the percentage of the cash total chosen with installments. */}
        <ChartCard as="h2" title="نسبة التسبقة" subtitle={`عدد ${mode === "people" ? "الأشخاص" : "المطالب"} حسب نسبة التسبقة المختارة مع التقسيط.`}>
          <BarList items={percentItems} total={countTotal} emptyText="حتى مطلب ما فيه نسبة تسبقة في هذه الفترة." />
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Report v3 §49: which duration is chosen most. */}
        <ChartCard as="h2" title="مدة الدفع" subtitle={`عدد ${mode === "people" ? "الأشخاص" : "المطالب"} حسب المدة المختارة.`}>
          <BarList items={stats.by_duration.map((d) => ({ key: d.id ?? "none", label: d.label, count: d.count }))} total={countTotal} />
        </ChartCard>
        <ChartCard as="h2" title="الزيارة والتمويل البنكي" subtitle="اللي جاوبوا بنعم. السؤالين اختياريين في الاستمارة.">
          <BarList
            items={[
              { key: "visit", label: "يحب يزور الأرض", count: stats.visit_yes },
              { key: "bank", label: "يحب حل تمويل بنكي", count: stats.bank_financing_yes },
            ]}
            total={countTotal}
            emptyText="حتى حدّ ما جاوب بنعم في هذه الفترة."
          />
        </ChartCard>
      </div>

      {priceBands.length > 0 ? (
        <ChartCard as="h2"
          title="شرائح السعر الجملي"
          subtitle={`عدد ${mode === "people" ? "الأشخاص" : "المطالب"} حسب السعر الجملي المقدّر وقت التسجيل. الشرائح من الإعداد analytics.total_price_bands_millimes.`}
        >
          <BarList items={priceBandItems(priceBands)} total={countTotal} emptyText="حتى مطلب ما فيه سعر جملي في هذه الفترة." />
        </ChartCard>
      ) : null}

      {legacy.length > 0 ? (
        <section aria-labelledby="legacy-answers" className="space-y-3">
          <div>
            <h2 id="legacy-answers" className="text-lg font-semibold">
              قديم
            </h2>
            <p className="text-sm text-muted">أسئلة ما عادتش في الاستمارة. تظهر كان الإجابات المسجّلة في هذه الفترة، و«بدون إجابة» ما يتحسبش.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {legacy.map((chart) => (
              <ChartCard as="h2" key={chart.key} title={chart.title}>
                <BarList items={chart.items} total={countTotal} />
              </ChartCard>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-sm text-muted">
        لسؤال أدق، مثلاً عدد الزيتونات مع الولاية ونظام الغراسة ومدة الدفع معاً، استعمل{" "}
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
    <nav aria-label={label} className="card flex flex-wrap gap-1 rounded-xl p-1">
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
