"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatCount, formatMillimes } from "@/lib/format";

import { createReservation } from "@/lib/backoffice/reservations/actions";

import { Popup } from "../../../popup";
import { Fact } from "../../../ui";

export type SellOffer = {
  id: string;
  name: string;
  available: number;
  /** The offer's OWN smallest basket, never clamped to what is left — SQL checks this number, not the stock. */
  min: number;
  /** The newest demand this person sent on THIS offer, when he sent one. Null for a walk-in sale. */
  requestId: string | null;
  requestNo: string | null;
  /** interest_requests.offer_trees — how many he asked for, so the field opens on his own number. */
  askedTrees: number | null;
  /** The عربون this offer asks for, snapshotted onto the reservation the moment it opens. */
  depositMillimes: number;
  /** How many days the hold lasts. 0 means no deadline was set — not «expires today». */
  validDays: number;
  /** The offer's own conditions text, when it has one. Same terms read as the عربون — no extra query. */
  conditions: string | null;
};

/**
 * Opening a reservation: two answers on one line, what they commit to under them, one press.
 *
 * WHAT THIS REPLACED. Three labelled fields stacked with their hints, then the terms as a two-row table in a
 * grey box, then the button — four blocks tall for a form with two decisions in it. Here the offer and the
 * count share a line (the count is 20 characters wide because it is a number under 1000), the note is a
 * placeholder on the action line rather than a labelled field of its own, and the terms are one strip.
 *
 * WHICH TREES IS NOT A QUESTION ASKED HERE, on purpose. The engine behind staff_create_reservation takes the
 * lowest-numbered available trees of the offer, all of them or none, inside one transaction. A commercial
 * choosing codes by hand would be choosing under a race — two people on two phones can agree to sell the same
 * tree in the time it takes to read a list — and §46 says the system must never sell 501 of 500.
 *
 * THE BOUNDS ARE UNDER THE FIELD, and they are the offer's real ones. src/lib/errors.ts answers below_min_trees
 * with «زيد العدد حتى للحدّ الأدنى المكتوب تحت الخانة» — shared copy, read on the public offer form too, that
 * names a POSITION. So the pair lives under the count input, in red while the typed number is outside it, and
 * not in the strip where a refusal would be pointing at nothing. `min` is the offer's own smallest basket
 * (0054 checks that number and never what is left), `max` is what is free right now; the page lists no offer
 * where the first exceeds the second, so the range printed here is always one a press can satisfy.
 *
 * THE DEMAND RIDES ALONG. When the chosen offer is one this client actually asked about, that demand's id goes
 * with the press (staff_create_reservation validates it against both the person and the offer) and the hold
 * shows its مطلب from then on. Nothing is invented: an offer he never asked about simply sends null.
 *
 * THE REASON IS WRITTEN, NOT TYPED (§51). audit.reason_min_length is 0 since 0058 and the «سبب التغيير» box is
 * gone from v2 by the owner's decision, so the audit row would carry an empty reason — and a minimum put back
 * above zero one day would refuse every press on a screen with no box to fill. One generated sentence — how
 * many trees, to whom, from which offer, on which demand — is better evidence than anything a hand types ten
 * times a day, and it keeps working at any minimum.
 *
 * THE CONDITIONS TEXT IS A POPUP because it is a paragraph the client is read on the phone, not something the
 * commercial re-reads every time they open a sale. A screen that prints it inline is a screen where the button
 * is below the fold.
 */
export function SellForm({
  personId,
  personName,
  offers,
}: {
  personId: string;
  /** Written into the audit sentence, so the log says who the trees went to without opening another screen. */
  personName: string;
  offers: SellOffer[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [trees, setTrees] = useState(opening(offers[0]));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const offer = offers.find((row) => row.id === offerId) ?? null;
  const count = Number(trees);
  const valid = offer !== null && Number.isInteger(count) && count >= offer.min && count <= offer.available;
  const wrong = trees !== "" && !valid;
  const conditions = offer?.conditions ?? null;

  const submit = () => {
    if (!offer || !valid) return;
    setError(null);
    start(async () => {
      const result = await createReservation({
        projectId: offer.id,
        personId,
        requestId: offer.requestId,
        trees: count,
        note: note.trim() || null,
        reason: reasonFor(offer, personName, count),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/admin/v2/reservations/${result.reservation.id}`);
      router.refresh();
    });
  };

  return (
    <div className="card space-y-3 p-3 sm:p-4">
      {/* The two decisions. */}
      <div className="flex flex-wrap items-start gap-2">
        <select
          aria-label="العرض"
          className="field field-sm min-w-48 flex-[3]"
          value={offerId}
          onChange={(event) => {
            const next = offers.find((row) => row.id === event.target.value);
            setOfferId(event.target.value);
            setTrees(opening(next));
            setError(null);
          }}
        >
          {offers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} — متاح {formatCount(row.available)}
              {row.requestNo ? ` · مطلب ${row.requestNo}` : ""}
            </option>
          ))}
        </select>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <input
              aria-label="قدّاش من زيتونة"
              type="number"
              inputMode="numeric"
              className="field field-sm w-20 text-center tabular-nums"
              value={trees}
              min={offer?.min ?? 1}
              max={offer?.available ?? 1}
              aria-invalid={wrong ? true : undefined}
              aria-describedby={offer ? "sell-bounds" : undefined}
              onChange={(event) => setTrees(event.target.value)}
            />
            <span className="text-sm text-muted">زيتونة</span>
          </div>

          {/* The bound errors.ts tells the reader to look for, right where it says it is. */}
          {offer ? (
            <p
              id="sell-bounds"
              className={`mt-1 text-[0.6875rem] leading-tight tabular-nums ${wrong ? "text-danger" : "text-muted"}`}
            >
              من {formatCount(offer.min)} إلى {formatCount(offer.available)}
            </p>
          ) : null}
        </div>
      </div>

      {/* What the client is being committed to, before the press — not after. Three facts on one line, in the
          same label/value shape the rest of v2 uses; «على المطلب» draws nothing when there is no demand.
          NOTE: the inline row is local because ui.tsx has no inline mode of `Facts` — one belongs there. */}
      {offer ? (
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-xl bg-paper px-3 py-2">
          <Fact label="العربون">
            {offer.depositMillimes > 0 ? formatMillimes(offer.depositMillimes) : "بلا عربون"}
          </Fact>
          <Fact label="الحجز يدوم">
            {offer.validDays > 0 ? `${formatCount(offer.validDays)} يوم` : "بلا أجل"}
          </Fact>
          <Fact label="على المطلب">{offer.requestNo}</Fact>
        </dl>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          aria-label="ملاحظة"
          className="field field-sm flex-1"
          placeholder="ملاحظة (اختياري)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <div className="flex gap-2">
          {conditions ? (
            <Popup title="شروط العرض" label="الشروط">
              {() => <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{conditions}</p>}
            </Popup>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={!valid || pending}
            className="btn btn-primary btn-sm flex-1 sm:flex-none sm:min-w-28"
          >
            {pending ? "…" : "احجز"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * The number the field opens on: what the client asked for, brought inside the offer's bounds, and the offer's
 * smallest basket when he asked for nothing. Typing over a number that is already right is a step; correcting
 * one that the button refuses is two.
 */
function opening(offer: SellOffer | undefined): string {
  if (!offer) return "1";
  const asked = offer.askedTrees;
  if (asked === null || !Number.isInteger(asked)) return String(offer.min);
  return String(Math.min(Math.max(asked, offer.min), offer.available));
}

/** The audit sentence this act writes about itself — see «THE REASON IS WRITTEN, NOT TYPED» above. */
function reasonFor(offer: SellOffer, personName: string, count: number): string {
  const head = `حجز ${formatCount(count)} زيتونة لـ${personName} من عرض ${offer.name}`;
  return offer.requestNo ? `${head} على المطلب ${offer.requestNo}.` : `${head}.`;
}
