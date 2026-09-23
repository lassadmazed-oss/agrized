import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { Rows, Screen } from "../../ui";

import { FileActions } from "./file-actions";
import { FileLists, RequestFacts, type Governorates } from "./request-card";

export const metadata: Metadata = { title: "الملف" };

/**
 * ملف عميل — three blocks: who he is, what you can do to him, and what he asked for.
 *
 * WHAT THIS REPLACED. Six stacked blocks, each with its own card and its own grey heading: the name, a card
 * holding one phone number, a full-width «بيع» button, a bordered paragraph explaining that a sale needs an
 * identity number, a card of up to 200 tree-code pills, one bordered box per demand with twenty answers
 * printed one per line, and ten note boxes. On a phone the answers on the newest demand — the only reason
 * anyone opens this screen before dialling — started below the second screenful; on a desktop each of those
 * lines carried four words across 1900px (owner, 2026-09-23: everything takes far too much space and is
 * stacked one thing on top of another).
 *
 * NOW: one identity line, then the buttons, then the demand as a grid. Roughly 180px of head on a 375px phone
 * instead of 400 — the head is a 28px title, a 44px identity line and the buttons, which wrap to two or three
 * rows there — so the answers begin inside the first screenful instead of below the second. On a desktop it is
 * one 28px line, one 44px line and one 44px row.
 *
 * ACTS AND LISTS ARE NEVER ON THE SAME LINE ON A PHONE. «بيع» takes trees out of stock; «شوف» shows a list.
 * The lists container is `basis-full` at base width, so the phone always breaks between them, and only from
 * `sm` do they share a row with the lists pushed to the far end. A wrap-dependent separation is no separation:
 * it held on a desktop and failed on the device this screen was designed for.
 *
 * NOTHING IS A HEADING ANY MORE. «الزيتونات متاعو (12)» was a heading over a card that was always open; it is
 * the label on the button that opens that card. The count is the part that was worth reading, and it survives
 * — as the TOTAL, from the count head of the query, not as the length of the capped page the popup holds. A
 * number in brackets on a closed button is read as stock.
 *
 * THE MISSING CIN IS NOT A CARD. It was a bordered paragraph; it is now the «بيع» button being absent and five
 * words next to «الهوية» — the button that fixes it, which FileActions already marks with a gold dot. /sell
 * guards the same rule again on arrival, so saying it shorter here loses nothing.
 *
 * THE TREES ARE READ FROM public.trees, never counted off a demand. What a client ASKED for lives on his
 * request; what he HOLDS is inventory, and only the inventory table knows whether an allocation actually
 * happened. Printing the request's figure as though it were stock is how a system ends up selling the same
 * tree twice.
 *
 * THE STAGES ARE READ UNFILTERED, then split: the whole list resolves this person's own `status_id` — a file
 * parked on a stage the owner has since deactivated still says where it stands — and only the active ones (plus
 * his own) are offered in the «المرحلة» select, so opening the popup cannot quietly move him off it.
 *
 * WHOSE FILE IT IS, on the identity line. A manager opening this screen to decide what happens to a lead has
 * to see which commercial owns it; «بلا مسؤول» is itself the thing he is looking for. Reassignment is an admin
 * act with its own history and stays in the back office — this screen states the fact, it does not trade it.
 */
export default async function FilePage({ params }: PageProps<"/admin/v2/files/[personId]">) {
  await requireStaff();
  const { personId } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("persons")
    .select(
      "id, full_name, phone_e164, whatsapp_e164, email, status_id, cin, cin_issued_on, birth_date, birth_place, address_line, owner:profiles!persons_assigned_to_fkey(full_name)",
    )
    .eq("id", personId)
    .maybeSingle();

  if (!person) notFound();

  // One round trip for all five reads. The governorate names are a 24-row table that cannot change inside a
  // request, so paying a sequential await for them was a whole round trip added to every open of a file.
  const [
    { data: statuses },
    { data: requests, count: requestsCount },
    { data: trees, count: treesCount },
    { data: notes, count: notesCount },
    { data: govRows },
  ] = await Promise.all([
    supabase.from("lead_statuses").select("id, label_ar, sort_order, is_active").order("sort_order"),
    supabase
      .from("interest_requests")
      .select(
        "id, request_no, created_at, request_kind, project_name, offer_trees, tree_count_label_ar, desired_area_label_ar, spacing_label_ar, area_per_tree_m2, total_area_m2, payment_mode, total_price_millimes, down_payment_percent, down_payment_amount_millimes, monthly_millimes, duration_label_ar, duration_months, budget_label_ar, priority_label_ar, goal_label_ar, down_payment_label_ar, installment_label_ar, wants_visit, wants_bank_financing, contact_channel, contact_time_label_ar, residence_governorate_id, invest_governorate_ids, invest_anywhere, scenario_labels, price_per_tree_millimes, project_code, production_statuses, source",
        { count: "exact" },
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("trees")
      .select("id, code", { count: "exact" })
      .eq("held_by", personId)
      .order("code")
      .limit(200),
    supabase
      .from("person_notes")
      .select("id, body, created_at", { count: "exact" })
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("governorates").select("id, name_ar"),
  ]);

  const governorates: Governorates = Object.fromEntries(
    (govRows ?? []).map((row) => [String(row.id), row.name_ar] as const),
  );

  const allStatuses = statuses ?? [];
  const statusLabel = allStatuses.find((row) => row.id === person.status_id)?.label_ar ?? null;
  const stageChoices = allStatuses.filter((row) => row.is_active || row.id === person.status_id);

  // Newest first from the query, so the head of the list is the demand the file is about. No cast: the select
  // string above and RequestDetails have to agree, or this stops compiling.
  const history = requests ?? [];
  const treeList = trees ?? [];
  const noteList = notes ?? [];
  // The counts are what the table holds, not what these capped queries returned.
  const treesTotal = treesCount ?? treeList.length;
  const notesTotal = notesCount ?? noteList.length;
  const olderTotal = Math.max((requestsCount ?? history.length) - 1, 0);
  // The client can hand over a WhatsApp number different from the one he is called on — the intake stores
  // both and every screen so far assumed they were the same.
  const whatsapp = person.whatsapp_e164 ?? person.phone_e164;
  const digits = whatsapp ? whatsapp.replace(/[^0-9]/g, "") : "";

  return (
    <Screen
      title={person.full_name ?? "بلا اسم"}
      action={
        <Link href="/admin/v2/files" className="text-xs text-muted hover:text-forest">
          رجوع
        </Link>
      }
    >
      {/* Who you are about to call, on one line: the number, where he stands, whose file it is, and the number
          the contract needs. The rest of the identity — date of birth, address — is only ever typed, so it
          lives in the form that types it. */}
      <div className="card flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
        {person.phone_e164 ? (
          <a
            dir="ltr"
            href={`tel:${person.phone_e164}`}
            className="text-sm font-semibold tabular-nums text-forest hover:underline"
          >
            {person.phone_e164}
          </a>
        ) : (
          <span className="text-sm text-muted">بلا تلفون</span>
        )}

        <span className="pill pill-line">{statusLabel ?? "مرحلة غير معروفة"}</span>

        <span className="text-[0.6875rem] text-muted">
          {person.owner?.full_name ? `مسؤول: ${person.owner.full_name}` : "بلا مسؤول"}
        </span>

        {person.cin ? (
          <span dir="ltr" className="text-[0.6875rem] tabular-nums text-muted">
            {person.cin}
          </span>
        ) : null}

        {/* The e-mail was collected by both intake forms from the first day and printed on no screen in
            either admin — a client who wrote one could only be reached by phone. */}
        {person.email ? (
          <a dir="ltr" href={`mailto:${person.email}`} className="text-[0.6875rem] text-muted hover:underline">
            {person.email}
          </a>
        ) : null}

        {/* And when WhatsApp is a DIFFERENT number, say so: the button below goes to that one, and a
            commercial who dials the wrong one loses the lead to silence. */}
        {person.whatsapp_e164 && person.whatsapp_e164 !== person.phone_e164 ? (
          <span dir="ltr" className="text-[0.6875rem] tabular-nums text-muted">
            WhatsApp {person.whatsapp_e164}
          </span>
        ) : null}

        {digits ? (
          <a
            href={`https://wa.me/${digits}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-sm ms-auto"
          >
            واتساب
          </a>
        ) : null}
      </div>

      {/* The acts first, then the lists — on their own line on a phone, pushed to the far end from `sm`, so
          «بيع» is never mistaken for «شوف». A file you cannot advance from the screen you are reading is a
          report. */}
      <div className="flex flex-wrap items-center gap-2">
        {person.cin ? (
          <Link href={`/admin/v2/files/${person.id}/sell`} className="btn btn-primary btn-sm">
            بيع زيتونات
          </Link>
        ) : null}

        <FileActions
          personId={person.id}
          statuses={stageChoices}
          currentStatusId={person.status_id}
          identity={{
            cin: person.cin,
            cin_issued_on: person.cin_issued_on,
            birth_date: person.birth_date,
            birth_place: person.birth_place,
            address_line: person.address_line,
          }}
        />

        {person.cin ? null : (
          <span className="text-[0.6875rem] text-muted">البيع يلزمو رقم بطاقة التعريف</span>
        )}

        <div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto sm:ms-auto">
          <FileLists
            trees={treeList}
            treesTotal={treesTotal}
            notes={noteList}
            notesTotal={notesTotal}
            older={history.slice(1)}
            olderTotal={olderTotal}
            governorates={governorates}
          />
        </div>
      </div>

      {history.length > 0 ? (
        <RequestFacts request={history[0]} governorates={governorates} />
      ) : (
        <Rows empty="ما عندو حتّى طلب." />
      )}
    </Screen>
  );
}
