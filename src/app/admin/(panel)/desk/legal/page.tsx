import type { Metadata } from "next";
import Link from "next/link";

import { DataRow, DataList, EmptyState, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import {
  FILTER_LABELS,
  FILTER_NOTES,
  QUEUE_FILTERS,
  nextStepOf,
  parseFilter,
  stageTone,
  treeCodesLine,
  type LegalFile,
  type QueueFilter,
} from "./legal-model";
import { readLegalQueue } from "./read";
import { LEGAL_DESK_ROLES } from "./roles";

export const metadata: Metadata = { title: "القانوني وإتمام البيع" };

/**
 * INTERFACE 3 — «القانوني وإتمام البيع», the desk §16 describes.
 *
 * WHAT IT LEADS WITH. The owner's §16 is one sentence: the file moves to Legal, and Legal sees ONLY the files
 * that reached «العربون مدفوع». The queue is exactly that set, plus the files that have moved on from it —
 * because a desk that loses sight of a file the moment it writes its contract is the «interfaces منفصلة»
 * complaint all over again. The order is the order of attention, decided by staff_legal_queue: a closing that
 * is booked first, then a paid file nobody has opened, then the rest. Each tile is a link into its own
 * filter, so «3 مستنّي المكتب» is a way in rather than a figure to admire.
 *
 * IT IS NOT A SECOND RESERVATIONS SCREEN. Every row is app.legal_file_payload — the same payload the file
 * page reads, not a thinner summary — so a row and a file can never be two definitions of the same thing. The
 * reservation engine, the trees and the payments are untouched: this desk joins them and stores almost
 * nothing of its own.
 *
 * WHO OPENS IT. app.can_contract_trees() — legal · finance · admin · super_admin — checked by the database
 * first (staff_legal_queue raises `forbidden`) and by requireStaff here second, so a `commercial` who types
 * the URL is redirected instead of meeting a blank screen. §27: «ما نعطيوش كل موظف access لحاجات ما
 * يحتاجهاش».
 *
 * NOTHING ON THIS PAGE IS COMPUTED. The stage, the counts, the ordering, the balances and the Arabic of every
 * label arrive decided from Postgres.
 */
export default async function LegalDeskPage({ searchParams }: PageProps<"/admin/desk/legal">) {
  await requireStaff(LEGAL_DESK_ROLES);
  const params = await searchParams;
  const filter: QueueFilter = parseFilter(params.filter);

  const supabase = await createClient();
  const queue = await readLegalQueue(supabase, filter);

  return (
    <div className="space-y-4">
      <SectionHeader
        as="h1"
        level={1}
        title="القانوني وإتمام البيع"
        description="الملفات اللي خلّصت العربون: الوثائق، موعد العقد، والإمضاء. كل ملف يجي معاه كل شيء تعرف قبل ما تكلّم الحريف."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/desk/legal/partners" className="btn btn-secondary btn-sm">
              دليل الشركاء
            </Link>
            <Link href="/admin/desk/legal/checklist" className="btn btn-ghost btn-sm">
              بنود القائمة
            </Link>
          </div>
        }
      />

      {queue === null ? (
        <EmptyState title="ما نجمناش نقراو ملفات المكتب القانوني.">
          إذا كانت هذي أول مرة، جداول المكتب القانوني مازالت ما تركّبتش في قاعدة البيانات
          (supabase/pending/bb_72_partners_closing.sql). كلّم المسؤول باش يركّبها، ومن بعد حدّث الصفحة. وإذا
          كنت متأكّد أنّها تركّبت، يمكن الدور متاعك ما يفتحش المكتب هذا.
        </EmptyState>
      ) : (
        <>
          {queue.contractsModuleState === "disabled" ? (
            <p className="card p-cozy text-sm leading-6">
              <span className="font-semibold">وحدة «العقود ووعد البيع» معطّلة.</span> تنجم تحضّر الملفات
              والوثائق وموعد العقد عادي من هنا، أما كتابة العقد وإمضاؤه موقّفين في قاعدة البيانات روحها. كي
              تكون جاهز، شغّلها من{" "}
              <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
                الإعدادات ← الوحدات
              </Link>
              .
            </p>
          ) : null}

          <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={FILTER_LABELS.waiting}
              value={queue.counts.waiting ?? 0}
              href="/admin/desk/legal?filter=waiting"
              emphasis={(queue.counts.waiting ?? 0) > 0}
              quiet={(queue.counts.waiting ?? 0) === 0}
              note={FILTER_NOTES.waiting}
            />
            <StatTile
              label={FILTER_LABELS.appointment}
              value={queue.counts.appointment ?? 0}
              href="/admin/desk/legal?filter=appointment"
              quiet={(queue.counts.appointment ?? 0) === 0}
              note={FILTER_NOTES.appointment}
            />
            <StatTile
              label={FILTER_LABELS.contracted}
              value={queue.counts.contracted ?? 0}
              href="/admin/desk/legal?filter=contracted"
              quiet={(queue.counts.contracted ?? 0) === 0}
              note={FILTER_NOTES.contracted}
            />
            <StatTile
              label={FILTER_LABELS.owned}
              value={queue.counts.owned ?? 0}
              href="/admin/desk/legal?filter=owned"
              quiet={(queue.counts.owned ?? 0) === 0}
              note={FILTER_NOTES.owned}
            />
          </div>

          <nav aria-label="فرز الملفات" className="flex flex-wrap gap-2">
            {QUEUE_FILTERS.map((key) => (
              <Link
                key={key}
                href={key === "active" ? "/admin/desk/legal" : `/admin/desk/legal?filter=${key}`}
                aria-current={key === filter ? "page" : undefined}
                className={`chip ${key === filter ? "bg-leaf-soft text-forest ring-1 ring-inset ring-leaf/30" : ""}`}
              >
                {FILTER_LABELS[key]}
                <span className="tabular-nums"> · {formatCount(queue.counts[key] ?? 0)}</span>
              </Link>
            ))}
          </nav>

          <p className="hint">{FILTER_NOTES[filter]}</p>

          {queue.rows.length === 0 ? (
            <EmptyState title="ما فماش ملفات في هذا الفرز.">
              الملف يوصل للمكتب القانوني وقت ما يتسجّل العربون متاعو في شاشة{" "}
              <Link href="/admin/reservations" className="font-semibold underline underline-offset-4">
                الحجوزات والعربون
              </Link>
              .
            </EmptyState>
          ) : (
            <>
              <ul className="space-y-3">
                {queue.rows.map((file) => (
                  <li key={file.reservationId}>
                    <QueueCard file={file} />
                  </li>
                ))}
              </ul>
              {queue.capped ? (
                <p className="hint">
                  معروض {formatCount(queue.rows.length)} من {formatCount(queue.matched)}. ضيّق الفرز باش تشوف
                  الباقي.
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** One file, said the way somebody standing at this desk would read it: who, what, and what to do next. */
function QueueCard({ file }: { file: LegalFile }) {
  const blocked = file.legalFile?.checklist.mandatoryOpen ?? 0;

  return (
    <Link
      href={`/admin/desk/legal/${file.reservationId}`}
      className="card block p-cozy transition-colors hover:border-forest"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block font-semibold text-forest">{file.personName}</span>
          <span className="mt-0.5 block text-xs text-muted" dir="ltr">
            {file.reservationNo}
            {file.offerCode ? ` · ${file.offerCode}` : ""}
          </span>
        </div>
        <StatusPill tone={stageTone(file.stage)}>{file.stageLabel}</StatusPill>
      </div>

      <DataList variant="grid" columns={4} className="mt-3 text-sm">
        <DataRow label="الزيتونات" layout="stacked" size="sm">
          {formatCount(file.treesHeld + file.treesSold)}
          <span className="block text-xs font-normal text-muted" dir="ltr">
            {treeCodesLine(file)}
          </span>
        </DataRow>
        <DataRow label="العربون" layout="stacked" size="sm">
          {formatMillimes(file.money.depositPaidMillimes)}
          {file.money.depositPaidAt ? (
            <span className="block text-xs font-normal text-muted">{formatDate(file.money.depositPaidAt)}</span>
          ) : null}
        </DataRow>
        <DataRow label="الثمن الجملي" layout="stacked" size="sm">
          {file.money.totalPriceMillimes === null ? "—" : formatMillimes(file.money.totalPriceMillimes)}
        </DataRow>
        <DataRow label="الباقي" layout="stacked" size="sm">
          {file.money.remainingMillimes === null ? "—" : formatMillimes(file.money.remainingMillimes)}
        </DataRow>
      </DataList>

      <p className="mt-3 text-sm leading-6">{nextStepOf(file)}</p>

      {file.appointment && file.appointment.status === "scheduled" ? (
        <p className="mt-1 text-xs text-muted">
          موعد العقد: {formatDate(file.appointment.meetOn)}
          {file.appointment.meetAt ? ` · ${file.appointment.meetAt.slice(0, 5)}` : ""}
          {file.appointment.partnerLabel ? ` · ${file.appointment.partnerLabel}` : ""}
          {file.appointment.isPast ? " · فات ميعادو" : ""}
        </p>
      ) : null}

      {blocked > 0 ? (
        <p className="mt-1 text-xs text-muted">
          باقي <span className="tabular-nums">{formatCount(blocked)}</span> بند إجباري في القائمة القانونية.
        </p>
      ) : null}
    </Link>
  );
}
