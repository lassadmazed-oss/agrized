// What ONE ROW of the Finance queue looks like once it has crossed the wire, and nothing else.
//
// A PLAIN module on purpose: no "use client", no "server-only". The queue is a Server Component, the
// record-a-payment form is a Client Component, and both sides need these shapes. A Server Component cannot
// import a VALUE from a "use client" module, so the shared vocabulary of a feature lives in a module that
// carries no directive at all.
//
// IT OWNS ALMOST NOTHING. A queue row IS a schedule line — public.staff_installments builds each row as
// `{ …which contract and client, installment: <one line of app.contract_money> }`, the very same jsonb the
// contract page renders. So the line vocabulary (Installment · LineStatus · Stage · the tones · lineTone) is
// imported from ../contracts/contract-model and re-exported here, not restated. Two copies of «what does
// status='partial' mean» is how a colour and a filter end up disagreeing about the same row.
//
// WHAT IT ADDS is only what the queue has and a contract page does not: the filter vocabulary, and the
// envelope staff_installments wraps its rows in.
//
// NOTHING HERE COMPUTES ANYTHING, and in this module that rule has teeth. Report v3 §29 says the schedule is
// generated from the contract; §31 says lateness has named stages. Every one of those figures — what is owed
// on a line, what has been paid against it, what is left, whether it is late, by how many days, which rung of
// §31 the contract stands on — is decided in Postgres and arrives already decided. This file parses jsonb and
// refuses the parts of it that are not the shape they claim. It does not add, divide, round or compare a date.

import {
  parseLine,
  type Installment,
  type Stage,
} from "../contracts/contract-model";

// The one vocabulary, passed through so a queue file never imports from two places to describe one row.
export {
  LINE_TONES,
  STAGE_TONES,
  lineTone,
  stageIsLate,
  stageWorthShowing,
} from "../contracts/contract-model";
export type { Installment, LineStatus, Receipt, Stage } from "../contracts/contract-model";

// ---------------------------------------------------------------------------
// The filters
// ---------------------------------------------------------------------------

/**
 * The six filters public.staff_installments accepts, spelled exactly as it spells them — anything else and it
 * raises invalid_installment_filter, so this list is a copy of a CHECK and not a menu invented here.
 *
 *   attention  late OR closing in — the two things a collections screen exists for. The default.
 *   due_soon   within installments.reminder_days_before of its date (v2 §36 «قبل القسط: Reminder»).
 *   overdue    past its date PLUS installments.grace_days_after (v2 §36 «بعده: Overdue»).
 *   critical   the CONTRACT stands at §31's «Critical / Contract Review».
 *   unpaid     everything still owed, whatever its date.
 *   all        every line of every live contract.
 */
export const INSTALLMENT_FILTERS = ["attention", "due_soon", "overdue", "critical", "unpaid", "all"] as const;
export type InstallmentFilter = (typeof INSTALLMENT_FILTERS)[number];

/**
 * The filter names, in Arabic. Back Office navigation copy written in code, the precedent
 * src/components/admin/nav-model.ts set for staff labels — every STATUS word still comes from the database.
 *
 * None of them names a number of days or of missed instalments: «قرّب موعدها» is whatever
 * installments.reminder_days_before says today, and «مراجعة العقد» is installments.late_stage2_missed. The
 * figures are printed beside the tiles, read from the payload.
 */
export const FILTER_LABELS: Record<InstallmentFilter, string> = {
  attention: "يلزمها تدخّل",
  due_soon: "قرّب موعدها",
  overdue: "متأخرة",
  critical: "مراجعة العقد",
  unpaid: "مازالت ما تخلّصتش",
  all: "الكل",
};

export type InstallmentCounts = Record<InstallmentFilter, number>;

// ---------------------------------------------------------------------------
// The shapes
// ---------------------------------------------------------------------------

/**
 * One row of the queue: a schedule line, plus who owes it and under which contract.
 *
 * The contract identity is flattened onto the row by staff_installments because the queue crosses contracts —
 * a page listing forty lines from thirty files needs the client's name on every one of them.
 */
export type QueueRow = {
  contractId: string;
  contractNo: string;
  personId: string;
  personName: string | null;
  personPhone: string | null;
  offerCode: string | null;
  /** The CONTRACT's rung of §31, so a row says what the whole file is facing, not just this line. */
  stage: Stage;
  stageLabel: string;
  /** The line itself — the same object the contract page renders. */
  installment: Installment;
};

export type InstallmentList = {
  /** public.feature_flags.state for `installments`. The screen says «معطّل» instead of pretending. */
  moduleState: "disabled" | "internal" | "public";
  filter: InstallmentFilter;
  limit: number;
  /** settings installments.grace_days_after: how long after the date a payment is still not «متأخر». */
  graceDays: number;
  /** settings installments.reminder_days_before: what «قرّب موعدها» means today. */
  reminderDays: number;
  /** settings installments.late_stage1_missed: missed lines that raise §31's «Late Payment 1». */
  late1Missed: number;
  /** settings installments.late_stage2_missed: missed lines that put a contract under review. */
  late2Missed: number;
  matched: number;
  capped: boolean;
  counts: InstallmentCounts;
  rows: QueueRow[];
};

/**
 * What recording a payment answers with. staff_record_installment returns the whole contract payload, which
 * this module does not re-render — every figure it changed is derived, so the screen re-reads from the server
 * instead of trusting a shape that travelled through a form. All that is kept is the receipt number Finance
 * reads to the client on the phone.
 *
 * The type lives here and not in actions.ts because a "use server" module may only export async functions.
 */
export type InstallmentResult = { ok: true; receiptNo: string | null } | { ok: false; message: string };

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
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Math.trunc(Number(value));
  }
  return 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

const STAGES: readonly string[] = ["idle", "ok", "reminder", "overdue", "late1", "critical", "settled"];

function stageOf(value: unknown): Stage {
  const raw = typeof value === "string" ? value : "";
  return STAGES.includes(raw) ? (raw as Stage) : "idle";
}

function moduleState(value: unknown): "disabled" | "internal" | "public" {
  return value === "public" || value === "internal" ? value : "disabled";
}

export function parseRow(input: unknown): QueueRow | null {
  const row = obj(input);
  const installment = parseLine(row.installment);
  const contractId = str(row.contract_id);
  // A row without its line is not a row: the whole point of the queue is the line, and rendering the client's
  // name over nothing would read as «this person owes something» with no way to see what.
  if (!installment || !contractId) return null;

  return {
    contractId,
    contractNo: str(row.contract_no) ?? "",
    personId: str(row.person_id) ?? "",
    personName: str(row.person_name),
    personPhone: str(row.person_phone),
    offerCode: str(row.offer_code),
    stage: stageOf(row.stage),
    stageLabel: str(row.stage_label) ?? "",
    installment,
  };
}

const EMPTY_COUNTS: InstallmentCounts = {
  attention: 0,
  due_soon: 0,
  overdue: 0,
  critical: 0,
  unpaid: 0,
  all: 0,
};

/**
 * The filter, defaulting to «يلزمها تدخّل» — which is also staff_installments' own default.
 *
 * Not «متأخرة», although that is the queue Finance is looking for: `attention` is late OR closing in, ordered
 * late first, so the broad filter IS the urgent one with the week ahead under it. A screen that opened on
 * «متأخرة» would be empty on a good week and would have taught the reader nothing about the rest of the month.
 */
export function parseFilter(input: unknown): InstallmentFilter {
  const raw = typeof input === "string" ? input : "";
  return (INSTALLMENT_FILTERS as readonly string[]).includes(raw) ? (raw as InstallmentFilter) : "attention";
}

export function parseList(input: unknown): InstallmentList {
  const payload = obj(input);
  const counts = obj(payload.counts);

  return {
    moduleState: moduleState(payload.module_state),
    filter: parseFilter(payload.filter),
    limit: num(payload.limit),
    graceDays: num(payload.grace_days),
    reminderDays: num(payload.reminder_days),
    late1Missed: num(payload.late1_missed),
    late2Missed: num(payload.late2_missed),
    matched: num(payload.matched),
    capped: bool(payload.capped),
    counts: {
      ...EMPTY_COUNTS,
      attention: num(counts.attention),
      due_soon: num(counts.due_soon),
      overdue: num(counts.overdue),
      critical: num(counts.critical),
      unpaid: num(counts.unpaid),
      all: num(counts.all),
    },
    rows: Array.isArray(payload.rows)
      ? payload.rows.flatMap((entry) => {
          const parsed = parseRow(entry);
          return parsed ? [parsed] : [];
        })
      : [],
  };
}

/** The AGZ-PAY number of whatever receipt a write just produced, dug out of the contract payload it answers with. */
export function newestReceiptNo(input: unknown): string | null {
  const payload = obj(input);
  const payments = payload.payments;
  if (!Array.isArray(payments) || payments.length === 0) return null;
  // app.contract_payload lists payments newest first, so the row this call just wrote is the head of the list.
  return str(obj(payments[0]).reference_no);
}

// ---------------------------------------------------------------------------
// Arabic for the number Postgres already worked out
// ---------------------------------------------------------------------------

/**
 * «متأخر بـ…», said the way a person says it.
 *
 * It words a number the database computed (days_late, already counted from the due date PLUS the grace the
 * owner granted) and works nothing out itself. There is no «باقيلو» twin: app.contract_money returns days_late
 * and nothing else, and inventing a countdown here would mean subtracting dates in the browser's timezone
 * against a due date Postgres set in Africa/Tunis.
 */
export function daysLateLabel(daysLate: number | null): string | null {
  if (daysLate === null || daysLate <= 0) return null;
  if (daysLate === 1) return "متأخر بيوم";
  if (daysLate === 2) return "متأخر بيومين";
  return `متأخر بـ${daysLate} يوم`;
}

/** «القسط 7» — a line's place in its plan. The queue does not know the plan's length, so it never says «من 84». */
export function seqLabel(seq: number): string {
  return `القسط ${seq}`;
}

/** Money, exact to the millime when it is not a round dinar. Defined once, in ../contracts/contract-model. */
export { formatAmount } from "../contracts/contract-model";
