import Link from "next/link";

import { formatPercent } from "@/components/admin/tree-pricing-inputs";
import { formatCount } from "@/lib/format";

import { Section } from "./fields";
import type { DownPercent, DurationItem } from "./types";

const LISTS_HREF = "/admin/settings/lists";

type RateRow = { id: string; label_ar: string; label_fr: string | null; value: string; warning?: string };

/** The list label alone when it already reads as the percentage («10%»), otherwise «label · 10%». */
export function percentLabel(item: DownPercent): string {
  const percent = formatPercent(item.percent);
  return item.label_ar.replace(/\s/g, "") === percent ? item.label_ar : `${item.label_ar} · ${percent}`;
}

/** Plan Q-1, Q-2, Q-4: both lists live in «القوائم»; this page only reads the active items. */
export function RatesSection({ percents, durations, maxMonths }: { percents: DownPercent[]; durations: DurationItem[]; maxMonths: number | null }) {
  return (
    <Section
      id="rates"
      title="نِسَب التسبقة والمدد"
      note="التسبقة نسبة من السعر الجملي بالحاضر، والباقي يتقسم على المدة المختارة. القيم تتزاد وتتبدّل وتتعطّل في «القوائم» (دور الإدارة). كل مشروع ينجم يحصر النِّسَب في «قواعد خاصة بمشروع»، ونسبة الزيادة لكل مدة في «الزيادة حسب مدة التقسيط»."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <RateTable
          title="نِسَب التسبقة النشطة"
          valueHeader="النسبة"
          rows={percents.map((item) => ({ id: item.id, label_ar: item.label_ar, label_fr: item.label_fr, value: formatPercent(item.percent) }))}
          emptyText="ما فماش نِسَب تسبقة نشطة، لذلك التقسيط ما يتعرضش. زيد نسبة في «القوائم»."
          linkLabel="تعديل نِسَب التسبقة في «القوائم»"
        />
        <RateTable
          title="مدد التقسيط النشطة"
          valueHeader="المدة"
          rows={durations.map((item) => ({
            id: item.id,
            label_ar: item.label_ar,
            label_fr: item.label_fr,
            value: `${formatCount(item.months)} شهراً`,
            warning:
              maxMonths !== null && item.months > maxMonths
                ? `أطول من الحدّ الأقصى (${formatCount(maxMonths)} شهراً)، لذلك ما تتسعّرش.`
                : undefined,
          }))}
          emptyText="ما فماش مدد تقسيط نشطة. زيد مدة في «القوائم»."
          linkLabel="تعديل المدد في «القوائم»"
        />
      </div>
    </Section>
  );
}

function RateTable({
  title,
  valueHeader,
  rows,
  emptyText,
  linkLabel,
}: {
  title: string;
  valueHeader: string;
  rows: RateRow[];
  emptyText: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.length === 0 ? (
        <>
          <h3 className="px-4 pt-4 font-semibold">{title}</h3>
          <p className="px-4 py-6 text-center text-sm text-muted">{emptyText}</p>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="px-4 pt-4 text-start font-semibold">{title}</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-start font-semibold">
                  النص
                </th>
                <th scope="col" className="px-4 py-2 text-end font-semibold">
                  {valueHeader}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="px-4 py-2.5 text-start font-medium">
                    {row.label_ar}
                    {row.label_fr ? (
                      <span dir="ltr" className="block text-xs font-normal text-muted">
                        {row.label_fr}
                      </span>
                    ) : null}
                    {row.warning ? <span className="block text-xs font-normal text-danger">{row.warning}</span> : null}
                  </th>
                  <td className="whitespace-nowrap px-4 py-2.5 text-end font-semibold text-forest tabular-nums">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-auto border-t border-line px-4 py-3">
        <Link href={LISTS_HREF} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          {linkLabel}
        </Link>
      </div>
    </div>
  );
}
