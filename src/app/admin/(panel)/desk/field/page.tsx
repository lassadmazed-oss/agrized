import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { formatCount, formatDate } from "@/lib/format";

import { VisitEntry } from "../../visits/visit-entry";
import type { Visit, VisitDay } from "../../visits/visit-model";

import { readFieldDesk } from "./read";
import { VisitBrief } from "./visit-brief";

// INTERFACE 2 — «زياراتي», the Commercial Terrain's own screen (§7).
//
// The owner's complaint is that the Back Office is «Interfaces منفصلة ما بيناتهاش علاقة». This screen is the
// answer for one team: the field commercial opens ONE page, sees the visits they have to do, and every card
// carries what the client asked for, what they can spend, how they want to pay, what the phone team already
// found out — and the one button that continues the journey, «اختار الزيتونات على المخطط».
//
// IT IS A VIEW OF THE VISITS MODULE, NOT A SECOND ONE. Every row comes from public.staff_visit_board with its
// `assigned_to` filter set to the reader; the card is ../../visits/visit-entry unchanged, so confirming,
// rescheduling, «ما حضرش» and «تمّت» with its outcome all keep working exactly as they do on the calendar. The
// only thing this route adds is the briefing panel under each row and the order of the day.
//
// THE ORDER IS THE DAY, NOT THE DATE RANGE. A calendar answers «شنوّة فما هالشهر»; a field commercial answers
// «شنوّة عندي اليوم, وشنوّة غدوة». So the board's own days are folded into اليوم · غدوة · بقية الأسبوع · بعد.
// The anchor is board.range.today, computed by app.tunis_today() in Postgres, so nothing here works out a date
// in a timezone; the fold is string comparison on dates Postgres already decided.
//
// WHY «زياراتي» CAN BE EMPTY WHILE THE CALENDAR IS NOT, and why the page says so. public.visits_select and
// staff_visit_board both narrow rows by app.can_see_person(person_id) — the LEAD's owner — and never by
// visits.assigned_to. In the owner's own flow the call centre owns the lead and someone else does the visit, so
// a field commercial can be assigned a visit they cannot read. That is a policy bug, not a layout one;
// supabase/pending/bb_71_tree_picking.sql §1 fixes it, and until it is applied this page explains the gap
// instead of showing an empty list that looks like a free day.

export const metadata: Metadata = { title: "زياراتي" };

const FOLDS = [
  { key: "today", title: "اليوم", note: "اللي لازم يتعمل اليوم." },
  { key: "tomorrow", title: "غدوة", note: null },
  { key: "week", title: "بقية الجمعة", note: null },
  { key: "later", title: "بعد", note: null },
] as const;

type FoldKey = (typeof FOLDS)[number]["key"];

/** Days in Tunis, as Postgres already decided them. Adding a day to an ISO date needs no timezone. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function foldOf(date: string, today: string): FoldKey {
  if (date <= today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  if (date <= addDays(today, 7)) return "week";
  return "later";
}

export default async function FieldDeskPage({ searchParams }: PageProps<"/admin/desk/field">) {
  const params = await searchParams;
  // «زياراتي» is the default, because this route exists to be one person's queue. «الكل» stays one tap away:
  // a commercial covering for a colleague needs it, and hiding it would send them back to the calendar.
  const mine = params.scope !== "all";

  const desk = await readFieldDesk({ mine });

  if (!desk.board) {
    return (
      <div className="space-y-roomy">
        <SectionHeader as="h1" level={1} title="زياراتي" />
        <EmptyState title="ما نجمناش نقراو الزيارات">
          وحدة الزيارات ما ردّتش جواب. إذا كانت أول مرّة، جدول <span dir="ltr">public.visits</span> مازال ما
          تركّبش في قاعدة البيانات هاذي. كلّم المسؤول، ومن بعد حدّث الصفحة.
        </EmptyState>
      </div>
    );
  }

  // Hoisted out of `desk` so the narrowing survives into the callbacks below: TypeScript drops a narrowed
  // property access inside an arrow function, and `desk.board!` in a loop is how a null slips through later.
  const board = desk.board;
  const today = board.range.today;
  const buckets = new Map<FoldKey, VisitDay[]>();
  for (const day of board.days) {
    const key = foldOf(day.date, today);
    buckets.set(key, [...(buckets.get(key) ?? []), day]);
  }

  const counts = board.counts;
  const nothingMine = mine && counts.total === 0 && desk.visibleTotal > 0;

  return (
    <div className="space-y-roomy">
      <header className="space-y-snug">
        <div className="flex flex-wrap items-center gap-tight">
          <h1 className="section-title">{mine ? "زياراتي" : "كل الزيارات"}</h1>
          <StatusPill tone="line">{desk.session.fullName}</StatusPill>
        </div>
        <p className="max-w-3xl leading-7 text-muted">
          كل زيارة هوني عندها تحتها شنوّة طلب الحريف، قدّاش ميزانيتو، كيفاش يحب يخلّص، وشنوّة قال لفريق الهاتف —
          باش تعرفو قبل ما تلقاه. وكي تختارو الزيتونات في الأرض، «اختار الزيتونات على المخطط» يكمّل الطريق.
        </p>
        <nav className="flex flex-wrap gap-tight" aria-label="نطاق الزيارات">
          <Link
            href="/admin/desk/field"
            aria-current={mine ? "page" : undefined}
            className={`btn btn-sm ${mine ? "btn-primary" : "btn-secondary"}`}
          >
            زياراتي
          </Link>
          <Link
            href="/admin/desk/field?scope=all"
            aria-current={mine ? undefined : "page"}
            className={`btn btn-sm ${mine ? "btn-secondary" : "btn-primary"}`}
          >
            كل اللي نجم نشوفهم
          </Link>
          <Link href="/admin/visits" className="btn btn-ghost btn-sm">
            الروزنامة الكاملة
          </Link>
        </nav>
      </header>

      <div className="grid gap-snug sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="اليوم" value={formatCount(counts.today)} emphasis note={formatDate(today)} />
        <StatTile label="مؤكّدة" value={formatCount(counts.confirmed)} quiet={counts.confirmed === 0} />
        <StatTile label="تستنّى تأكيد" value={formatCount(counts.requested)} quiet={counts.requested === 0} />
        <StatTile label="الجملة في المدة" value={formatCount(counts.total)} note={`إلى ${formatDate(board.range.to)}`} />
      </div>

      {nothingMine ? (
        <div className="card p-cozy text-sm leading-6">
          <p className="font-semibold text-ink">ما فماش زيارة مسندة ليك.</p>
          <p className="mt-tight text-muted">
            فما <span className="tabular-nums">{formatCount(desk.visibleTotal)}</span> زيارة تنجم تشوفهم في
            الروزنامة أما حتّى وحدة منهم ما فيها إنت «المسؤول على الزيارة». سببها وحدة من الزوز: يا إمّا ما
            تسمّاتش في خانة المسؤول وقت البرمجة — تتزاد من الروزنامة — يا إمّا الملف متاع الحريف مسند لزميل آخر،
            وفي الحالة هاذي القاعدة توّا ما تورّيش الزيارة كان لصاحب الملف.
          </p>
          <p className="mt-tight text-muted">
            الإصلاح مكتوب في <span dir="ltr">supabase/pending/bb_71_tree_picking.sql</span> (القسم 1) ومازال
            مسوّدة ما تطبّقتش.
          </p>
          <p className="mt-snug">
            <Link href="/admin/desk/field?scope=all" className="font-semibold text-forest underline underline-offset-4">
              ورّيني كل اللي نجم نشوفهم
            </Link>
          </p>
        </div>
      ) : null}

      {counts.total === 0 && !nothingMine ? (
        <EmptyState title="ما فماش زيارات مبرمجة">
          كي يتبرمج موعد زيارة، يبان هوني في نهارو. الزيارات تتبرمج من{" "}
          <Link href="/admin/visits" className="font-semibold underline underline-offset-4">
            الروزنامة
          </Link>{" "}
          ولا من ملفّ الحريف.
        </EmptyState>
      ) : null}

      {FOLDS.map((fold) => {
        const days = buckets.get(fold.key) ?? [];
        if (days.length === 0) return null;
        const total = days.reduce((sum, day) => sum + day.visits.length, 0);
        return (
          <section key={fold.key} className="space-y-snug">
            <SectionHeader as="h2" title={fold.title} description={`${formatCount(total)} زيارة${fold.note ? ` · ${fold.note}` : ""}`} />
            {days.map((day) => (
              <section key={day.date} className="space-y-snug">
                <h3 className="label-sm">{formatDate(day.date)}</h3>
                <div className="grid gap-snug xl:grid-cols-2">
                  {day.visits.map((visit: Visit) => (
                    <div key={visit.id} className="space-y-tight">
                      <VisitEntry visit={visit} terms={board.terms} reasonMin={desk.reasonMin} showDate={false} />
                      <VisitBrief
                        visit={visit}
                        request={visit.request ? desk.requests.get(visit.request.id) : undefined}
                        notes={desk.notes.get(visit.person.id) ?? []}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </section>
        );
      })}
    </div>
  );
}
