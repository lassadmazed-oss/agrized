// «طلبات الحرفاء» — INTERFACE 1, the call centre's own landing screen (§3, §4, §5, §6, §26).
//
// WHAT MAKES THIS A DESK AND NOT A FILTER ON SOMEBODY ELSE'S LIST. /admin/leads is an admin's list of demands
// in the order they arrived; an agent who wants their own work has to know to set a filter on it, and what
// comes back is still ordered by «newest demand», which is not the order calls are made in. This screen starts
// from the agent's own book and partitions it by the ONE question a call desk asks — who do I ring, and when.
// The four sections are the whole book: a file is in exactly one of them, and the tiles above them add up.
//
// NOTHING HERE DUPLICATES AN ENGINE.
//   · the queue is public.persons and public.contact_attempts, read through their own RLS (./read.ts)
//   · the call is written by the client file's own addContactAttempt / updateStatus (./actions.ts)
//   · the visit is booked by <BookVisitForm> talking to public.staff_book_visit — the SAME form the client
//     file and the visits board use, with the same window, the same slots, the same ceiling and the same
//     Arabic refusals. §6 asked for one way to book a visit and there is one.
//   · the hand-out is public.admin_assign_persons, which already takes a uuid[] and already audits each file
//
// WHAT AN AGENT NEVER DOES HERE IS RETYPE (§4, §26). The open call card prints what the client themselves
// answered on the site — the demand's own columns — and the form under it asks only for what is missing:
// how the call went, where the file stands now, when we ring again. There is no name field and no phone field.
//
// §27, WHAT IS NOT ON THIS SCREEN. No contract, no instalment schedule, no deposit, no total, no paid, no
// remaining, and no price this company computed. The only figures drawn are the ones the CLIENT typed or chose
// on the site — their budget band, their payment mode, the monthly figure they picked — which the call agent
// already reads on their own files and needs in order to have the conversation. «ما نعطيوش كل موظف access
// لحاجات ما يحتاجهاش.»
//
// ONE CARD OPEN AT A TIME, and it is in the address (?call=<person>). That is not a styling choice: rendering a
// call panel and a visit booking form into forty rows would send forty copies of both to a phone, and reading
// public.staff_person_visits once per row would be forty round trips. The open row costs one extra read, the
// card is linkable, and it all works with JavaScript off.

import type { Metadata } from "next";
import Link from "next/link";

import { DataList, DataRow, DataTable, EmptyState, SectionHeader, StatTile, StatusPill, type Column } from "@/components/ui";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { STAGE_TONES } from "@/lib/crm";
import { formatCount, formatDate, formatDateTime, formatMillimes } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { PAYMENT_MODE_LABELS, REQUEST_KIND_LABELS } from "../../leads/filters";
import { BookVisitForm } from "../../visits/book-visit-form";
import { readPersonVisits } from "../../visits/visit-data";
import { slotHours, visitTone } from "../../visits/visit-model";
import { CALL_DESK_ROLES } from "../desks";
import { CallForm } from "./call-form";
import { DistributeForm } from "./distribute-form";
import { BUCKET_COPY, DRAWN_BUCKETS, type Bucket, type QueueLead } from "./queue-model";
import { readCallQueue, readDistribution, tunisLocalNow, type QueueScope } from "./read";

export const metadata: Metadata = { title: "طلبات الحرفاء" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The heading of the time column, which is a different moment in each section. */
const TIME_HEADER: Record<Exclude<Bucket, "closed">, string> = {
  due: "موعد المكالمة",
  new: "تاريخ المطلب",
  open: "آخر مكالمة",
  later: "موعد المكالمة",
};

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** wa.me wants the digits alone. String handling, not a business rule. */
function whatsappHref(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

export default async function CallDeskPage({ searchParams }: PageProps<"/admin/desk/calls">) {
  const session = await requireStaff(CALL_DESK_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const params = await searchParams;

  // A commercial has one scope whatever the address says: RLS answers with their own files and nothing else,
  // so offering them a switch would offer them a view that cannot differ. Only a reader who can see more than
  // their own book gets the choice, and «مكتبي» stays the default for them too — §3: «each agent mainly sees
  // the leads assigned to them», managers included.
  const scope: QueueScope = isAdmin && one(params.scope) === "team" ? "team" : "mine";
  const openId = one(params.call) && UUID.test(one(params.call) as string) ? (one(params.call) as string) : null;

  const supabase = await createClient();
  const config = await getPublicConfig();

  const [queue, statuses, distribution, visitsAccess, settingRows] = await Promise.all([
    readCallQueue(supabase, { scope, userId: session.id, config }),
    supabase.from("lead_statuses").select("id, label_ar").eq("is_active", true).order("sort_order"),
    isAdmin ? readDistribution(supabase) : null,
    moduleAccess(config, "visits"),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  const reasonValue = (settingRows.data ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;
  const statusOptions = statuses.data ?? [];

  // The open card is looked up INSIDE the queue that was just read, never fetched on its own: a ?call= that
  // points at a file outside this scope then finds nothing and says so, instead of quietly opening a card for
  // somebody else's client.
  const open = openId
    ? ([...queue.buckets.due, ...queue.buckets.new, ...queue.buckets.open, ...queue.buckets.later, ...queue.buckets.closed].find(
        (lead) => lead.person_id === openId,
      ) ?? null)
    : null;

  // «open to this reader» and not the raw flag, the same rule the client file applies: «داخلي» is open to
  // signed-in staff, «معطّل» is closed to everyone including them. One read, and only for the open row.
  const showVisits = visitsAccess !== "closed";
  const personVisits = open && showVisits ? await readPersonVisits(open.person_id) : null;

  // Midnight in Africa/Tunis, from the same clock the callback field is floored by. Africa/Tunis is UTC+1
  // all year (no daylight saving), which is why the offset can be written rather than looked up — the same
  // reading src/app/admin/(panel)/leads/[personId]/actions.ts gives a typed follow-up time.
  const todayStart = new Date(`${tunisLocalNow().slice(0, 10)}T00:00:00+01:00`).getTime();

  const scopeHref = (next: QueueScope) => (next === "mine" ? "/admin/desk/calls" : "/admin/desk/calls?scope=team");
  const callHref = (lead: QueueLead) =>
    `/admin/desk/calls?${scope === "team" ? "scope=team&" : ""}call=${lead.person_id}#call-card`;

  const columnsFor = (bucket: Exclude<Bucket, "closed">): Column<QueueLead>[] => [
    {
      key: "name",
      header: "الحريف",
      mobile: "title",
      className: "font-medium",
      cell: (lead) => (
        <Link href={callHref(lead)} className="text-forest underline-offset-4 hover:underline">
          {lead.full_name}
        </Link>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      className: "whitespace-nowrap",
      cell: (lead) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <a href={`tel:${lead.phone_e164}`} dir="ltr" className="tabular-nums text-forest underline-offset-4 hover:underline">
            {formatPhone(lead.phone_e164)}
          </a>
          {lead.whatsapp_e164 ? (
            <a
              href={whatsappHref(lead.whatsapp_e164)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted underline-offset-4 hover:underline"
            >
              WhatsApp
            </a>
          ) : null}
        </span>
      ),
    },
    {
      key: "request",
      header: "المطلب",
      className: "max-w-56",
      cell: (lead) =>
        lead.request ? (
          <>
            <span dir="ltr" className="block text-xs tabular-nums text-muted">
              {lead.request.request_no}
            </span>
            <span className="block truncate">
              {lead.request.project_name ?? REQUEST_KIND_LABELS[lead.request.request_kind as "calculator" | "offer"] ?? "—"}
            </span>
            {typeof lead.request.trees === "number" ? (
              <span className="text-xs text-muted">
                <span className="tabular-nums">{formatCount(lead.request.trees)}</span> زيتونة
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: "region", header: "الولاية", cell: (lead) => lead.governorate ?? <span className="text-muted">—</span> },
    {
      key: "when",
      header: TIME_HEADER[bucket],
      numeric: true,
      cell: (lead) => {
        const at = bucket === "new" ? lead.created_at : (lead.due_at ?? lead.created_at);
        return (
          <>
            <span dir="ltr">{formatDateTime(at)}</span>
            {/* «متأخرة» is a calendar fact and not a tuned delay: the call was promised on a day that has
                already ended in Tunis. Every row in this bucket is due by construction, so «the moment has
                passed» would mark all of them and say nothing; «you promised this yesterday» is the line the
                dashboard's own follow-up queue already draws. */}
            {bucket === "due" && new Date(at).getTime() < todayStart ? (
              <span className="mt-1 block">
                <StatusPill tone="danger">متأخرة</StatusPill>
              </span>
            ) : null}
          </>
        );
      },
    },
    ...(scope === "team"
      ? [
          {
            key: "owner",
            header: "المسؤول",
            cell: (lead: QueueLead) => lead.owner_name ?? <span className="text-muted">بلا مسؤول</span>,
          } satisfies Column<QueueLead>,
        ]
      : []),
    {
      key: "status",
      header: "الحالة",
      mobile: "aside",
      cell: (lead) => <StatusPill toneClass={STAGE_TONES[lead.stage as keyof typeof STAGE_TONES]}>{lead.status_label}</StatusPill>,
    },
  ];

  return (
    <div className="space-y-8">
      <SectionHeader
        level={1}
        title="طلبات الحرفاء"
        description={
          scope === "mine"
            ? `الملفات المسندة ليك يا ${session.fullName || ""}، مقسّمة على حسب الخدمة اللي تستنّى.`
            : "كل الملفات اللي تنجم تشوفها، مقسّمة على حسب الخدمة اللي تستنّى."
        }
        actions={
          <Link href={scope === "mine" ? "/admin/leads" : "/admin/leads?people=1"} className="btn btn-secondary btn-sm">
            قائمة المطالب الكاملة
          </Link>
        }
      />

      {isAdmin ? (
        <nav aria-label="نطاق المكتب" className="flex flex-wrap gap-tight">
          <Link href={scopeHref("mine")} aria-current={scope === "mine"} className="chip">
            مكتبي
          </Link>
          <Link href={scopeHref("team")} aria-current={scope === "team"} className="chip">
            كل الفريق
          </Link>
        </nav>
      ) : null}

      {queue.truncated ? (
        <p role="status" className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          الملفات برشة على هذه الصفحة، وتنجم تفوّت ملف. استعمل «قائمة المطالب الكاملة» مؤقتاً، وقول للمطوّر
          يعوّض القراءة هذي بـدالّة في قاعدة البيانات (staff_call_queue).
        </p>
      ) : null}

      {/* ── The open call card (§4 · §5 · §6) ──────────────────────────────────────────────────────── */}
      {openId ? (
        <section id="call-card" aria-labelledby="call-card-title" className="card p-5 sm:p-6">
          {open ? (
            <div className="space-y-cozy">
              <SectionHeader
                id="call-card-title"
                as="h2"
                level={2}
                title={open.full_name}
                badge={
                  <StatusPill toneClass={STAGE_TONES[open.stage as keyof typeof STAGE_TONES]}>{open.status_label}</StatusPill>
                }
                description={
                  open.owner_name ? `المسؤول على الملف: ${open.owner_name}.` : "الملف هذا ما عندو حتى مسؤول."
                }
                actions={
                  <>
                    <a href={`tel:${open.phone_e164}`} dir="ltr" className="btn btn-primary btn-sm tabular-nums">
                      {formatPhone(open.phone_e164)}
                    </a>
                    {open.whatsapp_e164 ? (
                      <a href={whatsappHref(open.whatsapp_e164)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                        WhatsApp
                      </a>
                    ) : null}
                    <Link href={`/admin/leads/${open.person_id}`} className="btn btn-ghost btn-sm">
                      الملف الكامل
                    </Link>
                    <Link href={scopeHref(scope)} className="btn btn-ghost btn-sm">
                      سكّر
                    </Link>
                  </>
                }
              />

              {/* §4 · §26 — what the client typed on the site. Read, never re-asked. */}
              <section aria-labelledby="what-they-said" className="panel p-4">
                <SectionHeader
                  id="what-they-said"
                  as="h3"
                  level={3}
                  title="شنوّا كتب الحريف في الموقع"
                  description="هذا اللي عبّاه بيديه. ما تعاودش تسألو عليه — كمّل الناقص برك."
                  className="mb-3"
                />
                {open.request ? (
                  <DataList variant="grid" columns={2} className="text-sm">
                    <DataRow layout="stacked" label="رقم المطلب" numeric={false}>
                      <span dir="ltr" className="tabular-nums">
                        {open.request.request_no}
                      </span>
                      <span className="text-muted"> · {formatDate(open.request.created_at)}</span>
                    </DataRow>
                    <DataRow layout="stacked" label="العرض" numeric={false}>
                      {open.request.project_name ?? REQUEST_KIND_LABELS[open.request.request_kind as "calculator" | "offer"] ?? "—"}
                      {open.request.project_code ? <span className="text-muted"> · {open.request.project_code}</span> : null}
                    </DataRow>
                    {typeof open.request.trees === "number" ? (
                      <DataRow layout="stacked" label="عدد الزيتونات">
                        {formatCount(open.request.trees)}
                        {open.request.trees_label ? <span className="text-muted"> · {open.request.trees_label}</span> : null}
                      </DataRow>
                    ) : null}
                    <DataRow layout="stacked" label="وين يحب يستثمر" numeric={false}>
                      {open.request.anywhere
                        ? "المكان ما يهمّوش"
                        : open.request.governorates.length > 0
                          ? open.request.governorates.join("، ")
                          : "—"}
                    </DataRow>
                    {open.request.goal_label_ar ? (
                      <DataRow layout="stacked" label="الهدف" numeric={false}>
                        {open.request.goal_label_ar}
                      </DataRow>
                    ) : null}
                    {open.request.payment_mode ? (
                      <DataRow layout="stacked" label="طريقة الخلاص اللي اختارها" numeric={false}>
                        {PAYMENT_MODE_LABELS[open.request.payment_mode] ?? open.request.payment_mode}
                        {open.request.down_payment_label_ar ? (
                          <span className="text-muted"> · تسبقة {open.request.down_payment_label_ar}</span>
                        ) : null}
                      </DataRow>
                    ) : null}
                    {typeof open.request.monthly_millimes === "number" ? (
                      <DataRow layout="stacked" label="القسط الشهري اللي اختارو">
                        {formatMillimes(open.request.monthly_millimes)}
                        {typeof open.request.duration_months === "number" ? (
                          <span className="text-muted"> · {formatCount(open.request.duration_months)} شهر</span>
                        ) : null}
                      </DataRow>
                    ) : null}
                    {open.request.budget_label_ar ? (
                      <DataRow layout="stacked" label="الميزانية اللي حدّدها" numeric={false}>
                        {open.request.budget_label_ar}
                      </DataRow>
                    ) : null}
                    {open.request.contact_time_label_ar ? (
                      <DataRow layout="stacked" label="وقت الاتصال اللي يحبّو" numeric={false}>
                        {open.request.contact_time_label_ar}
                      </DataRow>
                    ) : null}
                    <DataRow layout="stacked" label="يحب يزور الأرض" numeric={false}>
                      {open.request.wants_visit === true ? "إيه" : open.request.wants_visit === false ? "لا" : "ما جاوبش"}
                    </DataRow>
                  </DataList>
                ) : (
                  <p className="hint">
                    الملف هذا ما عندو حتى مطلب من الموقع — تزاد من الـBack Office. الحاجات اللي نعرفوها عليه
                    تلقاهم في «الملف الكامل».
                  </p>
                )}
              </section>

              {open.last ? (
                <p className="hint">
                  آخر مكالمة: <span dir="ltr">{formatDateTime(open.last.at)}</span>
                  {open.last.by ? ` · ${open.last.by}` : ""}
                  {open.last.note ? ` — «${open.last.note}»` : ""}
                </p>
              ) : null}

              <div className="grid gap-cozy lg:grid-cols-2">
                {/* §5 — the call, and the file moving, in one press. */}
                <section aria-labelledby="log-call" className="panel p-4">
                  <SectionHeader id="log-call" as="h3" level={3} title="سجّل المكالمة" className="mb-3" />
                  <CallForm
                    key={open.person_id}
                    personId={open.person_id}
                    statuses={statusOptions}
                    currentStatusId={open.status_id}
                    currentStatusLabel={open.status_label}
                    minCallback={tunisLocalNow()}
                  />
                </section>

                {/* §6 — the visit, booked by the module that owns booking. */}
                <section aria-labelledby="book-visit" className="panel p-4">
                  <SectionHeader
                    id="book-visit"
                    as="h3"
                    level={3}
                    title="برمج زيارة"
                    description={
                      open.request?.wants_visit === true ? "الحريف طلب زيارة في مطلبو." : "كان وصلتو لمرحلة الزيارة."
                    }
                    className="mb-3"
                  />
                  {!showVisits ? (
                    <p className="hint">
                      موديول الزيارات مطفي. شعّلو من «الإعدادات › الموديولات» باش تنجم تبرمج من هنا.
                    </p>
                  ) : !personVisits ? (
                    <p className="hint">
                      ما نجّمناش نقراو الزيارات متاع الحريف هذا. حدّث الصفحة، وإذا تعاودت المشكلة برمج من الملف
                      الكامل.
                    </p>
                  ) : (
                    <div className="space-y-cozy">
                      {personVisits.visits.length > 0 ? (
                        <ul className="space-y-tight text-sm">
                          {personVisits.visits.map((visit) => (
                            <li key={visit.id} className="flex flex-wrap items-center gap-tight">
                              <StatusPill tone={visitTone(visit.status)}>{visit.status_label}</StatusPill>
                              <span dir="ltr" className="tabular-nums">
                                {formatDate(visit.visit_date)}
                              </span>
                              <span className="text-muted">
                                {visit.slot_label}
                                {slotHours(visit.slot_from, visit.slot_to) && !visit.slot_label.includes(":")
                                  ? ` (${slotHours(visit.slot_from, visit.slot_to)})`
                                  : ""}
                              </span>
                              <span className="text-xs text-muted">{visit.offer.name}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {/* The same three props the client file's VisitCard passes, and for the same reason:
                          the demand attached to a visit must be one that ASKED for a visit and names the
                          offer being visited, or public.staff_book_visit refuses it (invalid_visit_request).
                          Reaching for «the person's latest demand» instead would attach a calculator
                          simulation with no project to an offer's visit and turn a booking into an error
                          message. When there is no such wish, the demand is left out and the form's own
                          offer list — built by staff_person_visits — decides. */}
                      <BookVisitForm
                        key={open.person_id}
                        personId={open.person_id}
                        offers={personVisits.offers}
                        terms={personVisits.terms}
                        requestId={personVisits.waiting[0]?.request_id ?? null}
                        defaultProjectId={personVisits.waiting.find((wish) => wish.project_id)?.project_id ?? null}
                        reasonMin={reasonMin}
                      />
                    </div>
                  )}
                </section>
              </div>
            </div>
          ) : (
            <EmptyState size="sm" title="الملف هذا موش في مكتبك">
              يا إمّا تحوّل لكوميرسيال آخر، يا إمّا ما عندكش صلاحية تقراه.{" "}
              {isAdmin && scope === "mine" ? "جرّب «كل الفريق» فوق." : "اطلب من المسؤول يسندهولك."}
            </EmptyState>
          )}
        </section>
      ) : null}

      {/* ── §3: the manager hands the files out ───────────────────────────────────────────────────── */}
      {isAdmin && distribution ? (
        <details className="disclosure card" open={distribution.pool > 0 && queue.total === 0}>
          <summary>
            توزيع الملفات
            <span className="ms-auto text-sm font-normal text-muted">
              <span className="tabular-nums">{formatCount(distribution.pool)}</span> ملف بلا مسؤول
            </span>
          </summary>
          <div className="space-y-cozy">
            <p className="hint">
              يتوزّعو الملفات اللي ما عندهاش مسؤول، الأقدم الأول. اكتب عدد الملفات قدّام كل كوميرسيال — 40 لهذا،
              50 لهذاك — واضغط «وزّع». كل ملف يتسجّل في تاريخو شكون حوّلو وعلاش.
            </p>
            <DistributeForm pool={distribution.pool} targets={distribution.targets} />
          </div>
        </details>
      ) : null}

      {/* ── The four counts, and the four queues under them ────────────────────────────────────────── */}
      <section aria-labelledby="counts" className="space-y-3">
        <h2 id="counts" className="text-lg font-semibold">
          المكتب متاعك اليوم
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {DRAWN_BUCKETS.map((bucket) => (
            <StatTile
              key={bucket}
              size="sm"
              label={BUCKET_COPY[bucket].title}
              value={queue.counts[bucket]}
              note={BUCKET_COPY[bucket].hint}
              href={`#bucket-${bucket}`}
              emphasis={bucket === "due" && queue.counts[bucket] > 0}
              quiet={queue.counts[bucket] === 0}
            />
          ))}
        </div>
        <p className="hint">
          مجموع الملفات في مكتبك: <span className="tabular-nums">{formatCount(queue.total)}</span>
          {queue.counts.closed > 0 ? (
            <>
              {" "}
              — منهم <span className="tabular-nums">{formatCount(queue.counts.closed)}</span> مسكّرين (مالك، مغلق،
              ولا غير مهتم حالياً) وما يتعدّاش عليهم.
            </>
          ) : null}
        </p>
      </section>

      {queue.total === 0 ? (
        <EmptyState title="ما عندك حتى ملف">
          {isAdmin
            ? "ما فماش ملف مسند ليك. وزّع الملفات من «توزيع الملفات» فوق، ولا شوف «كل الفريق»."
            : "ما فماش ملف مسند ليك توّا. المسؤول هو اللي يوزّع الملفات — اطلب منّو."}
        </EmptyState>
      ) : (
        DRAWN_BUCKETS.map((bucket) => (
          <section key={bucket} id={`bucket-${bucket}`} aria-labelledby={`bucket-${bucket}-title`} className="space-y-3 scroll-mt-24">
            <SectionHeader
              id={`bucket-${bucket}-title`}
              level={2}
              title={
                <>
                  {BUCKET_COPY[bucket].title}{" "}
                  <span className="text-base font-normal text-muted tabular-nums">({formatCount(queue.counts[bucket])})</span>
                </>
              }
              description={BUCKET_COPY[bucket].hint}
            />
            <DataTable
              caption={BUCKET_COPY[bucket].title}
              columns={columnsFor(bucket)}
              rows={queue.buckets[bucket]}
              rowKey={(lead) => lead.person_id}
              minWidth="56rem"
              empty={
                <EmptyState size="sm" variant="plain">
                  {BUCKET_COPY[bucket].empty}
                </EmptyState>
              }
            />
          </section>
        ))
      )}
    </div>
  );
}
