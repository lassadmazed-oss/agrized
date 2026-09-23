import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { readReservation } from "../../../(panel)/reservations/read";

import { DepositForm } from "./deposit-form";

export const metadata: Metadata = { title: "الحجز" };

/**
 * حجز — the trees are held; this screen is about the عربون.
 *
 * A RESERVATION IS A PROMISE WITH A DEADLINE, so the two things it is made of lead: how much is still owed,
 * and how long is left. Everything else — which trees, which offer, who — is identity, and sits under them.
 *
 * WHAT IS OWED IS NEVER COMPUTED HERE. app.reservation_payload adds up the payments, subtracts them from the
 * snapshot taken the day the hold opened, and says whether the deadline has passed. This prints those
 * answers. A screen that did its own arithmetic would disagree with the contract the day a payment is voided.
 */
export default async function ReservationPage({ params }: PageProps<"/admin/v2/reservations/[reservationId]">) {
  await requireStaff();
  const { reservationId } = await params;
  const supabase = await createClient();

  const reservation = await readReservation(supabase, reservationId);
  if (!reservation) notFound();

  const settled = reservation.depositLeftMillimes <= 0 && reservation.depositDueMillimes > 0;
  const leftDinars = Math.max(0, Math.round(reservation.depositLeftMillimes / 1000));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="section-title" dir="ltr">
          {reservation.referenceNo}
        </h1>
        <Link href="/admin/v2/reservations" className="text-sm text-muted hover:text-forest">
          رجوع للحجوزات
        </Link>
      </div>

      {/* The two questions a hold is about. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="stat-label">العربون</p>
          <p className="stat-figure">
            {settled ? "تخلّص" : formatMillimes(reservation.depositLeftMillimes)}
          </p>
          {reservation.depositDueMillimes > 0 ? (
            <p className="text-xs text-muted">
              من {formatMillimes(reservation.depositDueMillimes)}
              {reservation.depositPaidAt ? ` · تخلّص ${formatDate(reservation.depositPaidAt)}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted">ما تحدّدش عربون لهذا العرض.</p>
          )}
        </div>

        <div className="card p-4">
          <p className="stat-label">المدّة</p>
          <p className={`stat-figure ${reservation.isOverdue ? "text-danger" : ""}`}>
            {reservation.expiresAt === null
              ? "بلا أجل"
              : reservation.daysLeft === null
                ? formatDate(reservation.expiresAt)
                : reservation.daysLeft >= 0
                  ? `${formatCount(reservation.daysLeft)} يوم`
                  : "انتهات"}
          </p>
          {reservation.expiresAt ? (
            <p className="text-xs text-muted">آخر أجل {formatDate(reservation.expiresAt)}</p>
          ) : null}
        </div>
      </div>

      {reservation.isOpen && !settled ? (
        <DepositForm reservationId={reservation.id} leftDinars={leftDinars} />
      ) : null}

      <div className="card divide-y divide-line p-4">
        <Row label="العميل">
          <Link href={`/admin/v2/files/${reservation.personId}`} className="text-forest hover:underline">
            {reservation.personName ?? "بلا اسم"}
          </Link>
        </Row>
        {reservation.personPhone ? (
          <Row label="التلفون">
            <span dir="ltr">{reservation.personPhone}</span>
          </Row>
        ) : null}
        <Row label="العرض">{reservation.offerName ?? "—"}</Row>
        <Row label="الزيتونات">
          {formatCount(reservation.treesHeld)}
          {reservation.treesHeld !== reservation.treesCount
            ? ` (تسجّلت ${formatCount(reservation.treesCount)})`
            : ""}
        </Row>
        {reservation.firstCode ? (
          <Row label="الأرقام">
            <span dir="ltr">
              {reservation.firstCode}
              {reservation.lastCode && reservation.lastCode !== reservation.firstCode
                ? ` → ${reservation.lastCode}`
                : ""}
            </span>
          </Row>
        ) : null}
        <Row label="الحالة">{reservation.statusLabel}</Row>
        <Row label="تاريخ الحجز">{formatDate(reservation.reservedAt)}</Row>
      </div>

      {reservation.payments.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">الخلاصات</h2>
          <ul className="grid gap-2">
            {reservation.payments.map((payment) => (
              <li key={payment.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
                <span className="font-semibold text-ink">{formatMillimes(payment.amountMillimes)}</span>
                <span className="text-xs text-muted">{formatDate(payment.receivedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-semibold text-ink">{children}</span>
    </div>
  );
}
