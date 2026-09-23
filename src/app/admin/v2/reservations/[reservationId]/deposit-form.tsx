"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Popup } from "../../popup";

import { recordDeposit } from "../../../(panel)/reservations/actions";

/**
 * تسجيل العربون — the act a reservation exists to wait for.
 *
 * THE AMOUNT IS TYPED IN DINARS because that is what a person says on the phone and what is written on the
 * receipt they were handed. The multiplication by 1000 happens inside the Server Action, once, next to every
 * other price field in the Back Office — a unit conversion, not a business rule, and not something this form
 * is allowed to have its own opinion about.
 *
 * IT IS PRE-FILLED WITH WHAT IS LEFT, not with the full عربون: a client who paid 400 of 1000 last week and
 * hands over the rest today should not have to work out 600 while standing at a counter. What is owed, what
 * arrived and whether the عربون is settled are all decided in SQL from the rows this writes.
 */
export function DepositForm({ reservationId, leftDinars }: { reservationId: string; leftDinars: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(leftDinars > 0 ? String(leftDinars) : "");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (close: () => void) => {
    setError(null);
    start(async () => {
      const result = await recordDeposit({
        reservationId,
        amountDinars: Number(amount),
        reference: reference.trim() || null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  };

  return (
    <Popup title="سجّل العربون" label="سجّل العربون" variant="primary">
      {(close) => (
        <Body
          amount={amount}
          setAmount={setAmount}
          reference={reference}
          setReference={setReference}
          error={error}
          pending={pending}
          onSubmit={() => submit(close)}
        />
      )}
    </Popup>
  );
}

function Body({
  amount,
  setAmount,
  reference,
  setReference,
  error,
  pending,
  onSubmit,
}: {
  amount: string;
  setAmount: (value: string) => void;
  reference: string;
  setReference: (value: string) => void;
  error: string | null;
  pending: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          className="field w-32 tabular-nums"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="المبلغ"
          aria-label="المبلغ بالدينار"
        />
        <input
          className="field flex-1"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="رقم الوصل (اختياري)"
        />
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || !(Number(amount) > 0)}
        className="btn btn-primary w-full"
      >
        {pending ? "…" : "سجّل"}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
