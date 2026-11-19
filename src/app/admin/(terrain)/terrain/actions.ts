"use server";

// «الميدان» (0175): the five acts of the tablet. Each checks the role here (requireStaff) and the database
// checks it again (app.can_edit_person / app.is_admin) inside the RPC.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { addContactAttempt } from "@/lib/backoffice/leads/actions";
import { createClient } from "@/lib/supabase/server";

import { CALL_OUTCOMES, FIELD_ROLES, fieldError } from "./field-model";

const HOME = "/admin/terrain";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

async function call(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  return rpc(fn, args);
}

const uuid = z.uuid();

function refresh(personId?: string) {
  revalidatePath(HOME);
  if (personId) revalidatePath(`${HOME}/${personId}`);
}

/** «كلّمو»: one tap after the call — how it went. A callback needs no date here; the card stays on the list. */
export async function logFieldCall(personId: string, outcome: string, note: string): Promise<ActionResult> {
  await requireStaff(FIELD_ROLES);
  if (!uuid.safeParse(personId).success) return { ok: false, message: fieldError("person_not_found") };
  if (!CALL_OUTCOMES.some((item) => item.code === outcome)) return { ok: false, message: "اختار كيفاش مشات المكالمة." };

  const form = new FormData();
  form.set("channel", "phone");
  form.set("outcome", outcome);
  form.set("note", note.trim().slice(0, 500));
  const result = await addContactAttempt(personId, null, form);
  refresh(personId);
  if (!result?.ok) return { ok: false, message: result?.message ?? fieldError(null) };
  return { ok: true, message: "تسجّلت المكالمة." };
}

/** «ثبّت الموعد»: the day, the hour, how many, where. */
export async function bookFieldVisit(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(FIELD_ROLES);
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const personId = field("person_id");
  if (!uuid.safeParse(personId).success) return { ok: false, message: fieldError("person_not_found") };
  if (!field("visit_date")) return { ok: false, message: fieldError("visit_date_required") };
  if (!field("time")) return { ok: false, message: fieldError("invalid_visit_time") };

  const { error } = await call("field_book", {
    p_person: personId,
    p: {
      project_id: field("project_id") || null,
      request_id: field("request_id") || null,
      visit_date: field("visit_date"),
      time: field("time"),
      people_count: Number.parseInt(field("people_count") || "1", 10),
      meeting_point: field("meeting_point"),
      note: field("note"),
    },
  });
  if (error) return { ok: false, message: fieldError(error.message) };
  refresh(personId);
  return { ok: true, message: "الموعد تثبّت. يبان في الليستا متاعك في نهارو." };
}

/** «رجع لنا»: the result. A deposit goes straight to its receipt. */
export async function reportFieldVisit(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(FIELD_ROLES);
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const visitId = field("visit_id");
  const personId = field("person_id");
  if (!uuid.safeParse(visitId).success) return { ok: false, message: fieldError("visit_not_found") };

  const result = field("result");
  const trees = Number.parseInt(field("trees"), 10);
  // The amount is typed in dinars; money is stored in millimes.
  const dinars = Number.parseFloat(field("amount").replace(",", "."));
  const amount = Number.isFinite(dinars) ? Math.round(dinars * 1000) : null;

  if ((result === "took" || result === "deposit") && !(trees >= 1)) return { ok: false, message: fieldError("invalid_tree_count") };
  if (result === "deposit" && !(amount && amount > 0)) return { ok: false, message: fieldError("invalid_deposit_amount") };

  const { data, error } = await call("field_report", {
    p_visit: visitId,
    p: {
      result,
      trees: Number.isFinite(trees) ? trees : null,
      amount_millimes: result === "deposit" ? amount : null,
      method_id: field("method_id") || null,
      note: field("note"),
    },
  });
  if (error) return { ok: false, message: fieldError(error.message) };
  refresh(personId);

  const paymentId = (data as { payment_id?: string | null } | null)?.payment_id;
  if (paymentId) redirect(`${HOME}/receipt/${paymentId}`);
  return { ok: true, message: "النتيجة تسجّلت. شكراً." };
}

/** «اعطيهم لـ…»: the administrator hands the ticked people to one commercial. */
export async function assignFieldPeople(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const commercial = String(formData.get("commercial_id") ?? "");
  const people = formData.getAll("person_id").map(String).filter((id) => uuid.safeParse(id).success);
  if (!uuid.safeParse(commercial).success) return { ok: false, message: "اختار الكوميرسيال اللي باش يمشي." };
  if (people.length === 0) return { ok: false, message: "علّم على الناس اللي تحب تعطيهملو." };

  const { data, error } = await call("admin_field_assign", { p_people: people, p_commercial: commercial });
  if (error) return { ok: false, message: fieldError(error.message) };
  revalidatePath(`${HOME}/assign`);
  revalidatePath(HOME);
  const added = typeof data === "number" ? data : people.length;
  return { ok: true, message: `تزادو ${added} للّيستا متاعو. يلقاهم في التابلات.` };
}

/** «نحّيه»: off the tablet; the file, its visits and its holds stay. */
export async function removeFieldPerson(personId: string): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  if (!uuid.safeParse(personId).success) return { ok: false, message: fieldError("person_not_found") };
  const { error } = await call("admin_field_remove", { p_person: personId });
  if (error) return { ok: false, message: fieldError(error.message) };
  revalidatePath(`${HOME}/assign`);
  revalidatePath(HOME);
  return { ok: true, message: "تنحّى من الليستا." };
}
