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
// EVERY AMOUNT AND EVERY DATE GOES THROUGH src/lib/format.ts, in the visitor's language (formatFor(config)).
// Money is integer millimes in the payload and is never divided here; dates are rendered in Africa/Tunis by
// formatDate, never by toLocaleString.
//
// PHONE FIRST. This is read on a handset, standing in a field or on a bus: one column, cards stacked, the
// figure that matters largest, nothing that needs a horizontal scroll. The shapes come from @/components/ui
// (DataList, DataRow, StatusPill, EmptyState, SectionHeader) so this screen is the same system as the rest of
// the app and not a private set of divs.
//
// ---------------------------------------------------------------------------
// THE LABELS, AND THE ONE LINE THIS FILE DRAWS
// ---------------------------------------------------------------------------
// Every word on this screen is read from public.settings through src/lib/config.ts, in the visitor's language:
// the section titles and the owner's notes (`zitounti.*`), and — since the site learned five languages
// (2026-10-03) — the FIELD names of a record too («تاريخ», «عدد الزيتونات», «الثمن»), which used to be inline
// Arabic and are now `ui.zitounti.*`. A count and its noun are ONE message with a plural in it
// (`ui.zitounti.trees_count`), never a number glued to a word: «3 زيتونات» and «11 زيتونة» agree differently,
// and so do «1 olivier» and «2 oliviers».
//
// The STATUS words are the interesting case. Wherever the payload carries the word already it is printed as
// it stands and nothing here has an opinion: a contract's `status_label`, an instalment line's `status_label`
// and the plan's `stage_label` are resolved by the SQL from settings, in the visitor's language because the
// page reads the file with `display` (src/lib/zitounti.ts). The enums the payload sends as CODES —
// reservations.status_labels, payments.kind_labels, visits.status_*, agri.operation_status_labels,
// subscriptions.payment_labels, zitounti.document_kind_labels — are looked up in the owner's public settings
// here, which config has already translated word by word; a code nobody has named prints as the code.
//
// The labels the database FROZE in Arabic on a record — a visit's slot, a receipt's method, a harvest choice,
// a service's name, a contract's kind — carry no option id in the payload. When the frozen words are still,
// exactly, one of the owner's list items, that item's label in the visitor's language is printed
// (`listLabel`); a label renamed since is printed as it was frozen, which is the point of freezing it.

import Link from "@/components/site/link";
import { PhoneLanguage } from "@/components/site/phone-language";
import { Texts } from "@/components/site/texts";
import { DataList, DataRow, EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { passwordPolicy } from "@/lib/client-auth";
import { formatFor, optionsFor, type PublicConfig, settingJson, settingText, t } from "@/lib/config";
import type { SiteFormat } from "@/lib/format";
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
import { LOGIN_INITIAL, type LoginState } from "./login-state";

// ---------------------------------------------------------------------------
// Status words, list labels and place names, in the visitor's language
// ---------------------------------------------------------------------------

/**
 * A word from one of the owner's vocabularies (a json map, enum code → word), in the visitor's language: config
 * has already laid the translations over the Arabic, word by word. Each map's keys are the enum values the
 * database fixed (0063 §23-§24, 0064, 0106): the code is code, the word is data. Falling through to the bare
 * code is the last resort and only happens for a value nobody has named.
 */
function wordFor(config: PublicConfig, settingKey: string, code: string): string {
  const words = settingJson<Record<string, string>>(config, settingKey, {});
  return words[code] ?? code;
}

function reservationStatusWord(config: PublicConfig, code: string): string {
  return wordFor(config, "reservations.status_labels", code);
}

/** visits keeps one text setting per status (0064), so the key is built from the code. */
function visitStatusWord(config: PublicConfig, code: string): string {
  return settingText(config, `visits.status_${code}`, code);
}

function paymentKindWord(config: PublicConfig, code: string): string {
  return wordFor(config, "payments.kind_labels", code);
}

function operationStatusWord(config: PublicConfig, code: string): string {
  return wordFor(config, "agri.operation_status_labels", code);
}

function subscriptionPaymentWord(config: PublicConfig, code: string): string {
  return wordFor(config, "subscriptions.payment_labels", code);
}

function documentKindWord(config: PublicConfig, code: string): string {
  return wordFor(config, "zitounti.document_kind_labels", code);
}

/** An offer's plantation system, by its code in the owner's `plantation_system` list. */
function plantationWord(config: PublicConfig, code: string): string {
  return optionsFor(config, "plantation_system").find((option) => option.code === code)?.label ?? code;
}

/** An offer's production status: the three codes projects.production_status allows, one setting each. */
const PRODUCTION_KEYS: Record<string, string> = {
  none: "ui.zitounti.production_none",
  starting: "ui.zitounti.production_starting",
  producing: "ui.zitounti.production_producing",
};

function productionWord(config: PublicConfig, code: string): string {
  const key = PRODUCTION_KEYS[code];
  return key ? t(config, key) : code;
}

/**
 * A label FROZEN in Arabic on a record, in the visitor's language when it still is, word for word, one of the
 * owner's items in `listKey`. The payload carries the frozen words and not the option's id, so the match is on
 * the Arabic itself; a label the owner renamed since matches nothing and is printed as it was frozen.
 */
function listLabel(config: PublicConfig, listKey: string, frozen: string): string {
  return optionsFor(config, listKey).find((option) => option.label_ar === frozen)?.label ?? frozen;
}

/**
 * Where an offer stands. The payload names the governorate and the delegation in Arabic (app.zitounti_trees
 * reads name_ar); config has both lists in the visitor's language, so the Arabic name is matched back to its
 * row — the delegation within its own governorate, because two delegations may share a name.
 */
function placeName(config: PublicConfig, governorate: string, delegation: string | null): string {
  const gov = config.governorates.find((row) => row.name_ar === governorate);
  const del = delegation
    ? config.delegations.find((row) => row.name_ar === delegation && (!gov || row.governorate_id === gov.id))
    : undefined;
  return [gov?.name ?? governorate, del?.name ?? delegation].filter(Boolean).join(" · ");
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
function TreeCodes({ codes, trees, config }: { codes: string[]; trees: number; config: PublicConfig }) {
  if (codes.length === 0) return null;
  const hidden = trees - codes.length;

  return (
    <div className="mt-snug">
      <p className="text-caption font-semibold text-muted">{t(config, "ui.zitounti.tree_codes_title")}</p>
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
          {t(config, "ui.zitounti.tree_codes_hidden", { count: hidden })}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// زيتوناتي — one card per offer the client holds trees in
// ---------------------------------------------------------------------------

function TreesSection({ items, config, fmt }: { items: ZitountiTreeGroup[]; config: PublicConfig; fmt: SiteFormat }) {
  const areaLabel = t(config, "zitounti.row_area");
  const areaUnknown = t(config, "zitounti.row_area_unknown");

  return (
    <CardStack>
      {items.map((group) => (
        <RecordCard
          key={group.project_id}
          title={group.project_name ?? group.project_code ?? t(config, "ui.zitounti.offer_fallback_title")}
          reference={group.project_code}
        >
          {/* The count first and largest: the unit of this product is the tree, and this is how many are his. */}
          <p className="text-2xl font-bold tabular-nums text-forest">
            {fmt.formatCount(group.trees)}{" "}
            <span className="text-lg font-semibold">{t(config, "ui.zitounti.trees_unit", { count: group.trees })}</span>
          </p>

          <DataList className="mt-snug text-sm">
            {group.trees_sold > 0 ? (
              <DataRow label={t(config, "ui.zitounti.trees_owned")}>
                {t(config, "ui.zitounti.trees_count", { count: group.trees_sold })}
              </DataRow>
            ) : null}
            {group.trees_reserved > 0 ? (
              <DataRow label={t(config, "ui.zitounti.trees_reserved")}>
                {t(config, "ui.zitounti.trees_count", { count: group.trees_reserved })}
              </DataRow>
            ) : null}
            {/* The area is the offer's spacing class × the count, computed in SQL. When the offer declares
                several classes nothing on a tree says which one it stands in, so the payload sends null and
                the owner's own sentence says why — we do not print an estimate as if it were measured. */}
            {group.area_m2 !== null ? (
              <DataRow label={areaLabel}>{fmt.formatArea(group.area_m2)}</DataRow>
            ) : null}
            {group.olive_variety ? (
              <DataRow label={t(config, "ui.zitounti.variety")} numeric={false}>
                {listLabel(config, "olive_variety", group.olive_variety)}
              </DataRow>
            ) : null}
            {group.plantation_system ? (
              <DataRow label={t(config, "ui.zitounti.plantation_system")} numeric={false}>
                {plantationWord(config, group.plantation_system)}
              </DataRow>
            ) : null}
            {group.production_status ? (
              <DataRow label={t(config, "ui.zitounti.production_status")} numeric={false}>
                {productionWord(config, group.production_status)}
              </DataRow>
            ) : null}
            {group.governorate ? (
              <DataRow label={t(config, "ui.zitounti.location")} numeric={false}>
                {placeName(config, group.governorate, group.delegation)}
              </DataRow>
            ) : null}
          </DataList>

          {group.area_m2 === null && areaUnknown ? (
            <p className="mt-snug text-caption leading-6 text-muted">{areaUnknown}</p>
          ) : null}

          <TreeCodes codes={group.codes} trees={group.trees} config={config} />

          {/* What the offer PROMISES to do. What was actually done is the operations section, and the two are
              not merged: a promise and a record of work are different statements. */}
          {group.services.length > 0 ? (
            <div className="mt-snug">
              <p className="text-caption font-semibold text-muted">{t(config, "ui.zitounti.included_services")}</p>
              <ul className="mt-tight flex flex-wrap gap-1.5">
                {group.services.map((service) => (
                  <li key={service}>
                    <StatusPill tone="brand">{listLabel(config, "agrized_service", service)}</StatusPill>
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
              {t(config, "ui.zitounti.see_offer")}
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

function RequestsSection({ items, config, fmt }: { items: ZitountiRequestRow[]; config: PublicConfig; fmt: SiteFormat }) {
  return (
    <CardStack>
      {items.map((request) => (
        <RecordCard
          key={request.id}
          title={request.project_name ?? request.project_code ?? t(config, "ui.zitounti.request_fallback_title")}
          reference={request.request_no}
          status={<StatusPill tone="info">{fmt.formatDate(request.created_at)}</StatusPill>}
        >
          <DataList className="text-sm">
            {request.trees !== null ? (
              <DataRow label={t(config, "ui.zitounti.trees_count_label")}>
                {t(config, "ui.zitounti.trees_count", { count: request.trees })}
              </DataRow>
            ) : null}
            {request.price_per_tree_millimes !== null ? (
              <DataRow label={t(config, "ui.zitounti.price_per_tree")}>
                {fmt.formatMillimes(request.price_per_tree_millimes)}
              </DataRow>
            ) : null}
            {request.total_price_millimes !== null ? (
              <DataRow label={t(config, "ui.zitounti.total")} size="lg">
                {fmt.formatMillimes(request.total_price_millimes)}
              </DataRow>
            ) : null}
            {request.annual_fee_per_tree_millimes !== null ? (
              <DataRow label={t(config, "ui.zitounti.annual_fee_per_tree")}>
                {fmt.formatMillimes(request.annual_fee_per_tree_millimes)}
              </DataRow>
            ) : null}
            {request.annual_fee_total_millimes !== null ? (
              <DataRow label={t(config, "ui.zitounti.annual_fee_total")}>
                {fmt.formatMillimes(request.annual_fee_total_millimes)}
              </DataRow>
            ) : null}
          </DataList>

          {/* The figures above are the quotation as it stood the day the request was sent, snapshotted on the
              request itself. The annual fee has already changed more than once under live requests, and a
              client is owed the number they were shown — so this sentence is not decoration. */}
          <p className="mt-snug text-caption leading-6 text-muted">{t(config, "ui.zitounti.request_prices_note")}</p>
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
  fmt,
}: {
  items: ZitountiReservationRow[];
  config: PublicConfig;
  fmt: SiteFormat;
}) {
  return (
    <CardStack>
      {items.map((reservation) => (
        <RecordCard
          key={reservation.id}
          title={reservation.project_code ?? t(config, "ui.zitounti.reservation_fallback_title")}
          reference={reservation.reference_no}
          status={
            <StatusPill tone={reservation.deposit_paid_at ? "success" : "attention"}>
              {reservationStatusWord(config, reservation.status)}
            </StatusPill>
          }
        >
          <DataList className="text-sm">
            <DataRow label={t(config, "ui.zitounti.trees_count_label")}>
              {t(config, "ui.zitounti.trees_count", { count: reservation.trees })}
            </DataRow>
            <DataRow label={t(config, "ui.zitounti.deposit")}>{fmt.formatMillimes(reservation.deposit_due_millimes)}</DataRow>
            {reservation.reserved_at ? (
              <DataRow label={t(config, "ui.zitounti.reserved_on")}>{fmt.formatDate(reservation.reserved_at)}</DataRow>
            ) : null}
            {/* Kept even once the deposit is in: «كان يسالي نهار…» is how a client checks the hold was honoured. */}
            {reservation.expires_at ? (
              <DataRow label={t(config, "ui.zitounti.expires_on")}>{fmt.formatDate(reservation.expires_at)}</DataRow>
            ) : null}
            {reservation.deposit_paid_at ? (
              <DataRow label={t(config, "ui.zitounti.deposit_paid_on")}>{fmt.formatDate(reservation.deposit_paid_at)}</DataRow>
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

function VisitsSection({ items, config, fmt }: { items: ZitountiVisitRow[]; config: PublicConfig; fmt: SiteFormat }) {
  return (
    <CardStack>
      {items.map((visit) => (
        <RecordCard
          key={visit.id}
          title={visit.project_code ?? t(config, "ui.zitounti.visit_fallback_title")}
          reference={visit.visit_no}
          status={
            <StatusPill tone={visit.status === "completed" ? "success" : "progress"}>
              {visitStatusWord(config, visit.status)}
            </StatusPill>
          }
        >
          <DataList className="text-sm">
            {visit.visit_date ? (
              <DataRow label={t(config, "ui.zitounti.date")}>{fmt.formatDate(visit.visit_date)}</DataRow>
            ) : null}
            {visit.slot_label_ar ? (
              <DataRow label={t(config, "ui.zitounti.time_slot")} numeric={false}>
                {listLabel(config, "visit_slot", visit.slot_label_ar)}
              </DataRow>
            ) : null}
            {visit.meeting_point ? (
              <DataRow label={t(config, "ui.zitounti.meeting_point")} layout="stacked" numeric={false}>
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

function PaymentsSection({ items, config, fmt }: { items: ZitountiPaymentRow[]; config: PublicConfig; fmt: SiteFormat }) {
  return (
    <CardStack>
      {items.map((payment) => (
        <RecordCard
          key={payment.id}
          title={paymentKindWord(config, payment.kind)}
          reference={payment.reference_no}
          status={
            payment.voided ? (
              <StatusPill tone="danger">{t(config, "ui.zitounti.voided")}</StatusPill>
            ) : (
              <StatusPill tone="success">{t(config, "ui.zitounti.received")}</StatusPill>
            )
          }
        >
          {/* The amount is the whole point of a receipt, so it is the largest thing on the card. A voided one
              keeps its figure and is struck through: a client who was told «خلّصت» and then sees the line
              vanish has no way to ask what became of it. */}
          <p
            className={`text-2xl font-bold tabular-nums ${payment.voided ? "text-muted line-through" : "text-forest"}`}
          >
            {fmt.formatMillimes(payment.amount_millimes)}
          </p>
          <DataList className="mt-snug text-sm">
            {payment.received_at ? (
              <DataRow label={t(config, "ui.zitounti.paid_on")}>{fmt.formatDate(payment.received_at)}</DataRow>
            ) : null}
            {payment.method_label_ar ? (
              <DataRow label={t(config, "ui.zitounti.payment_method")} numeric={false}>
                {listLabel(config, "payment_method", payment.method_label_ar)}
              </DataRow>
            ) : null}
            {payment.project_code ? (
              <DataRow label={t(config, "ui.zitounti.offer")} numeric={false}>
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

function ContractsSection({ items, config, fmt }: { items: ZitountiContractRow[]; config: PublicConfig; fmt: SiteFormat }) {
  return (
    <CardStack>
      {items.map((contract) => (
        <RecordCard
          key={contract.reference_no}
          title={
            contract.kind_label
              ? listLabel(config, "contract_kind", contract.kind_label)
              : t(config, "ui.zitounti.contract_fallback_title")
          }
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
              <DataRow label={t(config, "ui.zitounti.trees_count_label")}>
                {t(config, "ui.zitounti.trees_count", { count: contract.trees_count })}
              </DataRow>
            ) : null}
            {contract.total_price_millimes !== null ? (
              <DataRow label={t(config, "ui.zitounti.total_price")} size="lg">
                {fmt.formatMillimes(contract.total_price_millimes)}
              </DataRow>
            ) : null}
            {contract.offer_code ? (
              <DataRow label={t(config, "ui.zitounti.offer")} numeric={false}>
                <span dir="ltr">{contract.offer_code}</span>
              </DataRow>
            ) : null}
            {contract.signed_on ? (
              <DataRow label={t(config, "ui.zitounti.signed_on")}>{fmt.formatDate(contract.signed_on)}</DataRow>
            ) : null}
            {contract.owned_at ? (
              <DataRow label={t(config, "ui.zitounti.owned_on")}>{fmt.formatDate(contract.owned_at)}</DataRow>
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
function InstallmentLine({
  line,
  config,
  fmt,
}: {
  line: ZitountiInstallmentPlan["money"]["lines"][number];
  config: PublicConfig;
  fmt: SiteFormat;
}) {
  const tone = line.is_late ? "danger" : line.status === "paid" ? "success" : line.status === "partial" ? "warning" : "neutral";

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">
          <span className="tabular-nums">{t(config, "ui.zitounti.installment_number", { seq: line.seq })}</span>
          <span className="mx-2 text-muted">·</span>
          <span className="tabular-nums font-normal text-muted">{fmt.formatDate(line.due_on)}</span>
        </p>
        <StatusPill tone={tone}>{line.status_label}</StatusPill>
      </div>

      <DataList variant="grid" columns={3} className="mt-tight text-caption">
        <DataRow label={t(config, "ui.zitounti.amount")} layout="stacked">
          {fmt.formatMillimes(line.amount_millimes)}
        </DataRow>
        <DataRow label={t(config, "ui.zitounti.paid")} layout="stacked">
          {fmt.formatMillimes(line.paid_millimes)}
        </DataRow>
        <DataRow label={t(config, "ui.zitounti.left")} layout="stacked">
          {fmt.formatMillimes(line.left_millimes)}
        </DataRow>
      </DataList>

      {line.is_late && line.days_late !== null ? (
        <p className="mt-tight text-caption font-semibold text-danger">
          {t(config, "ui.zitounti.days_late", { days: line.days_late })}
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
                {fmt.formatMillimes(receipt.amount_millimes)}
              </span>
              {receipt.received_at ? (
                <>
                  <span className="mx-1">·</span>
                  <span className="tabular-nums">{fmt.formatDate(receipt.received_at)}</span>
                </>
              ) : null}
              {receipt.method_label ? (
                <span className="mx-1">· {listLabel(config, "payment_method", receipt.method_label)}</span>
              ) : null}
              {receipt.voided ? (
                <span className="mx-1 font-semibold text-danger">· {t(config, "ui.zitounti.voided")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {line.note ? <p className="mt-tight text-caption text-muted">{line.note}</p> : null}
    </li>
  );
}

function InstallmentsSection({
  items,
  config,
  fmt,
}: {
  items: ZitountiInstallmentPlan[];
  config: PublicConfig;
  fmt: SiteFormat;
}) {
  return (
    <CardStack>
      {items.map((plan) => {
        const money = plan.money;
        return (
          <RecordCard
            key={plan.contract_no}
            title={t(config, "ui.zitounti.schedule_title")}
            reference={plan.contract_no}
            status={<StatusPill tone={money.is_settled ? "success" : "progress"}>{money.stage_label}</StatusPill>}
          >
            {/* The three figures a client opens this screen for, in the order they ask them: what do I owe in
                total, what has arrived, what is left. Summed in SQL, printed here. */}
            <DataList variant="grid" columns={3} className="text-sm">
              <DataRow label={t(config, "ui.zitounti.total")} layout="stacked" size="lg">
                {fmt.formatMillimes(money.total_due_millimes)}
              </DataRow>
              <DataRow label={t(config, "ui.zitounti.paid")} layout="stacked" size="lg">
                {fmt.formatMillimes(money.total_paid_millimes)}
              </DataRow>
              <DataRow label={t(config, "ui.zitounti.left")} layout="stacked" size="lg">
                {fmt.formatMillimes(money.total_left_millimes)}
              </DataRow>
            </DataList>

            <DataList className="mt-snug text-sm">
              {money.down_payment_due_millimes > 0 ? (
                <DataRow label={money.down_payment_kind_label}>
                  {fmt.formatMillimes(money.down_payment_paid_millimes)} / {fmt.formatMillimes(money.down_payment_due_millimes)}
                </DataRow>
              ) : null}
              <DataRow label={t(config, "ui.zitounti.installments_count")}>
                {fmt.formatCount(money.installments_paid_count)} / {fmt.formatCount(money.installments_count)}
              </DataRow>
              {money.next_due_on ? (
                <DataRow label={t(config, "ui.zitounti.next_installment")}>
                  {fmt.formatDate(money.next_due_on)}
                  {money.next_due_millimes !== null ? ` · ${fmt.formatMillimes(money.next_due_millimes)}` : ""}
                </DataRow>
              ) : null}
              {money.missed_count > 0 ? (
                <DataRow label={t(config, "ui.zitounti.missed_installments")}>{fmt.formatCount(money.missed_count)}</DataRow>
              ) : null}
            </DataList>

            {money.grace_days > 0 ? (
              <p className="mt-snug text-caption leading-6 text-muted">
                {t(config, "ui.zitounti.grace_days_note", { days: money.grace_days })}
              </p>
            ) : null}

            <ul className="mt-snug divide-y divide-line border-t border-line">
              {money.lines.map((line) => (
                <InstallmentLine key={line.id} line={line} config={config} fmt={fmt} />
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

function OperationsSection({ items, config, fmt }: { items: ZitountiOperationRow[]; config: PublicConfig; fmt: SiteFormat }) {
  return (
    <CardStack>
      {items.map((operation) => (
        <RecordCard
          key={operation.id}
          // The label frozen on the operation the day it was recorded, not today's option list: a service the
          // owner renames must not rewrite what a client was told was done to their trees. Only while the frozen
          // words still ARE an item of the list is that item's translation printed (listLabel).
          title={
            operation.service_ar
              ? listLabel(config, "agrized_service", operation.service_ar)
              : t(config, "ui.zitounti.service_fallback_title")
          }
          reference={operation.project_code}
          status={
            <StatusPill tone={operation.executed_on ? "success" : "progress"}>
              {operationStatusWord(config, operation.status)}
            </StatusPill>
          }
        >
          <DataList className="text-sm">
            {operation.executed_on ? (
              <DataRow label={t(config, "ui.zitounti.done_on")}>{fmt.formatDate(operation.executed_on)}</DataRow>
            ) : operation.planned_on ? (
              <DataRow label={t(config, "ui.zitounti.planned_on")}>{fmt.formatDate(operation.planned_on)}</DataRow>
            ) : null}
            <DataRow label={t(config, "ui.zitounti.applies_to")} numeric={false}>
              {operation.scope === "offer" ? t(config, "ui.zitounti.scope_offer") : t(config, "ui.zitounti.scope_trees")}
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

function SubscriptionSection({
  items,
  config,
  fmt,
}: {
  items: ZitountiSubscriptionRow[];
  config: PublicConfig;
  fmt: SiteFormat;
}) {
  return (
    <CardStack>
      {items.map((subscription) => (
        <RecordCard
          key={subscription.id}
          title={subscription.season_label ?? t(config, "ui.zitounti.subscription_fallback_title")}
          reference={subscription.project_code}
          // §36 names Status and Payment as two attributes and they stay two: «سارية» and «ما تخلّصش» are not
          // one word, and merging them would hide whichever the client needed to read.
          status={
            subscription.payment_status ? (
              <StatusPill tone={subscription.payment_status === "paid" ? "success" : "attention"}>
                {subscriptionPaymentWord(config, subscription.payment_status)}
              </StatusPill>
            ) : undefined
          }
        >
          <DataList className="text-sm">
            {subscription.season_starts_on ? (
              <DataRow label={t(config, "ui.zitounti.season_start")}>{fmt.formatDate(subscription.season_starts_on)}</DataRow>
            ) : null}
            {subscription.trees !== null ? (
              <DataRow label={t(config, "ui.zitounti.trees_count_label")}>
                {t(config, "ui.zitounti.trees_count", { count: subscription.trees })}
              </DataRow>
            ) : null}
            {subscription.fee_per_tree_millimes !== null ? (
              <DataRow label={t(config, "ui.zitounti.fee_per_tree")}>
                {fmt.formatMillimes(subscription.fee_per_tree_millimes)}
              </DataRow>
            ) : null}
            {subscription.amount_millimes !== null ? (
              <DataRow label={t(config, "ui.zitounti.total")} size="lg">
                {fmt.formatMillimes(subscription.amount_millimes)}
              </DataRow>
            ) : null}
          </DataList>

          {/* «شنو داخل وشنو خارج الباقة» — the one question a client actually asks about a subscription, so a
              total with no contents under it does not answer it. */}
          {subscription.lines.length > 0 ? (
            <ul className="mt-snug divide-y divide-line border-t border-line text-sm">
              {subscription.lines.map((line) => (
                <li key={line.label_ar} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">{listLabel(config, "agrized_service", line.label_ar)}</span>
                  {line.in_package ? (
                    <StatusPill tone="brand">{t(config, "ui.zitounti.in_package")}</StatusPill>
                  ) : (
                    <span className="flex-none tabular-nums font-semibold text-ink">
                      {fmt.formatMillimes(line.amount_millimes)}
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

function HarvestSection({ items, config, fmt }: { items: ZitountiHarvestRow[]; config: PublicConfig; fmt: SiteFormat }) {
  const shareNote = t(config, "zitounti.share_note");

  return (
    <CardStack>
      {items.map((season) => (
        <RecordCard
          key={season.season_id}
          title={
            season.season_label ??
            (season.season_year !== null
              ? // A year is a name here, not a quantity: passed as a string so it is never grouped («2,026»).
                t(config, "ui.zitounti.harvest_season_title", { year: String(season.season_year) })
              : t(config, "ui.zitounti.harvest_fallback_title"))
          }
          reference={season.project_code}
          status={
            <StatusPill tone={season.settled ? "success" : "progress"}>
              {season.settled ? t(config, "ui.zitounti.harvest_settled") : t(config, "ui.zitounti.harvest_pending")}
            </StatusPill>
          }
        >
          {/* Mine first — frozen into the settlement row, never recomputed here, because a later correction of
              the season must not silently restate a figure an owner has already been told. */}
          {season.settled ? (
            <DataList variant="grid" columns={3} className="text-sm">
              {season.my_trees !== null ? (
                <DataRow label={t(config, "ui.zitounti.my_trees")} layout="stacked">
                  {fmt.formatCount(season.my_trees)}
                </DataRow>
              ) : null}
              {season.my_olives_kg !== null ? (
                <DataRow label={t(config, "ui.zitounti.olives")} layout="stacked" size="lg">
                  {t(config, "ui.zitounti.kg", { value: fmt.formatCount(season.my_olives_kg) })}
                </DataRow>
              ) : null}
              {season.my_oil_litres !== null ? (
                <DataRow label={t(config, "ui.zitounti.oil")} layout="stacked" size="lg">
                  {t(config, "ui.zitounti.litres", { value: fmt.formatCount(season.my_oil_litres) })}
                </DataRow>
              ) : null}
            </DataList>
          ) : (
            <DataList className="text-sm">
              {season.choice_deadline ? (
                <DataRow label={t(config, "ui.zitounti.choice_deadline")}>{fmt.formatDate(season.choice_deadline)}</DataRow>
              ) : null}
            </DataList>
          )}

          <DataList className="mt-snug text-sm">
            {season.pick_label_ar ? (
              <DataRow label={t(config, "ui.zitounti.pick_method")} numeric={false}>
                {listLabel(config, "harvest_pick", season.pick_label_ar)}
              </DataRow>
            ) : null}
            {season.outcome_label_ar ? (
              <DataRow label={t(config, "ui.zitounti.outcome")} numeric={false}>
                {listLabel(config, "harvest_outcome", season.outcome_label_ar)}
              </DataRow>
            ) : null}
            {season.season_olives_kg !== null ? (
              <DataRow label={t(config, "ui.zitounti.grove_harvest")}>
                {t(config, "ui.zitounti.kg", { value: fmt.formatCount(season.season_olives_kg) })}
              </DataRow>
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

function DocumentsSection({ items, config, fmt }: { items: ZitountiDocumentRow[]; config: PublicConfig; fmt: SiteFormat }) {
  return (
    <CardStack>
      {items.map((document, index) => (
        <RecordCard
          key={`${document.kind}-${document.reference_no ?? index}`}
          title={documentKindWord(config, document.kind)}
          reference={document.reference_no}
          status={document.at ? <StatusPill tone="info">{fmt.formatDate(document.at)}</StatusPill> : undefined}
        >
          <DataList className="text-sm">
            {document.offer_code ? (
              <DataRow label={t(config, "ui.zitounti.offer")} numeric={false}>
                <span dir="ltr">{document.offer_code}</span>
              </DataRow>
            ) : null}
            {document.legal_ref ? (
              <DataRow label={t(config, "ui.zitounti.legal_ref")} numeric={false}>
                <span dir="ltr">{document.legal_ref}</span>
              </DataRow>
            ) : null}
          </DataList>

          {/* A document with no storage_path exists as a RECORD, not as a FILE — a reference to quote down the
              phone, not something to open. Drawing it as a link would be a broken promise, so it is drawn as a
              sentence instead. That distinction is the whole reason the column is in the payload. */}
          <p className="mt-snug text-caption leading-6 text-muted">
            {document.storage_path
              ? t(config, "ui.zitounti.document_stored_note")
              : t(config, "ui.zitounti.document_record_note")}
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
  const fmt = formatFor(config);

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
      return <TreesSection items={file.trees.items} config={config} fmt={fmt} />;
    case "requests":
      return <RequestsSection items={file.requests.items} config={config} fmt={fmt} />;
    case "reservations":
      return <ReservationsSection items={file.reservations.items} config={config} fmt={fmt} />;
    case "visits":
      return <VisitsSection items={file.visits.items} config={config} fmt={fmt} />;
    case "payments":
      return <PaymentsSection items={file.payments.items} config={config} fmt={fmt} />;
    case "contracts":
      return (
        <div className="space-y-roomy">
          {file.contracts.items.length > 0 ? (
            <ContractsSection items={file.contracts.items} config={config} fmt={fmt} />
          ) : null}
          {/* The owner's own label for this row is «العقود والأقساط», so the schedule is drawn under the
              contracts it belongs to rather than hidden behind a second tap. It gets its own heading only when
              there are contracts above it to tell it apart from. /zitounti/installments still reaches the
              schedule on its own for a client who has only that. */}
          {file.installments.items.length > 0 ? (
            <section>
              {file.contracts.items.length > 0 ? (
                <SectionHeader title={t(config, "zitounti.section_installments")} level={2} className="mb-snug" />
              ) : null}
              <InstallmentsSection items={file.installments.items} config={config} fmt={fmt} />
            </section>
          ) : null}
        </div>
      );
    case "installments":
      return <InstallmentsSection items={file.installments.items} config={config} fmt={fmt} />;
    case "operations":
      return <OperationsSection items={file.operations.items} config={config} fmt={fmt} />;
    case "subscription":
      return <SubscriptionSection items={file.subscription.items} config={config} fmt={fmt} />;
    case "harvest":
      return <HarvestSection items={file.harvest.items} config={config} fmt={fmt} />;
    case "documents":
      return <DocumentsSection items={file.documents.items} config={config} fmt={fmt} />;
  }
}

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

/**
 * The sign-in panel, in one place because TWO routes need it — and, since 2026-09-28, one more screen.
 *
 * /zitounti and /zitounti/<section> both belong to a signed-in buyer, and a visitor who lands on either with
 * no session must meet the same door — not a redirect that loses where they were going, and not a second
 * arrangement of the same form that drifts from the first. The words are the owner's, from the `zitounti`
 * settings group.
 *
 * `mode="set_password"` is the same panel for a buyer who IS signed in — the code by SMS proved the number —
 * but has not chosen a password yet. The account stays behind this screen until they do: the owner's spec
 * says the SMS is sent once and every later sign-in is phone + password, and a buyer allowed past this step
 * without one would be back to asking for an SMS next time. The minimum length is the owner's rule in SQL
 * (client_password_policy, service-role only), read here on the server and handed to the form.
 *
 * THE INTRO SENTENCE. `zitounti.login_note` was seeded (0105) for the SMS-only door and says «ونبعثولك رمز
 * بالSMS», which is no longer what the default screen does. The password door reads its own key,
 * `zitounti.password_login_note`.
 *
 * The form's own words are the `ui.login.*` settings; <Texts> hands them to it in the visitor's language, here
 * and therefore on both routes that show the door.
 */
export async function ClientLoginPanel({
  config,
  title,
  mode = "login",
}: {
  config: PublicConfig;
  title: string;
  mode?: "login" | "set_password";
}) {
  const help = settingText(config, "site.contact_phone");

  let initialState: LoginState | undefined;
  if (mode === "set_password") {
    const policy = await passwordPolicy();
    initialState = {
      ...LOGIN_INITIAL,
      step: "set_password",
      minLength: policy.ok ? policy.minLength : 0,
      // A policy that cannot be read is said out loud rather than swallowed: the action would refuse the
      // password anyway, and «why» belongs on the screen before the buyer types anything.
      error: policy.ok
        ? null
        : policy.reason === "not_applied"
          ? t(config, "ui.zitounti.password_policy_not_applied")
          : t(config, "ui.zitounti.password_policy_unreadable"),
    };
  }

  const note = t(config, mode === "set_password" ? "zitounti.set_password_note" : "zitounti.password_login_note");

  return (
    <div className="mx-auto w-full max-w-md px-4 py-section">
      <h1 className="font-display text-2xl font-bold text-forest-700">{title}</h1>
      <p className="mt-2 text-[0.95rem] leading-7 text-muted">{note}</p>
      <div className="card mt-6 p-card">
        {/* Keyed on the mode: useActionState reads its initial state once, at mount, so the form that was
            drawn at «أنشئ كلمة سرّ» must be remounted — not re-rendered — when the buyer signs out from that
            step and the page comes back as the plain door. */}
        <Texts prefixes={["ui.login."]}>
          <ClientLoginForm key={mode} helpPhone={help || null} initialState={initialState} />
        </Texts>
      </div>
      <PhoneLanguage className="mt-6" />
    </div>
  );
}
