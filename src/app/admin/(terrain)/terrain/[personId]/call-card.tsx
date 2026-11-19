"use client";

import { useState, useTransition } from "react";

import { formatDateTime } from "@/lib/format";

import { logFieldCall } from "../actions";
import { CALL_OUTCOMES, phoneDisplay, waHref, type FieldCall } from "../field-model";

/** «كلّمو»: the number as a button, then one tap for how the call went. */
export function CallCard({
  personId,
  phone,
  whatsapp,
  calls,
  canEdit,
}: {
  personId: string;
  phone: string | null;
  whatsapp: string | null;
  calls: FieldCall[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const wa = waHref(whatsapp ?? phone);

  const record = (outcome: string) =>
    start(async () => {
      const result = await logFieldCall(personId, outcome, note);
      setMessage(result ? { ok: result.ok, text: result.message } : null);
      if (result?.ok) setNote("");
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {phone ? (
          <a href={`tel:${phone}`} className="btn btn-primary min-h-14 text-lg">
            📞 عيّطلو <span dir="ltr">{phoneDisplay(phone)}</span>
          </a>
        ) : null}
        {wa ? (
          <a href={wa} target="_blank" rel="noreferrer" className="btn btn-secondary min-h-14 text-lg">
            💬 واتساب
          </a>
        ) : null}
      </div>

      {canEdit ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">كيفاش مشات المكالمة؟</p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="ملاحظة قصيرة (اختياري)"
            className="field field-sm"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CALL_OUTCOMES.map((outcome) => (
              <button
                key={outcome.code}
                type="button"
                disabled={pending}
                onClick={() => record(outcome.code)}
                className="btn btn-secondary btn-sm"
              >
                {outcome.label}
              </button>
            ))}
          </div>
          {message ? (
            <p role={message.ok ? "status" : "alert"} className={`text-sm font-medium ${message.ok ? "text-success" : "text-danger"}`}>
              {message.text}
            </p>
          ) : null}
        </div>
      ) : null}

      {calls.length > 0 ? (
        <ul className="space-y-1 border-t border-line pt-3 text-sm text-muted">
          {calls.slice(0, 4).map((item) => (
            <li key={item.at}>
              {formatDateTime(item.at)} · {CALL_OUTCOMES.find((outcome) => outcome.code === item.outcome)?.label ?? item.outcome}
              {item.by ? ` · ${item.by}` : ""}
              {item.note ? ` — ${item.note}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
