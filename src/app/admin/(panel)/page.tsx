// لوحة القيادة — the day's work, in the order it has to be done.
//
// What this screen used to be: eighteen charts, every one of them already on /admin/analytics, with four
// small counters above them. You could read it for a minute and still not know what to do next.
//
// What it is now: the things waiting on you. Each section is a queue whose rows open the exact record, or
// a tile that carries its own filter into the list it counts. Nothing here dumps you into an unfiltered
// page, and nothing here is a second analytics screen.
//
// THE ORDER. The demand side first — a demand on real stock is the only thing on this screen that can lose
// the sale today — then the two things with a clock on them (a visit has a place and an hour, a hold has a
// deadline and a dinar), then your own follow-ups, then the offer side, then the totals, which are a glance
// and not a task.
//
// WHAT IS COUNTED, AND FROM WHERE. Every figure is a count of rows in a table that holds rows:
//   · public.persons, public.contact_attempts, public.land_offers — through their own RLS, so a commercial
//     reads their files and an admin reads all of them, with no second rule written here.
//   · public.interest_requests where request_kind = 'offer' — a demand on a real offer (0049), joined to
//     public.trees by request_id to tell «asked for trees» from «has trees».
//   · the stock — through ./projects/offer-stock, the one way the Back Office reads it. This screen prints
//     no stock figure of its own: the four counts and their settings-driven labels belong to /admin/projects,
//     and a second copy of them here would be a second definition of the same fact.
//
// WHAT LEFT, 2026-09-18. Two queues stood here — «قطع تستنّى قرار» and «قطع بلا سعر» — both read
// public.parcels, a table that has never held a row, and all three of their links pointed at routes deleted
// with the parcel layer. They are replaced, not restored: the tree equivalent of «needs attention» is an
// offer whose trees were never numbered, which is the third queue below, and it is the offer page that acts
// on it. There is no /admin/projects/trees screen — an earlier version of this comment named one.
//
// THE FUNNEL, ADDED 2026-09-21 (§28, §24, §29). Everything above is a WORKLIST — what is waiting on you —
// and the owner's §28 asks for the other half: where the whole book stands, «new requests · contacted ·
// interested · visits scheduled · visits done · reservations · deposits paid · in contract · completed
// sales», plus the trees available / reserved / sold. Not one of those was a query anywhere in this product.
//
// It could not have been built before, and the reason is the whole of the owner's complaint. public.persons
// .status_id is written by exactly one thing in this system, a human dropdown: booking a visit does not move
// a file, recording the عربون does not move a file, signing a contract does not move a file. A dashboard
// counting status_id would have shipped nine numbers that are already wrong at twenty people. So the stage
// is DERIVED in Postgres from the facts that already exist, and the dropdown stays the human override and is
// reported beside it wherever the two disagree. All of that lives in one function; see
// supabase/pending/bb_70_funnel_dashboard.sql and src/components/admin/funnel-read.tsx.
//
// WHERE IT SITS, AND WHY. Straight after the attention tiles and before the queues, which looks like a
// break from «the things waiting on you first» and is not: the two blocks answer the same question at two
// scales — a tile is one file to deal with today, the funnel's headline is the stage where the pipeline is
// dammed, which is the admin's own piece of work. It is also admin-only, and an admin is precisely the
// reader who is not working a queue: a commercial's page opens on their own work exactly as it did.
//
// Contracts and payments were a draft when this screen was written, so nothing here counted them; they are
// applied now (0072) and the funnel is the one part of this page that reads them — as three stage counts,
// never as a dinar. Money belongs to Finance's screens, and a second definition of «المدفوع» on a dashboard
// is how two screens start disagreeing.
//
// RESERVATIONS AND VISITS DO, since 2026-09-19 (report v3 §23/§24 and §25), and they are the two additions
// this screen earned from stage 2: a hold that is waiting for its عربون, a hold whose deadline is closing in,
// and the appointments somebody has to drive to. Each one is read through its module's own reader
// (./reservations/read, ./visits/visit-data), which is one RPC that decides the counts, the ordering, the days
// left and the Arabic in Postgres — this file lays them out and works nothing out.
//
// Both are mounted ONLY while their module is open to this reader, and both are off today, so this screen is
// unchanged until the owner switches one on himself. That gate also answers «never a figure from an empty
// table» twice over: nothing is read while a module is off, and a reader that fails (the tables arrive with a
// draft in supabase/pending/) answers null, which draws nothing rather than a confident zero.

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { FunnelBoard, TreeStock } from "@/components/admin/funnel";
import { readFunnel } from "@/components/admin/funnel-read";
import { EmptyState, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, LAND_OFFER_ROLES, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { projectStatusLabel, projectStatusTone } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

import { daysAgo, tunisToday, type DemandStats } from "./analytics/demand-stats";
import { offerStocks } from "./projects/offer-stock";
import { readReservations } from "./reservations/read";
import { daysLeftLabel, FILTER_LABELS } from "./reservations/reservation-model";
import { readVisitBoard } from "./visits/visit-data";
import { visitTone, type Visit } from "./visits/visit-model";

export const metadata: Metadata = { title: "لوحة القيادة" };

/** How many rows of a queue the dashboard shows before sending you to the full list. */
const PREVIEW = 6;

/**
 * Who numbers an offer's trees — app.can_manage_trees (0054_trees.sql:77). The stock queue is theirs: a
 * commercial cannot generate an offer's trees, so showing them that backlog would be showing them a
 * control they can never press.
 */
const TREE_STOCK_ROLES = ["agri_manager", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

/** How far back «هذا الأسبوع» reaches on the movement line. */
const WEEK = 7;

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const session = await requireStaff();
  const params = await searchParams;
  const canSeeCrm = hasRole(session, CRM_READ_ROLES);
  const canSeeLand = hasRole(session, LAND_OFFER_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const canFollowUp = hasRole(session, ["commercial", "admin", "super_admin"]);
  const canSeeStock = hasRole(session, TREE_STOCK_ROLES);
  const ownFilesOnly = hasRole(session, ["commercial"]) && !hasRole(session, ["admin", "super_admin", "finance", "legal"]);

  const supabase = await createClient();
  const today = tunisToday();
  const endOfToday = `${today}T23:59:59+01:00`;
  const weekStart = `${daysAgo(today, WEEK)}T00:00:00+01:00`;

  // Stage 2. «open to this reader» and not the raw flag: «داخلي فقط» is open to signed-in staff, «معطّل» is
  // closed to everyone including them. A closed module reads nothing at all, which is the only way a dashboard
  // can promise it never prints a figure it did not count.
  const config = await getPublicConfig();
  const [reservationsAccess, visitsAccess] = await Promise.all([
    moduleAccess(config, "reservations"),
    moduleAccess(config, "visits"),
  ]);
  const canSeeReservations = canSeeCrm && reservationsAccess !== "closed";
  const canSeeVisits = canSeeCrm && visitsAccess !== "closed";

  const [statuses, overall, unassigned, landUnderStudy, dueAttempts, offerDemands, offers, movedTrees, holds, visitBoard, funnel] = await Promise.all([
    canSeeCrm ? supabase.from("lead_statuses").select("id, stage, label_ar, is_stage_default") : null,
    canSeeCrm ? supabase.rpc("crm_demand_stats", {}) : null,
    isAdmin ? supabase.from("persons").select("id", { count: "exact", head: true }).is("assigned_to", null) : null,
    canSeeLand ? supabase.from("land_offers").select("id", { count: "exact", head: true }).eq("status", "under_study") : null,
    // §5. Every callback this agent set that is due by tonight, oldest first. THE 30-DAY FLOOR THAT USED TO
    // BE HERE IS GONE: a callback set six weeks ago and never made is not less due than one set yesterday,
    // it is the most overdue thing this agent owns — and it was dropping off this queue in silence, which is
    // the worst way for a promise to a client to disappear. The ordering already puts the oldest on top and
    // the row already says «متأخرة»; the limit keeps the read bounded.
    canFollowUp
      ? supabase
          .from("contact_attempts")
          .select("person_id, next_follow_up_at")
          .eq("created_by", session.id)
          .not("next_follow_up_at", "is", null)
          .lte("next_follow_up_at", endOfToday)
          .order("next_follow_up_at", { ascending: true })
          .limit(100)
      : null,
    // A demand on a real offer. RLS answers it with the files this session may see, so no role rule is
    // written twice; `count` is the whole set even when the rows below are capped.
    canSeeCrm
      ? supabase
          .from("interest_requests")
          .select(
            // payment_mode and monthly_millimes: the commercial calls from this row, and «200 زيتونة» reads
            // very differently from «200 زيتونة، يحب يخلّص على 60 شهر». Both columns have existed since 0032;
            // they stay null on an offer demand until supabase/pending/bb_10_offer_payment_plan.sql is applied,
            // and the row then simply says nothing rather than guessing.
            "id, request_no, created_at, person_id, project_id, project_name, project_code, offer_trees, is_duplicate, payment_mode, monthly_millimes",
            {
            count: "exact",
          })
          .eq("request_kind", "offer")
          .order("created_at", { ascending: false })
          .limit(100)
      : null,
    canSeeStock ? supabase.from("projects").select("id, code, name, status, tree_count").order("created_at", { ascending: false }) : null,
    canSeeStock
      ? supabase.from("trees").select("id", { count: "exact", head: true }).neq("state", "available").gte("allocated_at", weekStart)
      : null,
    // §23. One call: `counts` covers every filter of /admin/reservations, so «قربت تنتهي» and «انتهت مدّتها»
    // are read from the same answer as the rows, and the rows are the holds still waiting for their عربون —
    // chosen, ordered and counted by staff_reservations, never sliced here. RLS inside it answers with the
    // files this session may see, so no role rule is written a second time.
    canSeeReservations ? readReservations(supabase, "awaiting", { limit: 100 }) : null,
    // §25. No range is passed on purpose: staff_visit_board defaults to today → today + visits.max_ahead_days,
    // which is the owner's setting and the only honest definition of «قادمة» this screen could use.
    canSeeVisits ? readVisitBoard({}) : null,
    // §28. One call for the whole funnel and the three tree counts, so no two figures on it come from two
    // moments — a funnel whose stage 7 was counted after stage 6 can show more people further down than
    // exist further up, which is the one thing a funnel must never do. Admin only, checked here AND inside
    // the function (§27): it counts every file in the company, so it cannot ride on app.can_see_person the
    // way the lists do. Null while the draft is unapplied, and null draws nothing.
    isAdmin ? readFunnel(supabase) : null,
  ]);

  // ── The tiles: a count and the list that holds exactly those rows ───────────────────────────────────
  const newStatus = (statuses?.data ?? []).find((status) => status.stage === "new" && status.is_stage_default);
  // The two counts overlap — an unassigned file is usually also a new one — so the second tile says how
  // much of itself is already in the first. Two tiles adding up to more people than exist is how a queue
  // stops being readable.
  const [neverContacted, unassignedNew] = await Promise.all([
    newStatus ? supabase.from("persons").select("id", { count: "exact", head: true }).eq("status_id", newStatus.id) : null,
    newStatus && isAdmin
      ? supabase.from("persons").select("id", { count: "exact", head: true }).eq("status_id", newStatus.id).is("assigned_to", null)
      : null,
  ]);

  // Both counts count people, so both links open the list in «شخص في كل سطر» (people=1): the number on the
  // tile and the number on the page it opens are then the same number.
  const overlap = unassignedNew?.count ?? 0;
  const tiles = [
    newStatus && neverContacted
      ? {
          label: `ملفات في «${newStatus.label_ar}»`,
          value: neverContacted.count ?? 0,
          note: "ما تكلّمنا معاهم حتى مرة.",
          href: `/admin/leads?status_id=${newStatus.id}&people=1`,
        }
      : null,
    isAdmin
      ? {
          label: "ملفات بلا مسؤول",
          value: unassigned?.count ?? 0,
          note:
            overlap > 0
              ? `لازم تتسند لكوميرسيال. ${formatCount(overlap)} منها محسوبة زادة في البطاقة اللي قبل.`
              : "لازم تتسند لكوميرسيال.",
          href: "/admin/leads?assigned_to=none&people=1",
        }
      : null,
    canSeeLand
      ? {
          label: "أراضٍ معروضة علينا قيد الدراسة",
          value: landUnderStudy?.count ?? 0,
          note: "تستنّى قرار قانوني وفني.",
          href: "/admin/land-offers?status=under_study",
        }
      : null,
    // §24: a deadline that passed changes nothing by itself — the spec gives the admin three choices and names
    // no automatic one — so an expired hold is a person's decision waiting to be taken, which is what this
    // group is for. Two tiles and not one: «قربت تنتهي» is a call to make and «انتهت مدّتها» is a hold to
    // close, and staff_reservations counts them apart (is_soon excludes is_overdue), so each carries its own
    // filter into the list that holds exactly those rows. Both vanish with the module, not with the count.
    canSeeReservations && holds
      ? {
          label: `حجوزات ${FILTER_LABELS.overdue}`,
          value: holds.counts.overdue,
          note: "فاتت المدة والزيتونات مازالت محجوزة: مدّد، ألغي، ولا رجّعها.",
          href: "/admin/reservations?filter=overdue",
        }
      : null,
    canSeeReservations && holds
      ? {
          label: `حجوزات ${FILTER_LABELS.soon}`,
          value: holds.counts.soon,
          note: `باقيلها ${formatCount(holds.soonDays)} أيام ولا أقلّ. كلّم الحريف قبل ما توفى.`,
          href: "/admin/reservations?filter=soon",
        }
      : null,
  ].filter((tile): tile is { label: string; value: number; note: string; href: string } => tile !== null);

  // ── Demands on real offers with nothing reserved against them ───────────────────────────────────────
  // A tree carries the request it was given for (public.trees.request_id), so «this demand already has
  // trees» is one read, not a guess from the file's status.
  const demandRows = offerDemands?.data ?? [];
  const allocated =
    demandRows.length > 0
      ? ((
          await supabase
            .from("trees")
            .select("request_id")
            .in(
              "request_id",
              demandRows.map((row) => row.id),
            )
        ).data ?? [])
      : [];
  const servedRequests = new Set(allocated.map((tree) => tree.request_id));
  const openDemands = demandRows.filter((row) => !servedRequests.has(row.id));
  const demandNames = new Map(
    openDemands.length > 0
      ? (
          (
            await supabase
              .from("persons")
              .select("id, full_name")
              .in(
                "id",
                openDemands.map((row) => row.person_id),
              )
          ).data ?? []
        ).map((person) => [person.id, person.full_name] as const)
      : [],
  );

  // ── My follow-ups: one row per person, earliest first ───────────────────────────────────────────────
  const dueByPerson = new Map<string, string>();
  for (const attempt of dueAttempts?.data ?? []) {
    const due = attempt.next_follow_up_at;
    if (!due) continue;
    const kept = dueByPerson.get(attempt.person_id);
    if (!kept || due < kept) dueByPerson.set(attempt.person_id, due);
  }
  const duePersons =
    dueByPerson.size > 0
      ? ((await supabase.from("persons").select("id, full_name, status_id").in("id", [...dueByPerson.keys()])).data ?? [])
      : [];
  const statusLabel = new Map((statuses?.data ?? []).map((status) => [status.id, status.label_ar]));
  const startOfToday = new Date(`${today}T00:00:00+01:00`).getTime();
  const followUps = duePersons
    .map((person) => ({ person, due: dueByPerson.get(person.id) as string }))
    .map((row) => ({ ...row, late: new Date(row.due).getTime() < startOfToday }))
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  // ── Offers whose trees were never numbered ──────────────────────────────────────────────────────────
  // `not_generated` is not «none left»: nobody has given this offer's trees their numbers, so it cannot be
  // reserved, sold or counted. `partial` is the declared count and the rows disagreeing.
  const offerRows = offers?.data ?? [];
  const stocks =
    offerRows.length > 0
      ? await offerStocks(
          supabase,
          offerRows.map((offer) => offer.id),
        )
      : null;
  const unnumbered = offerRows
    .map((offer) => ({ offer, stock: stocks?.get(offer.id) }))
    .filter(({ stock }) => !stock || stock.status !== "ok");
  const weekMoves = movedTrees?.count ?? 0;

  // ── The appointments, and the holds waiting for money ───────────────────────────────────────────────
  // staff_visit_board already grouped its answer by day, in date then slot order, over the window the owner's
  // settings define; flattening it back is reading, not deciding. A visit that was completed, missed or called
  // off is history and belongs on /admin/visits, so what stays is the two live statuses — the ones somebody
  // still has to confirm or turn up for.
  const upcomingVisits: Visit[] = (visitBoard?.days ?? [])
    .flatMap((day) => day.visits)
    .filter((visit) => visit.status === "requested" || visit.status === "confirmed");
  const toConfirm = upcomingVisits.filter((visit) => visit.status === "requested").length;
  // The holds staff_reservations chose for the «awaiting» filter, in the order it put them (overdue first).
  const awaitingDeposit = holds?.rows ?? [];

  return (
    <div className="space-y-8">
      {params.denied ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          لا تملك صلاحية الوصول إلى تلك الصفحة.
        </p>
      ) : null}

      <SectionHeader
        level={1}
        title="لوحة القيادة"
        description={`مرحباً ${session.fullName || ""}. هذي الحاجات اللي تستنّى فيك اليوم.${
          ownFilesOnly ? " الأرقام تخص الملفات المسندة إليك." : ""
        }`}
        actions={
          canSeeCrm ? (
            <Link href="/admin/analytics" className="btn btn-secondary btn-sm">
              التحليلات وخريطة الطلب
            </Link>
          ) : null
        }
      />

      {tiles.length > 0 ? (
        <section aria-labelledby="attention" className="space-y-3">
          <h2 id="attention" className="text-lg font-semibold">
            يحتاج تدخّل
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((tile) => (
              <StatTile
                key={tile.label}
                size="sm"
                label={tile.label}
                value={tile.value}
                note={tile.note}
                href={tile.href}
                emphasis={tile.value > 0}
                quiet={tile.value === 0}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* §28 and §24. Drawn only when the database answered: a failed read, an unapplied draft or a reader
          who is not an admin all produce null, and null draws nothing at all. That is the same rule the
          tiles above follow and it exists because «0 زيتونة محجوزة» reads as a statement about the business
          rather than as a read that never happened. */}
      {funnel ? (
        <>
          <FunnelBoard funnel={funnel} />
          <TreeStock trees={funnel.trees} />
        </>
      ) : null}

      {/* PRN-01: a row here can now carry a monthly instalment, so the note that the figures are estimates
          sits in the subtitle, once, instead of on every row. */}
      {canSeeCrm ? (
        <Queue
          id="open-offer-demands"
          title="مطالب على عروض حقيقية بلا حجز"
          subtitle="مطلب على مخزون موجود، وما تحجزت فيه حتى زيتونة. افتح الملف واحجز الزيتونات للحريف. المبالغ تقديرية."
          count={openDemands.length}
          shown={Math.min(openDemands.length, PREVIEW)}
          empty="كل المطالب على العروض الحقيقية عندها زيتونات محجوزة."
          more={{ href: "/admin/leads?request_kind=offer", label: "كل مطالب العروض" }}
        >
          {openDemands.slice(0, PREVIEW).map((demand) => (
            <QueueRow
              key={demand.id}
              href={`/admin/leads/${demand.person_id}#request-${demand.id}`}
              title={demandNames.get(demand.person_id) ?? "ملف بلا اسم"}
            >
              {demand.is_duplicate ? <StatusPill tone="line">مكرّر</StatusPill> : null}
              <StatusPill tone="brand">
                {typeof demand.offer_trees === "number" ? (
                  <>
                    <span className="tabular-nums">{formatCount(demand.offer_trees)}</span> زيتونة
                  </>
                ) : (
                  "عدد ما تكتبش"
                )}
              </StatusPill>
              {demand.payment_mode ? (
                <StatusPill tone="line">
                  {demand.payment_mode === "installments" ? "بالتقسيط" : "بالحاضر"}
                  {demand.payment_mode === "installments" && typeof demand.monthly_millimes === "number" ? (
                    <>
                      {" · "}
                      <span className="tabular-nums">{formatMillimes(demand.monthly_millimes)}</span> شهرياً
                    </>
                  ) : null}
                </StatusPill>
              ) : null}
              <span className="text-xs text-muted">{demand.project_name ?? demand.project_code ?? ""}</span>
            </QueueRow>
          ))}
        </Queue>
      ) : null}

      {/* §25. Straight after the demand queue and before your own follow-ups, because a visit is the only
          thing on this screen with a place and a time attached: a call can slip an hour, a drive to Sfax
          cannot. Rows open the client's file, where the visit can be confirmed, moved or written up — the
          board at /admin/visits is the whole week, this is the next few days of it. */}
      {canSeeVisits && visitBoard ? (
        <Queue
          id="visits-coming"
          title="زيارات قادمة"
          subtitle={
            toConfirm > 0
              ? `${formatCount(toConfirm)} منها مازالت مطلب ما تأكّدش: أكّد الموعد ووين تتلاقاو قبل ما يتحرّك الحريف.`
              : "مواعيد مؤكّدة: شكون، وقتاش، وعلى أنهي عرض."
          }
          count={upcomingVisits.length}
          shown={Math.min(upcomingVisits.length, PREVIEW)}
          empty="ما فماش زيارة مبرمجة."
          more={{ href: "/admin/visits", label: "روزنامة الزيارات" }}
        >
          {upcomingVisits.slice(0, PREVIEW).map((visit) => (
            <QueueRow key={visit.id} href={`/admin/leads/${visit.person.id}`} title={visit.person.full_name}>
              <StatusPill tone="brand">
                <span dir="ltr" className="tabular-nums">
                  {formatDate(visit.visit_date)}
                </span>
                {" · "}
                {visit.slot_label}
              </StatusPill>
              <StatusPill tone={visitTone(visit.status)}>{visit.status_label}</StatusPill>
              <span className="text-xs text-muted">{visit.offer.name}</span>
            </QueueRow>
          ))}
        </Queue>
      ) : null}

      {/* §23. The first money this product records, and the only queue on this screen that is about a dinar
          somebody owes us. The count is every hold awaiting its عربون, not the page of them below it; the
          order — overdue first — is staff_reservations', so the row that is about to cost us the trees is the
          row on top. «قربت تنتهي» and «انتهت مدّتها» are the two tiles above: a deadline is a glance, unpaid
          money is a list of names. */}
      {canSeeReservations && holds ? (
        <Queue
          id="deposits-waiting"
          title="حجوزات تستنّى العربون"
          subtitle="الزيتونات محجوزة والعربون ما وصلش كامل. المتأخّرة في الأول."
          count={holds.counts.awaiting}
          shown={Math.min(awaitingDeposit.length, PREVIEW)}
          empty="كل الحجوزات المفتوحة عربونها تخلّص."
          more={{ href: "/admin/reservations?filter=awaiting", label: "كل الحجوزات" }}
        >
          {awaitingDeposit.slice(0, PREVIEW).map((hold) => (
            <QueueRow
              key={hold.id}
              href={`/admin/leads/${hold.personId}#reservations`}
              title={hold.personName ?? "ملف بلا اسم"}
            >
              <StatusPill tone="brand">
                <span className="tabular-nums">{formatCount(hold.treesHeld)}</span> زيتونة
              </StatusPill>
              {hold.depositLeftMillimes > 0 ? (
                <StatusPill tone="warning">
                  باقي <span className="tabular-nums">{formatMillimes(hold.depositLeftMillimes)}</span>
                </StatusPill>
              ) : null}
              {daysLeftLabel(hold.daysLeft, hold.expiresAt) ? (
                <StatusPill tone={hold.isOverdue ? "danger" : hold.isSoon ? "attention" : "line"}>
                  {daysLeftLabel(hold.daysLeft, hold.expiresAt)}
                </StatusPill>
              ) : null}
              <span className="text-xs text-muted">{hold.offerName ?? hold.offerCode ?? ""}</span>
            </QueueRow>
          ))}
        </Queue>
      ) : null}

      {canFollowUp ? (
        <Queue
          id="follow-ups"
          title="متابعاتي المستحقة"
          subtitle="مواعيد اللي حطّيتها أنت، أقدم واحد الأول."
          count={followUps.length}
          shown={Math.min(followUps.length, PREVIEW)}
          empty="ما عندك حتى متابعة مستحقة اليوم."
        >
          {followUps.slice(0, PREVIEW).map(({ person, due, late }) => (
            <QueueRow key={person.id} href={`/admin/leads/${person.id}`} title={person.full_name}>
              <StatusPill tone={late ? "danger" : "warning"}>
                {late ? "متأخرة" : "اليوم"} ·{" "}
                <span dir="ltr" className="tabular-nums">
                  {formatDate(due)}
                </span>
              </StatusPill>
              <span className="text-xs text-muted">{statusLabel.get(person.status_id) ?? ""}</span>
            </QueueRow>
          ))}
        </Queue>
      ) : null}

      {canSeeStock && offerRows.length > 0 ? (
        <Queue
          id="unnumbered-offers"
          title="عروض ما ترقّمتش زيتوناتها"
          subtitle={
            weekMoves > 0
              ? `عرض بلا زيتونات مرقّمة ما ينحجزش وما يتباعش. هذا الأسبوع تحرّكت ${formatCount(weekMoves)} زيتونة.`
              : "عرض بلا زيتونات مرقّمة ما ينحجزش وما يتباعش. افتح العرض وولّد زيتوناته."
          }
          count={unnumbered.length}
          shown={Math.min(unnumbered.length, PREVIEW)}
          empty="كل العروض زيتوناتها مرقّمة."
          more={{ href: "/admin/projects", label: "العروض" }}
        >
          {unnumbered.slice(0, PREVIEW).map(({ offer, stock }) => (
            <QueueRow key={offer.id} href={`/admin/projects/${offer.id}`} title={offer.name}>
              <StatusPill tone={stock?.status === "partial" ? "warning" : "attention"}>
                {stock?.status === "partial"
                  ? `مولّد ${formatCount(stock.trees_total)} من ${formatCount(offer.tree_count ?? 0)}`
                  : offer.tree_count
                    ? `${formatCount(offer.tree_count)} زيتونة مصرّح بيها`
                    : "عدد الزيتونات ما تكتبش"}
              </StatusPill>
              <StatusPill toneClass={projectStatusTone(offer.status)}>{projectStatusLabel(offer.status)}</StatusPill>
            </QueueRow>
          ))}
        </Queue>
      ) : null}

      {canSeeCrm ? <Numbers stats={(overall?.data ?? null) as DemandStats | null} offerDemands={offerDemands?.count ?? 0} /> : null}
    </div>
  );
}

/** One queue: what it is, how many are in it, and the first few rows of it. */
function Queue({
  id,
  title,
  subtitle,
  count,
  shown,
  empty,
  more,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  /** Everything in the queue. */
  count: number;
  /** How many of them are rendered below, so «و12 أخرى» is never a guess. */
  shown: number;
  empty: string;
  more?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <SectionHeader
        id={id}
        title={
          <span className="flex items-center gap-2">
            {title}
            <span className="pill pill-line tabular-nums">{formatCount(count)}</span>
          </span>
        }
        description={subtitle}
        actions={
          more && count > 0 ? (
            <Link href={more.href} className="btn btn-ghost btn-sm">
              {more.label} ←
            </Link>
          ) : null
        }
      />
      {count === 0 ? (
        <EmptyState size="sm">{empty}</EmptyState>
      ) : (
        <>
          <ul className="panel divide-y divide-line">{children}</ul>
          {count > shown ? <p className="text-sm text-muted tabular-nums">و{formatCount(count - shown)} أخرى.</p> : null}
        </>
      )}
    </section>
  );
}

/** One row of a queue: it opens the record it is about, never a list you then have to search. */
function QueueRow({ href, title, children }: { href: string; title: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-paper">
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{title}</span>
        <span className="flex flex-none items-center gap-2">{children}</span>
      </Link>
    </li>
  );
}

/**
 * The four figures worth a glance. Everything else about the demand lives on /admin/analytics, which the
 * page header already links — this section carried a second link to it.
 *
 * The first two tiles are counted on two different populations and used to say so nowhere: `requests`
 * counts every row including the duplicates, `trees_total` zeroes a duplicate's trees before summing
 * (0032_intake_pricing.sql:669). Each note now names its own population, so the pair can be read.
 */
function Numbers({ stats, offerDemands }: { stats: DemandStats | null; offerDemands: number }) {
  if (!stats) return null;

  return (
    <section aria-labelledby="numbers" className="space-y-3">
      <SectionHeader
        id="numbers"
        title="الأرقام"
        description="المجموع من يوم ما فتحنا. التفصيل والخريطة في «التحليلات»."
      />
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          size="sm"
          label="مطالب الاستثمار"
          value={stats.requests}
          note={`${formatCount(stats.duplicates)} منها مكرّرة · ${formatCount(offerDemands)} على عروض حقيقية`}
        />
        <StatTile size="sm" label="زيتونات مطلوبة" value={stats.trees_total} note="من المطالب غير المكرّرة، الحد الأدنى لكل اختيار" />
        <StatTile size="sm" label="أشخاص" value={stats.persons} note="رقم هاتف واحد لكل شخص" />
        <StatTile size="sm" label="اليوم" value={stats.today} note={`${formatCount(stats.last_7_days)} في آخر 7 أيام`} />
      </dl>
    </section>
  );
}
