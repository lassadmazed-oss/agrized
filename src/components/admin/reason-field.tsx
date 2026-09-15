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

/** Required reason for a sensitive change (§51). The Server Action forwards it to the RPC as p_reason. */
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
  const min = Math.max(1, Math.trunc(minLength) || 1);
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
