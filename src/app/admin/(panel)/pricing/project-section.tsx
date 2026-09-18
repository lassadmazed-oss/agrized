import Link from "next/link";

import { EmptyState } from "@/components/ui";
import { formatArea, formatSpacing } from "@/lib/format";

import { deletePricingRule, saveProjectDownPercents, saveProjectSpacingClasses } from "./actions";
import { AllowedChoicesForm } from "./allowed-choices-form";
import { CostItemsList } from "./cost-items";
import { DeleteForm } from "./fields";
import { MarkupsForm } from "./markups-form";
import { percentLabel } from "./rates-section";
import { RuleForm } from "./rule-form";
import type { CostItem, DownPercent, Duration, Markup, PricingRule, ProjectOption, SpacingClass } from "./types";

/** «حسب قواعد المشروع»: a project may override any global value, its cost items and its markups. */
export function ProjectSection({
  projects,
  requestedId,
  withOwnRules,
  rule,
  globalRule,
  items,
  markups,
  globalMarkups,
  durations,
  percents,
  classes,
  projectPercentIds,
  projectClassIds,
  maxMonths,
  reasonMin,
  keep,
}: {
  projects: ProjectOption[];
  requestedId: string | null;
  /** Projects that have a rule row, cost items or markups of their own. */
  withOwnRules: Set<string>;
  rule: PricingRule | null;
  globalRule: PricingRule | null;
  items: CostItem[];
  markups: Markup[];
  globalMarkups: Markup[];
  durations: Duration[];
  /** Active items of the down_payment_percent list. */
  percents: DownPercent[];
  /** Every spacing class; only the active ones can be allowed. */
  classes: SpacingClass[];
  /** What the selected project narrows (plan P1-2, Q-13); empty = the whole active list. */
  projectPercentIds: string[];
  projectClassIds: string[];
  maxMonths: number | null;
  reasonMin: number;
  /** Simulator parameters, kept when another project is picked. */
  keep: Record<string, string>;
}) {
  const project = projects.find((candidate) => candidate.id === requestedId) ?? null;
  const hasOwnValues = rule !== null || items.length > 0 || markups.length > 0;
  const markupsNoteInherited = !rule?.markups_note_ar && markups.length === 0;

  return (
    <div className="space-y-4">
      <form method="get" action="/admin/pricing#project-rules" className="card flex flex-wrap items-end gap-3 p-4">
        {Object.entries(keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="block min-w-64 flex-1 space-y-1">
          <span className="block text-sm font-semibold">المشروع</span>
          <select name="project" defaultValue={project?.id ?? ""} className="field field-sm">
            <option value="">اختر مشروعاً</option>
            {projects.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.code} · {candidate.name}
                {withOwnRules.has(candidate.id) ? " · عنده قواعد خاصة" : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">
          عرض قواعد المشروع
        </button>
      </form>

      {!project ? (
        <EmptyState size="sm">
          {requestedId
            ? "هذا المشروع غير موجود أو ما عندكش صلاحية الاطلاع عليه. اختر مشروعاً من القائمة."
            : projects.length === 0
              ? "ما فماش مشاريع بعد. أنشئ المشروع في «المشاريع والقطع» ثم ارجع هنا."
              : "اختر مشروعاً باش تشوف قواعده. مشروع بلا قواعد خاصة يتبع القواعد العامة كاملة."}
        </EmptyState>
      ) : (
        <div className="card space-y-8 bg-paper/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p dir="ltr" className="text-end text-xs text-muted">
                {project.code}
              </p>
              <h3 className="text-lg font-semibold">{project.name}</h3>
              <p className="mt-1 text-sm text-muted">
                {hasOwnValues
                  ? "عنده قواعد خاصة. كل خانة فارغة تتبع القيمة العامة."
                  : "يتبع القواعد العامة كاملة. اكتب قيمة في أي خانة باش تولّي خاصة بهذا المشروع."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/pricing?project=${project.id}&sim_project=${project.id}#simulator`} className="btn btn-ghost btn-sm">
                جرّب في المحاكاة
              </Link>
              <Link href={`/admin/projects/${project.id}`} className="btn btn-ghost btn-sm">
                صفحة المشروع
              </Link>
            </div>
          </div>

          <Subsection title="قواعد التسعير للمشروع">
            <RuleForm projectId={project.id} rule={rule} globalRule={globalRule} reasonMin={reasonMin} idPrefix={`project-${project.id}-rule`} />
          </Subsection>

          <Subsection title="مصاريف المشروع" note="تُضاف على المصاريف العامة، أو تعوّضها إذا ألغيت «استعمال المصاريف العامة».">
            <CostItemsList
              items={items}
              projectId={project.id}
              reasonMin={reasonMin}
              idPrefix={`project-${project.id}-cost`}
              emptyText="ما فماش مصاريف خاصة بهذا المشروع."
            />
          </Subsection>

          <Subsection title="الزيادة حسب مدة التقسيط للمشروع" note="خانة فارغة = تتبع نسبة القاعدة العامة (مكتوبة داخل الخانة).">
            <MarkupsForm
              projectId={project.id}
              durations={durations}
              markups={markups}
              globalMarkups={globalMarkups}
              maxMonths={maxMonths}
              reasonMin={reasonMin}
              idPrefix={`project-${project.id}-markups`}
              note={rule?.markups_note_ar || (markupsNoteInherited ? globalRule?.markups_note_ar : null)}
              noteInherited={markupsNoteInherited}
            />
          </Subsection>

          <Subsection
            title="نِسَب التسبقة المسموحة لهذا المشروع"
            note="علّم النِّسَب اللي يعرضها هذا المشروع. ما تعلّمش حتى وحدة = كل النِّسَب النشطة في «القوائم»."
          >
            <AllowedChoicesForm
              action={saveProjectDownPercents.bind(null, project.id)}
              choices={percents.map((item) => ({ id: item.id, label: percentLabel(item) }))}
              selected={projectPercentIds}
              legend="نِسَب التسبقة المسموحة لهذا المشروع"
              emptyText="ما فماش نِسَب تسبقة نشطة. زيدها في «القوائم» ثم ارجع هنا."
              submitLabel="حفظ نِسَب المشروع"
              reasonMin={reasonMin}
              idPrefix={`project-${project.id}-percents`}
            />
          </Subsection>

          <Subsection
            title="فئات المساحة المسموحة لهذا المشروع"
            note="علّم فئات التباعد الموجودة في هذا المشروع. ما تعلّمش حتى وحدة = كل الفئات النشطة."
          >
            <AllowedChoicesForm
              action={saveProjectSpacingClasses.bind(null, project.id)}
              choices={classes
                .filter((spacing) => spacing.is_active)
                .map((spacing) => ({
                  id: spacing.id,
                  label: spacing.label_ar,
                  detail: `${formatSpacing(Number(spacing.row_spacing_m), Number(spacing.tree_spacing_m))} · ${formatArea(Number(spacing.area_m2))}`,
                }))}
              selected={projectClassIds}
              legend="فئات المساحة المسموحة لهذا المشروع"
              emptyText="ما فماش فئات مساحة نشطة. زيدها أو فعّلها في «فئات المساحة» فوق."
              submitLabel="حفظ فئات المشروع"
              reasonMin={reasonMin}
              idPrefix={`project-${project.id}-classes`}
            />
          </Subsection>

          {hasOwnValues ? (
            <Subsection title="حذف القواعد الخاصة">
              <DeleteForm
                action={deletePricingRule.bind(null, project.id)}
                reasonId={`project-${project.id}-delete-reason`}
                reasonMin={reasonMin}
                submitLabel="حذف القواعد الخاصة"
                hint="تتنحّى قيم المشروع (ثمن المتر، الغراسة، الهامش، التدوير، الملاحظات) مع مصاريفه ونسب الزيادة متاعه، والمشروع يرجع يتبع القواعد العامة. النِّسَب والفئات المسموحة تتبدّل من خاناتها فوق."
              />
            </Subsection>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Subsection({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h4 className="font-semibold">{title}</h4>
        {note ? <p className="text-sm text-muted">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}
