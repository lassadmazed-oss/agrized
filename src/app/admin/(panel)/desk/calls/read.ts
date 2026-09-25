import "server-only";

// Everything the call desk reads, in one place. Four queries for the queue, three for the manager's panel.
//
// SCOPE IS RLS FIRST, A FILTER SECOND. public.persons_select already narrows a `commercial` to the files
// assigned to them (0002_reference_and_crm.sql:284-289), and public.contact_attempts, public.person_notes and
// public.interest_requests all narrow to app.can_see_person. So an agent's book needs no rule written here —
// the database answers with it. The explicit `.eq("assigned_to", …)` below is for the reader who can see MORE
// than their own book (admin, and finance/legal who read every file): «my desk» has to mean my desk for them
// too, or the manager's queue would be the whole company's and §3's «each agent mainly sees the leads assigned
// to them» would stop being true from the top down.
//
// THE CALLS AND THE DEMANDS ARE READ IN TWO WAYS, and the book's size picks which. Up to IN_LIMIT files they
// are asked for by person and the answer is EXACT. Past that, `person_id=in.(…)` becomes a query string of
// tens of kilobytes on a GET — past Node's default header ceiling, i.e. a read that works on a small book and
// fails on a big one — so it falls back to «the newest N rows RLS lets me see», which is a slice, and the page
// says it is one rather than quietly showing a short queue. That is why the persons read is awaited before the
// other two instead of joining them in one Promise.all: the ids decide the shape of the next two queries.
//
// WHAT THIS SHOULD BE. One security-definer function returning the partition, the way app.reservation_payload
// and staff_visit_board already answer for their modules — call it staff_call_queue, and the caps, the folds
// and the truncation flag in this file all go with it. It is not written today because the call desk's files
// are the only ones this run may touch and new SQL belongs in a draft another session is numbering. Until
// then: capped, and the screen says so out loud when a cap bites rather than quietly showing a short queue.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicConfig } from "@/lib/config";
import type { Database } from "@/lib/supabase/database.types";

import {
  bucketFor,
  UNCHASED_STAGES,
  type Bucket,
  type Distribution,
  type LastAttempt,
  type QueueLead,
  type QueueRequest,
} from "./queue-model";

type Client = SupabaseClient<Database>;

/** A book bigger than this is an RPC's job, not this file's. The screen says so when it is reached. */
const PERSON_LIMIT = 1000;
const ATTEMPT_LIMIT = 4000;
const REQUEST_LIMIT = 4000;

/**
 * Up to this many files, the calls and the demands are asked for BY PERSON and the answer is exact. Past it
 * the query string («person_id=in.(…)», 37 bytes a UUID) outgrows what a GET may carry, and the read falls
 * back to «the newest N rows RLS lets me see» — which is a slice, and the screen says so when it is one.
 * 200 covers §3's own example twice over: «40 لسارة، 50 لمريم، 30 لأحمد» is what one agent's book looks like.
 */
const IN_LIMIT = 200;

export type QueueScope = "mine" | "team";

export type CallQueue = {
  scope: QueueScope;
  /** Every file in the scope, already bucketed and ordered inside its bucket. */
  buckets: Record<Bucket, QueueLead[]>;
  counts: Record<Bucket, number>;
  total: number;
  /** A cap was reached, so the queue below is a slice and not the book. */
  truncated: boolean;
  /** The single instant the whole page was partitioned against. */
  now: number;
};

function nameOf(value: { full_name: string } | { full_name: string }[] | null): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0]?.full_name ?? null) : value.full_name;
}

/** Oldest first: in a call queue the file that has waited longest is the one that is going cold. */
function oldestFirst(a: string | null, b: string | null): number {
  return new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime();
}

export async function readCallQueue(
  supabase: Client,
  { scope, userId, config }: { scope: QueueScope; userId: string; config: PublicConfig },
): Promise<CallQueue> {
  const now = Date.now();

  let personQuery = supabase
    .from("persons")
    .select(
      "id, full_name, phone_e164, whatsapp_e164, governorate_id, created_at, assigned_to, status_id, status:lead_statuses(label_ar, stage), owner:profiles!persons_assigned_to_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(PERSON_LIMIT);
  if (scope === "mine") personQuery = personQuery.eq("assigned_to", userId);

  const people = await personQuery;
  const personRows = people.data ?? [];
  const ids = personRows.map((row) => row.id);
  const narrow = ids.length > 0 && ids.length <= IN_LIMIT;

  let attemptQuery = supabase
    .from("contact_attempts")
    .select("person_id, channel, outcome, note, next_follow_up_at, created_at, author:profiles!contact_attempts_created_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(ATTEMPT_LIMIT);
  let requestQuery = supabase
    .from("interest_requests")
    .select(
      "id, person_id, request_no, created_at, request_kind, project_id, project_code, project_name, offer_trees, tree_count_min, tree_count_label_ar, wants_visit, payment_mode, monthly_millimes, budget_label_ar, duration_months, down_payment_label_ar, contact_time_label_ar, goal_label_ar, invest_governorate_ids, invest_anywhere",
    )
    .order("created_at", { ascending: false })
    .limit(REQUEST_LIMIT);
  if (narrow) {
    attemptQuery = attemptQuery.in("person_id", ids);
    requestQuery = requestQuery.in("person_id", ids);
  }

  const [attempts, requests] = ids.length === 0 ? [null, null] : await Promise.all([attemptQuery, requestQuery]);

  const attemptRows = attempts?.data ?? [];
  const requestRows = requests?.data ?? [];

  // Both reads come back newest first, so the first row seen for a person IS that person's latest.
  const lastAttempt = new Map<string, LastAttempt>();
  for (const row of attemptRows) {
    if (lastAttempt.has(row.person_id)) continue;
    lastAttempt.set(row.person_id, {
      at: row.created_at,
      channel: row.channel,
      outcome: row.outcome,
      note: row.note,
      next_follow_up_at: row.next_follow_up_at,
      by: nameOf(row.author),
    });
  }

  const governorate = new Map(config.governorates.map((row) => [row.id, row.name_ar]));
  const lastRequest = new Map<string, QueueRequest>();
  for (const row of requestRows) {
    if (lastRequest.has(row.person_id)) continue;
    lastRequest.set(row.person_id, {
      id: row.id,
      request_no: row.request_no,
      created_at: row.created_at,
      request_kind: row.request_kind,
      project_id: row.project_id,
      project_code: row.project_code,
      project_name: row.project_name,
      // The count the client asked for: an offer demand names it exactly, a simulation gives the band's floor.
      trees: row.offer_trees ?? row.tree_count_min,
      trees_label: row.tree_count_label_ar,
      wants_visit: row.wants_visit,
      payment_mode: row.payment_mode,
      monthly_millimes: row.monthly_millimes,
      budget_label_ar: row.budget_label_ar,
      duration_months: row.duration_months,
      down_payment_label_ar: row.down_payment_label_ar,
      contact_time_label_ar: row.contact_time_label_ar,
      goal_label_ar: row.goal_label_ar,
      governorates: (row.invest_governorate_ids ?? []).map((id) => governorate.get(id) ?? String(id)),
      anywhere: row.invest_anywhere,
    });
  }

  const buckets: Record<Bucket, QueueLead[]> = { due: [], new: [], open: [], later: [], closed: [] };

  for (const row of personRows) {
    const status = Array.isArray(row.status) ? row.status[0] : row.status;
    const stage = status?.stage ?? "new";
    const last = lastAttempt.get(row.id) ?? null;
    const bucket = bucketFor({ stage, last }, now);
    buckets[bucket].push({
      person_id: row.id,
      full_name: row.full_name,
      phone_e164: row.phone_e164,
      whatsapp_e164: row.whatsapp_e164,
      governorate: row.governorate_id === null ? null : (governorate.get(row.governorate_id) ?? null),
      created_at: row.created_at,
      assigned_to: row.assigned_to,
      owner_name: nameOf(row.owner),
      status_id: row.status_id,
      status_label: status?.label_ar ?? "—",
      stage,
      last,
      request: lastRequest.get(row.id) ?? null,
      bucket,
      due_at: last?.next_follow_up_at ?? last?.at ?? null,
    });
  }

  // Each bucket in the order its own work is done in. A promised call is ordered by the moment it was
  // promised for; a file nobody has called yet, and a file that has gone quiet, by how long it has been
  // waiting. All three are «the coldest first», which is the only ordering a queue of calls can defend.
  buckets.due.sort((a, b) => oldestFirst(a.last?.next_follow_up_at ?? null, b.last?.next_follow_up_at ?? null));
  buckets.later.sort((a, b) => oldestFirst(a.last?.next_follow_up_at ?? null, b.last?.next_follow_up_at ?? null));
  buckets.new.sort((a, b) => oldestFirst(a.created_at, b.created_at));
  buckets.open.sort((a, b) => oldestFirst(a.last?.at ?? null, b.last?.at ?? null));

  const counts = {
    due: buckets.due.length,
    new: buckets.new.length,
    open: buckets.open.length,
    later: buckets.later.length,
    closed: buckets.closed.length,
  };

  return {
    scope,
    buckets,
    counts,
    total: personRows.length,
    // A cap that BIT, not a cap that exists. Under IN_LIMIT files the two side reads were asked for by person
    // and are exact, so the only thing that can truncate is the book itself.
    truncated:
      personRows.length >= PERSON_LIMIT ||
      (!narrow && (attemptRows.length >= ATTEMPT_LIMIT || requestRows.length >= REQUEST_LIMIT)),
    now,
  };
}

// ── The manager's panel (§3) ────────────────────────────────────────────────────────────────────────────

/**
 * Who may receive files, and how full each of them already is.
 *
 * public.admin_assign_persons refuses a target who is not an ACTIVE commercial (`target_not_active_commercial`),
 * so the list this returns is the same list the database will accept and nothing here invents a rule. The
 * capacity figure is the one thing §3 needs and no screen has today: «40 to Sara, 50 to Meriem» is a decision
 * nobody can take without knowing what Sara is already holding.
 */
export async function readDistribution(supabase: Client): Promise<Distribution> {
  const [pool, roles, statuses] = await Promise.all([
    supabase.from("persons").select("id", { count: "exact", head: true }).is("assigned_to", null),
    supabase
      .from("user_roles")
      .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name, is_active)")
      .eq("role", "commercial"),
    supabase.from("lead_statuses").select("id, stage").eq("is_active", true),
  ]);

  // «Still chased» is the same definition the queue uses, read from the owner's own rows: whatever he has
  // renamed his statuses to, the stages behind them are the schema's and the two figures cannot drift apart.
  const chasedStatusIds = (statuses.data ?? [])
    .filter((row) => !(UNCHASED_STAGES as readonly string[]).includes(row.stage))
    .map((row) => row.id);

  const active = (roles.data ?? [])
    .map((row) => ({ id: row.user_id, profile: Array.isArray(row.profile) ? row.profile[0] : row.profile }))
    .filter((row) => row.profile?.is_active)
    .map((row) => ({ id: row.id, name: row.profile?.full_name || "—" }));

  const counted = await Promise.all(
    active.map(async (target) => {
      if (chasedStatusIds.length === 0) return { ...target, open_files: 0 };
      const { count } = await supabase
        .from("persons")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", target.id)
        .in("status_id", chasedStatusIds);
      return { ...target, open_files: count ?? 0 };
    }),
  );

  return { pool: pool.count ?? 0, targets: counted };
}

/**
 * «now» as a <input type="datetime-local"> writes it, in Africa/Tunis — the one timezone this product shows.
 * Formatting, not a business value: it is the floor under the callback field so an agent cannot promise a call
 * in the past. The database stores what the Server Action converts, and neither is decided here.
 */
export function tunisLocalNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
