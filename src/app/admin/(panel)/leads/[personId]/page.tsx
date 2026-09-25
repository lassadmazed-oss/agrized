import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { ADMIN_LABELS } from "@/components/admin/nav-model";
import { RequestStageChip } from "@/components/admin/request-stage";
import { formatPercent } from "@/components/admin/tree-pricing-inputs";
import { DataList, DataRow, EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { ADMIN_ROLES, CRM_READ_ROLES, hasRole, requireStaff, type StaffRole } from "@/lib/auth";
import { getPublicConfig, settingText } from "@/lib/config";
import { readRequestStages } from "@/lib/journey";
import {
  ATTEMPT_CHANNEL_LABELS,
  CHANNEL_LABELS,
  OUTCOME_LABELS,
  PLANTATION_LABELS,
  PRODUCTION_LABELS,
  STAGE_TONES,
} from "@/lib/crm";
import { formatArea, formatCount, formatDateTime, formatMillimes } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { offerStocks, type OfferStock } from "@/lib/backoffice/offers/stock";
import { PAYMENT_MODE_LABELS, REQUEST_KIND_LABELS } from "@/lib/backoffice/leads/filters";
import { addContactAttempt, addNote, assignPerson, updateStatus } from "@/lib/backoffice/leads/actions";
import { ContractCard } from "./contract-card";
import { HeldTreesSection, type HeldOffer, type HeldTree, type StateLabels } from "./held-trees";
import { MatchingOffers } from "./matching-offers";
import { ReservationCard } from "./reservation-card";
import { ReserveTreesCard, type ReserveChoice } from "./reserve-trees-card";
import { VisitCard } from "./visit-card";

export const metadata: Metadata = { title: "ملف حريف" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// THE THREE TREE ACTS OF A CLIENT FILE, and the database list that decides each one (0054 §1 and §7, pinned by
// tests/033 T7e and tests/034 §9). Each is mirrored here so a control the reader may never press is never drawn,
// and checked again inside the Server Action, which the database checks a third time.
//
//   reserve  app.can_see_person  — Admin, Finance and Legal on any file; a commercial on their own file only.
//                                  NOT the agricultural manager: they keep stock and read no client file.
//   sell     + app.can_contract_trees — Legal, Finance, Admin. The contract moment (§51).
//   release  app.can_manage_trees AND app.can_see_person(holder), because a held tree always has a holder: the
//            two lists meet on Finance and Admin only. The agricultural manager releases from the offer's
//            الزيتونات tab — where the trees are stock — not from a client's file.
const FILE_READ_ANY_ROLES = ["finance", "legal", "admin", "super_admin"] as const satisfies readonly StaffRole[];
const TREE_CONTRACT_ROLES = ["legal", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];
const TREE_RELEASE_ROLES = ["finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

/** A file holding more than this reads its full inventory on the offer's own screen, not here. */
const HELD_LIMIT = 300;

type TimelineEntry = { at: string; kind: string; title: string; detail?: string | null; by?: string | null };

export default async function LeadDetailPage({ params, searchParams }: PageProps<"/admin/leads/[personId]">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const { personId } = await params;
  if (!UUID.test(personId)) notFound();

  const isAdmin = hasRole(session, ADMIN_ROLES);
  const supabase = await createClient();
  const config = await getPublicConfig();

  const { data: person } = await supabase
    .from("persons")
    .select(
      "id, full_name, phone_e164, whatsapp_e164, email, governorate_id, delegation_id, created_at, assigned_to, status:lead_statuses(id, stage, label_ar), owner:profiles!persons_assigned_to_fkey(full_name)",
    )
    .eq("id", personId)
    .maybeSingle();
  if (!person) notFound();

  const canEdit = isAdmin || (hasRole(session, ["commercial"]) && person.assigned_to === session.id);
  // Not the same test as canEdit: Finance and Legal do not log calls or move a status, but the database lets
  // them reserve and contract on any file (app.can_see_person), so the reservation card obeys its own rule.
  const canReserve = hasRole(session, FILE_READ_ANY_ROLES) || (hasRole(session, ["commercial"]) && person.assigned_to === session.id);
  const canContract = hasRole(session, TREE_CONTRACT_ROLES);
  const canRelease = hasRole(session, TREE_RELEASE_ROLES);

  // THE THREE STAGE-2 MODULES ON THIS FILE — report v3 §45's «one screen while on the phone». Each section is
  // mounted only while its own module is open to this reader, and every one of them is off today, so a file
  // opened right now is byte for byte the file that was opened yesterday. That is the point: switching a module
  // on is the owner's act, and until he takes it this screen may not grow a panel announcing what it cannot do.
  //
  // «open to this reader» is moduleAccess, not the raw flag: «داخلي فقط» is open here (everyone reading a Back
  // Office screen is signed-in staff) and «معطّل» is closed to everyone, staff included. That is the opposite
  // of the rule for the SIDEBAR, where a switched-off row still opens — a module's own workspace is where it is
  // prepared, but a client's file belongs to the day's work and is not the place to prepare anything.
  //
  // The role gate is drawn a second time on top of it, and it is the one the database draws: `canReserve` is
  // app.can_see_person, which is the same test staff_create_reservation and staff_book_visit run in SQL.
  const [matchingAccess, visitsAccess, reservationsAccess, contractsAccess] = await Promise.all([
    moduleAccess(config, "matching"),
    moduleAccess(config, "visits"),
    moduleAccess(config, "reservations"),
    moduleAccess(config, "contracts"),
  ]);
  const showMatching = matchingAccess !== "closed";
  const showVisits = visitsAccess !== "closed" && canReserve;
  // When the reservation module is on, the aside's «احجز زيتونات» gives way to it: both hold trees through the
  // same engine, but only this one carries the deposit, the deadline and the conditions §23 and §24 require, and
  // two «احجز» forms on one screen is exactly the confusion the owner named. Switching the module back to
  // «معطّل» restores the old card — which is also the way out if it is ever switched on before its tables are
  // applied, the one state in which the section can only say so and name supabase/pending/bb_20_reservations.sql.
  const showReservations = reservationsAccess !== "closed" && canReserve;
  /** The tree-only hold in the aside, and the two reads that feed it: both stop the day the module is on. */
  const showReserveTreesCard = canReserve && !showReservations;
  // STAGE 3. One card, not two: «العقد والأقساط» carries the contract AND its schedule, because a schedule
  // without its contract is a list of amounts nobody agreed to. It is gated on `contracts` alone — the card
  // reads the `installments` state itself, from the same RPC that would refuse the write, so this screen and
  // the refusal cannot disagree about which switch is off.
  //
  // The card survives its own tables being absent: before the migration is applied it says so in one sentence
  // and names the draft. That is what makes it safe to mount today, with both flags still «معطّل» — nobody
  // sees it until the owner presses the switch, and if he presses it early he gets a sentence, not a 500.
  const showContracts = contractsAccess !== "closed" && canReserve;

  const [requests, attempts, notes, history, assignments, statuses, commercials, whatsappTemplate] = await Promise.all([
    supabase.from("interest_requests").select("*").eq("person_id", personId).order("created_at", { ascending: false }),
    supabase
      .from("contact_attempts")
      .select("id, channel, outcome, note, next_follow_up_at, created_at, author:profiles!contact_attempts_created_by_fkey(full_name)")
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase
      .from("person_notes")
      .select("id, body, created_at, author:profiles!person_notes_created_by_fkey(full_name)")
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase
      .from("person_status_history")
      .select(
        "id, created_at, from:lead_statuses!person_status_history_from_status_id_fkey(label_ar), to:lead_statuses!person_status_history_to_status_id_fkey(label_ar), author:profiles!person_status_history_changed_by_fkey(full_name)",
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase
      .from("person_assignments")
      .select(
        "id, reason, created_at, from:profiles!person_assignments_from_user_fkey(full_name), to:profiles!person_assignments_to_user_fkey(full_name), author:profiles!person_assignments_created_by_fkey(full_name)",
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase.from("lead_statuses").select("id, label_ar").eq("is_active", true).order("sort_order"),
    isAdmin
      ? supabase
          .from("user_roles")
          .select("user_id, profile:profiles!user_roles_user_id_fkey(full_name, is_active)")
          .eq("role", "commercial")
      : Promise.resolve({ data: [] as { user_id: string; profile: { full_name: string; is_active: boolean } | null }[] }),
    supabase.from("message_templates").select("body_ar").eq("key", "lead.whatsapp_first_contact").eq("is_active", true).maybeSingle(),
  ]);

  const governorateName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const delegationName = new Map(config.delegations.map((d) => [d.id, d.name_ar]));
  const typeName = new Map(config.projectTypes.map((t) => [t.id, t.label_ar]));
  const latestRequest = requests.data?.[0];

  // WHERE EACH DEMAND STANDS — bb_75, one call for the whole list.
  //
  // The file's own status band above says where the CLIENT is, which is the highest of their demands. On a
  // client with two, that single answer is wrong for the quieter one: a demand still at «مطلب جديد» sits
  // under a header reading «العربون مدفوع» because the OTHER demand got there. These chips are per demand,
  // so each card says where that card is.
  //
  // It degrades to nothing, on purpose: bb_70 and bb_75 are drafts, so until they are applied the read comes
  // back `not_applied`, the map is empty and every card renders exactly as it did before.
  const requestStages = new Map(
    (
      await readRequestStages(
        supabase,
        (requests.data ?? []).map((request) => request.id),
      ).then((result) => (result.ok ? result.value : []))
    ).map((row) => [row.request_id, row.stage]),
  );

  // 0049: the two intakes, counted apart. This page reads interest_requests directly, so it sees request_kind.
  const offerDemands = (requests.data ?? []).filter((request) => request.request_kind === "offer" && request.project_id);
  const offerRequests = (requests.data ?? []).filter((request) => request.request_kind === "offer").length;
  const calculatorRequests = (requests.data ?? []).length - offerRequests;

  // ---------------------------------------------------------------------------
  // The trees this person holds, and the ones they may still be given
  // ---------------------------------------------------------------------------
  //
  // Reserving is the act the Back Office never had: public.staff_allocate_trees was written, tested and wrapped
  // as a Server Action, and no screen called it, so 600 numbered trees sat at `available` and «we just give each
  // tree a number or an id and associate it with the client» was something the product could not do.
  //
  // Nothing below counts a tree in TypeScript: the availability and the smallest basket are read through
  // staff_offer_stock (../../projects/offer-stock, the one sanctioned reader), and the rows are the rows.
  const [heldRead, { data: settingRows }, stocks] = await Promise.all([
    supabase
      .from("trees")
      .select("id, code, state, allocated_at, project_id, request_id")
      .eq("held_by", personId)
      .order("project_id")
      .order("seq")
      .limit(HELD_LIMIT),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
    // Only for a reader who may actually reserve: one RPC per offer this person asked about, and none otherwise.
    // None either once the reservation module is on — the card these feed is gone, and its replacement reads
    // the same stock itself, beside the deposit and the deadline it also needs.
    showReserveTreesCard
      ? offerStocks(supabase, [...new Set(offerDemands.map((request) => request.project_id as string))])
      : Promise.resolve(new Map<string, OfferStock>()),
  ]);

  const reasonMinValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonMinValue === "number" && Number.isFinite(reasonMinValue) ? reasonMinValue : 5;

  const heldRows = heldRead.data ?? [];
  const heldProjectIds = [...new Set(heldRows.map((tree) => tree.project_id))];
  const { data: heldProjects } = heldProjectIds.length
    ? await supabase.from("projects").select("id, name, code").in("id", heldProjectIds)
    : { data: [] as { id: string; name: string; code: string }[] };
  const heldProject = new Map((heldProjects ?? []).map((project) => [project.id, project]));

  // Grouped by offer, in the order the read returned (project, then seq), so the codes read as the block they
  // were handed out as. An available tree holds nobody, so it can never appear here (trees_holder_check).
  const heldByOffer = new Map<string, HeldTree[]>();
  for (const tree of heldRows) {
    if (tree.state === "available") continue;
    const trees = heldByOffer.get(tree.project_id) ?? [];
    trees.push({ id: tree.id, code: tree.code, state: tree.state, allocatedAt: tree.allocated_at });
    heldByOffer.set(tree.project_id, trees);
  }
  const heldOffers: HeldOffer[] = [...heldByOffer].map(([projectId, trees]) => ({
    projectId,
    offerName: heldProject.get(projectId)?.name ?? "عرض",
    offerCode: heldProject.get(projectId)?.code ?? null,
    trees,
  }));

  // How many trees each demand already produced, so a demand that is served says so and nobody reserves twice.
  const heldPerRequest = new Map<string, number>();
  for (const tree of heldRows) {
    if (!tree.request_id) continue;
    heldPerRequest.set(tree.request_id, (heldPerRequest.get(tree.request_id) ?? 0) + 1);
  }

  const stockLabels: StateLabels = {
    reserved: settingText(config, "offers.stock_reserved_label", "المحجوزة") || "المحجوزة",
    sold: settingText(config, "offers.stock_sold_label", "المباعة") || "المباعة",
  };

  // One demand, one line: the offer it named, what it asked for, and what that offer holds right now.
  const reserveChoices: ReserveChoice[] = showReserveTreesCard
    ? offerDemands.map((request) => {
        const stock = stocks.get(request.project_id as string);
        return {
          requestId: request.id,
          requestNo: request.request_no,
          projectId: request.project_id as string,
          offerName: request.project_name ?? "عرض بلا اسم",
          offerCode: request.project_code,
          askedTrees: typeof request.offer_trees === "number" ? request.offer_trees : null,
          available: stock?.trees_available ?? 0,
          minTrees: stock?.min_trees ?? 1,
          numbered: stock ? stock.status !== "not_generated" : false,
          // The plan the client asked for, built here because the labels and the money live on this side.
          // Null until the offer intake records it (supabase/pending/bb_10_offer_payment_plan.sql); the card
          // then says nothing rather than claiming a cash sale nobody asked for.
          planLabel: request.payment_mode
            ? [
                PAYMENT_MODE_LABELS[request.payment_mode] ?? request.payment_mode,
                typeof request.monthly_millimes === "number" ? `${amount(request.monthly_millimes)} شهرياً (مقدّر)` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
        };
      })
    : [];
  // The demand the reader came from, when they followed «احجز زيتونات لهذا المطلب» on one of the cards below.
  const reserveParam = (await searchParams).reserve;
  const defaultRequestId = typeof reserveParam === "string" && UUID.test(reserveParam) ? reserveParam : null;

  const whatsappNumber = (person.whatsapp_e164 ?? person.phone_e164).replace(/\D/g, "");
  const whatsappText = whatsappTemplate.data?.body_ar
    ?.replace("{name}", person.full_name.split(" ")[0] ?? person.full_name)
    .replace("{agent}", session.fullName || "فريق AgriZed")
    .replace("{request_no}", latestRequest?.request_no ?? "");
  const whatsappHref = `https://wa.me/${whatsappNumber}${whatsappText ? `?text=${encodeURIComponent(whatsappText)}` : ""}`;

  const timeline: TimelineEntry[] = [
    ...(attempts.data ?? []).map((a) => ({
      at: a.created_at,
      kind: "محاولة تواصل",
      title: `${ATTEMPT_CHANNEL_LABELS[a.channel] ?? a.channel} · ${OUTCOME_LABELS[a.outcome]}`,
      detail: [a.note, a.next_follow_up_at ? `متابعة: ${formatDateTime(a.next_follow_up_at)}` : null].filter(Boolean).join(" — "),
      by: a.author?.full_name,
    })),
    ...(notes.data ?? []).map((n) => ({ at: n.created_at, kind: "ملاحظة", title: n.body, by: n.author?.full_name })),
    ...(history.data ?? []).map((h) => ({
      at: h.created_at,
      kind: "الحالة",
      title: h.from ? `${h.from.label_ar} ← ${h.to?.label_ar}` : `بداية الملف: ${h.to?.label_ar}`,
      by: h.author?.full_name ?? "النظام",
    })),
    ...(assignments.data ?? []).map((a) => ({
      at: a.created_at,
      kind: "الإسناد",
      title: `${a.from?.full_name ?? "بدون مسؤول"} ← ${a.to?.full_name ?? "بدون مسؤول"}`,
      detail: a.reason === "auto:round_robin" ? "إسناد آلي بالتناوب" : a.reason,
      by: a.author?.full_name ?? "النظام",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <Link href="/admin/leads" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
        → مطالب الاستثمار
      </Link>

      <header className="card flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="section-title">{person.full_name}</h1>
            {person.status ? (
              <StatusPill toneClass={STAGE_TONES[person.status.stage]}>{person.status.label_ar}</StatusPill>
            ) : null}
          </div>
          <p className="text-muted">
            {[delegationName.get(person.delegation_id ?? -1), governorateName.get(person.governorate_id ?? -1)].filter(Boolean).join("، ")}
            {person.email ? (
              <>
                {" · "}
                <span dir="ltr">{person.email}</span>
              </>
            ) : null}
          </p>
          <p className="text-sm text-muted">
            المسؤول: <span className="font-semibold text-ink">{person.owner?.full_name ?? "بدون مسؤول"}</span> · ملف منذ{" "}
            <span className="tabular-nums">{formatDateTime(person.created_at)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${person.phone_e164}`} className="btn btn-primary" dir="ltr">
            {formatPhone(person.phone_e164)}
          </a>
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            WhatsApp
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {/* What this person holds comes before what they asked for: a file answers «شنوّة يملك» first. */}
          {heldOffers.length > 0 ? (
            <HeldTreesSection
              offers={heldOffers}
              labels={stockLabels}
              canContract={canContract}
              canRelease={canRelease}
              reasonMin={reasonMin}
              cappedAt={heldRows.length >= HELD_LIMIT ? HELD_LIMIT : null}
            />
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/* The same word the nav, the breadcrumb and the list's own <h1> use — it said «المطالب» here
                  and «مطالب الاستثمار» everywhere else. 2026-09-19. */}
              <h2 className="text-lg font-semibold">
                {ADMIN_LABELS["/admin/leads"]} ({requests.data?.length ?? 0})
              </h2>
              {offerRequests > 0 || calculatorRequests > 0 ? (
                <p className="text-sm text-muted">
                  <span className="tabular-nums">{formatCount(offerRequests)}</span> على عروض حقيقية ·{" "}
                  <span className="tabular-nums">{formatCount(calculatorRequests)}</span> محاكاة تقديرية
                </p>
              ) : null}
            </div>
            {(requests.data ?? []).map((request) => {
              const legacy = legacyAnswers(request);
              // 0049: an offer demand names real stock. A calculator demand is a simulation and wears the
              // estimate surface, so the two can never be read as the same thing.
              const isOffer = request.request_kind === "offer";
              // How this person wants to pay. Stored on every demand (interest_requests), shown beside the offer
              // for an offer demand and in the general grid for a simulation — never twice.
              const hasPlan =
                request.payment_mode !== null ||
                typeof request.monthly_millimes === "number" ||
                typeof request.total_financed_millimes === "number" ||
                request.duration_label_ar !== null;
              return (
              <article
                key={request.id}
                id={`request-${request.id}`}
                className={`card p-5 scroll-mt-24 target:border-forest ${isOffer ? "" : "card-estimate"}`.trim()}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={isOffer ? "brand" : "line"}>{REQUEST_KIND_LABELS[isOffer ? "offer" : "calculator"]}</StatusPill>
                    <span dir="ltr" className="font-semibold text-forest tabular-nums">
                      {request.request_no}
                    </span>
                    {/* وين وصل هذا المطلب — this demand's own stage, not the client's. */}
                    <RequestStageChip stage={requestStages.get(request.id) ?? null} />
                  </p>
                  <p className="flex items-center gap-2 text-sm text-muted tabular-nums">
                    {request.is_duplicate ? <span className="rounded bg-gold-soft px-1.5 py-0.5 text-xs text-forest-700">مكرّر</span> : null}
                    {formatDateTime(request.created_at)}
                  </p>
                </div>

                {isOffer ? (
                  <div className="mt-4 rounded-xl border border-leaf/40 bg-leaf-soft/50 p-4">
                    <p className="text-xs text-muted">العرض المطلوب</p>
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-2">
                      {request.project_id ? (
                        <Link
                          href={`/admin/projects/${request.project_id}`}
                          className="font-semibold text-forest underline-offset-4 hover:underline"
                        >
                          {request.project_name ?? "عرض بلا اسم"}
                        </Link>
                      ) : (
                        <span className="font-semibold text-forest">{request.project_name ?? "عرض بلا اسم"}</span>
                      )}
                      {request.project_code ? (
                        <span dir="ltr" className="text-xs text-muted">
                          {request.project_code}
                        </span>
                      ) : null}
                    </p>
                    <DataList variant="grid" columns={4} className="mt-3 text-sm">
                      {typeof request.offer_trees === "number" ? (
                        <DataRow layout="stacked" label="الزيتونات المطلوبة">
                          {formatCount(request.offer_trees)}
                        </DataRow>
                      ) : null}
                      {typeof request.offer_price_per_tree_millimes === "number" ? (
                        <DataRow layout="stacked" label="سعر الزيتونة">
                          {amount(request.offer_price_per_tree_millimes)}
                        </DataRow>
                      ) : null}
                      {typeof request.offer_total_price_millimes === "number" ? (
                        <DataRow layout="stacked" label="السعر الجملي">
                          {amount(request.offer_total_price_millimes)}
                        </DataRow>
                      ) : null}
                      {typeof request.offer_annual_fee_total_millimes === "number" ? (
                        <DataRow layout="stacked" label="معاليم الصيانة والتقليم في العام">
                          {amount(request.offer_annual_fee_total_millimes)}
                          {typeof request.offer_annual_fee_per_tree_millimes === "number" ? (
                            <span className="mt-0.5 block text-xs font-normal text-muted">
                              {amount(request.offer_annual_fee_per_tree_millimes)} للزيتونة
                            </span>
                          ) : null}
                        </DataRow>
                      ) : null}
                    </DataList>
                    {/* The plan, beside the offer that priced it. It used to sit in the general grid below, with
                        the duration row deliberately blanked for an offer demand — so the screen could show a
                        monthly amount and refuse to say over how many months. One block, all five terms. */}
                    <div className="mt-3 border-t border-leaf/40 pt-3">
                      <p className="text-xs text-muted">طريقة الخلاص المطلوبة</p>
                      {hasPlan ? (
                        <DataList variant="grid" columns={4} className="mt-2 text-sm">
                          {request.payment_mode ? (
                            <DataRow layout="stacked" numeric={false} label="طريقة الدفع">
                              {PAYMENT_MODE_LABELS[request.payment_mode] ?? request.payment_mode}
                            </DataRow>
                          ) : null}
                          {request.down_payment_percent !== null && request.down_payment_percent !== undefined ? (
                            <DataRow layout="stacked" label="نسبة التسبقة">
                              {formatPercent(request.down_payment_percent)}
                              {typeof request.down_payment_amount_millimes === "number" ? (
                                <span className="mt-0.5 block text-xs font-normal text-muted">
                                  {amount(request.down_payment_amount_millimes)}
                                </span>
                              ) : null}
                            </DataRow>
                          ) : null}
                          {request.duration_label_ar || typeof request.duration_months === "number" ? (
                            <DataRow layout="stacked" label="مدة الدفع">
                              {request.duration_label_ar ?? `${formatCount(request.duration_months ?? 0)} شهراً`}
                              {/* The months only when the label does not already say them, so «7 سنوات» carries
                                  «84 شهراً» and «84 شهراً» is never printed twice. */}
                              {request.duration_label_ar && typeof request.duration_months === "number" ? (
                                <span className="mt-0.5 block text-xs font-normal text-muted">
                                  {formatCount(request.duration_months)} شهراً
                                </span>
                              ) : null}
                            </DataRow>
                          ) : null}
                          {typeof request.total_financed_millimes === "number" ? (
                            <DataRow layout="stacked" label="السعر بالتقسيط">
                              {amount(request.total_financed_millimes)}
                            </DataRow>
                          ) : null}
                          {typeof request.monthly_millimes === "number" ? (
                            <DataRow layout="stacked" label="القسط الشهري المقدّر">
                              {amount(request.monthly_millimes)} شهرياً
                            </DataRow>
                          ) : null}
                        </DataList>
                      ) : (
                        /* Every offer demand sent before the offer form asked the question reads like this. The
                           line says why it is empty and what to do about it, instead of showing nothing. */
                        <p className="mt-1 text-sm text-forest-700">
                          هذا المطلب ما فيهش طريقة خلاص: استمارة العرض ما كانتش تسأل عليها وقت إرساله. اسأل الحريف في المكالمة
                          وسجّل الجواب في ملاحظة.
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted">أسعار العرض وأقساطه كيما كانت وقت إرسال المطلب.</p>
                      {/* The demand and the act it leads to, one beside the other: no id is ever copied by hand. */}
                      {/* The demand and the act it leads to, one beside the other: no id is ever copied by hand.
                          `?reserve=` keeps its job either way — it pre-selects this demand in the aside's card,
                          and it is what «عروض تنفع لهذا الحريف» matches on, so following this link from a demand
                          sent last year ranks the offers against THAT demand and not against the newest one.
                          The reservation form picks its own demand from a list printing the same request
                          numbers; pre-selecting it there needs a prop reserve-form.tsx does not take yet. */}
                      {showReservations && request.project_id ? (
                        <Link
                          href={`/admin/leads/${person.id}?reserve=${request.id}#reservations`}
                          className="text-sm font-semibold text-forest underline-offset-4 hover:underline"
                        >
                          احجز زيتونات وسجّل العربون →
                        </Link>
                      ) : showReserveTreesCard && request.project_id ? (
                        <Link
                          href={`/admin/leads/${person.id}?reserve=${request.id}#reserve-trees`}
                          className="text-sm font-semibold text-forest underline-offset-4 hover:underline"
                        >
                          احجز زيتونات على هذا المطلب →
                        </Link>
                      ) : null}
                    </div>
                    {/* Reserved or sold: both are «this demand already produced trees», which is what stops a
                        second reservation on the same demand by mistake. The states themselves are above. */}
                    {heldPerRequest.get(request.id) ? (
                      <p className="mt-2 text-sm text-forest">
                        <span className="font-semibold tabular-nums">{formatCount(heldPerRequest.get(request.id) ?? 0)}</span> زيتونة
                        مربوطة بهذا المطلب. أرقامها فوق في «زيتونات هذا الحريف».
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-forest-700">محاكاة تقديرية من الموقع: أرقام تتبع اختيارات الحريف، موش عرض عقاري.</p>
                )}

                <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {isOffer ? null : (
                    <DataRow layout="stacked" numeric={false} label="عدد الزيتونات">
                      <span className="tabular-nums">{request.tree_count_label_ar ?? "بدون إجابة"}</span>
                    </DataRow>
                  )}
                  <DataRow layout="stacked" numeric={false} label={isOffer ? "ولاية العرض" : "مكان الاستثمار"}>
                    {request.invest_anywhere
                      ? "المكان غير مهم"
                      : request.invest_governorate_ids.map((id) => governorateName.get(id) ?? id).join("، ")}
                  </DataRow>
                  {/* An offer demand answers no project-type question: the offer itself is the answer. */}
                  {isOffer ? null : (
                    <DataRow layout="stacked" numeric={false} label="يحب يملك">
                      {request.scenario_labels.length > 0
                        ? request.scenario_labels.join("، ")
                        : request.project_type_unsure
                          ? "ما يهمّوش النوع، يطلب اقتراحاً"
                          : request.project_type_ids.map((id) => typeName.get(id) ?? "—").join("، ")}
                      {request.plantation_systems.length > 0 || request.production_statuses.length > 0 ? (
                        <span className="mt-0.5 block text-sm font-normal text-muted">
                          {[
                            request.plantation_systems.map((code) => PLANTATION_LABELS[code] ?? code).join("، "),
                            request.production_statuses.map((code) => PRODUCTION_LABELS[code] ?? code).join("، "),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </DataRow>
                  )}
                  {/* Tree pricing addendum: what the visitor chose and the estimate shown at that moment. */}
                  {request.spacing_label_ar ? <DataRow layout="stacked" numeric={false} label="فئة المساحة">{request.spacing_label_ar}</DataRow> : null}
                  {typeof request.area_per_tree_m2 === "number" ? (
                    <DataRow layout="stacked" numeric={false} label="المساحة لكل زيتونة">
                      <span className="tabular-nums">{formatArea(request.area_per_tree_m2)}</span>
                    </DataRow>
                  ) : null}
                  {typeof request.total_area_m2 === "number" ? (
                    <DataRow layout="stacked" numeric={false} label="المساحة الجملية">
                      <span className="tabular-nums">{formatArea(request.total_area_m2)}</span>
                    </DataRow>
                  ) : null}
                  {/* The six plan rows below belong to a simulation; an offer demand shows the same plan inside
                      its own green block above, where the offer that priced it is named. */}
                  {!isOffer && request.payment_mode ? <DataRow layout="stacked" numeric={false} label="طريقة الدفع">{PAYMENT_MODE_LABELS[request.payment_mode] ?? request.payment_mode}</DataRow> : null}
                  {/* An offer demand snapshots the same two amounts as the offer's own price, shown above. */}
                  {!isOffer && typeof request.price_per_tree_millimes === "number" ? (
                    <DataRow layout="stacked" numeric={false} label="سعر الزيتونة المقدّر">
                      <span className="tabular-nums">{amount(request.price_per_tree_millimes)}</span>
                    </DataRow>
                  ) : null}
                  {!isOffer && typeof request.total_price_millimes === "number" ? (
                    <DataRow layout="stacked" numeric={false} label="السعر الجملي المقدّر">
                      <span className="tabular-nums">{amount(request.total_price_millimes)}</span>
                    </DataRow>
                  ) : null}
                  {/* Plan Q-1, Q-2: the percentage of the cash total and the amount it gave when the demand was sent. */}
                  {!isOffer && request.down_payment_percent !== null && request.down_payment_percent !== undefined ? (
                    <DataRow layout="stacked" numeric={false} label="نسبة التسبقة">
                      <span className="tabular-nums">{formatPercent(request.down_payment_percent)}</span>
                    </DataRow>
                  ) : null}
                  {!isOffer && typeof request.down_payment_amount_millimes === "number" ? (
                    <DataRow layout="stacked" numeric={false} label="مبلغ التسبقة المقدّر">
                      <span className="tabular-nums">{amount(request.down_payment_amount_millimes)}</span>
                    </DataRow>
                  ) : null}
                  {isOffer ? null : (
                    <DataRow layout="stacked" numeric={false} label="مدة الدفع">
                      <span className="tabular-nums">{request.duration_label_ar ?? "بدون إجابة"}</span>
                    </DataRow>
                  )}
                  {!isOffer && typeof request.total_financed_millimes === "number" ? (
                    <DataRow layout="stacked" numeric={false} label="السعر بالتقسيط">
                      <span className="tabular-nums">{amount(request.total_financed_millimes)}</span>
                    </DataRow>
                  ) : null}
                  {!isOffer && typeof request.monthly_millimes === "number" ? (
                    <DataRow layout="stacked" numeric={false} label="القسط الشهري المقدّر">
                      <span className="tabular-nums">{amount(request.monthly_millimes)} شهرياً</span>
                    </DataRow>
                  ) : null}
                  {/* The offer page asks neither of the three: an empty row would read as an unanswered question. */}
                  {request.goal_label_ar ? (
                    <DataRow layout="stacked" numeric={false} label="الهدف">{request.goal_label_ar}</DataRow>
                  ) : null}
                  {isOffer && request.wants_visit === null ? null : (
                    <DataRow layout="stacked" numeric={false} label="يحب يزور الأرض">{answerLabel(request.wants_visit, "لا، مازال")}</DataRow>
                  )}
                  {isOffer && request.wants_bank_financing === null ? null : (
                    <DataRow layout="stacked" numeric={false} label="يحب حل تمويل بنكي">{answerLabel(request.wants_bank_financing, "لا")}</DataRow>
                  )}
                  <DataRow layout="stacked" numeric={false} label="التواصل">
                    {CHANNEL_LABELS[request.contact_channel]}
                    {request.contact_time_label_ar ? ` · ${request.contact_time_label_ar}` : " · أي وقت"}
                  </DataRow>
                  <DataRow layout="stacked" numeric={false} label="الإقامة المصرّح بها">
                    {[
                      request.residence_delegation_id ? delegationName.get(request.residence_delegation_id) : null,
                      governorateName.get(request.residence_governorate_id),
                    ]
                      .filter(Boolean)
                      .join("، ")}
                  </DataRow>
                  {request.full_name !== person.full_name ? <DataRow layout="stacked" numeric={false} label="الاسم في هذا المطلب">{request.full_name}</DataRow> : null}
                  <DataRow layout="stacked" numeric={false} label="المصدر">
                    <span dir="ltr">{(request.source as { utm_source?: string } | null)?.utm_source ?? "direct"}</span>
                  </DataRow>
                </dl>
                {legacy.length > 0 ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <h3 className="text-sm font-semibold text-muted">إجابات قديمة</h3>
                    <p className="text-xs text-muted">أسئلة ما عادتش في الاستمارة. القيم محفوظة كيما سجّلها الحريف.</p>
                    <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                      {legacy.map((answer) => (
                        <DataRow layout="stacked" numeric={false} key={answer.label} label={answer.label}>
                          <span className="tabular-nums">{answer.value}</span>
                        </DataRow>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </article>
              );
            })}
          </section>

          {/* STAGE 2 — the file stops being a record and becomes a call (report v3 §45).
              The order is the order of the conversation, and it is why these three sit here and not in the
              aside: above them is what this person holds and what they asked for, so the next question a
              commercial asks out loud is «شنوّة نعرضلك» (المطابقة), then «تحب تجي تشوفها؟» (الزيارة), then
              «نحجزلك ونسجّل العربون» (الحجز). Each one reads its own data and gates itself again in SQL; each
              one is absent entirely — not a panel saying it is absent — while its module is «معطّل». */}
          {showMatching ? <MatchingOffers personId={person.id} requestId={defaultRequestId} /> : null}
          {showVisits ? <VisitCard personId={person.id} canBook={canReserve} /> : null}
          {/* ?reserve=<id> is forwarded, so following «احجز زيتونات وسجّل العربون →» from a demand sent last year
              opens the form on THAT demand. `key` remounts the client form when the reader follows a different
              demand's link, exactly as the aside's ReserveTreesCard does at :687. */}
          {showReservations ? (
            <ReservationCard
              key={defaultRequestId ?? "latest"}
              personId={person.id}
              personName={person.full_name}
              requestId={defaultRequestId}
            />
          ) : null}
          {/* STAGE 3, and the next two things said in the same phone call: «نكتبو العقد», then «الأقساط».
              It sits after the hold because that is the order the conversation has — a contract is made FROM a
              reservation, and §14's «converted» is written nowhere else in the database. */}
          {showContracts ? <ContractCard personId={person.id} personName={person.full_name} /> : null}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">سجل الملف</h2>
            {timeline.length === 0 ? (
              <EmptyState>لا توجد عمليات بعد.</EmptyState>
            ) : (
              <ol className="panel space-y-0">
                {timeline.map((entry, index) => (
                  <li key={`${entry.kind}-${entry.at}-${index}`} className="border-b border-line px-5 py-4 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-gold">{entry.kind}</p>
                      <p className="text-xs text-muted tabular-nums">
                        {formatDateTime(entry.at)}
                        {entry.by ? ` · ${entry.by}` : ""}
                      </p>
                    </div>
                    <p className="mt-1 whitespace-pre-line break-words text-ink">{entry.title}</p>
                    {entry.detail ? <p className="mt-1 text-sm text-muted">{entry.detail}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {/* First in the aside because it is the act the file exists for: the demand becomes trees with numbers.
              It is the WHOLE act only while «العربون والحجز» is off: a hold with no deposit and no deadline is
              what §23 and §24 exist to replace, so when that module is on this card gives way to the section in
              the main column, which takes the same trees through the same engine and records the rest. */}
          {showReserveTreesCard ? (
            <ReserveTreesCard
              key={defaultRequestId ?? "latest"}
              personId={person.id}
              personName={person.full_name}
              choices={reserveChoices}
              reasonMin={reasonMin}
              defaultRequestId={defaultRequestId}
            />
          ) : null}

          {canEdit ? (
            <>
              <section className="card p-4">
                <SectionHeader as="h2" level={3} title="تسجيل محاولة تواصل" className="mb-3" />
                <ActionForm action={addContactAttempt.bind(null, person.id)} submitLabel="تسجيل">
                  <div className="grid grid-cols-2 gap-2">
                    <select name="channel" className="field" defaultValue="phone" aria-label="القناة">
                      {Object.entries(ATTEMPT_CHANNEL_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select name="outcome" className="field" defaultValue="" aria-label="النتيجة" required>
                      <option value="" disabled>
                        النتيجة
                      </option>
                      {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea name="note" rows={2} maxLength={5000} placeholder="ملاحظة (اختياري)" className="field min-h-20" />
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">موعد المتابعة (اختياري)</span>
                    <input type="datetime-local" name="next_follow_up_at" className="field" dir="ltr" />
                  </label>
                </ActionForm>
              </section>

              <section className="card p-4">
                <SectionHeader as="h2" level={3} title="الحالة" className="mb-3" />
                <ActionForm action={updateStatus.bind(null, person.id)} submitLabel="حفظ الحالة" buttonClassName="btn btn-secondary">
                  <select name="status_id" defaultValue={person.status?.id ?? ""} className="field" aria-label="حالة الملف">
                    {(statuses.data ?? []).map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.label_ar}
                      </option>
                    ))}
                  </select>
                </ActionForm>
              </section>

              <section className="card p-4">
                <SectionHeader as="h2" level={3} title="ملاحظة" className="mb-3" />
                <ActionForm action={addNote.bind(null, person.id)} submitLabel="إضافة" buttonClassName="btn btn-secondary">
                  <textarea name="body" rows={3} maxLength={5000} required className="field min-h-24" aria-label="الملاحظة" />
                </ActionForm>
              </section>
            </>
          ) : (
            <p className="card p-4 text-sm leading-6 text-muted">
              {canReserve
                ? showReservations
                  ? "المكالمات والحالة والملاحظات متاع الـCommercial المسؤول على الملفّ. إنت تقرا الملفّ، وتحجز الزيتونات وتسجّل العربون من «الحجز والعربون»."
                  : "المكالمات والحالة والملاحظات متاع الـCommercial المسؤول على الملفّ. إنت تقرا الملفّ، وتحجز الزيتونات من فوق."
                : "اطلاع فقط: لا يمكنك تعديل هذا الملف."}
            </p>
          )}

          {isAdmin ? (
            <section className="card p-4">
              <SectionHeader as="h2" level={3} title="تحويل الملف" className="mb-3" />
              <ActionForm action={assignPerson.bind(null, person.id)} submitLabel="تحويل" buttonClassName="btn btn-secondary">
                <select name="to_user" defaultValue={person.assigned_to ?? "none"} className="field" aria-label="الـCommercial">
                  <option value="none">بدون مسؤول</option>
                  {(commercials.data ?? [])
                    .filter((c) => c.profile?.is_active)
                    .map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.profile?.full_name || "—"}
                      </option>
                    ))}
                </select>
                <input name="reason" maxLength={500} placeholder="السبب (مثال: مغادرة الموظف)" className="field" />
              </ActionForm>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Amount snapshot of a demand; millimes are shown only when it has some. */
function amount(millimes: number): string {
  return formatMillimes(millimes, { withMillimes: millimes % 1000 !== 0 });
}

/** An optional yes/no answer of the public form (report v3 §14, §40). */
function answerLabel(value: boolean | null, no: string): string {
  return value === true ? "نعم" : value === false ? no : "بدون إجابة";
}

type LegacySnapshot = {
  desired_area_label_ar: string | null;
  priority_label_ar: string | null;
  down_payment_label_ar: string | null;
  installment_label_ar: string | null;
  budget_label_ar: string | null;
  down_payment_percent?: number | string | null;
};

/** Plan Q-7: answers to retired questions, kept as the demand recorded them (LEAD-02); only those it carries. */
function legacyAnswers(request: LegacySnapshot): { label: string; value: string }[] {
  const hasPercent = request.down_payment_percent !== null && request.down_payment_percent !== undefined;
  const answers: { label: string; value: string | null }[] = [
    { label: "المساحة المطلوبة", value: request.desired_area_label_ar },
    { label: "الأهم بالنسبة إليه", value: request.priority_label_ar },
    // A demand with a percentage never answered the amount list.
    { label: "التسبقة (مبلغ)", value: hasPercent ? null : request.down_payment_label_ar },
    { label: "القسط الشهري", value: request.installment_label_ar ? `${request.installment_label_ar} شهرياً` : null },
    { label: "الميزانية", value: request.budget_label_ar },
  ];
  return answers.flatMap((answer) => (answer.value ? [{ label: answer.label, value: answer.value }] : []));
}
