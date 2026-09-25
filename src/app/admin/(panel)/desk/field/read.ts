import "server-only";

// The reads behind «زياراتي». Three of them, and not one computes anything.
//
// THE VISITS COME FROM THE VISITS ENGINE, UNCHANGED. public.staff_visit_board (0064) already groups by day,
// orders by slot, counts per status, resolves every Arabic word and carries the client, the phone, the offer
// and its coordinates. It also already accepts an `assigned_to` filter, which is the whole of «زياراتي» — so
// this desk adds no second board, no second query and no second vocabulary. It asks the same function the
// Back Office calendar asks, with one more argument.
//
// THE ONE THING THE BOARD DOES NOT CARRY is what §7 says the field commercial must know BEFORE the meeting:
// «شنوّة طلب، ميزانيتو، كيفاش يحب يخلّص، وملاحظات فريق الهاتف». app.visit_payload returns the demand as
// {id, request_no} and stops there. Rather than widen a live payload from a screen, the two reads below fetch
// those facts from the tables they already live in — public.interest_requests, public.contact_attempts,
// public.person_notes — each of which is narrowed by RLS to app.can_see_person, so this desk can never show a
// reader a file the CRM would not have shown them anyway.
//
// EVERY LABEL IS A SNAPSHOT THE INTAKE ALREADY FROZE (budget_label_ar, duration_label_ar, spacing_label_ar…),
// so renaming an option list next month cannot rewrite what a client was quoted. Nothing is re-derived here.
//
// KNOWN LIMIT, worth reading before anyone debugs an empty screen: public.visits_select and
// staff_visit_board both narrow rows by app.can_see_person(person_id) — who owns the LEAD — and never by
// visits.assigned_to. In this brief's own flow the call centre owns the lead and a DIFFERENT person does the
// visit, so a field commercial assigned to a visit on a colleague's file cannot read their own visit at all.
// supabase/pending/bb_71_tree_picking.sql §1 widens both by `or assigned_to = auth.uid()`; until it is applied
// the page below says plainly why a board can be empty instead of pretending there is nothing to do.

import { CRM_READ_ROLES, requireStaff, type StaffSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { readVisitBoard } from "../../visits/visit-data";
import type { VisitBoard } from "../../visits/visit-model";

/** What the client asked for, as they typed it on the site. §4 and §26: never retyped, only read. */
export type RequestBrief = {
  requestId: string;
  requestNo: string;
  kind: string;
  /** The trees they asked for: the offer form's exact number, else the band the calculator recorded. */
  trees: number | null;
  treesLabel: string | null;
  spacingLabel: string | null;
  areaPerTreeM2: number | null;
  plantationSystems: string[];
  productionStatuses: string[];
  budgetLabel: string | null;
  paymentMode: string | null;
  downPaymentLabel: string | null;
  downPaymentPercent: number | null;
  downPaymentMillimes: number | null;
  durationLabel: string | null;
  durationMonths: number | null;
  monthlyMillimes: number | null;
  totalMillimes: number | null;
  pricePerTreeMillimes: number | null;
  contactTimeLabel: string | null;
  projectId: string | null;
};

/** One line of what the phone team already knows. Two stores, one feed, newest first. */
export type CallNote = {
  id: string;
  personId: string;
  at: string;
  kind: "attempt" | "note";
  channel: string | null;
  outcome: string | null;
  body: string | null;
  nextFollowUpAt: string | null;
};

export type FieldDesk = {
  session: StaffSession;
  /** The board as staff_visit_board returned it, or null when the module is not installed. */
  board: VisitBoard | null;
  /** How many visits the reader may see WITHOUT the «mine» filter — so an empty «زياراتي» can explain itself. */
  visibleTotal: number;
  requests: Map<string, RequestBrief>;
  notes: Map<string, CallNote[]>;
  reasonMin: number;
};

export type DeskFilters = { mine: boolean };

/**
 * Everything one field commercial needs for their day, in one pass.
 *
 * The date window is the board's own default (today → visits.max_ahead_days), so the desk never works out a
 * date in Tunis: it groups the days the RPC already returned. The counts, the ordering and every Arabic word
 * arrive decided.
 */
export async function readFieldDesk({ mine }: DeskFilters): Promise<FieldDesk> {
  const session = await requireStaff(CRM_READ_ROLES);
  const supabase = await createClient();

  // Two asks of the same stable function: the reader's own visits, and everything they may see. The second is
  // only ever used to explain an empty first — «ما عندك حتى زيارة مسندة ليك، أما فما 3 زيارات تنجم تشوفهم».
  const [board, everything, { data: settingRows }] = await Promise.all([
    readVisitBoard(mine ? { assignedTo: session.id } : {}),
    mine ? readVisitBoard({}) : Promise.resolve(null),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  const visits = (board?.days ?? []).flatMap((day) => day.visits);
  const requestIds = [...new Set(visits.map((visit) => visit.request?.id).filter((id): id is string => Boolean(id)))];
  const personIds = [...new Set(visits.map((visit) => visit.person.id))];

  const [requests, notes] = await Promise.all([readRequests(supabase, requestIds), readCallNotes(supabase, personIds)]);

  return {
    session,
    board,
    visibleTotal: mine ? (everything?.counts.total ?? 0) : (board?.counts.total ?? 0),
    requests,
    notes,
    reasonMin,
  };
}

type StaffClient = Awaited<ReturnType<typeof createClient>>;

/** The demands behind a set of visits. RLS narrows to app.can_see_person; a miss simply has no entry. */
async function readRequests(supabase: StaffClient, requestIds: readonly string[]): Promise<Map<string, RequestBrief>> {
  if (requestIds.length === 0) return new Map();

  // ONE STRING LITERAL, on one line, and it has to stay that way: supabase-js types a select from the literal
  // it is given, and `"a, b" + "c"` is plain `string` to TypeScript — the rows come back as GenericStringError
  // and every column read below stops compiling. Concatenating this to fit a margin costs the whole type.
  const { data } = await supabase
    .from("interest_requests")
    .select(
      "id, request_no, request_kind, project_id, offer_trees, tree_count_min, tree_count_label_ar, spacing_label_ar, area_per_tree_m2, plantation_systems, production_statuses, budget_label_ar, payment_mode, down_payment_label_ar, down_payment_percent, down_payment_amount_millimes, duration_label_ar, duration_months, monthly_millimes, offer_total_price_millimes, offer_price_per_tree_millimes, price_per_tree_millimes, contact_time_label_ar",
    )
    .in("id", [...requestIds]);

  const out = new Map<string, RequestBrief>();
  for (const row of data ?? []) {
    out.set(row.id, {
      requestId: row.id,
      requestNo: row.request_no,
      kind: row.request_kind,
      trees: row.offer_trees ?? row.tree_count_min ?? null,
      treesLabel: row.tree_count_label_ar,
      spacingLabel: row.spacing_label_ar,
      areaPerTreeM2: row.area_per_tree_m2,
      plantationSystems: row.plantation_systems ?? [],
      productionStatuses: row.production_statuses ?? [],
      budgetLabel: row.budget_label_ar,
      paymentMode: row.payment_mode,
      downPaymentLabel: row.down_payment_label_ar,
      downPaymentPercent: row.down_payment_percent,
      downPaymentMillimes: row.down_payment_amount_millimes,
      durationLabel: row.duration_label_ar,
      durationMonths: row.duration_months,
      monthlyMillimes: row.monthly_millimes,
      totalMillimes: row.offer_total_price_millimes,
      pricePerTreeMillimes: row.offer_price_per_tree_millimes ?? row.price_per_tree_millimes,
      contactTimeLabel: row.contact_time_label_ar,
      projectId: row.project_id,
    });
  }
  return out;
}

/**
 * What the phone team wrote, merged into one feed per client (§17's «ملاحظات كل الفرق», at the size a visit
 * card can carry). Two tables, one list, newest first — the same merge the client file's timeline does, kept
 * short here because this is a briefing before a meeting, not the file itself.
 */
async function readCallNotes(supabase: StaffClient, personIds: readonly string[]): Promise<Map<string, CallNote[]>> {
  if (personIds.length === 0) return new Map();
  const ids = [...personIds];

  const [attempts, notes] = await Promise.all([
    supabase
      .from("contact_attempts")
      .select("id, person_id, channel, outcome, note, next_follow_up_at, created_at")
      .in("person_id", ids)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("person_notes")
      .select("id, person_id, body, created_at")
      .in("person_id", ids)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const out = new Map<string, CallNote[]>();
  const push = (line: CallNote) => {
    const list = out.get(line.personId) ?? [];
    list.push(line);
    out.set(line.personId, list);
  };

  for (const row of attempts.data ?? []) {
    push({
      id: row.id,
      personId: row.person_id,
      at: row.created_at,
      kind: "attempt",
      channel: row.channel,
      outcome: row.outcome,
      body: row.note,
      nextFollowUpAt: row.next_follow_up_at,
    });
  }
  for (const row of notes.data ?? []) {
    push({
      id: row.id,
      personId: row.person_id,
      at: row.created_at,
      kind: "note",
      channel: null,
      outcome: null,
      body: row.body,
      nextFollowUpAt: null,
    });
  }

  for (const [personId, list] of out) {
    list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    out.set(personId, list.slice(0, 6));
  }
  return out;
}
