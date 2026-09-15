// Money and percentage fields of the tree pricing Back Office. No client state, so server and client forms share them.

import { formatMillimes } from "@/lib/format";

/** 10500 millimes → «10.5»: what an input shows, without grouping, so it reads back unchanged. */
export function millimesToInput(millimes: number | null | undefined): string {
  if (typeof millimes !== "number") return "";
  const whole = Math.trunc(millimes / 1000);
  const fraction = String(Math.abs(millimes % 1000)).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** 1250 basis points → «12.5». */
export function bpToInput(bp: number | null | undefined): string {
  if (typeof bp !== "number") return "";
  const whole = Math.trunc(bp / 100);
  const fraction = String(Math.abs(bp % 100)).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** A percentage as the database stores it (numeric 10 or "12.5") → «10%» or «12.5%». */
export function formatPercent(percent: number | string): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(percent))}%`;
}

/** 1250 basis points → «12.5%». */
export function formatBp(bp: number): string {
  return formatPercent(bp / 100);
}

/** Whole dinars stay short; millimes are shown only when the amount has some. */
export function formatMoney(millimes: number): string {
  return formatMillimes(millimes, { withMillimes: millimes % 1000 !== 0 });
}

type NumberFieldProps = {
  name: string;
  label: string;
  /** Screen-reader label only, for fields whose row already names them. */
  hideLabel?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  unit: string;
};

function UnitField({ label, hideLabel, hint, unit, children }: Pick<NumberFieldProps, "label" | "hideLabel" | "hint" | "unit"> & { children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={hideLabel ? "sr-only" : "block text-sm font-semibold"}>{label}</span>
      <span className="flex items-center gap-2">
        {children}
        <span className="shrink-0 text-sm text-muted">{unit}</span>
      </span>
      {hint ? <span className="hint block">{hint}</span> : null}
    </label>
  );
}

/** Amount typed in dinars with up to 3 decimals; the Server Action stores millimes. */
export function DinarInput({ millimes, unit = "د", ...props }: Omit<NumberFieldProps, "unit"> & { millimes?: number | null; unit?: string }) {
  return (
    <UnitField label={props.label} hideLabel={props.hideLabel} hint={props.hint} unit={unit}>
      <input
        name={props.name}
        defaultValue={millimesToInput(millimes)}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        className="field min-h-11 text-left tabular-nums"
      />
    </UnitField>
  );
}

/** Percentage typed with up to 2 decimals; the Server Action stores basis points. */
export function PercentInput({ bp, ...props }: Omit<NumberFieldProps, "unit"> & { bp?: number | null }) {
  return (
    <UnitField label={props.label} hideLabel={props.hideLabel} hint={props.hint} unit="%">
      <input
        name={props.name}
        defaultValue={bpToInput(bp)}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        className="field min-h-11 text-left tabular-nums"
      />
    </UnitField>
  );
}
