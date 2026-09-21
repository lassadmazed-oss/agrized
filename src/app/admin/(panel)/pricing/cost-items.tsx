import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { DinarInput, formatMoney } from "@/components/admin/tree-pricing-inputs";

import { deleteCostItem, saveCostItem } from "./actions";
import { ActiveBadge, DeleteForm } from "./fields";
import { BASIS_LABELS, type CostBasis, type CostItem } from "./types";
import { EmptyState } from "@/components/ui";

/** Extra cost lines of one scope: the global list (projectId null) or a project's own list. */
export function CostItemsList({
  items,
  projectId,
  reasonMin,
  idPrefix,
  emptyText,
}: {
  items: CostItem[];
  projectId: string | null;
  reasonMin: number;
  idPrefix: string;
  emptyText: string;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <EmptyState size="sm">{emptyText}</EmptyState>
      ) : (
        <ul className="panel divide-y divide-line overflow-hidden">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="font-semibold">{item.label_ar}</p>
                  {item.label_fr ? (
                    <p dir="ltr" className="text-end text-xs text-muted">
                      {item.label_fr}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <p className="tabular-nums">
                    <span className="font-semibold">{formatMoney(item.amount_millimes)}</span>{" "}
                    <span className="text-sm text-muted">{BASIS_LABELS[item.basis] ?? item.basis}</span>
                  </p>
                  <p className="text-xs text-muted tabular-nums">الترتيب {item.sort_order}</p>
                  <ActiveBadge active={item.is_active} />
                </div>
              </div>
              <details className="disclosure">
                <summary className="text-sm text-forest">تعديل أو حذف</summary>
                <div className="space-y-4">
                  <ActionForm action={saveCostItem.bind(null, item.id, projectId)} submitLabel="حفظ البند" buttonClassName="btn btn-secondary btn-sm">
                    <CostItemFields item={item} />
                    <ReasonField minLength={reasonMin} id={`${idPrefix}-${item.id}-reason`} />
                  </ActionForm>
                  <DeleteForm
                    action={deleteCostItem.bind(null, item.id)}
                    reasonId={`${idPrefix}-${item.id}-delete-reason`}
                    reasonMin={reasonMin}
                    submitLabel="حذف البند"
                    hint="لإيقاف البند مؤقتاً بلا حذف، ألغِ «نشط» في التعديل فوق."
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl border border-dashed border-line-strong bg-paper/60 p-4">
        <p className="mb-3 text-sm font-semibold text-forest">إضافة بند</p>
        <ActionForm action={saveCostItem.bind(null, null, projectId)} submitLabel="إضافة البند" pendingLabel="جارٍ الإضافة…">
          <CostItemFields item={null} nextOrder={(items.at(-1)?.sort_order ?? 0) + 10} />
          <ReasonField minLength={reasonMin} id={`${idPrefix}-new-reason`} />
        </ActionForm>
      </div>
    </div>
  );
}

function CostItemFields({ item, nextOrder = 0 }: { item: CostItem | null; nextOrder?: number }) {
  const basis: CostBasis = item?.basis ?? "per_tree";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">اسم البند</span>
          <input name="label_ar" defaultValue={item?.label_ar ?? ""} required maxLength={120} placeholder="مثال: الري قطرة قطرة" className="field field-sm" />
        </label>
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">الاسم بالفرنسية</span>
          <input name="label_fr" defaultValue={item?.label_fr ?? ""} maxLength={120} dir="ltr" className="field field-sm text-left" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:items-end">
        <fieldset>
          <legend className="text-sm font-semibold">يُحسب</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(Object.keys(BASIS_LABELS) as CostBasis[]).map((value) => (
              <label key={value} className="choice min-h-11 px-3 py-1.5 text-sm">
                <input type="radio" name="basis" value={value} defaultChecked={basis === value} required />
                {BASIS_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>
        <DinarInput name="amount" label="المبلغ" millimes={item?.amount_millimes} required placeholder="مثال: 12.5" />
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="block w-28 space-y-1">
          <span className="block text-sm font-semibold">الترتيب</span>
          <input type="number" name="sort_order" min={0} step={1} defaultValue={item?.sort_order ?? nextOrder} dir="ltr" className="field field-sm text-left" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={item?.is_active ?? true} className="size-4 accent-forest" />
          نشط (يدخل في الحساب)
        </label>
      </div>
    </div>
  );
}
