"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelContract } from "@/lib/backoffice/contracts/actions";
import { closeReservation } from "@/lib/backoffice/reservations/actions";

import { Popup } from "./popup";

/**
 * إلغاء البيعة — for a sale that was never finished, and for one that was.
 *
 * WHY IT HAD NO BUTTON UNTIL NOW. Both refusals have existed in the database from the start
 * (staff_close_reservation, staff_cancel_contract) and neither had a control anywhere in v2, so a sale made by
 * mistake — the wrong client, the wrong trees, a customer who changed their mind an hour later — could only be
 * undone by someone with a SQL prompt. Meanwhile its trees stayed out of stock, which means the next buyer was
 * told «متاع» about trees nobody was buying.
 *
 * THE TREES COME BACK BY DEFAULT. That is the whole point of cancelling: the stock is wrong until they do.
 * The box can be unticked for the case that actually happens in a business — the client is still taking them,
 * this paperwork was wrong and a new sale is about to be written — and unticking it says so in plain words
 * rather than leaving the reader to guess what «release» means.
 *
 * THE REASON IS REQUIRED. Every other act here records who and when by itself; only a human can say why, and a
 * cancelled sale with no reason is the one row somebody will be asked about in three months. It is written to
 * the audit trail by the function, not by this screen.
 *
 * CANCELLING A CONTRACT IS NOT THE SAME ACT and does not pretend to be: it says so in its own words, it is the
 * only one that mentions money already collected, and it is a separate role in the database (CANCEL_ROLES).
 */
export function CancelSale({
  kind,
  id,
  name,
  reference,
  label = "الغي",
}: {
  kind: "reservation" | "contract";
  id: string;
  /** The client, so the popup names who is being cancelled rather than a reference number alone. */
  name: string;
  reference: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [release, setRelease] = useState(true);

  const isContract = kind === "contract";

  const run = (close: () => void) =>
    start(async () => {
      setError(null);
      const why = reason.trim();
      if (why.length < 3) {
        setError("اكتب علاش تلغى البيعة.");
        return;
      }

      const result = isContract
        ? await cancelContract({ contractId: id, release, reason: why })
        : await closeReservation({ reservationId: id, outcome: "cancelled", release, reason: why });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });

  return (
    <Popup
      label={label}
      variant="ghost"
      title={isContract ? `إلغاء العقد — ${name}` : `إلغاء البيعة — ${name}`}
    >
      {(close) => (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ink">
            {isContract ? (
              <>
                باش يتلغى العقد <b dir="ltr">{reference}</b> متاع <b>{name}</b>. العقد يتسجّل ملغي وجدول
                الأقساط ما عادش يتحسب. الفلوس اللي تخلّصت قبل تبقى مسجّلة في التاريخ — الإلغاء ما يرجّعهاش
                وحدو.
              </>
            ) : (
              <>
                باش تتلغى البيعة <b dir="ltr">{reference}</b> متاع <b>{name}</b> قبل ما تكمّل. العربون اللي
                تسجّل يبقى في التاريخ.
              </>
            )}
          </p>

          <label className="flex items-start gap-2 rounded-xl bg-paper px-3 py-2.5 text-xs text-ink">
            <input
              type="checkbox"
              checked={release}
              onChange={(event) => setRelease(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-forest"
            />
            <span>
              رجّع الزيتونات للبيع
              <span className="block text-[0.6875rem] leading-tight text-muted">
                {release
                  ? "الزيتونات ترجع متاحة وينجم يشريها حريف آخر."
                  : "الزيتونات تبقى محجوزة لهذا الحريف — اختار هكّا كان باش تعاود تكتب البيعة توّا."}
              </span>
            </span>
          </label>

          <label className="block">
            <span className="mb-0.5 block text-[0.625rem] font-semibold text-muted">علاش؟ (إجباري)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="الحريف بدّل رايو، غلطة في الأرقام…"
              className="field field-sm w-full"
            />
          </label>

          {error ? <p className="text-xs font-semibold text-danger">{error}</p> : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => run(close)}
              disabled={pending}
              className="btn btn-sm flex-1 border border-danger/40 text-danger hover:bg-danger/5"
            >
              {pending ? "…" : isContract ? "أكّد إلغاء العقد" : "أكّد إلغاء البيعة"}
            </button>
            <button type="button" onClick={close} className="btn btn-secondary btn-sm">
              رجوع
            </button>
          </div>
        </div>
      )}
    </Popup>
  );
}
