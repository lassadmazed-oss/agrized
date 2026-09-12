import type { ReactNode } from "react";

/** One fact of a parcel card: label on one side, value on the other (clause 25.6). */
export function ParcelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}
