// The shape of a visit, as the database hands it over — and nothing else.
//
// This module is imported by SERVER components (the board, the client file's card) and by CLIENT components
// (the booking form, the status buttons), so it holds no secret, imports nothing server-only and is not a
// "use client" module either: a Server Component that imports a value from a "use client" module receives a
// client-reference proxy, which cost this project a real runtime error once. Types and one tone map, no more.
//
// EVERY ARABIC WORD ABOUT A VISIT COMES FROM THE DATABASE. `status_label` is a settings row read by
// app.visit_status_label, the slot label is a snapshot of an option item, the meeting point is the offer's. The
// only thing decided here is the COLOUR of a pill, which is presentation, the way STAGE_TONES already is.

import type { PillTone } from "@/components/ui";

/** public.visit_status, fixed by report v3 §25. The Arabic of each one is a setting, never a literal here. */
export type VisitStatus = "requested" | "confirmed" | "completed" | "no_show" | "cancelled";

export const VISIT_STATUS_TONES: Record<VisitStatus, PillTone> = {
  requested: "warning",
  confirmed: "info",
  completed: "success",
  no_show: "danger",
  cancelled: "neutral",
};

export function visitTone(status: string): PillTone {
  return VISIT_STATUS_TONES[status as VisitStatus] ?? "neutral";
}

export type VisitSlot = {
  id: string;
  code: string | null;
  label_ar: string;
  time_from: string | null;
  time_to: string | null;
};

/** app.visit_terms: the window, the ceiling and the list a booking form must obey. All of it from settings. */
export type VisitTerms = {
  today: string;
  min_date: string;
  max_date: string;
  max_people: number;
  closed_weekdays: number[];
  meeting_point: string | null;
  slots: VisitSlot[];
};

export type VisitStatusOption = { code: VisitStatus; label: string };

export type Visit = {
  id: string;
  visit_no: string;
  status: VisitStatus;
  status_label: string;
  visit_date: string;
  slot_label: string;
  slot_from: string | null;
  slot_to: string | null;
  people_count: number;
  contact_channel: string;
  client_note: string | null;
  meeting_point: string | null;
  staff_note: string | null;
  source: "staff" | "client";
  created_at: string;
  status_changed_at: string;
  cancel_reason: string | null;
  person: { id: string; full_name: string; phone_e164: string | null; whatsapp_e164: string | null };
  offer: {
    id: string;
    code: string | null;
    name: string;
    latitude: number | null;
    longitude: number | null;
    location_description: string | null;
    governorate: string | null;
    delegation: string | null;
  };
  assigned: { id: string; full_name: string } | null;
  request: { id: string; request_no: string } | null;
  outcome: {
    liked: boolean | null;
    project_id: string | null;
    project_code: string | null;
    project_name: string | null;
    next_step: string | null;
    note: string | null;
  } | null;
};

export type VisitDay = { date: string; visits: Visit[] };

/** One demand that ticked «نحب نزور الأرض» and still has no visit behind it. */
export type WaitingDemand = {
  request_id: string;
  request_no: string;
  created_at: string;
  request_kind: string;
  person_id: string;
  person_name: string;
  phone_e164: string | null;
  contact_channel: string | null;
  contact_time: string | null;
  trees: number | null;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
};

export type VisitBoard = {
  range: { from: string; to: string; today: string };
  terms: VisitTerms;
  statuses: VisitStatusOption[];
  counts: { total: number; requested: number; confirmed: number; completed: number; no_show: number; cancelled: number; today: number };
  days: VisitDay[];
  waiting: WaitingDemand[];
  waiting_total: number;
};

/** An offer this person may be shown: one they asked about, or one they already hold trees in. */
export type VisitOffer = {
  project_id: string;
  code: string | null;
  name: string;
  meeting_point: string | null;
  request_id: string | null;
  request_no: string | null;
};

export type PersonVisits = {
  visits: Visit[];
  offers: VisitOffer[];
  waiting: { request_id: string; request_no: string; created_at: string; project_id: string | null; project_code: string | null; project_name: string | null }[];
  terms: VisitTerms;
  statuses: VisitStatusOption[];
};

/** «صباحاً (8:00 – 12:00)» already says the hours, so this only fills in for a slot that does not. */
export function slotHours(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  return `${from.slice(0, 5)} – ${to.slice(0, 5)}`;
}

/** The driver's link. A URL, not a business value: the coordinates are the offer's own. */
export function mapsHref(latitude: number | null, longitude: number | null): string | null {
  if (latitude === null || longitude === null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
