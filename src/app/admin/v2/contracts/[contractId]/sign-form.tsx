"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { generateSchedule, signContract } from "@/lib/backoffice/contracts/actions";

import { Popup } from "../../popup";

/**
 * إمضاء العقد — and, in the same press, the schedule.
 *
 * WHY THE TWO ARE ONE BUTTON. staff_generate_schedule refuses a draft («contract_not_signed»), so the order
 * is fixed: sign, then generate. Leaving them as two separate acts is what produces the worst state this
 * system can hold — a signed instalment contract with no lines, which therefore appears in NO finance queue
 * however much is owed. A commercial who signs and forgets the second button creates invisible debt, and
 * nothing on any screen would tell them. So the button does both, and reports if the second half failed.
 *
 * A CASH CONTRACT IS SIGNED WITHOUT A SCHEDULE, because there is nothing to schedule — the generate call is
 * skipped rather than sent and refused.
 */
export function SignForm({ contractId, instalments }: { contractId: string; instalments: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [signedOn, setSignedOn] = useState("");
  const [legalRef, setLegalRef] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (close: () => void) => {
    setError(null);
    start(async () => {
      const signed = await signContract({
        contractId,
        signedOn: signedOn || null,
        legalDocumentRef: legalRef.trim() || null,
      });
      if (!signed.ok) {
        setError(signed.message);
        return;
      }

      if (instalments) {
        const scheduled = await generateSchedule({ contractId });
        if (!scheduled.ok) {
          // The signature stands; only the schedule failed. Say exactly that, because the contract is now in
          // the state that hides money and the reader has to know to come back for it.
          setError(`تمضى العقد، أما الجدول ما تولّدش: ${scheduled.message}`);
          router.refresh();
          return;
        }
      }

      close();
      router.refresh();
    });
  };

  return (
    <Popup title="إمضاء العقد" label={instalments ? "أمضِ وولّد الجدول" : "أمضِ العقد"} variant="primary">
      {(close) => (
        <div className="space-y-3">
          <label className="block">
            <span className="label">تاريخ الإمضاء</span>
            <input
              type="date"
              value={signedOn}
              onChange={(event) => setSignedOn(event.target.value)}
              className="field w-full"
            />
            <span className="hint mt-1">اتركها فارغة = اليوم.</span>
          </label>

          <label className="block">
            <span className="label">رقم الوثيقة (اختياري)</span>
            <input
              value={legalRef}
              onChange={(event) => setLegalRef(event.target.value)}
              className="field w-full"
              placeholder="رقم العقد الورقي"
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button type="button" onClick={() => submit(close)} disabled={pending} className="btn btn-primary w-full">
            {pending ? "…" : instalments ? "أمضِ وولّد الجدول" : "أمضِ"}
          </button>
        </div>
      )}
    </Popup>
  );
}
