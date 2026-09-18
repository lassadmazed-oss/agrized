import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { bpToInput, formatBp, PercentInput } from "@/components/admin/tree-pricing-inputs";
import { EmptyState } from "@/components/ui";
import { formatCount } from "@/lib/format";

import { saveMarkups } from "./actions";
import { NoteCallout } from "./note-callout";
import type { Duration, Markup } from "./types";

type MarkupRow = { key: string; label: string; months: number; listed: boolean };

const NOT_OFFERED = "غير معروضة للزائر حتى تتحدّد نسبة الزيادة";

/**
 * One percentage per payment duration (report v3 §10-§12). Saving replaces every markup of the scope, so markups
 * of durations that left the list are shown too instead of being dropped silently.
 */
export function MarkupsForm({
  projectId,
  durations,
  markups,
  globalMarkups,
  maxMonths,
  reasonMin,
  idPrefix,
  note = null,
  noteInherited = false,
}: {
  projectId: string | null;
  durations: Duration[];
  markups: Markup[];
  /** The global markups when editing a project, shown as what an empty field inherits. */
  globalMarkups: Markup[] | null;
  maxMonths: number | null;
  reasonMin: number;
  idPrefix: string;
  /** markups_note_ar of the rule, edited with the pricing rule and shown above the markups. */
  note?: string | null;
  noteInherited?: boolean;
}) {
  const own = new Map(markups.map((markup) => [markup.months, markup.markup_bp]));
  const inherited = globalMarkups ? new Map(globalMarkups.map((markup) => [markup.months, markup.markup_bp])) : null;
  const listed = new Set(durations.map((duration) => duration.months));
  const rows: MarkupRow[] = [
    ...durations.map((duration) => ({ key: duration.id, label: duration.label_ar, months: duration.months, listed: true })),
    ...markups
      .filter((markup) => !listed.has(markup.months))
      .map((markup) => ({ key: `months-${markup.months}`, label: `${formatCount(markup.months)} شهراً`, months: markup.months, listed: false })),
  ].sort((a, b) => a.months - b.months);

  const overCap = (months: number) => maxMonths !== null && months > maxMonths;
  const unpriced = (row: MarkupRow) => row.listed && !overCap(row.months) && own.get(row.months) === undefined && inherited?.get(row.months) === undefined;
  const unpricedCount = rows.filter(unpriced).length;

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <NoteCallout note={note} inherited={noteInherited} />
        <EmptyState size="sm">ما فماش مدد دفع نشطة. زيد المدد في «القوائم» (قائمة مدة الدفع) ثم ارجع هنا.</EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <NoteCallout note={note} inherited={noteInherited} />
      <ActionForm
        action={saveMarkups.bind(null, projectId)}
        submitLabel={projectId ? "حفظ نسب المشروع" : "حفظ نسب الزيادة"}
        className="card space-y-4 p-5"
      >
        {unpricedCount > 0 ? (
          <p role="status" className="rounded-xl border border-gold bg-gold-soft px-4 py-2 text-sm font-semibold text-forest-700">
            {formatCount(unpricedCount)} من {formatCount(rows.filter((row) => row.listed).length)} مدد {NOT_OFFERED}.
          </p>
        ) : null}
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            // Written out (not through overCap) so TypeScript narrows maxMonths for the message below.
            const capped = maxMonths !== null && row.months > maxMonths;
            const current = own.get(row.months);
            const fallback = inherited?.get(row.months);
            const placeholder = capped ? "غير متاحة" : inherited && fallback !== undefined ? `العامة: ${bpToInput(fallback)}` : "فارغة";
            return (
              <li key={row.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
                <div>
                  <p className="font-semibold">{row.label}</p>
                  <p className="text-xs text-muted tabular-nums">
                    {formatCount(row.months)} شهراً
                    {row.listed ? "" : " · مدة ما عادتش في قائمة المدد النشطة"}
                  </p>
                  {unpriced(row) ? <p className="mt-1 text-xs font-semibold text-gold">{NOT_OFFERED}.</p> : null}
                  {capped ? (
                    <p className="mt-1 text-xs text-danger">
                      أطول من الحدّ الأقصى ({formatCount(maxMonths)} شهراً، الإعداد pricing.max_months)، لذلك ما تنجمش تتسعّر.
                      {current !== undefined ? ` النسبة المسجّلة (${formatBp(current)}) تتنحّى عند الحفظ.` : ""}
                    </p>
                  ) : null}
                </div>
                <PercentInput
                  name={`markup_${row.months}`}
                  label={`نسبة الزيادة لمدة ${row.label}`}
                  hideLabel
                  bp={current}
                  placeholder={placeholder}
                  disabled={capped}
                />
              </li>
            );
          })}
        </ul>
        <ReasonField minLength={reasonMin} id={`${idPrefix}-reason`} />
      </ActionForm>
    </div>
  );
}
