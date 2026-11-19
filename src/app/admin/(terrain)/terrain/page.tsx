import type { Metadata } from "next";
import Link from "next/link";

import { ADMIN_ROLES, hasRole, requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";

import { CALL_OUTCOMES, FIELD_ROLES, STEP_LABELS, phoneDisplay, type BoardItem, type FieldStep } from "./field-model";
import { readBoard } from "./read";

export const metadata: Metadata = { title: "ليستتي" };

/**
 * «ليستتي» — the people the administrator sent this commercial to show the land to, in the order of his day:
 * today's visits by the hour, the visits still waiting for their result, the people to call, the
 * appointments to come, and what is finished. Each card opens the person's own page, where the next step is
 * the one open card.
 */

const SECTIONS: { step: FieldStep; title: string; empty?: string }[] = [
  { step: "today", title: "زيارات اليوم" },
  { step: "report", title: "زيارات فاتت: سجّل النتيجة" },
  { step: "call", title: "كلّمهم وحدّد موعد" },
  { step: "planned", title: "المواعيد الجاية" },
  { step: "done", title: "كمّلو" },
];

const TONE: Record<FieldStep, string> = {
  today: "bg-gold-soft text-forest",
  report: "bg-danger/10 text-danger",
  call: "bg-leaf-soft text-forest",
  planned: "bg-surface text-forest border border-line",
  done: "bg-paper text-muted border border-line",
};

export default async function TerrainBoardPage({ searchParams }: PageProps<"/admin/terrain">) {
  const session = await requireStaff(FIELD_ROLES);
  const params = await searchParams;
  const admin = hasRole(session, ADMIN_ROLES);
  const who = admin && typeof params.who === "string" ? params.who : undefined;

  const { data: board, error } = await readBoard(who);
  if (!board) {
    return (
      <div className="card p-5 text-sm leading-7">
        <p className="font-semibold text-ink">ما نجمناش نقراو الليستا.</p>
        <p className="mt-1 text-muted">حدّث الصفحة. إذا تعاودت، قول للإدارة: «{error ?? "field_board"}».</p>
      </div>
    );
  }

  const byStep = new Map<FieldStep, BoardItem[]>();
  for (const item of board.people) byStep.set(item.step, [...(byStep.get(item.step) ?? []), item]);
  const open = board.people.filter((item) => item.step !== "done").length;
  const mine = !who || who === session.id;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="font-display text-2xl font-bold text-forest sm:text-3xl">
          {mine ? `أهلا ${firstName(board.user?.full_name ?? session.fullName)}` : `ليستا ${board.user?.full_name ?? ""}`}
        </h1>
        <p className="text-base leading-7 text-ink/80">
          {open === 0
            ? "ما عندكش حتى حدّ يستنّى توّا. كي تعطيك الإدارة ناس، يبانو هوني."
            : `عندك ${formatCount(open)} ${open === 1 ? "حريف" : "حرفاء"} تورّيهم الأرض. ابدا من الفوق.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => {
            const count = byStep.get(section.step)?.length ?? 0;
            if (count === 0) return null;
            return (
              <a key={section.step} href={`#${section.step}`} className={`chip ${TONE[section.step]}`}>
                {STEP_LABELS[section.step]} <span className="tabular-nums">{formatCount(count)}</span>
              </a>
            );
          })}
        </div>
        {board.commercials && board.commercials.length > 0 ? (
          <nav className="flex flex-wrap items-center gap-2 border-t border-line pt-3" aria-label="ليستا كل كوميرسيال">
            <span className="text-sm text-muted">ليستا:</span>
            {board.commercials.map((person) => (
              <Link
                key={person.id}
                href={`/admin/terrain?who=${person.id}`}
                aria-current={board.user?.id === person.id ? "true" : undefined}
                className="chip"
              >
                {person.full_name} <span className="tabular-nums text-muted">{formatCount(person.open)}</span>
              </Link>
            ))}
            <Link href="/admin/terrain/assign" className="chip">
              ＋ وزّع
            </Link>
          </nav>
        ) : null}
      </header>

      {board.people.length === 0 ? (
        <div className="card p-6 text-center leading-7 text-muted">
          الليستا فارغة.
          {admin ? (
            <>
              {" "}
              <Link href="/admin/terrain/assign" className="font-semibold text-forest underline underline-offset-4">
                وزّع الزيارات
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {SECTIONS.map((section) => {
        const items = byStep.get(section.step) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={section.step} id={section.step} className="scroll-mt-20 space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-forest">
              {section.title}
              <span className="tabular-nums text-base font-semibold text-muted">{formatCount(items.length)}</span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map((item) => (
                <li key={item.person.id}>
                  <PersonCard item={item} labels={board.labels} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PersonCard({ item, labels }: { item: BoardItem; labels: Record<string, string | undefined> }) {
  const visit = item.visit;
  const lastCall = item.last_call ? CALL_OUTCOMES.find((outcome) => outcome.code === item.last_call?.outcome)?.label : null;
  const result = item.last?.field_result ? (labels[item.last.field_result] ?? item.last.field_result) : null;

  return (
    <div className={`card flex h-full flex-col gap-3 p-4 ${item.step === "today" ? "border-gold/50" : ""}`}>
      <Link href={`/admin/terrain/${item.person.id}`} className="block space-y-1.5">
        <span className="flex items-start justify-between gap-2">
          <span className="text-lg font-bold leading-7 text-ink">{item.person.full_name}</span>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[item.step]}`}>
            {item.step === "done" && result ? result : STEP_LABELS[item.step]}
          </span>
        </span>
        <span className="block text-sm leading-6 text-muted">
          {[item.request?.offer_name ?? item.visit?.offer.name, item.request?.trees ? `${formatCount(item.request.trees)} زيتونة` : null, item.person.governorate]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {visit && (item.step === "today" || item.step === "planned" || item.step === "report") ? (
          <span className="block rounded-xl bg-paper px-3 py-2 text-sm leading-6 text-ink">
            <span className="font-semibold">
              {item.step === "today" ? "اليوم" : formatDate(visit.visit_date)}
              {" · "}
              <span dir="ltr">{visit.meeting_time ?? visit.slot_label}</span>
            </span>
            {visit.meeting_point ? <span className="block text-muted">📍 {visit.meeting_point}</span> : null}
          </span>
        ) : null}
        {item.step === "call" ? (
          <span className="block text-sm text-muted">
            {lastCall && item.last_call
              ? `آخر مكالمة: ${lastCall} · ${formatDateTime(item.last_call.at)}`
              : item.last?.status === "no_show"
                ? "ما جاش للموعد اللي فات. عاود كلّمو."
                : "مازال ما تكلّمتش معاه."}
          </span>
        ) : null}
      </Link>

      <div className="mt-auto flex gap-2">
        {item.person.phone_e164 && item.step !== "done" ? (
          <a href={`tel:${item.person.phone_e164}`} className="btn btn-secondary btn-sm flex-1">
            📞 <span dir="ltr">{phoneDisplay(item.person.phone_e164)}</span>
          </a>
        ) : null}
        <Link href={`/admin/terrain/${item.person.id}`} className={`btn btn-sm flex-1 ${item.step === "done" ? "btn-ghost" : "btn-primary"}`}>
          {item.step === "call"
            ? "حدّد موعد"
            : item.step === "today" || item.step === "report"
              ? "سجّل النتيجة"
              : item.step === "planned"
                ? "شوف الموعد"
                : "افتح"}
        </Link>
      </div>
    </div>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
