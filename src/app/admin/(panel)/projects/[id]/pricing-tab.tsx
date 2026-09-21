// Section «التسعير»: what ONE tree of THIS offer costs, and every number that decides it.
//
// Owner, 2026-09-19: «each project offer should have its own pricing details, not from the /pricing page — all
// in the offer details page, each project has its own». So this is the whole per-offer pricing screen, living
// where the offer lives. /admin/pricing keeps only the general rules the calculator on /start estimates with —
// the two systems the owner has said twice are being confused: a simulator gives a stranger an estimate, an
// offer sells numbered trees of a named piece of land at a price this page sets.
//
// Nothing here computes money. Every figure is written down, and app.tree_price / app.project_quote_payload in
// Postgres do the arithmetic (report v3 §8): land value (area per tree × price per m²) + planting + extra costs,
// then AgriZed's margin, then rounding. An empty box means «follow the general value», which is printed inside
// the box so the reader always sees what they are inheriting.

import { DataList, DataRow } from "@/components/ui";
import { PRICE_ROLES, hasRole, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatArea, formatCount, formatMillimes, formatSpacing } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { projectStatusLabel } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

import { PAYMENT_MODE_LABELS } from "../../leads/filters";
import { offerStock } from "../offer-stock";
import { AllowedChoicesForm } from "../../pricing/allowed-choices-form";
import { CostItemsList } from "../../pricing/cost-items";
import { DeleteForm } from "../../pricing/fields";
import { MarkupsForm } from "../../pricing/markups-form";
import { deletePricingRule, saveProjectDownPercents, saveProjectSpacingClasses } from "../../pricing/actions";
import { percentLabel } from "../../pricing/rates-section";
import { RuleForm } from "../../pricing/rule-form";
import type { CostItem, DownPercent, Duration, DurationItem, Markup, PricingRule, SpacingClass } from "../../pricing/types";

function settingNumber(rows: { key: string; value: unknown }[], key: string): number | null {
  const row = rows.find((candidate) => candidate.key === key);
  const value = Number(row?.value);
  return Number.isFinite(value) ? value : null;
}

export async function PricingTab({ projectId }: { projectId: string }) {
  const session = await requireStaff();
  // The pricing roles are the ones that may write a price, exactly as /admin/pricing gates itself. A reader
  // without them does not get a form full of disabled boxes; they get one sentence saying who to ask.
  if (!hasRole(session, PRICE_ROLES)) {
    return (
      <div className="card p-5 text-sm leading-6 text-muted">
        تسعير العرض يتبدّل من طرف المالية أو الإدارة فقط. تنجّم تقرا سعر الزيتونة في رأس الصفحة.
      </div>
    );
  }

  const supabase = await createClient();
  const [
    config,
    classesResult,
    rulesResult,
    itemsResult,
    markupsResult,
    settingsResult,
    percentIdsResult,
    classIdsResult,
    projectResult,
    stock,
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
        )
        .or(`project_id.is.null,project_id.eq.${projectId}`),
      supabase
        .from("tree_cost_items")
        .select("id, project_id, label_ar, label_fr, basis, amount_millimes, sort_order, is_active")
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase.from("financing_markups").select("id, project_id, months, markup_bp").or(`project_id.is.null,project_id.eq.${projectId}`).order("months"),
      supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length", "pricing.max_months"]),
      supabase.from("project_down_payment_percents").select("option_item_id").eq("project_id", projectId),
      supabase.from("project_spacing_classes").select("spacing_class_id").eq("project_id", projectId),
      supabase.from("projects").select("status").eq("id", projectId).maybeSingle(),
      // The smallest basket this offer sells, counted by the database (app.offer_min_trees), never here.
      offerStock(supabase, projectId),
    ]);

  for (const result of [classesResult, rulesResult, itemsResult, markupsResult, settingsResult, percentIdsResult, classIdsResult]) {
    if (result.error) throw new Error(`Offer pricing failed: ${result.error.message}`);
  }

  const classes = (classesResult.data ?? []) as SpacingClass[];
  const rules = (rulesResult.data ?? []) as PricingRule[];
  const items = (itemsResult.data ?? []) as CostItem[];
  const allMarkups = (markupsResult.data ?? []) as Markup[];

  const rule = rules.find((row) => row.project_id === projectId) ?? null;
  const globalRule = rules.find((row) => row.project_id === null) ?? null;
  const markups = allMarkups.filter((row) => row.project_id === projectId);
  const globalMarkups = allMarkups.filter((row) => row.project_id === null);

  const reasonMin = settingNumber(settingsResult.data ?? [], "audit.reason_min_length") ?? 1;
  const maxMonths = settingNumber(settingsResult.data ?? [], "pricing.max_months");

  const percents: DownPercent[] = optionsFor(config, "down_payment_percent").flatMap((option) =>
    option.min_number === null
      ? []
      : [{ id: option.id, label_ar: option.label_ar, label_fr: option.label_fr, percent: Number(option.min_number) }],
  );
  // Field names are keyed by months, so two list items with the same months share one markup.
  const durationItems: DurationItem[] = optionsFor(config, "duration").flatMap((option) =>
    option.min_number === null
      ? []
      : [{ id: option.id, label_ar: option.label_ar, label_fr: option.label_fr, months: Number(option.min_number) }],
  );
  const durations: Duration[] = [];
  for (const item of durationItems) {
    if (!durations.some((duration) => duration.months === item.months)) {
      durations.push({ id: item.id, label_ar: item.label_ar, months: item.months });
    }
  }
  durations.sort((a, b) => a.months - b.months);

  const projectPercentIds = (percentIdsResult.data ?? []).map((row) => row.option_item_id);
  const projectClassIds = (classIdsResult.data ?? []).map((row) => row.spacing_class_id);

  const hasOwnValues = rule !== null || items.length > 0 || markups.length > 0;
  const markupsNoteInherited = !rule?.markups_note_ar && markups.length === 0;

  // What a visitor is actually offered on this offer's public page. Read through public_project_quote's staff
  // twin — the SAME builder (app.project_quote_payload) the public page reads, with the same per-offer rules:
  // app.project_down_percent_items for the percentages, «a markup exists for these months» for the durations.
  // So this block and the public form can never disagree. Nothing here computes a percentage, a price or an
  // instalment; every figure below is the database's own answer.
  const minTrees = Math.max(1, stock.min_trees);
  const plans = await visitorPlans(supabase, projectId, minTrees);
  const preview = plans?.pricing === "ok" ? await planPreview(supabase, projectId, minTrees, plans) : null;
  const offersInstalments = (plans?.percents.length ?? 0) > 0 && (plans?.durations.length ?? 0) > 0;
  // Two gates the visitor meets before any of this: the offer has to be published, and the pricing module open.
  const pricingOpen = (await moduleAccess(config, "pricing")) === "open";
  const projectStatus = projectResult.data?.status ?? null;
  // Where each half of the menu comes from — the same idea as app.tree_price's `sources`, in words.
  const percentsSource = projectPercentIds.length > 0 ? "خاصة بهذا العرض" : "تتبع القاعدة العامة";
  const markupsSameAsGlobal =
    markups.length > 0 &&
    markups.length === globalMarkups.length &&
    markups.every((row) => globalMarkups.some((global) => global.months === row.months && global.markup_bp === row.markup_bp));
  const markupsSource =
    markups.length === 0
      ? "تتبع القاعدة العامة"
      : markupsSameAsGlobal
        ? "خاصة بهذا العرض، بنفس قيم القاعدة العامة"
        : "خاصة بهذا العرض";

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6">
        <h2 className="section-title">تسعير هذا العرض</h2>
        <p className="mt-2 max-w-3xl leading-7 text-muted">
          سعر الزيتونة = قيمة الأرض (مساحة الزيتونة × ثمن المتر) + تكلفة الغراسة + المصاريف الإضافية، ثمّ يُزاد هامش AgriZed. كل رقم
          هنا يخصّ هذا العرض وحدّو. خانة فارغة = يتبع القيمة العامة، والقيمة العامة مكتوبة داخل الخانة باش تشوفها قبل ما تبدّلها. كل
          تبديل يتسجّل في سجلّ العمليات بالقيمة القديمة والجديدة ومين بدّلها.
        </p>
        <p className="mt-2 text-caption leading-6 text-muted">
          {hasOwnValues
            ? "هذا العرض عندو قواعد خاصة بيه."
            : "هذا العرض مازال يتبع القواعد العامة كاملة. اكتب قيمة في أي خانة باش تولّي خاصة بيه."}
        </p>
      </div>

      {/* The answer the tab never gave: the five edit blocks below set the INPUTS of a payment menu, and the
          owner had to open the public site to learn what that menu came out as. This block reads it back. */}
      <Block
        id="offer-visitor-plans"
        title="الخطط اللي يشوفها الزائر في هذا العرض"
        note="مقروءة من نفس دالة قاعدة البيانات اللي تقراها صفحة العرض العمومية، باش اللي تشوفو هنا هو بالضبط اللي يتعرض على الزائر."
      >
        {plans === null ? (
          <p className="text-sm leading-6 text-danger">
            ما نجّمناش نقراو خطط هذا العرض من قاعدة البيانات. حدّث الصفحة؛ وإذا تعاود الخطأ، اعلم التقني — التبديلات تحت تخدم عادي.
          </p>
        ) : plans.pricing !== "ok" ? (
          <p className="text-sm leading-6 text-forest-700">
            هذا العرض ما عندوش سعر توّا، لذلك الزائر ما يشوف لا سعر لا خطة خلاص.{" "}
            {plans.pricing === "legacy"
              ? "علّم فئة المساحة متاع هذا العرض في «فئات المساحة المسموحة» تحت، وقتها يتحسب سعر الزيتونة."
              : "كمّل «قواعد التسعير» تحت — الهامش على الأقل — باش يتحسب سعر الزيتونة."}
          </p>
        ) : (
          <div className="space-y-3">
            <DataList variant="grid" columns={2} className="text-sm">
              <DataRow layout="stacked" numeric={false} label={PAYMENT_MODE_LABELS.cash}>
                معروض دائماً
                {plans.totalPriceMillimes === null ? null : (
                  <span className="mt-0.5 block text-xs font-normal text-muted tabular-nums">
                    أصغر طلب: {formatCount(minTrees)} زيتونة = {formatMillimes(plans.totalPriceMillimes)}
                  </span>
                )}
              </DataRow>
              <DataRow layout="stacked" numeric={false} label={PAYMENT_MODE_LABELS.installments}>
                {offersInstalments ? (
                  <>
                    {formatCount(plans.percents.length)} نِسَب تسبقة × {formatCount(plans.durations.length)} مدد ={" "}
                    {formatCount(plans.percents.length * plans.durations.length)} خطة
                  </>
                ) : (
                  "ما يعرضش التقسيط"
                )}
              </DataRow>
            </DataList>

            {offersInstalments ? (
              <>
                {/* The labels the visitor reads, not a second wording of them: label_ar is the option's own. */}
                <p className="text-sm leading-7">
                  النِّسَب: {plans.percents.map((choice) => choice.labelAr).join("، ")}{" "}
                  <span className="text-muted">({percentsSource})</span>
                </p>
                <p className="text-sm leading-7">
                  المدد: {plans.durations.map((choice) => choice.labelAr).join("، ")}{" "}
                  <span className="text-muted">({markupsSource})</span>
                </p>
                {preview ? (
                  <p className="text-sm leading-7 text-forest-700">
                    مثال: {formatCount(minTrees)} زيتونة بتسبقة {preview.percent.labelAr}
                    {preview.downMillimes === null ? "" : ` (${formatMillimes(preview.downMillimes)})`} على {preview.duration.labelAr}
                    {preview.monthlyMillimes === null ? (
                      " — القسط ما يتحسبش بهذه الاختيارات."
                    ) : (
                      <>
                        {" "}
                        = <span className="font-semibold tabular-nums">{formatMillimes(preview.monthlyMillimes)}</span> في الشهر
                        {preview.installmentsCount === null ? "" : ` × ${formatCount(preview.installmentsCount)} قسط`}.
                      </>
                    )}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm leading-7 text-forest-700">
                {plans.percents.length === 0
                  ? "ما فماش حتى نسبة تسبقة مسموحة، لذلك هذا العرض يتباع بالحاضر برك. علّم النِّسَب في «نِسَب التسبقة المسموحة» تحت، ولّا فعّل نسبة في «الإعدادات ← القوائم»."
                  : "ما فماش حتى مدة عندها نسبة زيادة، لذلك هذا العرض يتباع بالحاضر برك. اكتب نسبة الزيادة لمدة ولا أكثر في «الزيادة حسب مدّة التقسيط» تحت."}
              </p>
            )}

            {/* PRN-01: an amount is never shown without saying it is an estimate. */}
            <p className="text-caption leading-6 text-muted">
              أرقام تقديرية حسب الإعدادات الحالية، والمبلغ النهائي والمدة يتضبطوا في وعد البيع.
              {projectStatus && projectStatus !== "published"
                ? ` حالة العرض توّا «${projectStatusLabel(projectStatus)}»، فالزائر ما يشوفش هذه الخطط حتى يتنشر.`
                : ""}
              {pricingOpen ? "" : " وحدة الأسعار مش محلولة للعموم، فالزائر ما يشوف حتى سعر توّا."}
            </p>
          </div>
        )}
      </Block>

      <Block id="offer-pricing-rules" title="قواعد التسعير" note="ثمن المتر، تكلفة الغراسة، الهامش، التدوير والمصاريف السنوية.">
        <RuleForm projectId={projectId} rule={rule} globalRule={globalRule} reasonMin={reasonMin} idPrefix={`offer-${projectId}-rule`} />
      </Block>

      <Block title="مصاريف هذا العرض" note="تُزاد على المصاريف العامة، ولّا تعوّضها كان ألغيت «استعمال المصاريف العامة».">
        <CostItemsList
          items={items}
          projectId={projectId}
          reasonMin={reasonMin}
          idPrefix={`offer-${projectId}-cost`}
          emptyText="ما فماش مصاريف خاصة بهذا العرض."
        />
      </Block>

      {/* The note says what an empty box really does, because «حذف النسب الخاصة» reads like «كيّف هذا العرض
          بلا تقسيط» and does the opposite: the duration goes back to the general markup and stays on offer. */}
      <Block
        title="الزيادة حسب مدّة التقسيط"
        note="خانة فارغة = تتبع نسبة القاعدة العامة، وهي مكتوبة داخل الخانة. تنحية النِّسَب الخاصة ما تلغيش التقسيط: المدة تبقى معروضة على الزائر بنسبة القاعدة العامة. المدد المعروضة توّا مكتوبة فوق."
      >
        <MarkupsForm
          projectId={projectId}
          durations={durations}
          markups={markups}
          globalMarkups={globalMarkups}
          maxMonths={maxMonths}
          reasonMin={reasonMin}
          idPrefix={`offer-${projectId}-markups`}
          note={rule?.markups_note_ar || (markupsNoteInherited ? globalRule?.markups_note_ar : null)}
          noteInherited={markupsNoteInherited}
        />
      </Block>

      <Block
        title="نِسَب التسبقة المسموحة"
        note="علّم النِّسَب اللي يعرضها هذا العرض. ما تعلّمش حتى وحدة = كل النِّسَب النشطة في «القوائم»، موش «بلا تقسيط». النِّسَب المعروضة توّا مكتوبة فوق."
      >
        <AllowedChoicesForm
          action={saveProjectDownPercents.bind(null, projectId)}
          choices={percents.map((item) => ({ id: item.id, label: percentLabel(item) }))}
          selected={projectPercentIds}
          legend="نِسَب التسبقة المسموحة لهذا العرض"
          emptyText="ما فماش نِسَب تسبقة نشطة. زيدها في «الإعدادات ← القوائم» ثمّ ارجع هنا."
          submitLabel="حفظ النِّسَب"
          reasonMin={reasonMin}
          idPrefix={`offer-${projectId}-percents`}
        />
      </Block>

      <Block title="فئات المساحة المسموحة" note="علّم فئات التباعد الموجودة في هذا العرض. ما تعلّمش حتى وحدة = كل الفئات النشطة.">
        <AllowedChoicesForm
          action={saveProjectSpacingClasses.bind(null, projectId)}
          choices={classes
            .filter((spacing) => spacing.is_active)
            .map((spacing) => ({
              id: spacing.id,
              label: spacing.label_ar,
              detail: `${formatSpacing(Number(spacing.row_spacing_m), Number(spacing.tree_spacing_m))} · ${formatArea(Number(spacing.area_m2))}`,
            }))}
          selected={projectClassIds}
          legend="فئات المساحة المسموحة لهذا العرض"
          emptyText="ما فماش فئات مساحة نشطة. زيدها أو فعّلها في «الإعدادات»."
          submitLabel="حفظ الفئات"
          reasonMin={reasonMin}
          idPrefix={`offer-${projectId}-classes`}
        />
      </Block>

      {hasOwnValues ? (
        <Block title="رجوع للقواعد العامة">
          <DeleteForm
            action={deletePricingRule.bind(null, projectId)}
            reasonId={`offer-${projectId}-delete-reason`}
            reasonMin={reasonMin}
            submitLabel="حذف القواعد الخاصة بهذا العرض"
            hint="تتنحّى قيم العرض (ثمن المتر، الغراسة، الهامش، التدوير، الملاحظات) مع مصاريفو ونِسَب الزيادة متاعو، ويرجع يتبع القواعد العامة. النِّسَب وفئات المساحة المسموحة تتبدّل من خاناتها فوق."
          />
        </Block>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What the visitor is offered, read from the database
// ---------------------------------------------------------------------------
//
// public.staff_project_quote is the Back Office twin of public.public_project_quote: both call
// app.project_quote_payload, so `choices` here is the very list the public offer page publishes — the offer's own
// percentages when it has any (app.project_down_percent_items), otherwise the active list; and the active
// durations within pricing.max_months that carry a markup, its own or the general one. Reading anything else
// would create a second source of truth, which is the bug this block exists to end.

type StaffClient = Awaited<ReturnType<typeof createClient>>;

/** One choice a visitor may pick: a percentage of the cash total, or a number of months. */
type PlanChoice = { id: string; labelAr: string; value: number };

type VisitorPlans = {
  /** 'ok', 'legacy' (no spacing class) or 'unavailable' (the price could not be computed). */
  pricing: string;
  totalPriceMillimes: number | null;
  percents: PlanChoice[];
  durations: PlanChoice[];
};

type PlanPreview = {
  percent: PlanChoice;
  duration: PlanChoice;
  downMillimes: number | null;
  monthlyMillimes: number | null;
  installmentsCount: number | null;
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

const payload = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** `choices.down_percents` / `choices.durations` as the quote publishes them, in the order it sorted them. */
function planChoices(value: unknown, key: "percent" | "months"): PlanChoice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = payload(entry);
    const id = typeof row?.id === "string" ? row.id : null;
    const labelAr = typeof row?.label_ar === "string" ? row.label_ar : null;
    const figure = num(Number(row?.[key]));
    return id && labelAr && figure !== null ? [{ id, labelAr, value: figure }] : [];
  });
}

/** The offer's menu at its smallest basket. Null when the quote could not be read at all. */
async function visitorPlans(supabase: StaffClient, projectId: string, trees: number): Promise<VisitorPlans | null> {
  const { data, error } = await supabase.rpc("staff_project_quote", { p_project: projectId, p_trees: trees });
  const row = error ? null : payload(data);
  if (!row) return null;
  const choices = payload(row.choices) ?? {};
  return {
    pricing: typeof row.pricing === "string" ? row.pricing : "unavailable",
    totalPriceMillimes: num(row.total_price_millimes),
    percents: planChoices(choices.down_percents, "percent"),
    durations: planChoices(choices.durations, "months"),
  };
}

/**
 * One plan quoted in full: the smallest basket, the smallest down payment and the longest duration — the cheapest
 * monthly this offer can show, which is the figure a caller asks about first. Postgres computes it (app.
 * financed_quote); nothing here multiplies anything.
 */
async function planPreview(
  supabase: StaffClient,
  projectId: string,
  trees: number,
  plans: VisitorPlans,
): Promise<PlanPreview | null> {
  const percent = plans.percents[0];
  const duration = plans.durations[plans.durations.length - 1];
  if (!percent || !duration) return null;

  const { data, error } = await supabase.rpc("staff_project_quote", {
    p_project: projectId,
    p_trees: trees,
    p_payment_mode: "installments",
    p_down_percent_option_id: percent.id,
    p_duration_option_id: duration.id,
  });
  const installments = error ? null : payload(payload(data)?.installments);

  return {
    percent,
    duration,
    downMillimes: num(installments?.down_payment_millimes),
    monthlyMillimes: num(installments?.monthly_millimes),
    installmentsCount: num(installments?.installments_count),
  };
}

function Block({ id, title, note, children }: { id?: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 space-y-3 p-5 sm:p-6">
      <div>
        <h3 className="text-lg font-semibold text-forest">{title}</h3>
        {note ? <p className="mt-1 text-caption leading-6 text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}
