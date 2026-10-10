// برنامج التوصية — the client's referral page (0136, owner's spec §5): their code and link, how many people came
// through them per generation (counts only, never names), their commissions by state and generation, the rule
// that computes them, and the payouts already made.
//
// THE DOOR IS THE ACCOUNT'S DOOR, as on /zitounti/security: no session or no password yet → back to /zitounti.
// Every figure arrives computed from public.my_referral(), read with the client's own session, and every word is
// a ui.referral.* setting in the page's language.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Link from "@/components/site/link";
import { ShareButton, ShareMark } from "@/components/site/share-button";
import { Texts } from "@/components/site/texts";
import { SectionHeader } from "@/components/ui";
import { currentClient } from "@/lib/client-auth";
import { formatFor, getPublicConfig, t, type PublicConfig } from "@/lib/config";
import { localePath } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { parseMyReferral, referralLink, type MyReferral, type MyReferralResult } from "@/lib/referral";
import { createClient } from "@/lib/supabase/server";

import { CopyLink } from "./copy-link";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return { title: `${t(config, "ui.referral.title")} — ${t(config, "zitounti.title")}` };
}

async function readReferral(locale: PublicConfig["locale"]): Promise<MyReferralResult> {
  const supabase = await createClient({ display: locale });
  const { data, error } = await supabase.rpc("my_referral");
  if (error) {
    console.error("my_referral failed", error);
    return { ok: false, reason: "error" };
  }
  return parseMyReferral(data);
}

export default async function ZitountiReferralPage() {
  const locale = await currentLocale();
  const client = await currentClient();
  if (!client || !client.passwordSet) redirect(localePath(locale, "/zitounti"));

  const config = await getPublicConfig();
  const result = await readReferral(config.locale);
  const title = t(config, "ui.referral.title");

  return (
    <div data-phone-screen="" className="mx-auto min-h-dvh w-full max-w-md bg-surface px-4 pb-section pt-cozy font-sans">
      <Link href="/zitounti" className="inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 ltr:-scale-x-100">
          <path d="M9.5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(config, "zitounti.back_label")}
      </Link>

      <SectionHeader title={title} level={1} className="mt-cozy" />

      {result.ok ? (
        <Texts prefixes={["ui.referral.", "ui.common."]}>
          <ReferralBody config={config} data={result} />
        </Texts>
      ) : (
        <p role="status" className="card mt-roomy p-card text-caption leading-7 text-muted">
          {t(config, result.reason === "closed" ? "ui.referral.closed" : "ui.referral.error")}
        </p>
      )}
    </div>
  );
}

function ReferralBody({ config, data }: { config: PublicConfig; data: MyReferral }) {
  const fmt = formatFor(config);
  const link = referralLink(data.code);
  const unit = t(config, data.rule.basis === "tree" ? "ui.referral.unit_tree" : "ui.referral.unit_order");
  const statuses = [
    { key: "pending", label: t(config, "ui.referral.status_pending"), value: data.totals.pending_millimes },
    { key: "validated", label: t(config, "ui.referral.status_validated"), value: data.totals.validated_millimes },
    { key: "paid", label: t(config, "ui.referral.status_paid"), value: data.totals.paid_millimes },
  ] as const;

  return (
    <div className="mt-roomy space-y-8">
      <p className="text-caption leading-7 text-muted">{t(config, "ui.referral.intro")}</p>

      {/* The code and the link: what the client hands out. */}
      <section className="card space-y-4 p-card">
        <div>
          <p className="text-caption text-muted">{t(config, "ui.referral.code_label")}</p>
          <p dir="ltr" className="mt-1 text-start font-mono text-3xl font-bold tracking-[0.2em] text-forest">
            {data.code}
          </p>
        </div>
        <div>
          <p className="mb-2 text-caption text-muted">{t(config, "ui.referral.link_label")}</p>
          <CopyLink link={link} />
        </div>
        <ShareButton url={link} text={t(config, "ui.referral.share_text")} className="btn btn-primary w-full gap-2">
          <ShareMark />
          {t(config, "ui.referral.share")}
        </ShareButton>
      </section>

      {/* Who came: a count per generation, nothing that names anybody. */}
      <section className="card p-card">
        <SectionHeader title={t(config, "ui.referral.people_title")} level={2} />
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.people.map((row) => (
            <li key={row.generation} className="rounded-2xl bg-paper px-3 py-3">
              <p className="text-caption text-muted">{t(config, "ui.referral.generation", { n: row.generation })}</p>
              <p className="mt-1 text-2xl font-bold text-ink">{fmt.formatCount(row.count)}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption leading-6 text-muted">{t(config, "ui.referral.direct_note")}</p>
        <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-sm">
          <span className="text-muted">{t(config, "ui.referral.sales_label")}</span>
          <span className="font-bold text-ink">{fmt.formatCount(data.sales_count)}</span>
        </p>
      </section>

      {/* What they earned, by state, then by generation. */}
      <section className="card p-card">
        <SectionHeader title={t(config, "ui.referral.commissions_title")} level={2} />
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {statuses.map((status) => (
            <li key={status.key} className="rounded-2xl bg-paper px-2 py-3 text-center">
              <p className="text-caption text-muted">{status.label}</p>
              <p className="mt-1 text-sm font-bold text-ink">{fmt.formatMillimes(status.value)}</p>
            </li>
          ))}
        </ul>
        {data.by_generation.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-caption text-muted">
                <th className="py-1 text-start font-normal" />
                {statuses.map((status) => (
                  <th key={status.key} className="py-1 text-end font-normal">
                    {status.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_generation.map((row) => (
                <tr key={row.generation} className="border-t border-line">
                  <th scope="row" className="py-2 text-start font-semibold text-ink">
                    {t(config, "ui.referral.generation", { n: row.generation })}
                  </th>
                  <td className="py-2 text-end">{fmt.formatMillimes(row.pending_millimes)}</td>
                  <td className="py-2 text-end">{fmt.formatMillimes(row.validated_millimes)}</td>
                  <td className="py-2 text-end">{fmt.formatMillimes(row.paid_millimes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p className="mt-3 text-caption leading-6 text-muted">{t(config, "ui.referral.pending_note")}</p>
      </section>

      {/* The rule in force, written out, so nobody has to ask how a figure was reached. */}
      <section className="card p-card">
        <SectionHeader title={t(config, "ui.referral.rule_title")} level={2} />
        <ul className="mt-3 space-y-1 text-sm text-ink">
          {data.rule.amounts_millimes.map((amount, index) => (
            <li key={index}>
              {t(config, "ui.referral.rule_line", { n: index + 1, amount: fmt.formatMillimes(amount), unit })}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption leading-6 text-muted">{t(config, "ui.referral.legal_note")}</p>
        <p className="mt-2 text-caption leading-6 text-muted">{t(config, "ui.referral.privacy_note")}</p>
      </section>

      <section className="card p-card">
        <SectionHeader title={t(config, "ui.referral.payouts_title")} level={2} />
        {data.payouts.length === 0 ? (
          <p className="mt-3 text-caption text-muted">{t(config, "ui.referral.payouts_empty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.payouts.map((payout) => (
              <li key={payout.reference_no} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-muted">
                  {fmt.formatDate(payout.paid_on)}
                  {payout.method_label ? ` · ${payout.method_label}` : ""}
                </span>
                <span className="font-bold text-ink">{fmt.formatMillimes(payout.total_millimes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
