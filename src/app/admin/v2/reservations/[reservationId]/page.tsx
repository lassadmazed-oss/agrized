import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { readReservation } from "@/lib/backoffice/reservations/read";

import { Fact, Facts, Screen, Tile, Tiles } from "../../ui";

import { Payments, ReservationActs } from "./deposit-form";

export const metadata: Metadata = { title: "الحجز" };

/**
 * حجز — the trees are held; this screen is about the عربون and the deadline.
 *
 * WHAT THIS REPLACED (owner, 2026-09-23: «stuff shouldn't take that much space»). Two wide stat cards, then
 * seven facts stacked one per line down a divided card — each one a ~46px row carrying three words against a
 * screen 1900px wide and empty either side of it — then one bordered card per payment. A hold whose entire
 * content is «how much is left, how long is left, who, which trees» ran three phone screens. It is now one
 * strip of three figures, one row of buttons, one three-column grid, and a 40px row per payment: the same
 * facts, roughly a third of the page, and no scrolling on a phone for the usual hold.
 *
 * NOTHING IS COMPUTED HERE. app.reservation_payload sums the live (non-void) payments, subtracts them from the
 * snapshot taken the day the hold opened, and decides whether the deadline has passed and by how many days.
 * This screen prints those answers. A screen doing its own arithmetic would disagree with the contract the
 * first time a payment is voided.
 *
 * AN EMPTY FIELD DRAWS NOTHING. `Fact` renders null on an empty value, so a hold with no request number, no
 * tree codes yet and no close reason simply has a shorter grid — where the old column printed «—» three times
 * and made a reader check whether something was broken. The same rule ends the screen: no payments means no
 * payments card, not a card apologising for being empty.
 *
 * WHAT IS PRINTED ONLY WHEN IT DISAGREES. `treesCount` is what the reservation took; `treesHeld` is what
 * public.trees says it holds this second. They match until a tree is freed elsewhere, and on the day they
 * differ the figure carries the other number under it rather than picking one and sounding certain.
 *
 * A CONVERTED HOLD IS NOT A CANCELLED ONE, and this screen has to read `status` to tell them apart —
 * `trees_released` cannot. 0072 sets status='converted' and leaves trees_released FALSE on purpose («conversion
 * does not release trees, it sells them»), then calls app.sell_reservation_trees(), which moves every tree from
 * 'reserved' to 'sold'. So on the happy path of the whole product — hold → contract — `treesReleased === false`
 * means SOLD, never «still held», and `treesHeld` (count of state='reserved') is 0 while `treesSold` carries the
 * forty. Reading the flag alone printed «باقية محجوزة · 0» about trees that belong to a client.
 *
 * «باقية محجوزة» IS ALSO GROUNDED IN THE LIVE COUNT, not in the flag: staff_close_reservation writes
 * `trees_released = v_release and v_freed > 0`, so a close that freed nothing leaves the flag FALSE too. The
 * sentence is printed only when public.trees still holds something, and otherwise nothing is said at all.
 *
 * THE ACTS ARE GATED ON PRICE_ROLES, the same list as app.can_record_money(), because all four RPCs behind
 * them (deposit · extend · close · void) ask for exactly that. A commercial reads this screen; they are not
 * shown three buttons that would come back «ما عندكش الصلاحية».
 */
export default async function ReservationPage({ params }: PageProps<"/admin/v2/reservations/[reservationId]">) {
  const staff = await requireStaff();
  const { reservationId } = await params;
  const supabase = await createClient();

  const reservation = await readReservation(supabase, reservationId);
  if (!reservation) notFound();

  const canAct = hasRole(staff, PRICE_ROLES);
  const due = reservation.depositDueMillimes;
  const settled = due > 0 && reservation.depositLeftMillimes <= 0;
  const owes = reservation.isOpen && due > 0 && reservation.depositLeftMillimes > 0;

  // WHICH CLOSE WAS IT. Everything this screen says about a closed hold's trees and its closing date depends on
  // this one boolean; see the note above on 0072 leaving trees_released FALSE for a conversion.
  const converted = reservation.status === "converted";
  /** What this hold's trees are today: held while it is a hold, sold once it became a contract. */
  const treesNow = converted ? reservation.treesSold : reservation.treesHeld;

  const expiresAt = reservation.expiresAt;
  const daysLeft = reservation.daysLeft;

  return (
    <Screen
      title={reservation.referenceNo}
      action={
        <Link href="/admin/v2/reservations" className="text-xs text-muted hover:text-forest">
          رجوع
        </Link>
      }
    >
      <Tiles>
        <Tile
          label="العربون"
          value={due === 0 ? "بلا عربون" : settled ? "تخلّص" : money(reservation.depositLeftMillimes)}
          note={
            due === 0
              ? undefined
              : settled
                ? note(money(due), reservation.depositPaidAt ? formatDate(reservation.depositPaidAt) : null)
                : note(
                    reservation.depositPaidMillimes > 0 ? `خلّص ${money(reservation.depositPaidMillimes)}` : null,
                    `من ${money(due)}`,
                  )
          }
        />

        <Tile
          label="المدّة"
          value={
            expiresAt === null
              ? "بلا أجل"
              : daysLeft === null
                ? formatDate(expiresAt)
                : daysLeft < 0
                  ? "انتهات"
                  : daysLeft === 0
                    ? "اليوم"
                    : `${formatCount(daysLeft)} يوم`
          }
          note={note(
            expiresAt !== null && daysLeft !== null ? `آخر أجل ${formatDate(expiresAt)}` : null,
            reservation.closedAt
              ? `${converted ? "تحوّل لعقد" : "تسكّر"} ${formatDate(reservation.closedAt)}`
              : null,
            reservation.extendedCount > 0 ? `تمدّد ${formatCount(reservation.extendedCount)} مرّة` : null,
          )}
          tone={reservation.isOverdue ? "danger" : undefined}
        />

        <Tile
          label="الزيتونات"
          value={formatCount(treesNow)}
          note={note(
            treesNow !== reservation.treesCount ? `تسجّلت ${formatCount(reservation.treesCount)}` : null,
            !converted && reservation.treesSold > 0 ? `تباعت ${formatCount(reservation.treesSold)}` : null,
            treesState(reservation.isOpen, converted, reservation.treesReleased, reservation.treesHeld),
          )}
        />
      </Tiles>

      <ReservationActs
        reservationId={reservation.id}
        canAct={canAct}
        isOpen={reservation.isOpen}
        overdue={reservation.isOverdue}
        owes={owes}
        leftMillimes={reservation.depositLeftMillimes}
        treesHeld={reservation.treesHeld}
        conditions={reservation.conditionsAr}
        note={reservation.note}
      />

      <Facts>
        <Fact label="العميل">
          <Link href={`/admin/v2/files/${reservation.personId}`} className="text-forest hover:underline">
            {reservation.personName ?? "بلا اسم"}
          </Link>
        </Fact>
        <Fact label="التلفون">
          {reservation.personPhone ? (
            <a dir="ltr" href={`tel:${reservation.personPhone}`} className="text-forest hover:underline">
              {reservation.personPhone}
            </a>
          ) : undefined}
        </Fact>
        <Fact label="العرض">{reservation.offerName ?? reservation.offerCode ?? undefined}</Fact>
        <Fact label="الحالة">{reservation.statusLabel}</Fact>
        <Fact label="الأرقام">
          {reservation.firstCode ? (
            <span dir="ltr">
              {reservation.firstCode}
              {reservation.lastCode && reservation.lastCode !== reservation.firstCode
                ? ` → ${reservation.lastCode}`
                : ""}
            </span>
          ) : undefined}
        </Fact>
        <Fact label="تاريخ الحجز">{formatDate(reservation.reservedAt)}</Fact>
        <Fact label="الطلب">
          {reservation.requestNo ? <span dir="ltr">{reservation.requestNo}</span> : undefined}
        </Fact>
        <Fact label="سجّل الحجز">{reservation.createdBy ?? undefined}</Fact>
        <Fact label="سبب التسكير">{reservation.closeReason ?? undefined}</Fact>
      </Facts>

      <Payments payments={reservation.payments} canAct={canAct} />
    </Screen>
  );
}

/** The one small line under a figure: the parts that have something to say, joined — or nothing at all. */
function note(...parts: (string | null)[]): string | undefined {
  const said = parts.filter((part): part is string => typeof part === "string" && part !== "");
  return said.length > 0 ? said.join(" · ") : undefined;
}

/**
 * Money that shows its millimes only when it has any.
 *
 * formatMillimes() prints 0 decimals by default, which is what makes the strip short — and which also printed
 * «600 د.ت» over a hold owing 599,500. A whole-dinar amount still reads «600 د.ت»; a fractional one reads
 * «599.500 د.ت», the figure the client actually owes and the receipt was written for. The same three lines sit
 * in deposit-form.tsx over the receipts: it is a "use client" module, and a Server Component cannot call a
 * value imported from one (see the header of reservations/model.tsx), so the helper is copied, not shared.
 */
function money(millimes: number): string {
  return formatMillimes(millimes, { withMillimes: millimes % 1000 !== 0 });
}

/**
 * The one sentence about where a closed hold's trees went — said only when the database knows.
 *
 * `treesReleased` answers «were they freed», not «are they still reserved». Its FALSE covers three different
 * worlds: sold to a contract (0072), a close that asked to release and freed nothing, and a close that chose to
 * keep the hold on the trees. Only the last of those is «باقية محجوزة», and public.trees is what says so.
 */
function treesState(isOpen: boolean, converted: boolean, released: boolean, held: number): string | null {
  if (isOpen) return null;
  if (converted) return "تباعت للحريف";
  if (released) return "رجعت متاحة";
  return held > 0 ? "باقية محجوزة" : null;
}
