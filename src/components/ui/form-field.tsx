// A label, the control, and whichever of hint / error applies.
// Server component: it renders markup only, so it works inside a server form and inside a "use client" one.
//
// Meant to replace, one file at a time (the migration is a later, separate step):
//   Field       — src/app/(public)/register/register-wizard.tsx:859
//                 src/app/(public)/land/land-offer-form.tsx:639
//                 src/app/(public)/projects/[code]/offer-interest-form.tsx:417          → pass id
//   Labeled     — src/app/admin/(panel)/projects/page.tsx:156
//                 src/app/admin/(panel)/projects/[id]/page.tsx:809                      → size="sm", no id
//                 src/components/admin/pricing-editor.tsx:288                           → size="xs", no id
//   FilterField — src/app/admin/(panel)/leads/page.tsx:577                              → size="sm", className
//
// Two shapes, as the app already has them:
//   with an id — a <div> whose <label> points at the control, and hint/error carry `${id}-hint` / `${id}-error`
//                so the control can name them in aria-describedby (the caller keeps doing that, as today).
//   without    — a <label> wrapped around the control, which associates them without an id.
//
// The control itself stays the caller's: `field`, `field field-sm`, a <select>, a group of .choice boxes.
// .field stays at 16px on purpose — see the note at globals.css:114 — so nothing here shrinks it.

import type { ReactNode } from "react";

export type FormFieldSize = "xs" | "sm" | "md";

export type FormFieldProps = {
  /** The question, in Arabic, from the caller. */
  label: ReactNode;
  children: ReactNode;
  /** The id of the control inside. Given → explicit <label for>; omitted → the label wraps the control. */
  id?: string;
  /** Shown while there is no error. */
  hint?: ReactNode;
  /** Replaces the hint. The caller also sets aria-invalid on the control. */
  error?: ReactNode;
  size?: FormFieldSize;
  className?: string;
};

const LABEL_CLASS: Record<FormFieldSize, string> = {
  md: "label",
  sm: "label label-sm",
  xs: "label label-sm text-muted",
};

export function FormField({ label, children, id, hint, error, size = "md", className = "" }: FormFieldProps) {
  const labelClass = LABEL_CLASS[size];

  const messages = (
    <>
      {hint && !error ? (
        <p id={id ? `${id}-hint` : undefined} className="hint mt-1.5">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={id ? `${id}-error` : undefined} className="error-text">
          {error}
        </p>
      ) : null}
    </>
  );

  if (id) {
    return (
      <div className={className}>
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {children}
        {messages}
      </div>
    );
  }

  return (
    <label className={`block ${className}`.trim()}>
      <span className={labelClass}>{label}</span>
      {children}
      {messages}
    </label>
  );
}
