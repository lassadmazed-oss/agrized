"use server";

// «الخدمة في الضيعة» (0178): plan a task, start it, send a day's report or a check with photos. The role is
// checked here (requireStaff) and the reader's place on the task again in Postgres (app.farm_access /
// app.can_manage_operations) inside every RPC.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { requireStaff } from "@/lib/auth";
import { farmArrived, signFarmUploads } from "@/lib/farm-photos";
import { createClient } from "@/lib/supabase/server";

import { FARM_MANAGER_ROLES, FARM_ROLES, farmError, type TaskCard } from "./farm-model";

const HOME = "/admin/terrain/tasks";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function call(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  return (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase)(fn, args);
}

const uuid = z.uuid();

function refresh(taskId?: string) {
  revalidatePath(HOME);
  if (taskId) revalidatePath(`${HOME}/${taskId}`);
}

/** Write a task (or change one): the manager's form. A new task opens on its own page. */
export async function saveFarmTask(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(FARM_MANAGER_ROLES);
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const id = field("id");
  const { data, error } = await call("staff_farm_task_save", {
    p: {
      id: id || null,
      project_id: field("project_id") || null,
      service_option_id: field("service_option_id") || null,
      title: field("title"),
      instructions: field("instructions"),
      scope_note: field("scope_note"),
      target_trees: field("target_trees") || null,
      planned_on: field("planned_on") || null,
      supervisor_id: field("supervisor_id") || null,
      worker_ids: formData.getAll("worker_ids").map(String).filter((value) => uuid.safeParse(value).success),
    },
  });
  if (error) return { ok: false, message: farmError(error.message) };
  const task = data as TaskCard;
  refresh(task.id);
  if (!id) redirect(`${HOME}/${task.id}`);
  return { ok: true, message: "تسجّلت التاسك." };
}

export async function cancelFarmTask(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(FARM_MANAGER_ROLES);
  const taskId = String(formData.get("task_id") ?? "");
  if (!uuid.safeParse(taskId).success) return { ok: false, message: farmError("farm_task_not_found") };
  const { error } = await call("staff_farm_task_cancel", { p_task: taskId, p_reason: String(formData.get("reason") ?? "") });
  if (error) return { ok: false, message: farmError(error.message) };
  refresh(taskId);
  return { ok: true, message: "التاسك تلغات." };
}

/** «بديت الخدمة». */
export async function startFarmTask(taskId: string): Promise<ActionResult> {
  await requireStaff(FARM_ROLES);
  if (!uuid.safeParse(taskId).success) return { ok: false, message: farmError("farm_task_not_found") };
  const { error } = await call("farm_task_start", { p_task: taskId });
  if (error) return { ok: false, message: farmError(error.message) };
  refresh(taskId);
  return { ok: true, message: "بالتوفيق! كي تكمّل النهار ابعث الرابور بالتصاور." };
}

const reportSchema = z.object({
  taskId: z.uuid(),
  kind: z.enum(["work", "check"]),
  verdict: z.enum(["approved", "redo"]).nullable(),
  treesDone: z.number().int().min(0).max(100000).nullable(),
  finished: z.boolean(),
  note: z.string().max(1000),
  photos: z.array(z.object({ mime: z.string().max(40), size: z.number().int().positive() })).max(30),
});

export type OpenedReport =
  | { ok: true; reportId: string; uploads: { id: string; path: string; token: string }[] }
  | { ok: false; message: string };

/** Opens the report with its photos and hands back one upload token per photo. */
export async function openFarmReport(input: z.input<typeof reportSchema>): Promise<OpenedReport> {
  await requireStaff(FARM_ROLES);
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: farmError("farm_bad_report") };
  const data = parsed.data;
  const { data: opened, error } = await call("farm_report_open", {
    p_task: data.taskId,
    p: {
      kind: data.kind,
      verdict: data.verdict,
      trees_done: data.treesDone,
      finished: data.finished,
      note: data.note,
      photos: data.photos.map((photo) => ({ mime: photo.mime, size_bytes: photo.size })),
    },
  });
  if (error) return { ok: false, message: farmError(error.message) };
  const row = opened as { report_id: string; photos: { id: string; path: string }[] };
  const uploads = await signFarmUploads(row.photos);
  if (!uploads) return { ok: false, message: farmError(null) };
  return { ok: true, reportId: row.report_id, uploads };
}

/** The server counts the photos that arrived; the report counts if enough did. */
export async function closeFarmReport(taskId: string, reportId: string): Promise<ActionResult> {
  await requireStaff(FARM_ROLES);
  if (!uuid.safeParse(taskId).success || !uuid.safeParse(reportId).success) return { ok: false, message: farmError(null) };
  const arrived = (await farmArrived(`${taskId}/${reportId}`)).filter((name) => uuid.safeParse(name).success);
  const { data, error } = await call("farm_report_close", { p_report: reportId, p_arrived: arrived });
  if (error) return { ok: false, message: farmError(error.message) };
  refresh(taskId);
  const task = data as TaskCard;
  return {
    ok: true,
    message:
      task.status === "approved"
        ? "الخدمة مقبولة وتسجّلت في العمليات الفلاحية."
        : task.status === "redo"
          ? "تبعثت للعمّال باش يعاودو."
          : task.status === "reported"
            ? "وصل الرابور. المراقب باش يجي يشوف."
            : "وصل الرابور متاع اليوم. يعطيك الصحة!",
  };
}
