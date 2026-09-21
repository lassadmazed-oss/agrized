// فضاء «زيتونتي» for one client — v3 §38 ممتلكاتي and §39 Citizen Dashboard, read by the team.
//
// The order of the page is the order a buyer asks the questions in: which trees are mine (by their codes,
// because the code is the thing they were told), where they are, what has been done to them, what I asked for
// and paid, and what came out of this season.
//
// WHY THE TEAM READS IT AND NOT THE BUYER. No client can sign in — no user carries the role 'client',
// persons.profile_id is written nowhere, and src/lib/auth.ts strips 'client' from every session. So this is the
// same file, read down the phone, until the owner decides how a buyer signs in. Everything on it comes from
// public.staff_zitounti_file(), which is keyed by person and gated by app.can_see_person, so the day a client
// login exists the same payload renders for its owner.
//
// This page writes nothing. There is no Server Action in this folder, and there is no form on this screen.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataRow, EmptyState, StatTile, StatusPill } from "@/components/ui";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, settingText } from "@/lib/config";
import { formatArea, formatCount, formatDate, formatDateTime, formatMillimes } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { FAILURE_MESSAGES, zitountiCopy, zitountiFile, type TreeGroup } from "../read";
import { SectionCard } from "../section-card";

// The module's own state is read per request (an "internal" flag checks the staff session), so this page is
// never prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ملف الحريف" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ZitountiPersonPage({ params }: PageProps<"/admin/persons/[personId]">) {
  // The same five roles app.can_see_person() admits. The agricultural manager runs the grove and does not read
  // client identities; the database refuses them too, so this is the second half of one rule, not a new one.
  await requireStaff(CRM_READ_ROLES);

  const { personId } = await params;
  if (!UUID.test(personId)) notFound();

  const supabase = await createClient();
  const config = await getPublicConfig();
  const [access, copy] = await Promise.all([moduleAccess(config, "zitounti"), zitountiCopy(supabase)]);

  const title = copy("zitounti.title", "فضاء «زيتونتي»");

  if (access === "closed") {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState title={title}>{FAILURE_MESSAGES.closed}</EmptyState>
      </div>
    );
  }

  const result = await zitountiFile(supabase, personId);
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState title={title}>{FAILURE_MESSAGES[result.reason]}</EmptyState>
      </div>
    );
  }

  const file = result.file;
  const person = file.person;
  const notBuilt = copy("zitounti.not_built_note", "هذا الجزء مازال ما تركّبش. يُبنى في دفعة قادمة.");
  const closedNote = copy("zitounti.closed_section_note", "الوحدة اللي تكتب هذا الجزء معطّلة.");
  const soldLabel = settingText(config, "offers.stock_sold_label", "المباعة");
  const reservedLabel = settingText(config, "offers.stock_reserved_label", "المحجوزة");

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="section-title">{person.full_name}</h1>
              {person.status_ar ? <StatusPill tone="brand">{person.status_ar}</StatusPill> : null}
              {person.archived ? <StatusPill tone="neutral">مؤرشف</StatusPill> : null}
            </div>
            <p className="text-muted">
              {[person.delegation, person.governorate].filter(Boolean).join("، ") || "بلا مكان مسجّل"}
              {person.assigned_to ? ` · مكلّف بيه: ${person.assigned_to}` : ""}
            </p>
            <p className="text-sm text-muted">{copy("zitounti.staff_note")}</p>
          </div>
          <div className="space-y-2 text-sm">
            <a href={`tel:${person.phone_e164}`} dir="ltr" className="btn btn-primary">
              {formatPhone(person.phone_e164)}
            </a>
            {/* The one fact that says whether this file could be read by its owner. It is false for everyone
                today, and saying so is what keeps «زيتونتي» from looking finished. */}
            <p className="text-xs text-muted">
              {person.has_account ? "عندو حساب يدخل بيه" : "ما عندوش حساب يدخل بيه — الفضاء مازال ما تفتحش للحرفاء"}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={copy("zitounti.section_trees", "زيتوناتي")} value={file.totals.trees} />
        <StatTile label={soldLabel} value={file.totals.trees_sold} quiet={file.totals.trees_sold === 0} />
        <StatTile label={reservedLabel} value={file.totals.trees_reserved} quiet={file.totals.trees_reserved === 0} />
        <StatTile
          label={copy("zitounti.section_payments", "دفعاتي")}
          value={file.totals.paid_millimes === null ? "—" : formatMillimes(file.totals.paid_millimes)}
          note={file.totals.paid_millimes === null ? closedNote : undefined}
        />
      </div>

      {/* 1 · Which trees are mine. Everything else on the page hangs off this. */}
      <SectionCard
        title={copy("zitounti.section_trees", "زيتوناتي")}
        description={copy("zitounti.intro")}
        status={file.trees.status}
        count={file.trees.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote={copy("zitounti.empty_trees", "هذا الحريف مازال ما عندوش زيتونات مسجّلة باسمه.")}
      >
        <div className="space-y-4">
          {file.trees.items.map((group) => (
            <OfferTrees
              key={group.project_id}
              group={group}
              soldLabel={soldLabel}
              reservedLabel={reservedLabel}
              areaLabel={copy("zitounti.row_area", "المساحة")}
              areaUnknown={copy("zitounti.row_area_unknown")}
            />
          ))}
        </div>
      </SectionCard>

      {/* 2 · What was done to them. */}
      <SectionCard
        title={copy("zitounti.section_operations", "الخدمات الفلاحية")}
        status={file.operations.status}
        count={file.operations.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote="مازال ما تسجّلت حتى عملية فلاحية على زيتونات هذا الحريف."
      >
        <dl className="divide-y divide-line">
          {file.operations.items.map((row) => (
            <DataRow key={row.id} label={row.service_ar ?? "خدمة"} numeric={false}>
              <span className="flex flex-wrap items-center justify-end gap-2 text-sm">
                {row.executed_on
                  ? formatDate(row.executed_on)
                  : row.planned_on
                    ? `مبرمجة ${formatDate(row.planned_on)}`
                    : "بلا تاريخ"}
                {row.project_code ? ` · ${row.project_code}` : ""}
                {/* An act on the whole grove and an act on this client's own trees are not the same news. */}
                {row.scope === "trees" ? <StatusPill tone="brand">على زيتوناته</StatusPill> : null}
                {row.status === "planned" ? <StatusPill tone="info">مبرمجة</StatusPill> : null}
              </span>
            </DataRow>
          ))}
        </dl>
      </SectionCard>

      {/* 3 · What they pay for every year. */}
      <SectionCard
        title={copy("zitounti.section_subscription", "الاشتراك السنوي")}
        status={file.subscription.status}
        count={file.subscription.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote="ما عندو حتى اشتراك سنوي مسجّل."
      >
        <div className="space-y-3">
          {file.subscription.items.map((row) => (
            <div key={row.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {row.project_code} · {row.season_label}
                </p>
                <span className="flex flex-wrap gap-1.5">
                  {/* §36 names Status and Payment as two attributes; two pills, never one merged label. */}
                  {row.status ? <StatusPill tone="info">{row.status}</StatusPill> : null}
                  {row.payment_status ? <StatusPill tone="warning">{row.payment_status}</StatusPill> : null}
                </span>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                <DataRow layout="stacked" label="عدد الزيتونات">{formatCount(row.trees ?? 0)}</DataRow>
                <DataRow layout="stacked" label="المعلوم للزيتونة في العام">
                  {row.fee_per_tree_millimes !== null ? formatMillimes(row.fee_per_tree_millimes) : "—"}
                </DataRow>
                <DataRow layout="stacked" label="الجملة في العام">
                  {row.amount_millimes !== null ? formatMillimes(row.amount_millimes) : "—"}
                </DataRow>
              </dl>
              {/* «شنو داخل وشنو خارج الباقة» (v2 §40): a total with no contents answers nothing. */}
              {row.lines.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.lines.map((line) => (
                    <span key={line.label_ar} className="chip">
                      {line.label_ar}
                      {line.in_package ? " · داخل الباقة" : ` · ${formatMillimes(line.amount_millimes)}`}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 4 · What came out of the season. */}
      <SectionCard
        title={copy("zitounti.section_harvest", "الصابة")}
        description={copy("zitounti.share_note")}
        status={file.harvest.status}
        count={file.harvest.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote="مازال ما تسجّلت حتى صابة في العروض اللي فيها زيتوناته."
      >
        <div className="space-y-4">
          {file.harvest.items.map((row) => (
            <div key={row.season_id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {row.project_code} · {row.season_label}
                </p>
                {/* A season still running has no share yet: the allocation is written once, at settlement. */}
                <StatusPill tone={row.settled ? "success" : "info"}>{row.settled ? "مخلّصة" : "مازالت"}</StatusPill>
              </div>

              {row.settled ? (
                <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <DataRow layout="stacked" label="حصّتي من الزيتون">
                    {row.my_olives_kg !== null ? `${formatCount(row.my_olives_kg)} كغ` : "—"}
                  </DataRow>
                  <DataRow layout="stacked" label="حصّتي من الزيت">
                    {row.my_oil_litres !== null ? `${formatCount(row.my_oil_litres)} لتر` : "—"}
                  </DataRow>
                  <DataRow layout="stacked" label="صابة الضيعة الكل">
                    {row.season_olives_kg !== null ? `${formatCount(row.season_olives_kg)} كغ` : "—"}
                  </DataRow>
                  <DataRow layout="stacked" label="زيتوناتي من زيتونات الصابة">
                    {formatCount(row.my_trees ?? 0)} / {formatCount(row.trees_harvested ?? 0)}
                  </DataRow>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  {row.choice_deadline ? `باب الاختيار مفتوح حتّى ${formatDate(row.choice_deadline)}.` : "الصابة مازالت ما تخلّصتش."}
                </p>
              )}

              {/* v2 §44: who picks the olives, and what becomes of them. Frozen wording once settled. */}
              {row.pick_label_ar || row.outcome_label_ar ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.pick_label_ar ? <span className="chip">{row.pick_label_ar}</span> : null}
                  {row.outcome_label_ar ? <span className="chip">{row.outcome_label_ar}</span> : null}
                  {/* «auto» = nobody answered before the deadline and the offer's default stood (bb_41). */}
                  {row.choice_source === "auto" ? <StatusPill tone="neutral">تلقائي</StatusPill> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 5 · What they asked for, and the figures they were shown on the day. */}
      <SectionCard
        title={copy("zitounti.section_requests", "مطالبي")}
        status={file.requests.status}
        count={file.requests.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote="ما عمّرش حتى استمارة — يمكن الفريق سجّلو بيدو."
      >
        <div className="space-y-3">
          {file.requests.items.map((row) => (
            <div key={row.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{row.project_name ?? row.project_code ?? "مطلب عام"}</p>
                <p dir="ltr" className="text-sm text-muted tabular-nums">
                  {row.request_no} · {formatDateTime(row.created_at)}
                </p>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                <DataRow layout="stacked" label="عدد الزيتونات">{formatCount(row.trees ?? 0)}</DataRow>
                <DataRow layout="stacked" label="السعر الجملي وقت المطلب">
                  {row.total_price_millimes !== null ? formatMillimes(row.total_price_millimes) : "—"}
                </DataRow>
                {/* The fee frozen on the request, never today's global value: three different annual fees are
                    already live on interest_requests, and a client is owed the number they were shown. */}
                <DataRow layout="stacked" label={settingText(config, "start.row_annual_fee", "المعاليم السنوية")}>
                  {row.annual_fee_total_millimes !== null ? formatMillimes(row.annual_fee_total_millimes) : "—"}
                </DataRow>
              </dl>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 6 · Reservations, visits and receipts — each written by its own module, each behind its own flag. */}
      <SectionCard
        title={copy("zitounti.section_reservations", "حجوزاتي")}
        status={file.reservations.status}
        count={file.reservations.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote="ما عندو حتى حجز."
      >
        <dl className="divide-y divide-line">
          {file.reservations.items.map((row) => (
            <DataRow key={row.id} label={`${row.reference_no} · ${row.project_code ?? ""}`} numeric={false}>
              <span className="text-sm">
                {formatCount(row.trees)} زيتونة · {formatMillimes(row.deposit_due_millimes)}
                {row.expires_at ? ` · تسكّر ${formatDate(row.expires_at)}` : ""}
              </span>
            </DataRow>
          ))}
        </dl>
      </SectionCard>

      <SectionCard
        title={copy("zitounti.section_visits", "زياراتي")}
        status={file.visits.status}
        count={file.visits.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote="ما زارش حتى ضيعة."
      >
        <dl className="divide-y divide-line">
          {file.visits.items.map((row) => (
            <DataRow key={row.id} label={`${row.visit_no} · ${row.project_code ?? ""}`} numeric={false}>
              <span className="text-sm">
                {row.visit_date ? formatDate(row.visit_date) : "بلا تاريخ"}
                {row.slot_label_ar ? ` · ${row.slot_label_ar}` : ""}
              </span>
            </DataRow>
          ))}
        </dl>
      </SectionCard>

      <SectionCard
        title={copy("zitounti.section_payments", "دفعاتي")}
        status={file.payments.status}
        count={file.payments.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote="ما خلّص حتى دفعة."
      >
        <dl className="divide-y divide-line">
          {file.payments.items.map((row) => (
            <DataRow key={row.id} label={`${row.reference_no}${row.project_code ? ` · ${row.project_code}` : ""}`} numeric={false}>
              <span className="flex flex-wrap items-center justify-end gap-2 text-sm tabular-nums">
                {formatMillimes(row.amount_millimes)}
                {row.received_at ? ` · ${formatDate(row.received_at)}` : ""}
                {/* A voided receipt is shown and marked, never removed: a client who was told «خلّصت» must be
                    able to ask what became of it. */}
                {row.voided ? <StatusPill tone="danger">ملغاة</StatusPill> : null}
              </span>
            </DataRow>
          ))}
        </dl>
      </SectionCard>

      {/* 7 · The rows of v3 §38 that stage 3 owns. Named, so the screen does not look finished. */}
      {/* Four of v3 §38's twelve rows — العقد · المبلغ المدفوع · المبلغ المتبقي · القسط القادم — are made from
          a contract, and the contract is stage 3. They keep their heading and say so, because a screen that
          drops them looks finished and a screen that renders them empty looks broken. */}
      <SectionCard
        title={copy("zitounti.section_contracts", "العقود والأقساط")}
        status={file.contracts.status}
        count={file.contracts.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote={notBuilt}
      >
        {null}
      </SectionCard>

      {/* v3 §45 lists the documents the system keeps for a client. None is stored against a person today; each
          offer's own plan and photos travel with the tree group above. */}
      <SectionCard
        title={copy("zitounti.section_documents", "الوثائق")}
        status={file.documents.status}
        count={file.documents.count}
        notBuiltNote={notBuilt}
        closedNote={closedNote}
        emptyNote={notBuilt}
      >
        {null}
      </SectionCard>

      <p className="text-xs text-muted">قُرئ في {formatDateTime(file.read_at)}</p>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/persons" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
      → ملفات الحرفاء
    </Link>
  );
}

/** One offer's worth of trees: where they stand, how many, and their codes — which is what the buyer was told. */
function OfferTrees({
  group,
  soldLabel,
  reservedLabel,
  areaLabel,
  areaUnknown,
}: {
  group: TreeGroup;
  soldLabel: string;
  reservedLabel: string;
  areaLabel: string;
  areaUnknown: string;
}) {
  const hidden = group.trees - group.codes.length;

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{group.project_name ?? group.project_code}</p>
        <p dir="ltr" className="text-sm text-muted">
          {group.project_code}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {[group.delegation, group.governorate].filter(Boolean).join("، ")}
        {group.olive_variety ? ` · ${group.olive_variety}` : ""}
      </p>

      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
        <DataRow layout="stacked" label="عدد الزيتونات">{formatCount(group.trees)}</DataRow>
        <DataRow layout="stacked" label={soldLabel}>{formatCount(group.trees_sold)}</DataRow>
        <DataRow layout="stacked" label={reservedLabel}>{formatCount(group.trees_reserved)}</DataRow>
        <DataRow layout="stacked" numeric={false} label={areaLabel}>
          {group.area_m2 !== null ? formatArea(group.area_m2) : <span className="text-sm font-normal text-muted">{areaUnknown}</span>}
        </DataRow>
        <DataRow layout="stacked" numeric={false} label="من رمز إلى رمز">
          <span dir="ltr">
            {group.first_code} … {group.last_code}
          </span>
        </DataRow>
        <DataRow layout="stacked" numeric={false} label="خدمات هذا العرض">
          {group.services.length > 0 ? group.services.join("، ") : "ما فمّاش خدمات مسجّلة في بطاقة العرض"}
        </DataRow>
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.codes.map((code) => (
          <span key={code} dir="ltr" className="chip tabular-nums">
            {code}
          </span>
        ))}
        {hidden > 0 ? <span className="chip">+{formatCount(hidden)}</span> : null}
      </div>
    </div>
  );
}
