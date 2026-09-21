// فضاء «زيتونتي» — the one place the client file is read (supabase/pending/bb_42_zitounti.sql).
//
// WHY IT IS A STAFF SCREEN AND NOT A CLIENT ONE. No buyer can sign in: auth.users holds two rows, both staff;
// no user carries the role 'client'; persons.profile_id is NULL on all 20 persons and nothing writes it; and
// src/lib/auth.ts strips 'client' from every session. Building a login inside a feature batch would give
// AgriZed a second front door nobody reviewed, so this batch builds the CONTENT of زيتونتي — one client, their
// numbered trees, what was done to them, what they paid, what came out of the season — as a screen a commercial
// can read down the phone. The payload is keyed by person and carries no staff prose, so the day the owner
// decides how a buyer signs in, the same functions answer the buyer (see §6 of the draft).
//
// IT READS, IT DOES NOT WRITE. Every figure here was written by a module that owns it: trees (0054),
// interest_requests (0049), reservations and payments (0063), visits (0064), and the three stage-4 records
// being drafted in this same phase. There is no Server Action in this folder on purpose.

import "server-only";

import type { createClient } from "@/lib/supabase/server";

type StaffClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Why a section is empty, which is not the same question as whether it is empty.
 *   ok           read; it may still hold no rows
 *   closed       the module that writes this record is switched off in الإعدادات ← الموديولات
 *   not_built    its table does not exist yet
 *   phase_later  a stage deliberately not built (العقود، الأقساط)
 */
export type SectionStatus = "ok" | "closed" | "not_built" | "phase_later";

export type Section<T> = { status: SectionStatus; items: T[]; count: number };

export type TreeGroup = {
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  project_status: string | null;
  governorate: string | null;
  delegation: string | null;
  olive_variety: string | null;
  plantation_system: string | null;
  production_status: string | null;
  plan_storage_path: string | null;
  photos: number;
  /** Null when the offer declares several spacing classes: nothing on a tree says which one it stands in. */
  area_per_tree_m2: number | null;
  area_m2: number | null;
  trees: number;
  trees_sold: number;
  trees_reserved: number;
  first_code: string | null;
  last_code: string | null;
  /** Capped by the setting zitounti.max_codes; `trees` stays the true count. */
  codes: string[];
  services: string[];
};

export type RequestRow = {
  id: string;
  request_no: string;
  created_at: string;
  kind: string | null;
  project_code: string | null;
  project_name: string | null;
  trees: number | null;
  price_per_tree_millimes: number | null;
  total_price_millimes: number | null;
  annual_fee_per_tree_millimes: number | null;
  annual_fee_total_millimes: number | null;
};

export type ReservationRow = {
  id: string;
  reference_no: string;
  status: string;
  project_code: string | null;
  trees: number;
  deposit_due_millimes: number;
  reserved_at: string | null;
  expires_at: string | null;
  deposit_paid_at: string | null;
};

export type VisitRow = {
  id: string;
  visit_no: string;
  status: string;
  project_code: string | null;
  visit_date: string | null;
  slot_label_ar: string | null;
  meeting_point: string | null;
};

export type PaymentRow = {
  id: string;
  reference_no: string;
  kind: string;
  project_code: string | null;
  amount_millimes: number;
  method_label_ar: string | null;
  received_at: string | null;
  voided: boolean;
};

/** public.agri_operations (draft bb_40). Never its cost or its supplier — see the function's comment. */
export type OperationRow = {
  id: string;
  project_code: string | null;
  /** The label frozen on the operation, not today's option list. */
  service_ar: string | null;
  status: string;
  /** "offer" — the whole grove; "trees" — only the trees this act named, mine among them. */
  scope: string;
  planned_on: string | null;
  executed_on: string | null;
};

export type SubscriptionLine = {
  label_ar: string;
  in_package: boolean;
  amount_millimes: number;
  status: string;
};

/** public.subscriptions (draft bb_40). */
export type SubscriptionRow = {
  id: string;
  project_code: string | null;
  season_label: string | null;
  season_starts_on: string | null;
  trees: number | null;
  /** The fee frozen for this client at signature, never today's pricing rule. */
  fee_per_tree_millimes: number | null;
  amount_millimes: number | null;
  /** §36 names Status and Payment as two attributes; they stay two. */
  status: string | null;
  payment_status: string | null;
  /** «شنو داخل وشنو خارج الباقة» (v2 §40) — the one question a client asks about a subscription. */
  lines: SubscriptionLine[];
};

/** public.harvest_seasons + public.harvest_shares (draft bb_41). */
export type HarvestRow = {
  season_id: string;
  project_code: string | null;
  season_label: string | null;
  season_year: number | null;
  status: string;
  choice_deadline: string | null;
  /** False while the season is still running: the share is written once, at settlement. */
  settled: boolean;
  season_olives_kg: number | null;
  season_oil_litres: number | null;
  trees_harvested: number | null;
  /** My figures, frozen at settlement — a share of the grove's season, never a weighing of one tree. */
  my_trees: number | null;
  my_olives_kg: number | null;
  my_oil_litres: number | null;
  pick_label_ar: string | null;
  outcome_label_ar: string | null;
  choice_source: string | null;
};

export type ZitountiFile = {
  person: {
    id: string;
    full_name: string;
    phone_e164: string;
    whatsapp_e164: string | null;
    email: string | null;
    governorate: string | null;
    delegation: string | null;
    created_at: string;
    archived: boolean;
    /** False for every person today: persons.profile_id is written nowhere. */
    has_account: boolean;
    status_ar: string | null;
    assigned_to: string | null;
  };
  trees: Section<TreeGroup>;
  requests: Section<RequestRow>;
  reservations: Section<ReservationRow>;
  visits: Section<VisitRow>;
  payments: Section<PaymentRow>;
  operations: Section<OperationRow>;
  subscription: Section<SubscriptionRow>;
  harvest: Section<HarvestRow>;
  contracts: Section<never>;
  installments: Section<never>;
  documents: Section<never>;
  totals: {
    trees: number;
    trees_sold: number;
    trees_reserved: number;
    offers: number;
    /** Null while both money modules are closed — «we are not saying» rather than «zero». */
    paid_millimes: number | null;
  };
  read_at: string;
};

export type Holder = {
  person_id: string;
  full_name: string;
  phone_e164: string;
  governorate: string | null;
  trees: number;
  trees_sold: number;
  trees_reserved: number;
  offers: number;
  offer_codes: string[];
};

/**
 * Why a read did not produce a file. Each one is a different sentence on the screen, because each one has a
 * different next step: switch the module on, ask an administrator, apply the draft.
 */
export type ReadFailure = "closed" | "forbidden" | "missing" | "not_applied" | "error";

export type FileResult = { ok: true; file: ZitountiFile } | { ok: false; reason: ReadFailure };
export type HoldersResult = { ok: true; holders: Holder[] } | { ok: false; reason: ReadFailure };

/**
 * Why the screen has nothing to show, and what to do about it — one sentence each, in Arabic, naming the
 * module rather than «هذا الموديول».
 *
 * Kept here rather than in src/lib/errors.ts, the way the reservations module keeps its own: errors.ts is keyed
 * by the code the database raises and is shared by every module, so a line that names زيتونتي belongs to
 * زيتونتي. `module_closed` and `forbidden` do have generic lines there; these say which module and which file.
 */
export const FAILURE_MESSAGES: Record<ReadFailure, string> = {
  closed:
    "فضاء «زيتونتي» مازال معطّل، على هذا الملف ما يتقراش. شغّلو من الإعدادات ← الموديولات: «داخلي فقط» تكفي باش يخدم الفريق برك.",
  forbidden:
    "هذا الملف موش من ملفاتك. اطلب من الإدارة تكلّفك بالحريف، ولا اطلب دور المالية أو القانوني اللي يقرا الملفات الكل.",
  missing: "هذا الحريف ما عادش موجود، ولا الرمز اللي في العنوان غالط. ارجع للقائمة واختار حريف من جديد.",
  not_applied:
    "قاعدة البيانات مازالت ما عندهاش وظائف «زيتونتي». طبّق supabase/pending/bb_42_zitounti.sql، ثم اعمل npm run db:types، وأعد تحميل الصفحة.",
  error: "ما نجّمناش نقراو الملف. حدّث الصفحة، وإذا تعاودت المشكلة شوف سجلّ الأخطاء.",
};

/**
 * THE ONE CAST IN THIS MODULE, and the reason for it.
 *
 * supabase/pending/bb_42_zitounti.sql is a DRAFT: it has not been applied, so `npm run db:types` has never
 * seen staff_zitounti_file or staff_zitounti_holders and the generated Database type does not carry them.
 * Rather than scatter `as never` over two call sites, the untyped surface is named once, here.
 *
 * DELETE THIS the moment the draft is applied and `npm run db:types` is re-run: the two calls below then
 * typecheck against the generated types with no other change, and the compiler will point at this block.
 */
type RpcError = { code?: string; message: string };
type DraftRpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError | null }>;

function draftRpc(supabase: StaffClient): DraftRpc {
  return (supabase as unknown as { rpc: DraftRpc }).rpc.bind(supabase);
}

/**
 * PostgREST reports a function that does not exist as PGRST202 (and PostgreSQL as 42883) — which, for a module
 * whose SQL is still a draft, is the normal state and not a fault. Everything else is the database refusing on
 * purpose, and the code it raises is the message.
 */
function failureOf(error: RpcError): ReadFailure {
  if (error.code === "PGRST202" || error.code === "42883") return "not_applied";
  if (error.message === "module_closed") return "closed";
  if (error.message === "forbidden") return "forbidden";
  if (error.message === "invalid_person") return "missing";
  return "error";
}

/** One client's file. Refuses in the database first (app.can_see_person), so this never filters by hand. */
export async function zitountiFile(supabase: StaffClient, personId: string): Promise<FileResult> {
  const { data, error } = await draftRpc(supabase)("staff_zitounti_file", { p_person_id: personId });
  if (error) return { ok: false, reason: failureOf(error) };
  if (!data) return { ok: false, reason: "error" };
  return { ok: true, file: data as ZitountiFile };
}

/** Everyone who holds a tree, already filtered row by row to the files this reader may open. */
export async function zitountiHolders(supabase: StaffClient): Promise<HoldersResult> {
  const { data, error } = await draftRpc(supabase)("staff_zitounti_holders");
  if (error) return { ok: false, reason: failureOf(error) };
  return { ok: true, holders: (data as Holder[] | null) ?? [] };
}

/**
 * The words on this screen. They live in the `zitounti` settings group so the owner edits them, and most of
 * them are private, so they come from the staff client and not from the cached public configuration.
 */
export async function zitountiCopy(supabase: StaffClient): Promise<(key: string, fallback?: string) => string> {
  const { data } = await supabase.from("settings").select("key, value").like("key", "zitounti.%");
  const map = new Map((data ?? []).map((row) => [row.key, row.value]));
  return (key: string, fallback = "") => {
    const value = map.get(key);
    return typeof value === "string" ? value : fallback;
  };
}
