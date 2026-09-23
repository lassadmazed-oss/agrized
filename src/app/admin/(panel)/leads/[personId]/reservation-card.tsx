// «الحجز والعربون» on a client file — report v3 §23 and §24, and two of §45's six acts (Reserve, Record
// Deposit) landing where the client already is.
//
// HOW TO MOUNT IT. One line in src/app/admin/(panel)/leads/[personId]/page.tsx, in the MAIN column right under
// the held-trees section (around line 290) — not in the aside, which already carries five cards and stacks all
// of them at 375px:
//
//     <ReservationCard personId={personId} personName={person.full_name} requestId={defaultRequestId} />
//
// It reads its own data and computes its own role flags on purpose: an async Server Component that fetches
// what it needs is one line to mount and one line to remove, and the integrator does not have to thread six
// props through a page that four other agents are editing in the same batch. It renders Client Components for
// the forms, which is the normal direction across the boundary; the shared types live in a plain module
// (../../reservations/reservation-model) because a Server Component cannot import a VALUE from a "use client"
// module.
//
// WHY IT IS A SECTION AND NOT THREE CARDS. A reservation is a statement about the trees this person holds, so
// it belongs beside them; the deposit is a line and a button inside the reservation, not a card of its own.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not replace ReserveTreesCard's call to staff_allocate_trees — that
// path still exists and still works, and it records no money and no deadline. A hold taken there shows up here
// as trees held with no reservation behind them, which is the truth and reads as such. When the modules are
// wired together, the aside's ReserveTreesCard should give way to the form below; that is the integrator's
// call, not this file's.

import Link from "next/link";

import { CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { flagState, getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { offerStocks } from "@/lib/backoffice/offers/stock";
import { readPersonReservations } from "@/lib/backoffice/reservations/read";
import { ReservationBlock, type PaymentMethod } from "../../reservations/reservation-block";
import { ReserveForm, type ReserveChoice } from "../../reservations/reserve-form";

export async function ReservationCard({
  personId,
  personName,
  requestId = null,
}: {
  personId: string;
  personName: string;
  /** ?reserve=<id> — the demand the reader followed here, forwarded to ReserveForm so it opens on that one. */
  requestId?: string | null;
}) {
  const session = await requireStaff(CRM_READ_ROLES);
  const supabase = await createClient();

  const [config, data, demands, { data: settingRows }] = await Promise.all([
    getPublicConfig(),
    readPersonReservations(supabase, personId),
    // The demands this person sent on a REAL offer. A calculator simulation names no offer, so it can hold
    // nothing: §25's visit has the same problem and answers it the same way.
    supabase
      .from("interest_requests")
      .select("id, request_no, project_id, offer_trees, created_at, projects(name, code)")
      .eq("person_id", personId)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false }),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  // The module is not an access rule for the team (layout.tsx:47-54): the section is drawn either way, and the
  // controls are not, because the database refuses the write with module_closed.
  const state = flagState(config, "reservations");
  const moduleOpen = state !== "disabled";
  const canRecordMoney = hasRole(session, PRICE_ROLES);

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  const methods: PaymentMethod[] = optionsFor(config, "payment_method").map((item) => ({
    id: item.id,
    label: item.label_ar,
  }));

  // A failed read is said out loud rather than drawn as an empty section that looks like «this client has no
  // reservations»: before the migration is applied there is no table to read at all.
  if (data === null) {
    return (
      <section id="reservations" className="space-y-3 scroll-mt-24">
        <h2 className="text-lg font-semibold">الحجز والعربون</h2>
        <p className="card p-cozy text-sm leading-6 text-muted">
          ما نجمناش نقرا الحجوزات. إذا كانت هذي أول مرة، جداول الحجز مازالت ما تركّبتش في قاعدة البيانات
          (supabase/pending/bb_20_reservations.sql).
        </p>
      </section>
    );
  }

  const rows = (demands.data ?? []).filter((row): row is typeof row & { project_id: string } => Boolean(row.project_id));
  const stocks = await offerStocks(supabase, rows.map((row) => row.project_id));

  // One demand, one line: the offer it named, what it asked for, what that offer holds right now, and what a
  // hold on it costs and how long it lasts. Every figure is read, never worked out here.
  const choices: ReserveChoice[] = rows.map((row) => {
    const stock = stocks.get(row.project_id);
    const terms = data.offerTerms.get(row.project_id);
    const offer = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    return {
      requestId: row.id,
      requestNo: row.request_no,
      projectId: row.project_id,
      offerName: offer?.name ?? "عرض بلا اسم",
      offerCode: offer?.code ?? null,
      askedTrees: typeof row.offer_trees === "number" ? row.offer_trees : null,
      available: stock?.trees_available ?? 0,
      minTrees: stock?.min_trees ?? 1,
      numbered: stock ? stock.status !== "not_generated" : false,
      depositMillimes: terms?.depositMillimes ?? 0,
      depositInherited: terms?.depositSource === "default",
      validDays: terms?.validDays ?? 0,
      validDaysInherited: terms?.validDaysSource === "default",
      conditionsAr: terms?.conditionsAr ?? null,
    };
  });

  const open = data.reservations.filter((reservation) => reservation.isOpen);
  const closed = data.reservations.filter((reservation) => !reservation.isOpen);

  return (
    <section id="reservations" className="space-y-3 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-tight">
        <h2 className="text-lg font-semibold">
          الحجز والعربون{data.reservations.length > 0 ? ` (${formatCount(data.reservations.length)})` : ""}
        </h2>
        <Link href="/admin/reservations" className="text-sm underline-offset-4 hover:underline">
          كل الحجوزات
        </Link>
      </div>

      {open.map((reservation) => (
        <ReservationBlock
          key={reservation.id}
          reservation={reservation}
          methods={methods}
          reasonMin={reasonMin}
          canRecordMoney={canRecordMoney}
          moduleOpen={moduleOpen}
        />
      ))}

      <ReserveForm
        personId={personId}
        personName={personName}
        choices={choices}
        reasonMin={reasonMin}
        moduleOpen={moduleOpen}
        defaultRequestId={requestId}
      />

      {/* `.disclosure.card` carries its own padding (globals.css), so p-cozy would double it. */}
      {closed.length > 0 ? (
        <details className="card disclosure">
          <summary className="text-sm font-semibold">
            حجوزات سابقة ({formatCount(closed.length)})
          </summary>
          <div className="space-y-3">
            {closed.map((reservation) => (
              <ReservationBlock
                key={reservation.id}
                reservation={reservation}
                methods={methods}
                reasonMin={reasonMin}
                canRecordMoney={canRecordMoney}
                moduleOpen={moduleOpen}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
