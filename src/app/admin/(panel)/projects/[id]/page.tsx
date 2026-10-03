// One offer of real stock — OFF-TNAYEUR and its kind — not a simulation.
//
// The owner, looking at this page on 2026-09-18: «here it is messed up, I cannot control the right thing, the
// calculation is too complicated and not that smart or useful, also the admin is not smart.» Everything he read
// came from public.parcels, which holds no rows: «إجمالي الزيتونات» summed an empty table, «السعر للزيتونة» was
// derived per lot and so came back undetermined, and the القطع tab asked him to cut the offer into pieces he had
// just retired. Meanwhile 600 numbered trees and both prices were sitting in the database.
//
// So the page now reads the offer, not its lots:
//   stock  → staff_offer_stock, through ../offer-stock (the one sanctioned reader)
//   price  → staff_project_quote, through ./offer-quote (app.tree_price, computed in Postgres)
//   trees  → public.trees, one row per olive tree, each with its own code
// Nothing on this page multiplies, divides or sums money (PRJ-03): the totals are the database's own.
//
// Every read still goes through the same role gates: requireStaff() for the page, WRITE_ROLES to change anything,
// FINANCE_ROLES for the internal costs (PRJ-03), TREE_ROLES to create or renumber inventory (app.can_manage_trees).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { treePricingReady } from "@/components/admin/legacy-pricing-notice";
import { SectionHeader, StatusPill } from "@/components/ui";
import { hasRole, PRICE_ROLES, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig, optionsFor, settingText } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatCount } from "@/lib/format";
import { IRRIGATION_LABELS } from "@/lib/land";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

import { offerStock } from "@/lib/backoffice/offers/stock";
import { CardTab } from "./card-tab";
import { PricingTab } from "./pricing-tab";
import { CostsTab, type ProjectCost } from "./costs-tab";
import { OfferIdentity, type AreaPerTree, type TreePrice } from "./identity";
import { offerQuote, type OfferQuote } from "./offer-quote";
import { OfferTabs, readOfferTab, type OfferTab } from "./offer-tabs";
import { PicturesTab, type OfferPicture } from "./pictures-tab";
import { SpacingAndPrice, type SpacingChoice } from "./spacing-price";
import { OfferStockTiles, TreesTab, type HeldTree, type StockLabels } from "./trees-tab";
// The filter comes from the plain module, never from the "use client" one: a Server Component that imports a
// value across that boundary receives a client-reference proxy, not the value.
import { isTreeFilter, type TreeFilter } from "./tree-filter";

export const metadata: Metadata = { title: "العرض" };

const WRITE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
const FINANCE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
/** app.can_manage_trees (0054): numbering an offer's trees is stock keeping, not a sale. */
const TREE_ROLES = ["agri_manager", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
/**
 * Releasing a held tree needs app.can_manage_trees AND app.can_see_person(held_by), because a tree that is not
 * available always has a holder (0054 §7, the trees_holder_check). The two lists meet here: the agricultural
 * manager numbers stock but reads no client file, so the database refuses their release and the button is not
 * drawn for them. A commercial is the other way round and never keeps stock.
 */
const TREE_RELEASE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fifty codes a screen: a phone scrolls them, and the four counts above already answer «how many». */
const TREE_PAGE_SIZE = 50;

/** Pages under /projects show internal, published, sold-out and operating projects only. */
const ON_SITE = ["internal", "published", "sold_out", "operating"];

export default async function OfferPage({ params, searchParams }: PageProps<"/admin/projects/[id]">) {
  const session = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const canWrite = hasRole(session, WRITE_ROLES);
  const canSeeCosts = hasRole(session, FINANCE_ROLES);
  const canManageTrees = hasRole(session, TREE_ROLES);
  const canReleaseTrees = hasRole(session, TREE_RELEASE_ROLES);
  // التسعير is shown to whoever may set a price, which is the same gate /admin/pricing has always had. A reader
  // without it keeps بيانات العرض and الزيتونات, and never sees a tab they cannot use.
  const canPrice = hasRole(session, PRICE_ROLES);
  const tabs: OfferTab[] = [
    "card",
    "trees",
    ...(canPrice ? (["pricing"] as const) : []),
    ...(canSeeCosts ? (["costs"] as const) : []),
  ];
  const search = await searchParams;
  const tab = readOfferTab(search.tab, tabs);
  // Which held trees the الزيتونات tab lists, and where in them. Both live in the address, so a colleague can be
  // sent «the sold ones of this offer, page 2» as a link.
  const treeFilter: TreeFilter = isTreeFilter(search.state) ? search.state : "held";
  const treePage = Math.min(Math.max(1, Math.trunc(Number(search.page)) || 1), 10_000);

  const supabase = await createClient();
  const config = await getPublicConfig();

  const [{ data: project }, { data: settingRows }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);
  if (!project) notFound();

  const reasonMinValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonMinValue === "number" && Number.isFinite(reasonMinValue) ? reasonMinValue : 1;

  // Plan P5-3 / Q-13: the spacing class is what gives one tree its area, and the area is what prices it.
  const [{ data: classRows }, media, stock] = await Promise.all([
    supabase
      .from("project_spacing_classes")
      .select("spacing:tree_spacing_classes(id, label_ar, area_m2, row_spacing_m, tree_spacing_m, is_active)")
      .eq("project_id", id),
    supabase
      .from("project_media")
      .select("id, url, alt_ar, caption_ar, is_cover, sort_order")
      .eq("project_id", id)
      .order("sort_order")
      .order("created_at"),
    offerStock(supabase, id),
  ]);
  const attachedClasses = (classRows ?? []).flatMap((row) => (row.spacing ? [row.spacing as SpacingChoice] : []));
  const pictures = (media.data ?? []) as OfferPicture[];

  // The trees this quote is about: the rows that exist, never more than the offer declares (the database refuses
  // a larger figure). The multiplication itself is Postgres's — nothing here computes money.
  const declaredTrees = project.tree_count ?? 0;
  // numeric arrives as a string or a number depending on the driver, and "0.00" is truthy: every test of this
  // figure goes through the same Number() so a zero area reads as a zero area.
  const totalAreaM2 = project.total_area_m2 === null ? null : Number(project.total_area_m2);
  const quoteTrees = stock.trees_total > 0 ? Math.min(stock.trees_total, declaredTrees || stock.trees_total) : declaredTrees;
  const quote = await offerQuote(supabase, id, quoteTrees);

  const newPricing = treePricingReady(config);
  // Pricing this offer happens on this offer. It used to send the reader to /admin/pricing?project=<id>, which
  // no longer holds anything about one offer — that page is the general rule the calculator estimates with.
  const pricingHref = `/admin/projects/${id}?tab=pricing`;
  const spacingHref = `/admin/projects/${id}?tab=pricing#spacing`;
  const treesHref = `/admin/projects/${id}?tab=trees`;
  const cardHref = `/admin/projects/${id}?tab=card`;
  const demandsHref = `/admin/leads?request_kind=offer&project_id=${encodeURIComponent(id)}`;

  // What stops the price from existing, in the owner's own vocabulary: when app.tree_price says the rule is
  // incomplete it names only the margin, so the empty field is looked up and named here (Finance and Admin see
  // the reason at all — app.can_price gates the breakdown).
  const missingInput = quote?.reason === "margin_not_set" ? await missingPricingInput(supabase, id) : null;
  const pricePerTree = treePriceOf(quote, {
    offer: { areaM2: totalAreaM2, trees: declaredTrees },
    cardHref,
    spacingHref,
    pricingHref,
    missingInput,
    canPrice,
  });

  // «المساحة لكل زيتونة»: a class measures it exactly; the offer's own two numbers only estimate it.
  //
  // The quote's figure counts as the CLASS's only while a class is what the quote used. Once app.tree_price
  // derives the area from المساحة ÷ الزيتونات for an offer that lists no class (2026-10-03), the same
  // `area_per_tree_m2` key carries a derived figure — and labelling that «من فئة المساحة» would credit a
  // class the offer does not have.
  const declaredArea = totalAreaM2 && project.tree_count ? totalAreaM2 / project.tree_count : null;
  const classArea = quote?.spacingStatus === "ok" && quote.areaPerTreeM2 ? Number(quote.areaPerTreeM2) : null;
  const areaPerTree: AreaPerTree | null = classArea
    ? { m2: classArea, source: "class" }
    : declaredArea
      ? { m2: Math.round(declaredArea * 100) / 100, source: "declared" }
      : null;

  const governorate = config.governorates.find((g) => g.id === project.governorate_id)?.name_ar ?? "";
  const documents = optionsFor(config, "land_document")
    .filter((option) => project.document_option_ids.includes(option.id))
    .map((option) => option.label_ar);

  // The four figures the owner named; their Arabic lives in settings (offers.stock_*, 0054), never here.
  const label = (key: string, fallback: string) => settingText(config, key, fallback) || fallback;
  const stockLabels: StockLabels = {
    total: label("offers.stock_total_label", "إجمالي الزيتونات"),
    available: label("offers.stock_available_label", "المتاحة"),
    reserved: label("offers.stock_reserved_label", "المحجوزة"),
    sold: label("offers.stock_sold_label", "المباعة"),
  };

  // PRJ-04: what is actually wrong with this offer, and where to go about it. Each of these can fire today —
  // the three they replace all read parcel rows, so none of them ever could.
  //
  // WHAT LEFT, 2026-10-03 (owner: «there is no need for the space surface»). A third banner stood here —
  // «هذا العرض بلا فئة مساحة: ما يتحسب حتى سعر للزيتونة» — and it fired on FOURTEEN of the eighteen offers,
  // ten of them published. Not because he had forgotten to configure something: public.tree_spacing_classes
  // holds eight fixed densities, 6 · 8 · 25 · 35 · 49 · 100 · 196 · 576 m² per tree, and his land falls
  // between them (DEMO-15 at 250 m² per tree, DEMO-14 at 43.78). The class fed app.tree_price exactly one
  // number, v_class.area_m2, which public.projects already carries as total_area_m2 ÷ tree_count. So the
  // class became optional in the database and the banner is replaced by the two figures that do price a
  // tree now — and both of them live on بطاقة العرض, one click away instead of in a taxonomy.
  const warnings: { text: string; href?: string; action?: string }[] = [];
  if (declaredTrees < 1) {
    warnings.push({
      text: "هذا العرض ما عندوش عدد زيتونات مكتوب: ما ينجّمش يترقّم، ما يتباعش بالزيتونة، وما يتحسبش سعر الزيتونة.",
      href: cardHref,
      action: "اكتب عدد الأشجار",
    });
  }
  if (newPricing && !totalAreaM2) {
    warnings.push({
      text: "هذا العرض ما عندوش مساحة جملية: سعر الزيتونة يتحسب من المساحة ÷ عدد الأشجار، فالموقع ما يعرضش سعر وما يفتحش استمارة الاهتمام.",
      href: cardHref,
      action: "اكتب المساحة الجملية",
    });
  }
  if (stock.status === "partial") {
    warnings.push({
      text: `عدد الزيتونات المرقّمة (${formatCount(stock.trees_total)}) يختلف على العدد المصرّح به (${formatCount(
        stock.trees_declared ?? 0,
      )}).`,
      href: treesHref,
      action: "أعد الترقيم",
    });
  }

  const [costs, allClasses, treeRows, firstTree, lastTree] = await Promise.all([
    canSeeCosts && tab === "costs"
      ? supabase.from("project_costs").select("id, kind, label, amount_millimes").eq("project_id", id).order("created_at")
      : Promise.resolve({ data: [] as ProjectCost[] }),
    tab === "pricing"
      ? supabase
          .from("tree_spacing_classes")
          .select("id, label_ar, area_m2, row_spacing_m, tree_spacing_m, is_active")
          .order("sort_order")
          .order("label_ar")
      : Promise.resolve({ data: [] as SpacingChoice[] }),
    // Only the trees somebody holds: the rest are available and identical, and 500 identical rows tell nobody
    // anything. RLS already limits public.trees to staff (0054). One page at a time, and the total is counted by
    // Postgres in the same statement — never summed here.
    tab === "trees"
      ? (treeFilter === "held"
          ? supabase.from("trees").select("id, code, state, allocated_at, held_by", { count: "exact" }).eq("project_id", id).neq("state", "available")
          : supabase.from("trees").select("id, code, state, allocated_at, held_by", { count: "exact" }).eq("project_id", id).eq("state", treeFilter)
        )
          .order("seq")
          .range((treePage - 1) * TREE_PAGE_SIZE, treePage * TREE_PAGE_SIZE - 1)
      : Promise.resolve({
          data: [] as { id: string; code: string; state: HeldTree["state"]; allocated_at: string | null; held_by: string | null }[],
          count: 0 as number | null,
        }),
    // The code range, read in tree order (seq), because a code is text and sorts alphabetically.
    tab === "trees" ? supabase.from("trees").select("code").eq("project_id", id).order("seq").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    tab === "trees"
      ? supabase.from("trees").select("code").eq("project_id", id).order("seq", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Who holds them. A commercial reads only their own files, so a name that RLS hides simply does not show.
  const heldRows = treeRows.data ?? [];
  const holderIds = [...new Set(heldRows.flatMap((tree) => (tree.held_by ? [tree.held_by] : [])))];
  const holders =
    holderIds.length > 0 ? await supabase.from("persons").select("id, full_name").in("id", holderIds) : { data: [] as { id: string; full_name: string }[] };
  const holderName = new Map((holders.data ?? []).map((person) => [person.id, person.full_name]));
  const held: HeldTree[] = heldRows.map((tree) => ({
    id: tree.id,
    code: tree.code,
    state: tree.state,
    allocatedAt: tree.allocated_at,
    holderId: tree.held_by,
    holderName: tree.held_by ? (holderName.get(tree.held_by) ?? null) : null,
  }));
  const codeRange = firstTree.data?.code && lastTree.data?.code ? { first: firstTree.data.code, last: lastTree.data.code } : null;

  return (
    <div className="space-y-5">
      <Link href="/admin/projects" className="inline-block text-sm font-semibold text-forest underline-offset-4 hover:underline">
        → العروض
      </Link>

      <SectionHeader
        level={1}
        title={project.name}
        badge={<StatusPill toneClass={projectStatusTone(project.status)}>{projectStatusLabel(project.status)}</StatusPill>}
        description={
          <span dir="ltr" className="inline-block text-sm">
            {project.code}
            {governorate ? ` · ${governorate}` : ""}
          </span>
        }
        actions={
          <>
            {ON_SITE.includes(project.status) ? (
              <Link href={`/projects/${encodeURIComponent(project.code)}`} target="_blank" className="btn btn-ghost btn-sm">
                معاينة في الموقع ↗
              </Link>
            ) : null}
            {/* From the offer to the demands made on it. public.crm_search_requests has filtered on
                project_id since 0052 and parseLeadFilters reads it out of the address since 2026-09-19, so
                this is the whole feature: until now a commercial standing on TX-00215 had no way to ask who
                asked for it, and had to go to the list and rebuild the search by hand. */}
            <Link href={demandsHref} className="btn btn-ghost btn-sm">
              مطالب هذا العرض
            </Link>
            {/* The offer's name, description and conditions in the four other languages (0109): edited in
                the translation room, which this opens on this offer. */}
            <Link
              href={`/admin/settings/translations?tab=offers&q=${encodeURIComponent(project.code.toLowerCase())}`}
              className="btn btn-ghost btn-sm"
            >
              الترجمات
            </Link>
            {newPricing && canWrite ? (
              <Link href={pricingHref} className="btn btn-ghost btn-sm">
                قواعد التسعير
              </Link>
            ) : null}
          </>
        }
      />

      <OfferIdentity
        locationText={[project.location_description, governorate].filter(Boolean).join(" · ")}
        totalAreaM2={totalAreaM2}
        declaredTrees={project.tree_count}
        variety={project.olive_variety}
        ageYears={project.tree_age_years === null ? null : Number(project.tree_age_years)}
        productionText={project.production_status ? (PRODUCTION_LABELS[project.production_status] ?? project.production_status) : null}
        plantationText={project.plantation_system ? (PLANTATION_LABELS[project.plantation_system] ?? project.plantation_system) : null}
        irrigationText={project.irrigation ? ((IRRIGATION_LABELS as Record<string, string>)[project.irrigation] ?? project.irrigation) : null}
        areaPerTree={areaPerTree}
        documents={documents}
        pricePerTree={pricePerTree}
      />

      <OfferStockTiles stock={stock} labels={stockLabels} treesHref={treesHref} />

      {warnings.length > 0 ? (
        <ul className="space-y-2">
          {warnings.map((warning) => (
            <li key={warning.text} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold-soft px-4 py-3 text-sm text-forest-700">
              <span>{warning.text}</span>
              {warning.href ? (
                <Link href={warning.href} className="font-semibold underline underline-offset-4">
                  {warning.action}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <OfferTabs
        projectId={id}
        active={tab}
        tabs={tabs}
        counts={{ trees: stock.status === "not_generated" ? undefined : stock.trees_total }}
      />

      {/* «بيانات العرض» holds the three things that answer «what is this offer and what does the visitor see»:
          its card, what prices it, and its pictures. See ./offer-tabs.tsx for why they are one tab and not four. */}
      {tab === "card" ? (
        <div className="space-y-8">
          <CardTab project={project} config={config} canWrite={canWrite} />
          <PicturesTab projectId={id} pictures={pictures} canWrite={canWrite} />
        </div>
      ) : null}

      {tab === "trees" ? (
        <TreesTab
          // A new page or a new filter is a new list, so the selection never survives into rows nobody ticked.
          key={`${treeFilter}-${treePage}`}
          projectId={id}
          offerCode={project.code}
          stock={stock}
          labels={stockLabels}
          codeRange={codeRange}
          held={held}
          declaredTrees={project.tree_count}
          canManage={canManageTrees}
          canRelease={canReleaseTrees}
          offerMinimum={project.min_trees_per_order}
          filter={treeFilter}
          page={treePage}
          pageSize={TREE_PAGE_SIZE}
          matched={treeRows.count ?? held.length}
          reasonMin={reasonMin}
        />
      ) : null}

      {/* «التسعير» holds everything that decides what one tree of this offer costs — starting with the spacing
          class, which used to sit under بيانات العرض, one screen away from the rules that use it. */}
      {tab === "pricing" && canPrice ? (
        <div className="space-y-8">
          <SpacingAndPrice
            projectId={id}
            attached={attachedClasses}
            choices={(allClasses.data ?? []) as SpacingChoice[]}
            pricePerTree={pricePerTree}
            reasonMin={reasonMin}
            canWrite={canWrite}
            treePricingReady={newPricing}
          />
          <PricingTab projectId={id} />
        </div>
      ) : null}

      {tab === "costs" && canSeeCosts ? (
        <CostsTab projectId={id} costs={(costs.data ?? []) as ProjectCost[]} expectedRevenue={quote?.totalPriceMillimes ?? null} />
      ) : null}
    </div>
  );
}

/**
 * The price per tree, or the one thing standing in its way — named, with the screen that supplies it.
 * «يتحدّد بعد اعتماد فئة المساحة» was the old answer to every case: passive, and false on both live offers.
 *
 * NO BRANCH DEMANDS A SPACING CLASS ANY MORE (owner, 2026-10-03). app.tree_price took one number from the
 * class, its area, and derives it from المساحة ÷ الزيتونات when the offer lists none — so the cases that can
 * still refuse are the offer's own two numbers, the bounds on what they produce, and the pricing rules. A
 * class remains something an offer MAY pick, and the two branches below cover a pick that has gone wrong.
 *
 * Every link is gated on `canPrice`: فئة المساحة and قواعد التسعير both live inside the التسعير tab, which
 * readOfferTab refuses to a reader without PRICE_ROLES — so for them the sentence names the blocker and says
 * who fixes it, instead of carrying a link that lands back on بطاقة العرض.
 */
function treePriceOf(
  quote: OfferQuote | null,
  links: {
    /** The two figures on بطاقة العرض the area now comes from. */
    offer: { areaM2: number | null; trees: number | null };
    cardHref: string;
    spacingHref: string;
    pricingHref: string;
    missingInput: string | null;
    canPrice: boolean;
  },
): TreePrice {
  if (!quote) return null;
  if (quote.pricing === "ok" && quote.pricePerTreeMillimes) {
    return { millimes: quote.pricePerTreeMillimes, annualMillimes: quote.annualFeePerTreeMillimes };
  }

  // Both of these are sections of the التسعير tab, which readOfferTab refuses to a reader without
  // PRICE_ROLES: undefined, so TreePriceValue draws the sentence and no link.
  const pricingHref = links.canPrice ? links.pricingHref : undefined;
  const spacingHref = links.canPrice ? links.spacingHref : undefined;

  // The offer's own two numbers come first: they are what the area is computed from now, they are on a screen
  // the reader is already looking at, and a reader without app.can_price receives no reason code at all — so
  // for them this is the only answer there is to give.
  const missing = missingOfferInput(links.offer);
  if (missing) return { blocked: missing.text, href: links.cardHref, action: missing.action };

  if (quote.spacingStatus === "required") {
    return { blocked: "العرض فيه أكثر من فئة مساحة: خلّي وحدة برك باش يتحدّد السعر.", href: spacingHref, action: "اختر فئة وحدة" };
  }
  if (quote.reason === "spacing_not_found" || quote.spacingStatus === "not_allowed") {
    return {
      blocked: "فئة المساحة المعلّمة في هذا العرض تعطّلت: فعّلها، بدّلها، ولّا نحّيها وخلّي السعر يتحسب من المساحة ÷ عدد الأشجار.",
      href: spacingHref,
      action: "بدّل فئة المساحة",
    };
  }
  // `area_out_of_range` is the string the DATABASE actually raises (0118: app.tree_price_for_area and
  // app.project_quote_payload). This branch read `area_out_of_bounds` and so never fired: an offer whose area
  // per tree falls outside the bounds fell through to the generic «السعر ما تحسبش» at the foot, which sends
  // the reader to قواعد التسعير — the wrong screen entirely, because the two numbers at fault are the area
  // and the tree count on بطاقة العرض. Two agents named the same state differently and nothing typechecks a
  // string compared against a string.
  if (quote.reason === "area_out_of_range") {
    return {
      blocked: "المساحة لكل زيتونة (المساحة الجملية ÷ عدد الأشجار) برّا الحدود المقبولة في قواعد التسعير: ثبّت الزوز أرقام.",
      href: links.cardHref,
      action: "ثبّت المساحة وعدد الأشجار",
    };
  }
  if (quote.reason === "margin_not_set") {
    return { blocked: links.missingInput ?? "قواعد التسعير مازالت ناقصة.", href: pricingHref, action: "افتح قواعد التسعير" };
  }
  return {
    blocked: links.canPrice
      ? "السعر ما تحسبش. تثبّت من قواعد التسعير متاع هذا العرض."
      : "السعر ما تحسبش. اطلب من المالية تثبّت من قواعد تسعير هذا العرض.",
    href: pricingHref,
    action: "افتح قواعد التسعير",
  };
}

/**
 * The two figures on بطاقة العرض that price a tree once no class is required: with either of them empty
 * app.tree_price has no area to work from. The database refuses these as reason codes of its own, but they
 * are named here rather than read back from the quote, because they are also the only blockers a reader
 * without app.can_price can be told about — and because the fix is a field, not a rule.
 */
function missingOfferInput(offer: { areaM2: number | null; trees: number | null }): { text: string; action: string } | null {
  if (!offer.areaM2 || offer.areaM2 <= 0) {
    return {
      text: "سعر الزيتونة يتحسب من المساحة الجملية ÷ عدد الأشجار، والمساحة الجملية مازالت فارغة.",
      action: "اكتب المساحة الجملية",
    };
  }
  if (!offer.trees || offer.trees <= 0) {
    return {
      text: "سعر الزيتونة يتحسب من المساحة الجملية ÷ عدد الأشجار، وعدد الأشجار مازال فارغ.",
      action: "اكتب عدد الأشجار",
    };
  }
  return null;
}

/**
 * app.tree_price returns one reason, 'margin_not_set', for four different empty fields (0045:80), and the Back
 * Office used to translate it as «اضبط الهامش» — sending the owner to change the margin when what is missing is
 * the land price. So the resolved rule is read here, offer row first then the global one, and the first empty
 * field is named. Finance and Admin only: tree_pricing_rules is closed to everyone else (0031), and so is the
 * reason that brings us here.
 */
async function missingPricingInput(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string): Promise<string | null> {
  const { data } = await supabase
    .from("tree_pricing_rules")
    .select("project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes, price_rounding_millimes, margin_mode")
    .or(`project_id.eq.${projectId},project_id.is.null`);
  const rows = data ?? [];
  // Neither this offer's rule nor the general one exists: «اضبط الهامش» would be the fourth wrong answer in a
  // row, because there is no rule to set a margin on yet.
  if (rows.length === 0) return "ما فمّاش قواعد تسعير مسجّلة: اكتب ثمن المتر المربع، تكلفة الغراسة، الهامش والتدوير.";

  const own = rows.find((row) => row.project_id === projectId);
  const global = rows.find((row) => row.project_id === null);
  const resolved = <K extends "land_price_per_m2_millimes" | "planting_cost_per_tree_millimes" | "price_rounding_millimes" | "margin_mode">(
    key: K,
  ) => own?.[key] ?? global?.[key] ?? null;

  if (resolved("land_price_per_m2_millimes") === null) return "ثمن المتر المربع مازال ما تكتبش في قواعد التسعير.";
  if (resolved("planting_cost_per_tree_millimes") === null) return "تكلفة الغراسة للزيتونة مازالت ما تكتبش في قواعد التسعير.";
  if (resolved("margin_mode") === null) return "هامش AgriZed مازال ما تضبطش في قواعد التسعير.";
  if (resolved("price_rounding_millimes") === null) return "تدوير السعر مازال ما تضبطش في قواعد التسعير.";
  return null;
}
