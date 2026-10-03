// One section of فضاء «زيتونتي», opened from the account list.
//
// WHY A ROUTE AND NOT A DISCLOSURE ON THE ACCOUNT SCREEN. The eleven sections hold a client's whole history —
// every tree code, every receipt, an instalment schedule line by line with its receipts under each line. Stacked
// on one screen that is a page nobody can find anything on, on a handset especially. And a section a client can
// LINK to is a section a commercial can send them by SMS («شوف أقساطك هوني»), which is the sentence the owner
// keeps saying about this module.
//
// The account list decides which rows may be opened — it has the counts — and this page never assumes it was
// reached from there. A key it does not know is notFound(), a visitor with no session meets the same door as
// /zitounti, a refused read prints its reason, and a section whose module is off says so rather than showing an
// empty list that would read as «ما عندك شيء».
//
// IT READS ONE THING AND RENDERS. public.my_zitounti_file() answers the WHOLE file in one round trip, which is
// why there is no per-section read: eleven functions where one already exists would be eleven more places for
// the gating to drift. sections.tsx draws the rows; src/lib/format.ts renders every amount and date.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "@/components/site/link";
import { EmptyState, SectionHeader } from "@/components/ui";
import { currentClient } from "@/lib/client-auth";
import { getPublicConfig, t } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import {
  isZitountiSectionKey,
  readClientFile,
  ZITOUNTI_FAILURE_KEYS,
  ZITOUNTI_SECTION_SETTING,
} from "@/lib/zitounti";

import { ClientLoginPanel, ZitountiSectionBody } from "../sections";

export const dynamic = "force-dynamic";

/**
 * The tab carries the section's own name, from the same setting the account row is titled with — so a rename in
 * الإعدادات reaches the row, the heading and the tab together and they cannot disagree.
 */
export async function generateMetadata({ params }: PageProps<"/[lang]/zitounti/[section]">): Promise<Metadata> {
  const { section } = await params;
  const config = await getPublicConfig();
  const space = t(config, "zitounti.title");

  if (!isZitountiSectionKey(section)) return { title: space };
  const label = t(config, ZITOUNTI_SECTION_SETTING[section]);
  return { title: label ? t(config, "ui.zitounti.section_meta_title", { section: label, space }) : space };
}

/** The screen's frame: one narrow column, the way back at the top, phone first. */
function SectionShell({
  title,
  backLabel,
  children,
}: {
  title: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    /* `data-phone-screen` is the marker the shell reads: below md it takes the site header off a page that
       carries its own (globals.css, shared with the account screen this page is opened from). The section
       opens with its own title and the way back, so a logo bar above it would be a second header. */
    <div
      data-phone-screen=""
      className="mx-auto min-h-dvh w-full max-w-md bg-surface px-4 pb-section pt-cozy font-sans"
    >
      {/* Back is the start of the line: the chevron is drawn pointing right for Arabic and mirrored for the
          left-to-right languages. It is the first thing on the screen because on a handset it is the only way
          out of a section. */}
      <Link
        href="/zitounti"
        className="inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 ltr:-scale-x-100">
          <path d="M9.5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {backLabel}
      </Link>

      <SectionHeader title={title} level={1} className="mt-cozy" />

      <div className="mt-roomy">{children}</div>
    </div>
  );
}

export default async function ZitountiSectionPage({ params }: PageProps<"/[lang]/zitounti/[section]">) {
  const { section } = await params;
  // A key this build does not know is a 404 and not an empty screen: /zitounti/whatever is not a section of
  // anybody's file, and answering it with a shell would invite somebody to guess another one.
  if (!isZitountiSectionKey(section)) notFound();

  const config = await getPublicConfig();
  const space = t(config, "zitounti.title");
  const title = t(config, ZITOUNTI_SECTION_SETTING[section]) || space;
  const backLabel = t(config, "zitounti.back_label");

  // The same door as /zitounti, in the same words — a visitor who followed a link to their instalments and has
  // no session must not be bounced somewhere that loses what they came for.
  const client = await currentClient();
  if (!client) {
    return <ClientLoginPanel config={config} title={space} />;
  }

  // THE SAME GATE AS /zitounti: a session whose password was never chosen is the «أنشئ كلمة سرّ» screen and
  // nothing else — a link straight to /zitounti/trees must not open a section the account itself withholds.
  if (!client.passwordSet) {
    return <ClientLoginPanel config={config} title={space} mode="set_password" />;
  }

  // `display`: the labels the SQL resolves from settings come back in the visitor's language.
  const supabase = await createClient({ display: config.locale });
  const result = await readClientFile(supabase, config.chain);

  if (!result.ok) {
    return (
      <SectionShell title={title} backLabel={backLabel}>
        <EmptyState>{t(config, ZITOUNTI_FAILURE_KEYS[result.reason])}</EmptyState>
      </SectionShell>
    );
  }

  /*
   * The status travels WITH the rows, and each value is a different sentence:
   *   closed / phase_later  the module that writes this record is off — the owner's «coming soon» note
   *   not_built             its table does not exist in the database yet, which is not the same thing
   *   ok                    the rows, or the honest «ما فمّاش» when there are none
   * Printing «ما فمّاش حجوزات» for a switched-off module would be a false statement about a client's file, which
   * is exactly why the database sends the status and this page does not infer it from an empty list.
   */
  const status = result.file[section].status;

  if (status !== "ok") {
    return (
      <SectionShell title={title} backLabel={backLabel}>
        <EmptyState>
          {status === "not_built" ? t(config, "zitounti.section_not_built_note") : t(config, "zitounti.closed_note")}
        </EmptyState>
      </SectionShell>
    );
  }

  return (
    <SectionShell title={title} backLabel={backLabel}>
      <ZitountiSectionBody
        sectionKey={section}
        file={result.file}
        config={config}
        emptyNote={t(config, "zitounti.section_empty_note")}
      />
    </SectionShell>
  );
}
