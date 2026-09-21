"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { hasRole, PRICE_ROLES, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig, settingInt } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { readPricingForm } from "@/lib/pricing-form";
import { COST_KINDS } from "@/lib/projects";
import { PUBLIC_PROJECTS_TAG } from "@/lib/public-projects";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const WRITE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

// The same two rules the database enforces (0054 §1), checked again here so a refused act is a readable sentence
// instead of a Postgres error: stock keeping — numbering, renumbering and releasing trees — is the agricultural
// manager's, Finance's and Admin's; marking a tree sold is the contract moment and stays with Legal, Finance and
// Admin. A commercial reserves inside their own file and never creates or destroys inventory.
const TREE_MANAGE_ROLES = ["agri_manager", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
const TREE_CONTRACT_ROLES = ["legal", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

const FAILED_MESSAGE = "تعذّر الحفظ. تحقق من القيم وحاول مرة أخرى.";
const FAILED: ActionResult = { ok: false, message: FAILED_MESSAGE };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string, max: number): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function optionalNumber(formData: FormData, name: string): number | null | undefined {
  const raw = String(formData.get(name) ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function dinarsToMillimes(value: number | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value;
  return Math.round(value * 1000);
}

/** The public projects pages cache their rows; any change to a project or parcel expires them. */
function expirePublicProjects() {
  updateTag(PUBLIC_PROJECTS_TAG);
  revalidatePath("/projects", "layout");
}

const PLANTATION = ["", "traditional", "intensive", "other"] as const;
const PRODUCTION = ["", "none", "starting", "producing"] as const;
const IRRIGATION = ["", "rainfed", "irrigated"] as const;

/**
 * Pricing formulas are data, never code (PRN-02 / SIM-06), and are edited with plain fields (PricingEditor).
 * value null = no formula of its own: the project uses the default, the parcel uses its project's.
 *
 * Read ONLY when the form carries `pricing_mode`. The legacy jsonb editor left the offer card on 2026-09-18
 * (it wrote projects.pricing, which only app.parcel_pricing(p_parcel) reads, and no parcel row exists), so
 * neither the card form nor the «عرض جديد» form submits that field any more. Reading it unconditionally made
 * every card save fail with «اختر طريقة التسعير.». The column is NOT NULL default '{}', so omitting the key
 * is safe on insert and leaves the stored formula untouched on update.
 */
function parsePricing(formData: FormData): { ok: true; value: Json | null } | { ok: false; message: string } {
  const result = readPricingForm(formData, { allowInherit: true });
  return result.ok ? { ok: true, value: result.value as Json | null } : result;
}

function coordinate(formData: FormData, name: string, limit: number): number | null | undefined {
  const raw = String(formData.get(name) ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? Math.round(value * 1e6) / 1e6 : undefined;
}

/** Checked items of an option list, as ids. Unknown or inactive ids are simply not shown by the site. */
function optionIds(formData: FormData, name: string): string[] {
  return [...new Set(formData.getAll(name).map(String).filter((id) => UUID.test(id)))].slice(0, 30);
}

type PageFields = {
  description_ar: string | null;
  water_available: boolean | null;
  water_note: string | null;
  access_note: string | null;
  video_url: string | null;
  latitude: number | null;
  longitude: number | null;
  show_location: boolean;
  document_option_ids: string[];
  service_option_ids: string[];
};

/** Report v3 §20: what the public project page shows beyond the listing facts. */
function readPageFields(formData: FormData): { ok: true; value: PageFields } | { ok: false; message: string } {
  const videoUrl = text(formData, "video_url", 500);
  if (videoUrl && !/^https:\/\/[^ ]+$/.test(videoUrl)) {
    return { ok: false, message: "رابط الفيديو يبدأ بـ https://، مثال: https://www.youtube.com/watch?v=…" };
  }

  const latitude = coordinate(formData, "latitude", 90);
  const longitude = coordinate(formData, "longitude", 180);
  if (latitude === undefined || longitude === undefined || (latitude === null) !== (longitude === null)) {
    return { ok: false, message: "اكتب خط العرض وخط الطول معاً بالأرقام، مثال: 34.55 و 10.30." };
  }
  const showLocation = formData.get("show_location") === "on";
  if (showLocation && latitude === null) {
    return { ok: false, message: "اكتب خط العرض وخط الطول قبل إظهار الموقع في صفحة المشروع." };
  }

  const water = String(formData.get("water_available") ?? "");
  return {
    ok: true,
    value: {
      description_ar: text(formData, "description_ar", 4000) || null,
      water_available: water === "yes" ? true : water === "no" ? false : null,
      water_note: text(formData, "water_note", 300) || null,
      access_note: text(formData, "access_note", 300) || null,
      video_url: videoUrl || null,
      latitude,
      longitude,
      show_location: showLocation,
      document_option_ids: optionIds(formData, "document_option_ids"),
      service_option_ids: optionIds(formData, "service_option_ids"),
    },
  };
}

/**
 * A check constraint of `public.projects` refused the row, said in the owner's words: which field, and the
 * move that fixes it. The two the offer card can trip are the ones migration 0054 added — the minimum basket
 * against the declared tree count, and the numbering pattern.
 */
function projectCheckError(error: { message?: string }): ActionResult {
  const message = error.message ?? "";
  if (message.includes("projects_min_trees_check")) {
    return {
      ok: false,
      message: "أقلّ عدد زيتونات في الطلب لازم يكون 1 على الأقل، وأصغر ولا يساوي عدد الزيتونات المصرّح به في هذه البطاقة. كبّر عدد الزيتونات، ولا صغّر أقلّ عدد.",
    };
  }
  if (message.includes("projects_tree_code_pattern_check")) {
    return {
      ok: false,
      message: "صيغة ترقيم الزيتونات لازم تحتوي على {seq} وتكون بين 5 و60 حرف، مثال: {offer}-{seq}.",
    };
  }
  return FAILED;
}

export async function saveProject(projectId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);

  const name = text(formData, "name", 160);
  if (!name) return { ok: false, message: "اكتب اسم المشروع." };
  const governorateId = Number(formData.get("governorate_id"));
  if (!Number.isInteger(governorateId) || governorateId <= 0) return { ok: false, message: "اختر الولاية." };

  const pricing = formData.has("pricing_mode") ? parsePricing(formData) : null;
  if (pricing && !pricing.ok) return pricing;

  const totalArea = optionalNumber(formData, "total_area_m2");
  const treeCount = optionalNumber(formData, "tree_count");
  const treeAge = optionalNumber(formData, "tree_age_years");
  const annualCosts = optionalNumber(formData, "annual_costs_dinars");
  if (totalArea === undefined || treeCount === undefined || treeAge === undefined || annualCosts === undefined) {
    return { ok: false, message: "المساحة وعدد الأشجار والعمر والمصاريف تُكتب بالأرقام." };
  }

  const status = z
    .enum(["draft", "preparing", "internal", "published", "sold_out", "operating", "archived"])
    .safeParse(formData.get("status"));
  const plantation = z.enum(PLANTATION).safeParse(formData.get("plantation_system") ?? "");
  const production = z.enum(PRODUCTION).safeParse(formData.get("production_status") ?? "");
  const irrigation = z.enum(IRRIGATION).safeParse(formData.get("irrigation") ?? "");
  if (!status.success || !plantation.success || !production.success || !irrigation.success) return FAILED;

  // An offer that is shown to a buyer has to have something to sell (owner's data, 2026-09-19). TX-002 sat
  // published on the live site with no tree count: the catalogue showed it, under the same name as a real
  // offer, and the page opened no form on it because it computes what is buyable from that count. A dead end
  // wearing a real offer's name. This page already printed the warning and then saved anyway; now it refuses.
  //
  // WHY HERE AND NOT IN THE DATABASE. I drafted it as a trigger first, and the test suite refused it: nine
  // files publish offers with no tree count, and they are right to — 033 and 034 do it deliberately, to pin
  // that numbering an offer with no declared count raises `offer_has_no_trees`. A rule a tenth of your own
  // suite has to violate is not an invariant; it is a publishing policy, and a policy belongs where the person
  // making the decision is, with a sentence telling them what to do about it. The price is deliberately NOT
  // part of it: «السعر يُعلن لاحقاً» (projects.price_pending) is a state this product ships copy for, so an
  // offer may go out before its price is settled.
  const SHOWN_TO_BUYERS = ["published", "internal"] as const;
  if ((SHOWN_TO_BUYERS as readonly string[]).includes(status.data) && (treeCount ?? 0) < 1) {
    return {
      ok: false,
      message:
        "ما تنجّمش تنشر عرض بلا عدد زيتونات: الزائر يشوفو وما يلقى فيه شنوّة يشري. اكتب عدد الأشجار فوق، ولّا خلّي الحالة «مسودة» حتى يكمّل.",
    };
  }

  // Written only when the form carries the page fields, so the short «new project» form never erases them.
  const page = formData.has("page_fields") ? readPageFields(formData) : null;
  if (page && !page.ok) return page;

  // How this offer sells its trees (migration 0054, step 6 of its own header): the smallest basket a client
  // may ask for, and how the trees are numbered. Both are guarded by formData.has() like delegation_id, so
  // the short «عرض جديد» form leaves them as they are. Empty = inherit the setting, which is why "" is written
  // as null rather than skipped: clearing the field must give the offer back to offers.min_trees_default.
  const minTrees = formData.has("min_trees_per_order") ? optionalNumber(formData, "min_trees_per_order") : undefined;
  if (minTrees === undefined && formData.has("min_trees_per_order")) {
    return { ok: false, message: "أقلّ عدد زيتونات في الطلب يتكتب بالأرقام، مثال: 5. خلّيه فارغ باش ياخذ العدد الافتراضي من الإعدادات." };
  }
  const codePattern = formData.has("tree_code_pattern") ? text(formData, "tree_code_pattern", 60) : undefined;
  if (codePattern !== undefined && codePattern !== "" && !codePattern.includes("{seq}")) {
    return {
      ok: false,
      message: "صيغة ترقيم الزيتونات لازم تحتوي على {seq}، مثال: {offer}-{seq}. خلّيها فارغة باش تاخذ الصيغة الافتراضية من الإعدادات.",
    };
  }

  const row = {
    name,
    project_type_id: text(formData, "project_type_id", 40) || null,
    governorate_id: governorateId,
    // Written only when the form carries the field, so editing a project never erases its delegation.
    ...(formData.has("delegation_id") ? { delegation_id: Number(formData.get("delegation_id")) || null } : {}),
    location_description: text(formData, "location_description", 1000) || null,
    total_area_m2: totalArea,
    olive_variety: text(formData, "olive_variety", 120) || null,
    tree_count: treeCount === null ? null : Math.round(treeCount),
    tree_age_years: treeAge,
    plantation_system: plantation.data || null,
    production_status: production.data || null,
    irrigation: irrigation.data || null,
    annual_costs_millimes: dinarsToMillimes(annualCosts) ?? null,
    // {} = no formula of its own: app.parcel_pricing() falls back to the default setting. Written only when the
    // form carried the pricing fields, so a card save never resets a stored formula to «inherit».
    ...(pricing?.ok ? { pricing: pricing.value ?? {} } : {}),
    ...(minTrees === undefined ? {} : { min_trees_per_order: minTrees === null ? null : Math.round(minTrees) }),
    ...(codePattern === undefined ? {} : { tree_code_pattern: codePattern || null }),
    status: status.data,
    ...(page?.ok ? page.value : {}),
  };

  const supabase = await createClient();
  if (projectId) {
    const { data, error } = await supabase.from("projects").update(row).eq("id", projectId).select("id");
    if (error) return projectCheckError(error);
    if (!data?.length) return FAILED;
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath("/admin/projects");
    expirePublicProjects();
    return { ok: true, message: "تم حفظ المشروع." };
  }

  const code = z
    .string()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,20}$/)
    .safeParse(text(formData, "code", 21).toUpperCase());
  if (!code.success) return { ok: false, message: "رمز المشروع بأحرف لاتينية كبيرة وأرقام و«-»، مثال: SFX-01" };

  const { error } = await supabase.from("projects").insert({ ...row, code: code.data });
  if (error) return error.code === "23505" ? { ok: false, message: "هذا الرمز مستعمل." } : projectCheckError(error);
  revalidatePath("/admin/projects");
  expirePublicProjects();
  return { ok: true, message: `تم إنشاء المشروع ${code.data}.` };
}

// WHAT LEFT, 2026-09-18 (owner: «remove the pieces thing, its simply selling the trees»). `saveParcel()` and
// `parcelError()` stood here: the only write path into `public.parcels` from the Back Office. Both of their
// forms are gone — the «القطع» tab of the offer page and the lot page under /admin/projects/{id}/parcels —
// so nothing called either one, and `saveParcel` still revalidated a route that no longer exists. The table,
// its RPCs and its tests are untouched: this phase closes the parcel layer on screen, and the database layer
// is retired later with tests of its own. The offer's trees are written by generateOfferTrees /
// allocateOfferTrees / setTreeState below.

/**
 * Plan Q-13: the spacing classes this offer is planted with.
 *
 * It is also the switch that puts the offer on the tree pricing at all: a lot of an offer that lists classes is a
 * number of trees of one class, and its area and price are then computed (app.parcel_price). An offer with no
 * class prices nothing — no price on the site, and no interest form — which is why this now lives on the offer's
 * own page instead of only in «التسعير ← قواعد مشروع».
 *
 * Same role-checked RPC and same written reason as that page (§51): app.require_reason refuses the write without
 * one, so the form must carry the field.
 */
export async function saveOfferSpacingClasses(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  if (!UUID.test(projectId)) return { ok: false, message: "هذا العرض لم يعد موجوداً. حدّث الصفحة وحاول مرة أخرى." };

  const ids = [...new Set(formData.getAll("ids").map(String))];
  if (!ids.every((id) => UUID.test(id))) return { ok: false, message: "حدّث الصفحة وأعد الاختيار: إحدى الفئات ما عادتش صالحة." };
  const reason = text(formData, "reason", 1000);

  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_save_project_spacing_classes", {
    p_project: projectId,
    p_class_ids: ids,
    p_reason: reason,
  });
  if (error) {
    if (error.message === "invalid_spacing_class") {
      return { ok: false, message: "إحدى الفئات المختارة ما عادتش نشطة. حدّث الصفحة وأعد الاختيار، أو فعّلها في «التسعير ← فئات المساحة»." };
    }
    if (isKnownIntakeError(error.message)) return { ok: false, message: intakeErrorMessage(error.message) };
    if (error.code === "42501") return { ok: false, message: intakeErrorMessage("forbidden") };
    return FAILED;
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/pricing");
  // Every tree's area and price follow from the classes, so the public pages must be recomputed.
  expirePublicProjects();
  return {
    ok: true,
    message:
      ids.length === 0
        // It named «سعر مكتوب لكل قطعة» — the written price of a lot, a layer the product left on 2026-09-18.
        // What actually happens is that the offer loses its per-tree price and the pages say so. 2026-09-19.
        ? "تم الحفظ: العرض ما بقاتلوش فئة مساحة، فما عادش يتسعّر بالزيتونة. اختر فئة باش يرجع السعر."
        : "تم حفظ فئات المساحة. العرض يتسعّر بالزيتونة.",
  };
}

// ---------------------------------------------------------------------------
// The tree inventory (0054) · «the unit is a tree not m carré» (owner, 2026-09-18)
// ---------------------------------------------------------------------------
//
// An offer holds tree_count olive trees; public.trees holds one row per tree, each with its own code, its state
// and the person who holds it. Everything below is a thin wrapper over a security-definer RPC: the database
// decides who may act and what the act means, and these functions add the second role check (project rule), a
// written reason for the audit trail (§51), the caches to expire, and the Arabic sentence for every refusal.
//
// Nothing here computes anything. The counts come from public.staff_offer_stock, read through
// ./offer-stock.ts — the one sanctioned reader — and never summed in TypeScript.

/** What one of these actions answers with: the figures on success, a sentence the owner can act on otherwise. */
type TreeFailure = { ok: false; message: string };

type TreeState = "available" | "reserved" | "sold";
const TREE_STATES: readonly TreeState[] = ["available", "reserved", "sold"];

const STALE_OFFER: TreeFailure = {
  ok: false,
  message: "هذا العرض لم يعد موجوداً. حدّث الصفحة وحاول مرة أخرى.",
};
const TREE_FAILED_MESSAGE = "تعذّرت العملية ولم تتغيّر أي زيتونة. حدّث الصفحة وحاول مرة أخرى.";

/** A tree write refused by the database, in words. The RPCs name their own reason; the codes are in @/lib/errors. */
function treeFailure(error: { message: string; code?: string }): TreeFailure {
  if (isKnownIntakeError(error.message)) return { ok: false, message: intakeErrorMessage(error.message) };
  if (error.code === "42501") return { ok: false, message: intakeErrorMessage("forbidden") };
  if (error.code === "23505") return { ok: false, message: intakeErrorMessage("duplicate_tree_code") };
  return { ok: false, message: TREE_FAILED_MESSAGE };
}

function payloadOf(data: Json | null): Record<string, Json | undefined> {
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function countOf(value: Json | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function codeOf(value: Json | undefined): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Numbering, reserving or releasing a tree moves the stock every screen reads: the offer's own page, the offers
 * list and its tiles, the dashboard queue, and the four public counts (public_offer_stock).
 */
function treesChanged() {
  // The layout form reaches the list and every offer page under it in one call.
  revalidatePath("/admin/projects", "layout");
  revalidatePath("/admin");
  // A tree is released and sold from the client's file too, not only from the offer: /admin/leads/[personId]
  // prints the codes this person holds, so it goes stale on the same writes. The layout form covers the list
  // and every file under it, since a release may span the trees of more than one person. 2026-09-19.
  revalidatePath("/admin/leads", "layout");
  expirePublicProjects();
}

/**
 * Materialises this offer's trees: one row per tree, numbered 1..tree_count with the offer's code pattern.
 *
 * Idempotent, so it is equally the «number this offer» button and the «tree_count changed» button — it inserts
 * the missing numbers only. Lowering tree_count deletes the surplus trees when they are all still available, and
 * refuses outright (trees_taken_below_count) when one of them is reserved or sold: a sold tree is a client's tree.
 */
export async function generateOfferTrees(
  projectId: string,
): Promise<{ ok: true; added: number; removed: number; total: number } | TreeFailure> {
  await requireStaff(TREE_MANAGE_ROLES);
  if (!UUID.test(projectId)) return STALE_OFFER;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_generate_trees", {
    p_project: projectId,
    // No form carries this act, so the reason is written here: §51 asks who changed what, when and why, and the
    // database refuses the call without one (app.set_reason).
    p_reason: "ترقيم زيتونات العرض من صفحة العرض في الباك أوفيس، حسب عدد الزيتونات المصرّح به في بطاقة العرض.",
  });
  if (error) return treeFailure(error);

  const payload = payloadOf(data);
  treesChanged();
  return {
    ok: true,
    added: countOf(payload.added),
    removed: countOf(payload.removed),
    total: countOf(payload.trees),
  };
}

/**
 * Takes a number of trees of one offer for one person: the lowest-numbered available ones, all of them or none.
 *
 * The demand that asked for them is optional — a client the commercial met without any form has none. The
 * database picks which trees (FOR UPDATE SKIP LOCKED), refuses below the offer's minimum (below_min_trees) and
 * refuses when the stock moved under the caller (not_enough_trees) rather than handing out fewer than asked.
 */
export async function allocateOfferTrees(input: {
  projectId: string;
  personId: string;
  trees: number;
  reason: string;
  requestId?: string | null;
  state?: "reserved" | "sold";
}): Promise<
  { ok: true; trees: number; state: "reserved" | "sold"; firstCode: string | null; lastCode: string | null; treeIds: string[] } | TreeFailure
> {
  const session = await requireStaff();

  if (!UUID.test(input.projectId)) return STALE_OFFER;
  if (!UUID.test(input.personId)) return { ok: false, message: intakeErrorMessage("invalid_person") };
  const requestId = input.requestId ?? null;
  if (requestId !== null && !UUID.test(requestId)) return { ok: false, message: intakeErrorMessage("invalid_request") };

  const state = input.state ?? "reserved";
  if (state !== "reserved" && state !== "sold") return { ok: false, message: intakeErrorMessage("invalid_tree_state") };
  // Checked again here so a commercial reads the reason instead of a refused write (the database decides too).
  if (state === "sold" && !hasRole(session, TREE_CONTRACT_ROLES)) {
    return { ok: false, message: intakeErrorMessage("forbidden") };
  }

  const trees = Number(input.trees);
  if (!Number.isInteger(trees) || trees < 1) return { ok: false, message: intakeErrorMessage("invalid_offer_trees") };
  const reason = String(input.reason ?? "").trim().slice(0, 1000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_allocate_trees", {
    p_project: input.projectId,
    p_person: input.personId,
    p_trees: trees,
    p_state: state,
    p_reason: reason,
    // The generated Args type spells the demand as a plain uuid; the function itself takes null for a client who
    // filled no form (0054 §7), so the null is widened here and nowhere else.
    ...({ p_request: requestId } as { p_request: string }),
  });
  if (error) return treeFailure(error);

  const payload = payloadOf(data);
  treesChanged();
  revalidatePath(`/admin/leads/${input.personId}`);
  const ids = payload.tree_ids;
  return {
    ok: true,
    trees: countOf(payload.trees),
    state,
    firstCode: codeOf(payload.first_code),
    lastCode: codeOf(payload.last_code),
    treeIds: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [],
  };
}

/**
 * Moves chosen trees to one state: releasing a reservation back to «متاحة», or confirming the contract on «مباعة».
 *
 * Without it a reservation is a one-way door — nothing else may write public.trees. It moves states and never
 * hands out trees, so reserving or selling a tree that holds nobody is refused (invalid_tree_state); use
 * allocateOfferTrees for that. The ids may span offers, which is why every offer page is refreshed.
 */
export async function setTreeState(input: {
  treeIds: readonly string[];
  state: TreeState;
  reason: string;
}): Promise<{ ok: true; trees: number; state: TreeState } | TreeFailure> {
  const session = await requireStaff();

  if (!TREE_STATES.includes(input.state)) return { ok: false, message: intakeErrorMessage("invalid_tree_state") };
  // Releasing is stock keeping, contracting is the contract moment — the same split the database applies.
  if (input.state === "available" && !hasRole(session, TREE_MANAGE_ROLES)) {
    return { ok: false, message: intakeErrorMessage("forbidden") };
  }
  if (input.state === "sold" && !hasRole(session, TREE_CONTRACT_ROLES)) {
    return { ok: false, message: intakeErrorMessage("forbidden") };
  }

  const ids = [...new Set((input.treeIds ?? []).map(String))].filter((id) => UUID.test(id));
  // The same bound the database holds to: one call never moves the whole inventory.
  if (ids.length < 1 || ids.length > 1000 || ids.length !== (input.treeIds ?? []).length) {
    return { ok: false, message: intakeErrorMessage("invalid_tree_selection") };
  }
  const reason = String(input.reason ?? "").trim().slice(0, 1000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_set_tree_state", {
    p_tree_ids: ids,
    p_state: input.state,
    p_reason: reason,
  });
  if (error) return treeFailure(error);

  treesChanged();
  return { ok: true, trees: countOf(payloadOf(data).trees), state: input.state };
}

// Internal costs never reach the public pages (PRJ-03), so this action leaves their cache alone.
export async function addProjectCost(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);
  const label = text(formData, "label", 160);
  const amount = optionalNumber(formData, "amount_dinars");
  const kind = z.enum(COST_KINDS).safeParse(formData.get("kind"));
  if (!label || amount === undefined || amount === null || !kind.success) {
    return { ok: false, message: "اكتب البيان والمبلغ بالدينار واختر النوع." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_costs").insert({
    project_id: projectId,
    kind: kind.data,
    label,
    amount_millimes: Math.round(amount * 1000),
    note: text(formData, "note", 500) || null,
  });
  if (error) return FAILED;

  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true, message: "تمت إضافة المصروف." };
}

// ---------------------------------------------------------------------------
// Report v3 §20 · project gallery, in the public project-media bucket (MED-01)
// ---------------------------------------------------------------------------

const PROJECT_MEDIA_BUCKET = "project-media";

// Mirrors the bucket's own file_size_limit and allowed_mime_types.
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
const PICTURE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function pictureChanged(projectId: string) {
  revalidatePath(`/admin/projects/${projectId}`);
  expirePublicProjects();
}

export async function addProjectPicture(projectId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(WRITE_ROLES);

  const file = formData.get("file");
  const alt = text(formData, "alt", 160);
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "اختر ملف الصورة من جهازك." };
  if (!alt) {
    return { ok: false, message: "اكتب وصفاً مختصراً للصورة (نص بديل). إلزامي حتى تبقى الصفحة مقروءة للجميع." };
  }
  const extension = PICTURE_TYPES[file.type];
  if (!extension) return { ok: false, message: "الصيغ المقبولة: JPG، PNG، WEBP أو AVIF." };
  if (file.size > MAX_PICTURE_BYTES) return { ok: false, message: "حجم الصورة يتجاوز 5 ميغا. اضغطها ثم أعد المحاولة." };

  const supabase = await createClient();
  const [project, pictures, config] = await Promise.all([
    supabase.from("projects").select("code").eq("id", projectId).maybeSingle(),
    supabase.from("project_media").select("sort_order").eq("project_id", projectId),
    getPublicConfig(),
  ]);
  if (!project.data || pictures.error) return FAILED;

  const limit = settingInt(config, "projects.gallery_max", 24);
  const existing = pictures.data ?? [];
  if (existing.length >= limit) {
    return { ok: false, message: `وصل المشروع للحد الأقصى (${limit} صورة). احذف صورة أو غيّر الحد من الإعدادات.` };
  }

  // A fresh name on every upload, so a replaced picture is never served from a cache.
  const path = `${project.data.code.toLowerCase()}/${Date.now()}.${extension}`;
  const bucket = supabase.storage.from(PROJECT_MEDIA_BUCKET);
  const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { ok: false, message: `تعذّر رفع الصورة: ${uploadError.message}` };

  const { error } = await supabase.from("project_media").insert({
    project_id: projectId,
    url: bucket.getPublicUrl(path).data.publicUrl,
    storage_path: path,
    alt_ar: alt,
    caption_ar: text(formData, "caption", 200) || null,
    sort_order: Math.max(0, ...existing.map((picture) => picture.sort_order)) + 10,
  });
  if (error) {
    // Never leave a file in the public bucket that no row points to.
    await bucket.remove([path]);
    return error.code === "23514" ? { ok: false, message: `وصل المشروع للحد الأقصى (${limit} صورة).` } : FAILED;
  }

  pictureChanged(projectId);
  return { ok: true, message: "تمت إضافة الصورة." };
}

/** One cover per project: the previous one is released first, as the database allows only one. */
export async function setProjectCover(projectId: string, pictureId: string): Promise<void> {
  await requireStaff(WRITE_ROLES);
  const supabase = await createClient();
  await supabase.from("project_media").update({ is_cover: false }).eq("project_id", projectId).eq("is_cover", true);
  await supabase.from("project_media").update({ is_cover: true }).eq("id", pictureId).eq("project_id", projectId);
  pictureChanged(projectId);
}

export async function moveProjectPicture(projectId: string, pictureId: string, step: -1 | 1): Promise<void> {
  await requireStaff(WRITE_ROLES);
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_media")
    .select("id, sort_order")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("created_at");
  const rows = data ?? [];
  const from = rows.findIndex((row) => row.id === pictureId);
  const to = from + step;
  if (from < 0 || to < 0 || to >= rows.length) return;

  [rows[from], rows[to]] = [rows[to], rows[from]];
  await Promise.all(
    rows.map((row, index) =>
      row.sort_order === (index + 1) * 10
        ? null
        : supabase.from("project_media").update({ sort_order: (index + 1) * 10 }).eq("id", row.id),
    ),
  );
  pictureChanged(projectId);
}

/** Removes the picture from the gallery and its file from the bucket. */
export async function removeProjectPicture(projectId: string, pictureId: string): Promise<void> {
  await requireStaff(WRITE_ROLES);
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_media")
    .delete()
    .eq("id", pictureId)
    .eq("project_id", projectId)
    .select("storage_path");
  const path = data?.[0]?.storage_path;
  if (path) await supabase.storage.from(PROJECT_MEDIA_BUCKET).remove([path]);
  pictureChanged(projectId);
}
