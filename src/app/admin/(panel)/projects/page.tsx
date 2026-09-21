// العروض — the real stock, counted in olive trees, from the rows that hold it.
//
// The unit is the olive tree (owner, 2026-09-18: «the unit is a tree not m carré» · «we just give each tree a
// number or an id and associate it with the client»). Every figure on this page is a count of public.trees rows,
// answered by public.staff_offer_stock through ./offer-stock — the one way the Back Office reads stock.
//
// Before this, the four tiles summed parcels.olive_tree_count grouped by parcels.status. public.parcels has no
// rows, so the head of the page read «إجمالي الزيتونات 0» directly above two offer cards declaring 500 and 100
// trees, and each card explained the contradiction with «ما تقسّمش لقطع بعد» — a lot layer the owner removed.
// The tiles and the cards now count the same rows, so they can no longer disagree.
//
// An offer whose trees were never numbered says exactly that. «0 متاحة» would mean «sold out», which is a
// different fact, and staff_offer_stock carries `status` precisely so the screen can tell the two apart.

import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { EmptyState, FormField, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { hasRole, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig, settingText, type PublicConfig } from "@/lib/config";
import { formatArea, formatCount } from "@/lib/format";
import { PROJECT_STATUS_LABELS, projectStatusLabel, projectStatusTone } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

import { saveProject } from "./actions";
import { offerStocks, totalStock, type OfferStock } from "./offer-stock";

export const metadata: Metadata = { title: "العروض" };

const WRITE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

type StaffClient = Awaited<ReturnType<typeof createClient>>;

/** The four figures are named in `settings` (0054), so the same words reach the staff and the visitor. */
type StockLabels = { total: string; available: string; reserved: string; sold: string };

const LABEL_FALLBACK: StockLabels = {
  total: "إجمالي الزيتونات",
  available: "المتاحة",
  reserved: "المحجوزة",
  sold: "المباعة",
};

/**
 * An empty setting hides the figure on the public page («فارغ = يتخبّى الرقم»). In the Back Office a nameless
 * tile helps nobody, so an empty value falls back to the Arabic the migration seeded.
 */
function stockLabels(config: PublicConfig): StockLabels {
  return {
    total: settingText(config, "offers.stock_total_label", LABEL_FALLBACK.total) || LABEL_FALLBACK.total,
    available: settingText(config, "offers.stock_available_label", LABEL_FALLBACK.available) || LABEL_FALLBACK.available,
    reserved: settingText(config, "offers.stock_reserved_label", LABEL_FALLBACK.reserved) || LABEL_FALLBACK.reserved,
    sold: settingText(config, "offers.stock_sold_label", LABEL_FALLBACK.sold) || LABEL_FALLBACK.sold,
  };
}

/** «OFF-TNAYEUR-0001 … OFF-TNAYEUR-0100» — the visible proof that every tree of this offer carries a number. */
type CodeRange = { first: string; last: string } | null;

/**
 * Two index lookups on (project_id, seq), asked only of an offer that has tree rows. Counting is the RPC's job;
 * this reads the two codes at the ends, which no count can carry. If offers ever number in the dozens, a
 * set-returning RPC replaces this — never a full read of public.trees, which is one row per tree.
 */
async function treeCodeRange(supabase: StaffClient, projectId: string): Promise<CodeRange> {
  const [first, last] = await Promise.all([
    supabase.from("trees").select("code").eq("project_id", projectId).order("seq", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("trees").select("code").eq("project_id", projectId).order("seq", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!first.data || !last.data) return null;
  return { first: first.data.code, last: last.data.code };
}

export default async function OffersPage() {
  const session = await requireStaff();
  const canWrite = hasRole(session, WRITE_ROLES);
  const supabase = await createClient();
  const config = await getPublicConfig();
  const labels = stockLabels(config);

  const projects = await supabase
    .from("projects")
    .select("id, code, name, governorate_id, location_description, status, total_area_m2, tree_count, created_at")
    .order("created_at", { ascending: false });
  if (projects.error) throw new Error(projects.error.message);

  const rows = projects.data ?? [];
  const stocks = await offerStocks(
    supabase,
    rows.map((project) => project.id),
  );
  const totals = totalStock(stocks.values());

  // The codes are worth a round trip only where trees exist; an offer with none has a sentence, not a range.
  const ranges = new Map<string, CodeRange>(
    await Promise.all(
      rows
        .filter((project) => (stocks.get(project.id)?.trees_total ?? 0) > 0)
        .map(async (project) => [project.id, await treeCodeRange(supabase, project.id)] as [string, CodeRange]),
    ),
  );

  const governorateName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const unnumbered = [...stocks.values()].filter((stock) => stock.status === "not_generated");
  const unnumberedTrees = unnumbered.reduce((sum, stock) => sum + (stock.trees_declared ?? 0), 0);
  const partial = [...stocks.values()].filter((stock) => stock.status === "partial");

  return (
    <div className="space-y-6">
      <SectionHeader
        level={1}
        title="العروض"
        description="مخزون حقيقي: أرض موجودة، وكل زيتونة فيها عندها رقمها وحالتها وصاحبها. موش محاكاة — المحاكي يعطي مثال تقديري، والعرض يتباع."
      />

      {rows.length > 0 ? (
        <div className="space-y-2">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile size="sm" label={labels.total} value={totals.total} note={`${formatCount(rows.length)} عرض · زيتونات مرقّمة`} />
            <StatTile size="sm" label={labels.available} value={totals.available} quiet={totals.available === 0} />
            <StatTile
              size="sm"
              label={labels.reserved}
              value={totals.reserved}
              quiet={totals.reserved === 0}
              note="محجوزة لحريف معيّن"
            />
            <StatTile size="sm" label={labels.sold} value={totals.sold} quiet={totals.sold === 0} />
          </dl>

          {unnumbered.length > 0 ? (
            <p className="hint">
              {`${formatCount(unnumbered.length)} عرض مازالت زيتوناته ما ترقّمتش${
                unnumberedTrees > 0 ? ` (${formatCount(unnumberedTrees)} زيتونة مصرّح بيها)` : ""
              }، فما دخلوش في الأرقام اللي فوق. افتح العرض وولّد زيتوناته باش كل وحدة تولّي عندها رقمها وحالتها.`}
            </p>
          ) : null}
          {partial.length > 0 ? (
            <p className="hint">
              {formatCount(partial.length)} عرض العدد المولّد فيه يختلف على العدد المصرّح به في بطاقته. افتح العرض وولّد
              زيتوناته من جديد باش يتساوو.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* `.disclosure` (globals.css) draws the marker, so the typed «+» that stood in for one is gone. */}
      {canWrite ? (
        <details className="panel disclosure">
          <summary className="font-semibold">عرض جديد</summary>
          <div className="border-t border-line pt-cozy">
            <ActionForm
              action={saveProject.bind(null, null)}
              submitLabel="إنشاء العرض"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              buttonClassName="btn btn-primary btn-sm sm:col-span-2 lg:col-span-3 lg:w-48"
            >
              <FormField size="sm" label="رمز العرض">
                <input name="code" required placeholder="OFF-TNAYEUR" dir="ltr" className="field field-sm text-left" />
              </FormField>
              <FormField size="sm" label="الاسم">
                <input name="name" required className="field field-sm" />
              </FormField>
              <FormField size="sm" label="الولاية">
                <select name="governorate_id" required defaultValue="" className="field field-sm">
                  <option value="" disabled>
                    اختر
                  </option>
                  {config.governorates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField size="sm" label="نوع المشروع">
                <select name="project_type_id" defaultValue="" className="field field-sm">
                  <option value="">بدون</option>
                  {config.projectTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label_ar}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField size="sm" label="المساحة الجملية (م²)">
                <input name="total_area_m2" inputMode="decimal" dir="ltr" className="field field-sm text-left" />
              </FormField>
              <FormField size="sm" label="الحالة">
                <select name="status" defaultValue="draft" className="field field-sm">
                  {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>
            </ActionForm>
          </div>
        </details>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="ما فماش عروض بعد">
          العرض هو أرض موجودة بزيتوناتها. أنشئ أول عرض من فوق، اكتب عدد الزيتونات، ثم ولّدها باش كل زيتونة يكون عندها
          رقمها.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((project) => {
            const stock = stocks.get(project.id);
            return (
              <li key={project.id}>
                <Link href={`/admin/projects/${project.id}`} className="card block h-full p-5 transition-colors hover:border-forest">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold">{project.name}</h2>
                      <p className="text-sm text-muted">
                        <span dir="ltr" className="inline-block">
                          {project.code}
                        </span>
                        {" · "}
                        {[project.location_description, governorateName.get(project.governorate_id)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <StatusPill toneClass={projectStatusTone(project.status)}>{projectStatusLabel(project.status)}</StatusPill>
                  </div>

                  <OfferStockLine
                    stock={stock}
                    declaredTrees={project.tree_count}
                    labels={labels}
                    range={ranges.get(project.id) ?? null}
                  />

                  <p className="mt-2 text-xs text-muted tabular-nums">
                    {project.total_area_m2 ? formatArea(Number(project.total_area_m2)) : "المساحة ما تكتبتش"}
                    {stock && stock.min_trees > 1 ? ` · أقلّ عدد في الطلب: ${formatCount(stock.min_trees)} زيتونة` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One figure of the card line. A zero stays grey: it is a fact, not something to deal with. */
function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${value === 0 ? "text-muted" : "text-ink"}`}>{formatCount(value)}</dd>
    </div>
  );
}

/**
 * The stock of one offer on its card: the four counts and the codes at the ends of its numbering, or — when the
 * trees were never numbered — what is missing and what to do about it. The card itself opens the offer, which is
 * where «توليد الزيتونات» lives.
 */
function OfferStockLine({
  stock,
  declaredTrees,
  labels,
  range,
}: {
  stock: OfferStock | undefined;
  /** What the offer's card declares (projects.tree_count), used while no tree row exists. */
  declaredTrees: number | null;
  labels: StockLabels;
  range: CodeRange;
}) {
  if (!stock || stock.status === "not_generated") {
    return (
      <div className="mt-4 space-y-1">
        <p className="text-sm font-semibold text-ink">الزيتونات ما ترقّمتش بعد</p>
        <p className="text-xs leading-5 text-muted">
          {declaredTrees
            ? `العرض مصرّح بـ ${formatCount(declaredTrees)} زيتونة: افتح العرض وولّدها باش كل وحدة تاخذ رقمها وحالتها.`
            : "اكتب عدد الزيتونات في بطاقة العرض، ثم ولّدها من صفحة العرض باش كل وحدة تاخذ رقمها."}
        </p>
      </div>
    );
  }

  return (
    <>
      <dl className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <Figure label={labels.total} value={stock.trees_total} />
        <Figure label={labels.available} value={stock.trees_available} />
        <Figure label={labels.reserved} value={stock.trees_reserved} />
        <Figure label={labels.sold} value={stock.trees_sold} />
      </dl>

      {range ? (
        <p className="mt-1.5 text-xs text-muted">
          الأرقام{" "}
          <span dir="ltr" className="inline-block tabular-nums">
            {range.first} … {range.last}
          </span>
        </p>
      ) : null}

      {stock.status === "partial" ? (
        <p className="mt-1.5 text-xs text-danger">
          المولّد {formatCount(stock.trees_total)} زيتونة والمصرّح به {formatCount(declaredTrees ?? 0)}: افتح العرض وولّد
          زيتوناته من جديد.
        </p>
      ) : null}
    </>
  );
}
