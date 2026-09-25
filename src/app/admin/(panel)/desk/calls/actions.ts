"use server";

// The two acts of the call desk: log the call, and hand files out.
//
// NEITHER ONE RE-IMPLEMENTS ANYTHING. Logging a call writes through the same addContactAttempt and
// updateStatus the client file has always used, and distribution calls public.admin_assign_persons — the
// primitive that already takes a uuid[], already checks app.is_admin(), already refuses a target who is not an
// active commercial, and already writes one public.person_assignments row per file so the history survives.
// What is added here is the part §3 asks for and neither of them does: ONE act that both records the call and
// moves the file (§5), and ONE act that splits a pool across SEVERAL agents (§3's «40 لسارة، 50 لمريم»).
//
// Booking a visit is deliberately absent from this file. §6's booking is ./page.tsx handing the client file's
// own <BookVisitForm> to public.staff_book_visit — the existing engine, with its window, its slots, its
// people ceiling and its Arabic refusals, none of which the call desk is entitled to have a second opinion
// about.
//
// THE ROLE IS CHECKED HERE AND AGAIN IN THE DATABASE, which is the check that holds: app.can_edit_person
// gates the INSERT on public.contact_attempts and the UPDATE on public.persons, and app.is_admin() gates
// admin_assign_persons. A commercial who calls this action for a file that is not theirs passes
// requireStaff() and is refused by Postgres — and the refusal says so in Arabic rather than falling through
// as a silent no-op.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { formatCount, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { addContactAttempt, updateStatus } from "@/lib/backoffice/leads/actions";
import { CALL_DESK_ROLES } from "../desks";
import { needsCallback } from "./queue-model";

const DESK = "/admin/desk/calls";

/** Typed as the object and not as ActionResult, so `.message` can be quoted inside a longer sentence. */
const FAILED = { ok: false, message: "تعذّرت العملية. حدّث الصفحة وأعد المحاولة." } as const;

/**
 * §5 — one act: the call is recorded AND the file moves.
 *
 * Today these are two things an agent has to remember to do twice, in two different vocabularies:
 * public.contact_outcome (a Postgres enum of five) says how the call went, public.lead_statuses (the owner's
 * own twelve editable rows) says where the file now stands, and nothing joins them. The owner's §5 names six
 * results that straddle both — «مهتم», «مؤهل للزيارة», «موعد زيارة محدد» are statuses, «لم يتم الرد» and
 * «إعادة الاتصال» are outcomes — so the honest answer until the two vocabularies are reconciled in SQL is to
 * ask for both in one form and write both in one act. The status half is OPTIONAL: an agent who reached
 * nobody has nothing to move.
 *
 * A HALF-SUCCESS IS REPORTED AS ONE. The attempt and the status are two statements, so the second can be
 * refused after the first was written (Finance opening a file that is not theirs, a status retired between
 * the render and the press). The reader is told exactly which half landed, because «تعذّرت العملية» over a
 * call that WAS recorded is how a call gets logged twice.
 */
export async function logCall(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(CALL_DESK_ROLES);

  const personId = z.uuid().safeParse(String(formData.get("person_id") ?? ""));
  if (!personId.success) return { ok: false, message: "الملف هذا ما عادش موجود. حدّث الصفحة وأعد المحاولة." };

  // The outcome is not validated against a list here: addContactAttempt already holds the only copy of the
  // public.contact_outcome values and refuses anything else. What is read out of it here is the one thing the
  // desk has to decide before writing — whether §5 requires a callback moment.
  const outcome = String(formData.get("outcome") ?? "");
  const followUp = String(formData.get("next_follow_up_at") ?? "").trim();
  if (needsCallback(outcome) && !followUp) {
    return {
      ok: false,
      message: "ما ردّش ولا طلب نعاودو نكلّموه: لازم تحدّد وقت المكالمة الجاية. حدّد التاريخ والساعة في خانة «موعد المكالمة الجاية» باش يرجعلك الملف في وقتو.",
    };
  }

  const attempt = new FormData();
  attempt.set("channel", String(formData.get("channel") ?? ""));
  attempt.set("outcome", outcome);
  attempt.set("note", String(formData.get("note") ?? ""));
  attempt.set("next_follow_up_at", followUp);

  const logged = await addContactAttempt(personId.data, null, attempt);
  if (!logged) return FAILED;
  if (!logged.ok) return logged;

  const lines = ["تسجّلت المكالمة."];
  if (followUp) {
    // The moment is echoed back from what was sent, formatted in Africa/Tunis like every other date on the
    // product. `${followUp}:00+01:00` is the same reading addContactAttempt gives it before storing.
    lines.push(`الموعد الجاي: ${formatDateTime(`${followUp}:00+01:00`)}.`);
  }

  const statusId = z.uuid().safeParse(String(formData.get("status_id") ?? ""));
  if (statusId.success) {
    const status = new FormData();
    status.set("status_id", statusId.data);
    const moved = await updateStatus(personId.data, null, status);
    if (!moved?.ok) {
      revalidatePath(DESK);
      return {
        ok: false,
        message: `${lines.join(" ")} أما الحالة ما تبدّلتش: ${moved?.message ?? FAILED.message} بدّلها من الملف.`,
      };
    }
    const supabase = await createClient();
    const { data: label } = await supabase.from("lead_statuses").select("label_ar").eq("id", statusId.data).maybeSingle();
    if (label) lines.push(`الحالة ولّات «${label.label_ar}».`);
  }

  revalidatePath(DESK);
  return { ok: true, message: lines.join(" ") };
}

// ── §3: distribution ───────────────────────────────────────────────────────────────────────────────────

/** A pool this big is not distributed from a screen; it is distributed by a rule nobody has asked for yet. */
const MAX_DEAL = 5000;

const SHARE = /^share_([0-9a-f-]{36})$/i;

/**
 * §3 — one act, many agents: «40 لسارة، 50 لمريم، 30 لأحمد».
 *
 * WHAT IS DEALT. The files with no owner, oldest first. Oldest first is not decoration: it is the only order
 * in which a split is reproducible and in which the client who has waited longest is called first. The
 * manager who wants to hand out something else — a governorate, one offer's demands — already has the
 * transfer bar on /admin/leads, which moves a whole search to ONE agent; this action is its complement and
 * does not duplicate it.
 *
 * A DISTRIBUTION THAT HALF-SUCCEEDS SAYS WHICH HALF. Each target is its own admin_assign_persons call and
 * therefore its own transaction: PostgREST gives no way to make three of them one, and wrapping them would
 * mean re-implementing a function that is already audited. So the result is read back per target and
 * reported per target — who received how many, and why anyone received none. Anything short of that turns a
 * partial hand-out into an invisible one, and the files nobody got are the files nobody calls.
 */
export async function distributeLeads(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);

  const shares: { userId: string; want: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const match = SHARE.exec(key);
    if (!match) continue;
    const userId = z.uuid().safeParse(match[1]);
    const want = Number.parseInt(String(value).trim() || "0", 10);
    if (!userId.success || !Number.isFinite(want) || want <= 0) continue;
    shares.push({ userId: userId.data, want });
  }

  if (shares.length === 0) {
    return { ok: false, message: "ما كتبتش عدد لحتى واحد. اكتب عدد الملفات قدّام كلّ كوميرسيال ثم اضغط «وزّع»." };
  }
  const wanted = shares.reduce((sum, share) => sum + share.want, 0);
  if (wanted > MAX_DEAL) {
    return { ok: false, message: `العدد كبير برشة (${formatCount(wanted)}). وزّع على دفعات، ${formatCount(MAX_DEAL)} ملف كحدّ أقصى في المرّة.` };
  }

  const supabase = await createClient();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;

  const { data: pool, error: poolError } = await supabase
    .from("persons")
    .select("id")
    .is("assigned_to", null)
    .order("created_at", { ascending: true })
    .limit(wanted);
  if (poolError) return { ok: false, message: "تعذّر جلب الملفات بلا مسؤول. حدّث الصفحة وأعد المحاولة." };

  const ids = (pool ?? []).map((row) => row.id);
  if (ids.length === 0) {
    return { ok: false, message: "ما فماش ملف بلا مسؤول باش يتوزّع. كل الملفات مسندة." };
  }

  // Names come back from the database, never from the form: the message reports who the database says
  // received the files, not who the browser said it was sending them to.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", shares.map((share) => share.userId));
  const nameOf = new Map((profiles ?? []).map((row) => [row.id, row.full_name] as const));

  const done: string[] = [];
  const failed: string[] = [];
  let cursor = 0;

  for (const share of shares) {
    const name = nameOf.get(share.userId) ?? "كوميرسيال";
    const slice = ids.slice(cursor, cursor + share.want);
    cursor += slice.length;
    if (slice.length === 0) {
      failed.push(`${name}: ما وصلوش ملفات — الملفات بلا مسؤول وفات.`);
      continue;
    }

    const { data: moved, error } = await supabase.rpc("admin_assign_persons", {
      p_person_ids: slice,
      p_to_user: share.userId,
      p_reason: reason as string,
    });
    if (error) {
      const why =
        error.message === "target_not_active_commercial"
          ? "موش Commercial نشط."
          : error.code === "42501"
            ? "ما عندكش صلاحية التوزيع."
            : "تعذّر التحويل.";
      failed.push(`${name}: ما تحوّل حتى ملف — ${why}`);
      // The slice this target did not take goes back to the front of the queue for the next one.
      cursor -= slice.length;
      continue;
    }
    done.push(`${name}: ${formatCount(moved ?? 0)}`);
  }

  revalidatePath(DESK);
  revalidatePath("/admin/leads");
  revalidatePath("/admin");

  const short = ids.length < wanted ? ` طلبت ${formatCount(wanted)} ملف وما فما كان ${formatCount(ids.length)}.` : "";
  if (failed.length === 0) {
    return { ok: true, message: `تمّ التوزيع — ${done.join(" · ")}.${short}` };
  }
  return {
    ok: false,
    message: `${done.length > 0 ? `تحوّلو: ${done.join(" · ")}. ` : ""}${failed.join(" ")}${short} صلّح وأعد المحاولة للّي ما وصلوش.`,
  };
}
