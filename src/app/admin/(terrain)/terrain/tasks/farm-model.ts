// «الخدمة في الضيعة» (0178) — the shapes the grove screens read, and a sentence for each refusal.
// No "server-only": the client forms import the types and the messages.

import type { StaffRole } from "@/lib/auth";

/** Who opens the grove screens: the workers, the supervisors, and the managers (app.can_manage_operations). */
export const FARM_ROLES = ["worker", "supervisor", "agri_manager", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
/** Mirrors app.can_manage_operations(): who plans tasks. */
export const FARM_MANAGER_ROLES = ["agri_manager", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

export type TaskStatus = "planned" | "in_progress" | "reported" | "approved" | "redo" | "cancelled";

export type TaskCard = {
  id: string;
  task_no: string;
  title: string;
  service: string;
  service_option_id: string;
  project: { id: string; name: string; code: string; map_url: string | null };
  planned_on: string;
  status: TaskStatus;
  status_label: string;
  instructions: string | null;
  scope_note: string | null;
  target_trees: number | null;
  supervisor: { id: string; full_name: string } | null;
  workers: { id: string; full_name: string }[];
  reports: number;
  photos: number;
  trees_done: number;
  last_report_at: string | null;
  last_check: { verdict: "approved" | "redo"; note: string | null; at: string } | null;
  approved_at: string | null;
  operation_id: string | null;
  cancel_reason: string | null;
};

export type FarmBoard = { role: "manager" | "supervisor" | "worker"; today: string; tasks: TaskCard[] };

export type FarmReport = {
  id: string;
  kind: "work" | "check";
  verdict: "approved" | "redo" | null;
  trees_done: number | null;
  finished: boolean;
  note: string | null;
  at: string;
  author: string | null;
  photos: { id: string; path: string }[];
};

export type FarmTask = {
  task: TaskCard;
  access: "manager" | "supervisor" | "worker";
  can_work: boolean;
  can_check: boolean;
  min_photos: { work: number; check: number; max: number };
  reports: FarmReport[];
};

export type FarmPeople = {
  workers: { id: string; full_name: string; open: number }[];
  supervisors: { id: string; full_name: string; open: number }[];
  services: { id: string; code: string; label_ar: string }[];
  offers: { id: string; name: string; code: string }[];
  today: string;
};

export const STATUS_TONE: Record<TaskStatus, string> = {
  planned: "bg-surface text-forest border border-line",
  in_progress: "bg-leaf-soft text-forest",
  reported: "bg-gold-soft text-forest",
  approved: "bg-forest text-white",
  redo: "bg-danger/10 text-danger",
  cancelled: "bg-paper text-muted",
};

const ERRORS: Record<string, string> = {
  forbidden: "التاسك هذي موش متاعك. كلّم المسؤول.",
  farm_project_required: "اختار الضيعة (العرض).",
  farm_service_required: "اختار نوع الخدمة.",
  farm_date_required: "اختار النهار.",
  farm_workers_required: "اختار عامل واحد على الأقل.",
  farm_not_a_worker: "واحد من اللي اخترتهم موش عامل. ثبّت في الأدوار من «المستعملين».",
  farm_not_a_supervisor: "المراقب اللي اخترتو موش مراقب.",
  farm_task_not_found: "التاسك هذي ما عادش موجودة.",
  farm_task_closed: "التاسك هذي تسكّرت (مقبولة ولا ملغاة).",
  farm_photos_required: "لازم تصويرة على الأقل.",
  farm_too_many_photos: "برشا تصاور في رابور واحد. نقّص.",
  farm_bad_photo: "كان التصاور يتقبلو.",
  farm_photo_too_big: "تصويرة كبيرة برشا.",
  farm_photos_missing: "التصاور ما وصلوش. ثبّت في الإنترنت وعاود.",
  farm_redo_needs_note: "قول شنوّا لازم يتعاود (ملاحظة قصيرة).",
  farm_bad_report: "اختار «مقبولة» ولا «عاود».",
};

export function farmError(message: string | null | undefined): string {
  return ERRORS[(message ?? "").trim()] ?? "ما تسجّلش. عاود، وإذا تعاودت كلّم المسؤول.";
}
