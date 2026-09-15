import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { SpacingClassFields } from "@/components/admin/tree-pricing-spacing-fields";
import { formatArea, formatSpacing } from "@/lib/format";

import { deleteSpacingClass, saveSpacingClass } from "./actions";
import { ActiveBadge, DeleteForm, Section } from "./fields";
import type { SpacingClass } from "./types";

const COLUMNS = "md:grid-cols-[minmax(0,1.6fr)_8rem_9rem_5rem_5rem]";

export function SpacingSection({ classes, reasonMin }: { classes: SpacingClass[]; reasonMin: number }) {
  return (
    <Section
      id="spacing"
      title="فئات المساحة"
      note="كل فئة = التباعد بين الصفوف × التباعد بين الزيتونات، ومنه المساحة المرتبطة بزيتونة واحدة (مثال: 9 × 9 م = 81 م²). الفئة المستعملة في مطالب مسجّلة ما تتفسخش: عطّلها باش ما تظهرش للزوار."
    >
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className={`hidden gap-3 border-b border-line bg-paper px-4 py-2 text-xs font-semibold text-muted md:grid ${COLUMNS}`} aria-hidden="true">
          <span>الفئة</span>
          <span>التباعد</span>
          <span>المساحة لكل زيتونة</span>
          <span>الترتيب</span>
          <span>الحالة</span>
        </div>
        {classes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">ما فماش فئات بعد. زيد أول فئة من النموذج تحت.</p>
        ) : (
          <ul className="divide-y divide-line">
            {classes.map((spacing) => (
              <li key={spacing.id} className="px-4 py-3">
                <div className={`grid gap-x-3 gap-y-1 ${COLUMNS} md:items-center`}>
                  <div className="min-w-0">
                    <p className="font-semibold">{spacing.label_ar}</p>
                    <p dir="ltr" className="truncate text-end text-xs text-muted">
                      {[spacing.label_fr, spacing.code].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className="tabular-nums">{formatSpacing(Number(spacing.row_spacing_m), Number(spacing.tree_spacing_m))}</p>
                  <p className="font-semibold text-forest tabular-nums">{formatArea(Number(spacing.area_m2))}</p>
                  <p className="text-sm text-muted tabular-nums">
                    <span className="md:hidden">الترتيب: </span>
                    {spacing.sort_order}
                  </p>
                  <div>
                    <ActiveBadge active={spacing.is_active} />
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-forest">تعديل أو حذف</summary>
                  <div className="mt-3 space-y-4 border-t border-line pt-4">
                    <ActionForm
                      action={saveSpacingClass.bind(null, spacing.id)}
                      submitLabel="حفظ الفئة"
                      className="space-y-3"
                      buttonClassName="btn btn-secondary min-h-11"
                    >
                      <SpacingClassFields spacing={spacing} idPrefix={`spacing-${spacing.id}`} />
                      <ReasonField minLength={reasonMin} id={`spacing-${spacing.id}-reason`} />
                    </ActionForm>
                    <DeleteForm
                      action={deleteSpacingClass.bind(null, spacing.id)}
                      reasonId={`spacing-${spacing.id}-delete-reason`}
                      reasonMin={reasonMin}
                      submitLabel="حذف الفئة"
                      hint="إذا كانت الفئة مستعملة في مطالب مسجّلة، الحذف يترفض: ألغِ «نشطة» في التعديل فوق بدل الحذف."
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-line-strong bg-paper/60 p-4">
        <p className="mb-3 text-sm font-semibold text-forest">إضافة فئة</p>
        <ActionForm action={saveSpacingClass.bind(null, null)} submitLabel="إضافة الفئة" pendingLabel="جارٍ الإضافة…" className="space-y-3">
          <SpacingClassFields spacing={null} nextOrder={(classes.at(-1)?.sort_order ?? 0) + 10} idPrefix="spacing-new" />
          <ReasonField minLength={reasonMin} id="spacing-new-reason" />
        </ActionForm>
      </div>
    </Section>
  );
}
