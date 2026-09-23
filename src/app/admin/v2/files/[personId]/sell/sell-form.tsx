"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatMillimes } from "@/lib/format";

import { createReservation } from "@/lib/backoffice/reservations/actions";

export type SellOffer = {
  id: string;
  name: string;
  available: number;
  min: number;
  /** The عربون this offer asks for, snapshotted onto the reservation the moment it opens. */
  depositMillimes: number;
  /** How many days the hold lasts. 0 means no deadline was set — not «expires today». */
  validDays: number;
};

/**
 * Opening a reservation: an offer, a number, and nothing else to decide.
 *
 * WHICH TREES IS NOT A QUESTION ASKED HERE, on purpose. The engine behind staff_create_reservation takes the
 * lowest-numbered available trees of the offer, all of them or none, inside one transaction. A commercial
 * choosing codes by hand would be choosing under a race — two people on two phones can agree to sell the same
 * tree in the time it takes to read a list — and §46 says the system must never sell 501 of 500.
 *
 * THE NUMBER IS BOUNDED BY THE STOCK ITSELF, not by a constant: `min` is the offer's own smallest basket and
 * `max` is what is actually free right now. Both come from staff_offer_stock, so a sold-out offer cannot be
 * picked at all — it is not in the list.
 */
export function SellForm({ personId, offers }: { personId: string; offers: SellOffer[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [trees, setTrees] = useState(String(offers[0]?.min ?? 1));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const offer = offers.find((row) => row.id === offerId) ?? null;
  const count = Number(trees);
  const valid = offer !== null && Number.isInteger(count) && count >= offer.min && count <= offer.available;

  const submit = () => {
    if (!offer) return;
    setError(null);
    start(async () => {
      const result = await createReservation({
        projectId: offer.id,
        personId,
        trees: count,
        note: note.trim() || null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const id = (result as { reservation?: { id?: string } }).reservation?.id ?? null;
      router.push(id ? `/admin/v2/reservations/${id}` : `/admin/v2/files/${personId}`);
      router.refresh();
    });
  };

  if (offers.length === 0) {
    return <p className="card p-6 text-center text-sm text-muted">ما فماش عرض عندو زيتونات متاحة توّا.</p>;
  }

  return (
    <div className="card space-y-4 p-4 sm:p-5">
      <div>
        <label htmlFor="offer" className="label">
          العرض
        </label>
        <select
          id="offer"
          className="field w-full"
          value={offerId}
          onChange={(event) => {
            const next = offers.find((row) => row.id === event.target.value);
            setOfferId(event.target.value);
            if (next) setTrees(String(next.min));
          }}
        >
          {offers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} — متاح {row.available}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="trees" className="label">
          قدّاش من زيتونة
        </label>
        <input
          id="trees"
          type="number"
          inputMode="numeric"
          className="field w-full tabular-nums"
          value={trees}
          min={offer?.min ?? 1}
          max={offer?.available ?? 1}
          onChange={(event) => setTrees(event.target.value)}
        />
        {offer ? (
          <p className="hint mt-1">
            من {offer.min} إلى {offer.available}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="note" className="label">
          ملاحظة (اختياري)
        </label>
        <input id="note" className="field w-full" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      {/* What the client is being committed to, before the press — not after. */}
      {offer ? (
        <dl className="rounded-xl bg-paper px-3 py-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-muted">العربون</dt>
            <dd className="font-semibold text-ink">
              {offer.depositMillimes > 0 ? formatMillimes(offer.depositMillimes) : "ما فماش عربون محدّد"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-muted">الحجز يدوم</dt>
            <dd className="font-semibold text-ink">
              {offer.validDays > 0 ? `${offer.validDays} يوم` : "بلا أجل"}
            </dd>
          </div>
        </dl>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button type="button" onClick={submit} disabled={!valid || pending} className="btn btn-primary w-full">
        {pending ? "جارٍ الحجز…" : "احجز"}
      </button>
    </div>
  );
}
