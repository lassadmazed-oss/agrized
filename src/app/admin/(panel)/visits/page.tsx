import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { BookVisitForm } from "./book-visit-form";
import { readVisitBoard } from "./visit-data";
import { VisitEntry } from "./visit-entry";
import type { VisitOffer, VisitTerms, WaitingDemand } from "./visit-model";

// THE CALENDAR IS A DAY-GROUPED LIST, NOT A MONTH GRID — and this is the decision the module was asked to take
// and justify. Report v3 §25 says «الـBack Office يشوف Calendar», which names the job, not the shape. A month
// grid spends a whole screen on empty squares for a product that will hold a handful of visits a week; it cannot
// show the phone, the offer and the meeting point without a second click; and at 375px, which is where a
// commercial actually reads this — standing next to a car — thirty-five cells are unreadable. The question a
// visit calendar answers is «شكون نشوف، وقتاش، ووين», and a list grouped by day, in slot order, with the phone
// and the map link on the row, answers it at every width. There is deliberately no second view: two calendars
// that can disagree are worse than one that is plain.
//
// THE SCREEN OPENS WHILE THE MODULE IS OFF, on purpose. The `visits` flag says what VISITORS may do — ask for a
// visit from the site — and the Back Office is where a module is prepared before it is published
// (src/app/admin/(panel)/layout.tsx:47-54 states the same rule for the sidebar). So the page reads the flag,
// says plainly what state it is in, and works either way. Turning it on stays the owner's own act in
// /admin/settings/modules.
//
// NOTHING HERE IS COMPUTED. The grouping, the counts, the booking window, the available times and every Arabic
// status word come out of public.staff_visit_board; this file lays them out.

export const metadata: Metadata = { title: "الزيارات الميدانية" };

const STATE_NOTE: Record<string, string> = {
  disabled: "الموديول مطفي للزوّار: ما ينجمش حريف يطلب زيارة من الموقع. الفريق يبرمج ويأكّد من هنا عادي.",
  internal: "الموديول داخلي: فريق AgriZed وحده يشوف طلب الزيارة في الموقع.",
  public: "الموديول منشور: الحريف ينجم يطلب زيارة من صفحة العرض.",
};

export default async function VisitsPage({ searchParams }: PageProps<"/admin/visits">) {
  await requireStaff(CRM_READ_ROLES);
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const date = (key: string) => {
    const value = one(key);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  };

  const supabase = await createClient();
  const [board, flag, offerRows, settingRows] = await Promise.all([
    readVisitBoard({
      from: date("from"),
      to: date("to"),
      status: one("status"),
      projectId: one("project"),
    }),
    // The module's own name and state, read from the one row that holds both, so neither is written twice.
    supabase.from("feature_flags").select("label_ar, state").eq("key", "visits").maybeSingle(),
    supabase.from("projects").select("id, code, name").order("name"),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  const title = flag.data?.label_ar ?? "الزيارات الميدانية";
  const state = flag.data?.state ?? "disabled";
  const reasonValue = (settingRows.data ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;
  const offerName = new Map((offerRows.data ?? []).map((row) => [row.id, row]));

  if (!board) {
    return (
      <div className="space-y-roomy">
        <header>
          <h1 className="section-title">{title}</h1>
        </header>
        <EmptyState title="الموديول مازال ما تركّبش في قاعدة البيانات">
          جدول الزيارات وتوابعه موجودين في <span dir="ltr">supabase/pending/bb_21_visits.sql</span>، وهو مازال
          مسوّدة ما تطبّقتش. طبّقو، ثم أعد تحميل الصفحة.
        </EmptyState>
      </div>
    );
  }

  const counts = board.counts;

  return (
    <div className="space-y-roomy">
      <header className="space-y-snug">
        <div className="flex flex-wrap items-center gap-tight">
          <h1 className="section-title">{title}</h1>
          <StatusPill tone={state === "public" ? "success" : state === "internal" ? "info" : "neutral"}>
            {state === "public" ? "منشور" : state === "internal" ? "داخلي" : "معطّل"}
          </StatusPill>
        </div>
        <p className="max-w-3xl leading-7 text-muted">{STATE_NOTE[state] ?? STATE_NOTE.disabled}</p>
      </header>

      <div className="grid gap-snug sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="زيارات اليوم" value={formatCount(counts.today)} emphasis />
        <StatTile label="مطلوبة" value={formatCount(counts.requested)} note="تستنّى تأكيد" />
        <StatTile label="مؤكّدة" value={formatCount(counts.confirmed)} />
        <StatTile label="مطالب تستنّى زيارة" value={formatCount(board.waiting_total)} note="حرفاء طلبوا يزورو الأرض" />
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-snug p-cozy">
        <label className="block space-y-hair">
          <span className="label-sm">من تاريخ</span>
          <input type="date" name="from" defaultValue={board.range.from} className="field field-sm" />
        </label>
        <label className="block space-y-hair">
          <span className="label-sm">إلى تاريخ</span>
          <input type="date" name="to" defaultValue={board.range.to} className="field field-sm" />
        </label>
        <label className="block space-y-hair">
          <span className="label-sm">الحالة</span>
          <select name="status" defaultValue={one("status") ?? ""} className="field field-sm min-w-40">
            <option value="">كل الحالات</option>
            {board.statuses.map((status) => (
              <option key={status.code} value={status.code}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-hair">
          <span className="label-sm">العرض</span>
          <select name="project" defaultValue={one("project") ?? ""} className="field field-sm min-w-44">
            <option value="">كل العروض</option>
            {(offerRows.data ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">
          طبّق
        </button>
        <Link href="/admin/visits" className="btn btn-ghost btn-sm">
          نظّف
        </Link>
      </form>

      <section className="space-y-snug">
        <SectionHeader
          as="h2"
          title="روزنامة الزيارات"
          description={`من ${formatDate(board.range.from)} إلى ${formatDate(board.range.to)} · ${formatCount(counts.total)} زيارة`}
        />
        {board.days.length === 0 ? (
          <EmptyState title="ما فماش زيارات في المدة هذي">
            بدّل المدة من فوق، ولا ابدأ من «مطالب تستنّى زيارة» تحت: ثمّة حرفاء طلبوا يزورو الأرض ومازال ما
            تبرمجتلهمش زيارة.
          </EmptyState>
        ) : (
          board.days.map((day) => (
            <section key={day.date} className="space-y-snug">
              <h3 className="label-sm">
                {formatDate(day.date)} · {formatCount(day.visits.length)} زيارة
              </h3>
              <div className="grid gap-snug lg:grid-cols-2">
                {day.visits.map((visit) => (
                  <VisitEntry key={visit.id} visit={visit} terms={board.terms} reasonMin={reasonMin} />
                ))}
              </div>
            </section>
          ))
        )}
      </section>

      {/* THE LOOP THIS MODULE CLOSES. «نحب نزور الأرض» has been a tick on a demand with no screen behind it: the
          platform recorded the wish and nobody was ever shown it. Every unanswered wish is here, and a demand
          that named no offer says so instead of pretending to — the commercial picks the land when booking,
          which is also the order §45 puts these acts in. */}
      <section className="space-y-snug">
        <SectionHeader
          as="h2"
          title="مطالب تستنّى زيارة"
          description={`${formatCount(board.waiting_total)} حريف طلبوا يزورو الأرض ومازال ما تبرمجتلهمش زيارة.`}
        />
        {board.waiting.length === 0 ? (
          <EmptyState title="ما فماش مطلب يستنّى" size="sm" variant="plain">
            كل من طلب زيارة عندو وحدة مبرمجة.
          </EmptyState>
        ) : (
          <div className="grid gap-snug lg:grid-cols-2">
            {board.waiting.map((demand) => (
              <WaitingCard
                key={demand.request_id}
                demand={demand}
                offers={offersFor(demand, offerName)}
                terms={board.terms}
                reasonMin={reasonMin}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * The offers this demand may be visited on: the one it named, or every offer when it named none — which is the
 * 22-out-of-25 case in the live database, and the whole reason the commercial chooses here.
 */
function offersFor(
  demand: WaitingDemand,
  offers: Map<string, { id: string; code: string | null; name: string }>,
): VisitOffer[] {
  if (demand.project_id) {
    const row = offers.get(demand.project_id);
    return [
      {
        project_id: demand.project_id,
        code: demand.project_code ?? row?.code ?? null,
        name: demand.project_name ?? row?.name ?? "العرض",
        meeting_point: null,
        request_id: demand.request_id,
        request_no: demand.request_no,
      },
    ];
  }
  return [...offers.values()].map((row) => ({
    project_id: row.id,
    code: row.code,
    name: row.name,
    meeting_point: null,
    request_id: demand.request_id,
    request_no: demand.request_no,
  }));
}

function WaitingCard({
  demand,
  offers,
  terms,
  reasonMin,
}: {
  demand: WaitingDemand;
  offers: VisitOffer[];
  terms: VisitTerms;
  reasonMin: number;
}) {
  return (
    <article className="card p-cozy">
      <div className="flex flex-wrap items-baseline justify-between gap-tight">
        <p className="flex flex-wrap items-baseline gap-tight">
          <Link href={`/admin/leads/${demand.person_id}`} className="font-semibold text-forest underline-offset-4 hover:underline">
            {demand.person_name}
          </Link>
          {demand.phone_e164 ? (
            <a href={`tel:${demand.phone_e164}`} dir="ltr" className="text-sm text-muted tabular-nums underline-offset-4 hover:underline">
              {formatPhone(demand.phone_e164)}
            </a>
          ) : null}
        </p>
        <span dir="ltr" className="text-xs text-muted">
          {demand.request_no}
        </span>
      </div>

      <p className="mt-tight text-sm leading-6 text-muted">
        {demand.project_name ? `طلب يزور: ${demand.project_name}` : "يحب يزور — بلا عرض محدّد"}
        {demand.trees ? ` · ${formatCount(demand.trees)} زيتونة` : ""}
        {demand.contact_time ? ` · وقت التواصل: ${demand.contact_time}` : ""}
        {" · "}
        {formatDateTime(demand.created_at)}
      </p>

      <details className="disclosure mt-tight">
        <summary className="text-sm text-forest">برمج الزيارة</summary>
        <div>
          <BookVisitForm
            personId={demand.person_id}
            offers={offers}
            terms={terms}
            requestId={demand.request_id}
            defaultProjectId={demand.project_id}
            defaultChannel={demand.contact_channel ?? "phone"}
            reasonMin={reasonMin}
          />
        </div>
      </details>
    </article>
  );
}
