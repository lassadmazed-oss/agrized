"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createContract } from "@/lib/backoffice/contracts/actions";
import { formatMillimes } from "@/lib/format";

type Option = { id: string; label_ar: string };

/**
 * طريقة الخلاص — the commercial arrangement, decided HERE and not inherited from the form.
 *
 * THE DEMAND IS NOT THE SALE (owner, 2026-09-23). Someone who typed «50 trees, 36 months, 30%» into the
 * public calculator has told us what they wanted; what the company agreed to sell is whatever the commercial
 * types on this screen after the call. So every field starts EMPTY rather than pre-filled from the demand:
 * a pre-filled figure is a decision nobody made, and it would be signed by a client who was quoted something
 * else on the phone. Leaving a field blank falls back to the demand explicitly, which is the action's own
 * documented behaviour, not an accident of this form.
 *
 * THE عربون IS NOT AN EXTRA PAYMENT. It is credited against the down payment (contracts
 * .deposit_counts_toward_down_payment), and the schedule is built on what is left after it — verified on
 * AGZ-CTR-2026-000002: 4,080 total, 1,000 عربون credited, 3,080 financed, ×20% = 3,696 over 24 months.
 * Nothing here recomputes that; the figures below are shown so the person pressing the button can see what
 * the client is agreeing to.
 */
export function CompleteForm({
  reservationId,
  depositMillimes,
  kinds,
  methods,
}: {
  reservationId: string;
  depositMillimes: number;
  kinds: Option[];
  methods: Option[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"cash" | "installments">("installments");
  const [downPayment, setDownPayment] = useState("");
  const [months, setMonths] = useState("");
  const [kind, setKind] = useState("");
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    start(async () => {
      const result = await createContract({
        reservationId,
        kindOptionId: kind || null,
        paymentMode: mode,
        downPaymentDinars: mode === "installments" ? downPayment || null : null,
        durationMonths: mode === "installments" ? months || null : null,
        methodOptionId: method || null,
        note: note.trim() || null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const id = (result as { contract?: { id?: string } }).contract?.id ?? null;
      router.push(id ? `/admin/v2/contracts/${id}` : "/admin/v2/contracts");
      router.refresh();
    });
  };

  return (
    <div className="card space-y-4 p-4">
      <div className="flex gap-2">
        {(
          [
            ["installments", "بالتقسيط"],
            ["cash", "بالحاضر"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
              mode === value ? "border-forest bg-leaf-soft text-forest" : "border-line text-muted hover:border-forest"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "installments" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">التسبقة بالدينار</span>
            <input
              type="number"
              inputMode="decimal"
              value={downPayment}
              onChange={(event) => setDownPayment(event.target.value)}
              placeholder={depositMillimes > 0 ? String(Math.round(depositMillimes / 1000)) : "حسب الطلب"}
              className="field w-full tabular-nums"
            />
            <span className="hint mt-1">
              العربون {formatMillimes(depositMillimes)} يتحسب منها، ما يتخلّصش مرّتين.
            </span>
          </label>

          <label className="block">
            <span className="label">المدة بالأشهر</span>
            <input
              type="number"
              inputMode="numeric"
              value={months}
              onChange={(event) => setMonths(event.target.value)}
              placeholder="حسب الطلب"
              className="field w-full tabular-nums"
            />
          </label>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">نوع العقد</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="field w-full">
            <option value="">—</option>
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label_ar}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">طريقة الدفع</span>
          <select value={method} onChange={(event) => setMethod(event.target.value)} className="field w-full">
            <option value="">—</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label_ar}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">ملاحظة (اختياري)</span>
        <input value={note} onChange={(event) => setNote(event.target.value)} className="field w-full" />
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button type="button" onClick={submit} disabled={pending} className="btn btn-primary w-full">
        {pending ? "…" : "أكّد وأتمّ البيع"}
      </button>
    </div>
  );
}
