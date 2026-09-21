// What a reservation looks like once it has crossed the wire, and nothing else.
//
// A PLAIN module on purpose: no "use client", no "server-only". The list page and the client-file card are
// Server Components, the four action forms are Client Components, and both sides need these shapes. A Server
// Component cannot import a VALUE from a "use client" module — it receives a client-reference proxy — so the
// shared vocabulary of a feature has to live in a module that carries no directive at all. That mistake cost
// this project a real runtime error once; this file is the shape that avoids it.
//
// NOTHING HERE COMPUTES ANYTHING. Every figure a screen shows about a reservation — the days left, whether the
// deadline has passed, what is still owed, whether the deposit is settled — is worked out by Postgres in
// app.reservation_payload and arrives already decided (report v3 §23, §24). These parsers only read the jsonb
// the RPC returned and refuse the parts of it that are not the shape they claim. The Arabic of a status is the
// database's too (settings reservations.status_labels), which is why `statusLabel` is a string from the server
// and not a lookup table in this file.

import type { PillTone } from "@/components/ui";

/** public.reservation_status. Fixed by §23/§24 because the code branches on it; its Arabic is not. */
export type ReservationStatus = "awaiting_deposit" | "deposit_paid" | "expired" | "cancelled" | "converted";

export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "awaiting_deposit",
  "deposit_paid",
  "expired",
  "cancelled",
  "converted",
];

/** Colour only — never a label. «في انتظار العربون» is something to act on; a cancelled hold is history. */
export const RESERVATION_TONES: Record<ReservationStatus, PillTone> = {
  awaiting_deposit: "warning",
  deposit_paid: "success",
  expired: "danger",
  cancelled: "neutral",
  converted: "brand",
};

export type ReservationPayment = {
  id: string;
  referenceNo: string;
  kind: string;
  /** From settings payments.kind_labels, resolved in SQL. */
  kindLabel: string;
  amountMillimes: number;
  /** The method as it read on the day it was recorded, not as the list reads today. */
  methodLabel: string | null;
  reference: string | null;
  receivedAt: string;
  note: string | null;
  voided: boolean;
  voidReason: string | null;
  recordedBy: string | null;
};

/** One reservation in full, as app.reservation_payload returns it. */
export type Reservation = {
  id: string;
  referenceNo: string;
  status: ReservationStatus;
  statusLabel: string;

  personId: string;
  personName: string | null;
  personPhone: string | null;
  projectId: string;
  offerName: string | null;
  offerCode: string | null;
  requestId: string | null;
  requestNo: string | null;

  /** How many trees this reservation took, as a record of the act. */
  treesCount: number;
  /** How many it still holds, counted from public.trees right now. The two differ when trees were freed
   *  elsewhere — the screen says so rather than trusting one of them silently. */
  treesHeld: number;
  treesSold: number;
  firstCode: string | null;
  lastCode: string | null;

  depositDueMillimes: number;
  depositPaidMillimes: number;
  depositLeftMillimes: number;
  depositPaidAt: string | null;
  payments: ReservationPayment[];

  /** §24, snapshot at creation. 0 = no deadline was set, and expiresAt is null. */
  validDays: number;
  reservedAt: string;
  expiresAt: string | null;
  isOpen: boolean;
  /** Computed in SQL: the deadline passed and the reservation is still open. */
  isOverdue: boolean;
  /** Computed in SQL against settings reservations.expiry_soon_days: the deadline is closing in. */
  isSoon: boolean;
  /** Negative once the deadline is behind us. Null when there is no deadline, or the hold is closed. */
  daysLeft: number | null;
  conditionsAr: string | null;
  note: string | null;

  extendedCount: number;
  extendedAt: string | null;
  closedAt: string | null;
  closeReason: string | null;
  treesReleased: boolean;
  createdBy: string | null;
};

/**
 * What every write in this module answers with: the reservation as it now stands, or a sentence saying what
 * the database refused and how to fix it. The type lives here and not in actions.ts because a "use server"
 * module may only export async functions.
 */
export type ReservationResult = { ok: true; reservation: Reservation } | { ok: false; message: string };

export const RESERVATION_FILTERS = ["open", "awaiting", "soon", "overdue", "paid", "closed", "all"] as const;
export type ReservationFilter = (typeof RESERVATION_FILTERS)[number];

/**
 * The filter names, in Arabic. Back Office navigation copy written in code, the precedent
 * src/components/admin/nav-model.ts set for staff labels — public copy still comes from `settings`, and so
 * does every status word these filters group.
 */
export const FILTER_LABELS: Record<ReservationFilter, string> = {
  open: "المفتوحة",
  awaiting: "في انتظار العربون",
  soon: "قربت تنتهي",
  overdue: "انتهت مدّتها",
  paid: "العربون تخلّص",
  closed: "المغلوقة",
  all: "الكل",
};

export type ReservationCounts = Record<ReservationFilter, number>;

export type ReservationList = {
  /** public.feature_flags.state for `reservations`. The screen says «معطّل» instead of pretending. */
  moduleState: "disabled" | "internal" | "public";
  filter: ReservationFilter;
  limit: number;
  /** settings reservations.expiry_soon_days: what «قربت تنتهي» means today. */
  soonDays: number;
  matched: number;
  capped: boolean;
  counts: ReservationCounts;
  /**
   * Full reservations, not a thinner list shape. staff_reservations returns app.reservation_payload for every
   * row it keeps, so the list and a client file show the same object and a field added to one appears in both.
   */
  rows: Reservation[];
};

/** What one offer asks for a hold, resolved by app.offer_reservation_terms (offer value, then the setting). */
export type OfferTerms = {
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  depositMillimes: number;
  depositSource: "project" | "default";
  validDays: number;
  validDaysSource: "project" | "default";
  conditionsAr: string | null;
};

// ---------------------------------------------------------------------------
// Parsers — jsonb in, a shape this app can render out
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Postgres hands bigint back as a number through PostgREST; anything else is treated as «not answered». */
function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.trunc(Number(value));
  return 0;
}

function maybeNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.trunc(Number(value));
  return null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function status(value: unknown): ReservationStatus {
  const raw = typeof value === "string" ? value : "";
  return (RESERVATION_STATUSES as readonly string[]).includes(raw)
    ? (raw as ReservationStatus)
    : "awaiting_deposit";
}

function source(value: unknown): "project" | "default" {
  return value === "project" ? "project" : "default";
}

export function parseReservation(input: unknown): Reservation | null {
  const row = obj(input);
  const id = str(row.id);
  if (!id) return null;

  const payments = Array.isArray(row.payments)
    ? row.payments.map((entry) => {
        const p = obj(entry);
        return {
          id: str(p.id) ?? "",
          referenceNo: str(p.reference_no) ?? "",
          kind: str(p.kind) ?? "",
          kindLabel: str(p.kind_label) ?? str(p.kind) ?? "",
          amountMillimes: num(p.amount_millimes),
          methodLabel: str(p.method_label),
          reference: str(p.reference),
          receivedAt: str(p.received_at) ?? "",
          note: str(p.note),
          voided: bool(p.voided),
          voidReason: str(p.void_reason),
          recordedBy: str(p.recorded_by),
        } satisfies ReservationPayment;
      })
    : [];

  return {
    id,
    referenceNo: str(row.reference_no) ?? "",
    status: status(row.status),
    statusLabel: str(row.status_label) ?? status(row.status),
    personId: str(row.person_id) ?? "",
    personName: str(row.person_name),
    personPhone: str(row.person_phone),
    projectId: str(row.project_id) ?? "",
    offerName: str(row.offer_name),
    offerCode: str(row.offer_code),
    requestId: str(row.request_id),
    requestNo: str(row.request_no),

    treesCount: num(row.trees_count),
    treesHeld: num(row.trees_held),
    treesSold: num(row.trees_sold),
    firstCode: str(row.first_code),
    lastCode: str(row.last_code),

    depositDueMillimes: num(row.deposit_due_millimes),
    depositPaidMillimes: num(row.deposit_paid_millimes),
    depositLeftMillimes: num(row.deposit_left_millimes),
    depositPaidAt: str(row.deposit_paid_at),
    payments,

    validDays: num(row.valid_days),
    reservedAt: str(row.reserved_at) ?? "",
    expiresAt: str(row.expires_at),
    isOpen: bool(row.is_open),
    isOverdue: bool(row.is_overdue),
    isSoon: bool(row.is_soon),
    daysLeft: maybeNum(row.days_left),
    conditionsAr: str(row.conditions_ar),
    note: str(row.note),

    extendedCount: num(row.extended_count),
    extendedAt: str(row.extended_at),
    closedAt: str(row.closed_at),
    closeReason: str(row.close_reason),
    treesReleased: bool(row.trees_released),
    createdBy: str(row.created_by),
  };
}

export function parseTerms(input: unknown): OfferTerms | null {
  const row = obj(input);
  const projectId = str(row.project_id);
  if (!projectId) return null;
  return {
    projectId,
    projectCode: str(row.project_code),
    projectName: str(row.project_name),
    depositMillimes: num(row.deposit_millimes),
    depositSource: source(row.deposit_source),
    validDays: num(row.valid_days),
    validDaysSource: source(row.valid_days_source),
    conditionsAr: str(row.conditions_ar),
  };
}

const EMPTY_COUNTS: ReservationCounts = {
  open: 0,
  awaiting: 0,
  soon: 0,
  overdue: 0,
  paid: 0,
  closed: 0,
  all: 0,
};

export function parseFilter(input: unknown): ReservationFilter {
  const raw = typeof input === "string" ? input : "";
  return (RESERVATION_FILTERS as readonly string[]).includes(raw) ? (raw as ReservationFilter) : "open";
}

export function parseList(input: unknown): ReservationList {
  const payload = obj(input);
  const counts = obj(payload.counts);
  const state = payload.module_state;

  return {
    moduleState: state === "public" || state === "internal" ? state : "disabled",
    filter: parseFilter(payload.filter),
    limit: num(payload.limit),
    soonDays: num(payload.soon_days),
    matched: num(payload.matched),
    capped: bool(payload.capped),
    counts: {
      ...EMPTY_COUNTS,
      open: num(counts.open),
      awaiting: num(counts.awaiting),
      soon: num(counts.soon),
      overdue: num(counts.overdue),
      paid: num(counts.paid),
      closed: num(counts.closed),
      all: num(counts.all),
    },
    rows: Array.isArray(payload.rows)
      ? payload.rows.flatMap((entry) => {
          const parsed = parseReservation(entry);
          return parsed ? [parsed] : [];
        })
      : [],
  };
}

/**
 * The Arabic for «what is left of the deadline», said the way a person says it.
 *
 * It formats a number Postgres already worked out (days_left) and works nothing out itself: an expiry that is
 * a day away and one that is a day past are the same subtraction, and it was done in SQL.
 */
export function daysLeftLabel(daysLeft: number | null, expiresAt: string | null): string | null {
  if (expiresAt === null) return "بلا أجل";
  if (daysLeft === null) return null;
  if (daysLeft < 0) return `فاتت المدة بـ${Math.abs(daysLeft)} يوم`;
  if (daysLeft === 0) return "توفى اليوم";
  if (daysLeft === 1) return "باقيلها يوم";
  if (daysLeft === 2) return "باقيلها يومين";
  return `باقيلها ${daysLeft} يوم`;
}
