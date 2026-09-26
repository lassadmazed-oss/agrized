// فضاء «زيتونتي» — the client's OWN file, read by the client.
//
// THE ONE THING THIS MODULE EXISTS TO CHANGE. public.staff_zitounti_file(uuid) has answered the whole file
// since 0068 (and the last three sections since 0095), and the account screen has been drawing it for staff
// since 0068 too. But that function is gated on app.is_staff() AND app.can_see_person(), so the buyer whose
// file it is could not call it: a signed-in client hit `forbidden` on their own trees. The screen therefore
// showed a list of labels that opened nothing and a card with a mock-up's figures on it — which is what the
// owner has been looking at and calling unbuilt.
//
// The answer is public.my_zitounti_file(), and the shape of its signature is the security argument:
//
//     my_zitounti_file()        -- NO ARGUMENT
//
// It resolves the person from auth.uid() through public.persons.profile_id, so there is no id for a caller to
// tamper with. A buyer cannot ask for somebody else's file because there is nowhere to put the request. That
// is why this reader takes no person id either, and why nothing in this file filters by hand: the database
// decided whose file it is before a single row was selected.
//
// IT RETURNS THE SAME PAYLOAD AS staff_zitounti_file, deliberately — it calls the same app.zitounti_* readers
// rather than re-deriving anything — so one set of types and one set of components draw both screens.
//
// NO MONEY ARITHMETIC AND NO FORMATTING HERE. Amounts arrive as integer millimes exactly as the database
// holds them; src/lib/format.ts is the only formatter in this product. Nothing in this file adds two millime
// figures together, because every total the screen prints is already a column of the payload (`totals`,
// `money`), computed once in SQL by the same function Finance reads.
//
// NOT "use client" AND NOT server-only, ON PURPOSE — the same call as src/lib/journey.ts made, for the same
// reason. The Supabase client is a PARAMETER and imported as a TYPE only, so a client component may import
// the types and the section keys from here without pulling anything server-side into a browser bundle, and a
// Server Component may import the VALUES (the keys) without the "use client" boundary that would forbid it.
//
// ---------------------------------------------------------------------------
// WHY THE TYPES ARE HERE AND NOT SHARED WITH THE BACK OFFICE YET
// ---------------------------------------------------------------------------
// src/app/admin/(panel)/persons/read.ts carries its own copy of this payload's types, written when زيتونتي was
// a staff-only read. This file is not allowed to edit that one (three sessions are editing this repo at once),
// so the shapes are declared again here rather than imported across the app/ boundary — which is the right
// direction anyway: a payload two screens read belongs in src/lib, not inside one route folder.
//
// FOLLOW-UP, for whoever next opens that file: delete its ZitountiFile block and re-export from here. Its copy
// is already stale in three places, which is the argument for the move — it still types `contracts`,
// `installments` and `documents` as `Section<never>`, the state 0068 left them in, and 0095 has been answering
// all three with real rows since 2026-09-25. The types below are the ones that match the live function.

import type { createClient } from "@/lib/supabase/server";

/**
 * The buyer's own SSR client — the session in the cookie, not the service-role client.
 *
 * THIS IS THE POINT, not an implementation detail. src/lib/client-auth.ts reads public.persons with the admin
 * client because that table is narrowed to staff and a buyer needs exactly one row from it. The FILE is the
 * opposite case: it spans trees, requests, reservations, visits, payments, contracts, instalments and
 * documents, and what a buyer may see of each is a decision that belongs in the database. So the read goes
 * through the buyer's own session and my_zitounti_file() answers auth.uid(). Hand this an admin client and the
 * function would resolve no person at all — there is no auth.uid() on a service-role connection — which is a
 * failure loud enough to catch in review, and is the only reason it is safe to say so in a comment.
 */
type ClientSession = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// The sections, and the order they are read in
// ---------------------------------------------------------------------------

/**
 * The eleven keys of the payload, in v3 §39's order.
 *
 * THE KEY IS CODE, THE LABEL IS DATA — the same split src/lib/journey.ts argues for its thirteen stages. A key
 * here is the name of a section of the file, it is what a URL segment and a `switch` branch on, and the owner
 * does not rename it because he does not rename a route. Every WORD on the screen is a setting in the
 * `zitounti` group («زيتوناتي», «مطالبي», …) and is read from there, never from this file.
 */
export const ZITOUNTI_SECTION_KEYS = [
  "trees",
  "requests",
  "reservations",
  "visits",
  "payments",
  "contracts",
  "installments",
  "operations",
  "subscription",
  "harvest",
  "documents",
] as const;

export type ZitountiSectionKey = (typeof ZITOUNTI_SECTION_KEYS)[number];

/** True for a segment of the URL that names a section this build knows. Everything else is a 404. */
export function isZitountiSectionKey(value: string | null | undefined): value is ZitountiSectionKey {
  return typeof value === "string" && (ZITOUNTI_SECTION_KEYS as readonly string[]).includes(value);
}

/**
 * Where each section's TITLE comes from — one key of public.settings, group `zitounti`, so the owner names
 * «زيتوناتي» and «مطالبي» himself and a rename reaches the account list, the section's own heading and the
 * browser tab at once.
 *
 * It is here rather than in either page because both need it and neither owns it: the account list builds a row
 * per section and the section route titles itself. `installments` shares the contracts row's word, because the
 * owner's label for that row is «العقود والأقساط» — one line over two sections of the payload.
 */
export const ZITOUNTI_SECTION_SETTING: Record<ZitountiSectionKey, string> = {
  trees: "zitounti.section_trees",
  requests: "zitounti.section_requests",
  reservations: "zitounti.section_reservations",
  visits: "zitounti.section_visits",
  payments: "zitounti.section_payments",
  contracts: "zitounti.section_contracts",
  installments: "zitounti.section_contracts",
  operations: "zitounti.section_operations",
  subscription: "zitounti.section_subscription",
  harvest: "zitounti.section_harvest",
  documents: "zitounti.section_documents",
};

/**
 * Why a section holds nothing, which is a different question from whether it holds nothing.
 *   ok           read; it may still hold no rows, and «ما فمّاش» is then the true answer
 *   closed       the module that WRITES this record is switched off in الإعدادات ← الموديولات
 *   not_built    its table does not exist in the database yet
 *   phase_later  a stage deliberately not built yet
 *
 * The screen prints a different sentence for each, and that is the whole reason the status travels with the
 * rows: «ما عندك حتى حجز» and «الوحدة مازالت ما تفتحتش» are not the same statement about a client's money.
 */
export type ZitountiSectionStatus = "ok" | "closed" | "not_built" | "phase_later";

export type ZitountiSection<T> = { status: ZitountiSectionStatus; items: T[]; count: number };

// ---------------------------------------------------------------------------
// One type per section, matching the jsonb the app.zitounti_* readers build
// ---------------------------------------------------------------------------

/** app.zitounti_person. The identity half — only what a client file needs; the CRM keeps the rest. */
export type ZitountiPerson = {
  id: string;
  full_name: string;
  phone_e164: string;
  whatsapp_e164: string | null;
  email: string | null;
  governorate: string | null;
  delegation: string | null;
  created_at: string;
  archived: boolean;
  /** True for a buyer who can sign in — which, for anyone reading their own file, is always. */
  has_account: boolean;
  /**
   * ABSENT, NOT NULL, ON THE CLIENT PATH — and optional here because of it.
   *
   * 0102 projects the person block through an ALLOWLIST before a buyer sees it, and these two are the fields
   * that allowlist exists for: `status_ar` is the CRM lead status, AgriZed's own opinion of a lead («غير مهتم
   * حالياً»), which nobody chose to tell the buyer; `assigned_to` is a staff member's internal profile name,
   * a second person's data riding inside a payload keyed by the first. Both arrive on the staff read and
   * neither arrives on this one, so the types are optional and a screen that prints either must be a staff
   * screen. Nothing in this module's own pages reads them.
   */
  status_ar?: string | null;
  assigned_to?: string | null;
};

/**
 * app.zitounti_trees. One row per OFFER, not per tree: the offer is the grain of everything else in the file —
 * where the trees stand, what was done to them, whose season they belong to.
 */
export type ZitountiTreeGroup = {
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
  /** In tree order, never alphabetical (0054 §5). */
  first_code: string | null;
  last_code: string | null;
  /** Capped by the setting zitounti.max_codes; `trees` stays the true count, so compare the two before saying «الكل». */
  codes: string[];
  /** What this offer PROMISES to do. What was actually done is the operations section. Names only, no price. */
  services: string[];
};

/**
 * app.zitounti_requests. The figures are the quotation SNAPSHOTTED on the request the day the client asked —
 * never recomputed. The annual fee has already changed three times under live requests, and a client is owed
 * the number they were shown.
 */
export type ZitountiRequestRow = {
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

/** app.zitounti_reservations (0063). */
export type ZitountiReservationRow = {
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

/** app.zitounti_visits (0064). */
export type ZitountiVisitRow = {
  id: string;
  visit_no: string;
  status: string;
  project_code: string | null;
  visit_date: string | null;
  slot_label_ar: string | null;
  meeting_point: string | null;
};

/**
 * app.zitounti_payments (0063) — the only receipt in the schema.
 *
 * A voided receipt is KEPT and marked, never dropped: a client who was told «خلّصت» and then sees the line
 * disappear has no way to ask what happened to it. So `voided` is drawn, not filtered.
 */
export type ZitountiPaymentRow = {
  id: string;
  reference_no: string;
  kind: string;
  project_code: string | null;
  amount_millimes: number;
  method_label_ar: string | null;
  received_at: string | null;
  voided: boolean;
};

/** app.zitounti_contracts (0072). `status_label` is the owner's word from settings contracts.status_labels. */
export type ZitountiContractRow = {
  reference_no: string;
  kind_label: string | null;
  status: string;
  status_label: string;
  offer_code: string | null;
  trees_count: number | null;
  total_price_millimes: number | null;
  signed_on: string | null;
  owned_at: string | null;
};

/** One receipt against one instalment line, from app.contract_money. */
export type ZitountiReceipt = {
  id: string;
  reference_no: string;
  amount_millimes: number;
  method_label: string | null;
  reference: string | null;
  received_at: string | null;
  voided: boolean;
};

/**
 * One line of the schedule, as app.contract_money states it.
 *
 * `days_late` counts from the due date PLUS the tolerance the owner granted (settings
 * installments.grace_days_after), so this screen and the late queue can never disagree about what late counts
 * from. It is null on a line that is not late; that is not zero.
 */
export type ZitountiInstallmentLine = {
  id: string;
  seq: number;
  due_on: string;
  amount_millimes: number;
  paid_millimes: number;
  left_millimes: number;
  status: string;
  /** The owner's word, from settings installments.line_status_labels. Print this, never `status`. */
  status_label: string;
  is_late: boolean;
  days_late: number | null;
  note: string | null;
  receipts: ZitountiReceipt[];
};

/**
 * app.contract_money — every figure of one contract's money, computed in the ONE place Finance, the
 * instalments queue and this screen all read. Nothing is re-added here; a second place computing a balance is
 * how a client file and a finance screen come to disagree about what somebody owes.
 */
export type ZitountiContractMoney = {
  contract_id: string;
  /** The tolerance in days, so the screen can print it beside a late line instead of leaving it implied. */
  grace_days: number;
  reminder_days: number;
  down_payment_millimes: number | null;
  deposit_credited_millimes: number | null;
  down_payment_due_millimes: number;
  down_payment_paid_millimes: number;
  down_payment_left_millimes: number;
  down_payment_kind_label: string;
  installments_count: number;
  scheduled_millimes: number;
  installments_paid_millimes: number;
  installments_left_millimes: number;
  installments_paid_count: number;
  missed_count: number;
  next_due_on: string | null;
  next_due_millimes: number | null;
  stage: string;
  /** The owner's word, from settings installments.stage_labels. */
  stage_label: string;
  total_due_millimes: number;
  total_paid_millimes: number;
  total_left_millimes: number;
  is_settled: boolean;
  lines: ZitountiInstallmentLine[];
};

/** app.zitounti_installments — one financed contract and its whole schedule. */
export type ZitountiInstallmentPlan = {
  contract_no: string;
  money: ZitountiContractMoney;
};

/**
 * app.zitounti_documents (0095).
 *
 * `storage_path` null means «this exists as a RECORD, not as a FILE» — a contract reference to quote down the
 * phone, not something to open. Never draw one of those as a link; that distinction is the whole reason the
 * column is in the payload.
 */
export type ZitountiDocumentRow = {
  /** 'contract' | 'offer_plan' today. Treated as an open string: a later kind must not break this screen. */
  kind: string;
  reference_no: string | null;
  offer_code: string | null;
  /** The notary's or lawyer's own reference, once Legal recorded one. */
  legal_ref: string | null;
  storage_path: string | null;
  at: string | null;
};

/** app.zitounti_operations. Never its cost and never its supplier — see that function's own comment. */
export type ZitountiOperationRow = {
  id: string;
  project_code: string | null;
  /** The label frozen on the operation, not today's option list: a rename must not rewrite history. */
  service_ar: string | null;
  status: string;
  /** "offer" — the whole grove; "trees" — only the trees this act named, mine among them. */
  scope: string;
  planned_on: string | null;
  executed_on: string | null;
};

export type ZitountiSubscriptionLine = {
  label_ar: string;
  in_package: boolean;
  amount_millimes: number;
  status: string;
};

/** app.zitounti_subscription. §36 names Status and Payment as two attributes; they stay two. */
export type ZitountiSubscriptionRow = {
  id: string;
  project_code: string | null;
  season_label: string | null;
  season_starts_on: string | null;
  trees: number | null;
  /** The fee frozen for this client at signature, never today's pricing rule. */
  fee_per_tree_millimes: number | null;
  amount_millimes: number | null;
  status: string | null;
  payment_status: string | null;
  /** «شنو داخل وشنو خارج الباقة» (v2 §40) — the one question a client asks about a subscription. */
  lines: ZitountiSubscriptionLine[];
};

/**
 * app.zitounti_harvest.
 *
 * NOTHING IS COMPUTED HERE OR THERE. A season is measured once for a whole grove — you weigh a truck, not a
 * tree — and each owner's allocation is frozen into public.harvest_shares at settlement. `my_*` is that frozen
 * row and is null while the season is still running, which is why `settled` travels beside it.
 */
export type ZitountiHarvestRow = {
  season_id: string;
  project_code: string | null;
  season_label: string | null;
  season_year: number | null;
  status: string;
  choice_deadline: string | null;
  settled: boolean;
  season_olives_kg: number | null;
  season_oil_litres: number | null;
  trees_harvested: number | null;
  my_trees: number | null;
  my_olives_kg: number | null;
  my_oil_litres: number | null;
  pick_label_ar: string | null;
  outcome_label_ar: string | null;
  choice_source: string | null;
};

/**
 * «المدفوع والمتبقي» across this client's live contracts, summed in SQL from app.contract_money.
 *
 * Null when both money modules are closed — «we are not saying», which is not «zero».
 */
export type ZitountiMoneyTotals = {
  contracts: number;
  due_millimes: number;
  paid_millimes: number;
  left_millimes: number;
  missed_count: number;
  /** The nearest instalment still owed across every contract — what «شنوّة يلزمني نخلّص توّا» means. */
  next_due_on: string | null;
};

export type ZitountiTotals = {
  trees: number;
  trees_sold: number;
  trees_reserved: number;
  offers: number;
  /**
   * Every millime this person ever handed over, voided receipts excluded — including a عربون on a hold that
   * never became a contract. That is a different question from `money`, which is what their live contracts
   * account for, and the two are not interchangeable.
   */
  paid_millimes: number | null;
  money: ZitountiMoneyTotals | null;
};

/** The whole file, exactly as public.my_zitounti_file() and public.staff_zitounti_file(uuid) both answer it. */
export type ZitountiFile = {
  person: ZitountiPerson;
  trees: ZitountiSection<ZitountiTreeGroup>;
  requests: ZitountiSection<ZitountiRequestRow>;
  reservations: ZitountiSection<ZitountiReservationRow>;
  visits: ZitountiSection<ZitountiVisitRow>;
  payments: ZitountiSection<ZitountiPaymentRow>;
  contracts: ZitountiSection<ZitountiContractRow>;
  installments: ZitountiSection<ZitountiInstallmentPlan>;
  operations: ZitountiSection<ZitountiOperationRow>;
  subscription: ZitountiSection<ZitountiSubscriptionRow>;
  harvest: ZitountiSection<ZitountiHarvestRow>;
  documents: ZitountiSection<ZitountiDocumentRow>;
  totals: ZitountiTotals;
  read_at: string;
};

/**
 * Any one section of the file, when the code holds a key it has not narrowed yet — the section route reads
 * `file[key]` and hands it straight to the renderer, which narrows on the key itself.
 */
export type ZitountiAnySection = ZitountiFile[ZitountiSectionKey];

/** The section a key names, with no cast at the call site. */
export function zitountiSection(file: ZitountiFile, key: ZitountiSectionKey): ZitountiAnySection {
  return file[key];
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

/**
 * Why a read produced no file — which is never «it is empty», and is a different sentence each time because
 * each one has a different next step.
 *
 *   not_signed_in  no auth.uid(): the session went away between the page's own check and this call
 *   no_file        signed in, but no public.persons row points at this auth user
 *   closed         the `zitounti` module is off — the owner switches it on himself
 *   forbidden      the database refused for any other reason
 *   not_applied    public.my_zitounti_file() is not in the database yet
 *   error          anything else, which the caller surfaces rather than swallows
 */
export type ZitountiFailure = "not_signed_in" | "no_file" | "closed" | "forbidden" | "not_applied" | "error";

export type ZitountiResult = { ok: true; file: ZitountiFile } | { ok: false; reason: ZitountiFailure };

/**
 * THE ONE CAST IN THIS MODULE, and the reason for it.
 *
 * public.my_zitounti_file() is created by a migration landing in this same batch, so `npm run db:types` has
 * not seen it and the generated Database type does not carry it. The untyped surface is named ONCE, here,
 * rather than spread over the call site — the same shape src/lib/journey.ts uses for its own new surface.
 *
 * DELETE THIS once the migration is applied and `npm run db:types` has been re-run: the call below then
 * typechecks against the generated types with no other change, and the compiler points straight at this block.
 */
type RpcError = { code?: string; message: string };
type NewRpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError | null }>;

function newRpc(supabase: ClientSession): NewRpc {
  return (supabase as unknown as { rpc: NewRpc }).rpc.bind(supabase);
}

/**
 * PostgREST reports a function that does not exist as PGRST202 (and PostgreSQL as 42883) — the normal state
 * for a surface whose migration has not been applied, and not a fault. Everything else is the database
 * refusing on purpose, and the sentence it raised is the reason.
 */
function failureOf(error: RpcError): ZitountiFailure {
  if (error.code === "PGRST202" || error.code === "42883") return "not_applied";
  if (error.message === "not_signed_in") return "not_signed_in";
  if (error.message === "no_file") return "no_file";
  if (error.message === "module_closed") return "closed";
  if (error.message === "forbidden") return "forbidden";
  // 42501 is Postgres refusing the EXECUTE grant itself, which is what an unauthenticated caller gets: the
  // function is revoked from anon, so the refusal happens before a line of its body runs. The page checks the
  // session first, so this is the cookie having expired between the two — a refusal, not a fault.
  if (error.code === "42501") return "forbidden";
  return "error";
}

/**
 * ملفّي — the signed-in buyer's own file.
 *
 * Takes no person id, on purpose and unmistakably: my_zitounti_file() resolves the person from auth.uid(), so
 * there is nothing here to point at another client. Hand it the SSR client built from the request's cookies
 * (`await createClient()`), never the admin client — see ClientSession above for why the admin client would
 * resolve nobody at all.
 */
export async function readClientFile(supabase: ClientSession): Promise<ZitountiResult> {
  const { data, error } = await newRpc(supabase)("my_zitounti_file");
  if (error) return { ok: false, reason: failureOf(error) };
  if (!data) return { ok: false, reason: "error" };
  return { ok: true, file: data as ZitountiFile };
}

/**
 * What the screen says when there is no file to draw, in the buyer's language and with the next step in it.
 *
 * WHY THESE ARE IN CODE while every other word on the screen is a setting. They are not business copy: they
 * are the failure modes of one read, they are written once, and a buyer must never meet a blank screen because
 * the owner had not yet typed a sentence for a case he has never seen. The same call is made by
 * src/lib/errors.ts and by the Back Office's own copy of this list. Anything the owner is expected to edit —
 * every section title, the closed note, the unit — is read from public.settings and is not here.
 *
 * `closed` is deliberately NOT a staff sentence: the buyer cannot switch a module on, so it tells them what
 * will happen instead of asking them to do something they cannot do.
 */
export const ZITOUNTI_FAILURE_MESSAGES: Record<ZitountiFailure, string> = {
  not_signed_in: "الجلسة متاعك سالت. ادخل من جديد بنمرة التلفون متاعك، ونبعثولك رمز بالSMS.",
  no_file:
    "النمرة هذي مازال ما عندهاش ملف عند AgriZed. إذا سجّلت مطلب قبل، عيّط علينا باش نربطولك الملف بالنمرة هذي.",
  closed: "فضاء «زيتونتي» مازال ما تفتحش. كي يفتح نعلموك، وفي الوقت هذا فريق AgriZed يعطيك أخبار زيتوناتك في التلفون.",
  forbidden: "الملف هذا ما ينجّمش يتقرا من هنا. عيّط على فريق AgriZed باش يقراه معاك.",
  not_applied: "الخدمة هذي مازالت في التركيب. جرّب بعد شوية، وإذا تعاودت المشكلة عيّط على فريق AgriZed.",
  error: "ما نجّمناش نقراو ملفّك توّا. حدّث الصفحة، وإذا تعاودت المشكلة عيّط على فريق AgriZed.",
};
