import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { signFarmReads } from "@/lib/farm-photos";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";

import { FARM_ROLES, STATUS_TONE, farmError } from "../farm-model";
import { readFarmTask } from "../read";

import { ReportForm } from "./report-form";
import { StartButton } from "./start-button";

export const metadata: Metadata = { title: "التاسك" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One task: what to do, where, who; then, for the worker, «بديت» and the day's report with photos; for the
 * supervisor, the check — «مقبولة» or «عاود» — with his own photos; and under it every report and check so far,
 * photos included.
 */
export default async function FarmTaskPage({ params }: PageProps<"/admin/terrain/tasks/[taskId]">) {
  await requireStaff(FARM_ROLES);
  const { taskId } = await params;
  if (!UUID.test(taskId)) notFound();

  const { data: file, error } = await readFarmTask(taskId);
  if (!file) {
    return (
      <div className="space-y-4">
        <Link href="/admin/terrain/tasks" className="text-sm font-semibold text-forest">
          → الخدمة
        </Link>
        <p className="card p-5 text-muted">{farmError(error)}</p>
      </div>
    );
  }
  const task = file.task;
  const reads = await signFarmReads(file.reports.flatMap((report) => report.photos.map((photo) => photo.path)));
  const canStart = file.can_work && (task.status === "planned" || task.status === "redo");

  return (
    <div className="space-y-5">
      <Link href="/admin/terrain/tasks" className="text-sm font-semibold text-forest">
        → الخدمة
      </Link>

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold text-forest">{task.title}</h1>
            <p className="text-sm text-muted">
              {task.service} · {task.project.name} · <span dir="ltr">{task.task_no}</span>
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS_TONE[task.status]}`}>{task.status_label}</span>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">النهار</dt>
            <dd className="font-semibold">{formatDate(task.planned_on)}</dd>
          </div>
          {task.scope_note ? (
            <div>
              <dt className="text-muted">وين</dt>
              <dd className="font-semibold">{task.scope_note}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">العمّال</dt>
            <dd className="font-semibold">{task.workers.map((worker) => worker.full_name).join("، ")}</dd>
          </div>
          <div>
            <dt className="text-muted">المراقب</dt>
            <dd className="font-semibold">{task.supervisor?.full_name ?? "المسؤول"}</dd>
          </div>
          {task.target_trees ? (
            <div>
              <dt className="text-muted">الزيتونات</dt>
              <dd className="font-semibold tabular-nums">
                {formatCount(task.trees_done)} / {formatCount(task.target_trees)}
              </dd>
            </div>
          ) : null}
        </dl>
        {task.instructions ? <p className="whitespace-pre-line rounded-xl bg-paper p-3 leading-7 text-ink">{task.instructions}</p> : null}
        {task.status === "redo" && task.last_check?.note ? (
          <p className="rounded-xl bg-danger/10 p-3 font-semibold text-danger">↩ المراقب قال: {task.last_check.note}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {task.project.map_url ? (
            <a href={task.project.map_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              🗺️ الضيعة على الخريطة
            </a>
          ) : null}
          {file.access === "manager" && task.status !== "approved" && task.status !== "cancelled" ? (
            <Link href={`/admin/terrain/tasks/${task.id}/edit`} className="btn btn-ghost btn-sm">
              بدّل التاسك
            </Link>
          ) : null}
        </div>
      </section>

      {canStart ? <StartButton taskId={task.id} /> : null}

      {file.can_work ? (
        <section className="card space-y-3 border-forest p-5">
          <h2 className="text-lg font-bold text-forest">📝 رابور اليوم</h2>
          <ReportForm taskId={task.id} kind="work" minPhotos={file.min_photos.work} maxPhotos={file.min_photos.max} targetTrees={task.target_trees} />
        </section>
      ) : null}

      {file.can_check ? (
        <section className="card space-y-3 border-gold p-5">
          <h2 className="text-lg font-bold text-forest">🔎 المراقبة</h2>
          <p className="text-sm text-muted">امشي للضيعة، شوف الخدمة، صوّرها، واختار.</p>
          <ReportForm taskId={task.id} kind="check" minPhotos={file.min_photos.check} maxPhotos={file.min_photos.max} targetTrees={null} />
        </section>
      ) : null}

      {task.status === "approved" ? (
        <p className="card border-forest/40 bg-leaf-soft p-4 font-semibold text-forest">
          ✓ الخدمة مقبولة {task.approved_at ? formatDate(task.approved_at) : ""} وتسجّلت في العمليات الفلاحية.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-forest">
          الرابورات <span className="tabular-nums text-muted">{formatCount(file.reports.length)}</span>
        </h2>
        {file.reports.length === 0 ? <p className="text-sm text-muted">مازال حتى رابور.</p> : null}
        <ol className="space-y-3">
          {[...file.reports].reverse().map((report) => (
            <li key={report.id} className={`card space-y-2 p-4 ${report.kind === "check" ? (report.verdict === "approved" ? "border-forest/50" : "border-danger/40") : ""}`}>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-ink">
                  {report.kind === "check" ? (report.verdict === "approved" ? "✅ مراقبة: مقبولة" : "↩ مراقبة: عاود") : "📝 رابور"}
                </span>
                <span className="text-muted">
                  {report.author} · {formatDateTime(report.at)}
                </span>
                {report.kind === "work" && report.trees_done !== null ? <span className="text-muted">· 🌳 {formatCount(report.trees_done)}</span> : null}
                {report.finished ? <span className="rounded-full bg-gold-soft px-2 text-xs font-bold text-forest">كمّل</span> : null}
              </p>
              {report.note ? <p className="leading-7 text-ink">{report.note}</p> : null}
              {report.photos.length > 0 ? (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {report.photos.map((photo) => {
                    const url = reads.get(photo.path);
                    return (
                      <li key={photo.id} className="aspect-square overflow-hidden rounded-xl bg-paper">
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link to a farm photo */}
                            <img src={url} alt="" className="size-full object-cover" loading="lazy" />
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
