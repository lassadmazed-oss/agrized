// مسار الحريف — the funnel stage, the timeline and the callback queue, as the Back Office reads them.
//
// THE RULE THIS MODULE OBEYS: it computes nothing. Where a customer is, what proves it, which stages have
// been reached, what is due to be called back and in what order — every one of those is worked out in
// Postgres by supabase/pending/bb_70_journey.sql, because a stage a screen works out for itself is a second
// answer, and the day the two disagree nobody can say which is the product. This file carries the TYPES of
// that answer, the thirteen keys the code branches on, the chip colours, and the four readers.
//
// NO MONEY ARITHMETIC AND NO FORMATTING. Amounts arrive as integer millimes exactly as the database holds
// them; src/lib/format.ts is the only formatter in this product.
//
// NOT "use client" AND NOT server-only, ON PURPOSE. A Server Component may import a VALUE from here (the
// keys, the tones) — which it could not do if this file were "use client", a mistake that has already caused
// a runtime crash in this repo and that typecheck does not catch. And it is not marked server-only either,
// so a client component may import the same keys and tones to draw a chip. The Supabase client is taken as a
// PARAMETER and imported as a TYPE only, so nothing server-side is pulled into a browser bundle.

import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

export type LeadStage = Database["public"]["Enums"]["lead_stage"];

/**
 * THE THIRTEEN KEYS OF §29, and the one place this module holds a business name in code.
 *
 * The argument, since every other list in this product is data the owner edits: a key here is not a label,
 * it is the NAME OF A FACT, and the fact is what the code branches on. «العربون مدفوع» means «a non-voided
 * receipt exists against a live hold», and if the owner deleted that row the function computing it would
 * still have to answer something. public.lead_statuses proves the point from the other side — it is his
 * table, he may delete any row in it, and 0063 refused to keep reservation states there for exactly this
 * reason. tree_state, visit_status, reservation_status and contract_status all took the same split before
 * this one.
 *
 *   THE KEY IS CODE.   thirteen names, fixed, because a screen branches on them.
 *   THE LABEL IS DATA. thirteen text settings, journey.stage_<key>, edited in الإعدادات. NEVER read from
 *                      this file — `stage.label` on the payload is the owner's word, and it is the only
 *                      word that may be printed.
 *   THE ORDER IS CODE. he renames a stage; he does not reorder the journey, because the order IS the
 *                      derivation — money follows a hold, a signature follows a draft.
 *
 * Two of the thirteen have no fact behind them today — `qualified` (no call outcome carries «مؤهل للزيارة»)
 * and `contract_scheduled` (§19's closing appointment has no table). The payload says so per stage with
 * `has_fact: false`, and a screen draws those hollow and prints `unknown` rather than inventing a number.
 */
export const JOURNEY_STAGE_KEYS = [
  "lead",
  "contacted",
  "qualified",
  "visit_scheduled",
  "visit_completed",
  "trees_selected",
  "reservation",
  "deposit_paid",
  "legal_processing",
  "contract_scheduled",
  "contract_signed",
  "sale_completed",
  "owner",
] as const;

export type JourneyStageKey = (typeof JOURNEY_STAGE_KEYS)[number];

/**
 * Chip colours for the stage. Presentation, not business: the owner renames a stage from الإعدادات and the
 * colour follows the key, so nothing here has to change. Semantic and independent from the brand accent, the
 * same vocabulary STAGE_TONES already uses in src/lib/crm.ts so two chips on one screen look like one system.
 */
export const JOURNEY_STAGE_TONES: Record<JourneyStageKey, string> = {
  lead: "bg-sky-50 text-sky-800 ring-sky-200",
  contacted: "bg-amber-50 text-amber-800 ring-amber-200",
  qualified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  visit_scheduled: "bg-violet-50 text-violet-800 ring-violet-200",
  visit_completed: "bg-violet-50 text-violet-800 ring-violet-200",
  trees_selected: "bg-orange-50 text-orange-800 ring-orange-200",
  reservation: "bg-orange-50 text-orange-800 ring-orange-200",
  deposit_paid: "bg-orange-50 text-orange-800 ring-orange-200",
  legal_processing: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  contract_scheduled: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  contract_signed: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  sale_completed: "bg-leaf-soft text-forest ring-leaf/30",
  owner: "bg-leaf-soft text-forest ring-leaf/30",
};

/** True for a key the database sent that this build does not know — a stage added after this file shipped. */
export function isJourneyStageKey(value: string | null | undefined): value is JourneyStageKey {
  return typeof value === "string" && (JOURNEY_STAGE_KEYS as readonly string[]).includes(value);
}

/** The chip colour for a stage, degrading to a neutral one rather than to undefined. */
export function stageTone(key: string | null | undefined): string {
  return isJourneyStageKey(key) ? JOURNEY_STAGE_TONES[key] : "bg-stone-100 text-stone-700 ring-stone-200";
}

// ---------------------------------------------------------------------------
// What the database answers
// ---------------------------------------------------------------------------

/** The row that proves a stage: which record it is, its own reference number, and when it happened. */
export type JourneyProof = {
  kind: "request" | "person" | "contact_attempt" | "visit" | "trees" | "reservation" | "contract";
  id: string | null;
  /** The record's own number — AGZ-2026-000045, AGZ-VIS-…, AGZ-RES-…, AGZ-CTR-… — or a count for trees. */
  ref: string | null;
  at: string | null;
  /**
   * Set only on a REQUEST's stage (bb_75), and only on «تم الاتصال»: the row proving this stage belongs to
   * the CLIENT, not to this demand, because public.contact_attempts carries no request_id — an agent dials a
   * person, not a demand. A screen showing a request's stage must soften its sentence when this is true
   * («اتصال بالحريف») rather than implying somebody phoned about the row on screen. Absent everywhere else.
   */
  person_scoped?: boolean;
};

export type JourneyStage = {
  rank: number;
  key: JourneyStageKey;
  /** The owner's word, from settings journey.stage_<key>. Print this; never a label from this file. */
  label: string;
  lead_stage: LeadStage;
  /** False when nothing in the database can prove this stage today. Draw it hollow, never as zero. */
  has_fact: boolean;
  /** One Arabic line saying what proves the stage, or what would. */
  fact_ar: string;
  at: string | null;
  proof: JourneyProof;
};

/** One stage of the path as a header band draws it. */
export type JourneySpineStage = {
  rank: number;
  key: JourneyStageKey;
  label: string;
  lead_stage: LeadStage;
  has_fact: boolean;
  fact_ar: string;
  reached: boolean;
  current: boolean;
};

/**
 * What a human last chose from the status dropdown, beside the derived answer.
 *
 * persons.status_id is NOT going away and must not: the owner needs «غير مهتم حالياً» and «مغلق», and no
 * fact in the database can ever prove either — `is_parked` is exactly those two. When `agrees` is false the
 * screen SHOWS both; it never lets one overwrite the other.
 */
export type JourneyHumanStatus = {
  status_id: string;
  label: string;
  lead_stage: LeadStage;
  is_active: boolean;
  is_parked: boolean;
  agrees: boolean;
  set_at: string | null;
  set_by: string | null;
};

export type JourneyTimelineEntry = {
  at: string;
  /** request · call · note · status · assignment · visit_* · trees · reservation · deposit · payment · contract_* */
  kind: string;
  /** The event's Arabic name, from settings journey.event_labels. */
  title: string;
  detail: string | null;
  ref: string | null;
  by: string | null;
  /** Integer millimes, unformatted. Pass it to formatMillimes; never add two of these together here. */
  amount_millimes: number | null;
  /** How many trees this act took, or how many people were coming on the visit. */
  count: number | null;
  row_id: string | null;
  /** Which stage of the journey this event belongs to, or null for an event that is not a stage. */
  stage: JourneyStageKey | null;
};

export type JourneyTimeline = {
  total: number;
  shown: number;
  /** True when settings journey.timeline_max cut the list. Say so; do not print a story with a hole in it. */
  truncated: boolean;
  events: JourneyTimelineEntry[];
};

/** §26's spine: one Customer ID and one Deal ID travelling the whole way, read back in one place. */
export type JourneyIds = {
  person_id: string;
  request_no: string | null;
  request_id: string | null;
  visit_no: string | null;
  reservation_no: string | null;
  contract_no: string | null;
  project_id: string | null;
  trees_held: number;
};

export type JourneyCallback = {
  due_at: string;
  by: string | null;
  note: string | null;
  overdue: boolean;
};

export type CustomerJourney = {
  person: {
    id: string;
    full_name: string;
    phone_e164: string;
    whatsapp_e164: string | null;
    created_at: string;
    assigned_to: string | null;
    assigned_to_name: string | null;
  };
  stage: JourneyStage;
  human: JourneyHumanStatus | null;
  spine: JourneySpineStage[];
  callback: JourneyCallback | null;
  ids: JourneyIds;
  timeline: JourneyTimeline;
  /** The word to print where no fact decides anything, from settings journey.unknown_label. */
  unknown: string;
};

export type PersonStage = { person_id: string; stage: JourneyStage | null };

/**
 * §26's identifiers threaded down ONE demand — bb_75's app.request_ids.
 *
 * WHY THIS IS NOT JourneyIds. The person-level version answers «which visit, which hold, which contract» for
 * the CLIENT, which on a client with two demands is a mix: the visit from one and the contract from the
 * other, printed side by side with nothing saying they belong to different deals. Every id here belongs to
 * the demand it was read for, so a request file can print them and have each one be about the row on screen.
 */
export type RequestJourneyIds = {
  request_id: string;
  request_no: string | null;
  person_id: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  request_kind: string | null;
  /** How many trees THIS demand asked for, as the intake recorded it. */
  offer_trees: number | null;
  visit_no: string | null;
  reservation_no: string | null;
  contract_no: string | null;
  trees_held: number;
};

/**
 * وين وصل هذا المطلب — where ONE demand stands, the path it has walked, and what it holds.
 *
 * Same shape as CustomerJourney minus the two things that belong to a person and not to a demand: the human
 * status dropdown (persons.status_id is one per client) and the timeline (§25's story is the client's, and
 * calls on it carry no request_id). So a screen draws the band from `spine` exactly as it does for a person,
 * and reads the client's story from readCustomerJourney when it wants one.
 */
export type RequestJourney = {
  stage: JourneyStage;
  spine: JourneySpineStage[];
  ids: RequestJourneyIds;
  /** The word to print where no fact decides anything, from settings journey.unknown_label. */
  unknown: string;
};

export type RequestStage = { request_id: string; stage: JourneyStage | null };

export type CallbackBucket = "overdue" | "today" | "upcoming";

export type CallbackRow = {
  person_id: string;
  full_name: string;
  phone_e164: string;
  whatsapp_e164: string | null;
  due_at: string;
  bucket: CallbackBucket;
  channel: string;
  /** The call's outcome in Arabic, from settings journey.call_outcome_labels. */
  outcome: string;
  note: string | null;
  promised_at: string;
  promised_by: string | null;
  assigned_to_name: string | null;
  status_label: string | null;
  /** Where the file really is, so an agent knows what to say before they dial. */
  stage: JourneyStage | null;
};

export type CallbackQueue = {
  scope: "mine" | "all";
  today: string;
  horizon_days: number;
  counts: { total: number; overdue: number; today: number; upcoming: number };
  rows: CallbackRow[];
};

// ---------------------------------------------------------------------------
// The readers
// ---------------------------------------------------------------------------

/**
 * Why a read came back empty, which is not the same question as whether it is empty.
 *   not_applied  supabase/pending/bb_70_journey.sql has not been applied yet
 *   forbidden    the database refused: not staff, or not a file this reader may open (§27)
 *   missing      no such person
 *   error        anything else, which the caller should surface rather than swallow
 */
export type JourneyFailure = "not_applied" | "forbidden" | "missing" | "error";

export type JourneyResult<T> = { ok: true; value: T } | { ok: false; reason: JourneyFailure };

/**
 * THE ONE CAST IN THIS MODULE, and the reason for it.
 *
 * supabase/pending/bb_70_journey.sql is a DRAFT: it has not been applied, so `npm run db:types` has never
 * seen staff_customer_journey, staff_person_stage, staff_journey_spine or staff_callbacks, and the generated
 * Database type does not carry them. The untyped surface is named once, here, rather than scattered over
 * four call sites — the same shape src/app/admin/(panel)/persons/read.ts already uses for its own draft.
 *
 * DELETE THIS the moment the draft is applied and `npm run db:types` is re-run: the four calls below then
 * typecheck against the generated types with no other change, and the compiler points at this block.
 */
type RpcError = { code?: string; message: string };
type DraftRpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError | null }>;

function draftRpc(supabase: StaffClient): DraftRpc {
  return (supabase as unknown as { rpc: DraftRpc }).rpc.bind(supabase);
}

/**
 * PostgREST reports a function that does not exist as PGRST202 (and PostgreSQL as 42883) — which, for a
 * module whose SQL is still a draft, is the normal state and not a fault. Everything else is the database
 * refusing on purpose, and the code it raises is the message.
 */
function failureOf(error: RpcError): JourneyFailure {
  if (error.code === "PGRST202" || error.code === "42883") return "not_applied";
  if (error.message === "forbidden") return "forbidden";
  return "error";
}

/**
 * WHERE THIS CUSTOMER IS AND HOW THEY GOT HERE — the whole file in one read: the derived stage with the row
 * that proves it, the human status beside it, the thirteen-stage path, the live callback, §26's identifiers
 * and the full timeline.
 *
 * Refused in the database first (app.is_staff + app.can_see_person), so nothing here filters by hand.
 */
export async function readCustomerJourney(
  supabase: StaffClient,
  personId: string,
  timelineLimit?: number,
): Promise<JourneyResult<CustomerJourney>> {
  const { data, error } = await draftRpc(supabase)("staff_customer_journey", {
    p_person: personId,
    p_timeline_limit: timelineLimit ?? null,
  });
  if (error) return { ok: false, reason: failureOf(error) };
  if (!data) return { ok: false, reason: "missing" };
  return { ok: true, value: data as CustomerJourney };
}

/**
 * The same stage for a LIST of people — a queue screen, or the §28 funnel dashboard. Up to 500 ids in one
 * call; more raises `too_many_persons`. Files the reader may not see are simply absent from the answer,
 * never nulled and never counted.
 */
export async function readPersonStages(
  supabase: StaffClient,
  personIds: readonly string[],
): Promise<JourneyResult<PersonStage[]>> {
  if (personIds.length === 0) return { ok: true, value: [] };
  const { data, error } = await draftRpc(supabase)("staff_person_stage", { p_person_ids: personIds });
  if (error) return { ok: false, reason: failureOf(error) };
  return { ok: true, value: (data as PersonStage[] | null) ?? [] };
}

/**
 * WHERE ONE DEMAND IS — bb_75's staff_request_journey.
 *
 * The reader a request file calls. Use this and NOT readCustomerJourney wherever the screen is about a
 * demand: a client with two demands has one person-level answer and it is the higher of the two, so reading
 * the person there silently promotes the quieter demand — which is the whole reason bb_75 exists.
 *
 * Refused in the database first (app.is_staff + app.can_see_person on the demand's client), so nothing here
 * filters by hand. `missing` means no such demand.
 */
export async function readRequestJourney(
  supabase: StaffClient,
  requestId: string,
): Promise<JourneyResult<RequestJourney>> {
  const { data, error } = await draftRpc(supabase)("staff_request_journey", { p_request: requestId });
  if (error) return { ok: false, reason: failureOf(error) };
  if (!data) return { ok: false, reason: "missing" };
  return { ok: true, value: data as RequestJourney };
}

/**
 * The same stage for a LIST of demands — a requests screen drawing where each row stands. Up to 500 ids in
 * one call; more raises `too_many_requests`. Demands whose client the reader may not see are simply absent
 * from the answer, never nulled and never counted.
 */
export async function readRequestStages(
  supabase: StaffClient,
  requestIds: readonly string[],
): Promise<JourneyResult<RequestStage[]>> {
  if (requestIds.length === 0) return { ok: true, value: [] };
  const { data, error } = await draftRpc(supabase)("staff_request_stage", { p_request_ids: requestIds });
  if (error) return { ok: false, reason: failureOf(error) };
  return { ok: true, value: (data as RequestStage[] | null) ?? [] };
}

/** The thirteen stages with their Arabic labels — what a header band and a dashboard's columns are drawn from. */
export async function readJourneySpine(
  supabase: StaffClient,
): Promise<JourneyResult<{ stages: JourneySpineStage[]; unknown: string }>> {
  const { data, error } = await draftRpc(supabase)("staff_journey_spine");
  if (error) return { ok: false, reason: failureOf(error) };
  if (!data) return { ok: false, reason: "error" };
  return { ok: true, value: data as { stages: JourneySpineStage[]; unknown: string } };
}

/**
 * §5 · «شنوّة مستحق عليّ توّا». Every file whose LATEST call promised a callback that nothing has discharged,
 * split into متأخرة · اليوم · قادمة, earliest first. There is no date window: a promise made five weeks ago
 * is still a broken promise, which is precisely what the old dashboard query dropped.
 *
 * `scope: "mine"` is the caller's own promises — the call-centre agent's queue. `scope: "all"` is every file
 * they may see, which for a commercial is still only their own book.
 */
export async function readCallbacks(
  supabase: StaffClient,
  params: { scope?: "mine" | "all"; assignedTo?: string | null; limit?: number } = {},
): Promise<JourneyResult<CallbackQueue>> {
  const { data, error } = await draftRpc(supabase)("staff_callbacks", {
    p: {
      scope: params.scope ?? "mine",
      assigned_to: params.assignedTo ?? "",
      limit: params.limit ?? null,
    },
  });
  if (error) return { ok: false, reason: failureOf(error) };
  if (!data) return { ok: false, reason: "error" };
  return { ok: true, value: data as CallbackQueue };
}

// ---------------------------------------------------------------------------
// Pure helpers — shape only, never a business rule
// ---------------------------------------------------------------------------

/** How far along the path a file is, for a progress band. Counting, not deciding. */
export function journeyProgress(spine: readonly JourneySpineStage[]): { reached: number; total: number } {
  return { reached: spine.filter((stage) => stage.reached).length, total: spine.length };
}

/**
 * What to print for a stage: the owner's label, or his own word for «no fact» when the stage it names could
 * never be proven. Never a string from this file.
 */
export function stageText(stage: Pick<JourneySpineStage, "label" | "has_fact">, unknown: string): string {
  return stage.has_fact ? stage.label : unknown;
}

/**
 * The timeline as a screen draws it. `newestFirst` reverses the database's order, which runs forward from
 * «بعث مطلب من الموقع» to «تم البيع» because that is how the owner reads it.
 */
export function timelineEvents(
  timeline: JourneyTimeline,
  { newestFirst = false }: { newestFirst?: boolean } = {},
): JourneyTimelineEntry[] {
  return newestFirst ? [...timeline.events].reverse() : timeline.events;
}
