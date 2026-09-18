import { ActionForm, type ActionResult } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { EmptyState } from "@/components/ui";
import { formatCount } from "@/lib/format";

export type AllowedChoice = { id: string; label: string; detail?: string };

/**
 * Plan Q-13 and P1-2: a project narrows one global list. No box ticked means the project uses every active
 * item, including items added later, which is what the RPC stores as an empty selection.
 */
export function AllowedChoicesForm({
  action,
  choices,
  selected,
  legend,
  emptyText,
  submitLabel,
  reasonMin,
  idPrefix,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** Active items of the global list. */
  choices: AllowedChoice[];
  /** Ids stored for the project, active or not. */
  selected: string[];
  legend: string;
  emptyText: string;
  submitLabel: string;
  reasonMin: number;
  idPrefix: string;
}) {
  if (choices.length === 0) {
    return <EmptyState size="sm">{emptyText}</EmptyState>;
  }

  const picked = new Set(selected);
  const activeIds = new Set(choices.map((choice) => choice.id));
  const pickedActive = choices.filter((choice) => picked.has(choice.id)).length;
  const retired = selected.filter((id) => !activeIds.has(id)).length;

  return (
    <ActionForm action={action} submitLabel={submitLabel} className="card space-y-4 p-5" buttonClassName="btn btn-secondary btn-sm">
      <p className="text-sm font-semibold text-forest">
        {pickedActive === 0
          ? "توّا: كل القائمة النشطة مسموحة لهذا المشروع."
          : `توّا: المشروع محصور في ${formatCount(pickedActive)} من ${formatCount(choices.length)}.`}
      </p>
      <fieldset>
        <legend className="sr-only">{legend}</legend>
        <div className="flex flex-wrap gap-2">
          {choices.map((choice) => (
            <label key={choice.id} className="choice min-h-11 gap-2 px-3 py-1.5 text-sm">
              <input type="checkbox" name="ids" value={choice.id} defaultChecked={picked.has(choice.id)} className="size-4 accent-forest" />
              <span>
                {choice.label}
                {choice.detail ? <span className="text-muted tabular-nums"> · {choice.detail}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {retired > 0 ? (
        <p className="text-sm text-danger">
          {formatCount(retired)} من اختيارات المشروع ما عادتش نشطة في القائمة العامة، وتتنحّى من المشروع عند الحفظ.
        </p>
      ) : null}
      <p className="hint">ما تعلّمش حتى خانة = المشروع يستعمل كل القائمة النشطة، حتى القيم اللي تتزاد من بعد.</p>
      <ReasonField minLength={reasonMin} id={`${idPrefix}-reason`} />
    </ActionForm>
  );
}
