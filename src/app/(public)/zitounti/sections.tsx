// One section of فضاء «زيتونتي», drawn with the client's real rows.
//
// WHAT THIS FILE IS FOR. The account screen is a list of eleven sections; until today every one of them was a
// label with `href: null` and the note «يُبنى في دفعة قادمة» on it, so tapping did nothing and a signed-in
// buyer saw no figure of their own anywhere. The rows have existed the whole time — public.staff_zitounti_file
// has answered them since 0068, and its last three sections since 0095 — they had simply never been drawn for
// the person they belong to. This file draws them.
//
// IT RENDERS. IT READS NOTHING AND COMPUTES NOTHING. Every row here arrives in the payload of
// public.my_zitounti_file(); no Supabase client is imported, no total is added up, and no status is worked out
// from a date. That is not tidiness: a balance a screen computes for itself is a second answer, and the day it
// disagrees with Finance nobody can say which one the client owes. `totals`, `money` and every per-line
// paid/left/late figure below were computed once, in SQL, by the same app.contract_money the instalments queue
// reads.
//
// EVERY AMOUNT AND EVERY DATE GOES THROUGH src/lib/format.ts. Money is integer millimes in the payload and is
// never divided here; dates are rendered in Africa/Tunis by formatDate, never by toLocaleString.
//
// PHONE FIRST. This is read on a handset, standing in a field or on a bus: one column, cards stacked, the
// figure that matters largest, nothing that needs a horizontal scroll. The shapes come from @/components/ui
// (DataList, DataRow, StatusPill, EmptyState, SectionHeader) so this screen is the same system as the rest of
// the app and not a private set of divs.
//
// ---------------------------------------------------------------------------
// THE LABELS, AND THE ONE LINE THIS FILE DRAWS
// ---------------------------------------------------------------------------
// Editorial copy — every section title, the unit «زيتونة», the note explaining a harvest share — is read from
// public.settings through src/lib/config.ts and is nowhere in this file.
//
// The FIELD names of a record («تاريخ», «عدد الزيتونات», «الثمن») are inline Arabic, the way every other screen
// in this app writes them (src/app/(public)/projects/[code]/page.tsx: `<DataRow label="الصنف">`). They are the
// nouns of the record, not the owner's message.
//
// The STATUS words are the interesting case. Wherever the payload carries the Arabic already it is printed as
// it stands and nothing here has an opinion: a contract's `status_label`, an instalment line's `status_label`,
// an operation's frozen `service_ar`, a subscription line, a harvest choice. Four enums have Arabic in
// public.settings that a PUBLIC page cannot read, because those rows are seeded `is_public false`
// (reservations.status_labels, payments.kind_labels, visits.status_*). For those the setting is tried FIRST and
// a small map here is the fallback, so the day the owner publishes those rows — or a migration adds public
// copies — this screen picks his words up with no code change. Printing the bare enum code to a buyer was the
// one option not on the table.

import Link from "next/link";

import { DataList, DataRow, EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { type PublicConfig, settingJson, settingText } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { formatArea, formatCount, formatDate, formatMillimes } from "@/lib/format";
import type {
  ZitountiContractRow,
  ZitountiDocumentRow,
  ZitountiFile,
  ZitountiHarvestRow,
  ZitountiInstallmentPlan,
  ZitountiOperationRow,
  ZitountiPaymentRow,
  ZitountiRequestRow,
  ZitountiReservationRow,
  ZitountiSectionKey,
  ZitountiSubscriptionRow,
  ZitountiTreeGroup,
  ZitountiVisitRow,
} from "@/lib/zitounti";

import { ClientLoginForm } from "./login-form";

// ---------------------------------------------------------------------------
// Status words for the four enums whose Arabic is in a private setting
// ---------------------------------------------------------------------------

/**
 * The fallback Arabic for a status code, used ONLY when the owner's own row is not readable from a public page.
 * Each map's keys are the enum values the database fixed (0063 §23-§24, 0064), which is why they may be written
 * down: the code is code, the word is data, and the word is looked up before this map is reached.
 */
const RESERVATION_STATUS_AR: Record<string, string> = {
  awaiting_deposit: "محجوزة — في انتظار العربون",
  deposit_paid: "العربون تخلّص",
  expired: "انتهت مدّتها",
  cancelled: "ملغاة",
  converted: "ولّات عقد",
};

const VISIT_STATUS_AR: Record<string, string> = {
  requested: "مطلوبة",
  confirmed: "مؤكّدة",
  completed: "تمّت",
  no_show: "ما حضرش",
  cancelled: "ملغاة",
};

const PAYMENT_KIND_AR: Record<string, string> = {
  deposit: "عربون",
  down_payment: "تسبقة",
  installment: "قسط",
  other: "دفعة أخرى",
};

const OPERATION_STATUS_AR: Record<string, string> = {
  planned: "مبرمجة",
  in_progress: "في الطريق",
  done: "تعملت",
  executed: "تعملت",
  skipped: "تعدّت",
};

const SUBSCRIPTION_PAYMENT_AR: Record<string, string> = {
  unpaid: "ما تخلّصش",
  partial: "تخلّص جزء",
  paid: "تخلّص",
};

/** The owner's word for a reservation status, or the fixed Arabic for it. Never the bare code. */
function reservationStatusAr(config: PublicConfig, code: string): string {
  const owner = settingJson<Record<string, string>>(config, "reservations.status_labels", {});
  return owner[code] ?? RESERVATION_STATUS_AR[code] ?? code;
}

/** visits keeps one text setting per status (0064), so the key is built from the code. */
function visitStatusAr(config: PublicConfig, code: string): string {
  return settingText(config, `visits.status_${code}`, VISIT_STATUS_AR[code] ?? code);
}

function paymentKindAr(config: PublicConfig, code: string): string {
  const owner = settingJson<Record<string, string>>(config, "payments.kind_labels", {});
  return owner[code] ?? PAYMENT_KIND_AR[code] ?? code;
}

/*
 * The three vocabularies below were printed straight from the constants above, with no settings lookup —
 * so «تعدّت» on a client's phone was a word the owner could not change without a deployment. 0106 seeds
 * them as json maps; these read the map first and keep the constant as the fallback, exactly as
 * reservationStatusAr and paymentKindAr already do. Falling through to the bare enum code is the last
 * resort and only happens for a value nobody has named.
 */
function operationStatusAr(config: PublicConfig, code: string): string {
  const owner = settingJson<Record<string, string>>(config, "agri.operation_status_labels", {});
  return owner[code] ?? OPERATION_STATUS_AR[code] ?? code;
}

function subscriptionPaymentAr(config: PublicConfig, code: string): string {
  const owner = settingJson<Record<string, string>>(config, "subscriptions.payment_labels", {});
  return owner[code] ?? SUBSCRIPTION_PAYMENT_AR[code] ?? code;
}

function documentKindAr(config: PublicConfig, code: string): string {
  const owner = settingJson<Record<string, string>>(config, "zitounti.document_kind_labels", {});
  return owner[code] ?? DOCUMENT_KIND_AR[code] ?? code;
}

/**
 * The plural of the unit, so a label built from it is Arabic and not a concatenation.
 *
 * WHY THIS FUNCTION EXISTS AT ALL. The unit is the owner's word, read from settings zitounti.tree_unit, and it
 * is a SINGULAR — «زيتونة». Ten labels on this screen need the plural («عدد زيتونات», «رموز زيتوناتك»), and
 * gluing «ات» onto the singular produces «زيتونةات», which is not a word. A feminine singular ending in ة
 * pluralises by dropping the ة and adding ات, which is exactly right for this one and for any other unit the
 * owner is likely to type («شجرة» → «شجرات»).
 *
 * A unit that does NOT end in ة is returned untouched — if the owner writes a plural or a word of another
 * pattern, printing his word unchanged is better than inflecting it wrongly. The possessive suffixes («ـك»,
 * «ـي») then attach to the plural, which is where Arabic puts them: «زيتونات» + «ك» = «زيتوناتك».
 */
function unitPlural(unit: string): string {
  return unit.endsWith("ة") ? `${unit.slice(0, -1)}ات` : unit;
}

// ---------------------------------------------------------------------------
// The shapes every section is built from
// ---------------------------------------------------------------------------

/**
 * One record of the file as a card: its own reference at the top, its status beside it, its figures under it.
 *
 * A card per record and not a table, because a table of nine columns on a 375px screen is a horizontal scroll
 * and a client reading their own contract should not have to drag it sideways.
 */
function RecordCard({
  title,
  reference,
  status,
  children,
}: {
  title: string;
  /** The record's own number — AGZ-2026-000045, AGZ-RES-…, AGZ-CTR-… — Latin, so it gets its own dir island. */
  reference?: string | null;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="card p-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-forest">{title}</h3>
          {reference ? (
            <p dir="ltr" className="text-caption tabular-nums text-muted">
              {reference}
            </p>
          ) : null}
        </div>
        {status}
      </div>
      <div className="mt-snug">{children}</div>
    </article>
  );
}

/** The stack every section is: cards down one column, nothing beside them. */
function CardStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-cozy">{children}</div>;
}

/**
 * The tree codes themselves — the thing a buyer actually asked for when they said «وين زيتوناتي».
 *
 * The list is capped in SQL by the setting zitounti.max_codes, so when fewer codes arrive than the group holds
 * trees the difference is STATED. A quiet truncation would have a client counting their own trees on a screen
 * and reaching the wrong number.
 */
function TreeCodes({ codes, trees, unit }: { codes: string[]; trees: number; unit: string }) {
  if (codes.length === 0) return null;
  const hidden = trees - codes.length;

  return (
    <div className="mt-snug">
      <p className="text-caption font-semibold text-muted">رموز {unitPlural(unit)}ك</p>
      <ul className="mt-tight flex flex-wrap gap-1.5">
        {codes.map((code) => (
          <li key={code}>
            <span dir="ltr" className="pill pill-line tabular-nums">
              {code}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="mt-tight text-caption text-muted">
          {/* The counted noun is left out on purpose: Arabic agreement flips between 3-10 and 11+, and a
              sentence that reads «و120 زيتونات» to get one case right is worse than one that needs neither. */}
          و{formatCount(hidden)} أخرى ما ظهرتش في القائمة هذي.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// زيتوناتي — one card per offer the client holds trees in
// ---------------------------------------------------------------------------

function TreesSection({
  items,
  config,
  unit,
}: {
  items: ZitountiTreeGroup[];
  config: PublicConfig;
  unit: string;
}) {
  const areaLabel = settingText(config, "zitounti.row_area", "المساحة");
  const areaUnknown = settingText(config, "zitounti.row_area_unknown");

  return (
    <CardStack>
      {items.map((group) => (
        <RecordCard
          key={group.project_id}
          title={group.project_name ?? group.project_code ?? "عرض"}
          reference={group.project_code}
        >
          {/* The count first and largest: the unit of this product is the tree, and this is how many are his. */}
          <p className="text-2xl font-bold tabular-nums text-forest">
            {formatCount(group.trees)} <span className="text-lg font-semibold">{unit}</span>
          </p>

          <DataList className="mt-snug text-sm">
            {group.trees_sold > 0 ? (
              <DataRow label="متملّكة باسمك">
                {formatCount(group.trees_sold)} {unit}
              </DataRow>
            ) : null}
            {group.trees_reserved > 0 ? (
              <DataRow label="محجوزة">
                {formatCount(group.trees_reserved)} {unit}
              </DataRow>
            ) : null}
            {/* The area is the offer's spacing class × the count, computed in SQL. When the offer declares
                several classes nothing on a tree says which one it stands in, so the payload sends null and
                the owner's own sentence says why — we do not print an estimate as if it were measured. */}
            {group.area_m2 !== null ? (
              <DataRow label={areaLabel}>{formatArea(group.area_m2)}</DataRow>
            ) : null}
            {group.olive_variety ? (
              <DataRow label="الصنف" numeric={false}>
                {group.olive_variety}
              </DataRow>
            ) : null}
            {group.plantation_system ? (
              <DataRow label="نظام الغراسة" numeric={false}>
                {PLANTATION_LABELS[group.plantation_system] ?? group.plantation_system}
              </DataRow>
            ) : null}
            {group.production_status ? (
              <DataRow label="حالة الإنتاج" numeric={false}>
                {PRODUCTION_LABELS[group.production_status] ?? group.production_status}
              </DataRow>
            ) : null}
            {group.governorate ? (
              <DataRow label="الموقع" numeric={false}>
                {[group.governorate, group.delegation].filter(Boolean).join(" · ")}
              </DataRow>
            ) : null}
          </DataList>

          {group.area_m2 === null && areaUnknown ? (
            <p className="mt-snug text-caption leading-6 text-muted">{areaUnknown}</p>
          ) : null}

          <TreeCodes codes={group.codes} trees={group.trees} unit={unit} />

          {/* What the offer PROMISES to do. What was actually done is the operations section, and the two are
              not merged: a promise and a record of work are different statements. */}
          {group.services.length > 0 ? (
            <div className="mt-snug">
              <p className="text-caption font-semibold text-muted">الخدمات المضمّنة في العرض</p>
              <ul className="mt-tight flex flex-wrap gap-1.5">
                {group.services.map((service) => (
                  <li key={service}>
                    <StatusPill tone="brand">{service}</StatusPill>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {group.project_code ? (
            <Link
              href={`/projects/${group.project_code}`}
              className="btn btn-secondary mt-cozy w-full border-line"
            >
              شوف العرض
            </Link>
          ) : null}
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// مطالبي — what was asked for, and what was quoted on the day it was asked
// ---------------------------------------------------------------------------

function RequestsSection({ items, unit }: { items: ZitountiRequestRow[]; unit: string }) {
  return (
    <CardStack>
      {items.map((request) => (
        <RecordCard
          key={request.id}
          title={request.project_name ?? request.project_code ?? "مطلب"}
          reference={request.request_no}
          status={<StatusPill tone="info">{formatDate(request.created_at)}</StatusPill>}
        >
          <DataList className="text-sm">
            {request.trees !== null ? (
              <DataRow label={`عدد ${unitPlural(unit)}`}>
                {formatCount(request.trees)} {unit}
              </DataRow>
            ) : null}
            {request.price_per_tree_millimes !== null ? (
              <DataRow label={`ثمن ${unit}`}>{formatMillimes(request.price_per_tree_millimes)}</DataRow>
            ) : null}
            {request.total_price_millimes !== null ? (
              <DataRow label="الجملة" size="lg">
                {formatMillimes(request.total_price_millimes)}
              </DataRow>
            ) : null}
            {request.annual_fee_per_tree_millimes !== null ? (
              <DataRow label={`المصاريف السنوية لكل ${unit}`}>
                {formatMillimes(request.annual_fee_per_tree_millimes)}
              </DataRow>
            ) : null}
            {request.annual_fee_total_millimes !== null ? (
              <DataRow label="جملة المصاريف السنوية">
                {formatMillimes(request.annual_fee_total_millimes)}
              </DataRow>
            ) : null}
          </DataList>

          {/* The figures above are the quotation as it stood the day the request was sent, snapshotted on the
              request itself. The annual fee has already changed more than once under live requests, and a
              client is owed the number they were shown — so this sentence is not decoration. */}
          <p className="mt-snug text-caption leading-6 text-muted">
            هذي الأثمان كيما كانت نهار بعثت المطلب، موش أثمان اليوم.
          </p>
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// حجوزاتي
// ---------------------------------------------------------------------------

function ReservationsSection({
  items,
  config,
  unit,
}: {
  items: ZitountiReservationRow[];
  config: PublicConfig;
  unit: string;
}) {
  return (
    <CardStack>
      {items.map((reservation) => (
        <RecordCard
          key={reservation.id}
          title={reservation.project_code ?? "حجز"}
          reference={reservation.reference_no}
          status={
            <StatusPill tone={reservation.deposit_paid_at ? "success" : "attention"}>
              {reservationStatusAr(config, reservation.status)}
            </StatusPill>
          }
        >
          <DataList className="text-sm">
            <DataRow label={`عدد ${unitPlural(unit)}`}>
              {formatCount(reservation.trees)} {unit}
            </DataRow>
            <DataRow label="العربون">{formatMillimes(reservation.deposit_due_millimes)}</DataRow>
            {reservation.reserved_at ? (
              <DataRow label="تاريخ الحجز">{formatDate(reservation.reserved_at)}</DataRow>
            ) : null}
            {/* Kept even once the deposit is in: «كان يسالي نهار…» is how a client checks the hold was honoured. */}
            {reservation.expires_at ? (
              <DataRow label="يسالي في">{formatDate(reservation.expires_at)}</DataRow>
            ) : null}
            {reservation.deposit_paid_at ? (
              <DataRow label="العربون تخلّص في">{formatDate(reservation.deposit_paid_at)}</DataRow>
            ) : null}
          </DataList>
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// زياراتي
// ---------------------------------------------------------------------------

function VisitsSection({ items, config }: { items: ZitountiVisitRow[]; config: PublicConfig }) {
  return (
    <CardStack>
      {items.map((visit) => (
        <RecordCard
          key={visit.id}
          title={visit.project_code ?? "زيارة"}
          reference={visit.visit_no}
          status={
            <StatusPill tone={visit.status === "completed" ? "success" : "progress"}>
              {visitStatusAr(config, visit.status)}
            </StatusPill>
          }
        >
          <DataList className="text-sm">
            {visit.visit_date ? <DataRow label="التاريخ">{formatDate(visit.visit_date)}</DataRow> : null}
            {visit.slot_label_ar ? (
              <DataRow label="التوقيت" numeric={false}>
                {visit.slot_label_ar}
              </DataRow>
            ) : null}
            {visit.meeting_point ? (
              <DataRow label="نقطة اللقاء" layout="stacked" numeric={false}>
                {visit.meeting_point}
              </DataRow>
            ) : null}
          </DataList>
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// دفعاتي — receipts, including the voided ones
// ---------------------------------------------------------------------------

function PaymentsSection({ items, config }: { items: ZitountiPaymentRow[]; config: PublicConfig }) {
  return (
    <CardStack>
      {items.map((payment) => (
        <RecordCard
          key={payment.id}
          title={paymentKindAr(config, payment.kind)}
          reference={payment.reference_no}
          status={
            payment.voided ? (
              <StatusPill tone="danger">ملغاة</StatusPill>
            ) : (
              <StatusPill tone="success">وصل</StatusPill>
            )
          }
        >
          {/* The amount is the whole point of a receipt, so it is the largest thing on the card. A voided one
              keeps its figure and is struck through: a client who was told «خلّصت» and then sees the line
              vanish has no way to ask what became of it. */}
          <p
            className={`text-2xl font-bold tabular-nums ${payment.voided ? "text-muted line-through" : "text-forest"}`}
          >
            {formatMillimes(payment.amount_millimes)}
          </p>
          <DataList className="mt-snug text-sm">
            {payment.received_at ? (
              <DataRow label="تاريخ الدفع">{formatDate(payment.received_at)}</DataRow>
            ) : null}
            {payment.method_label_ar ? (
              <DataRow label="طريقة الدفع" numeric={false}>
                {payment.method_label_ar}
              </DataRow>
            ) : null}
            {payment.project_code ? (
              <DataRow label="العرض" numeric={false}>
                <span dir="ltr">{payment.project_code}</span>
              </DataRow>
            ) : null}
          </DataList>
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// عقودي
// ---------------------------------------------------------------------------

function ContractsSection({ items, unit }: { items: ZitountiContractRow[]; unit: string }) {
  return (
    <CardStack>
      {items.map((contract) => (
        <RecordCard
          key={contract.reference_no}
          title={contract.kind_label ?? "عقد"}
          reference={contract.reference_no}
          // `status_label` is the owner's own word, read from settings by the SQL that built the payload. It is
          // printed as it stands; this screen has no opinion about what a contract's state is called.
          status={
            <StatusPill tone={contract.status === "completed" ? "success" : "progress"}>
              {contract.status_label}
            </StatusPill>
          }
        >
          <DataList className="text-sm">
            {contract.trees_count !== null ? (
              <DataRow label={`عدد ${unitPlural(unit)}`}>
                {formatCount(contract.trees_count)} {unit}
              </DataRow>
            ) : null}
            {contract.total_price_millimes !== null ? (
              <DataRow label="الثمن الجملي" size="lg">
                {formatMillimes(contract.total_price_millimes)}
              </DataRow>
            ) : null}
            {contract.offer_code ? (
              <DataRow label="العرض" numeric={false}>
                <span dir="ltr">{contract.offer_code}</span>
              </DataRow>
            ) : null}
            {contract.signed_on ? (
              <DataRow label="تاريخ التوقيع">{formatDate(contract.signed_on)}</DataRow>
            ) : null}
            {contract.owned_at ? (
              <DataRow label="تاريخ التملّك">{formatDate(contract.owned_at)}</DataRow>
            ) : null}
          </DataList>
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// أقساطي — the schedule, line by line, with what is paid, what is left and what is late
// ---------------------------------------------------------------------------

/**
 * One line of the schedule.
 *
 * `paid_millimes`, `left_millimes`, `is_late` and `days_late` all arrive computed. `days_late` counts from the
 * due date PLUS the tolerance the owner granted, which is why the tolerance is printed once at the top of the
 * plan rather than left implied: a client seeing «متأخر بـ3 أيام» on a line due five days ago is owed the
 * reason the two numbers differ.
 */
function InstallmentLine({ line }: { line: ZitountiInstallmentPlan["money"]["lines"][number] }) {
  const tone = line.is_late ? "danger" : line.status === "paid" ? "success" : line.status === "partial" ? "warning" : "neutral";

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          <span className="tabular-nums">قسط {formatCount(line.seq)}</span>
          <span className="mx-2 text-muted">·</span>
          <span className="tabular-nums font-normal text-muted">{formatDate(line.due_on)}</span>
        </p>
        <StatusPill tone={tone}>{line.status_label}</StatusPill>
      </div>

      <DataList variant="grid" columns={3} className="mt-tight text-caption">
        <DataRow label="المبلغ" layout="stacked">
          {formatMillimes(line.amount_millimes)}
        </DataRow>
        <DataRow label="تخلّص" layout="stacked">
          {formatMillimes(line.paid_millimes)}
        </DataRow>
        <DataRow label="الباقي" layout="stacked">
          {formatMillimes(line.left_millimes)}
        </DataRow>
      </DataList>

      {line.is_late && line.days_late !== null ? (
        <p className="mt-tight text-caption font-semibold text-danger">
          متأخر بـ{formatCount(line.days_late)} يوم.
        </p>
      ) : null}

      {/* The receipts behind the line: v3 §29's payment date, method and bank reference are properties of
          MONEY, so they are read from the receipt and never copied onto the schedule. */}
      {line.receipts.length > 0 ? (
        <ul className="mt-tight space-y-1">
          {line.receipts.map((receipt) => (
            <li key={receipt.id} className="text-caption text-muted">
              <span dir="ltr" className="tabular-nums">
                {receipt.reference_no}
              </span>
              <span className="mx-1">·</span>
              <span className={`tabular-nums ${receipt.voided ? "line-through" : ""}`}>
                {formatMillimes(receipt.amount_millimes)}
              </span>
              {receipt.received_at ? (
                <>
                  <span className="mx-1">·</span>
                  <span className="tabular-nums">{formatDate(receipt.received_at)}</span>
                </>
              ) : null}
              {receipt.method_label ? <span className="mx-1">· {receipt.method_label}</span> : null}
              {receipt.voided ? <span className="mx-1 font-semibold text-danger">· ملغاة</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {line.note ? <p className="mt-tight text-caption text-muted">{line.note}</p> : null}
    </li>
  );
}

function InstallmentsSection({ items }: { items: ZitountiInstallmentPlan[] }) {
  return (
    <CardStack>
      {items.map((plan) => {
        const money = plan.money;
        return (
          <RecordCard
            key={plan.contract_no}
            title="جدول الأقساط"
            reference={plan.contract_no}
            status={<StatusPill tone={money.is_settled ? "success" : "progress"}>{money.stage_label}</StatusPill>}
          >
            {/* The three figures a client opens this screen for, in the order they ask them: what do I owe in
                total, what has arrived, what is left. Summed in SQL, printed here. */}
            <DataList variant="grid" columns={3} className="text-sm">
              <DataRow label="الجملة" layout="stacked" size="lg">
                {formatMillimes(money.total_due_millimes)}
              </DataRow>
              <DataRow label="تخلّص" layout="stacked" size="lg">
                {formatMillimes(money.total_paid_millimes)}
              </DataRow>
              <DataRow label="الباقي" layout="stacked" size="lg">
                {formatMillimes(money.total_left_millimes)}
              </DataRow>
            </DataList>

            <DataList className="mt-snug text-sm">
              {money.down_payment_due_millimes > 0 ? (
                <DataRow label={money.down_payment_kind_label}>
                  {formatMillimes(money.down_payment_paid_millimes)} / {formatMillimes(money.down_payment_due_millimes)}
                </DataRow>
              ) : null}
              <DataRow label="عدد الأقساط">
                {formatCount(money.installments_paid_count)} / {formatCount(money.installments_count)}
              </DataRow>
              {money.next_due_on ? (
                <DataRow label="القسط القادم">
                  {formatDate(money.next_due_on)}
                  {money.next_due_millimes !== null ? ` · ${formatMillimes(money.next_due_millimes)}` : ""}
                </DataRow>
              ) : null}
              {money.missed_count > 0 ? (
                <DataRow label="أقساط متأخرة">{formatCount(money.missed_count)}</DataRow>
              ) : null}
            </DataList>

            {money.grace_days > 0 ? (
              <p className="mt-snug text-caption leading-6 text-muted">
                عندك {formatCount(money.grace_days)} يوم تسامح بعد تاريخ القسط قبل ما يتحسب متأخّر.
              </p>
            ) : null}

            <ul className="mt-snug divide-y divide-line border-t border-line">
              {money.lines.map((line) => (
                <InstallmentLine key={line.id} line={line} />
              ))}
            </ul>
          </RecordCard>
        );
      })}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// الخدمات الفلاحية — what was done to the trees, and when
// ---------------------------------------------------------------------------

function OperationsSection({ items, unit, config }: { items: ZitountiOperationRow[]; unit: string; config: PublicConfig }) {
  return (
    <CardStack>
      {items.map((operation) => (
        <RecordCard
          key={operation.id}
          // The label frozen on the operation the day it was recorded, not today's option list: a service the
          // owner renames must not rewrite what a client was told was done to their trees.
          title={operation.service_ar ?? "خدمة"}
          reference={operation.project_code}
          status={
            <StatusPill tone={operation.executed_on ? "success" : "progress"}>
              {operationStatusAr(config, operation.status)}
            </StatusPill>
          }
        >
          <DataList className="text-sm">
            {operation.executed_on ? (
              <DataRow label="تعملت في">{formatDate(operation.executed_on)}</DataRow>
            ) : operation.planned_on ? (
              <DataRow label="مبرمجة في">{formatDate(operation.planned_on)}</DataRow>
            ) : null}
            <DataRow label="تخصّ" numeric={false}>
              {operation.scope === "offer" ? "الغراسة الكل" : `${unitPlural(unit)}ك`}
            </DataRow>
          </DataList>
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// الاشتراك السنوي
// ---------------------------------------------------------------------------

function SubscriptionSection({ items, unit, config }: { items: ZitountiSubscriptionRow[]; unit: string; config: PublicConfig }) {
  return (
    <CardStack>
      {items.map((subscription) => (
        <RecordCard
          key={subscription.id}
          title={subscription.season_label ?? "اشتراك"}
          reference={subscription.project_code}
          // §36 names Status and Payment as two attributes and they stay two: «سارية» and «ما تخلّصش» are not
          // one word, and merging them would hide whichever the client needed to read.
          status={
            subscription.payment_status ? (
              <StatusPill tone={subscription.payment_status === "paid" ? "success" : "attention"}>
                {subscriptionPaymentAr(config, subscription.payment_status)}
              </StatusPill>
            ) : undefined
          }
        >
          <DataList className="text-sm">
            {subscription.season_starts_on ? (
              <DataRow label="بداية الموسم">{formatDate(subscription.season_starts_on)}</DataRow>
            ) : null}
            {subscription.trees !== null ? (
              <DataRow label={`عدد ${unitPlural(unit)}`}>
                {formatCount(subscription.trees)} {unit}
              </DataRow>
            ) : null}
            {subscription.fee_per_tree_millimes !== null ? (
              <DataRow label={`المصاريف لكل ${unit}`}>
                {formatMillimes(subscription.fee_per_tree_millimes)}
              </DataRow>
            ) : null}
            {subscription.amount_millimes !== null ? (
              <DataRow label="الجملة" size="lg">
                {formatMillimes(subscription.amount_millimes)}
              </DataRow>
            ) : null}
          </DataList>

          {/* «شنو داخل وشنو خارج الباقة» — the one question a client actually asks about a subscription, so a
              total with no contents under it does not answer it. */}
          {subscription.lines.length > 0 ? (
            <ul className="mt-snug divide-y divide-line border-t border-line text-sm">
              {subscription.lines.map((line) => (
                <li key={line.label_ar} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">{line.label_ar}</span>
                  {line.in_package ? (
                    <StatusPill tone="brand">داخل الباقة</StatusPill>
                  ) : (
                    <span className="flex-none tabular-nums font-semibold text-ink">
                      {formatMillimes(line.amount_millimes)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// الصابة — a share of the grove's season, never a weighing of one tree
// ---------------------------------------------------------------------------

function HarvestSection({
  items,
  config,
  unit,
}: {
  items: ZitountiHarvestRow[];
  config: PublicConfig;
  unit: string;
}) {
  const shareNote = settingText(config, "zitounti.share_note");

  return (
    <CardStack>
      {items.map((season) => (
        <RecordCard
          key={season.season_id}
          title={season.season_label ?? (season.season_year !== null ? `صابة ${season.season_year}` : "صابة")}
          reference={season.project_code}
          status={
            <StatusPill tone={season.settled ? "success" : "progress"}>
              {season.settled ? "تسوّت" : "مازالت"}
            </StatusPill>
          }
        >
          {/* Mine first — frozen into the settlement row, never recomputed here, because a later correction of
              the season must not silently restate a figure an owner has already been told. */}
          {season.settled ? (
            <DataList variant="grid" columns={3} className="text-sm">
              {season.my_trees !== null ? (
                <DataRow label={`${unitPlural(unit)}ي`} layout="stacked">
                  {formatCount(season.my_trees)}
                </DataRow>
              ) : null}
              {season.my_olives_kg !== null ? (
                <DataRow label="زيتون" layout="stacked" size="lg">
                  {formatCount(season.my_olives_kg)} كغ
                </DataRow>
              ) : null}
              {season.my_oil_litres !== null ? (
                <DataRow label="زيت" layout="stacked" size="lg">
                  {formatCount(season.my_oil_litres)} لتر
                </DataRow>
              ) : null}
            </DataList>
          ) : (
            <DataList className="text-sm">
              {season.choice_deadline ? (
                <DataRow label="آخر موعد للاختيار">{formatDate(season.choice_deadline)}</DataRow>
              ) : null}
            </DataList>
          )}

          <DataList className="mt-snug text-sm">
            {season.pick_label_ar ? (
              <DataRow label="طريقة الجني" numeric={false}>
                {season.pick_label_ar}
              </DataRow>
            ) : null}
            {season.outcome_label_ar ? (
              <DataRow label="شنوّة تاخذ" numeric={false}>
                {season.outcome_label_ar}
              </DataRow>
            ) : null}
            {season.season_olives_kg !== null ? (
              <DataRow label="صابة الضيعة الكل">{formatCount(season.season_olives_kg)} كغ</DataRow>
            ) : null}
          </DataList>

          {/* The owner's own sentence explaining that a share is counted by trees, not weighed tree by tree.
              It is the sentence that stops a client reading their figure as their own tree's yield. */}
          {shareNote ? <p className="mt-snug text-caption leading-6 text-muted">{shareNote}</p> : null}
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// الوثائق
// ---------------------------------------------------------------------------

const DOCUMENT_KIND_AR: Record<string, string> = {
  contract: "عقد",
  offer_plan: "مخطط الغراسة",
};

function DocumentsSection({ items, config }: { items: ZitountiDocumentRow[]; config: PublicConfig }) {
  return (
    <CardStack>
      {items.map((document, index) => (
        <RecordCard
          key={`${document.kind}-${document.reference_no ?? index}`}
          title={documentKindAr(config, document.kind)}
          reference={document.reference_no}
          status={document.at ? <StatusPill tone="info">{formatDate(document.at)}</StatusPill> : undefined}
        >
          <DataList className="text-sm">
            {document.offer_code ? (
              <DataRow label="العرض" numeric={false}>
                <span dir="ltr">{document.offer_code}</span>
              </DataRow>
            ) : null}
            {document.legal_ref ? (
              <DataRow label="المرجع القانوني" numeric={false}>
                <span dir="ltr">{document.legal_ref}</span>
              </DataRow>
            ) : null}
          </DataList>

          {/* A document with no storage_path exists as a RECORD, not as a FILE — a reference to quote down the
              phone, not something to open. Drawing it as a link would be a broken promise, so it is drawn as a
              sentence instead. That distinction is the whole reason the column is in the payload. */}
          <p className="mt-snug text-caption leading-6 text-muted">
            {document.storage_path
              ? "الوثيقة محفوظة عندنا. اطلبها من فريق AgriZed ويبعثهالك."
              : "هذا مرجع مكتوب، مازال ما عندناش منّو نسخة إلكترونية. عيّط على الفريق إذا تلزمك نسخة."}
          </p>
        </RecordCard>
      ))}
    </CardStack>
  );
}

// ---------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------

/**
 * One section of the file, drawn from the payload.
 *
 * It switches on the KEY and not on the shape, so the compiler narrows `items` for each branch and a section
 * added to the payload later fails to compile here rather than rendering the wrong list.
 *
 * A section whose status is not 'ok' never reaches this component: the page states that case in its own words
 * («الوحدة مازالت ما تفتحتش», «مازال ما تركّبش»), because the sentence is about the module and not about the
 * rows. An 'ok' section holding nothing DOES reach it, and answers with the empty note it was handed — «ما
 * فمّاش» is a true statement about a client's file and belongs beside the rows, not in place of the screen.
 */
export function ZitountiSectionBody({
  sectionKey,
  file,
  config,
  emptyNote,
}: {
  sectionKey: ZitountiSectionKey;
  file: ZitountiFile;
  config: PublicConfig;
  emptyNote: string;
}) {
  const unit = settingText(config, "zitounti.tree_unit", "زيتونة");

  /*
   * Emptiness is counted from the ITEMS and not from the payload's `count`, so a section can never render an
   * empty list under a heading that claims rows. And the contracts key counts its pair: the owner's label for
   * that row is «العقود والأقساط», so a client whose contract is drafted but whose schedule exists must not be
   * told the section is empty.
   */
  const drawn =
    file[sectionKey].items.length + (sectionKey === "contracts" ? file.installments.items.length : 0);
  if (drawn === 0) {
    return <EmptyState>{emptyNote}</EmptyState>;
  }

  switch (sectionKey) {
    case "trees":
      return <TreesSection items={file.trees.items} config={config} unit={unit} />;
    case "requests":
      return <RequestsSection items={file.requests.items} unit={unit} />;
    case "reservations":
      return <ReservationsSection items={file.reservations.items} config={config} unit={unit} />;
    case "visits":
      return <VisitsSection items={file.visits.items} config={config} />;
    case "payments":
      return <PaymentsSection items={file.payments.items} config={config} />;
    case "contracts":
      return (
        <div className="space-y-roomy">
          {file.contracts.items.length > 0 ? (
            <ContractsSection items={file.contracts.items} unit={unit} />
          ) : null}
          {/* The owner's own label for this row is «العقود والأقساط», so the schedule is drawn under the
              contracts it belongs to rather than hidden behind a second tap. It gets its own heading only when
              there are contracts above it to tell it apart from. /zitounti/installments still reaches the
              schedule on its own for a client who has only that. */}
          {file.installments.items.length > 0 ? (
            <section>
              {file.contracts.items.length > 0 ? (
                <SectionHeader
                  title={settingText(config, "zitounti.section_installments", "الأقساط")}
                  level={2}
                  className="mb-snug"
                />
              ) : null}
              <InstallmentsSection items={file.installments.items} />
            </section>
          ) : null}
        </div>
      );
    case "installments":
      return <InstallmentsSection items={file.installments.items} />;
    case "operations":
      return <OperationsSection items={file.operations.items} unit={unit} config={config} />;
    case "subscription":
      return <SubscriptionSection items={file.subscription.items} unit={unit} config={config} />;
    case "harvest":
      return <HarvestSection items={file.harvest.items} config={config} unit={unit} />;
    case "documents":
      return <DocumentsSection items={file.documents.items} config={config} />;
  }
}

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

/**
 * The sign-in panel, in one place because TWO routes need it.
 *
 * /zitounti and /zitounti/<section> both belong to a signed-in buyer, and a visitor who lands on either with
 * no session must meet the same door — not a redirect that loses where they were going, and not a second
 * arrangement of the same form that drifts from the first. The words are the owner's, from the `zitounti`
 * settings group.
 */
export function ClientLoginPanel({ config, title }: { config: PublicConfig; title: string }) {
  const help = settingText(config, "site.contact_phone");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-section">
      <h1 className="font-display text-2xl font-bold text-forest-700">{title}</h1>
      <p className="mt-2 text-[0.95rem] leading-7 text-muted">
        {settingText(config, "zitounti.login_note", "ادخل بنمرة التلفون اللي سجّلت بيها، ونبعثولك رمز بالSMS.")}
      </p>
      <div className="card mt-6 p-card">
        <ClientLoginForm helpPhone={help || null} />
      </div>
    </div>
  );
}
