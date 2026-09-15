import type { ReactNode } from "react";

/** One figure of a card with its icon and label, as on the board's property cards. Place inside a <dl>. */
export function FactTile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-cream px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-forest">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}
