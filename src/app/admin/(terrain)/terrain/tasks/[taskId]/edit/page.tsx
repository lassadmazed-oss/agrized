import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { requireStaff } from "@/lib/auth";

import { cancelFarmTask } from "../../actions";
import { FARM_MANAGER_ROLES } from "../../farm-model";
import { readFarmPeople, readFarmTask } from "../../read";
import { TaskForm } from "../../task-form";

export const metadata: Metadata = { title: "بدّل التاسك" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditFarmTaskPage({ params }: PageProps<"/admin/terrain/tasks/[taskId]/edit">) {
  await requireStaff(FARM_MANAGER_ROLES);
  const { taskId } = await params;
  if (!UUID.test(taskId)) notFound();
  const [{ data: file }, { data: people }] = await Promise.all([readFarmTask(taskId), readFarmPeople()]);
  if (!file || !people) notFound();
  const closed = file.task.status === "approved" || file.task.status === "cancelled";

  return (
    <div className="space-y-5">
      <Link href={`/admin/terrain/tasks/${taskId}`} className="text-sm font-semibold text-forest">
        → التاسك
      </Link>
      <h1 className="font-display text-2xl font-bold text-forest">بدّل: {file.task.title}</h1>
      {closed ? (
        <p className="card p-5 text-muted">التاسك هذي تسكّرت ({file.task.status_label}).</p>
      ) : (
        <>
          <TaskForm people={people} task={file.task} />
          <ActionForm action={cancelFarmTask} submitLabel="ألغي التاسك" buttonClassName="btn btn-ghost btn-sm text-danger" className="card flex flex-wrap items-end gap-2 p-4">
            <input type="hidden" name="task_id" value={taskId} />
            <label className="min-w-56 flex-1 space-y-1">
              <span className="text-sm font-semibold">علاش تتلغى؟ (اختياري)</span>
              <input name="reason" maxLength={300} className="field field-sm" />
            </label>
          </ActionForm>
        </>
      )}
    </div>
  );
}
