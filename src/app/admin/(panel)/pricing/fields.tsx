import { ActionForm, type ActionResult } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";

export function Section({ id, title, note, children }: { id: string; title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-3">
      <div>
        <h2 id={`${id}-title`} className="text-xl font-semibold text-forest">
          {title}
        </h2>
        {note ? <div className="mt-1 max-w-3xl text-sm leading-6 text-muted">{note}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        active ? "bg-success-soft text-success ring-success/30" : "bg-paper text-muted ring-line-strong"
      }`}
    >
      {active ? "نشط" : "معطّل"}
    </span>
  );
}

/** Deletion with its required reason, styled apart from the save button. */
export function DeleteForm({
  action,
  reasonId,
  reasonMin,
  submitLabel,
  hint,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  reasonId: string;
  reasonMin: number;
  submitLabel: string;
  hint?: string;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={submitLabel}
      pendingLabel="جارٍ الحذف…"
      className="space-y-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-4"
      buttonClassName="btn btn-sm border-[1.5px] border-danger bg-surface text-danger hover:bg-danger-soft"
    >
      {hint ? <p className="text-sm text-ink">{hint}</p> : null}
      <ReasonField minLength={reasonMin} id={reasonId} label="سبب الحذف" />
    </ActionForm>
  );
}
