"use client";

import { useActionState, type ReactNode } from "react";

export type ActionResult = { ok: boolean; message: string } | null;

type ActionFormProps = {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  children: ReactNode;
};

/** Form bound to a Server Action that reports success or a readable error under the fields. */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "جارٍ الحفظ…",
  className = "space-y-3",
  buttonClassName = "btn btn-primary",
  children,
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className={className}>
      {children}
      {state ? (
        <p role={state.ok ? "status" : "alert"} className={`text-sm font-medium ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
