// What a contract looks like once it has crossed the wire, and nothing else.
//
// A PLAIN module on purpose: no "use client", no "server-only". The queue, the document page and the
// client-file card are Server Components; the acts are Client Components; both sides need these shapes. A
// Server Component cannot import a VALUE from a "use client" module — it receives a client-reference proxy —
// so the shared vocabulary of a feature has to live in a module that carries no directive at all. This is the
// same file reservation-model.tsx is, for the same reason.
//
// IT MIRRORS app.contract_payload FIELD FOR FIELD (supabase/pending/bb_60_contracts_installments.sql), down to
// the nesting: everything about money arrives under `money`, from app.contract_money, and this file keeps it
// there rather than flattening it. Flattening would hide which figures are STORED on the contract row — the
// frozen plan: monthly, last instalment, count, markup — and which are DERIVED on every read — what has been
// paid, what is late, which §31 stage the file is on. That distinction is the whole design, and a reader of
// this type should be able to see it.
//
// NOTHING HERE COMPUTES ANYTHING, and in this module the rule has teeth: every figure is money.
// app.financed_quote rounds the monthly UP to the rounding step and then recomputes the instalment count from
// the rounded figure, so `monthly × months` is NOT the balance — on this database's own rows it overcharges
// four plans out of five, AGZ-2026-000033 by 24,000 millimes. Nothing in TypeScript may ever multiply, divide
// or subtract two of these fields — and that includes the ×1000 between dinars and millimes: the two unit
// conversions live in formatAmount()/dinarsFieldValue() below and in dinarsToMillimes(), and all three split
// the DIGITS AS TEXT rather than divide a float.
//
// The Arabic of every status is the database's too — settings contracts.status_labels,
// installments.stage_labels, installments.line_status_labels, payments.kind_labels — which is why every
// *Label below is a string from the server. The tone maps here carry COLOUR only.

import type { PillTone } from "@/components/ui";
import { formatMillimes } from "@/lib/format";

// ---------------------------------------------------------------------------
// The three vocabularies, kept apart
// ---------------------------------------------------------------------------
//
// The spec gives three incompatible state lists and never reconciles them: v3 §27's client pipeline
// («مثلاً»), v3 §21's parcel map colours, and v2 §28's parcel statuses. Two of the three are about the PARCEL,
// one is about the PERSON. 0063:277 already refused that merge for reservations — «Not public.lead_statuses:
// that is the person's pipeline stage» — and this module keeps the same three layers apart:
//
//   the CONTRACT   public.contract_status, below. Its Arabic is settings contracts.status_labels.
//   the PERSON     public.lead_statuses, advanced separately («في طور التعاقد» → «مالك»).
//   the TREE       public.tree_state — a tree goes to `sold` at the contract moment (0054:83) and no fourth
//                  state is added. Ownership is a CONTRACT-level fact (ownedAt), because v2 §38 puts it after
//                  «اكتمال الشروط القانونية», which is neither the signature nor the last instalment.

/** public.contract_status. Fixed because the code branches on it; its Arabic is not. */
export type ContractStatus = "draft" | "signed" | "completed" | "cancelled";

export const CONTRACT_STATUSES: readonly ContractStatus[] = ["draft", "signed", "completed", "cancelled"];

/** Colour only — never a label. A draft is waiting for somebody; a cancelled contract is history. */
export const CONTRACT_TONES: Record<ContractStatus, PillTone> = {
  draft: "warning",
  signed: "success",
  completed: "brand",
  cancelled: "neutral",
};

/**
 * §31's ladder, computed by app.contract_money against the four settings under `installments.` and the live
 * payment rows, and returned as `money.stage`.
 *
 * It is DERIVED at read time and never stored, for the reason both documents give twice: «لا يوجد فسخ آلي»
 * (v2 §36) and «ما نخليوش النظام يلغي… وحده» (v3 §31). A stage stored on a row would need a scheduler to
 * maintain it, and a scheduler that moves a contract is the one thing the spec forbids outright.
 *
 *   idle      cancelled, or no schedule to judge — the ladder does not apply
 *   ok        on track, nothing due soon
 *   reminder  v2 §36 «قبل القسط» — installments.reminder_days_before
 *   overdue   v2 §36 «بعده», past installments.grace_days_after but below stage 1
 *   late1     v3 §31 «Late Payment 1» — installments.late_stage1_missed missed instalments
 *   critical  v3 §31 «Critical / Contract Review» — installments.late_stage2_missed
 *   settled   every line paid
 *
 * The «شهرين» in §31 is NOT a threshold: the spec introduces it as «ناقشنا قاعدة تجارية» and then replaces it
 * with this ladder, which it calls «الصحيح تقنياً». Nothing here may hard-code 60 days.
 */
export type Stage = "idle" | "ok" | "reminder" | "overdue" | "late1" | "critical" | "settled";

export const STAGES: readonly Stage[] = ["idle", "ok", "reminder", "overdue", "late1", "critical", "settled"];

export const STAGE_TONES: Record<Stage, PillTone> = {
  idle: "neutral",
  ok: "neutral",
  reminder: "info",
  overdue: "warning",
  late1: "attention",
  critical: "danger",
  settled: "brand",
};

/** The stages worth a pill. «ماشي مليح» is not news, and a badge on every row is a badge nobody reads. */
export function stageWorthShowing(stage: Stage): boolean {
  return stage !== "idle" && stage !== "ok";
}

/** The three rungs that mean somebody has stopped paying — the same set staff_contracts filters `late` on. */
export function stageIsLate(stage: Stage): boolean {
  return stage === "overdue" || stage === "late1" || stage === "critical";
}

/**
 * One schedule line's payment state, from app.contract_money's waterfall over the live payments.
 * `isLate` is a SEPARATE fact on the line, not a fourth value here: a line can be unpaid and not yet late.
 */
export type LineStatus = "paid" | "partial" | "unpaid";

export const LINE_STATUSES: readonly LineStatus[] = ["paid", "partial", "unpaid"];

export const LINE_TONES: Record<LineStatus, PillTone> = {
  paid: "success",
  partial: "info",
  unpaid: "neutral",
};

/** A late line is red whatever it has been part-paid: lateness is the fact a reader is scanning for. */
export function lineTone(line: Installment): PillTone {
  return line.isLate ? "danger" : LINE_TONES[line.status];
}

// ---------------------------------------------------------------------------
// The shapes
// ---------------------------------------------------------------------------

/**
 * A receipt hanging off one schedule line — the thin form app.contract_money returns under `lines[].receipts`.
 *
 * v3 §29 asks each instalment for «Payment date · Payment method · Receipt · Reference bancaire». All four are
 * properties of a PAYMENT, not of an expectation, so the line carries none of them and they are read from
 * public.payments through here. That is also why voiding a receipt takes the schedule back with it: nothing
 * about money was ever written onto the line.
 */
export type Receipt = {
  id: string;
  referenceNo: string;
  amountMillimes: number;
  methodLabel: string | null;
  reference: string | null;
  receivedAt: string;
  voided: boolean;
};

/**
 * A row of public.payments in full, as the contract payload lists them.
 *
 * The SAME table the عربون uses and the SAME table «زيتونتي» reads (app.zitounti_payments, 0068): there is ONE
 * money table in this product. v3 §59's three receipts — «Arabon Receipt · Down Payment Receipt · Monthly
 * Payment Receipt» — are the three values of public.payment_kind, whose Arabic is already seeded in settings
 * payments.kind_labels («عربون» · «تسبقة» · «قسط»). A receipt is this row plus its generated AGZ-PAY number;
 * there is no receipts table and no PDF engine, because neither document asks for a rendered document.
 */
export type ContractPayment = {
  id: string;
  referenceNo: string;
  kind: string;
  kindLabel: string;
  amountMillimes: number;
  /** The method as it read on the day it was recorded, not as the option list reads today. */
  methodLabel: string | null;
  /** v3 §30's «Reference bancaire»: the cheque number, the transfer reference, the number in the receipt book. */
  reference: string | null;
  receivedAt: string;
  note: string | null;
  /** The schedule line it settled, or null for the down payment. */
  installmentId: string | null;
  voided: boolean;
  voidReason: string | null;
  recordedBy: string | null;
};

/** One line of the schedule (v3 §29, v2 §35), with everything about its money derived in SQL. */
export type Installment = {
  id: string;
  /** 1..N — v2 §35's «Installment number». A line has no reference of its own: a generated number would name
   *  an expectation rather than money, and clients quote numbers as if they were receipts. */
  seq: number;
  dueOn: string;
  amountMillimes: number;
  paidMillimes: number;
  leftMillimes: number;
  status: LineStatus;
  statusLabel: string;
  /** Past the due date PLUS settings installments.grace_days_after, so the screen and the queue agree. */
  isLate: boolean;
  daysLate: number | null;
  note: string | null;
  receipts: Receipt[];
};

/**
 * Everything about one contract's money, from app.contract_money. NOTHING in here is stored.
 *
 * The waterfall — payments allocated to lines oldest-first — the per-line state, the lateness, the §31 stage
 * and all six totals are recomputed on every read. public.subscriptions (0066) is the counter-example already
 * in this codebase: it keeps a hand-set payment_status and records no dinar in public.payments, and 0066's own
 * comment admits the intended fix. Two answers to «how much has this client paid» drift apart in a week.
 */
export type ContractMoney = {
  /** The thresholds this contract was judged by, returned so a screen prints them instead of assuming them. */
  graceDays: number;
  reminderDays: number;
  late1Missed: number;
  late2Missed: number;

  /** v2 §34's «Down Payment», as agreed and frozen. */
  downPaymentMillimes: number;
  /**
   * How much of the عربون was credited against it — the frozen answer to the owner's open question
   * (settings contracts.deposit_counts_toward_down_payment). It is 0 while he has not said the deposit counts,
   * and the screen then prints the two figures side by side and never sums them.
   */
  depositCreditedMillimes: number;
  /** What is actually owed at signature: the down payment less whatever عربون was credited. */
  downPaymentDueMillimes: number;
  downPaymentPaidMillimes: number;
  downPaymentLeftMillimes: number;
  downPaymentKindLabel: string;

  /** How many schedule lines EXIST. 0 on a cash contract, and 0 on a signed one whose schedule is pending. */
  installmentsCount: number;
  scheduledMillimes: number;
  installmentsPaidMillimes: number;
  installmentsLeftMillimes: number;
  installmentsPaidCount: number;
  missedCount: number;
  nextDueOn: string | null;
  nextDueMillimes: number | null;

  stage: Stage;
  stageLabel: string;

  totalDueMillimes: number;
  totalPaidMillimes: number;
  totalLeftMillimes: number;
  isSettled: boolean;

  lines: Installment[];
};

/**
 * One contract in full, as app.contract_payload returns it.
 *
 * THE EIGHT FIELDS v2 §34 REQUIRES are all here and they are the acceptance test for this shape: Customer
 * (personName) · Parcel (offerName) · Total Price (totalPriceMillimes) · Down Payment
 * (money.downPaymentMillimes) · Payment Plan (monthlyMillimes × planInstallmentsCount) · Payment Method
 * (methodLabel) · Legal document reference (legalDocumentRef) · Signature Date (signedOn). §34 states them
 * without «مثلاً» or «مقترح», so they are law and not illustration.
 *
 * THE PLAN IS A SNAPSHOT. Every field between `paymentMode` and `planShortened` was frozen onto the contract
 * row when it was created, by one call to app.financed_quote inside that transaction. It is never recomputed:
 * the quote reads public.financing_markups and public.tree_pricing_rules, which the owner edits, so re-running
 * it would let the client's agreed monthly change between the offer and the signature.
 */
export type Contract = {
  id: string;
  referenceNo: string;
  status: ContractStatus;
  statusLabel: string;
  /**
   * Which document this is, frozen from the option list `contract_kind`. «العقد» is at least TWO documents in
   * the spec: v3 §28 lists «عقد وعد بالبيع» and «Contract final» separately and never says how one becomes the
   * other. So the kind is a list the owner extends, not an enum this code would have to grow.
   */
  kindLabel: string | null;

  personId: string;
  personName: string | null;
  personPhone: string | null;
  projectId: string;
  offerName: string | null;
  offerCode: string | null;
  requestId: string | null;
  requestNo: string | null;
  /** NOT NULL in the database: v2 §49 states «Contract → Reservation» in the singular. Two holds, two contracts. */
  reservationId: string;
  reservationNo: string | null;
  /** What the hold asked for as a عربون. Printed BESIDE the down payment and never added to it. */
  reservationDepositMillimes: number;

  /** What the contract sold. `treesSold` is counted from public.trees right now, so the two can be compared. */
  treesCount: number;
  treesSold: number;
  /** Trees still marked `reserved` behind a contract — a divergence to show, never to hide (§46). */
  treesStillReserved: number;
  firstCode: string | null;
  lastCode: string | null;

  /** 'cash' or 'installments'. A cash contract has a down payment of the whole price and ZERO schedule rows. */
  paymentMode: "cash" | "installments";
  pricePerTreeMillimes: number;
  /** v2 §34's «Total Price»: the cash price of the trees, before any financing markup. */
  totalPriceMillimes: number;
  downPaymentPercent: number | null;
  markupBp: number | null;
  /** The duration the client chose. NOT the number of instalments — see planInstallmentsCount. */
  durationMonths: number | null;

  totalFinancedMillimes: number | null;
  remainingMillimes: number | null;
  monthlyMillimes: number | null;
  /** The quote rounds the monthly UP, so the LAST line differs. This is why a schedule needs the snapshot. */
  lastInstallmentMillimes: number | null;
  /** How many instalments the FROZEN PLAN calls for. Can be fewer than durationMonths — see planShortened. */
  planInstallmentsCount: number | null;
  /** app.financed_quote cleared the balance in fewer months than the client chose, because of that rounding. */
  planShortened: boolean;

  /** v2 §34's «Payment Method», frozen as the option list read that day. */
  methodLabel: string | null;
  /** v2 §34's «Legal document reference» — the notary or registry number a human types. Not generated. */
  legalDocumentRef: string | null;
  /** v2 §34's «Signature Date». A date a human enters. The platform signs nothing: v3 §45 gives the commercial
   *  «Generate Contract Request» — a request, not an issuance — so there is no e-signature anywhere here. */
  signedOn: string | null;
  signedBy: string | null;
  /** The day the first instalment falls due. Every stage of §31 counts from it. */
  firstDueOn: string | null;

  scheduleGeneratedAt: string | null;
  /** Signed, on instalments, and no schedule yet — because `installments` was off at signature. Say so. */
  schedulePending: boolean;
  settledAt: string | null;
  /** v2 §38: «بعد اكتمال الشروط القانونية». This, and not the tree state, is what opens «زيتونتي». */
  ownedAt: string | null;
  ownedBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  treesReleased: boolean;
  note: string | null;
  createdAt: string;
  createdBy: string | null;

  money: ContractMoney;
  /** Every payment on this contract, newest first: the down payment and the instalments in one list. */
  payments: ContractPayment[];
};

/**
 * A contract is «open» while it is a draft or signed — exactly the expression staff_contracts uses for its
 * `open` filter (`c.status in ('draft','signed')`). It is a status test and not a calculation, and it is
 * written here once so no screen re-spells it.
 */
export function isOpen(contract: Contract): boolean {
  return contract.status === "draft" || contract.status === "signed";
}

/**
 * One reservation on this file that could still become a contract, as staff_person_contracts returns it.
 *
 * `blockedBy` is the database's own one-word reason — today only 'deposit', when
 * settings contracts.require_deposit_paid is on and the عربون has not been settled. The screen turns that word
 * into a sentence; it never decides for itself which holds are eligible, because staff_create_contract is the
 * one that will refuse.
 */
export type ConvertibleReservation = {
  reservationId: string;
  referenceNo: string;
  status: string;
  projectId: string;
  offerCode: string | null;
  treesHeld: number;
  requestId: string | null;
  blockedBy: string | null;
};

/** Everything a write in this module answers with: the contract as it now stands, or a sentence. */
export type ContractResult = { ok: true; contract: Contract } | { ok: false; message: string };

/**
 * What the two acts that touch public.payments answer with: success, or a sentence. NOT a contract payload,
 * and that is a boundary rather than laziness — public.staff_void_payment is the reservations module's
 * function (0063:931) and returns a RESERVATION payload when the row had a reservation behind it, so its shape
 * depends on which row was voided. The screen re-reads instead, which is right anyway: every figure these acts
 * change is derived, so a payload built at write time would be a second opinion about numbers Postgres
 * recomputes on demand.
 */
export type MoneyResult = { ok: true } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/**
 * The seven filters public.staff_contracts accepts, in its own words — it raises `invalid_contract_filter` for
 * anything else, so this list is not a preference. The ORDER inside a filter is the order of attention and is
 * decided in SQL: §31's critical files, then the merely late, then drafts waiting for a signature, then the
 * rest. A contract list sorted by date created would be a filing cabinet.
 */
export const CONTRACT_FILTERS = ["open", "draft", "signed", "late", "owned", "closed", "all"] as const;

export type ContractFilter = (typeof CONTRACT_FILTERS)[number];

/**
 * The filter names, in Arabic. Back Office navigation copy written in code, the precedent
 * src/components/admin/nav-model.ts set for staff labels — public copy still comes from `settings`, and so
 * does every status word these filters group.
 */
export const FILTER_LABELS: Record<ContractFilter, string> = {
  open: "المفتوحة",
  draft: "ما تمضاوش",
  signed: "ممضية",
  late: "فيها تأخير",
  owned: "ولّاو ملاّك",
  closed: "مسكّرة",
  all: "الكل",
};

export const FILTER_NOTES: Record<ContractFilter, string> = {
  open: "كل عقد مازال حيّ: مشروع عقد ولا ممضي. الترتيب حسب اللي يلزمو تدخّل اليوم.",
  draft: "العقد تكتب والزيتونات تباعت، أما تاريخ الإمضاء مازال فارغ.",
  signed: "ممضية والخلاص ماشي.",
  late: "فات قسط ولا أكثر وما وصلش بعد مهلة السماح (البند 31).",
  owned: "كمّلت الشروط القانونية وتفتح «زيتونتي» (كراس الشروط v2، البند 38).",
  closed: "كمّل خلاصها ولا تفسخت.",
  all: "كل العقود.",
};

export type ContractCounts = Record<ContractFilter, number>;

export type ContractList = {
  /** public.feature_flags.state for `contracts` and for `installments`. Two modules gate this screen. */
  moduleState: "disabled" | "internal" | "public";
  installmentsState: "disabled" | "internal" | "public";
  filter: ContractFilter;
  limit: number;
  matched: number;
  capped: boolean;
  counts: ContractCounts;
  /**
   * Full contracts, not a thinner list shape — staff_contracts returns app.contract_payload for every row it
   * keeps, so the queue, the client file and the document page show the same object and a field added to one
   * appears in all three. The cap bounds the work.
   */
  rows: Contract[];
};

export type PersonContracts = {
  moduleState: "disabled" | "internal" | "public";
  installmentsState: "disabled" | "internal" | "public";
  /** settings contracts.require_deposit_paid: whether a hold must have its عربون settled to be convertible. */
  requireDepositPaid: boolean;
  contracts: Contract[];
  convertible: ConvertibleReservation[];
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

/** A percentage arrives as numeric and keeps its decimals — 20.000, not 20. */
function maybeDecimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function moduleState(value: unknown): "disabled" | "internal" | "public" {
  return value === "public" || value === "internal" ? value : "disabled";
}

function contractStatus(value: unknown): ContractStatus {
  const raw = typeof value === "string" ? value : "";
  return (CONTRACT_STATUSES as readonly string[]).includes(raw) ? (raw as ContractStatus) : "draft";
}

function stage(value: unknown): Stage {
  const raw = typeof value === "string" ? value : "";
  return (STAGES as readonly string[]).includes(raw) ? (raw as Stage) : "idle";
}

function lineStatus(value: unknown): LineStatus {
  const raw = typeof value === "string" ? value : "";
  return (LINE_STATUSES as readonly string[]).includes(raw) ? (raw as LineStatus) : "unpaid";
}

function paymentMode(value: unknown): "cash" | "installments" {
  return value === "installments" ? "installments" : "cash";
}

function parseReceipt(input: unknown): Receipt {
  const p = obj(input);
  return {
    id: str(p.id) ?? "",
    referenceNo: str(p.reference_no) ?? "",
    amountMillimes: num(p.amount_millimes),
    methodLabel: str(p.method_label),
    reference: str(p.reference),
    receivedAt: str(p.received_at) ?? "",
    voided: bool(p.voided),
  };
}

function parsePayment(input: unknown): ContractPayment {
  const p = obj(input);
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
    installmentId: str(p.installment_id),
    voided: bool(p.voided),
    voidReason: str(p.void_reason),
    recordedBy: str(p.recorded_by),
  };
}

/**
 * One schedule line of app.contract_money's `lines[]`.
 *
 * Exported because /admin/installments lists the SAME object: staff_installments returns each queue row as
 * `{ …contract identity, installment: <this line> }`, built by the very same SQL. Parsing it twice would be
 * two places to forget `is_late`, so the queue imports this one.
 */
export function parseLine(input: unknown): Installment | null {
  const row = obj(input);
  const id = str(row.id);
  if (!id) return null;
  return {
    id,
    seq: num(row.seq),
    dueOn: str(row.due_on) ?? "",
    amountMillimes: num(row.amount_millimes),
    paidMillimes: num(row.paid_millimes),
    leftMillimes: num(row.left_millimes),
    status: lineStatus(row.status),
    statusLabel: str(row.status_label) ?? lineStatus(row.status),
    isLate: bool(row.is_late),
    daysLate: maybeNum(row.days_late),
    note: str(row.note),
    receipts: Array.isArray(row.receipts) ? row.receipts.map(parseReceipt) : [],
  };
}

function parseMoney(input: unknown): ContractMoney {
  const m = obj(input);
  return {
    graceDays: num(m.grace_days),
    reminderDays: num(m.reminder_days),
    late1Missed: num(m.late1_missed),
    late2Missed: num(m.late2_missed),

    downPaymentMillimes: num(m.down_payment_millimes),
    depositCreditedMillimes: num(m.deposit_credited_millimes),
    downPaymentDueMillimes: num(m.down_payment_due_millimes),
    downPaymentPaidMillimes: num(m.down_payment_paid_millimes),
    downPaymentLeftMillimes: num(m.down_payment_left_millimes),
    downPaymentKindLabel: str(m.down_payment_kind_label) ?? "تسبقة",

    installmentsCount: num(m.installments_count),
    scheduledMillimes: num(m.scheduled_millimes),
    installmentsPaidMillimes: num(m.installments_paid_millimes),
    installmentsLeftMillimes: num(m.installments_left_millimes),
    installmentsPaidCount: num(m.installments_paid_count),
    missedCount: num(m.missed_count),
    nextDueOn: str(m.next_due_on),
    nextDueMillimes: maybeNum(m.next_due_millimes),

    stage: stage(m.stage),
    stageLabel: str(m.stage_label) ?? stage(m.stage),

    totalDueMillimes: num(m.total_due_millimes),
    totalPaidMillimes: num(m.total_paid_millimes),
    totalLeftMillimes: num(m.total_left_millimes),
    isSettled: bool(m.is_settled),

    lines: Array.isArray(m.lines)
      ? m.lines.flatMap((entry) => {
          const parsed = parseLine(entry);
          return parsed ? [parsed] : [];
        })
      : [],
  };
}

export function parseContract(input: unknown): Contract | null {
  const row = obj(input);
  const id = str(row.id);
  if (!id) return null;

  return {
    id,
    referenceNo: str(row.reference_no) ?? "",
    status: contractStatus(row.status),
    statusLabel: str(row.status_label) ?? contractStatus(row.status),
    kindLabel: str(row.kind_label),

    personId: str(row.person_id) ?? "",
    personName: str(row.person_name),
    personPhone: str(row.person_phone),
    projectId: str(row.project_id) ?? "",
    offerName: str(row.offer_name),
    offerCode: str(row.offer_code),
    requestId: str(row.request_id),
    requestNo: str(row.request_no),
    reservationId: str(row.reservation_id) ?? "",
    reservationNo: str(row.reservation_no),
    reservationDepositMillimes: num(row.reservation_deposit_millimes),

    treesCount: num(row.trees_count),
    treesSold: num(row.trees_sold),
    treesStillReserved: num(row.trees_still_reserved),
    firstCode: str(row.first_code),
    lastCode: str(row.last_code),

    paymentMode: paymentMode(row.payment_mode),
    pricePerTreeMillimes: num(row.price_per_tree_millimes),
    totalPriceMillimes: num(row.total_price_millimes),
    downPaymentPercent: maybeDecimal(row.down_payment_percent),
    markupBp: maybeNum(row.markup_bp),
    durationMonths: maybeNum(row.duration_months),

    totalFinancedMillimes: maybeNum(row.total_financed_millimes),
    remainingMillimes: maybeNum(row.remaining_millimes),
    monthlyMillimes: maybeNum(row.monthly_millimes),
    lastInstallmentMillimes: maybeNum(row.last_installment_millimes),
    planInstallmentsCount: maybeNum(row.plan_installments_count),
    planShortened: bool(row.plan_shortened),

    methodLabel: str(row.method_label),
    legalDocumentRef: str(row.legal_document_ref),
    signedOn: str(row.signed_on),
    signedBy: str(row.signed_by),
    firstDueOn: str(row.first_due_on),

    scheduleGeneratedAt: str(row.schedule_generated_at),
    schedulePending: bool(row.schedule_pending),
    settledAt: str(row.settled_at),
    ownedAt: str(row.owned_at),
    ownedBy: str(row.owned_by),
    cancelledAt: str(row.cancelled_at),
    cancelReason: str(row.cancel_reason),
    treesReleased: bool(row.trees_released),
    note: str(row.note),
    createdAt: str(row.created_at) ?? "",
    createdBy: str(row.created_by),

    money: parseMoney(row.money),
    payments: Array.isArray(row.payments) ? row.payments.map(parsePayment) : [],
  };
}

export function parseConvertible(input: unknown): ConvertibleReservation | null {
  const row = obj(input);
  const reservationId = str(row.reservation_id);
  if (!reservationId) return null;
  return {
    reservationId,
    referenceNo: str(row.reference_no) ?? "",
    status: str(row.status) ?? "",
    projectId: str(row.project_id) ?? "",
    offerCode: str(row.offer_code),
    treesHeld: num(row.trees_held),
    requestId: str(row.request_id),
    blockedBy: str(row.blocked_by),
  };
}

const EMPTY_COUNTS: ContractCounts = {
  open: 0,
  draft: 0,
  signed: 0,
  late: 0,
  owned: 0,
  closed: 0,
  all: 0,
};

export function parseFilter(input: unknown): ContractFilter {
  const raw = typeof input === "string" ? input : "";
  return (CONTRACT_FILTERS as readonly string[]).includes(raw) ? (raw as ContractFilter) : "open";
}

export function parseList(input: unknown): ContractList {
  const payload = obj(input);
  const counts = obj(payload.counts);

  return {
    moduleState: moduleState(payload.module_state),
    installmentsState: moduleState(payload.installments_state),
    filter: parseFilter(payload.filter),
    limit: num(payload.limit),
    matched: num(payload.matched),
    capped: bool(payload.capped),
    counts: {
      ...EMPTY_COUNTS,
      open: num(counts.open),
      draft: num(counts.draft),
      signed: num(counts.signed),
      late: num(counts.late),
      owned: num(counts.owned),
      closed: num(counts.closed),
      all: num(counts.all),
    },
    rows: Array.isArray(payload.rows)
      ? payload.rows.flatMap((entry) => {
          const parsed = parseContract(entry);
          return parsed ? [parsed] : [];
        })
      : [],
  };
}

export function parsePersonContracts(input: unknown): PersonContracts | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const payload = input as Json;

  return {
    moduleState: moduleState(payload.module_state),
    installmentsState: moduleState(payload.installments_state),
    requireDepositPaid: payload.require_deposit_paid !== false,
    contracts: Array.isArray(payload.contracts)
      ? payload.contracts.flatMap((entry) => {
          const parsed = parseContract(entry);
          return parsed ? [parsed] : [];
        })
      : [],
    convertible: Array.isArray(payload.convertible_reservations)
      ? payload.convertible_reservations.flatMap((entry) => {
          const parsed = parseConvertible(entry);
          return parsed ? [parsed] : [];
        })
      : [],
  };
}

// ---------------------------------------------------------------------------
// Saying a computed figure out loud
// ---------------------------------------------------------------------------
//
// These format numbers Postgres already worked out. None of them does arithmetic on money: a lateness in days
// and an instalment count arrive decided, and the only thing left is the Arabic around them.

/** «متأخّر بـ12 يوم» — daysLate is computed in SQL and already includes the grace period. */
export function daysLateLabel(daysLate: number | null): string | null {
  if (daysLate === null || daysLate <= 0) return null;
  if (daysLate === 1) return "متأخّر بيوم";
  if (daysLate === 2) return "متأخّر بيومين";
  return `متأخّر بـ${daysLate} يوم`;
}

/** «خلّص 7 قسط من 84» — both numbers are read from app.contract_money, never counted here. */
export function progressLabel(contract: Contract): string | null {
  if (contract.paymentMode !== "installments") return null;
  if (contract.money.installmentsCount === 0) return null;
  return `خلّص ${contract.money.installmentsPaidCount} قسط من ${contract.money.installmentsCount}`;
}

/**
 * The plan, said the way a commercial says it down the phone: «245 د.ت في الشهر × 12 قسط».
 *
 * The count is the FROZEN PLAN's installments_count and NOT the duration in months: app.financed_quote rounds
 * the monthly up and then recomputes the count from it, so a 84-month plan can settle in 83 instalments with a
 * smaller last one. Printing the duration here would tell the client something the schedule contradicts.
 */
export function planLine(contract: Contract, money: (millimes: number) => string): string | null {
  if (contract.paymentMode !== "installments") return null;
  if (contract.monthlyMillimes === null || contract.planInstallmentsCount === null) return null;
  return `${money(contract.monthlyMillimes)} في الشهر × ${contract.planInstallmentsCount} قسط`;
}

/** The next line still owing something — what a reader records money against without opening anything. */
export function nextLine(contract: Contract): Installment | null {
  return contract.money.lines.find((line) => line.status !== "paid") ?? null;
}

/**
 * An amount of money, exact.
 *
 * formatMillimes() rounds to whole dinars unless it is told otherwise, which is right for a headline price and
 * WRONG everywhere in this module: a remainder of 245,500 millimes would read «246 د.ت», and Finance reads
 * that figure to a client down the phone while a button beside it offers to collect «الباقي الكامل». The two
 * would disagree by half a dinar.
 *
 * So the millimes are shown whenever they are not zero — the rule src/lib/format.ts's callers already apply in
 * three places (leads/[personId]/page.tsx:794, components/admin/tree-pricing-inputs.tsx:33, the /start
 * calculator), written here once instead of copied a fourth time. The modulo asks «does this amount have a
 * fractional part», which is a question about how to PRINT it; no amount is scaled, summed or rounded.
 */
export function formatAmount(millimes: number): string {
  return formatMillimes(millimes, { withMillimes: millimes % 1000 !== 0 });
}

/**
 * The same amount as the plain decimal string a dinar input box wants: 245500 → "245.5", 6528000 → "6528".
 *
 * It SPLITS THE DIGITS AS TEXT, the exact inverse of dinarsToMillimes in ../pricing/form-values, because the
 * alternative — `millimes / 1000` — is floating-point arithmetic on money in a browser, and this box is
 * pre-filled with a remainder that a Server Action then scales back. A value that survives that round trip by
 * luck is still a value nobody can prove survives it.
 *
 * Nothing is added, multiplied or rounded: the last three characters are the millimes, whatever precedes them
 * is the dinars, and trailing zeros are dropped so the common case shows a whole number.
 */
export function dinarsFieldValue(millimes: number): string {
  const digits = String(Math.trunc(Math.abs(millimes))).padStart(4, "0");
  const whole = digits.slice(0, -3).replace(/^0+(?=\d)/, "");
  const fraction = digits.slice(-3).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
