"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";

export type OfferRemoveMode = "delete" | "archive" | "restore";

/**
 * The remove button of one offer card: the button turns into the question in place (ConfirmButton), and a
 * refusal — an offer that gained a reservation since the page was drawn — is said under it.
 *
 * `reason` is the other half of that: it says BEFORE the click why the button is «أرشفة» and not «حذف», so an
 * offer that will not be deleted stops looking like a button that does not work (owner, 2026-10-03).
 */
export function OfferRemove({
  action,
  mode,
  name,
  reason = null,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  mode: OfferRemoveMode;
  name: string;
  /** Why this is «أرشفة» and not «حذف», built on the server from the offer's own history. Null when it is «حذف». */
  reason?: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const copy = COPY[mode];

  return (
    <form action={formAction} className="min-w-0">
      <ConfirmButton
        label={pending ? copy.pending : copy.label}
        question={copy.question(name)}
        confirmLabel={copy.confirm}
        disabled={pending}
        className={copy.buttonClass}
        confirmClassName={copy.confirmClass}
      />
      {state && !state.ok ? (
        <p role="alert" className="mt-2 max-w-sm text-xs leading-5 text-danger">
          {state.message}
        </p>
      ) : reason ? (
        <p className="mt-2 max-w-sm text-xs leading-5 text-muted">{reason}</p>
      ) : null}
    </form>
  );
}

const DANGER_BUTTON =
  "btn btn-sm border border-danger/25 bg-surface text-danger hover:border-danger/50 hover:bg-danger-soft";
const DANGER_CONFIRM = "btn btn-sm border border-danger bg-danger text-white hover:opacity-90";

const COPY: Record<
  OfferRemoveMode,
  { label: string; pending: string; confirm: string; question: (name: string) => string; buttonClass: string; confirmClass: string }
> = {
  delete: {
    label: "حذف",
    pending: "جارٍ الحذف…",
    confirm: "احذف العرض نهائياً",
    question: (name) => `«${name}» يتفسخ نهائياً، مع زيتوناته وصوره وتسعيره. ما فماش رجوع.`,
    buttonClass: DANGER_BUTTON,
    confirmClass: DANGER_CONFIRM,
  },
  archive: {
    label: "أرشفة",
    pending: "جارٍ…",
    confirm: "أرشف العرض",
    question: (name) =>
      `«${name}» فيه مطالب ولا حجوزات ولا عقود، فما يتفسخش: يتخبّى من الموقع ومن القائمة وكل شيء يبقى محفوظ. تنجم ترجّعو وقتلي تحب.`,
    buttonClass: DANGER_BUTTON,
    confirmClass: DANGER_CONFIRM,
  },
  restore: {
    label: "رجّع العرض",
    pending: "جارٍ…",
    confirm: "رجّع العرض",
    question: (name) => `«${name}» يرجع للقائمة كـ«جاهز (داخلي)»: ما يظهرش في الموقع حتى تنشرو.`,
    buttonClass: "btn btn-secondary btn-sm",
    confirmClass: "btn btn-primary btn-sm",
  },
};
