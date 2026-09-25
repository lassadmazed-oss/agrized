// The shape of the call desk's queue, and the ONE rule that puts every file in exactly one bucket.
//
// This module is imported by the server reader, by the server page and by the two "use client" forms, so it
// holds no secret, imports nothing server-only, and is not a "use client" module either: a Server Component
// that imports a VALUE from a "use client" module receives a client-reference proxy, which has cost this
// project a real runtime crash before. Types, one partition function, and one list of stage codes.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THE BUCKET IS DERIVED AND NOT TYPED
//
// Nothing in AgriZed advances a customer's stage. Searching every write to public.persons across all 71
// applied migrations returns one kind of statement outside intake — `set assigned_to` — and the only writer of
// status_id in the whole product is a human dropdown. So a queue built on «files whose status is قيد الاتصال»
// would be a queue built on what somebody remembered to click, and at n=20 the dropdown and the facts already
// disagree. Every bucket here is derived from a FACT that exists whether or not anyone remembered anything:
// public.contact_attempts rows and their next_follow_up_at.
//
// THE RULE, in order. The first line that matches wins.
//
//   1. The newest call on this file promised a next one → «موعد» (due now if that moment has passed, «جاي»
//      if it has not). A promise made to a client outranks every other consideration, including a file
//      somebody parked: if an agent wrote «نعاود نكلّمو نهار الخميس», Thursday is when it comes back.
//      It is the NEWEST call that decides, not any call: an agent who set a callback and then reached the
//      client the next day has answered it, and the later row is the one that says where the file stands.
//   2. The file sits at a stage the call desk no longer chases → «مسكّر». Counted, never drawn.
//   3. No call was ever logged on this file → «جديد».
//   4. Otherwise: called, no next step written down → «مفتوح». This is the bucket that quietly eats a
//      call centre, which is why it gets a section of its own instead of being left to be noticed.
//
// The four drawn buckets plus «مسكّر» are the whole book, and each file is in one of them. That is what makes
// the four tiles above the tables trustworthy: they add up to the number of files you hold, and no file is
// counted twice or missed.
//
// AT SCALE this belongs in Postgres — one security-definer function that returns the partition, the way
// app.reservation_payload and staff_visit_board already do for their modules. ./read.ts folds it in TypeScript
// over a capped read instead, says so on the screen when the cap bites, and names the RPC that should replace
// it. That is honest at the size this product is (§3's own example is «40 لسارة، 50 لمريم» — a book is dozens
// of files) and it is not honest at ten thousand.

/** The four buckets the desk draws, plus the one it only counts. */
export type Bucket = "due" | "new" | "open" | "later" | "closed";

/** The order the sections and the tiles are drawn in: most urgent first. */
export const DRAWN_BUCKETS = ["due", "new", "open", "later"] as const satisfies readonly Bucket[];

/**
 * The stages the call desk stops chasing.
 *
 * These are values of public.lead_stage, a hard Postgres enum fixed by the schema — NOT labels. The owner
 * renames «غير مهتم حالياً» and «مغلق» freely in public.lead_statuses and every word this screen prints comes
 * from that table; what he cannot do from the Back Office is add or rename a STAGE, which is why branching on
 * one is reading the schema rather than hard-coding a business value.
 *
 * «paused» is in the list because its own seeded label says what it means — «غير مهتم حالياً» — and a file
 * nobody is chasing does not belong in a queue of calls to make. It is not lost: rule 1 runs first, so a
 * paused file with a callback date still comes back on that date, which is exactly the case the label
 * describes. «owner» and «closed» are the sale and the end of the road.
 */
export const UNCHASED_STAGES = ["paused", "owner", "closed"] as const;

/** The last call logged on a file, as the queue needs it. */
export type LastAttempt = {
  at: string;
  channel: string;
  outcome: string;
  note: string | null;
  next_follow_up_at: string | null;
  by: string | null;
};

/** The demand the client sent from the site — what the agent is calling ABOUT (§4, §26: never retyped). */
export type QueueRequest = {
  id: string;
  request_no: string;
  created_at: string;
  request_kind: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  trees: number | null;
  trees_label: string | null;
  wants_visit: boolean | null;
  payment_mode: string | null;
  monthly_millimes: number | null;
  budget_label_ar: string | null;
  duration_months: number | null;
  down_payment_label_ar: string | null;
  contact_time_label_ar: string | null;
  goal_label_ar: string | null;
  governorates: string[];
  anywhere: boolean;
};

export type QueueLead = {
  person_id: string;
  full_name: string;
  phone_e164: string;
  whatsapp_e164: string | null;
  governorate: string | null;
  created_at: string;
  assigned_to: string | null;
  owner_name: string | null;
  status_id: string;
  status_label: string;
  stage: string;
  last: LastAttempt | null;
  request: QueueRequest | null;
  bucket: Bucket;
  /** The moment this row is waiting for: the callback when there is one, otherwise the last call. */
  due_at: string | null;
};

/**
 * Where one file stands. `now` is passed in so the whole page partitions against a single instant — a queue
 * whose rows were each judged against their own Date.now() can show a file in two sections on one render.
 */
export function bucketFor(
  { stage, last }: { stage: string; last: LastAttempt | null },
  now: number,
): Bucket {
  if (last?.next_follow_up_at) {
    return new Date(last.next_follow_up_at).getTime() <= now ? "due" : "later";
  }
  if ((UNCHASED_STAGES as readonly string[]).includes(stage)) return "closed";
  if (!last) return "new";
  return "open";
}

/** Section headings and the sentence under each one. The desk's own copy, not a status name. */
export const BUCKET_COPY: Record<Exclude<Bucket, "closed">, { title: string; hint: string; empty: string }> = {
  due: {
    title: "مكالمات مستحقة توّا",
    hint: "وعدنا الحريف بمكالمة والوقت جا ولا فات. ابدا من هوني.",
    empty: "ما فماش مكالمة مستحقة. كل المواعيد اللي وعدنا بيهم مازال وقتهم ما جاش.",
  },
  new: {
    title: "ملفات جديدة — ما تكلّمناش معاهم",
    hint: "بعثو مطلب من الموقع وما فما حتى مكالمة مسجّلة. الأقدم الأول.",
    empty: "ما فماش ملف جديد مستنّي مكالمة.",
  },
  open: {
    title: "بدينا وما كمّلناش",
    hint: "كلّمناهم وما كتبناش شنوّا الخطوة الجاية. اللي برد أكثر الأول — سجّل موعد ولا سكّر الملف.",
    empty: "كل ملف تكلّمنا فيه عندو خطوة جاية مكتوبة.",
  },
  later: {
    title: "مواعيد جاية",
    hint: "مكالمات موعودة مازال وقتها ما جاش. موجودة باش تعرف الأسبوع متاعك، موش باش تعملها توّا.",
    empty: "ما فماش موعد مكالمة مبرمج.",
  },
};

/**
 * The two outcomes that make a callback date the point of the call.
 *
 * §5: «No answer ⇒ a CALLBACK DATE AND TIME, and the lead comes back to them at that moment.» These are
 * values of the public.contact_outcome enum — schema, not owner copy — and the desk refuses the form without
 * a date when one of them is chosen, because an unanswered call with no date is a lead that silently stops
 * existing. It is a workflow rule of §5, written once, here, and enforced again in the Server Action.
 */
export const OUTCOMES_NEEDING_CALLBACK = ["no_answer", "callback"] as const;

export function needsCallback(outcome: string): boolean {
  return (OUTCOMES_NEEDING_CALLBACK as readonly string[]).includes(outcome);
}

// ── §3: the manager's panel ─────────────────────────────────────────────────────────────────────────────

/** One agent a manager may hand files to, with the one figure that makes the decision takeable. */
export type DistributionTarget = {
  id: string;
  name: string;
  /** Files on this agent's desk the call centre still chases — the same definition the buckets above use. */
  open_files: number;
};

export type Distribution = {
  /** How many files are waiting for an owner right now. */
  pool: number;
  targets: DistributionTarget[];
};
