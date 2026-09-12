"use client";

import { useState } from "react";

type Pair = Record<string, string>;

type PairListEditorProps = {
  initial: Pair[];
  firstKey: string;
  secondKey: string;
  firstLabel: string;
  secondLabel: string;
  addLabel: string;
  max: number;
};

/** Edits a JSON list of two-field items (steps, FAQ) and submits it as one hidden value. */
export function PairListEditor({ initial, firstKey, secondKey, firstLabel, secondLabel, addLabel, max }: PairListEditorProps) {
  const [items, setItems] = useState<Pair[]>(initial);

  function change(index: number, key: string, value: string) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }

  function move(index: number, offset: number) {
    setItems((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="value" value={JSON.stringify(items)} />
      {items.map((item, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-line bg-paper/50 p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-muted tabular-nums">{index + 1}</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="font-semibold text-forest disabled:opacity-40">
                للأعلى
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                className="font-semibold text-forest disabled:opacity-40"
              >
                للأسفل
              </button>
              <button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="font-semibold text-danger">
                حذف
              </button>
            </div>
          </div>
          <input
            className="field"
            aria-label={`${firstLabel} ${index + 1}`}
            placeholder={firstLabel}
            value={item[firstKey] ?? ""}
            onChange={(event) => change(index, firstKey, event.target.value)}
          />
          <textarea
            className="field min-h-20"
            rows={2}
            aria-label={`${secondLabel} ${index + 1}`}
            placeholder={secondLabel}
            value={item[secondKey] ?? ""}
            onChange={(event) => change(index, secondKey, event.target.value)}
          />
        </div>
      ))}
      {items.length < max ? (
        <button
          type="button"
          onClick={() => setItems((current) => [...current, { [firstKey]: "", [secondKey]: "" }])}
          className="btn btn-ghost min-h-10"
        >
          + {addLabel}
        </button>
      ) : null}
    </div>
  );
}
