// What the legal desk looks like once it has crossed the wire, and nothing else.
//
// A PLAIN module on purpose: no "use client", no "server-only". The queue, the file page and the directory
// are Server Components; the checklist, the appointment form and the partner form are Client Components; both
// sides need these shapes. A Server Component cannot import a VALUE from a "use client" module — it receives
// a client-reference proxy, which has caused a real runtime crash in this repository — so the shared
// vocabulary of a feature has to live in a module carrying no directive at all. ../../contracts/contract-model.ts
// and ../../reservations/reservation-model.tsx are the same file for the same reason.
//
// IT MIRRORS app.legal_file_payload FIELD FOR FIELD (supabase/pending/bb_72_partners_closing.sql), down to the
// nesting: money stays under `money`, the people who handled the file stay under `handlers`, the checklist
// stays under `legalFile.checklist`. Flattening would hide which facts are this desk's own (there are very
// few: when the file opened, which papers were seen, when the closing is) and which are joined from the
// reservation, the trees, the payments, the visit and the demand (everything else). That distinction is the
// design.
//
// NOTHING HERE COMPUTES ANYTHING. Every stage, every Arabic label, every total and every remaining balance
// arrives decided from Postgres — including «فات ميعادو» on an appointment, which is computed on read against
// app.tunis_today() and is never a date this file works out. The tone maps below carry COLOUR only.

import type { PillTone } from "@/components/ui";

/* ------------------------------------------------------------------ parsing */

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function int(value: unknown, fallback = 0): number {
  const n = num(value);
  return n === null ? fallback : Math.trunc(n);
}
function bool(value: unknown): boolean {
  return value === true;
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/* ------------------------------------------------------------------- shapes */

/** The three moments a checklist item can block. Fixed because the database branches on them. */
export type LegalGate = "contract" | "signature" | "ownership";
export const GATES: readonly LegalGate[] = ["contract", "signature", "ownership"] as const;

/** This desk's own derived stage, from app.legal_stage. Never stored, never typed by a human. */
export type LegalStage =
  | "waiting"
  | "in_review"
  | "appointment"
  | "contracted"
  | "signed"
  | "owned"
  | "closed";

export const QUEUE_FILTERS = [
  "active",
  "waiting",
  "in_review",
  "appointment",
  "contracted",
  "signed",
  "owned",
  "all",
] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export function parseFilter(value: unknown): QueueFilter {
  return (QUEUE_FILTERS as readonly string[]).includes(String(value ?? ""))
    ? (value as QueueFilter)
    : "active";
}

/**
 * The Arabic of a STAGE is the owner's (settings legal.stage_labels) and arrives with every payload. What is
 * written here is only what the FILTER TAB says about itself — page copy, the way every other list screen in
 * this Back Office writes its own tab labels — plus one line saying what the reader is looking at.
 */
export const FILTER_LABELS: Record<QueueFilter, string> = {
  active: "الملفات المفتوحة",
  waiting: "مستنّي المكتب",
  in_review: "في يدّي",
  appointment: "موعد محدد",
  contracted: "عقد مسوّدة",
  signed: "ممضى",
  owned: "تمّ البيع",
  all: "الكل",
};

export const FILTER_NOTES: Record<QueueFilter, string> = {
  active: "كل ملف مازال يحتاج تدخّل.",
  waiting: "خلّص العربون وحتى حدّ ما فتحلوش الملف القانوني.",
  in_review: "الملف مفتوح وما فماش موعد محدد.",
  appointment: "موعد إمضاء العقد محدد.",
  contracted: "العقد تكتب ومازال ما تمضاش.",
  signed: "تمضى ومازال التملّك ما تسجّلش.",
  owned: "التملّك تسجّل والحريف ولّى مالك.",
  all: "كل ملف وصل للمكتب القانوني.",
};

const STAGE_TONES: Record<LegalStage, PillTone> = {
  waiting: "attention",
  in_review: "progress",
  appointment: "info",
  contracted: "warning",
  signed: "brand",
  owned: "success",
  closed: "neutral",
};

export function stageTone(stage: string): PillTone {
  return STAGE_TONES[stage as LegalStage] ?? "neutral";
}

export type ChecklistItem = {
  id: string;
  code: string;
  label: string;
  isMandatory: boolean;
  requiredAt: LegalGate;
  doneAt: string | null;
  doneBy: string | null;
  note: string | null;
  waivedAt: string | null;
  waivedBy: string | null;
  waiveReason: string | null;
};

export type Checklist = {
  total: number;
  settled: number;
  mandatoryTotal: number;
  mandatoryOpen: number;
  /** How many mandatory items are still open AT each gate, decided in SQL. */
  blocking: Record<string, number>;
  items: ChecklistItem[];
};

export type LegalFileRecord = {
  id: string;
  openedAt: string;
  openedBy: string | null;
  note: string | null;
  checklist: Checklist;
};

export type Appointment = {
  id: string;
  status: string;
  statusLabel: string;
  meetOn: string;
  meetAt: string | null;
  isPast: boolean;
  isToday: boolean;
  place: string | null;
  partnerId: string | null;
  partnerLabel: string | null;
  partnerPhone: string | null;
  documentsNote: string | null;
  note: string | null;
  cancelReason: string | null;
  createdBy: string | null;
};

export type ContractRef = {
  id: string;
  referenceNo: string;
  status: string;
  statusLabel: string;
  kindLabel: string | null;
  legalDocumentRef: string | null;
  signedOn: string | null;
  signedBy: string | null;
  ownedAt: string | null;
  treesCount: number;
};

export type Plan = {
  source: string;
  paymentMode: string | null;
  downPaymentPercent: number | null;
  downPaymentMillimes: number | null;
  durationMonths: number | null;
  monthlyMillimes: number | null;
  lastInstallmentMillimes: number | null;
  installmentsCount: number | null;
  totalFinancedMillimes: number | null;
  remainingMillimes: number | null;
};

export type Money = {
  /** 'contract' once one exists — its frozen figures win — else 'offer' or 'request'. */
  priceSource: string;
  trees: number;
  pricePerTreeMillimes: number | null;
  totalPriceMillimes: number | null;
  paidMillimes: number;
  remainingMillimes: number | null;
  depositDueMillimes: number;
  depositPaidMillimes: number;
  depositLeftMillimes: number;
  depositPaidAt: string | null;
  plan: Plan;
};

/** §17's «أنا Commercial Terrain وأنا Agent تيليفون»: facts the CRM already knew and nobody had joined. */
export type Handlers = {
  phoneAgent: string | null;
  fieldCommercial: string | null;
  visitNo: string | null;
  visitDate: string | null;
  visitStatusLabel: string | null;
  visitNote: string | null;
  reservedBy: string | null;
  depositTakenBy: string | null;
  depositReceiptNo: string | null;
  depositReceivedAt: string | null;
};

export type TeamNote = { at: string | null; team: string; body: string; who: string | null };

export type LegalFile = {
  reservationId: string;
  reservationNo: string;
  reservationStatusLabel: string;
  reservedAt: string | null;
  expiresAt: string | null;
  conditionsAr: string | null;

  stage: LegalStage;
  stageLabel: string;

  personId: string;
  personName: string;
  personPhone: string | null;
  personWhatsapp: string | null;
  personEmail: string | null;
  personGovernorate: string | null;

  projectId: string;
  offerCode: string | null;
  offerName: string | null;
  requestId: string | null;
  requestNo: string | null;

  treesCount: number;
  treesHeld: number;
  treesSold: number;
  firstCode: string | null;
  lastCode: string | null;
  treeCodes: string[];
  treeCodesCapped: boolean;

  money: Money;
  handlers: Handlers;
  notes: TeamNote[];

  legalFile: LegalFileRecord | null;
  appointment: Appointment | null;
  contract: ContractRef | null;

  contractsModuleState: string;
  requireOpenFileAt: string;
  allowWaiver: boolean;
  gateLabels: Record<string, string>;
  appointmentMinDate: string | null;
  appointmentMaxDate: string | null;
};

export type LegalQueue = {
  filter: QueueFilter;
  matched: number;
  capped: boolean;
  counts: Record<string, number>;
  stageLabels: Record<string, string>;
  contractsModuleState: string;
  rows: LegalFile[];
};

/** One row of §20's TEMPLATE — the owner's list, as opposed to the copy a file carries. */
export type ChecklistTemplateItem = {
  id: string;
  code: string;
  label: string;
  help: string | null;
  isMandatory: boolean;
  requiredAt: LegalGate;
  sortOrder: number;
  isActive: boolean;
};

export type ChecklistTemplate = {
  /** app.is_admin(): a legal reader sees the list and no editor, because a row here is a rule. */
  canEdit: boolean;
  gateLabels: Record<string, string>;
  rows: ChecklistTemplateItem[];
};

export type Partner = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  officeName: string | null;
  governorateId: number | null;
  governorate: string | null;
  specialityOptionId: string | null;
  specialityLabel: string | null;
  isAvailable: boolean;
  availabilityNote: string | null;
  note: string | null;
  isActive: boolean;
  openAppointments: number;
};

export type NamedOption = { id: string; label: string };
export type NamedGovernorate = { id: number; label: string };

export type PartnerDirectory = {
  rows: Partner[];
  specialities: NamedOption[];
  governorates: NamedGovernorate[];
};

/* ------------------------------------------------------------------ parsers */

function parseLabels(value: unknown): Record<string, string> {
  const source = obj(value);
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) if (typeof raw === "string") out[key] = raw;
  return out;
}

function parseCounts(value: unknown): Record<string, number> {
  const source = obj(value);
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(source)) {
    const n = num(raw);
    if (n !== null) out[key] = n;
  }
  return out;
}

function parseChecklist(value: unknown): Checklist {
  const row = obj(value);
  return {
    total: int(row.total),
    settled: int(row.settled),
    mandatoryTotal: int(row.mandatory_total),
    mandatoryOpen: int(row.mandatory_open),
    blocking: parseCounts(row.blocking),
    items: list(row.items).map((raw) => {
      const item = obj(raw);
      return {
        id: text(item.id),
        code: text(item.code),
        label: text(item.label_ar),
        isMandatory: bool(item.is_mandatory),
        requiredAt: (text(item.required_at, "contract") as LegalGate) ?? "contract",
        doneAt: str(item.done_at),
        doneBy: str(item.done_by),
        note: str(item.note),
        waivedAt: str(item.waived_at),
        waivedBy: str(item.waived_by),
        waiveReason: str(item.waive_reason),
      };
    }),
  };
}

function parsePlan(value: unknown): Plan {
  const row = obj(value);
  return {
    source: text(row.source, "request"),
    paymentMode: str(row.payment_mode),
    downPaymentPercent: num(row.down_payment_percent),
    downPaymentMillimes: num(row.down_payment_millimes),
    durationMonths: num(row.duration_months),
    monthlyMillimes: num(row.monthly_millimes),
    lastInstallmentMillimes: num(row.last_installment_millimes),
    installmentsCount: num(row.installments_count),
    totalFinancedMillimes: num(row.total_financed_millimes),
    remainingMillimes: num(row.remaining_millimes),
  };
}

export function parseLegalFile(value: unknown): LegalFile {
  const row = obj(value);
  const money = obj(row.money);
  const handlers = obj(row.handlers);
  const file = row.legal_file ? obj(row.legal_file) : null;
  const appointment = row.appointment ? obj(row.appointment) : null;
  const contract = row.contract ? obj(row.contract) : null;

  return {
    reservationId: text(row.reservation_id),
    reservationNo: text(row.reservation_no),
    reservationStatusLabel: text(row.reservation_status_label),
    reservedAt: str(row.reserved_at),
    expiresAt: str(row.expires_at),
    conditionsAr: str(row.conditions_ar),

    stage: (text(row.stage, "waiting") as LegalStage) ?? "waiting",
    stageLabel: text(row.stage_label, text(row.stage)),

    personId: text(row.person_id),
    personName: text(row.person_name),
    personPhone: str(row.person_phone),
    personWhatsapp: str(row.person_whatsapp),
    personEmail: str(row.person_email),
    personGovernorate: str(row.person_governorate),

    projectId: text(row.project_id),
    offerCode: str(row.offer_code),
    offerName: str(row.offer_name),
    requestId: str(row.request_id),
    requestNo: str(row.request_no),

    treesCount: int(row.trees_count),
    treesHeld: int(row.trees_held),
    treesSold: int(row.trees_sold),
    firstCode: str(row.first_code),
    lastCode: str(row.last_code),
    treeCodes: list(row.tree_codes).map((code) => text(code)).filter((code) => code.length > 0),
    treeCodesCapped: bool(row.tree_codes_capped),

    money: {
      priceSource: text(money.price_source, "offer"),
      trees: int(money.trees),
      pricePerTreeMillimes: num(money.price_per_tree_millimes),
      totalPriceMillimes: num(money.total_price_millimes),
      paidMillimes: int(money.paid_millimes),
      remainingMillimes: num(money.remaining_millimes),
      depositDueMillimes: int(money.deposit_due_millimes),
      depositPaidMillimes: int(money.deposit_paid_millimes),
      depositLeftMillimes: int(money.deposit_left_millimes),
      depositPaidAt: str(money.deposit_paid_at),
      plan: parsePlan(money.plan),
    },

    handlers: {
      phoneAgent: str(handlers.phone_agent),
      fieldCommercial: str(handlers.field_commercial),
      visitNo: str(handlers.visit_no),
      visitDate: str(handlers.visit_date),
      visitStatusLabel: str(handlers.visit_status_label),
      visitNote: str(handlers.visit_note),
      reservedBy: str(handlers.reserved_by),
      depositTakenBy: str(handlers.deposit_taken_by),
      depositReceiptNo: str(handlers.deposit_receipt_no),
      depositReceivedAt: str(handlers.deposit_received_at),
    },

    notes: list(row.notes)
      .map((raw) => {
        const note = obj(raw);
        return { at: str(note.at), team: text(note.team), body: text(note.body), who: str(note.who) };
      })
      .filter((note) => note.body.length > 0),

    legalFile: file
      ? {
          id: text(file.id),
          openedAt: text(file.opened_at),
          openedBy: str(file.opened_by),
          note: str(file.note),
          checklist: parseChecklist(file.checklist),
        }
      : null,

    appointment: appointment
      ? {
          id: text(appointment.id),
          status: text(appointment.status),
          statusLabel: text(appointment.status_label, text(appointment.status)),
          meetOn: text(appointment.meet_on),
          meetAt: str(appointment.meet_at),
          isPast: bool(appointment.is_past),
          isToday: bool(appointment.is_today),
          place: str(appointment.place),
          partnerId: str(appointment.partner_id),
          partnerLabel: str(appointment.partner_label),
          partnerPhone: str(appointment.partner_phone),
          documentsNote: str(appointment.documents_note),
          note: str(appointment.note),
          cancelReason: str(appointment.cancel_reason),
          createdBy: str(appointment.created_by),
        }
      : null,

    contract: contract
      ? {
          id: text(contract.id),
          referenceNo: text(contract.reference_no),
          status: text(contract.status),
          statusLabel: text(contract.status_label, text(contract.status)),
          kindLabel: str(contract.kind_label),
          legalDocumentRef: str(contract.legal_document_ref),
          signedOn: str(contract.signed_on),
          signedBy: str(contract.signed_by),
          ownedAt: str(contract.owned_at),
          treesCount: int(contract.trees_count),
        }
      : null,

    contractsModuleState: text(row.contracts_module_state, "disabled"),
    requireOpenFileAt: text(row.require_open_file_at, "never"),
    allowWaiver: bool(row.allow_waiver),
    gateLabels: parseLabels(row.gate_labels),
    appointmentMinDate: str(row.appointment_min_date),
    appointmentMaxDate: str(row.appointment_max_date),
  };
}

export function parseQueue(value: unknown): LegalQueue {
  const row = obj(value);
  return {
    filter: parseFilter(row.filter),
    matched: int(row.matched),
    capped: bool(row.capped),
    counts: parseCounts(row.counts),
    stageLabels: parseLabels(row.stage_labels),
    contractsModuleState: text(row.contracts_module_state, "disabled"),
    rows: list(row.rows).map(parseLegalFile),
  };
}

export function parseChecklistTemplate(value: unknown): ChecklistTemplate {
  const row = obj(value);
  return {
    canEdit: bool(row.can_edit),
    gateLabels: parseLabels(row.gate_labels),
    rows: list(row.rows).map((raw) => {
      const item = obj(raw);
      return {
        id: text(item.id),
        code: text(item.code),
        label: text(item.label_ar),
        help: str(item.help_ar),
        isMandatory: bool(item.is_mandatory),
        requiredAt: (text(item.required_at, "contract") as LegalGate) ?? "contract",
        sortOrder: int(item.sort_order),
        isActive: bool(item.is_active),
      };
    }),
  };
}

export function parsePartners(value: unknown): PartnerDirectory {
  const row = obj(value);
  return {
    rows: list(row.rows).map((raw) => {
      const partner = obj(raw);
      return {
        id: text(partner.id),
        fullName: text(partner.full_name),
        phone: str(partner.phone_e164),
        email: str(partner.email),
        officeName: str(partner.office_name),
        governorateId: num(partner.governorate_id),
        governorate: str(partner.governorate),
        specialityOptionId: str(partner.speciality_option_id),
        specialityLabel: str(partner.speciality_label),
        isAvailable: bool(partner.is_available),
        availabilityNote: str(partner.availability_note),
        note: str(partner.note),
        isActive: bool(partner.is_active),
        openAppointments: int(partner.open_appointments),
      };
    }),
    specialities: list(row.specialities).map((raw) => {
      const item = obj(raw);
      return { id: text(item.id), label: text(item.label_ar) };
    }),
    governorates: list(row.governorates).map((raw) => {
      const item = obj(raw);
      return { id: int(item.id), label: text(item.name_ar) };
    }),
  };
}

/* ------------------------------------------------------------------ reading */

/**
 * The one line under the client's name that says what this desk has to DO next. It reads the stage the
 * database derived and the checklist counts it computed; it decides nothing of its own.
 */
export function nextStepOf(file: LegalFile): string {
  if (file.stage === "waiting") return "افتح الملف القانوني باش تبدا.";
  if (file.stage === "owned") return "الملف كمّل. الحريف ولّى مالك.";
  if (file.stage === "closed") return "العقد تلغى.";

  const open = file.legalFile?.checklist.blocking ?? {};
  if (file.stage === "in_review") {
    const left = open.contract ?? 0;
    if (left > 0) return `باقي ${left} بند إجباري قبل ما يتكتب العقد.`;
    return "الوثائق كملت. احجز موعد العقد ولا اكتب العقد.";
  }
  if (file.stage === "appointment") {
    const at = file.appointment;
    if (at?.isPast) return "موعد العقد فات. سجّل شنوّة صار فيه.";
    if (at?.isToday) return "موعد العقد اليوم.";
    return "موعد العقد محدد. جهّز الوثائق.";
  }
  if (file.stage === "contracted") {
    const left = open.signature ?? 0;
    return left > 0 ? `باقي ${left} بند إجباري قبل الإمضاء.` : "الوثائق كملت. سجّل الإمضاء في وحدة العقود.";
  }
  if (file.stage === "signed") {
    const left = open.ownership ?? 0;
    return left > 0 ? `باقي ${left} بند إجباري قبل تسجيل التملّك.` : "سجّل التملّك باش يتفتح «زيتونتي».";
  }
  return "";
}

/** The trees, as §9 asks: the numbers themselves when they fit, a range when they do not. */
export function treeCodesLine(file: LegalFile): string {
  if (file.treeCodes.length === 0) return "—";
  if (!file.treeCodesCapped) return file.treeCodes.join(" · ");
  return `${file.firstCode ?? file.treeCodes[0]} … ${file.lastCode ?? ""}`;
}
