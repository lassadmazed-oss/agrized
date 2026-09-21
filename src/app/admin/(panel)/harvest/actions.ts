"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { PRICE_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

import { dinarsToMillimes, textValue, wholeNumber } from "../pricing/form-values";
import { harvestErrorMessage } from "./messages";
import { FILE_ROLES, GROVE_ROLES } from "./roles";
import { harvestRpc } from "./rpc";

// الصابة والجني (report v3 §37, cahier v2 §43/§44). Every write below goes through a role-checked,
// module-gated security-definer RPC that stores the written reason in the audit log (§51).
//
// BOTH HALVES OF THE GATE. moduleAccess() here and app.module_open('harvest') inside every RPC. The TypeScript
// half stops a screen that should not have been reachable; the SQL half stops a caller who never opened a
// screen. Neither is enough on its own, and the flag stays 'disabled' until the owner switches it himself.
//
// THE REASON IS NEVER VALIDATED HERE. app.require_reason (0058) is the single authority: audit.reason_min_length
// is 0 today, so a blank reason is accepted, and the field draws nothing. Every call still forwards p_reason, so
// the moment the owner sets a minimum the guard comes back everywhere at once.

const PAGE = "/admin/harvest";

const NUMBER_INVALID =
  "راجع الأرقام: الكميات بالكيلو أو باللتر بفاصلة واحدة أو اثنين على الأكثر (مثال: 11250.5)، والأعداد بلا فاصلة.";
const MONEY_INVALID = "اكتب المبلغ بالدينار بالأرقام، مثال: 4500 ولا 4500.250، أو اتركه فارغاً.";
const STALE: ActionResult = { ok: false, message: "هذا الموسم لم يعد موجوداً. حدّث الصفحة وحاول مرة أخرى." };

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function ok(message: string): ActionResult {
  return { ok: true, message };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A weighed quantity: at most two decimals. */
function quantity(raw: unknown): number | null | undefined {
  // Built on the pricing form's three-decimal scaler so both screens read Arabic digits, a comma and a space the
  // same way. The extra rule is this module's own: a crop is weighed to two decimals, and a third is a typo
  // rather than a precision, so it is refused instead of being silently rounded into the column.
  const thousandths = dinarsToMillimes(raw);
  if (thousandths === null || thousandths === undefined) return thousandths;
  if (thousandths % 10 !== 0) return undefined;
  return thousandths / 1000;
}

/** "" → null, a real date → itself, anything else → undefined. */
function dateValue(formData: FormData, name: string): string | null | undefined {
  const raw = textValue(formData, name, 10);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) return undefined;
  return raw;
}

/** The module has to be open for THIS reader before any action runs. */
async function requireOpenModule(): Promise<ActionResult | null> {
  const config = await getPublicConfig();
  if ((await moduleAccess(config, "harvest")) === "closed") {
    return fail(harvestErrorMessage({ message: "module_closed" }));
  }
  return null;
}

function readReason(formData: FormData): string {
  return textValue(formData, "reason", 1000) || "";
}

// ---------------------------------------------------------------------------
// The season: its dates, and the quantities v2 §43 names
// ---------------------------------------------------------------------------

export async function saveSeason(seasonId: string | null, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(GROVE_ROLES);
  const closed = await requireOpenModule();
  if (closed) return closed;
  if (seasonId !== null && !UUID.test(seasonId)) return STALE;

  const payload: Record<string, unknown> = {};

  if (seasonId) {
    payload.id = seasonId;
  } else {
    const projectId = textValue(formData, "project_id", 40);
    const year = wholeNumber(formData.get("season_year"), 2100);
    if (!UUID.test(projectId)) return fail("اختر العرض من القائمة.");
    if (typeof year !== "number" || year < 2000) {
      return fail("اكتب سنة الموسم بأربعة أرقام، مثال: 2026 — هي السنة اللي يبدا فيها الجني.");
    }
    payload.project_id = projectId;
    payload.season_year = year;
  }

  // Only the fields the submitted form actually carries are sent: an absent key leaves the stored value alone,
  // which is what lets the quantities form save without wiping the dates form beside it.
  const label = textValue(formData, "label_ar", 80);
  if (formData.has("label_ar") && label) payload.label_ar = label;

  for (const name of ["started_on", "ended_on", "choice_deadline"] as const) {
    if (!formData.has(name)) continue;
    const value = dateValue(formData, name);
    if (value === undefined) return fail("اكتب التاريخ بالصيغة يوم/شهر/سنة من خانة التاريخ.");
    payload[name] = value;
  }

  if (formData.has("trees_harvested")) {
    const trees = wholeNumber(formData.get("trees_harvested"), 1_000_000);
    if (trees === undefined) return fail("اكتب عدد الزيتونات اللي تجنّات بالأرقام، بلا فاصلة.");
    payload.trees_harvested = trees;
  }

  const quantities = [
    "estimated_olives_kg",
    "olives_kg",
    "pressed_olives_kg",
    "oil_litres",
    "stored_oil_litres",
    "sold_olives_kg",
    "sold_oil_litres",
  ] as const;
  for (const name of quantities) {
    if (!formData.has(name)) continue;
    const value = quantity(formData.get(name));
    if (value === undefined) return fail(NUMBER_INVALID);
    payload[name] = value;
  }

  if (formData.has("note")) payload.note = textValue(formData, "note", 2000) || null;

  const { data, error } = await harvestRpc<{ id: string }>("staff_save_harvest_season", {
    p: payload,
    p_reason: readReason(formData),
  });
  if (error) return fail(harvestErrorMessage(error));

  revalidatePath(PAGE);
  if (data?.id) revalidatePath(`${PAGE}/${data.id}`);
  return ok(seasonId ? "تسجّل التغيير." : "تسجّل الموسم الجديد.");
}

// ---------------------------------------------------------------------------
// §43's two money facts, alone, behind Finance and Admin (§53)
// ---------------------------------------------------------------------------

export async function saveSeasonMoney(seasonId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  const closed = await requireOpenModule();
  if (closed) return closed;
  if (!UUID.test(seasonId)) return STALE;

  const cost = dinarsToMillimes(formData.get("harvest_cost"));
  const sale = dinarsToMillimes(formData.get("sale_amount"));
  if (cost === undefined || sale === undefined) return fail(MONEY_INVALID);

  const { error } = await harvestRpc("staff_set_harvest_money", {
    p_season: seasonId,
    p_harvest_cost_millimes: cost,
    p_sale_amount_millimes: sale,
    p_reason: readReason(formData),
  });
  if (error) return fail(harvestErrorMessage(error));

  revalidatePath(`${PAGE}/${seasonId}`);
  return ok("تسجّلت تكلفة الجني وثمن البيع.");
}

// ---------------------------------------------------------------------------
// The state machine. «توزّعت الحصص» is not in this list: it is what settlement leaves behind.
// ---------------------------------------------------------------------------

export async function setSeasonStatus(seasonId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(GROVE_ROLES);
  const closed = await requireOpenModule();
  if (closed) return closed;
  if (!UUID.test(seasonId)) return STALE;

  const status = textValue(formData, "status", 20);
  if (!status) return fail("اختر حالة الموسم.");

  const { error } = await harvestRpc("staff_set_harvest_status", {
    p_season: seasonId,
    p_status: status,
    p_reason: readReason(formData),
  });
  if (error) return fail(harvestErrorMessage(error));

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${seasonId}`);
  return ok("تبدّلت حالة الموسم.");
}

// ---------------------------------------------------------------------------
// Settling: the accounting close of the crop
// ---------------------------------------------------------------------------

export async function settleSeason(seasonId: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(PRICE_ROLES);
  const closed = await requireOpenModule();
  if (closed) return closed;
  if (!UUID.test(seasonId)) return STALE;

  const { data, error } = await harvestRpc<{ shares: number; trees_allocated: number; defaults_applied: number }>(
    "staff_settle_harvest_season",
    { p_season: seasonId, p_reason: readReason(formData) },
  );
  if (error) return fail(harvestErrorMessage(error));

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${seasonId}`);
  const shares = data?.shares ?? 0;
  const defaults = data?.defaults_applied ?? 0;
  return ok(
    shares === 0
      ? "توزّع الموسم. حتى زيتونة ما تباعت، فما حتى حصّة تتحسب."
      : `توزّعت الحصص على ${shares} مالك${defaults > 0 ? `، منهم ${defaults} أخذوا الاختيار الافتراضي متاع العرض` : ""}.`,
  );
}

// ---------------------------------------------------------------------------
// «النظام لازم يبقى Configurable حسب المشروع» (§37): what each offer offers
// ---------------------------------------------------------------------------

export async function saveOfferHarvestOptions(
  projectId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff(GROVE_ROLES);
  const closed = await requireOpenModule();
  if (closed) return closed;
  if (!UUID.test(projectId)) return fail("هذا العرض لم يعد موجوداً. حدّث الصفحة وحاول مرة أخرى.");

  const ids = (name: string) => formData.getAll(name).map(String).filter((value) => UUID.test(value));
  const one = (name: string) => {
    const value = textValue(formData, name, 40);
    return UUID.test(value) ? value : null;
  };

  const { error } = await harvestRpc("staff_save_offer_harvest_options", {
    p_project: projectId,
    p_pick_ids: ids("pick_ids"),
    p_pick_default: one("pick_default"),
    p_outcome_ids: ids("outcome_ids"),
    p_outcome_default: one("outcome_default"),
    p_reason: readReason(formData),
  });
  if (error) return fail(harvestErrorMessage(error));

  revalidatePath(PAGE);
  return ok("تسجّلت اختيارات الجني في هذا العرض.");
}

// ---------------------------------------------------------------------------
// What one owner chose (§37, §44)
// ---------------------------------------------------------------------------

export async function setHarvestChoice(
  seasonId: string,
  personId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // The database decides which files this reader may speak for (app.can_edit_person), which is finer than any
  // role list: a commercial writes in their own file and nowhere else.
  await requireStaff(FILE_ROLES);
  const closed = await requireOpenModule();
  if (closed) return closed;
  if (!UUID.test(seasonId) || !UUID.test(personId)) return STALE;

  const pick = textValue(formData, "pick_option_id", 40);
  const outcome = textValue(formData, "outcome_option_id", 40);

  const { error } = await harvestRpc("staff_set_harvest_choice", {
    p_season: seasonId,
    p_person: personId,
    p_pick_option_id: UUID.test(pick) ? pick : null,
    p_outcome_option_id: UUID.test(outcome) ? outcome : null,
    p_note: textValue(formData, "note", 1000) || null,
    p_reason: readReason(formData),
  });
  if (error) return fail(harvestErrorMessage(error));

  revalidatePath(`${PAGE}/${seasonId}`);
  return ok("تسجّل اختيار المالك.");
}
