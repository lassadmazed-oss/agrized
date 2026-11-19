"use client";

import { useActionState, useState } from "react";

import { formatCount, formatMillimes } from "@/lib/format";

import { reportFieldVisit } from "../actions";
import type { FieldFile, FieldResult, FieldVisit } from "../field-model";

const CHOICES: { result: FieldResult; icon: string; tone: string }[] = [
  { result: "deposit", icon: "💰", tone: "border-forest bg-leaf-soft text-forest" },
  { result: "took", icon: "✅", tone: "border-forest/40 text-forest" },
  { result: "not_now", icon: "🤔", tone: "border-line-strong text-ink" },
  { result: "disliked", icon: "👎", tone: "border-line-strong text-ink" },
  { result: "no_show", icon: "🚫", tone: "border-danger/40 text-danger" },
];

/**
 * «رجع لنا»: the owner's five words as five big buttons. «خذا» and «دفع عربون» ask how many trees; the
 * deposit asks how much and how — and its press opens the receipt.
 */
export function ReportCard({ file, visit }: { file: FieldFile; visit: FieldVisit }) {
  const [state, action, pending] = useActionState(reportFieldVisit, null);
  const [result, setResult] = useState<FieldResult | null>(null);
  const offer = file.offers.find((item) => item.id === visit.project_id);
  const [trees, setTrees] = useState(Math.max(file.request?.trees ?? 1, 1));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(file.methods.find((item) => item.code === "cash")?.id ?? file.methods[0]?.id ?? "");
  const needsTrees = result === "took" || result === "deposit";
  const available = offer?.available ?? null;
  const label = (key: FieldResult) => file.labels[key] ?? key;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="visit_id" value={visit.id} />
      <input type="hidden" name="person_id" value={file.person.id} />
      <input type="hidden" name="result" value={result ?? ""} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CHOICES.map((choice) => (
          <button
            key={choice.result}
            type="button"
            aria-pressed={result === choice.result}
            onClick={() => setResult(choice.result)}
            className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-surface px-3 text-lg font-bold transition-colors aria-pressed:ring-4 aria-pressed:ring-gold-bright/60 ${choice.tone}`}
          >
            <span aria-hidden="true" className="text-2xl">
              {choice.icon}
            </span>
            {label(choice.result)}
          </button>
        ))}
      </div>

      {needsTrees ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">قدّاش من زيتونة خذا؟</legend>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setTrees((value) => Math.max(value - 1, 1))} className="btn btn-secondary min-h-14 min-w-14 text-2xl">
              −
            </button>
            <input
              name="trees"
              inputMode="numeric"
              value={trees}
              onChange={(event) => setTrees(Math.max(Number.parseInt(event.target.value.replace(/\D/g, "") || "1", 10), 1))}
              className="field min-h-14 w-24 text-center text-2xl font-bold tabular-nums"
              aria-label="عدد الزيتونات"
            />
            <button type="button" onClick={() => setTrees((value) => value + 1)} className="btn btn-secondary min-h-14 min-w-14 text-2xl">
              +
            </button>
            {available !== null ? <span className="text-sm text-muted">{formatCount(available)} فارغة في العرض</span> : null}
          </div>
          <p className="text-sm text-muted">
            الزيتونات تتحجز باسمو {offer?.valid_days ? `${formatCount(offer.valid_days)} يوم` : ""}.
            {result === "took" && offer?.deposit_millimes ? ` العربون يبقى يستنّى (${formatMillimes(offer.deposit_millimes)}).` : ""}
          </p>
        </fieldset>
      ) : null}

      {result === "deposit" ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink">قدّاش خلّص عربون؟</legend>
          <div className="flex flex-wrap gap-2">
            {file.quick_amounts.map((millimes) => {
              const dinars = String(millimes / 1000);
              return (
                <button
                  key={millimes}
                  type="button"
                  aria-pressed={amount === dinars}
                  onClick={() => setAmount(dinars)}
                  className="chip min-h-12 px-5 text-lg tabular-nums"
                >
                  {formatMillimes(millimes)}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2">
            <input
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="مبلغ آخر"
              className="field min-h-14 w-40 text-center text-xl font-bold tabular-nums"
            />
            <span className="text-base font-semibold text-ink">دينار</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {file.methods.map((item) => (
              <label key={item.id} className="chip min-h-11">
                <input type="radio" name="method_id" value={item.id} checked={method === item.id} onChange={() => setMethod(item.id)} className="sr-only" />
                {item.label_ar}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {result ? (
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-ink">
            {result === "not_now" || result === "disliked" ? "علاش؟ (يعاوننا برشا)" : "ملاحظة (اختياري)"}
          </span>
          <input name="note" maxLength={400} className="field field-sm" />
        </label>
      ) : null}

      {state ? (
        <p role={state.ok ? "status" : "alert"} className={`text-sm font-medium ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={pending || !result} className="btn btn-primary min-h-14 w-full text-lg">
        {pending
          ? "جارٍ التسجيل…"
          : result === "deposit"
            ? "سجّل العربون وطلّع الوصل"
            : result
              ? `سجّل: ${label(result)}`
              : "اختار النتيجة"}
      </button>
    </form>
  );
}
