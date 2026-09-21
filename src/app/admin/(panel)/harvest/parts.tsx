// The pieces both harvest screens draw. Server components: no state, no client boundary.
// Everything here styles itself through the shared classes in globals.css (.card, .panel, .pill, .field,
// .section-title) and the components in @/components/ui. Nothing here writes Arabic copy: every word is either
// the caller's or a setting.

import type { ReactNode } from "react";

import { EmptyState, StatusPill } from "@/components/ui";
import type { PillTone } from "@/components/ui";

import type { HarvestStatus } from "./rpc";

/**
 * What the screen says while the owner has not switched the module on. The wording matches the modules screen:
 * a disabled module is a decision, not a fault, and the sentence says which switch opens it.
 */
export function ModuleClosedCard({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <EmptyState title={title}>
      {children ??
        "هذه الوحدة مازالت معطّلة. شغّلها من الإعدادات ← الموديولات: «داخلي فقط» تكفي باش يخدم بيها الفريق قبل النشر."}
    </EmptyState>
  );
}

const STATUS_TONES: Record<HarvestStatus, PillTone> = {
  planned: "neutral",
  harvesting: "progress",
  closed: "info",
  settled: "success",
  cancelled: "danger",
};

/** The season's state, coloured by the code and worded by the setting the payload already resolved. */
export function SeasonPill({ status, label }: { status: HarvestStatus; label: string }) {
  return <StatusPill tone={STATUS_TONES[status] ?? "neutral"}>{label}</StatusPill>;
}

const AMOUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/**
 * A weighed quantity with its unit word. The unit LABEL is a setting; the stored unit is not, because a number
 * whose unit is editable is a number nobody can read. Null shows an em dash: «not weighed» is not «zero».
 */
export function quantityText(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "—";
  return unit ? `${AMOUNT.format(value)} ${unit}` : AMOUNT.format(value);
}
