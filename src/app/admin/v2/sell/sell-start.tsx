"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createReservation } from "@/lib/backoffice/reservations/actions";
import { formatCount, formatMillimes } from "@/lib/format";

import { openClientFile } from "./actions";

export type SellOffer = {
  id: string;
  name: string;
  available: number;
  min: number;
  depositMillimes: number;
  validDays: number;
};

export type Candidate = { id: string; full_name: string | null; phone_e164: string | null; cin: string | null };

/**
 * بدء عملية البيع — a sale that starts from nothing but a person and an offer.
 *
 * WHY THIS IS NOT INSIDE A CLIENT'S FILE (owner, 2026-09-23: «I don't like how I need to sell from the form
 * stuff; make a separate page that we sell from»). Selling from a file assumes the customer once filled a
 * form, and most do not: they ring, they walk in, they are met at the grove. The file was the entrance only
 * because the lead pipeline was built first. Here the person is an INPUT to the sale — found by phone if the
 * company already knows them, opened on the spot if not — and the sale is the thing being done.
 *
 * THE PHONE IS THE IDENTITY, which is why the search is by number and why opening a file with a number
 * already on record returns that same file (0083). A second «أحمد» is not a second customer; the same line
 * in two hands is a problem no software can see, and one this refuses to create.
 *
 * WHAT IT DOES NOT DO is decide the money. It takes the person and the trees and opens a hold, which is the
 * last reversible step; the عربون, the confirmation and the arrangement follow on their own screens, in that
 * order, because each one is a decision somebody has to make out loud.
 */
export function SellStart({ offers, recent }: { offers: SellOffer[]; recent: Candidate[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Who
  const [mode, setMode] = useState<"known" | "new">("known");
  const [personId, setPersonId] = useState(recent[0]?.id ?? "");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // What
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [trees, setTrees] = useState(String(offers[0]?.min ?? 1));

  const offer = offers.find((row) => row.id === offerId) ?? null;
  const count = Number(trees);
  const treesValid = offer !== null && Number.isInteger(count) && count >= offer.min && count <= offer.available;
  const whoValid = mode === "known" ? Boolean(personId) : fullName.trim().length >= 3 && phone.trim().length > 0;

  const submit = () => {
    if (!offer) return;
    setError(null);
    start(async () => {
      // 1 · the person. An existing file is reused; a new one is opened on the «جديد» stage.
      let id = personId;
      if (mode === "new") {
        const opened = await openClientFile({ fullName, phone, email });
        if (!opened.ok) {
          setError(opened.message);
          return;
        }
        id = opened.personId;
      }

      // 2 · the trees. All of them or none, decided in one transaction by the allocation engine.
      const reserved = await createReservation({ projectId: offer.id, personId: id, trees: count });
      if (!reserved.ok) {
        setError(reserved.message);
        return;
      }

      const reservationId = (reserved as { reservation?: { id?: string } }).reservation?.id ?? null;
      router.push(reservationId ? `/admin/v2/reservations/${reservationId}` : `/admin/v2/files/${id}`);
      router.refresh();
    });
  };

  if (offers.length === 0) {
    return <p className="card p-5 text-center text-sm text-muted">ما فماش عرض عندو زيتونات متاحة توّا.</p>;
  }

  return (
    <div className="space-y-3">
      <section className="card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-forest">١ · الحريف</h2>
          <div className="ms-auto flex gap-1">
            {(
              [
                ["known", "حريف موجود"],
                ["new", "حريف جديد"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  mode === value ? "bg-leaf-soft text-forest" : "text-muted hover:bg-paper hover:text-forest"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "known" ? (
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="field w-full" aria-label="الحريف">
            {recent.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name ?? "بلا اسم"} — {person.phone_e164 ?? "بلا تلفون"}
                {person.cin ? "" : " (بلا بطاقة تعريف)"}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="الاسم واللقب"
              className="field w-full"
              aria-label="الاسم واللقب"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              inputMode="tel"
              placeholder="98 123 456"
              className="field w-full"
              aria-label="رقم التلفون"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              type="email"
              placeholder="الإيميل (اختياري)"
              className="field w-full"
              aria-label="الإيميل"
            />
          </div>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold text-forest">٢ · الزيتونات</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={offerId}
            onChange={(event) => {
              const next = offers.find((row) => row.id === event.target.value);
              setOfferId(event.target.value);
              if (next) setTrees(String(next.min));
            }}
            className="field w-full"
            aria-label="العرض"
          >
            {offers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} — متاح {formatCount(row.available)}
              </option>
            ))}
          </select>

          <input
            type="number"
            inputMode="numeric"
            value={trees}
            min={offer?.min ?? 1}
            max={offer?.available ?? 1}
            onChange={(event) => setTrees(event.target.value)}
            className="field w-full tabular-nums"
            aria-label="عدد الزيتونات"
          />
        </div>

        {offer ? (
          <p className="text-xs text-muted">
            من {formatCount(offer.min)} إلى {formatCount(offer.available)} · العربون{" "}
            {offer.depositMillimes > 0 ? formatMillimes(offer.depositMillimes) : "ما تحدّدش"} · الحجز يدوم{" "}
            {offer.validDays > 0 ? `${formatCount(offer.validDays)} يوم` : "بلا أجل"}
          </p>
        ) : null}
      </section>

      {error ? <p className="card border-danger/40 px-3 py-2.5 text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !treesValid || !whoValid}
        className="btn btn-primary w-full"
      >
        {pending ? "…" : "ابدا البيع — احجز الزيتونات"}
      </button>
    </div>
  );
}
