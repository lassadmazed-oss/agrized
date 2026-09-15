"use client";

import { useEffect, useRef, useState } from "react";

import { formatArea } from "@/lib/format";

export type SpacingFieldsValue = {
  code: string;
  label_ar: string;
  label_fr: string | null;
  row_spacing_m: number;
  tree_spacing_m: number;
  sort_order: number;
  is_active: boolean;
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toMetres(raw: string): number | null {
  const text = raw
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[,٫]/, ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
}

/** Fields of a spacing class. The area preview is for display only; the database computes area_m2 itself. */
export function SpacingClassFields({ spacing, nextOrder = 0, idPrefix }: { spacing: SpacingFieldsValue | null; nextOrder?: number; idPrefix: string }) {
  const initialRow = spacing ? String(spacing.row_spacing_m) : "";
  const initialTree = spacing ? String(spacing.tree_spacing_m) : "";
  const [row, setRow] = useState(initialRow);
  const [tree, setTree] = useState(initialTree);
  const anchor = useRef<HTMLDivElement>(null);

  // React resets the form after a successful action; the preview must follow the inputs back to their defaults.
  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const onReset = () => {
      setRow(initialRow);
      setTree(initialTree);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [initialRow, initialTree]);

  const rowMetres = toMetres(row);
  const treeMetres = toMetres(tree);
  const area = rowMetres !== null && treeMetres !== null ? rowMetres * treeMetres : null;

  return (
    <div ref={anchor} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">اسم الفئة</span>
          <input name="label_ar" defaultValue={spacing?.label_ar ?? ""} required maxLength={120} placeholder="مثال: Intensif" className="field min-h-11" />
        </label>
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">الاسم بالفرنسية</span>
          <input name="label_fr" defaultValue={spacing?.label_fr ?? ""} maxLength={120} dir="ltr" className="field min-h-11 text-left" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_minmax(0,1.1fr)] sm:items-end">
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">التباعد بين الصفوف</span>
          <span className="flex items-center gap-2">
            <input
              name="row_spacing_m"
              value={row}
              onChange={(event) => setRow(event.target.value)}
              required
              inputMode="decimal"
              autoComplete="off"
              placeholder="9"
              dir="ltr"
              className="field min-h-11 text-left tabular-nums"
            />
            <span className="text-sm text-muted">م</span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">التباعد بين الزيتونات</span>
          <span className="flex items-center gap-2">
            <input
              name="tree_spacing_m"
              value={tree}
              onChange={(event) => setTree(event.target.value)}
              required
              inputMode="decimal"
              autoComplete="off"
              placeholder="9"
              dir="ltr"
              className="field min-h-11 text-left tabular-nums"
            />
            <span className="text-sm text-muted">م</span>
          </span>
        </label>
        <div className="rounded-xl bg-leaf-soft px-4 py-2" aria-live="polite">
          <span className="block text-xs text-muted">المساحة لكل زيتونة</span>
          <span className="block text-lg font-semibold text-forest tabular-nums">{area !== null ? formatArea(area) : "—"}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {spacing ? (
          <div className="space-y-1">
            <span className="block text-sm font-semibold">الرمز التقني</span>
            <span dir="ltr" className="block font-mono text-sm text-muted">
              {spacing.code}
            </span>
            <input type="hidden" name="code" value={spacing.code} />
          </div>
        ) : (
          <label className="block w-56 space-y-1" htmlFor={`${idPrefix}-code`}>
            <span className="block text-sm font-semibold">الرمز التقني</span>
            <input
              id={`${idPrefix}-code`}
              name="code"
              required
              maxLength={41}
              placeholder="intensif_9x9"
              dir="ltr"
              className="field min-h-11 text-left font-mono"
            />
          </label>
        )}
        <label className="block w-28 space-y-1">
          <span className="block text-sm font-semibold">الترتيب</span>
          <input type="number" name="sort_order" min={0} step={1} defaultValue={spacing?.sort_order ?? nextOrder} dir="ltr" className="field min-h-11 text-left" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={spacing?.is_active ?? true} className="size-4 accent-forest" />
          نشطة (تظهر للزوار)
        </label>
      </div>
    </div>
  );
}
