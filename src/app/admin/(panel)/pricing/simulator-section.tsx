import Link from "next/link";

import { QuoteBreakdown, type TreeQuote } from "@/components/admin/tree-pricing-quote";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { formatArea } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Section } from "./fields";
import { percentLabel } from "./rates-section";
import type { DownPercent, Duration, ProjectOption, SpacingClass } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

export type Simulation = {
  classId: string | null;
  trees: number | null;
  projectId: string | null;
  down: DownPercent | null;
  duration: Duration | null;
};

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/** Simulator values from the query string; anything not in the current lists is ignored. */
export function readSimulation(
  params: SearchParams,
  lists: { classes: SpacingClass[]; projects: ProjectOption[]; durations: Duration[]; percents: DownPercent[] },
): Simulation {
  const classId = first(params.class);
  const projectId = first(params.sim_project);
  const trees = first(params.trees) ?? "";
  return {
    classId: lists.classes.some((spacing) => spacing.id === classId) ? (classId as string) : null,
    trees: /^\d{1,6}$/.test(trees) && Number(trees) > 0 ? Number(trees) : null,
    projectId: lists.projects.some((project) => project.id === projectId) ? (projectId as string) : null,
    down: lists.percents.find((option) => option.id === first(params.down)) ?? null,
    duration: lists.durations.find((option) => option.id === first(params.duration)) ?? null,
  };
}

export function simulationQuery(simulation: Simulation): Record<string, string> {
  const query: Record<string, string> = {};
  if (simulation.classId) query.class = simulation.classId;
  if (simulation.trees) query.trees = String(simulation.trees);
  if (simulation.projectId) query.sim_project = simulation.projectId;
  if (simulation.down) query.down = simulation.down.id;
  if (simulation.duration) query.duration = simulation.duration.id;
  return query;
}

/** Arabic reason for a refused quote. The shared percentage message addresses a visitor, so it is reworded here. */
function quoteFailure(error: { message: string; code?: string }): string {
  if (error.message === "invalid_down_payment_percent") {
    return "نسبة التسبقة هذه موش مسموحة في المشروع المختار أو ما عادتش نشطة. اختر نسبة أخرى، أو راجع «نِسَب التسبقة المسموحة لهذا المشروع».";
  }
  if (isKnownIntakeError(error.message)) return intakeErrorMessage(error.message);
  if (error.code === "42501") return intakeErrorMessage("forbidden");
  return "تعذّر حساب السعر. حدّث الصفحة وحاول مرة أخرى، وإذا تكرّر الخطأ بلّغ المسؤول التقني.";
}

export async function SimulatorSection({
  simulation,
  classes,
  projects,
  durations,
  percents,
  keepProjectId,
}: {
  simulation: Simulation;
  classes: SpacingClass[];
  projects: ProjectOption[];
  durations: Duration[];
  percents: DownPercent[];
  keepProjectId: string | null;
}) {
  let quote: TreeQuote | null = null;
  let failure: string | null = null;
  if (simulation.classId) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("staff_tree_quote", {
      p_spacing_class: simulation.classId,
      p_trees: simulation.trees as number,
      p_project: simulation.projectId as string,
      // The list value as stored, so the percentage reaches the database unchanged.
      p_down_percent: (simulation.down?.percent ?? null) as number,
      p_months: (simulation.duration?.months ?? null) as number,
    });
    if (error) {
      failure = quoteFailure(error);
    } else {
      quote = data as TreeQuote;
    }
  }
  // The quote computes installments only with both answers.
  const installmentHalfChosen = Boolean(simulation.down) !== Boolean(simulation.duration);

  return (
    <Section
      id="simulator"
      title="محاكاة السعر"
      note="تحسب بالقواعد المحفوظة، بنفس الحساب اللي يستعملو الموقع. احفظ التعديلات فوق قبل ما تجرّب. مثال: زيتونة بـ35 م² وثمن المتر 10 د ← قيمة الأرض 350 د."
    >
      <form method="get" action="/admin/pricing#simulator" className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {keepProjectId ? <input type="hidden" name="project" value={keepProjectId} /> : null}
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">فئة المساحة</span>
          <select name="class" defaultValue={simulation.classId ?? ""} required className="field field-sm">
            <option value="" disabled>
              اختر الفئة
            </option>
            {classes.map((spacing) => (
              <option key={spacing.id} value={spacing.id}>
                {spacing.label_ar} · {formatArea(Number(spacing.area_m2))}
                {spacing.is_active ? "" : " (معطّلة)"}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">عدد الزيتونات</span>
          <input
            type="number"
            name="trees"
            min={1}
            step={1}
            inputMode="numeric"
            defaultValue={simulation.trees ?? ""}
            placeholder="مثال: 25"
            dir="ltr"
            className="field field-sm text-left"
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">المشروع (اختياري)</span>
          <select name="sim_project" defaultValue={simulation.projectId ?? ""} className="field field-sm">
            <option value="">بدون مشروع: القواعد العامة</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">نسبة التسبقة (للتقسيط)</span>
          <select name="down" defaultValue={simulation.down?.id ?? ""} className="field field-sm">
            <option value="">بلا تقسيط</option>
            {percents.map((option) => (
              <option key={option.id} value={option.id}>
                {percentLabel(option)}
              </option>
            ))}
          </select>
          {percents.length === 0 ? <span className="hint block">ما فماش نِسَب تسبقة نشطة في «القوائم».</span> : null}
        </label>
        <label className="block space-y-1">
          <span className="block text-sm font-semibold">مدة التقسيط</span>
          <select name="duration" defaultValue={simulation.duration?.id ?? ""} className="field field-sm">
            <option value="">بالحاضر، بلا تقسيط</option>
            {durations.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label_ar}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn btn-primary btn-sm flex-1">
            احسب
          </button>
          <Link href={keepProjectId ? `/admin/pricing?project=${keepProjectId}#simulator` : "/admin/pricing#simulator"} className="btn btn-ghost btn-sm">
            مسح
          </Link>
        </div>
      </form>

      {failure ? (
        <p role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-danger">
          {failure}
        </p>
      ) : null}
      {installmentHalfChosen && !failure ? (
        <p role="status" className="rounded-2xl border border-gold bg-gold-soft px-4 py-3 text-sm font-semibold text-forest-700">
          باش تتحسب الأقساط، اختر نسبة التسبقة ومدة التقسيط الاثنين.
        </p>
      ) : null}
      {quote ? <QuoteBreakdown quote={quote} /> : null}
      {!simulation.classId && classes.length === 0 ? (
        <p className="text-sm text-muted">زيد فئة مساحة واحدة على الأقل في «فئات المساحة» باش تنجم تجرّب.</p>
      ) : null}
    </Section>
  );
}
