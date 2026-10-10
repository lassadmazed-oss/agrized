import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { DataTable, EmptyState, SectionHeader, StatTile, type Column } from "@/components/ui";
import { ADMIN_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import {
  ALERT_LABELS,
  BASIS_LABELS,
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_NOTES,
  COMMISSION_STATUSES,
  isCommissionStatus,
  type CommissionRow,
  type CommissionStatus,
  type PayoutRow,
  type ReferralAlert,
  type ReferralOverview,
  type ReferralPerson,
} from "@/lib/backoffice/referrals";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { cancelCommission, payCommissions, saveCommissionRule, setOfferReferral } from "./actions";
import { RuleForm } from "./rule-form";

export const metadata: Metadata = { title: "التوصية والكوميسيونات" };

/**
 * التوصية والكوميسيونات — the parrainage (0136), Finance's and Admin's screen.
 *
 * IT OPENS ON WHAT IS OWED. «للخلاص» lists every client with validated commissions — sales paid in full — and
 * one form per client pays them in a single payout: the approval the spec asks for (§6 «يوافق على خلاصها») is
 * that act, by a human, never a timer. Below it: every commission with its state, the payouts, the signals of
 * fraud, the rule and the offers, and the people who brought the most.
 *
 * NOTHING HERE IS COMPUTED. Amounts, states, the per-sale cut to keep the margin, the alerts: all arrive from
 * the staff_referral_* functions, which check app.can_record_money() themselves.
 *
 * THE MODULE MAY BE OFF and the screen still opens, as every Back Office module does: the team prepares the rule
 * before the owner publishes anything. While it is off nothing is captured from links and no sale creates a
 * commission; the notice at the top says so and where the switch is.
 */
export default async function ReferralsPage({ searchParams }: PageProps<"/admin/referrals">) {
  const session = await requireStaff(PRICE_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const params = await searchParams;
  const status: CommissionStatus | null = isCommissionStatus(params.status) ? params.status : null;

  const supabase = await createClient();
  const [config, overviewRes, listRes, payoutsRes, alertsRes] = await Promise.all([
    getPublicConfig(),
    supabase.rpc("staff_referral_overview"),
    supabase.rpc("staff_referral_commissions", { p_status: status ?? undefined, p_limit: 200, p_offset: 0 }),
    supabase.rpc("staff_referral_payouts", { p_limit: 50, p_offset: 0 }),
    supabase.rpc("staff_referral_alerts"),
  ]);

  if (overviewRes.error || !overviewRes.data) {
    return (
      <div className="space-y-4">
        <SectionHeader as="h1" level={1} title="التوصية والكوميسيونات" />
        <EmptyState title="ما نجمناش نقراو معطيات التوصية.">
          إذا كانت هذي أول مرة، الملف 0136_referrals.sql مازال ما تركّبش في قاعدة البيانات. كلّم المسؤول، ومن بعد
          حدّث الصفحة.
        </EmptyState>
      </div>
    );
  }

  const overview = overviewRes.data as unknown as ReferralOverview;
  const list = (listRes.data as unknown as { total: number; rows: CommissionRow[] } | null) ?? { total: 0, rows: [] };
  const payouts = (payoutsRes.data as unknown as { total: number; rows: PayoutRow[] } | null) ?? { total: 0, rows: [] };
  const alerts = (alertsRes.data as unknown as ReferralAlert[] | null) ?? [];
  const methods = optionsFor(config, "payment_method").map((item) => item.label);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  const rule = overview.rule;

  const total = (key: CommissionStatus) => overview.totals[key] ?? { count: 0, millimes: 0 };

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        level={1}
        title="التوصية والكوميسيونات"
        description="كل حريف عندو كود ورابط. الكوميسيون تتحسب على 6 أجيال كي يصير بيع حقيقي، وتتأكّد كي البيع يتخلّص بالكامل."
        actions={
          <>
            <Link href="/admin/referrals/tree" className="btn btn-secondary">
              شجرة التوصية
            </Link>
            {/* A file to download, not a page: a plain link, as the leads export does. */}
            <a href={`/admin/referrals/export?kind=commissions`} className="btn btn-secondary">
              Export الكوميسيونات
            </a>
            <a href={`/admin/referrals/export?kind=payouts`} className="btn btn-secondary">
              Export الخلاصات
            </a>
          </>
        }
      />

      <ModuleNotice flag={overview.flag} />

      <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-5">
        {(["pending", "validated", "paid", "reversed"] as const).map((key) => (
          <StatTile
            key={key}
            label={COMMISSION_STATUS_LABELS[key]}
            value={formatMillimes(total(key).millimes)}
            note={`${formatCount(total(key).count)} كوميسيون · ${COMMISSION_STATUS_NOTES[key]}`}
            href={`/admin/referrals?status=${key}#commissions`}
            emphasis={key === "validated" && total(key).count > 0}
            quiet={total(key).count === 0}
            size="sm"
          />
        ))}
        <StatTile
          label="حرفاء جاو برابط"
          value={overview.referred_people}
          note="عندهم Parrain مسجّل."
          size="sm"
          quiet={overview.referred_people === 0}
        />
      </div>

      {/* ── what is owed ───────────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader
          title="للخلاص"
          description="كوميسيونات مبيعات تخلّصت بالكامل. الخلاص يتسجّل هنا بعد ما تعطيو الفلوس للحريف."
        />
        {overview.to_pay.length === 0 ? (
          <EmptyState size="sm">ما فماش كوميسيون مؤكّدة تستنّى الخلاص.</EmptyState>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {overview.to_pay.map((entry) => (
              <li key={entry.person.id} className="card space-y-3 p-cozy">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <PersonLabel person={entry.person} />
                  <span className="text-lg font-bold tabular-nums">{formatMillimes(entry.validated_millimes)}</span>
                </div>
                <p className="text-xs text-muted">{formatCount(entry.count)} كوميسيون مؤكّدة</p>
                <ActionForm action={payCommissions.bind(null, entry.person.id)} submitLabel="سجّل الخلاص" className="space-y-2">
                  {entry.ids.map((id) => (
                    <input key={id} type="hidden" name="ids" value={id} />
                  ))}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="block space-y-1">
                      <span className="text-xs text-muted">تاريخ الخلاص</span>
                      <input type="date" name="paid_on" required defaultValue={today} max={today} className="field field-sm w-full" />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-muted">طريقة الخلاص</span>
                      <input name="method" list="referral-methods" maxLength={120} className="field field-sm w-full" />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-muted">المرجع (وصل، تحويل…)</span>
                      <input name="reference" maxLength={200} className="field field-sm w-full" dir="ltr" />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs text-muted">ملاحظة ولا سبب</span>
                    <input name="reason" maxLength={1000} className="field field-sm w-full" />
                  </label>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        <datalist id="referral-methods">
          {methods.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      </section>

      {/* ── every commission ──────────────────────────────────────────────────────────────────────── */}
      <section id="commissions" className="space-y-3">
        <SectionHeader title="الكوميسيونات" description={`${formatCount(list.total)} سطر${status ? ` · ${COMMISSION_STATUS_LABELS[status]}` : ""}`} />
        <nav aria-label="فرز الكوميسيونات" className="flex flex-wrap gap-tight">
          <FilterLink href="/admin/referrals#commissions" active={status === null} label="الكل" />
          {COMMISSION_STATUSES.map((key) => (
            <FilterLink
              key={key}
              href={`/admin/referrals?status=${key}#commissions`}
              active={status === key}
              label={COMMISSION_STATUS_LABELS[key]}
            />
          ))}
        </nav>
        <DataTable
          caption="الكوميسيونات"
          columns={commissionColumns}
          rows={list.rows}
          rowKey={(row) => row.id}
          minWidth="72rem"
          empty={<EmptyState size="sm">ما فماش كوميسيون هنا.</EmptyState>}
        />
      </section>

      {/* ── payouts ───────────────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="الخلاصات" description={`${formatCount(payouts.total)} خلاص مسجّل`} />
        <DataTable
          caption="الخلاصات"
          columns={payoutColumns}
          rows={payouts.rows}
          rowKey={(row) => row.id}
          empty={<EmptyState size="sm">مازال ما تسجّل حتى خلاص.</EmptyState>}
        />
      </section>

      {/* ── fraud signals ─────────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader
          title="تنبيهات"
          description="إشارات تستاهل نظرة، موش أحكام: حساب مكرّر، تسجيلات وهمية، فلوس يلزم ترجع. القرار متاعكم."
        />
        {alerts.length === 0 ? (
          <EmptyState size="sm">ما فماش تنبيه.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert, index) => (
              <li key={index} className="card flex flex-wrap items-baseline justify-between gap-2 p-cozy text-sm">
                <span className="font-semibold">{ALERT_LABELS[alert.kind]}</span>
                <span className="flex flex-wrap items-baseline gap-2">
                  {alert.referrer ? <PersonLabel person={alert.referrer} /> : null}
                  {alert.person ? (
                    <>
                      <span className="text-muted">←</span>
                      <PersonLabel person={alert.person} />
                    </>
                  ) : null}
                  {alert.people ? <span className="text-muted">{alert.people.map((p) => p.full_name).join("، ")}</span> : null}
                </span>
                <span className="text-muted">
                  {alert.detail ?? ""}
                  {typeof alert.amount_millimes === "number" ? ` · ${formatMillimes(alert.amount_millimes)}` : ""}
                  {alert.at ? ` · ${formatDate(alert.at)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── the rule ──────────────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader
          title="القاعدة"
          description="كل تبديل يتسجّل كقاعدة جديدة. البيع ياخذ القاعدة اللي كانت وقتها، والتبديل ما يمسّش المبيعات القديمة."
        />
        {rule ? (
          <div className="card space-y-2 p-cozy text-sm">
            <p>
              <span className="font-semibold">القاعدة رقم {rule.version}</span> · {BASIS_LABELS[rule.basis]} · السقف{" "}
              {formatMillimes(rule.cap_millimes)} · أدنى هامش {(rule.min_margin_bp / 100).toLocaleString("en-US")}٪ من
              الكلفة
            </p>
            <ol className="flex flex-wrap gap-2">
              {rule.amounts_millimes.map((amount, index) => (
                <li key={index} className="rounded-full bg-paper px-3 py-1">
                  الجيل {index + 1}: <span className="font-semibold tabular-nums">{formatMillimes(amount)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {isAdmin ? (
          <details className="card p-cozy">
            <summary className="cursor-pointer font-semibold">بدّل القاعدة</summary>
            <div className="mt-4">
              <RuleForm
                action={saveCommissionRule}
                amounts={(rule?.amounts_millimes ?? [100000, 40000, 25000, 15000, 10000, 10000]).map((m) => m / 1000)}
                basis={rule?.basis ?? "tree"}
                cap={(rule?.cap_millimes ?? 200000) / 1000}
                minMargin={(rule?.min_margin_bp ?? 1500) / 100}
              />
            </div>
          </details>
        ) : (
          <p className="text-xs text-muted">تبديل القاعدة للإدارة.</p>
        )}
        {overview.rules.length > 1 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">القواعد القديمة</summary>
            <ul className="mt-2 space-y-1">
              {overview.rules.slice(1).map((old) => (
                <li key={old.id} className="text-muted">
                  رقم {old.version} · {formatDate(old.created_at)} · {old.amounts_millimes.map((m) => formatMillimes(m)).join(" / ")} ·{" "}
                  {BASIS_LABELS[old.basis]}
                  {old.created_by ? ` · ${old.created_by}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {/* ── offers ────────────────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="العروض" description="عرض موقّف ما يجيبش كوميسيون على المبيعات الجاية متاعو." />
        {overview.offers.length === 0 ? (
          <EmptyState size="sm">ما فماش عروض.</EmptyState>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {overview.offers.map((offer) => (
              <li key={offer.id} className="card flex flex-wrap items-center justify-between gap-2 p-cozy text-sm">
                <span>
                  <span className="font-semibold">{offer.name}</span> <span className="text-muted" dir="ltr">{offer.code}</span>
                </span>
                <span className={offer.referral_enabled ? "font-semibold text-success" : "text-muted"}>
                  {offer.referral_enabled ? "يجيب كوميسيون" : "موقّف"}
                </span>
                {isAdmin ? (
                  <ActionForm
                    action={setOfferReferral.bind(null, offer.id, !offer.referral_enabled)}
                    submitLabel={offer.referral_enabled ? "وقّف" : "شغّل"}
                    buttonClassName="btn btn-secondary btn-sm"
                    className="flex w-full items-center gap-2"
                  >
                    <input name="reason" placeholder="السبب" maxLength={1000} className="field field-sm flex-1" />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── who brings people ─────────────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="أكثر الحرفاء اللي جابو ناس" />
        {overview.top.length === 0 ? (
          <EmptyState size="sm">حتى حدّ ما سجّل برابط توصية لتوّا.</EmptyState>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {overview.top.map((entry) => (
              <li key={entry.person.id} className="card flex flex-wrap items-baseline justify-between gap-2 p-cozy text-sm">
                <Link href={`/admin/referrals/tree?person=${entry.person.id}`} className="font-semibold hover:underline">
                  {entry.person.full_name}
                </Link>
                <span className="text-muted">
                  {formatCount(entry.direct)} مباشرة · ربح {formatMillimes(entry.earned_millimes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── the monthly report ───────────────────────────────────────────────────────────────────── */}
      {overview.months.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="حسب الشهر" description="آخر 12 شهر: الكوميسيونات اللي تحسبت، اللي تأكّدت، واللي تخلّصت." />
          <DataTable
            caption="الكوميسيونات حسب الشهر"
            rows={overview.months}
            rowKey={(row) => row.month}
            columns={[
              { key: "month", header: "الشهر", cell: (row) => <span dir="ltr">{row.month}</span>, mobile: "title" },
              { key: "created", header: "تحسبت", numeric: true, align: "end", cell: (row) => formatMillimes(row.created_millimes) },
              { key: "validated", header: "تأكّدت", numeric: true, align: "end", cell: (row) => formatMillimes(row.validated_millimes ?? 0) },
              { key: "paid", header: "تخلّصت", numeric: true, align: "end", cell: (row) => formatMillimes(row.paid_millimes ?? 0) },
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}

function ModuleNotice({ flag }: { flag: ReferralOverview["flag"] }) {
  const text =
    flag === "disabled"
      ? "الموديول معطّل: الروابط ما تتسجّلش وحتى بيع ما يحسب كوميسيون. حضّرو القاعدة والعروض هنا، ومن بعد شغّلو من"
      : flag === "internal"
        ? "الموديول «داخلي فقط»: الكوميسيونات تتحسب على المبيعات والفريق يشوفها، أما الحرفاء ما يشوفوش صفحتهم. للنشر:"
        : "الموديول منشور: الروابط خدّامة والحرفاء يشوفو صفحتهم. للتوقيف:";
  return (
    <p className="card p-cozy text-sm leading-6">
      {text}{" "}
      <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
        الإعدادات ← الموديولات
      </Link>
      . كراس الشروط يطلب مراجعة قانونية في تونس قبل النشر للعموم.
    </p>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 text-sm ${active ? "border-forest bg-forest text-white" : "border-line hover:border-forest"}`}
    >
      {label}
    </Link>
  );
}

function PersonLabel({ person }: { person: ReferralPerson }) {
  return (
    <Link href={`/admin/referrals/tree?person=${person.id}`} className="hover:underline">
      <span className="font-semibold">{person.full_name}</span>{" "}
      <span className="text-xs text-muted" dir="ltr">
        {person.phone_e164}
      </span>
    </Link>
  );
}

const commissionColumns: readonly Column<CommissionRow>[] = [
  { key: "date", header: "التاريخ", cell: (row) => formatDate(row.created_at), mobile: "meta" },
  { key: "beneficiary", header: "يربح", cell: (row) => <PersonLabel person={row.beneficiary} />, mobile: "title" },
  { key: "generation", header: "الجيل", align: "center", cell: (row) => formatCount(row.generation) },
  { key: "buyer", header: "الشاري", cell: (row) => <PersonLabel person={row.buyer} /> },
  {
    key: "sale",
    header: "البيع",
    cell: (row) => (
      <span>
        <span dir="ltr">{row.contract.reference_no}</span> · {row.project.name}
      </span>
    ),
  },
  {
    key: "units",
    header: "الحساب",
    numeric: true,
    cell: (row) =>
      `${formatCount(row.units)} × ${formatMillimes(row.unit_millimes)}${row.unit_millimes < row.rule_unit_millimes ? " (نقصت للهامش)" : ""}`,
  },
  {
    key: "amount",
    header: "المبلغ",
    numeric: true,
    align: "end",
    cell: (row) => <span className="font-semibold">{formatMillimes(row.amount_millimes)}</span>,
    mobile: "aside",
  },
  {
    key: "status",
    header: "الحالة",
    cell: (row) => (
      <span title={COMMISSION_STATUS_NOTES[row.status]}>
        {COMMISSION_STATUS_LABELS[row.status]}
        {row.payout ? <span className="block text-xs text-muted" dir="ltr">{row.payout.reference_no}</span> : null}
        {row.cancel_reason ? <span className="block text-xs text-muted">{row.cancel_reason}</span> : null}
      </span>
    ),
  },
  {
    key: "actions",
    header: "",
    cell: (row) =>
      row.status === "pending" || row.status === "validated" ? (
        <details>
          <summary className="cursor-pointer text-xs text-danger">ألغي</summary>
          <ActionForm
            action={cancelCommission.bind(null, row.id)}
            submitLabel="ألغي الكوميسيون"
            buttonClassName="btn btn-secondary btn-sm"
            className="mt-2 space-y-2"
          >
            <input name="reason" required minLength={3} maxLength={1000} placeholder="السبب (إجباري)" className="field field-sm w-full" />
          </ActionForm>
        </details>
      ) : null,
  },
];

const payoutColumns: readonly Column<PayoutRow>[] = [
  { key: "ref", header: "الرقم", cell: (row) => <span dir="ltr">{row.reference_no}</span>, mobile: "meta" },
  { key: "date", header: "التاريخ", cell: (row) => formatDate(row.paid_on) },
  { key: "person", header: "الحريف", cell: (row) => <PersonLabel person={row.person} />, mobile: "title" },
  { key: "count", header: "عدد", align: "center", cell: (row) => formatCount(row.count) },
  { key: "method", header: "الطريقة", cell: (row) => [row.method_label, row.reference].filter(Boolean).join(" · ") },
  { key: "by", header: "سجّلو", cell: (row) => row.created_by ?? "" },
  {
    key: "total",
    header: "المبلغ",
    numeric: true,
    align: "end",
    cell: (row) => <span className="font-semibold">{formatMillimes(row.total_millimes)}</span>,
    mobile: "aside",
  },
];
