import type { Metadata } from "next";
import Link from "next/link";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate } from "@/lib/format";

import { FARM_ROLES, STATUS_TONE, type TaskCard, type TaskStatus } from "./farm-model";
import { readFarmBoard } from "./read";

export const metadata: Metadata = { title: "الخدمة" };

/**
 * «خدمتي» for a worker, «اللي نراقبهم» for a supervisor, «الخدمة في الضيعة» for a manager: the same cards, each
 * reader his own. What needs someone now comes first — sent back, waiting for the check, being worked — then
 * what is planned, then what finished this week.
 */

const SECTIONS: { title: string; statuses: TaskStatus[] }[] = [
  { title: "لازم تتعاود", statuses: ["redo"] },
  { title: "تستنّى المراقبة", statuses: ["reported"] },
  { title: "تخدم توّا", statuses: ["in_progress"] },
  { title: "مبرمجة", statuses: ["planned"] },
  { title: "كملت هالجمعة", statuses: ["approved", "cancelled"] },
];

const TITLES = { worker: "خدمتي", supervisor: "الخدمة اللي نراقبها", manager: "الخدمة في الضيعة" } as const;

export default async function FarmBoardPage() {
  await requireStaff(FARM_ROLES);
  const { data: board, error } = await readFarmBoard();
  if (!board) {
    return (
      <div className="card p-5 leading-7">
        <p className="font-semibold text-ink">ما نجمناش نقراو الخدمة.</p>
        <p className="text-sm text-muted">{error === "forbidden" ? "الحساب هذا ما عندوش دور في الضيعة." : "حدّث الصفحة."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest sm:text-3xl">{TITLES[board.role]}</h1>
          <p className="text-sm text-muted">اليوم {formatDate(board.today)}</p>
        </div>
        {board.role === "manager" ? (
          <Link href="/admin/terrain/tasks/new" className="btn btn-primary">
            ＋ تاسك جديدة
          </Link>
        ) : null}
      </header>

      {board.tasks.length === 0 ? (
        <div className="card p-6 text-center leading-7 text-muted">
          {board.role === "worker" ? "ما عندك حتى خدمة توّا. كي يعطيك المسؤول تاسك، تبان هوني." : "ما فمّا حتى تاسك."}
        </div>
      ) : null}

      {SECTIONS.map((section) => {
        const tasks = board.tasks.filter((task) => section.statuses.includes(task.status));
        if (tasks.length === 0) return null;
        return (
          <section key={section.title} className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-forest">
              {section.title} <span className="tabular-nums text-base text-muted">{formatCount(tasks.length)}</span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {tasks.map((task) => (
                <li key={task.id}>
                  <TaskTile task={task} today={board.today} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TaskTile({ task, today }: { task: TaskCard; today: string }) {
  const progress = task.target_trees ? Math.min(100, Math.round((task.trees_done / task.target_trees) * 100)) : null;
  return (
    <Link href={`/admin/terrain/tasks/${task.id}`} className={`card block h-full space-y-2 p-4 transition-colors hover:border-forest ${task.status === "redo" ? "border-danger/40" : ""}`}>
      <span className="flex items-start justify-between gap-2">
        <span className="text-lg font-bold leading-7 text-ink">{task.title}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_TONE[task.status]}`}>{task.status_label}</span>
      </span>
      <span className="block text-sm text-muted">
        {[task.service !== task.title ? task.service : null, task.project.name, task.scope_note].filter(Boolean).join(" · ")}
      </span>
      <span className="block text-sm text-ink">
        {task.planned_on === today ? "اليوم" : formatDate(task.planned_on)} · {task.workers.map((worker) => worker.full_name).join("، ")}
      </span>
      {task.status === "redo" && task.last_check?.note ? <span className="block text-sm font-semibold text-danger">↩ {task.last_check.note}</span> : null}
      <span className="flex items-center gap-3 text-xs text-muted">
        <span>📝 {formatCount(task.reports)}</span>
        <span>📷 {formatCount(task.photos)}</span>
        {progress !== null ? (
          <span className="flex flex-1 items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
              <span className="block h-full bg-forest" style={{ width: `${progress}%` }} />
            </span>
            <span className="tabular-nums">
              {formatCount(task.trees_done)}/{formatCount(task.target_trees ?? 0)}
            </span>
          </span>
        ) : task.trees_done > 0 ? (
          <span>🌳 {formatCount(task.trees_done)}</span>
        ) : null}
      </span>
    </Link>
  );
}
