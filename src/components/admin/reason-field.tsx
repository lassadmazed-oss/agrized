type ReasonFieldProps = {
  /** Value of the audit.reason_min_length setting; the database checks it again (app.require_reason). */
  minLength: number;
  name?: string;
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  rows?: number;
  className?: string;
};

/**
 * The reason for a sensitive change (§51). The Server Action forwards it to the RPC as p_reason.
 *
 * It draws nothing while audit.reason_min_length is zero — the owner, 2026-09-19: «remove the سبب التغيير, too
 * dumb». One box across ten screens, filled with whatever passed the length check, is an audit trail that reads
 * as evidence and is not. The audit row still carries who, when, the old value and the new one; only the typed
 * sentence goes. app.require_reason (0058) accepts an empty reason at a zero minimum, so every form keeps
 * working with nothing to fill in, and any number above zero here brings the field and the guard back at once.
 */
export function ReasonField({
  minLength,
  name = "reason",
  id = "reason",
  label = "سبب التغيير",
  hint,
  error,
  defaultValue,
  rows = 2,
  className = "",
}: ReasonFieldProps) {
  const min = Math.trunc(minLength) || 0;
  if (min <= 0) return null;

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        required
        minLength={min}
        rows={rows}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        className="field min-h-20"
      />
      <p id={hintId} className="hint">
        {hint ?? "يُحفظ السبب في سجل العمليات مع القيمة القديمة والجديدة، ولا يمكن تعديله لاحقاً."} عدد الأحرف الأدنى:{" "}
        <span className="tabular-nums">{min}</span>.
      </p>
      {error ? (
        <p id={errorId} role="alert" className="error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
