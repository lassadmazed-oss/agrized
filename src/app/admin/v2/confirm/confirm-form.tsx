"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createContract, generateSchedule, signContract } from "@/lib/backoffice/contracts/actions";
import { recordDeposit } from "@/lib/backoffice/reservations/actions";
import { formatCount, formatMillimes } from "@/lib/format";

import { Popup } from "../popup";

export type Option = { id: string; label_ar: string };

/**
 * «أكّد البيعة» — the arrangement, the signature and the schedule, in one press.
 *
 * WHY ONE PRESS. These were three acts on two screens, and the gap between them had a name: a contract signed
 * with no schedule appears in no finance queue, so the money was owed and invisible. Doing them in order and
 * stopping at the first refusal means a sale is either finished — on the الأقساط page, collectable — or still
 * sitting on this one. Nothing in between.
 *
 * NOTHING IS PRE-FILLED FROM THE CLIENT'S FORM. What a visitor typed into the public calculator is what they
 * WANTED; this is what the company agreed after the call, and it is typed here. The one figure that does come
 * from elsewhere is the عربون, because it is money already taken.
 *
 * THE عربون CAN BE SETTLED FROM INSIDE THE POPUP, because «the client paid the rest today» is the commonest
 * reason a sale is being confirmed at all, and sending someone to another screen to record it is how a
 * two-minute job becomes a hunt.
 */
export function ConfirmForm({
  reservationId,
  personName,
  offerName,
  trees,
  firstCode,
  lastCode,
  referenceNo,
  depositMillimes,
  depositLeftMillimes,
  kinds,
  methods,
}: {
  reservationId: string;
  personName: string;
  offerName: string | null;
  trees: number;
  firstCode: string | null;
  lastCode: string | null;
  referenceNo: string;
  depositMillimes: number;
  depositLeftMillimes: number;
  kinds: Option[];
  methods: Option[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  const [mode, setMode] = useState<"installments" | "cash">("installments");
  const [downPayment, setDownPayment] = useState("");
  const [months, setMonths] = useState("");
  const [kind, setKind] = useState("");
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [deposit, setDeposit] = useState(depositLeftMillimes > 0 ? String(depositLeftMillimes / 1000) : "");

  const owes = depositLeftMillimes > 0;

  const confirm = (close: () => void) =>
    start(async () => {
      setError(null);

      // 0 · the عربون, when the client is settling it now. Money first, so a contract is never written
      // against a hold whose payment failed.
      const dinars = Number(deposit);
      if (owes && Number.isFinite(dinars) && dinars > 0) {
        setStep("نسجّل العربون…");
        const paid = await recordDeposit({ reservationId, amountDinars: dinars, reason: "عربون وقت التأكيد" });
        if (!paid.ok) {
          setStep(null);
          setError(paid.message);
          return;
        }
      }

      // 1 · the arrangement
      setStep("نعمل العقد…");
      const made = await createContract({
        reservationId,
        kindOptionId: kind || null,
        paymentMode: mode,
        downPaymentDinars: mode === "installments" ? downPayment || null : null,
        durationMonths: mode === "installments" ? months || null : null,
        methodOptionId: method || null,
        note: note.trim() || null,
        reason: "تأكيد البيعة",
      });
      if (!made.ok) {
        setStep(null);
        setError(made.message);
        return;
      }
      const contractId = (made as { contract?: { id?: string } }).contract?.id ?? "";
      if (!contractId) {
        setStep(null);
        setError("تعمل العقد أما ما رجعش رقمو. شوف العقود.");
        return;
      }

      // 2 · the signature
      setStep("نمضي العقد…");
      const signed = await signContract({ contractId, reason: "تأكيد البيعة" });
      if (!signed.ok) {
        setStep(null);
        setError(`العقد تعمل أما ما تمضاش: ${signed.message}`);
        return;
      }

      // 3 · the schedule — instalments only; a cash contract has nothing to spread.
      if (mode === "installments") {
        setStep("نعمّر جدول الأقساط…");
        const scheduled = await generateSchedule({ contractId, reason: "تأكيد البيعة" });
        if (!scheduled.ok) {
          setStep(null);
          setError(`العقد تمضى أما الجدول ما تعمّرش: ${scheduled.message}`);
          return;
        }
      }

      setStep(null);
      close();
      router.push("/admin/v2/installments");
      router.refresh();
    });

  return (
    <Popup label="كمّل البيعة" title={`تأكيد البيعة — ${personName}`} variant="primary">
      {(close) => (
        <div className="space-y-3">
          {/* What is being confirmed, so the last chance to notice the wrong client is on this screen. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-paper px-3 py-2.5 sm:grid-cols-3">
            <Fact label="الحريف" value={personName} />
            <Fact label="العرض" value={offerName ?? "—"} />
            <Fact label="الزيتونات" value={`${formatCount(trees)} زيتونة`} />
            <Fact
              label="الأرقام"
              value={
                firstCode ? (
                  <span dir="ltr">
                    {firstCode}
                    {lastCode && lastCode !== firstCode ? ` → ${lastCode}` : ""}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Fact label="الحجز" value={<span dir="ltr">{referenceNo}</span>} />
            <Fact
              label="العربون"
              value={depositMillimes > 0 ? `${formatMillimes(depositMillimes)}${owes ? " · مازال" : " · تخلّص"}` : "بلاش"}
            />
          </dl>

          {owes ? (
            <label className="block">
              <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">
                العربون اللي خلّصو توّا (د.ت) — باقي {formatMillimes(depositLeftMillimes)}
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={deposit}
                onChange={(event) => setDeposit(event.target.value)}
                min={0}
                className="field field-sm w-full tabular-nums"
              />
            </label>
          ) : null}

          {/* The payment type — the question this whole screen exists to ask. */}
          <div className="flex gap-1">
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
                aria-pressed={mode === value}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                  mode === value
                    ? "border-forest/25 bg-leaf-soft text-forest"
                    : "border-line text-muted hover:bg-paper hover:text-forest"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "installments" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">التسبقة (د.ت)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={downPayment}
                  onChange={(event) => setDownPayment(event.target.value)}
                  className="field field-sm w-full tabular-nums"
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">المدة (بالشهر)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={months}
                  onChange={(event) => setMonths(event.target.value)}
                  placeholder="24"
                  className="field field-sm w-full tabular-nums"
                />
              </label>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">نوع العقد</span>
              <select value={kind} onChange={(event) => setKind(event.target.value)} className="field field-sm w-full">
                <option value="">الافتراضي</option>
                {kinds.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label_ar}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">طريقة الخلاص</span>
              <select value={method} onChange={(event) => setMethod(event.target.value)} className="field field-sm w-full">
                <option value="">ما تحدّدتش</option>
                {methods.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label_ar}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">ملاحظة</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} className="field field-sm w-full" />
          </label>

          {error ? <p className="text-xs font-semibold text-danger">{error}</p> : null}

          <button
            type="button"
            onClick={() => confirm(close)}
            disabled={pending}
            className="btn btn-primary btn-sm w-full"
          >
            {pending ? (step ?? "…") : mode === "installments" ? "أكّد البيعة وعمّر الجدول" : "أكّد البيعة"}
          </button>
          <p className="text-[0.625rem] leading-tight text-muted">
            بهالضغطة: يتعمل العقد، يتمضى،{mode === "installments" ? " ويتعمّر جدول الأقساط" : " وتكمل البيعة"}.
          </p>
        </div>
      )}
    </Popup>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.625rem] leading-tight text-muted">{label}</dt>
      <dd className="truncate text-xs font-semibold text-ink">{value}</dd>
    </div>
  );
}
