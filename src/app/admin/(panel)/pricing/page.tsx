import type { Metadata } from "next";

import { PRICE_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { CostItemsList } from "./cost-items";
import { Section } from "./fields";
import { MarkupsForm } from "./markups-form";
import { RatesSection } from "./rates-section";
import { RuleForm } from "./rule-form";
import { readSimulation, SimulatorSection } from "./simulator-section";
import { SpacingSection } from "./spacing-section";
import type { CostItem, DownPercent, Duration, DurationItem, Markup, PricingRule, ProjectOption, SpacingClass } from "./types";

export const metadata: Metadata = { title: "التسعير" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONTENTS = [
  { id: "spacing", label: "فئات المساحة" },
  { id: "global-rules", label: "القواعد العامة" },
  { id: "extra-costs", label: "المصاريف الإضافية" },
  { id: "rates", label: "نِسَب التسبقة والمدد" },
  { id: "markups", label: "الزيادة حسب المدة" },
  { id: "simulator", label: "محاكاة السعر" },
];

const MARGIN_NOT_SET = "الأسعار ما تنحسبش وما تبانش في الموقع حتى يتضبط هامش AgriZed.";

function settingNumber(rows: { key: string; value: unknown }[], key: string): number | null {
  const value = rows.find((row) => row.key === key)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Tree pricing addendum (docs/tree-area-and-cost.md), report v3 §10-§13, §51-§53 and docs/plan-zitouna.md §3.2. */
export default async function PricingPage({ searchParams }: PageProps<"/admin/pricing">) {
  await requireStaff(PRICE_ROLES);
  const params = await searchParams;
  const projectParam = typeof params.project === "string" && UUID.test(params.project) ? params.project : null;

  const supabase = await createClient();

  // What one offer narrows — its allowed down-payment percentages and spacing classes — is read and written on
  // that offer's own «التسعير» tab now, so this page no longer loads either.

  const [
    config,
    classesResult,
    rulesResult,
    itemsResult,
    markupsResult,
    projectsResult,
    settingsResult,
    profilesResult,
  ] = await Promise.all([
    getPublicConfig(),
    supabase
      .from("tree_spacing_classes")
      .select("id, code, label_ar, label_fr, row_spacing_m, tree_spacing_m, area_m2, sort_order, is_active")
      .order("sort_order")
      .order("label_ar"),
    supabase
      .from("tree_pricing_rules")
      .select(
        "id, project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes, margin_mode, margin_percent_bp, margin_fixed_millimes, price_rounding_millimes, monthly_rounding_millimes, use_global_cost_items, annual_fee_per_tree_millimes, note_ar, markups_note_ar, updated_at, updated_by",
      ),
    supabase.from("tree_cost_items").select("id, project_id, label_ar, label_fr, basis, amount_millimes, sort_order, is_active").order("sort_order"),
    supabase.from("financing_markups").select("id, project_id, months, markup_bp").order("months"),
    supabase.from("projects").select("id, code, name").order("code"),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length", "pricing.max_months"]),
    supabase.from("profiles").select("id, full_name"),
  ]);
  for (const result of [classesResult, rulesResult, itemsResult, markupsResult, projectsResult, settingsResult]) {
    if (result.error) throw new Error(`Pricing page failed: ${result.error.message}`);
  }

  const classes = (classesResult.data ?? []) as SpacingClass[];
  const rules = (rulesResult.data ?? []) as PricingRule[];
  const items = (itemsResult.data ?? []) as CostItem[];
  const markups = (markupsResult.data ?? []) as Markup[];
  const projects = (projectsResult.data ?? []) as ProjectOption[];
  const names = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name]));

  const reasonMin = settingNumber(settingsResult.data ?? [], "audit.reason_min_length") ?? 1;
  const maxMonths = settingNumber(settingsResult.data ?? [], "pricing.max_months");

  // Active list items only (the public configuration), in their Back Office order.
  const percents: DownPercent[] = optionsFor(config, "down_payment_percent").flatMap((option) =>
    option.min_number === null ? [] : [{ id: option.id, label_ar: option.label_ar, label_fr: option.label_fr, percent: Number(option.min_number) }],
  );
  const durationItems: DurationItem[] = optionsFor(config, "duration").flatMap((option) =>
    option.min_number === null ? [] : [{ id: option.id, label_ar: option.label_ar, label_fr: option.label_fr, months: Number(option.min_number) }],
  );
  // Field names are keyed by months, so two list items with the same months share one markup.
  const durations: Duration[] = [];
  for (const item of durationItems) {
    if (!durations.some((duration) => duration.months === item.months)) durations.push({ id: item.id, label_ar: item.label_ar, months: item.months });
  }
  durations.sort((a, b) => a.months - b.months);

  const globalRule = rules.find((rule) => rule.project_id === null) ?? null;
  const globalMarkups = markups.filter((markup) => markup.project_id === null);
  // `selected` is still read: the simulator lets you try the general rule against one offer's own values, which
  // is a preview and not an edit. Editing that offer happens on the offer, in its «التسعير» tab.
  const selected = projects.find((project) => project.id === projectParam) ?? null;
  const marginMissing = !globalRule || globalRule.margin_mode === null;
  const simulation = readSimulation(params, { classes, projects, durations, percents });

  return (
    <div className="max-w-5xl space-y-12">
      <header className="space-y-3">
        <h1 className="section-title">التسعير</h1>
        <p className="max-w-3xl leading-7 text-muted">
          سعر الزيتونة = قيمة الأرض (مساحة الزيتونة × ثمن المتر) + تكلفة الغراسة + المصاريف الإضافية، ثم يُضاف هامش AgriZed. كل رقم هنا
          يُقرأ من قاعدة البيانات، وكل تغيير يُسجَّل مع سببه في سجل العمليات. الزائر ما يشوفش هذه التفاصيل: يشوف كان سعر الزيتونة والسعر
          الجملي، وهذا بعد نشر موديول التسعير.
        </p>
        <p className="inline-block rounded-xl bg-leaf-soft px-4 py-2 text-sm font-semibold text-forest">مثال: زيتونة بـ35 م² وثمن المتر 10 د ← قيمة الأرض 350 د</p>
        <nav aria-label="أقسام الصفحة" className="flex flex-wrap gap-2 pt-1">
          {CONTENTS.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-forest hover:border-forest">
              {item.label}
            </a>
          ))}
        </nav>
        {marginMissing ? (
          <p className="text-sm font-semibold text-gold">
            هامش AgriZed غير مضبوط بعد.{" "}
            <a href="#global-rules" className="underline underline-offset-4">
              اضبطه في القواعد العامة
            </a>
            .
          </p>
        ) : null}
      </header>

      <SpacingSection classes={classes} reasonMin={reasonMin} />

      <Section
        id="global-rules"
        title="قواعد التسعير العامة"
        note={
          globalRule
            ? `تنطبق على كل مشروع ما عندوش قاعدة خاصة. آخر تعديل: ${formatDateTime(globalRule.updated_at)}${
                globalRule.updated_by && names.get(globalRule.updated_by) ? ` · ${names.get(globalRule.updated_by)}` : ""
              }.`
            : "تنطبق على كل مشروع ما عندوش قاعدة خاصة."
        }
      >
        {marginMissing ? (
          <p role="status" className="rounded-2xl border-2 border-gold bg-gold-soft px-5 py-4 text-lg font-semibold text-forest-700">
            {MARGIN_NOT_SET}
          </p>
        ) : null}
        <RuleForm projectId={null} rule={globalRule} globalRule={null} reasonMin={reasonMin} idPrefix="global-rule" />
      </Section>

      <Section
        id="extra-costs"
        title="المصاريف الإضافية"
        note="بنود تُضاف على تكلفة كل زيتونة: مبلغ للزيتونة، أو مبلغ للمتر المربع يتضرب في مساحة الزيتونة. تنطبق على كل المشاريع، إلا مشروع ألغى «استعمال المصاريف العامة»."
      >
        <CostItemsList
          items={items.filter((item) => item.project_id === null)}
          projectId={null}
          reasonMin={reasonMin}
          idPrefix="global-cost"
          emptyText="ما فماش مصاريف إضافية عامة بعد."
        />
      </Section>

      <RatesSection percents={percents} durations={durationItems} maxMonths={maxMonths} />

      <Section
        id="markups"
        title="الزيادة حسب مدة التقسيط"
        note="السعر بالتقسيط = السعر الجملي + نسبة الزيادة للمدة المختارة. الباقي بعد التسبقة يتقسم على الأشهر، والقسط الشهري يُدوَّر للأعلى. خانة فارغة = المدة هذه ما تتعرضش بالتقسيط. الملاحظة فوق تتبدّل مع القواعد العامة."
      >
        <MarkupsForm
          projectId={null}
          durations={durations}
          markups={globalMarkups}
          globalMarkups={null}
          maxMonths={maxMonths}
          reasonMin={reasonMin}
          idPrefix="global-markups"
          note={globalRule?.markups_note_ar ?? null}
        />
      </Section>

      {/* «قواعد خاصة بمشروع» used to stand here, with a project picker on top of it. It is gone from this page
          (owner, 2026-09-19: «each project offer should have its own pricing details, not from the /pricing
          page — all in the offer details page»). Pricing one offer now happens on that offer, in its «التسعير»
          tab: src/app/admin/(panel)/projects/[id]/pricing-tab.tsx, which reads and writes exactly the same
          tables through exactly the same forms and Server Actions. Nothing about the data model moved.

          What is left on this page is the general rule — the one the calculator on /start estimates with, and
          the fallback an offer inherits until it sets a value of its own. */}
      <SimulatorSection
        simulation={simulation}
        classes={classes}
        projects={projects}
        durations={durations}
        percents={percents}
        keepProjectId={selected?.id ?? null}
      />
    </div>
  );
}
