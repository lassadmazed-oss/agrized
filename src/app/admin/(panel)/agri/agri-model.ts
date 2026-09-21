// The shape of everything stage 4 reads, and the ONE service vocabulary both screens speak.
//
// WHY THE TWO MODULES SHARE THIS FILE. الـBack Office الفلاحي and الاشتراك السنوي are one design: a
// subscription is what a client agreed to PAY for, an operation is what somebody actually DID, and both name
// the same service — option_items(list_key = 'agrized_service'), the ten of report v3 §36 plus سماد and
// مداواة from cahier v2 §40. If «التقليم» were a different thing on the two screens, no figure on either
// could be trusted. So the labels, the codes and the parsing live here once.
//
// NOTHING IN THIS FILE COMPUTES. Every amount, every date, every count and every Arabic status label arrives
// decided from Postgres (staff_offer_services · staff_agri_operations · staff_subscriptions). These functions
// read jsonb and hand back a shape.

import type { StaffRole } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";

export type FlagState = Database["public"]["Enums"]["flag_state"];

/**
 * app.can_manage_operations() in TypeScript: the agricultural manager runs the grove, Finance and Admin may
 * too. It mirrors app.can_manage_trees()'s list because keeping the stock and working the grove are the same
 * desk. It belongs beside ADMIN_ROLES and PRICE_ROLES in src/lib/auth.ts and is here only because that file
 * is shared with two teams building in the same hour; whoever merges the batch moves it, and both stage 4
 * modules import it from there instead.
 *
 * A commercial is deliberately absent: an operation names a tree code, never the person who holds it, and
 * the SQL policy on public.agri_operations says the same thing.
 */
export const AGRI_ROLES = ["agri_manager", "finance", "admin", "super_admin"] as const satisfies readonly StaffRole[];

// ---------------------------------------------------------------------------
// jsonb, read defensively — the payload comes from a draft migration that may not be applied yet
// ---------------------------------------------------------------------------

export type Json = Record<string, unknown>;

export function rec(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function int(value: unknown, fallback = 0): number {
  const parsed = num(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

export function bool(value: unknown): boolean {
  return value === true;
}

function flag(value: unknown): FlagState {
  return value === "public" || value === "internal" ? value : "disabled";
}

// ---------------------------------------------------------------------------
// What one service costs in one offer (report v3 §36: Price · Frequency · Provider)
// ---------------------------------------------------------------------------

/** per_tree × the number of trees · per_season flat · per_operation each time it is done. */
export type ServiceBasis = "per_tree" | "per_season" | "per_operation";

/** The Arabic of a basis. A price with no unit beside it is a number nobody can check. */
export const BASIS_LABELS: Record<ServiceBasis, string> = {
  per_tree: "للزيتونة",
  per_season: "للموسم",
  per_operation: "للمرة",
};

export function basisLabel(basis: string | null): string {
  return basis && basis in BASIS_LABELS ? BASIS_LABELS[basis as ServiceBasis] : "";
}

export type ServiceTerms = {
  /** false when neither this offer nor the global default prices this service yet. */
  ok: boolean;
  /** Which row answered: the offer's own, or the global default it inherits. */
  source: "project" | "global" | null;
  termsId: string | null;
  labelAr: string | null;
  basis: string | null;
  amountMillimes: number;
  inAnnualPackage: boolean;
  frequencyLabel: string | null;
  frequencyDays: number | null;
  providerLabel: string | null;
  providerNote: string | null;
};

function parseTerms(value: unknown): ServiceTerms {
  const row = rec(value);
  return {
    ok: bool(row.ok),
    source: row.source === "project" || row.source === "global" ? row.source : null,
    termsId: str(row.terms_id),
    labelAr: str(row.label_ar),
    basis: str(row.basis),
    amountMillimes: int(row.amount_millimes),
    inAnnualPackage: bool(row.in_annual_package),
    frequencyLabel: str(row.frequency_label),
    frequencyDays: num(row.frequency_days),
    providerLabel: str(row.provider_label),
    providerNote: str(row.provider_note),
  };
}

export type OfferService = {
  serviceOptionId: string;
  code: string | null;
  labelAr: string;
  terms: ServiceTerms;
  lastDoneOn: string | null;
  operationsDone: number;
  /** When this service is next owed, from the last time it was done plus its frequency. Null = «عند الحاجة». */
  nextDueOn: string | null;
  isOverdue: boolean;
  /** Operations still «مخطّطة» whose planned date has passed. */
  plannedLate: number;
};

export type OfferServices = {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** How many services the offer's own card advertises. Zero means it can price nothing. */
  declaresServices: number;
  annualFeePerTreeMillimes: number | null;
  services: OfferService[];
};

export function parseOfferServices(value: unknown): OfferServices | null {
  const row = rec(value);
  const id = str(row.project_id);
  if (!id) return null;
  return {
    projectId: id,
    projectCode: str(row.project_code) ?? "",
    projectName: str(row.project_name) ?? "",
    declaresServices: int(row.declares_services),
    annualFeePerTreeMillimes: num(row.annual_fee_per_tree_millimes),
    services: arr(row.services).map((entry) => {
      const s = rec(entry);
      return {
        serviceOptionId: str(s.service_option_id) ?? "",
        code: str(s.code),
        labelAr: str(s.label_ar) ?? "",
        terms: parseTerms(s.terms),
        lastDoneOn: str(s.last_done_on),
        operationsDone: int(s.operations_done),
        nextDueOn: str(s.next_due_on),
        isOverdue: bool(s.is_overdue),
        plannedLate: int(s.planned_late),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// What was actually done (cahier v2 §41)
// ---------------------------------------------------------------------------

export const OPERATION_FILTERS = ["all", "planned", "done", "late"] as const;
export type OperationFilter = (typeof OPERATION_FILTERS)[number];

/** The chips above the list. The Arabic of a STATUS comes from the database; these name the VIEWS. */
export const OPERATION_FILTER_LABELS: Record<OperationFilter, string> = {
  all: "الكل",
  planned: "مخطّطة",
  done: "منجزة",
  late: "تأخّرت",
};

export function parseOperationFilter(value: string | string[] | undefined): OperationFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return (OPERATION_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as OperationFilter) : "all";
}

export type Season = { label: string; startsOn: string | null; endsOn: string | null };

function parseSeason(value: unknown): Season {
  const row = rec(value);
  return { label: str(row.label) ?? "", startsOn: str(row.starts_on), endsOn: str(row.ends_on) };
}

export type Operation = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  serviceOptionId: string;
  labelAr: string;
  status: string;
  statusLabel: string;
  /** "offer": the whole grove. "trees": only the numbered trees below. */
  scope: string;
  treesTouched: number;
  providerLabel: string | null;
  providerNote: string | null;
  plannedOn: string | null;
  executedOn: string | null;
  isLate: boolean;
  /** Null for a reader who is not Finance or Admin — absent, never zero (PRJ-03). */
  costMillimes: number | null;
  note: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
};

export type OperationList = {
  moduleState: FlagState;
  filter: OperationFilter;
  season: Season;
  costsVisible: boolean;
  counts: { planned: number; done: number; late: number };
  seasonCostMillimes: number | null;
  rows: Operation[];
};

export function parseOperationList(value: unknown): OperationList {
  const row = rec(value);
  const counts = rec(row.counts);
  return {
    moduleState: flag(row.module_state),
    filter: parseOperationFilter(str(row.filter) ?? undefined),
    season: parseSeason(row.season),
    costsVisible: bool(row.costs_visible),
    counts: { planned: int(counts.planned), done: int(counts.done), late: int(counts.late) },
    seasonCostMillimes: num(row.season_cost_millimes),
    rows: arr(row.rows).map((entry) => {
      const o = rec(entry);
      return {
        id: str(o.id) ?? "",
        projectId: str(o.project_id) ?? "",
        projectCode: str(o.project_code) ?? "",
        projectName: str(o.project_name) ?? "",
        serviceOptionId: str(o.service_option_id) ?? "",
        labelAr: str(o.label_ar) ?? "",
        status: str(o.status) ?? "planned",
        statusLabel: str(o.status_label) ?? "",
        scope: str(o.scope) ?? "offer",
        treesTouched: int(o.trees_touched),
        providerLabel: str(o.provider_label),
        providerNote: str(o.provider_note),
        plannedOn: str(o.planned_on),
        executedOn: str(o.executed_on),
        isLate: bool(o.is_late),
        costMillimes: num(o.cost_millimes),
        note: str(o.note),
        approvedByName: str(o.approved_by_name),
        approvedAt: str(o.approved_at),
      };
    }),
  };
}

/** Tones for the three operation states. Codes are stable; every word on screen is the database's. */
export function operationTone(status: string, isLate: boolean): "success" | "warning" | "attention" | "neutral" {
  if (status === "done") return "success";
  if (status === "cancelled") return "neutral";
  return isLate ? "attention" : "warning";
}

// ---------------------------------------------------------------------------
// What a client subscribes to (cahier v2 §40, report v3 §36 Status + Payment)
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_FILTERS = ["all", "active", "unpaid", "requested", "draft"] as const;
export type SubscriptionFilter = (typeof SUBSCRIPTION_FILTERS)[number];

export const SUBSCRIPTION_FILTER_LABELS: Record<SubscriptionFilter, string> = {
  all: "الكل",
  active: "نشيطة",
  unpaid: "ما خلّصوش",
  requested: "خدمات مطلوبة",
  draft: "مسوّدات",
};

export function parseSubscriptionFilter(value: string | string[] | undefined): SubscriptionFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return (SUBSCRIPTION_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as SubscriptionFilter) : "all";
}

export type SubscriptionLine = {
  id: string;
  serviceOptionId: string;
  labelAr: string;
  inPackage: boolean;
  basis: string | null;
  amountMillimes: number;
  frequencyLabel: string | null;
  providerLabel: string | null;
  /** «requested» is report v3 §33's «الخدمات المطلوبة»: asked for, not yet agreed. */
  status: string;
};

export type Subscription = {
  id: string;
  personId: string;
  personName: string;
  personPhone: string | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  seasonLabel: string;
  seasonStartsOn: string | null;
  seasonEndsOn: string | null;
  treeCount: number;
  /** The fee AS AGREED, frozen at creation. Never today's pricing rule. */
  feePerTreeMillimes: number;
  feeSource: string;
  totalMillimes: number;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentLabel: string;
  note: string | null;
  lines: SubscriptionLine[];
};

export type SubscriptionList = {
  moduleState: FlagState;
  filter: SubscriptionFilter;
  season: Season;
  counts: { active: number; unpaid: number; requested: number };
  dueMillimes: number;
  rows: Subscription[];
};

export function parseSubscriptionList(value: unknown): SubscriptionList {
  const row = rec(value);
  const counts = rec(row.counts);
  return {
    moduleState: flag(row.module_state),
    filter: parseSubscriptionFilter(str(row.filter) ?? undefined),
    season: parseSeason(row.season),
    counts: { active: int(counts.active), unpaid: int(counts.unpaid), requested: int(counts.requested) },
    dueMillimes: int(row.due_millimes),
    rows: arr(row.rows).map((entry) => {
      const s = rec(entry);
      return {
        id: str(s.id) ?? "",
        personId: str(s.person_id) ?? "",
        personName: str(s.person_name) ?? "",
        personPhone: str(s.person_phone),
        projectId: str(s.project_id) ?? "",
        projectCode: str(s.project_code) ?? "",
        projectName: str(s.project_name) ?? "",
        seasonLabel: str(s.season_label) ?? "",
        seasonStartsOn: str(s.season_starts_on),
        seasonEndsOn: str(s.season_ends_on),
        treeCount: int(s.tree_count),
        feePerTreeMillimes: int(s.fee_per_tree_millimes),
        feeSource: str(s.fee_source) ?? "global",
        totalMillimes: int(s.total_millimes),
        status: str(s.status) ?? "draft",
        statusLabel: str(s.status_label) ?? "",
        paymentStatus: str(s.payment_status) ?? "unpaid",
        paymentLabel: str(s.payment_label) ?? "",
        note: str(s.note),
        lines: arr(s.lines).map((lineEntry) => {
          const l = rec(lineEntry);
          return {
            id: str(l.id) ?? "",
            serviceOptionId: str(l.service_option_id) ?? "",
            labelAr: str(l.label_ar) ?? "",
            inPackage: bool(l.in_package),
            basis: str(l.basis),
            amountMillimes: int(l.amount_millimes),
            frequencyLabel: str(l.frequency_label),
            providerLabel: str(l.provider_label),
            status: str(l.status) ?? "agreed",
          };
        }),
      };
    }),
  };
}

export function subscriptionTone(status: string): "success" | "warning" | "neutral" | "danger" {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  if (status === "declined" || status === "cancelled") return "danger";
  return "neutral";
}

export function paymentTone(payment: string): "success" | "warning" | "attention" {
  if (payment === "paid") return "success";
  if (payment === "partial") return "warning";
  return "attention";
}

/**
 * Where a frozen annual fee came from, so nobody has to guess whether a figure is the offer's, the
 * catalogue's, or one a human typed. The words are short because they sit beside the amount.
 */
export const FEE_SOURCE_LABELS: Record<string, string> = {
  project: "سعر العرض",
  global: "السعر العام",
  manual: "مبلغ مكتوب باليد",
};

export type SubscriptionPreview = {
  treesSold: number;
  feePerTreeMillimes: number | null;
  feeSource: string;
  totalMillimes: number | null;
  season: Season;
  package: { serviceOptionId: string; labelAr: string; inPackage: boolean; amountMillimes: number }[];
};

export function parsePreview(value: unknown): SubscriptionPreview | null {
  const row = rec(value);
  if (!str(row.project_id)) return null;
  return {
    treesSold: int(row.trees_sold),
    feePerTreeMillimes: num(row.fee_per_tree_millimes),
    feeSource: str(row.fee_source) ?? "global",
    totalMillimes: num(row.total_millimes),
    season: parseSeason(row.season),
    package: arr(row.package).map((entry) => {
      const p = rec(entry);
      return {
        serviceOptionId: str(p.service_option_id) ?? "",
        labelAr: str(p.label_ar) ?? "",
        inPackage: bool(p.in_package),
        amountMillimes: int(p.amount_millimes),
      };
    }),
  };
}
