// Tab «التكاليف»: the internal figures of report v3 §35 — what the offer cost, what it would bring, the margin.
// Finance and Admin only (PRJ-03); the page never renders this tab for anyone else, and it never reaches the site.

import { ActionForm } from "@/components/admin/action-form";
import { DataList, DataRow, EmptyState, FormField, SectionHeader, StatTile } from "@/components/ui";
import { formatMillimes } from "@/lib/format";
import { COST_KIND_LABELS, COST_KINDS_OFFERED } from "@/lib/projects";

import { addProjectCost } from "../actions";

export type ProjectCost = { id: string; kind: string; label: string; amount_millimes: number };

export function CostsTab({
  projectId,
  costs,
  expectedRevenue,
}: {
  projectId: string;
  costs: readonly ProjectCost[];
  /**
   * What all the offer's trees come to, as the database priced them (app.project_quote_payload →
   * total_price_millimes). Null when the offer has no price yet — a missing spacing class, an empty
   * pricing rule — and the tile then says «—» rather than claiming a revenue of zero, which would read as
   * a margin equal to minus the costs. It used to be the cash price of the lots that are not withdrawn,
   * summed over `public.parcels`; that table has no rows, so the figure was always 0.
   */
  expectedRevenue: number | null;
}) {
  const total = costs.reduce((sum, cost) => sum + (cost.amount_millimes ?? 0), 0);
  const margin = expectedRevenue === null ? null : expectedRevenue - total;

  return (
    <div className="space-y-4">
      <SectionHeader title="التكاليف الداخلية" description="ما تظهرش للحرفاء ولا للـCommercials (PRJ-03)." />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile size="sm" label="مجموع التكاليف" value={formatMillimes(total)} quiet={total === 0} />
        <StatTile
          size="sm"
          label="المداخيل المتوقّعة"
          value={expectedRevenue === null ? "—" : formatMillimes(expectedRevenue)}
          note={expectedRevenue === null ? "ما فماش سعر لهذا العرض بعد: علّم فئة المساحة في بطاقة العرض." : "سعر الحاضر لكل زيتونات العرض"}
          quiet={expectedRevenue === null || expectedRevenue === 0}
        />
        <StatTile
          size="sm"
          label="الهامش المتوقّع"
          value={margin === null ? "—" : formatMillimes(margin)}
          className={margin !== null && margin < 0 ? "border-danger/40" : ""}
          quiet={margin === null || (total === 0 && expectedRevenue === 0)}
        />
      </dl>

      {costs.length > 0 ? (
        <div className="card p-5">
          <DataList className="text-sm">
            {costs.map((cost) => (
              <DataRow key={cost.id} label={`${cost.label} · ${COST_KIND_LABELS[cost.kind] ?? cost.kind}`} numeric>
                {formatMillimes(cost.amount_millimes)}
              </DataRow>
            ))}
          </DataList>
        </div>
      ) : (
        <EmptyState size="sm">ما فماش تكاليف مسجّلة لهذا العرض.</EmptyState>
      )}

      <div className="card p-5">
        <ActionForm
          action={addProjectCost.bind(null, projectId)}
          submitLabel="إضافة"
          className="grid gap-3 sm:grid-cols-[1fr_13rem_10rem_auto] sm:items-end"
          buttonClassName="btn btn-secondary btn-sm"
        >
          <FormField size="sm" label="البيان">
            <input name="label" required className="field field-sm" />
          </FormField>
          <FormField size="sm" label="النوع">
            <select name="kind" defaultValue="purchase" className="field field-sm">
              {COST_KINDS_OFFERED.map((kind) => (
                <option key={kind} value={kind}>
                  {COST_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField size="sm" label="المبلغ (د.ت)">
            <input name="amount_dinars" required inputMode="decimal" dir="ltr" className="field field-sm text-left" />
          </FormField>
        </ActionForm>
      </div>
    </div>
  );
}
